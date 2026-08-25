import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const panelSource = readFileSync(resolve(__dirname, '../src/components/AIPanel.tsx'), 'utf8');

assert.match(panelSource, /const \[advancedExportOpen, setAdvancedExportOpen\] = useState\(false\)/);
assert.match(panelSource, /Advanced export settings/);
assert.match(panelSource, /aria-controls=\{`advanced-export-settings-\$\{draft\.id\}`\}/);
assert.match(panelSource, /advancedExportOpen && \(/);
assert.match(panelSource, /label="Frame"/);
assert.match(panelSource, /label="Captions"/);
assert.match(panelSource, /label="Style"/);
assert.match(panelSource, /label="Resolution"/);
assert.match(panelSource, /label="Format"/);
assert.match(panelSource, /<span>Enhance audio<\/span>/);
assert.match(panelSource, /<ClipBackgroundControls/);

assert.match(panelSource, /const \[publishingCopyOpen, setPublishingCopyOpen\] = useState\(false\)/);
assert.match(panelSource, /Publishing copy — optional/);
assert.match(panelSource, /aria-controls=\{`publishing-copy-\$\{draft\.id\}`\}/);
assert.match(panelSource, /publishingCopyOpen && \(/);
assert.match(panelSource, /publishingCopyOpen && draft\.titleSuggestions/);
assert.match(panelSource, /Publishing copy is ready, but it is not required to export this clip/);
assert.match(panelSource, /onClick=\{onGeneratePublishingCopy\}/);
assert.match(panelSource, /onClick=\{onCopyPublishingCopy\}/);

assert.match(panelSource, /suggested: 'Suggested'/);
assert.match(panelSource, /draft: 'Prepare'/);
assert.match(panelSource, /packaged: 'Prepared'/);
assert.match(panelSource, /exporting: 'Exporting'/);
assert.match(panelSource, /exported: 'Exported'/);
assert.match(panelSource, /failed: 'Needs retry'/);
assert.doesNotMatch(panelSource, /draft: 'Approved'/);
assert.doesNotMatch(panelSource, /packaged: 'Approved'/);

assert.match(panelSource, /const \[clipExportOutputs, setClipExportOutputs\]/);
assert.match(panelSource, /Clip ready/);
assert.match(panelSource, /Video output/);
assert.match(panelSource, /Reveal in Finder/);
assert.match(panelSource, /Download clip/);
assert.match(panelSource, /SRT sidecar/);
assert.match(panelSource, /Download SRT/);
assert.match(panelSource, /const exportWarnings = exportResult\?\.warnings \|\| \[\]/);
assert.match(panelSource, /\$\{successCount\} clip\$\{successCount === 1 \? '' : 's'\} ready/);
