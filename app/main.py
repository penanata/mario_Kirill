from __future__ import annotations

import io
import logging
import secrets
import shutil
import tempfile
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import quote

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from app import config
from app.importer import extract_zip, import_telegram_export
from app.seed import seed_demo_if_empty
from app.storage import (
    delete_demo,
    ensure_dirs,
    get_photo,
    get_product,
    has_demo,
    search_products,
    stats,
)

log = logging.getLogger(__name__)
BASE_DIR = Path(__file__).resolve().parent.parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


def _format_price(value: Optional[float], text: str = "") -> str:
    if value is None:
        return text or "—"
    if float(value).is_integer():
        return f"{int(value)} ₽"
    return f"{value:.2f} ₽".replace(".", ",")


def _stock_label(product: dict) -> str:
    if product.get("preorder") and not product.get("in_stock"):
        return "под заказ"
    if product.get("in_stock") is True:
        qty = product.get("quantity")
        unit = product.get("unit") or "шт"
        if qty is not None:
            number = int(qty) if float(qty).is_integer() else qty
            return f"в наличии · {number} {unit}".strip()
        return "в наличии"
    if product.get("in_stock") is False:
        return "нет в наличии"
    return "наличие не указано"


def _stock_class(product: dict) -> str:
    if product.get("in_stock") is True:
        return "ok"
    if product.get("preorder"):
        return "wait"
    if product.get("in_stock") is False:
        return "no"
    return "unknown"


def _fmt_dt(value: Optional[str]) -> str:
    if not value:
        return ""
    raw = str(value).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(raw)
        return dt.strftime("%d.%m.%Y %H:%M")
    except ValueError:
        return str(value)[:16]


templates.env.globals.update(
    format_price=_format_price,
    stock_label=_stock_label,
    stock_class=_stock_class,
    fmt_dt=_fmt_dt,
)


def _require_login(request: Request) -> None:
    if not config.CATALOG_PASSWORD:
        return
    if request.session.get("ok"):
        return
    raise HTTPException(status_code=401)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=logging.INFO)
    ensure_dirs()
    if config.SEED_DEMO:
        seed_demo_if_empty()
    bot_app = None
    if config.TELEGRAM_BOT_TOKEN:
        from app.bot import build_application

        bot_app = build_application()
        if bot_app:
            await bot_app.initialize()
            await bot_app.start()
            await bot_app.updater.start_polling(drop_pending_updates=True)
            log.info("Telegram bot polling started")
    yield
    if bot_app:
        await bot_app.updater.stop()
        await bot_app.stop()
        await bot_app.shutdown()


app = FastAPI(title="Каталог поставщика", lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=secrets.token_hex(16))
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


@app.middleware("http")
async def password_gate(request: Request, call_next):
    if not config.CATALOG_PASSWORD:
        return await call_next(request)
    open_paths = {"/login", "/static/style.css", "/static/app.js", "/favicon.ico"}
    if request.url.path in open_paths or request.url.path.startswith("/static/"):
        return await call_next(request)
    if request.session.get("ok"):
        return await call_next(request)
    if request.url.path.startswith("/api/"):
        raise HTTPException(status_code=401, detail="Нужен вход")
    return RedirectResponse("/login", status_code=302)


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse(request, "login.html", {"error": ""})


@app.post("/login")
async def login_submit(request: Request, password: str = Form(...)):
    if secrets.compare_digest(password, config.CATALOG_PASSWORD):
        request.session["ok"] = True
        return RedirectResponse("/", status_code=302)
    return templates.TemplateResponse(
        request, "login.html", {"error": "Неверный пароль"}, status_code=401
    )


@app.get("/", response_class=HTMLResponse)
async def catalog(
    request: Request,
    q: str = Query(""),
    stock: str = Query("all"),
):
    products = search_products(q=q, stock=stock)
    return templates.TemplateResponse(
        request,
        "catalog.html",
        {
            "products": products,
            "q": q,
            "stock": stock,
            "stats": stats(),
            "bot_enabled": bool(config.TELEGRAM_BOT_TOKEN),
            "has_demo": has_demo(),
        },
    )


