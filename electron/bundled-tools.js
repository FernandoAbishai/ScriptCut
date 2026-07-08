const fs = require('fs');
const path = require('path');

function platformArchName() {
  return `${process.platform}-${process.arch}`;
}

function candidateRoots(isDev) {
  const roots = [];
  if (!isDev && process.resourcesPath) {
    roots.push(path.join(process.resourcesPath, 'bin'));
  }
  roots.push(path.join(__dirname, '..', 'build', 'bin'));
  return roots;
}

function executableNames(name) {
  return process.platform === 'win32' ? [`${name}.exe`, name] : [name];
}

function findBundledTool(name, isDev) {
  for (const root of candidateRoots(isDev)) {
    for (const fileName of executableNames(name)) {
      const candidates = [
        path.join(root, platformArchName(), fileName),
        path.join(root, fileName),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }
  return null;
}

function bundledToolEnv(isDev) {
  const ffmpeg = findBundledTool('ffmpeg', isDev);
  const ffprobe = findBundledTool('ffprobe', isDev);
  const env = {};
  const pathDirs = [];

  if (ffmpeg) {
    env.SCRIPTCUT_FFMPEG_PATH = ffmpeg;
    pathDirs.push(path.dirname(ffmpeg));
  }
  if (ffprobe) {
    env.SCRIPTCUT_FFPROBE_PATH = ffprobe;
    pathDirs.push(path.dirname(ffprobe));
  }

  if (pathDirs.length > 0) {
    env.PATH = [...new Set(pathDirs), process.env.PATH || ''].filter(Boolean).join(path.delimiter);
  }

  return env;
}

module.exports = { bundledToolEnv, findBundledTool, platformArchName };
