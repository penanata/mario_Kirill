import { reconcileHabit } from "@/lib/habits";
import { buildDailyFocus, weekRecommendation } from "@/lib/priority";
import {
  getIntegration,
  getPrefs,
  getUser,
  hasDemo,
  listAreas,
  listEvents,
  listGoals,
  listHabitLogs,
  listHabits,
  listIdeas,
  listReflections,
  listTasks,
  loadContext,
  type GoalRow,
  type TaskRow,
} from "@/lib/store";
import {
  addDaysKey,
  daySpan,
  eachDay,
  formatDualTime,
  formatLongDate,
  formatShortDate,
  formatTime,
  freeMinutes,
  greeting,
  humanDuration,
  isoDow,
  monthBounds,
  todayKey,
  weekRange,
  weekdayName,
} from "@/lib/time";

function goalRatio(goal: GoalRow, tasks: TaskRow[], doneHabit: number | null) {
  if (goal.metricMode === "habit" && goal.metricTarget) {
    const done = doneHabit ?? 0;
    return {
      ratio: Math.max(0, Math.min(1, done / goal.metricTarget)),
      detail: `${done} из ${goal.metricTarget} ${goal.unit ?? "раз"}`.trim(),
    };
  }
  if (goal.metricMode === "task_minutes" && goal.metricTarget) {
    const minutes = tasks
      .filter((task) => task.status === "done" && (task.goalId === goal.id || task.areaId === goal.areaId))
      .reduce((sum, task) => sum + (task.estimateMinutes ?? 0), 0);
    const hours = Math.round((minutes / 60) * 10) / 10;
    return {
      ratio: Math.max(0, Math.min(1, hours / goal.metricTarget)),
      detail: `${hours} из ${goal.metricTarget} ч по оценкам выполненных задач`,
    };
  }
  if (goal.metricMode === "manual" && goal.metricTarget) {
    const current = goal.metricCurrent ?? 0;
    return { ratio: Math.max(0, Math.min(1, current / goal.metricTarget)), detail: `${current} из ${goal.metricTarget} ${goal.unit ?? ""}`.trim() };
  }
  const linked = tasks.filter((task) => task.goalId === goal.id && task.status !== "cancelled");
  if (!linked.length) return { ratio: null, detail: "Пока нет измеримого показателя" };
  const done = linked.filter((task) => task.status === "done").length;
  return { ratio: done / linked.length, detail: `По задачам: ${done} из ${linked.length}` };
}

