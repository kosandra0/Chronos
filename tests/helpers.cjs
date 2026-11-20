'use strict';
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const projectRoot = path.resolve(__dirname, '..');
const packagedServerDir = path.join(projectRoot, 'release', 'win-unpacked', 'resources', 'watchtower-server');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

function request(url, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(url, {
      method,
      timeout: 15000,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {},
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not json */ }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end(data);
  });
}

/**
 * Copies a server bundle into a temp folder that has NO ancestor node_modules, so a missing
 * packaged dependency fails here exactly as it does on a user's PC (the v0.1.0 bug).
 */
function isolateBundle(sourceDir) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chronos-test-'));
  const dest = path.join(root, 'watchtower-server');
  fs.cpSync(sourceDir, dest, { recursive: true, dereference: true });
  return { root, dest };
}

function startServer(serverDir, dataDir, port) {
  const output = [];
  const child = spawn(process.execPath, ['server.js'], {
    cwd: serverDir,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      WATCHTOWER_DATA_DIR: dataDir,
      WATCHTOWER_DB_DIR: path.join(dataDir, 'database'),
    },
  });
  const state = { child, output, exited: false, code: null };
  child.stdout.on('data', (c) => output.push(String(c)));
  child.stderr.on('data', (c) => output.push(String(c)));
  child.on('exit', (code) => { state.exited = true; state.code = code; });
  return state;
}

async function waitHealthy(state, port, timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < end) {
    if (state.exited) throw new Error(`server exited early (code ${state.code}):\n${state.output.join('')}`);
    try {
      last = await request(`http://127.0.0.1:${port}/api/health`);
      if (last.status === 200 && last.json && last.json.ok) return last.json;
    } catch { /* still starting */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server not healthy in ${timeoutMs}ms. last=${JSON.stringify(last)}\n${state.output.join('')}`);
}

async function stopServer(state) {
  if (state.exited) return;
  try { state.child.send({ type: 'shutdown' }); } catch { /* channel closed */ } // graceful: closes PGlite, then exits
  const end = Date.now() + 10000;
  while (!state.exited && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
  if (!state.exited) state.child.kill();
}

async function removeDir(dir) {
  // Only ever called with a temp directory created by isolateBundle().
  if (!path.basename(dir).startsWith('chronos-test-') || path.dirname(dir) !== os.tmpdir()) throw new Error('refusing to delete ' + dir);
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

module.exports = { removeDir, projectRoot, packagedServerDir, freePort, request, isolateBundle, startServer, waitHealthy, stopServer };
