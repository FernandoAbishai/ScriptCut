#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { checksumFile } = require('./release-alpha');
const {
  alphaSuffix,
  formatPublicArtifactFilename,
  highestAlphaSuffix,
  readProductVersion,
  validateAlphaReleaseTag,
} = require('./release-identity');
const { selectReleaseNotes } = require('./release-notes');

const root = path.join(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const PUBLIC_SCHEMA = 'scriptcut.release.v2';
const WORKFLOW_PATH = '.github/workflows/release-unsigned.yml';

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasOption(name) {
  return process.argv.includes(name);
}

function fail(message) {
  throw new Error(`Public release preparation failed: ${message}`);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`could not read JSON ${path.relative(root, filePath)}: ${error.message}`);
  }
}

function packageVersion() {
  return readProductVersion(packagePath);
}

function currentGitCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) fail('could not determine the current commit');
  return result.stdout.trim();
}

function existingTagsFromGit() {
  const result = spawnSync('git', ['tag', '--list'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) fail('could not inspect local tags');
  return result.stdout.split(/\r?\n/).map((tag) => tag.trim()).filter(Boolean);
}

const validateReleaseTag = validateAlphaReleaseTag;

function readExistingTags(filePath) {
  if (!filePath) return existingTagsFromGit();
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).map((tag) => tag.trim()).filter(Boolean);
}

function candidateArtifact(candidateDir, candidateManifest) {
  const filename = candidateManifest.artifact?.filename;
  if (!filename || path.basename(filename) !== filename) fail('candidate manifest artifact filename is not relative');
  const artifactPath = path.join(candidateDir, filename);
  if (!fs.existsSync(artifactPath)) fail(`candidate DMG is missing: ${filename}`);
  if (candidateManifest.signed !== false || candidateManifest.notarized !== false) {
    fail('candidate Apple trust state must remain not Developer ID signed and not notarized');
  }
  if (candidateManifest.codeSignature?.type !== 'ad-hoc' || candidateManifest.codeSignature?.structurallyValid !== true) {
    fail('candidate must provide a structurally valid ad-hoc code signature');
  }
  return artifactPath;
}

function publicManifest({ pkg, tag, commit, artifact, candidate, dmgAttestation }) {
  return {
    schema: PUBLIC_SCHEMA,
    productName: pkg.build?.productName || pkg.name,
    version: pkg.version,
    releaseTag: tag,
    channel: 'ad-hoc-public-alpha',
    prerelease: true,
    platform: 'darwin',
    architecture: 'arm64',
    commit,
    generatedAt: new Date().toISOString(),
    distribution: {
      mode: 'ad-hoc-public-alpha',
      appleDeveloperIdSigned: false,
      appleNotarized: false,
      gatekeeperTrusted: false,
      firstLaunchApprovalRequired: true,
    },
    codeSignature: {
      type: 'ad-hoc',
      structurallyValid: true,
      hardenedRuntime: false,
    },
    artifact: {
      filename: artifact.filename,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
    },
    runtime: {
      mode: candidate.runtime.mode,
      pythonSource: candidate.runtime.pythonSource,
      target: candidate.runtime.target,
      schema: candidate.runtime.schema,
      pythonVersion: candidate.runtime.pythonVersion,
      pythonBuild: candidate.runtime.pythonBuild,
      manifestSha256: candidate.runtime.manifestSha256,
    },
    coreInventorySha256: candidate.coreInventorySha256,
    ffmpeg: candidate.ffmpeg,
    model: {
      id: candidate.model.id,
      revision: candidate.model.revision,
      expectedBytes: candidate.model.expectedBytes,
      sha256: candidate.model.sha256,
      manifestSha256: candidate.model.manifestSha256,
      embedded: false,
    },
    provenance: {
      provider: 'github-artifact-attestation-sigstore',
      repository: 'FernandoAbishai/ScriptCut',
      workflow: WORKFLOW_PATH,
      commit,
      dmgAttestation,
    },
    reproducible: false,
    reproducibilityNote: 'Transitive runtime wheel hashes are not fully locked in this phase.',
  };
}

