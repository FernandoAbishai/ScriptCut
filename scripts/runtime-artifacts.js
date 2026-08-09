const path = require('path');

const PYTHON_RUNTIME_ARTIFACT = Object.freeze({
  provider: 'python-build-standalone',
  project: 'astral-sh/python-build-standalone',
  releaseTag: '20260807',
  pythonVersion: '3.11.15',
  build: '20260807',
  target: 'darwin-arm64',
  platform: 'darwin',
  arch: 'arm64',
  archive: 'cpython-3.11.15+20260807-aarch64-apple-darwin-install_only_stripped.tar.gz',
  source: 'https://github.com/astral-sh/python-build-standalone/releases/download/20260807/cpython-3.11.15%2B20260807-aarch64-apple-darwin-install_only_stripped.tar.gz',
  sha256: '76b27e15a5be9539b830fc698e2646d001b84a66500eeb5228cee46909d6f2cf',
  archiveBytes: 27121085,
});

const RUNTIME_VERSION_DIR = `${PYTHON_RUNTIME_ARTIFACT.pythonVersion}+${PYTHON_RUNTIME_ARTIFACT.build}`;
const RUNTIME_RELATIVE_ROOT = path.join('runtime', 'python', PYTHON_RUNTIME_ARTIFACT.target, RUNTIME_VERSION_DIR);
const RUNTIME_ARCHIVE_RELATIVE_PATH = path.join('runtime-cache', PYTHON_RUNTIME_ARTIFACT.archive);
const CORE_PACK_RELATIVE_ROOT = path.join('runtime', 'packs', 'core', PYTHON_RUNTIME_ARTIFACT.target);

module.exports = {
  PYTHON_RUNTIME_ARTIFACT,
  RUNTIME_VERSION_DIR,
  RUNTIME_RELATIVE_ROOT,
  RUNTIME_ARCHIVE_RELATIVE_PATH,
  CORE_PACK_RELATIVE_ROOT,
};
