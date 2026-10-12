import { XMLParser } from "fast-xml-parser";
import { eventsToIcs, parseIcs, type ParsedIcsEvent } from "@/lib/ics";
import { fromZonedTime } from "date-fns-tz";

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => ["response", "propstat", "comp", "href"].includes(name),
});

export type RemoteCalendar = { href: string; name: string };

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "#text" in value) return String((value as { "#text": string })["#text"]);
  return "";
}

export function mapCaldavStatus(status: number) {
  if (status === 401 || status === 403) return "Пароль не подошёл. Нужен пароль приложения Apple, не основной пароль аккаунта.";
  if (status === 404) return "Календарь по этому адресу не найден.";
  if (status === 409 || status === 412) return "Конфликт: событие в iCloud изменилось. Локальную версию не перезаписываю.";
  if (status >= 500) return "iCloud сейчас отвечает ошибкой. Локальный календарь продолжает работать.";
  return `iCloud ответил статусом ${status}.`;
}

export function parsePrincipal(xml: string) {
  const doc = parser.parse(xml);
  const responses = asArray(doc?.multistatus?.response);
  for (const response of responses) {
    const propstats = asArray(response?.propstat);
    for (const propstat of propstats) {
      const href = propstat?.prop?.["current-user-principal"]?.href;
      const value = textOf(asArray(href)[0] ?? href);
      if (value) return value;
    }
  }
  return null;
}

export function parseCalendarHome(xml: string) {
  const doc = parser.parse(xml);
  const responses = asArray(doc?.multistatus?.response);
  for (const response of responses) {
    for (const propstat of asArray(response?.propstat)) {
      const href = propstat?.prop?.["calendar-home-set"]?.href;
      const value = textOf(asArray(href)[0] ?? href);
      if (value) return value;
    }
  }
  return null;
}

export function parseCalendarList(xml: string): RemoteCalendar[] {
  const doc = parser.parse(xml);
  const calendars: RemoteCalendar[] = [];
  for (const response of asArray(doc?.multistatus?.response)) {
    const href = textOf(asArray(response.href)[0] ?? response.href);
    let name = "";
    let isCalendar = false;
    let supportsEvents = false;
    for (const propstat of asArray(response.propstat)) {
      const prop = propstat?.prop;
      if (!prop) continue;
      if (prop.displayname) name = textOf(prop.displayname);
      const resource = prop.resourcetype;
      if (resource && typeof resource === "object" && "calendar" in resource) isCalendar = true;
      const comps = asArray(prop["supported-calendar-component-set"]?.comp);
      if (comps.some((comp) => comp?.["@_name"] === "VEVENT" || comp?.name === "VEVENT")) supportsEvents = true;
    }
    if (href && isCalendar && (supportsEvents || !name || true)) {
      if (isCalendar) calendars.push({ href, name: name || "Календарь" });
    }
  }
  return calendars;
}

export function parseEventReport(xml: string): { href: string; etag: string | null; event: ParsedIcsEvent }[] {
  const doc = parser.parse(xml);
  const found: { href: string; etag: string | null; event: ParsedIcsEvent }[] = [];
  for (const response of asArray(doc?.multistatus?.response)) {
    const href = textOf(asArray(response.href)[0] ?? response.href);
    for (const propstat of asArray(response.propstat)) {
      const prop = propstat?.prop;
      const data = textOf(prop?.["calendar-data"]);
      if (!data) continue;
      const etag = textOf(prop?.getetag) || null;
      for (const event of parseIcs(data)) found.push({ href, etag, event });
    }
  }
  return found;
}

export function resolveHref(base: string, href: string) {
  return new URL(href, base).toString();
}

export function calendarQueryXml(startUtc: Date, endUtc: Date) {
  const start = startUtc.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const end = endUtc.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${start}" end="${end}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
}

