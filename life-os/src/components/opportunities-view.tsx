"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/client";
import { zonedDate } from "@/lib/time";
import { Button } from "@/components/ui";
import type { getOpportunitiesView } from "@/lib/views";

type Data = ReturnType<typeof getOpportunitiesView>;

const interests = ["AI и маркетинг", "Предпринимательство", "Русскоязычный нетворкинг", "Онлайн-встречи московских клубов", "Медитации и поющие чаши", "Чайные церемонии", "Йога", "Творческие мастер-классы", "Природа Банг Тао и Тхаланга"];

export function OpportunitiesView({ data }: { data: Data }) {
  const router = useRouter();
  const [form, setForm] = useState({ title: "", startAt: "", location: "", price: "", url: "", needsRegistration: false, registered: false });
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function add() {
    setError("");
    try {
      await api("/api/opportunities", { method: "POST", body: JSON.stringify({ ...form, startAt: form.startAt ? zonedDate(form.startAt.slice(0, 10), form.startAt.slice(11, 16), data.tz).toISOString() : null, needsRegistration: form.needsRegistration, registered: form.registered }) });
      setForm({ title: "", startAt: "", location: "", price: "", url: "", needsRegistration: false, registered: false });
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не сохранилось");
    }
  }

  async function pull() {
    setError("");
    setNotice("");
    try {
      const result = await api<{ extracted: { title: string | null; startAt: string | null; location: string | null; price: string | null; description: string | null; missing: string[] }; url: string }>("/api/opportunities/import", { method: "POST", body: JSON.stringify({ url: link }) });
      setNotice(result.extracted.missing.length ? `Не удалось достать: ${result.extracted.missing.join(", ")}. Проверьте перед сохранением.` : "Поля найдены. Проверьте их перед сохранением.");
      setForm({
        title: result.extracted.title || "",
        startAt: result.extracted.startAt ? result.extracted.startAt.slice(0, 16) : "",
        location: result.extracted.location || "",
        price: result.extracted.price || "",
        url: result.url,
        needsRegistration: false,
        registered: false,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ссылка не открылась");
    }
  }

  return (
    <main className="page space-y-4">
      <h1 className="font-display text-4xl md:text-5xl">Возможности</h1>
      <p className="max-w-xl text-sm text-[var(--muted)]">Банг Тао и Тхаланг, плюс онлайн-встречи. Автопоиск по площадкам ещё не подключён: сейчас только ручное добавление и разбор ссылки. Событие в календаре не означает, что вы зарегистрированы.</p>
      <p className="text-sm text-[var(--muted)]">{interests.join(" · ")}</p>
      <div className="card space-y-2 p-4">
        <div className="flex gap-2">
          <input className="field" placeholder="Ссылка на событие" value={link} onChange={(event) => setLink(event.target.value)} />
          <Button variant="outline" onClick={() => void pull()}>Разобрать</Button>
        </div>
        <input className="field" placeholder="Название" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        <input className="field" type="datetime-local" value={form.startAt} onChange={(event) => setForm({ ...form, startAt: event.target.value })} />
        <input className="field" placeholder="Место" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
        <input className="field" placeholder="Стоимость, если известна" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.needsRegistration} onChange={(event) => setForm({ ...form, needsRegistration: event.target.checked })} /> Нужна регистрация</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.registered} onChange={(event) => setForm({ ...form, registered: event.target.checked })} /> Я уже зарегистрирована</label>
        <Button onClick={() => void add()}>Сохранить карточку</Button>
        {notice && <p className="text-sm">{notice}</p>}
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </div>
      <div className="space-y-3">
        {data.items.length === 0 && <p className="text-sm text-[var(--muted)]">Пока пусто. Живые афиши сами не подставляются.</p>}
        {data.items.map((item) => (
          <article key={item.id} className="card p-4">
            <h2 className="text-lg">{item.title}</h2>
            <p className="text-sm text-[var(--muted)]">{[item.location, item.price, item.startAt].filter(Boolean).join(" · ")}</p>
            <p className="mt-1 text-sm">{item.needsRegistration ? (item.registered ? "Регистрация отмечена вами." : "Регистрация нужна и пока не отмечена.") : "Регистрация не отмечена как обязательная."}</p>
            {item.status !== "scheduled" ? (
              pendingId === item.id ? (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => void api(`/api/opportunities/${item.id}/schedule`, { method: "POST" }).then(() => { setPendingId(null); router.refresh(); }).catch((reason) => setError(reason.message))}>Да, только в календарь</Button>
                  <Button size="sm" variant="quiet" onClick={() => setPendingId(null)}>Не надо</Button>
                </div>
              ) : <Button className="mt-3" size="sm" variant="outline" onClick={() => setPendingId(item.id)}>В календарь</Button>
            ) : <p className="mt-2 text-sm">В календаре как занятость. Это не запись на мероприятие.</p>}
          </article>
        ))}
      </div>
    </main>
  );
}
