# ScriptCut Release System Audit

**Audit phase:** 4A — audit/design only<br>
**Audited repository:** `FernandoAbishai/ScriptCut`<br>
**Audited base:** `c07fa0811d65b9f88e38f2a449c563f745cfa5ac` (`main`)<br>
**Audit date:** 2026-08-13
**Scope boundary:** This document is the only intended implementation output of Phase 4A. No product code, runtime, packaging, workflow, `package.json`, version, tag, or release was changed or created.

## 1. Executive verdict

**FACT:** The repository has a real, controlled public macOS arm64 alpha path. The authoritative public path is `.github/workflows/release-unsigned.yml`: it builds a self-contained candidate on `macos-14`, runs packaged checks, creates DMG and manifest attestations, verifies the exact bundle on a second native runner, and only then may publish a GitHub prerelease without rebuilding.

**OBSERVED BEHAVIOR:** The release system successfully supports the stated `v0.1.0-alpha.3` release contract at the audited base. The tag is present locally at the audited commit, and the workflow source contains the native publication gate introduced by `c07fa0811d65b9f88e38f2a449c563f745cfa5ac`. The repository also contains ignored historical `dist/` outputs from other commits; those files are not evidence for this audit's release state.

**RECOMMENDATION:** Treat the public workflow and its generated `scriptcut.release.v2` manifest as the current authority. Keep generic Electron Builder commands available for development and QA, but label them as non-release paths in the eventual command contract.

**VERDICT:** Release qualification is materially complete for the current unsigned alpha distribution strategy, but the repository does not yet have one canonical release contract. The main risks are:

- release identity is split between product version `0.1.0`, public tag `v0.1.0-alpha.3`, and stale renderer fallback `0.1.0-alpha.2`;
- several npm commands can produce distributable-looking but non-qualified artifacts;
- clean-runner verification proves package, DMG, checksum, and provenance integrity but does not rerun the packaged backend or real-model transcription;
- publication has no separate release-level receipt for workflow/run, clean-runner, exact release state, or manual creator evidence;
- release notes are generated entirely from templates and cannot record per-release product changes without changing the generator;
- documentation still contains six stale or contradictory release statements.

The next implementation should be staged as 4B identity, 4C gate lifecycle, 4D release notes/closure, and 4E size measurement. None of those changes belong in this audit.

## 2. Current release architecture

### Repository surfaces inspected

**FACT:** The inspected release surface includes:

- `package.json`, `frontend/package.json`, and both lockfiles;
- `.github/workflows/ci.yml` and `.github/workflows/release-unsigned.yml`;
- `electron-builder.self-contained.cjs` and `electron-builder.release.cjs`;
- `scripts/release-alpha.js`, `scripts/prepare-public-release.js`, `scripts/check-public-release.js`, `scripts/check-release-candidate.js`, `scripts/check-release-workflow.js`, `scripts/check-release-trust.js`, `scripts/check-macos-signing-readiness.js`, `scripts/check-macos-launchability.js`, `scripts/check-macos-icon.js`, `scripts/generate-icons.js`;
- `scripts/prepare-python-runtime.js`, `scripts/prepare-ffmpeg-bundle.js`, `scripts/runtime-artifacts.js`, and `scripts/release-platform.js`;
- packaged runtime, backend, renderer, transcription, MPS, metadata, public-release, and documentation smoke scripts;
- `docs/RELEASE.md`, `docs/CI.md`, `docs/DESKTOP_QA.md`, `docs/INSTALL.md`, `docs/PLATFORM_SUPPORT.md`, `docs/VERIFY_RELEASE.md`, `docs/RUNTIME_SPIKE.md`, `docs/GITHUB_REPO_SETUP.md`, and `README.md`;
- `frontend/src/utils/releaseInfo.ts`, Electron `app.getVersion()`, and project snapshot version fields because they participate in displayed or persisted release identity.

**FACT:** The requested `scripts/prepare-core-runtime-pack.js` does not exist at this base. Its apparent responsibility is implemented inside `scripts/prepare-python-runtime.js`, which installs and verifies the core pack, writes `core-installed-distributions.txt`, and prunes Torch development headers. This missing path is recorded as a documentation/request mismatch, not treated as a missing runtime gate.

### Graph

```text
source main
  ├─ PR / push CI (ubuntu-latest)
  │    ├─ static release-contract smokes
  │    ├─ frontend lint/build and workflow smokes
  │    └─ backend smoke/compile
  │
  ├─ CI workflow_dispatch release_candidate=true (macos-14 arm64)
  │    └─ release:rc:arm64 → candidate files uploaded; no publication
  │
  ├─ local release:rc:arm64 (native macOS arm64)
  │    └─ build + packaged runtime/model/DMG/signing/metadata evidence
  │
  └─ release-unsigned.yml workflow_dispatch
       ├─ build on macos-14 arm64
       │    └─ candidate → public staging → two attestations → public bundle
       ├─ clean-runner-verify on a second macos-14 arm64 runner
       │    └─ exact bundle/checksum/DMG/attestation/Gatekeeper diagnostics
       └─ publish, only when publish=true
            └─ main-current gate → exact GitHub prerelease, no rebuild
                 └─ tag/release/assets/digest post-publication verification
```

