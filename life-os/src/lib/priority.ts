import { humanDuration, ruDays, todayKey } from "@/lib/time";
import type { InterpTask } from "@/lib/types";

export type FocusLane = "obligation" | "focus";

export type ScoredTask = {
  task: InterpTask;
  score: number;
  lane: FocusLane;
  reason: string;
  dueDays: number | null;
};

function dueDays(task: InterpTask, today: string, tz: string) {
  if (!task.dueAt) return null;
  const due = todayKey(new Date(task.dueAt), tz);
  const a = new Date(`${today}T12:00:00Z`).getTime();
  const b = new Date(`${due}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function duePhrase(days: number) {
  if (days < 0) return `срок уже прошёл (${ruDays(Math.abs(days))} назад)`;
  if (days === 0) return "срок сегодня";
  if (days === 1) return "срок завтра";
  return `срок через ${ruDays(days)}`;
}

export function scoreTask(task: InterpTask, opts: { today: string; tz: string; energy: number | null; freeMinutes: number }) {
  const days = dueDays(task, opts.today, opts.tz);
  let score = 0;
  if (task.goalId) score += 24;
  if (task.financialRisk || task.priority === "obligation") score += 60;
  if (task.priority === "high") score += 16;
  if (task.priority === "low") score -= 8;
  if (days !== null) {
    if (days < 0) score += 36;
    else if (days === 0) score += 34;
    else if (days <= 3) score += 26;
    else if (days <= 7) score += 10;
  }
  const estimate = task.estimateMinutes ?? 60;
  if (estimate <= opts.freeMinutes) score += 8;
  else score -= 18;
  if (opts.energy !== null && opts.energy <= 2 && task.priority !== "obligation" && !task.financialRisk) {
    if (estimate >= 90) score -= 22;
    else score += 4;
  }
  if (task.rescheduleCount >= 3) score -= 12;
  const lane: FocusLane = task.financialRisk || task.priority === "obligation" ? "obligation" : "focus";
  const reasonParts: string[] = [];
  if (lane === "obligation") {
    reasonParts.push(days === null ? "это обязательство с последствиями, оно отдельно от обычных идей" : `это обязательство: ${duePhrase(days)}`);
  } else if (days !== null) {
    reasonParts.push(duePhrase(days));
  }
  if (task.goalTitle) reasonParts.push(`приближает цель «${task.goalTitle}»`);
  if (opts.energy !== null && opts.energy <= 2 && lane !== "obligation") {
    reasonParts.push("энергия сейчас низкая, поэтому длинные задачи не ставлю первыми");
  }
  if (task.rescheduleCount >= 3) {
    reasonParts.push(`задача уже переносилась ${task.rescheduleCount} раза — следующий перенос только явным решением`);
  }
  const reason = reasonParts.length
    ? `Рекомендую сегодня, потому что ${reasonParts.join("; ")}.`
    : "Задача связана с текущим фокусом и помещается в день.";
  return { task, score, lane, reason, dueDays: days };
}

export function buildDailyFocus(opts: {
  tasks: InterpTask[];
  today: string;
  tz: string;
  energy: number | null;
  freeMinutes: number;
  limit?: number;
}) {
  const open = opts.tasks.filter((task) => task.status === "open");
  const scored = open
    .map((task) => scoreTask(task, opts))
    .sort((a, b) => b.score - a.score || a.task.title.localeCompare(b.task.title, "ru"));
  const obligations = scored.filter((item) => item.lane === "obligation");
  const rest = scored.filter((item) => item.lane !== "obligation");
  const picked: ScoredTask[] = [];
  for (const item of obligations) {
    if (picked.length >= (opts.limit ?? 3)) break;
    if (item.dueDays === null || item.dueDays <= 7) picked.push(item);
  }
  for (const item of rest) {
    if (picked.length >= (opts.limit ?? 3)) break;
    if (!picked.some((existing) => existing.task.id === item.task.id)) picked.push(item);
  }
  const plannedMinutes = picked.reduce((sum, item) => sum + (item.task.estimateMinutes ?? 45), 0);
  const openMinutes = open.reduce((sum, task) => sum + (task.estimateMinutes ?? 45), 0);
  const excess = openMinutes - opts.freeMinutes;
  const suggestions =
    excess > 30
      ? [...scored]
          .filter((item) => item.lane !== "obligation")
          .sort((a, b) => a.score - b.score)
          .slice(0, 3)
          .map((item) => ({
            taskId: item.task.id,
            title: item.task.title,
            reason: `Можно перенести: оценка ${humanDuration(item.task.estimateMinutes ?? 45)}, это не обязательство с последствиями.`,
          }))
      : [];
  return {
    items: picked,
    plannedMinutes,
    openMinutes,
    overload:
      excess > 30
        ? {
            excessMinutes: excess,
            suggestions,
          }
        : null,
  };
}

export function weekRecommendation(opts: {
  openCount: number;
  obligationCount: number;
  restPlanned: boolean;
  overdue: number;
  energy: number | null;
}) {
  const parts: string[] = [];
  if (opts.obligationCount > 0) {
    parts.push("Сначала обязательства с реальными последствиями, потом одна задача развития.");
  }
  if (opts.overdue > 0) {
    parts.push(`Просрочено задач: ${opts.overdue}. Их лучше закрыть или явно отменить, а не переносить бесконечно.`);
  }
  if (!opts.restPlanned) {
    parts.push("На неделе пока нет отдельного отдыха. Имеет смысл поставить хотя бы один спокойный вечер.");
  }
  if (opts.energy !== null && opts.energy <= 2) {
    parts.push("Энергия низкая: короткие задачи и восстановление важнее нового проекта.");
  }
  if (opts.openCount > 8) {
    parts.push("Открытых задач много. Новые идеи лучше оставить в банке, не в календаре.");
  }
  if (!parts.length) parts.push("Нагрузка выглядит спокойной. Можно держать три результата недели и не добавлять новое без нужды.");
  return parts.join(" ");
}
