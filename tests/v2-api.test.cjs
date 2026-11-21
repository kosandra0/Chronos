'use strict';
// WatchTower 2.0 features against the PACKAGED server (isolated temp data directories only; the scheduler is driven
// through the WATCHTOWER_TEST_HOOKS tick endpoint with explicit clock times; nothing touches the user's data).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers.cjs');
const ranges = require(path.join(__dirname, '..', 'src', 'lib', 'ranges.ts'));

const present = fs.existsSync(h.packagedServerDir);
const skip = !present && process.env.WATCHTOWER_REQUIRE_PACKAGE !== '1' ? 'packaged build not found (run npm run desktop:dir)' : false;
const MIN = 60000;
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const at = (day, hh, mm = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm).getTime();
const iso = (ms) => new Date(ms).toISOString();
const now = new Date();
const today = dayStart(now), yday = addD(today, -1);
const monday = addD(today, -((today.getDay() + 6) % 7));
const lastMon = addD(monday, -7), prevMon = addD(monday, -14);

const APPS = [
  { id: 'chrome', key: 'chrome.exe', name: 'Google Chrome', category: 'Browsers' },
  { id: 'notepad', key: 'notepad.exe', name: 'Notepad', category: 'Productivity' },
  { id: 'game', key: 'game.exe', name: 'Space Game', category: 'Gaming' },
];
function fileWith(sessions) {
  return {
    schema: 'watchtower-export', schemaVersion: 2, appVersion: '2.0.0', exportedAt: iso(Date.now()), timezone: tz,
    applications: APPS.map((a) => ({ id: a.id, identityKey: a.key, name: a.name, executableName: a.key, executablePath: null, category: a.category, categoryOverridden: false, detectionStatus: 'ok', elevated: false, firstSeen: iso(at(prevMon, 9)), lastSeen: iso(at(today, 9)) })),
    sessions: sessions.map(([app, s, e, type], i) => ({ id: `v${i}`, applicationId: app, startTime: iso(s), endTime: iso(e), durationMs: e - s, activityType: type || 'app', terminationReason: null, windowTitle: null, source: 'agent', date: '2000-01-01' })),
    dailyStatistics: [], historicalStatistics: {}, categories: {}, settings: {}, gamification: { totalXp: 0, level: 1, achievements: [] }, backupMetadata: [],
  };
}

const registry = new WeakMap();
function lab(t, { bundle = h.packagedServerDir, dataDir: given } = {}) {
  const { root, dest } = h.isolateBundle(bundle);
  const dataDir = given || path.join(root, 'data'); fs.mkdirSync(dataDir, { recursive: true });
  // one cleanup per test: stop EVERY server first, then delete the temp folders (a running server locks its data folder)
  if (!registry.has(t)) { const reg = { servers: [], roots: [] }; registry.set(t, reg); t.after(async () => { for (const s of reg.servers) await h.stopServer(s); for (const r of reg.roots) await h.removeDir(r); }); }
  registry.get(t).roots.push(root);
  let srv = null;
  const api = {
    root, dataDir, base: '',
    async start() { const port = await h.freePort(); srv = h.startServer(dest, dataDir, port, { WATCHTOWER_TEST_HOOKS: '1' }); registry.get(t).servers.push(srv); await h.waitHealthy(srv, port); api.base = `http://127.0.0.1:${port}`; return api; },
    async stop() { await h.stopServer(srv); },
    get: (p) => h.request(`${api.base}${p}`),
    post: (p, body) => h.request(`${api.base}${p}`, { method: 'POST', body }),
    patch: (p, body) => h.request(`${api.base}${p}`, { method: 'PATCH', body }),
    put: (p, body) => h.request(`${api.base}${p}`, { method: 'PUT', body }),
    del: (p) => h.request(`${api.base}${p}`, { method: 'DELETE' }),
    tick: async (ms) => (await api.post('/api/v2/tick', { now: ms })).json.notes,
    async seed(sessions) { const r = await api.post('/api/import', { filename: 'seed.json', content: JSON.stringify(fileWith(sessions)), mode: 'merge' }); assert.equal(r.json.ok, true, r.text.slice(0, 300)); assert.equal(r.json.applied, true); },
  };
  return api;
}

