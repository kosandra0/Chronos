'use strict';
// Applications period filter: all ten presets against the PACKAGED server, checked against an independent JS
// calculation (local-midnight clipping) and against the Statistics API. Isolated temp data directory only.
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

const now = new Date();
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const at = (day, hh, mm = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm).getTime();
const today = dayStart(now), yday = addD(today, -1);
const monday = addD(today, -((today.getDay() + 6) % 7));
const lastWeekMon = addD(monday, -7);
const lastMonth15 = new Date(today.getFullYear(), today.getMonth() - 1, 15);
const lastYear = new Date(today.getFullYear() - 1, 5, 15);
const iso = (ms) => new Date(ms).toISOString();

const APPS = [
  { id: 'chrome', key: 'chrome.exe', name: 'Google Chrome', category: 'Browsers' },
  { id: 'notepad', key: 'notepad.exe', name: 'Notepad', category: 'Productivity' },
  { id: 'code', key: 'code.exe', name: 'Visual Studio Code', category: 'Development' },
  { id: 'ghost', key: 'ghost.exe', name: 'Ghost Never Used', category: 'Other' },
];
// [app, start, end, type]
const SESS = [
  ['chrome', at(yday, 23, 30), at(today, 0, 30), 'app'], // crosses local midnight: 30 min yesterday + 30 min today
  ['chrome', at(today, 10, 0), at(today, 11, 0), 'app'],
  ['chrome', at(lastWeekMon, 9, 0), at(lastWeekMon, 10, 30), 'app'],
  ['chrome', at(lastMonth15, 12, 0), at(lastMonth15, 13, 0), 'app'],
  ['chrome', at(lastYear, 12, 0), at(lastYear, 14, 0), 'app'],
  ['notepad', at(yday, 9, 0), at(yday, 9, 20), 'app'],
  ['notepad', at(today, 12, 0), at(today, 12, 15), 'app'],
  ['notepad', at(lastMonth15, 14, 0), at(lastMonth15, 14, 10), 'app'],
  ['code', at(lastYear, 10, 0), at(lastYear, 10, 30), 'app'],
  [null, at(today, 12, 30), at(today, 13, 30), 'idle'], // idle: never foreground usage
  [null, at(today, 14, 0), at(today, 14, 10), 'desktop'], // desktop counts in the percentage base like Statistics
];
function exportFile() {
  const apps = APPS.map((a) => ({ id: a.id, identityKey: a.key, name: a.name, executableName: a.key, executablePath: null, category: a.category, categoryOverridden: false, detectionStatus: 'ok', elevated: false, firstSeen: iso(at(lastYear, 9)), lastSeen: iso(at(today, 9)) }));
  const sessions = SESS.map(([app, s, e, type], i) => ({ id: `s${i}`, applicationId: app, startTime: iso(s), endTime: iso(e), durationMs: e - s, activityType: type, terminationReason: null, windowTitle: null, source: 'agent', date: '2000-01-01' }));
  return { schema: 'watchtower-export', schemaVersion: 2, appVersion: '1.1.0', exportedAt: iso(Date.now()), timezone: tz, applications: apps, sessions, dailyStatistics: [], historicalStatistics: {}, categories: {}, settings: {}, gamification: { totalXp: 0, level: 1, achievements: [] }, backupMetadata: [] };
}
/** Independent expectation: clip every session to [from 00:00, to+1 00:00) in local time. */
function expected(range) {
  const lo = range.from ? dayStart(ranges.parseYmd(range.from)).getTime() : -Infinity;
  const hi = range.to ? addD(ranges.parseYmd(range.to), 1).getTime() : Infinity;
  const by = new Map(); let grand = 0;
  for (const [app, s, e, type] of SESS) {
    if (type === 'idle') continue;
    const a = Math.max(s, lo), b = Math.min(e, hi);
    if (b <= a) continue;
    grand += b - a;
    if (type !== 'app') continue;
    const r = by.get(app) ?? { ms: 0, count: 0, first: Infinity, last: -Infinity };
    r.ms += b - a; if (s >= lo && s < hi) r.count++; r.first = Math.min(r.first, a); r.last = Math.max(r.last, b);
    by.set(app, r);
  }
  return { by, grand };
}