export function getDashboard() {
  const user = getUser();
  const tz = user.timezone;
  const now = new Date();
  const today = todayKey(now, tz);
  const ctx = loadContext();
  const tasks = listTasks();
  const goals = listGoals();
  const areas = listAreas();
  const habits = listHabits();
  const bounds = monthBounds(today);
  const week = weekRange(today, tz);
  const weekDays = eachDay(week.start, week.end, tz);
  const span = daySpan(today, tz);
  const weekStart = daySpan(week.start, tz).start;
  const weekEnd = daySpan(addDaysKey(week.end, 1, tz), tz).start;
  const events = listEvents(weekStart, weekEnd);
  const todayEvents = events.filter((event) => event.startAt < span.end && event.endAt > span.start);
  const focus = buildDailyFocus({
    tasks: ctx.tasks,
    today,
    tz,
    energy: ctx.energy,
    freeMinutes: ctx.freeMinutes,
  });
  const gym = habits.find((habit) => /зал|тренир/i.test(habit.name)) ?? habits[0] ?? null;
  const gymLogs = gym ? listHabitLogs(gym.id, bounds.start, bounds.end) : [];
  const gymPlan = gym
    ? reconcileHabit({ monthDay: today, today, tz, target: gym.targetCount, preferredGapDays: gym.preferredGapDays, logs: gymLogs })
    : null;
  const monthGoals = goals
    .filter((goal) => goal.horizon === "month" && goal.status === "active")
    .map((goal) => {
      const area = areas.find((item) => item.id === goal.areaId);
      const progress = goalRatio(goal, tasks, goal.metricMode === "habit" ? gymPlan?.doneCount ?? null : null);
      return { id: goal.id, title: goal.title, area: area?.name ?? "Без сферы", color: area?.color ?? "#6b6560", isDemo: goal.isDemo, ...progress };
    });
  const ideas = listIdeas();
  const integration = getIntegration();
  const prefs = getPrefs();
  const reflections = listReflections();
  const dow = isoDow(today, tz);
  const weeklyDay = prefs.weeklyReflectionWeekday === 0 ? 7 : prefs.weeklyReflectionWeekday;
  let reminder: { kind: "day" | "week"; text: string } | null = null;
  if (prefs.weeklyReflectionEnabled && dow === weeklyDay && !reflections.some((item) => item.period === "week" && item.periodKey === week.key)) {
    reminder = { kind: "week", text: "Сегодня день недельной рефлексии. Это напоминание внутри приложения: фоновые уведомления не настроены." };
  } else if (prefs.dailyReflectionEnabled && !reflections.some((item) => item.period === "day" && item.periodKey === today)) {
    reminder = { kind: "day", text: "Можно коротко закрыть день. Напоминание видно только пока приложение открыто." };
  }
  const rest = events.filter((event) => /обед|прогул|пляж|отдых|йога|медитац/i.test(event.title));
  const open = tasks.filter((task) => task.status === "open");
  const doneWeek = tasks.filter((task) => task.status === "done" && task.completedAt && todayKey(new Date(task.completedAt), tz) >= week.start && todayKey(new Date(task.completedAt), tz) <= week.end);
  return {
    tz,
    name: user.name,
    greeting: greeting(now, tz),
    heading: formatLongDate(today, tz),
    today,
    freeMinutes: ctx.freeMinutes,
    freeLabel: humanDuration(freeMinutes(today, tz, todayEvents)),
    energy: ctx.energy,
    demo: hasDemo(),
    reminder,
    icloud: {
      status: integration?.status ?? "needs_setup",
      lastSyncAt: integration?.lastSyncAt ?? null,
      lastError: integration?.lastError ?? null,
      account: integration?.accountLabel ?? null,
    },
    focus: focus.items.map((item) => ({
      id: item.task.id,
      title: item.task.title,
      priority: item.task.priority,
      lane: item.lane,
      estimate: item.task.estimateMinutes,
      estimateLabel: humanDuration(item.task.estimateMinutes ?? 45),
      goal: item.task.goalTitle,
      outcome: tasks.find((task) => task.id === item.task.id)?.outcome ?? null,
      reason: item.reason,
      isDemo: tasks.find((task) => task.id === item.task.id)?.isDemo ?? false,
      status: item.task.status,
    })),
    overload: focus.overload
      ? { excessLabel: humanDuration(focus.overload.excessMinutes), suggestions: focus.overload.suggestions }
      : null,
    timeline: todayEvents.map((event) => ({
      id: event.id,
      title: event.title,
      start: formatTime(event.startAt, tz),
      end: formatTime(event.endAt, tz),
      startAt: event.startAt,
      endAt: event.endAt,
      secondary: event.secondaryTz ? formatDualTime(event.startAt, tz, event.secondaryTz) : null,
      location: event.location,
      isDemo: event.isDemo,
      taskId: event.taskId,
    })),
    weekStrip: weekDays.map((date) => ({
      date,
      weekday: weekdayName(date, tz, true),
      day: date.slice(-2).replace(/^0/, ""),
      count: events.filter((event) => todayKey(new Date(event.startAt), tz) === date).length,
      isToday: date === today,
    })),
    monthGoals,
    week: {
      outcomes: goals.filter((goal) => goal.horizon === "week" && goal.status === "active").map((goal) => ({ id: goal.id, title: goal.title, isDemo: goal.isDemo })),
      deadlines: open
        .filter((task) => task.dueAt && todayKey(new Date(task.dueAt), tz) <= week.end)
        .slice(0, 5)
        .map((task) => ({ id: task.id, title: task.title, due: formatShortDate(todayKey(new Date(task.dueAt!), tz)), isDemo: task.isDemo })),
      openCount: open.length,
      doneCount: doneWeek.length,
      rest: rest.map((event) => event.title),
      recommendation: weekRecommendation({
        openCount: open.length,
        obligationCount: open.filter((task) => task.financialRisk || task.priority === "obligation").length,
        restPlanned: rest.length > 0,
        overdue: open.filter((task) => task.dueAt && todayKey(new Date(task.dueAt), tz) < today).length,
        energy: ctx.energy,
      }),
    },
    globals: goals
      .filter((goal) => goal.horizon === "life")
      .map((goal) => ({ id: goal.id, title: goal.title, area: areas.find((area) => area.id === goal.areaId)?.name ?? "", isDemo: goal.isDemo })),
    ideas: {
      fresh: ideas.filter((idea) => idea.confirmed && idea.status === "new").length,
      deferred: ideas.filter((idea) => idea.confirmed && idea.status === "deferred").length,
      examples: ideas.filter((idea) => !idea.confirmed).length,
    },
    habit: gym && gymPlan
      ? {
          id: gym.id,
          name: gym.name,
          done: gymPlan.doneCount,
          target: gymPlan.target,
          note: gymPlan.note,
          forecast: gymPlan.forecast,
          isDemo: gym.isDemo,
        }
      : null,
    unscheduled: open
      .filter((task) => !task.scheduledStart)
      .slice(0, 6)
      .map((task) => ({ id: task.id, title: task.title, estimate: task.estimateMinutes, isDemo: task.isDemo })),
  };
}

export type DashboardData = ReturnType<typeof getDashboard>;

