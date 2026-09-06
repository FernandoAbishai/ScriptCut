const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { PythonBackend } = require('./python-bridge');
const { selectRuntimeMode } = require('./runtime-contract');
const { MediaReadAllowlist } = require('./file-capabilities');
const { createAtomicTextWriteQueue } = require('./project-file-io');
const {
  assertTrustedIpcSender,
  isTrustedRendererUrl,
  packagedRendererUrl,
} = require('./renderer-security');

let mainWindow = null;
let pythonBackend = null;
let backendStartupError = '';

const isDev = !app.isPackaged;
const PROJECT_ROOT = path.join(__dirname, '..');
const PACKAGED_RENDERER_URL = packagedRendererUrl(PROJECT_ROOT);
const RENDERER_POLICY = { isDev, packagedUrl: PACKAGED_RENDERER_URL };
const BACKEND_PORT = 8642;
const BACKEND_ORIGIN = `http://127.0.0.1:${BACKEND_PORT}`;
const MAX_PROJECT_FILE_BYTES = 50 * 1024 * 1024;
const PROJECT_EXTENSIONS = new Set(['.scriptcut', '.aive', '.cutscript']);
const mediaReadAllowlist = new MediaReadAllowlist();
const writeProjectFileAtomic = createAtomicTextWriteQueue();

function fileExtension(filePath) {
  return typeof filePath === 'string' ? path.extname(filePath).toLowerCase() : '';
}

function assertProjectPath(filePath) {
  if (typeof filePath !== 'string' || !PROJECT_EXTENSIONS.has(fileExtension(filePath))) {
    throw new Error('Only ScriptCut project files can be read or written.');
  }
  assertSafeFilePath(filePath);
}

function assertTextContent(content) {
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_PROJECT_FILE_BYTES) {
    throw new Error('Project data must be text smaller than 50 MB.');
  }
}

function assertClipManifestPath(filePath) {
  const basename = typeof filePath === 'string' ? path.basename(filePath) : '';
  if (!/^scriptcut_clip_manifest_[a-zA-Z0-9-]+\.json$/.test(basename)) {
    throw new Error('Only ScriptCut clip manifests can be written.');
  }
  assertSafeFilePath(filePath);
}

function assertSafeFilePath(filePath) {
  const directory = path.dirname(path.resolve(filePath));
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error('The destination folder does not exist.');
  }
  if (fs.existsSync(filePath) && fs.lstatSync(filePath).isSymbolicLink()) {
    throw new Error('Symbolic links are not supported for project files.');
  }
}

function assertTrustedSender(event) {
  assertTrustedIpcSender(event, mainWindow, RENDERER_POLICY);
}

function approveProjectMediaFromContent(content) {
  try {
    const project = JSON.parse(content);
    if (project && typeof project === 'object' && typeof project.videoPath === 'string') {
      mediaReadAllowlist.tryApprove(project.videoPath);
    }
  } catch {
    // Project parsing/validation belongs to the renderer. Do not grant a path
    // when the project text cannot be parsed safely here.
  }
}

function createApprovedBackendFileUrl(filePath) {
  const secret = pythonBackend?.fileTokenSecret;
  if (!secret) throw new Error('Local file capability authority is unavailable.');
  return mediaReadAllowlist.createUrl(BACKEND_ORIGIN, filePath, secret);
}

function openExternalUrl(url) {
  if (url.startsWith('https://')) void shell.openExternal(url);
}

function createWindow({ hidden = false } = {}) {
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
      sandbox: true,
      webSecurity: true,
    },
    show: false,
  });
  if (hidden) mainWindow.hide();

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    if (process.env.SCRIPTCUT_OPEN_DEVTOOLS === '1') mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(PROJECT_ROOT, 'frontend', 'dist', 'index.html'));
  }

  if (!hidden) mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererUrl(url, RENDERER_POLICY)) return;
    event.preventDefault();
    openExternalUrl(url);
  });
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    const token = pythonBackend?.apiToken;
    if (token && details.url.startsWith(`${BACKEND_ORIGIN}/`)) {
      details.requestHeaders['X-ScriptCut-Token'] = token;
    }
    callback({ requestHeaders: details.requestHeaders });
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

