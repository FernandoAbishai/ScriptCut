# ScriptCut Phase 5A Repurpose Workflow Audit & Product Contract

**Repository:** `FernandoAbishai/ScriptCut`
**Audited base:** `a2228e50c6336ad919e320385ad6b119af941acd` (`main`)
**Audit branch:** `audit/repurpose-workflow-phase-5a`
**Audit date:** 2026-08-21
**Scope:** research and product-contract audit only. No product behavior, AI prompt, export, runtime, packaging, dependency, release, or workflow changes are part of Phase 5A.

## 1. Executive summary

### Verdict

ScriptCut already has the major building blocks for a local-first spoken-content repurpose workflow: local transcription, word-level transcript editing, AI clip discovery, manual transcript clip creation, speaker-turn drafts, per-clip preparation, optional AI metadata, vertical/square export, captions, reframe controls, hook-frame briefs, social copy packs, per-clip retry, serial batch export, and project autosave.

The current implementation is best described as **a capable clip workbench, not yet a dependable five-clip publishing workflow**. The critical contract is still provider-shaped and weakly validated at the discovery boundary. The model is asked for 1–3 clips, no exact count is enforced, raw indices and timestamps are trusted, and only exact word-range duplicates are removed. The normal path therefore cannot promise five strong, distinct, valid suggestions.

The strongest existing fallback is manual: select transcript words and choose **Draft clip**, or create speaker-turn drafts when diarization is available. That path does not need an AI provider. Metadata generation is also non-blocking in the actual export gate: an approved draft with a title and valid range can export even if packaging fails, although the readiness score and UI still encourage packaging first.

The highest-value Phase 5 work is a narrow contract and reliability sequence:

1. normalize and validate discovery results deterministically;
2. return a ranked, bounded, diverse review queue with a normal target of five;
3. make review preview bounded and reduce technical disclosure;
4. separate clip publishability from optional AI metadata;
5. make framing/caption behavior honest and export-parity driven;
6. harden batch export and recovery;
7. qualify the complete creator journey against real spoken-content fixtures.

### What is implemented today

- Home has a dedicated **Create Clips** intent with the copy “Find, review and export social-ready moments” (`frontend/src/components/HomeScreen.tsx:162-177`).
- Selecting that intent applies Shorts defaults: vertical, 1080p, MP4, re-encode, creator burn-in captions, 5 words per line, and centered reframe (`frontend/src/App.tsx:302-327`).
- Transcription is a local background job with progress, cancellation, retry, engine selection, and optional speaker diarization (`frontend/src/App.tsx:447-541`; `backend/routers/transcribe.py:51-83`).
- The editor offers a Create Clips workspace with Find, Review, Prepare, and Export stages (`frontend/src/components/AIPanel.tsx:1574-1798`).
- Manual transcript selection creates a Shorts-ready `ClipDraft` without AI (`frontend/src/components/TranscriptEditor.tsx:322-360`).
- AI discovery, speaker-turn drafts, AI Director, metadata packaging, export, batch export, caption delivery, reframe, social packs, hook-frame briefs, and project persistence are present in some form.

### What prevents the north-star promise today

- Discovery asks for 1–3 clips, not five, and does not validate the returned collection (`backend/services/ai_provider.py:410-444`; `frontend/src/components/AIPanel.tsx:585-623`).
- Suggestion boundaries are not derived from transcript words and may be invalid, badly trimmed, overlapping, or outside the requested duration (`backend/services/ai_provider.py:436-444`; `frontend/src/hooks/useProjectAutosave.ts:384-395`).
- Preview starts at the suggestion but does not set a clip end boundary; it can play beyond the proposed clip (`frontend/src/components/AIPanel.tsx:698-716`; `frontend/src/store/editorStore.ts:194-213`).
- Packaging is an AI metadata request only. It does not prepare framing or captions, yet `packaged` improves readiness and the UI presents packaging as a preparation gate (`frontend/src/components/AIPanel.tsx:1175-1215`; `frontend/src/utils/clipDrafts.ts:179-227`).
- Vertical framing and caption controls are visible in the draft card, but the normal preview shows only a crop guide and not rendered captions or final export parity (`frontend/src/components/VideoPlayer.tsx:73-107`; `frontend/src/components/AIPanel.tsx:2127-2169`).
- Project autosave includes clip suggestions and drafts, but the schema remains version 1 with no migration path, and the shared schema does not list all actual clip source values (`frontend/src/hooks/useProjectAutosave.ts:163-193,205-237,397-426`; `shared/project-schema.json:136-160`).

### Product conclusion

Phase 5 should optimize for the creator’s path from one long-form spoken recording to a small set of publishable local outputs. It should not turn ScriptCut into a generic NLE, add social publishing APIs, or make AI a prerequisite for making a clip.

## 2. Current end-to-end workflow

### Actual path

```text
Home
  → Create Clips intent
  → choose local media / browser upload
  → apply Shorts defaults
  → start / poll local transcription job
  → transcript and video editor open
  → Create Clips panel opens for the short intent
  → Find moments with AI
       ├─ provider succeeds → raw suggestions → suggested ClipDrafts → Review
       └─ provider fails → creator error; manual transcript selection remains available
  → Review each suggestion
       ├─ Preview → seek/play from proposed start, select words
       ├─ Approve → status suggested → draft
       └─ Remove → item is deleted; no rejected state is persisted
  → Prepare approved clips
       ├─ numeric in/out trim; range normalized to transcript words
       ├─ frame, quality, format, reframe, captions, style, audio, background controls
       ├─ Package → AI metadata only; status draft → packaged on success
       └─ optional social pack / hook-frame brief / copy actions
  → Export
       ├─ individual `/jobs/export`
       ├─ failed item can retry while its in-memory export job remains available
       └─ Export All loops eligible drafts serially and preserves per-item results
  → output video and optional sidecar SRT
  → optional Electron manifest with package and output summary
```

### Stage ownership

| Stage | Current owner | Evidence | Audit finding |
| --- | --- | --- | --- |
| Home intent | `HomeScreen` | `frontend/src/components/HomeScreen.tsx:162-205` | Creator-facing intent exists and is clear. |
| Intent defaults | `App.applyWorkflowIntent` | `frontend/src/App.tsx:302-340` | Good Shorts defaults, but global editor export options and per-draft defaults are duplicated. |
| Media selection | `App.handleOpenFile`, browser upload handlers | `frontend/src/App.tsx:342-359,370-421` | Desktop path is local; browser path uploads to the local backend temp area. |
| Transcription | `App`, `jobs`, `transcribe` service | `frontend/src/App.tsx:447-541`; `backend/routers/jobs.py:34-36`; `backend/routers/transcribe.py:51-83` | Background, retryable, local-first. |
| Transcript review | `TranscriptEditor`, `editorStore` | `frontend/src/components/TranscriptEditor.tsx:322-360,554-680` | Strong manual fallback and word-level control. |
| AI discovery | `AIPanel.createClips`, `ai.py`, `ai_provider.py` | `frontend/src/components/AIPanel.tsx:585-623`; `backend/routers/ai.py:142-160`; `backend/services/ai_provider.py:383-444` | Provider-dependent and under-validated. |
| Suggestion → draft | `appendDiscoveredClipDrafts`, `createShortsClipDraft` | `frontend/src/components/AIPanel.tsx:2672-2700` | Exact-range dedupe only; raw suggestion fields copied. |
| Review | `ClipSuggestionReviewCard` | `frontend/src/components/AIPanel.tsx:1643-1680,1804-1845` | Scanable card, but preview is not bounded and rejection is destructive removal. |
| Manual draft | `TranscriptEditor.draftClipFromSelection` | `frontend/src/components/TranscriptEditor.tsx:322-360` | Deterministic and AI-independent. |
| Speaker-turn draft | `speakerTurnClips`, `createSpeakerTurnDrafts` | `frontend/src/components/AIPanel.tsx:351-384,1028-1041` | Deterministic from speaker labels; no duration cap. |
| Trim and normalization | `normalizeClipDraftRange` | `frontend/src/utils/clipDrafts.ts:52-77` | Applies to user edits, not initial AI results. |
| Packaging | `packageClipDraft`, `/jobs/ai/clip-metadata` | `frontend/src/components/AIPanel.tsx:1175-1215`; `backend/routers/ai.py:163-174` | AI metadata only; not a media preparation step. |
| Framing/captions | `ClipDraftCard`, `VideoPlayer`, export service | `frontend/src/components/AIPanel.tsx:2080-2184`; `frontend/src/components/VideoPlayer.tsx:83-105`; `backend/routers/export.py:175-235` | Export path exists; preview parity is partial. |
| Individual export | `handleExportClip`, `jobs/export` | `frontend/src/components/AIPanel.tsx:837-947`; `backend/routers/export.py:159-311` | Strong validation and retryable job path. |
| Batch export | `handleExportAllDrafts` | `frontend/src/components/AIPanel.tsx:1116-1168` | Serial, partial-failure tolerant, no durable batch job. |
| Persistence | `useProjectAutosave`, `aiStore`, `editorStore` | `frontend/src/hooks/useProjectAutosave.ts:163-193,491-594` | Clip work is persisted in desktop mode; browser autosave is unavailable. |