## 3. Authoritative release paths

The table distinguishes a creator-facing artifact from a maintainer or test artifact. “Rebuilds” means that the stage creates a new Electron artifact; staging and publication must not be interpreted as rebuilds.

| Stage | Entry point and runner | Input → output | Rebuilds? | GitHub mutation? | Real-model proof | Native DMG verification | Attestations | Creator use |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A. Developer build | `npm run build`, `dist:*`, local host | source → generic Electron output under `dist/` | Yes | No | No | No release gate | No | No; developer-only |
| B. Local QA build | `npm run qa:desktop`; `qa:desktop:package`; `dist:*self-contained`, local host | source → QA checks or unpacked/app/DMG output | Sometimes | No | No by default | Partial; command-specific | No | No; maintainer-only |
| C. Release candidate | `npm run release:rc:arm64 -- [flags]`, native macOS arm64 | source → `dist/release-candidate/` app, DMG, `scriptcut.release.v1` manifest, checksums, candidate notes | Yes | No | Yes only with `--real-model`; physical MPS only with `--use-gpu --require-mps` | Yes: app and read-only mounted DMG | No | Not public; candidate QA only |
| C. CI candidate variant | `ci.yml` dispatch with `release_candidate=true`, `macos-14` arm64 | source → `scriptcut-release-candidate-arm64` workflow artifact | Yes | No | Optional input controls hosted CPU real model | Candidate gates run inside `release:rc:arm64`; no second clean runner | No | Not public |
| D. Public dry-run | `release-unsigned.yml`, `publish=false`, `real_model=true` recommended/required for a qualified dry-run | source → public staged DMG, `scriptcut.release.v2` manifest, notes, checksums, two Sigstore bundles, `scriptcut-<tag>-arm64-dry-run` artifact | Yes in build job; no later rebuild | No tag/release/commit/main mutation | Yes, hosted CPU path; workflow explicitly does not request GPU/MPS | Build candidate and public DMG checks, then clean native arm64 DMG verification | Created in build; both verified on clean runner | No; dry-run is evidence only |
| E. Public release | Same workflow with `publish=true`, `real_model=true`, `confirmation=PUBLISH_UNSIGNED_ALPHA`, dispatch ref `main` | previously verified public artifact → exact GitHub prerelease and six assets | No in publish job | Yes, only after all required jobs and checks | Inherited from build; not rerun in publish | Publish job reruns public DMG check on `macos-14` before mutation | Inherited and verified before mutation | Yes, after publication and release notes/manifest review |

**AUTHORITATIVE PATH:** The official public path is the complete E workflow, including both `build` and `clean-runner-verify`, followed by the gated `publish` job. `release:rc:arm64` is authoritative candidate machinery, not a public release by itself.

**LEGACY / CONVENIENCE PATHS:** Generic `dist:*`, `qa:desktop:package`, and self-contained local commands can produce useful local artifacts but do not produce the full public manifest, attestations, clean-runner evidence, or publication proof. They must not be treated as release substitutes.

## 4. Release identity audit

### Current sources of identity

| Source | Current value or behavior | Current meaning | Contract risk |
| --- | --- | --- | --- |
| Root `package.json:3` | `version: "0.1.0"` | Product/base semantic version used by Electron Builder and release scripts | Correct for the current split identity, but not visibly documented as the product version rather than the public tag |
| `frontend/package.json:4` and lockfiles | `0.1.0` | Frontend package identity | Must remain aligned with product version; it is not a prerelease tag |
| Electron `app.getVersion()` (`electron/main.js:223`) | Returns Electron's package-derived app version | Runtime/app display identity; expected `0.1.0` in this build | No explicit release-channel surface |
| `CFBundleShortVersionString` | No explicit source in repository; Electron Builder derives native metadata from package version | Expected to be `0.1.0`; native emitted plist is not independently generated by source | Requires a native fixture check in 4B |
| `CFBundleVersion` | No explicit `buildVersion` or `CFBundleVersion` control found | Electron Builder default/build metadata | No monotonic macOS build-number contract |
| Candidate manifest (`scripts/release-alpha.js:136-186`) | schema `scriptcut.release.v1`, version `0.1.0`, channel `internal-release-candidate`, `tagCandidate:null`, `tagExists:false`, commit `HEAD` | Internal candidate identity | Deliberately has no public tag |
| Candidate DMG (`electron-builder.release.cjs:18`) | `ScriptCut-${version}-${arch}.${ext}` → `ScriptCut-0.1.0-arm64.dmg` | Version-based candidate artifact | Does not identify alpha iteration |
| Public manifest (`scripts/prepare-public-release.js:107-164`) | schema `scriptcut.release.v2`, version `0.1.0`, `releaseTag` from workflow input, channel `ad-hoc-public-alpha`, full commit and artifact data | Public distribution identity | `version` and `releaseTag` are separate but this is not yet the single documented contract |
| Public tag validator (`scripts/prepare-public-release.js:58-85`) | `v<package.version>-alpha.<positive integer>`, strictly greater than existing alpha suffix | Current alpha channel/iteration | Only alpha is implemented; beta/rc/stable are future options |
| Current public tag | `v0.1.0-alpha.3` | Latest public release tag at the audited base | Must be kept distinct from product version `0.1.0` |
| GitHub Release title | `ScriptCut <releaseTag>` in `release-unsigned.yml:337-343` | Human-facing release title | Correct but generated only at publication |
| Public DMG | `ScriptCut-v0.1.0-alpha.3-arm64.dmg` | Download identity | Correctly carries the public tag |
| Workflow artifact | `scriptcut-<tag>-arm64-dry-run` or `scriptcut-<tag>-arm64-public` | CI evidence bundle identity | Candidate workflow uses the less specific fixed name `scriptcut-release-candidate-arm64` |
| Generated public notes | `# ScriptCut ${releaseTag} alpha` | Release-note heading and channel statement | Template is alpha-specific |
| In-app renderer fallback (`frontend/src/utils/releaseInfo.ts:1`) | `0.1.0-alpha.2` | Display/support-report fallback | Stale relative to the audited public release; product code change is explicitly out of scope here |
| In-app “Latest release” link (`frontend/src/utils/releaseInfo.ts:4`) | `/releases/latest` | Intended download shortcut | GitHub's latest-release behavior is not a reliable pointer to a prerelease published with `--latest=false`; current creator docs correctly use the releases feed |
| Project snapshots (`frontend/src/hooks/useProjectAutosave.ts:10`) | `appVersion: "0.1.0"` | Persisted product/schema metadata | Should remain product version, not release tag |

