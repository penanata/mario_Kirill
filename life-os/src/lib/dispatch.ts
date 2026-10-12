import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { answerMessage, proposalView } from "@/lib/assistant";
import { applyProposal, cancelProposal } from "@/lib/apply";
import { reconcileHabit } from "@/lib/habits";
import { eventsToIcs } from "@/lib/ics";
import { buildDailyFocus } from "@/lib/priority";
import { energyFromText, REFLECTION_QUESTIONS, summarizeReflection } from "@/lib/reflection";
import { readCookie, signSession } from "@/lib/session";
import {
  clearDemo,
  createArea,
  createEvent,
  createGoal,
  createHabit,
  createIdea,
  createOpportunity,
  createProposal,
  createTask,
  deleteEvent,
  getTask,
  getUser,
  latestConversation,
  listEvents,
  listHabitLogs,
  listHabits,
  listMessages,
  listOpportunities,
  listPendingProposals,
  listTasks,
  loadContext,
  saveCheckin,
  saveReflection,
  updateEvent,
  updateGoal,
  updateIdea,
  updateOpportunity,
  updatePrefs,
  updateProposalActions,
  updateTask,
  updateUser,
  upsertHabitLog,
} from "@/lib/store";
import { connectIcloud, disconnectIcloud, publicIntegration, selectCalendar, syncIcloud } from "@/lib/sync";
import { extractEventFromHtml, fetchPublicHtml } from "@/lib/extract";
import { findFreeSlots, periodKey, todayKey, zonedDate } from "@/lib/time";
import type { Action } from "@/lib/types";
import { HttpError } from "@/lib/utils";

const title = z.string().trim().min(1, "Нужно название").max(200);
const text = z.string().trim().max(5000).optional().nullable();

