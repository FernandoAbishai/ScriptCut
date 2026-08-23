import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHECK_DEFINITIONS,
  CHECK_IDS,
  HUMAN_OBSERVATION_PREFIX,
  MANUAL_CHECK_IDS,
  PROJECT_SCHEMA,
  QUALIFICATION_FORMAT,
  SCENARIO_IDS,
  STAGES,
  createQualificationEvidenceTemplate,
  validateQualificationEvidence,
} from './qualification/phase-5b6a-qualification.mjs';

const template = createQualificationEvidenceTemplate();
const fixtureFor = (scenario) => template.fixtures.find((fixture) => fixture.scenario === scenario).id;
const allPass = structuredClone(template);
allPass.run = { id: 'smoke-all-pass', createdAt: '2026-08-22T00:00:00.000Z', completedAt: '2026-08-22T00:01:00.000Z' };
allPass.checks = allPass.checks.map((item) => ({
  ...item,
  status: item.required ? 'PASS' : 'NOT APPLICABLE',
  evidence: item.kind === 'manual'
    ? `${HUMAN_OBSERVATION_PREFIX}Smoke fixture records an explicit creator observation.`
    : item.required
      ? 'Deterministic smoke evidence recorded.'
      : 'Provider-specific optional check was not applicable.',
}));
allPass.overall = { status: 'PASS', evidence: 'All mandatory checks passed.' };

const validPass = validateQualificationEvidence(allPass);
assert.equal(validPass.valid, true, validPass.errors.join('\n'));
assert.equal(validPass.summary.overall, 'PASS');
assert.deepEqual(Object.keys(validPass.summary.scenarios), SCENARIO_IDS);
assert.deepEqual(validPass.summary.stages['overall-result'].status, 'PASS');
assert.equal(CHECK_DEFINITIONS.length, CHECK_IDS.length);
assert.equal(MANUAL_CHECK_IDS.length > 0, true);
assert.equal(allPass.project.schema, PROJECT_SCHEMA);
assert.notEqual(allPass.format, allPass.project.schema);
assert.equal(STAGES.length, 12);
assert.equal(template.fixtures.find((fixture) => fixture.scenario === 'A').durationMinutes, 10);
assert.equal(template.fixtures.find((fixture) => fixture.scenario === 'B').durationMinutes, 30);
assert.equal(template.fixtures.find((fixture) => fixture.scenario === 'C').durationMinutes, 60);
assert.match(allPass.checks.find((item) => item.kind === 'manual').evidence, /^Human observation: /);
assert.equal(allPass.checks.find((item) => item.kind === 'automated').evidence, 'Deterministic smoke evidence recorded.');

const withStatus = (status, checkId) => ({
  ...allPass,
  checks: allPass.checks.map((item) => (item.id === checkId ? { ...item, status } : item)),
});

const mandatoryFail = validateQualificationEvidence({
  ...withStatus('FAIL', 'a-individual-export-file'),
  overall: { status: 'PASS', evidence: 'Incorrectly claimed pass.' },
});
assert.equal(mandatoryFail.valid, false);
assert.match(mandatoryFail.errors.join('\n'), /contradicts required checks; expected FAIL/);

const mandatoryNotRun = validateQualificationEvidence({
  ...withStatus('NOT RUN', 'b-batch-export-files'),
  overall: { status: 'PASS', evidence: 'Incorrectly claimed pass.' },
});
assert.equal(mandatoryNotRun.valid, false);
assert.match(mandatoryNotRun.errors.join('\n'), /contradicts required checks; expected NOT RUN/);

const manualCheckId = MANUAL_CHECK_IDS[0];
const manualFail = validateQualificationEvidence({
  ...allPass,
  checks: allPass.checks.map((item) => (
    item.id === manualCheckId
      ? { ...item, status: 'FAIL', evidence: `${HUMAN_OBSERVATION_PREFIX}The creator rejected this output during visual review.` }
      : item
  )),
  overall: { status: 'FAIL', evidence: 'A mandatory manual observation failed.' },
});
assert.equal(manualFail.valid, true, manualFail.errors.join('\n'));
assert.equal(manualFail.summary.overall, 'FAIL');

