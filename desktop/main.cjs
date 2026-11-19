const { app, BrowserWindow, dialog, shell, utilityProcess } = require('electron');
const { spawn } = require('node:child_process');
const { request } = require('node:http');
const { createServer } = require('node:net');
const path = require('node:path');
const fs = require('node:fs');

const APP_NAME = 'Chronos';
let mainWindow = null;
let serverProcess = null;
let agentProcess = null;
let serverUrl = null;
let isQuitting = false;
let serverExited = false;

app.setName(APP_NAME);
app.setAppUserModelId('com.chronos.usage-monitor');
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

function dataDirectory() {
  const dir = path.join(app.getPath('appData'), 'Chronos');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.end();
  });
}

function httpPost(url, value) {
  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify(value));
    const req = request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
      timeout: 2500,
    }, (res) => { res.resume(); res.on('end', resolve); });
    req.on('error', resolve);
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.end(body);
  });
}

async function waitForServer(url, timeoutMs = 45000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (!serverProcess || serverExited) {
      throw new Error('Chronos local server stopped before it became ready.');
    }
    try {
      if (await httpGet(`${url}/api/health`)) return;
    } catch { /* server is still starting */ }
    await new Promise((r) => setTimeout(r, 350));
  }
  throw new Error('Chronos took too long to start. Check whether Windows security software blocked the local application.');
}

function getServerDirectory() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'chronos-server');
  return path.resolve(__dirname, '..', '.next', 'standalone');
}

function startLocalServer(port) {
  const serverDir = getServerDirectory();
  const serverFile = path.join(serverDir, 'server.js');
  if (!fs.existsSync(serverFile)) {
    throw new Error(`The Chronos server bundle is missing:\n${serverFile}\n\nThe Windows desktop package must include the .next/standalone build.`);
  }

  const root = dataDirectory();
  const dbDir = path.join(root, 'database');
  const agentFile = app.isPackaged
    ? path.join(process.resourcesPath, 'agent', 'chronos-agent.ps1')
    : path.resolve(__dirname, '..', 'agent', 'chronos-agent.ps1');
  if (!fs.existsSync(agentFile)) throw new Error(`The Windows monitoring agent is missing:\n${agentFile}`);

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    CHRONOS_DATA_DIR: root,
    CHRONOS_DB_DIR: dbDir,
    CHRONOS_AGENT_PATH: agentFile,
  };

  // Electron's UtilityProcess provides a Node-enabled service process without relying
  // on ELECTRON_RUN_AS_NODE, which can be disabled by Electron's security fuses.
  serverExited = false;
  serverProcess = utilityProcess.fork(serverFile, [], {
    cwd: serverDir,
    env,
    stdio: 'ignore',
  });
  serverProcess.once('error', (error) => {
    if (!isQuitting) dialog.showErrorBox('Chronos could not start', error.message || 'The local server process failed.');
  });
  serverProcess.once('exit', (code) => {
    serverExited = true;
    if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox('Chronos stopped', `The local Chronos service exited unexpectedly (code ${code ?? 'unknown'}).`);
      app.quit();
    }
  });
  return { agentFile };
}

function startMonitor(agentFile) {
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  if (!fs.existsSync(powershell)) {
    throw new Error('Windows PowerShell was not found. Chronos can open, but automatic application monitoring cannot start.');
  }
  agentProcess = spawn(powershell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', agentFile, '-Server', serverUrl, '-PollMs', '500',
  ], {
    windowsHide: true,
    stdio: 'ignore',
  });
  agentProcess.once('error', (error) => {
    if (!isQuitting) dialog.showErrorBox('Chronos monitoring could not start', error.message);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: APP_NAME,
    backgroundColor: '#101318',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setMenu(null);
  mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.loadURL(serverUrl);
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function shutdown() {
  isQuitting = true;
  if (agentProcess && !agentProcess.killed) {
    try { agentProcess.kill(); } catch { /* already stopped */ }
    agentProcess = null;
  }
  if (serverUrl) {
    await httpPost(`${serverUrl}/api/ingest`, {
      kind: 'none', source: 'agent', reason: 'chronos-closed', at: new Date().toISOString(),
    });
  }
  if (serverProcess && !serverExited) {
    try { serverProcess.kill(); } catch { /* already stopped */ }
    serverProcess = null;
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  try {
    const port = await findFreePort();
    serverUrl = `http://127.0.0.1:${port}`;
    const { agentFile } = startLocalServer(port);
    await waitForServer(serverUrl);
    startMonitor(agentFile);
    createWindow();
  } catch (error) {
    dialog.showErrorBox('Chronos startup error', error instanceof Error ? error.message : String(error));
    await shutdown();
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (isQuitting) return;
  event.preventDefault();
  void shutdown().finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
