# ScriptCut Product Vision

## What ScriptCut Is

ScriptCut is a local-first AI video production tool that turns spoken content into finished, publishable videos and clips with minimal manual editing. It is an open-source desktop application for creators who want to keep their projects and media under their control.

The current product is a macOS Apple Silicon desktop alpha with transcript editing, local export, reviewable AI helpers, creator-oriented presets, and project recovery foundations. Some tools and AI capabilities remain optional or setup-dependent.

## The Problem

Creators often record more useful material than they can manually edit, package, caption, and repurpose. The product opportunity is to reduce the repetitive work between a recording and the small set of assets worth publishing without turning every creator into a video-editing technician.

## Primary User

The primary user is a creator, not a developer. This includes YouTube creators, podcasters, educators, founders creating content, interview creators, talking-head creators, streamers, and long-form creators repurposing recordings into short-form content.

Developers, advanced users, and maintainers remain important users of the project. Their controls and documentation should remain available through progressive disclosure and contributor-focused surfaces.

## Core Product Promise

> Import a video. Edit it like a document. Let ScriptCut help find, package, and export the content worth publishing.

The normal creator path should eventually be:

```text
Download ScriptCut → open ScriptCut → choose a video → edit or create clips → export
```

## Canonical Workflows

### Edit a Video

```text
Open video → transcribe → edit the transcript → optionally improve with AI → review → export
```

The current application supports word-level transcript editing, edited playback, local export, and reviewable AI edit or filler suggestions. AI assistance is optional and does not remove the need to review the result.

### Create Clips

```text
Open long-form video → transcribe → find useful moments → review candidate clips → prepare supported captions, framing, and metadata → approve → export
```

The current application has foundations for AI clip suggestions, editable drafts, readiness scoring, social metadata, hook-frame notes, captions, vertical/square output, and batch export. The complete ideal workflow is a strategic direction; discovery, packaging, and approval are not claimed to be fully automatic.

## Product Principles

### Creator-first

Prioritize the person trying to create and publish content. Product language, defaults, and visible controls should start from creator tasks rather than implementation concepts.

### Local-first

Media processing should remain local by default where technically possible. Optional cloud AI providers may remain available, but their use must be explicit enough for creators to understand that selected transcript or prompt context can leave the machine.

### Simple by default

The default path should require as few decisions as possible. Good defaults are preferable to mandatory configuration.

### Powerful when needed

Advanced users should retain deeper configuration without forcing that complexity onto every creator. Progressive disclosure is the long-term UX principle.

### AI-assisted, not AI-dependent

Core editing and export should remain useful when AI features are disabled, unavailable, or not trusted for a particular decision.

### Reliable before feature-rich

Installation, startup, editing, project recovery, transcription, and export reliability have higher priority than unrelated feature growth.

### Creator-owned

Preserve ScriptCut’s open-source and local-first nature. Avoid designs that unnecessarily lock projects or media into proprietary cloud systems.

### Recording-to-publishing focus

Ask of every proposed feature:

> Does this meaningfully reduce the work between recording and publishing?

If not, it normally should not be a near-term priority.

## Local-First Philosophy

The desktop app provides a local Electron shell, React interface, FastAPI backend, and FFmpeg-based media workflow. Local transcription engines, local export, local Ollama, and creator-owned project files are first-class paths. A local-first design is not a promise that every optional provider or dependency is offline; the selected provider and local setup determine the actual data path.

## Creator-First Philosophy

The product should lead with the creator’s next useful action: choose media, understand the transcript, make a meaningful edit, review an asset, or export. Python, virtual environments, ports, FFmpeg configuration, model internals, and provider details belong in setup, diagnostics, advanced settings, or contributor documentation unless the creator needs them to recover.

## Progressive Disclosure

Keep the primary workflow short and understandable. Reveal advanced transcription engines, provider configuration, export internals, diagnostics, and automation controls when they are relevant or requested. Do not remove useful power; place it behind a clearer path.

## Creator Experience vs Advanced Capabilities

```text
Creator Experience
  choose media, edit transcript, review clips, caption, export
        ↓
ScriptCut Engine
  local transcription, project state, edit layers, jobs, FFmpeg export
        ↓
Advanced / Developer Capabilities
  runtimes, providers, model selection, diagnostics, APIs, packaging, automation
```

This is an information and workflow boundary, not a requirement to delete developer capabilities.

## What ScriptCut Is Not

ScriptCut is not currently trying to become:

- an open-source CapCut clone;
- a Premiere Pro replacement or complete professional nonlinear editor;
- a cloud collaboration suite, social network, stock media marketplace, or cloud storage platform;
- a generative video platform;
- a mobile-first editor or browser-first SaaS;
- a collection of unrelated AI features.

These are strategic focus boundaries, not feature-deletion requirements. Useful existing functionality should be preserved when it supports the recording-to-publishing path.

## Near-Term Direction

The near-term priority is a trustworthy creator path from local media to first successful export: honest onboarding, reliable startup and transcription, predictable transcript editing and export, recoverable projects, clear caption delivery, and documentation that matches the shipped application.

The next product direction is repurposing: make existing clip discovery, review, packaging, captions, framing, and batch export feel like one coherent workflow without claiming that it is already fully automated.

## Long-Term Direction

After the core desktop workflow is trustworthy, ScriptCut may make repeatable workflows programmable through documented project structures, local APIs, CLI or headless operation, batch automation, plugins, or MCP integration. These are later possibilities and must not compromise the creator-first desktop path.

## Feature Decision Test

For a proposed feature, ask:

1. Does it reduce the work between recording and publishing?
2. Does it make the default creator path clearer or more reliable?
3. Can the core workflow remain useful when AI or optional services are unavailable?
4. Should the control be visible by default, or belong behind progressive disclosure?
5. Does it preserve creator ownership and the local-first path?

If the answers are mostly no, defer the feature or require a stronger product case.