**OBSERVED BEHAVIOR:** The release system intentionally does not set `package.json` to `0.1.0-alpha.3`. Candidate packaging uses `package.json.version` for the app/bundle version, and public staging adds the release tag to the public filename and manifest without rebuilding the DMG.

**IDENTITY VERDICT:** The current split is technically workable and safer for macOS packaging than putting a prerelease string into every package/bundle field, but the contract is implicit and the stale renderer fallback makes the displayed identity unreliable.

## 5. Proposed canonical identity contract

**RECOMMENDATION:** Keep the product version and public release identity separate.

```text
productVersion      = 0.1.0
releaseChannel      = alpha | beta | rc | stable
prereleaseIteration = positive integer for alpha/beta/rc; null for stable
releaseTag          = v0.1.0-alpha.3       # prerelease
                      v0.1.0                # stable
commit              = full 40-character source commit
buildIdentity       = workflow + run id + attempt + target + artifact sha256
```

The computed tag rules are:

| Channel | Release tag |
| --- | --- |
| alpha | `v<productVersion>-alpha.<iteration>` |
| beta | `v<productVersion>-beta.<iteration>` |
| release candidate | `v<productVersion>-rc.<iteration>` |
| stable | `v<productVersion>` |

The contract supports `v0.1.0-alpha.N`, beta, RC, `v0.1.0`, `v0.1.1`, and `v0.2.0` without making a prerelease tag the Electron app version.

### macOS mapping

**RECOMMENDATION:**

- `package.json.version`, Electron `app.getVersion()`, and `CFBundleShortVersionString` represent `productVersion` only (`0.1.0`, `0.1.1`, `0.2.0`).
- `releaseTag`, channel, and iteration live in the release manifest, release notes, artifact names, and GitHub Release metadata.
- `CFBundleVersion` is an explicit numeric `bundleBuild`/release sequence, separate from `productVersion`. It must be monotonic across alpha, beta, RC, stable, patch, and minor releases, and must be stable when a workflow is retried for the same release tag.
- `bundleBuild` must not be derived from a prerelease string, Git short SHA, or an unbounded workflow run identifier. The future identity implementation should define its source and validate the emitted `Info.plist` on native arm64.
- Project-file `appVersion` remains product-version metadata and is not changed into a release tag.

**FUTURE OPTION:** A separate build metadata object can hold `workflow`, `runId`, `runAttempt`, `runner`, `platform`, `architecture`, and `artifact.sha256`. This is operational provenance, not a user-facing version and should not be encoded into `CFBundleShortVersionString`.

## 6. Command inventory

**COUNTING RULE:** “Release-like npm command” means a root npm script whose name or command directly packages an Electron artifact, prepares release inputs, invokes release orchestration, or packages an explicitly self-contained app. Pure `check:*` and `smoke:*` scripts are gate commands and are inventoried in the gate matrix instead. By this rule there are **21 release-like commands**.

