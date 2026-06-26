const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function probeCommand(command, args = []) {
  try {
    const result = spawnSync(command, [...args, '--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) {
      return null;
    }

    const output = `${result.stdout || ''} ${result.stderr || ''}`.trim();
    const match = output.match(/Python\s+(\d+)\.(\d+)\.(\d+)/i);
    if (!match) {
      return { major: 0, minor: 0, patch: 0 };
    }

    return {
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
    };
  } catch {
    return null;
  }
}

function getVirtualEnvCandidates() {
  const cwd = path.join(__dirname, '..');
  const suffix = process.platform === 'win32'
    ? path.join('Scripts', 'python.exe')
    : path.join('bin', 'python');

  const candidates = new Set();

  if (process.env.VIRTUAL_ENV) {
    candidates.add(path.join(process.env.VIRTUAL_ENV, suffix));
  }

  const preferredDirs = ['.venv', '.venv311', '.venv312', '.venv310', 'venv', 'env'];
  for (const dir of preferredDirs) {
    candidates.add(path.join(cwd, dir, suffix));
  }

  try {
    const entries = fs.readdirSync(cwd, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!/^\.?venv/i.test(entry.name)) continue;
      const pyvenvCfg = path.join(cwd, entry.name, 'pyvenv.cfg');
      if (!fs.existsSync(pyvenvCfg)) continue;
      candidates.add(path.join(cwd, entry.name, suffix));
    }
  } catch {
    // Ignore directory scan failures and fall back to known names.
  }

  return Array.from(candidates);
}

function isSupportedPython(version) {
  if (!version || version.major !== 3) {
    return false;
  }

  return version.minor >= 10 && version.minor <= 12;
}

function resolvePythonRuntime() {
  const explicitPython = process.env.CUTSCRIPT_PYTHON_PATH;
  if (explicitPython) {
    if (!isExecutable(explicitPython)) {
      throw new Error(`CUTSCRIPT_PYTHON_PATH is not executable: ${explicitPython}`);
    }
    const explicitVersion = probeCommand(explicitPython, []);
    if (!isSupportedPython(explicitVersion)) {
      throw new Error(
        `CUTSCRIPT_PYTHON_PATH points to unsupported Python ` +
        `${explicitVersion?.major ?? 0}.${explicitVersion?.minor ?? 0}.${explicitVersion?.patch ?? 0}. ` +
        'Use Python 3.10-3.12.'
      );
    }
    return { command: explicitPython, argsPrefix: [] };
  }

  let unsupportedVersion = null;

  for (const candidate of getVirtualEnvCandidates()) {
    if (!isExecutable(candidate)) {
      continue;
    }

    const version = probeCommand(candidate, []);
    if (isSupportedPython(version)) {
      return { command: candidate, argsPrefix: [] };
    }

    unsupportedVersion = unsupportedVersion || {
      command: candidate,
      version,
    };
  }

  const commandCandidates = process.platform === 'win32'
    ? [
        { command: 'py', argsPrefix: ['-3.11'] },
        { command: 'py', argsPrefix: ['-3.12'] },
        { command: 'py', argsPrefix: ['-3.10'] },
        { command: 'py', argsPrefix: ['-3'] },
        { command: 'python', argsPrefix: [] },
        { command: 'python3', argsPrefix: [] },
      ]
    : [
        { command: 'python3.11', argsPrefix: [] },
        { command: 'python3.12', argsPrefix: [] },
        { command: 'python3.10', argsPrefix: [] },
        { command: 'python3', argsPrefix: [] },
        { command: 'python', argsPrefix: [] },
      ];

  for (const candidate of commandCandidates) {
    const version = probeCommand(candidate.command, candidate.argsPrefix);
    if (!version) {
      continue;
    }

    if (isSupportedPython(version)) {
      return candidate;
    }

    unsupportedVersion = unsupportedVersion || {
      command: candidate.command,
      version,
    };
  }

  if (unsupportedVersion) {
    const { command, version } = unsupportedVersion;
    throw new Error(
      `Found unsupported Python ${version.major}.${version.minor}.${version.patch} at ${command}. ` +
      'Use Python 3.10-3.12, activate a compatible virtualenv, or set CUTSCRIPT_PYTHON_PATH.'
    );
  }

  throw new Error(
    'Python 3.10-3.12 was not found. Install a compatible Python, activate a virtualenv, or set CUTSCRIPT_PYTHON_PATH.'
  );
}

module.exports = { resolvePythonRuntime };
