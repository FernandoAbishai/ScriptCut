import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const QUALIFICATION_FORMAT = 'scriptcut.qualification.phase-5b.v1';
export const QUALIFICATION_PHASE = '5B.6';
export const PROJECT_SCHEMA = 'scriptcut.project.v1';

export const STATUSES = Object.freeze(['PASS', 'FAIL', 'NOT RUN', 'NOT APPLICABLE']);
export const CHECK_KINDS = Object.freeze(['automated', 'manual']);
export const HUMAN_OBSERVATION_PREFIX = 'Human observation: ';

export const STAGES = Object.freeze([
  { id: 'source-media', label: 'Source/media' },
  { id: 'transcription', label: 'Transcription' },
  { id: 'discovery', label: 'Discovery' },
  { id: 'review', label: 'Review' },
  { id: 'preparation-presentation', label: 'Preparation/presentation' },
  { id: 'publishing-copy-optionality', label: 'Publishing-copy optionality' },
  { id: 'individual-batch-export', label: 'Individual/batch export' },
  { id: 'failure-retry', label: 'Failure/retry behavior' },
  { id: 'project-persistence', label: 'Project persistence' },
  { id: 'reopen-recovery', label: 'Reopen/recovery' },
  { id: 'output-inspection', label: 'Output inspection' },
  { id: 'overall-result', label: 'Overall qualification result' },
]);

const check = (id, stage, kind, required = true) => Object.freeze({ id, stage, kind, required });