### Current Create Clips journey from the creator’s perspective

The user chooses a recording and waits for local transcription. The Create Clips panel then asks the user to press **Find moments with AI**, rather than presenting a guaranteed five-item queue. If the provider succeeds, one to three cards generally appear. Each card contains a title, time range, duration, reason, a short transcript excerpt, and Preview / Approve / Remove actions. Approval creates an editable draft.

The preparation card then exposes a large amount of power: trim times, frame, quality, format, reframe coordinates, captions, style, audio enhancement, optional background removal, transcript, hook, description, caption, hashtags, social packs, hook-frame candidates, package, export, copy, duplicate, and remove. This is technically rich but not yet a low-friction “ScriptCut prepares everything” path.

## 3. Capability inventory

| Capability | Status | Evidence | Assessment |
| --- | --- | --- | --- |
| Home Create Clips intent | IMPLEMENTED | `HomeScreen.tsx:162-177` | Dedicated intent and creator-facing copy. |
| Short-workflow defaults | IMPLEMENTED / DUPLICATED | `App.tsx:302-327`; `AIPanel.tsx:120-130`; `TranscriptEditor.tsx:334-352` | Three default definitions can drift: global export options, AI draft defaults, and manual draft defaults. |
| `ClipSuggestion` representation | PARTIAL | `types/project.ts:160-167`; `shared/project-schema.json:172-182` | Range, times, title, reason only; no id, rank, duration, score, or provenance in the canonical type. |
| `ClipDraft` representation | IMPLEMENTED / LEGACY-EXTENDED | `types/project.ts:172-197` | Rich draft fields exist, but it inherits untrusted suggestion fields and has optional status/provenance fields. |
| Draft statuses/lifecycle | PARTIAL | `types/project.ts:169-170`; `clipWorkspace.ts:3-25`; `AIPanel.tsx:2638-2660` | Suggested, approved-as-draft, packaged, exporting, exported, failed are present; rejected/skipped and packaging-failed are not durable states. |
| Suggestion → draft conversion | IMPLEMENTED / FRAGILE | `AIPanel.tsx:2689-2700` | Copies raw suggestion and applies defaults; only exact-range duplicate check. |
| Manual Draft Clip | IMPLEMENTED | `TranscriptEditor.tsx:322-360` | Works without AI and creates a complete Shorts draft shell. |
| Speaker-turn clip creation | IMPLEMENTED / PARTIAL | `AIPanel.tsx:351-384,1028-1041` | Deterministic from diarized speaker labels; every turn over two seconds can become a draft, with no target-duration cap or selection quality gate. |
| Find Best Clips AI action | IMPLEMENTED / FRAGILE | `AIPanel.tsx:585-623`; `ai_provider.py:410-422` | The action works when the configured provider works; it is not a five-result contract. |
| Duration constraints | PARTIAL | `AIPanel.tsx:605-608`; `ai_provider.py:404-406`; `clipDrafts.ts:195-205` | Prompt says 30–90 seconds; no backend enforcement; readiness score says 12–60 seconds. These are three different contracts. |
| Creator instructions | PARTIAL | `ai.py:33-45`; `ai_provider.py:408` | Request model supports an instruction, but the Create Clips UI does not expose one. |
| Platform handling | PARTIAL | `AIPanel.tsx:606`; `types/project.ts:170`; `socialPublishing.ts:16-20` | Discovery is Shorts-shaped; social copy supports three platforms; draft platform is only `shorts` or `generic`. |
| Trim/edit boundaries | PARTIAL | `clipDrafts.ts:52-77`; `AIPanel.tsx:2078-2088` | User trim snaps word indices from edited times; initial AI boundaries are not normalized. |
| Preview/seek | FRAGILE | `AIPanel.tsx:698-716`; `editorStore.ts:194-213`; `VideoPlayer.tsx:44-60` | One click seeks and plays from start but does not constrain playback to the clip end. The global preview frame only shows a crop guide. |
| Readiness scoring | IMPLEMENTED / MISLEADING | `clipDrafts.ts:179-227`; `AIPanel.tsx:2007-2022` | Useful explanation, but the numeric score mixes export validity, social defaults, metadata completeness, and packaged status; it is not a discovery quality score. |
| Approval | IMPLEMENTED | `AIPanel.tsx:753-756`; `AIPanel.tsx:1832-1841` | Approval changes `suggested` to `draft`; no durable decision record for rejected items. |
| Packaging | PARTIAL | `AIPanel.tsx:1175-1215`; `ai_provider.py:447-507` | Generates hook/title/description/caption/hashtags only. It does not render or change framing/captions. |
| Hook generation/selection | PARTIAL | `AIPanel.tsx:2211-2215`; `ai_provider.py:455-468` | AI hook text exists; creator can edit it; no relationship to actual first spoken seconds is enforced. |
| Title generation | IMPLEMENTED / FRAGILE | `ai_provider.py:459-503`; `AIPanel.tsx:1197-1203` | Up to three titles are returned and first is chosen; malformed/empty metadata can still mark a draft packaged. |
| Description generation | IMPLEMENTED | `ai_provider.py:455-507`; `types/project.ts:188-191` | Stored and editable. |
| Social caption | IMPLEMENTED | `AIPanel.tsx:2223-2227`; `socialPublishing.ts:30-78` | Editable and copied into platform packs. |
| Hashtags | IMPLEMENTED / PARTIAL | `socialPublishing.ts:22-27`; `ai_provider.py:492-503` | Normalized per platform for copy; no evidence-based topic quality or platform-specific generation. |
| Caption styling | IMPLEMENTED / PARTIAL | `AIPanel.tsx:85-118,2565-2635`; `caption_generator.py:121-180` | Presets and burn-in/SRT paths exist; rendered preview is not clip/export-parity complete. |
| Vertical framing/reframe | IMPLEMENTED / FRAGILE | `AIPanel.tsx:2127-2131,2702-2736`; `video_editor.py:358-387` | Center crop and x/y controls are deterministic; no person/face tracking. |
| Face/person tracking | MISSING | `AIPanel.tsx:2480-2563`; `background_removal.py:68-102` | Background segmentation is optional and unrelated to reframe tracking. |
| Social publishing packs | IMPLEMENTED | `socialPublishing.ts:45-78`; `AIPanel.tsx:2243-2286` | Copyable Shorts/TikTok/Reels text; no API publishing. |
| Export validation | IMPLEMENTED / PARTIAL | `clipDrafts.ts:79-99`; `export.py:90-121` | Good basic gate, but it does not require packaging, social readiness, or caption availability. |
| Individual export | IMPLEMENTED | `AIPanel.tsx:837-947`; `export.py:159-311` | Uses local background job, per-draft status, output path, SRT result, warnings. |
| Batch export | IMPLEMENTED / PARTIAL | `AIPanel.tsx:1116-1168` | Serial queue, progress, stop-after-current, partial results, optional manifest. No durable batch job or resume record. |
| Failed export retry | PARTIAL | `AIPanel.tsx:964-1007`; `jobs.py:80-93` | Retry works while the job record is available; persisted failed drafts do not restore an in-memory retry job after restart. |
| Project persistence/autosave | IMPLEMENTED / PARTIAL | `useProjectAutosave.ts:163-193,491-594` | Desktop autosaves every five seconds and rotates three snapshots; browser mode reports unavailable. |
| Backward compatibility | PARTIAL / FRAGILE | `useProjectAutosave.ts:205-237,384-426`; `editorStore.ts:527-553` | Accepts `.scriptcut`, legacy `.aive`, and `.cutscript`; only version 1 is accepted and field normalization is permissive. |

