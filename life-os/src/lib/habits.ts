import { addDaysKey, eachDay, monthBounds } from "@/lib/time";

export type HabitLogLike = { date: string; status: "planned" | "done" | "missed" | "rescheduled" | string };

export type HabitReconcile = {
  missedDates: string[];
  doneDates: string[];
  doneCount: number;
  target: number;
  remaining: number;
  daysLeft: number;
  futureDates: string[];
  forecast: "on_track" | "tight" | "short";
  note: string;
};

function greedyPick(days: string[], remaining: number, minIndexGap: number, maxRun: number) {
  const picked: string[] = [];
  let lastIndex = -999;
  let run = 0;
  for (let index = 0; index < days.length && picked.length < remaining; index++) {
    if (index - lastIndex < minIndexGap + 1 && lastIndex >= 0) continue;
    if (minIndexGap === 0 && run >= maxRun && index < days.length - (remaining - picked.length)) {
      continue;
    }
    picked.push(days[index]);
    if (lastIndex === index - 1) run += 1;
    else run = 1;
    lastIndex = index;
  }
  return picked;
}

export function planRemainingDates(days: string[], remaining: number, preferredGapDays: number) {
  if (remaining <= 0 || days.length === 0) return [];
  const minGap = Math.max(0, preferredGapDays);
  for (let gap = minGap; gap >= 1; gap--) {
    const picked = greedyPick(days, remaining, gap, 1);
    if (picked.length >= remaining) return picked.slice(0, remaining);
  }
  const withPairs = greedyPick(days, remaining, 0, 2);
  if (withPairs.length >= remaining) return withPairs.slice(0, remaining);
  return days.slice(0, remaining);
}

export function reconcileHabit(input: {
  monthDay: string;
  today: string;
  tz: string;
  target: number;
  preferredGapDays: number;
  logs: HabitLogLike[];
}): HabitReconcile {
  const bounds = monthBounds(input.monthDay);
  const days = eachDay(bounds.start, bounds.end, input.tz);
  const byDate = new Map(input.logs.map((log) => [log.date, log.status]));
  const missedDates = days.filter((day) => day < input.today && byDate.get(day) === "planned");
  const doneDates = days.filter((day) => byDate.get(day) === "done");
  const doneCount = doneDates.length;
  const remaining = Math.max(0, input.target - doneCount);
  const futurePool = days.filter((day) => day >= input.today && byDate.get(day) !== "done" && byDate.get(day) !== "missed");
  const daysLeft = days.filter((day) => day >= input.today).length;
  const futureDates = planRemainingDates(futurePool, remaining, input.preferredGapDays);
  let forecast: HabitReconcile["forecast"] = "on_track";
  let note = `Сделано ${doneCount} из ${input.target}. Цель месяца не уменьшается из-за пропуска.`;
  if (remaining === 0) {
    note = `Цель ${input.target} уже закрыта в этом месяце. Новые тренировки можно ставить для удовольствия, не для цифры.`;
  } else if (futureDates.length < remaining) {
    forecast = "short";
    note = `Сделано ${doneCount} из ${input.target}. Осталось ${remaining}, а свободных дней ${daysLeft}. В текущем месяце цель уже не набирается целиком — лучше честно снизить ожидание или перенести остаток решением, а не молчаливым переносом.`;
  } else if (remaining > Math.ceil(daysLeft / 2)) {
    forecast = "tight";
    const consecutive = futureDates.some((day, index) => index > 0 && futureDates[index - 1] && days.indexOf(day) - days.indexOf(futureDates[index - 1]) === 1);
    note = consecutive
      ? `Сделано ${doneCount} из ${input.target}. Чтобы успеть, в новом расписании есть соседние дни. Я не ставлю три дня подряд, пока хватает более мягкого ритма.`
      : `Сделано ${doneCount} из ${input.target}. Ритм плотнее, чем «через день», но восстановление ещё можно сохранить.`;
  } else {
    note = `Сделано ${doneCount} из ${input.target}. Осталось ${remaining} за ${daysLeft} дн. Ритм через день всё ещё реалистичен.`;
  }
  return { missedDates, doneDates, doneCount, target: input.target, remaining, daysLeft, futureDates, forecast, note };
}

export function shiftPlanAfterMiss(today: string, tz: string, futureDates: string[]) {
  return futureDates.filter((day) => day > today).concat(futureDates.includes(today) ? [] : []).filter((day, index, all) => all.indexOf(day) === index);
}

export function monthDays(monthDay: string, tz: string) {
  const bounds = monthBounds(monthDay);
  return eachDay(bounds.start, bounds.end, tz);
}

export function demoPastDoneDates(today: string, tz: string, target: number) {
  const bounds = monthBounds(today);
  const days = eachDay(bounds.start, bounds.end, tz);
  const past = days.filter((day) => day < today);
  const futureCapacity = planRemainingDates(
    days.filter((day) => day >= today),
    target,
    1,
  ).length;
  const pastBudget = Math.max(0, target - Math.min(target, futureCapacity));
  const everyOther = past.filter((_, index) => index % 2 === 0);
  return everyOther.slice(0, pastBudget);
}

export function initialMonthPlan(today: string, tz: string, target: number) {
  const done = new Set(demoPastDoneDates(today, tz, target));
  const logs = [...done].map((date) => ({ date, status: "done" as const }));
  const plan = reconcileHabit({
    monthDay: today,
    today,
    tz,
    target,
    preferredGapDays: 1,
    logs,
  });
  return { doneDates: [...done], plannedDates: plan.futureDates, note: plan.note };
}

export function addDaysSafe(day: string, amount: number, tz: string) {
  return addDaysKey(day, amount, tz);
}
