from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional

EMOJI_RE = re.compile(
    "["
    "\U0001F300-\U0001FAFF"
    "\U00002600-\U000026FF"
    "\U00002700-\U000027BF"
    "\U0001F1E0-\U0001F1FF"
    "\U0000FE00-\U0000FE0F"
    "\U0000200D"
    "]+",
)

PRICE_NUM = r"(?P<price>\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[.,](?P<cents>\d{1,2}))?"
CURRENCY = r"(?:руб(?:лей|ля|\.)?|р(?:уб)?\.?|₽|uah|грн|\$|usd|eur|€)?"

PRICE_LABEL_RE = re.compile(
    rf"(?:цена|price|прайс)\s*[:\-–]?\s*{PRICE_NUM}\s*{CURRENCY}",
    re.IGNORECASE,
)
PRICE_BARE_RE = re.compile(
    rf"{PRICE_NUM}\s*(?:руб(?:лей|ля|\.)?|р\.|₽|uah|грн)",
    re.IGNORECASE,
)

QTY_LABEL_RE = re.compile(
    r"(?:наличие|остаток|осталось|кол-?во|количество|qty)\s*[:\-–]?\s*"
    r"(?P<qty>\d+(?:[.,]\d+)?)\s*"
    r"(?P<unit>шт(?:ук)?\.?|коробок|кор\.?|упак(?:овок)?|пачек)?",
    re.IGNORECASE,
)
QTY_BARE_RE = re.compile(
    r"(?P<qty>\d+(?:[.,]\d+)?)\s*(?P<unit>шт(?:ук)?\.?|коробок|кор\.)",
    re.IGNORECASE,
)

OUT_RE = re.compile(
    r"нет\s*в\s*наличии|не\s*в\s*наличии|закончил(?:ся|ась|ось|ись)?|"
    r"нет\s*остатк|sold\s*out|out\s*of\s*stock|отсутствует|"
    r"(?:наличие|остаток)\s*[:\-–]?\s*(нет|0)\b",
    re.IGNORECASE,
)
IN_RE = re.compile(
    r"\bв\s*наличии\b|\bесть\b|available|(?:наличие)\s*[:\-–]?\s*да\b",
    re.IGNORECASE,
)
PREORDER_RE = re.compile(r"под\s*заказ|pre-?order|на\s*заказ", re.IGNORECASE)

NAME_LABEL_RE = re.compile(
    r"^(?:сорт|название|товар|позиция|name|variety)\s*[:\-–]\s*(.+)$",
    re.IGNORECASE,
)
HEIGHT_RE = re.compile(
    rf"(?P<h>\d+)\s*(?:см|cm)\s*[:\-–/]?\s*{PRICE_NUM}\s*{CURRENCY}",
    re.IGNORECASE,
)
EXTRA_FIELD_RE = re.compile(
    r"^(высота|цвет|страна|упаковка|длина|ширина|производитель|бренд|категория)\s*[:\-–]\s*(.+)$",
    re.IGNORECASE,
)
SKIP_NAME_RE = re.compile(
    r"^(цена|наличие|остаток|кол-?во|количество|высота|цвет|страна|фото|"
    r"price|qty|упаковка|длина|ширина|производитель|бренд)\b",
    re.IGNORECASE,
)
ONLY_PRICE_LINE_RE = re.compile(
    rf"^(?:цена\s*[:\-–]?)?\s*{PRICE_NUM}\s*{CURRENCY}\s*$",
    re.IGNORECASE,
)


@dataclass
class ParsedProduct:
    name: str
    raw_text: str
    price: Optional[float] = None
    price_text: str = ""
    quantity: Optional[float] = None
    quantity_text: str = ""
    unit: str = ""
    in_stock: Optional[bool] = None
    preorder: bool = False
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def key(self) -> str:
        return product_key(self.name)


def flatten_text(text: Any) -> str:
    if text is None:
        return ""
    if isinstance(text, str):
        return text
    if isinstance(text, list):
        parts: list[str] = []
        for item in text:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(str(item.get("text") or ""))
        return "".join(parts)
    return str(text)


def product_key(name: str) -> str:
    s = EMOJI_RE.sub(" ", name or "")
    s = s.lower().replace("ё", "е")
    s = re.sub(r"[\"'«»„“”`]", "", s)
    s = re.sub(r"[^a-zа-я0-9]+", " ", s)
    return " ".join(s.split())