@app.get("/product/{product_id}", response_class=HTMLResponse)
async def product_page(request: Request, product_id: int):
    product = get_product(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    return templates.TemplateResponse(request, "product.html", {"product": product})


@app.get("/import", response_class=HTMLResponse)
async def import_page(request: Request, result: Optional[str] = None, error: Optional[str] = None):
    return templates.TemplateResponse(
        request,
        "import.html",
        {"result": result, "error": error, "bot_enabled": bool(config.TELEGRAM_BOT_TOKEN), "has_demo": has_demo()},
    )


@app.post("/import")
async def import_upload(request: Request, archive: UploadFile = File(...)):
    suffix = Path(archive.filename or "export.zip").suffix.lower()
    if suffix != ".zip":
        return templates.TemplateResponse(
            request,
            "import.html",
            {"result": None, "error": "Нужен zip-архив экспорта Telegram.", "bot_enabled": bool(config.TELEGRAM_BOT_TOKEN), "has_demo": has_demo()},
            status_code=400,
        )
    tmp = Path(tempfile.mkdtemp(prefix="tg-export-"))
    try:
        zip_path = tmp / "export.zip"
        zip_path.write_bytes(await archive.read())
        extract_to = tmp / "unpacked"
        extract_zip(zip_path, extract_to)
        summary = import_telegram_export(extract_to)
        msg = (
            f"Готово: новых {summary['created']}, обновлено {summary['updated']}, "
            f"фото {summary['photos']}. Сообщений в экспорте: {summary['messages']}."
        )
        return RedirectResponse(f"/import?result={quote(msg)}", status_code=303)
    except Exception as exc:
        log.exception("Import failed")
        return templates.TemplateResponse(
            request,
            "import.html",
            {"result": None, "error": str(exc), "bot_enabled": bool(config.TELEGRAM_BOT_TOKEN), "has_demo": has_demo()},
            status_code=400,
        )
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@app.post("/clear-demo")
async def clear_demo():
    delete_demo()
    return RedirectResponse("/?cleared=1", status_code=303)


@app.get("/help", response_class=HTMLResponse)
async def help_page(request: Request):
    return templates.TemplateResponse(
        request, "help.html", {"bot_enabled": bool(config.TELEGRAM_BOT_TOKEN)}
    )


@app.get("/mario")
async def mario():
    path = BASE_DIR / "index.html"
    return FileResponse(path)


@app.get("/photo/{photo_id}")
async def photo_file(photo_id: int, download: int = 0, thumb: int = 0):
    photo = get_photo(photo_id)
    if not photo:
        raise HTTPException(status_code=404)
    folder = config.THUMBS_DIR if thumb else config.PHOTOS_DIR
    path = folder / photo["filename"]
    if not path.is_file():
        path = config.PHOTOS_DIR / photo["filename"]
    if not path.is_file():
        raise HTTPException(status_code=404)
    filename = _download_name(photo["product_name"], photo["id"], path.suffix)
    headers = {}
    if download:
        headers["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(filename)}"
    return FileResponse(path, media_type="image/jpeg", headers=headers)


@app.get("/product/{product_id}/zip")
async def product_zip(product_id: int):
    product = get_product(product_id)
    if not product:
        raise HTTPException(status_code=404)
    if not product["photos"]:
        raise HTTPException(status_code=404, detail="Нет фото")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for index, photo in enumerate(product["photos"], start=1):
            path = config.PHOTOS_DIR / photo["filename"]
            if not path.is_file():
                continue
            name = _download_name(product["name"], index, path.suffix)
            zf.write(path, f"{_safe_name(product['name'])}/{name}")
    buffer.seek(0)
    filename = f"{_safe_name(product['name'])}_foto.zip"
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@app.get("/download/all.zip")
async def all_zip(q: str = Query(""), stock: str = Query("all")):
    products = search_products(q=q, stock=stock)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for product in products:
            folder = _safe_name(product["name"]) or f"id-{product['id']}"
            info_lines = [
                product["name"],
                f"Цена: {_format_price(product['price'], product['price_text'])}",
                f"Наличие: {_stock_label(product)}",
                "",
                product["raw_text"],
            ]
            zf.writestr(f"{folder}/info.txt", "\n".join(info_lines))
            for index, photo in enumerate(product["photos"], start=1):
                path = config.PHOTOS_DIR / photo["filename"]
                if path.is_file():
                    zf.write(path, f"{folder}/{_download_name(product['name'], index, path.suffix)}")
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=katalog_foto.zip"},
    )


@app.get("/api/products")
async def api_products(q: str = "", stock: str = "all"):
    return {"stats": stats(), "products": search_products(q=q, stock=stock)}


def _safe_name(name: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in " -_." else "_" for ch in name).strip()
    cleaned = " ".join(cleaned.split())
    return cleaned[:80] or "tovar"


def _download_name(product_name: str, index: int, suffix: str) -> str:
    suffix = suffix if suffix.startswith(".") else f".{suffix}"
    return f"{_safe_name(product_name)}_{index}{suffix}"
