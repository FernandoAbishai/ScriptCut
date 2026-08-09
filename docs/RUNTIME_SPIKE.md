# ScriptCut Runtime Spike

Status: research / architecture spike only. This document records the current runtime boundary, disposable experiments, and a proposed Phase 3B path. It does not implement the proposed runtime.

Research date: 2026-08-08. Repository base inspected: `main` at `b6460b28c5ffd11254445659ce56461e93043ed0`.

## Executive Decision

ScriptCut should move to a self-contained, arm64-first **portable CPython runtime with curated, lazy capability packs**. The Electron app should launch a pinned Python 3.11 runtime shipped inside the application, with core Python packages and required native extensions embedded in the signed/notarized app. Feature-specific code can be physically included and imported lazily; model files are signed, revisioned application data delivered outside the app bundle. The backend remains a local FastAPI worker behind the existing loopback/token boundary.

The runtime choice and the capability-pack policy are intentionally separate decisions:

- **Primary: portable CPython.** It preserves the current Python backend and ML ecosystem, has a small tested interpreter baseline, supports a normal Python process and native libraries, and avoids requiring a creator to install Python.
- **Fallback: PyInstaller one-folder worker.** Use it if shipping a portable interpreter plus site-packages cannot meet the signing or deployment gate. Prefer one-folder over one-file because it is inspectable, debuggable, faster to start, and easier to sign as a collection of native files.
- **Not now: Nuitka, managed-runtime downloads, and a native rewrite.** Nuitka has not yet demonstrated a successful standalone FastAPI probe here; a managed runtime would make first launch network- and cache-dependent rather than self-contained; a native rewrite would replace a working Python/ML seam before the packaging problem is understood.

This is not a recommendation to ship every current dependency. The first self-contained release should ship only the smallest supported creator path and make advanced transcription, diarization, audio cleanup, background removal, and external AI separate capability packs. Optional Python code selected for that first release must still be embedded and signed; downloadable native code is future work. The current `auto` selection order remains a product contract to preserve or intentionally revise in Phase 3B; this spike does not change it.

## North Star and Definitions

The creator promise is: download ScriptCut, launch it, select local media, transcribe, edit, and export without installing system Python or manually repairing a virtual environment.

Definitions used here:

- **Runtime:** the Python interpreter and native support files required to start the local backend.
- **Core pack:** the pinned Python packages required for the supported default workflow.
- **Capability pack:** an independently versioned group of Python packages, native libraries, and metadata for an optional feature or transcription engine.
- **Model pack:** versioned model weights and tokenizer/alignment data, delivered separately from code and stored in an application-managed cache.
- **Self-contained:** the released application does not depend on a creator-provided Python executable, virtualenv, pip install, or system package manager for its supported path. It may still use the bundled FFmpeg and the operating system’s normal graphics/audio facilities.
- **Supported platform:** a separately built and tested OS/architecture artifact. A macOS arm64 build is not evidence for macOS x64, Windows, or Linux.

## Current Architecture

The current desktop path is:

```text
Electron main process
  -> PythonBackend.start()
  -> resolvePythonRuntime()
  -> <creator/local Python> -m uvicorn main:app --host 127.0.0.1 --port 8642
  -> FastAPI main.py
  -> eagerly imported routers and services
  -> local media / FFmpeg / ML engines / optional providers
```

Evidence in the repository:

- `electron/main.js:109-117` creates `PythonBackend`, waits for startup, then creates the window.
- `electron/python-bridge.js:33-52` chooses a development or packaged backend directory, resolves Python, spawns Uvicorn, passes a random `SCRIPTCUT_API_TOKEN`, and injects the bundled-tool environment.
- `electron/python-bridge.js:117-139` polls `/health` on loopback before declaring the backend ready.
- `electron/python-runtime.js:73-163` accepts Python 3.10 through 3.12, searches repository virtualenvs and common commands, and emits an install/repair error when no compatible runtime exists. It has no packaged-runtime candidate.
- `electron/run-backend.js` uses the same runtime resolver for source development.
- `backend/main.py:12-13` imports every router before constructing the application; `backend/main.py:53-60` includes every router in one process.
- `backend/main.py:40-50` protects non-health routes with the local session token. `electron/main.js:99-105` adds that token only to requests targeting the loopback backend origin.
- `electron/main.js:72-78` keeps context isolation, disables Node integration, enables sandboxing, and restricts web security in the renderer.

The browser path is different: Vite serves the React UI, selected media is uploaded to the local backend, and finished results are downloaded. It is not a substitute for the Electron-native file and project path.

### Startup seam

The seam to preserve in Phase 3B is a small launcher contract:

```text
resolve packaged runtime and pack manifest
  -> spawn one authenticated local worker
  -> wait for /health
  -> expose startup diagnostics without exposing raw paths by default
  -> stop the worker on application quit
```

The packaged worker must receive an explicit runtime root, backend root, pack roots, model cache root, and FFmpeg path. It must not search the creator’s PATH for Python in a release build. Source development may retain the current resolver for Python 3.10-3.12.

## Current Packaged Layout

`package.json:39-49` currently places Electron files, frontend output, and shared files in the application package. Its `extraResources` entries copy `backend` to `Resources/backend` and `build/bin` to `Resources/bin`; there is no Python runtime, virtualenv, site-packages directory, pack manifest, or model payload in the configuration.

