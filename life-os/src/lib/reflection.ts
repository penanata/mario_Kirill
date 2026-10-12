import { formatInTimeZone } from "date-fns-tz";
import type { ReflectionPeriod } from "@/lib/types";
import { addDaysKey, isoDow, monthBounds, quarterKey, weekRange } from "@/lib/time";

export type ReflectionQuestion = { key: string; prompt: string };

export const REFLECTION_QUESTIONS: Record<ReflectionPeriod, ReflectionQuestion[]> = {
  day: [
    { key: "worked", prompt: "Что получилось?" },
    { key: "missed", prompt: "Что не получилось?" },
    { key: "energy", prompt: "Что дало или забрало энергию?" },
    { key: "feeling", prompt: "Как вы себя чувствуете? Можно своими словами." },
    { key: "insight", prompt: "Какой главный вывод?" },
    { key: "tomorrow", prompt: "Что самое важное завтра?" },
  ],
  week: [
    { key: "worked", prompt: "Что получилось за неделю?" },
    { key: "goals", prompt: "Какие цели продвинулись?" },
    { key: "hard", prompt: "Где возникли сложности?" },
    { key: "stop", prompt: "Что стоит прекратить делать?" },
    { key: "next", prompt: "Какие три результата важны на следующей неделе?" },
  ],
  month: [
    { key: "finance", prompt: "Что изменилось в финансах? Пишите только то, что знаете сами." },
    { key: "learning", prompt: "Что реально продвинулось в обучении?" },
    { key: "health", prompt: "Как прошёл месяц по телу и тренировкам?" },
    { key: "state", prompt: "Каким было состояние?" },
    { key: "results", prompt: "Какие результаты хотите сохранить?" },
    { key: "next", prompt: "Что берёте в следующий месяц?" },
  ],
  quarter: [
    { key: "projects", prompt: "Какие проекты ещё живые, а какие стоит остановить?" },
    { key: "strategy", prompt: "Что в стратегии подтвердилось?" },
    { key: "priorities", prompt: "Какие три приоритета на следующий квартал?" },
    { key: "time", prompt: "На что уходило время, и что с этим сделать?" },
  ],
  year: [
    { key: "achievements", prompt: "Какие достижения года для вас настоящие?" },
    { key: "changes", prompt: "Что изменилось в жизни?" },
    { key: "values", prompt: "Какие ценности хотите сохранить?" },
    { key: "lessons", prompt: "Какие уроки забираете с собой?" },
    { key: "next", prompt: "Какие цели следующего года вы сами хотите записать?" },
  ],
};

export const PERIOD_LABEL: Record<ReflectionPeriod, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
  quarter: "Квартал",
  year: "Год",
};

export function summarizeReflection(period: ReflectionPeriod, answers: Record<string, string>) {
  const lines = REFLECTION_QUESTIONS[period]
    .map((question) => {
      const value = answers[question.key]?.trim();
      if (!value) return null;
      return `${question.prompt}\n${value}`;
    })
    .filter((line): line is string => Boolean(line));
  if (!lines.length) return "Пока нет ответов. Я не дописываю состояние и выводы сама.";
  return lines.join("\n\n");
}

export type ReflectionMoment = {
  period: ReflectionPeriod;
  periodKey: string;
  title: string;
  prompts: { key: string; prompt: string }[];
};

function hasReflection(items: { period: string; periodKey: string }[], period: string, key: string) {
  return items.some((item) => item.period === period && item.periodKey === key);
}