async function body(req: Request) {
  try {
    return await req.json();
  } catch {
    throw new HttpError("Некорректный JSON");
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(result.error.issues.map((issue) => issue.message).join(". "));
  return result.data;
}

async function assertRequest(req: Request) {
  const password = process.env.LIFEOS_ACCESS_PASSWORD;
  if (!password) return;
  const token = readCookie(req.headers.get("cookie"), "lifeos_session");
  if (token !== (await signSession(password))) throw new HttpError("Нужен вход", 401);
}

export async function dispatch(req: Request, slug: string[]) {
  try {
    const key = slug.join("/");
    if (key !== "auth/login" && key !== "health") await assertRequest(req);
    const result = await route(req, slug);
    if (result instanceof Response) return result;
    return NextResponse.json(result ?? { ok: true });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Проверьте поля" }, { status: 400 });
    console.error(error);
    const message = error instanceof Error ? error.message : "Внутренняя ошибка";
    const status = /iCloud|пароль приложения|недоступен/i.test(message) ? 502 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

async function route(req: Request, slug: string[]): Promise<unknown> {
  const [a, b, c] = slug;
  const method = req.method;
  const url = new URL(req.url);

  if (a === "health" && method === "GET") return { ok: true };
  if (a === "auth" && b === "login" && method === "POST") return login(req);
  if (a === "auth" && b === "logout" && method === "POST") return logout();

  if (a === "tasks" && !b && method === "GET") return { tasks: listTasks() };
  if (a === "tasks" && !b && method === "POST") {
    const input = parse(z.object({
      title,
      notes: text,
      goalId: z.string().nullable().optional(),
      areaId: z.string().nullable().optional(),
      priority: z.enum(["low", "normal", "high", "obligation"]).optional(),
      estimateMinutes: z.number().int().positive().max(24 * 60).nullable().optional(),
      dueAt: z.string().nullable().optional(),
      scheduledStart: z.string().nullable().optional(),
      scheduledEnd: z.string().nullable().optional(),
      financialRisk: z.boolean().optional(),
      outcome: text,
    }), await body(req));
    return createTask(input);
  }
  if (a === "tasks" && b && c === "complete" && method === "POST") {
    const task = getTask(b);
    if (task.status === "done") return { task, duplicate: true };
    return { task: updateTask(b, { status: "done", completedAt: new Date().toISOString() }) };
  }
  if (a === "tasks" && b && !c && method === "PATCH") {
    const patch = await body(req) as Record<string, unknown>;
    if (patch.scheduledStart && patch.rescheduleCount === undefined) {
      const task = getTask(b);
      if (task.scheduledStart && task.scheduledStart !== patch.scheduledStart) {
        if (task.rescheduleCount >= 3) throw new HttpError("Эту задачу уже переносили три раза. Дальше только через ассистента: сократить, делегировать или отменить.");
        patch.rescheduleCount = task.rescheduleCount + 1;
      }
    }
    return { task: updateTask(b, patch) };
  }
  if (a === "tasks" && b && !c && method === "DELETE") return { task: updateTask(b, { status: "cancelled" }) };

  if (a === "goals" && !b && method === "GET") return { goals: [] };
  if (a === "goals" && !b && method === "POST") {
    const input = parse(z.object({
      title,
      horizon: z.enum(["life", "year", "quarter", "month", "week"]),
      areaId: z.string().nullable().optional(),
      parentId: z.string().nullable().optional(),
      description: text,
      metricName: z.string().max(80).nullable().optional(),
      metricTarget: z.number().positive().nullable().optional(),
      metricMode: z.enum(["none", "manual", "habit", "task_minutes"]).optional(),
      unit: z.string().max(20).nullable().optional(),
    }), await body(req));
    return { goal: createGoal(input) };
  }
  if (a === "goals" && b && method === "PATCH") return { goal: updateGoal(b, await body(req)) };
  if (a === "areas" && method === "POST") {
    const input = parse(z.object({ name: title, description: text }), await body(req));
    return { area: createArea({ name: input.name, description: input.description ?? undefined }) };
  }

  if (a === "events" && !b && method === "GET") return { events: listEvents(url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined) };
  if (a === "events" && !b && method === "POST") {
    const input = parse(z.object({
      title,
      startAt: z.string().min(8),
      endAt: z.string().min(8),
      notes: text,
      location: text,
      secondaryTz: z.string().nullable().optional(),
      pushToIcloud: z.boolean().optional(),
      groupKey: z.enum(["sport", "learning", "work", "personal", "relationships"]).optional(),
    }), await body(req));
    return createEvent({ ...input, syncState: input.pushToIcloud ? "pending_push" : "local" });
  }
  if (a === "events" && b && method === "PATCH") return { event: updateEvent(b, await body(req)) };
  if (a === "events" && b && method === "DELETE") return deleteEvent(b);

  if (a === "ideas" && !b && method === "POST") {
    const input = parse(z.object({
      title,
      description: text,
      areaId: z.string().nullable().optional(),
      goalId: z.string().nullable().optional(),
      status: z.enum(["new", "research", "planned", "experiment", "deferred", "rejected", "done"]).optional(),
      uncertainty: z.enum(["low", "medium", "high"]).nullable().optional(),
      nextStep: text,
      valueNote: text,
      timeCost: text,
      moneyCost: text,
      confirmed: z.boolean().optional(),
    }), await body(req));
    return createIdea(input);
  }
  if (a === "ideas" && b && method === "PATCH") return { idea: updateIdea(b, await body(req)) };

  if (a === "habits" && !b && method === "POST") {
    const input = parse(z.object({
      name: title,
      targetCount: z.number().int().positive().max(100),
      preferredGapDays: z.number().int().min(0).max(6).optional(),
      areaId: z.string().nullable().optional(),
      goalId: z.string().nullable().optional(),
    }), await body(req));
    return { habit: createHabit(input) };
  }
  if (a === "habits" && b && c === "log" && method === "POST") {
    const input = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(["planned", "done", "missed", "rescheduled"]) }), await body(req));
    return { log: upsertHabitLog(b, input.date, input.status) };
  }
  if (a === "habits" && b && c === "miss" && method === "POST") return proposeMiss(b, await body(req));

  if (a === "reflections" && method === "POST") return saveReflectionRequest(await body(req));
  if (a === "checkins" && method === "POST") {
    const input = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), energy: z.number().int().min(1).max(5), note: text }), await body(req));
    return { checkin: saveCheckin(input.date, input.energy, input.note ?? undefined) };
  }

  if (a === "ai" && b === "chat" && method === "POST") {
    const input = parse(z.object({ message: z.string().trim().min(1, "Напишите сообщение").max(4000), conversationId: z.string().optional() }), await body(req));
    return answerMessage(input.conversationId, input.message);
  }
  if (a === "ai" && b === "history" && method === "GET") return history();
  if (a === "ai" && b === "transcribe" && method === "POST") return transcribe(req);
  if (a === "ai" && b === "proposals" && c && slug[3] === "confirm" && method === "POST") return applyProposal(c);
  if (a === "ai" && b === "proposals" && c && slug[3] === "cancel" && method === "POST") return cancelProposal(c);
  if (a === "ai" && b === "proposals" && c && method === "PATCH") {
    const input = parse(z.object({ actions: z.array(z.record(z.any())).min(1) }), await body(req));
    const proposal = updateProposalActions(c, input.actions);
    return proposalView(proposal.id);
  }

  if (a === "schedule" && b === "slots" && method === "GET") return slots(url);
  if (a === "plan" && method === "POST") return plan(await body(req));
  if (a === "calendar" && b === "export" && method === "GET") return exportIcs();

  if (a === "integrations" && b === "caldav" && !c && method === "GET") return publicIntegration();
  if (a === "integrations" && b === "caldav" && !c && method === "POST") {
    const input = parse(z.object({
      appleId: z.string().trim().email("Нужен Apple ID, обычно это email"),
      appPassword: z.string().trim().min(4, "Нужен пароль приложения Apple").max(200),
    }), await body(req));
    return connectIcloud(input.appleId, input.appPassword);
  }
  if (a === "integrations" && b === "caldav" && !c && method === "DELETE") return disconnectIcloud();
  if (a === "integrations" && b === "caldav" && c === "sync" && method === "POST") return syncIcloud();
  if (a === "integrations" && b === "caldav" && c === "calendar" && method === "POST") {
    const input = parse(z.object({ href: z.string().url() }), await body(req));
    return selectCalendar(input.href);
  }

  if (a === "opportunities" && !b && method === "POST") {
    const input = parse(z.object({
      title,
      description: text,
      url: z.string().url().nullable().optional(),
      startAt: z.string().nullable().optional(),
      endAt: z.string().nullable().optional(),
      location: text,
      price: text,
      why: text,
      needsRegistration: z.boolean().optional(),
      registered: z.boolean().optional(),
    }), await body(req));
    return { item: createOpportunity(input) };
  }
  if (a === "opportunities" && b === "import" && method === "POST") return importOpportunity(await body(req));
  if (a === "opportunities" && b && c === "schedule" && method === "POST") return scheduleOpportunity(b);
  if (a === "opportunities" && b && method === "PATCH") return { item: updateOpportunity(b, await body(req)) };

  if (a === "settings" && method === "GET") return { ok: true };
  if (a === "settings" && method === "PATCH") return updateSettings(await body(req));
  if (a === "settings" && b === "demo" && method === "DELETE") return clearDemo();

  throw new HttpError("Маршрут не найден", 404);
}

