# ScriptCut Creator UX Audit

Status: Phase 2A analysis and implementation plan

Scope: creator-facing UX in the current desktop alpha, with browser mode and native/runtime boundaries called out where they affect the journey. Evidence was taken from the product documentation, the frontend components and stores, Electron/preload/runtime integration, backend-facing UI contracts, and the existing frontend smoke tests.

## 1 Executive Summary

ScriptCut already has the foundations of a credible creator-first editor: local media handling, a transcript that can be edited directly, previewable cuts, a waveform, autosave/recovery in the desktop app, creator-oriented export templates, and a real clip queue with approval and batch export. The product vision is coherent: simple by default, powerful when needed, local-first, and AI-assisted rather than AI-dependent.

The current experience makes the creator discover the architecture before discovering the workflow. The first screen leads with setup checks and transcription implementation choices. The editor exposes a compact but dense collection of panels, modes, providers, output controls, diagnostics, and job logs. The strategic Create Clips capability is implemented across several surfaces but is named and entered as “Create a short,” which makes a queue-building workflow feel like a single-output action. Error recovery is technically present but inconsistently translated into creator language.

The Phase 2B opportunity is primarily information architecture, progressive disclosure, defaults, and recovery copy. It does not require changing the local transcription/export architecture. The highest-value path is to make the first decision creator intent, keep Auto/local defaults, move setup and provider detail behind contextual disclosure, give Edit a Video and Create Clips distinct journeys, and make every failure state answer: what happened, what can I do now, and what remains safe.

### Priority summary

| Priority | Finding | Why it matters |
|---|---|---|
| P0 | UX-001 — first launch is setup-first | A new creator encounters readiness warnings, install commands, and implementation labels before choosing an outcome. |
| P1 | UX-002 — “Create a short” and Create Clips are misaligned | The product has a strategic clip workflow, but the entry point promises a narrower single-output task. |
| P1 | UX-005 — editor IA is panel-first rather than task-first | Transcript, video, waveform, AI, export, settings, and recovery are capable but not sequenced as a guided working session. |
| P1 | UX-006 — export exposes too many decisions at once | A reliable export engine is wrapped in a narrow panel that makes normal and advanced controls look equally necessary. |
| P1 | UX-008 — error language leaks implementation detail | Raw job/provider/backend messages and browser alerts interrupt the creator’s flow and weaken recovery confidence. |
| P2 | UX-010 — dense interaction and accessibility debt | Small type, title-only icon affordances, native alerts, and limited focus/state guidance make the alpha harder to operate. |

## 2 Current User Journey

### A. First launch

1. The desktop app starts a local Python backend through Electron. The window is created at 1400×900 with a 1024×700 minimum; browser mode loads the development server.
2. The home screen shows the ScriptCut value statement, then the first-run checklist. The checklist exposes Local backend, Desktop app, Python, FFmpeg, Burn-in captions, Transcription, Studio Sound, and Background removal.
3. The checklist treats most rows as required and explains missing capabilities with technical remediation such as `brew install ffmpeg` or a `pip install` command. The app can force onboarding visible after backend startup failure.
4. A visible `<details>` section exposes transcription engine and model selectors, including implementation names and model sizes. Auto is the default preference, and the app refreshes the backend’s available engines when possible.
5. Electron users may see an autosave recovery candidate and recent projects. The primary workflow actions are `Edit full video`, `Create a short`, and `Load Project`. Browser users instead upload a file to the local backend and see browser-mode/development copy.

**Assessment:** technically honest and useful for an alpha operator, but the creator’s first decision is buried below readiness and implementation detail. A new user is asked to diagnose the workstation before being asked what they want to make.

### B. Edit a video

1. The creator selects `Edit full video`, chooses a media file through the native file dialog in Electron, or uploads in browser mode.
2. If an autosaved project exists for that media, ScriptCut uses a native confirmation dialog asking whether to restore it. Otherwise it starts transcription with the selected engine/model.
3. The app polls a job endpoint and shows progress, a cancel action, and an expandable job log. On success, the full-video intent opens the Export panel.
4. The editor presents video and transcript in a fixed 50/50 layout, a fixed right-side panel when active, and a bottom waveform. Words can be clicked or drag-selected. The selection summary supports Preview, Copy text, Draft clip, Clear, Trim to words, Hide captions, Mute, Room tone, Cut, and restore.
5. The creator can continue from transcript edits, preview edited versus original, save a project, open AI, or open Export. The top bar contains Open, Save Project, AI, Export, and a `More tools` menu containing Settings, Setup check, and Exit ScriptCut.
6. Export preflight shows source/destination/renderer/caption readiness, then the creator chooses a template or controls for preset, mode, resolution, aspect/reframe, format, destination, audio enhancement, background removal, captions, and caption style.
7. Export progress supports cancel and retry. Success provides an output path and native reveal/open actions, or a browser download.

**Assessment:** the core transcript-editing loop exists and is differentiated. The current intent handoff to Export is abrupt, and the editor has no persistent “you are here / next best action” framing after transcription.

### C. Create Clips