test('upgrade from the REAL installed 1.1.0 server keeps every record and adds the new tables', { skip: skip || (!fs.existsSync(process.env.WATCHTOWER_OLD_SERVER || path.join(h.projectRoot, 'installer', 'WatchTower', 'resources', 'watchtower-server', 'server.js')) && 'no installed 1.1.0 server to upgrade from'), timeout: 600000 }, async (t) => {
  const oldDir = process.env.WATCHTOWER_OLD_SERVER || path.join(h.projectRoot, 'installer', 'WatchTower', 'resources', 'watchtower-server');
  const old = lab(t, { bundle: oldDir });
  await old.start();
  assert.equal((await old.get('/api/v2/projects')).status, 404, 'the old build has no 2.0 endpoints (it really is the old server)');
  await old.patch('/api/settings', { timezone: tz, theme: 'lavender', font: 'jetbrains', userName: 'Upgrader', dailyGoalHours: 5.5, radius: 9 });
  await old.seed([['chrome', at(yday, 10), at(yday, 11)], ['notepad', at(today, 9), at(today, 9, 30)]]);
  const before = { sessions: (await old.get('/api/sessions?pageSize=100')).json.total, apps: (await old.get('/api/apps')).json.apps.length, settings: (await old.get('/api/settings')).json };
  assert.ok(before.sessions >= 2 && before.apps >= 2);
  await old.stop();

  // start the NEW server on the very same database folder
  const next = lab(t, { dataDir: old.dataDir }); // new bundle, same data
  await next.start();
  const after = { sessions: (await next.get('/api/sessions?pageSize=100')).json.total, apps: (await next.get('/api/apps')).json.apps.length, settings: (await next.get('/api/settings')).json };
  assert.equal(after.sessions, before.sessions, 'session count preserved'); assert.equal(after.apps, before.apps, 'application count preserved');
  for (const k of ['theme', 'font', 'userName', 'dailyGoalHours', 'radius', 'timezone']) assert.equal(after.settings[k], before.settings[k], `${k} preserved`);
  assert.equal((await next.get('/api/v2/projects')).status, 200, 'additive migration created the 2.0 tables');
  assert.equal((await next.get('/api/health')).json.ok, true);
  const total = (await next.get(`/api/apps?from=${ranges.ymd(yday)}&to=${ranges.ymd(yday)}`)).json.apps.find((a) => a.id === 'chrome').total;
  assert.equal(total, 60 * MIN, 'old history is readable through the new period filter');
});

test('focus mode: validation, controls, restart persistence, sleep gap, notifications', { skip, timeout: 300000 }, async (t) => {
  const L = lab(t); await L.start();
  let r = await L.post('/api/v2/focus', { action: 'config', config: { focusMin: 9999, shortMin: 0, longMin: 'x', reminders: false } });
  assert.equal(r.json.config.focusMin, 180); assert.equal(r.json.config.shortMin, 1); assert.equal(r.json.config.longMin, 15, 'invalid value keeps the previous one'); assert.equal(r.json.config.reminders, false);
  assert.equal((await L.post('/api/v2/focus', { action: 'explode' })).status, 400);
  await L.post('/api/v2/focus', { action: 'config', config: { focusMin: 1, shortMin: 1, auto: false, notifyPhaseEnd: true } });
  const t0 = Date.now();
  r = await L.post('/api/v2/focus', { action: 'start' }); assert.equal(r.json.state.status, 'running'); assert.ok(r.json.remainingMs > 55000 && r.json.remainingMs <= 60000);
  r = await L.post('/api/v2/focus', { action: 'pause' }); assert.equal(r.json.state.status, 'paused'); const frozen = r.json.remainingMs;
  assert.equal((await L.get('/api/v2/focus')).json.remainingMs, frozen, 'paused time does not move');
  r = await L.post('/api/v2/focus', { action: 'resume' }); assert.equal(r.json.state.status, 'running');
  // restart keeps the timer
  await L.stop(); const L2 = lab(t, { dataDir: L.dataDir }); await L2.start();
  r = await L2.get('/api/v2/focus'); assert.equal(r.json.state.status, 'running', 'timer survived the restart'); assert.ok(r.json.remainingMs > 0 && r.json.remainingMs <= 60000);
  // ordinary elapse in <150 s steps completes the block exactly once
  const base = Date.now();
  await L2.tick(base + 30000); await L2.tick(base + 60000); let notes = await L2.tick(base + 90000);
  assert.ok(notes.some((n) => /Focus block complete/.test(n.title)), 'phase-complete notification queued'); assert.equal(notes.filter((n) => /Focus block complete/.test(n.title)).length, 1);
  const again = await L2.tick(base + 100000); assert.equal(again.filter((n) => /Focus block complete/.test(n.title)).length, 1, 'no duplicate on later ticks');
  assert.equal((await L2.get('/api/v2/focus')).json.state.status, 'idle', 'manual mode waits for the user');
  await L2.post('/api/v2/outbox', { ids: notes.map((n) => n.id) });
  // simulated sleep: a 3 hour jump must NOT complete or reset a new block; it freezes the timer instead
  await L2.post('/api/v2/focus', { action: 'start' }); const s0 = (await L2.get('/api/v2/focus')).json.state;
  const jump = Date.now() + 3 * 3600000; notes = await L2.tick(jump);
  assert.equal(notes.filter((n) => /complete/i.test(n.title)).length, 0, 'no notification for time the computer slept through');
  const s1 = (await L2.get('/api/v2/focus')).json.state; assert.equal(s1.status, 'running', 'the block is still running'); assert.ok(Math.abs((s1.endsAt - s0.endsAt) - 3 * 3600000) < 15000, 'the 3 hour jump moved the end time by the missed time instead of completing the block');
  const out = await L2.get('/api/v2/outbox'); assert.equal(out.json.notes.length, 0, 'everything acknowledged so far; the sleep jump queued nothing');
  await L2.tick(Date.now() + 3 * 3600000 + 60000); // keep the machinery exercised without time travel assertions
  await L2.post('/api/v2/outbox', { ids: out.json.notes.map((n) => n.id) }); assert.equal((await L2.get('/api/v2/outbox')).json.notes.length, 0, 'acknowledged notifications are removed');
});