const genericManualEvidence = validateQualificationEvidence({
  ...allPass,
  checks: allPass.checks.map((item) => (
    item.id === manualCheckId ? { ...item, evidence: 'test passed' } : item
  )),
});
assert.equal(genericManualEvidence.valid, false);
assert.match(genericManualEvidence.errors.join('\n'), /must start with "Human observation:/);

const automatedLookingManualEvidence = validateQualificationEvidence({
  ...allPass,
  checks: allPass.checks.map((item) => (
    item.id === manualCheckId ? { ...item, evidence: 'Deterministic smoke evidence recorded.' } : item
  )),
});
assert.equal(automatedLookingManualEvidence.valid, false);
assert.match(automatedLookingManualEvidence.errors.join('\n'), /must start with "Human observation:/);

const malformedManualEvidence = validateQualificationEvidence({
  ...allPass,
  checks: allPass.checks.map((item) => (
    item.id === manualCheckId ? { ...item, evidence: 42 } : item
  )),
});
assert.equal(malformedManualEvidence.valid, false);
assert.match(malformedManualEvidence.errors.join('\n'), /evidence must be a non-empty string/);

const manualNotRun = validateQualificationEvidence({
  ...allPass,
  checks: allPass.checks.map((item) => (
    item.id === manualCheckId
      ? { ...item, status: 'NOT RUN', evidence: 'Not run; creator observation was not recorded.' }
      : item
  )),
  overall: { status: 'NOT RUN', evidence: 'A mandatory manual observation is still outstanding.' },
});
assert.equal(manualNotRun.valid, true, manualNotRun.errors.join('\n'));
assert.equal(manualNotRun.summary.overall, 'NOT RUN');

const automatedWithoutPrefix = validateQualificationEvidence({
  ...allPass,
  checks: allPass.checks.map((item) => (
    item.kind === 'automated' && item.required ? { ...item, evidence: 'test passed' } : item
  )),
});
assert.equal(automatedWithoutPrefix.valid, true, automatedWithoutPrefix.errors.join('\n'));

const omittedManual = structuredClone(allPass);
omittedManual.checks = omittedManual.checks.filter((item) => item.id !== MANUAL_CHECK_IDS[0]);
omittedManual.overall = { status: 'PASS', evidence: 'Incorrectly claimed pass.' };
const omittedManualResult = validateQualificationEvidence(omittedManual);
assert.equal(omittedManualResult.valid, false);
assert.match(omittedManualResult.errors.join('\n'), new RegExp(`mandatory matrix check is missing: ${MANUAL_CHECK_IDS[0]}`));

const optionalNotApplicable = validateQualificationEvidence(allPass);
assert.equal(optionalNotApplicable.valid, true);
assert.equal(optionalNotApplicable.summary.scenarios.D.status, 'PASS');
assert.equal(optionalNotApplicable.summary.scenarios.G.status, 'PASS');

const unknownField = structuredClone(allPass);
unknownField.checks[0].unexpected = true;
const unknownFieldResult = validateQualificationEvidence(unknownField);
assert.equal(unknownFieldResult.valid, false);
assert.match(unknownFieldResult.errors.join('\n'), /must contain exactly/);

const malformedEvidence = structuredClone(allPass);
malformedEvidence.format = 'scriptcut.project.v1';
malformedEvidence.fixtures[0].path = '';
const malformedResult = validateQualificationEvidence(malformedEvidence);
assert.equal(malformedResult.valid, false);
assert.match(malformedResult.errors.join('\n'), /evidence\.format must be/);
assert.match(malformedResult.errors.join('\n'), /path must reference/);

const invalidScenario = structuredClone(allPass);
invalidScenario.fixtures[0].scenario = 'Z';
const invalidScenarioResult = validateQualificationEvidence(invalidScenario);
assert.equal(invalidScenarioResult.valid, false);
assert.match(invalidScenarioResult.errors.join('\n'), /scenario is unknown/);

const wrongFixtureReference = structuredClone(allPass);
wrongFixtureReference.checks = wrongFixtureReference.checks.map((item) => (
  item.id === 'a-local-ai-discovery' ? { ...item, fixtureIds: [fixtureFor('D')] } : item
));
const wrongFixtureResult = validateQualificationEvidence(wrongFixtureReference);
assert.equal(wrongFixtureResult.valid, false);
assert.match(wrongFixtureResult.errors.join('\n'), /must reference a fixture for scenario A/);

const schemaSource = readFileSync(new URL('../shared/project-schema.json', import.meta.url), 'utf8');
assert.match(schemaSource, /"version": \{ "type": "integer", "const": 1 \}/);
assert.match(readFileSync(new URL('../frontend/src/hooks/useProjectAutosave.ts', import.meta.url), 'utf8'), /PROJECT_SCHEMA = 'scriptcut\.project\.v1'/);

console.log('Phase 5B.6 qualification harness smoke passed');