1. The home action is `Create a short`, with copy describing a 9:16 output and creator captions. Selecting it preconfigures vertical, 1080p, MP4, burn-in captions, creator caption style, and the YouTube Shorts preset.
2. After media selection and transcription, the short intent automatically opens the AI panel.
3. The creator must switch to the `Create Clips` tab inside AI and press `Find Best Clips`. AI requests a target of 60 seconds with 30–90 second bounds and the Shorts platform.
4. Suggestions become a Shorts Queue. Drafts can also be created from transcript selections or speaker turns. Each draft exposes source in/out, aspect, quality, format, reframe, captions, caption style, audio/background options, hook/description/caption/hashtags, readiness, validation, approval, packaging, export, retry, and output actions.
5. The creator reviews and trims drafts, approves them, packages metadata, then exports one or all approved clips. Failed drafts remain in the queue and can be retried.

**Assessment:** this is a substantial implemented workflow, not a placeholder. It is strategically valuable, but it is distributed between a home CTA, an AI tab, clip-draft mechanics, a package step, and Export. “Create a short” under-signals the queue/review workflow and makes the creator search for the strategic path.

### D. Return to a project / recovery

1. Desktop autosave runs every five seconds when a video and transcript are present. It writes a project snapshot beside the media, rotates three snapshots, and records candidate/recent-project metadata in local storage.
2. On the home screen, a recovery candidate can be recovered, earlier snapshots can be selected, or the candidate can be dismissed. Recent projects are listed with filename, saved/recovered state, date, and the stored path.
3. Opening media can trigger an autosave-restore confirmation. Opening a `.scriptcut`, `.aive`, or `.cutscript` project is available through the native project dialog.
4. Browser mode explicitly reports that autosave is unavailable and saves project JSON through a browser download path.

**Assessment:** recovery behavior is stronger than the visual hierarchy suggests. Recovery is discoverable, but the distinction among an active project, a recovered snapshot, and a recent media/project entry is not yet expressed as a simple resume model.

### E. Failure recovery

1. Backend startup failure forces the setup experience and shows a raw composed message with a quit/reopen instruction.
2. Missing tools appear in the checklist with technical guidance. Transcription start and job failures surface backend detail, retry, cancel, and job logs.
3. Export has the best recovery model: preflight blockers/warnings, friendly mappings for common source/destination/FFmpeg errors, retry, and retry with re-encode.
4. AI failures frequently use browser `alert()` dialogs containing raw error text. Clip and batch failures remain attached to drafts/jobs and can be retried, but the message vocabulary is not consistently creator-oriented.
5. Autosave errors appear as a compact status/error state. Browser upload and recent-project failures expose raw or low-context messages.

**Assessment:** recovery actions exist, but the UI does not use one consistent error contract. Export is the model to reuse for the rest of the app.

## 3 Creator UX Strengths

- The central mental model is strong: edit words to edit video. `TranscriptEditor`, `editorStore`, playback mapping, and the smoke coverage for selection/search/sync support this promise.
- Local-first behavior is visible and real. Electron starts a local backend, keeps project/media/export work local by default, and uses native dialogs and secure storage boundaries.
- The product distinguishes full-video editing from vertical short output at the intent level and applies sensible clip defaults: vertical 1080p MP4, burn-in captions, creator style, and a 30–90 second discovery range.
- The clip queue preserves creator control. Suggestions are drafts, approval is explicit, validation explains readiness, failures remain retryable, and batch export is separate from generation.
- Autosave is frequent, snapshot-based, and backward-compatible in its project schema. Recovery candidates and recent projects are present rather than leaving project safety to the user.
- Export preflight is unusually concrete for an alpha. It distinguishes blockers from warnings, fast stream copy from frame-accurate re-encode, caption delivery, destination behavior, and retry paths.
- AI is optional to the core transcript editor. AI Editor, filler-word review, and clip suggestions expose review/apply or accept/reject decisions rather than silently mutating the edit.
- The product documentation is aligned with the intended creator workflows and clearly labels browser mode as development/testing rather than presenting it as equivalent packaging.
- The Electron window has a practical default and minimum size, and native file/project filters reduce ambiguity for the main media and project entry points.

## 4 Friction Inventory

Priority scale: P0 blocks or seriously obscures the first successful outcome; P1 materially slows a normal creator; P2 creates recurring friction or limits discoverability; P3 is polish or future leverage. Root cause is classified as UX, Runtime, Packaging, Architecture, Documentation, or Mixed.

