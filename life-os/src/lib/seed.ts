import { getDb } from "@/lib/db";
import { initialMonthPlan } from "@/lib/habits";
import { DEFAULT_TZ, addDaysKey, nextWeekday, nowISO, todayKey, zonedDate } from "@/lib/time";
import { fingerprint } from "@/lib/text";
import { fromZonedTime } from "date-fns-tz";

const USER = "user_local";

function insert(sql: string, ...params: unknown[]) {
  getDb().prepare(sql).run(...(params as never[]));
}

export function seedDemo() {
  const user = getDb().prepare("SELECT timezone FROM users WHERE id = ?").get(USER) as { timezone?: string } | undefined;
  const tz = user?.timezone || process.env.LIFEOS_TZ || DEFAULT_TZ;
  const now = nowISO();
  const today = todayKey(new Date(), tz);
  const tomorrow = addDaysKey(today, 1, tz);
  const yesterday = addDaysKey(today, -1, tz);
  const inThree = addDaysKey(today, 3, tz);
  const tuesday = nextWeekday(today, 2, tz, false);

  const areas = [
    ["area_finance", "Финансовый рост и устойчивость", "finance", "Обязательства, прибыль и устойчивость дел.", "#9a6b3f", 1],
    ["area_learning", "Обучение и профессиональное развитие", "learning", "AI-маркетинг и практика, которая становится навыком.", "#0f6e62", 2],
    ["area_health", "Физическое здоровье", "health", "Тело, тренировки, восстановление.", "#3f6f8f", 3],
    ["area_mind", "Ментальное и психологическое благополучие", "mind", "Отдых, ритм и эмоциональное состояние.", "#7d6b8a", 4],
  ] as const;
  for (const [id, name, slug, description, color, sort] of areas) {
    insert(
      `INSERT INTO life_areas (id, user_id, name, slug, description, color, sort_order, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      id, USER, name, slug, description, color, sort, now,
    );
  }

  const goals = [
    ["goal_fin_life", "area_finance", null, "life", "Выстроить финансовую устойчивость своих дел", "Деньги и обязательства остаются под контролем, без гонки любой ценой."],
    ["goal_fin_year", "area_finance", "goal_fin_life", "year", "Закрыть кассовые риски и увеличить прибыль", "Годовой результат, который вы можете поменять сами."],
    ["goal_fin_quarter", "area_finance", "goal_fin_year", "quarter", "Разобраться с обязательствами и стабилизировать выплаты", null],
    ["goal_fin_month", "area_finance", "goal_fin_quarter", "month", "Разобраться с обязательствами и увеличить прибыль", "Финансы этого месяца. Суммы не выдуманы: прогресс виден по закрытым задачам."],
    ["goal_fin_week", "area_finance", "goal_fin_month", "week", "Закрыть сверку и отчёт по платежам", null],
    ["goal_learn_life", "area_learning", null, "life", "Уверенно применять AI в маркетинге", null],
    ["goal_learn_year", "area_learning", "goal_learn_life", "year", "Собрать рабочий контент-конвейер", null],
    ["goal_learn_quarter", "area_learning", "goal_learn_year", "quarter", "Освоить инструменты и сделать первые материалы", null],
    ["goal_learn_month", "area_learning", "goal_learn_quarter", "month", "Освоить AI-маркетинг и построить первый контент-конвейер", null],
    ["goal_learn_week", "area_learning", "goal_learn_month", "week", "Четыре часа практики AI-маркетинга", null],
    ["goal_health_life", "area_health", null, "life", "Крепкое тело и ровная энергия", null],
    ["goal_health_year", "area_health", "goal_health_life", "year", "Регулярные тренировки без срывов в цифру", null],
    ["goal_health_month", "area_health", "goal_health_year", "month", "15 тренировок за месяц", "Считаются только отмеченные посещения."],
    ["goal_health_week", "area_health", "goal_health_month", "week", "Держать ритм тренировок с восстановлением", null],
    ["goal_mind_life", "area_mind", null, "life", "Спокойный устойчивый ритм", null],
    ["goal_mind_month", "area_mind", "goal_mind_life", "month", "Отдых, восстановление и эмоциональное состояние", null],
    ["goal_mind_week", "area_mind", "goal_mind_month", "week", "Один вечер без работы и одна прогулка", null],
  ] as const;
  for (const [id, area, parent, horizon, title, description] of goals) {
    const metric =
      id === "goal_health_month"
        ? { name: "тренировки", target: 15, mode: "habit", unit: "раз" }
        : id === "goal_learn_month"
          ? { name: "часы практики", target: 8, mode: "task_minutes", unit: "ч" }
          : { name: null, target: null, mode: "none", unit: null };
    insert(
      `INSERT INTO goals (id, user_id, area_id, parent_id, horizon, title, description, metric_name, metric_target, metric_mode, unit, status, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)`,
      id, USER, area, parent, horizon, title, description, metric.name, metric.target, metric.mode, metric.unit, now, now,
    );
  }

  insert(
    `INSERT INTO milestones (id, goal_id, title, target_date, status, is_demo, created_at) VALUES (?, ?, ?, ?, 'open', 1, ?)`,
    "ms_fin_1", "goal_fin_quarter", "Понять, какие платежи нельзя сдвигать", inThree, now,
  );
  insert(
    `INSERT INTO projects (id, user_id, area_id, goal_id, name, status, is_demo, created_at) VALUES (?, ?, ?, ?, ?, 'active', 1, ?)`,
    "project_dervo", USER, "area_finance", "goal_fin_month", "DERVO", now,
  );
  insert(
    `INSERT INTO projects (id, user_id, area_id, goal_id, name, status, is_demo, created_at) VALUES (?, ?, ?, ?, ?, 'active', 1, ?)`,
    "project_content", USER, "area_learning", "goal_learn_month", "Контент-конвейер", now,
  );

  const tasks = [
    {
      id: "task_supply",
      title: "Разобраться с поставкой и платежом",
      goal: "goal_fin_month",
      area: "area_finance",
      project: "project_dervo",
      priority: "obligation",
      estimate: 50,
      due: zonedDate(inThree, "18:00", tz).toISOString(),
      start: null,
      end: null,
      risk: 1,
      outcome: "Понятно, что платить, что двигать и какой есть риск.",
    },
    {
      id: "task_report",
      title: "Отчёт по обязательствам",
      goal: "goal_fin_week",
      area: "area_finance",
      project: "project_dervo",
      priority: "high",
      estimate: 60,
      due: zonedDate(today, "18:00", tz).toISOString(),
      start: null,
      end: null,
      risk: 0,
      outcome: "Короткий отчёт, по которому можно принять решение.",
    },
    {
      id: "task_calc",
      title: "Расчёты для бизнеса",
      goal: "goal_fin_month",
      area: "area_finance",
      project: "project_dervo",
      priority: "high",
      estimate: 45,
      due: zonedDate(yesterday, "18:00", tz).toISOString(),
      start: null,
      end: null,
      risk: 0,
      outcome: "Цифры по делам собраны вами, а не придуманы системой.",
    },
    {
      id: "task_ai",
      title: "Изучение AI-маркетинга",
      goal: "goal_learn_week",
      area: "area_learning",
      project: "project_content",
      priority: "normal",
      estimate: 90,
      due: null,
      start: null,
      end: null,
      risk: 0,
      outcome: "Один практический кусок контент-конвейера, не новый проект.",
    },
    {
      id: "task_dervo",
      title: "Доделать дашборд DERVO",
      goal: "goal_fin_month",
      area: "area_finance",
      project: "project_dervo",
      priority: "high",
      estimate: 90,
      due: zonedDate(tomorrow, "18:00", tz).toISOString(),
      start: zonedDate(tomorrow, "10:00", tz).toISOString(),
      end: zonedDate(tomorrow, "11:30", tz).toISOString(),
      risk: 0,
      outcome: "Дашборд доведён до состояния, которым можно пользоваться.",
    },
    {
      id: "task_water",
      title: "Купить воду",
      goal: null,
      area: null,
      project: null,
      priority: "low",
      estimate: 20,
      due: zonedDate(today, "20:00", tz).toISOString(),
      start: null,
      end: null,
      risk: 0,
      outcome: null,
    },
  ];
  for (const task of tasks) {
    insert(
      `INSERT INTO tasks (id, user_id, project_id, goal_id, area_id, title, status, priority, estimate_minutes, due_at, scheduled_start, scheduled_end, financial_risk, outcome, source, is_demo, fingerprint, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, 'demo', 1, ?, ?, ?)`,
      task.id, USER, task.project, task.goal, task.area, task.title, task.priority, task.estimate, task.due, task.start, task.end, task.risk, task.outcome, fingerprint(task.title), now, now,
    );
  }

  insert(
    `INSERT INTO calendar_events (id, user_id, source, title, start_at, end_at, timezone, status, is_demo, sync_state, created_at, updated_at)
     VALUES (?, ?, 'local', ?, ?, ?, ?, 'confirmed', 1, 'local', ?, ?)`,
    "event_breakfast", USER, "Завтрак и сборы", zonedDate(today, "08:30", tz).toISOString(), zonedDate(today, "09:10", tz).toISOString(), tz, now, now,
  );
  insert(
    `INSERT INTO calendar_events (id, user_id, source, title, notes, start_at, end_at, timezone, status, is_demo, sync_state, created_at, updated_at)
     VALUES (?, ?, 'local', ?, ?, ?, ?, ?, 'confirmed', 1, 'local', ?, ?)`,
    "event_lunch", USER, "Обед и прогулка", "Личное время, не задача.", zonedDate(today, "12:30", tz).toISOString(), zonedDate(today, "13:20", tz).toISOString(), tz, now, now,
  );
  const moscowStart = fromZonedTime(`${tuesday} 15:00:00`, "Europe/Moscow").toISOString();
  const moscowEnd = fromZonedTime(`${tuesday} 16:00:00`, "Europe/Moscow").toISOString();
  insert(
    `INSERT INTO calendar_events (id, user_id, source, title, notes, start_at, end_at, timezone, secondary_tz, status, is_demo, sync_state, created_at, updated_at)
     VALUES (?, ?, 'local', ?, ?, ?, ?, ?, 'Europe/Moscow', 'confirmed', 1, 'local', ?, ?)`,
    "event_moscow", USER, "Онлайн-встреча московского клуба", "Демонстрационное событие. Время показано по Пхукету и по Москве.", moscowStart, moscowEnd, tz, now, now,
  );
  insert(
    `INSERT INTO calendar_events (id, user_id, source, title, start_at, end_at, timezone, task_id, status, is_demo, sync_state, created_at, updated_at)
     VALUES (?, ?, 'local', ?, ?, ?, ?, ?, 'confirmed', 1, 'local', ?, ?)`,
    "event_dervo", USER, "Доделать дашборд DERVO", zonedDate(tomorrow, "10:00", tz).toISOString(), zonedDate(tomorrow, "11:30", tz).toISOString(), tz, "task_dervo", now, now,
  );

  insert(
    `INSERT INTO habits (id, user_id, area_id, goal_id, name, target_count, period, preferred_gap_days, unit, is_demo, created_at)
     VALUES (?, ?, 'area_health', 'goal_health_month', 'Тренировка в зале', 15, 'month', 1, 'раз', 1, ?)`,
    "habit_gym", USER, now,
  );
  const plan = initialMonthPlan(today, tz, 15);
  for (const date of plan.doneDates) {
    insert(
      `INSERT INTO habit_logs (id, habit_id, date, status, created_at, updated_at) VALUES (?, 'habit_gym', ?, 'done', ?, ?)`,
      `log_${date}`, date, now, now,
    );
  }
  for (const date of plan.plannedDates) {
    insert(
      `INSERT INTO habit_logs (id, habit_id, date, status, created_at, updated_at) VALUES (?, 'habit_gym', ?, 'planned', ?, ?)`,
      `log_${date}`, date, now, now,
    );
  }

  const ideas = [
    "Автоматическое производство Instagram-каруселей",
    "AI-контент про животных",
    "Экспертные видео с говорящей головой",
    "AI-маркетинговые системы для брендов",
    "Развитие личного блога",
    "Приложение для планирования",
    "Консультация эксперта по Авито",
  ];
  ideas.forEach((title, index) => {
    insert(
      `INSERT INTO ideas (id, user_id, title, status, uncertainty, next_step, ai_recommendation, confirmed, is_demo, fingerprint, created_at, updated_at)
       VALUES (?, ?, ?, 'new', 'high', ?, ?, 0, 1, ?, ?, ?)`,
      `idea_example_${index + 1}`,
      USER,
      title,
      "Решить, исследуете ли вы это сейчас.",
      "Пример идеи. Пока не в вашем банке: добавьте, только если это правда ваше.",
      fingerprint(title),
      now,
      now,
    );
  });
}

export function ensureAssistantSuggestions() {
  const existing = getDb().prepare("SELECT COUNT(*) AS c FROM event_recommendations WHERE user_id = ?").get(USER) as { c: number };
  if (existing.c) return;
  const user = getDb().prepare("SELECT timezone FROM users WHERE id = ?").get(USER) as { timezone?: string } | undefined;
  const tz = user?.timezone || process.env.LIFEOS_TZ || DEFAULT_TZ;
  const today = todayKey(new Date(), tz);
  const now = nowISO();
  const yogaDay = addDaysKey(today, 1, tz);
  const teaDay = addDaysKey(today, 3, tz);
  const rows = [
    ["suggest_yoga", "Йога на Банг Тао", "Банг Тао", zonedDate(yogaDay, "07:30", tz).toISOString(), zonedDate(yogaDay, "08:30", tz).toISOString()],
    ["suggest_tea", "Чайная церемония", "Тхаланг", zonedDate(teaDay, "18:00", tz).toISOString(), zonedDate(teaDay, "19:30", tz).toISOString()],
  ] as const;
  for (const [id, title, location, start, end] of rows) {
    insert(
      `INSERT INTO event_recommendations (id, user_id, title, location, start_at, end_at, status, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'suggested', 1, ?, ?)`,
      id, USER, title, location, start, end, now, now,
    );
  }
}
