import { eventGroup, GROUPS, groupFromSlug } from "@/lib/groups";
import { reconcileHabit } from "@/lib/habits";
import { buildDailyFocus, weekRecommendation } from "@/lib/priority";
import { dueReflection } from "@/lib/reflection";
import {
  getPrefs,
  getUser,
  hasDemo,
  listAreas,
  listEvents,
  listGoals,
  listHabitLogs,
  listHabits,
  listIdeas,
  listOpportunities,
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
      detail: `${done}/${goal.metricTarget}`,
    };
  }
  if (goal.metricMode === "task_minutes" && goal.metricTarget) {
    const minutes = tasks
      .filter((task) => task.status === "done" && (task.goalId === goal.id || task.areaId === goal.areaId))
      .reduce((sum, task) => sum + (task.estimateMinutes ?? 0), 0);
    const hours = Math.round((minutes / 60) * 10) / 10;
    return {
      ratio: Math.max(0, Math.min(1, hours / goal.metricTarget)),
      detail: `${hours}/${goal.metricTarget} ч`,
    };
  }
  if (goal.metricMode === "manual" && goal.metricTarget) {
    const current = goal.metricCurrent ?? 0;
    return { ratio: Math.max(0, Math.min(1, current / goal.metricTarget)), detail: `${current}/${goal.metricTarget}` };
  }
  const linked = tasks.filter((task) => task.goalId === goal.id && task.status !== "cancelled");
  if (!linked.length) return { ratio: null, detail: "" };
  const done = linked.filter((task) => task.status === "done").length;
  return { ratio: done / linked.length, detail: `${done}/${linked.length}` };
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
  const prefs = getPrefs();
  const reflections = listReflections();
  const reflection = dueReflection({
    now,
    tz,
    today,
    reflections,
    dailyEnabled: prefs.dailyReflectionEnabled,
    weeklyEnabled: prefs.weeklyReflectionEnabled,
  });
  const suggestions = listOpportunities()
    .filter((item) => item.status === "suggested" && item.startAt)
    .slice(0, 3)
    .map((item) => {
      const group = eventGroup({ title: item.title });
      return {
        id: item.id,
        title: item.title,
        location: item.location,
        start: formatTime(item.startAt!, tz),
        day: formatShortDate(todayKey(new Date(item.startAt!), tz)),
        isDemo: item.isDemo,
        color: GROUPS[group].color,
      };
    });
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
    weekday: weekdayName(today, tz),
    dayNumber: today.slice(-2).replace(/^0/, ""),
    monthName: (formatLongDate(today, tz).split(", ")[1] ?? "").replace(/^\d+\s/, "").replace(/\s\d{4}$/, ""),
    reflection,
    suggestions,
    focus: focus.items.map((item) => {
      const task = tasks.find((entry) => entry.id === item.task.id);
      const area = areas.find((entry) => entry.id === task?.areaId);
      const group = groupFromSlug(area?.slug) ?? eventGroup({ title: item.task.title });
      return {
        id: item.task.id,
        title: item.task.title,
        priority: item.task.priority,
        lane: item.lane,
        estimate: item.task.estimateMinutes,
        estimateLabel: humanDuration(item.task.estimateMinutes ?? 45),
        goal: item.task.goalTitle,
        reason: item.reason,
        isDemo: task?.isDemo ?? false,
        status: item.task.status,
        color: GROUPS[group].color,
      };
    }),
    overload: focus.overload
      ? { excessLabel: humanDuration(focus.overload.excessMinutes), suggestions: focus.overload.suggestions }
      : null,
    timeline: todayEvents.map((event) => {
      const group = eventGroup(event);
      return {
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
        color: GROUPS[group].color,
      };
    }),
    weekStrip: weekDays.map((date) => ({
      date,
      weekday: weekdayName(date, tz, true),
      day: date.slice(-2).replace(/^0/, ""),
      colors: [...new Set(events.filter((event) => todayKey(new Date(event.startAt), tz) === date).map((event) => GROUPS[eventGroup(event)].color))].slice(0, 4),
      isToday: date === today,
    })),
    monthGoals: monthGoals.map((goal) => {
      const area = areas.find((item) => item.name === goal.area);
      const group = groupFromSlug(area?.slug) ?? "personal";
      return { ...goal, color: GROUPS[group].color, area: GROUPS[group].label };
    }),
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

