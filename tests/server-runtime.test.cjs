'use strict';
// Starts the PACKAGED Next.js server in an isolated folder (no ancestor node_modules) under plain Node and
// exercises health, database initialisation and persistence across restarts. Uses a temp data directory only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers.cjs');

const present = fs.existsSync(h.packagedServerDir);
const skip = !present && process.env.WATCHTOWER_REQUIRE_PACKAGE !== '1' ? 'packaged build not found (run npm run desktop:dir)' : false;

test('packaged server: health, schema, persistence across restart', { skip, timeout: 240000 }, async (t) => {
  const { root, dest } = h.isolateBundle(h.packagedServerDir);
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  let port = await h.freePort();
  let srv = h.startServer(dest, dataDir, port);
  // Stop the server BEFORE deleting its folder (Windows cannot delete files a running process holds open).
  t.after(async () => { await h.stopServer(srv); await h.removeDir(root); });

  // ---- first launch: empty database is created
  const health = await h.waitHealthy(srv, port);
  assert.equal(health.ok, true);
  assert.equal(health.server, true);
  assert.equal(health.database, true, 'database initialised');
  assert.equal(health.schema, true, 'required tables exist');
  assert.equal(health.dataDirectory, true, 'data dir writable');
  assert.equal(health.version, require('../package.json').version);
  assert.ok(fs.existsSync(path.join(dataDir, 'database')), 'database folder created under the data dir');

  // ---- server is bound to loopback only
  assert.match(srv.output.join(''), /127\.0\.0\.1/);

  // ---- record real activity through the same API the monitoring agent uses
  const base = `http://127.0.0.1:${port}`;
  const start = new Date(Date.now() - 120000).toISOString();
  let r = await h.request(`${base}/api/ingest`, { method: 'POST', body: { kind: 'app', at: start, app: { exe: 'notepad.exe', path: 'C:\\Windows\\notepad.exe', description: 'Notepad', pid: 4242 } } });
  assert.equal(r.status, 200, r.text);
  r = await h.request(`${base}/api/ingest`, { method: 'POST', body: { kind: 'desktop' } });
  assert.equal(r.status, 200, r.text);

  const live = await h.request(`${base}/api/live`);
  assert.equal(live.status, 200);
  assert.equal(live.json.agent.active, true, 'ingest marks the agent as having reported in');

  const before = await h.request(`${base}/api/sessions?pageSize=50`);
  assert.equal(before.status, 200, before.text);
  assert.match(before.text, /notepad/i, 'notepad session recorded');
  const countBefore = (before.json.sessions || []).length;
  assert.ok(countBefore >= 1);

  // ---- graceful stop, then second launch against the SAME existing database
  await h.stopServer(srv);
  assert.equal(srv.exited, true);
  assert.match(srv.output.join(''), /database closed/);

  port = await h.freePort();
  srv = h.startServer(dest, dataDir, port);
  const health2 = await h.waitHealthy(srv, port);
  assert.equal(health2.ok, true);
  const after = await h.request(`http://127.0.0.1:${port}/api/sessions?pageSize=50`);
  assert.match(after.text, /notepad/i, 'history survived a restart');
  assert.ok((after.json.sessions || []).length >= countBefore, 'no records lost on restart');
});

test('a bundle without node_modules fails fast with a clear error (v0.1.0 regression)', { skip, timeout: 60000 }, async (t) => {
  const { root, dest } = h.isolateBundle(h.packagedServerDir);
  t.after(() => h.removeDir(root));
  fs.rmSync(path.join(dest, 'node_modules'), { recursive: true, force: true });
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const port = await h.freePort();
  const srv = h.startServer(dest, dataDir, port);
  const end = Date.now() + 20000;
  while (!srv.exited && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
  assert.equal(srv.exited, true, 'server without node_modules must exit');
  assert.match(srv.output.join(''), /Cannot find module 'next'/);
});
