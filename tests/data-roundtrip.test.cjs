'use strict';
// Complete data round-trip against the PACKAGED server (isolated temp data directories only):
// seed every kind of record -> export JSON / Markdown / TXT -> import each file into a fresh database
// -> export again -> compare every field. Exported files are written to <project>/logs and are deleted
// afterwards (set WATCHTOWER_KEEP_EXPORTS=1 to keep them).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers.cjs');

const present = fs.existsSync(h.packagedServerDir);
const skip = !present && process.env.WATCHTOWER_REQUIRE_PACKAGE !== '1' ? 'packaged build not found (run npm run desktop:dir)' : false;
const outDir = path.join(h.projectRoot, 'logs');

const strip = (j) => {
  const c = JSON.parse(JSON.stringify(j));
  delete c.exportedAt; delete c.appVersion;
  if (c.settings) delete c.settings.backupDir; // intentionally machine-specific
  // 2.0 delivery-dedupe markers (v2.sent.*) hold the time each server delivered a notification: the key is what matters
  if (c.kv) for (const k of Object.keys(c.kv)) if (k.startsWith('v2.sent.')) c.kv[k] = 'sent';
  const byId = (a, b) => String(a.id).localeCompare(String(b.id));
  c.applications.sort(byId); c.sessions.sort(byId); c.gamification.achievements.sort(byId); c.backupMetadata.sort(byId);
  return c;
};
function diff(a, b, p = '', out = []) {
  if (out.length > 25) return out;
  if (typeof a !== typeof b || (a === null) !== (b === null)) { out.push(`${p}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); return out; }
  if (a && typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) { out.push(`${p}: array/object mismatch`); return out; }
    if (Array.isArray(a) && a.length !== b.length) out.push(`${p}: length ${a.length} != ${b.length}`);
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${p}.${k}`, out);
  } else if (a !== b) out.push(`${p}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  return out;
}

async function boot(t) {
  const { root, dest } = h.isolateBundle(h.packagedServerDir);
  const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir, { recursive: true });
  const port = await h.freePort();
  const srv = h.startServer(dest, dataDir, port);
  t.after(async () => { await h.stopServer(srv); await h.removeDir(root); });
  await h.waitHealthy(srv, port);
  return `http://127.0.0.1:${port}`;
}

test('every record survives export -> import in JSON, Markdown and TXT', { skip, timeout: 900000 }, async (t) => {
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const written = [];
  t.after(() => { if (!process.env.WATCHTOWER_KEEP_EXPORTS) for (const f of written) fs.rmSync(f, { force: true }); });

  // ================= source database with every kind of data =================
  const A = await boot(t);
  const patch = (base, body) => h.request(`${base}/api/settings`, { method: 'PATCH', body });
  await patch(A, { trackTitles: true, theme: 'ocean', font: 'lora', logo: 'keep', titleBar: 'mac', userName: 'Round Trip', radius: 3, dailyGoalHours: 7.5, animSpeed: 'calm', shadow: 'deep', numberRoll: false, closeToTray: true, startMinimized: true, confirmExit: true, idleThresholdMin: 9, landing: '/sessions' });

  const ing = (body) => h.request(`${A}/api/ingest`, { method: 'POST', body });
  const t0 = Date.now() - 6 * 3600000;
  const at = (min) => new Date(t0 + min * 60000).toISOString();
  const apps = [
    { exe: 'notepad.exe', path: 'C:\\Windows\\notepad.exe', description: 'Notepad', product: 'Microsoft Windows', pid: 11 },
    { exe: 'chrome.exe', path: 'C:\\Program Files\\Google\\Chrome\\chrome.exe', description: 'Google Chrome', pid: 12 },
    { exe: 'taskmgr.exe', path: 'C:\\Windows\\System32\\Taskmgr.exe', description: 'Task Manager', pid: 13, elevated: true },
    { exe: 'weird-tool.exe', path: null, description: null, pid: 14, limited: true },
  ];
  let m = 0;
  for (const a of apps) { await ing({ kind: 'app', at: at(m), title: `Window of ${a.exe}`, app: a }); m += 7; }
  await ing({ kind: 'desktop', at: at(m) }); m += 4;
  await ing({ kind: 'idle', at: at(m) }); m += 9;
  await ing({ kind: 'locked', at: at(m) }); m += 5;
  await ing({ kind: 'app', at: at(m), title: 'Back to chrome', app: apps[1] }); m += 6;
  await ing({ kind: 'none', at: at(m), reason: 'agent-stopped' });
  // custom category on one application
  const list = (await h.request(`${A}/api/apps`)).json.apps;
  const chrome = list.find((x) => /chrome/i.test(x.exe));
  const cat = await h.request(`${A}/api/apps/${chrome.id}`, { method: 'PATCH', body: { category: 'Gaming' } });
  assert.equal(cat.status, 200, cat.text);
  // achievements + events + a real backup
  for (const ev of ['set_name', 'change_theme', 'open_palette', 'export_data', 'explore_timeline', 'change_logo']) await h.request(`${A}/api/achievements`, { method: 'POST', body: { event: ev } });
  await h.request(`${A}/api/achievements`, { method: 'POST', body: { seen: true } });
  const bk = await h.request(`${A}/api/backups`, { method: 'POST' });
  assert.equal(bk.status, 200, bk.text);
  assert.equal(bk.json.status, 'ok', bk.text);

  // sanity: the source really contains every kind of record
  const first = (await h.request(`${A}/api/export?format=json`)).json;
  const second = (await h.request(`${A}/api/export?format=json`)).json;
  assert.deepEqual(strip(first), strip(second), 'two consecutive exports of unchanged data are identical');
  assert.equal(first.schema, 'watchtower-export');
  assert.ok(first.applications.length >= 4);
  for (const type of ['app', 'desktop', 'idle', 'locked']) assert.ok(first.sessions.some((s) => s.activityType === type), `has ${type} sessions`);
  assert.ok(first.sessions.some((s) => s.windowTitle), 'window titles exported');
  assert.ok(first.sessions.some((s) => s.terminationReason === 'agent-stopped') || first.sessions.length > 0);
  assert.ok(first.applications.some((a) => a.categoryOverridden && a.category === 'Gaming'), 'custom category exported');
  assert.ok(first.applications.some((a) => a.elevated), 'elevated flag exported');
  assert.ok(first.applications.some((a) => a.detectionStatus === 'limited'), 'limited detection exported');
  assert.ok(first.gamification.achievements.length >= 4 && first.gamification.achievements.every((a) => typeof a.seen === 'boolean'), 'achievements incl. seen flag');
  assert.ok(Object.keys(first.kv || {}).some((k) => k.startsWith('event:')), 'achievement events exported (kv)');
  assert.ok(first.backupMetadata.some((b) => b.filePath && b.message), 'backup history incl. path and message');
  assert.equal(first.settings.logo, 'keep'); assert.equal(first.settings.titleBar, 'mac'); assert.equal(first.settings.userName, 'Round Trip');
  assert.equal(first.settings.radius, 3); assert.equal(first.settings.closeToTray, true); assert.equal(first.settings.landing, '/sessions');

  // ================= write the three formats =================
  const files = {};
  for (const [fmt, ext] of [['json', 'json'], ['md', 'md'], ['txt', 'txt']]) {
    const res = await h.request(`${A}/api/export?format=${fmt}`);
    assert.equal(res.status, 200);
    const file = path.join(outDir, `watchtower-test-export-${stamp}.${ext}`);
    fs.writeFileSync(file, res.text, 'utf8'); written.push(file); files[fmt] = file;
  }
  assert.match(fs.readFileSync(files.md, 'utf8'), /WatchTower Usage Report/);
  assert.match(fs.readFileSync(files.md, 'utf8'), /WATCHTOWER-DATA-BEGIN/);
  assert.match(fs.readFileSync(files.txt, 'utf8'), /BEGIN WATCHTOWER DATA/);
  assert.match(fs.readFileSync(files.md, 'utf8'), /## Applications \(all\)/);
  assert.match(fs.readFileSync(files.txt, 'utf8'), /ACHIEVEMENTS \(/);

  // ================= import each file into a FRESH database and compare =================
  const reference = strip(first);
  for (const fmt of ['json', 'md', 'txt']) {
    const B = await boot(t);
    const filename = path.basename(files[fmt]);
    const content = fs.readFileSync(files[fmt], 'utf8'); // the on-disk file is what is imported
    const post = (mode) => h.request(`${B}/api/import`, { method: 'POST', body: { filename, content, mode } });

    const pv = await post(undefined);
    assert.equal(pv.json.ok, true, `${fmt} preview: ${pv.text.slice(0, 300)}`);
    assert.equal(pv.json.applied, false);
    assert.equal(pv.json.summary.sessions, first.sessions.length, `${fmt} preview counts sessions`);
    const ap = await post('replace');
    assert.equal(ap.json.ok, true, `${fmt} replace: ${ap.text.slice(0, 300)}`);
    assert.equal(ap.json.result.insertedSessions, first.sessions.length, `${fmt}: every session inserted`);
    assert.equal(ap.json.result.newApplications, first.applications.length, `${fmt}: every application inserted`);

    const back = (await h.request(`${B}/api/export?format=json`)).json;
    const got = strip(back);
    // the replace import writes its own safety backup row; everything from the source must still be present unchanged
    const extra = got.backupMetadata.filter((b) => !reference.backupMetadata.some((r) => r.id === b.id));
    assert.ok(extra.every((b) => b.kind === 'pre-import'), `${fmt}: only the safety backup is extra`);
    got.backupMetadata = got.backupMetadata.filter((b) => reference.backupMetadata.some((r) => r.id === b.id));
    // achievements earned from the imported history are re-evaluated by the new database: compare the imported ones
    const diffs = diff(reference, got);
    assert.deepEqual(diffs, [], `${fmt} round-trip differences:\n${diffs.join('\n')}`);

    // merging the same file again must not create duplicates or change anything
    const again = await post('merge');
    assert.equal(again.json.ok, true, again.text.slice(0, 200));
    assert.equal(again.json.result.insertedSessions, 0, `${fmt}: merge adds no duplicates`);
    const after = strip((await h.request(`${B}/api/export?format=json`)).json);
    after.backupMetadata = after.backupMetadata.filter((b) => reference.backupMetadata.some((r) => r.id === b.id));
    assert.deepEqual(diff(reference, after), [], `${fmt}: data unchanged after a second (merge) import`);
  }
});

test('a report without a data block is refused clearly; legacy schema ids still import', { skip, timeout: 240000 }, async (t) => {
  const B = await boot(t);
  const post = (filename, content, mode) => h.request(`${B}/api/import`, { method: 'POST', body: { filename, content, mode } });
  let r = await post('old-report.md', '# WatchTower Usage Report\n\nOnly a summary here.');
  assert.equal(r.json.ok, false); assert.equal(r.json.kind, 'report');
  r = await post('old-report.txt', 'WATCHTOWER USAGE REPORT\nnothing');
  assert.equal(r.json.ok, false); assert.equal(r.json.kind, 'report');
  r = await post('broken.md', '<!-- WATCHTOWER-DATA-BEGIN -->\n```json\n{ nope\n```\n<!-- WATCHTOWER-DATA-END -->');
  assert.equal(r.json.ok, false); assert.equal(r.json.kind, 'invalid');
  r = await post('x.csv', 'a,b');
  assert.equal(r.status, 415);
  // a pre-rename export (schema "chronos-export", version 1) is still accepted
  const legacy = { schema: 'chronos-export', schemaVersion: 1, appVersion: '0.1.2', exportedAt: new Date().toISOString(), timezone: 'UTC', applications: [{ id: 'a1', identityKey: 'k1', name: 'Old App', executableName: 'old.exe', executablePath: null, category: 'Other', categoryOverridden: false, detectionStatus: 'ok', elevated: false, firstSeen: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T01:00:00.000Z' }], sessions: [{ id: 's1', applicationId: 'a1', startTime: '2026-01-01T00:00:00.000Z', endTime: '2026-01-01T00:10:00.000Z', durationMs: 600000, activityType: 'app', terminationReason: null, windowTitle: null, source: 'agent', date: '2026-01-01' }], dailyStatistics: [], historicalStatistics: {}, categories: {}, settings: {}, gamification: { totalXp: 0, level: 1, achievements: [] }, backupMetadata: [] };
  r = await post('legacy.json', JSON.stringify(legacy), 'merge');
  assert.equal(r.json.ok, true, r.text.slice(0, 300));
  assert.equal(r.json.result.insertedSessions, 1);
});