test('Applications period filter: all ten presets, boundaries, aggregation, search/category, empty ranges', { skip, timeout: 300000 }, async (t) => {
  const { root, dest } = h.isolateBundle(h.packagedServerDir);
  const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir, { recursive: true });
  const port = await h.freePort();
  const srv = h.startServer(dest, dataDir, port);
  t.after(async () => { await h.stopServer(srv); await h.removeDir(root); });
  await h.waitHealthy(srv, port);
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await h.request(`${base}/api/settings`, { method: 'PATCH', body: { timezone: tz } })).status, 200);
  const imp = await h.request(`${base}/api/import`, { method: 'POST', body: { filename: 'seed.json', content: JSON.stringify(exportFile()), mode: 'merge' } });
  assert.equal(imp.json.ok, true, imp.text.slice(0, 300)); assert.equal(imp.json.applied, true);

  const apps = async (range, extra = '') => (await h.request(`${base}/api/apps?${range.from ? `from=${range.from}&` : ''}${range.to ? `to=${range.to}&` : ''}sort=most${extra}`)).json;
  const stats = async (range) => (await h.request(`${base}/api/stats?${range.from ? `from=${range.from}&` : ''}${range.to ? `to=${range.to}` : ''}`)).json;
  const byId = (j) => new Map(j.apps.map((a) => [a.id, a]));

  // ---- all ten presets equal the independent calculation AND the Statistics API
  for (const p of ranges.PRESETS) {
    const range = p.id === 'custom' ? { from: ranges.ymd(addD(today, -2)), to: ranges.ymd(yday) } : ranges.resolvePreset(p.id);
    const got = await apps(range); const exp = expected(range); const st = await stats(range); const stById = new Map(st.apps.map((a) => [a.id, a.ms]));
    const shown = got.apps.filter((a) => a.total > 0 || p.id === 'all');
    const expIds = [...exp.by.keys()].sort();
    const gotIds = (p.id === 'all' ? got.apps.filter((a) => a.sessions > 0) : got.apps).map((a) => a.id).sort();
    assert.deepEqual(gotIds, expIds, `${p.label}: applications observed in the period`);
    assert.equal(got.grandTotal, exp.grand, `${p.label}: percentage base`);
    for (const [id, e] of exp.by) {
      const a = byId(got).get(id);
      assert.equal(a.total, e.ms, `${p.label}: ${id} usage`);
      assert.equal(a.sessions, e.count, `${p.label}: ${id} sessions`);
      if (p.id !== 'all') {
        assert.equal(new Date(a.lastUsed).getTime(), e.last, `${p.label}: ${id} last used`);
        assert.equal(new Date(a.firstSeen).getTime(), e.first, `${p.label}: ${id} first observed`);
      }
      assert.ok(Math.abs(a.pct - e.ms / exp.grand) < 1e-9, `${p.label}: ${id} percentage`);
      assert.equal(stById.get(id), e.ms, `${p.label}: ${id} equals the Statistics figure`);
    }
    assert.ok(shown.length >= 0);
    if (p.id !== 'all') assert.ok(!got.apps.some((a) => a.id === 'ghost'), `${p.label}: unused application hidden`);
  }

  // ---- concrete numbers (not derived from the same code path)
  const T = ranges.resolvePreset('today'), Y = ranges.resolvePreset('yesterday');
  let r = await apps(T);
  assert.equal(byId(r).get('chrome').total, 90 * MIN, 'Today: 60 min + the 30 min after midnight');
  assert.equal(byId(r).get('chrome').sessions, 1, 'Today counts only sessions that START today');
  assert.equal(byId(r).get('notepad').total, 15 * MIN);
  assert.equal(r.grandTotal, 115 * MIN, 'idle excluded, desktop (10 min) included');
  assert.ok(Math.abs(byId(r).get('chrome').pct - 90 / 115) < 1e-9);
  assert.equal(new Date(byId(r).get('chrome').firstSeen).getTime(), at(today, 0, 0), 'first activity inside Today starts at local midnight');
  assert.equal(new Date(byId(r).get('chrome').lastUsed).getTime(), at(today, 11, 0));
  r = await apps(Y);
  assert.equal(byId(r).get('chrome').total, 30 * MIN, 'Yesterday: only the 30 min before midnight');
  assert.equal(byId(r).get('chrome').sessions, 1); assert.equal(byId(r).get('notepad').total, 20 * MIN);
  assert.equal(new Date(byId(r).get('chrome').lastUsed).getTime(), at(today, 0, 0), 'the boundary-crossing session ends at midnight for Yesterday');
  const all = byId(await apps({ from: null, to: null }));
  assert.equal(all.get('chrome').total, (60 + 60 + 90 + 60 + 120) * MIN, 'All Time keeps the full lifetime usage');
  assert.equal(all.get('chrome').sessions, 5); assert.ok(all.has('ghost'), 'All Time still lists applications without sessions (existing behaviour)');
  assert.equal(all.get('ghost').total, 0);

  // lifetime usage never leaks into a restricted period
  r = await apps(T); assert.ok(byId(r).get('chrome').total < all.get('chrome').total);
  const ly = await apps(ranges.resolvePreset('lastYear')); assert.equal(byId(ly).get('chrome').total, 120 * MIN); assert.equal(byId(ly).get('code').total, 30 * MIN);

  // ---- search and category combined with a period
  r = await apps(T, '&q=chrome'); assert.deepEqual(r.apps.map((a) => a.id), ['chrome']); assert.equal(r.grandTotal, 115 * MIN, 'percentage base is the period total, not the filtered subset');
  r = await apps(T, '&category=Productivity'); assert.deepEqual(r.apps.map((a) => a.id), ['notepad']);
  r = await apps(T, '&category=Development'); assert.equal(r.apps.length, 0, 'category with no activity today');
  r = await apps(ranges.resolvePreset('lastYear'), '&category=Development&q=visual'); assert.deepEqual(r.apps.map((a) => a.id), ['code']);
  r = await apps(T, '&q=does-not-exist'); assert.equal(r.apps.length, 0);

  // ---- empty ranges and custom ranges
  r = await apps({ from: '2020-01-01', to: '2020-01-31' }); assert.equal(r.apps.length, 0); assert.equal(r.grandTotal, 0);
  const one = ranges.ymd(lastMonth15);
  r = await apps({ from: one, to: one }); assert.equal(byId(r).get('chrome').total, 60 * MIN); assert.equal(byId(r).get('notepad').total, 10 * MIN);
  r = await apps({ from: one, to: one }, '&sort=alpha'); assert.deepEqual(r.apps.map((a) => a.name), ['Google Chrome', 'Notepad']);
  const wide = await apps({ from: ranges.ymd(lastYear), to: ranges.ymd(today) }); assert.equal(byId(wide).get('chrome').total, all.get('chrome').total, 'a custom range covering everything equals All Time');
  // invalid dates fall back to unrestricted rather than failing
  assert.equal((await h.request(`${base}/api/apps?from=garbage&to=nonsense`)).status, 200);
});
