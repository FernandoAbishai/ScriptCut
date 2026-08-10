const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { resolvePythonRuntime } = require('./python-runtime');
const { bundledToolEnv } = require('./bundled-tools');
const { resolveBackendLaunchPlan } = require('./runtime-contract');

const STARTUP_LOG_FILENAME = 'scriptcut-backend-startup.log';
const MAX_VISIBLE_DIAGNOSTIC_LENGTH = 2400;

function redactSensitive(value, secrets = []) {
  let output = String(value ?? '');
  for (const secret of secrets) {
    if (secret) output = output.split(String(secret)).join('[REDACTED]');
  }
  return output.replace(
    /(SCRIPTCUT_API_TOKEN|SCRIPTCUT_FILE_TOKEN_SECRET|OPENAI_API_KEY|ANTHROPIC_API_KEY|HF_TOKEN|HUGGINGFACE_TOKEN)\s*[:=]\s*[^\s,;]+/gi,
    '$1=[REDACTED]',
  );
}

function capDiagnostic(value) {
  const output = redactSensitive(value).trim();
  return output.length > MAX_VISIBLE_DIAGNOSTIC_LENGTH
    ? `…${output.slice(-MAX_VISIBLE_DIAGNOSTIC_LENGTH)}`
    : output;
}

function pathExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function executableBitPresent(filePath) {
  try {
    return Boolean(fs.statSync(filePath).mode & fs.constants.S_IXUSR);
  } catch {
    return false;
  }
}

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
    this.redactionSecrets = Object.freeze([...new Set([
      this.apiToken,
      process.env.SCRIPTCUT_API_TOKEN,
      process.env.SCRIPTCUT_FILE_TOKEN_SECRET,
      process.env.OPENAI_API_KEY,
      process.env.ANTHROPIC_API_KEY,
      process.env.HF_TOKEN,
      process.env.HUGGINGFACE_TOKEN,
    ].filter(Boolean))]);
    this.lastBackendError = '';
    this.backendExitReason = '';
    this.startupLogActive = false;
    this.startupLogPath = path.join(
      this.userDataPath || path.join(os.tmpdir(), 'scriptcut-user-data'),
      'logs',
      STARTUP_LOG_FILENAME,
    );
  }

  async start() {
    this.lastBackendError = '';
    this.backendExitReason = '';
    this.startupLogActive = true;
    if (this.isDev) {
      const alreadyRunning = await this._isPortOpen(2000);
      if (alreadyRunning) {
        const authorized = await this._isAuthorizedBackend(2000);
        if (!authorized) {
          this.startupLogActive = false;
          throw new Error(`Port ${this.port} is occupied by a backend that does not accept this ScriptCut session token.`);
        }
        console.log(`[backend] Dev backend already running on port ${this.port} — reusing it.`);
        this.startupLogActive = false;
        return;
      }
    }

    this._ensureLogDirectory();
    this._appendStartupLog('startup session', `runtimeMode=${this.runtimeMode}\nuserDataPath=${this.userDataPath || 'unset'}`);

    let launchPlan;
    try {
      launchPlan = resolveBackendLaunchPlan({
        runtimeMode: this.runtimeMode,
        resourcesPath: this.resourcesPath,
        userDataPath: this.userDataPath,
        projectRoot: this.projectRoot,
        resolvePython: this.resolvePython,
      });
      this.startupLogPath = path.join(launchPlan.logRoot, STARTUP_LOG_FILENAME);

      const workerEnv = {
        ...process.env,
        ...launchPlan.environment,
        ...bundledToolEnv(this.isDev, launchPlan.resourcesPath),
        SCRIPTCUT_API_TOKEN: this.apiToken,
        SCRIPTCUT_FILE_TOKEN_SECRET: this.apiToken,
        PYTHONUNBUFFERED: '1',
      };
      for (const key of launchPlan.environmentKeysToRemove || []) {
        delete workerEnv[key];
      }

      this._ensureWritableRoots(launchPlan);
      this._logLaunchPlan(launchPlan, workerEnv);

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

      this.process.stdout.on('data', (data) => {
        const output = data.toString();
        this._recordStartupChildOutput('stdout', output);
        console.log(`[backend] ${output.trim()}`);
      });
      this.process.stderr.on('data', (data) => {
        const output = data.toString();
        this._recordStartupChildOutput('stderr', output);
        if (output.trim()) {
          this.lastBackendError = `${this.lastBackendError}\n${redactSensitive(output, this.redactionSecrets)}`.trim().slice(-4000);
          console.error(`[backend] ${output.trim()}`);
        }
      });
      this.process.on('error', (err) => {
        this.backendExitReason = `Local backend could not start: ${err.message}`;
        this.lastBackendError = this.backendExitReason;
        this._appendStartupLog('spawn error', err.stack || err.message);
        console.error('[backend] Failed to start Python backend:', err.message);
      });
      this.process.on('exit', (code, signal) => {
        this.backendExitReason = signal
          ? `Local backend exited with signal ${signal}.`
          : `Local backend exited with code ${code ?? 'unknown'}.`;
        this._appendStartupLog('exit', `code=${code ?? 'unknown'}\nsignal=${signal || 'none'}`);
        console.log(`[backend] ${this.backendExitReason}`);
        this.process = null;
      });

      await this._waitForReady(30000);
      this._appendStartupLog('ready', `port=${this.port}`);
      this.startupLogActive = false;
      console.log(`[backend] Ready on port ${this.port}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._appendStartupLog('startup failure', message);
      this.startupLogActive = false;
      throw new Error(this._withStartupLog(message));
    }
  }

  _ensureLogDirectory() {
    const logRoot = path.dirname(this.startupLogPath);
    fs.mkdirSync(logRoot, { recursive: true });
    if (!fs.statSync(logRoot).isDirectory()) throw new Error(`Backend log root is not a directory: ${logRoot}`);
  }

  _appendStartupLog(label, value) {
    try {
      this._ensureLogDirectory();
      const timestamp = new Date().toISOString();
      const output = redactSensitive(value, this.redactionSecrets);
      fs.appendFileSync(this.startupLogPath, `[${timestamp}] ${label}\n${output}\n`, 'utf8');
    } catch (error) {
      console.error('[backend] Could not write startup log:', error.message);
    }
  }

  _recordStartupChildOutput(label, value) {
    if (!this.startupLogActive) return;
    this._appendStartupLog(label, value);
  }

  _ensureWritableRoots(launchPlan) {
    for (const [name, root] of Object.entries({
      modelRoot: launchPlan.modelRoot,
      cacheRoot: launchPlan.cacheRoot,
      logRoot: launchPlan.logRoot,
    })) {
      fs.mkdirSync(root, { recursive: true });
      if (!fs.statSync(root).isDirectory()) throw new Error(`${name} is not a writable directory: ${root}`);
      fs.accessSync(root, fs.constants.W_OK);
    }
  }

  _logLaunchPlan(launchPlan, workerEnv) {
    this._appendStartupLog('launch diagnostics', [
      `runtimeMode=${launchPlan.runtimeMode}`,
      `target=${launchPlan.target}`,
      `resourcesPath=${launchPlan.resourcesPath}`,
      `backendRoot=${launchPlan.backendRoot}`,
      `pythonExecutable=${launchPlan.command}`,
      `pythonExecutableExists=${pathExists(launchPlan.command)}`,
      `pythonExecutableBit=${executableBitPresent(launchPlan.command)}`,
      `corePackRoot=${launchPlan.corePackRoot || 'unset'}`,
      `corePackRootExists=${launchPlan.corePackRoot ? pathExists(launchPlan.corePackRoot) : false}`,
      `userDataPath=${launchPlan.userDataPath}`,
      `modelRoot=${launchPlan.modelRoot}`,
      `cacheRoot=${launchPlan.cacheRoot}`,
      `logRoot=${launchPlan.logRoot}`,
      `PATH(sanitized)=${workerEnv.PATH || ''}`,
      `PYTHONPATH=${workerEnv.PYTHONPATH || ''}`,
      `PYTHONHOME removed=${!Object.prototype.hasOwnProperty.call(workerEnv, 'PYTHONHOME')}`,
      `VIRTUAL_ENV removed=${!Object.prototype.hasOwnProperty.call(workerEnv, 'VIRTUAL_ENV')}`,
    ].join('\n'));
  }

  _withStartupLog(message) {
    const diagnostic = capDiagnostic(redactSensitive(message, this.redactionSecrets));
    if (diagnostic.includes(`Startup log: ${this.startupLogPath}`)) return diagnostic;
    return `${diagnostic || 'Backend startup failed.'} Startup log: ${this.startupLogPath}`;
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
          reject(new Error(this._withStartupLog(`${this.backendExitReason}${detail}`)));
          return;
        }
        if (Date.now() - startTime > timeoutMs) {
          if (this.lastBackendError) {
            reject(new Error(this._withStartupLog(`Backend startup failed: ${this.lastBackendError}`)));
          } else {
            reject(new Error(this._withStartupLog('Backend startup timed out.')));
          }
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
