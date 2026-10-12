import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const DEFAULT_TZ = "Asia/Bangkok";
export const MOSCOW_TZ = "Europe/Moscow";

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

const WEEKDAYS = [
  "",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
  "воскресенье",
];

const WEEKDAYS_SHORT = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];

export function nowISO() {
  return new Date().toISOString();
}

export function zonedDate(dayKey: string, time: string, tz: string) {
  return fromZonedTime(`${dayKey} ${time}:00`, tz);
}

export function todayKey(date: Date, tz: string) {
  return formatInTimeZone(date, tz, "yyyy-MM-dd");
}

export function addDaysKey(dayKey: string, days: number, tz: string) {
  const noon = fromZonedTime(`${dayKey}T12:00:00`, tz);
  return formatInTimeZone(addDays(noon, days), tz, "yyyy-MM-dd");
}

export function isoDow(dayKey: string, tz: string) {
  const noon = fromZonedTime(`${dayKey}T12:00:00`, tz);
  return Number(formatInTimeZone(noon, tz, "i"));
}

export function weekdayName(dayKey: string, tz: string, short = false) {
  const dow = isoDow(dayKey, tz);
  return short ? WEEKDAYS_SHORT[dow] : WEEKDAYS[dow];
}

export function formatLongDate(dayKey: string, tz: string) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return `${weekdayName(dayKey, tz)}, ${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatShortDate(dayKey: string) {
  const [, m, d] = dayKey.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function formatTime(iso: string, tz: string) {
  return formatInTimeZone(new Date(iso), tz, "HH:mm");
}

export function formatDayTime(iso: string, tz: string) {
  const day = formatInTimeZone(new Date(iso), tz, "yyyy-MM-dd");
  return `${formatShortDate(day)}, ${formatTime(iso, tz)}`;
}

export function formatDualTime(iso: string, tz: string, secondaryTz?: string | null) {
  const local = formatTime(iso, tz);
  if (!secondaryTz || secondaryTz === tz) return local;
  return `${local} · ${formatTime(iso, secondaryTz)} МСК`;
}

export function toLocalInput(iso: string, tz: string) {
  return formatInTimeZone(new Date(iso), tz, "yyyy-MM-dd'T'HH:mm");
}

export function fromLocalInput(value: string, tz: string) {
  const [date, time] = value.split("T");
  if (!date || !time) throw new Error("Укажите дату и время");
  return zonedDate(date, time.slice(0, 5), tz).toISOString();
}

export function monthBounds(dayKey: string) {
  const [y, m] = dayKey.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return {
    start: `${y}-${mm}-01`,
    end: `${y}-${mm}-${String(days).padStart(2, "0")}`,
    year: y,
    month: m,
    days,
    label: `${MONTHS[m - 1]} ${y}`,
  };
}

export function weekRange(dayKey: string, tz: string) {
  const dow = isoDow(dayKey, tz);
  const start = addDaysKey(dayKey, -(dow - 1), tz);
  const end = addDaysKey(start, 6, tz);
  const noon = fromZonedTime(`${start}T12:00:00`, tz);
  const key = formatInTimeZone(noon, tz, "RRRR-'W'II");
  return { start, end, key };
}

export function quarterKey(dayKey: string) {
  const [y, m] = dayKey.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  return `${y}-Q${q}`;
}

export function periodKey(dayKey: string, period: "day" | "week" | "month" | "quarter" | "year", tz: string) {
  if (period === "day") return dayKey;
  if (period === "week") return weekRange(dayKey, tz).key;
  if (period === "month") return dayKey.slice(0, 7);
  if (period === "quarter") return quarterKey(dayKey);
  return dayKey.slice(0, 4);
}

export function eachDay(start: string, end: string, tz: string) {
  const days: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    cursor = addDaysKey(cursor, 1, tz);
  }
  return days;
}

export function nextWeekday(fromDay: string, targetDow: number, tz: string, timePassed: boolean) {
  const current = isoDow(fromDay, tz);
  let delta = (targetDow - current + 7) % 7;
  if (delta === 0 && timePassed) delta = 7;
  return addDaysKey(fromDay, delta, tz);
}

export function greeting(date: Date, tz: string) {
  const hour = Number(formatInTimeZone(date, tz, "H"));
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

export function humanDuration(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h && rest) return `${h} ч ${rest} мин`;
  if (h) return `${h} ч`;
  return `${rest} мин`;
}

export function ruDays(n: number) {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "день" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "дня" : "дней";
  return `${n} ${word}`;
}

export type Busy = { startAt: string; endAt: string };

export function findFreeSlots(opts: {
  dayKey: string;
  tz: string;
  events: Busy[];
  durationMin: number;
  dayStart?: string;
  dayEnd?: string;
  limit?: number;
}) {
  const dayStart = opts.dayStart ?? "08:00";
  const dayEnd = opts.dayEnd ?? "20:00";
  const windowStart = zonedDate(opts.dayKey, dayStart, opts.tz).getTime();
  const windowEnd = zonedDate(opts.dayKey, dayEnd, opts.tz).getTime();
  const duration = opts.durationMin * 60_000;
  const busy = opts.events
    .map((event) => ({
      start: new Date(event.startAt).getTime(),
      end: new Date(event.endAt).getTime(),
    }))
    .filter((item) => item.end > windowStart && item.start < windowEnd)
    .sort((a, b) => a.start - b.start);

  const gaps: { start: number; end: number }[] = [];
  let cursor = windowStart;
  for (const item of busy) {
    const start = Math.max(item.start, windowStart);
    const end = Math.min(item.end, windowEnd);
    if (start > cursor) gaps.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  }
  if (cursor < windowEnd) gaps.push({ start: cursor, end: windowEnd });

  const slots: { startAt: string; endAt: string }[] = [];
  for (const gap of gaps) {
    if (gap.end - gap.start < duration) continue;
    slots.push({
      startAt: new Date(gap.start).toISOString(),
      endAt: new Date(gap.start + duration).toISOString(),
    });
    if (slots.length >= (opts.limit ?? 3)) break;
  }
  return slots;
}

export function freeMinutes(dayKey: string, tz: string, events: Busy[]) {
  const slots = findFreeSlots({ dayKey, tz, events, durationMin: 30, limit: 20 });
  const windowStart = zonedDate(dayKey, "08:00", tz).getTime();
  const windowEnd = zonedDate(dayKey, "20:00", tz).getTime();
  const busy = events
    .map((event) => ({
      start: Math.max(new Date(event.startAt).getTime(), windowStart),
      end: Math.min(new Date(event.endAt).getTime(), windowEnd),
    }))
    .filter((item) => item.end > item.start);
  let blocked = 0;
  for (const item of busy) blocked += item.end - item.start;
  const total = windowEnd - windowStart;
  return Math.max(0, Math.round((total - blocked) / 60_000));
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(bStart).getTime() < new Date(aEnd).getTime();
}

export function daySpan(dayKey: string, tz: string) {
  return {
    start: zonedDate(dayKey, "00:00", tz).toISOString(),
    end: zonedDate(addDaysKey(dayKey, 1, tz), "00:00", tz).toISOString(),
  };
}
