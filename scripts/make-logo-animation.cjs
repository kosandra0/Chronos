'use strict';
/**
 * Renders the rotating 3D WatchTower logo into an animated, rounded-corner WebP for the README and release notes.
 *
 * GitHub pages cannot run WebGL, so the "live" logo is recorded from the SAME scene the app draws (src/components/Logo3D.tsx):
 * same tower model (towerModels.ts), camera, lights and yellow searchlight. Time is stepped deterministically, so the loop
 * is seamless: the tower makes exactly one turn (0.55 rad/s, as in the app) and the searchlight exactly three turns
 * (1.65 rad/s instead of 1.5 rad/s so both come back to the start together).
 *
 * Usage: node scripts/make-logo-animation.cjs [variant] [outFile]
 * Needs Microsoft Edge or Chrome (any Chromium with WebGL via SwiftShader) and the project's `sharp` and `three` packages.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { stripTypeScriptTypes } = require('node:module');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const variant = process.argv[2] || 'classic';
const out = path.resolve(process.argv[3] || path.join(root, 'docs', 'images', 'watchtower-logo-rotating.webp'));
const RENDER = 560; // WebGL canvas (px), downscaled for smooth edges
const FINAL = 360; // output tile size (px)
const FPS = 15;
const TOWER_SPEED = 0.55; // rad/s, as in Logo3D
const LOOP_S = (2 * Math.PI) / TOWER_SPEED;
const BEAM_SPEED = (3 * 2 * Math.PI) / LOOP_S; // three searchlight turns per loop
const FRAMES = Math.round(LOOP_S * FPS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browsers = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const browser = browsers.find((b) => fs.existsSync(b));
if (!browser) throw new Error('Edge or Chrome is required');

const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}canvas{display:block}</style>
<script type="module">
import * as THREE from '/three.module.js';
import { buildTower, buildBeam } from '/towerModels.js';
const S = ${RENDER};
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(S, S); renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);
// identical to Logo3D.tsx
const model = buildTower(THREE, ${JSON.stringify(variant)});
const beamPivot = buildBeam(THREE, model.lampY);
const lookY = model.height * 0.45;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
camera.position.set(0, lookY + 0.45, model.height * 1.55 + 0.6);
camera.lookAt(0, lookY, 0);
scene.add(new THREE.AmbientLight(0xbfd0e6, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(3, 5, 4); scene.add(sun);
const group = new THREE.Group(); group.add(model.tower, beamPivot); group.rotation.x = 0.1; scene.add(group);
window.renderAt = (t) => { model.tower.rotation.y = 0.6 + ${TOWER_SPEED} * t; beamPivot.rotation.y = 0.9 - ${BEAM_SPEED} * t; renderer.render(scene, camera); return true; };
window.ready = true;
</script>`;

function startServer() {
  const towerJs = stripTypeScriptTypes(fs.readFileSync(path.join(root, 'src', 'components', 'towerModels.ts'), 'utf8'));
  const three = path.join(root, 'node_modules', 'three', 'build');
  const server = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    const send = (type, body) => { res.writeHead(200, { 'Content-Type': type }); res.end(body); };
    if (u === '/') return send('text/html', html);
    if (u === '/towerModels.js') return send('text/javascript', towerJs);
    if (u === '/three.module.js' || u === '/three.core.js') return send('text/javascript', fs.readFileSync(path.join(three, u.slice(1))));
    res.writeHead(404); res.end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const getJson = (url) => new Promise((resolve, reject) => http.get(url, (res) => { const c = []; res.on('data', (x) => c.push(x)); res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(c).toString())); } catch (e) { reject(e); } }); }).on('error', reject));

(async () => {
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chronos-test-logo-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const child = spawn(browser, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', '--force-device-scale-factor=1', `${base}/`], { stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 80 && !target; i++) { await sleep(500); try { target = (await getJson(`http://127.0.0.1:${port}/json`)).find((t) => t.type === 'page' && t.url.startsWith(base)); } catch { /* starting */ } }
    if (!target) throw new Error('browser page not found');
    const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const pending = new Map();
    ws.onmessage = (m) => { const j = JSON.parse(m.data); const p = pending.get(j.id); if (p) { pending.delete(j.id); j.error ? p.reject(new Error(JSON.stringify(j.error))) : p.resolve(j.result); } };
    const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: RENDER, height: RENDER, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    for (let i = 0; i < 80; i++) { const r = await send('Runtime.evaluate', { expression: 'window.ready === true', returnByValue: true }); if (r.result.value) break; await sleep(250); }

    // rounded tile: soft dark glass with a thin accent hairline; transparent outside the rounded corners
    const R = Math.round(FINAL * 0.22);
    const tile = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${FINAL}" height="${FINAL}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#111a24"/><stop offset="1" stop-color="#0b1017"/></linearGradient><radialGradient id="h" cx="0.5" cy="0.42" r="0.6"><stop offset="0" stop-color="#4fb3a5" stop-opacity="0.16"/><stop offset="1" stop-color="#4fb3a5" stop-opacity="0"/></radialGradient></defs><rect width="${FINAL}" height="${FINAL}" rx="${R}" fill="url(#g)"/><rect width="${FINAL}" height="${FINAL}" rx="${R}" fill="url(#h)"/><rect x="0.75" y="0.75" width="${FINAL - 1.5}" height="${FINAL - 1.5}" rx="${R - 0.75}" fill="none" stroke="#4fb3a5" stroke-opacity="0.38" stroke-width="1.5"/></svg>`);
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${FINAL}" height="${FINAL}"><rect width="${FINAL}" height="${FINAL}" rx="${R}" fill="#fff"/></svg>`);
    const inner = Math.round(FINAL * 0.9);
    const offset = Math.round((FINAL - inner) / 2);

    const raws = [];
    for (let f = 0; f < FRAMES; f++) {
      await send('Runtime.evaluate', { expression: `window.renderAt(${(f / FPS).toFixed(5)})`, returnByValue: true });
      const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, clip: { x: 0, y: 0, width: RENDER, height: RENDER, scale: 1 } });
      const logo = await sharp(Buffer.from(shot.data, 'base64')).resize(inner, inner, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
      const frame = await sharp(tile).composite([{ input: logo, left: offset, top: offset }, { input: mask, blend: 'dest-in' }]).raw().ensureAlpha().toBuffer();
      raws.push(frame);
      if (f % 40 === 0) process.stdout.write(`frame ${f + 1}/${FRAMES}\n`);
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const stacked = Buffer.concat(raws);
    const webp = await sharp(stacked, { raw: { width: FINAL, height: FINAL * FRAMES, channels: 4, pageHeight: FINAL } }).webp({ loop: 0, delay: Array(FRAMES).fill(Math.round(1000 / FPS)), quality: 82, effort: 5, alphaQuality: 90 }).toBuffer();
    fs.writeFileSync(out, webp);
    // a still poster of the first frame (fallback / social preview)
    await sharp(raws[0], { raw: { width: FINAL, height: FINAL, channels: 4 } }).png().toFile(out.replace(/\.webp$/, '-still.png'));
    console.log(`wrote ${out} (${FRAMES} frames @ ${FPS} fps, loop ${LOOP_S.toFixed(2)} s, ${(webp.length / 1024).toFixed(0)} KB)`);
    ws.close();
  } finally {
    try { child.kill(); } catch { /* gone */ }
    server.close();
    await sleep(1500);
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 }); } catch { /* browser still releasing files */ }
  }
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
