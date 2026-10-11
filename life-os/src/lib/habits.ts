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

function pickWithStep(days: string[], remaining: number, step: number) {
  const picked: string[] = [];
  for (let index = 0; index < days.length && picked.length < remaining; index += step) picked.push(days[index]);
  return picked;
}

export function planRemainingDates(days: string[], remaining: number, preferredGapDays: number) {
  if (remaining <= 0 || days.length === 0) return [];
  if (remaining >= days.length) return days.slice();
  const preferred = pickWithStep(days, remaining, Math.max(1, preferredGapDays + 1));
  if (preferred.length >= remaining) return preferred.slice(0, remaining);
  const paired: string[] = [];
  let index = 0;
  while (index < days.length && paired.length < remaining) {
    paired.push(days[index]);
    const run = paired.length % 3;
    index += run === 0 ? 2 : 1;
  }
  if (paired.length >= remaining) return paired.slice(0, remaining);
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
  const futureCount = days.length - past.length;
  const everyOther = past.filter((_, index) => index % 2 === 0);
  const budget = Math.max(0, Math.min(everyOther.length, target - Math.ceil(futureCount / 2)));
  return everyOther.slice(0, budget);
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