test('limits: app + category, thresholds, one notification each, midnight reset, persistence', { skip, timeout: 300000 }, async (t) => {
  const L = lab(t); await L.start(); await L.patch('/api/settings', { timezone: tz, weeklyReportEnabled: false });
  // chrome used 10 min today; notepad 4 min today
  await L.seed([['chrome', at(today, 0, 1), at(today, 0, 11)], ['notepad', at(today, 0, 20), at(today, 0, 24)], ['chrome', at(addD(today, 1), 0, 1), at(addD(today, 1), 0, 13)]]);
  assert.equal((await L.post('/api/v2/limits', { kind: 'app', target: 'chrome', dailyMinutes: 0 })).status, 400);
  assert.equal((await L.post('/api/v2/limits', { kind: 'app', target: 'nope', dailyMinutes: 10 })).status, 400, 'unknown application');
  assert.equal((await L.post('/api/v2/limits', { kind: 'category', target: 'Nonsense', dailyMinutes: 10 })).status, 400);
  const warnApp = (await L.post('/api/v2/limits', { kind: 'app', target: 'chrome', dailyMinutes: 12, warnPct: 80 })).json; // 10/12 = 83% -> warn
  const reachedApp = (await L.post('/api/v2/limits', { kind: 'app', target: 'notepad', dailyMinutes: 4 })).json; // 4/4 -> reached
  const cat = (await L.post('/api/v2/limits', { kind: 'category', target: 'Browsers', dailyMinutes: 100 })).json; // 10% -> ok
  let g = (await L.get('/api/v2/limits')).json;
  const byId = new Map(g.limits.map((l) => [l.id, l]));
  assert.equal(byId.get(warnApp.id).state, 'warn'); assert.equal(byId.get(warnApp.id).usedMs, 10 * MIN); assert.equal(byId.get(warnApp.id).remainingMs, 2 * MIN);
  assert.equal(byId.get(reachedApp.id).state, 'reached'); assert.equal(byId.get(cat.id).state, 'ok'); assert.equal(byId.get(cat.id).usedMs, 10 * MIN, 'category usage sums its applications');
  const noon = at(today, 12, 0);
  let notes = await L.tick(noon);
  const titles = notes.map((n) => n.title + '|' + n.body);
  assert.equal(notes.length, 2, titles.join('; ')); assert.ok(notes.some((n) => /Approaching/.test(n.title) && /Google Chrome/.test(n.body))); assert.ok(notes.some((n) => /reached/.test(n.title) && /Notepad/.test(n.body)));
  assert.equal((await L.tick(noon + 60000)).length, 2, 'repeat ticks queue nothing new (still the same two pending)');
  await L.post('/api/v2/outbox', { ids: notes.map((n) => n.id) });
  assert.equal((await L.tick(noon + 120000)).length, 0, 'delivered notifications are not repeated the same day');
  // midnight reset: tomorrow chrome has 12 min of usage against a 12 minute limit
  notes = await L.tick(at(addD(today, 1), 12, 0));
  assert.ok(notes.some((n) => /reached/.test(n.title) && /Google Chrome/.test(n.body)), 'new local day notifies again');
  // edit, persistence, removal
  await L.post('/api/v2/limits', { id: warnApp.id, kind: 'app', target: 'chrome', dailyMinutes: 60, warnPct: 50 });
  await L.stop(); const L2 = lab(t, { dataDir: L.dataDir }); await L2.start();
  g = (await L2.get('/api/v2/limits')).json; assert.equal(g.limits.length, 3); assert.equal(g.limits.find((l) => l.id === warnApp.id).dailyMinutes, 60);
  await L2.del(`/api/v2/limits?id=${warnApp.id}`); assert.equal((await L2.get('/api/v2/limits')).json.limits.length, 2);
  const noLimitNotes = await L2.tick(at(today, 13, 0)); assert.ok(!noLimitNotes.some((n) => /Google Chrome/.test(n.body) && /Approaching/.test(n.title)), 'removed limit no longer notifies');
});