The inspected arm64 artifacts show the consequence:

| Artifact | Observed size / content | Interpretation |
| --- | ---: | --- |
| `dist/mac-arm64/ScriptCut.app` | ~319 MB | Electron application bundle; regenerated directory artifact on this branch |
| `dist/mac-arm64/ScriptCut.app/Contents/Resources/app.asar` | ~602 KB | Electron app code/assets, excluding `extraResources` |
| `Contents/Resources/backend` | ~548 KB, 27 files | Python source, requirements, and backend smoke script; no interpreter or installed packages |
| `Contents/Resources/bin` | ~42 MB | arm64 FFmpeg/FFprobe bundle and its dynamic libraries |
| existing `dist/ScriptCut-0.1.0-arm64.dmg` | ~130 MB | Existing DMG baseline; a fresh DMG was not required for the directory-layout measurement |
| `Contents/Resources/python` | absent | No packaged Python runtime |
| `Contents/Resources/site-packages` | absent | No packaged Python dependency set |

`electron/python-bridge.js:33-36` does point packaged mode at `process.resourcesPath/backend`, but `electron/python-runtime.js` still resolves an external Python executable. The current release documents this accurately: README, `docs/INSTALL.md`, `docs/PLATFORM_SUPPORT.md`, and `docs/RELEASE.md` all say the alpha requires compatible local Python 3.10-3.12.

## Runtime Seam

### Proposed contract

Phase 3B should make the runtime seam explicit without changing feature behavior:

1. Electron reads a signed `runtime-manifest.json` from its resources.
2. The manifest identifies the target OS/architecture, Python build, core-pack lock, capability-pack revisions, and SHA-256 values.
3. Electron resolves the packaged interpreter first and refuses to fall back to system Python in a release build.
4. Electron starts the worker with a sanitized environment and explicit roots.
5. The worker reports runtime, pack, model-cache, FFmpeg, and device capability status through the existing authenticated diagnostics boundary.
6. The UI treats unavailable optional packs as optional capabilities; the core startup path fails clearly only when a required core component is missing.

### Non-goals for this spike

No production launcher, dependency lock, lazy-import refactor, installer change, model downloader, signing change, or schema change is part of this Phase 3A document.

## Dependency Matrix

| Area | Current dependency / source | Import or load behavior | Packaging implication | Proposed pack |
| --- | --- | --- | --- | --- |
| API core | FastAPI, Uvicorn, Pydantic, multipart | Imported at backend startup | Small, required for health and API | Core |
| Media/export | MoviePy, `ffmpeg-python`, SoundFile, NumPy, bundled FFmpeg | MoviePy and NumPy are reachable from eager imports; FFmpeg is resolved at operation time | Native wheels plus FFmpeg must be architecture-specific | Core media |
| Default transcription | Parakeet TDT v3 through optional NeMo | Selected first by `auto` when available; model is `nvidia/parakeet-tdt-0.6b-v3` | NeMo is a large, NVIDIA-oriented dependency tree and needs a separate verified arm64 story | Optional Parakeet |
| Word-level transcription | WhisperX plus faster-whisper/alignment stack | WhisperX is attempted at `services/transcription.py` import; models/alignment load on demand | Hidden imports, native extensions, alignment models, and model licensing need a manifest | Optional WhisperX |
| Baseline transcription | OpenAI Whisper | Attempted at import; model loads on first transcription | Simplest engine candidate, but Torch is large and the project synthesizes word timing in fallback behavior | Core or fallback transcription |
| Speaker diarization | `pyannote.audio`, Hugging Face pipeline | Torch imports eagerly; pyannote pipeline loads inside a function and needs an HF token/model | Keep outside core; token and model agreement are explicit | Optional diarization |
| Audio cleanup | DeepFilterNet (`df.enhance`) with FFmpeg fallback | Package is attempted at import; model initializes on use | Native/model payload and fallback behavior must be visible | Optional Studio Sound |
| Background removal | MediaPipe, OpenCV, NumPy | Imports are attempted at module import; processing is frame-by-frame on use | Large native wheels and platform support need isolation | Optional background |
| AI helpers | `requests` for Ollama and 9router; lazy `openai.OpenAI` and `anthropic` imports for OpenAI and Claude | `backend/services/ai_provider.py:9,119-157,189-242` imports the SDKs only when those providers are used; Ollama and 9router use `requests` today | SDKs are runtime dependencies for their configured providers, but not backend-startup dependencies; keep them in small provider-specific optional code packs or include them in the core Python set if that is simpler to maintain | Optional AI |
| GPU | Torch CUDA/MPS/CPU selection | Torch imports eagerly; MPS is selected when available | Torch wheels and accelerator behavior are platform-specific | Transcription/media pack |
| FFmpeg | Bundled by `build/bin` in release | Resolved by environment at operation time | Already a separate native resource; retain architecture manifest and license notices | Core media |
| Models/cache | Whisper, Hugging Face, NeMo, pyannote assets | Downloaded or loaded lazily; cache is outside the app today | Never treat a developer cache as a distributable artifact | Model packs |

The current `backend/requirements.txt` uses lower bounds rather than a reproducible lock. It includes FastAPI/Uvicorn, WhisperX, faster-whisper, OpenAI Whisper, MoviePy, Torch, torchaudio, pyannote, OpenAI, Anthropic, DeepFilterNet, MediaPipe, OpenCV, and support libraries. A self-contained release must produce per-platform lockfiles with hashes and a complete third-party notice set.

