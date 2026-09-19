from app.parser import flatten_text, parse_message, product_key


def test_flatten_telegram_entities():
    text = [
        "Сорт: ",
        {"type": "bold", "text": "Freedom"},
        "\nЦена: 95 руб",
    ]
    assert "Freedom" in flatten_text(text)
    parsed = parse_message(text)
    assert parsed is not None
    assert parsed.name == "Freedom"
    assert parsed.price == 95
    assert parsed.key == "freedom"


def test_parse_rose_labeled():
    parsed = parse_message(
        "Сорт: Роза Freedom\nВысота: 60 см\nЦена: 95 руб\nНаличие: 420 шт\nСтрана: Эквадор"
    )
    assert parsed is not None
    assert parsed.name == "Роза Freedom"
    assert parsed.price == 95
    assert parsed.quantity == 420
    assert parsed.in_stock is True
    assert parsed.extra["страна"] == "Эквадор"
    assert parsed.extra["высота"] == "60 см"


def test_parse_heights_and_stock():
    parsed = parse_message("Тюльпан Strong Gold\n40см 62р / 50см 74р\nостаток 180 шт\nв наличии")
    assert parsed is not None
    assert parsed.name == "Тюльпан Strong Gold"
    assert parsed.price in {62, 62.0}
    assert parsed.quantity == 180
    assert parsed.in_stock is True
    assert parsed.extra["heights"][0]["height_cm"] == 40
    assert parsed.extra["heights"][1]["price"] == 74


def test_out_of_stock():
    parsed = parse_message("Хризантема Балтика\nцена 48 руб\nнет в наличии")
    assert parsed is not None
    assert parsed.name == "Хризантема Балтика"
    assert parsed.price == 48
    assert parsed.in_stock is False


def test_preorder():
    parsed = parse_message("Гвоздика Sting\nцена 36 руб\nпод заказ")
    assert parsed is not None
    assert parsed.preorder is True
    assert parsed.in_stock is False


def test_product_key_normalizes():
    assert product_key("Роза  Freedom") == product_key("роза freedom")
    assert product_key("Ёлка") == "елка"


def test_empty_message():
    assert parse_message("   ") is None
