from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.seed import seed_demo_if_empty
from app.storage import reset_for_tests, stats


def test_catalog_pages_and_photo_download(tmp_path, monkeypatch):
    reset_for_tests(tmp_path / "data")
    monkeypatch.setattr(config, "SEED_DEMO", False)
    monkeypatch.setattr(config, "TELEGRAM_BOT_TOKEN", "")
    monkeypatch.setattr(config, "CATALOG_PASSWORD", "")
    seed_demo_if_empty()
    assert stats()["products"] >= 5

    with TestClient(app) as client:
        home = client.get("/")
        assert home.status_code == 200
        assert "Роза Freedom" in home.text
        assert "Скачать фото архивом" in home.text
        assert "демо-сорта" in home.text

        found = client.get("/api/products")
        products = found.json()["products"]
        rose = next(item for item in products if "Freedom" in item["name"])
        page = client.get(f"/product/{rose['id']}")
        assert page.status_code == 200
        assert "95" in page.text

        photo_id = rose["photos"][0]["id"]
        photo = client.get(f"/photo/{photo_id}?download=1")
        assert photo.status_code == 200
        assert photo.headers["content-type"].startswith("image/")
        assert "attachment" in photo.headers.get("content-disposition", "")

        zipped = client.get(f"/product/{rose['id']}/zip")
        assert zipped.status_code == 200
        assert zipped.headers["content-type"] == "application/zip"

        all_zip = client.get("/download/all.zip")
        assert all_zip.status_code == 200
        assert all_zip.content[:2] == b"PK"

        cleared = client.post("/clear-demo", follow_redirects=True)
        assert cleared.status_code == 200
        assert "Роза Freedom" not in cleared.text
