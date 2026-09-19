from __future__ import annotations

import asyncio
import logging
from io import BytesIO
from typing import Any, Optional

from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

from app import config
from app.parser import parse_message, product_key
from app.storage import add_photo_from_bytes, upsert_product

log = logging.getLogger(__name__)
_group_lock = asyncio.Lock()
_groups: dict[str, dict[str, Any]] = {}


def _allowed_chat(chat_id: int) -> bool:
    wanted = config.TELEGRAM_CHAT_ID
    if not wanted:
        return True
    return str(chat_id) == str(wanted)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_chat:
        return
    await update.effective_chat.send_message(
        "Я собираю фото, цены и наличие из этого чата в каталог.\n"
        f"id чата: `{update.effective_chat.id}`\n"
        "Добавьте меня в чат с поставщиком и отключите приватность через @BotFather → /setprivacy → Disable.",
        parse_mode="Markdown",
    )


async def cmd_chatid(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_chat:
        return
    await update.effective_chat.send_message(f"chat id: {update.effective_chat.id}")


async def _save_bundle(text: str, photos: list[tuple[bytes, str]], source_meta: dict[str, Any]) -> None:
    parsed = parse_message(text) if text.strip() else parse_message("Без названия")
    if parsed is None:
        return
    key = parsed.key or product_key(parsed.name)
    if key in {"", "без названия"}:
        key = f"msg-{source_meta.get('message_id') or 'new'}"
    product = upsert_product(
        key=key,
        name=parsed.name,
        raw_text=parsed.raw_text,
        price=parsed.price,
        price_text=parsed.price_text,
        quantity=parsed.quantity,
        quantity_text=parsed.quantity_text,
        unit=parsed.unit,
        in_stock=parsed.in_stock,
        preorder=parsed.preorder,
        extra=parsed.extra,
        source="telegram-bot",
        telegram_message_id=source_meta.get("message_id"),
        telegram_date=source_meta.get("date"),
    )
    for data, name in photos:
        add_photo_from_bytes(product["id"], data, name)


async def _download_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> Optional[tuple[bytes, str]]:
    message = update.effective_message
    if not message:
        return None
    if message.photo:
        photo = message.photo[-1]
        file = await context.bot.get_file(photo.file_id)
        buf = BytesIO()
        await file.download_to_memory(buf)
        return buf.getvalue(), f"{photo.file_unique_id}.jpg"
    if message.document and (message.document.mime_type or "").startswith("image/"):
        file = await context.bot.get_file(message.document.file_id)
        buf = BytesIO()
        await file.download_to_memory(buf)
        name = message.document.file_name or f"{message.document.file_unique_id}.jpg"
        return buf.getvalue(), name
    return None


async def _flush_group(group_id: str) -> None:
    await asyncio.sleep(1.2)
    async with _group_lock:
        bundle = _groups.pop(group_id, None)
    if not bundle:
        return
    await _save_bundle(bundle["text"], bundle["photos"], bundle["meta"])


async def on_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    chat = update.effective_chat
    if not message or not chat or not _allowed_chat(chat.id):
        return
    text = message.caption or message.text or ""
    photo = await _download_photo(update, context)
    meta = {
        "message_id": message.message_id,
        "date": message.date.isoformat() if message.date else None,
    }
    group_id = message.media_group_id
    if group_id:
        async with _group_lock:
            bundle = _groups.get(group_id)
            if bundle is None:
                bundle = {"text": text, "photos": [], "meta": meta}
                _groups[group_id] = bundle
                asyncio.create_task(_flush_group(group_id))
            if text and not bundle["text"]:
                bundle["text"] = text
            if photo:
                bundle["photos"].append(photo)
        return
    photos = [photo] if photo else []
    if not text.strip() and not photos:
        return
    await _save_bundle(text, photos, meta)


def build_application() -> Optional[Application]:
    token = config.TELEGRAM_BOT_TOKEN
    if not token:
        return None
    application = (
        Application.builder()
        .token(token)
        .build()
    )
    application.add_handler(CommandHandler("start", cmd_start))
    application.add_handler(CommandHandler("chatid", cmd_chatid))
    application.add_handler(
        MessageHandler(filters.PHOTO | filters.Document.IMAGE | filters.TEXT, on_message)
    )
    return application
