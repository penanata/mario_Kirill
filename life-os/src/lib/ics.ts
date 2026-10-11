export type IcsDraft = {
  uid: string;
  title: string;
  notes?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  allDay?: boolean;
};

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function unescapeIcs(value: string) {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

export function toIcsUtc(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function parseIcsDate(value: string, params: string) {
  if (/VALUE=DATE/i.test(params) && /^\d{8}$/.test(value)) {
    const year = value.slice(0, 4);
    const month = value.slice(4, 6);
    const day = value.slice(6, 8);
    return { iso: new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString(), allDay: true, tzid: null as string | null };
  }
  const tzid = /TZID=([^;:]+)/i.exec(params)?.[1] ?? null;
  if (value.endsWith("Z")) {
    const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15) || "00"}Z`;
    return { iso: new Date(iso).toISOString(), allDay: false, tzid };
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const local = `${year}-${month}-${day}T${hour}:${minute}:${second || "00"}`;
  if (tzid) {
    return { iso: local, allDay: false, tzid };
  }
  return { iso: new Date(`${local}Z`).toISOString(), allDay: false, tzid: null };
}

export function eventsToIcs(events: IcsDraft[], calendarName = "Life OS") {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Life OS//Calendar//RU",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
  ];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcs(event.uid)}`,
      `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
      `DTSTART:${toIcsUtc(event.startAt)}`,
      `DTEND:${toIcsUtc(event.endAt)}`,
      `SUMMARY:${escapeIcs(event.title)}`,
    );
    if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
    if (event.notes) lines.push(`DESCRIPTION:${escapeIcs(event.notes)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export type ParsedIcsEvent = {
  uid: string;
  title: string;
  notes: string | null;
  location: string | null;
  startIso: string;
  endIso: string;
  allDay: boolean;
  tzid: string | null;
};

export function parseIcs(ics: string): ParsedIcsEvent[] {
  const unfolded = ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  return unfolded
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((block) => {
      const body = block.split("END:VEVENT")[0];
      const fields = new Map<string, { params: string; value: string }>();
      for (const line of body.split(/\r?\n/)) {
        const index = line.indexOf(":");
        if (index < 0) continue;
        const left = line.slice(0, index);
        const value = unescapeIcs(line.slice(index + 1).trim());
        const name = left.split(";")[0].toUpperCase();
        fields.set(name, { params: left, value });
      }
      const uid = fields.get("UID")?.value;
      const start = fields.get("DTSTART");
      if (!uid || !start) return null;
      const parsedStart = parseIcsDate(start.value, start.params);
      if (!parsedStart) return null;
      const endField = fields.get("DTEND");
      const parsedEnd = endField ? parseIcsDate(endField.value, endField.params) : null;
      const endIso = parsedEnd?.iso ?? new Date(new Date(parsedStart.iso).getTime() + 60 * 60_000).toISOString();
      return {
        uid,
        title: fields.get("SUMMARY")?.value || "Без названия",
        notes: fields.get("DESCRIPTION")?.value ?? null,
        location: fields.get("LOCATION")?.value ?? null,
        startIso: parsedStart.iso,
        endIso,
        allDay: parsedStart.allDay,
        tzid: parsedStart.tzid,
      };
    })
    .filter((event): event is ParsedIcsEvent => Boolean(event));
}