## 4. Clip discovery audit

### Exact current contract

The Create Clips caller sends:

- the whole transcript as one space-joined string;
- every word with index, text, start, and end;
- provider, model, API key, and optional base URL;
- target duration `60`;
- platform `shorts`;
- minimum duration `30` and maximum duration `90`.

Evidence: `frontend/src/components/AIPanel.tsx:585-623` and `backend/routers/ai.py:33-45,142-160`.

The provider prompt says “Suggest 1-3 clips,” asks for the target and acceptable range, and requests title, word indices, timestamps, and reason (`backend/services/ai_provider.py:399-424`). There is no request for exactly five, no response count contract, no rank field, and no score field.

### Response validation and normalization

Current behavior:

1. The backend extracts the substring from the first `{` to the last `}` and calls `json.loads` (`ai_provider.py:436-444`).
2. A JSON parse failure returns `{"clips": []}`.
3. A valid JSON object is returned without validating that it is a dictionary with a list of clip objects.
4. The frontend reads `data.clips || []`, stores the raw array, and copies each suggestion directly into a `ClipDraft` (`AIPanel.tsx:613-616,2689-2699`).
5. On project load, `normalizeClipSuggestions` filters for field types only. It does not clamp indices, derive times, enforce duration, or remove overlap (`useProjectAutosave.ts:384-395`).

Consequences:

- invalid index values can reach the draft layer;
- timestamps supplied by the model are trusted instead of derived from `words[startWordIndex].start` and `words[endWordIndex].end`;
- a valid JSON object with malformed `clips` content has no defined product-safe outcome;
- malformed data that is accepted by the type shape can survive autosave and reopen;
- output order is whatever the model returns, with no explicit rank semantics.

### Count, ranking, score, and reasons

| Question | Current answer |
| --- | --- |
| How many clips are requested? | 1–3 in the provider prompt. The UI passes no count. |
| Is exactly five expected anywhere? | No source contract or runtime validation requires five. Existing wording and tests use “Export Ready Clips,” not a five-result guarantee. |
| Is count validated? | No. An empty array is accepted; more or fewer than three are not rejected. |
| Are indices normalized? | No at the backend boundary. UI transcript helpers clamp for display, but do not repair the stored suggestion. |
| Are timestamps derived? | Only for edit-plan/director results. Normal clip suggestions trust model timestamps. |
| Is output ranked? | No explicit rank field. Array order is implicitly used as display order. |
| Is there a score/confidence? | No clip-discovery score or confidence. Edit-plan confidence does not apply to normal clip discovery. |
| Are reasons useful? | The prompt asks “why this segment is engaging.” The UI displays the text, but there is no reason taxonomy or evidence requirement. |
| Are duplicates removed? | Exact word range only in `appendDiscoveredClipDrafts`; no overlap or semantic diversity check. |

### Long-transcript behavior

The entire word list and transcript are sent in one request. Each word is serialized once in the prompt as an indexed line with timestamps, and the whole transcript is also serialized separately (`AIPanel.tsx:590-600`; `ai_provider.py:399-417`). There is no chunking, retrieval, token budget, context-limit check, or fallback strategy for 30-, 60-, or 120-minute recordings. The likely behavior is linear payload growth followed by provider-specific latency, context rejection, or degraded attention. The two-worker in-memory job manager bounds concurrency but does not solve prompt size (`backend/services/job_manager.py:13-20,33-65`).

### Provider failure and no-provider behavior

The default provider is Ollama at `http://localhost:11434` with model `llama3`; cloud providers are OpenAI and Claude, and a local/remote 9router-compatible endpoint is supported (`frontend/src/store/aiStore.ts:18-23`). Provider calls raise on network/API failures (`backend/services/ai_provider.py:119-171,180-256`). The job becomes failed; the frontend displays an AI error and offers job retry (`AIPanel.tsx:386-436,1217-1268`). No automatic deterministic discovery result is generated.

The creator can still select transcript words and draft a clip, or use speaker-turn drafts when speaker labels exist. This is the correct graceful-degradation foundation, but it is not presented as an automatic replacement for failed discovery.

### Recommended future discovery contract — define in 5B, do not implement in 5A

The normal result should be a bounded, ranked queue with a target of five valid suggestions, not an arbitrary provider list.

```ts
type ClipDiscoveryResult = {
  schema: 'scriptcut.clip-discovery.v1';
  requestedCount: 5;
  clips: ClipSuggestionV1[];
  shortfallReason?: string;
};

type ClipSuggestionV1 = {
  id: string;
  rank: number; // 1..N, unique after normalization
  startWordIndex: number;
  endWordIndex: number;
  startTime: number; // derived from normalized words
  endTime: number;   // derived from normalized words
  duration: number;  // endTime - startTime
  title: string;
  reason: string;
};
```

Contract rules:

- `clips` contains at most five items and is ordered by `rank`.
- When the transcript contains at least five valid, meaningfully distinct candidates, the normal result is exactly five.
- Fewer than five is acceptable only when deterministic validation/diversity filtering leaves a shortfall; the result must explain the shortfall rather than fabricate items.
- Start and end indices are integers within the current word array, with `startWordIndex <= endWordIndex`.
- Times are derived from the selected transcript words, not accepted as authoritative LLM data.
- Duration is derived and must satisfy the product’s single duration policy. The current 30–90 prompt and 12–60 readiness policy must be reconciled before implementation.
- `id` is stable for the result and not based only on array position, so review decisions and autosave can survive reordering.
- `reason` must describe the creator-useful quality of the moment: hook, self-contained setup, clear payoff, surprising claim, emotion, or quote. It should not be a decorative generic phrase.
- `rank` is sufficient for the first product contract. Do not expose numeric quality scores in the normal UI yet.

#### Should there be explicit score dimensions?

Not in the first Phase 5 implementation. `hookStrength`, `selfContainedness`, `clarity`, `novelty`, `emotionalImpact`, `quotability`, and `platformFit` are useful evaluation dimensions, but returning uncalibrated 0–1 values would communicate false precision. Start with rank plus a reason and qualify against a small human-labeled fixture set. Add optional internal dimensions only when they improve selection or explainability measurably; do not make them a creator-facing gate by default.

## 5. Boundary quality

### Current boundary selection

Normal AI suggestions carry model-provided indices and timestamps unchanged. Manual drafts derive the start and end from the first and last selected transcript word (`TranscriptEditor.tsx:322-358`). User edits call `normalizeClipDraftRange`, which clamps the time range to a minimum 0.25 seconds and derives the nearest start/end word indices (`clipDrafts.ts:52-77`).

Export then uses the stored time range for media segments and the stored word range for caption words (`AIPanel.tsx:861-889`; `clipDrafts.ts:106-173`). This creates a material mismatch risk when an AI timestamp does not agree with its word indices.

### Boundary failure modes

| Failure mode | Current state | Deterministic or AI? |
| --- | --- | --- |
| Starts in the middle of a sentence | Possible; no sentence/segment snap on AI results. | Deterministic candidate snap, AI may choose the meaningful start. |
| Ends before the idea resolves | Possible; no payoff or sentence-completion validation. | AI selection; deterministic punctuation/segment checks can reject weak edges. |
| Leading filler/context | Possible; prompt asks for a strong hook but no cleanup follows. | Known filler and leading silence can be deterministic; semantic context needs AI/human review. |
| Excessive dead air | Possible inside and at edges. | Edge gaps can be trimmed deterministically by a measured threshold; intentional pauses need review. |
| Outside duration | Prompt-only for AI; manual validation only enforces 0.25 seconds; readiness score uses 12–60. | Deterministic enforcement after policy is chosen. |
| Invalid indices | Accepted at discovery; UI/load filtering is type-only. | Deterministic rejection/repair. |
| Deleted transcript ranges | Export intersects stored clip time with cuts and removes deleted caption words, but the review text can still include deleted words. | Deterministic normalization and visible warning. |
| Speaker boundary | Speaker-turn drafts are full contiguous speaker runs; AI discovery does not use speaker data. | Deterministic boundary option; AI can choose among turns. |
| Punctuation availability | Word text may contain punctuation, but no structured sentence boundary is stored in `ClipSuggestion`. | Deterministic best effort; qualification required for transcript engines/languages. |
| Timing gaps | Word timestamps are present and used for export, but no gap policy exists at discovery. | Deterministic measurement and policy. |