export const SCENARIOS = Object.freeze({
  A: Object.freeze({
    label: 'Short single-speaker',
    fixture: Object.freeze({
      targetDurationMinutes: 10,
      durationRange: [8, 12],
      speakerModes: ['single-speaker'],
      aiAvailability: 'available',
    }),
    checks: Object.freeze([
      check('a-source-duration', 'source-media', 'automated'),
      check('a-transcription-complete', 'transcription', 'automated'),
      check('a-local-ai-discovery', 'discovery', 'automated'),
      check('a-review-mixed-decisions', 'review', 'automated'),
      check('a-captions-delivery', 'preparation-presentation', 'automated'),
      check('a-deleted-ranges-respected', 'preparation-presentation', 'automated'),
      check('a-individual-export-file', 'individual-batch-export', 'automated'),
      check('a-moment-useful', 'output-inspection', 'manual'),
      check('a-boundary-natural', 'output-inspection', 'manual'),
      check('a-clip-understandable', 'output-inspection', 'manual'),
      check('a-captions-readable', 'output-inspection', 'manual'),
      check('a-preview-export-parity', 'output-inspection', 'manual'),
    ]),
  }),
  B: Object.freeze({
    label: 'Interview',
    fixture: Object.freeze({
      targetDurationMinutes: 30,
      durationRange: [25, 35],
      speakerModes: ['diarized-interview'],
      aiAvailability: 'available',
    }),
    checks: Object.freeze([
      check('b-source-duration', 'source-media', 'automated'),
      check('b-diarized-transcription', 'transcription', 'automated'),
      check('b-multiple-suggestions', 'discovery', 'automated'),
      check('b-review-multiple-suggestions', 'review', 'automated'),
      check('b-crop-settings-recorded', 'preparation-presentation', 'automated'),
      check('b-batch-export-files', 'individual-batch-export', 'automated'),
      check('b-crop-visually-acceptable', 'output-inspection', 'manual'),
      check('b-captions-readable', 'output-inspection', 'manual'),
      check('b-preview-export-parity', 'output-inspection', 'manual'),
    ]),
  }),
  C: Object.freeze({
    label: 'Long-form',
    fixture: Object.freeze({
      targetDurationMinutes: 60,
      durationRange: [50, 70],
      speakerModes: ['single-speaker', 'diarized-interview'],
      aiAvailability: 'available',
    }),
    checks: Object.freeze([
      check('c-source-duration', 'source-media', 'automated'),
      check('c-long-transcription', 'transcription', 'automated'),
      check('c-discovery-outcome', 'discovery', 'automated'),
      check('c-valid-clip-boundaries', 'discovery', 'automated'),
      check('c-no-silent-corruption', 'output-inspection', 'automated'),
      check('c-output-playback', 'output-inspection', 'manual'),
    ]),
  }),
  D: Object.freeze({
    label: 'Provider unavailable',
    fixture: Object.freeze({
      durationRange: null,
      speakerModes: ['single-speaker', 'diarized-interview'],
      aiAvailability: 'unavailable',
    }),
    checks: Object.freeze([
      check('d-provider-unavailable-observed', 'discovery', 'automated'),
      check('d-manual-clip-path', 'review', 'automated'),
      check('d-publishing-copy-not-required', 'publishing-copy-optionality', 'automated'),
      check('d-publishing-copy-generated', 'publishing-copy-optionality', 'automated', false),
      check('d-valid-clip-export', 'individual-batch-export', 'automated'),
      check('d-output-publishable', 'output-inspection', 'manual'),
    ]),
  }),
  E: Object.freeze({
    label: 'Persistence/recovery',
    fixture: Object.freeze({
      durationRange: null,
      speakerModes: ['single-speaker', 'diarized-interview'],
      aiAvailability: 'available',
    }),
    checks: Object.freeze([
      check('e-review-decisions-persist', 'project-persistence', 'automated'),
      check('e-clip-settings-persist', 'project-persistence', 'automated'),
      check('e-project-schema-unchanged', 'project-persistence', 'automated'),
      check('e-exported-state-reopens', 'reopen-recovery', 'automated'),
      check('e-interrupted-export-recovers', 'reopen-recovery', 'automated'),
      check('e-failed-export-retryable', 'failure-retry', 'automated'),
    ]),
  }),
  F: Object.freeze({
    label: 'Batch partial failure',
    fixture: Object.freeze({
      durationRange: null,
      speakerModes: ['single-speaker', 'diarized-interview'],
      aiAvailability: 'available',
    }),
    checks: Object.freeze([
      check('f-multiple-eligible-clips', 'individual-batch-export', 'automated'),
      check('f-controlled-failure', 'failure-retry', 'automated'),
      check('f-successes-remain-successful', 'failure-retry', 'automated'),
      check('f-failed-clip-retryable', 'failure-retry', 'automated'),
      check('f-exports-serial', 'individual-batch-export', 'automated'),
      check('f-stop-after-current', 'failure-retry', 'automated'),
      check('f-manifest-counts', 'individual-batch-export', 'automated'),
    ]),
  }),
  G: Object.freeze({
    label: 'Caption fallback',
    fixture: Object.freeze({
      durationRange: null,
      speakerModes: ['single-speaker', 'diarized-interview'],
      aiAvailability: 'available',
    }),
    checks: Object.freeze([
      check('g-caption-fallback-represented', 'preparation-presentation', 'automated'),
      check('g-delivery-mode-inspectable', 'preparation-presentation', 'automated'),
      check('g-no-false-burn-in-success', 'preparation-presentation', 'automated'),
      check('g-burn-in-capability', 'preparation-presentation', 'automated', false),
      check('g-captions-readable', 'output-inspection', 'manual'),
      check('g-caption-safe-area', 'output-inspection', 'manual'),
    ]),
  }),
});

export const SCENARIO_IDS = Object.freeze(Object.keys(SCENARIOS));
export const CHECK_DEFINITIONS = Object.freeze(
  SCENARIO_IDS.flatMap((scenario) => SCENARIOS[scenario].checks.map((definition) => ({ ...definition, scenario }))),
);
export const CHECK_IDS = Object.freeze(CHECK_DEFINITIONS.map(({ id }) => id));
export const MANUAL_CHECK_IDS = Object.freeze(CHECK_DEFINITIONS.filter(({ kind }) => kind === 'manual').map(({ id }) => id));

const TOP_LEVEL_KEYS = ['format', 'phase', 'run', 'project', 'fixtures', 'checks', 'overall'];
const RUN_KEYS = ['id', 'createdAt', 'completedAt'];
const PROJECT_KEYS = ['schema', 'version'];
const FIXTURE_KEYS = ['id', 'scenario', 'path', 'durationMinutes', 'speakerMode', 'aiAvailability'];
const CHECK_KEYS = ['id', 'scenario', 'stage', 'kind', 'required', 'status', 'fixtureIds', 'evidence'];
const OVERALL_KEYS = ['status', 'evidence'];
const STAGE_IDS = new Set(STAGES.map(({ id }) => id));
const CHECK_DEFINITION_BY_ID = new Map(CHECK_DEFINITIONS.map((definition) => [definition.id, definition]));
const SCENARIO_ID_SET = new Set(SCENARIO_IDS);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const hasExactKeys = (value, expectedKeys) => {
  if (!isRecord(value)) return false;
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === expectedKeys.length && expectedKeys.every((key) => actualKeys.includes(key));
};
const addError = (errors, message) => errors.push(message);