| Classification | Commands | Assessment |
| --- | --- | --- |
| Developer-only / unqualified | `build`, `dist`, `dist:mac`, `dist:mac:arm64`, `dist:mac:x64` | Invoke generic Electron Builder using package defaults. No release manifest, public naming, attestations, clean runner, or real-model proof. |
| QA-only / unpacked convenience | `dist:dir`, `dist:dir:arm64`, `dist:dir:x64`, `dist:dir:arm64:self-contained`, `dist:mac:arm64:self-contained`, `qa:desktop:package` | Useful local package checks; not the official candidate path and do not complete the public contract. |
| Authoritative candidate machinery | `release:rc:arm64` | Canonical local/native candidate orchestrator. Rebuilds and runs the required packaged candidate gates. |
| Alias / ambiguous | `release:alpha`, `release:trust`, `release:trust:candidate` | Aliases or names that do not communicate the exact candidate/public boundary. `release:alpha` and `release:rc:arm64` run the same script. |
| Release input preparation | `release:icons`, `release:ffmpeg`, `release:platform`, `runtime:prepare:mac-arm64`, `release:public:prepare` | Required internals or staging helpers. They are not safe standalone publication commands. `release:public:prepare` renames/stages an already qualified candidate but does not attest or publish. |
| Future-only trust path | `release:trust:signed` | Explicitly reserved for a credentialed Developer ID/notarized path; not current distribution. |

Under this classification, **one** command is the authoritative candidate entry point, **zero** npm commands independently constitute an authoritative public release (the workflow is the authority), and **at least nine** names are ambiguous, aliases, or future-only from a maintainer’s shipping perspective. The exact release-like count excludes the separate gate scripts by design; changing that counting rule would make the count less useful.

**RECOMMENDATION:** In 4B/4C, add command descriptions to the release guide and CI output. Do not delete or rename these commands in Phase 4A.

## 7. Gate matrix

| Gate | Current implementation | Where it runs | Classification | Verdict |
| --- | --- | --- | --- | --- |
| lint | `npm run lint` | PR/push CI on `ubuntu-latest`; local QA | PR | Present, but `release-alpha.js` does not rerun lint before packaging. |
| frontend build | `npm run build --prefix frontend` | PR CI and candidate/public build | PR + candidate | Present. |
| backend smoke | `npm run smoke:backend` | PR/push CI and local `qa:desktop` | PR/manual | Present for source; official candidate relies on packaged backend gates rather than this source smoke. |
| runtime contract | `npm run smoke:runtime-contract` | PR/push CI | PR | Present. |
| runtime artifact checks | `npm run smoke:runtime-artifacts`; `prepare-python-runtime.js`; `check-packaged-runtime.js` | PR metadata; native candidate/public build | PR + candidate | Present for pinned inputs and packaged app. |
| FFmpeg verification | `release:ffmpeg`, `release-platform.js`, `check-packaged-ffmpeg.js` | Native candidate/public build; local QA variant | candidate + manual | Present, including architecture and executable checks. |
| packaged backend | `smoke-packaged-backend.js`, `check-packaged-electron-backend.js` | Native candidate/public build | candidate | Present; clean runner does not rerun it. |
| renderer transport | `smoke-packaged-electron-renderer.js` | Native candidate/public build | candidate | Present. |
| renderer CSP/policy | `smoke-packaged-renderer-policy.js` | PR/push CI | PR | Present as static/package policy smoke. |
| model manager | `smoke:model-manager` exists but is not called by `ci.yml` or `release-alpha.js`; packaged backend checks protected model endpoints | Local/manual if invoked; packaged candidate | manual + candidate partial | Named gate exists, but its standalone unit smoke is not on the authoritative CI/release path. |
| real-model transcription | `smoke-packaged-transcription.js --real-model` | Candidate when flag is supplied; public build input | candidate + public dry-run | Present. Public workflow uses hosted CPU and does not claim physical MPS. |
| MPS deterministic compatibility | `smoke-whisper-mps-word-timing.py` without `--require-mps` | Native candidate/public build | candidate + public dry-run | Present as CPU/simulated-MPS deterministic proof. |
| physical MPS authority | Same smoke with `--require-mps`, plus real-model `--use-gpu` | Native physical Mac only | manual | Available but not part of the hosted public workflow. A physical-MPS claim requires this explicit path. |
| icon generation | `release:icons` with `rsvg-convert`, ImageMagick, and `iconutil` | Native candidate/public build | candidate | Present. |
| icon ICNS round-trip | `generate-icons.js`, `check-macos-icon.js`, candidate/DMG inspection | Native candidate/public build | candidate | Present at source ICNS, packaged app, and mounted DMG boundaries. |
| ad-hoc signature verification | `check-macos-launchability.js`, `check-macos-signing-readiness.js`, `check-release-trust.js` | Native candidate/public build and clean runner | candidate + dry-run | Present; explicit `identity: '-'`, no Developer ID, no notarization, no Hardened Runtime. |
| Mach-O inventory | `check-macos-signing-readiness.js` | Native candidate/public build | candidate | Present, including native locations, symlink escapes, writable executables, and notices. |
| DMG inspection | `check-release-candidate.js`; `check-public-release.js` | Candidate, public build, clean runner, publish job | candidate + dry-run + publish | Repeated boundary verification is intentional. |
| public manifest | `prepare-public-release.js`, `check-public-release.js` | Public build and publish job | public dry-run + publish | Present; schema v2 records tag, commit, artifact, runtime, model, FFmpeg, trust, and provenance. |
| checksums | `release-alpha.js` and public staging; `shasum -a 256 -c` | Candidate, public build, clean runner, publish | candidate + dry-run + publish | Present for the DMG and manifest-referenced filename. |
| attestations | `actions/attest@v4` for DMG and manifest | Public build; `gh attestation verify` on clean runner | public dry-run | Present. Publication inherits verified attestations; it does not create new ones. |
| clean-runner verification | `clean-runner-verify` on `macos-14`, exact six-file bundle, checksum, DMG, attestation, local bundles, Gatekeeper diagnostic | Second native runner | public dry-run | Present for artifact/provenance. It does not execute packaged backend or real-model behavior, which is an open lifecycle decision. |
| manual physical-Mac test | Instructions in `docs/DESKTOP_QA.md` and `docs/RELEASE.md` | Maintainer/creator Mac | manual | Documented, not machine-enforced or attached to publication state. |
| publication gate | `publish` needs `build` and `clean-runner-verify`; checks main ref, `origin/main == GITHUB_SHA`, tag/release absence, real-model, confirmation, final public bundle | `macos-14` publish job | publish | Present. No artifact rebuild occurs. |
| post-publication verification | `git ls-remote`, `gh release view`, exact asset names, prerelease/draft state, optional GitHub DMG digest | Publish job | post-publish | Present but release-level receipt/run identity and a post-create main recheck are not persisted. |

