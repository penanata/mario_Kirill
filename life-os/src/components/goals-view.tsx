"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client";
import { Button, DemoMark } from "@/components/ui";
import type { getGoalsView } from "@/lib/views";

type Data = ReturnType<typeof getGoalsView>;
type Goal = Data["goals"][number];

const horizons = [
  ["life", "Глобальная"],
  ["year", "Год"],
  ["quarter", "Квартал"],
  ["month", "Месяц"],
  ["week", "Неделя"],
] as const;

export function GoalsView({ data }: { data: Data }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(data.goals.find((goal) => goal.horizon === "life")?.id ?? null);
  const [title, setTitle] = useState("");
  const [horizon, setHorizon] = useState<Goal["horizon"]>("month");
  const [parentId, setParentId] = useState(openId ?? "");
  const [areaName, setAreaName] = useState("");
  const [error, setError] = useState("");

  function node(goal: Goal, depth = 0): React.ReactNode {
    const children = data.goals.filter((item) => item.parentId === goal.id);
    const tasks = data.tasks.filter((task) => task.goalId === goal.id && task.status !== "cancelled");
    const active = openId === goal.id;
    return (
      <div key={goal.id} id={goal.id} style={{ marginLeft: depth ? 16 : 0 }} className="border-l border-[var(--line)] pl-3">
        <button type="button" className="block py-2 text-left" onClick={() => setOpenId(goal.id)}>
          <span className="text-xs text-[var(--muted)]">{horizons.find((item) => item[0] === goal.horizon)?.[1]}</span>
          <span className="mt-1 flex items-center gap-2">{goal.title} <DemoMark on={goal.isDemo} /></span>
        </button>
        {active && (
          <div className="mb-3 space-y-2">
            {goal.description && <p className="text-sm text-[var(--muted)]">{goal.description}</p>}
            <input className="field" defaultValue={goal.title} onBlur={(event) => {
              if (event.target.value !== goal.title) void api(`/api/goals/${goal.id}`, { method: "PATCH", body: JSON.stringify({ title: event.target.value }) }).then(() => router.refresh());
            }} />
            {tasks.map((task) => <div key={task.id} className="text-sm">{task.status === "done" ? "Готово" : "Открыто"} · {task.title}</div>)}
            {tasks.length === 0 && <p className="text-sm text-[var(--muted)]">Задач на этом уровне нет.</p>}
          </div>
        )}
        {children.map((child) => node(child, depth + 1))}
      </div>
    );
  }

  return (
    <main className="page">
      <h1 className="font-display text-4xl md:text-5xl">Цели</h1>
      <p className="mb-5 mt-2 max-w-xl text-sm text-[var(--muted)]">Цепочка открывается по нажатию: глобальная цель, год, квартал, месяц, неделя и задачи. Ассистент не переименовывает их сам.</p>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="card p-4">
          {data.goals.filter((goal) => goal.horizon === "life").map((goal) => node(goal))}
          {data.goals.filter((goal) => goal.horizon === "life").length === 0 && <p>Целей пока нет. Добавьте первую справа.</p>}
        </div>
        <div className="card space-y-3 p-4">
          <h2 className="font-display text-2xl">Добавить</h2>
          <input className="field" placeholder="Формулировка цели" value={title} onChange={(event) => setTitle(event.target.value)} />
          <select className="field" value={horizon} onChange={(event) => setHorizon(event.target.value as Goal["horizon"])}>
            {horizons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className="field" value={parentId} onChange={(event) => setParentId(event.target.value)}>
            <option value="">Без родителя</option>
            {data.goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
          </select>
          <Button onClick={() => void api("/api/goals", { method: "POST", body: JSON.stringify({ title, horizon, parentId: parentId || null, areaId: data.goals.find((goal) => goal.id === parentId)?.areaId ?? null }) }).then(() => { setTitle(""); router.refresh(); }).catch((reason) => setError(reason.message))}>Сохранить цель</Button>
          <input className="field" placeholder="Новая сфера, например отношения" value={areaName} onChange={(event) => setAreaName(event.target.value)} />
          <Button variant="outline" onClick={() => void api("/api/areas", { method: "POST", body: JSON.stringify({ name: areaName }) }).then(() => { setAreaName(""); router.refresh(); }).catch((reason) => setError(reason.message))}>Добавить сферу</Button>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <div className="text-sm text-[var(--muted)]">{data.areas.map((area) => area.name).join(" · ")}</div>
        </div>
      </div>
    </main>
  );
}
