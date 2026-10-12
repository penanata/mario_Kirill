"use client";

import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client";
import { Button } from "@/components/ui";
import type { getSettingsView } from "@/lib/views";

type Data = ReturnType<typeof getSettingsView>;

export function SettingsView({ data }: { data: Data }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState(data.user.name);
  const [appleId, setAppleId] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function saveProfile() {
    setError("");
    try {
      await api("/api/settings", { method: "PATCH", body: JSON.stringify({ name }) });
      setMessage("Имя сохранено.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не сохранилось");
    }
  }

  async function connect() {
    setError("");
    setMessage("");
    try {
      await api("/api/integrations/caldav", { method: "POST", body: JSON.stringify({ appleId, appPassword: password }) });
      setPassword("");
      setMessage("iCloud ответил. Календари ниже. Пароль сохранён только на сервере в зашифрованном виде.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "iCloud не подключился");
    }
  }

  return (
    <main className="page space-y-4">
      <h1 className="font-display text-4xl md:text-5xl">Настройки</h1>
      <section className="card space-y-3 p-4">
        <h2 className="font-display text-2xl">Тема и имя</h2>
        <div className="flex gap-2">
          <Button size="sm" variant={theme === "light" ? "default" : "outline"} onClick={() => setTheme("light")}>Светлая</Button>
          <Button size="sm" variant={theme === "dark" ? "default" : "outline"} onClick={() => setTheme("dark")}>Тёмная</Button>
        </div>
        <input className="field" value={name} placeholder="Как к вам обращаться, необязательно" onChange={(event) => setName(event.target.value)} />
        <p className="text-sm text-[var(--muted)]">Часовой пояс: {data.user.timezone}. Встречи из Москвы показываются местным временем Пхукета.</p>
        <Button onClick={() => void saveProfile()}>Сохранить</Button>
      </section>
      <section className="card space-y-3 p-4">
        <h2 className="font-display text-2xl">Ассистент</h2>
        <p className="text-sm">{data.ai ? "Ключ OpenAI задан на сервере. В браузер он не передаётся." : "Ключ OpenAI не задан. Приложение работает вручную, а короткие фразы разбирает локальный помощник. Добавьте OPENAI_API_KEY в окружение сервера и перезапустите его. Инструкция есть в README."}</p>
      </section>
      <section className="card space-y-3 p-4">
        <h2 className="font-display text-2xl">iCloud Calendar</h2>
        <p className="text-sm">Статус: {data.integration.status === "needs_setup" ? "требует подключения" : data.integration.status === "connected" ? "подключено" : "ошибка"}. {data.integration.lastError}</p>
        <p className="text-sm text-[var(--muted)]">Нужен Apple ID и отдельный пароль приложения с календарями, не основной пароль. Последняя синхронизация: {data.integration.lastSyncAt ? new Date(data.integration.lastSyncAt).toLocaleString("ru-RU") : "ещё не было"}.</p>
        <input className="field" placeholder="Apple ID" autoComplete="username" value={appleId} onChange={(event) => setAppleId(event.target.value)} />
        <input className="field" placeholder="Пароль приложения" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void connect()}>Подключить</Button>
          <Button variant="outline" onClick={() => void api("/api/integrations/caldav/sync", { method: "POST" }).then(() => { setMessage("Синхронизация прошла."); router.refresh(); }).catch((reason) => setError(reason.message))}>Синхронизировать</Button>
          <Button variant="quiet" onClick={() => void api("/api/integrations/caldav", { method: "DELETE" }).then(() => router.refresh())}>Отключить</Button>
        </div>
        {data.integration.calendars.length > 0 && (
          <select className="field" value={data.integration.selectedCalendarHref ?? ""} onChange={(event) => void api("/api/integrations/caldav/calendar", { method: "POST", body: JSON.stringify({ href: event.target.value }) }).then(() => router.refresh())}>
            {data.integration.calendars.map((calendar) => <option key={calendar.href} value={calendar.href}>{calendar.name}</option>)}
          </select>
        )}
        <Button variant="outline" onClick={() => void fetch("/api/calendar/export").then(async (response) => {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "life-os.ics";
            link.click();
            URL.revokeObjectURL(url);
          })}>Скачать .ics</Button>
        <p className="text-sm text-[var(--muted)]">Файл .ics — ручной импорт в Apple Calendar. Это не двусторонняя синхронизация.</p>
      </section>
      <section className="card space-y-3 p-4">
        <h2 className="font-display text-2xl">Напоминания внутри приложения</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked={data.prefs.dailyReflectionEnabled} onChange={(event) => void api("/api/settings", { method: "PATCH", body: JSON.stringify({ dailyReflectionEnabled: event.target.checked }) })} /> Дневная рефлексия</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked={data.prefs.weeklyReflectionEnabled} onChange={(event) => void api("/api/settings", { method: "PATCH", body: JSON.stringify({ weeklyReflectionEnabled: event.target.checked }) })} /> Недельная рефлексия</label>
        <p className="text-sm text-[var(--muted)]">Фоновые push-уведомления не работают: система их не отправляет, когда приложение закрыто.</p>
      </section>
      <section className="card space-y-3 p-4">
        <h2 className="font-display text-2xl">Данные</h2>
        <p className="text-sm">{data.auth ? "Вход по паролю включён." : "Локальный режим без входа. Для публикации задайте LIFEOS_ACCESS_PASSWORD."}</p>
        {data.demo && <Button variant="outline" onClick={() => void api("/api/settings/demo", { method: "DELETE" }).then(() => router.refresh())}>Удалить демо-данные</Button>}
        <h3 className="pt-2 text-sm">Последние изменения</h3>
        <ul className="space-y-1 text-sm text-[var(--muted)]">
          {data.audit.map((item) => <li key={item.id}>{item.createdAt.slice(0, 16).replace("T", " ")} · {item.actor} · {item.action} · {item.entityType}</li>)}
        </ul>
      </section>
      {message && <p className="text-sm">{message}</p>}
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
    </main>
  );
}
