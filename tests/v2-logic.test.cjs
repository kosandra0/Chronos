'use strict';
// WatchTower 2.0 pure-logic tests (focus, limits, productivity, periods, schedule, theme packs, billing).
// These modules are plain TypeScript with no framework imports, so Node loads them directly.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const v2 = (n) => require(path.join(__dirname, '..', 'src', 'lib', 'v2', `${n}.ts`));
const MIN = 60000;

test('focus: config validation clamps and falls back', () => {
  const { sanitizeFocusConfig, DEFAULT_FOCUS_CONFIG } = v2('focus');
  assert.deepEqual(sanitizeFocusConfig({}), DEFAULT_FOCUS_CONFIG);
  const c = sanitizeFocusConfig({ focusMin: 9999, shortMin: -4, longMin: 'abc', longEvery: 1, reminderEveryMin: 0, auto: 'yes', reminders: false });
  assert.equal(c.focusMin, 180); assert.equal(c.shortMin, 1); assert.equal(c.longMin, DEFAULT_FOCUS_CONFIG.longMin);
  assert.equal(c.longEvery, 2); assert.equal(c.reminderEveryMin, 5); assert.equal(c.auto, false, 'non-boolean ignored'); assert.equal(c.reminders, false);
  assert.equal(sanitizeFocusConfig({ focusMin: '30' }).focusMin, 30);
  assert.equal(sanitizeFocusConfig({ focusMin: NaN }).focusMin, 25);
});

test('focus: start, pause, resume, stop and remaining time', () => {
  const f = v2('focus'); const cfg = f.DEFAULT_FOCUS_CONFIG; const t0 = 1_000_000;
  let s = f.startFocus(f.initialFocusState(t0), cfg, t0);
  assert.equal(s.status, 'running'); assert.equal(f.remaining(s, t0), 25 * MIN);
  assert.equal(f.remaining(s, t0 + 10 * MIN), 15 * MIN);
  s = f.pause(s, t0 + 10 * MIN);
  assert.equal(s.status, 'paused'); assert.equal(f.remaining(s, t0 + 999 * MIN), 15 * MIN, 'paused time does not tick');
  const a = f.advance(s, cfg, t0 + 500 * MIN); assert.equal(a.state.status, 'paused'); assert.equal(a.events.length, 0, 'paused timer never completes or gaps');
  s = f.resume(s, t0 + 20 * MIN); assert.equal(f.remaining(s, t0 + 20 * MIN), 15 * MIN);
  assert.equal(f.stop(s, t0).status, 'idle');
  assert.equal(f.pause(f.initialFocusState(0), 5).status, 'idle', 'pause on idle is a no-op');
  assert.equal(f.resume(f.initialFocusState(0), 5).status, 'idle');
});

test('focus: phase transitions, long break cadence, auto vs manual', () => {
  const f = v2('focus'); const cfg = { ...f.DEFAULT_FOCUS_CONFIG, reminders: false, longEvery: 2 };
  let now = 0; let s = f.startFocus(f.initialFocusState(now), cfg, now);
  const tick = (ms) => { // tick every 30 s so no gap is detected
    const end = now + ms; let ev = [];
    while (now < end) { now += 30000; const r = f.advance(s, cfg, now); s = r.state; ev = ev.concat(r.events); }
    return ev;
  };
  let ev = tick(25 * MIN);
  assert.equal(ev.find((e) => e.type === 'phase-complete').phase, 'focus');
  assert.equal(s.status, 'idle', 'manual mode waits for the user'); assert.equal(s.phase, 'short');
  s = f.startFocus(s, cfg, now); tick(5 * MIN); assert.equal(s.phase, 'focus', 'after a break the suggestion is focus');
  s = f.startFocus(s, cfg, now); ev = tick(25 * MIN);
  assert.equal(ev.find((e) => e.type === 'phase-complete').next, 'long', '2nd focus block -> long break');
  // auto mode
  const auto = { ...cfg, auto: true }; now = 0; s = f.startFocus(f.initialFocusState(0), auto, 0);
  for (let i = 0; i < 50; i++) { now += 30000; s = f.advance(s, auto, now).state; if (now >= 25 * MIN) break; }
  assert.equal(s.status, 'running'); assert.equal(s.phase, 'short', 'auto-started the break');
  assert.equal(f.remaining(s, now), 5 * MIN);
  assert.equal(s.focusMsToday, 25 * MIN);
});