The AI provider inventory is deliberately not normalized into one transport: Ollama and 9router continue to use `requests` today; OpenAI is a lazy import of `openai.OpenAI`; Claude is a lazy import of `anthropic`. `openai` and `anthropic` therefore do not block backend startup, but they are runtime dependencies when their respective providers are configured. Phase 3B may place them in small provider-specific optional code packs or include them in the core Python package set if the size and maintenance tradeoff makes that simpler. There is no need to rewrite the existing OpenAI or Claude providers to raw HTTP merely for packaging.

## Eager Import Findings

The current `/health` process is not a lightweight health worker:

- `backend/main.py` eagerly imports all routers.
- `routers/jobs.py` imports export, transcription, and AI router paths, widening the startup graph.
- `services/transcription.py:7-31` imports Torch and attempts WhisperX, Whisper, and NeMo imports at module import.
- `services/diarization.py:11-13` imports Torch and GPU helpers before the pyannote pipeline is requested.
- `utils/audio_processing.py` imports MoviePy at module import.
- `utils/gpu_utils.py` imports Torch at module import.
- `services/background_removal.py` attempts MediaPipe and OpenCV imports at module import.
- `services/audio_cleaner.py` attempts the DeepFilterNet import at module import, although its model is initialized only when used.

Measured on the local arm64 machine with the repository’s `.venv311`:

- `python -c 'import main'`: 2.6–4.4 seconds across three runs.
- Uvicorn `/health`: reached `200` in approximately 2.1 seconds using the current 1-second initial wait and 500 ms polling cadence. This is an operational observation, not a high-resolution benchmark.
- The active environment did not contain distributions for WhisperX, faster-whisper, NeMo, pyannote.audio, MediaPipe, or OpenCV, so the measurement represents a partial fallback environment, not a complete production ML environment.

Phase 3B should make `/health` independent of optional engine imports. The minimum safe shape is a core API module plus route registration that loads each optional service only when its capability endpoint or job is invoked. This should be done with smoke tests proving that missing optional packs do not prevent app launch and that a selected pack still reports a precise, recoverable error.

## Current Size Baseline

Measured on macOS 15.7.7 arm64 on 2026-08-08:

| Item | Size / version | Notes |
| --- | ---: | --- |
| Host default Python | 3.14.6 | Unsupported by current runtime resolver and transcription policy |
| Supported interpreter examples | 3.10.0, 3.11.12, 3.12.11 | All arm64 on this machine |
| Repository `.venv311` | ~1.5 GB | Full installed environment; `site-packages` accounts for nearly all of it |
| Repository `.venv` | ~12 MB | Python 3.13.5 environment without the full backend stack; not a supported release runtime |
| Portable CPython archive | 26 MB | `python-build-standalone` 3.11.15 arm64 install-only stripped archive |
| Portable CPython unpacked | 71 MB | Interpreter plus standard library before web packages |
| Portable CPython + FastAPI/Uvicorn | 97 MB | Minimal health-service proof, not the ML pack |
| Torch package directory | ~441 MB | Local `.venv311` package directory; transitive environment is larger |
| NumPy package directory | ~60 MB | Local `.venv311` |
| OpenAI Whisper package directory | ~2.1 MB | Weights are separate from the package |
| Hugging Face cache | ~8.1 GB | Shared user cache, not all attributable to ScriptCut |
| Whisper cache | ~1.6 GB | Observed `base.pt` ~139 MB and `medium.pt` ~1.4 GB |

The size conclusion is clear: the interpreter is not the dominant cost once ML dependencies and models are included. A single monolithic environment would make every creator download the largest optional feature, while separate code/model packs let the installer ship the supported path and add cost only when a capability is selected.

## Model / Cache Baseline

Current code names or references these model families:

- OpenAI Whisper names `tiny`, `base`, `small`, `medium`, and `large`.
- Parakeet defaults to `nvidia/parakeet-tdt-0.6b-v3`.
- WhisperX uses a Whisper model plus language-specific alignment assets and can use pyannote VAD/diarization.
- Diarization currently requests `pyannote/speaker-diarization-3.0` with an HF token.
- faster-whisper downloads converted models from the Hugging Face Hub when a model size is used.

The current application relies on user-level caches such as `~/.cache/huggingface/hub` and `~/.cache/whisper`. That is useful for development but is not a release delivery policy. Phase 3B model policy should be explicit:

- Models are mutable/versioned application-managed data, not Python runtime.
- Models live outside the signed `.app`, under an app-owned path such as `Application Support/ScriptCut/models/<pack>/<revision>`.
- ScriptCut owns download, progress, resume, hash verification, rollback, and deletion; creators do not manually download from Hugging Face as a supported setup step.
- A baseline model may be downloaded on first use unless the selected Phase 3B engine/model proves small, redistributable, and valuable enough to bundle.
- Use immutable revision directories and a signed manifest containing file hashes, byte sizes, model terms, source URL, and required engine/capability.
- Download atomically with free-space checks, cancellation, and cleanup of unreferenced revisions.
- Make offline/local model selection explicit and report missing models as a recoverable capability state.
- Keep HF tokens and provider credentials out of model manifests and logs.
- Never silently use an unrelated global cache as proof that a release is self-contained.

