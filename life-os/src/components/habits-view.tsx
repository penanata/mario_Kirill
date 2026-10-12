"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProposalCard } from "@/components/assistant";
import { api } from "@/components/client";
import { Button } from "@/components/ui";
import { GROUPS, groupFromSlug, groupFromText } from "@/lib/groups";
import { isoDow } from "@/lib/time";
import type { Action } from "@/lib/types";
import type { getHabitsView } from "@/lib/views";

type Data = ReturnType<typeof getHabitsView>;
type Proposal = { proposal: { id: string; summary: string; status: string }; actions: Action[]; lines: string[] };
const HEADS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

export function HabitsView({ data }: { data: Data }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("15");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState("");

  async function mark(habitId: string, date: string, status: "done" | "missed") {
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
      <h1 className="px-1 text-3xl font-semibold tracking-tight">Привычки</h1>
      {error && <p className="px-1 text-sm text-[var(--danger)]">{error}</p>}
      {proposal && <ProposalCard proposal={proposal} />}
      {data.habits.map((habit) => {
        const group = groupFromSlug(habit.areaId ? data.areas.find((area) => area.id === habit.areaId)?.slug : null) ?? groupFromText(habit.name);
        const color = GROUPS[group].color;
        const lead = isoDow(habit.days[0], data.tz) - 1;
        return (
          <section key={habit.id} className="card p-4">
            <div className="mb-3 flex items-end justify-between">
              <h2 className="text-lg font-semibold">{habit.name}</h2>
              <p className="text-2xl font-semibold tracking-tight">{habit.plan.doneCount}<span className="text-base text-[var(--muted)]">/{habit.plan.target}</span></p>
            </div>
            <div className="mb-1 grid grid-cols-7 text-center text-[11px] uppercase text-[var(--muted)]">
              {HEADS.map((day) => <div key={day}>{day}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: lead }, (_, index) => <div key={`lead-${habit.id}-${index}`} />)}
              {habit.days.map((day) => {
                const log = habit.logs.find((item) => item.date === day);
                const done = log?.status === "done";
                const missed = log?.status === "missed";
                const today = day === data.today;
                return (
                  <button
                    key={day}
                    type="button"
                    className="flex h-11 items-center justify-center"
                    onClick={() => { if (!done && day <= data.today) void mark(habit.id, day, "done"); }}
                  >
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full text-sm"
                      style={{
                        background: done ? color : "transparent",
                        color: done ? "#fff" : missed ? "var(--muted)" : "inherit",
                        boxShadow: today && !done ? `inset 0 0 0 1.5px ${color}` : undefined,
                      }}
                    >{Number(day.slice(-2))}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="mt-2 text-sm text-[var(--muted)]" onClick={() => void mark(habit.id, data.today, "missed")}>Пропуск сегодня</button>
          </section>
        );
      })}
      <form className="card grid gap-2 p-3" onSubmit={(event) => { event.preventDefault(); void api("/api/habits", { method: "POST", body: JSON.stringify({ name, targetCount: Number(target) }) }).then(() => { setName(""); router.refresh(); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Не сохранилось")); }}>
        <input className="field" placeholder="Новая привычка" value={name} onChange={(event) => setName(event.target.value)} />
        <div className="flex gap-2">
          <input className="field w-24" inputMode="numeric" value={target} onChange={(event) => setTarget(event.target.value)} aria-label="Цель за месяц" />
          <Button type="submit">Добавить</Button>
        </div>
      </form>
    </main>
  );
}
