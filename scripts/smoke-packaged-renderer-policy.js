#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [
  path.join(root, 'frontend', 'index.html'),
  path.join(root, 'frontend', 'dist', 'index.html'),
];
const electronMain = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');

function fail(message) {
  throw new Error(`Packaged renderer policy smoke failed: ${message}`);
}

function readPolicy(filePath) {
  if (!fs.existsSync(filePath)) fail(`missing ${path.relative(root, filePath)}`);
  const html = fs.readFileSync(filePath, 'utf8');
  const csp = html.match(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content="([^"]+)"/i)?.[1];
  if (!csp) fail(`${path.relative(root, filePath)} is missing its CSP meta tag`);
  return { html, csp, relativePath: path.relative(root, filePath) };
}

function directive(csp, name, filePath) {
  const value = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
  if (!value) fail(`${filePath} is missing ${name}`);
  return value;
}

for (const filePath of files) {
  const policy = readPolicy(filePath);
  const connect = directive(policy.csp, 'connect-src', policy.relativePath);
  const media = directive(policy.csp, 'media-src', policy.relativePath);
  if (!connect.split(/\s+/).includes('http://127.0.0.1:8642')) {
    fail(`${policy.relativePath} does not allow the fixed packaged backend in connect-src`);
  }
  if (!media.split(/\s+/).includes('http://127.0.0.1:8642')) {
    fail(`${policy.relativePath} does not allow the fixed packaged backend in media-src`);
  }
  if (connect.split(/\s+/).includes('*')) fail(`${policy.relativePath} uses a wildcard connect-src`);
  if (media.split(/\s+/).includes('*')) fail(`${policy.relativePath} uses a wildcard media-src`);
  if (/http:\/\/\*(?:\s|;|$)/.test(policy.csp)) fail(`${policy.relativePath} uses broad http://* access`);
  if (/webSecurity\s*:\s*false/i.test(policy.html)) fail(`${policy.relativePath} disables webSecurity`);
  if (!/href=["']\.\/brand\/scriptcut-mark\.svg["']/i.test(policy.html)) {
    fail(`${policy.relativePath} must use the relative favicon path`);
  }
  console.log(`${policy.relativePath}: fixed backend in connect-src/media-src; relative favicon; restrictive CSP`);
}

for (const [setting, expected] of [
  ['contextIsolation', 'true'],
  ['nodeIntegration', 'false'],
  ['sandbox', 'true'],
  ['webSecurity', 'true'],
]) {
  if (!new RegExp(`${setting}\\s*:\\s*${expected}`).test(electronMain)) {
    fail(`electron/main.js must keep ${setting}: ${expected}`);
  }
}
if (/webSecurity\s*:\s*false/i.test(electronMain)) fail('electron/main.js must not disable webSecurity');

console.log('Packaged renderer policy smoke passed.');
