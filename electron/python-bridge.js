const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const http = require('http');
const { resolvePythonRuntime } = require('./python-runtime');
const { bundledToolEnv } = require('./bundled-tools');

class PythonBackend {
  constructor(port, isDev) {
    this.port = port;
    this.isDev = isDev;
    this.process = null;
    this.apiToken = null;
    this.lastBackendError = '';
    this.backendExitReason = '';
  }

  async start() {
    this.lastBackendError = '';
    this.backendExitReason = '';
    // In dev mode, check if a backend is already running (e.g. from `npm run dev:backend`)
    // If so, reuse it instead of spawning a duplicate.
    if (this.isDev) {
      const alreadyRunning = await this._isPortOpen(2000);
      if (alreadyRunning) {
        console.log(`[backend] Dev backend already running on port ${this.port} — reusing it.`);
        return;
      }
    }

    const backendDir = this.isDev
      ? path.join(__dirname, '..', 'backend')
      : path.join(process.resourcesPath, 'backend');

    const { command, argsPrefix } = resolvePythonRuntime();

    // Packaged builds use a per-launch token so another local process cannot
    // call the backend or stream arbitrary local files through it.
    this.apiToken = this.isDev ? null : crypto.randomBytes(32).toString('hex');

    this.process = spawn(command, [
      ...argsPrefix,
      '-m', 'uvicorn', 'main:app',
      '--host', '127.0.0.1',
      '--port', String(this.port),
    ], {
      cwd: backendDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...bundledToolEnv(this.isDev),
        ...(this.apiToken ? { SCRIPTCUT_API_TOKEN: this.apiToken } : {}),
        PYTHONUNBUFFERED: '1',
      },
    });

    this.process.stdout.on('data', (data) => {
      console.log(`[backend] ${data.toString().trim()}`);
    });

    this.process.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        this.lastBackendError = output.slice(-1200);
        console.error(`[backend] ${output}`);
      }
    });

    this.process.on('error', (err) => {
      this.backendExitReason = `Local backend could not start: ${err.message}`;
      this.lastBackendError = this.backendExitReason;
      console.error('[backend] Failed to start Python backend:', err.message);
    });

    this.process.on('exit', (code, signal) => {
      this.backendExitReason = signal
        ? `Local backend exited with signal ${signal}.`
        : `Local backend exited with code ${code ?? 'unknown'}.`;
      console.log(`[backend] ${this.backendExitReason}`);
      this.process = null;
    });

    await this._waitForReady(30000);
    console.log(`[backend] Ready on port ${this.port}`);
  }

  _isPortOpen(timeoutMs) {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${this.port}/health`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
      req.end();
    });
  }

  stop() {
    if (this.process) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(this.process.pid), '/f', '/t']);
      } else {
        this.process.kill('SIGTERM');
      }
      this.process = null;
    }
    this.apiToken = null;
  }

  _waitForReady(timeoutMs) {
    const startTime = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.backendExitReason) {
          const detail = this.lastBackendError ? ` ${this.lastBackendError}` : '';
          reject(new Error(`${this.backendExitReason}${detail}`));
          return;
        }
        if (Date.now() - startTime > timeoutMs) {
          const detail = this.lastBackendError ? ` Last backend error: ${this.lastBackendError}` : '';
          reject(new Error(`Backend startup timed out.${detail}`));
          return;
        }
        const remainingMs = timeoutMs - (Date.now() - startTime);
        let completed = false;
        const retry = () => {
          if (completed) return;
          completed = true;
          setTimeout(check, 500);
        };
        const req = http.get(`http://127.0.0.1:${this.port}/health`, (res) => {
          res.resume();
          if (res.statusCode === 200) {
            completed = true;
            resolve();
          } else {
            retry();
          }
        });
        req.on('error', retry);
        req.setTimeout(Math.max(1, Math.min(2000, remainingMs)), () => {
          req.destroy();
          retry();
        });
        req.end();
      };
      setTimeout(check, 1000);
    });
  }
}

module.exports = { PythonBackend };
