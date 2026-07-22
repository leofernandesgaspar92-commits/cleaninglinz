// ============================================================================
//  Leco Desktop (Electron) – Hauptprozess
//  Startet das Leco-Backend als Kindprozess (liefert zugleich das Frontend
//  statisch aus) und öffnet es in einem nativen Fenster. Ergebnis: eine echte
//  Windows-App (.exe / MSIX) – doppelklicken, fertig. Kein Terminal nötig.
// ============================================================================
import { app, BrowserWindow, Menu, shell, dialog } from 'electron';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
// In der Entwicklung liegt das Backend eine Ebene höher; in der gepackten App
// unter resources/backend (siehe electron-builder "extraResources").
const isPackaged = app.isPackaged;
const BACKEND_DIR = isPackaged
  ? join(process.resourcesPath, 'backend')
  : resolve(__dirname, '../backend');
const FRONTEND_DIST = isPackaged
  ? join(process.resourcesPath, 'frontend', 'dist')
  : resolve(__dirname, '../frontend/dist');

const PORT = Number(process.env.LECO_PORT || 4137); // eigener Port, kollidiert nicht mit Dev (4000)
const BASE_URL = `http://127.0.0.1:${PORT}`;

let backend = null;
let mainWindow = null;

// --- Backend als Kindprozess starten ---------------------------------------
function startBackend() {
  const entry = join(BACKEND_DIR, 'src', 'server.js');
  if (!existsSync(entry)) {
    dialog.showErrorBox('Leco', `Backend nicht gefunden:\n${entry}`);
    return;
  }
  // Im gepackten Zustand steckt Node in Electron selbst (ELECTRON_RUN_AS_NODE).
  const nodeBin = isPackaged ? process.execPath : process.execPath;
  backend = spawn(nodeBin, [entry], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(PORT),
      SERVE_FRONTEND: '1',
      FRONTEND_DIST,
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backend.stdout.on('data', (d) => process.stdout.write(`[backend] ${d}`));
  backend.stderr.on('data', (d) => process.stderr.write(`[backend] ${d}`));
  backend.on('exit', (code) => {
    backend = null;
    if (code && code !== 0 && !app.isQuitting) {
      dialog.showErrorBox('Leco', `Das Backend wurde unerwartet beendet (Code ${code}).`);
    }
  });
}

// --- Auf Health-Endpunkt warten, dann Fenster laden ------------------------
function waitForBackend(timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolvePromise, reject) => {
    const tick = () => {
      const req = http.get(`${BASE_URL}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolvePromise();
        retry();
      });
      req.on('error', retry);
      req.setTimeout(2000, () => req.destroy());
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) return reject(new Error('Backend-Timeout'));
      setTimeout(tick, 400);
    };
    tick();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0e1117',
    show: false,
    title: 'Leco – Reinigungs-Imperium Linz',
    icon: join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(BASE_URL);

  // Externe Links im Standardbrowser öffnen, nicht in der App.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.startsWith(BASE_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// --- Natives Menü mit Tastenkürzeln ----------------------------------------
function buildMenu() {
  const template = [
    {
      label: 'Datei',
      submenu: [
        { label: 'Neu laden', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { type: 'separator' },
        { label: 'Beenden', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo', label: 'Rückgängig' }, { role: 'redo', label: 'Wiederholen' },
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' }, { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einfügen' }, { role: 'selectAll', label: 'Alles auswählen' },
      ],
    },
    {
      label: 'Ansicht',
      submenu: [
        { role: 'resetZoom', label: 'Zoom zurücksetzen' },
        { role: 'zoomIn', label: 'Vergrößern' }, { role: 'zoomOut', label: 'Verkleinern' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Vollbild' },
        { label: 'Entwicklertools', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() },
      ],
    },
    {
      label: 'Hilfe',
      submenu: [
        { label: 'Über Leco', click: () => dialog.showMessageBox(mainWindow, {
          type: 'info', title: 'Über Leco',
          message: `Leco Desktop\nVersion ${app.getVersion()}`,
          detail: 'Hyper-lokale Reinigungssoftware für Linz.\n© Leco Cleaning',
        }) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- Nur eine Instanz zulassen ---------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    startBackend();
    buildMenu();
    try {
      await waitForBackend();
    } catch (e) {
      dialog.showErrorBox('Leco', `Das Backend ist nicht gestartet:\n${e.message}`);
      app.quit();
      return;
    }
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

// --- Sauberes Beenden: Backend mitnehmen -----------------------------------
app.on('before-quit', () => { app.isQuitting = true; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('quit', () => { if (backend) { try { backend.kill(); } catch { /* egal */ } } });
