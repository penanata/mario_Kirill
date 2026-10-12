import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyProposal } from "@/lib/apply";
import { mapCaldavStatus, parseCalendarList, parseEventReport, parsePrincipal } from "@/lib/caldav";
import { closeDb } from "@/lib/db";
import { eventsToIcs, parseIcs } from "@/lib/ics";
import { planRemainingDates, reconcileHabit } from "@/lib/habits";
import { interpret } from "@/lib/parser";
import { buildDailyFocus } from "@/lib/priority";
import { summarizeReflection } from "@/lib/reflection";
import { createHabit, createProposal, createTask, getTask, listHabitLogs, listTasks, ready, updateTask, upsertHabitLog } from "@/lib/store";
import { findFreeSlots, formatTime, zonedDate } from "@/lib/time";
import type { InterpContext } from "@/lib/types";
import { fromZonedTime } from "date-fns-tz";

function ctx(partial: Partial<InterpContext> = {}): InterpContext {
  return {
    now: "2026-10-11T02:30:00.000Z",
    tz: "Asia/Bangkok",
    energy: null,
    freeMinutes: 400,
    tasks: [
      {
        id: "task_calc",
        title: "Расчёты для бизнеса",
        status: "open",
        estimateMinutes: 45,
        rescheduleCount: 0,
        goalId: "goal_fin",
        goalTitle: "Разобраться с обязательствами",
        areaId: "area_finance",
        dueAt: "2026-10-10T11:00:00.000Z",
        scheduledStart: null,
        scheduledEnd: null,
        financialRisk: false,
        priority: "high",
      },
      {
        id: "task_report",
        title: "Отчёт по обязательствам",
        status: "open",
        estimateMinutes: 60,
        rescheduleCount: 0,
        goalId: "goal_fin",
        goalTitle: "Разобраться с обязательствами",
        areaId: "area_finance",
        dueAt: "2026-10-11T11:00:00.000Z",
        scheduledStart: null,
        scheduledEnd: null,
        financialRisk: false,
        priority: "high",
      },
      {
        id: "task_ai",
        title: "Изучение AI-маркетинга",
        status: "open",
        estimateMinutes: 90,
        rescheduleCount: 0,
        goalId: "goal_learn",
        goalTitle: "Освоить AI-маркетинг",
        areaId: "area_learning",
        dueAt: null,
        scheduledStart: null,
        scheduledEnd: null,
        financialRisk: false,
        priority: "normal",
      },
      {
        id: "task_supply",
        title: "Разобраться с поставкой и платежом",
        status: "open",
        estimateMinutes: 50,
        rescheduleCount: 0,
        goalId: "goal_fin",
        goalTitle: "Разобраться с обязательствами",
        areaId: "area_finance",
        dueAt: "2026-10-14T11:00:00.000Z",
        scheduledStart: null,
        scheduledEnd: null,
        financialRisk: true,
        priority: "obligation",
      },
    ],
    habits: [{ id: "habit_gym", name: "Тренировка в зале", goalId: "goal_health", targetCount: 15, preferredGapDays: 1 }],
    habitLogs: [{ habitId: "habit_gym", date: "2026-10-11", status: "planned" }],
    events: [
      { id: "e1", title: "Обед и прогулка", startAt: "2026-10-11T05:30:00.000Z", endAt: "2026-10-11T06:20:00.000Z" },
    ],
    ideas: [{ id: "idea_ig", title: "Автоматическое производство Instagram-каруселей", status: "new" }],
    goals: [
      { id: "goal_fin", title: "Разобраться с обязательствами", horizon: "month", areaId: "area_finance", parentId: null, metricMode: "none" },
      { id: "goal_learn", title: "Освоить AI-маркетинг", horizon: "month", areaId: "area_learning", parentId: null, metricMode: "task_minutes" },
      { id: "goal_health", title: "15 тренировок за месяц", horizon: "month", areaId: "area_health", parentId: null, metricMode: "habit" },
    ],
    areas: [
      { id: "area_finance", name: "Финансы", slug: "finance" },
      { id: "area_learning", name: "Обучение", slug: "learning" },
      { id: "area_health", name: "Здоровье", slug: "health" },
      { id: "area_mind", name: "Ментальное", slug: "mind" },
    ],
    loggedMinutesByArea: { area_learning: 0 },
    ...partial,
  };
}

