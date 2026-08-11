#!/usr/bin/env node

const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { PythonBackend } = require('../electron/python-bridge');

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(`Electron-like packaged backend smoke failed: ${message}`);
}

function request(port, pathname, { method = 'GET', token, headers = {} } = {}) {
  return new Promise((resolve) => {
    const requestHeaders = {
      ...headers,
      ...(token ? { 'X-ScriptCut-Token': token } : {}),
    };
    const requestHandle = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: requestHeaders,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        body: Buffer.concat(chunks).toString('utf8'),
        headers: response.headers,
      }));
    });
    requestHandle.on('error', () => resolve({ status: 0, body: '' }));
    requestHandle.setTimeout(2000, () => {
      requestHandle.destroy();
      resolve({ status: 0, body: '' });
    });
    requestHandle.end();
  });
}

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  if (!port) fail('could not reserve an available test port');
  return port;
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
}

async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    fail(`requires native macOS arm64, received ${process.platform}-${process.arch}`);
  }

  const appPath = path.resolve(optionValue('--app') || '');
  if (!appPath.endsWith('.app') || !fs.existsSync(appPath)) fail('packaged ScriptCut.app path is missing');
  const resourcesPath = path.join(appPath, 'Contents', 'Resources');
  if (!fs.existsSync(path.join(resourcesPath, 'manifests', 'runtime-manifest.json'))) {
    fail('packaged Resources runtime manifest is missing');
  }

  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptcut-electron-backend-'));
  const token = 'scriptcut-electron-backend-smoke-token';
  const providerSecret = 'scriptcut-provider-secret-redaction-probe';
  const startupStdoutMarker = 'SCRIPT_CUT_STARTUP_STDOUT_PRIVATE_MARKER';
  const startupStderrMarker = 'SCRIPT_CUT_STARTUP_STDERR_PRIVATE_MARKER';
  const postReadyMarker = 'SCRIPT_CUT_POST_READY_PRIVATE_MARKER';
  const port = await availablePort();
  const previousEnvironment = new Map([
    ['PATH', process.env.PATH],
    ['OPENAI_API_KEY', process.env.OPENAI_API_KEY],
    ['VIRTUAL_ENV', process.env.VIRTUAL_ENV],
    ['PYTHONHOME', process.env.PYTHONHOME],
    ['SCRIPTCUT_PYTHON_PATH', process.env.SCRIPTCUT_PYTHON_PATH],
    ['CUTSCRIPT_PYTHON_PATH', process.env.CUTSCRIPT_PYTHON_PATH],
  ]);
  for (const key of ['VIRTUAL_ENV', 'PYTHONHOME', 'SCRIPTCUT_PYTHON_PATH', 'CUTSCRIPT_PYTHON_PATH']) delete process.env[key];
  process.env.OPENAI_API_KEY = providerSecret;
  process.env.PATH = `/tmp/${providerSecret}:/usr/bin:/bin`;

  const backend = new PythonBackend(port, false, token, {
    runtimeMode: 'packaged-bundled',
    resourcesPath,
    userDataPath,
    projectRoot: path.join(userDataPath, 'project-root-not-used-in-packaged-mode'),
  });
  let child = null;

  try {
    const startup = backend.start();
    backend._recordStartupChildOutput('stdout', startupStdoutMarker);
    backend._recordStartupChildOutput('stderr', startupStderrMarker);
    await startup;
    child = backend.process;
    const health = await request(port, '/health', { headers: { Origin: 'null' } });
    assert.equal(health.status, 200, `health returned ${health.status}`);
    const unauthenticated = await request(port, '/system/checks', { headers: { Origin: 'null' } });
    assert.equal(unauthenticated.status, 401, `unauthenticated system checks returned ${unauthenticated.status}`);
    const packagedChecks = await request(port, '/system/checks', {
      token,
      headers: { Origin: 'null' },
    });
    assert.equal(packagedChecks.status, 200, `packaged system checks returned ${packagedChecks.status}`);
    assert.equal(packagedChecks.headers['access-control-allow-origin'], 'null', 'packaged origin was not allowed explicitly');
    const arbitraryOrigin = await request(port, '/system/checks', {
      token,
      headers: { Origin: 'https://example.invalid' },
    });
    assert.equal(arbitraryOrigin.status, 200, `arbitrary-origin system checks returned ${arbitraryOrigin.status}`);
    assert.equal(arbitraryOrigin.headers['access-control-allow-origin'], undefined, 'arbitrary origin received a CORS grant');
    const preflight = await request(port, '/system/checks', {
      method: 'OPTIONS',
      headers: {
        Origin: 'null',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-scriptcut-token',
      },
    });
    assert.equal(preflight.status, 200, `packaged preflight returned ${preflight.status}`);
    assert.equal(preflight.headers['access-control-allow-origin'], 'null', 'packaged preflight did not allow Origin: null');
    assert.match(preflight.headers['access-control-allow-methods'] || '', /POST/);
    assert.match(preflight.headers['access-control-allow-headers'] || '', /content-type/i);
    assert.match(preflight.headers['access-control-allow-headers'] || '', /x-scriptcut-token/i);
    const diagnosticsResponse = await request(port, '/system/diagnostics', { token });
    assert.equal(diagnosticsResponse.status, 200, `authenticated diagnostics returned ${diagnosticsResponse.status}`);
    backend._recordStartupChildOutput('stdout', postReadyMarker);
    backend._recordStartupChildOutput('stderr', postReadyMarker);

    const logPath = path.join(userDataPath, 'logs', 'scriptcut-backend-startup.log');
    assert.ok(fs.existsSync(logPath), 'startup log was not created');
    const startupLog = fs.readFileSync(logPath, 'utf8');
    for (const field of [
      'runtimeMode=packaged-bundled',
      'target=darwin-arm64',
      `resourcesPath=${resourcesPath}`,
      `backendRoot=${resourcesPath}/backend`,
      'pythonExecutable=',
      'pythonExecutableExists=true',
      'pythonExecutableBit=true',
      'corePackRootExists=true',
      `userDataPath=${userDataPath}`,
      `modelRoot=${userDataPath}/models`,
      `cacheRoot=${userDataPath}/cache`,
      `logRoot=${userDataPath}/logs`,
      'PATH(sanitized)=',
      'PYTHONPATH=',
      'PYTHONHOME removed=true',
      'VIRTUAL_ENV removed=true',
      'ready',
    ]) assert.ok(startupLog.includes(field), `startup log is missing ${field}`);
    assert.ok(startupLog.includes(startupStdoutMarker), 'startup stdout was not persisted before readiness');
    assert.ok(startupLog.includes(startupStderrMarker), 'startup stderr was not persisted before readiness');
    assert.ok(!startupLog.includes(postReadyMarker), 'post-ready child output was persisted in the startup log');
    assert.ok(!startupLog.includes(providerSecret), 'provider secret value was exposed in the startup log');
    assert.ok(startupLog.includes('[REDACTED]'), 'startup log did not redact a provider secret value');
    assert.ok(!startupLog.includes(token), 'startup log exposed the API token');
    assert.ok(fs.statSync(path.join(userDataPath, 'models')).isDirectory(), 'model root was not created');
    assert.ok(fs.statSync(path.join(userDataPath, 'cache')).isDirectory(), 'cache root was not created');
    assert.ok(fs.statSync(path.join(userDataPath, 'logs')).isDirectory(), 'log root was not created');

    backend.stop();
    const exit = child ? await waitForExit(child) : { code: 0, signal: null };
    assert.ok(exit.code === 0 || exit.signal === 'SIGTERM', `backend did not stop cleanly: ${JSON.stringify(exit)}`);

    console.log('Electron-like packaged backend /health: 200');
    console.log('Electron-like authenticated diagnostics: 200');
    console.log('Electron-like startup log: created with redacted diagnostics');
    console.log('Writable model/cache/log roots: created before spawn');
    console.log('Finder-like environment: PATH=/usr/bin:/bin, shell Python variables removed');
    console.log('System Python dependency: none; packaged bundled Python used');
    console.log('Electron-like packaged backend smoke passed.');
  } catch (error) {
    try {
      backend.stop();
    } catch {
      // Preserve the startup failure as the useful diagnostic.
    }
    throw error;
  } finally {
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