### Recommended normalization order

1. Reject non-object/non-list results and malformed items.
2. Normalize integer indices and require both endpoints to exist in the current word array.
3. Clamp or reject out-of-bounds candidates according to a single policy; rejection is safer than silently changing the creator’s intended moment at the backend boundary.
4. Derive `startTime` and `endTime` from the endpoint words.
5. Apply the approved duration policy.
6. Snap or reject leading/trailing gaps and weak word boundaries deterministically.
7. Exclude wholly deleted ranges and mark partially deleted ranges for re-evaluation.
8. Deduplicate and apply diversity filtering in rank order.
9. Assign stable ids and return the bounded result with any shortfall reason.

Do not use embeddings or a vector database for this contract. The first quality gain should come from authoritative transcript boundaries, deterministic validation, and simple ranked diversity.

## 6. Variety and deduplication

Current dedupe compares exact `(startWordIndex, endWordIndex)` pairs only (`frontend/src/utils/clipWorkspace.ts:28-54`; `AIPanel.tsx:2689-2699`). It does not remove:

- overlapping clips;
- the same story shifted by a few words;
- adjacent clips dominated by one long section;
- repeated provider results across retries when the range differs slightly;
- semantically similar clips with disjoint ranges.

### Recommended simple diversity contract

Process candidates in rank order after boundary normalization:

- remove exact range duplicates;
- keep the higher-ranked candidate when two candidates overlap more than 50% of the shorter candidate’s duration;
- do not claim semantic deduplication beyond range overlap and transcript evidence;
- if fewer than five remain, return the shortfall explicitly;
- retain the provider’s rank only after normalization; do not use a score as a substitute for diversity;
- add a fixture-based review for same-story disjoint candidates before introducing a stronger heuristic.

This is intentionally conservative. It bounds obvious duplication without introducing semantic infrastructure or silently suppressing a genuinely different moment.

## 7. Review/workspace audit

### What works

The normal suggestion card contains the minimum useful scan fields: title, time range, duration, reason, a transcript excerpt, Preview, Approve, and Remove (`AIPanel.tsx:1804-1845`). The cards are compact enough to scan a small queue, and approval is one click. The workspace has explicit stages and pending/approved/packaged/ready/failed counts (`AIPanel.tsx:1583-1611`).

### Creator friction

- A queue is not guaranteed to contain five cards, so scanability cannot be judged against the intended product outcome.
- Preview is not bounded to the suggestion: `handlePreviewClip` sets a seek and play request but not `previewRangeEnd` (`AIPanel.tsx:698-716`). The creator can hear or watch beyond the proposed range.
- The review card shows only a line-clamped transcript excerpt; the full transcript remains in the separate editor pane, which is useful but not tightly coupled to the card.
- Start/end adjustment is available only after approval in the prepare card, via numeric fields, not as a natural review action.
- Remove deletes the suggestion/draft instead of persisting a Skip/Rejected decision. The creator cannot audit or restore a skipped suggestion after leaving the workspace.
- Packaging, framing, caption style, audio enhancement, optional background removal, social packs, and hook frames all live in the prepare card. This exposes implementation controls before the creator has a final publishability review.
- Readiness is a blended engineering/social score. It is useful as a checklist but should not be confused with “this is a strong moment.”

### Minimum normal suggestion card

Keep the normal card to:

1. rank/title;
2. time range and duration;
3. transcript excerpt;
4. one creator-useful reason;
5. bounded Preview;
6. Approve and Skip;
7. a small “needs review” indicator only when deterministic validation found a recoverable issue.

Keep word indices, provider, job ids, reframe coordinates, FFmpeg, and metadata schemas behind detail/recovery surfaces.

## 8. Clip lifecycle/state machine

### Effective current state machine

```text
suggested --Approve--> draft --Package success--> packaged
    │                    │                         │
    └--Remove--> deleted │                         └--Export--> exporting
                         │                                      │
                         └--Export------------------------------┘
                                                                │
                                      success ------------------┴--> exported
                                      failure/cancel -----------> failed
                                      Retry in same session ----> exporting
```

`failed` is also an exportable status. Packaging failure does not transition to `failed`; it leaves the existing status and stores `lastError` (`AIPanel.tsx:1206-1212`).

### Transition table

| Transition | Trigger/owner | Persisted fields | Validation | Recovery |
| --- | --- | --- | --- | --- |
| none → suggested | AI discovery / append helper | full suggestion, draft defaults, `status: suggested` | None beyond raw array behavior; exact-range dedupe only | Remove or approve. |
| suggested → draft | Approve button / `approveClipDraft` | `status: draft`, clears `lastError` | No range repair at approval | Trim, package, export. |
| transcript selection → draft | `TranscriptEditor` | full manual draft with defaults and `source: transcript-selection` | Selection indices are normalized | Edit, package optionally, export. |
| speaker turn → draft | `createSpeakerTurnDrafts` | full draft with `source: speaker-turn`, speaker | Minimum two-second turn only | Edit, package optionally, export. |
| draft → packaged | Package AI success | metadata fields, `status: packaged` | Transcript slice must be non-empty; backend metadata response is weakly parsed | Edit and repackage. |
| draft/packaged/failed → exporting | `handleExportClip` | `status: exporting` | video, title, duration, valid word range | Poll job; cancel or failure. |
| exporting → exported | export job success | `status`, `exportPath`, `exportedAt`, clear error | Backend result has output path | Reveal/download. |
| exporting → failed | export error/cancel | `status: failed`, `lastError` | Error text only | Retry current job or start export again. |
| failed → exporting | retry button or Export | in-memory job retry or new export | Retry requires job status `failed`/`canceled` | Not durable across app restart as a job record. |
| suggested → removed | Remove/Reject button | nothing; item is deleted | No decision record | Not recoverable from the project unless an unmatched legacy suggestion remains elsewhere. |

### State problems to preserve until implementation

- `packaged` is an implementation state for metadata, not proof that the video is framed/captioned/export-ready.
- `failed` conflates export failure with a generally reusable draft, while packaging failure has no state.
- `exporting` can be persisted by autosave even though the job itself is in-memory and may disappear on restart.
- A persisted failed draft has `lastError` but no restored `ExportJob`; the creator can export again, but the explicit Retry affordance is session-scoped.
- Rejected/skipped suggestions are not durable, which makes review analytics and recovery impossible without changing the lifecycle.

Do not rename states in 5A. First define the creator contract and migration strategy in the implementation phase.

## 9. Packaging/metadata audit

### What “Package” currently means

`packageClipDraft` sends only the selected clip transcript to `/jobs/ai/clip-metadata` (`AIPanel.tsx:1175-1196`). The backend prompt asks for hook, three title options, description, caption, and five hashtags (`ai_provider.py:447-468`). On success, the renderer stores those fields and marks the draft `packaged` (`AIPanel.tsx:1197-1205`). It does not change:

- aspect ratio;
- reframe coordinates;
- caption mode or style;
- export format/resolution;
- spoken opening seconds;
- visual hook frame.

Packaging is therefore metadata generation, not complete media preparation.

### Approve vs Package

Approval is a meaningful creator decision: “keep this moment.” Packaging is currently a provider-backed implementation action: “generate social text.” Treating both as required steps leaks architecture into the UX. The product contract should preserve approval as a decision and make metadata preparation optional/resilient. A clip should become exportable after approval plus deterministic media readiness, even when AI metadata is unavailable.

The current code already partly supports that contract: `validateClipDraftForExport` requires a video, title, minimum duration, valid word indices, and a non-`suggested` status, but does not require `packaged`, hook, caption, or hashtags (`clipDrafts.ts:79-99`). The batch export filter uses this validator (`AIPanel.tsx:1116-1122`).

