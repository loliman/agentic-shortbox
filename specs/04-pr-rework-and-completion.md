# Feature: PR Rework and Completion Workflow

## Goal
Handle the post-implementation review cycle. This allows human reviewers to instruct agents to iterate on Pull Requests iteratively, and cleanly concludes the issue once merged.

## User Value
If the AI makes a mistake during implementation, developers can leave review feedback directly on the PR and then trigger a focused rework pass rather than starting over completely or fixing it manually.

## Scope
- **In Scope:** GitHub Action listening to Pull Request review feedback and PR comments. Parsing `ready for rework`. Collecting review feedback, changed files, and PR diff as the rework context. Automatically closing the parent Issue and summarizing work upon Merge.
- **Out of Scope (Non-Goals):** Performing GitHub Code-QL scanning or continuous integration test running.

## Domain Context
Implements Section 9.3 (Review and Rework) and Section 9.4 (Completion) of `AI_FIRST_AGENT_SPEC.md`.

## User Scenarios
1. **Given** an open PR made by the AI, **When** a human leaves review feedback and then comments `ready for rework` on the PR, **Then** the AI collects that PR feedback and amends its commit accordingly.
2. **Given** a human merges the PR, **Then** the AI calculates the final diff, posts a summary to the parent issue, and closes the issue.

## Affected Areas
- `.github/workflows/ai-pr-orchestrator.yml` (NEW)
- `scripts/ai/pr-handler.js` (NEW)

## UX / Behavior
- PR labels switch to `state:reworking` while the agent is busy fixing.
- Upon merge, a final summary comment appears on the issue, notifying subscribers that the feature is done.

## Business Rules
- Rework commands are only valid on PRs authored by the AI Agent.
- Final completion summary must only include code that was actually merged (not reverted work).

## Architectural Placement
- Orchestration Layer `.github/workflows/`.

## Risks
- "Summary" output being too large and hitting GitHub comment length limits.

## Test Plan
- Mock PR comment events and verify routing to the Rework function.
- Mock PR Merge webhook events and verify completion summary creation flow.

## Definition of Done
- [ ] PR Action triggers on `ready for rework`.
- [ ] Merge Action triggers on PR Close/Merge.
- [ ] Parent Issue is successfully closed automatically.
