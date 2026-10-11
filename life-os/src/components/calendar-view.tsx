"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/components/client";
import { Button, DemoMark, Modal } from "@/components/ui";
import { addDaysKey, eachDay, formatTime, todayKey, weekdayName, zonedDate } from "@/lib/time";
import type { getCalendarView } from "@/lib/views";

type Data = ReturnType<typeof getCalendarView>;

export function CalendarView({ data }: { data: Data }) {
  const router = useRouter();
  const [mode, setMode] = useState<"day" | "week" | "month">("day");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", date: data.anchor, start: "10:00", end: "11:00", location: "" });
  const dayEvents = data.events.filter((event) => todayKey(new Date(event.startAt), data.tz) === data.anchor);
  const hours = useMemo(() => Array.from({ length: 15 }, (_, index) => index + 7), []);

  async function saveEvent() {
    setError("");
    try {
      await api("/api/events", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          startAt: zonedDate(form.date, form.start, data.tz).toISOString(),
          endAt: zonedDate(form.date, form.end, data.tz).toISOString(),
          location: form.location || null,
        }),
      });
      setOpen(false);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не сохранилось");
    }
  }

  async function moveEvent(id: string, hour: number) {
    const event = data.events.find((item) => item.id === id);
    if (!event) return;
    const duration = new Date(event.endAt).getTime() - new Date(event.startAt).getTime();
    const start = zonedDate(data.anchor, `${String(hour).padStart(2, "0")}:00`, data.tz);
    try {
      await api(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify({ startAt: start.toISOString(), endAt: new Date(start.getTime() + duration).toISOString() }) });
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не перенеслось");
    }
  }

  return (
    <main className="page">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl md:text-5xl">Календарь</h1>
          <p className="text-sm text-[var(--muted)]">Локальное расписание. Время — {data.tz}. Перетаскивание работает на компьютере, на телефоне удобнее кнопка времени.</p>
        </div>
        <Button onClick={() => setOpen(true)}>Событие</Button>
      </div>
      <div className="mb-4 flex gap-2">
        {(["day", "week", "month"] as const).map((item) => (
          <Button key={item} variant={mode === item ? "default" : "outline"} size="sm" onClick={() => setMode(item)}>{item === "day" ? "Сегодня" : item === "week" ? "Неделя" : "Месяц"}</Button>
        ))}
        <a className="text-sm self-center" href={`/calendar?day=${addDaysKey(data.anchor, mode === "month" ? -30 : mode === "week" ? -7 : -1, data.tz)}`}>Назад</a>
        <a className="text-sm self-center" href={`/calendar?day=${addDaysKey(data.anchor, mode === "month" ? 30 : mode === "week" ? 7 : 1, data.tz)}`}>Дальше</a>
      </div>
      {error && <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>}
      {mode === "day" && (
        <div className="card p-4">
          <h2 className="mb-3 font-display text-2xl">{data.heading}</h2>
          <div className="hour-grid" style={{ height: hours.length * 52 }}>
            {hours.map((hour) => (
              <div key={hour} className="hour-line flex" style={{ top: (hour - 7) * 52 }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void moveEvent(event.dataTransfer.getData("text/plain"), hour)}>
                <span className="absolute left-0 w-12 -translate-y-2 text-xs text-[var(--muted)]">{String(hour).padStart(2, "0")}:00</span>
              </div>
            ))}
            {dayEvents.map((event) => {
              const startHour = Number(formatTime(event.startAt, data.tz).slice(0, 2)) + Number(formatTime(event.startAt, data.tz).slice(3)) / 60;
              const endHour = Number(formatTime(event.endAt, data.tz).slice(0, 2)) + Number(formatTime(event.endAt, data.tz).slice(3)) / 60;
              return (
                <div key={event.id} draggable className="event-block" style={{ top: (startHour - 7) * 52, height: Math.max(36, (endHour - startHour) * 52) }} onDragStart={(drag) => drag.dataTransfer.setData("text/plain", event.id)}>
                  <div className="flex items-center gap-2 text-sm">{event.title} <DemoMark on={event.isDemo} /></div>
                  <div className="text-xs text-[var(--muted)]">{formatTime(event.startAt, data.tz)}–{formatTime(event.endAt, data.tz)}{event.secondaryTz ? ` · ${formatTime(event.startAt, event.secondaryTz)} МСК` : ""}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 space-y-2 md:hidden">
            {dayEvents.map((event) => (
              <label key={event.id} className="block text-sm">{event.title}
                <select className="field mt-1" value={formatTime(event.startAt, data.tz).slice(0, 2)} onChange={(change) => void moveEvent(event.id, Number(change.target.value))}>
                  {hours.map((hour) => <option key={hour} value={hour}>{hour}:00</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}
      {mode === "week" && (
        <div className="grid gap-2 md:grid-cols-7">
          {eachDay(data.week.start, data.week.end, data.tz).map((day) => (
            <a key={day} href={`/calendar?day=${day}`} className="card block p-3 no-underline">
              <div className="text-xs text-[var(--muted)]">{weekdayName(day, data.tz, true)}</div>
              <div className="font-display text-2xl">{day.slice(-2)}</div>
              {data.events.filter((event) => todayKey(new Date(event.startAt), data.tz) === day).map((event) => (
                <div key={event.id} className="mt-2 text-xs">{formatTime(event.startAt, data.tz)} {event.title}</div>
              ))}
            </a>
          ))}
        </div>
      )}
      {mode === "month" && (
        <div className="grid grid-cols-7 gap-1">
          {eachDay(data.month.start, data.month.end, data.tz).map((day) => {
            const count = data.events.filter((event) => todayKey(new Date(event.startAt), data.tz) === day).length;
            return <a key={day} href={`/calendar?day=${day}`} className={`card block p-2 text-center no-underline ${day === data.today ? "bg-[var(--accent-soft)]" : ""}`}><div>{day.slice(-2)}</div><div className="text-[11px] text-[var(--muted)]">{count || ""}</div></a>;
          })}
        </div>
      )}
      <Modal open={open} onOpenChange={setOpen} title="Новое событие">
        <div className="space-y-3">
          <input className="field" placeholder="Название" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <input className="field" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="field" type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} />
            <input className="field" type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} />
          </div>
          <input className="field" placeholder="Место" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
          <p className="text-xs text-[var(--muted)]">Время вводится как {data.tz}, даже если телефон в другом поясе.</p>
          <Button onClick={() => void saveEvent()}>Сохранить</Button>
        </div>
      </Modal>
    </main>
  );
}