### Duplicated or misplaced gates

**OBSERVED BEHAVIOR:** The candidate, public staging, clean runner, and publish job all repeat checksum/manifest/DMG checks. This is appropriate because each boundary handles a different artifact handoff; it is not accidental duplication.

**GAP:** The public clean runner verifies the packaged bundle and trust but does not run `smoke-packaged-backend.js`, `smoke-packaged-electron-backend.js`, or `smoke-packaged-transcription.js`. The runtime/real-model proof occurs before upload on the build runner. 4C should decide whether that is sufficient or whether a bounded clean-runner launch gate is required.

**GAP:** `npm run smoke:model-manager` is available but not included in `ci.yml` or the authoritative release orchestrator. The packaged backend checks model-management authorization and diagnostics, but that is not identical to the standalone model-manager smoke.

**GAP:** `npm run lint` and source backend smoke are PR/source gates, not release-candidate gates. That is acceptable only if the policy states that the release candidate is built from a green commit and the packaged gates are the final runtime authority.

## 8. Documentation truth and drift

The following are counted as six stale or contradictory documentation items. The count excludes documents that are accurate but incomplete and excludes the renderer source identity drift, which is listed separately above.

| # | Path and section | Evidence | Recommended correction |
| --- | --- | --- | --- |
| 1 | `docs/RELEASE.md:5-7`, **Current Release Status** | Describes Phase 3B.5C as adding the path without stating that the controlled public `v0.1.0-alpha.3` launch is complete. | State the current public release/tag and separate current behavior from historical Phase 3 work. |
| 2 | `docs/RELEASE.md:101`, **Public ad-hoc GitHub prerelease** | Says the post-merge dry-run is required and “not performed by this implementation PR”; the audited base is after the successful publication. | Replace implementation-PR language with the current closure evidence/receipt reference and repeatable next-release procedure. |
| 3 | `docs/RELEASE.md:141-143`, **Signing And Notarization** | Says candidate mode validates explicit Hardened Runtime/minimal entitlements. `electron-builder.release.cjs:19-21` and `check-release-trust.js:110-114` require Hardened Runtime false and no candidate entitlements. | Say candidate mode explicitly disables Hardened Runtime and omits entitlements; reserve Hardened Runtime for a future credentialed path. |
| 4 | `docs/CI.md:17` | Says a GitHub Actions workflow should be added when automation has permission, but `ci.yml` and `release-unsigned.yml` already exist and are authoritative. | Rewrite as the current CI/release workflow map. |
| 5 | `docs/GITHUB_REPO_SETUP.md:31-36`, **Launch Checklist** | Says to publish the first maintained `v0.1.0-alpha` release when ready. | Mark the initial public alpha as complete and make the checklist about maintaining subsequent tags/releases. |
| 6 | `docs/RUNTIME_SPIKE.md:89`, `354-367`, `533-565` | Historical spike text says the current release uses external Python and that Developer ID/notarization are required for public direct distribution. The current packaged runtime and public contract prove the opposite for the unsigned alpha strategy. | Keep the spike as historical research, but add a prominent “superseded for current alpha distribution” note and link to the release system contract. |

**ACCURATE DOCUMENTATION:** `README.md`, `docs/INSTALL.md`, `docs/PLATFORM_SUPPORT.md`, `docs/VERIFY_RELEASE.md`, and the creator sections of `docs/FIRST_EXPORT.md`/`docs/USER_GUIDE.md` correctly describe the qualifying self-contained arm64 alpha, app-managed first-use model, GUI `Open Anyway` path, and no xattr/Gatekeeper bypass. Their remaining limitation is that they do not point to a formal release receipt.

