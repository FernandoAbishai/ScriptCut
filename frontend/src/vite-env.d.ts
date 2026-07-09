/// <reference types="vite/client" />

interface ElectronAPI {
  openFile: (options?: Record<string, unknown>) => Promise<string | null>;
  openDirectory: (options?: Record<string, unknown>) => Promise<string | null>;
  saveFile: (options?: Record<string, unknown>) => Promise<string | null>;
  openProject: () => Promise<string | null>;
  getBackendUrl: () => Promise<string>;
  getStartupStatus: () => Promise<{ backendError: string }>;
  quit: () => Promise<boolean>;
  encryptString: (data: string) => Promise<string>;
  decryptString: (encrypted: string) => Promise<string>;
  readProjectFile: (path: string) => Promise<string>;
  writeProjectFile: (path: string, content: string) => Promise<boolean>;
  writeClipManifest: (path: string, content: string) => Promise<boolean>;
  revealPath: (path: string) => Promise<boolean>;
  openPath: (path: string) => Promise<boolean | string>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