test('focus: sleep/restart gap freezes the timer instead of advancing it', () => {
  const f = v2('focus'); const cfg = { ...f.DEFAULT_FOCUS_CONFIG, reminders: false };
  let s = f.startFocus(f.initialFocusState(0), cfg, 0);
  for (let now = 30000; now <= 10 * MIN; now += 30000) s = f.advance(s, cfg, now).state; // normal 30 s observations, 15 min left
  const r = f.advance(s, cfg, 10 * MIN + 3 * 3600000); // computer slept 3 hours
  assert.equal(r.events.some((e) => e.type === 'gap'), true); assert.equal(r.events.some((e) => e.type === 'phase-complete'), false, 'sleep does not complete the block');
  assert.equal(f.remaining(r.state, 10 * MIN + 3 * 3600000), 15 * MIN, 'remaining time preserved');
  // persisted-state restart: JSON round trip keeps everything
  const again = JSON.parse(JSON.stringify(r.state));
  assert.deepEqual(f.advance(again, cfg, r.state.lastSeen + 1000).state.endsAt, r.state.endsAt);
});

test('focus: reminders are rate limited (no flooding)', () => {
  const f = v2('focus'); const cfg = { ...f.DEFAULT_FOCUS_CONFIG, focusMin: 60, reminderEveryMin: 20 };
  let s = f.startFocus(f.initialFocusState(0), cfg, 0); let count = 0;
  for (let now = 1000; now <= 59 * MIN; now += 1000) { const r = f.advance(s, cfg, now); s = r.state; count += r.events.filter((e) => e.type === 'reminder').length; }
  // gap detection never fires at 1 s ticks; 3600 ticks produce only 2 reminders (at 20 and 40 minutes)
  assert.equal(count, 2);
  const off = { ...cfg, reminders: false }; s = f.startFocus(f.initialFocusState(0), off, 0); count = 0;
  for (let now = 1000; now <= 59 * MIN; now += 1000) { const r = f.advance(s, off, now); s = r.state; count += r.events.length; }
  assert.equal(count, 0, 'reminders can be disabled');
});

test('limits: validation, thresholds and deduplicated notifications', () => {
  const L = v2('limits');
  assert.equal(L.sanitizeLimit({ kind: 'app', target: 'x', dailyMinutes: 0 }, 'a').ok, false);
  assert.equal(L.sanitizeLimit({ kind: 'app', target: 'x', dailyMinutes: 2000 }, 'a').ok, false);
  assert.equal(L.sanitizeLimit({ kind: 'oops', target: 'x', dailyMinutes: 10 }, 'a').ok, false);
  assert.equal(L.sanitizeLimit({ kind: 'app', target: 'x', dailyMinutes: 10, warnPct: 100 }, 'a').ok, false);
  const ok = L.sanitizeLimit({ kind: 'app', target: 'app1', targetName: 'Chrome', dailyMinutes: 120 }, 'lim1');
  assert.equal(ok.ok, true); assert.equal(ok.value.warnPct, 80);
  const lim = ok.value;
  assert.equal(L.evaluateLimit(lim, 95 * MIN).state, 'ok'); // 79.2 %
  assert.equal(L.evaluateLimit(lim, 96 * MIN).state, 'warn'); // exactly 80 %
  assert.equal(L.evaluateLimit(lim, 120 * MIN).state, 'reached');
  assert.equal(L.evaluateLimit(lim, 30 * MIN).remainingMs, 90 * MIN);
  const sent = new Set(); const has = (k) => sent.has(k);
  let n = L.notificationsDue(lim, 100 * MIN, '2026-11-21', has); assert.equal(n.length, 1); assert.equal(n[0].kind, 'warn'); sent.add(n[0].key);
  assert.equal(L.notificationsDue(lim, 101 * MIN, '2026-11-21', has).length, 0, 'warning is not repeated');
  n = L.notificationsDue(lim, 121 * MIN, '2026-11-21', has); assert.equal(n.length, 1); assert.equal(n[0].kind, 'reached'); sent.add(n[0].key);
  assert.equal(L.notificationsDue(lim, 500 * MIN, '2026-11-21', has).length, 0, 'reached is not repeated');
  n = L.notificationsDue(lim, 130 * MIN, '2026-11-22', has); assert.equal(n.some((x) => x.kind === 'reached' && !x.silent), true, 'midnight reset: next day notifies again');
  const jump = L.notificationsDue(lim, 130 * MIN, '2026-11-23', () => false); // straight past the limit
  assert.deepEqual(jump.map((x) => [x.kind, !!x.silent]), [['reached', false], ['warn', true]], 'already over the limit: one visible notification only');
  assert.equal(L.notificationsDue({ ...lim, enabled: false }, 500 * MIN, 'd', () => false).length, 0);
});