| ID | Priority | Area | Evidence / friction | Root cause | Phase 2B direction |
|---|---|---|---|---|---|
| UX-001 | P0 | First launch | Setup checklist, install commands, and technical statuses appear before creator intent. Required readiness language says to resolve warnings before serious editing. | Mixed | Make intent primary; compress readiness into a status card and keep repair detail contextual. |
| UX-002 | P1 | Workflow naming | Home says `Create a short`, while the implemented path is a strategic Create Clips queue with discovery, review, packaging, approval, and batch export. | UX | Align labels and expectation: `Create Clips` / `Find and review clips`, with single short export as a secondary outcome. |
| UX-003 | P1 | Setup | Python, FFmpeg, transcription packages, local backend, burn-in capability, and optional tools are shown together with raw shell commands. | Mixed | Separate “ready to start” from “optional capabilities” and provide one next action per missing requirement. |
| UX-004 | P1 | Transcription | Engine/model selectors expose Parakeet, WhisperX, Whisper fallback, model sizes, and implementation-specific availability on the home screen. | UX | Keep Auto as the creator default; move engine/model selection to Advanced transcription settings with plain-language outcome copy. |
| UX-005 | P1 | Editor IA | The editor has a video/transcript/waveform foundation but navigation is a set of toggled panels. Full-video completion opens Export and short completion opens AI without a visible task step. | UX | Add task-oriented panel framing and a persistent next-step cue while preserving the existing tools. |
| UX-006 | P1 | Export | Templates, presets, mode, resolution, aspect/reframe, format, destination, audio, background, captions, and style are simultaneously visible in a 320px panel. | UX | Put a creator path first; disclose advanced delivery/render controls only when relevant. |
| UX-007 | P1 | AI/settings | AI work depends on provider/model/base URL/key configuration, while Settings is a broad “AI Settings” panel containing release, privacy, providers, and diagnostics. | Mixed | Keep provider configuration available but contextualize readiness at the action and separate desktop/support concerns. |
| UX-008 | P1 | Errors | App, AI, upload, job, autosave, and some setup states interpolate raw backend/provider errors. AI often uses browser alerts. | UX/Runtime | Normalize errors into an actionable message contract with stable recovery actions and expandable technical detail. |
| UX-009 | P2 | Recovery | Recovery and recent projects are implemented, but cards emphasize filenames/paths and recovery is visually mixed with first-launch/setup content. | UX | Present `Resume recovery`, `Recent projects`, and `Open project` as one clear project-resume area. |
| UX-010 | P2 | Accessibility | Small 10–12px text is common; some icon-only controls rely on `title`; native `alert()`/`confirm()` and limited focus guidance interrupt state changes. | UX | Establish readable minimum text, visible labels for high-value actions, focus return, and in-app status/dialog patterns. |
| UX-011 | P2 | Browser mode | Browser upload, local backend, and development/testing language share the same home workflow structure as the desktop app. | UX/Packaging | Keep browser mode functional, but label it as a developer/testing path and make desktop capability differences explicit. |
| UX-012 | P2 | Desktop layout | Video/transcript are fixed 50/50, the right panel is fixed at 320px, and the waveform is fixed at 128px inside a constrained minimum window. | UX | Add responsive density/scroll behavior and protect the transcript and primary action at the minimum window. |
| UX-013 | P2 | Timeline | Full-media waveform decoding can fail and falls back to a line/ticks message; the fallback is useful but not an explained creator action. | Runtime/UX | Retain deterministic fallback, explain how transcript/timeline editing remains available, and provide recovery only when it is actionable. |
| UX-014 | P2 | Create Clips discoverability | Queue controls are rich but hidden behind AI > Create Clips, while the home CTA uses a narrower concept. | UX | Promote the queue as a first-class journey without removing the AI Editor or manual Draft clip route. |
| UX-015 | P3 | Output completion | Success states expose raw paths and platform-specific Reveal in Finder/open actions without always leading with “what is ready.” | UX | Lead with a human result summary, then path and platform actions as secondary detail. |

## 5 Technical Complexity Leaks

| Concept exposed to creators | Current surface | Classification | Recommended treatment |
|---|---|---|---|
| Local backend / backend startup | First-run checklist, startup failure, browser copy | Developer/runtime | Translate to `ScriptCut editing service` or a single readiness status in the normal path; keep diagnostics in Setup. |
| Python 3.10–3.12 | Setup checklist and guidance | Developer/packaging | Show only when unavailable; use one repair path and a plain consequence. |
| FFmpeg / libass | Setup checklist and export warnings | Delivery/runtime | Keep a concise caption/export capability status; put package implementation detail in diagnostics. |
| `brew install ffmpeg`, `pip install`, `ollama serve` | Setup and Settings | Developer/packaging | Replace inline commands with a single copyable repair action plus expandable command detail. |
| Parakeet, WhisperX, Whisper | Transcription selectors and backend status | Implementation | Default to Auto and explain “best available local transcription”; expose engines only in Advanced. |
| Model names and download sizes | Transcription model selectors | Implementation | Use outcome labels such as faster/smaller or more accurate; retain exact model metadata in Advanced. |
| Provider, base URL, API key, model | Settings and AI request wiring | Implementation/security | Keep configurable, but only surface provider readiness when a cloud/local AI action is chosen. |
| `localhost:11434`, `localhost:20128/v1` | Ollama/9router Settings | Developer | Keep in provider details; never make endpoint vocabulary part of the creator’s primary AI task. |
| Job IDs, job logs, raw messages | Transcription, AI, export panels | Runtime | Show “Working…” and progress first; make logs an expandable Support detail with redaction. |
| Stream copy / re-encode | Export preflight and mode control | Delivery | Keep the creator choice as `Fast export` / `Frame-accurate export`; explain the tradeoff only when needed. |
| Source / aspect / reframe coordinates | Export and video crop preview | Delivery | Use `Original` / `Vertical` / `Square` presets; reveal x/y controls only for custom framing. |
| Burn-in captions / SRT | Export caption delivery | Delivery | Keep the distinction because it changes the result, but explain it as `Captions in video` versus `Caption file`. |
| Studio Sound / DeepFilterNet fallback | Settings, export, setup checks | Capability | Present as `Enhance voice/audio`; keep fallback engine detail in diagnostics. |
| Background removal / MediaPipe/OpenCV | Settings, export, setup | Capability | Make it an optional visual effect behind Advanced; never block edit/export. |
| `.scriptcut`, `.aive`, `.cutscript` | Native project dialogs and save | File format | A creator-facing `ScriptCut Project` label is enough; retain extension compatibility in the dialog filter. |

