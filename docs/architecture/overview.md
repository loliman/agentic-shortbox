# System Architecture Overview

This document describes the high-level system architecture, external dependencies, and execution model for the GitHub-native AI bot. The current architecture is intentionally local to the GitHub Actions runner: validation happens at the action edge, while every AI command is executed through Codex inside the checked-out repository workspace.

## 1. GitHub Action Entrypoint
The GitHub Action is the stateless edge of the system.
- **Responsibility**: Listen to `issues.opened` and `issue_comment.created`, normalize the GitHub payload, and instantiate the bot controller with Octokit and repository context.
- **Validation boundary**: It should not perform business decisions itself beyond basic event gating.
- **Execution model**: It runs inside the repository's checked-out GitHub Actions workspace and hands control directly to application code in `src/bot/`.

## 2. Core Workflow Guard
Pure workflow validation lives in `src/core/`.
- **Parser**: Recognizes explicit commands such as `ready for specification`, `ready for planning`, `ready for implementation`, PR rework via `ready for rework`, and PR refinement via `ready for refinement <instruction>`.
- **Configuration extraction**: Reads `agent:*` and `model:*` labels as configuration only.
- **State machine**: Validates legal state transitions before expensive work begins.

## 3. Bot Controller
The stateful bot logic lives in `src/bot/`.
- **Responsibility**: Coordinate welcome messages, planning, specification generation, implementation, and PR rework handling.
- **Collaborators**:
  - `codex/runner.ts` for all AI command execution
  - `git/manager.ts` for local git and filesystem operations
  - `provider/github.ts` and Octokit integrations for comments, labels, issues, and PRs
- **Execution model**: The controller operates directly on the runner's local workspace instead of dispatching to an external worker or webhook service. It passes the feature spec, latest plan, and command instruction to Codex, and Codex gathers the rest of its context from the repository on its own.

## 4. Git and Repository Operations
Git operations are performed locally through `src/bot/git/manager.ts`.
- Branch creation, file application, commits, and pushes must go through the manager.
- The controller should avoid ad hoc shell-level git logic outside this boundary.

## 5. Configuration Sources
- GitHub labels provide per-issue configuration.
- GitHub Actions secrets provide runtime credentials such as `GITHUB_TOKEN` and `OPENAI_API_KEY`.
- Governance context comes from repository files such as `AGENTS.md`, `docs/`, `specs/`, and `plans/`, which Codex is instructed to inspect directly.