export async function caldavRequest(opts: {
  url: string;
  method: string;
  appleId: string;
  appPassword: string;
  body?: string;
  depth?: string;
  contentType?: string;
  headers?: Record<string, string>;
}) {
  let response: Response;
  try {
    response = await fetch(opts.url, {
      method: opts.method,
      redirect: "follow",
      headers: {
        Authorization: `Basic ${Buffer.from(`${opts.appleId}:${opts.appPassword}`).toString("base64")}`,
        Depth: opts.depth ?? "0",
        "Content-Type": opts.contentType ?? "application/xml; charset=utf-8",
        "User-Agent": "LifeOS/0.1",
        ...opts.headers,
      },
      body: opts.body,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error("iCloud сейчас недоступен. Локальный календарь работает как обычно.");
  }
  const text = await response.text();
  if (!response.ok && response.status !== 207) {
    throw new Error(mapCaldavStatus(response.status));
  }
  return { status: response.status, text, etag: response.headers.get("etag") };
}

export async function discoverCalendars(appleId: string, appPassword: string) {
  const root = await caldavRequest({
    url: "https://caldav.icloud.com/",
    method: "PROPFIND",
    appleId,
    appPassword,
    depth: "0",
    body: `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`,
  });
  const principal = parsePrincipal(root.text);
  if (!principal) throw new Error("iCloud не вернул профиль календаря.");
  const principalUrl = resolveHref("https://caldav.icloud.com/", principal);
  const homeRes = await caldavRequest({
    url: principalUrl,
    method: "PROPFIND",
    appleId,
    appPassword,
    depth: "0",
    body: `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-home-set/></d:prop>
</d:propfind>`,
  });
  const home = parseCalendarHome(homeRes.text);
  if (!home) throw new Error("iCloud не вернул список календарей.");
  const homeUrl = resolveHref(principalUrl, home);
  const listRes = await caldavRequest({
    url: homeUrl,
    method: "PROPFIND",
    appleId,
    appPassword,
    depth: "1",
    body: `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <c:supported-calendar-component-set/>
  </d:prop>
</d:propfind>`,
  });
  const calendars = parseCalendarList(listRes.text).map((calendar) => ({
    ...calendar,
    href: resolveHref(homeUrl, calendar.href),
  }));
  if (!calendars.length) throw new Error("В аккаунте не нашлось календарей с событиями.");
  return calendars;
}

export async function pullEvents(opts: { calendarHref: string; appleId: string; appPassword: string; start: Date; end: Date }) {
  const response = await caldavRequest({
    url: opts.calendarHref,
    method: "REPORT",
    appleId: opts.appleId,
    appPassword: opts.appPassword,
    depth: "1",
    body: calendarQueryXml(opts.start, opts.end),
  });
  return parseEventReport(response.text).map((item) => {
    let startIso = item.event.startIso;
    let endIso = item.event.endIso;
    if (item.event.tzid && !item.event.startIso.endsWith("Z") && !item.event.startIso.includes("+")) {
      try {
        startIso = fromZonedTime(item.event.startIso, item.event.tzid).toISOString();
        endIso = fromZonedTime(item.event.endIso, item.event.tzid).toISOString();
      } catch {
        startIso = new Date(item.event.startIso).toISOString();
        endIso = new Date(item.event.endIso).toISOString();
      }
    }
    return { ...item, event: { ...item.event, startIso, endIso } };
  });
}

export async function pushEvent(opts: {
  href: string;
  appleId: string;
  appPassword: string;
  uid: string;
  title: string;
  notes?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  etag?: string | null;
}) {
  const body = eventsToIcs([
    {
      uid: opts.uid,
      title: opts.title,
      notes: opts.notes,
      location: opts.location,
      startAt: opts.startAt,
      endAt: opts.endAt,
    },
  ]);
  const headers: Record<string, string> = {};
  if (opts.etag) headers["If-Match"] = opts.etag;
  const response = await caldavRequest({
    url: opts.href,
    method: "PUT",
    appleId: opts.appleId,
    appPassword: opts.appPassword,
    body,
    contentType: "text/calendar; charset=utf-8",
    depth: "0",
    headers,
  });
  return response.etag;
}
