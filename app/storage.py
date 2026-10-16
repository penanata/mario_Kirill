from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from PIL import Image, ImageOps

from app import config

_lock = threading.Lock()
_conn: Optional[sqlite3.Connection] = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    raw_text TEXT NOT NULL DEFAULT '',
    price REAL,
    price_text TEXT NOT NULL DEFAULT '',
    quantity REAL,
    quantity_text TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL DEFAULT '',
    in_stock INTEGER,
    preorder INTEGER NOT NULL DEFAULT 0,
    extra_json TEXT NOT NULL DEFAULT '{}',
    source TEXT NOT NULL DEFAULT '',
    telegram_message_id INTEGER,
    telegram_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_photos_product ON photos(product_id);
CREATE INDEX IF NOT EXISTS idx_products_updated ON products(updated_at);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def ensure_dirs() -> None:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    config.PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    config.THUMBS_DIR.mkdir(parents=True, exist_ok=True)


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        ensure_dirs()
        _conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA foreign_keys=ON")
        _conn.executescript(SCHEMA)
        _conn.commit()
    return _conn


def _row_to_product(row: sqlite3.Row, photos: Optional[list[dict[str, Any]]] = None) -> dict[str, Any]:
    extra = {}
    try:
        extra = json.loads(row["extra_json"] or "{}")
    except json.JSONDecodeError:
        extra = {}
    in_stock = row["in_stock"]
    return {
        "id": row["id"],
        "key": row["key"],
        "name": row["name"],
        "raw_text": row["raw_text"],
        "price": row["price"],
        "price_text": row["price_text"],
        "quantity": row["quantity"],
        "quantity_text": row["quantity_text"],
        "unit": row["unit"],
        "in_stock": None if in_stock is None else bool(in_stock),
        "preorder": bool(row["preorder"]),
        "extra": extra,
        "source": row["source"],
        "telegram_message_id": row["telegram_message_id"],
        "telegram_date": row["telegram_date"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "photos": photos if photos is not None else [],
    }


def _photos_for(product_id: int) -> list[dict[str, Any]]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, filename, original_name, created_at FROM photos WHERE product_id = ? ORDER BY id",
        (product_id,),
    ).fetchall()
    return [
        {
            "id": r["id"],
            "filename": r["filename"],
            "original_name": r["original_name"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def get_product(product_id: int) -> Optional[dict[str, Any]]:
    conn = get_conn()
    row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if not row:
        return None
    return _row_to_product(row, _photos_for(product_id))


def get_product_by_key(key: str) -> Optional[dict[str, Any]]:
    conn = get_conn()
    row = conn.execute("SELECT * FROM products WHERE key = ?", (key,)).fetchone()
    if not row:
        return None
    return _row_to_product(row, _photos_for(row["id"]))


def get_photo(photo_id: int) -> Optional[dict[str, Any]]:
    conn = get_conn()
    row = conn.execute(
        """
        SELECT photos.*, products.name AS product_name
        FROM photos JOIN products ON products.id = photos.product_id
        WHERE photos.id = ?
        """,
        (photo_id,),
    ).fetchone()
    if not row:
        return None
    return dict(row)


def stats() -> dict[str, int]:
    conn = get_conn()
    products = conn.execute("SELECT COUNT(*) AS n FROM products").fetchone()["n"]
    photos = conn.execute("SELECT COUNT(*) AS n FROM photos").fetchone()["n"]
    in_stock = conn.execute(
        "SELECT COUNT(*) AS n FROM products WHERE in_stock = 1"
    ).fetchone()["n"]
    return {"products": products, "photos": photos, "in_stock": in_stock}


def search_products(
    q: str = "",
    stock: str = "all",
) -> list[dict[str, Any]]:
    conn = get_conn()
    clauses: list[str] = []
    args: list[Any] = []
    q = (q or "").strip()
    if q:
        clauses.append("(name LIKE ? OR raw_text LIKE ? OR extra_json LIKE ?)")
        like = f"%{q}%"
        args.extend([like, like, like])
    if stock == "in":
        clauses.append("in_stock = 1")
    elif stock == "out":
        clauses.append("(in_stock = 0 OR in_stock IS NULL AND preorder = 1)")
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = conn.execute(
        f"SELECT * FROM products {where} ORDER BY updated_at DESC, id DESC",
        args,
    ).fetchall()
    result = []
    for row in rows:
        result.append(_row_to_product(row, _photos_for(row["id"])))
    return result


def _save_image(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if src.resolve() != dest.resolve():
        dest.write_bytes(src.read_bytes())
    thumb = config.THUMBS_DIR / dest.name
    try:
        with Image.open(dest) as image:
            image = ImageOps.exif_transpose(image)
            image = image.convert("RGB")
            image.thumbnail((720, 720))
            image.save(thumb, "JPEG", quality=82)
    except Exception:
        thumb.write_bytes(dest.read_bytes())


def add_photo_from_path(product_id: int, src: Path, original_name: str = "") -> Optional[int]:
    src = Path(src)
    if not src.exists() or not src.is_file():
        return None
    suffix = src.suffix.lower() if src.suffix else ".jpg"
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}:
        suffix = ".jpg"
    filename = f"{uuid.uuid4().hex}{suffix}"
    dest = config.PHOTOS_DIR / filename
    _save_image(src, dest)
    conn = get_conn()
    with _lock:
        cur = conn.execute(
            "INSERT INTO photos (product_id, filename, original_name, created_at) VALUES (?, ?, ?, ?)",
            (product_id, filename, original_name or src.name, now_iso()),
        )
        conn.commit()
        return int(cur.lastrowid)


def add_photo_from_bytes(product_id: int, data: bytes, original_name: str = "photo.jpg") -> int:
    suffix = Path(original_name).suffix.lower() or ".jpg"
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}:
        suffix = ".jpg"
    filename = f"{uuid.uuid4().hex}{suffix}"
    dest = config.PHOTOS_DIR / filename
    dest.write_bytes(data)
    try:
        with Image.open(dest) as image:
            image = ImageOps.exif_transpose(image)
            image = image.convert("RGB")
            thumb = config.THUMBS_DIR / filename
            image.thumbnail((720, 720))
            image.save(thumb, "JPEG", quality=82)
    except Exception:
        (config.THUMBS_DIR / filename).write_bytes(data)
    conn = get_conn()
    with _lock:
        cur = conn.execute(
            "INSERT INTO photos (product_id, filename, original_name, created_at) VALUES (?, ?, ?, ?)",
            (product_id, filename, original_name, now_iso()),
        )
        conn.commit()
        return int(cur.lastrowid)


def upsert_product(
    *,
    key: str,
    name: str,
    raw_text: str,
    price: Optional[float],
    price_text: str,
    quantity: Optional[float],
    quantity_text: str,
    unit: str,
    in_stock: Optional[bool],
    preorder: bool,
    extra: dict[str, Any],
    source: str,
    telegram_message_id: Optional[int] = None,
    telegram_date: Optional[str] = None,
) -> dict[str, Any]:
    if not key:
        key = f"unnamed-{uuid.uuid4().hex[:8]}"
    conn = get_conn()
    stamp = now_iso()
    extra_json = json.dumps(extra or {}, ensure_ascii=False)
    in_stock_val = None if in_stock is None else int(bool(in_stock))
    with _lock:
        existing = conn.execute("SELECT * FROM products WHERE key = ?", (key,)).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE products SET
                    name = ?,
                    raw_text = CASE WHEN ? != '' THEN ? ELSE raw_text END,
                    price = COALESCE(?, price),
                    price_text = CASE WHEN ? != '' THEN ? ELSE price_text END,
                    quantity = COALESCE(?, quantity),
                    quantity_text = CASE WHEN ? != '' THEN ? ELSE quantity_text END,
                    unit = CASE WHEN ? != '' THEN ? ELSE unit END,
                    in_stock = COALESCE(?, in_stock),
                    preorder = ?,
                    extra_json = CASE WHEN ? != '{}' THEN ? ELSE extra_json END,
                    source = ?,
                    telegram_message_id = COALESCE(?, telegram_message_id),
                    telegram_date = COALESCE(?, telegram_date),
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    name or existing["name"],
                    raw_text,
                    raw_text,
                    price,
                    price_text,
                    price_text,
                    quantity,
                    quantity_text,
                    quantity_text,
                    unit,
                    unit,
                    in_stock_val,
                    int(bool(preorder)),
                    extra_json,
                    extra_json,
                    source or existing["source"],
                    telegram_message_id,
                    telegram_date,
                    stamp,
                    existing["id"],
                ),
            )
            conn.commit()
            return get_product(existing["id"])  # type: ignore[return-value]
        cur = conn.execute(
            """
            INSERT INTO products (
                key, name, raw_text, price, price_text, quantity, quantity_text, unit,
                in_stock, preorder, extra_json, source, telegram_message_id, telegram_date,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                key,
                name,
                raw_text,
                price,
                price_text or "",
                quantity,
                quantity_text or "",
                unit or "",
                in_stock_val,
                int(bool(preorder)),
                extra_json,
                source,
                telegram_message_id,
                telegram_date,
                stamp,
                stamp,
            ),
        )
        conn.commit()
        return get_product(int(cur.lastrowid))  # type: ignore[return-value]


def close() -> None:
    global _conn
    if _conn is not None:
        _conn.close()
        _conn = None


def reset_for_tests(data_dir: Path) -> None:
    close()
    config.DATA_DIR = Path(data_dir)
    config.PHOTOS_DIR = config.DATA_DIR / "photos"
    config.THUMBS_DIR = config.DATA_DIR / "thumbs"
    config.DB_PATH = config.DATA_DIR / "catalog.sqlite3"
    ensure_dirs()
    get_conn()


def delete_demo() -> int:
    conn = get_conn()
    rows = conn.execute("SELECT id FROM products WHERE source = 'demo'").fetchall()
    ids = [row["id"] for row in rows]
    for product_id in ids:
        photos = _photos_for(product_id)
        for photo in photos:
            for folder in (config.PHOTOS_DIR, config.THUMBS_DIR):
                path = folder / photo["filename"]
                if path.is_file():
                    path.unlink()
    with _lock:
        if ids:
            conn.executemany("DELETE FROM photos WHERE product_id = ?", [(i,) for i in ids])
            conn.executemany("DELETE FROM products WHERE id = ?", [(i,) for i in ids])
            conn.commit()
    return len(ids)


def has_demo() -> bool:
    conn = get_conn()
    row = conn.execute("SELECT 1 FROM products WHERE source = 'demo' LIMIT 1").fetchone()
    return row is not None


def delete_all() -> None:
    conn = get_conn()
    with _lock:
        conn.execute("DELETE FROM photos")
        conn.execute("DELETE FROM products")
        conn.commit()
    for folder in (config.PHOTOS_DIR, config.THUMBS_DIR):
        if folder.exists():
            for path in folder.iterdir():
                if path.is_file():
                    path.unlink()