Runtime self-contained does not necessarily mean every model weight ships inside the DMG. Downloading a model must not create a dependency on system Python, pip, or a creator-managed virtualenv. The core installer should not include all model families. The first supported transcription path needs one end-to-end arm64 acceptance result; additional engines and alignment/diarization assets should be optional model/data downloads until their size, license, and startup behavior are verified.

## Candidate A — Portable CPython

### Shape

Ship a pinned `python-build-standalone` CPython build inside Electron resources, then install a reproducible, platform-specific set of wheels into its `site-packages`. Start the existing backend with that interpreter. Keep native packages and model files in separately described packs even when the first installer physically embeds the core pack.

### Evidence

The official project describes its output as standalone, highly redistributable Python builds. The arm64 probe downloaded `cpython-3.11.15+20260807-aarch64-apple-darwin-install_only_stripped.tar.gz`:

- archive: ~26 MB;
- unpacked interpreter: ~71 MB;
- with FastAPI/Uvicorn installed: ~97 MB;
- `/tmp` health service ran successfully without using the host Python;
- loopback readiness was ~272 ms with 100 ms polling.

### Strengths

It preserves Python compatibility, lets Phase 3B keep the existing backend seam, supports normal filesystem paths and subprocesses, and makes the system Python policy simple. It also makes one runtime artifact usable by multiple capability packs, with a clear place for architecture-specific native wheels.

### Risks and blockers

The full ML environment is much larger than the interpreter. Every native wheel, dynamic library, and model must be tested and signed for each target. The release needs a license/notice inventory for CPython, wheels, FFmpeg, models, and any transitive native code. `python-build-standalone` itself is a distribution component, not a guarantee that every Python package is relocatable.

### Assessment

Best fit for the current repository and the least disruptive path to a genuinely self-contained app. Recommended primary, subject to a clean arm64 pack build and signing gate.

## Candidate B — PyInstaller

### Shape

Freeze a dedicated backend entry point into an arm64 one-folder executable and place it in Electron `extraResources`. The backend would no longer require a separate Python executable at runtime.

### Evidence

The disposable FastAPI service built successfully with PyInstaller 6.22.0 on arm64:

- one-folder output: ~29 MB, readiness ~0.6 s;
- one-file output: ~14 MB, readiness ~6.5 s in repeated probes because the bundle extracts before startup;
- both served `/health` successfully.

PyInstaller’s own documentation says its output includes the active interpreter, is OS/Python-version specific, and may need hooks for dynamic imports and data files. It recommends validating one-folder mode before one-file mode. That maps directly to ScriptCut’s current optional-import and model-data risks.

### Strengths

It gives a direct executable contract, a compact minimal proof, and a familiar one-folder debugging story. It can be a practical fallback if a dedicated worker entry point and a carefully maintained hook/spec set are created.

### Risks and blockers

The minimal probe does not represent Torch, WhisperX, NeMo, MediaPipe, or FFmpeg. ScriptCut has dynamic/optional imports and package data, so a successful toy bundle is not evidence that the full worker freezes correctly. One-file extraction adds startup and temporary-file behavior, and both variants still need deep native-library signing and license review.

### Assessment

Strong fallback. Choose one-folder, not one-file, unless a later measurement proves the creator-facing startup and recovery tradeoff acceptable.

## Candidate C — Nuitka

### Shape

Compile a backend entry point into a standalone directory or one-file executable, including Python, extension modules, and package data.

### Evidence

Nuitka 4.1.3 was installed in the disposable environment. A standalone FastAPI probe was started with Apple clang and `--assume-yes-for-downloads`; it did not yield a usable executable or non-empty distribution in the experiment directory, and the log stopped after compilation began. This is a failed/blocked probe, not a performance result.

The official manual confirms that standalone mode follows imports, requires explicit data inclusion for package files, and that one-file mode extracts to a temporary directory before running.

### Strengths

Potentially useful for a stable worker with a well-understood import graph and possibly smaller or harder-to-inspect code output.

### Risks and blockers

Compile time, native extension support, package-data rules, dynamic imports, and code-signing/debugging are all open. The first probe did not reach a successful artifact, so there is no evidence here that it reduces ScriptCut’s risk or size.

### Assessment

Not now. Revisit only after the portable-CPython and PyInstaller paths have a real full-pack baseline and a measured reason to compile.

## Candidate D — Managed Runtime

### Shape

Ship a small Electron app that downloads or bootstraps a compatible Python/runtime and dependency environment on first launch using a manager or a private artifact service.

### Strengths

It can reduce the initial installer size, centralize pack updates, and avoid shipping all optional code up front.

### Risks and blockers

It is not self-contained at first launch. It adds network availability, proxy/authentication, disk-space, cache-repair, rollback, and supply-chain requirements. A managed download can be an optional convenience after the core runtime is shipped, but it must not be the only supported path for a creator who expects local-first use.

### Assessment

Not now as the primary architecture. Its pack-management ideas should inform the recommended signed capability-pack protocol.

## Candidate E — Native Rewrite

### Shape

Replace the Python backend and ML stack with native Swift/Rust/C++/MLX/whisper.cpp-style workers.

### Strengths

Could eventually reduce interpreter packaging and improve Apple Silicon specialization for a selected engine.

### Risks and blockers

