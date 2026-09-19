import json
from pathlib import Path

from PIL import Image

from app.importer import import_telegram_export
from app.storage import get_product_by_key, reset_for_tests, search_products, stats


def _jpeg(path: Path, color: tuple[int, int, int]) -> None:
    Image.new("RGB", (120, 160), color).save(path, "JPEG")


def test_import_groups_album_and_updates_price(tmp_path: Path):
    reset_for_tests(tmp_path / "data")
    export = tmp_path / "ChatExport"
    photos = export / "photos"
    photos.mkdir(parents=True)
    a = photos / "a.jpg"
    b = photos / "b.jpg"
    c = photos / "c.jpg"
    _jpeg(a, (200, 30, 40))
    _jpeg(b, (30, 90, 40))
    _jpeg(c, (40, 40, 180))

    payload = {
        "name": "Поставщик",
        "messages": [
            {
                "id": 1,
                "type": "message",
                "date": "2026-09-01 10:00:00",
                "photo": "photos/a.jpg",
                "text": [
                    {"type": "bold", "text": "Сорт: Роза Freedom"},
                    "\nЦена: 90 руб\nНаличие: 10 шт",
                ],
            },
            {
                "id": 2,
                "type": "message",
                "date": "2026-09-01 10:00:01",
                "photo": "photos/b.jpg",
                "text": "",
            },
            {
                "id": 3,
                "type": "message",
                "date": "2026-09-01 12:00:00",
                "text": "Сорт: Роза Freedom\nЦена: 95 руб\nНаличие: 8 шт",
            },
            {
                "id": 4,
                "type": "message",
                "date": "2026-09-02 09:00:00",
                "photo": "photos/c.jpg",
                "text": "Тюльпан Strong Gold\nцена 70 руб\nнет в наличии",
            },
        ],
    }
    (export / "result.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    summary = import_telegram_export(export)
    assert summary["photos"] == 3
    assert stats()["products"] == 2

    rose = get_product_by_key("роза freedom")
    assert rose is not None
    assert rose["price"] == 95
    assert rose["quantity"] == 8
    assert len(rose["photos"]) == 2

    tulip = search_products(q="Тюльпан")[0]
    assert tulip["in_stock"] is False
    assert len(tulip["photos"]) == 1
