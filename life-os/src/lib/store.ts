import { getDb } from "@/lib/db";
import { seedDemo } from "@/lib/seed";
import { fingerprint } from "@/lib/text";
import { DEFAULT_TZ, addDaysKey, daySpan, freeMinutes, monthBounds, nowISO, todayKey, weekRange } from "@/lib/time";
import type { InterpContext } from "@/lib/types";
import { HttpError, uid } from "@/lib/utils";

export const USER_ID = "user_local";

const BOOL = new Set([
  "is_demo",
  "financial_risk",
  "all_day",
  "needs_registration",
  "registered",
  "confirmed",
  "daily_reflection_enabled",
  "weekly_reflection_enabled",
  "habit_reminder_enabled",
  "push_enabled",
]);

export function mapRow<T>(input: Record<string, unknown> | undefined | null): T | null {
  if (!input) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const camel = key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
    out[camel] = BOOL.has(key) ? Boolean(value) : value;
  }
  return out as T;
}

function bind(params: unknown[]) {
  return params as never[];
}

function rows<T>(sql: string, ...params: unknown[]) {
  return getDb()
    .prepare(sql)
    .all(...bind(params))
    .map((row) => mapRow<T>(row as Record<string, unknown>)!)
    .filter(Boolean);
}

function one<T>(sql: string, ...params: unknown[]) {
  return mapRow<T>(getDb().prepare(sql).get(...bind(params)) as Record<string, unknown> | undefined);
}

let readyLock = false;

export function ready() {
  getDb();
  if (readyLock) return;
  readyLock = true;
  try {
    const user = getDb().prepare("SELECT id FROM users WHERE id = ?").get(USER_ID);
    if (!user) {
      getDb()
        .prepare("INSERT INTO users (id, name, timezone, created_at) VALUES (?, '', ?, ?)")
        .run(USER_ID, process.env.LIFEOS_TZ || DEFAULT_TZ, nowISO());
    }
    const prefs = getDb().prepare("SELECT user_id FROM notification_preferences WHERE user_id = ?").get(USER_ID);
    if (!prefs) getDb().prepare("INSERT INTO notification_preferences (user_id) VALUES (?)").run(USER_ID);
    if (process.env.LIFEOS_SKIP_SEED === "1") return;
    const count = getDb().prepare("SELECT COUNT(*) AS c FROM life_areas").get() as { c: number };
    if (!count.c) seedDemo();
  } finally {
    readyLock = false;
  }
}