**IDENTITY DRIFT OUTSIDE DOCS:** `frontend/src/utils/releaseInfo.ts:1` still displays `0.1.0-alpha.2`, and its `/releases/latest` shortcut is not the same as the explicit prerelease feed used by current docs. This is a 4B implementation item, not a Phase 4A edit.

## 9. Release-notes and changelog audit

**FACT:** `scripts/release-alpha.js:192-225` writes candidate `RELEASE_NOTES.md` from a fixed template. `scripts/prepare-public-release.js:167-238` writes public notes from a fixed template using manifest fields. Neither generator consumes commit history, PR labels, a release input file, or a human-written per-release change list.

**OBSERVED BEHAVIOR:**

- notes contain deterministic platform, runtime, model, trust, checksum, attestation, and known-limitation wording;
- the public template can represent the current security/compatibility notice and self-contained install promise;
- meaningful product changes between alpha.2 and alpha.3 cannot be represented except by editing generator prose;
- historical notes are recoverable from GitHub Release assets when the release exists, but no `CHANGELOG.md` or committed per-release source exists;
- no root `CHANGELOG.md` exists; the only matching files outside ignored build output are generator/template outputs and dependency changelogs.

**RECOMMENDATION:** In 4D, add one small release-input file per published tag, for example `docs/releases/v0.1.0-alpha.3.md`, containing only human-authored sections: Highlights, Compatibility/upgrade notes, Known limitations, and Security notices. The generator should combine that input with machine-generated identity/trust/provenance sections. The generated `RELEASE_NOTES.md` remains the immutable release asset; the input file preserves history without duplicating the stable install/trust template across docs.

**FUTURE OPTION:** A single `CHANGELOG.md` with structured release sections could replace per-tag files, but it will grow into a second template surface. For a solo founder, per-release small inputs plus one generator is lower-maintenance and keeps release assets reproducible.

## 10. Post-publication completion contract

### Current checks

**FACT:** The current workflow considers publication complete after:

1. build job success;
2. public DMG and manifest attestations created;
3. clean native arm64 verification passes for exact file shape, checksum, manifest, mounted DMG, both attestations/bundles, and non-destructive Gatekeeper diagnostics;
4. publish gates confirm `main`, `real_model=true`, explicit confirmation, current `origin/main == GITHUB_SHA`, unused tag/release, and final public bundle validity;
5. GitHub prerelease is created with `--target $GITHUB_SHA`, `--prerelease`, `--latest=false`, and no Electron rebuild;
6. the tag resolves to `GITHUB_SHA`, release is not draft and is a prerelease, the expected six assets exist exactly once, and the GitHub DMG digest agrees when GitHub returns one.

### Missing release-level evidence

**GAP:** `release-manifest.json` already serves as the artifact receipt: it includes schema, product version, release tag, commit, target, artifact bytes/hash, runtime/model/FFmpeg provenance, trust truth, and DMG attestation reference. A second receipt must not duplicate those fields.

**RECOMMENDATION:** The manifest is sufficient as the artifact receipt, but not as the complete publication receipt. Add a small release-level receipt in 4D only if the workflow needs durable closure evidence. It should reference the manifest by SHA-256 rather than repeat its fields and record:

- workflow file, run ID, run attempt, and source commit;
- public release URL, tag, draft/prerelease state, and exact asset-name set;
- clean-runner verification result and attestation verification result;
- publication timestamp and final main ref observation;
- manual creator validation status or an explicit “not required” decision.

This receipt should be generated after publication or attached as a machine-readable release asset, and its own checksum should be recorded by reference. Whether it is a separate `release-receipt.json` or a future manifest v3 extension is a 4D decision; do not add both.

### Formal COMPLETE definition

ScriptCut should define a release as **COMPLETE** only when all of the following are evidenced:

- official workflow succeeded from the allowed source ref;
- tag points to the exact full source commit;
- GitHub Release exists, is not draft, and has correct prerelease/stable semantics;
- exact expected assets are present;
- DMG bytes and SHA-256 match the public manifest and checksum file;
- DMG and manifest attestations verify against repository, workflow, and source digest;
- public release notes are present and include current product/security/compatibility input;
- main was current at publication and a final ref observation is recorded;
- artifact came from the official workflow artifact and was not rebuilt during publication;
- required manual creator validation is recorded when the release policy calls for it.

## 11. Bundle-size measurement boundary

**BOUNDARY:** Phase 4A does not optimize bundle size, delete packages, prune Torch beyond the existing preparation behavior, change Whisper, or alter runtime dependencies.

**FACT:** Current size evidence is partial:

- `prepare-python-runtime.js:330-344` logs portable Python, core pack, and backend bytes during runtime preparation;
- `check-packaged-runtime.js:204-218` logs packaged portable Python/core/backend sizes and model metadata;
- `prepare-ffmpeg-bundle.js` records FFmpeg version, libraries, and caption capability but not aggregate byte totals;
- candidate/public manifests record final DMG bytes, but not category sizes;
- no authoritative machine-readable measurement records Electron, frontend, backend, Torch, or compressed/uncompressed resource contributions;
- ignored local `dist/` output is not a release evidence source.