function publicNotes(manifest, { changelogPath, publicationNotesRequired = false } = {}) {
  const artifact = manifest.artifact.filename;
  const curated = selectReleaseNotes({
    releaseTag: manifest.releaseTag,
    changelogPath,
    publicationNotesRequired,
  });
  const dryRunLabel = curated.source === 'Unreleased'
    ? `> Dry-run / planned release-note content from \`CHANGELOG.md\` → \`Unreleased\`; it is not part of a published release history.\n\n`
    : '';
  return `# ScriptCut ${manifest.releaseTag} alpha

## What's changed

${dryRunLabel}${curated.markdown}

## ScriptCut alpha status

This is a public prerelease alpha for creator validation. It is provided from the official ScriptCut GitHub repository and uses an ad-hoc code signature for package integrity.

## Supported platform

macOS Apple Silicon (arm64) only. Intel, Windows, Linux, and browser builds are not public installer targets in this alpha.

## What's included

- A self-contained Electron application with portable Python ${manifest.runtime.pythonVersion} and the pinned core runtime.
- Bundled FFmpeg and FFprobe for local export.
- Baseline Whisper transcription code and a trusted model manifest.
- Optional capabilities may not be included in this build.

## Install

1. Open the official [ScriptCut Releases page](https://github.com/FernandoAbishai/ScriptCut/releases).
2. Download the Apple Silicon DMG for **${manifest.releaseTag}**.
3. Open the DMG and move or open ScriptCut as appropriate for the DMG layout.
4. Attempt to launch ScriptCut and select a video.

## macOS first-launch notice

This macOS build uses an ad-hoc code signature for package integrity, but it is not signed with Apple Developer ID and is not notarized by Apple. macOS may block the first launch because the app is not from an identified developer. If you obtained this DMG from the official ScriptCut GitHub release, open **System Settings → Privacy & Security → Open Anyway**, confirm the macOS prompt, and then open ScriptCut normally. Do not use this approval path for random applications or downloads.

## Baseline transcription model behavior

If the verified baseline model is not present, ScriptCut downloads and verifies it on the first transcription and shows progress. The model is stored in app-managed local storage; later baseline transcription can run without model-network access. The model is not embedded in this DMG.

## Optional capabilities

WhisperX, NeMo/Parakeet, pyannote, DeepFilterNet, MediaPipe, OpenCV, MoviePy, and other optional stacks may not be bundled. The packaged baseline path remains the supported transcription path for this alpha.

## Verify download

From the directory containing the downloaded files:

\`\`\`bash
shasum -a 256 -c SHA256SUMS.txt
\`\`\`

The checksum must match the exact public DMG filename: \`${artifact}\`.

## Build provenance

Advanced verification can confirm which official repository, workflow, and commit produced the artifact:

\`\`\`bash
gh attestation verify ${artifact} \\
  -R FernandoAbishai/ScriptCut \\
  --signer-workflow FernandoAbishai/ScriptCut/.github/workflows/release-unsigned.yml \\
  --source-digest ${manifest.commit}

gh attestation verify release-manifest.json \\
  -R FernandoAbishai/ScriptCut \\
  --signer-workflow FernandoAbishai/ScriptCut/.github/workflows/release-unsigned.yml \\
  --source-digest ${manifest.commit}
\`\`\`

Attestation establishes build provenance; it does not prove that the software is free of bugs or vulnerabilities. Checksums establish integrity and do not make macOS treat this app as notarized.

## Known alpha limitations

- The app uses an ad-hoc code signature but is not signed with Apple Developer ID or notarized, so the first launch requires the macOS approval path above.
- This release is a prerelease alpha; keep original media and project backups.
- Optional capabilities and some caption/export behavior depend on the packaged resources and current baseline support.
`;
}

