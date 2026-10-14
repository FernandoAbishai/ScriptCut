#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');
const { newestApp } = require('./check-packaged-runtime');

const root = path.join(__dirname, '..');

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(`Packaged Electron locale check failed: ${message}`);
}

function configuredLanguages() {
  const languages = packageJson.build?.mac?.electronLanguages;
  if (!Array.isArray(languages) || languages.length === 0) {
    fail('package.json build.mac.electronLanguages must be a non-empty array');
  }
  const normalized = languages.map((language) => String(language).trim()).filter(Boolean);
  if (normalized.length !== languages.length || new Set(normalized).size !== normalized.length) {
    fail('package.json build.mac.electronLanguages contains an empty or duplicate locale');
  }
  return normalized;
}

function localeDirectories(directory) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    fail(`locale resource directory is missing: ${path.relative(root, directory)}`);
  }
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.lproj'))
    .map((entry) => entry.name.slice(0, -'.lproj'.length))
    .sort();
}

function inspectLocaleRoot(directory, allowedLanguages, { requireAll = false } = {}) {
  const locales = localeDirectories(directory);
  const allowed = new Set(allowedLanguages.map((language) => language.toLowerCase()));
  const unexpected = locales.filter((locale) => !allowed.has(locale.toLowerCase()));
  if (unexpected.length > 0) {
    fail(`${path.relative(root, directory)} contains unexpected Electron locales: ${unexpected.join(', ')}`);
  }
  if (requireAll) {
    const present = new Set(locales.map((locale) => locale.toLowerCase()));
    const missing = allowedLanguages.filter((language) => !present.has(language.toLowerCase()));
    if (missing.length > 0) {
      fail(`${path.relative(root, directory)} is missing configured Electron locales: ${missing.join(', ')}`);
    }
  }
  return locales;
}

function inspectPackage(appPath) {
  const allowedLanguages = configuredLanguages();
  const resourcesPath = path.join(appPath, 'Contents', 'Resources');
  const frameworkResourcesPath = path.join(
    appPath,
    'Contents',
    'Frameworks',
    'Electron Framework.framework',
    'Versions',
    'A',
    'Resources',
  );
  const appLocales = inspectLocaleRoot(resourcesPath, allowedLanguages);
  const frameworkLocales = inspectLocaleRoot(frameworkResourcesPath, allowedLanguages, { requireAll: true });
  console.log(`Configured Electron locales: ${allowedLanguages.join(', ')}`);
  console.log(`App resource locales: ${appLocales.join(', ') || 'none'}`);
  console.log(`Electron Framework locales: ${frameworkLocales.join(', ')}`);
  console.log('Packaged Electron locale check passed.');
  return { appPath, allowedLanguages, appLocales, frameworkLocales };
}

function main() {
  if (process.platform !== 'darwin') fail(`requires macOS, received ${process.platform}`);
  const appPath = optionValue('--app') ? path.resolve(optionValue('--app')) : newestApp('arm64');
  if (!appPath.endsWith('.app') || !fs.existsSync(appPath)) fail(`app does not exist: ${appPath}`);
  return inspectPackage(appPath);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = { configuredLanguages, inspectPackage };
