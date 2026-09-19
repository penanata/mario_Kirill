from __future__ import annotations

import json
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from app.parser import flatten_text, looks_like_product, parse_message, product_key
from app.storage import add_photo_from_path, upsert_product


PHOTO_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}


def _parse_date(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value)
        except (OSError, OverflowError, ValueError):
            return None
    text = str(value).replace("T", " ")
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(text[:19], fmt.replace("T", " ") if " " in text[:19] else fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _message_date(message: dict[str, Any]) -> str:
    raw = message.get("date") or message.get("date_unixtime")
    parsed = _parse_date(raw)
    return parsed.isoformat(sep=" ", timespec="seconds") if parsed else str(raw or "")


def _photo_path(base: Path, photo_field: Any) -> Optional[Path]:
    if not photo_field:
        return None
    if isinstance(photo_field, list):
        # Telegram export sometimes stores sizes; last is largest.
        photo_field = photo_field[-1]
    if isinstance(photo_field, dict):
        photo_field = photo_field.get("file") or photo_field.get("photo") or ""
    rel = str(photo_field).replace("\\", "/")
    if not rel:
        return None
    path = (base / rel).resolve()
    try:
        path.relative_to(base.resolve())
    except ValueError:
        return None
    return path if path.is_file() else None


def _group_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: list[dict[str, Any]] = []
    i = 0
    while i < len(messages):
        message = messages[i]
        if message.get("type") and message.get("type") != "message":
            i += 1
            continue
        photo = _has_photo(message)
        text = flatten_text(message.get("text")).strip()
        if not photo and not looks_like_product(text):
            i += 1
            continue
        photos = [message] if photo else []
        j = i + 1
        if photo:
            first_dt = _parse_date(message.get("date") or message.get("date_unixtime"))
            while j < len(messages):
                nxt = messages[j]
                if nxt.get("type") and nxt.get("type") != "message":
                    break
                if not _has_photo(nxt):
                    break
                nxt_text = flatten_text(nxt.get("text")).strip()
                if nxt_text:
                    break
                nxt_dt = _parse_date(nxt.get("date") or nxt.get("date_unixtime"))
                if first_dt and nxt_dt and abs((nxt_dt - first_dt).total_seconds()) > 180:
                    break
                photos.append(nxt)
                j += 1
        grouped.append({"message": message, "photos": photos, "text": text})
        i = j if photos else i + 1
    return grouped


def _has_photo(message: dict[str, Any]) -> bool:
    if message.get("photo"):
        return True
    file = str(message.get("file") or "")
    return Path(file).suffix.lower() in PHOTO_SUFFIXES


def import_telegram_export(root: Path, source: str = "telegram-export") -> dict[str, int]:
    root = Path(root)
    result_json = _find_result_json(root)
    if result_json is None:
        raise FileNotFoundError("В экспорте нет result.json. Выгрузите чат в формате JSON.")
    data = json.loads(result_json.read_text(encoding="utf-8"))
    base = result_json.parent
    messages = data.get("messages") or []
    created = 0
    updated = 0
    photos = 0
    skipped = 0
    seen_keys: set[str] = set()
    for bundle in _group_messages(messages):
        text = bundle["text"]
        parsed = parse_message(text) if text else None
        photo_msgs = bundle["photos"]
        if parsed is None and photo_msgs:
            parsed = parse_message("Без названия")
        if parsed is None:
            skipped += 1
            continue
        key = parsed.key or product_key(parsed.name)
        if key in {"", "без названия"}:
            key = f"msg-{bundle['message'].get('id') or len(seen_keys)}"
        existed = key in seen_keys
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
            source=source,
            telegram_message_id=bundle["message"].get("id"),
            telegram_date=_message_date(bundle["message"]),
        )
        seen_keys.add(key)
        if existed:
            updated += 1
        else:
            created += 1
        for photo_msg in photo_msgs:
            path = _photo_path(base, photo_msg.get("photo") or photo_msg.get("file"))
            if path is None:
                continue
            if add_photo_from_path(product["id"], path, path.name):
                photos += 1
    return {
        "created": created,
        "updated": updated,
        "photos": photos,
        "skipped": skipped,
        "messages": len(messages),
    }


def _find_result_json(root: Path) -> Optional[Path]:
    direct = root / "result.json"
    if direct.is_file():
        return direct
    matches = list(root.rglob("result.json"))
    return matches[0] if matches else None


def extract_zip(zip_path: Path, dest: Path) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(dest)
    return dest
