"use client";

import type { getInsightsView } from "@/lib/views";

export function InsightsView({ data }: { data: ReturnType<typeof getInsightsView> }) {
  const max = Math.max(1, ...data.byArea.map((area) => area.minutes));
  return (
    <main className="page space-y-4">
      <h1 className="font-display text-4xl md:text-5xl">Аналитика</h1>
      <p className="max-w-xl text-sm text-[var(--muted)]">{data.monthLabel}. Часы считаются по оценкам выполненных задач, не по экрану. Если ноль — записей нет.</p>
      <section className="card space-y-3 p-4">
        {data.byArea.map((area) => (
          <div key={area.id}>
            <div className="flex justify-between text-sm"><span>{area.name}</span><span>{Math.round(area.minutes / 6) / 10} ч</span></div>
            <div className="mt-1 h-2 rounded-full bg-black/5"><div className="h-full rounded-full" style={{ width: `${(area.minutes / max) * 100}%`, background: area.color || "var(--accent)" }} /></div>
          </div>
        ))}
        {data.byArea.every((area) => area.minutes === 0) && <p className="text-sm text-[var(--muted)]">За этот месяц выполненных задач с оценкой времени нет.</p>}
      </section>
      <section className="card p-4">
        <h2 className="font-display text-2xl">Энергия</h2>
        {data.checkins.length === 0 ? <p className="mt-2 text-sm text-[var(--muted)]">Отметок нет. График не из чего строить.</p> : (
          <div className="mt-3 flex items-end gap-2">
            {data.checkins.map((item) => <div key={item.date} className="text-center text-[11px]"><div className="mx-auto w-3 rounded-full bg-[var(--accent)]" style={{ height: (item.energy || 0) * 14 }} /><div>{item.date.slice(-2)}</div></div>)}
          </div>
        )}
      </section>
      <section className="card p-4">
        <h2 className="font-display text-2xl">Прогноз привычек</h2>
        {data.habits.map((habit) => <p key={habit.id} className="mt-2 text-sm">{habit.name}: {habit.plan.note}</p>)}
      </section>
    </main>
  );
}
