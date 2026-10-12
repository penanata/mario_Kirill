"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client";
import { Button, DemoMark } from "@/components/ui";
import type { getIdeasView } from "@/lib/views";

const statuses = [
  ["new", "Новая идея"],
  ["research", "На исследовании"],
  ["planned", "Запланировано"],
  ["experiment", "Активный эксперимент"],
  ["deferred", "Отложено"],
  ["rejected", "Отклонено"],
  ["done", "Реализовано"],
] as const;

type Data = ReturnType<typeof getIdeasView>;

export function IdeasView({ data }: { data: Data }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const mine = data.ideas.filter((idea) => idea.confirmed);
  const examples = data.ideas.filter((idea) => !idea.confirmed);

  async function add(extra?: { title: string; confirmed?: boolean; id?: string }) {
    setError("");
    try {
      if (extra?.id) {
        await api(`/api/ideas/${extra.id}`, { method: "PATCH", body: JSON.stringify({ confirmed: true, isDemo: false }) });
      } else {
        const result = await api<{ duplicate?: boolean }>("/api/ideas", { method: "POST", body: JSON.stringify({ title: extra?.title || title, description, confirmed: true, status: "new" }) });
        if (result.duplicate) setError("Такая идея уже есть в банке.");
        setTitle("");
        setDescription("");
      }
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не сохранилось");
    }
  }

  return (
    <main className="page">
      <h1 className="font-display text-4xl md:text-5xl">Банк идей</h1>
      <p className="mb-4 mt-2 max-w-xl text-sm text-[var(--muted)]">Идея не становится задачей, пока вы сами этого не захотите. Голосом её можно надиктовать ассистенту.</p>
      <div className="card mb-4 space-y-2 p-4">
        <input className="field" placeholder="Новая идея" value={title} onChange={(event) => setTitle(event.target.value)} />
        <textarea className="field" placeholder="Зачем она и чего вы ещё не знаете" value={description} onChange={(event) => setDescription(event.target.value)} />
        <Button onClick={() => void add()}>В банк, не в задачи</Button>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </div>
      <div className="space-y-3">
        {mine.map((idea) => (
          <article key={idea.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg">{idea.title}</h2><DemoMark on={idea.isDemo} /></div>
            {idea.description && <p className="mt-1 text-sm">{idea.description}</p>}
            <p className="mt-2 text-sm text-[var(--muted)]">{idea.aiRecommendation || "Рекомендация появится, когда идею разберёт ассистент."}</p>
            {idea.nextStep && <p className="text-sm">Следующий шаг: {idea.nextStep}</p>}
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <select className="field" value={idea.status} onChange={(event) => void api(`/api/ideas/${idea.id}`, { method: "PATCH", body: JSON.stringify({ status: event.target.value }) }).then(() => router.refresh())}>
                {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input className="field" placeholder="Время" defaultValue={idea.timeCost ?? ""} onBlur={(event) => void api(`/api/ideas/${idea.id}`, { method: "PATCH", body: JSON.stringify({ timeCost: event.target.value }) })} />
              <input className="field" placeholder="Деньги, если знаете" defaultValue={idea.moneyCost ?? ""} onBlur={(event) => void api(`/api/ideas/${idea.id}`, { method: "PATCH", body: JSON.stringify({ moneyCost: event.target.value }) })} />
            </div>
          </article>
        ))}
        {mine.length === 0 && <p className="text-sm text-[var(--muted)]">Ваших идей пока нет.</p>}
      </div>
      {examples.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-2xl">Примеры, не ваши идеи</h2>
          <p className="mb-3 text-sm text-[var(--muted)]">Они появятся в банке только если нажмёте «Это моё».</p>
          <div className="space-y-2">
            {examples.map((idea) => (
              <div key={idea.id} className="card flex items-center justify-between gap-3 p-4">
                <span>{idea.title}</span>
                <Button size="sm" variant="outline" onClick={() => void add({ title: idea.title, id: idea.id })}>Это моё</Button>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
