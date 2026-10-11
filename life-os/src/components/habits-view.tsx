"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProposalCard } from "@/components/assistant";
import { api } from "@/components/client";
import { Button, DemoMark, Progress } from "@/components/ui";
import type { Action } from "@/lib/types";
import type { getHabitsView } from "@/lib/views";

type Data = ReturnType<typeof getHabitsView>;
type Proposal = { proposal: { id: string; summary: string; status: string }; actions: Action[]; lines: string[] };

export function HabitsView({ data }: { data: Data }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("15");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState("");

  async function log(habitId: string, date: string, status: "done" | "missed") {
    setError("");
    try {
      if (status === "missed") {
        const result = await api<{ proposal: Proposal }>(`/api/habits/${habitId}/miss`, { method: "POST", body: JSON.stringify({ date }) });
        setProposal(result.proposal);
        return;
      }
      await api(`/api/habits/${habitId}/log`, { method: "POST", body: JSON.stringify({ date, status }) });
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не сохранилось");
    }
  }

  return (
    <main className="page space-y-4">
      <h1 className="font-display text-4xl md:text-5xl">Привычки</h1>
      <p className="max-w-xl text-sm text-[var(--muted)]">{data.monthLabel}. Пропуск не считается выполнением и не уменьшает цель месяца.</p>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      {proposal && <ProposalCard proposal={proposal} onDone={() => { setProposal(null); router.refresh(); }} />}
      {data.habits.map((habit) => (
        <section key={habit.id} className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-3xl">{habit.name}</h2>
            <DemoMark on={habit.isDemo} />
          </div>
          <p className="mt-2 font-display text-5xl">{habit.plan.doneCount}<span className="text-2xl text-[var(--muted)]"> / {habit.plan.target}</span></p>
          <Progress value={habit.plan.target ? habit.plan.doneCount / habit.plan.target : null} />
          <p className="mt-3 text-sm">{habit.plan.note}</p>
          <div className="mt-4 grid grid-cols-7 gap-1">
            {habit.days.map((day) => {
              const log = habit.logs.find((item) => item.date === day);
              const tone = log?.status === "done" ? "bg-[var(--accent)] text-white" : log?.status === "missed" ? "bg-red-100 text-[var(--danger)]" : log?.status === "planned" ? "bg-[var(--accent-soft)]" : "bg-transparent";
              return <div key={day} className={`rounded-xl border border-[var(--line)] p-1 text-center text-[11px] ${tone}`} title={log?.status || "пусто"}>{day.slice(-2)}</div>;
            })}
          </div>
          <div className="mt-2 flex gap-3 text-xs text-[var(--muted)]"><span>зелёный — выполнено</span><span>мягкий — запланировано</span><span>красный — пропуск</span></div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void log(habit.id, data.today, "done")}>Сегодня выполнено</Button>
            <Button size="sm" variant="outline" onClick={() => void log(habit.id, data.today, "missed")}>Пропустить и пересчитать</Button>
          </div>
        </section>
      ))}
      <form className="card grid gap-2 p-4 md:grid-cols-[1fr_120px_auto]" onSubmit={(event) => { event.preventDefault(); void api("/api/habits", { method: "POST", body: JSON.stringify({ name, targetCount: Number(target) }) }).then(() => { setName(""); router.refresh(); }).catch((reason) => setError(reason.message)); }}>
        <input className="field" placeholder="Другая привычка" value={name} onChange={(event) => setName(event.target.value)} />
        <input className="field" inputMode="numeric" value={target} onChange={(event) => setTarget(event.target.value)} aria-label="Цель за месяц" />
        <Button type="submit">Добавить</Button>
      </form>
    </main>
  );
}