test('weekly report: completed weeks only, comparison, scheduler and delivery de-duplication across restarts', { skip, timeout: 300000 }, async (t) => {
  const L = lab(t); await L.start(); await L.patch('/api/settings', { timezone: tz, weeklyReportDay: 1, weeklyReportTime: '09:00' });
  // last completed week: chrome 4h + notepad 1h on Wednesday; the week before: chrome 2h
  const wed = addD(lastMon, 2);
  await L.seed([['chrome', at(wed, 9), at(wed, 13)], ['notepad', at(wed, 14), at(wed, 15)], ['chrome', at(addD(prevMon, 1), 9), at(addD(prevMon, 1), 11)], ['game', at(addD(lastMon, 3), 20), at(addD(lastMon, 3), 21)], ['chrome', at(today, 9), at(today, 9, 30)]]);
  let r = (await L.get('/api/v2/reports')).json;
  assert.deepEqual(r.range, { from: ranges.ymd(lastMon), to: ranges.ymd(addD(lastMon, 6)) }, 'defaults to the last COMPLETED week');
  assert.equal(r.totalMs, 6 * 3600000); assert.equal(r.previousTotalMs, 2 * 3600000); assert.equal(r.comparison.pct, 200); assert.equal(r.comparison.direction, 'up');
  assert.equal(r.topApps[0].name, 'Google Chrome'); assert.equal(r.topApps[0].ms, 4 * 3600000); assert.equal(r.byDay.length, 7); assert.equal(r.byDay[2].ms, 5 * 3600000);
  assert.equal(r.productive.ms, 1 * 3600000, 'Notepad (Productivity) is productive'); assert.equal(r.distracting.ms, 1 * 3600000, 'the game is distracting'); assert.equal(r.score, 50);
  assert.ok(r.topCategories.length >= 2);
  const cur = (await L.get(`/api/v2/reports?week=${ranges.ymd(monday)}`)).json; assert.equal(cur.range.from, ranges.ymd(lastMon), 'the incomplete current week is refused');
  const prev = (await L.get(`/api/v2/reports?week=${ranges.ymd(prevMon)}`)).json; assert.equal(prev.totalMs, 2 * 3600000); assert.equal(prev.comparison.pct, null, 'no data the week before -> undefined percentage, not Infinity');
  assert.equal((await L.get('/api/v2/reports?week=2026-11-18')).status, 200, 'a non-Monday falls back to the default');
  // scheduler: this Monday 09:30 local => the report for last week is delivered once
  const due = at(monday, 9, 30);
  let notes = await L.tick(due); const weekly = notes.filter((n) => /weekly/i.test(n.title)); assert.equal(weekly.length, 1); assert.match(weekly[0].body, /6h 00m/); assert.ok(weekly[0].route.startsWith('/reports'));
  assert.equal((await L.tick(due + 3600000)).filter((n) => /weekly/i.test(n.title)).length, 1, 'no second report the same week');
  await L.post('/api/v2/outbox', { ids: notes.map((n) => n.id) });
  await L.stop(); const L2 = lab(t, { dataDir: L.dataDir }); await L2.start();
  assert.equal((await L2.tick(due + 7200000)).filter((n) => /weekly/i.test(n.title)).length, 0, 'delivery record survives a restart: still no duplicate');
  assert.equal((await L2.tick(at(addD(monday, 7), 9, 30))).filter((n) => /weekly/i.test(n.title)).length, 1, 'the next week produces the next report');
  await L2.post('/api/v2/outbox', { ids: (await L2.get('/api/v2/outbox')).json.notes.map((n) => n.id) });
  await L2.patch('/api/settings', { weeklyReportEnabled: false });
  assert.equal((await L2.tick(at(addD(monday, 14), 9, 30))).filter((n) => /weekly/i.test(n.title)).length, 0, 'disabled: nothing is sent');
  const s = (await L2.patch('/api/settings', { weeklyReportDay: 9, weeklyReportTime: '99:99' })).json; assert.equal(s.weeklyReportDay, 6, 'day clamped'); assert.equal(s.weeklyReportTime, '09:00', 'invalid time ignored');
});