function validateRun(run, errors) {
  if (!hasExactKeys(run, RUN_KEYS)) {
    addError(errors, `run must contain exactly: ${RUN_KEYS.join(', ')}`);
    return;
  }
  if (!isNonEmptyString(run.id)) addError(errors, 'run.id must be a non-empty string');
  if (!isNonEmptyString(run.createdAt)) addError(errors, 'run.createdAt must be a non-empty string');
  if (run.completedAt !== null && !isNonEmptyString(run.completedAt)) {
    addError(errors, 'run.completedAt must be a non-empty string or null');
  }
}

function validateProject(project, errors) {
  if (!hasExactKeys(project, PROJECT_KEYS)) {
    addError(errors, `project must contain exactly: ${PROJECT_KEYS.join(', ')}`);
    return;
  }
  if (project.schema !== PROJECT_SCHEMA) addError(errors, `project.schema must remain ${PROJECT_SCHEMA}`);
  if (project.version !== 1) addError(errors, 'project.version must remain 1');
}

function validateFixtures(fixtures, errors) {
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    addError(errors, 'fixtures must be a non-empty array');
    return new Map();
  }

  const fixtureById = new Map();
  fixtures.forEach((fixture, index) => {
    const prefix = `fixtures[${index}]`;
    if (!hasExactKeys(fixture, FIXTURE_KEYS)) {
      addError(errors, `${prefix} must contain exactly: ${FIXTURE_KEYS.join(', ')}`);
      return;
    }
    if (!isNonEmptyString(fixture.id)) addError(errors, `${prefix}.id must be a non-empty string`);
    if (fixtureById.has(fixture.id)) addError(errors, `${prefix}.id is duplicated: ${fixture.id}`);
    fixtureById.set(fixture.id, fixture);
    if (!SCENARIO_ID_SET.has(fixture.scenario)) addError(errors, `${prefix}.scenario is unknown: ${String(fixture.scenario)}`);
    if (!isNonEmptyString(fixture.path)) addError(errors, `${prefix}.path must reference an external/local media path`);
    if (typeof fixture.durationMinutes !== 'number' || !Number.isFinite(fixture.durationMinutes) || fixture.durationMinutes <= 0) {
      addError(errors, `${prefix}.durationMinutes must be a positive finite number`);
    }
    if (!SCENARIOS[fixture.scenario]?.fixture.speakerModes.includes(fixture.speakerMode)) {
      addError(errors, `${prefix}.speakerMode does not satisfy scenario ${String(fixture.scenario)}`);
    }
    if (fixture.aiAvailability !== SCENARIOS[fixture.scenario]?.fixture.aiAvailability) {
      addError(errors, `${prefix}.aiAvailability does not satisfy scenario ${String(fixture.scenario)}`);
    }
    const durationRange = SCENARIOS[fixture.scenario]?.fixture.durationRange;
    if (durationRange && (fixture.durationMinutes < durationRange[0] || fixture.durationMinutes > durationRange[1])) {
      addError(errors, `${prefix}.durationMinutes must be approximately ${durationRange[0]}-${durationRange[1]} minutes for scenario ${fixture.scenario}`);
    }
  });

  SCENARIO_IDS.forEach((scenario) => {
    if (!fixtures.some((fixture) => fixture.scenario === scenario)) {
      addError(errors, `fixtures must include a fixture for scenario ${scenario}`);
    }
  });
  return fixtureById;
}