app.whenReady().then(async () => {
  if (process.env.SCRIPTCUT_IDENTITY_SMOKE === '1') {
    console.log(`SCRIPTCUT_IDENTITY_SMOKE_RESULT=${JSON.stringify({ version: app.getVersion(), packaged: app.isPackaged, electron: process.versions.electron })}`);
    app.exit(0);
    return;
  }

  const runtimeMode = selectRuntimeMode({
    isDev,
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  });
  pythonBackend = new PythonBackend(BACKEND_PORT, isDev, process.env.SCRIPTCUT_API_TOKEN || null, {
    runtimeMode,
    resourcesPath: process.resourcesPath,
    userDataPath: app.getPath('userData'),
    projectRoot: PROJECT_ROOT,
  });
  try {
    await pythonBackend.start();
  } catch (error) {
    backendStartupError = error instanceof Error ? error.message : String(error);
    console.error('[backend] Startup failed:', backendStartupError);
  }

  if (process.env.SCRIPTCUT_RENDERER_SMOKE === '1') {
    try {
      if (!app.isPackaged) throw new Error('renderer transport smoke requires a packaged app');
      const { runRendererTransportSmoke } = require('./renderer-transport-smoke');
      const mediaPath = process.env.SCRIPTCUT_RENDERER_SMOKE_MEDIA_PATH;
      if (!mediaPath) throw new Error('renderer transport smoke media fixture is missing');
      mediaReadAllowlist.approve(mediaPath);
      const smokeWindow = createWindow({ hidden: true });
      const result = await runRendererTransportSmoke({
        window: smokeWindow,
        backendOrigin: BACKEND_ORIGIN,
        mediaPath,
      });
      console.log(`SCRIPTCUT_RENDERER_SMOKE_RESULT=${JSON.stringify(result)}`);
      pythonBackend.stop();
      app.exit(0);
    } catch (error) {
      console.error('[renderer-smoke] Failed:', error instanceof Error ? error.stack || error.message : String(error));
      pythonBackend.stop();
      app.exit(1);
    }
    return;
  }

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => pythonBackend?.stop());

ipcMain.handle('dialog:openFile', async (event, options) => {
  assertTrustedSender(event);
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] },
      { name: 'Audio Files', extensions: ['m4a', 'wav', 'mp3', 'flac'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    ...options,
  });
  if (result.canceled) return null;
  const selectedPath = result.filePaths[0];
  mediaReadAllowlist.tryApprove(selectedPath);
  return selectedPath;
});

ipcMain.handle('dialog:openDirectory', async (event, options) => {
  assertTrustedSender(event);
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    ...options,
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (event, options) => {
  assertTrustedSender(event);
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov', 'webm'] },
      { name: 'Project Files', extensions: ['scriptcut', 'aive', 'cutscript'] },
    ],
    ...options,
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('dialog:openProject', async (event) => {
  assertTrustedSender(event);
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'ScriptCut Project', extensions: ['scriptcut', 'aive', 'cutscript'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('safe-storage:encrypt', (event, data) => {
  assertTrustedSender(event);
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable.');
  return safeStorage.encryptString(data).toString('base64');
});
ipcMain.handle('safe-storage:decrypt', (event, encrypted) => {
  assertTrustedSender(event);
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable.');
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
});
ipcMain.handle('get-backend-url', (event) => { assertTrustedSender(event); return BACKEND_ORIGIN; });
ipcMain.handle('file:getUrl', (event, filePath) => {
  assertTrustedSender(event);
  return createApprovedBackendFileUrl(filePath);
});
ipcMain.handle('app:getStartupStatus', (event) => { assertTrustedSender(event); return { backendError: backendStartupError }; });
ipcMain.handle('app:getInfo', (event) => {
  assertTrustedSender(event);
  return { version: app.getVersion(), platform: process.platform, arch: process.arch, packaged: app.isPackaged, electron: process.versions.electron };
});
ipcMain.handle('app:quit', (event) => { assertTrustedSender(event); app.quit(); return true; });

ipcMain.handle('project:read', async (event, filePath) => {
  assertTrustedSender(event);
  assertProjectPath(filePath);
  if (fs.statSync(filePath).size > MAX_PROJECT_FILE_BYTES) throw new Error('Project file is larger than 50 MB.');
  const content = fs.readFileSync(filePath, 'utf-8');
  approveProjectMediaFromContent(content);
  return content;
});
ipcMain.handle('project:write', async (event, filePath, content) => {
  assertTrustedSender(event);
  assertProjectPath(filePath);
  assertTextContent(content);
  await writeProjectFileAtomic(filePath, content, { mode: 0o600 });
  return true;
});
ipcMain.handle('clip-manifest:write', async (event, filePath, content) => {
  assertTrustedSender(event);
  assertClipManifestPath(filePath);
  assertTextContent(content);
  fs.writeFileSync(filePath, content, { encoding: 'utf-8', mode: 0o600 });
  return true;
});
ipcMain.handle('shell:revealPath', async (event, filePath) => {
  assertTrustedSender(event);
  shell.showItemInFolder(filePath);
  return true;
});
ipcMain.handle('shell:openPath', async (event, filePath) => {
  assertTrustedSender(event);
  const error = await shell.openPath(filePath);
  return error || true;
});