def looks_like_product(text: str) -> bool:
    raw = flatten_text(text).strip()
    if not raw:
        return False
    if PRICE_LABEL_RE.search(raw) or PRICE_BARE_RE.search(raw):
        return True
    if QTY_LABEL_RE.search(raw) or NAME_LABEL_RE.search(raw.splitlines()[0]):
        return True
    if OUT_RE.search(raw) or IN_RE.search(raw) or PREORDER_RE.search(raw):
        return True
    return False


def _to_float(price: str, cents: Optional[str] = None) -> Optional[float]:
    compact = re.sub(r"[ \u00a0\u202f]", "", price or "")
    compact = compact.replace(",", ".")
    if cents and "." not in compact:
        compact = f"{compact}.{cents}"
    try:
        return float(compact)
    except (TypeError, ValueError):
        return None


def _first_meaningful_line(lines: list[str]) -> str:
    for line in lines:
        clean = EMOJI_RE.sub(" ", line)
        clean = re.sub(r"^[\s\-/|:;.,•·]+", "", clean).strip()
        if not clean:
            continue
        if SKIP_NAME_RE.match(clean):
            continue
        if ONLY_PRICE_LINE_RE.match(clean):
            continue
        if QTY_LABEL_RE.match(clean) or QTY_BARE_RE.fullmatch(clean):
            continue
        return clean[:180]
    return ""


def _clean_name(name: str) -> str:
    if not name:
        return ""
    name = PRICE_LABEL_RE.sub(" ", name)
    name = PRICE_BARE_RE.sub(" ", name)
    name = QTY_LABEL_RE.sub(" ", name)
    name = QTY_BARE_RE.sub(" ", name)
    name = re.sub(r"[\s,;:/\-|]+$", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name[:180]


def parse_message(text: Any) -> Optional[ParsedProduct]:
    raw = flatten_text(text)
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")
    raw = raw.replace("\xa0", " ").replace("\u202f", " ")
    stripped = raw.strip()
    if not stripped:
        return None

    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in stripped.split("\n")]
    lines = [line for line in lines if line]

    name = ""
    extra: dict[str, Any] = {}
    for line in lines:
        labeled = NAME_LABEL_RE.match(line)
        if labeled and not name:
            name = labeled.group(1).strip()
            continue
        extra_match = EXTRA_FIELD_RE.match(line)
        if extra_match:
            extra[extra_match.group(1).lower()] = extra_match.group(2).strip()
    if not name:
        name = _first_meaningful_line(lines)
    name = _clean_name(name)
    if not name:
        name = "Без названия"

    heights: list[dict[str, Any]] = []
    for match in HEIGHT_RE.finditer(stripped):
        value = _to_float(match.group("price"), match.group("cents"))
        heights.append({"height_cm": int(match.group("h")), "price": value})
    if heights:
        extra["heights"] = heights

    price: Optional[float] = None
    price_text = ""
    labeled_price = PRICE_LABEL_RE.search(stripped)
    bare_price = PRICE_BARE_RE.search(stripped)
    chosen = labeled_price or bare_price
    if chosen:
        price = _to_float(chosen.group("price"), chosen.group("cents"))
        price_text = chosen.group(0).strip()
    elif heights:
        nums = [h["price"] for h in heights if h["price"] is not None]
        if nums:
            price = min(nums)
            price_text = " / ".join(
                f"{h['height_cm']}см {h['price']:g}₽" for h in heights if h["price"] is not None
            )

    quantity: Optional[float] = None
    unit = ""
    quantity_text = ""
    qty_match = QTY_LABEL_RE.search(stripped) or QTY_BARE_RE.search(stripped)
    if qty_match:
        try:
            quantity = float(qty_match.group("qty").replace(",", "."))
        except (TypeError, ValueError):
            quantity = None
        unit = (qty_match.group("unit") or "").strip()
        quantity_text = qty_match.group(0).strip()

    preorder = bool(PREORDER_RE.search(stripped))
    in_stock: Optional[bool]
    if OUT_RE.search(stripped) or (quantity == 0):
        in_stock = False
    elif quantity and quantity > 0:
        in_stock = True
    elif IN_RE.search(stripped):
        in_stock = True
    elif preorder:
        in_stock = False
    else:
        in_stock = None

    parsed = ParsedProduct(
        name=name,
        raw_text=stripped,
        price=price,
        price_text=price_text,
        quantity=quantity,
        quantity_text=quantity_text,
        unit=unit,
        in_stock=in_stock,
        preorder=preorder,
        extra=extra,
    )
    if parsed.key == "":
        parsed.name = "Без названия"
    return parsed