test('productivity: score maths, neutral exclusion, unavailable score, overrides survive restart, goals', { skip, timeout: 300000 }, async (t) => {
  const L = lab(t); await L.start(); await L.patch('/api/settings', { timezone: tz, productivityGoalHours: 0.5 });
  const d = ranges.ymd(today);
  assert.equal((await L.get('/api/v2/productivity')).json.current.score, null, 'no data: unavailable, not 0');
  await L.seed([['chrome', at(today, 1), at(today, 2)], ['notepad', at(today, 3), at(today, 3, 15)], ['game', at(today, 4), at(today, 4, 5)], ['notepad', at(yday, 3), at(yday, 3, 30)]]);
  let p = (await L.get(`/api/v2/productivity?day=${d}`)).json;
  assert.equal(p.current.neutralMs, 60 * MIN, 'Browsers are neutral'); assert.equal(p.current.productiveMs, 15 * MIN); assert.equal(p.current.distractingMs, 5 * MIN);
  assert.equal(p.current.score, 75, '15 / (15 + 5), neutral excluded');
  assert.equal(p.current.goal.pct, 50); assert.equal(p.current.goal.remainingMs, 15 * MIN); assert.equal(p.current.goal.met, false);
  assert.equal(p.change.productive.diff, -15 * MIN, 'compared with yesterday (30 min productive)');
  assert.equal(p.previous.score, 100, 'yesterday had only productive time: 30 / (30 + 0) = 100%');
  // overrides
  assert.equal((await L.put('/api/v2/productivity', { appId: 'chrome', class: 'bogus' })).status, 400); assert.equal((await L.put('/api/v2/productivity', { appId: 'nope', class: 'neutral' })).status, 404);
  assert.equal((await L.put('/api/v2/productivity', { appId: 'chrome', class: 'distracting' })).status, 200);
  p = (await L.get(`/api/v2/productivity?day=${d}`)).json;
  assert.equal(p.current.distractingMs, 65 * MIN); assert.equal(p.current.neutralMs, 0); assert.ok(Math.abs(p.current.score - (15 / 80) * 100) < 1e-9); assert.equal(p.current.apps.find((a) => a.id === 'chrome').overridden, true);
  await L.stop(); const L2 = lab(t, { dataDir: L.dataDir }); await L2.start();
  p = (await L2.get(`/api/v2/productivity?day=${d}`)).json; assert.equal(p.current.apps.find((a) => a.id === 'chrome').cls, 'distracting', 'override survives restart');
  await L2.put('/api/v2/productivity', { appId: 'chrome', class: null }); p = (await L2.get(`/api/v2/productivity?day=${d}`)).json; assert.equal(p.current.apps.find((a) => a.id === 'chrome').cls, 'neutral', 'reset restores the category default');
  await L2.patch('/api/settings', { productivityGoalHours: 0.25 }); p = (await L2.get(`/api/v2/productivity?day=${d}`)).json; assert.equal(p.current.goal.hours, 0.5, 'goal rounds to half hours'); assert.equal(p.current.goal.met, false);
  await L2.patch('/api/settings', { productivityGoalHours: 0 }); p = (await L2.get(`/api/v2/productivity?day=${d}`)).json; assert.equal(p.current.goal.pct, null, 'no goal set: no percentage'); assert.equal(p.current.goal.met, false);
  const r = (await L2.get(`/api/v2/productivity?from=${d}&to=${d}`)).json; assert.equal(r.productiveMs, 15 * MIN, 'period summary endpoint');
});

test('compare periods: week and month with application and category deltas', { skip, timeout: 300000 }, async (t) => {
  const L = lab(t); await L.start(); await L.patch('/api/settings', { timezone: tz });
  assert.equal((await L.get('/api/v2/compare?kind=year')).status, 400);
  const thisWeekDay = monday; // first day of this week (may be today)
  await L.seed([['chrome', at(thisWeekDay, 1), at(thisWeekDay, 3)], ['notepad', at(thisWeekDay, 4), at(thisWeekDay, 5)], ['chrome', at(addD(lastMon, 1), 9), at(addD(lastMon, 1), 14)], ['game', at(addD(lastMon, 2), 9), at(addD(lastMon, 2), 10)]]);
  const w = (await L.get('/api/v2/compare?kind=week')).json;
  assert.deepEqual(w.current, { from: ranges.ymd(monday), to: ranges.ymd(addD(monday, 6)) }); assert.deepEqual(w.previous, { from: ranges.ymd(lastMon), to: ranges.ymd(addD(lastMon, 6)) });
  assert.equal(w.total.current, 3 * 3600000); assert.equal(w.total.previous, 6 * 3600000); assert.equal(w.total.diff, -3 * 3600000); assert.equal(w.total.pct, -50); assert.equal(w.total.direction, 'down');
  assert.equal(w.productive.current, 3600000 * 1); assert.equal(w.distracting.previous, 3600000);
  const chrome = w.apps.find((a) => a.id === 'chrome'); assert.equal(chrome.current, 2 * 3600000); assert.equal(chrome.previous, 5 * 3600000); assert.equal(chrome.diff, -3 * 3600000);
  const game = w.apps.find((a) => a.id === 'game'); assert.equal(game.pct, -100); assert.equal(w.apps.find((a) => a.id === 'notepad').pct, null, 'new this week: undefined percentage');
  assert.equal(w.categories.find((c) => c.category === 'Browsers').diff, -3 * 3600000);
  const m = (await L.get('/api/v2/compare?kind=month')).json; assert.equal(m.current.from.slice(8), '01'); assert.ok(m.total.current >= 0);
  // the Statistics API agrees with the comparison totals
  const st = (await L.get(`/api/stats?from=${w.current.from}&to=${w.current.to}`)).json; assert.equal(st.totals.screen, w.total.current, 'same figures as Statistics');
  // equal periods and empty previous period
  const L2 = lab(t); await L2.start(); await L2.patch('/api/settings', { timezone: tz });
  const empty = (await L2.get('/api/v2/compare?kind=week')).json; assert.equal(empty.total.pct, 0); assert.equal(empty.total.direction, 'same');
});