## 6 Progressive Disclosure Map

| Disclosure level | Creator-facing content | Keep visible / move here |
|---|---|---|
| Level 1 — outcome | Edit a Video, Create Clips, Open/Resume Project; choose media; edit transcript; preview; export | Primary home and editor actions. |
| Level 2 — working controls | Word selection, Cut/Restore, Preview, Search, basic captions, clip review, approve/package, creator export templates | Visible in the relevant journey and panel. |
| Level 3 — advanced creator controls | Engine/model, provider choice, output format/resolution, custom reframe, full caption styling, speaker management, audio/background options, export destination | Collapsed Advanced sections or contextual drawers. |
| Level 4 — diagnostics/runtime | Python version, FFmpeg/libass, package commands, endpoint URLs, API/job identifiers, raw logs, runtime paths, support report | Setup/Support views only, with copyable detail and redaction. |

The rule for moving a control down a level is not “hide complexity.” It is “show a creator decision at the moment it changes the outcome.” Captions delivery, aspect ratio, and output destination remain normal decisions; `libass`, model package names, and endpoint URLs do not.

## 7 Default Settings Audit

| Setting | Current Default | Recommended | Reason | Risk |
|---|---|---|---|---|
| Home intent | No intent until the creator chooses; buttons are `Edit full video` and `Create a short` | Ask intent first with `Edit a Video`, `Create Clips`, `Resume/Open Project` | The first decision should describe the creator’s outcome | Renaming changes copy and smoke expectations; preserve compatibility labels where needed. |
| Transcription engine | `auto` | Keep `Auto` | Best fit for local-first setup variability | Auto fallback behavior must remain clear when all engines fail. |
| Transcription model | Initial `nvidia/parakeet-tdt-0.6b-v3`, then backend status can update the selection | Keep backend-selected model hidden unless Advanced is opened | Prevent model identity from becoming a setup decision | If the selected engine is unavailable, the status message must be actionable. |
| AI provider | Ollama, local endpoint `localhost:11434`, model `llama3` | Keep local-first preference; do not require AI for Edit a Video | Preserves privacy and local-first intent without blocking core editing | A creator who enters Create Clips needs a clear provider readiness path. |
| Full-video export | Source preset, Fast, source aspect, MP4, no captions, audio enhancement off, background removal off | Keep safe non-destructive defaults; add a simple export recommendation based on intent | Full-video export should not unexpectedly burn captions or alter audio | “No captions” can surprise a creator; preflight must make delivery explicit. |
| Create Clips export | Vertical, 1080p, MP4, Shorts preset, burn-in captions, Creator style, 50/50 reframe, enhancement/background off | Keep these defaults | They match the strategic short outcome and minimize decisions | Caption/font defaults need preview clarity and should remain editable. |
| Preview cuts | `true` | Keep `true` | Makes transcript edits verifiable before export | The edited/original state needs a persistent visible label. |
| Autosave | Every 5 seconds in Electron; unavailable in browser | Keep interval and make state/recovery model clearer | Strong safety net already exists | Frequent writes can surface failures; recovery copy must not imply browser persistence. |
| First-run onboarding | Shown until local-storage dismissal; setup rows visible | Keep, but make it compact and non-blocking except for proven hard blockers | Readiness matters, but intent should not be delayed | A hard backend failure still needs a repair gate. |
| AI panel tab | `AI Editor` first | For Create Clips intent, open `Create Clips`; for full video, retain `AI Editor` or no AI auto-open | Aligns the default panel with intent | Avoid making AI appear mandatory for editing. |
| Clip readiness | Suggested drafts require review/approval; score rewards 30–60 seconds, vertical 1080p MP4, burn-in, metadata, package/export | Keep | Encodes a useful creator QA contract | Explain score reasons in creator language, not only validation terms. |

## 8 First-Launch Audit

### What works

- The app tells the truth about local prerequisites and distinguishes optional capabilities such as background removal.
- The first-run checklist can detect backend, Python, FFmpeg, transcription, audio, and caption capability states.
- Desktop users get recovery and recent-project entry points, while browser limitations are named.