export function dueReflection(input: {
  now: Date;
  tz: string;
  today: string;
  reflections: { period: string; periodKey: string }[];
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
}): ReflectionMoment | null {
  const hour = Number(formatInTimeZone(input.now, input.tz, "H"));
  const yesterday = addDaysKey(input.today, -1, input.tz);
  const morning = hour < 12;
  const evening = hour >= 18;
  const dow = isoDow(input.today, input.tz);
  const bounds = monthBounds(input.today);

  if (input.dailyEnabled && evening && !hasReflection(input.reflections, "day", input.today)) {
    return {
      period: "day",
      periodKey: input.today,
      title: "Как прошёл день",
      prompts: [
        { key: "worked", prompt: "Что получилось?" },
        { key: "tomorrow", prompt: "Что важно завтра?" },
      ],
    };
  }
  if (input.dailyEnabled && morning && !hasReflection(input.reflections, "day", yesterday)) {
    return {
      period: "day",
      periodKey: yesterday,
      title: "Как прошёл вчера",
      prompts: [
        { key: "worked", prompt: "Что получилось?" },
        { key: "tomorrow", prompt: "Что важно сегодня?" },
      ],
    };
  }

  const thisWeek = weekRange(input.today, input.tz).key;
  const lastWeek = weekRange(yesterday, input.tz).key;
  if (input.weeklyEnabled && dow === 7 && evening && !hasReflection(input.reflections, "week", thisWeek)) {
    return weekMoment(thisWeek);
  }
  if (input.weeklyEnabled && dow === 1 && morning && !hasReflection(input.reflections, "week", lastWeek)) {
    return weekMoment(lastWeek);
  }

  const monthKey = input.today.slice(0, 7);
  const prevMonthKey = yesterday.slice(0, 7);
  if (input.today === bounds.end && evening && !hasReflection(input.reflections, "month", monthKey)) return monthMoment(monthKey, "Как прошёл месяц");
  if (input.today.endsWith("-01") && morning && !hasReflection(input.reflections, "month", prevMonthKey)) return monthMoment(prevMonthKey, "Как прошёл прошлый месяц");

  const quarter = quarterKey(input.today);
  const prevQuarter = quarterKey(yesterday);
  const month = bounds.month;
  const quarterEnd = [3, 6, 9, 12].includes(month) && input.today === bounds.end;
  const quarterStart = [1, 4, 7, 10].includes(month) && input.today.endsWith("-01");
  if (quarterEnd && evening && !hasReflection(input.reflections, "quarter", quarter)) return quarterMoment(quarter);
  if (quarterStart && morning && !hasReflection(input.reflections, "quarter", prevQuarter)) return quarterMoment(prevQuarter);

  const year = input.today.slice(0, 4);
  const prevYear = yesterday.slice(0, 4);
  if (input.today.endsWith("-12-31") && evening && !hasReflection(input.reflections, "year", year)) return yearMoment(year);
  if (input.today.endsWith("-01-01") && morning && !hasReflection(input.reflections, "year", prevYear)) return yearMoment(prevYear);
  return null;
}

function weekMoment(key: string): ReflectionMoment {
  return {
    period: "week",
    periodKey: key,
    title: "Как прошла неделя",
    prompts: [
      { key: "worked", prompt: "Что получилось?" },
      { key: "next", prompt: "Что важно на следующей неделе?" },
    ],
  };
}

function monthMoment(key: string, title: string): ReflectionMoment {
  return {
    period: "month",
    periodKey: key,
    title,
    prompts: [
      { key: "results", prompt: "Что получилось?" },
      { key: "next", prompt: "Что берёте дальше?" },
    ],
  };
}

function quarterMoment(key: string): ReflectionMoment {
  return {
    period: "quarter",
    periodKey: key,
    title: "Итог квартала",
    prompts: [
      { key: "projects", prompt: "Что оставить и что остановить?" },
      { key: "priorities", prompt: "Три приоритета дальше?" },
    ],
  };
}

function yearMoment(key: string): ReflectionMoment {
  return {
    period: "year",
    periodKey: key,
    title: "Итог года",
    prompts: [
      { key: "achievements", prompt: "Что важно из этого года?" },
      { key: "next", prompt: "Какие цели дальше — ваши?" },
    ],
  };
}

export function energyFromText(text: string | undefined) {
  if (!text) return null;
  const match = text.match(/(?:энергия|самочувствие|настроение)\s*[:\-]?\s*([1-5])\b/i) ?? text.match(/\b([1-5])\s*(?:из\s*5|\/\s*5)\b/);
  if (!match) return null;
  return Number(match[1]);
}
