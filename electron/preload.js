const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
  openDirectory: (options) => ipcRenderer.invoke('dialog:openDirectory', options),
  saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  openProject: () => ipcRenderer.invoke('dialog:openProject'),
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  getStartupStatus: () => ipcRenderer.invoke('app:getStartupStatus'),
  quit: () => ipcRenderer.invoke('app:quit'),
  encryptString: (data) => ipcRenderer.invoke('safe-storage:encrypt', data),
  decryptString: (encrypted) => ipcRenderer.invoke('safe-storage:decrypt', encrypted),
  readProjectFile: (path) => ipcRenderer.invoke('project:read', path),
  writeProjectFile: (path, content) => ipcRenderer.invoke('project:write', path, content),
  writeClipManifest: (path, content) => ipcRenderer.invoke('clip-manifest:write', path, content),
  revealPath: (path) => ipcRenderer.invoke('shell:revealPath', path),
  openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
});