test('projects: create, edit, assign, reassign, reports, billing, currency, CSV, delete safety', { skip, timeout: 300000 }, async (t) => {
  const L = lab(t); await L.start(); await L.patch('/api/settings', { timezone: tz });
  const d1 = lastMon, d2 = addD(lastMon, 1);
  await L.seed([['chrome', at(d1, 9), at(d1, 10, 30)], ['notepad', at(d1, 11), at(d1, 11, 30)], ['chrome', at(d2, 9), at(d2, 10)], [null, at(d2, 12), at(d2, 12, 10), 'desktop'], [null, at(d2, 13), at(d2, 14), 'idle']]);
  const sid = (i) => `v${i}`;
  assert.equal((await L.post('/api/v2/projects', { name: '   ' })).status, 400);
  assert.equal((await L.post('/api/v2/projects', { name: 'X', color: 'red' })).status, 400); assert.equal((await L.post('/api/v2/projects', { name: 'X', rate: -5 })).status, 400);
  const site = (await L.post('/api/v2/projects', { name: 'Website', client: 'Acme', color: '#ff8800', rate: 100, billable: true })).json;
  assert.equal((await L.post('/api/v2/projects', { name: 'website', client: 'ACME' })).status, 409, 'duplicate name+client');
  const intl = (await L.post('/api/v2/projects', { name: 'Internal', client: '', rate: 50, billable: false })).json;
  assert.equal(site.rate, 100); assert.equal(site.archived, false);
  assert.deepEqual((await L.post('/api/v2/projects/assign', { sessionIds: [sid(0), sid(1), sid(2)], projectId: site.id })).json, { updated: 3, ignored: 0 });
  assert.equal((await L.post('/api/v2/projects/assign', { sessionIds: [sid(3)], projectId: intl.id })).json.updated, 1, 'desktop sessions can be assigned');
  assert.equal((await L.post('/api/v2/projects/assign', { sessionIds: ['missing'], projectId: site.id })).json.updated, 0); assert.equal((await L.post('/api/v2/projects/assign', { sessionIds: [sid(0)], projectId: 'nope' })).status, 404);
  assert.equal((await L.get(`/api/v2/projects/assign?session=${sid(0)}`)).json.projectId, site.id);
  await L.post('/api/v2/projects/assign', { sessionIds: [sid(1)], projectId: intl.id }); // reassign notepad session
  const range = `from=${ranges.ymd(lastMon)}&to=${ranges.ymd(addD(lastMon, 6))}`;
  let rep = (await L.get(`/api/v2/projects/report?${range}`)).json; const row = (n) => rep.rows.find((r) => r.project === n);
  assert.equal(row('Website').totalMs, 150 * MIN, '90 + 60 minutes'); assert.equal(row('Website').billableMs, 150 * MIN); assert.equal(row('Website').amount, 250, '2.5 h x 100'); assert.equal(row('Website').client, 'Acme');
  assert.equal(row('Internal').totalMs, 40 * MIN, '30 + 10 minutes'); assert.equal(row('Internal').billableMs, 0); assert.equal(row('Internal').nonBillableMs, 40 * MIN); assert.equal(row('Internal').amount, 0);
  assert.equal(rep.totals.amount, 250); assert.equal(rep.currency, 'USD');
  // date filtering
  rep = (await L.get(`/api/v2/projects/report?from=${ranges.ymd(d2)}&to=${ranges.ymd(d2)}`)).json; assert.equal(rep.rows.find((r) => r.project === 'Website').totalMs, 60 * MIN, 'only the second day');
  rep = (await L.get(`/api/v2/projects/report?from=2020-01-01&to=2020-01-02`)).json; assert.equal(rep.totals.totalMs, 0);
  // currency and edit
  assert.equal((await L.patch('/api/settings', { currency: 'XXX' })).json.currency, 'USD', 'invalid currency ignored'); assert.equal((await L.patch('/api/settings', { currency: 'EUR' })).json.currency, 'EUR');
  const edited = (await L.patch('/api/v2/projects', { id: site.id, name: 'Website v2', rate: 120.5 })).json; assert.equal(edited.name, 'Website v2'); assert.equal(edited.client, 'Acme', 'unchanged fields kept');
  rep = (await L.get(`/api/v2/projects/report?${range}`)).json; assert.equal(rep.currency, 'EUR'); assert.equal(rep.rows.find((r) => r.project === 'Website v2').amount, 301.25);
  const csv = await L.get(`/api/v2/projects/report?format=csv&${range}`); assert.ok(csv.text.startsWith('Client,Project,From,To'), csv.text.slice(0, 60)); assert.match(csv.text, /Acme,Website v2,.*,2\.5000,2\.5000,0\.0000,120\.50,EUR,301\.25/); assert.match(csv.text, /,TOTAL,/);
  const list = (await L.get(`/api/v2/projects?${range}`)).json.projects; assert.equal(list.find((p) => p.id === site.id).sessions, 2);
  const sess = (await L.get(`/api/v2/projects/sessions?project=${site.id}&${range}`)).json; assert.equal(sess.total, 2); assert.deepEqual(sess.sessions.map((s) => s.name).sort(), ['Google Chrome', 'Google Chrome']);
  // archive, unassign, delete keeps sessions
  assert.equal((await L.patch('/api/v2/projects', { id: intl.id, archived: true })).json.archived, true);
  await L.post('/api/v2/projects/assign', { sessionIds: [sid(2)], projectId: null }); assert.equal((await L.get(`/api/v2/projects/assign?session=${sid(2)}`)).json.projectId, null);
  const before = (await L.get('/api/sessions?pageSize=100')).json.total; const del = (await L.del(`/api/v2/projects?id=${site.id}`)).json; assert.equal(del.unassigned, 1);
  assert.equal((await L.get('/api/sessions?pageSize=100')).json.total, before, 'deleting a project never deletes sessions');
  assert.equal((await L.get(`/api/v2/projects/assign?session=${sid(0)}`)).json.projectId, null);
});