### Main issue

The screen is organized as an operator setup console. It asks a creator to understand local backend, desktop/browser mode, Python, FFmpeg, caption burn-in, transcription packages, and model choices before seeing the two core outcomes. Even when the system is ready, the checklist occupies the top of the journey.

### Phase 2B target

Use this order:

1. ScriptCut value statement and a single question: `What are you making?`
2. Three actions: `Edit a Video`, `Create Clips`, `Resume/Open Project`.
3. A compact readiness line: `Ready to edit` or `Needs attention`, with one primary action such as `Fix setup`.
4. Recent projects and recovery, with a recovery candidate clearly separated from ordinary recents.
5. `Advanced transcription` disclosure containing engine/model controls.
6. Optional capabilities under `More tools` or Setup, never as a normal first-launch wall.

The desktop app should be the primary creator path. Browser mode may preserve the same core workflow for testing, but the home should clearly state that native access, autosave, and direct exports require the desktop app.

## 9 Edit-a-Video Audit

The edit journey has the strongest product differentiation and should become the reference path for the rest of the app.

### Implemented

- Native media open and browser upload.
- Autosave restore check for matching media.
- Local transcription with Auto and fallback engines.
- Word-level transcript selection/editing, search, speaker filtering, and cut restoration.
- Preview edited versus original and waveform review.
- Save project and keyboard shortcuts.
- Export preflight, progress, cancellation, retry, output reveal/open, and caption delivery.

### Awkward

- Full-video intent automatically opens Export after transcription, before the creator has received a visible “transcript ready” milestone or editing cue.
- The top bar and the active right panel do not express a sequence. A creator can open AI or Settings without knowing whether the transcript is ready, whether edits are pending, or what the recommended next step is.
- Export’s normal and advanced decisions share a narrow column.
- The empty transcript state is helpful, but the loaded editor does not continue that instructional tone.
- Autosave status is compact and failure detail is not an actionable recovery state.

### Missing

- A persistent first-session orientation that says `Edit words to cut video`, `Preview your changes`, and `Export when ready`.
- A task-aware next action that adapts to transcript-ready, edits-made, export-in-progress, or export-complete states.
- An in-app recovery dialog pattern that can replace native confirm/alert interruptions where appropriate.

## 10 Create-Clips Audit

### Implemented

- Short intent preconfigures vertical creator output.
- AI clip discovery endpoint and `Find Best Clips` action.
- Manual Draft clip from transcript selection and speaker-turn drafting.
- Shorts Queue with suggested/approved/packaged/ready/failed states.
- Range editing, readiness scoring, validation reasons, metadata fields, captions, reframe, enhancement, background controls, package/export, batch export, cancel, and retry.
- Smoke coverage for clip draft normalization/validation/readiness, social publishing metadata, hook frames, captions, and playback sync.

### Awkward

- The entry CTA says `Create a short`, but the creator must find `AI > Create Clips` for the strategic queue.
- The workflow mixes discovery, clip-level finishing, metadata packaging, and export in one dense panel. These are distinct decisions that would benefit from a visible staged header.
- AI provider readiness is not part of the Create Clips entry expectation; failure may arrive as an alert or raw job error.
- “Suggested,” “Approved,” “Packaged,” and “Ready” are useful internal states but need a short creator explanation the first time they appear.

### Missing

- A first-class Create Clips workspace or panel entry that does not imply a single short.
- A clear distinction between `Find clips with AI`, `Choose moments yourself`, and `Review queue`.
- A queue-level completion summary such as `3 clips ready to export` with the remaining blockers named.

### Strategic recommendation

Preserve the implementation and creator-control contract. Promote Create Clips to an explicit outcome, keep AI discovery optional, and make the staged flow visible:

`Find moments → Review clips → Package captions/metadata → Approve → Export batch`.

## 11 AI Experience Audit

### Strengths

- AI Editor asks for a change and offers a reviewable plan before applying it.
- Filler-word detection has explicit review filters and accept/reject/dismiss operations.
- Create Clips treats AI suggestions as drafts and keeps the creator in the approval loop.
- Local Ollama is the default provider, consistent with privacy/local-first product principles.

### Friction

- AI Editor, Filler Words, and Create Clips are sibling tabs, but their task boundaries and success criteria are not explained as a coherent AI workspace.
- Provider and model details are configured in a panel headed `AI Settings` that also contains desktop release, privacy, support, and diagnostics content.
- Many AI paths use `alert()` for errors and success paths, which breaks context and is difficult to make accessible.
- Job logs expose useful detail but are not separated cleanly from creator progress.
- An AI failure can leave the creator unsure whether transcript edits, clip drafts, or export artifacts are safe.

### Phase 2B direction

Keep the existing AI actions and APIs. Add a consistent action shell with status, review, apply/approve, and retry states. Put provider readiness next to the first AI action that requires it, with a link to provider setup. Move exact endpoint/model/API details into Advanced provider settings and replace browser alerts with in-app dialogs/toasts that retain the current task.

## 12 Settings Audit