export function audit(action: string, entityType: string, entityId: string | null, before: unknown, after: unknown, actor = "user") {
  getDb()
    .prepare(
      `INSERT INTO audit_logs (id, user_id, actor, action, entity_type, entity_id, before_json, after_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(uid(), USER_ID, actor, action, entityType, entityId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, nowISO());
}

export type UserRow = { id: string; name: string; timezone: string; createdAt: string };
export type AreaRow = { id: string; name: string; slug: string; description: string | null; color: string | null; sortOrder: number; isDemo: boolean };
export type GoalRow = {
  id: string;
  areaId: string | null;
  parentId: string | null;
  horizon: string;
  title: string;
  description: string | null;
  metricName: string | null;
  metricTarget: number | null;
  metricCurrent: number | null;
  metricMode: string;
  unit: string | null;
  status: string;
  isDemo: boolean;
  areaName?: string | null;
  areaColor?: string | null;
};
export type TaskRow = {
  id: string;
  projectId: string | null;
  goalId: string | null;
  areaId: string | null;
  title: string;
  notes: string | null;
  status: string;
  priority: string;
  estimateMinutes: number | null;
  dueAt: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  completedAt: string | null;
  rescheduleCount: number;
  financialRisk: boolean;
  energy: string | null;
  outcome: string | null;
  source: string;
  isDemo: boolean;
  fingerprint: string | null;
  blockedBy: string | null;
  createdAt: string;
  updatedAt: string;
  goalTitle?: string | null;
  areaName?: string | null;
  areaSlug?: string | null;
  projectName?: string | null;
};
export type EventRow = {
  id: string;
  calendarHref: string | null;
  externalUid: string | null;
  source: string;
  title: string;
  notes: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  secondaryTz: string | null;
  status: string;
  taskId: string | null;
  etag: string | null;
  href: string | null;
  syncState: string;
  conflict: string | null;
  isDemo: boolean;
};
export type HabitRow = {
  id: string;
  areaId: string | null;
  goalId: string | null;
  name: string;
  targetCount: number;
  period: string;
  preferredGapDays: number;
  unit: string | null;
  isDemo: boolean;
};
export type HabitLogRow = { id: string; habitId: string; date: string; status: string; note: string | null };
export type IdeaRow = {
  id: string;
  areaId: string | null;
  goalId: string | null;
  title: string;
  description: string | null;
  status: string;
  valueNote: string | null;
  timeCost: string | null;
  moneyCost: string | null;
  uncertainty: string | null;
  nextStep: string | null;
  aiRecommendation: string | null;
  relatedIdeaId: string | null;
  confirmed: boolean;
  isDemo: boolean;
  areaName?: string | null;
};
export type ReflectionRow = {
  id: string;
  period: string;
  periodKey: string;
  answersJson: string;
  summary: string | null;
  energy: number | null;
  status: string;
  createdAt: string;
  isDemo: boolean;
};
export type ProposalRow = {
  id: string;
  conversationId: string | null;
  summary: string;
  actionsJson: string;
  status: string;
  resultJson: string | null;
  createdAt: string;
  resolvedAt: string | null;
};
export type ConversationRow = { id: string; title: string | null; mode: string | null; modeStateJson: string | null; createdAt: string };
export type MessageRow = { id: string; conversationId: string; role: string; content: string; createdAt: string };
export type IntegrationRow = {
  id: string;
  provider: string;
  accountLabel: string | null;
  secretCiphertext: string | null;
  metaJson: string | null;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
  selectedCalendarHref: string | null;
};
export type OpportunityRow = {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  startAt: string | null;
  endAt: string | null;
  location: string | null;
  price: string | null;
  why: string | null;
  needsRegistration: boolean;
  registered: boolean;
  status: string;
  calendarEventId: string | null;
  isDemo: boolean;
};
export type PrefsRow = {
  userId: string;
  dailyReflectionEnabled: boolean;
  dailyReflectionTime: string;
  weeklyReflectionEnabled: boolean;
  weeklyReflectionWeekday: number;
  weeklyReflectionTime: string;
  habitReminderEnabled: boolean;
  pushEnabled: boolean;
};
export type CheckinRow = { id: string; date: string; energy: number | null; note: string | null };

export function getUser() {
  ready();
  return one<UserRow>("SELECT * FROM users WHERE id = ?", USER_ID)!;
}

export function updateUser(patch: { name?: string; timezone?: string }) {
  ready();
  const current = getUser();
  getDb()
    .prepare("UPDATE users SET name = ?, timezone = ? WHERE id = ?")
    .run(patch.name ?? current.name, patch.timezone ?? current.timezone, USER_ID);
  audit("update", "user", USER_ID, current, patch);
  return getUser();
}

export function getPrefs() {
  ready();
  return one<PrefsRow>("SELECT * FROM notification_preferences WHERE user_id = ?", USER_ID)!;
}

export function updatePrefs(patch: Partial<Record<string, string | number | boolean>>) {
  ready();
  const current = getPrefs();
  const next = {
    dailyReflectionEnabled: patch.dailyReflectionEnabled ?? current.dailyReflectionEnabled,
    dailyReflectionTime: patch.dailyReflectionTime ?? current.dailyReflectionTime,
    weeklyReflectionEnabled: patch.weeklyReflectionEnabled ?? current.weeklyReflectionEnabled,
    weeklyReflectionWeekday: patch.weeklyReflectionWeekday ?? current.weeklyReflectionWeekday,
    weeklyReflectionTime: patch.weeklyReflectionTime ?? current.weeklyReflectionTime,
    habitReminderEnabled: patch.habitReminderEnabled ?? current.habitReminderEnabled,
  };
  getDb()
    .prepare(
      `UPDATE notification_preferences
       SET daily_reflection_enabled = ?, daily_reflection_time = ?, weekly_reflection_enabled = ?,
           weekly_reflection_weekday = ?, weekly_reflection_time = ?, habit_reminder_enabled = ?
       WHERE user_id = ?`,
    )
    .run(...bind([
      next.dailyReflectionEnabled ? 1 : 0,
      next.dailyReflectionTime,
      next.weeklyReflectionEnabled ? 1 : 0,
      Number(next.weeklyReflectionWeekday),
      next.weeklyReflectionTime,
      next.habitReminderEnabled ? 1 : 0,
      USER_ID,
    ]));
  return getPrefs();
}

export function listAreas() {
  ready();
  return rows<AreaRow>("SELECT * FROM life_areas WHERE user_id = ? ORDER BY sort_order, name", USER_ID);
}

export function createArea(input: { name: string; description?: string }) {
  ready();
  const id = uid();
  const slug = fingerprint(input.name).replace(/\s+/g, "-").slice(0, 40) || id.slice(0, 8);
  const now = nowISO();
  getDb()
    .prepare(
      `INSERT INTO life_areas (id, user_id, name, slug, description, color, sort_order, is_demo, created_at)
       VALUES (?, ?, ?, ?, ?, '#6b6560', (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM life_areas), 0, ?)`,
    )
    .run(id, USER_ID, input.name.trim(), slug, input.description ?? null, now);
  audit("create", "life_area", id, null, input);
  return one<AreaRow>("SELECT * FROM life_areas WHERE id = ?", id)!;
}

export function listGoals() {
  ready();
  return rows<GoalRow>(
    `SELECT g.*, a.name AS area_name, a.color AS area_color
     FROM goals g LEFT JOIN life_areas a ON a.id = g.area_id
     WHERE g.user_id = ? ORDER BY a.sort_order, g.horizon, g.title`,
    USER_ID,
  );
}

export function getGoal(id: string) {
  ready();
  const goal = one<GoalRow>("SELECT * FROM goals WHERE id = ? AND user_id = ?", id, USER_ID);
  if (!goal) throw new HttpError("Цель не найдена", 404);
  return goal;
}

export function createGoal(input: {
  title: string;
  horizon: string;
  areaId?: string | null;
  parentId?: string | null;
  description?: string | null;
  metricName?: string | null;
  metricTarget?: number | null;
  metricMode?: string;
  unit?: string | null;
}) {
  ready();
  const id = uid();
  const now = nowISO();
  getDb()
    .prepare(
      `INSERT INTO goals (id, user_id, area_id, parent_id, horizon, title, description, metric_name, metric_target, metric_mode, unit, status, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)`,
    )
    .run(
      id,
      USER_ID,
      input.areaId ?? null,
      input.parentId ?? null,
      input.horizon,
      input.title.trim(),
      input.description ?? null,
      input.metricName ?? null,
      input.metricTarget ?? null,
      input.metricMode ?? "none",
      input.unit ?? null,
      now,
      now,
    );
  audit("create", "goal", id, null, input);
  return getGoal(id);
}

export function updateGoal(id: string, patch: Record<string, unknown>) {
  ready();
  const current = getGoal(id);
  const next = {
    title: patch.title ?? current.title,
    description: patch.description === undefined ? current.description : patch.description,
    horizon: patch.horizon ?? current.horizon,
    areaId: patch.areaId === undefined ? current.areaId : patch.areaId,
    parentId: patch.parentId === undefined ? current.parentId : patch.parentId,
    metricName: patch.metricName === undefined ? current.metricName : patch.metricName,
    metricTarget: patch.metricTarget === undefined ? current.metricTarget : patch.metricTarget,
    metricCurrent: patch.metricCurrent === undefined ? current.metricCurrent : patch.metricCurrent,
    metricMode: patch.metricMode ?? current.metricMode,
    unit: patch.unit === undefined ? current.unit : patch.unit,
    status: patch.status ?? current.status,
  };
  getDb()
    .prepare(
      `UPDATE goals SET title=?, description=?, horizon=?, area_id=?, parent_id=?, metric_name=?, metric_target=?, metric_current=?, metric_mode=?, unit=?, status=?, updated_at=? WHERE id=?`,
    )
    .run(...bind([next.title, next.description, next.horizon, next.areaId, next.parentId, next.metricName, next.metricTarget, next.metricCurrent, next.metricMode, next.unit, next.status, nowISO(), id]));
  audit("update", "goal", id, current, next);
  return getGoal(id);
}

export function listTasks() {
  ready();
  return rows<TaskRow>(
    `SELECT t.*, g.title AS goal_title, a.name AS area_name, a.slug AS area_slug, p.name AS project_name
     FROM tasks t
     LEFT JOIN goals g ON g.id = t.goal_id
     LEFT JOIN life_areas a ON a.id = t.area_id
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.user_id = ?
     ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'deferred' THEN 1 ELSE 2 END, t.due_at IS NULL, t.due_at, t.created_at`,
    USER_ID,
  );
}

export function getTask(id: string) {
  ready();
  const task = listTasks().find((item) => item.id === id);
  if (!task) throw new HttpError("Задача не найдена", 404);
  return task;
}

export function createTask(input: {
  title: string;
  notes?: string | null;
  goalId?: string | null;
  areaId?: string | null;
  projectId?: string | null;
  priority?: string;
  estimateMinutes?: number | null;
  dueAt?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  financialRisk?: boolean;
  outcome?: string | null;
  energy?: string | null;
  source?: string;
  actor?: string;
}) {
  ready();
  const title = input.title.trim();
  const fp = fingerprint(title);
  const duplicate = one<TaskRow>("SELECT * FROM tasks WHERE user_id = ? AND fingerprint = ? AND status = 'open'", USER_ID, fp);
  if (duplicate) return { task: getTask(duplicate.id), duplicate: true as const };
  const id = uid();
  const now = nowISO();
  getDb()
    .prepare(
      `INSERT INTO tasks (id, user_id, project_id, goal_id, area_id, title, notes, status, priority, estimate_minutes, due_at, scheduled_start, scheduled_end, financial_risk, energy, outcome, source, is_demo, fingerprint, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .run(
      id,
      USER_ID,
      input.projectId ?? null,
      input.goalId ?? null,
      input.areaId ?? null,
      title,
      input.notes ?? null,
      input.priority ?? "normal",
      input.estimateMinutes ?? null,
      input.dueAt ?? null,
      input.scheduledStart ?? null,
      input.scheduledEnd ?? null,
      input.financialRisk ? 1 : 0,
      input.energy ?? null,
      input.outcome ?? null,
      input.source ?? "user",
      fp,
      now,
      now,
    );
  audit("create", "task", id, null, { title }, input.actor ?? "user");
  return { task: getTask(id), duplicate: false as const };
}

export function updateTask(id: string, patch: Record<string, unknown>, actor = "user") {
  ready();
  const current = getTask(id);
  const next = {
    title: String(patch.title ?? current.title).trim(),
    notes: patch.notes === undefined ? current.notes : (patch.notes as string | null),
    goalId: patch.goalId === undefined ? current.goalId : (patch.goalId as string | null),
    areaId: patch.areaId === undefined ? current.areaId : (patch.areaId as string | null),
    priority: String(patch.priority ?? current.priority),
    estimateMinutes: patch.estimateMinutes === undefined ? current.estimateMinutes : (patch.estimateMinutes as number | null),
    dueAt: patch.dueAt === undefined ? current.dueAt : (patch.dueAt as string | null),
    scheduledStart: patch.scheduledStart === undefined ? current.scheduledStart : (patch.scheduledStart as string | null),
    scheduledEnd: patch.scheduledEnd === undefined ? current.scheduledEnd : (patch.scheduledEnd as string | null),
    status: String(patch.status ?? current.status),
    financialRisk: patch.financialRisk === undefined ? current.financialRisk : Boolean(patch.financialRisk),
    outcome: patch.outcome === undefined ? current.outcome : (patch.outcome as string | null),
    energy: patch.energy === undefined ? current.energy : (patch.energy as string | null),
    rescheduleCount: patch.rescheduleCount === undefined ? current.rescheduleCount : Number(patch.rescheduleCount),
    completedAt: patch.completedAt === undefined ? current.completedAt : (patch.completedAt as string | null),
  };
  if (!next.title) throw new HttpError("Нужно название задачи");
  getDb()
    .prepare(
      `UPDATE tasks SET title=?, notes=?, goal_id=?, area_id=?, priority=?, estimate_minutes=?, due_at=?, scheduled_start=?, scheduled_end=?, status=?, financial_risk=?, outcome=?, energy=?, reschedule_count=?, completed_at=?, fingerprint=?, updated_at=? WHERE id=?`,
    )
    .run(
      next.title,
      next.notes,
      next.goalId,
      next.areaId,
      next.priority,
      next.estimateMinutes,
      next.dueAt,
      next.scheduledStart,
      next.scheduledEnd,
      next.status,
      next.financialRisk ? 1 : 0,
      next.outcome,
      next.energy,
      next.rescheduleCount,
      next.completedAt,
      fingerprint(next.title),
      nowISO(),
      id,
    );
  audit("update", "task", id, current, next, actor);
  return getTask(id);
}

export function listEvents(fromIso?: string, toIso?: string) {
  ready();
  if (fromIso && toIso) {
    return rows<EventRow>(
      `SELECT * FROM calendar_events WHERE user_id = ? AND start_at < ? AND end_at > ? ORDER BY start_at`,
      USER_ID,
      toIso,
      fromIso,
    );
  }
  return rows<EventRow>("SELECT * FROM calendar_events WHERE user_id = ? ORDER BY start_at", USER_ID);
}

export function createEvent(input: {
  title: string;
  startAt: string;
  endAt: string;
  notes?: string | null;
  location?: string | null;
  secondaryTz?: string | null;
  taskId?: string | null;
  source?: string;
  externalUid?: string | null;
  href?: string | null;
  etag?: string | null;
  calendarHref?: string | null;
  syncState?: string;
  isDemo?: boolean;
  actor?: string;
}) {
  ready();
  if (new Date(input.endAt) <= new Date(input.startAt)) throw new HttpError("Окончание должно быть позже начала");
  const duplicate = one<EventRow>("SELECT * FROM calendar_events WHERE user_id = ? AND title = ? AND start_at = ?", USER_ID, input.title.trim(), input.startAt);
  if (duplicate) return { event: duplicate, duplicate: true as const };
  if (input.externalUid) {
    const byUid = one<EventRow>("SELECT * FROM calendar_events WHERE user_id = ? AND external_uid = ?", USER_ID, input.externalUid);
    if (byUid) return { event: byUid, duplicate: true as const };
  }
  const id = uid();
  const now = nowISO();
  const tz = getUser().timezone;
  getDb()
    .prepare(
      `INSERT INTO calendar_events (id, user_id, calendar_href, external_uid, source, title, notes, location, start_at, end_at, timezone, secondary_tz, task_id, etag, href, sync_state, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      USER_ID,
      input.calendarHref ?? null,
      input.externalUid ?? null,
      input.source ?? "local",
      input.title.trim(),
      input.notes ?? null,
      input.location ?? null,
      input.startAt,
      input.endAt,
      tz,
      input.secondaryTz ?? null,
      input.taskId ?? null,
      input.etag ?? null,
      input.href ?? null,
      input.syncState ?? "local",
      input.isDemo ? 1 : 0,
      now,
      now,
    );
  audit("create", "calendar_event", id, null, { title: input.title, startAt: input.startAt }, input.actor ?? "user");
  return { event: one<EventRow>("SELECT * FROM calendar_events WHERE id = ?", id)!, duplicate: false as const };
}

export function updateEvent(id: string, patch: Record<string, unknown>, actor = "user") {
  ready();
  const current = one<EventRow>("SELECT * FROM calendar_events WHERE id = ? AND user_id = ?", id, USER_ID);
  if (!current) throw new HttpError("Событие не найдено", 404);
  const next = {
    title: String(patch.title ?? current.title).trim(),
    notes: patch.notes === undefined ? current.notes : patch.notes,
    location: patch.location === undefined ? current.location : patch.location,
    startAt: String(patch.startAt ?? current.startAt),
    endAt: String(patch.endAt ?? current.endAt),
    secondaryTz: patch.secondaryTz === undefined ? current.secondaryTz : patch.secondaryTz,
    syncState: patch.syncState !== undefined ? String(patch.syncState) : current.source === "icloud" ? "pending_push" : current.syncState,
    conflict: patch.conflict === undefined ? current.conflict : patch.conflict,
    etag: patch.etag === undefined ? current.etag : patch.etag,
    href: patch.href === undefined ? current.href : patch.href,
    externalUid: patch.externalUid === undefined ? current.externalUid : patch.externalUid,
  };
  if (new Date(next.endAt) <= new Date(next.startAt)) throw new HttpError("Окончание должно быть позже начала");
  getDb()
    .prepare(
      `UPDATE calendar_events SET title=?, notes=?, location=?, start_at=?, end_at=?, secondary_tz=?, sync_state=?, conflict=?, etag=?, href=?, external_uid=?, updated_at=? WHERE id=?`,
    )
    .run(...bind([next.title, next.notes, next.location, next.startAt, next.endAt, next.secondaryTz, next.syncState, next.conflict, next.etag, next.href, next.externalUid, nowISO(), id]));
  audit("update", "calendar_event", id, current, next, actor);
  return one<EventRow>("SELECT * FROM calendar_events WHERE id = ?", id)!;
}

export function deleteEvent(id: string) {
  ready();
  const current = one<EventRow>("SELECT * FROM calendar_events WHERE id = ? AND user_id = ?", id, USER_ID);
  if (!current) throw new HttpError("Событие не найдено", 404);
  getDb().prepare("DELETE FROM calendar_events WHERE id = ?").run(id);
  audit("delete", "calendar_event", id, current, null);
  return { ok: true };
}

export function listIdeas() {
  ready();
  return rows<IdeaRow>(
    `SELECT i.*, a.name AS area_name FROM ideas i LEFT JOIN life_areas a ON a.id = i.area_id WHERE i.user_id = ? ORDER BY i.confirmed, i.created_at DESC`,
    USER_ID,
  );
}

export function createIdea(input: {
  title: string;
  description?: string | null;
  areaId?: string | null;
  goalId?: string | null;
  status?: string;
  uncertainty?: string | null;
  nextStep?: string | null;
  recommendation?: string | null;
  relatedIdeaId?: string | null;
  valueNote?: string | null;
  timeCost?: string | null;
  moneyCost?: string | null;
  confirmed?: boolean;
  actor?: string;
}) {
  ready();
  const title = input.title.trim();
  const fp = fingerprint(title);
  const duplicate = one<IdeaRow>("SELECT * FROM ideas WHERE user_id = ? AND fingerprint = ? AND confirmed = 1", USER_ID, fp);
  if (duplicate) return { idea: duplicate, duplicate: true as const };
  const id = uid();
  const now = nowISO();
  getDb()
    .prepare(
      `INSERT INTO ideas (id, user_id, area_id, goal_id, title, description, status, value_note, time_cost, money_cost, uncertainty, next_step, ai_recommendation, related_idea_id, confirmed, is_demo, fingerprint, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .run(
      id,
      USER_ID,
      input.areaId ?? null,
      input.goalId ?? null,
      title,
      input.description ?? null,
      input.status ?? "new",
      input.valueNote ?? null,
      input.timeCost ?? null,
      input.moneyCost ?? null,
      input.uncertainty ?? "medium",
      input.nextStep ?? null,
      input.recommendation ?? null,
      input.relatedIdeaId ?? null,
      input.confirmed === false ? 0 : 1,
      fp,
      now,
      now,
    );
  audit("create", "idea", id, null, { title }, input.actor ?? "user");
  return { idea: one<IdeaRow>("SELECT * FROM ideas WHERE id = ?", id)!, duplicate: false as const };
}

export function updateIdea(id: string, patch: Record<string, unknown>) {
  ready();
  const current = one<IdeaRow>("SELECT * FROM ideas WHERE id = ? AND user_id = ?", id, USER_ID);
  if (!current) throw new HttpError("Идея не найдена", 404);
  const next = {
    title: String(patch.title ?? current.title).trim(),
    description: patch.description === undefined ? current.description : patch.description,
    status: String(patch.status ?? current.status),
    areaId: patch.areaId === undefined ? current.areaId : patch.areaId,
    goalId: patch.goalId === undefined ? current.goalId : patch.goalId,
    uncertainty: patch.uncertainty === undefined ? current.uncertainty : patch.uncertainty,
    nextStep: patch.nextStep === undefined ? current.nextStep : patch.nextStep,
    valueNote: patch.valueNote === undefined ? current.valueNote : patch.valueNote,
    timeCost: patch.timeCost === undefined ? current.timeCost : patch.timeCost,
    moneyCost: patch.moneyCost === undefined ? current.moneyCost : patch.moneyCost,
    confirmed: patch.confirmed === undefined ? current.confirmed : Boolean(patch.confirmed),
    relatedIdeaId: patch.relatedIdeaId === undefined ? current.relatedIdeaId : patch.relatedIdeaId,
    aiRecommendation: patch.aiRecommendation === undefined ? current.aiRecommendation : patch.aiRecommendation,
    isDemo: patch.isDemo === undefined ? current.isDemo : Boolean(patch.isDemo),
  };
  getDb()
    .prepare(
      `UPDATE ideas SET title=?, description=?, status=?, area_id=?, goal_id=?, uncertainty=?, next_step=?, value_note=?, time_cost=?, money_cost=?, confirmed=?, related_idea_id=?, ai_recommendation=?, is_demo=?, fingerprint=?, updated_at=? WHERE id=?`,
    )
    .run(...bind([next.title, next.description, next.status, next.areaId, next.goalId, next.uncertainty, next.nextStep, next.valueNote, next.timeCost, next.moneyCost, next.confirmed ? 1 : 0, next.relatedIdeaId, next.aiRecommendation, next.isDemo ? 1 : 0, fingerprint(next.title), nowISO(), id]));
  audit("update", "idea", id, current, next);
  return one<IdeaRow>("SELECT * FROM ideas WHERE id = ?", id)!;
}

export function listHabits() {
  ready();
  return rows<HabitRow>("SELECT * FROM habits WHERE user_id = ? ORDER BY name", USER_ID);
}

export function createHabit(input: { name: string; targetCount: number; preferredGapDays?: number; areaId?: string | null; goalId?: string | null; unit?: string }) {
  ready();
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO habits (id, user_id, area_id, goal_id, name, target_count, period, preferred_gap_days, unit, is_demo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'month', ?, ?, 0, ?)`,
    )
    .run(id, USER_ID, input.areaId ?? null, input.goalId ?? null, input.name.trim(), input.targetCount, input.preferredGapDays ?? 1, input.unit ?? "раз", nowISO());
  audit("create", "habit", id, null, input);
  return one<HabitRow>("SELECT * FROM habits WHERE id = ?", id)!;
}

export function listHabitLogs(habitId: string, from: string, to: string) {
  ready();
  return rows<HabitLogRow>("SELECT * FROM habit_logs WHERE habit_id = ? AND date >= ? AND date <= ? ORDER BY date", habitId, from, to);
}

export function upsertHabitLog(habitId: string, date: string, status: string, note?: string | null, actor = "user") {
  ready();
  const habit = one<HabitRow>("SELECT * FROM habits WHERE id = ? AND user_id = ?", habitId, USER_ID);
  if (!habit) throw new HttpError("Привычка не найдена", 404);
  const existing = one<HabitLogRow>("SELECT * FROM habit_logs WHERE habit_id = ? AND date = ?", habitId, date);
  const now = nowISO();
  if (existing) {
    getDb().prepare("UPDATE habit_logs SET status = ?, note = ?, updated_at = ? WHERE id = ?").run(status, note ?? existing.note, now, existing.id);
  } else {
    getDb()
      .prepare("INSERT INTO habit_logs (id, habit_id, date, status, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(uid(), habitId, date, status, note ?? null, now, now);
  }
  audit("upsert", "habit_log", habitId, existing, { date, status }, actor);
  return one<HabitLogRow>("SELECT * FROM habit_logs WHERE habit_id = ? AND date = ?", habitId, date)!;
}

export function replacePlannedLogs(habitId: string, dates: string[], today: string) {
  ready();
  getDb().prepare("DELETE FROM habit_logs WHERE habit_id = ? AND status = 'planned' AND date >= ?").run(habitId, today);
  const now = nowISO();
  for (const date of dates) {
    const existing = one<HabitLogRow>("SELECT * FROM habit_logs WHERE habit_id = ? AND date = ?", habitId, date);
    if (existing && existing.status === "done") continue;
    if (existing) {
      getDb().prepare("UPDATE habit_logs SET status = 'planned', updated_at = ? WHERE id = ?").run(now, existing.id);
    } else {
      getDb()
        .prepare("INSERT INTO habit_logs (id, habit_id, date, status, created_at, updated_at) VALUES (?, ?, ?, 'planned', ?, ?)")
        .run(uid(), habitId, date, now, now);
    }
  }
}

export function listReflections(search = "") {
  ready();
  const all = rows<ReflectionRow>("SELECT * FROM reflections WHERE user_id = ? ORDER BY created_at DESC", USER_ID);
  const query = search.trim().toLowerCase();
  if (!query) return all;
  return all.filter((item) => `${item.summary ?? ""} ${item.answersJson} ${item.periodKey}`.toLowerCase().includes(query));
}

export function saveReflection(input: {
  period: string;
  periodKey: string;
  answers: Record<string, string>;
  summary: string;
  energy?: number | null;
  actor?: string;
}) {
  ready();
  const id = uid();
  const now = nowISO();
  getDb()
    .prepare(
      `INSERT INTO reflections (id, user_id, period, period_key, answers_json, summary, energy, status, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'complete', 0, ?, ?)`,
    )
    .run(id, USER_ID, input.period, input.periodKey, JSON.stringify(input.answers), input.summary, input.energy ?? null, now, now);
  audit("create", "reflection", id, null, { period: input.period, periodKey: input.periodKey }, input.actor ?? "user");
  return one<ReflectionRow>("SELECT * FROM reflections WHERE id = ?", id)!;
}

export function getCheckin(date: string) {
  ready();
  return one<CheckinRow>("SELECT * FROM checkins WHERE user_id = ? AND date = ?", USER_ID, date);
}

export function saveCheckin(date: string, energy: number, note?: string) {
  ready();
  const existing = getCheckin(date);
  if (existing) {
    getDb().prepare("UPDATE checkins SET energy = ?, note = ? WHERE id = ?").run(energy, note ?? null, existing.id);
  } else {
    getDb().prepare("INSERT INTO checkins (id, user_id, date, energy, note, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(uid(), USER_ID, date, energy, note ?? null, nowISO());
  }
  audit("upsert", "checkin", date, existing, { energy });
  return getCheckin(date)!;
}

export function listCheckins(from: string, to: string) {
  ready();
  return rows<CheckinRow>("SELECT * FROM checkins WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date", USER_ID, from, to);
}

export function listConversations() {
  ready();
  return rows<ConversationRow>("SELECT * FROM ai_conversations WHERE user_id = ? ORDER BY created_at DESC", USER_ID);
}

export function getConversation(id: string) {
  ready();
  const conversation = one<ConversationRow>("SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?", id, USER_ID);
  if (!conversation) throw new HttpError("Диалог не найден", 404);
  return conversation;
}

export function createConversation() {
  ready();
  const id = uid();
  getDb().prepare("INSERT INTO ai_conversations (id, user_id, title, created_at) VALUES (?, ?, 'Диалог', ?)").run(id, USER_ID, nowISO());
  return getConversation(id);
}

export function latestConversation() {
  ready();
  return listConversations()[0] ?? createConversation();
}

export function setConversationMode(id: string, mode: string | null, state: unknown) {
  ready();
  getDb().prepare("UPDATE ai_conversations SET mode = ?, mode_state_json = ? WHERE id = ?").run(mode, state ? JSON.stringify(state) : null, id);
  return getConversation(id);
}

export function addMessage(conversationId: string, role: string, content: string) {
  ready();
  const id = uid();
  getDb().prepare("INSERT INTO ai_messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)").run(id, conversationId, role, content, nowISO());
  return one<MessageRow>("SELECT * FROM ai_messages WHERE id = ?", id)!;
}

export function listMessages(conversationId: string) {
  ready();
  return rows<MessageRow>("SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at", conversationId);
}

export function createProposal(input: { conversationId?: string | null; summary: string; actions: unknown }) {
  ready();
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO ai_action_proposals (id, conversation_id, user_id, summary, actions_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .run(id, input.conversationId ?? null, USER_ID, input.summary, JSON.stringify(input.actions), nowISO());
  return getProposal(id);
}

export function getProposal(id: string) {
  ready();
  const proposal = one<ProposalRow>("SELECT * FROM ai_action_proposals WHERE id = ? AND user_id = ?", id, USER_ID);
  if (!proposal) throw new HttpError("Предложение не найдено", 404);
  return proposal;
}

export function updateProposalActions(id: string, actions: unknown) {
  ready();
  const proposal = getProposal(id);
  if (proposal.status !== "pending") throw new HttpError("Это предложение уже закрыто");
  getDb().prepare("UPDATE ai_action_proposals SET actions_json = ? WHERE id = ?").run(JSON.stringify(actions), id);
  return getProposal(id);
}

export function finishProposal(id: string, status: string, result: unknown) {
  getDb()
    .prepare("UPDATE ai_action_proposals SET status = ?, result_json = ?, resolved_at = ? WHERE id = ?")
    .run(status, JSON.stringify(result), nowISO(), id);
  return getProposal(id);
}

export function listPendingProposals() {
  ready();
  return rows<ProposalRow>("SELECT * FROM ai_action_proposals WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC", USER_ID);
}

export function getIntegration() {
  ready();
  return one<IntegrationRow>("SELECT * FROM integration_connections WHERE user_id = ? AND provider = 'icloud'", USER_ID);
}

export function saveIntegration(input: Partial<IntegrationRow> & { secretCiphertext?: string | null }) {
  ready();
  const current = getIntegration();
  const now = nowISO();
  if (!current) {
    const id = uid();
    getDb()
      .prepare(
        `INSERT INTO integration_connections (id, user_id, provider, account_label, secret_ciphertext, meta_json, status, last_sync_at, last_error, selected_calendar_href, created_at, updated_at)
         VALUES (?, ?, 'icloud', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, USER_ID, input.accountLabel ?? null, input.secretCiphertext ?? null, input.metaJson ?? null, input.status ?? "needs_setup", input.lastSyncAt ?? null, input.lastError ?? null, input.selectedCalendarHref ?? null, now, now);
  } else {
    getDb()
      .prepare(
        `UPDATE integration_connections SET account_label=?, secret_ciphertext=?, meta_json=?, status=?, last_sync_at=?, last_error=?, selected_calendar_href=?, updated_at=? WHERE id=?`,
      )
      .run(
        input.accountLabel === undefined ? current.accountLabel : input.accountLabel,
        input.secretCiphertext === undefined ? current.secretCiphertext : input.secretCiphertext,
        input.metaJson === undefined ? current.metaJson : input.metaJson,
        input.status ?? current.status,
        input.lastSyncAt === undefined ? current.lastSyncAt : input.lastSyncAt,
        input.lastError === undefined ? current.lastError : input.lastError,
        input.selectedCalendarHref === undefined ? current.selectedCalendarHref : input.selectedCalendarHref,
        now,
        current.id,
      );
  }
  return getIntegration()!;
}

export function clearIntegrationSecret() {
  ready();
  const current = getIntegration();
  if (!current) return null;
  getDb()
    .prepare("UPDATE integration_connections SET secret_ciphertext = NULL, status = 'needs_setup', last_error = NULL, updated_at = ? WHERE id = ?")
    .run(nowISO(), current.id);
  return getIntegration();
}

export function listOpportunities() {
  ready();
  return rows<OpportunityRow>("SELECT * FROM event_recommendations WHERE user_id = ? ORDER BY created_at DESC", USER_ID);
}

export function createOpportunity(input: {
  title: string;
  description?: string | null;
  url?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  location?: string | null;
  price?: string | null;
  why?: string | null;
  needsRegistration?: boolean;
  registered?: boolean;
}) {
  ready();
  const id = uid();
  const now = nowISO();
  getDb()
    .prepare(
      `INSERT INTO event_recommendations (id, user_id, title, description, url, start_at, end_at, location, price, why, needs_registration, registered, status, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'suggested', 0, ?, ?)`,
    )
    .run(id, USER_ID, input.title.trim(), input.description ?? null, input.url ?? null, input.startAt ?? null, input.endAt ?? null, input.location ?? null, input.price ?? null, input.why ?? null, input.needsRegistration ? 1 : 0, input.registered ? 1 : 0, now, now);
  audit("create", "opportunity", id, null, input);
  return one<OpportunityRow>("SELECT * FROM event_recommendations WHERE id = ?", id)!;
}

export function updateOpportunity(id: string, patch: Record<string, unknown>) {
  ready();
  const current = one<OpportunityRow>("SELECT * FROM event_recommendations WHERE id = ? AND user_id = ?", id, USER_ID);
  if (!current) throw new HttpError("Мероприятие не найдено", 404);
  const next = {
    title: String(patch.title ?? current.title),
    description: patch.description === undefined ? current.description : patch.description,
    startAt: patch.startAt === undefined ? current.startAt : patch.startAt,
    endAt: patch.endAt === undefined ? current.endAt : patch.endAt,
    location: patch.location === undefined ? current.location : patch.location,
    price: patch.price === undefined ? current.price : patch.price,
    why: patch.why === undefined ? current.why : patch.why,
    needsRegistration: patch.needsRegistration === undefined ? current.needsRegistration : Boolean(patch.needsRegistration),
    registered: patch.registered === undefined ? current.registered : Boolean(patch.registered),
    status: String(patch.status ?? current.status),
    calendarEventId: patch.calendarEventId === undefined ? current.calendarEventId : patch.calendarEventId,
  };
  getDb()
    .prepare(
      `UPDATE event_recommendations SET title=?, description=?, start_at=?, end_at=?, location=?, price=?, why=?, needs_registration=?, registered=?, status=?, calendar_event_id=?, updated_at=? WHERE id=?`,
    )
    .run(...bind([next.title, next.description, next.startAt, next.endAt, next.location, next.price, next.why, next.needsRegistration ? 1 : 0, next.registered ? 1 : 0, next.status, next.calendarEventId, nowISO(), id]));
  return one<OpportunityRow>("SELECT * FROM event_recommendations WHERE id = ?", id)!;
}

export function listAudit(limit = 40) {
  ready();
  return rows<{ id: string; actor: string; action: string; entityType: string | null; entityId: string | null; createdAt: string }>(
    "SELECT id, actor, action, entity_type, entity_id, created_at FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    USER_ID,
    limit,
  );
}

export function recordGoalProgress(goalId: string, value: number, note?: string, actor = "user") {
  ready();
  getGoal(goalId);
  getDb().prepare("UPDATE goals SET metric_current = ?, metric_mode = 'manual', updated_at = ? WHERE id = ?").run(value, nowISO(), goalId);
  getDb().prepare("INSERT INTO goal_progress (id, goal_id, value, note, recorded_at) VALUES (?, ?, ?, ?, ?)").run(uid(), goalId, value, note ?? null, nowISO());
  audit("progress", "goal", goalId, null, { value, note }, actor);
  return getGoal(goalId);
}

export function clearDemo() {
  ready();
  const db = getDb();
  db.exec("BEGIN");
  try {
    db.exec(`
      DELETE FROM habit_logs WHERE habit_id IN (SELECT id FROM habits WHERE is_demo = 1);
      DELETE FROM habits WHERE is_demo = 1;
      DELETE FROM calendar_events WHERE is_demo = 1;
      DELETE FROM tasks WHERE is_demo = 1;
      DELETE FROM milestones WHERE is_demo = 1;
      DELETE FROM projects WHERE is_demo = 1;
      DELETE FROM ideas WHERE is_demo = 1;
      DELETE FROM event_recommendations WHERE is_demo = 1;
      DELETE FROM goals WHERE is_demo = 1;
      DELETE FROM life_areas WHERE is_demo = 1;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  audit("clear_demo", "user", USER_ID, null, { cleared: true });
  return { ok: true };
}

export function hasDemo() {
  ready();
  const count = getDb().prepare("SELECT COUNT(*) AS c FROM life_areas WHERE is_demo = 1").get() as { c: number };
  return count.c > 0;
}

export function loadContext(): InterpContext {
  const user = getUser();
  const tz = user.timezone || DEFAULT_TZ;
  const now = new Date();
  const today = todayKey(now, tz);
  const bounds = monthBounds(today);
  const span = daySpan(today, tz);
  const tasks = listTasks();
  const events = listEvents(addDaysIso(today, -1, tz), addDaysIso(today, 10, tz));
  const habits = listHabits();
  const habitLogs = habits.flatMap((habit) => listHabitLogs(habit.id, bounds.start, bounds.end));
  const checkin = getCheckin(today);
  const reflectionEnergy = listReflections().find((item) => item.energy)?.energy ?? null;
  const dayEvents = events.filter((event) => event.startAt < span.end && event.endAt > span.start);
  const monthDone = tasks.filter((task) => task.status === "done" && task.completedAt && task.completedAt.slice(0, 7) === today.slice(0, 7));
  const loggedMinutesByArea: Record<string, number> = {};
  for (const task of monthDone) {
    if (!task.areaId) continue;
    loggedMinutesByArea[task.areaId] = (loggedMinutesByArea[task.areaId] ?? 0) + (task.estimateMinutes ?? 0);
  }
  return {
    now: now.toISOString(),
    tz,
    energy: checkin?.energy ?? reflectionEnergy,
    freeMinutes: freeMinutes(today, tz, dayEvents.map((event) => ({ startAt: event.startAt, endAt: event.endAt }))),
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      estimateMinutes: task.estimateMinutes,
      rescheduleCount: task.rescheduleCount,
      goalId: task.goalId,
      goalTitle: task.goalTitle ?? null,
      areaId: task.areaId,
      dueAt: task.dueAt,
      scheduledStart: task.scheduledStart,
      scheduledEnd: task.scheduledEnd,
      financialRisk: task.financialRisk,
      priority: task.priority,
    })),
    habits: habits.map((habit) => ({
      id: habit.id,
      name: habit.name,
      goalId: habit.goalId,
      targetCount: habit.targetCount,
      preferredGapDays: habit.preferredGapDays,
    })),
    habitLogs: habitLogs.map((log) => ({ habitId: log.habitId, date: log.date, status: log.status })),
    events: events.map((event) => ({ id: event.id, title: event.title, startAt: event.startAt, endAt: event.endAt })),
    ideas: listIdeas().map((idea) => ({ id: idea.id, title: idea.title, status: idea.status })),
    goals: listGoals().map((goal) => ({
      id: goal.id,
      title: goal.title,
      horizon: goal.horizon,
      areaId: goal.areaId,
      parentId: goal.parentId,
      metricMode: goal.metricMode,
    })),
    areas: listAreas().map((area) => ({ id: area.id, name: area.name, slug: area.slug })),
    loggedMinutesByArea,
  };
}

function addDaysIso(day: string, amount: number, tz: string) {
  return daySpan(addDaysKey(day, amount, tz), tz).start;
}

export function weekBounds(tz: string, day = todayKey(new Date(), tz)) {
  return weekRange(day, tz);
}
