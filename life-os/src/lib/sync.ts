import { discoverCalendars, pullEvents, pushEvent } from "@/lib/caldav";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { createEvent, getIntegration, getUser, listEvents, saveIntegration, updateEvent } from "@/lib/store";
import { addDaysKey, daySpan, todayKey } from "@/lib/time";
import { uid } from "@/lib/utils";

export async function connectIcloud(appleId: string, appPassword: string) {
  const calendars = await discoverCalendars(appleId, appPassword);
  saveIntegration({
    accountLabel: appleId,
    secretCiphertext: encryptSecret(appPassword),
    metaJson: JSON.stringify({ calendars }),
    status: "connected",
    lastError: null,
    selectedCalendarHref: calendars[0]?.href ?? null,
  });
  return publicIntegration();
}

export function selectCalendar(href: string) {
  const integration = getIntegration();
  const calendars = integration?.metaJson ? (JSON.parse(integration.metaJson).calendars as { href: string; name: string }[]) : [];
  if (!calendars.some((calendar) => calendar.href === href)) {
    throw new Error("Такого календаря нет в подключённом аккаунте.");
  }
  saveIntegration({ selectedCalendarHref: href, status: integration?.secretCiphertext ? "connected" : "needs_setup" });
  return publicIntegration();
}

export async function syncIcloud() {
  const integration = getIntegration();
  if (!integration?.secretCiphertext || !integration.selectedCalendarHref) {
    throw new Error("iCloud требует подключения: нужен Apple ID и пароль приложения.");
  }
  const appleId = integration.accountLabel || "";
  const appPassword = decryptSecret(integration.secretCiphertext);
  const tz = getUser().timezone;
  const today = todayKey(new Date(), tz);
  const start = new Date(daySpan(addDaysKey(today, -7, tz), tz).start);
  const end = new Date(daySpan(addDaysKey(today, 60, tz), tz).start);
  try {
    const remote = await pullEvents({
      calendarHref: integration.selectedCalendarHref,
      appleId,
      appPassword,
      start,
      end,
    });
    const local = listEvents(start.toISOString(), end.toISOString());
    let imported = 0;
    let conflicts = 0;
    for (const item of remote) {
      const existing = local.find((event) => event.externalUid === item.event.uid);
      if (!existing) {
        createEvent({
          title: item.event.title,
          startAt: item.event.startIso,
          endAt: item.event.endIso,
          notes: item.event.notes,
          location: item.event.location,
          source: "icloud",
          externalUid: item.event.uid,
          href: item.href,
          etag: item.etag,
          calendarHref: integration.selectedCalendarHref,
          syncState: "synced",
          actor: "icloud",
        });
        imported += 1;
        continue;
      }
      if (existing.syncState === "pending_push" && existing.etag && item.etag && existing.etag !== item.etag) {
        updateEvent(existing.id, { conflict: "В iCloud есть другая версия. Локальные правки не затёрты.", syncState: "conflict" }, "icloud");
        conflicts += 1;
        continue;
      }
      if (existing.syncState !== "pending_push") {
        updateEvent(
          existing.id,
          {
            title: item.event.title,
            startAt: item.event.startIso,
            endAt: item.event.endIso,
            notes: item.event.notes,
            location: item.event.location,
            etag: item.etag,
            href: item.href,
            externalUid: item.event.uid,
            conflict: null,
            syncState: "synced",
          },
          "icloud",
        );
      }
    }
    const pending = listEvents().filter((event) => event.syncState === "pending_push");
    let pushed = 0;
    for (const event of pending) {
      const externalUid = event.externalUid || `${uid()}@lifeos`;
      const href = event.href || `${integration.selectedCalendarHref.replace(/\/$/, "")}/${externalUid}.ics`;
      const etag = await pushEvent({
        href,
        appleId,
        appPassword,
        uid: externalUid,
        title: event.title,
        notes: event.notes,
        location: event.location,
        startAt: event.startAt,
        endAt: event.endAt,
        etag: event.etag,
      });
      updateEvent(event.id, { externalUid, href, etag, conflict: null, syncState: "synced", source: event.source }, "icloud");
      pushed += 1;
    }
    saveIntegration({ status: "connected", lastSyncAt: new Date().toISOString(), lastError: null });
    return { imported, conflicts, pushed, ...publicIntegration() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось синхронизировать iCloud.";
    saveIntegration({ status: "error", lastError: message });
    throw new Error(message);
  }
}

export function disconnectIcloud() {
  saveIntegration({ secretCiphertext: null, status: "needs_setup", lastError: null, selectedCalendarHref: null, metaJson: null, accountLabel: null });
  return publicIntegration();
}

export function publicIntegration() {
  const integration = getIntegration();
  const calendars = integration?.metaJson ? (JSON.parse(integration.metaJson).calendars as { href: string; name: string }[]) : [];
  return {
    status: integration?.status ?? "needs_setup",
    account: integration?.accountLabel ?? null,
    lastSyncAt: integration?.lastSyncAt ?? null,
    lastError: integration?.lastError ?? null,
    selectedCalendarHref: integration?.selectedCalendarHref ?? null,
    calendars,
    hasSecret: Boolean(integration?.secretCiphertext),
  };
}