Settings currently combines four jobs: desktop release/support, privacy explanation, provider selection, and provider configuration. That breadth is useful for an alpha operator but explains why the panel feels like a technical console.

### Recommended information architecture

| Settings area | Normal creator surface | Advanced/support surface |
|---|---|---|
| App and privacy | Short privacy statement and app mode | Full diagnostics/support report and redaction detail |
| Transcription | Auto / language or speaker options when relevant | Engine, model, token, runtime details |
| AI provider | Provider status and `Set up` when an AI action needs it | Base URL, API key, exact model, refresh endpoints |
| Export | Creator templates and delivery choice | Renderer, re-encode, caption fallback, background/audio implementation detail |
| Desktop/support | Version, `Fix setup`, `Report issue` | Runtime paths, recent job logs, copied support report |

The current secure-storage boundary should remain unchanged: Electron uses safe storage for provider keys, and browser mode keeps its existing fallback behavior with clear privacy wording.

## 13 Export Audit

### Strengths

- Creator templates make Shorts Batch, Caption Review, and Podcast Clip outcomes concrete.
- Preflight identifies source, destination, renderer, and caption conditions before work begins.
- Fast stream copy versus frame-accurate encoding is an important real tradeoff and is exposed honestly.
- Export supports cancel, retry, retry with re-encode, output reveal/open, SRT output, and history/job detail.
- Friendly error mapping covers missing/unreadable source, destination, overwrite, and FFmpeg cases.

### Friction

- The panel presents template selection and all fine-grained controls together, with no explicit Advanced boundary.
- `Source`, `Shorts`, `TikTok`, `Reels`, and `Podcast` presets are understandable, but they sit beside output implementation choices that are not necessary for a first export.
- Captions are a critical result decision, but the UI treats caption delivery as one control among many. Full-video default is no captions; short default is burn-in. This is correct as state but needs intent-based explanation.
- Destination behavior differs by desktop/browser and is described in preflight, but the normal action should lead with a clear result location.
- Success can lead with a raw output path rather than a creator result such as `Your short is ready`.

### Phase 2B direction

Keep current export contracts and defaults. Add a simple path consisting of template/result, caption delivery, destination, and Export. Place reframe coordinates, format, resolution, background removal, enhancement, and renderer detail in Advanced or contextual sections. Keep preflight as a review step and use its friendly error mapping as the application-wide pattern.

## 14 Error and Recovery Audit

| Scenario | Current behavior | Creator impact | Desired behavior |
|---|---|---|---|
| Backend will not start | App composes a raw backend error and says to fix setup, quit, and reopen | The creator does not know whether work is safe or which repair is relevant | `ScriptCut could not start local editing` + `Open Setup` + `Copy technical details`; preserve reopen guidance only when needed. |
| Required tool missing | Checklist names Python/FFmpeg/transcription and may show shell commands | Technical vocabulary appears before a goal | `Export needs FFmpeg` or `Transcription needs a local engine` + one repair action; commands in detail. |
| Auto transcription unavailable | Backend/job error and engine/model detail may surface | Fallback behavior is not obvious | Explain which local options were tried, offer Retry/Choose engine, and preserve selected media/project state. |
| Transcription job fails | Raw `job.error`/message, retry, cancel, expandable log | Useful for debugging, hard to act on | Friendly summary, Retry, `Choose another engine`, and technical log disclosure. |
| Transcription canceled | Cancel is mapped to a friendly canceled message | State is clear, but return-to-work path is weak | `Transcription canceled` + `Resume with current project` or `Retry`. |
| AI planning/detection fails | Browser alert with interpolated error | Context is lost; raw provider detail can be alarming | In-place error with Retry, Provider setup, and technical details. |
| Clip export/package fails | Draft stores last error; alert may also fire; retry remains available | Queue safety is good but messages vary | Keep draft in queue, say what is blocked, and show `Retry`/`Edit draft`/`Skip`. |
| Export preflight blocks | Friendly blocker/warning list and retry paths | Best existing model; some terms remain technical | Reuse this structure throughout the app. |
| Caption capability fallback | Preflight warns that SRT may be produced instead of burn-in | Outcome difference can be missed | Say exactly what the creator will receive and offer `Continue with caption file` or `Fix setup`. |
| Autosave fails | Compact `Autosave failed` state with error in title | Project safety is uncertain | Persistent but non-blocking warning with `Retry save`, `Open recovery folder`, and last known safe snapshot. |
| Recent project cannot open | Error may remove the recent entry and expose low-context failure | Creator may not know whether media moved or project is corrupt | Preserve entry, explain `Media moved` versus `Project could not be read`, and offer Locate/Open. |
| Browser upload fails | Raw `Upload failed: ...` detail | Weak recovery and unclear file state | Friendly upload failure with file-type/size/path guidance and Retry. |

## 15 Accessibility / Interaction Findings