### Metadata failure behavior

- Provider/network failure leaves the draft status unchanged and stores `lastError`.
- A JSON parse failure inside `create_clip_metadata` returns empty metadata, and the caller still marks the draft `packaged` because it sees a successful job result (`ai_provider.py:482-507`; `AIPanel.tsx:1197-1205`).
- A valid response with no title falls back to the prior title, so manual export can remain possible.
- Metadata generation is not required for individual or batch video export.

This is a good resilience boundary but needs clearer UI semantics: “Metadata unavailable; video remains exportable” is more honest than a packaged success with empty fields.

## 10. Framing audit

### Current behavior

- Short defaults use vertical 9:16, 1080p, MP4, and centered `{x:50,y:50}` reframe (`App.tsx:302-327`; `AIPanel.tsx:120-130`).
- The draft card exposes horizontal and vertical range controls from 0–100 plus a Center crop action (`AIPanel.tsx:2702-2736`).
- Export converts these coordinates into FFmpeg crop positions (`backend/services/video_editor.py:358-387`).
- No face/person tracking exists. MediaPipe/OpenCV is used only for optional export-time background removal (`backend/services/background_removal.py:31-43,68-102`).
- The main video preview shows a 9:16 or 1:1 safe-frame overlay and coordinate labels, but does not render the actual crop or captions (`frontend/src/components/VideoPlayer.tsx:73-107`).

### Assessment

Center crop is a safe deterministic fallback for single-speaker material only when the speaker is centered. Manual x/y is present but technical. Interview and multi-speaker recordings are not automatically reframed. Background removal must not be described or reused as tracking. A reframe failure is not a normal blocker unless background removal is explicitly enabled; the normal path uses deterministic crop.

### Phase 5 creator target

“ScriptCut chooses a safe vertical crop for the selected clip. If the subject is not centered, the creator can adjust one simple framing control and see the same crop that export will use.”

Automatic tracking is explicitly deferred. The first implementation should improve default safety and preview/export parity, not add a tracking subsystem.

## 11. Captions audit

### Current behavior

- Short defaults use creator burn-in captions, Arial 58px, bold, bottom position, yellow highlight, five words per line (`App.tsx:314-325`; `AIPanel.tsx:96-106`).
- The card offers Clean, Creator, and Karaoke presets; position, words per line, font size, text/highlight colors, and bold are editable (`AIPanel.tsx:2565-2635`).
- Export builds ASS for burn-in when the FFmpeg ASS filter is available; otherwise it changes the effective output to sidecar SRT and returns a warning (`backend/routers/export.py:175-205,295-309`).
- Caption words are retimed to concatenated export segments and hidden/deleted indices are omitted (`clipDrafts.ts:141-173`).
- The generic caption endpoint also supports SRT, VTT, and ASS (`backend/routers/captions.py:35-64`), but Create Clips uses the export job directly.

### Assessment

The caption engine is good enough as a Phase 5 foundation: it has word timing, deleted/caption-only handling, presets, burn-in, and SRT fallback. The material blocker is not a missing caption engine; it is the lack of honest preview parity and the possibility that the creator sees a clean preview while the final output falls back to sidecar captions. Safe-area behavior is represented by fixed ASS margins and a bottom/top/center choice, but there is no clip-specific visual safe-area qualification.

Do not redesign the caption engine in 5A. Qualify timing, line breaks, deleted words, vertical safe area, burn-in fallback, and preview/export parity in 5B/5C.

## 12. Export All audit

### Exact path and endpoints

`handleExportAllDrafts` filters `draft`, `packaged`, and `failed` items through `validateClipDraftForExport`, preserves current array order, and calls `handleExportClip` one item at a time (`AIPanel.tsx:1116-1145`). Each item calls:

- `POST /jobs/export`;
- polling `GET /jobs/{job_id}` every 700ms;
- on explicit retry, `POST /jobs/{job_id}/retry`;
- on cancellation, `POST /jobs/{job_id}/cancel`.

Backend ownership is `backend/routers/jobs.py:29-31,64-93` and `backend/routers/export.py:72-121,159-311`.

### Current strengths

- One failed item is caught and does not abort later items (`AIPanel.tsx:1137-1143`).
- Successful outputs remain in the draft state with `exportPath` and `exportedAt`.
- Progress reports completed/total and can stop after the current clip (`AIPanel.tsx:1170-1173,1692-1752`).
- Output filenames use a sanitized title plus a draft-id suffix (`AIPanel.tsx:2924-2936`), reducing collisions.
- An Electron-only batch manifest records success/failure, timings, package, social pack, hook frame, export settings, and transcript (`AIPanel.tsx:2942-3007`).
- Export warnings include caption fallback and non-fatal audio enhancement failure (`backend/routers/export.py:180-185,266-293`).

### Reliability gaps

- Batch execution is a renderer loop, not a durable backend batch job. Closing the app loses the active loop and job references.
- The stop action does not cancel the current backend job; it stops before the next item.
- The manifest is optional and only written through the Electron bridge when a directory and bridge method are available.
- Batch destination is the panel directory or source directory, not a per-draft durable destination policy.
- A persisted `failed` draft does not restore the associated in-memory `ExportJob`; the creator can export again, but the explicit retry flow is not durable.
- The backend uses FFmpeg `-y`; re-exporting the same draft path overwrites the prior output after preflight only checks that it is not the source (`export.py:108-121,209-235`).
- There is no final batch summary that distinguishes skipped/ineligible items from attempted/failed items; the current message reports exported and failed results only.

The current design already has the important partial-success property. Phase 5 should harden it rather than replace it with a broad export architecture.

## 13. Persistence/recovery audit

### What is persisted

Desktop autosave snapshots include words, segments, deleted ranges, edit operations, global export options, clip suggestions, clip drafts, metadata, source, status, output path, output directory, errors, reframe, caption style, and related package fields (`useProjectAutosave.ts:163-193`). Autosave runs every five seconds when a video and transcript exist and rotates three snapshots (`useProjectAutosave.ts:150-161,515-594`). Manual project save uses `.scriptcut` and stores the same snapshot (`useKeyboardShortcuts.ts:153-181`).

The restore path loads editor state and AI workspace together (`App.tsx:283-300,890-893`). This means the intended desktop path can recover:

```text
find clips → close ScriptCut → reopen media/project → continue review or export
```

### Constraints and risks

- Browser mode explicitly reports autosave unavailable (`useProjectAutosave.ts:522-525`); browser project save is a download, not a reopenable local project workflow.
- Project version must equal `1`; unsupported versions throw, and no migration registry exists (`useProjectAutosave.ts:205-237`).
- Type normalization is permissive and does not repair discovery ranges or timestamps.
- `shared/project-schema.json` permits clip draft `source` values `ai` and `speaker-turn`, but runtime code also writes `transcript-selection` and `ai-director` (`shared/project-schema.json:154-159`; `TranscriptEditor.tsx:357`; `AIPanel.tsx:523`).
- The shared schema does not declare runtime status, export paths, errors, hook-frame fields, or thumbnail text even though runtime snapshots contain them (`shared/project-schema.json:142-160`; `types/project.ts:172-197`).
- `exporting` can be saved without its job, so reopening does not mean the operation is still running.
- Recent-project and autosave indexes are best-effort local-storage metadata; the project file is the source of truth.

### Compatibility requirement

Phase 5 must preserve version-1 projects and legacy `.aive` / `.cutscript` loading. Any future schema change needs an explicit migration or a backwards-compatible additive shape; do not silently make existing clip work unreadable.

## 14. Architecture ownership map

### AIPanel assessment

`frontend/src/components/AIPanel.tsx` is approximately **3,209 lines**. It owns:

- AI provider request construction;
- job creation, polling, cancellation, and retry;
- edit-plan/filler/clip actions;
- clip discovery and draft lifecycle;
- per-clip export and batch export;
- metadata packaging;
- social and hook-frame copy actions;
- readiness validation display;
- clip workspace stage rendering;
- `ClipSuggestionReviewCard`, `ClipDraftCard`, caption controls, reframe controls, background controls, status badges, and manifest formatting.

