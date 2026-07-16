#!/usr/bin/env node

/**
 * Builds a portable FFmpeg bundle for desktop releases.
 *
 * macOS package builds cannot safely copy only a Homebrew executable: it is
 * usually linked to Homebrew dylibs that do not exist on a creator's Mac. This
 * script collects the non-system dependency graph, rewrites load paths to the
 * bundle, and verifies the produced binaries before Electron Builder sees them.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const targetDir = path.join(root, 'build', 'bin', `${process.platform}-${process.arch}`);
const libraryDir = path.join(targetDir, 'lib');
const requireAss = process.env.SCRIPTCUT_REQUIRE_ASS === '1';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return result;
}

function findCommand(command) {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const result = run(lookup, [command]);
  return (result.stdout || '').trim().split(/\r?\n/)[0] || null;
}

function explicitPath(name) {
  const envName = name === 'ffmpeg' ? 'SCRIPTCUT_FFMPEG_PATH' : 'SCRIPTCUT_FFPROBE_PATH';
  const value = process.env[envName];
  if (!value) return null;
  const resolved = path.resolve(value);
  if (!fs.existsSync(resolved)) {
    throw new Error(`${envName} points to a missing executable: ${resolved}`);
  }
  return resolved;
}

function sourceFor(name) {
  return explicitPath(name) || findCommand(name) || (() => {
    throw new Error(`${name} was not found. Install FFmpeg or set the matching SCRIPTCUT_*_PATH variable.`);
  })();
}

function copyExecutable(name, source) {
  const targetName = process.platform === 'win32' && !name.endsWith('.exe') ? `${name}.exe` : name;
  const target = path.join(targetDir, targetName);
  fs.copyFileSync(source, target);
  fs.chmodSync(target, 0o755);
  return target;
}

function macDependencies(filePath) {
  const result = run('otool', ['-L', filePath]);
  return (result.stdout || '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().replace(/ \(compatibility version.*$/, ''))
    .filter(Boolean);
}

function isMacSystemLibrary(dependency) {
  return dependency.startsWith('/System/Library/') || dependency.startsWith('/usr/lib/');
}

function rewriteLoadPaths(target, source, replacements, isLibrary) {
  for (const dependency of macDependencies(source)) {
    const replacement = replacements.get(dependency);
    if (!replacement) continue;
    run('install_name_tool', ['-change', dependency, replacement, target]);
  }
  if (isLibrary) {
    run('install_name_tool', ['-id', `@loader_path/${path.basename(target)}`, target]);
  }
}

function createMacBundle(sources) {
  const files = new Map();
  const bundleDependencies = new Map();
  const dependencyAliases = new Map();
  const libraryNames = new Map();
  const queue = [];

  for (const [name, source] of Object.entries(sources)) {
    const target = copyExecutable(name, source);
    files.set(source, { target, isLibrary: false });
    queue.push(source);
  }

  while (queue.length > 0) {
    const source = queue.shift();
    for (const dependency of macDependencies(source)) {
      if (isMacSystemLibrary(dependency)) continue;
      if (dependency.startsWith('@')) {
        throw new Error(
          `Cannot make a portable bundle from ${source}: unresolved dependency ${dependency}. ` +
          'Use a self-contained FFmpeg build via SCRIPTCUT_FFMPEG_PATH.',
        );
      }
      if (!path.isAbsolute(dependency) || !fs.existsSync(dependency)) {
        throw new Error(`Cannot bundle FFmpeg dependency: ${dependency} referenced by ${source}`);
      }
      const canonicalDependency = fs.realpathSync(dependency);
      dependencyAliases.set(dependency, canonicalDependency);
      if (files.has(canonicalDependency)) continue;

      const baseName = path.basename(canonicalDependency);
      const existing = libraryNames.get(baseName);
      if (existing && existing !== canonicalDependency) {
        throw new Error(`FFmpeg bundle has conflicting libraries named ${baseName}: ${existing} and ${canonicalDependency}`);
      }

      const target = path.join(libraryDir, baseName);
      fs.copyFileSync(canonicalDependency, target);
      fs.chmodSync(target, 0o755);
      files.set(canonicalDependency, { target, isLibrary: true });
      bundleDependencies.set(canonicalDependency, target);
      libraryNames.set(baseName, canonicalDependency);
      queue.push(canonicalDependency);
    }
  }

  const replacements = new Map(
    [...bundleDependencies.entries()].map(([source, target]) => [
      source,
      `@loader_path/${path.basename(target)}`,
    ]),
  );
  for (const [alias, canonical] of dependencyAliases.entries()) {
    const target = bundleDependencies.get(canonical);
    if (target) replacements.set(alias, `@loader_path/${path.basename(target)}`);
  }

  for (const { target, isLibrary } of files.values()) {
    if (!isLibrary) {
      for (const [source, bundledTarget] of bundleDependencies.entries()) {
        replacements.set(source, `@executable_path/lib/${path.basename(bundledTarget)}`);
      }
      for (const [alias, canonical] of dependencyAliases.entries()) {
        const bundledTarget = bundleDependencies.get(canonical);
        if (bundledTarget) replacements.set(alias, `@executable_path/lib/${path.basename(bundledTarget)}`);
      }
      const original = [...files.entries()].find(([, value]) => value.target === target)?.[0];
      rewriteLoadPaths(target, original, replacements, false);
      for (const [source, bundledTarget] of bundleDependencies.entries()) {
        replacements.set(source, `@loader_path/${path.basename(bundledTarget)}`);
      }
      for (const [alias, canonical] of dependencyAliases.entries()) {
        const bundledTarget = bundleDependencies.get(canonical);
        if (bundledTarget) replacements.set(alias, `@loader_path/${path.basename(bundledTarget)}`);
      }
    } else {
      const original = [...files.entries()].find(([, value]) => value.target === target)?.[0];
      rewriteLoadPaths(target, original, replacements, true);
    }
  }

  for (const { target } of files.values()) {
    run('codesign', ['--force', '--sign', '-', target]);
  }

  return [...files.values()].map(({ target }) => target);
}

function verifyMacBundle(files) {
  for (const file of files) {
    const unsupported = macDependencies(file).filter(
      (dependency) =>
        !isMacSystemLibrary(dependency) &&
        !dependency.startsWith('@executable_path/') &&
        !dependency.startsWith('@loader_path/'),
    );
    if (unsupported.length > 0) {
      throw new Error(`Portable FFmpeg bundle still references host libraries: ${unsupported.join(', ')}`);
    }
  }
}

function supportsAss(ffmpegPath) {
  const result = run(ffmpegPath, ['-hide_banner', '-filters']);
  return (result.stdout || '').split(/\r?\n/).some((line) => /^\s*[.A-Z]{2}\s+ass\s/.test(line));
}

function writeManifest(ffmpegPath, ffprobePath, bundledFiles, assSubtitles) {
  const version = run(ffmpegPath, ['-version']).stdout.split(/\r?\n/)[0] || '';
  const manifest = {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    ffmpeg: path.basename(ffmpegPath),
    ffprobe: path.basename(ffprobePath),
    ffmpegVersion: version,
    bundledLibraries: bundledFiles.filter((file) => path.dirname(file) === libraryDir).map((file) => path.basename(file)).sort(),
    capabilities: {
      assSubtitles,
      captionFallback: assSubtitles ? 'burn-in' : 'sidecar-srt',
    },
  };
  fs.writeFileSync(path.join(targetDir, 'bundle-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function main() {
  const sources = { ffmpeg: sourceFor('ffmpeg'), ffprobe: sourceFor('ffprobe') };
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(libraryDir, { recursive: true });

  let bundledFiles;
  if (process.platform === 'darwin') {
    bundledFiles = createMacBundle(sources);
    verifyMacBundle(bundledFiles);
  } else {
    bundledFiles = Object.entries(sources).map(([name, source]) => copyExecutable(name, source));
  }

  const ffmpegPath = path.join(targetDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const ffprobePath = path.join(targetDir, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  run(ffmpegPath, ['-version']);
  run(ffprobePath, ['-version']);
  const assSubtitles = supportsAss(ffmpegPath);
  if (requireAss && !assSubtitles) {
    throw new Error('The selected FFmpeg build cannot burn ASS captions. Use a build with libass or unset SCRIPTCUT_REQUIRE_ASS for the tested sidecar fallback.');
  }
  writeManifest(ffmpegPath, ffprobePath, bundledFiles, assSubtitles);

  console.log(`Bundled portable FFmpeg tools: ${path.relative(root, targetDir)}`);
  console.log(`Burn-in captions: ${assSubtitles ? 'available' : 'sidecar SRT fallback'}`);
}

main();
