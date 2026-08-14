#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const DEFAULT_CHANGELOG_PATH = path.join(root, 'CHANGELOG.md');
const RELEASE_TAG_PATTERN = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-alpha\.[1-9]\d*$/;

function fail(message) {
  throw new Error(`Release notes validation failed: ${message}`);
}

function normalizeLineEndings(text) {
  return String(text).replace(/\r\n?/g, '\n');
}

function readChangelog(changelogPath = DEFAULT_CHANGELOG_PATH) {
  try {
    return normalizeLineEndings(fs.readFileSync(changelogPath, 'utf8'));
  } catch (error) {
    fail(`could not read ${path.relative(root, changelogPath)}: ${error.message}`);
  }
}

function parseChangelog(text) {
  const lines = normalizeLineEndings(text).split('\n');
  const sections = new Map();
  let titleSeen = false;
  let current = null;

  lines.forEach((line, index) => {
    if (index === 0 && line === '# Changelog') {
      titleSeen = true;
      return;
    }
    const heading = /^(#{1,6})[ \t]+(.*?)[ \t]*$/.exec(line);
    if (heading && heading[1] === '##') {
      const name = heading[2];
      if (name !== 'Unreleased' && !RELEASE_TAG_PATTERN.test(name)) {
        fail(`malformed release section heading on line ${index + 1}: ${line}`);
      }
      if (sections.has(name)) fail(`duplicate release section: ${name}`);
      current = { name, line: index + 1, lines: [] };
      sections.set(name, current);
      return;
    }
    if (heading && heading[1] === '#') {
      if (titleSeen) fail(`unexpected top-level heading on line ${index + 1}: ${line}`);
      fail(`changelog must begin with # Changelog (found ${line})`);
    }
    if (heading && heading[1].length > 2 && current === null) {
      fail(`content heading appears before a release section on line ${index + 1}`);
    }
    if (current) current.lines.push(line);
  });

  if (!titleSeen) fail('missing # Changelog heading');
  if (!sections.has('Unreleased')) fail('missing Unreleased section');
  return sections;
}

function sectionMarkdown(section) {
  if (!section) return '';
  return section.lines.join('\n').trim();
}

function selectReleaseNotes({ releaseTag, publicationNotesRequired = false, changelogPath = DEFAULT_CHANGELOG_PATH } = {}) {
  if (!releaseTag || typeof releaseTag !== 'string') fail('releaseTag is required');
  const sections = parseChangelog(readChangelog(changelogPath));
  const exact = sections.get(releaseTag);
  const unreleased = sections.get('Unreleased');
  const exactMarkdown = sectionMarkdown(exact);

  if (publicationNotesRequired) {
    if (!exact) fail(`publication requires an exact changelog section for ${releaseTag}`);
    if (!exactMarkdown) fail(`publication changelog section is empty: ${releaseTag}`);
    return { releaseTag, source: releaseTag, markdown: exactMarkdown, publicationNotesRequired: true };
  }

  if (exact && exactMarkdown) {
    return { releaseTag, source: releaseTag, markdown: exactMarkdown, publicationNotesRequired: false };
  }
  const unreleasedMarkdown = sectionMarkdown(unreleased);
  if (!unreleasedMarkdown) fail('Unreleased changelog section is empty');
  return { releaseTag, source: 'Unreleased', markdown: unreleasedMarkdown, publicationNotesRequired: false };
}

module.exports = {
  DEFAULT_CHANGELOG_PATH,
  normalizeLineEndings,
  parseChangelog,
  selectReleaseNotes,
  sectionMarkdown,
};