It is a multi-phase product and behavior rewrite: API parity, transcription semantics, word timing, diarization, exports, background removal, audio cleanup, and job recovery all need revalidation. The current code already supports multiple engines and optional providers. A rewrite would create a new compatibility and security surface while leaving the model delivery problem intact.

### Assessment

Not now. A native engine may be considered later as one optional transcription pack behind the same worker contract.

## Optional Capability Packs

The pack boundary should follow creator outcomes and dependency risk:

For the first Phase 3B macOS arm64 implementation, “optional” means an embedded, signed code capability that is imported only when selected, or a non-executable model/data pack managed outside the app. It does not mean that the first release must download native Python code after installation.

| Pack | Initial policy | Why |
| --- | --- | --- |
| Core worker/API | Required and embedded | Makes launch, project handling, local media, job state, and health reliable |
| Core transcription | One verified arm64 engine and a modest model | Keeps “choose media → edit → export” self-contained without shipping every engine |
| WhisperX alignment | Optional | Better word timing, but larger native/alignment graph and more model assets |
| Parakeet/NeMo | Optional | Current default candidate, but the ecosystem and arm64 behavior need a dedicated proof |
| Diarization | Optional | Requires HF model access/agreement and additional runtime/model cost |
| Studio Sound | Optional | DeepFilterNet model and native dependencies are not needed for the basic edit/export path |
| Background removal | Optional | MediaPipe/OpenCV are large and unrelated to the first transcription/export path |
| External AI | Optional and disabled until configured | Network/provider use is a creator choice, not a local runtime prerequisite; provider SDKs can remain lazy and provider-specific |

### Two different pack classes

The architecture must distinguish executable/native capability code from non-executable model/data. They have different signing, update, rollback, and macOS security requirements:

**Executable/native capability code** includes Python extension modules, `.so` files, dylibs, native libraries, and executable workers. For the first macOS arm64 self-contained release, these files are embedded inside the signed/notarized app when they are required by the supported core path. A downloaded native capability pack is future work that requires separate signing, notarization, and Library Validation proof; it is not required for the first release.

**Non-executable model/data** includes model weights, tokenizers, alignment assets, and metadata. These are mutable/versioned application data and belong in app-managed writable storage outside the signed `.app`.

On macOS, Hardened Runtime enables Library Validation by default. Native libraries loaded by the packaged Python worker may need Apple-compatible signatures from the same Team ID. A native wheel downloaded after notarization cannot simply be assumed loadable from `Application Support`. `com.apple.security.cs.disable-library-validation` must not be the default production strategy; disabling Library Validation is a separately justified security exception.

Every code pack needs: target platform/architecture, exact lock hash, native-library inventory, license/notice bundle, supported app version range, integrity hash, signing/notarization evidence, and a rollback path. Every model/data pack needs: target engine, immutable revision, file hashes, byte sizes, model terms, supported app version range, and a deletion/rollback path. Packs should be additive and independently removable where the feature allows it.

“Lazy capability pack” means lazy loading of Python/backend imports, not necessarily downloading code after install. A capability can be physically included in the signed app and imported only when selected. This distinction isolates missing optional dependencies and improves startup without prematurely committing to post-install native code loading.

## Apple Silicon / Acceleration

The current `gpu_utils.py` checks CUDA first, then Torch MPS, then CPU. On Apple Silicon, MPS is the relevant acceleration path; it is not interchangeable with CUDA and must be tested per engine. PyTorch’s MPS documentation requires a supported macOS/device combination and an MPS-enabled build.

Policy:

- Build and test arm64 first, with native arm64 wheels; do not assume x64 wheels or Rosetta behavior.
- Treat MPS as an optional acceleration capability. The supported CPU path must remain correct and recoverable.
- Record engine, model, device, precision, memory pressure, and fallback in diagnostics.
- Do not ship CUDA libraries in the macOS pack. NVIDIA/NeMo remains an optional capability until its arm64 story is proven.
- A future MLX or native Apple engine can be an optional pack; it must produce the same normalized transcript contract before replacing an existing engine.

## Signing and Notarization

The current release scripts already prepare and verify a bundled FFmpeg resource and provide release-trust checks. The inspected package was signed with a local Apple Development identity during the directory build; public direct distribution needs the documented Developer ID and notarization path.

For the proposed layout:

1. Build a clean, pinned runtime and each pack on the target architecture.
2. Generate a manifest and third-party/model notices from the exact artifact contents.
3. Sign or otherwise integrity-protect pack payloads before packaging.
4. Place executable/native resources outside ASAR where required and sign every nested executable, dylib, extension, and worker.
5. Sign the final app with Developer ID Application, enable the hardened runtime, notarize, staple, and verify on a clean machine.
6. Verify that the app can start the signed worker, load a core model, use bundled FFmpeg, and report a failed optional-pack path without disabling the core path.

electron-builder documents `extraResources` as the location for runtime binaries and data under `Contents/Resources`, and its signing documentation states that direct macOS distribution requires signing plus notarization. Python and native-pack license notices must ship with the app; signing does not replace redistribution compliance.

## Security Boundary

Keep the current security shape and make the packaged runtime stricter:

- bind the worker to `127.0.0.1` only;
- Electron remains responsible for generating and passing a per-session random token;
- keep the renderer’s trusted-origin and IPC sender checks;
- pass only the required environment variables and explicit roots to the worker;
- treat user media, project files, model manifests, and downloaded packs as untrusted inputs;
- verify code-pack signatures and model/data hashes before activation and stage updates atomically;
- do not execute Python, shell scripts, or binaries supplied by a project file or external provider;
- redact tokens, local paths, provider responses, and raw model URLs from normal creator-facing errors;
- make external AI transfer explicit and preserve the existing local-first default;
- add a signed-manifest rollback and a corrupt-cache repair path before public rollout.

### Current local API gap

The current backend is fail-open when launched without its environment token. `backend/main.py:36` sets `LOCAL_API_TOKEN = os.getenv("SCRIPTCUT_API_TOKEN", "")`, and `backend/main.py:40-50` rejects a request only when `LOCAL_API_TOKEN` is truthy. Therefore, a directly launched backend with no `SCRIPTCUT_API_TOKEN` does not enforce token authentication on non-health routes. This is a current security/runtime gap documented for Phase 3A; this spike does not modify the backend auth implementation.

### Phase 3B production policy

- **Packaged worker:** `SCRIPTCUT_API_TOKEN` is mandatory. A missing or empty token must fail startup or fail closed; protected routes must never become unauthenticated because token initialization failed. Electron remains responsible for generating and passing the per-session token.
- **Development:** any tokenless behavior must be deliberate and explicitly enabled if retained. It must not be the production default.
- The runtime must not silently switch from an authenticated packaged mode to tokenless mode.

The packaged worker is a local process, not a security sandbox. A Phase 3B threat review must cover archive extraction, native library loading, model parsing, FFmpeg input handling, token initialization, and update replacement before release.

## Redistribution Considerations

The runtime bundle will be a combined distribution of Electron, CPython, Python packages, native libraries, FFmpeg, and possibly model assets. Each component needs an inventory containing name, exact version/revision, source, license, notices, and whether it is embedded or downloaded.

Specific gates:

- CPython and its included libraries: retain the applicable PSF and third-party notices.
- PyPI packages: record license metadata from the locked artifact and inspect native transitive licenses rather than trusting only a top-level package label.
- WhisperX is BSD-2-Clause according to its repository, and it acknowledges other projects and model sources; those notices remain relevant to the assembled pack.
- pyannote models have their own model-card terms and may require an accepted agreement/token. A model pack must not imply that the code license covers model weights.
- Hugging Face model caches are delivery mechanisms, not blanket redistribution permission.
- FFmpeg and any copied dylibs retain their notices and source obligations.
- Core app notices, CutScript attribution, AGPL obligations, and commercial licensing policy remain repository concerns outside this spike; this document does not change them.

No model should be copied into the installer merely because it exists in a developer cache. The pack manifest is the point where redistribution approval is recorded.

## CI / Reproducibility

The current CI is not a packaged-runtime gate:

- Ubuntu CI installs Node 24 and Python 3.11, but only a small backend smoke dependency subset rather than `backend/requirements.txt`.
- The manual macOS packaging job installs Node dependencies, prepares FFmpeg, and builds an unpacked app, but does not install or package Python/site-packages or start the packaged backend.
- `backend/requirements.txt` uses lower bounds and has no cross-platform lock with hashes.

Phase 3B should add:

- a committed lock/constraints artifact for each supported OS/architecture, including hashes and Python version;
- a clean build matrix for macOS arm64 first, then macOS x64/Windows/Linux only when each has a support decision;
- a runtime manifest generated from the build, not hand-edited;
- a dependency and license inventory/SBOM check;
- a package smoke that launches the packaged app/worker from a clean environment with no system Python on PATH;
- a negative smoke with a missing optional pack and a corrupt model cache;
- a core transcription/export smoke using small fixtures, with model downloads replaced by fixed test fixtures where appropriate;
- reproducible artifact naming, SHA-256 files, build logs, and a documented toolchain image or runner setup;
- release trust, nested signing, notarization, and post-notarization launch checks on a clean machine;
- a pack update/rollback test and a disk-space failure test.

Pinning policy: do not use `>=` as the release input. Resolve dependencies in a controlled builder, record exact versions and hashes, preserve the source `requirements.txt` for development if desired, and generate the release lock from a reviewed input. Rebuild when Python, Electron, native wheels, FFmpeg, or a model revision changes.

## Weighted Scorecard

Scores are 1–5, where 5 is strongest. Weighted points are `(score / 5) × weight`; total weight is 100. The score is a decision aid, not a benchmark of the full ML graph.

| Criterion | Weight | A Portable CPython | B PyInstaller | C Nuitka | D Managed runtime | E Native rewrite |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Truly self-contained release | 25 | 5 / 25 | 5 / 25 | 5 / 25 | 2 / 10 | 5 / 25 |
| Compatibility with current Python/ML stack | 20 | 5 / 20 | 4 / 16 | 3 / 12 | 4 / 16 | 1 / 4 |
| macOS arm64 path | 15 | 4 / 12 | 4 / 12 | 4 / 12 | 4 / 12 | 4 / 12 |
| Debuggability and startup control | 15 | 4 / 12 | 3 / 9 | 2 / 6 | 4 / 12 | 1 / 3 |
| Size and update flexibility | 10 | 3 / 6 | 3 / 6 | 3 / 6 | 5 / 10 | 2 / 4 |
| Reproducibility and licensing clarity | 10 | 4 / 8 | 4 / 8 | 4 / 8 | 3 / 6 | 2 / 4 |
| Phase 3B delivery risk | 5 | 4 / 4 | 3 / 3 | 2 / 2 | 2 / 2 | 1 / 1 |
| **Total** | **100** | **87** | **79** | **71** | **68** | **53** |