The file already imports focused utilities for clip drafts, workspace stages, social publishing, hook frames, captions, and playback. The issue is not simply missing helper extraction; it is that the renderer component still orchestrates multiple product domains and network protocols.

### Recommendation: targeted extraction

**Recommendation: B — extract only a `ClipWorkspace` component, with small adjacent orchestration hooks/utilities as needed.**

Do not continue growing all Phase 5 behavior in place, because discovery/review/prepare/export can be qualified more safely when their state and UI boundary is isolated. Do not perform broader architectural refactoring: the current stores, backend job manager, export service, and project snapshot are usable foundations, and a broad rewrite would threaten transcript editing, export, runtime, and release stability.

Likely boundary:

```text
AIPanel
  ├─ AI Editor / Filler tabs
  └─ ClipWorkspace
       ├─ discovery action and result normalization
       ├─ review queue
       ├─ preparation state
       ├─ export queue
       └─ clip-specific cards/utilities
```

The extraction is justified only if it preserves current store/API contracts and makes the five-suggestion, review, and export qualification tests easier to own.

## 15. Backend contracts

| API | Request / response | Sync/background | Failure behavior | Auth behavior |
| --- | --- | --- | --- | --- |
| `POST /jobs/transcribe` | `TranscribeRequest`; job id; result is `{words,segments,language,...}` | Background job | Job failed with error; renderer shows retry/cancel | Protected by local token when required. Electron injects `X-ScriptCut-Token` in `main.js:101-105`; source dev explicitly allows tokenless mode. |
| `POST /jobs/ai/create-clip` | `ClipRequest`; job id; raw `{clips: ...}` | Background job | Provider exception fails job; JSON parse failure becomes empty clips | Same local API token boundary; provider credentials are sent in request body from renderer. |
| `POST /jobs/ai/clip-metadata` | `ClipMetadataRequest`; job id; normalized-ish metadata object | Background job | Provider exception fails job; parse failure can become empty successful metadata | Same. |
| `POST /jobs/ai/edit-plan` | `EditPlanRequest`; job id; normalized edit plan/director clip | Background job | Provider exception fails job; parser validates more than clip discovery | Same. Used by the alternate AI Director path. |
| `GET /jobs/{job_id}` | job status, progress, logs, result/error | Polling | 404 if in-memory job is gone | Same. |
| `POST /jobs/{job_id}/cancel` | job id; status update | Cooperative cancellation | Queued jobs cancel immediately; running jobs become canceling until the task checks | Same. |
| `POST /jobs/{job_id}/retry` | job id; new job id | Background retry | Only failed/canceled jobs; job record is in-memory | Same. |
| `POST /jobs/export` | `ExportRequest`; job id; result output path, optional SRT, warnings | Background job | Preflight 400 through direct route; job failure for queued path | Same. |
| `GET /background/capabilities` | no body; capability map | Sync | Renderer treats unavailable response as unknown | Same. |
| `POST /captions` | caption words, deleted indices, format/style; text or saved path | Sync endpoint | 500 on generation/save errors | Same; not called by Create Clips export path. |
| `GET /file?path=...` | local media/output path; stream/range | Sync stream | 404/416 for invalid file/range | Same local token boundary; Electron transport injects token for backend-origin requests. |

The most underspecified contracts are normal clip discovery, metadata success with empty payload, and the relationship between stored word ranges and stored timestamps. No new API version should be created in 5A; normalize behind the existing job endpoint in the implementation phase.

## 16. Failure and degradation model

| Failure | Current creator-visible result | What remains possible | Phase 5 target |
| --- | --- | --- | --- |
| No local transcription engine | Setup/transcription error with retry or engine choices | No clip workflow until a transcript exists | Keep local setup recovery clear; do not make cloud transcription a hidden dependency. |
| Transcription job failure | Error state; retry uses the job manager | Existing media remains loaded/known | Preserve retry and explicit setup guidance. |
| Local AI/provider offline | AI error; no suggestions | Manual transcript Draft clip; speaker-turn drafts if labels exist | Surface manual fallback as a first-class “Choose moments yourself” path. |
| Malformed discovery JSON | Parse failure becomes empty suggestions; some malformed shapes are not safely validated | Manual clip creation | Return a typed shortfall/error result without crashing or accepting invalid items. |
| AI request times out/fails | Job failure and retry | Approved/manual drafts still work | Discovery failure must not block manual clip creation or export. |
| Metadata provider fails after approval | `lastError`; status remains draft | Individual/batch export can still pass deterministic validation | Show metadata as optional and retain exportability. |
| Metadata JSON parses to empty object | Draft can be marked packaged with empty fields | Export may still pass if title/range are valid | Treat empty metadata as a non-fatal metadata miss, not packaging success. |
| Burn-in captions unavailable | Export falls back to sidecar SRT with warning | Video and captions are still delivered | Make the final caption delivery explicit before export and in batch summary. |
| Background removal unavailable | Export is blocked only when explicitly enabled | Normal clip export remains possible | Keep optional capability out of the normal path and explain the blocker locally. |
| One clip export fails in batch | Item becomes failed; later items continue | Successful outputs remain; failed item can be exported/retried | Durable per-item result and a clear retry/resume summary. |
| App closes during batch | Renderer loop and in-memory job references disappear | Persisted drafts and completed paths remain | Reopen should classify each draft as exported, failed, or ready; no phantom exporting state. |
| Autosave unavailable/browser | Autosave status says unavailable | Manual project download and output download | Keep desktop as recommended recovery authority; do not imply browser reopen parity. |

## 17. Performance/scaling risks

No benchmark is needed to identify the current structural risks:

| Recording | Likely current behavior |
| --- | --- |
| 10 minutes | Whole transcript and word list fit the single provider request more often; latency is provider/model dependent. Frontend transcript rendering is virtualized. |
| 30 minutes | Prompt is materially larger because transcript text and indexed timestamp lines are both sent. Provider context and latency become a qualification concern. |
| 60 minutes | A single request may approach or exceed provider context limits depending on speech rate/model. There is no preflight warning or chunking. |
| 120 minutes | Whole-recording discovery is structurally unreliable: very large payload, high latency, context rejection, or attention dilution is likely. No fallback/segmentation contract exists. |

Other scaling facts:

- Transcript display uses `react-virtuoso` (`TranscriptEditor.tsx:724-731`), which is the right foundation for large word lists.
- Discovery serializes every word into both `transcript` and `word_list` (`AIPanel.tsx:590-600`; `ai_provider.py:399-417`).
- Metadata is one request per package action, not batched; a creator packaging five clips makes five provider requests.
- Batch video export is serial, which is predictable but slow for five re-encoded vertical clips.
- The local job manager defaults to at most two workers and eight active/pending jobs (`job_manager.py:13-20`).
- Jobs are retained in memory for at most six hours and are pruned by count/TTL; project persistence does not persist job execution state (`job_manager.py:199-222`).

Phase 5 should measure representative 10/30/60/120-minute fixtures before choosing chunking. Do not add chunking or semantic infrastructure from this audit alone.

## 18. Target creator journey

The Phase 5 target is:

```text
Create Clips
  ↓
Choose recording
  ↓
Transcribing…
  ↓
Finding your best moments…
  ↓
5 suggestions ready

[Clip 1]  why it works · duration · Preview · Approve / Skip
[Clip 2]  why it works · duration · Preview · Approve / Skip
[Clip 3]  why it works · duration · Preview · Approve / Skip
[Clip 4]  why it works · duration · Preview · Approve / Skip
[Clip 5]  why it works · duration · Preview · Approve / Skip

Approve desired clips
  ↓
Prepare clips
  ScriptCut prepares safe framing, captions, and publishing copy
  ↓
Review final clips
  ↓
Export All
  ↓
3 clips exported successfully; 1 needs retry; 1 skipped
```

The normal path must not require understanding provider URLs, word indices, reframe coordinates, job IDs, FFmpeg, or metadata schemas. Those remain available in setup/diagnostic/detail surfaces.

The AI-independent path must remain visible:

```text
Choose moments yourself
  → select transcript words
  → Draft clip
  → adjust / preview / export
```

## 19. Phase 5 acceptance criteria

These are engineering acceptance criteria, not new analytics infrastructure.

