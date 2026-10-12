import { reconcileHabit } from "@/lib/habits";
import {
  getPrefs,
  getUser,
  hasDemo,
  listAreas,
  listAudit,
  listCheckins,
  listEvents,
  listGoals,
  listHabitLogs,
  listHabits,
  listIdeas,
  listOpportunities,
  listReflections,
  listTasks,
} from "@/lib/store";
import { publicIntegration } from "@/lib/sync";
import {
  addDaysKey,
  daySpan,
  eachDay,
  formatLongDate,
  monthBounds,
  todayKey,
  weekRange,
} from "@/lib/time";

export function getAppMeta() {
  const user = getUser();
  return { tz: user.timezone, name: user.name, today: todayKey(new Date(), user.timezone), demo: hasDemo() };
}

export function getTasksView() {
  const meta = getAppMeta();
  return { ...meta, tasks: listTasks(), goals: listGoals(), areas: listAreas() };
}

export function getGoalsView() {
  return { ...getAppMeta(), goals: listGoals(), areas: listAreas(), tasks: listTasks() };
}

export function getCalendarView(anchor?: string) {
  const meta = getAppMeta();
  const day = anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? anchor : meta.today;
  const month = monthBounds(day);
  const from = daySpan(addDaysKey(month.start, -7, meta.tz), meta.tz).start;
  const to = daySpan(addDaysKey(month.end, 8, meta.tz), meta.tz).start;
  return {
    ...meta,
    anchor: day,
    heading: formatLongDate(day, meta.tz),
    month,
    week: weekRange(day, meta.tz),
    events: listEvents(from, to),
    tasks: listTasks().filter((task) => task.status === "open"),
  };
}

export function getIdeasView() {
  return { ...getAppMeta(), ideas: listIdeas(), areas: listAreas(), goals: listGoals() };
}

export function getHabitsView() {
  const meta = getAppMeta();
  const bounds = monthBounds(meta.today);
  const habits = listHabits().map((habit) => {
    const logs = listHabitLogs(habit.id, bounds.start, bounds.end);
    const plan = reconcileHabit({
      monthDay: meta.today,
      today: meta.today,
      tz: meta.tz,
      target: habit.targetCount,
      preferredGapDays: habit.preferredGapDays,
      logs,
    });
    return { ...habit, logs, plan, days: eachDay(bounds.start, bounds.end, meta.tz) };
  });
  return { ...meta, monthLabel: bounds.label, habits };
}

export function getReflectionView() {
  const meta = getAppMeta();
  const bounds = monthBounds(meta.today);
  return {
    ...meta,
    reflections: listReflections(),
    weekKey: weekRange(meta.today, meta.tz).key,
    monthKey: meta.today.slice(0, 7),
    quarterKey: `${bounds.year}-Q${Math.floor((bounds.month - 1) / 3) + 1}`,
    yearKey: String(bounds.year),
    habitNote: getHabitsView().habits[0]?.plan.note ?? null,
  };
}

export function getOpportunitiesView() {
  return { ...getAppMeta(), items: listOpportunities() };
}

export function getSettingsView() {
  const user = getUser();
  return {
    user,
    prefs: getPrefs(),
    demo: hasDemo(),
    integration: publicIntegration(),
    audit: listAudit(30),
    ai: Boolean(process.env.OPENAI_API_KEY),
    auth: Boolean(process.env.LIFEOS_ACCESS_PASSWORD),
  };
}

export function getInsightsView() {
  const meta = getAppMeta();
  const bounds = monthBounds(meta.today);
  const tasks = listTasks().filter((task) => task.status === "done" && task.completedAt && task.completedAt.slice(0, 7) === meta.today.slice(0, 7));
  const areas = listAreas();
  const byArea = areas.map((area) => ({
    id: area.id,
    name: area.name,
    color: area.color,
    minutes: tasks.filter((task) => task.areaId === area.id).reduce((sum, task) => sum + (task.estimateMinutes ?? 0), 0),
  }));
  const checkins = listCheckins(bounds.start, bounds.end);
  const habits = getHabitsView().habits;
  return { ...meta, byArea, checkins, habits, monthLabel: bounds.label };
}