function validateChecks(checks, fixtureById, errors) {
  if (!Array.isArray(checks)) {
    addError(errors, 'checks must be an array');
    return;
  }

  const checksById = new Map();
  checks.forEach((item, index) => {
    const prefix = `checks[${index}]`;
    if (!hasExactKeys(item, CHECK_KEYS)) {
      addError(errors, `${prefix} must contain exactly: ${CHECK_KEYS.join(', ')}`);
      return;
    }
    if (checksById.has(item.id)) addError(errors, `${prefix}.id is duplicated: ${String(item.id)}`);
    checksById.set(item.id, item);
    const definition = CHECK_DEFINITION_BY_ID.get(item.id);
    if (!definition) {
      addError(errors, `${prefix}.id is unknown: ${String(item.id)}`);
      return;
    }
    if (item.scenario !== definition.scenario) addError(errors, `${item.id}.scenario does not match the qualification matrix`);
    if (item.stage !== definition.stage || !STAGE_IDS.has(item.stage)) addError(errors, `${item.id}.stage does not match the qualification matrix`);
    if (item.kind !== definition.kind) addError(errors, `${item.id}.kind does not match the qualification matrix`);
    if (item.required !== definition.required) addError(errors, `${item.id}.required does not match the qualification matrix`);
    if (!STATUSES.includes(item.status)) addError(errors, `${item.id}.status is invalid: ${String(item.status)}`);
    if (!Array.isArray(item.fixtureIds) || item.fixtureIds.length === 0) {
      addError(errors, `${item.id}.fixtureIds must name at least one fixture`);
    } else {
      item.fixtureIds.forEach((fixtureId) => {
        if (!isNonEmptyString(fixtureId)) addError(errors, `${item.id}.fixtureIds entries must be non-empty strings`);
        if (!fixtureById.has(fixtureId)) addError(errors, `${item.id} references unknown fixture: ${String(fixtureId)}`);
      });
      if (!item.fixtureIds.some((fixtureId) => fixtureById.get(fixtureId)?.scenario === item.scenario)) {
        addError(errors, `${item.id} must reference a fixture for scenario ${item.scenario}`);
      }
    }
    if (!isNonEmptyString(item.evidence)) addError(errors, `${item.id}.evidence must be a non-empty string`);
    const hasExplicitHumanObservation = isNonEmptyString(item.evidence)
      && item.evidence.startsWith(HUMAN_OBSERVATION_PREFIX)
      && isNonEmptyString(item.evidence.slice(HUMAN_OBSERVATION_PREFIX.length));
    if (
      item.kind === 'manual'
      && (item.status === 'PASS' || item.status === 'FAIL')
      && !hasExplicitHumanObservation
    ) {
      addError(errors, `${item.id}.evidence must start with "${HUMAN_OBSERVATION_PREFIX}" and include an observation`);
    }
    if (item.required && item.status === 'NOT APPLICABLE') addError(errors, `${item.id} is mandatory and cannot be NOT APPLICABLE`);
  });

  CHECK_IDS.forEach((checkId) => {
    if (!checksById.has(checkId)) addError(errors, `mandatory matrix check is missing: ${checkId}`);
  });
  checksById.forEach((item, checkId) => {
    if (!CHECK_DEFINITION_BY_ID.has(checkId)) addError(errors, `unknown check is not allowed: ${String(checkId)}`);
  });
}

function getRequiredStatus(checks) {
  if (checks.some((item) => item.required && item.status === 'FAIL')) return 'FAIL';
  if (checks.some((item) => item.required && item.status === 'NOT RUN')) return 'NOT RUN';
  return 'PASS';
}

function buildSummary(evidence) {
  const scenarioSummaries = Object.fromEntries(
    SCENARIO_IDS.map((scenario) => {
      const checks = evidence.checks.filter((item) => item.scenario === scenario);
      return [scenario, {
        label: SCENARIOS[scenario].label,
        status: getRequiredStatus(checks),
        required: checks.filter((item) => item.required).length,
        optional: checks.filter((item) => !item.required).length,
        manual: checks.filter((item) => item.kind === 'manual').length,
      }];
    }),
  );
  const stageSummaries = Object.fromEntries(
    STAGES.map(({ id, label }) => {
      const checks = evidence.checks.filter((item) => item.stage === id);
      return [id, {
        label,
        status: id === 'overall-result' ? evidence.overall.status : getRequiredStatus(checks),
        checks: checks.length,
      }];
    }),
  );
  return {
    overall: evidence.overall.status,
    scenarios: scenarioSummaries,
    stages: stageSummaries,
  };
}