### Discovery and review

- With a transcript fixture containing at least five valid candidate moments, normal discovery returns exactly five normalized suggestions.
- Every returned suggestion has a stable id, unique rank, valid word endpoints, derived timestamps, positive duration, title, and creator-useful reason.
- No suggestion is outside the selected duration policy.
- Exact duplicates are removed; overlap greater than the agreed threshold is bounded in rank order.
- A provider response with malformed JSON, malformed items, invalid indices, or invalid timestamps cannot crash the workspace or create an unexportable phantom draft.
- A provider shortfall is explicit and does not fabricate a fifth clip.
- Every suggestion has a bounded one-click preview that stops at the suggestion’s end.
- The creator can approve or skip quickly; skipped suggestions do not silently become lost if the product contract requires recovery.

### AI optionality and preparation

- Manual Draft clip creation works with no AI provider configured.
- Speaker-turn drafts remain available when speaker labels exist and do not create unbounded multi-minute drafts without a clear warning/policy.
- Approved clips remain exportable if metadata generation fails.
- Empty metadata does not claim successful packaging.
- The UI distinguishes spoken hook, visual hook frame, generated hook copy, title, description, social caption, and hashtags.
- Default framing and caption settings are safe for the target format, and the preview communicates any remaining parity limitation.

### Export and recovery

- Individual export validates the authoritative normalized range and preserves transcript cuts/deleted caption words.
- Export All processes eligible clips independently; one failure does not abort successful outputs.
- Batch summary distinguishes exported, failed, skipped/ineligible, and not-attempted items.
- Successful outputs remain preserved when another item fails.
- A failed item can be retried after the app is reopened, or the UI clearly provides a new export action with the same effect.
- Reopening a project preserves clip suggestions, draft decisions, metadata, framing, caption choices, statuses, and successful output paths.
- Existing v1 projects and legacy extensions continue to load.

### Product qualification

- A real 10–30-minute spoken-content fixture can complete discovery → review → approval → preparation → individual export.
- A five-clip fixture can complete Export All with at least one injected failure and demonstrate partial success/retry.
- A vertical clip is inspected for crop, captions, timing, deleted words, safe area, output naming, and final media playback.
- Local-AI-unavailable qualification confirms the manual path can still create and export a clip.

## 20. Prioritized gap matrix

| ID | Priority | Area | Current behavior | Target behavior | Root cause | Risk | Recommended phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P5A-01 | P0 | Discovery count | Prompt requests 1–3; no five-item contract. | Five valid suggestions when five candidates exist; explicit shortfall otherwise. | Provider prompt is the contract. | North-star journey cannot be promised. | 5B.1 |
| P5A-02 | P0 | Discovery boundary | Raw indices/timestamps and malformed shapes can enter the draft queue. | Backend normalizes/rejects and derives times from transcript words. | No discovery response schema/validator. | Bad clips, caption/export mismatch, creator trust loss. | 5B.1 |
| P5A-03 | P0 | Preview | Preview seeks/plays from start with no end bound. | Preview is bounded to the candidate range and respects edited playback. | `requestSeek` path clears `previewRangeEnd`. | Review decisions are made on the wrong media span. | 5B.2 |
| P5A-04 | P1 | Duration policy | Discovery says 30–90; readiness says 12–60; manual export allows 0.25+. | One documented policy per platform and one authoritative validator. | Contract split across prompt/UI/readiness. | Too short/long clips and confusing readiness. | 5B.1 |
| P5A-05 | P1 | Diversity | Only exact range duplicates are removed. | Range-overlap bound and explicit shortfall. | No ranked diversity pass. | Five cards may be the same story. | 5B.1 |
| P5A-06 | P1 | Review decisions | Remove deletes the item; no Skip/Rejected persistence. | Approve/Skip decisions are recoverable and auditable if product evidence supports it. | Lifecycle has no decision record. | Lost work and no recovery. | 5B.2 |
| P5A-07 | P1 | Packaging semantics | AI metadata only, but packaged status/readiness implies broader preparation. | Approval, media preparation, and optional metadata are distinct. | Implementation state leaks into UX. | AI failure blocks perceived readiness unnecessarily. | 5B.3 |
| P5A-08 | P1 | Metadata failure | Empty parsed metadata can still set `packaged`. | Empty metadata is a non-fatal miss; clip remains exportable and clearly labeled. | Parser returns success-shaped empty data. | False readiness and confusing package state. | 5B.3 |
| P5A-09 | P1 | Framing parity | Preview is an overlay guide; export applies actual crop; no tracking. | Preview uses the same crop model as export; safe center fallback is explicit. | Global preview does not render clip export. | Subject/caption placement surprises. | 5B.4 |
| P5A-10 | P1 | Caption parity | Burn-in can fall back to SRT; preview does not show final captions. | Caption delivery and fallback are visible before/after export; timing is qualified. | Export-time ASS/SRT decision is backend-only. | Publishable output may not match expectation. | 5B.4 |
| P5A-11 | P1 | Batch recovery | Renderer loop is serial; job references are in-memory; summary omits skipped/not-attempted. | Durable per-item outcome and reopen-safe retry/new-export path. | No batch state contract. | Long batch work is hard to recover. | 5B.5 |
| P5A-12 | P1 | Project schema | Version 1 only; shared schema lags actual runtime clip fields. | Additive compatible contract plus explicit future migration. | Runtime and schema evolved separately. | Clip work may be misread or rejected later. | 5B.6 |
| P5A-13 | P1 | AIPanel ownership | Approximately 3,209 lines spanning five domains. | Targeted ClipWorkspace extraction. | Feature growth accumulated in one component. | Phase 5 changes become hard to qualify safely. | 5B.2 |
| P5A-14 | P1 | Long recordings | Whole transcript and word list sent in one provider request. | Preflight/qualification and later evidence-based scaling strategy. | No context budget/chunking contract. | 60–120 minute discovery failures. | 5B.1 then 5B.6 |
| P5A-15 | P2 | Discovery explanation | Reason is free text only. | Reason names the moment’s creator-useful evidence. | No reason shape/taxonomy. | Suggestions feel decorative. | 5B.1 |
| P5A-16 | P2 | Rank/quality | Array order is implicit rank; no score. | Stable rank; numeric dimensions only after evidence. | No product-quality evaluation contract. | False precision or unstable ordering. | 5B.1 / qualification |
| P5A-17 | P2 | Platform fit | Shorts discovery plus copy packs for three platforms. | One discovery contract with platform-specific output rules after core proof. | Platform and draft concepts are mixed. | Scope expands before core workflow is reliable. | 5B.3 |
| P5A-18 | P2 | Hook frames | Four deterministic time offsets and copy briefs; no image extraction. | Clear visual-hook brief or verified frame output. | Hook frame utility is presentation-only. | “Hook frame” may overpromise an asset. | 5B.4 |
| P5A-19 | P3 | General export duplication | Generic ExportDialog and clip export both call `/jobs/export` with overlapping policy. | Shared contract/helper only when behavior is stable. | Two renderer callers evolved independently. | Fixes can diverge. | Later cleanup, not a 5B blocker |

## 21. Proposed 5B implementation sequence

The following order keeps the smallest coherent vertical slices and preserves the current backend/job/export foundations.

### 5B.1 Discovery Contract & Quality

**Objective:** make discovery return a normalized, ranked, bounded, diverse queue with a normal target of five.

**Likely files:** `backend/services/ai_provider.py`, `backend/routers/ai.py`, `frontend/src/types/project.ts`, `frontend/src/utils/clipDrafts.ts`, `frontend/src/utils/clipWorkspace.ts`, `frontend/src/components/AIPanel.tsx`, `shared/project-schema.json`, backend/frontend deterministic smoke fixtures.

**Dependencies:** agree duration policy, normalization rejection policy, overlap threshold, stable id strategy, and shortfall semantics.

**Tests:** backend malformed JSON/item/index/time tests; derived-time tests; duration and overlap tests; five-result/shortfall tests; frontend draft conversion and persistence tests.

**Manual qualification:** YES — 10-, 30-, and representative long-form spoken fixtures; inspect boundaries, reasons, rank, and variety.

