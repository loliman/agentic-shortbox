# GitHub AI Workflow

This document explains the technical implementation of orchestrating AI execution via GitHub.

## Execution Model
GitHub Actions are both the trigger surface and the runtime host.
- The workflow checks out the repository.
- `src/github/action.ts` reads the event payload.
- `BotController` executes the requested workflow directly in the runner workspace.
- Status comments and `state:` labels are updated from the same runtime that performs planning or implementation.

## Labels (Configuration)
- `agent:codex`
- `model:<tier>`

## Issue Commands (Triggers)
- `ready for specification` (Splits an epic into child issues)
- `ready for breakdown` (Alias for `ready for specification`)
- `ready for planning` (Creates a plan directly from the issue spec)
- `ready for implementation` (Creates code changes and opens a PR only if the observed result is publishable)

## PR Commands (Triggers)
- `ready for rework` on the PR or as the submitted review text (Collects PR review feedback and applies the requested rework to the active PR branch)
- `ready for refinement <instruction>` on the PR (Uses the inline instruction plus current PR context for broader polish)

## State Handling
- Labels remain configuration until an explicit command comment is posted.
- The state machine validates transitions such as `idle -> planning -> planned -> implementing -> in-review`.
- Illegal transitions are rejected with a bot comment instead of silent failure.

## Publication Model
- Planning is non-dialog in the standard workflow.
- Implementation, rework, and refinement are execution commands, not conversation starters.
- Implementation publication is gated by observable repository evidence:
  - changed files from git
  - verification outcomes
  - run-type-aware scope-confidence checks
- Broad features, narrow features, and child subtasks are evaluated with different publication thresholds.
