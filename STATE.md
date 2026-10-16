# STATE — проект «Деревья»

Рабочая память агента. Раньше эти файлы жили только во внутреннем store Cursor и **не были в GitHub**. Сейчас они в этом репозитории.

Репозиторий: [penanata/mario_Kirill](https://github.com/penanata/mario_Kirill)  
GitHub-аккаунт: `penanata` (Наталия Пеняева, `penalovan@gmail.com`)

## Что это за бизнес

Интернет-продажи садовых растений и озеленения (доставка + посадка). Канал сейчас — Avito. Поставщик один (Москва / Подольск), каталог ≈ 150 позиций.

Команда: **Наталия**, **Дарья**, **Светлана**, **поставщик**.

Архитектура: **C — своя лёгкая система**, быстро и просто.  
Цену поставщика в системе преимущественно меняет **поставщик** (с телефона).

## Документы

| Файл | Зачем |
|------|--------|
| [docs/project-context.md](docs/project-context.md) | Контекст бизнеса, роли, процесс, деньги |
| [docs/mvp-plan.md](docs/mvp-plan.md) | MVP фазы 1: прайс, заказы, календарь, день поставщика |
| [docs/google-sheets-structure.md](docs/google-sheets-structure.md) | Структура учёта: 6 листов, формулы, роли |
| [docs/google-sheet-blocker.md](docs/google-sheet-blocker.md) | Почему нет живой Google Таблицы и как её создать |
| [docs/Derevya-uchet.xlsx](docs/Derevya-uchet.xlsx) | Офлайн-книга для загрузки на Диск |
| [docs/sheets-templates/](docs/sheets-templates/) | CSV-шаблоны листов |
| [docs/notes.md](docs/notes.md) | Короткий чеклист |

## Что уже сделано в коде

Черновик каталога из Telegram (фото, цена, наличие) — ветка `cursor/telegram-product-catalog-09e2`, PR: https://github.com/penanata/mario_Kirill/pull/1  
Игра Марио на `main` (`index.html`) к ops не относится.

## Открыто

1. Живой Google Sheet: нет auth. Нужен секрет `GOOGLE_SERVICE_ACCOUNT_JSON` или ссылка после ручного импорта xlsx.
2. MVP ops-системы ещё не начат (план готов).
3. Как обновлять остатки после MVP (поставщик / менеджер / Telegram).