- Preserve visible labels for high-value actions. The toolbar generally does this, but the `More tools` control and several media/timeline controls rely on titles or icon recognition.
- Replace native `alert()` and `confirm()` with accessible in-app dialogs where the action is part of the editing workflow. Native file dialogs remain appropriate for file selection.
- Give panel changes a clear heading/status and return focus to the triggering control after close. After transcription, move focus to the transcript or the task header rather than silently changing the active right panel.
- Audit the repeated 10–12px labels and metadata against a readable minimum. Dense metadata can remain compact, but instructions, errors, and primary controls need stronger hierarchy.
- Ensure selected/cut/restored word states have more than color or line-through as the only signal; retain text/state labels and keyboard focus.
- Keep keyboard shortcuts, but expose the cheatsheet as a semantic dialog with focus trapping/return. The current cheatsheet is dynamically styled DOM and closes on overlay click.
- Make progress states announce meaningful changes without dumping raw logs into the main reading order. Logs belong in an expandable technical region.
- Preserve the desktop minimum size, but test the 1024×700 boundary with the editor, AI queue, and Export panel. The fixed layout is likely to create scrolling or truncated actions at that size.
- Ensure browser mode’s developer/testing warning is visible to assistive technology and does not make a creator believe native autosave/direct export is available.

## 16 Phase 2B Implementation Plan

Phase 2B should be delivered as small vertical slices. The slices below are ordered to establish the journey and copy contract before changing individual panels.

### 2B-01 — Outcome-first home and onboarding

- **Goal:** Let a first-time creator choose an outcome before diagnosing the workstation.
- **Files:** `frontend/src/App.tsx`, the first-run checklist component in `frontend/src/App.tsx`, related home styles/tests.
- **Exact behaviors:** Show `Edit a Video`, `Create Clips`, and `Resume/Open Project` as the first actions; move recovery/recent projects into a clear project area; collapse transcription/setup detail; show a compact readiness state with `Fix setup` for real blockers; keep optional capabilities non-blocking; preserve localStorage dismissal behavior and both Electron/browser capabilities.
- **Unchanged:** No backend check semantics, autosave schema, workflow state values, or file-dialog contracts change.
- **Tests:** Add component/interaction coverage for first launch, dismissed onboarding, required versus optional checks, recovery candidate, browser-mode copy, and intent selection; retain existing smoke scripts.
- **Risk:** Copy and layout can accidentally hide a real blocker.
- **Dependencies:** None; establishes labels used by later slices.
- **Acceptance criteria:** A new user sees the three outcome/project actions before technical setup detail; a missing optional tool does not block editing; a true backend/transcription blocker still has a visible repair path; desktop/browser differences are explicit.

### 2B-02 — Transcription as a creator choice

- **Goal:** Make local Auto transcription the default without making engine/model identity a first-launch decision.
- **Files:** `frontend/src/App.tsx`, transcription status UI, `frontend/src/store/editorStore.ts` only if presentation defaults need a stable boundary, related tests.
- **Exact behaviors:** Keep `auto`; present plain-language status and fallback guidance; put engine/model selectors under Advanced; show a single Retry/Choose engine path after failure; retain progress/cancel and technical logs as disclosure.
- **Unchanged:** `/transcription/engines`, `/jobs/transcribe`, polling cadence, fallback implementation, diarization behavior, and project persistence.
- **Tests:** Cover status loading, Auto selection, unavailable engine messaging, cancellation, retry, and log disclosure without asserting brittle backend strings.
- **Risk:** A UI-only simplification could make engine-specific recovery harder.
- **Dependencies:** 2B-01 terminology and setup status.
- **Acceptance criteria:** Auto is the visible default; a creator can start transcription without selecting a model; failures offer a creator-readable retry/alternate path; exact engine details remain available.

### 2B-03 — Task-aware editor frame

- **Goal:** Turn the editor’s existing controls into a visible sequence for Edit a Video and Create Clips.
- **Files:** `frontend/src/App.tsx`, `frontend/src/components/TranscriptEditor.tsx`, `VideoPlayer.tsx`, `WaveformTimeline.tsx`, shared panel/header styles, interaction tests.
- **Exact behaviors:** Add a task header/status such as Transcript ready, Review changes, or Ready to export; preserve Open/Save/AI/Export; make panel changes announce their purpose; route full-video and Create Clips intents to appropriate starting surfaces without implying AI is mandatory; preserve transcript selection operations and keyboard shortcuts.
- **Unchanged:** Word/cut timing semantics, playback sync, waveform fallback, store shape, save/export keyboard commands.
- **Tests:** Cover loaded/empty/transcribing/error/edited/export-ready states, panel focus/return, both intents, and minimum-window layout smoke checks.
- **Risk:** Layout changes can regress transcript selection or timeline interaction.
- **Dependencies:** 2B-01 labels; 2B-02 transcription states.
- **Acceptance criteria:** The creator can identify the current step and next action at each editor milestone; no existing transcript operation is removed; Create Clips is reachable without hunting through unrelated settings.

### 2B-04 — Create Clips workspace and AI recovery