async function login(req: Request) {
  const password = process.env.LIFEOS_ACCESS_PASSWORD;
  if (!password) return { ok: true, open: true };
  const input = parse(z.object({ password: z.string().min(1, "Введите пароль") }), await body(req));
  if (input.password !== password) throw new HttpError("Пароль не подошёл", 401);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("lifeos_session", await signSession(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
  return response;
}

function logout() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("lifeos_session", "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}

function history() {
  const conversation = latestConversation();
  const messages = listMessages(conversation.id);
  const ctx = loadContext();
  const pending = proposalViewSafe(conversation.id, ctx);
  return { conversation, messages, pending };
}

function proposalViewSafe(conversationId: string, ctx: ReturnType<typeof loadContext>) {
  return listPendingProposals()
    .filter((item) => item.conversationId === conversationId)
    .map((item) => proposalView(item.id, ctx));
}

async function transcribe(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    throw new HttpError("Серверная расшифровка выключена: нет OPENAI_API_KEY. Кнопка микрофона использует распознавание браузера, если оно есть.");
  }
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) throw new HttpError("Нет аудио");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const result = await client.audio.transcriptions.create({ file: audio, model: "whisper-1", language: "ru" });
  return { text: result.text };
}

function slots(url: URL) {
  const date = url.searchParams.get("date");
  const minutes = Number(url.searchParams.get("minutes") || 60);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError("Нужна дата");
  const user = getUser();
  const spanStart = zonedDate(date, "00:00", user.timezone).toISOString();
  const spanEnd = zonedDate(date, "23:59", user.timezone).toISOString();
  const events = listEvents(spanStart, spanEnd);
  const found = findFreeSlots({
    dayKey: date,
    tz: user.timezone,
    durationMin: Math.min(Math.max(minutes, 15), 480),
    events: events.map((event) => ({ startAt: event.startAt, endAt: event.endAt })),
    limit: 4,
  });
  return { slots: found };
}

async function plan(input: unknown) {
  const kind = parse(z.object({ kind: z.enum(["relief", "day", "week"]) }), input).kind;
  const ctx = loadContext();
  const today = todayKey(new Date(), ctx.tz);
  const focus = buildDailyFocus({ tasks: ctx.tasks, today, tz: ctx.tz, energy: ctx.energy, freeMinutes: ctx.freeMinutes });
  if (kind === "relief") {
    if (!focus.overload) return { reply: "Свободного времени хватает на открытые оценки. Ничего не переношу.", proposal: null };
    const actions: Action[] = [];
    for (const suggestion of focus.overload.suggestions) {
      const task = ctx.tasks.find((item) => item.id === suggestion.taskId);
      if (!task) continue;
      actions.push({
        type: "rescheduleTask",
        taskId: task.id,
        start: zonedDate(today, "09:00", ctx.tz).toISOString(),
        end: zonedDate(today, "10:00", ctx.tz).toISOString(),
        reason: suggestion.reason,
        countsAsReschedule: true,
        requiresDecision: task.rescheduleCount >= 3,
      });
    }
    const local = await import("@/lib/parser");
    const better = local.interpret(`Перенеси ${focus.overload.suggestions.map((item) => item.title).join(", ")} на завтра`, ctx);
    const proposal = createProposal({
      summary: "На сегодня задач больше, чем свободного времени. Это предложение, не автоматический перенос.",
      actions: better.actions.length ? better.actions : actions,
    });
    return { proposal: proposalView(proposal.id, ctx) };
  }
  return { reply: focus.items.map((item) => item.reason).join("\n"), proposal: null };
}

function exportIcs() {
  const events = listEvents();
  const ics = eventsToIcs(events.map((event) => ({ uid: event.externalUid || `${event.id}@lifeos.local`, title: event.title, notes: event.notes, location: event.location, startAt: event.startAt, endAt: event.endAt })));
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "attachment; filename=life-os.ics",
    },
  });
}

