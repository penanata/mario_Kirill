import { existsSync, mkdirSync } from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { nowISO } from "@/lib/time";

const MIGRATION = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS life_areas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  area_id TEXT,
  parent_id TEXT,
  horizon TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metric_name TEXT,
  metric_target REAL,
  metric_current REAL,
  metric_mode TEXT NOT NULL DEFAULT 'none',
  unit TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  target_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  area_id TEXT,
  goal_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  goal_id TEXT,
  area_id TEXT,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  estimate_minutes INTEGER,
  due_at TEXT,
  scheduled_start TEXT,
  scheduled_end TEXT,
  completed_at TEXT,
  reschedule_count INTEGER NOT NULL DEFAULT 0,
  financial_risk INTEGER NOT NULL DEFAULT 0,
  energy TEXT,
  outcome TEXT,
  source TEXT NOT NULL DEFAULT 'user',
  is_demo INTEGER NOT NULL DEFAULT 0,
  fingerprint TEXT,
  blocked_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  calendar_href TEXT,
  external_uid TEXT,
  source TEXT NOT NULL DEFAULT 'local',
  title TEXT NOT NULL,
  notes TEXT,
  location TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  secondary_tz TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  task_id TEXT,
  etag TEXT,
  href TEXT,
  sync_state TEXT NOT NULL DEFAULT 'local',
  conflict TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  area_id TEXT,
  goal_id TEXT,
  name TEXT NOT NULL,
  target_count INTEGER NOT NULL,
  period TEXT NOT NULL DEFAULT 'month',
  preferred_gap_days INTEGER NOT NULL DEFAULT 1,
  unit TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(habit_id, date)
);

CREATE TABLE IF NOT EXISTS reflections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  period TEXT NOT NULL,
  period_key TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  summary TEXT,
  energy INTEGER,
  status TEXT NOT NULL DEFAULT 'complete',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  area_id TEXT,
  goal_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  value_note TEXT,
  time_cost TEXT,
  money_cost TEXT,
  uncertainty TEXT,
  next_step TEXT,
  ai_recommendation TEXT,
  related_idea_id TEXT,
  confirmed INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  fingerprint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  mode TEXT,
  mode_state_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_action_proposals (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  user_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  actions_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result_json TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS event_recommendations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  start_at TEXT,
  end_at TEXT,
  location TEXT,
  price TEXT,
  why TEXT,
  needs_registration INTEGER NOT NULL DEFAULT 0,
  registered INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'suggested',
  calendar_event_id TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY,
  daily_reflection_enabled INTEGER NOT NULL DEFAULT 1,
  daily_reflection_time TEXT NOT NULL DEFAULT '21:00',
  weekly_reflection_enabled INTEGER NOT NULL DEFAULT 1,
  weekly_reflection_weekday INTEGER NOT NULL DEFAULT 0,
  weekly_reflection_time TEXT NOT NULL DEFAULT '18:00',
  habit_reminder_enabled INTEGER NOT NULL DEFAULT 0,
  push_enabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS integration_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  account_label TEXT,
  secret_ciphertext TEXT,
  meta_json TEXT,
  status TEXT NOT NULL DEFAULT 'needs_setup',
  last_sync_at TEXT,
  last_error TEXT,
  selected_calendar_href TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  energy INTEGER,
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS goal_progress (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  value REAL NOT NULL,
  note TEXT,
  recorded_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_uid ON calendar_events(user_id, external_uid);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_events_start ON calendar_events(user_id, start_at);
CREATE INDEX IF NOT EXISTS idx_logs_habit ON habit_logs(habit_id, date);
`;

type SqlDatabase = DatabaseSync;

let database: SqlDatabase | null = null;

export function getDb() {
  if (database) return database;
  const configured = process.env.LIFEOS_DB_PATH || path.join(process.cwd(), "data", "life-os.sqlite");
  if (configured !== ":memory:") {
    mkdirSync(path.dirname(configured), { recursive: true });
  }
  database = new DatabaseSync(configured);
  if (configured !== ":memory:") database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  migrate(database);
  return database;
}

export function closeDb() {
  database?.close();
  database = null;
}

function addColumn(db: SqlDatabase, table: string, column: string, type: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

function migrate(db: SqlDatabase) {
  db.exec(MIGRATION);
  addColumn(db, "calendar_events", "area_id", "TEXT");
  addColumn(db, "calendar_events", "group_key", "TEXT");
  const existing = db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get("001_init");
  if (!existing) {
    db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run("001_init", nowISO());
  }
}

export function dbPathExists() {
  const configured = process.env.LIFEOS_DB_PATH || path.join(process.cwd(), "data", "life-os.sqlite");
  return configured === ":memory:" || existsSync(configured);
}
