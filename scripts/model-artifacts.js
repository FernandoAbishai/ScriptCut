const fs = require('fs');
const path = require('path');

const MODEL_MANIFEST_SCHEMA = 'scriptcut.model.v1';
const BASELINE_MODEL_ID = 'whisper-base';
const BASELINE_MODEL_REVISION = 'ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e';

function validateModelManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Model manifest must be an object');
  }
  if (manifest.schema !== MODEL_MANIFEST_SCHEMA) throw new Error(`Model manifest schema must be ${MODEL_MANIFEST_SCHEMA}`);
  if (manifest.id !== BASELINE_MODEL_ID || manifest.engine !== 'whisper' || manifest.model !== 'base') {
    throw new Error('Model manifest must describe the trusted Whisper base model');
  }
  if (manifest.revision !== BASELINE_MODEL_REVISION) throw new Error('Model manifest revision is not the pinned Whisper base revision');
  if (manifest.filename !== 'base.pt' || !/^[a-z0-9._-]+$/.test(manifest.filename)) throw new Error('Model manifest filename is unsafe');
  if (!/^https:\/\//.test(manifest.sourceUrl || '')) throw new Error('Model manifest source must use HTTPS');
  if (!/^[a-f0-9]{64}$/.test(manifest.sha256 || '') || manifest.sha256 !== manifest.revision) throw new Error('Model manifest SHA-256 is invalid');
  if (!Number.isInteger(manifest.expectedBytes) || manifest.expectedBytes <= 0) throw new Error('Model manifest expected byte size is invalid');
  if (manifest.license !== 'MIT' || manifest.sourceProject !== 'openai/whisper' || manifest.codeVersion !== '20250625') {
    throw new Error('Model manifest provenance is incomplete');
  }
  return manifest;
}

function readModelManifest(filePath) {
  return validateModelManifest(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

module.exports = {
  MODEL_MANIFEST_SCHEMA,
  BASELINE_MODEL_ID,
  BASELINE_MODEL_REVISION,
  readModelManifest,
  validateModelManifest,
};