test('limits: local midnight day key follows the time zone', () => {
  const { localDayKey } = v2('limits');
  const t = Date.parse('2026-11-20T19:00:00Z'); // 00:30 on the 21st in India
  assert.equal(localDayKey(t, 'Asia/Kolkata'), '2026-11-21');
  assert.equal(localDayKey(t, 'UTC'), '2026-11-20');
  assert.equal(localDayKey(t, 'America/Los_Angeles'), '2026-11-20');
  assert.equal(localDayKey(Date.parse('2026-11-20T18:29:59Z'), 'Asia/Kolkata'), '2026-11-20');
  assert.equal(localDayKey(Date.parse('2026-11-20T18:30:00Z'), 'Asia/Kolkata'), '2026-11-21', 'flips exactly at local midnight');
});

test('productivity: score maths, neutral exclusion, unavailable score, goals', () => {
  const P = v2('productivity');
  assert.equal(P.productivityScore(0, 0), null, 'unavailable, not 0%');
  assert.equal(P.productivityScore(3 * 3600000, 1 * 3600000), 75);
  assert.equal(P.productivityScore(0, 1000), 0);
  assert.equal(P.productivityScore(1000, 0), 100);
  // neutral time never enters the denominator: the function only receives productive and distracting
  assert.equal(P.productivityScore(60, 60), 50);
  assert.equal(P.defaultProdClass('Development'), 'productive'); assert.equal(P.defaultProdClass('Gaming'), 'distracting'); assert.equal(P.defaultProdClass('Browsers'), 'neutral');
  assert.equal(P.isProdClass('neutral'), true); assert.equal(P.isProdClass('bad'), false);
  const g = P.goalProgress(2 * 3600000, 4);
  assert.equal(g.pct, 50); assert.equal(g.remainingMs, 2 * 3600000); assert.equal(g.met, false);
  assert.equal(P.goalProgress(5 * 3600000, 4).pct, 100); assert.equal(P.goalProgress(5 * 3600000, 4).met, true);
  assert.equal(P.goalProgress(1000, 0).pct, null);
});

