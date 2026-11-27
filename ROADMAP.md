# Roadmap

ScriptCut’s roadmap is organized around outcomes for creators moving from recording to publishing. Existing capabilities are foundations to mature, simplify, and connect; roadmap language does not imply that every item starts from zero.

## v0.1.x — Trustworthy Alpha

### Goal

> A supported creator can reliably reach their first successful export.

Focus areas:

- Make creator onboarding, startup checks, defaults, and the first-export path easier to follow.
- Improve transcription, transcript editing, preview, and export reliability across supported local setups.
- Simplify installation and packaging while keeping platform diagnostics honest.
- Strengthen project save/load, autosave, recovery, and recovery guidance.
- Continue security hardening for the local app and backend boundaries.
- Keep documentation, support workflows, smoke checks, and release quality consistent.

This phase builds on the current desktop workflow, local backend, setup assistant, export preflight, job lifecycle, and project recovery foundations. The goal is dependable use, not a larger feature inventory.

## Creator workspace phase

The sample project, keyboard transcript selection, cut review, and direct handoff to Prepare are implemented in the local candidate. Cold and warm model-cache checks passed on Apple Silicon. An unassisted external walkthrough is the next qualification step. [Local qualification record](docs/CREATOR_WORKSPACE_QUALIFICATION.md)

1. **Qualify the first export on an installed Mac.** Use the [external beta checklist](docs/BETA_QUALIFICATION.md) for a clean install, the first transcription model download, a transcript cut, project reopen and a playable export. Record the build tag, Mac model, time to first export and any point where the tester needs help. Repeat with a warm model cache and an existing project.
2. **Add a guided sample project.** Bundle a short, redistributable spoken recording and an editable transcript. Let a new user preview, cut and export it locally. Verify that the sample opens on a fresh install, edits can be undone and the output plays in a standard media player.
3. **Make transcript edits easier to review.** Give creators a keyboard path to select words, show each cut with its source time and let them preview or restore it from the review list. Verify that the edited preview, waveform and export agree after cuts and after reopening the project.
4. **Carry a selected moment into clip preparation.** Open the draft created from a transcript selection in the full-video editor directly in Prepare. Keep it selected through trim, framing and captions. Verify that the source range and draft settings survive Save Project and reopen, and that a failed batch item can be retried on its own.

Use the external first-export sessions to prioritize follow-up work. Capture the step and the first piece of help the tester needed, along with failures that block an export.

## v0.2 — Repurpose

### Goal

> Turn long-form spoken content into multiple publishable assets with minimal repetitive editing.

Focus areas:

- Improve clip discovery, ranking, review, trimming, and approval. AI suggestions and editable drafts are the current foundation.
- Unify vertical framing, reframe controls, captions, hooks, titles, descriptions, hashtags, and publishing metadata into a clearer creator workflow.
- Mature creator presets, batch workflows, and batch export so repeated work is easier to review and recover.
- Make the long-form-to-short-form path feel cohesive from transcript selection through packaged output.

These are improvements and workflow cohesion work around capabilities that already exist in part, not a promise that the ideal workflow is fully automated today.

## v0.3 — Automate

### Goal

> Make repeatable ScriptCut workflows programmable without compromising the creator-first desktop experience.

Later-stage possibilities include:

- CLI and headless operation.
- Batch automation and reusable workflows.
- A documented project format and public/local API.
- Plugin architecture or MCP integration.

This is future scope, not an implementation commitment for the current alpha.

## Future / Not Yet Prioritized

- Windows packaging maturity.
- Linux packaging maturity.
- A plugin ecosystem.
- A broader automation ecosystem.
- Additional advanced workflows that do not clearly reduce the work between recording and publishing.

Do not treat this section as a feature wishlist or as a release schedule.
