import { lookup } from "dns/promises";
import { isIP } from "net";

function isPrivate(ip: string) {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export async function assertPublicUrl(raw: string, hops = 0): Promise<URL> {
  if (hops > 3) throw new Error("Слишком много переадресаций.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Некорректная ссылка.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Нужна ссылка http или https.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Внутренние адреса не открываю.");
  }
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((item) => item.address);
  if (ips.some(isPrivate)) throw new Error("Ссылка ведёт во внутреннюю сеть.");
  return url;
}

export async function fetchPublicHtml(raw: string, hops = 0): Promise<{ url: string; html: string }> {
  const url = await assertPublicUrl(raw, hops);
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "LifeOS/0.1", Accept: "text/html" },
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error("Редирект без адреса.");
    return fetchPublicHtml(new URL(location, url).toString(), hops + 1);
  }
  if (!response.ok) throw new Error("Страница не открылась.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Пустой ответ.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < 500_000) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
  }
  await reader.cancel().catch(() => undefined);
  const html = new TextDecoder().decode(Buffer.concat(chunks));
  return { url: url.toString(), html };
}

function meta(html: string, property: string) {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i");
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i");
  return pattern.exec(html)?.[1] ?? reverse.exec(html)?.[1] ?? null;
}

export type ExtractedEvent = {
  title: string | null;
  description: string | null;
  startAt: string | null;
  endAt: string | null;
  location: string | null;
  price: string | null;
  missing: string[];
};

export function extractEventFromHtml(html: string): ExtractedEvent {
  let title = meta(html, "og:title");
  let description = meta(html, "og:description");
  let startAt: string | null = null;
  let endAt: string | null = null;
  let location: string | null = null;
  let price: string | null = null;
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const script of scripts) {
    try {
      const data = JSON.parse(script[1]);
      const nodes = Array.isArray(data) ? data : [data, ...(data["@graph"] ?? [])];
      for (const node of nodes) {
        const type = JSON.stringify(node?.["@type"] ?? "");
        if (!/Event/i.test(type)) continue;
        title = title || node.name || null;
        description = description || node.description || null;
        startAt = startAt || node.startDate || null;
        endAt = endAt || node.endDate || null;
        location = location || node.location?.name || node.location?.address?.streetAddress || null;
        const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
        if (offer?.price) price = `${offer.price} ${offer.priceCurrency ?? ""}`.trim();
      }
    } catch {
      continue;
    }
  }
  if (!title) title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
  const time = html.match(/<time[^>]*datetime=["']([^"']+)["']/i)?.[1];
  if (!startAt && time) startAt = time;
  if (!price) {
    if (/бесплатно/i.test(html)) price = "бесплатно";
    else {
      const money = html.match(/(\d[\d\s]{0,8})\s*(₽|руб(?:лей|ля|\.)?|бат|฿|THB)/i);
      if (money) price = `${money[1].replace(/\s/g, "")} ${money[2]}`;
    }
  }
  const missing = [
    !title ? "название" : null,
    !startAt ? "дата и время" : null,
    !location ? "место" : null,
    !price ? "стоимость" : null,
  ].filter((item): item is string => Boolean(item));
  return { title, description, startAt, endAt, location, price, missing };
}
