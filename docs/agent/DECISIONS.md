# ScriptCut Decisions

- Preserve the split between `productVersion` and public alpha `releaseTag`; do not append prerelease strings to package versions.
- Keep the public release channel alpha-only for this phase. Beta, RC, and stable lifecycle work belongs to later release phases.
- Source renderer identity comes from the root `package.json` through Vite build-time substitution; it must not fetch GitHub or parse package metadata at runtime.
- Candidate metadata remains internal and untagged. Public artifact names derive from a validated alpha release tag.
- `CFBundleShortVersionString` must equal `productVersion`. Do not invent a new `CFBundleVersion` counter until native evidence demonstrates a concrete consumer need.
- Do not change public release workflow permissions, publication gates, signing strategy, or product functionality in Phase 4B.
