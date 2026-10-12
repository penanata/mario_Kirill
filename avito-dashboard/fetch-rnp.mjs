import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, 'rnp.json');
const clientId = process.env.AVITO_CLIENT_ID || '';
const clientSecret = process.env.AVITO_CLIENT_SECRET || '';

function write(data) {
  writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');
}

if (!clientId || !clientSecret) {
  console.log('AVITO_CLIENT_ID or AVITO_CLIENT_SECRET is empty; snapshot left unchanged.');
  process.exit(0);
}

function moscowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = type => Number(parts.find(part => part.type === type).value);
  return { y: get('year'), m: get('month'), d: get('day') };
}
function iso(parts) {
  return parts.y + '-' + String(parts.m).padStart(2, '0') + '-' + String(parts.d).padStart(2, '0');
}
function shift(parts, days) {
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  date.setUTCDate(date.getUTCDate() + days);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}
function ranges() {
  const today = moscowParts();
  const monthStart = { y: today.y, m: today.m, d: 1 };
  const prevEnd = shift(monthStart, -1);
  const prevStart = { y: prevEnd.y, m: prevEnd.m, d: 1 };
  return {
    month: { from: iso(monthStart), to: iso(today) },
    prevmonth: { from: iso(prevStart), to: iso(prevEnd) },
    '7': { from: iso(shift(today, -6)), to: iso(today) },
    '30': { from: iso(shift(today, -29)), to: iso(today) },
  };
}
function money(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n / 100 : 0;
}
function metricsOf(list) {
  const metrics = {};
  (list || []).forEach(item => { if (item && item.slug != null) metrics[item.slug] = Number(item.value) || 0; });
  return metrics;
}
function card(id, info, metrics) {
  const m = metricsOf(metrics);
  const impressions = m.impressions || 0;
  const views = m.views || 0;
  const contacts = m.contacts || 0;
  const orders = m.orderedItems || 0;
  let spend = money(m.spending || 0);
  const hasView = Object.prototype.hasOwnProperty.call(m, 'averageViewCost');
  const hasContact = Object.prototype.hasOwnProperty.call(m, 'averageContactCost');
  const viewOfficial = hasView ? money(m.averageViewCost) : null;
  if (!(m.spending > 0) && viewOfficial != null && views) spend = viewOfficial * views;
  return {
    id,
    title: (info && info.title) || ('Объявление ' + id),
    url: (info && info.url) || '',
    impressions, views, contacts, orders, spend,
    impCost: impressions ? spend / impressions : null,
    viewCost: hasView ? viewOfficial : (views ? spend / views : null),
    contactCost: hasContact ? money(m.averageContactCost) : (contacts ? spend / contacts : null),
  };
}
async function avito(path, opts, token) {
  const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch('https://api.avito.ru' + path, { method: opts.method || 'GET', headers, body: opts.body });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  const failed = !res.ok || (data && data.error && !data.access_token && !data.result && !data.resources && data.id == null);
  if (failed) {
    const err = new Error('avito');
    err.status = res.ok ? 401 : res.status;
    throw err;
  }
  return data;
}
async function itemPages(token, status) {
  const items = [];
  let per = 100;
  for (let page = 1; page <= 20; page++) {
    const query = 'per_page=' + per + '&page=' + page + (status ? '&status=' + encodeURIComponent(status) : '');
    let data;
    try { data = await avito('/core/v1/items?' + query, { method: 'GET' }, token); }
    catch (err) {
      if (page === 1 && per === 100 && err.status === 400) { per = 25; page = 0; continue; }
      throw err;
    }
    const list = (data && data.resources) || [];
    items.push(...list);
    if (list.length < per) break;
  }
  return items;
}
async function stats(token, userId, from, to) {
  const path = '/stats/v2/accounts/' + encodeURIComponent(userId) + '/items';
  const body = JSON.stringify({
    dateFrom: from,
    dateTo: to,
    grouping: 'item',
    metrics: ['impressions', 'views', 'contacts', 'orderedItems', 'averageViewCost', 'averageContactCost', 'spending'],
    limit: 1000,
    offset: 0,
  });
  try {
    return await avito(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, token);
  } catch (err) {
    if (err.status !== 429) throw err;
    await sleep(65000);
    return await avito(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, token);
  }
}
function rowsOf(items, payload) {
  const byId = new Map();
  items.forEach(item => { if (item && item.id != null) byId.set(Number(item.id), item); });
  const groupings = (payload && payload.result && payload.result.groupings) || [];
  const seen = new Set();
  const rows = [];
  groupings.forEach(group => {
    if (!group || (group.type && group.type !== 'item')) return;
    const id = Number(group.id);
    if (!id) return;
    seen.add(id);
    rows.push(card(id, byId.get(id), group.metrics));
  });
  items.forEach(item => {
    const id = Number(item && item.id);
    if (!id || seen.has(id)) return;
    if (item.status && item.status !== 'active') return;
    rows.push(card(id, item, []));
  });
  rows.sort((a, b) => b.contacts - a.contacts || b.views - a.views || b.impressions - a.impressions || String(a.title).localeCompare(String(b.title), 'ru'));
  return { rows, total: Number(payload && payload.result && payload.result.dataTotalCount) || groupings.length };
}

try {
  const tokenBody = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret });
  const tokenData = await avito('/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody }, null);
  const token = tokenData && tokenData.access_token;
  if (!token) throw Object.assign(new Error('token'), { status: 401 });
  const self = await avito('/core/v1/accounts/self', { method: 'GET' }, token);
  const userId = self && self.id;
  if (!userId) throw Object.assign(new Error('profile'), { status: 401 });
  let items = [];
  try { items = await itemPages(token, 'active,old'); }
  catch (err) {
    if (err.status === 401) throw err;
    try { items = await itemPages(token, 'active'); }
    catch (err2) { if (err2.status === 401) throw err2; items = []; }
  }
  const built = {};
  const windows = ranges();
  let first = true;
  for (const key of ['month', 'prevmonth', '7', '30']) {
    if (!first) await sleep(65000);
    first = false;
    const window = windows[key];
    const payload = await stats(token, userId, window.from, window.to);
    const table = rowsOf(items, payload);
    built[key] = { from: window.from, to: window.to, rows: table.rows, total: table.total };
    console.log(key, window.from, window.to, table.rows.length);
  }
  write({ ok: true, at: new Date().toISOString(), ranges: built });
} catch (err) {
  const code = err && err.status === 401 ? 'auth' : err && err.status === 429 ? 'rate' : 'fail';
  write({ ok: false, error: code, at: new Date().toISOString() });
  console.log('Avito snapshot failed:', code);
  process.exit(code === 'auth' ? 0 : 1);
}