test('theme packs, theme schedule settings, and v2 data round-trip through export/import and restart', { skip, timeout: 600000 }, async (t) => {
  const A = lab(t); await A.start(); await A.patch('/api/settings', { timezone: tz });
  // ---- theme schedule settings
  await A.patch('/api/settings', { theme: 'custom', customColor1: '#112233', customColor2: '#445566', customAccent: '#aabbcc', customAngle: 77 });
  let s = (await A.patch('/api/settings', { themeScheduleEnabled: true, themeDay: 'light', themeNight: 'obsidian', themeDayStart: '07:00', themeNightStart: '19:30' })).json;
  assert.equal(s.themeScheduleEnabled, true); assert.equal(s.themeNightStart, '19:30'); assert.equal(s.theme, 'custom', 'manual theme untouched'); assert.equal(s.customColor1, '#112233', 'custom gradient untouched'); assert.equal(s.customAngle, 77);
  s = (await A.patch('/api/settings', { themeDayStart: '7:5', themeNightStart: '25:00', themeDay: '<script>' })).json; assert.equal(s.themeDayStart, '07:00', 'invalid time ignored'); assert.equal(s.themeNightStart, '19:30'); assert.equal(s.themeDay, 'light', 'invalid theme id ignored');
  // ---- gradients
  const g1 = (await A.post('/api/v2/gradients', { gradient: { name: 'Dusk', color1: '#112233', color2: '#445566', color3: null, angle: 140, accent: '#aabbcc' } })).json;
  const g2 = (await A.post('/api/v2/gradients', { gradient: { name: 'Dawn', color1: '#ffeedd', color2: '#ccbbaa', color3: '#123456', angle: 30, accent: '#00ff00' } })).json;
  assert.equal((await A.post('/api/v2/gradients', { gradient: { name: 'dusk', color1: '#112233', color2: '#445566', accent: '#aabbcc' } })).status, 409, 'duplicate name');
  assert.equal((await A.post('/api/v2/gradients', { gradient: { name: 'Bad', color1: 'url(x)', color2: '#445566', accent: '#aabbcc' } })).status, 400, 'invalid colour');
  assert.equal((await A.post('/api/v2/gradients', { gradient: { id: g1.id, name: 'Dusk', color1: '#000000', color2: '#445566', accent: '#aabbcc' } })).status, 200, 'editing keeps its own name');
  assert.equal((await A.get('/api/v2/gradients')).json.gradients.length, 2);
  const pack = (await A.get('/api/v2/gradients?export=1')).text; const parsed = JSON.parse(pack); assert.equal(parsed.schema, 'watchtower-theme-pack'); assert.equal(parsed.version, 1); assert.equal(parsed.gradients.length, 2);
  const one = JSON.parse((await A.get(`/api/v2/gradients?export=1&ids=${g2.id}`)).text); assert.deepEqual(one.gradients.map((g) => g.name), ['Dawn'], 'selected export');
  const bad = async (c) => (await A.post('/api/v2/gradients', { action: 'import', content: c })).status;
  for (const c of ['nope', '{}', JSON.stringify({ ...parsed, version: 99 }), JSON.stringify({ ...parsed, gradients: [{ name: 'x', color1: 'red', color2: '#000000', accent: '#000000' }] }), JSON.stringify({ ...parsed, schema: 'x' })]) assert.equal(await bad(c), 400, c.slice(0, 40));
  assert.equal((await A.get('/api/v2/gradients')).json.gradients.length, 2, 'rejected imports changed nothing');
  const prev = (await A.post('/api/v2/gradients', { action: 'preview', content: pack })).json; assert.equal(prev.applied, false); assert.equal(prev.renamed.length, 2); assert.equal((await A.get('/api/v2/gradients')).json.gradients.length, 2, 'preview changes nothing');
  const imp = (await A.post('/api/v2/gradients', { action: 'import', content: pack })).json; assert.deepEqual(imp.added.sort(), ['Dawn (2)', 'Dusk (2)'], 'clashing names renamed, nothing overwritten');
  assert.equal((await A.get('/api/v2/gradients')).json.gradients.find((g) => g.id === g1.id).color1, '#000000', 'existing preset kept its edited colour');

  // ---- seed v2 data, export, import into a fresh server, compare
  await A.seed([['chrome', at(yday, 9), at(yday, 10)], ['notepad', at(yday, 11), at(yday, 12)]]);
  const proj = (await A.post('/api/v2/projects', { name: 'Roundtrip', client: 'Client Co', color: '#336699', rate: 75, billable: true })).json;
  await A.post('/api/v2/projects/assign', { sessionIds: ['v0'], projectId: proj.id });
  const lim = (await A.post('/api/v2/limits', { kind: 'app', target: 'chrome', dailyMinutes: 90, warnPct: 70 })).json;
  await A.put('/api/v2/productivity', { appId: 'chrome', class: 'distracting' });
  await A.post('/api/v2/focus', { action: 'config', config: { focusMin: 40, shortMin: 7 } });
  const exp = (await A.get('/api/export?format=json')).text; const ej = JSON.parse(exp);
  assert.equal(ej.projects.length, 1); assert.equal(ej.sessionProjects.length, 1); assert.equal(ej.projects[0].hourlyRate, 75);
  const B = lab(t); await B.start();
  const preview = await B.post('/api/import', { filename: 'e.json', content: exp }); assert.equal(preview.json.ok, true); assert.equal((await B.get('/api/v2/projects')).json.projects.length, 0, 'preview changes nothing');
  const applied = await B.post('/api/import', { filename: 'e.json', content: exp, mode: 'replace' }); assert.equal(applied.json.applied, true, applied.text.slice(0, 300));
  const bp = (await B.get('/api/v2/projects')).json.projects; assert.equal(bp.length, 1); assert.equal(bp[0].name, 'Roundtrip'); assert.equal(bp[0].client, 'Client Co'); assert.equal(bp[0].rate, 75); assert.equal(bp[0].color, '#336699');
  assert.equal((await B.get('/api/v2/projects/assign?session=v0')).json.projectId, proj.id, 'session assignment restored');
  assert.equal((await B.get('/api/v2/limits')).json.limits.find((l) => l.id === lim.id).dailyMinutes, 90, 'limits restored');
  assert.equal((await B.get('/api/v2/gradients')).json.gradients.length, 4, 'theme presets restored');
  assert.equal((await B.get(`/api/v2/productivity?day=${ranges.ymd(yday)}`)).json.current.apps.find((a) => a.id === 'chrome').cls, 'distracting', 'productivity overrides restored');
  assert.equal((await B.get('/api/v2/focus')).json.config.focusMin, 40, 'focus preferences restored');
  assert.equal((await B.patch('/api/settings', {})).json.themeScheduleEnabled, true, 'schedule settings restored by the settings import');
  // second (merge) import adds no duplicates
  await B.post('/api/import', { filename: 'e.json', content: exp, mode: 'merge' }); assert.equal((await B.get('/api/v2/projects')).json.projects.length, 1, 'merge twice: no duplicate project'); assert.equal((await B.get('/api/v2/gradients')).json.gradients.length, 4);
  // persistence across restart
  await B.stop(); const B2 = lab(t, { dataDir: B.dataDir }); await B2.start();
  assert.equal((await B2.get('/api/v2/gradients')).json.gradients.length, 4); assert.equal((await B2.get('/api/v2/projects')).json.projects.length, 1); assert.equal((await B2.get('/api/settings')).json.themeNightStart, '19:30');
  // legacy 1.x export (no v2 fields) still imports
  const legacy = JSON.parse(exp); delete legacy.projects; delete legacy.sessionProjects; legacy.schemaVersion = 1; legacy.schema = 'chronos-export';
  const C = lab(t); await C.start(); const lr = await C.post('/api/import', { filename: 'old.json', content: JSON.stringify(legacy), mode: 'merge' }); assert.equal(lr.json.applied, true, lr.text.slice(0, 200)); assert.equal((await C.get('/api/v2/projects')).json.projects.length, 0);
  // markdown + txt reports carry the full data block including projects
  const md = (await A.get('/api/export?format=md')).text; const C2 = lab(t); await C2.start(); const mr = await C2.post('/api/import', { filename: 'r.md', content: md, mode: 'replace' }); assert.equal(mr.json.applied, true, mr.text.slice(0, 200)); assert.equal((await C2.get('/api/v2/projects')).json.projects.length, 1, 'projects survive the Markdown round trip');
});
