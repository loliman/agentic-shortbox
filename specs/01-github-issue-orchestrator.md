# Feature: GitHub Issue Orchestrator

## Goal
Establish the core execution entry point for our AI agents via GitHub Actions. This module will listen to GitHub Issue comments and orchestrate the delegation to the appropriate script or agent.

## User Value
Developers (Humans) need a deterministic, headless interface (GitHub) to instruct AI agents without running local tooling. The orchestrator allows async AI execution directly from the web or IDE.

## Scope
- **In Scope:** Listening to `issue_comment` creation events. Setting up the GitHub Action workflow `.yml`. Extracting issue metadata (author, comment body, labels, issue number).
- **Out of Scope (Non-Goals):** Complex string parsing for commands or state tracking logic (handled in separate modules), generating PRs.

## Domain Context
This forms the foundational "Orchestrator" layer defined in `AI_FIRST_AGENT_SPEC.md`, ensuring agents do not run autonomously, but rather act strictly based on GitHub API triggers.

## User Scenarios
1. **Given** an open Issue with specs, **When** a user posts a comment, **Then** the GitHub Action is triggered and extracts metadata.
2. **Given** an invalid event, **When** a comment is edited (not created), **Then** the orchestrator safely ignores it to prevent duplicated runs.

## Affected Areas
- `.github/workflows/ai-orchestrator.yml` (NEW)
- `scripts/ai/entrypoint.js` (NEW)

## UX / Behavior
- Transparent execution log via GitHub Actions Tab.
- No immediate visual feedback on the issue itself until downstream modules process the command.

## Business Rules
- Must only react to newly created comments.
- Must not react to its own bot comments.

## Data Impact
- None (Stateless executor).

## Architectural Placement
- Orchestration Layer (`.github/workflows` & `scripts/ai/`).

## Risks
- Infinite loops if the bot triggers on its own responses. (Must filter by user).
- Secret leakage if `GITHUB_TOKEN` is misconfigured.

## Test Plan
- Unit tests for the entrypoint payload extraction logic.
- E2E testing on a staging/test repo (Triggering comments and watching logs).

## Definition of Done
- [ ] Action fires on comment creation.
- [ ] Extracts Issue number, Author, and Body.
- [ ] Ignores bot comments.
- [ ] Passes payload to a Node.js entrypoint script.

## Open Questions
- Do we need a dedicated GitHub Bot App, or is the repository standard `GITHUB_TOKEN` sufficient?
