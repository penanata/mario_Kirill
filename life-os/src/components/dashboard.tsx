"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client";
import { Button, Modal } from "@/components/ui";
import type { DashboardData } from "@/lib/dashboard";

export function Dashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [move, setMove] = useState<{ id: string; title: string } | null>(null);
  const [slots, setSlots] = useState<{ startAt: string; endAt: string }[]>([]);
  const [day, setDay] = useState(data.today);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  async function run(path: string, init?: RequestInit) {
    setError("");
    try {
      await api(path, init);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не сохранилось");
    }
  }

  async function openMove(id: string, title: string) {
    setMove({ id, title });
    const result = await api<{ slots: { startAt: string; endAt: string }[] }>(`/api/schedule/slots?date=${day}&minutes=60`);
    setSlots(result.slots);
  }

  async function saveReflection() {
    if (!data.reflection) return;
    const filled = Object.fromEntries(Object.entries(answers).filter(([, value]) => value.trim()));
    if (!Object.keys(filled).length) {
      setError("Напишите хотя бы одну строку.");
      return;
    }
    await run("/api/reflections", {
      method: "POST",
      body: JSON.stringify({ period: data.reflection.period, periodKey: data.reflection.periodKey, answers: filled }),
    });
    setAnswers({});
  }

  return (
    <main className="page space-y-5">
      {data.demo && (
        <div className="flex items-center justify-between px-1 text-sm text-[var(--muted)]">
          <span>Демо</span>
          <button type="button" className="text-[var(--accent)]" onClick={() => void run("/api/settings/demo", { method: "DELETE" })}>Удалить</button>
        </div>
      )}
      <header className="flex items-end justify-between px-1">
        <div>
          <p className="text-sm capitalize text-[var(--danger)]">{data.weekday}</p>
          <h1 className="text-[56px] font-semibold leading-none tracking-tight">{data.dayNumber}</h1>
          <p className="text-sm text-[var(--muted)]">{data.monthName}</p>
        </div>
        <p className="pb-1 text-sm text-[var(--muted)]">{data.freeLabel}</p>
      </header>

      <div className="flex justify-between px-1">
        {data.weekStrip.map((item) => (
          <Link key={item.date} href={`/calendar?day=${item.date}`} className="flex w-10 flex-col items-center gap-1 no-underline">
            <span className="text-[11px] uppercase text-[var(--muted)]">{item.weekday}</span>
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${item.isToday ? "bg-[var(--danger)] text-white" : ""}`}>{item.day}</span>
            <span className="flex h-2 gap-0.5">
              {item.colors.map((color) => <i key={color} className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />)}
            </span>
          </Link>
        ))}
      </div>

      {error && <p className="px-1 text-sm text-[var(--danger)]">{error}</p>}

      <section className="card overflow-hidden">
        {data.timeline.length === 0 && <p className="px-4 py-6 text-sm text-[var(--muted)]">Сегодня пусто</p>}
        {data.timeline.map((event) => (
          <div key={event.id} className="flex gap-3 border-b border-[var(--line)] px-4 py-3 last:border-b-0">
            <span className="mt-1 h-10 w-1 rounded-full" style={{ background: event.color }} />
            <div className="min-w-0">
              <div className="truncate">{event.title}</div>
              <div className="text-sm text-[var(--muted)]">{event.secondary || `${event.start}–${event.end}`}</div>
            </div>
          </div>
        ))}
      </section>

      <section className="card overflow-hidden">
        <h2 className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Сегодня</h2>
        {data.focus.length === 0 && <p className="px-4 py-4 text-sm text-[var(--muted)]">Свободный день</p>}
        {data.focus.map((item) => (
          <div key={item.id} className="flex items-center gap-3 border-t border-[var(--line)] px-4 py-3">
            <button type="button" aria-label="Готово" className="h-6 w-6 shrink-0 rounded-full border-2" style={{ borderColor: item.color }} onClick={() => void run(`/api/tasks/${item.id}/complete`, { method: "POST" })} />
            <div className="min-w-0 flex-1">
              <div className="truncate">{item.title}</div>
              <div className="truncate text-sm text-[var(--muted)]">{item.estimateLabel}</div>
            </div>
            <button type="button" className="text-sm text-[var(--accent)]" onClick={() => void openMove(item.id, item.title)}>Позже</button>
          </div>
        ))}
      </section>

      {data.suggestions.length > 0 && (
        <section className="card overflow-hidden">
          <h2 className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Пойдёте?</h2>
          {data.suggestions.map((item) => (
            <div key={item.id} className="border-t border-[var(--line)] px-4 py-3">
              <div className="flex items-center gap-2">
                <i className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                <span className="truncate">{item.title}</span>
                {item.isDemo && <span className="text-[11px] text-[var(--muted)]">демо</span>}
              </div>
              <div className="mt-0.5 text-sm text-[var(--muted)]">{item.day} · {item.start}{item.location ? ` · ${item.location}` : ""}</div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => void run(`/api/opportunities/${item.id}/schedule`, { method: "POST" })}>Пойду</Button>
                <Button size="sm" variant="quiet" onClick={() => void run(`/api/opportunities/${item.id}`, { method: "PATCH", body: JSON.stringify({ status: "declined" }) })}>Не пойду</Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {data.reflection && (
        <section className="card p-4">
          <h2 className="text-lg font-semibold">{data.reflection.title}</h2>
          <div className="mt-3 space-y-2">
            {data.reflection.prompts.map((prompt) => (
              <label key={prompt.key} className="block text-sm text-[var(--muted)]">
                {prompt.prompt}
                <input className="field mt-1" value={answers[prompt.key] ?? ""} onChange={(event) => setAnswers({ ...answers, [prompt.key]: event.target.value })} />
              </label>
            ))}
          </div>
          <Button className="mt-3" onClick={() => void saveReflection()}>Сохранить</Button>
        </section>
      )}

      <section className="card overflow-hidden">
        {data.monthGoals.map((goal) => (
          <Link key={goal.id} href={`/goals#${goal.id}`} className="block border-b border-[var(--line)] px-4 py-3 no-underline last:border-b-0">
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ background: goal.color }} />{goal.area}</span>
              <span className="text-[var(--muted)]">{goal.detail}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
              <div className="h-full" style={{ width: `${Math.round((goal.ratio ?? 0) * 100)}%`, background: goal.color }} />
            </div>
          </Link>
        ))}
      </section>

      <Modal open={Boolean(move)} onOpenChange={(open) => !open && setMove(null)} title="Перенести">
        <input className="field mb-3" type="date" value={day} onChange={(event) => { setDay(event.target.value); void api<{ slots: { startAt: string; endAt: string }[] }>(`/api/schedule/slots?date=${event.target.value}&minutes=60`).then((result) => setSlots(result.slots)); }} />
        <div className="space-y-2">
          {slots.length === 0 && <p className="text-sm text-[var(--muted)]">Свободного часа нет</p>}
          {slots.map((slot) => (
            <Button key={slot.startAt} variant="outline" className="w-full" onClick={() => {
              if (!move) return;
              void run(`/api/tasks/${move.id}`, { method: "PATCH", body: JSON.stringify({ scheduledStart: slot.startAt, scheduledEnd: slot.endAt }) }).then(() => setMove(null));
            }}>{new Date(slot.startAt).toLocaleString("ru-RU", { timeZone: data.tz, hour: "2-digit", minute: "2-digit" })}</Button>
          ))}
        </div>
      </Modal>
    </main>
  );
}
