'use strict';
// Import/export round-trip for all three formats against the PACKAGED server, using an isolated data
// directory (never the user's real data). Export files are written to <project>/logs and re-read from
// there for the import step, so the on-disk files are what is actually tested.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers.cjs');

const present = fs.existsSync(h.packagedServerDir);
const skip = !present && process.env.WATCHTOWER_REQUIRE_PACKAGE !== '1' ? 'packaged build not found (run npm run desktop:dir)' : false;
const outDir = path.join(h.projectRoot, 'logs');

async function seed(base) {
  const apps = [
    ['notepad.exe', 'C:\\Windows\\notepad.exe', 'Notepad', 3 * 3600000],
    ['chrome.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'Google Chrome', 2 * 3600000],
    ['Code.exe', 'C:\\Users\\x\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe', 'Visual Studio Code', 1 * 3600000],
  ];
  for (const [exe, p, desc, ago] of apps) {
    const r = await h.request(`${base}/api/ingest`, { method: 'POST', body: { kind: 'app', at: new Date(Date.now() - ago).toISOString(), app: { exe, path: p, description: desc, pid: 100 + Math.floor(Math.random() * 900) } } });
    assert.equal(r.status, 200, r.text);
  }
  const r = await h.request(`${base}/api/ingest`, { method: 'POST', body: { kind: 'desktop' } });
  assert.equal(r.status, 200, r.text);
}

test('new settings persist and are clamped (theme, font, radius 0-24, goal)', { skip, timeout: 240000 }, async (t) => {
  const { root, dest } = h.isolateBundle(h.packagedServerDir);
  const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir, { recursive: true });
  const port = await h.freePort();
  const servers = [];
  t.after(async () => { for (const x of servers) await h.stopServer(x); await h.removeDir(root); });
  const srv = h.startServer(dest, dataDir, port);
  servers.push(srv);
  await h.waitHealthy(srv, port);
  const base = `http://127.0.0.1:${port}`;

  const patch = (body) => h.request(`${base}/api/settings`, { method: 'PATCH', body });
  let r = await patch({ theme: 'ocean', font: 'lora', radius: 0, dailyGoalHours: 4.5, animSpeed: 'calm', shadow: 'deep', numberRoll: false });
  assert.equal(r.status, 200, r.text);
  let s = (await h.request(`${base}/api/settings`)).json;
  assert.equal(s.theme, 'ocean'); assert.equal(s.font, 'lora'); assert.equal(s.radius, 0, 'radius 0 allowed');
  assert.equal(s.dailyGoalHours, 4.5); assert.equal(s.animSpeed, 'calm'); assert.equal(s.shadow, 'deep'); assert.equal(s.numberRoll, false);

  await patch({ radius: 99 });
  assert.equal((await h.request(`${base}/api/settings`)).json.radius, 24, 'radius clamps to 24');
  await patch({ radius: -5 });
  assert.equal((await h.request(`${base}/api/settings`)).json.radius, 0, 'radius clamps to 0');
  await patch({ dailyGoalHours: 99 });
  assert.equal((await h.request(`${base}/api/settings`)).json.dailyGoalHours, 24);

  // every theme/font id round-trips
  for (const theme of ['dark', 'light', 'system', 'ocean', 'forest', 'lavender', 'mocha', 'slate', 'sunset', 'sand', 'rose', 'frost', 'mint']) {
    await patch({ theme });
    assert.equal((await h.request(`${base}/api/settings`)).json.theme, theme);
  }
  // settings survive a restart
  await patch({ theme: 'forest', radius: 18 });
  await h.stopServer(srv);
  const port2 = await h.freePort();
  const srv2 = h.startServer(dest, dataDir, port2);
  servers.push(srv2);
  await h.waitHealthy(srv2, port2);
  s = (await h.request(`http://127.0.0.1:${port2}/api/settings`)).json;
  assert.equal(s.theme, 'forest'); assert.equal(s.radius, 18);
});

