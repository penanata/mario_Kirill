import type { ReflectionPeriod } from "@/lib/types";

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

export function energyFromText(text: string | undefined) {
  if (!text) return null;
  const match = text.match(/(?:энергия|самочувствие|настроение)\s*[:\-]?\s*([1-5])\b/i) ?? text.match(/\b([1-5])\s*(?:из\s*5|\/\s*5)\b/);
  if (!match) return null;
  return Number(match[1]);
}
