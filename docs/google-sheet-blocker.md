# Блокер: живая Google Таблица

**Статус:** таблица **не создана**. Фейковый URL не выдаём.

## Что проверено (агент, 2026-09-17)

| Источник | Результат |
|----------|-----------|
| Env vars (`GOOGLE_*`, `GSPREAD_*`, `GCP_*`) | пусто |
| `~/.config/gcloud`, `gspread`, `rclone` | нет |
| Service account / `credentials.json` / `token.json` | не найдены |
| Application Default Credentials | `DefaultCredentialsError` |
| MCP Google Sheets / Drive | в сессии нет |
| Chrome-профиль | без входа в Google-аккаунт |

Готовый офлайн-файл по-прежнему: [`Derevya-uchet.xlsx`](Derevya-uchet.xlsx).

---

## Что сделать Наталии (`penalovan@gmail.com`)

Выберите **один** путь.

### Вариант A (лучший для агента) — service account

1. [Google Cloud Console](https://console.cloud.google.com/) → создать/выбрать проект.
2. Включить **Google Sheets API** и **Google Drive API**.
3. IAM → Service Accounts → Create → ключ JSON скачать.
4. В секретах Cloud Agent / окружения Cursor положить весь JSON как  
   **`GOOGLE_SERVICE_ACCOUNT_JSON`**.
5. Написать агенту «креды добавлены — создай таблицу».  
   Агент создаст Sheet, заполнит вкладки из `Derevya-uchet.xlsx` и выдаст доступ редактора на `penalovan@gmail.com` (и/или «всем по ссылке»).

### Вариант B — пустая таблица + ссылка (быстрее руками)

1. Зайти в Google под `penalovan@gmail.com`.
2. Открыть https://sheets.new → назвать «Деревья — учёт».
3. Файл → Импорт → загрузить [`Derevya-uchet.xlsx`](Derevya-uchet.xlsx)  
   (или Диск → загрузить xlsx → Открыть с помощью Google Таблицы → Сохранить как таблицу Google).
4. Доступ: добавить команду / «Все, у кого есть ссылка» → Редактор.
5. Прислать агенту **ссылку** на таблицу — он впишет URL в `google-sheets-structure.md`.  
   Без API агент **не сможет** сам править ячейки; только зафиксирует ссылку.

### Вариант C — OAuth пользователя

Настроить OAuth Desktop/Web client + refresh token для Sheets/Drive и передать агенту (сложнее A; обычно не нужен, если есть service account).

---

## После разблокировки агент сделает

Листы: **Заказы, Позиции, Прайс, Платежи, Сводка, Менеджеры** — заголовки, примеры, формулы; шаринг на `penalovan@gmail.com`; URL вверху [`google-sheets-structure.md`](google-sheets-structure.md).
