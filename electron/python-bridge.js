const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const http = require('http');
const { resolvePythonRuntime } = require('./python-runtime');
const { bundledToolEnv } = require('./bundled-tools');
const { resolveBackendLaunchPlan } = require('./runtime-contract');

class PythonBackend {
  constructor(port, isDev, apiToken = null, runtimeContext = {}) {
    this.port = port;
    this.isDev = isDev;
    this.runtimeMode = runtimeContext.runtimeMode || (isDev ? 'development' : 'packaged-legacy');
    this.resourcesPath = runtimeContext.resourcesPath || process.resourcesPath;
    this.userDataPath = runtimeContext.userDataPath || null;
    this.projectRoot = runtimeContext.projectRoot || path.join(__dirname, '..');
    this.resolvePython = runtimeContext.resolvePython || resolvePythonRuntime;
    this.process = null;
    this.apiToken = apiToken || crypto.randomBytes(32).toString('hex');
    this.lastBackendError = '';
    this.backendExitReason = '';
  }

  async start() {
    this.lastBackendError = '';
    this.backendExitReason = '';
    if (this.isDev) {
      const alreadyRunning = await this._isPortOpen(2000);
      if (alreadyRunning) {
        const authorized = await this._isAuthorizedBackend(2000);
        if (!authorized) {
          throw new Error(`Port ${this.port} is occupied by a backend that does not accept this ScriptCut session token.`);
        }
        console.log(`[backend] Dev backend already running on port ${this.port} — reusing it.`);
        return;
      }
    }

    const launchPlan = resolveBackendLaunchPlan({
      runtimeMode: this.runtimeMode,
      resourcesPath: this.resourcesPath,
      userDataPath: this.userDataPath,
      projectRoot: this.projectRoot,
      resolvePython: this.resolvePython,
    });

    const workerEnv = {
      ...process.env,
      ...launchPlan.environment,
      ...bundledToolEnv(this.isDev),
      SCRIPTCUT_API_TOKEN: this.apiToken,
      SCRIPTCUT_FILE_TOKEN_SECRET: this.apiToken,
      PYTHONUNBUFFERED: '1',
    };
    for (const key of launchPlan.environmentKeysToRemove || []) {
      delete workerEnv[key];
    }

    this.process = spawn(launchPlan.command, [
      ...launchPlan.argsPrefix,
      '-m', 'uvicorn', 'main:app',
      '--host', '127.0.0.1',
      '--port', String(this.port),
    ], {
      cwd: launchPlan.backendRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: workerEnv,
    });

    this.process.stdout.on('data', (data) => console.log(`[backend] ${data.toString().trim()}`));
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

  _request(pathname, timeoutMs, includeToken = false) {
    return new Promise((resolve) => {
      const req = http.get({
        hostname: '127.0.0.1',
        port: this.port,
        path: pathname,
        headers: includeToken ? { 'X-ScriptCut-Token': this.apiToken } : {},
      }, (res) => {
        res.resume();
        resolve(res.statusCode || 0);
      });
      req.on('error', () => resolve(0));
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve(0); });
      req.end();
    });
  }

  async _isPortOpen(timeoutMs) {
    return (await this._request('/health', timeoutMs)) === 200;
  }

  async _isAuthorizedBackend(timeoutMs) {
    return (await this._request('/system/diagnostics', timeoutMs, true)) === 200;
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
      const check = async () => {
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
        const status = await this._request('/health', 2000);
        if (status === 200) {
          resolve();
          return;
        }
        setTimeout(check, 500);
      };
      setTimeout(check, 1000);
    });
  }
}

module.exports = { PythonBackend };
