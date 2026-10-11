import { reconcileHabit } from "@/lib/habits";
import { buildDailyFocus, weekRecommendation } from "@/lib/priority";
import { normalizeText } from "@/lib/text";
import {
  addDaysKey,
  findFreeSlots,
  formatDayTime,
  formatTime,
  humanDuration,
  isoDow,
  nextWeekday,
  todayKey,
  zonedDate,
} from "@/lib/time";
import type { Action, InterpContext, InterpTask, Interpretation } from "@/lib/types";

const WEEKDAY_WORDS: [string, number][] = [
  ["понедельник", 1],
  ["вторник", 2],
  ["среду", 3],
  ["среда", 3],
  ["четверг", 4],
  ["пятницу", 5],
  ["пятница", 5],
  ["субботу", 6],
  ["суббота", 6],
  ["воскресенье", 7],
];

function splitClauses(text: string) {
  const primary = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+|\s+а ещё\s+|\s+а также\s+|\s+и ещё\s+/i);
  const clauses: string[] = [];
  for (const part of primary) {
    for (const bit of part.split(/,\s*но\s+|\s+но\s+/i)) {
      const trimmed = bit.replace(/^[,.\s]+|[,.\s]+$/g, "").trim();
      if (trimmed) clauses.push(trimmed);
    }
  }
  return clauses;
}

function extractClock(clause: string) {
  const match = clause.match(/(?:в\s+)?(\d{1,2})[:.](\d{2})/);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour <= 23 && minute <= 59) return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const hourOnly = clause.match(/\bв\s+(\d{1,2})\b/);
  if (hourOnly && Number(hourOnly[1]) <= 23) return `${hourOnly[1].padStart(2, "0")}:00`;
  if (/утром/i.test(clause)) return "09:00";
  if (/дн[её]м/i.test(clause)) return "13:00";
  if (/вечером/i.test(clause)) return "18:00";
  return null;
}

function extractDuration(clause: string) {
  const normalized = normalizeText(clause);
  if (normalized.includes("полтора часа")) return 90;
  if (normalized.includes("полчаса")) return 30;
  const words: Record<string, number> = { один: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6 };
  const word = normalized.match(/(один|два|две|три|четыре|пять|шесть)\s+час/);
  if (word) return words[word[1]] * 60;
  const numeric = normalized.match(/(\d+)\s+час/);
  if (numeric) return Number(numeric[1]) * 60;
  if (/\bчас\b/.test(normalized)) return 60;
  return null;
}

function extractDay(clause: string, today: string, tz: string, now: Date) {
  const normalized = normalizeText(clause);
  if (normalized.includes("послезавтра")) return addDaysKey(today, 2, tz);
  if (normalized.includes("завтра")) return addDaysKey(today, 1, tz);
  if (normalized.includes("вчера")) return addDaysKey(today, -1, tz);
  if (normalized.includes("сегодня")) return today;
  for (const [word, dow] of WEEKDAY_WORDS) {
    if (new RegExp(`(^|\\s)${word}(\\s|$)`).test(normalized)) {
      const clock = extractClock(clause);
      const sameDay = isoDow(today, tz) === dow;
      let passed = false;
      if (sameDay && clock) {
        const instant = zonedDate(today, clock, tz).getTime();
        passed = instant <= now.getTime();
      }
      return nextWeekday(today, dow, tz, passed);
    }
  }
  return null;
}

function isNegated(clause: string) {
  return /не\s+(успел|успела|сделал|сделала|сходил|сходила|закончил|закончила|пош[её]л|пошла|был|была|ходил|ходила)/i.test(clause);
}

function findTask(tasks: InterpTask[], clause: string) {
  const normalized = normalizeText(clause);
  let best: InterpTask | null = null;
  let bestScore = 0;
  for (const task of tasks) {
    if (task.status !== "open" && task.status !== "deferred") continue;
    const title = normalizeText(task.title);
    if (title.length > 4 && normalized.includes(title)) return task;
    let score = 0;
    for (const word of title.split(" ")) {
      if (word.length < 4) continue;
      const stem = word.slice(0, Math.min(6, word.length));
      if (normalized.includes(word) || normalized.includes(stem)) score += word.length;
    }
    if (score > bestScore) {
      best = task;
      bestScore = score;
    }
  }
  return bestScore >= 5 ? best : null;
}

function findHabit(ctx: InterpContext, clause: string) {
  const normalized = normalizeText(clause);
  if (/зал|тренир/.test(normalized)) {
    return ctx.habits.find((habit) => /зал|тренир/.test(normalizeText(habit.name))) ?? null;
  }
  return (
    ctx.habits.find((habit) =>
      normalizeText(habit.name)
        .split(" ")
        .some((word) => word.length > 4 && normalized.includes(word.slice(0, 5))),
    ) ?? null
  );
}