async function proposeMiss(habitId: string, input: unknown) {
  const date = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), input).date;
  const habit = listHabits().find((item) => item.id === habitId);
  if (!habit) throw new HttpError("Привычка не найдена", 404);
  const existing = listHabitLogs(habit.id, date, date)[0];
  if (existing?.status === "done") throw new HttpError("Этот день уже засчитан выполненным. Сама на пропуск не меняю.");
  const ctx = loadContext();
  const boundsStart = `${date.slice(0, 7)}-01`;
  const logs = listHabitLogs(habit.id, boundsStart, `${date.slice(0, 7)}-31`).map((log) => (log.date === date ? { ...log, status: "missed" } : log));
  const plan = reconcileHabit({
    monthDay: date,
    today: todayKey(new Date(), ctx.tz),
    tz: ctx.tz,
    target: habit.targetCount,
    preferredGapDays: habit.preferredGapDays,
    logs,
  });
  const proposal = createProposal({
    summary: `Пропуск ${date} не уменьшает цель ${habit.targetCount}. Новое расписание нужно подтвердить.`,
    actions: [{ type: "setHabitStatus", habitId, date, status: "missed", futureDates: plan.futureDates, note: plan.note }],
  });
  return { note: plan.note, proposal: proposalView(proposal.id, ctx) };
}