**RECOMMENDATION for 4E:** Measure, per target and per exact candidate artifact:

1. Electron binary/frameworks and ASAR;
2. portable Python interpreter/runtime;
3. Torch and the core Python pack, with package/file counts;
4. backend source and installed core packages;
5. FFmpeg/FFprobe plus bundled dylibs;
6. frontend build output and shared/electron resources;
7. app bundle uncompressed total, DMG compressed total, and compression ratio;
8. largest files, duplicate payloads, and model payload status (model must remain excluded from the DMG under the current contract).

Measurements should be emitted by the official candidate workflow, tied to commit/target/artifact hash, and trended without changing package contents in 4E.

## 12. Security and trust invariants

The following are non-negotiable for the current unsigned-alpha strategy.

| Invariant | Current evidence | Audit status |
| --- | --- | --- |
| Publish only from current `main` | Publish job checks `GITHUB_REF`, fetches `origin/main`, and compares it to `GITHUB_SHA` immediately before mutation | Present; add final post-create observation in 4D |
| No hidden manual mutation | Publication is a guarded workflow `gh release create` with scoped `contents: write` | Present in repository workflow; external operator behavior remains a process control |
| No publication before required gates | `publish` needs `build` and `clean-runner-verify`, then repeats publication checks | Present |
| No artifact rebuild during publication | Publish downloads the verified artifact and workflow checks reject builder/release invocation in the publish job | Present |
| Exact commit binding | Candidate/public manifest commit, release target, tag check, and attestation source digest use the full SHA | Present |
| SHA-256 integrity | Candidate/public checksums and manifest compare DMG bytes/hash; GitHub DMG digest is checked when returned | Present; manifest/notes asset digests are not fully checked |
| GitHub artifact provenance | `actions/attest@v4` attests DMG and manifest; clean runner verifies repository/workflow/source digest and local Sigstore bundles | Present |
| Clean native verification | Second `macos-14` arm64 runner checks exact bundle, DMG, checksums, attestations, and Gatekeeper diagnostics | Present for artifact/trust; runtime launch proof is not repeated there |
| Ad-hoc truth is explicit | `identity: '-'`, `hardenedRuntime:false`, `notarize:false`, manifest booleans, strict codesign checks | Present |
| Developer ID false unless present | Candidate strips signing credentials and check scripts reject Apple authority | Present |
| Notarization false unless present | Candidate config and public manifest/checks use false | Present |
| Gatekeeper trust false for current path | `spctl` is diagnostic; launchability code requires non-trusted ad-hoc state | Present |
| Creator approval uses official GUI | Notes/docs use System Settings → Privacy & Security → Open Anyway | Present |
| No xattr/Gatekeeper bypass | Workflow and documentation reject `xattr`, `spctl --master-disable`, and related bypasses | Present |
| No secret leakage | Manifest/path scanners reject local paths and secret-like values; workflow has no Apple credentials | Present for checked surfaces |

## 13. Recommended 4B / 4C / 4D / 4E plan

### 4B — Release Identity & Versioning

**Objective:** Implement the canonical product/channel/iteration/tag/build identity contract without putting prerelease tags into `package.json` or macOS short version.

**Likely files:** `package.json`, `frontend/package.json`/lock metadata if needed, Electron Builder configs, release manifest generators/checkers, `frontend/src/utils/releaseInfo.ts`, release identity tests, and release documentation.

**Invariants:** product version stays semver core; tags are derived and monotonic per channel; full commit is required; CFBundleShortVersionString is product version; CFBundleVersion is explicit numeric monotonic build sequence; retrying a tag does not change its identity.

**Non-goals:** no product UX redesign, runtime change, packaging optimization, trust-strategy change, or new release.

**Risk:** macOS metadata and in-app display can disagree if the generated identity is not injected consistently.

**Validation:** native arm64 build; inspect `app.getVersion()`, `Info.plist` short/build versions, candidate/public manifests, public filenames, tag validators, and renderer/support report identity.

**Merge gate:** all identity sources agree for an alpha fixture and a stable fixture; no prerelease string enters `package.json` or `CFBundleShortVersionString`.

### 4C — Release QA / Gate Lifecycle

**Objective:** Make stage ownership and gate sequencing explicit; decide which source gates are inherited from green CI, which must run in candidate, and whether clean-runner runtime launch is required.

**Likely files:** `scripts/release-alpha.js`, workflow files, gate scripts, `package.json` command descriptions, `docs/RELEASE.md`, and release smoke tests.

**Invariants:** public workflow remains the only publication authority; build once; attest once per subject; verify on clean native runner; publish only after all gates; no Gatekeeper bypass; physical MPS is never represented by hosted simulated/CPU proof.

**Non-goals:** no new product tests unrelated to release trust, no cross-platform release, no Developer ID/notarization rollout.