**Explicit non-goals:** no embeddings, vector database, semantic search service, new API version, prompt redesign beyond the minimum contract, or numeric creator-facing score.

### 5B.2 Review Workspace

**Objective:** isolate clip workflow ownership and make a five-card queue fast to scan, preview, approve, skip, and trim.

**Likely files:** extract `ClipWorkspace` from `AIPanel.tsx`; `frontend/src/utils/clipWorkspace.ts`; `frontend/src/components/VideoPlayer.tsx`; `frontend/src/store/editorStore.ts`; `frontend/src/types/project.ts`; workspace smoke tests.

**Dependencies:** 5B.1 normalized suggestion shape; decide whether Skip is persisted or intentionally destructive.

**Tests:** bounded preview start/end; edited playback; keyboard/mouse review; stage recovery; manual Draft clip regression; suggestion-to-draft parity.

**Manual qualification:** YES — scan five cards, preview each once, approve/skip mixed queue, adjust one boundary, leave/reopen.

**Explicit non-goals:** no broad store rewrite, no full timeline/NLE work, no AIPanel cleanup unrelated to the clip boundary.

### 5B.3 Clip Preparation / Metadata Resilience

**Objective:** make an approved clip exportable without AI metadata and make optional metadata failures honest and recoverable.

**Likely files:** `AIPanel.tsx`/extracted workspace, `frontend/src/utils/clipDrafts.ts`, `backend/services/ai_provider.py`, `backend/routers/ai.py`, `frontend/src/types/project.ts`, project schema.

**Dependencies:** stable approval state from 5B.2; deterministic export validator.

**Tests:** provider unavailable after approval; malformed/empty metadata; manual title/copy path; export eligibility without packaging; metadata retry; state persistence.

**Manual qualification:** YES — approve, skip packaging or induce provider failure, export video, then add/copy metadata separately.

**Explicit non-goals:** no social platform API publishing, no automatic cloud upload, no new metadata provider architecture.

### 5B.4 Framing + Caption Publishability

**Objective:** make the default vertical output safe and make preview communicate the actual crop/caption behavior.

**Likely files:** `frontend/src/components/VideoPlayer.tsx`, extracted clip workspace, `frontend/src/utils/clipDrafts.ts`, `backend/services/video_editor.py`, `backend/services/caption_generator.py`, `backend/routers/export.py`, existing caption/reframe smoke fixtures.

**Dependencies:** authoritative clip boundaries; agreed safe-area/default policy; available FFmpeg capability reporting.

**Tests:** center crop and manual x/y; preview/export geometry; deleted/caption-only words; 3/5/8 words per line; burn-in and sidecar fallback; output media inspection.

**Manual qualification:** YES — single speaker and multi-speaker vertical clips, caption safe area, fallback output, final playback.

**Explicit non-goals:** no automatic face/person tracking, no caption-engine redesign, no background-removal expansion.

### 5B.5 Export All Reliability

**Objective:** make batch export boringly reliable with explicit per-item outcomes, preserved successes, and reopen-safe retry/new-export behavior.

**Likely files:** extracted clip workspace, `frontend/src/components/AIPanel.tsx` only where needed, `frontend/src/hooks/useProjectAutosave.ts`, `frontend/src/types/project.ts`, `backend/routers/jobs.py` only if an evidence-backed job contract requires it, manifest helpers.

**Dependencies:** deterministic export eligibility and preparation state from 5B.3/5B.4.

**Tests:** one failed item among successful items; cancellation between items; cancellation during item; duplicate-safe filenames; manifest counts; restart/reopen; failed item export again.

**Manual qualification:** YES — five-clip batch with injected failure and a real output-folder inspection.

**Explicit non-goals:** no parallel export by default, no cloud queue, no release/package changes.

### 5B.6 End-to-End Creator Qualification

**Objective:** prove the north-star path and compatibility boundary on real fixtures.

**Likely files:** qualification scripts/fixtures and documentation only unless a prior slice exposes a scoped defect; `docs/` evidence may be added in that phase, not in 5A.

**Dependencies:** 5B.1–5B.5 and current release/runtime gates.

**Tests:** deterministic unit/smoke suite plus full creator matrix: local AI available/unavailable, 10/30/60-minute recordings, diarized/interview content, deleted ranges, caption fallback, partial batch failure, project reopen.

**Manual qualification:** YES — mandatory. Source tests cannot prove creator-facing crop, caption, preview, and output quality.

**Explicit non-goals:** no native release candidate, public dry-run, tag, publication, social API publishing, or unrelated feature expansion.

## 22. Preserve working features and release boundaries

Phase 5 must preserve:

- transcript editing and playback-cut behavior (`TranscriptEditor`, `editorStore`, `playback.ts`);
- manual Draft Clip from transcript selection;
- speaker labels, speaker selection, speaker-turn drafts, and existing project compatibility;
- local-first transcription, local export, and optional AI provider behavior;
- secure packaged backend token transport and provider URL validation (`electron/main.js:101-105`; `backend/main.py:48-58`; `backend/network_security.py:10-34`);
- current export validation, FFmpeg/SRT fallback, and per-item failure isolation;
- desktop autosave/recovery and legacy project extensions;
- current public release system and its exact six-asset public release contract, as documented in `docs/RELEASE.md:148-196`;
- self-contained runtime expectations and release qualification boundaries.

No Phase 5 implementation should mutate Stripe/cloud services, publish media, change the release system, add dependencies, or require a new runtime/packaging path.

## 23. Explicit non-goals

Phase 5 remains limited to:

```text
long-form spoken content
  → strong clips
  → publishable local outputs
```

Do not propose or implement in Phase 5:

- social platform API publishing;
- cloud collaboration or shared projects;
- mobile app;
- stock media;
- generative video;
- AI avatars;
- B-roll generation;
- plugin marketplace;
- MCP or agent API;
- full timeline/NLE replacement;
- automatic cloud upload;
- blockchain features;
- bundle optimization;
- automatic face/person tracking in 5A;
- caption-engine redesign in 5A;
- new API version in 5A;
- broad AIPanel refactor for cleanliness alone.

## 24. Open questions requiring real product evidence

1. What single duration policy should govern Shorts discovery, manual drafts, readiness, and export: the current 30–90 prompt range, the 12–60 readiness range, or a revised platform policy?
2. What minimum boundary quality does the product accept for sentence starts, sentence endings, leading filler, and intentional pauses across Whisper/WhisperX/Parakeet outputs?
3. Should a skipped suggestion be restorable and persisted, or is removal intentionally the product decision?
4. Is five the required queue size even when only three high-quality candidates survive normalization, or should the UI communicate a smaller trustworthy queue?
5. Does rank plus reason outperform numeric score dimensions in creator review? This needs a small labeled fixture, not assumption.
6. What overlap threshold feels like useful diversity without suppressing a valid multi-part story?
7. Should normal discovery use speaker labels as a deterministic boundary constraint for interview material?
8. Should metadata generation run automatically after approval, be a separate explicit action, or be framed as optional publishing copy preparation?
9. What is the minimum accepted preview parity for Phase 5: actual crop only, crop plus captions, or a rendered low-resolution clip preview?
10. When burn-in is unavailable, is sidecar SRT an acceptable publishable fallback for the target users, or should the default change to a capability-aware caption choice before export?
11. Should Export All remain serial for predictability, or is measured parallelism required for five clips on supported hardware?
12. What durable batch outcome and retry semantics are required after app restart?
13. Which project schema fields are public compatibility contract versus runtime-only convenience fields, and what version/migration policy should govern additions?
14. What long-recording context budget and latency are acceptable before discovery must become staged/chunked?
15. Which real creator fixtures represent the release-critical baseline: solo talking head, podcast, interview, multi-speaker, long pause, deleted filler, caption fallback, and off-center subject?

## 25. Audit conclusion

The repository does not need a new product category or a broad rewrite. It needs an authoritative discovery contract, deterministic boundary normalization, bounded review, honest packaging semantics, export-parity qualification, and durable batch/recovery behavior. The existing manual path and local export path are valuable assets and should remain first-class throughout Phase 5.

The implementation sequence above is intentionally incremental. Each slice can be tested against the current stores and job endpoints while preserving transcript editing, project compatibility, local-first behavior, secure backend transport, and the established release system.
