from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.parser import parse_message
from app.storage import add_photo_from_bytes, stats, upsert_product

DEMO = [
    {
        "text": "Сорт: Роза Freedom\nВысота: 60 см\nЦена: 95 руб\nНаличие: 420 шт\nСтрана: Эквадор",
        "color": (190, 40, 70),
        "label": "Freedom",
    },
    {
        "text": "Тюльпан Strong Gold\n40см 62р / 50см 74р\nостаток 180 шт\nв наличии",
        "color": (214, 168, 42),
        "label": "Strong Gold",
    },
    {
        "text": "Хризантема Балтика\nцена 48 руб\nнет в наличии",
        "color": (236, 236, 232),
        "label": "Балтика",
    },
    {
        "text": "Эустома Alissa Blue\nЦена: 110₽\nНаличие: 75 шт\nЦвет: голубой",
        "color": (92, 132, 196),
        "label": "Alissa Blue",
    },
    {
        "text": "Гвоздика Sting\nцена 36 руб\nпод заказ",
        "color": (168, 48, 96),
        "label": "Sting",
    },
]


def _font(size: int):
    candidates = [
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"),
        Path("DejaVuSans.ttf"),
    ]
    for path in candidates:
        if path.is_file() or path.name == "DejaVuSans.ttf":
            try:
                return ImageFont.truetype(str(path), size)
            except OSError:
                continue
    return ImageFont.load_default()


def _image(color: tuple[int, int, int], label: str, variant: int) -> bytes:
    image = Image.new("RGB", (900, 1100), (24, 28, 26))
    draw = ImageDraw.Draw(image)
    draw.rectangle((40, 40, 860, 1060), fill=color)
    overlay = (12, 14, 16) if variant else (250, 247, 240)
    draw.rectangle((70, 820, 830, 1000), fill=overlay)
    font = _font(48)
    small = _font(28)
    text_color = (250, 247, 240) if variant else (28, 24, 22)
    draw.text((100, 860), label, fill=text_color, font=font)
    draw.text((100, 930), "демо-фото сорта", fill=text_color, font=small)
    buf = BytesIO()
    image.save(buf, "JPEG", quality=88)
    return buf.getvalue()


def seed_demo_if_empty() -> None:
    if stats()["products"] > 0:
        return
    for item in DEMO:
        parsed = parse_message(item["text"])
        if parsed is None:
            continue
        product = upsert_product(
            key=parsed.key,
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
            source="demo",
        )
        for variant in (0, 1):
            add_photo_from_bytes(
                product["id"],
                _image(item["color"], item["label"], variant),
                f"{parsed.key}-{variant}.jpg",
            )