function saveReflectionRequest(input: unknown) {
  const parsed = parse(z.object({
    period: z.enum(["day", "week", "month", "quarter", "year"]),
    periodKey: z.string().regex(/^\d{4}(-\d{2}(-\d{2})?|-W\d{2}|-Q[1-4])?$/).optional(),
    answers: z.record(z.string().max(5000)),
  }), input);
  const tz = getUser().timezone;
  const today = todayKey(new Date(), tz);
  const summary = summarizeReflection(parsed.period, parsed.answers);
  const energy = energyFromText(parsed.answers.feeling) ?? energyFromText(parsed.answers.energy) ?? energyFromText(parsed.answers.state);
  const saved = saveReflection({
    period: parsed.period,
    periodKey: parsed.periodKey || periodKey(today, parsed.period, tz),
    answers: parsed.answers,
    summary,
    energy,
  });
  return { reflection: saved, summary, questions: REFLECTION_QUESTIONS[parsed.period] };
}

async function importOpportunity(input: unknown) {
  const url = parse(z.object({ url: z.string().url("Нужна ссылка") }), input).url;
  const page = await fetchPublicHtml(url);
  const extracted = extractEventFromHtml(page.html);
  return { url: page.url, extracted };
}

function scheduleOpportunity(id: string) {
  const item = listOpportunities().find((entry) => entry.id === id);
  if (!item) throw new HttpError("Мероприятие не найдено", 404);
  if (!item.startAt) throw new HttpError("Сначала укажите дату и время. Без них в календарь не ставлю.");
  const end = item.endAt || new Date(new Date(item.startAt).getTime() + 60 * 60_000).toISOString();
  const created = createEvent({
    title: item.title,
    startAt: item.startAt,
    endAt: end,
    location: item.location,
    notes: item.needsRegistration && !item.registered ? "В календаре как занятость. Регистрация на мероприятие отдельно и пока не отмечена." : item.description,
  });
  const updated = updateOpportunity(id, { status: "scheduled", calendarEventId: created.event.id });
  return { item: updated, event: created.event, duplicate: created.duplicate, registered: updated.registered };
}

function updateSettings(input: unknown) {
  const parsed = parse(z.object({
    name: z.string().trim().max(80).optional(),
    timezone: z.string().min(3).max(64).optional(),
    dailyReflectionEnabled: z.boolean().optional(),
    dailyReflectionTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    weeklyReflectionEnabled: z.boolean().optional(),
    weeklyReflectionWeekday: z.number().int().min(0).max(6).optional(),
    weeklyReflectionTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    habitReminderEnabled: z.boolean().optional(),
  }), input);
  if (parsed.name !== undefined || parsed.timezone !== undefined) updateUser({ name: parsed.name, timezone: parsed.timezone });
  updatePrefs(parsed);
  return { ok: true };
}
