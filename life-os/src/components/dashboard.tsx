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
    <main className="page space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-sm text-[var(--muted)]">{data.dayNumber} {data.monthName}</p>
          <h1 className="text-[40px] font-semibold leading-none tracking-tight">Сегодня</h1>
        </div>
        <div className="text-right text-sm text-[var(--muted)]">
          <div>{data.freeLabel}</div>
          {data.demo && <button type="button" className="mt-1 text-[var(--accent)]" onClick={() => void run("/api/settings/demo", { method: "DELETE" })}>Убрать демо</button>}
        </div>
      </header>

      <div className="flex justify-between">
        {data.weekStrip.map((item) => (
          <Link key={item.date} href={`/calendar?day=${item.date}`} className="flex w-10 flex-col items-center gap-1">
            <span className="text-[11px] uppercase text-[var(--muted)]">{item.weekday}</span>
            <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm ${item.isToday ? "bg-[var(--accent)] text-white" : ""}`}>{item.day}</span>
            <span className="flex h-1.5 gap-0.5">
              {item.colors.map((color) => <i key={color} className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />)}
            </span>
          </Link>
        ))}
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <section className="relative space-y-3 pl-6">
        {data.timeline.length > 0 && <span className="absolute bottom-3 left-[5px] top-3 w-px bg-[var(--line)]" />}
        {data.timeline.length === 0 && <p className="pl-1 text-sm text-[var(--muted)]">Пусто</p>}
        {data.timeline.map((event, index) => (
          <div key={event.id} className="relative">
            <span className="absolute -left-6 top-4 h-3 w-3 rounded-full border-2 bg-[var(--bg)]" style={{ borderColor: event.color }} />
            <div className="rounded-[20px] px-4 py-3" style={{ background: index === 0 ? event.color : event.wash, color: index === 0 ? "#fff" : "inherit" }}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="truncate font-semibold">{event.title}</div>
                <div className="shrink-0 text-sm opacity-80">{event.start}</div>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        {data.focus.map((item) => (
          <div key={item.id} className="flex items-center gap-3 rounded-[20px] px-4 py-3" style={{ background: item.wash }}>
            <button type="button" aria-label="Готово" className="h-5 w-5 shrink-0 rounded-full border-2 bg-white/70" style={{ borderColor: item.color }} onClick={() => void run(`/api/tasks/${item.id}/complete`, { method: "POST" })} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{item.title}</div>
              <div className="text-sm text-[var(--muted)]">{item.estimateLabel}</div>
            </div>
            <button type="button" className="text-sm" style={{ color: item.color }} onClick={() => void openMove(item.id, item.title)}>Позже</button>
          </div>
        ))}
      </section>

      {data.suggestions.map((item) => (
        <section key={item.id} className="rounded-[20px] px-4 py-3" style={{ background: item.wash }}>
          <div className="flex items-baseline justify-between gap-3">
            <div className="truncate font-semibold">{item.title}</div>
            <div className="text-sm text-[var(--muted)]">{item.start}</div>
          </div>
          <div className="mt-1 text-sm text-[var(--muted)]">{item.day}{item.location ? ` · ${item.location}` : ""}{item.isDemo ? " · демо" : ""}</div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => void run(`/api/opportunities/${item.id}/schedule`, { method: "POST" })}>Пойду</Button>
            <Button size="sm" variant="quiet" onClick={() => void run(`/api/opportunities/${item.id}`, { method: "PATCH", body: JSON.stringify({ status: "declined" }) })}>Не пойду</Button>
          </div>
        </section>
      ))}

      {data.reflection && (
        <section className="card p-4">
          <h2 className="text-lg font-semibold">{data.reflection.title}</h2>
          <div className="mt-3 space-y-2">
            {data.reflection.prompts.map((prompt) => (
              <input key={prompt.key} className="field" placeholder={prompt.prompt} value={answers[prompt.key] ?? ""} onChange={(event) => setAnswers({ ...answers, [prompt.key]: event.target.value })} />
            ))}
          </div>
          <Button className="mt-3" onClick={() => void saveReflection()}>Сохранить</Button>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        {data.monthGoals.map((goal) => (
          <Link key={goal.id} href={`/goals#${goal.id}`} className="rounded-[22px] p-4" style={{ background: goal.wash }}>
            <div className="text-sm" style={{ color: goal.color }}>{goal.area}</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">{goal.detail || "—"}</div>
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