test('periods: comparisons, percentages and calendar boundaries', () => {
  const { compareValues, pctChange, periodPair, lastCompletedWeek, weekBefore } = v2('periods');
  const H = 3600000;
  const c = compareValues(28 * H, 34 * H);
  assert.equal(c.diff, -6 * H); assert.equal(c.direction, 'down'); assert.ok(Math.abs(c.pct - -17.647058823529413) < 1e-9, `pct ${c.pct}`);
  assert.equal(pctChange(10, 0), null, 'growth from zero is undefined, not Infinity'); assert.equal(pctChange(0, 0), 0);
  assert.equal(compareValues(5, 5).direction, 'same'); assert.equal(compareValues(5, 5).pct, 0);
  assert.equal(compareValues(0, 4).pct, -100);
  // Saturday 2026-11-21: this week Mon 16..Sun 22, last week Mon 9..Sun 15
  const now = new Date(2026, 10, 21, 12, 0, 0);
  const w = periodPair('week', now);
  assert.deepEqual(w.current, { from: '2026-11-16', to: '2026-11-22' }); assert.deepEqual(w.previous, { from: '2026-11-09', to: '2026-11-15' });
  const m = periodPair('month', now);
  assert.deepEqual(m.current, { from: '2026-11-01', to: '2026-11-30' }); assert.deepEqual(m.previous, { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(periodPair('month', new Date(2026, 0, 15)).previous, { from: '2025-12-01', to: '2025-12-31' }, 'January compares with December of the previous year');
  assert.deepEqual(periodPair('month', new Date(2024, 2, 5)).previous, { from: '2024-02-01', to: '2024-02-29' }, 'leap year February');
  assert.deepEqual(lastCompletedWeek(new Date(2026, 10, 16, 0, 0, 1)), { from: '2026-11-09', to: '2026-11-15' }, 'Monday 00:00:01 still reports the week that just ended');
  assert.deepEqual(lastCompletedWeek(new Date(2026, 10, 15, 23, 59, 59)), { from: '2026-11-02', to: '2026-11-08' }, 'Sunday 23:59:59: the week is not complete yet');
  assert.deepEqual(weekBefore({ from: '2026-11-09', to: '2026-11-15' }), { from: '2026-11-02', to: '2026-11-08' });
});

test('periods: weekly report scheduling and delivery deduplication', () => {
  const { weeklyReportDue } = v2('periods');
  // Monday 09:00 report
  const sunday = new Date(2026, 10, 22, 23, 0); // Sunday of the week 16..22 (before Monday)
  assert.equal(weeklyReportDue(sunday, 1, '09:00', null).due, true, 'Monday of this week already passed: reports the previous completed week');
  const beforeTime = new Date(2026, 10, 16, 8, 59); assert.equal(weeklyReportDue(beforeTime, 1, '09:00', null).due, false);
  const atTime = new Date(2026, 10, 16, 9, 0); const r = weeklyReportDue(atTime, 1, '09:00', null);
  assert.equal(r.due, true); assert.equal(r.weekKey, '2026-11-09', 'reports the completed week 9-15 Nov');
  assert.equal(weeklyReportDue(new Date(2026, 10, 18, 12, 0), 1, '09:00', r.weekKey).due, false, 'already delivered: no duplicate');
  assert.equal(weeklyReportDue(new Date(2026, 10, 23, 9, 0), 1, '09:00', r.weekKey).due, true, 'next week produces a new report');
  // Sunday 18:30 setting
  assert.equal(weeklyReportDue(new Date(2026, 10, 22, 18, 29), 0, '18:30', null).due, false);
  assert.equal(weeklyReportDue(new Date(2026, 10, 22, 18, 30), 0, '18:30', null).due, true);
  assert.equal(weeklyReportDue(new Date(2026, 10, 22, 18, 30), 0, '18:30', null).weekKey, '2026-11-09', 'Sunday evening of an unfinished week still reports the previous completed week');
});

test('theme schedule: day, night, crossing midnight, disabled', () => {
  const { scheduledTheme, activeSlot, parseHM } = v2('schedule');
  const s = { enabled: true, dayTheme: 'light', nightTheme: 'obsidian', dayStart: '07:00', nightStart: '19:00' };
  const at = (h, m) => new Date(2026, 10, 21, h, m);
  assert.equal(scheduledTheme(s, at(6, 59)), 'obsidian'); assert.equal(scheduledTheme(s, at(7, 0)), 'light');
  assert.equal(scheduledTheme(s, at(18, 59)), 'light'); assert.equal(scheduledTheme(s, at(19, 0)), 'obsidian'); assert.equal(scheduledTheme(s, at(0, 0)), 'obsidian');
  const crossing = { ...s, dayStart: '22:00', nightStart: '06:00' }; // the "day" theme is active overnight
  assert.equal(scheduledTheme(crossing, at(23, 0)), 'light'); assert.equal(scheduledTheme(crossing, at(2, 0)), 'light'); assert.equal(scheduledTheme(crossing, at(12, 0)), 'obsidian');
  assert.equal(scheduledTheme({ ...s, enabled: false }, at(12, 0)), null, 'disabled keeps the manual theme');
  assert.equal(scheduledTheme({ ...s, dayStart: '25:00' }, at(12, 0)), null, 'invalid time is ignored');
  assert.equal(parseHM('7:05'), 425); assert.equal(parseHM('nope'), null); assert.equal(parseHM('24:00'), null);
  assert.equal(activeSlot(60, 60, 5), 'day');
});

test('theme packs: round trip, validation, versions, duplicates, hostile input', () => {
  const T = v2('themepack');
  const g = [{ name: 'Dusk', color1: '#112233', color2: '#445566', color3: null, angle: 140, accent: '#aabbcc' }, { name: 'Dawn', color1: '#FFEEDD', color2: '#ccbbaa', color3: '#123456', angle: 365, accent: '#00ff00' }];
  const pack = T.exportPack(g.map((x) => T.sanitizeGradient(x).value), 'My pack', new Date(0));
  assert.equal(pack.schema, 'watchtower-theme-pack'); assert.equal(pack.version, 1);
  const back = T.validatePack(JSON.stringify(pack)); assert.equal(back.ok, true);
  assert.deepEqual(back.gradients.map((x) => x.name), ['Dusk', 'Dawn']); assert.equal(back.gradients[1].angle, 5, 'angle normalised'); assert.equal(back.gradients[1].color1, '#ffeedd');
  for (const bad of ['not json', '[]', '{}', JSON.stringify({ ...pack, schema: 'other' }), JSON.stringify({ ...pack, version: 2 }), JSON.stringify({ ...pack, version: 'x' }), JSON.stringify({ ...pack, gradients: [] }), JSON.stringify({ ...pack, gradients: 'x' })]) assert.equal(T.validatePack(bad).ok, false, bad.slice(0, 40));
  const badColour = { ...pack, gradients: [{ ...pack.gradients[0], color1: 'red' }] }; assert.equal(T.validatePack(JSON.stringify(badColour)).ok, false);
  const css = { ...pack, gradients: [{ ...pack.gradients[0], color2: 'url(javascript:alert(1))' }] }; assert.equal(T.validatePack(JSON.stringify(css)).ok, false, 'CSS/JS in colour fields is rejected');
  const noName = { ...pack, gradients: [{ ...pack.gradients[0], name: '   ' }] }; assert.equal(T.validatePack(JSON.stringify(noName)).ok, false);
  assert.equal(T.sanitizeGradient({ ...g[0], name: '<img src=x onerror=alert(1)>Evil' }).value.name, 'img src=x onerror=alert(1)Evil', 'markup characters stripped from names');
  assert.equal(T.sanitizeGradient({ ...g[0], angle: 'abc' }).ok, false);
  assert.equal(T.validatePack('x'.repeat(1_000_001)).ok, false);
  const m = T.mergeImported([g[0]], [g[0], g[0], g[1]]);
  assert.deepEqual(m.merged.map((x) => x.name), ['Dusk', 'Dusk (2)', 'Dusk (3)', 'Dawn'], 'duplicates renamed, existing never overwritten'); assert.equal(m.renamed.length, 2);
  assert.equal(m.merged[0].color1, '#112233');
});

test('billing: amounts, rounding, CSV escaping and injection protection', () => {
  const B = v2('billing');
  assert.equal(B.amountFor(90 * MIN, 100), 150); assert.equal(B.amountFor(20 * MIN, 45), 15); assert.equal(B.amountFor(1000, 100), 0.03, 'rounded to cents');
  assert.equal(B.amountFor(-5, 100), 0); assert.equal(B.amountFor(1000, NaN), 0);
  const nb = B.projectRow({ client: 'Acme', name: 'Site', billable: false, rate: 80 }, 2 * 3600000, { from: '2026-11-01', to: '2026-11-30' }, 'USD');
  assert.equal(nb.billableMs, 0); assert.equal(nb.nonBillableMs, 2 * 3600000); assert.equal(nb.amount, 0);
  const bl = B.projectRow({ client: 'Acme', name: 'Site', billable: true, rate: 80 }, 2.5 * 3600000, { from: null, to: null }, 'EUR');
  assert.equal(bl.amount, 200); assert.equal(bl.currency, 'EUR');
  assert.equal(B.isCurrency('INR'), true); assert.equal(B.isCurrency('XXX'), false);
  const csv = B.reportCsv([B.projectRow({ client: '=cmd|calc', name: 'He said "hi", ok', billable: true, rate: 10 }, 3600000, { from: '2026-11-01', to: '2026-11-02' }, 'USD')]);
  assert.ok(csv.includes("'=cmd|calc"), 'formula injection neutralised'); assert.ok(csv.includes('"He said ""hi"", ok"'), 'quotes escaped');
  const lines = csv.trim().split('\r\n'); assert.equal(lines.length, 3); assert.ok(lines[2].startsWith(',TOTAL')); assert.ok(lines[2].endsWith('10.00'));
});
