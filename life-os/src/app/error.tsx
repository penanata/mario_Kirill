"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page">
      <h1 className="font-display text-4xl">Что-то сломалось</h1>
      <p className="my-3 text-sm">{error.message || "Страница не открылась."}</p>
      <button className="rounded-full bg-[var(--accent)] px-4 py-2 text-white" onClick={reset}>Попробовать снова</button>
    </main>
  );
}
