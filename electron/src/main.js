const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const BACKEND_PORT  = 7891;
const FRONTEND_PORT = 5173;

let mainWindow = null;
let backendProcess = null;

// ── Start backend ─────────────────────────────────────────────────────
function startBackend() {
  const backendDir = isDev
    ? path.join(__dirname, '../../backend')
    : path.join(process.resourcesPath, 'backend');

  backendProcess = spawn('node', ['src/index.js'], {
    cwd: backendDir,
    env: { ...process.env, BACKEND_PORT, NODE_ENV: 'production' },
    stdio: 'inherit',
  });

  backendProcess.on('error', (err) => {
    console.error('Backend failed to start:', err);
  });

  return waitForBackend();
}

function waitForBackend(retries = 30) {
  return new Promise((resolve, reject) => {
    const try_ = (n) => {
      http.get(`http://127.0.0.1:${BACKEND_PORT}/api/health`, (res) => {
        if (res.statusCode === 200) resolve(); else try_(n - 1);
      }).on('error', () => {
        if (n <= 0) reject(new Error('Backend did not start in time'));
        else setTimeout(() => try_(n - 1), 500);
      });
    };
    setTimeout(() => try_(retries), 500);
  });
}

// ── Create window ─────────────────────────────────────────────────────
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 13 },
    backgroundColor: '#06080f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: isDev,
    },
    show: false,
  });

  const url = isDev
    ? `http://localhost:${FRONTEND_PORT}`
    : `file://${path.join(__dirname, '../renderer/index.html')}`;

  await mainWindow.loadURL(url);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (!isDev) await startBackend();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    backendProcess?.kill();
    app.quit();
  }
});

app.on('before-quit', () => {
  backendProcess?.kill();
});
