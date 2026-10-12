"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/components/client";
import { Button, Modal } from "@/components/ui";
import { GROUP_ORDER, GROUPS, eventGroup, type LifeGroup } from "@/lib/groups";
import { addDaysKey, eachDay, formatTime, isoDow, todayKey, weekdayName, zonedDate } from "@/lib/time";
import type { getCalendarView } from "@/lib/views";

type Data = ReturnType<typeof getCalendarView>;

const HEADS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

export function CalendarView({ data }: { data: Data }) {
  const router = useRouter();
  const [mode, setMode] = useState<"day" | "week" | "month">("month");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<LifeGroup>("personal");
  const [form, setForm] = useState({ title: "", date: data.anchor, start: "10:00", end: "11:00", location: "" });
  const hours = useMemo(() => Array.from({ length: 15 }, (_, index) => index + 7), []);
  const monthDays = eachDay(data.month.start, data.month.end, data.tz);
  const lead = isoDow(data.month.start, data.tz) - 1;
  const step = mode === "month" ? 30 : mode === "week" ? 7 : 1;

  function eventsOn(day: string) {
    return data.events.filter((event) => todayKey(new Date(event.startAt), data.tz) === day);
  }

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
          groupKey: group,
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
      <div className="mb-3 flex items-center justify-between px-1">
        <a className="text-[var(--accent)] no-underline" href={`/calendar?day=${addDaysKey(data.anchor, -step, data.tz)}`}>‹</a>
        <h1 className="text-lg font-semibold capitalize">{mode === "day" ? data.heading : data.month.label}</h1>
        <a className="text-[var(--accent)] no-underline" href={`/calendar?day=${addDaysKey(data.anchor, step, data.tz)}`}>›</a>
      </div>
      <div className="segment mb-4">
        {(["day", "week", "month"] as const).map((item) => (
          <button key={item} type="button" data-active={mode === item} onClick={() => setMode(item)}>{item === "day" ? "День" : item === "week" ? "Неделя" : "Месяц"}</button>
        ))}
      </div>
      <button type="button" className="mb-4 text-sm text-[var(--accent)]" onClick={() => setOpen(true)}>Новое событие</button>
      {error && <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>}

      {mode === "month" && (
        <section className="card p-3">
          <div className="mb-2 grid grid-cols-7 text-center text-[11px] uppercase text-[var(--muted)]">
            {HEADS.map((day) => <div key={day}>{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: lead }, (_, index) => <div key={`lead-${index}`} />)}
            {monthDays.map((day) => {
              const dots = [...new Set(eventsOn(day).map((event) => GROUPS[eventGroup(event)].color))].slice(0, 4);
              const selected = day === data.anchor;
              return (
                <a key={day} href={`/calendar?day=${day}`} className="flex h-12 flex-col items-center justify-center no-underline">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${selected ? "bg-[var(--accent)] text-white" : ""}`}>{Number(day.slice(-2))}</span>
                  <span className="flex h-2 gap-0.5">{dots.map((color) => <i key={color} className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />)}</span>
                </a>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 px-1 text-[11px] text-[var(--muted)]">
            {GROUP_ORDER.map((key) => (
              <span key={key} className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ background: GROUPS[key].color }} />{GROUPS[key].label}</span>
            ))}
          </div>
        </section>
      )}

      {mode === "month" && (
        <section className="card mt-3 overflow-hidden">
          {eventsOn(data.anchor).length === 0 && <p className="px-4 py-5 text-sm text-[var(--muted)]">Нет событий</p>}
          {eventsOn(data.anchor).length > 0 && <div className="space-y-2 p-3">
          {eventsOn(data.anchor).map((event) => {
            const tone = GROUPS[eventGroup(event)];
            return (
              <div key={event.id} className="rounded-2xl px-4 py-3" style={{ background: tone.wash }}>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-medium">{event.title}</div>
                  <div className="text-sm" style={{ color: tone.color }}>{formatTime(event.startAt, data.tz)}</div>
                </div>
              </div>
            );
          })}
          </div>}
        </section>
      )}

      {mode === "day" && (
        <div className="card relative mt-3 overflow-hidden p-2">
          <div className="hour-grid" style={{ height: hours.length * 48 }}>
            {hours.map((hour) => (
              <div key={hour} className="hour-line" style={{ top: (hour - 7) * 48 }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void moveEvent(event.dataTransfer.getData("text/plain"), hour)}>
                <span className="absolute left-1 w-10 -translate-y-2 text-[11px] text-[var(--muted)]">{hour}</span>
              </div>
            ))}
            {eventsOn(data.anchor).map((event) => {
              const startHour = Number(formatTime(event.startAt, data.tz).slice(0, 2)) + Number(formatTime(event.startAt, data.tz).slice(3)) / 60;
              const endHour = Number(formatTime(event.endAt, data.tz).slice(0, 2)) + Number(formatTime(event.endAt, data.tz).slice(3)) / 60;
              const tone = GROUPS[eventGroup(event)];
              return (
                <div key={event.id} draggable className="event-block" style={{ top: (startHour - 7) * 48, height: Math.max(36, (endHour - startHour) * 48), background: tone.wash, color: "var(--ink)", boxShadow: `inset 3px 0 0 ${tone.color}` }} onDragStart={(drag) => drag.dataTransfer.setData("text/plain", event.id)}>
                  <div className="text-sm font-medium">{event.title}</div>
                  <div className="text-[11px] opacity-90">{formatTime(event.startAt, data.tz)}–{formatTime(event.endAt, data.tz)}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 space-y-2 md:hidden">
            {eventsOn(data.anchor).map((event) => (
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
        <div className="grid grid-cols-7 gap-1">
          {eachDay(data.week.start, data.week.end, data.tz).map((day) => (
            <a key={day} href={`/calendar?day=${day}`} className="min-h-28 rounded-xl bg-[var(--surface)] p-1 no-underline">
              <div className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs ${day === data.today ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"}`}>{Number(day.slice(-2))}</div>
              <div className="text-center text-[10px] uppercase text-[var(--muted)]">{weekdayName(day, data.tz, true)}</div>
              {eventsOn(day).slice(0, 3).map((event) => (
                <div key={event.id} className="mt-1 truncate rounded-md px-1 text-[10px]" style={{ background: GROUPS[eventGroup(event)].wash, color: GROUPS[eventGroup(event)].color }}>{event.title}</div>
              ))}
            </a>
          ))}
        </div>
      )}

      <Modal open={open} onOpenChange={setOpen} title="Событие">
        <div className="space-y-3">
          <input className="field" placeholder="Название" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <div className="flex gap-2">
            {GROUP_ORDER.map((key) => (
              <button key={key} type="button" aria-label={GROUPS[key].label} className="h-8 w-8 rounded-full" style={{ background: GROUPS[key].color, outline: group === key ? "2px solid var(--ink)" : "none", outlineOffset: 2 }} onClick={() => setGroup(key)} />
            ))}
          </div>
          <input className="field" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="field" type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} />
            <input className="field" type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} />
          </div>
          <input className="field" placeholder="Место" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
          <Button onClick={() => void saveEvent()}>Сохранить</Button>
        </div>
      </Modal>
    </main>
  );
}