**Risk:** moving gates can increase macOS minutes or create false confidence if a hosted CPU gate is labeled physical MPS.

**Validation:** workflow-structure smoke, bounded candidate run, public dry-run with both build and clean-runner jobs, exact artifact/download/reuse proof, and explicit manual gate record.

**Merge gate:** a maintainer can identify one command/workflow for each stage and no ambiguous command is documented as publishable.

### 4D — Changelog / Notes / Post-publish State

**Objective:** Add minimal human-authored per-release change input and durable release closure evidence without duplicating machine-generated manifest fields.

**Likely files:** `scripts/prepare-public-release.js`, notes smoke tests, `docs/releases/` or one changelog source, workflow post-publish steps, and `docs/RELEASE.md`.

**Invariants:** release notes remain deterministic for trust/install facts; product changes, compatibility/security notices are explicit; receipt references manifest/artifact hashes rather than copying them; historical notes remain recoverable.

**Non-goals:** no release publication in implementation work, no generic documentation rewrite, no second competing metadata format.

**Risk:** release input can become stale or diverge from actual code if it is not tied to the exact tag/commit.

**Validation:** generated notes fixture for alpha/beta/RC/stable, missing-section failures where required, release receipt fixture, exact asset verification, and post-publish ref/release checks.

**Merge gate:** one release input produces notes and a closure receipt whose commit/tag/artifact references are internally consistent.

### 4E — Bundle-size Audit

**Objective:** Record reproducible category-level size measurements for the exact candidate artifact and trend them.

**Likely files:** new measurement script, candidate workflow artifact/manifest integration, size smoke test, and release documentation.

**Invariants:** measurement only; no dependency deletion, Torch pruning change, Whisper change, runtime behavior change, or package optimization in this phase.

**Non-goals:** no size target or package-removal decision until measurements exist; no changes to model policy.

**Risk:** compressed DMG totals can hide uncompressed resource regressions; category boundaries may double-count hard links or ASAR contents.

**Validation:** same commit/arch measured before packaging, inside `.app`, and after DMG creation; totals reconcile within documented compression/duplicate rules.

**Merge gate:** a future release review can name the top size contributors and compare them to the prior release using machine-readable evidence.

## 14. Risks and open questions

- **Identity:** What exact monotonic source should assign `CFBundleVersion`/`bundleBuild` across prereleases and stable releases, including workflow retries?
- **Renderer identity:** Should the UI read `app.getVersion()` and a release metadata endpoint, or should a generated file provide both product and public identities? The current hard-coded fallback is stale.
- **Prerelease discovery:** Should the in-app download link remain the releases feed, or should the current public prerelease tag be promoted through a separate explicit pointer? `/releases/latest` is not equivalent to “latest prerelease.”
- **Clean runner:** Is pre-upload real-model/runtime proof sufficient, or must a clean native runner launch the app/backend again? The current workflow proves package and trust boundaries, not full clean-machine runtime behavior.
- **Physical MPS:** Is physical MPS a required release gate, a manual qualification gate, or an optional evidence field for the current alpha? The hosted workflow correctly does not claim it.
- **Publication closure:** Should the receipt be a separate `release-receipt.json` asset or a manifest v3 object? Choose one to avoid redundant metadata.
- **Release notes:** Should per-release input live in `docs/releases/<tag>.md` or a single `CHANGELOG.md`? The audit recommends per-release input for low maintenance.
- **Channel naming:** Candidate/public code uses `internal-release-candidate` and `ad-hoc-public-alpha`, while workflow/docs also use “unsigned alpha.” 4B/4D should choose one vocabulary and retain compatibility aliases only where needed.
- **Historical ignored artifacts:** Local `dist/` outputs are ignored and can contain manifests from older commits. Future verification should always identify the official workflow run/artifact and full commit before using local files as evidence.
- **Requested source mismatch:** `scripts/prepare-core-runtime-pack.js` is absent; future documentation should point to the actual `prepare-python-runtime.js` responsibility or introduce a dedicated file only if there is a real architectural need.

## Audit report summary

```text
base: c07fa0811d65b9f88e38f2a449c563f745cfa5ac
current product version: 0.1.0
current latest public release tag: v0.1.0-alpha.3
release-like npm commands: 21
authoritative npm command entry points: 1 candidate; 0 public publisher
ambiguous/legacy/future-only release-like commands: at least 9
release identity verdict: workable split, undocumented and currently drifted in renderer fallback
release gate verdict: public workflow qualified for artifact/trust; clean-runtime/manual closure evidence remains under-specified
documentation drift count: 6
CHANGELOG.md: NO
recommended 4B objective: canonical product/channel/iteration/tag/build identity
recommended 4C objective: explicit gate lifecycle and clean-runner/manual release QA contract
recommended 4D objective: minimal per-release notes input plus non-redundant post-publish receipt
recommended 4E objective: machine-readable category-level bundle-size measurements
```

**FACT:** Product code changed: **NO**. Runtime changed: **NO**. Workflow changed: **NO**. Package version changed: **NO**. Tag created: **NONE**. Release created: **NONE**.