- **Goal:** Make the implemented clip queue a first-class, staged creator workflow while keeping AI discovery optional.
- **Files:** `frontend/src/components/AIPanel.tsx`, `frontend/src/utils/clipDrafts.ts` presentation adapters if needed, AI/settings components, related tests.
- **Exact behaviors:** Rename/reframe the entry as Create Clips; present `Find moments`, manual selection, and speaker-turn drafting as clear routes; show staged queue progress; explain Suggested/Approved/Packaged/Ready; replace alerts with in-place errors/dialogs; keep raw technical detail expandable; retain provider setup link at the point of need.
- **Unchanged:** AI endpoints/provider request shape, clip validation/readiness rules, approval requirement, packaging, batch export, retry/cancel semantics, and draft persistence.
- **Tests:** Add interaction coverage for discovery success/failure, manual draft path, approval/package/export transitions, failed draft retention, retry, provider unavailable, and accessible status/error announcements.
- **Risk:** New staging language could imply a new backend state machine.
- **Dependencies:** 2B-03 task-aware editor; 2B-05 may reuse export result framing.
- **Acceptance criteria:** A creator can understand and complete Find → Review → Package → Approve → Export; AI failure does not lose drafts or context; manual clip creation remains available.

### 2B-05 — Settings and export progressive disclosure

- **Goal:** Make normal export and provider setup approachable without removing power.
- **Files:** `frontend/src/components/SettingsPanel.tsx`, `frontend/src/components/ExportDialog.tsx`, `frontend/src/store/aiStore.ts` only for presentation-safe status derivation if needed, related tests.
- **Exact behaviors:** Split normal versus Advanced controls; lead Export with template/result, caption delivery, destination, and primary action; contextualize fast versus frame-accurate export; move endpoint/model/key and renderer details behind Advanced; preserve provider privacy/status and native/browser destination differences.
- **Unchanged:** Export request payload/default state unless a separately approved default change is documented, friendly error mappings, output formats, caption fallback behavior, secure credential storage, and export history.
- **Tests:** Cover each template, intent defaults, advanced reveal, preflight blockers/warnings, caption fallback, native destination, browser download, retry, and provider settings disclosure.
- **Risk:** Hiding controls can make advanced creators feel constrained or cause an option to be missed.
- **Dependencies:** 2B-01 intent language and 2B-03 task status.
- **Acceptance criteria:** A first export can be completed through a short primary path; all existing controls remain reachable; preflight still explains blockers and warnings; provider secrets and URLs are not exposed in normal creator UI.

### 2B-06 — Unified error and accessibility contract

- **Goal:** Make recovery consistent across setup, media, transcription, AI, autosave, and export.
- **Files:** Shared frontend error/status/dialog components, `frontend/src/App.tsx`, `AIPanel.tsx`, `ExportDialog.tsx`, `SettingsPanel.tsx`, `useProjectAutosave.ts`, related tests.
- **Exact behaviors:** Normalize errors into summary, impact, primary recovery, secondary action, and technical detail; replace browser alerts; add focus/announcement behavior; keep logs expandable and redacted; preserve safe project/draft state on retry.
- **Unchanged:** Backend error sources, retry endpoints, autosave snapshots, native file dialogs, and support-report collection.
- **Tests:** Error matrix coverage from Section 14, keyboard/screen-reader interaction checks, focus return, reduced-motion/readability checks, and no-regression smoke scripts.
- **Risk:** A generic mapper may hide a useful provider or runtime instruction.
- **Dependencies:** Prior slices establish the states and labels being normalized.
- **Acceptance criteria:** Every user-visible failure identifies what happened, what is safe, and what action is available; raw detail is optional; no core flow depends on an `alert()` interruption.

## 17 Deferred to Phase 3 runtime-dependent

These items should not be disguised as Phase 2B UX work:

- Bundling or replacing Python runtimes, local backend dependencies, transcription engines, optional ML packages, or provider services.
- Cross-platform installer, signing, notarization, Windows/Linux packaging, and guaranteed native file/runtime behavior outside the verified macOS Apple Silicon alpha.
- Changing Electron startup, backend health, FFmpeg discovery, caption renderer capability, or network/provider security enforcement.
- Making browser mode equivalent to desktop autosave, native dialogs, direct exports, or packaged runtime behavior.
- Adding new AI models, remote orchestration, cloud persistence, or automatic publishing destinations.
- Replacing the existing project schema, migrating autosaves, or changing clip/export payload contracts.
- Automated content judgment, automatic publication, or removing creator approval from suggested clips.

Phase 2B may improve the explanation and placement of these boundaries. It should not claim to solve their runtime or packaging causes.

## 18 Non-Goals

- No application code changes are part of this Phase 2A audit.
- No backend, Electron, Python, FFmpeg, transcription, AI-provider, export, or project-schema redesign.
- No new creator features beyond information architecture, progressive disclosure, defaults presentation, accessibility, and recovery UX.
- No automatic approval, publishing, or cloud upload of generated clips.
- No removal of local-first behavior, native file dialogs, autosave/recovery, transcript editing, waveform review, or advanced controls.
- No change to public platform-support claims; the verified desktop alpha remains the reference packaging path.
- No merge, release, tag, or Phase 2B implementation in this branch.
