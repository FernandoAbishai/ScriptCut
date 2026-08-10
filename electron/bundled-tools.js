const fs = require('fs');
const path = require('path');

function platformArchName() {
  return `${process.platform}-${process.arch}`;
}

function candidateRoots(isDev, resourcesPath = process.resourcesPath) {
  const roots = [];
  if (!isDev && resourcesPath) {
    roots.push(path.join(resourcesPath, 'bin'));
  }
  roots.push(path.join(__dirname, '..', 'build', 'bin'));
  return roots;
}

function executableNames(name) {
  return process.platform === 'win32' ? [`${name}.exe`, name] : [name];
}

function findBundledTool(name, isDev, resourcesPath = process.resourcesPath) {
  for (const root of candidateRoots(isDev, resourcesPath)) {
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

function bundledToolEnv(isDev, resourcesPath = process.resourcesPath) {
  const ffmpeg = findBundledTool('ffmpeg', isDev, resourcesPath);
  const ffprobe = findBundledTool('ffprobe', isDev, resourcesPath);
  const env = {};
  const pathDirs = [];

  if (ffmpeg) {
    env.SCRIPTCUT_FFMPEG_PATH = ffmpeg;
    env.IMAGEIO_FFMPEG_EXE = ffmpeg;
    env.FFMPEG_BINARY = ffmpeg;
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