test('export JSON / Markdown / TXT, then import: all three formats import', { skip, timeout: 400000 }, async (t) => {
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  // ---------------- source database
  const A = h.isolateBundle(h.packagedServerDir);
  const dataA = path.join(A.root, 'data'); fs.mkdirSync(dataA, { recursive: true });
  const portA = await h.freePort();
  const srvA = h.startServer(A.dest, dataA, portA);
  const live = [srvA];
  t.after(async () => { for (const x of live) await h.stopServer(x); await h.removeDir(A.root); await h.removeDir(B.root); });
  let B;
  await h.waitHealthy(srvA, portA);
  const baseA = `http://127.0.0.1:${portA}`;
  await seed(baseA);
  const srcSessions = (await h.request(`${baseA}/api/sessions?pageSize=100`)).json.total;
  assert.ok(srcSessions >= 3, `seeded sessions: ${srcSessions}`);

  // ---------------- export all three formats to the logs folder
  const files = {};
  for (const [fmt, ext] of [['json', 'json'], ['md', 'md'], ['txt', 'txt']]) {
    const res = await h.request(`${baseA}/api/export?format=${fmt}`);
    assert.equal(res.status, 200, `${fmt} export status`);
    assert.ok(res.text.length > 200, `${fmt} export has content (${res.text.length} bytes)`);
    const file = path.join(outDir, `watchtower-test-export-${stamp}.${ext}`);
    fs.writeFileSync(file, res.text, 'utf8');
    files[fmt] = file;
  }
  const exported = JSON.parse(fs.readFileSync(files.json, 'utf8'));
  assert.ok(exported.sessions.length >= 3, 'JSON export holds the sessions');
  assert.ok(exported.applications.length >= 3, 'JSON export holds the applications');
  const md = fs.readFileSync(files.md, 'utf8');
  const txt = fs.readFileSync(files.txt, 'utf8');
  assert.match(md, /WatchTower Usage Report/); assert.match(md, /notepad/i); assert.match(md, /chrome/i);
  assert.match(txt, /notepad/i); assert.match(txt, /chrome/i);
  assert.equal((await h.request(`${baseA}/api/export?format=csv`)).status, 400, 'unsupported export format rejected');

  // ---------------- import validation behaviour (read back from disk)
  const imp = (filename, content, mode) => h.request(`${baseA}/api/import`, { method: 'POST', body: { filename, content, mode } });
  // reports now carry a data block and import like JSON
  let r = await imp(path.basename(files.md), fs.readFileSync(files.md, 'utf8'));
  assert.equal(r.json.ok, true, r.text.slice(0, 200)); assert.equal(r.json.applied, false);
  r = await imp(path.basename(files.txt), fs.readFileSync(files.txt, 'utf8'));
  assert.equal(r.json.ok, true, r.text.slice(0, 200)); assert.equal(r.json.applied, false);
  r = await imp('data.csv', 'a,b');
  assert.equal(r.status, 415); assert.equal(r.json.kind, 'unsupported');
  r = await imp('broken.json', '{ not json');
  assert.equal(r.json.ok, false); assert.equal(r.json.kind, 'invalid');

  // ---------------- import into a FRESH database (restore scenario)
  B = h.isolateBundle(h.packagedServerDir);
  const dataB = path.join(B.root, 'data'); fs.mkdirSync(dataB, { recursive: true });
  const portB = await h.freePort();
  let srvB = h.startServer(B.dest, dataB, portB);
  live.push(srvB);
  await h.waitHealthy(srvB, portB);
  const baseB = `http://127.0.0.1:${portB}`;
  assert.equal((await h.request(`${baseB}/api/sessions?pageSize=100`)).json.total, 0, 'fresh database starts empty');

  const jsonText = fs.readFileSync(files.json, 'utf8');
  const impB = (mode) => h.request(`${baseB}/api/import`, { method: 'POST', body: { filename: path.basename(files.json), content: jsonText, mode } });
  let p = await impB(undefined);
  assert.equal(p.json.ok, true); assert.equal(p.json.applied, false, 'preview does not change data');
  assert.equal((await h.request(`${baseB}/api/sessions?pageSize=100`)).json.total, 0, 'preview left database untouched');
  let m = await impB('merge');
  assert.equal(m.json.ok, true, m.text); assert.equal(m.json.applied, true);
  const afterMerge = (await h.request(`${baseB}/api/sessions?pageSize=100`)).json.total;
  assert.equal(afterMerge, srcSessions, 'merge restores every session');

  // importing the same file again must not duplicate
  await impB('merge');
  assert.equal((await h.request(`${baseB}/api/sessions?pageSize=100`)).json.total, srcSessions, 'merge is idempotent (no duplicates)');

  // replace mode keeps the same content
  const rep = await impB('replace');
  assert.equal(rep.json.ok, true, rep.text);
  assert.equal((await h.request(`${baseB}/api/sessions?pageSize=100`)).json.total, srcSessions, 'replace yields the same data');

  // imported data survives a restart
  await h.stopServer(srvB);
  const portB2 = await h.freePort();
  srvB = h.startServer(B.dest, dataB, portB2);
  live.push(srvB);
  await h.waitHealthy(srvB, portB2);
  const after = (await h.request(`http://127.0.0.1:${portB2}/api/sessions?pageSize=100`));
  assert.equal(after.json.total, srcSessions, 'imported data persisted across restart');
  assert.match(after.text, /notepad/i);

  // re-export from B equals the original session count
  const re = JSON.parse((await h.request(`http://127.0.0.1:${portB2}/api/export?format=json`)).text);
  assert.equal(re.sessions.length, exported.sessions.length, 're-exported JSON matches original');
});