describe("time", () => {
  it("stores Bangkok 11:00 as 04:00Z and shows Moscow meetings in local time", () => {
    const start = zonedDate("2026-10-14", "11:00", "Asia/Bangkok");
    expect(start.toISOString()).toBe("2026-10-14T04:00:00.000Z");
    expect(formatTime(start.toISOString(), "Asia/Bangkok")).toBe("11:00");
    const moscow = fromZonedTime("2026-10-13 15:00:00", "Europe/Moscow");
    expect(formatTime(moscow.toISOString(), "Asia/Bangkok")).toBe("19:00");
    expect(formatTime(moscow.toISOString(), "Europe/Moscow")).toBe("15:00");
  });

  it("finds a free slot around lunch", () => {
    const slots = findFreeSlots({
      dayKey: "2026-10-11",
      tz: "Asia/Bangkok",
      durationMin: 60,
      events: [{ startAt: "2026-10-11T05:30:00.000Z", endAt: "2026-10-11T06:20:00.000Z" }],
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(formatTime(slots[0].startAt, "Asia/Bangkok")).toBe("08:00");
  });
});

describe("priority", () => {
  it("puts a financial obligation ahead of ordinary work", () => {
    const focus = buildDailyFocus({ tasks: ctx().tasks, today: "2026-10-11", tz: "Asia/Bangkok", energy: null, freeMinutes: 400 });
    expect(focus.items[0].task.id).toBe("task_supply");
    expect(focus.items[0].lane).toBe("obligation");
    expect(focus.items[0].reason).toMatch(/обязатель/);
  });
});

describe("parser scenarios", () => {
  it("A: proposes a completed workout and does not mark it done itself", () => {
    const result = interpret("Сегодня сходила в зал", ctx());
    expect(result.actions).toEqual([expect.objectContaining({ type: "completeHabit", habitId: "habit_gym", date: "2026-10-11" })]);
    expect(result.reply).toMatch(/не сохран|Подтвердить/i);
  });

  it("B: finds the report and proposes a later free slot", () => {
    const result = interpret("Не успела сделать отчёт, перенеси", ctx());
    const action = result.actions.find((item) => item.type === "rescheduleTask");
    expect(action).toMatchObject({ type: "rescheduleTask", taskId: "task_report" });
    if (action?.type === "rescheduleTask") expect(action.start > "2026-10-11T12:00:00.000Z").toBe(true);
  });

  it("C: puts an idea in the bank and does not create a task", () => {
    const result = interpret("Мне пришла идея создать AI-страницу про животных", ctx());
    expect(result.actions.some((action) => action.type === "createTask")).toBe(false);
    expect(result.actions[0]).toMatchObject({ type: "createIdea" });
    if (result.actions[0].type === "createIdea") expect(result.actions[0].title).toBe("Создать AI-страницу про животных");
  });

  it("splits a messy note into completion, miss, schedule, event and idea", () => {
    const base = ctx({
      habitLogs: [
        { habitId: "habit_gym", date: "2026-10-10", status: "planned" },
        { habitId: "habit_gym", date: "2026-10-11", status: "planned" },
      ],
    });
    const result = interpret(
      "Вчера я успела сделать расчёты для бизнеса, но не сходила в зал. Завтра хочу два часа посвятить маркетингу. В среду у меня мероприятие в 11:00. А ещё придумала идею автоматизировать Instagram-карусели.",
      base,
    );
    const types = result.actions.map((action) => action.type);
    expect(types).toContain("completeTask");
    expect(types).toContain("setHabitStatus");
    expect(types).toContain("proposeScheduleChanges");
    expect(types).toContain("createEvent");
    expect(types).toContain("createIdea");
    expect(types).not.toContain("createTask");
    const miss = result.actions.find((action) => action.type === "setHabitStatus");
    if (miss?.type === "setHabitStatus") {
      expect(miss.date).toBe("2026-10-10");
      expect(miss.status).toBe("missed");
      expect(miss.futureDates).not.toContain("2026-10-10");
    }
    const event = result.actions.find((action) => action.type === "createEvent");
    if (event?.type === "createEvent") {
      expect(formatTime(event.start, "Asia/Bangkok")).toBe("11:00");
      expect(event.start.startsWith("2026-10-14")).toBe(true);
    }
  });

  it("does not invent learning hours", () => {
    const result = interpret("Покажи, сколько часов я потратила на обучение за месяц", ctx());
    expect(result.actions).toHaveLength(0);
    expect(result.reply).toMatch(/0/);
    expect(result.reply).toMatch(/не придумываю/i);
  });

  it("stops silent reschedules after three moves", () => {
    const base = ctx();
    base.tasks = base.tasks.map((task) => (task.id === "task_ai" ? { ...task, rescheduleCount: 3 } : task));
    const result = interpret("Перенеси изучение AI на завтра", base);
    const action = result.actions.find((item) => item.type === "rescheduleTask");
    expect(action).toMatchObject({ requiresDecision: true });
  });
});

describe("habits", () => {
  it("does not shrink the monthly target when a workout is missed", () => {
    const logs = [
      { date: "2026-10-01", status: "done" },
      { date: "2026-10-03", status: "done" },
      { date: "2026-10-11", status: "planned" },
    ];
    const plan = reconcileHabit({
      monthDay: "2026-10-11",
      today: "2026-10-11",
      tz: "Asia/Bangkok",
      target: 15,
      preferredGapDays: 1,
      logs: logs.map((log) => (log.date === "2026-10-11" ? { ...log, status: "missed" } : log)),
    });
    expect(plan.target).toBe(15);
    expect(plan.doneCount).toBe(2);
    expect(plan.remaining).toBe(13);
    expect(plan.futureDates).not.toContain("2026-10-11");
    expect(plan.futureDates.length).toBeLessThanOrEqual(plan.daysLeft);
  });

  it("prefers a rest day between sessions", () => {
    const days = Array.from({ length: 10 }, (_, index) => `2026-10-${String(index + 12).padStart(2, "0")}`);
    const picked = planRemainingDates(days, 4, 1);
    expect(picked).toEqual(["2026-10-12", "2026-10-14", "2026-10-16", "2026-10-18"]);
  });
});

describe("reflection", () => {
  it("summarizes only what the person wrote", () => {
    const summary = summarizeReflection("day", { worked: "Закрыла расчёты", feeling: "" });
    expect(summary).toContain("Закрыла расчёты");
    expect(summary).not.toMatch(/устал|радост|энергичн/i);
  });
});

describe("ics and caldav", () => {
  it("round-trips an event and keeps the uid", () => {
    const ics = eventsToIcs([
      { uid: "abc@lifeos", title: "Пляж, утро", startAt: "2026-10-16T02:00:00.000Z", endAt: "2026-10-16T05:00:00.000Z", location: "Банг Тао" },
    ]);
    const parsed = parseIcs(ics);
    expect(parsed[0].uid).toBe("abc@lifeos");
    expect(parsed[0].title).toBe("Пляж, утро");
    expect(parsed[0].location).toBe("Банг Тао");
  });

  it("reads principal, calendars and events without duplicating the parser contract", () => {
    expect(parsePrincipal(`<multistatus xmlns="DAV:"><response><propstat><prop><current-user-principal><href>/1/principal/</href></current-user-principal></prop></propstat></response></multistatus>`)).toBe("/1/principal/");
    const calendars = parseCalendarList(`<multistatus><response><href>/cal/</href><propstat><prop><displayname>Дом</displayname><resourcetype><calendar/></resourcetype><supported-calendar-component-set><comp name="VEVENT"/></supported-calendar-component-set></prop></propstat></response></multistatus>`);
    expect(calendars[0]).toMatchObject({ name: "Дом" });
    const events = parseEventReport(`<multistatus><response><href>/cal/a.ics</href><propstat><prop><getetag>"1"</getetag><calendar-data>BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:uid-1\nSUMMARY:Встреча\nDTSTART:20261014T040000Z\nDTEND:20261014T050000Z\nEND:VEVENT\nEND:VCALENDAR</calendar-data></prop></propstat></response></multistatus>`);
    expect(events).toHaveLength(1);
    expect(events[0].event.uid).toBe("uid-1");
    expect(mapCaldavStatus(401)).toMatch(/пароль приложения/i);
  });
});

describe("database actions", () => {
  beforeEach(() => {
    process.env.LIFEOS_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "lifeos-")), "t.sqlite");
    process.env.LIFEOS_SKIP_SEED = "1";
    closeDb();
    ready();
  });
  afterEach(() => closeDb());

  it("confirms a workout and keeps the target at 15", () => {
    const habit = createHabit({ name: "Тренировка в зале", targetCount: 15, preferredGapDays: 1 });
    upsertHabitLog(habit.id, "2026-10-11", "planned");
    const proposal = createProposal({
      summary: "Засчитать зал",
      actions: [{ type: "completeHabit", habitId: habit.id, date: "2026-10-11" }],
    });
    const result = applyProposal(proposal.id);
    expect(result.lines.join(" ")).toMatch(/1 из 15/);
    expect(listHabitLogs(habit.id, "2026-10-01", "2026-10-31").find((log) => log.date === "2026-10-11")?.status).toBe("done");
  });

  it("does not duplicate an open task", () => {
    const first = createTask({ title: "Отчёт по обязательствам" });
    const second = createTask({ title: "Отчёт по обязательствам" });
    expect(second.duplicate).toBe(true);
    expect(second.task.id).toBe(first.task.id);
    expect(listTasks()).toHaveLength(1);
  });

  it("moves a task only after confirmation", () => {
    const created = createTask({ title: "Отчёт по обязательствам", estimateMinutes: 60 });
    const proposal = createProposal({
      summary: "Перенос",
      actions: [{
        type: "rescheduleTask",
        taskId: created.task.id,
        start: "2026-10-12T02:00:00.000Z",
        end: "2026-10-12T03:00:00.000Z",
        reason: "Свободное утро",
        countsAsReschedule: true,
      }],
    });
    expect(getTask(created.task.id).scheduledStart).toBeNull();
    applyProposal(proposal.id);
    expect(getTask(created.task.id).scheduledStart).toBe("2026-10-12T02:00:00.000Z");
    expect(getTask(created.task.id).rescheduleCount).toBe(1);
  });

  it("refuses another silent move after three reschedules", () => {
    const created = createTask({ title: "Изучение AI-маркетинга" });
    updateTask(created.task.id, { rescheduleCount: 3 });
    const proposal = createProposal({
      summary: "Ещё перенос",
      actions: [{
        type: "rescheduleTask",
        taskId: created.task.id,
        start: "2026-10-12T02:00:00.000Z",
        end: "2026-10-12T03:00:00.000Z",
        reason: "Стоп",
        requiresDecision: true,
      }],
    });
    expect(() => applyProposal(proposal.id)).toThrow(/Выберите/);
    expect(getTask(created.task.id).scheduledStart).toBeNull();
  });
});