The primary score is not based on the small bundle being small. It wins because it preserves the working Python seam while allowing the large and risky pieces to become separately verified packs.

## Recommended Architecture

Use **Electron + portable CPython + a local authenticated FastAPI worker + embedded signed code packs + signed model/data manifests**.

The first Phase 3B implementation should keep the worker process model and API contracts stable while changing only runtime discovery and packaging. It should not mix runtime packaging with a redesign of transcription, export, project schema, or creator UX.

Recommended operational rules:

- packaged builds always use the bundled runtime;
- the first self-contained build embeds the core Python packages, required native extensions, FFmpeg/FFprobe, and any optional code capability deliberately selected for that release;
- source development may use a compatible local Python 3.10-3.12 environment;
- one supported core transcription path is embedded as a core code pack;
- optional engines are opt-in embedded code packs and are imported only when selected; downloadable native code packs are not a first-release dependency;
- model files are immutable, revisioned, hashed, and cached outside the signed app bundle;
- pack and model failures are capability-level recovery states, not generic “backend unavailable” errors;
- the first public self-contained target is macOS arm64, with other platforms gated independently.

## Proposed Packaged Layout

Illustrative macOS arm64 layout; names are a Phase 3B design target, not current files. For the first self-contained release, the signed/notarized app embeds the portable CPython runtime, core Python packages, native extensions required by the supported core path, FFmpeg/FFprobe, and any optional code capability deliberately selected for that release. Models, model revisions, tokenizer/alignment data, cache, logs, and non-executable metadata remain in app-managed writable storage.

```text
ScriptCut.app/
  Contents/
    MacOS/ScriptCut
    Resources/
      app.asar
      backend/
        main.py
        routers/
        services/
        utils/
      bin/
        darwin-arm64/
          ffmpeg
          ffprobe
          bundle-manifest.json
      runtime/
        python/
          darwin-arm64/
            3.11.15+<build>/
              bin/python3.11
              lib/python3.11/
        packs/
          core/
            <embedded-code-pack>/
      manifests/
        runtime-manifest.json
        packs.json
        licenses/
        sbom.json
      future-code-packs/
        README-topology-only.txt
```

User-writable data must stay outside the signed app:

```text
Application Support/ScriptCut/
  models/<pack-id>/<revision>/...
  cache/
  logs/
  metadata/
```

`future-code-packs/` is topology only. Downloaded executable/native capability packs are not approved for the first release; they require separate signing, notarization, and Library Validation proof before they can be loaded. The manifest and launch contract should still describe the core embedded code as a pack so later optional delivery does not require another conceptual change.

## Phase 3B Slices

Proposed dependency-aware slices:

1. **Runtime seam and manifest.** Define target identity, runtime root, embedded code-pack root, model root, worker command, token requirement, and diagnostics. Add contract tests without adding a downloadable native-pack manager.
2. **First hard milestone — bundled core worker.** Build the pinned arm64 portable CPython runtime, embed the core Python dependency set and required native extensions, integrate Electron startup, and prove `/health` works with no system Python on PATH.
3. **Baseline transcription and model management.** Select the first arm64-supported engine, package its code/native requirements inside the signed app, then add application-managed model download, progress, resume, hash verification, rollback, and deletion. Prove word/segment normalization and fallback behavior.
4. **Optional capability isolation.** Make optional Python/backend imports lazy and isolate missing packs. Physically included optional code may be imported only when selected; do not require post-install native code loading.
5. **Signing and release CI.** Add clean arm64 packaging, nested signing, notarization, SBOM/notices, artifact checksums, missing-token fail-closed coverage, and release evidence.
6. **Future downloadable native packs, only if still worthwhile.** Investigate signed/notarized code-pack delivery and Library Validation behavior as a separate spike. Do not make it a prerequisite for the first self-contained release.
7. **Compatibility rollout.** Keep the local-Python source path for contributors, publish the first self-contained arm64 alpha alongside a recovery path, and retire the release-time system-Python fallback only after the acceptance gate passes.

Each slice should leave the current local development path usable and should not silently change engine selection or project behavior.

## Phase 3B Acceptance Gate

Phase 3B is ready for a self-contained macOS arm64 alpha only when all of these are evidenced on a clean machine or clean CI runner:

- the app launches with Python absent and with an unsupported Python 3.14 present;
- Electron selects the packaged interpreter and never falls back to PATH Python in release mode;
- the worker starts on loopback, requires the per-session token for protected routes, and shuts down cleanly;
- launching the packaged backend with `SCRIPTCUT_API_TOKEN` deliberately missing causes production startup to fail closed; the runtime never silently switches to tokenless mode;
- `/health` is independent of missing optional packs;
- the chosen core transcription engine completes a representative audio fixture and returns the expected normalized word/segment contract;
- a creator can edit, save/autosave, recover, and export a representative project using bundled core resources;
- FFmpeg/FFprobe execute from the matching signed bundle and caption capability is reported accurately;
- optional-pack absence, failed download, corrupt hash, insufficient disk space, and model-load failure each have a recoverable state;
- model download/cache behavior is deterministic, revisioned, resumable, and offline-retryable;
- model-pack integrity checks are required, and model packs remain non-executable data rather than Python runtime or native code;
- all packaged native binaries, Python runtime pieces, wheels, and dylibs are signed as required, nested components pass code-sign verification, and the notarized app launches on a clean arm64 Mac with Hardened Runtime without an unjustified `com.apple.security.cs.disable-library-validation` exception;
- license notices, model terms, source URLs, SBOM, checksums, and release manifest match the shipped artifact;
- CI rebuilds from pinned inputs and produces the same manifest and dependency hashes;
- existing backend smoke, frontend checks, compile checks, desktop QA, and packaged-worker smoke pass;
- no application-file or schema change is included solely to make the runtime spike pass.

