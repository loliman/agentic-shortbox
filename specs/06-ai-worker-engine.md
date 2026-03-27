# Feature: Native Bot Execution Engine & Workflow Operations

## Goal
Build the native bot execution engine that handles specification, planning, implementation, and PR rework directly inside the GitHub Actions runner workspace.

## User Value
Turns issue comments into actionable planning and implementation results without requiring a separate worker service.

## Scope
- **In Scope:** 
  - Integration with the chosen LLM backend (based on the `model:` tier passed in the config).
  - GitHub Octokit integrations to set and update workflow comments and `state:` labels as the native bot progresses.
  - Complete Git operation flows inside the runner workspace: creating branches, applying generated file changes, committing, pushing, and opening Pull Requests.
  - Implementing the "Fix Chain" (updating an existing PR with new commits).
- **Out of Scope (Non-Goals):** 
  - External webhook receivers, Docker worker hosting, or provider-agnostic remote execution.

## Domain Context
This forms the stateful execution core of the GitHub-native bot architecture.

## User Scenarios
1. **Given** a `ready for planning` command on an issue, **When** planning starts, **Then** the bot comments progress, generates a plan, and updates the state label to either `state:planned` or `state:clarification_needed`.
2. **Given** a `ready for implementation` command on a planned issue, **When** code generation completes, **Then** the bot creates a branch, commits and pushes generated changes, opens a PR, and moves the issue to `state:in-review`.
3. **Given** review feedback exists on a PR and a human either submits `ready for rework` as the review text or comments `ready for rework` on the PR, **When** the bot applies the requested follow-up, **Then** it commits to the existing PR head branch and comments success.
4. **Given** a broader polish request is posted as `ready for refinement <instruction>`, **When** the bot applies the requested follow-up, **Then** it uses that instruction plus the current PR context and commits the refinement to the existing PR head branch.

## Affected Areas
- `src/bot/controller.ts`
- `src/bot/llm/client.ts`
- `src/bot/git/manager.ts`
- GitHub API interactions via Octokit

## UX / Behavior
- Transparent Status: The bot comments progress and updates `state:` labels as work advances.
- Iterative Feedback: Commits are small and incremental.

## Business Rules
- The bot MUST strictly respect the model tier requested (`model:strong` vs `model:fast`).
- The bot MUST set the correct `state:` label as workflow stages complete.
- The bot MUST use `GitManager` for repository mutations.
- Runtime credentials must come from GitHub Actions environment variables or action inputs.

## Test Plan
- Controller tests covering planning, implementation, and PR fix flows with mocked Octokit and LLM clients.
- Unit tests preserving parser and state-machine behavior in `src/core/`.

## Definition of Done
- [ ] Bot manages GitHub issue comments and state labels for planning and implementation flows.
- [ ] Bot can execute git operations and open a targeted PR from the runner workspace.
- [ ] Rework flow can add commits to an existing PR branch.
- [ ] No external worker service is required for the supported workflows.