function areaBySlug(ctx: InterpContext, slug: string) {
  return ctx.areas.find((area) => area.slug === slug) ?? null;
}

function inferAreaId(ctx: InterpContext, text: string) {
  const normalized = normalizeText(text);
  const rules: [RegExp, string][] = [
    [/зал|тренир|здоров/, "health"],
    [/маркет|обучен|контент|\bai\b/, "learning"],
    [/отчет|платеж|постав|финанс|прибыл|расчет|бизнес/, "finance"],
    [/отдых|медитац|прогул|пляж|восстанов/, "mind"],
  ];
  for (const [pattern, slug] of rules) {
    if (pattern.test(normalized)) return areaBySlug(ctx, slug)?.id ?? null;
  }
  return null;
}

function monthGoalId(ctx: InterpContext, areaId: string | null) {
  if (!areaId) return null;
  return ctx.goals.find((goal) => goal.areaId === areaId && goal.horizon === "month")?.id ?? null;
}

function taskTitle(ctx: InterpContext, id: string) {
  return ctx.tasks.find((task) => task.id === id)?.title ?? "задача";
}

function ideaTitle(clause: string) {
  const withoutLead = clause.replace(/^.*?\bиде[яюи]\s+/i, "").replace(/^(придумал[аи]?|пришла|появилась)\s+/i, "");
  const title = withoutLead.replace(/[.]+$/g, "").trim() || clause.trim();
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function relatedIdea(ctx: InterpContext, title: string) {
  const words = normalizeText(title)
    .split(" ")
    .filter((word) => word.length > 4);
  let best: InterpContext["ideas"][number] | null = null;
  let score = 0;
  for (const idea of ctx.ideas) {
    const normalized = normalizeText(idea.title);
    const current = words.filter((word) => normalized.includes(word.slice(0, Math.min(6, word.length)))).length;
    if (current > score) {
      score = current;
      best = idea;
    }
  }
  return score >= 1 ? best : null;
}

function slotFor(ctx: InterpContext, day: string, duration: number) {
  const events = ctx.events.filter((event) => todayKey(new Date(event.startAt), ctx.tz) === day);
  const tasks = ctx.tasks
    .filter((task) => task.scheduledStart && task.scheduledEnd && todayKey(new Date(task.scheduledStart), ctx.tz) === day)
    .map((task) => ({ startAt: task.scheduledStart as string, endAt: task.scheduledEnd as string }));
  return findFreeSlots({ dayKey: day, tz: ctx.tz, events: [...events, ...tasks], durationMin: duration, limit: 1 })[0] ?? null;
}

function firstSlot(ctx: InterpContext, startDay: string, duration: number) {
  let day = startDay;
  for (let index = 0; index < 8; index++) {
    const slot = slotFor(ctx, day, duration);
    if (slot) return { day, slot };
    day = addDaysKey(day, 1, ctx.tz);
  }
  return null;
}

function habitPlan(ctx: InterpContext, habit: InterpContext["habits"][number], today: string, override?: { date: string; status: string }) {
  const logs = ctx.habitLogs
    .filter((log) => log.habitId === habit.id)
    .map((log) => (override && log.date === override.date ? { date: log.date, status: override.status } : log));
  if (override && !logs.some((log) => log.date === override.date)) logs.push(override);
  return reconcileHabit({
    monthDay: today,
    today,
    tz: ctx.tz,
    target: habit.targetCount,
    preferredGapDays: habit.preferredGapDays,
    logs,
  });
}

function dailyReply(ctx: InterpContext) {
  const today = todayKey(new Date(ctx.now), ctx.tz);
  const focus = buildDailyFocus({
    tasks: ctx.tasks,
    today,
    tz: ctx.tz,
    energy: ctx.energy,
    freeMinutes: ctx.freeMinutes,
  });
  if (!focus.items.length) return "На сегодня открытых задач нет. Можно отдохнуть или надиктовать, что появилось.";
  const lines = focus.items.map((item, index) => `${index + 1}. ${item.task.title} — ${item.reason}`);
  const tail = focus.overload
    ? `Свободного времени меньше, чем оценок всех задач (примерно на ${humanDuration(focus.overload.excessMinutes)}). Я не переношу их сама.`
    : `Свободно примерно ${humanDuration(ctx.freeMinutes)} между 8:00 и 20:00.`;
  return `${lines.join("\n")}\n\n${tail}`;
}

function hoursReply(ctx: InterpContext) {
  const learning = areaBySlug(ctx, "learning");
  const minutes = learning ? ctx.loggedMinutesByArea[learning.id] ?? 0 : 0;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `По выполненным задачам сферы «Обучение» в этом месяце учтено ${hours} ч (${minutes} мин). Это сумма оценок длительности, не трекер экрана. Если здесь ноль, записей просто нет — я не придумываю часы.`;
}

export function describeAction(action: Action, ctx: InterpContext) {
  switch (action.type) {
    case "completeTask":
      return `Отметить выполненной: ${taskTitle(ctx, action.taskId)}.`;
    case "completeHabit":
      return `Засчитать тренировку выполненной ${action.date}. В цель месяца она попадёт только после подтверждения.`;
    case "setHabitStatus":
      return action.status === "missed"
        ? `Отметить пропуск ${action.date}. Цель не уменьшается. Новые дни: ${(action.futureDates ?? []).join(", ") || "уточню при сохранении"}.`
        : `Обновить привычку ${action.date}: ${action.status}.`;
    case "rescheduleTask":
      return `Перенести «${taskTitle(ctx, action.taskId)}» на ${formatDayTime(action.start, ctx.tz)}–${formatTime(action.end, ctx.tz)}. ${action.reason}${action.requiresDecision ? " Задачу уже переносили несколько раз — выберите: перенести, сократить, делегировать или отменить." : ""}`;
    case "createIdea":
      return `Положить в банк идей, не в задачи: «${action.title}». ${action.recommendation ?? ""}`;
    case "createEvent":
      return `Добавить в локальный календарь: «${action.title}», ${formatDayTime(action.start, ctx.tz)}–${formatTime(action.end, ctx.tz)}.`;
    case "createTask":
      return `Создать задачу «${action.title}»${action.scheduledStart ? `, ${formatDayTime(action.scheduledStart, ctx.tz)}` : ""}.`;
    case "proposeScheduleChanges":
      return action.moves.map((move) => `Поставить «${taskTitle(ctx, move.taskId)}» на ${formatDayTime(move.start, ctx.tz)}–${formatTime(move.end, ctx.tz)}. ${move.reason}`).join(" ");
    case "cancelTask":
      return `Отменить задачу «${taskTitle(ctx, action.taskId)}».`;
    case "updateGoalProgress":
      return `Обновить показатель цели до ${action.value}. Название цели не меняется.`;
    case "startReflection":
      return "Начать рефлексию.";
    default:
      return "Изменение в приложении.";
  }
}

export function interpret(text: string, ctx: InterpContext): Interpretation {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return { reply: "Напишите или надиктуйте, что произошло и что хотите успеть.", actions: [], immediate: [] };
  const normalized = normalizeText(cleaned);
  const today = todayKey(new Date(ctx.now), ctx.tz);
  const now = new Date(ctx.now);

  if (/сколько часов/.test(normalized) && /обучен|уче|ai|практик/.test(normalized)) {
    return { reply: hoursReply(ctx), actions: [], immediate: [] };
  }
  if (/что (мне )?(сегодня )?делать|что из моих задач|наиболее важно|что сейчас важно/.test(normalized)) {
    return { reply: dailyReply(ctx), actions: [], immediate: [{ type: "generateDailyPlan" }] };
  }
  if (/рефлекс/.test(normalized) || /разбер[её]м день|итоги недели|итоги месяца/.test(normalized)) {
    let period: "day" | "week" | "month" | "quarter" | "year" = "day";
    if (/годов/.test(normalized)) period = "year";
    else if (/квартал/.test(normalized)) period = "quarter";
    else if (/месяц/.test(normalized)) period = "month";
    else if (/недел|воскрес|понедельнич/.test(normalized)) period = "week";
    else if (!/вечер|утр|день/.test(normalized)) {
      const dow = isoDow(today, ctx.tz);
      if (dow === 7 || dow === 1) period = "week";
    }
    const label = period === "week" ? "недельную" : period === "day" ? "короткую" : "большую";
    return {
      reply: `Начинаю ${label} рефлексию. Отвечайте свободно, можно голосом. Сохраню только ваши слова.`,
      actions: [],
      immediate: [{ type: "startReflection", period }],
    };
  }

  const clauses = splitClauses(cleaned);
  const actions: Action[] = [];
  const lines: string[] = [];
  let inheritedDay: string | null = null;

  for (const clause of clauses) {
    const day = extractDay(clause, today, ctx.tz, now);
    if (day) inheritedDay = day;
    const when = day ?? inheritedDay ?? today;
    const negated = isNegated(clause);
    const habit = findHabit(ctx, clause);
    const task = findTask(ctx.tasks, clause);
    const clock = extractClock(clause);
    const duration = extractDuration(clause);
    const ideaLike = /иде[яюи]|придумал|придумала/.test(normalizeText(clause));

    if (ideaLike) {
      const title = ideaTitle(clause);
      const areaId = inferAreaId(ctx, clause);
      const related = relatedIdea(ctx, title);
      actions.push({
        type: "createIdea",
        title,
        description: clause,
        areaId,
        goalId: monthGoalId(ctx, areaId),
        uncertainty: "high",
        nextStep: "Одним абзацем описать, зачем это сейчас, и решить, исследуем или оставляем в банке.",
        recommendation: "Это идея, не обязательство. В задачи и календарь её не ставлю.",
        relatedIdeaId: related?.id ?? null,
      });
      lines.push(related ? `Идея «${title}» похожа на «${related.title}». Могу сохранить рядом, без запуска.` : `Идея «${title}» пойдёт в банк, не в список на завтра.`);
      continue;
    }

    if (habit && /зал|тренир|привычк/.test(normalizeText(clause))) {
      const existing = ctx.habitLogs.find((log) => log.habitId === habit.id && log.date === when);
      if (!negated && /сходил|сходила|была|был|сделал|сделала|отметь|позанимал|выполнил/.test(normalizeText(clause))) {
        if (existing?.status === "done") {
          lines.push(`Тренировка ${when} уже отмечена выполненной. Повторно не считаю.`);
        } else {
          actions.push({ type: "completeHabit", habitId: habit.id, date: when, note: clause });
          lines.push(existing
            ? `Могу засчитать тренировку ${when}.`
            : `На ${when} тренировка не была запланирована. Могу засчитать внеплановое посещение, потому что вы сами это сказали.`);
        }
        continue;
      }
      if (negated) {
        if (!existing || existing.status === "done") {
          lines.push(existing?.status === "done"
            ? `Тренировка ${when} уже стоит как выполненная. Сама на пропуск не меняю.`
            : `На ${when} тренировки в расписании не было. Пропуск не создаю и цель не уменьшаю.`);
        } else {
          const plan = habitPlan(ctx, habit, today, { date: when, status: "missed" });
          actions.push({
            type: "setHabitStatus",
            habitId: habit.id,
            date: when,
            status: "missed",
            futureDates: plan.futureDates,
            note: plan.note,
          });
          lines.push(`Тренировку ${when} не засчитываю. ${plan.note}`);
        }
        continue;
      }
    }

    if (negated && task && /перенес|не успел|не успела|не сделал|не сделала|не закончил|не закончила/.test(normalizeText(clause))) {
      pushReschedule(ctx, actions, lines, task, when === today ? addDaysKey(today, 1, ctx.tz) : when, duration ?? task.estimateMinutes ?? 60, true);
      continue;
    }

    if (!negated && task && /успел|успела|сделал|сделала|закончил|закончила|закрыл|закрыла|готово/.test(normalizeText(clause))) {
      actions.push({ type: "completeTask", taskId: task.id });
      lines.push(`Нашла задачу «${task.title}» и могу отметить её выполненной.`);
      continue;
    }

    if (/перенес/.test(normalizeText(clause))) {
      if (!task) {
        lines.push("Не вижу, какую открытую задачу перенести. Ничего не двигаю.");
      } else {
        const target = day ?? addDaysKey(today, 1, ctx.tz);
        pushReschedule(ctx, actions, lines, task, target, duration ?? task.estimateMinutes ?? 60, true);
      }
      continue;
    }

    if (/мероприятие|встреч|созвон|пляж|поехать/.test(normalizeText(clause))) {
      const startClock = clock ?? "09:00";
      const minutes = /пляж/.test(normalizeText(clause)) ? duration ?? 180 : duration ?? 60;
      const start = zonedDate(when, startClock, ctx.tz);
      const end = new Date(start.getTime() + minutes * 60_000);
      const title = /пляж/.test(normalizeText(clause)) ? "Пляж" : /встреч|созвон/.test(normalizeText(clause)) ? "Встреча" : "Мероприятие";
      actions.push({
        type: "createEvent",
        title,
        start: start.toISOString(),
        end: end.toISOString(),
        notes: "Название можно поправить до подтверждения.",
        secondaryTz: /москв/.test(normalizeText(clause)) ? "Europe/Moscow" : null,
      });
      lines.push(`Могу поставить «${title}» на ${formatDayTime(start.toISOString(), ctx.tz)}. Это занятость в календаре, не регистрация.`);
      continue;
    }

    if (duration && /посвят|выдел|хочу|нужно|планир/.test(normalizeText(clause))) {
      const matched = task;
      const areaId = inferAreaId(ctx, clause);
      const found = firstSlot(ctx, when, duration);
      if (matched && found) {
        actions.push({
          type: "proposeScheduleChanges",
          moves: [{
            taskId: matched.id,
            start: found.slot.startAt,
            end: found.slot.endAt,
            reason: `Вы просили ${humanDuration(duration)}. Ставлю в свободный интервал, без новой задачи.`,
          }],
        });
        lines.push(`Нашла «${matched.title}» и свободное окно ${formatDayTime(found.slot.startAt, ctx.tz)}.`);
      } else if (found) {
        actions.push({
          type: "createTask",
          title: clause.replace(/[.]+$/g, "").trim(),
          estimateMinutes: duration,
          scheduledStart: found.slot.startAt,
          scheduledEnd: found.slot.endAt,
          areaId,
          goalId: monthGoalId(ctx, areaId),
          priority: "normal",
        });
        lines.push(`Отдельной задачи не нашла. Могу создать блок на ${humanDuration(duration)} в свободное окно.`);
      } else {
        lines.push("Свободного окна на этот блок в ближайшие дни не нашла. Ничего не ставлю поверх занятого времени.");
      }
      continue;
    }

    if (negated && task) {
      lines.push(`«${task.title}» остаётся открытой. Могу перенести, если скажете куда.`);
    }
  }

  if (!actions.length) {
    return {
      reply: lines.join(" ") || "Могу разложить это на задачи, идеи, календарь или рефлексию. Скажите чуть конкретнее, что изменить.",
      actions: [],
      immediate: [],
    };
  }

  return {
    reply: `${lines.join(" ")}\n\nНичего не сохраняю, пока не нажмёте «Подтвердить».`,
    actions,
    immediate: [],
  };
}

function pushReschedule(ctx: InterpContext, actions: Action[], lines: string[], task: InterpTask, day: string, duration: number, counts: boolean) {
  if (task.rescheduleCount >= 3) {
    const found = firstSlot(ctx, day, Math.min(duration, 45));
    if (!found) {
      lines.push(`«${task.title}» уже переносилась ${task.rescheduleCount} раза, а свободного окна нет. Выберите: сократить, делегировать или отменить.`);
      actions.push({
        type: "rescheduleTask",
        taskId: task.id,
        start: zonedDate(day, "09:00", ctx.tz).toISOString(),
        end: zonedDate(day, "09:45", ctx.tz).toISOString(),
        reason: "Автоматический перенос остановлен.",
        requiresDecision: true,
        countsAsReschedule: counts,
      });
      return;
    }
  }
  const found = firstSlot(ctx, day, duration);
  if (!found) {
    lines.push(`Для «${task.title}» нет свободного окна с ${day}. Не ставлю поверх других дел.`);
    return;
  }
  const requiresDecision = task.rescheduleCount >= 3;
  actions.push({
    type: "rescheduleTask",
    taskId: task.id,
    start: found.slot.startAt,
    end: found.slot.endAt,
    reason: requiresDecision
      ? `Уже ${task.rescheduleCount} переносов. Следующий шаг только вашим выбором.`
      : `Свободное окно ${formatDayTime(found.slot.startAt, ctx.tz)}.`,
    requiresDecision,
    countsAsReschedule: counts,
  });
  lines.push(requiresDecision
    ? `«${task.title}» больше не переношу молча. Нужен выбор: перенести, сократить, делегировать или отменить.`
    : `«${task.title}» можно перенести на ${formatDayTime(found.slot.startAt, ctx.tz)}.`);
}

export function weeklyReply(ctx: InterpContext) {
  const today = todayKey(new Date(ctx.now), ctx.tz);
  const weekGoals = ctx.goals.filter((goal) => goal.horizon === "week").map((goal) => goal.title);
  const open = ctx.tasks.filter((task) => task.status === "open");
  const text = weekRecommendation({
    openCount: open.length,
    obligationCount: open.filter((task) => task.financialRisk || task.priority === "obligation").length,
    restPlanned: ctx.events.some((event) => /отдых|прогул|пляж/.test(normalizeText(event.title))),
    overdue: open.filter((task) => task.dueAt && todayKey(new Date(task.dueAt), ctx.tz) < today).length,
    energy: ctx.energy,
  });
  return { weekGoals, text, today };
}