async function preparePublicRelease(options = {}) {
  const pkg = readJson(packagePath);
  const productVersion = readProductVersion(packagePath);
  if (pkg.version !== productVersion) fail('package version does not match canonical productVersion');
  const tag = options.tag || optionValue('--tag');
  const publicationNotesRequired = options.publicationNotesRequired === true || hasOption('--require-release-notes');
  const changelogPath = options.changelogPath || optionValue('--changelog');
  const existingTags = options.existingTags || readExistingTags(optionValue('--existing-tags-file'));
  const tagInfo = validateReleaseTag(tag, productVersion, existingTags);
  const candidateDir = path.resolve(options.candidateDir || optionValue('--candidate-dir') || path.join(root, 'dist', 'release-candidate'));
  const outputDir = path.resolve(options.outputDir || optionValue('--output-dir') || path.join(root, 'dist', 'public-release'));
  const candidateManifestPath = path.join(candidateDir, 'release-manifest.json');
  if (!fs.existsSync(candidateManifestPath)) fail('candidate release-manifest.json is missing');
  const candidateManifest = readJson(candidateManifestPath);
  const sourceDmg = candidateArtifact(candidateDir, candidateManifest);
  const sourceHash = await checksumFile(sourceDmg);
  if (sourceHash !== candidateManifest.artifact.sha256 || fs.statSync(sourceDmg).size !== candidateManifest.artifact.bytes) {
    fail('candidate DMG does not match its internal manifest');
  }

  if (!options.preserveOutput) fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  for (const name of ['SHA256SUMS.txt', 'release-manifest.json', 'RELEASE_NOTES.md']) {
    fs.rmSync(path.join(outputDir, name), { force: true });
  }

  const publicFilename = formatPublicArtifactFilename(tagInfo.releaseTag, productVersion, 'arm64');
  const publicDmgPath = path.join(outputDir, publicFilename);
  if (!options.preserveOutput || !fs.existsSync(publicDmgPath)) {
    fs.copyFileSync(sourceDmg, publicDmgPath);
  }
  if (!fs.existsSync(publicDmgPath)) fail('public DMG staging did not produce the expected file');
  const artifact = {
    filename: publicFilename,
    bytes: fs.statSync(publicDmgPath).size,
    sha256: await checksumFile(publicDmgPath),
  };
  if (artifact.bytes !== candidateManifest.artifact.bytes || artifact.sha256 !== candidateManifest.artifact.sha256) {
    fail('public staging changed the candidate DMG bytes');
  }

  const commit = options.commit || currentGitCommit();
  if (!/^[0-9a-f]{40}$/.test(commit)) fail('commit must be a full SHA-1');
  const attestation = options.dmgAttestationUrl || optionValue('--dmg-attestation-url')
    ? {
      url: options.dmgAttestationUrl || optionValue('--dmg-attestation-url'),
      id: options.dmgAttestationId || optionValue('--dmg-attestation-id') || null,
      bundle: options.dmgAttestationBundle || optionValue('--dmg-attestation-bundle') || `${publicFilename}.sigstore.json`,
    }
    : null;
  const manifest = publicManifest({ pkg, tag: tagInfo.releaseTag, commit, artifact, candidate: candidateManifest, dmgAttestation: attestation });
  fs.writeFileSync(path.join(outputDir, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(outputDir, 'RELEASE_NOTES.md'), publicNotes(manifest, { changelogPath, publicationNotesRequired }), 'utf8');
  fs.writeFileSync(path.join(outputDir, 'SHA256SUMS.txt'), `${artifact.sha256}  ${artifact.filename}\n`, 'utf8');

  return { tagInfo, outputDir, publicDmgPath, manifestPath: path.join(outputDir, 'release-manifest.json'), manifest };
}

async function main() {
  if (hasOption('--validate-tag')) {
    const info = validateReleaseTag(optionValue('--tag'), packageVersion(), readExistingTags(optionValue('--existing-tags-file')));
    console.log(`Release tag valid: ${info.tag}; highest existing alpha: ${info.highestExistingSuffix}`);
    return;
  }
  const result = await preparePublicRelease({
    tag: optionValue('--tag'),
    candidateDir: optionValue('--candidate-dir'),
    outputDir: optionValue('--output-dir'),
    preserveOutput: hasOption('--preserve-output'),
    commit: optionValue('--commit'),
    dmgAttestationUrl: optionValue('--dmg-attestation-url'),
    dmgAttestationId: optionValue('--dmg-attestation-id'),
    dmgAttestationBundle: optionValue('--dmg-attestation-bundle'),
    publicationNotesRequired: hasOption('--require-release-notes'),
    changelogPath: optionValue('--changelog'),
  });
  console.log(`Public release prepared: ${path.relative(root, result.outputDir)}`);
  console.log(`Public DMG: ${path.relative(root, result.publicDmgPath)}`);
  console.log(`Release tag: ${result.tagInfo.tag}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  PUBLIC_SCHEMA,
  WORKFLOW_PATH,
  alphaSuffix,
  highestAlphaSuffix,
  preparePublicRelease,
  publicNotes,
  validateReleaseTag,
};