export function validateQualificationEvidence(evidence) {
  const errors = [];
  if (!hasExactKeys(evidence, TOP_LEVEL_KEYS)) {
    addError(errors, `evidence must contain exactly: ${TOP_LEVEL_KEYS.join(', ')}`);
    return { valid: false, errors, summary: null };
  }
  if (evidence.format !== QUALIFICATION_FORMAT) addError(errors, `evidence.format must be ${QUALIFICATION_FORMAT}`);
  if (evidence.phase !== QUALIFICATION_PHASE) addError(errors, `evidence.phase must be ${QUALIFICATION_PHASE}`);
  validateRun(evidence.run, errors);
  validateProject(evidence.project, errors);
  const fixtureById = validateFixtures(evidence.fixtures, errors);
  validateChecks(evidence.checks, fixtureById, errors);
  if (!hasExactKeys(evidence.overall, OVERALL_KEYS)) {
    addError(errors, `overall must contain exactly: ${OVERALL_KEYS.join(', ')}`);
  } else {
    if (!STATUSES.includes(evidence.overall.status)) addError(errors, `overall.status is invalid: ${String(evidence.overall.status)}`);
    if (!isNonEmptyString(evidence.overall.evidence)) addError(errors, 'overall.evidence must be a non-empty string');
  }

  const knownChecks = Array.isArray(evidence.checks)
    ? evidence.checks.filter((item) => CHECK_DEFINITION_BY_ID.has(item?.id))
    : [];
  const derivedOverall = getRequiredStatus(knownChecks);
  if (hasExactKeys(evidence.overall, OVERALL_KEYS) && evidence.overall.status !== derivedOverall) {
    addError(errors, `overall.status ${String(evidence.overall.status)} contradicts required checks; expected ${derivedOverall}`);
  }

  const valid = errors.length === 0;
  return {
    valid,
    errors,
    summary: valid ? buildSummary(evidence) : null,
  };
}

export function createQualificationEvidenceTemplate({ mediaRoot = '/path/to/external/media' } = {}) {
  const fixtures = SCENARIO_IDS.map((scenario) => {
    const profile = SCENARIOS[scenario].fixture;
    const durationMinutes = profile.targetDurationMinutes ?? 10;
    const speakerMode = profile.speakerModes[0];
    return {
      id: `fixture-${scenario.toLowerCase()}`,
      scenario,
      path: `${mediaRoot}/scenario-${scenario.toLowerCase()}.mp4`,
      durationMinutes,
      speakerMode,
      aiAvailability: profile.aiAvailability,
    };
  });
  const fixtureByScenario = Object.fromEntries(fixtures.map((fixture) => [fixture.scenario, fixture.id]));
  const checks = CHECK_DEFINITIONS.map((definition) => ({
    ...definition,
    status: 'NOT RUN',
    fixtureIds: [fixtureByScenario[definition.scenario]],
    evidence: 'Not run; replace with deterministic output or an explicit manual observation.',
  }));
  return {
    format: QUALIFICATION_FORMAT,
    phase: QUALIFICATION_PHASE,
    run: { id: 'replace-with-run-id', createdAt: new Date(0).toISOString(), completedAt: null },
    project: { schema: PROJECT_SCHEMA, version: 1 },
    fixtures,
    checks,
    overall: { status: 'NOT RUN', evidence: 'Qualification has not been completed.' },
  };
}

export function formatQualificationSummary(summary) {
  const lines = [`Qualification ${summary.overall}`, 'Scenarios:'];
  SCENARIO_IDS.forEach((scenario) => {
    const item = summary.scenarios[scenario];
    lines.push(`- ${scenario} ${item.label}: ${item.status} (${item.required} required, ${item.manual} manual)`);
  });
  lines.push('Stages:');
  STAGES.forEach(({ id, label }) => lines.push(`- ${label}: ${summary.stages[id].status}`));
  return lines.join('\n');
}

function runCli() {
  const evidencePath = process.argv[2];
  if (!evidencePath) {
    console.error('Usage: node scripts/qualification/phase-5b6a-qualification.mjs <evidence.json>');
    process.exitCode = 2;
    return;
  }
  try {
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    const result = validateQualificationEvidence(evidence);
    if (!result.valid) {
      console.error('Qualification evidence INVALID');
      result.errors.forEach((error) => console.error(`- ${error}`));
      process.exitCode = 1;
      return;
    }
    console.log(formatQualificationSummary(result.summary));
  } catch (error) {
    console.error(`Could not read qualification evidence: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli();
