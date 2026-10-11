"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client";
import { Badge, Button, DemoMark, Modal, Progress } from "@/components/ui";
import type { DashboardData } from "@/lib/dashboard";

export function Dashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [move, setMove] = useState<{ id: string; title: string } | null>(null);
  const [slots, setSlots] = useState<{ startAt: string; endAt: string }[]>([]);
  const [day, setDay] = useState(data.today);

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

  return (
    <main className="page space-y-6">
      {data.demo && (
        <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4 rise">
          <p className="max-w-xl text-sm">Демонстрационные данные — это пример, не ваши реальные события. Их можно удалить и начать с пустого листа.</p>
          <Button variant="outline" size="sm" onClick={() => void run("/api/settings/demo", { method: "DELETE" })}>Удалить демо</Button>
        </div>
      )}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--muted)]">{data.greeting}</p>
          <h1 className="font-display text-4xl leading-tight md:text-6xl">{data.heading}</h1>
        </div>
        <div className="text-sm text-[var(--muted)]">
          <div className="font-display text-3xl text-[var(--ink)]">{data.freeLabel}</div>
          свободно с 8:00 до 20:00
        </div>
      </header>
      <section className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <div className="text-sm text-[var(--muted)]">Самочувствие</div>
          <div>{data.energy ? `Энергия ${data.energy} из 5 — вы сами отметили` : "Энергия не отмечена. Я её не угадываю."}</div>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button key={value} className="h-11 w-11 rounded-full border border-[var(--line)]" onClick={() => void run("/api/checkins", { method: "POST", body: JSON.stringify({ date: data.today, energy: value }) })}>{value}</button>
          ))}
        </div>
      </section>
      {data.reminder && <p className="text-sm text-[var(--muted)]">{data.reminder.text} <Link href="/reflection">Открыть рефлексию</Link></p>}
      <p className="text-sm text-[var(--muted)]">
        iCloud: {data.icloud.status === "connected" ? `синхронизация ${data.icloud.lastSyncAt ? new Date(data.icloud.lastSyncAt).toLocaleString("ru-RU") : "ещё не запускалась"}` : data.icloud.status === "error" ? data.icloud.lastError : "требует подключения"}. <Link href="/settings">Настроить</Link>
      </p>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-3xl">Что делать сегодня</h2>
          <span className="text-sm text-[var(--muted)]">не больше трёх</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {data.focus.length === 0 && <article className="card p-5">Открытых задач нет. Можно отдохнуть или сказать ассистенту, что появилось.</article>}
          {data.focus.map((item) => (
            <article key={item.id} className="card flex flex-col gap-3 p-5 rise">
              <div className="flex flex-wrap gap-2">
                <Badge tone={item.lane === "obligation" ? "warn" : "accent"}>{item.lane === "obligation" ? "Обязательство" : "Фокус"}</Badge>
                <DemoMark on={item.isDemo} />
              </div>
              <h3 className="text-xl">{item.title}</h3>
              <p className="text-sm text-[var(--muted)]">{item.estimateLabel}{item.goal ? ` · ${item.goal}` : " · без глобальной цели"}</p>
              <p className="text-sm">{item.reason}</p>
              {item.outcome && <p className="text-sm text-[var(--muted)]">Результат: {item.outcome}</p>}
              <div className="mt-auto flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void run(`/api/tasks/${item.id}/complete`, { method: "POST" })}>Готово</Button>
                <Button size="sm" variant="outline" onClick={() => void openMove(item.id, item.title)}>Перенести</Button>
                <Button size="sm" variant="quiet" onClick={() => void run(`/api/tasks/${item.id}`, { method: "DELETE" })}>Отменить</Button>
              </div>
            </article>
          ))}
        </div>
        {data.overload && (
          <p className="mt-3 text-sm text-[var(--muted)]">Оценок больше, чем свободного времени, примерно на {data.overload.excessLabel}. Можно перенести необязательное, сократить или отказаться. Само ничего не двигаю.</p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-3xl">День</h2>
            <Link href="/calendar" className="text-sm">Весь календарь</Link>
          </div>
          <div className="mb-4 flex gap-2 overflow-auto">
            {data.weekStrip.map((dayItem) => (
              <div key={dayItem.date} className={`min-w-14 rounded-2xl px-2 py-2 text-center ${dayItem.isToday ? "bg-[var(--accent-soft)]" : ""}`}>
                <div className="text-xs text-[var(--muted)]">{dayItem.weekday}</div>
                <div className="font-display text-2xl">{dayItem.day}</div>
                <div className="text-[11px] text-[var(--muted)]">{dayItem.count ? `${dayItem.count}` : "—"}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {data.timeline.length === 0 && <p className="text-sm text-[var(--muted)]">На сегодня в календаре пусто.</p>}
            {data.timeline.map((event) => (
              <div key={event.id} className="flex items-baseline justify-between gap-3 border-t border-[var(--line)] py-3">
                <div>
                  <div className="flex items-center gap-2">{event.title} <DemoMark on={event.isDemo} /></div>
                  {event.location && <div className="text-sm text-[var(--muted)]">{event.location}</div>}
                </div>
                <div className="text-sm text-[var(--muted)]">{event.secondary || `${event.start}–${event.end}`}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="font-display text-3xl">Неделя</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.week.outcomes.map((goal) => <li key={goal.id}>{goal.title} <DemoMark on={goal.isDemo} /></li>)}
          </ul>
          <p className="mt-4 text-sm text-[var(--muted)]">Открыто {data.week.openCount}, закрыто на этой неделе {data.week.doneCount}.</p>
          <div className="mt-3 space-y-1 text-sm">
            {data.week.deadlines.map((task) => <div key={task.id}>{task.title} · {task.due}</div>)}
          </div>
          <p className="mt-4 text-sm">{data.week.recommendation}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">{data.week.rest.length ? `Отдых: ${data.week.rest.join(", ")}` : "Отдельный отдых на неделе пока не стоит в календаре."}</p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-3xl">Цели месяца</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {data.monthGoals.map((goal) => (
            <Link key={goal.id} href={`/goals#${goal.id}`} className="card block p-5 no-underline">
              <div className="mb-2 flex items-center justify-between gap-2 text-sm text-[var(--muted)]"><span>{goal.area}</span><DemoMark on={goal.isDemo} /></div>
              <div className="mb-3 text-lg">{goal.title}</div>
              <Progress value={goal.ratio} />
              <p className="mt-2 text-sm text-[var(--muted)]">{goal.detail}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card p-5 md:col-span-2">
          <h2 className="font-display text-3xl">Глобальные цели</h2>
          <div className="mt-3 space-y-3">
            {data.globals.map((goal) => (
              <Link key={goal.id} href={`/goals#${goal.id}`} className="block border-t border-[var(--line)] py-3 no-underline">
                <div className="text-xs text-[var(--muted)]">{goal.area}</div>
                <div className="flex items-center gap-2">{goal.title} <DemoMark on={goal.isDemo} /></div>
              </Link>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="font-display text-3xl">Идеи</h2>
          <p className="mt-3 font-display text-5xl">{data.ideas.fresh}</p>
          <p className="text-sm text-[var(--muted)]">новых · отложено {data.ideas.deferred}</p>
          {data.ideas.examples > 0 && <p className="mt-2 text-sm">Ещё {data.ideas.examples} примеров ждут, хотите ли вы их себе.</p>}
          {data.habit && <p className="mt-4 text-sm">{data.habit.name}: {data.habit.done} из {data.habit.target}. {data.habit.note}</p>}
          <Link href="/ideas" className="mt-4 inline-block text-sm">Открыть банк</Link>
        </div>
      </section>

      <Modal open={Boolean(move)} onOpenChange={(open) => !open && setMove(null)} title={move ? `Куда перенести «${move.title}»` : ""}>
        <label className="mb-3 block text-sm">День
          <input className="field mt-1" type="date" value={day} onChange={(event) => { setDay(event.target.value); void api<{ slots: { startAt: string; endAt: string }[] }>(`/api/schedule/slots?date=${event.target.value}&minutes=60`).then((result) => setSlots(result.slots)); }} />
        </label>
        <div className="space-y-2">
          {slots.length === 0 && <p className="text-sm">Свободного часа в этот день между 8:00 и 20:00 нет.</p>}
          {slots.map((slot) => (
            <Button key={slot.startAt} variant="outline" className="w-full" onClick={() => {
              if (!move) return;
              void run(`/api/tasks/${move.id}`, { method: "PATCH", body: JSON.stringify({ scheduledStart: slot.startAt, scheduledEnd: slot.endAt, rescheduleCount: undefined }) }).then(() => setMove(null));
            }}>{new Date(slot.startAt).toLocaleString("ru-RU", { timeZone: data.tz, hour: "2-digit", minute: "2-digit" })}</Button>
          ))}
        </div>
      </Modal>
    </main>
  );
}
