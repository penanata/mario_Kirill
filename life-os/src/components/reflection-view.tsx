"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/client";
import { Button } from "@/components/ui";
import { REFLECTION_QUESTIONS } from "@/lib/reflection";
import type { ReflectionPeriod } from "@/lib/types";
import type { getReflectionView } from "@/lib/views";

type Data = ReturnType<typeof getReflectionView>;

export function ReflectionView({ data }: { data: Data }) {
  const router = useRouter();
  const [period, setPeriod] = useState<ReflectionPeriod>("day");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const questions = REFLECTION_QUESTIONS[period];
  const filtered = useMemo(() => data.reflections.filter((item) => `${item.summary ?? ""} ${item.periodKey}`.toLowerCase().includes(query.toLowerCase())), [data.reflections, query]);

  async function save() {
    setError("");
    try {
      const result = await api<{ summary: string }>("/api/reflections", { method: "POST", body: JSON.stringify({ period, answers }) });
      setSaved(result.summary);
      setAnswers({});
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не сохранилось");
    }
  }

  const a = data.reflections.find((item) => item.id === left);
  const b = data.reflections.find((item) => item.id === right);

  return (
    <main className="page space-y-5">
      <h1 className="font-display text-4xl md:text-5xl">Рефлексия</h1>
      <p className="max-w-xl text-sm text-[var(--muted)]">Можно отвечать свободно. В саммари попадут только ваши слова. Напоминания внутри приложения можно выключить в настройках. Push-уведомления не настроены.</p>
      {data.habitNote && <p className="text-sm text-[var(--muted)]">Факт по тренировкам, не оценка настроения: {data.habitNote}</p>}
      <div className="flex flex-wrap gap-2">
        {(["day", "week", "month", "quarter", "year"] as const).map((item) => (
          <Button key={item} size="sm" variant={period === item ? "default" : "outline"} onClick={() => { setPeriod(item); setAnswers({}); setSaved(""); }}>{item === "day" ? "День" : item === "week" ? "Неделя" : item === "month" ? "Месяц" : item === "quarter" ? "Квартал" : "Год"}</Button>
        ))}
      </div>
      <div className="card space-y-3 p-4">
        {questions.map((question) => (
          <label key={question.key} className="block text-sm">{question.prompt}
            <textarea className="field mt-1" value={answers[question.key] ?? ""} onChange={(event) => setAnswers({ ...answers, [question.key]: event.target.value })} />
          </label>
        ))}
        <Button onClick={() => void save()}>Сохранить</Button>
        {saved && <pre className="whitespace-pre-wrap text-sm">{saved}</pre>}
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </div>
      <input className="field" placeholder="Поиск по прошлым рефлексиям" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="space-y-2">
        {filtered.map((item) => (
          <article key={item.id} className="card p-4">
            <div className="text-xs text-[var(--muted)]">{item.period} · {item.periodKey}</div>
            <pre className="mt-2 whitespace-pre-wrap text-sm">{item.summary}</pre>
          </article>
        ))}
      </div>
      {data.reflections.length > 1 && (
        <section className="card p-4">
          <h2 className="font-display text-2xl">Сравнить</h2>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <select className="field" value={left} onChange={(event) => setLeft(event.target.value)}><option value="">Первый период</option>{data.reflections.map((item) => <option key={item.id} value={item.id}>{item.periodKey}</option>)}</select>
            <select className="field" value={right} onChange={(event) => setRight(event.target.value)}><option value="">Второй период</option>{data.reflections.map((item) => <option key={item.id} value={item.id}>{item.periodKey}</option>)}</select>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm">
            <pre className="whitespace-pre-wrap">{a?.summary}</pre>
            <pre className="whitespace-pre-wrap">{b?.summary}</pre>
          </div>
        </section>
      )}
    </main>
  );
}
