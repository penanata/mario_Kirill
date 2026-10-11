"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client";
import { Button, DemoMark } from "@/components/ui";
import type { getTasksView } from "@/lib/views";

type Data = ReturnType<typeof getTasksView>;

export function TasksView({ data }: { data: Data }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [goalId, setGoalId] = useState("");
  const [estimate, setEstimate] = useState("45");
  const [error, setError] = useState("");

  async function create() {
    setError("");
    try {
      const result = await api<{ duplicate?: boolean }>("/api/tasks", { method: "POST", body: JSON.stringify({ title, goalId: goalId || null, estimateMinutes: Number(estimate) || null }) });
      if (result.duplicate) setError("Такая открытая задача уже есть. Вторую не создаю.");
      setTitle("");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не сохранилось");
    }
  }

  return (
    <main className="page">
      <h1 className="font-display text-4xl md:text-5xl">Задачи</h1>
      <p className="mb-4 mt-2 max-w-xl text-sm text-[var(--muted)]">Бытовые дела могут жить без глобальной цели. Остальные лучше привязать, чтобы было видно, зачем они.</p>
      <div className="card mb-4 grid gap-2 p-4 md:grid-cols-[1fr_220px_100px_auto]">
        <input className="field" placeholder="Новая задача" value={title} onChange={(event) => setTitle(event.target.value)} />
        <select className="field" value={goalId} onChange={(event) => setGoalId(event.target.value)}>
          <option value="">Без цели</option>
          {data.goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
        </select>
        <input className="field" inputMode="numeric" value={estimate} onChange={(event) => setEstimate(event.target.value)} aria-label="Минуты" />
        <Button onClick={() => void create()}>Добавить</Button>
      </div>
      {error && <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>}
      <div className="space-y-2">
        {data.tasks.filter((task) => task.status !== "cancelled").map((task) => (
          <article key={task.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-2">{task.title} <DemoMark on={task.isDemo} /></div>
              <div className="text-sm text-[var(--muted)]">{task.goalTitle || "Без цели"} · {task.estimateMinutes ? `${task.estimateMinutes} мин` : "время не оценено"} · {task.status}{task.rescheduleCount ? ` · переносов ${task.rescheduleCount}` : ""}</div>
            </div>
            {task.status === "open" && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void api(`/api/tasks/${task.id}/complete`, { method: "POST" }).then(() => router.refresh())}>Готово</Button>
                <Button size="sm" variant="quiet" onClick={() => void api(`/api/tasks/${task.id}`, { method: "DELETE" }).then(() => router.refresh())}>Отменить</Button>
              </div>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
