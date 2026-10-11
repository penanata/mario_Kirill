"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Mic, Send, X } from "lucide-react";
import { api } from "@/components/client";
import { Button } from "@/components/ui";
import type { Action } from "@/lib/types";

type Proposal = { proposal: { id: string; summary: string; status: string }; actions: Action[]; lines: string[] };
type Message = { id: string; role: string; content: string };

export function ProposalCard({ proposal, onDone }: { proposal: Proposal; onDone?: () => void }) {
  const router = useRouter();
  const [actions, setActions] = useState(proposal.actions);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  async function confirm(next = actions) {
    setBusy(true);
    setError("");
    try {
      if (editing) await api(`/api/ai/proposals/${proposal.proposal.id}`, { method: "PATCH", body: JSON.stringify({ actions: next }) });
      const data = await api<{ lines: string[] }>(`/api/ai/proposals/${proposal.proposal.id}/confirm`, { method: "POST" });
      setResult(data.lines);
      router.refresh();
      onDone?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не сохранилось");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await api(`/api/ai/proposals/${proposal.proposal.id}/cancel`, { method: "POST" });
      setResult(["Ничего не изменено."]);
      router.refresh();
      onDone?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не отменилось");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-2xl bg-[var(--accent-soft)] p-3 text-sm">
        <div className="mb-1 font-medium">Сохранено</div>
        {result.map((line) => <p key={line}>{line}</p>)}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] p-3 text-sm">
      <div className="mb-2 font-medium">Предложение</div>
      <ul className="space-y-2">
        {actions.map((action, index) => (
          <li key={index}>
            <ActionEditor action={action} editing={editing} onChange={(next) => setActions(actions.map((item, itemIndex) => itemIndex === index ? next : item))} />
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-[var(--danger)]">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.some((action) => action.type === "rescheduleTask" && action.requiresDecision) ? (
          (["move", "shrink", "delegate", "cancel"] as const).map((decision) => (
            <Button key={decision} size="sm" variant="outline" disabled={busy} onClick={() => {
              const next = actions.map((action) => action.type === "rescheduleTask" ? { ...action, decision } : action);
              setActions(next);
              void confirm(next);
            }}>
              {decision === "move" ? "Перенести" : decision === "shrink" ? "Сократить" : decision === "delegate" ? "Делегировать" : "Отменить задачу"}
            </Button>
          ))
        ) : (
          <Button size="sm" disabled={busy} onClick={() => void confirm()}>Подтвердить</Button>
        )}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing((value) => !value)}>{editing ? "Готово" : "Изменить"}</Button>
        <Button size="sm" variant="quiet" disabled={busy} onClick={() => void cancel()}>Отменить</Button>
      </div>
    </div>
  );
}

function ActionEditor({ action, editing, onChange }: { action: Action; editing: boolean; onChange: (action: Action) => void }) {
  if (!editing) return <span>{label(action)}</span>;
  if (action.type === "createIdea" || action.type === "createTask" || action.type === "createEvent") {
    return <input className="field" value={action.title} onChange={(event) => onChange({ ...action, title: event.target.value })} />;
  }
  return <span>{label(action)}</span>;
}

function label(action: Action) {
  switch (action.type) {
    case "completeHabit": return `Засчитать тренировку ${action.date}`;
    case "setHabitStatus": return `Пропуск ${action.date}. Новые дни: ${(action.futureDates || []).slice(0, 6).join(", ")}`;
    case "completeTask": return "Отметить задачу выполненной";
    case "rescheduleTask": return `Перенос на ${action.start.slice(0, 16).replace("T", " ")}`;
    case "createIdea": return `В банк идей: ${action.title}`;
    case "createEvent": return `Событие: ${action.title}`;
    case "createTask": return `Задача: ${action.title}`;
    case "proposeScheduleChanges": return action.moves.map((move) => `Поставить задачу на ${move.start.slice(0, 16).replace("T", " ")}`).join("; ");
    default: return action.type;
  }
}

export function Assistant() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [pending, setPending] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!open) return;
    api<{ conversation: { id: string }; messages: Message[]; pending: Proposal[] }>("/api/ai/history")
      .then((data) => {
        setConversationId(data.conversation.id);
        setMessages(data.messages);
        setPending(data.pending);
      })
      .catch(() => undefined);
  }, [open]);

  async function send(message = text) {
    if (!message.trim()) return;
    setBusy(true);
    setError("");
    setText("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: message }]);
    try {
      const data = await api<{ conversationId: string; reply: string; proposal: Proposal | null }>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message, conversationId }),
      });
      setConversationId(data.conversationId);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: data.reply }]);
      if (data.proposal) setPending((current) => [data.proposal!, ...current]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ассистент не ответил");
    } finally {
      setBusy(false);
    }
  }

  function dictate() {
    const Speech = (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
    if (!Speech) {
      setError("Голосовой ввод в этом браузере недоступен. Можно написать текст. Серверная расшифровка включается ключом OpenAI.");
      return;
    }
    const rec = new Speech();
    rec.lang = "ru-RU";
    rec.onresult = (event) => {
      const said = event.results[0]?.[0]?.transcript || "";
      setText(said);
      setListening(false);
    };
    rec.onerror = () => { setListening(false); setError("Не удалось распознать речь."); };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }

  return (
    <>
      <button type="button" className="fixed bottom-24 right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-[var(--ink)] px-4 text-sm text-[var(--bg)] shadow-card md:bottom-6" onClick={() => setOpen(true)}>
        <Mic size={16} /> Ассистент
      </button>
      {open && (
        <div id="assistant" className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 md:items-stretch md:justify-end md:bg-transparent">
          <section className="card flex h-[92vh] w-full flex-col rounded-b-none p-4 md:m-4 md:h-auto md:w-[420px] md:rounded-[28px]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-display text-2xl">Ассистент</div>
                <p className="text-xs text-[var(--muted)]">Существенные изменения только после подтверждения.</p>
              </div>
              <button type="button" aria-label="Закрыть" onClick={() => setOpen(false)} className="rounded-full p-2"><X /></button>
            </div>
            <div className="flex-1 space-y-3 overflow-auto pr-1">
              {messages.length === 0 && <p className="text-sm text-[var(--muted)]">Например: «Сегодня сходила в зал» или «Не успела сделать отчёт, перенеси».</p>}
              {messages.map((message) => (
                <p key={message.id} className={message.role === "user" ? "ml-8 rounded-2xl bg-[var(--accent-soft)] p-3 text-sm" : "text-sm whitespace-pre-wrap"}>{message.content}</p>
              ))}
              {pending.filter((item) => item.proposal.status === "pending").map((item) => (
                <ProposalCard key={item.proposal.id} proposal={item} onDone={() => setPending((current) => current.filter((entry) => entry.proposal.id !== item.proposal.id))} />
              ))}
              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            </div>
            <div className="mt-3 flex gap-2">
              <textarea className="field min-h-12 flex-1 resize-none" rows={2} value={text} placeholder="Что произошло и что важно" onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} />
              <div className="flex flex-col gap-2">
                <Button size="icon" variant="outline" aria-label="Голос" onClick={dictate}>{listening ? "…" : <Mic size={16} />}</Button>
                <Button size="icon" aria-label="Отправить" disabled={busy} onClick={() => void send()}><Send size={16} /></Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

type SpeechRec = {
  lang: string;
  start: () => void;
  onresult: (event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void;
  onerror: () => void;
  onend: () => void;
};
