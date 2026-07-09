const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const path = require('path');
const { PythonBackend } = require('./python-bridge');

let mainWindow = null;
let pythonBackend = null;
let backendStartupError = '';

const isDev = !app.isPackaged;
const BACKEND_PORT = 8642;

function isTrustedAppUrl(url) {
  if (isDev) {
    return url.startsWith('http://localhost:5173/');
  }
  return url.startsWith('file://');
}

function openExternalUrl(url) {
  if (url.startsWith('https://')) {
    void shell.openExternal(url);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'ScriptCut',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: isDev ? false : true,
    },
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    if (process.env.SCRIPTCUT_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools();
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedAppUrl(url)) return;
    event.preventDefault();
    openExternalUrl(url);
  });

  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    const token = pythonBackend?.apiToken;
    if (token && details.url.startsWith(`http://127.0.0.1:${BACKEND_PORT}/`)) {
      details.requestHeaders['X-ScriptCut-Token'] = token;
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  pythonBackend = new PythonBackend(BACKEND_PORT, isDev);
  try {
    await pythonBackend.start();
  } catch (error) {
    backendStartupError = error instanceof Error ? error.message : String(error);
    console.error('[backend] Startup failed:', backendStartupError);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (pythonBackend) {
    pythonBackend.stop();
  }
});

// IPC Handlers

ipcMain.handle('dialog:openFile', async (_event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] },
      { name: 'Audio Files', extensions: ['m4a', 'wav', 'mp3', 'flac'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    ...options,
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:openDirectory', async (_event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    ...options,
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov', 'webm'] },
      { name: 'Project Files', extensions: ['scriptcut', 'aive', 'cutscript'] },
    ],
    ...options,
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('dialog:openProject', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'ScriptCut Project', extensions: ['scriptcut', 'aive', 'cutscript'] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('safe-storage:encrypt', (_event, data) => {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(data).toString('base64');
  }
  return data;
});

ipcMain.handle('safe-storage:decrypt', (_event, encrypted) => {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  }
  return encrypted;
});

ipcMain.handle('get-backend-url', () => {
  return `http://localhost:${BACKEND_PORT}`;
});

ipcMain.handle('app:getStartupStatus', () => ({
  backendError: backendStartupError,
}));

ipcMain.handle('app:quit', () => {
  app.quit();
  return true;
});

ipcMain.handle('fs:readFile', async (_event, filePath) => {
  const fs = require('fs');
  return fs.readFileSync(filePath, 'utf-8');
});

ipcMain.handle('fs:writeFile', async (_event, filePath, content) => {
  const fs = require('fs');
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
});

ipcMain.handle('shell:revealPath', async (_event, filePath) => {
  shell.showItemInFolder(filePath);
  return true;
});

ipcMain.handle('shell:openPath', async (_event, filePath) => {
  const error = await shell.openPath(filePath);
  return error || true;
});