The acceptance artifact should include the clean-machine transcript, package manifest, `codesign --verify`/notarization evidence, startup timing, pack/model hashes, failure-path screenshots or logs, and the exact tested commit.

## Risks / Unknowns

- Full arm64 compatibility and redistribution terms for WhisperX, faster-whisper, NeMo/Parakeet, pyannote, DeepFilterNet, MediaPipe, OpenCV, Torch, and their native transitive dependencies remain to be proven.
- The current local venv is not a reproducible release environment and is missing several requirements despite being large; it cannot be copied into a DMG as-is.
- Model licenses, Hugging Face access agreements, model sizes, and update policy must be resolved per model family.
- Torch/MPS behavior can vary by macOS and package build; CPU fallback must be a tested product path.
- A bundled Python process increases installer size and signing surface even when model packs are deferred.
- One-folder PyInstaller may need custom hooks/specs for dynamic imports and package data; Nuitka may still become useful after the import graph is reduced.
- Resource paths, subprocess permissions, temporary directories, and native library loading need clean-machine verification after notarization.
- The current package build uses a local Apple Development identity during directory packaging; public Developer ID credentials and notarization are a release prerequisite.
- Optional pack updates are a supply-chain surface and need signed manifests, rollback, and support diagnostics.
- Windows and Linux require separate packaging, native-wheel, signing, and support decisions; no macOS result should be generalized to them.
- The current `auto` engine order is capability-dependent. Phase 3B must make its packaged default deterministic and disclose the selected engine without silently changing creator expectations.

## Sources

### Repository evidence

- `package.json:39-49` — Electron-builder files and `extraResources` configuration.
- `electron/main.js:65-126` — Electron window, startup, token injection, and shutdown.
- `electron/python-bridge.js:18-139` — backend process spawn, resource path, token, and health polling.
- `electron/python-runtime.js:40-163` — current local Python search and supported versions.
- `backend/main.py:8-60` — eager router imports, auth middleware, and route registration.
- `backend/services/transcription.py:1-148` — engine candidates, import behavior, model names, and device selection.
- `backend/services/diarization.py:1-65` — Torch import, HF token, and pyannote load.
- `backend/services/background_removal.py`, `backend/services/audio_cleaner.py`, and `backend/utils/audio_processing.py` — optional import behavior.
- `backend/requirements.txt:1-40` — current lower-bound dependency inputs.
- `README.md:51-90`, `docs/INSTALL.md:1-36`, `docs/PLATFORM_SUPPORT.md:1-24`, and `docs/RELEASE.md:75-185` — current local-Python release boundary.

### External technical sources

- [python-build-standalone](https://github.com/astral-sh/python-build-standalone) — standalone, redistributable CPython builds.
- [python-build-standalone technical notes](https://github.com/astral-sh/python-build-standalone/blob/main/docs/technotes.rst) — build and redistribution design details.
- [Python license and redistribution notices](https://docs.python.org/3/license.html).
- [PyInstaller operating modes](https://pyinstaller.org/en/stable/operating-mode.html) — interpreter inclusion, platform specificity, one-folder and one-file behavior.
- [Nuitka user manual](https://nuitka.net/doc/user-manual.pdf) — standalone, data-file, and one-file behavior.
- [electron-builder application contents](https://www.electron.build/docs/contents/) — `extraResources`, ASAR, native binaries, and resource paths.
- [electron-builder macOS options](https://www.electron.build/mac/) — macOS signing, hardened runtime, and notarization inputs.
- [electron-builder code signing](https://www.electron.build/docs/features/code-signing/) — direct-distribution signing and notarization requirements.
- [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing) — signing and notarization workflow context.
- [Apple notarizing macOS software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).
- [Apple Disable Library Validation entitlement](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.cs.disable-library-validation) — Hardened Runtime’s default same-Team-ID library validation and the exceptional nature of disabling it.
- [PyTorch MPS backend](https://docs.pytorch.org/docs/stable/notes/mps.html) — Apple Silicon acceleration capability.
- [WhisperX](https://github.com/m-bain/whisperX) — word-level timestamps, alignment, diarization, dependencies, and license.
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — CTranslate2 backend, model downloads, and device requirements.
- [pyannote.audio](https://github.com/pyannote/pyannote-audio) — diarization toolkit, model/telemetry context, and licensing boundary.
- [Hugging Face file downloads](https://huggingface.co/docs/huggingface_hub/package_reference/file_download) and [cache management](https://huggingface.co/docs/huggingface_hub/guides/manage-cache) — revisioned download/cache behavior.

The external links were checked on 2026-08-08. The disposable experiments were created only under `/tmp/scriptcut-runtime-spike` and are intentionally not part of this repository change.
