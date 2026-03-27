# AGENTS.md

This document is written for AI coding agents.  
It defines the architecture, rules, and working style for this codebase.  
Follow these rules exactly unless explicitly instructed otherwise.

This repository is **AI-first**: code should be structured so that automated agents can understand, extend, and refactor it safely.

---

# Project Overview

Agentic Shortbox is a repository strictly dedicated to the **AI Orchestrator Bot**.

It is a command-driven AI orchestration framework running entirely natively inside GitHub Actions:
- stateless GitHub actions acting as the event gateway.
- unified Node.js bot logic executing prompts securely.
- explicit state-machine validation for AI lifecycles
- direct Octokit and Local Git integrations

**Important:**
You are not the Product Owner. You execute specifications; you do not invent undocumented architecture. Refactorings must be incremental, safe, and explicitly defined.

---

# Architectural Layers

The project is organized into logical layers representing strict separation of concerns.

## Preferred dependency direction

- `.github/workflows/` → acts completely isolated, invoking `src/github/action.ts`
- `src/github/action.ts` → parses GitHub webhooks payloads natively and routes events.
- `src/bot/` → The LLM integration layer acting on `controller.ts`, invoking Github and LLM logic natively via the `process.cwd()` workspace.
- `src/core/` → domain-independent parsers and state machine validators.

---

# Folder Responsibilities

## `.github/workflows/` – Entrypoint
Triggers the bot based on issues and comments.

## `src/core/` – Domain Logic
- Parsers (`parser.ts`)
- State Machine (`state-machine.ts`)
**Rules:**
- Pure TypeScript, 0 side effects.
- No network requests, no file IO.

## `src/bot/` – AI Bot Logic
Executes all LLM calls, manipulates PRs and Branches dynamically.
Contains:
- `controller.ts`
- `llm/client.ts`
- `git/manager.ts`
- `provider/`

**Rules:**
- Must exclusively use `manager.ts` for file/system Git operations.
- Must read configuration from the GitHub event payload and labels (never hardcode repository-specific values).
- Cannot access `.github/` workflows.

## `specs/` and `plans/`
- Governance layer.
- `specs/` define features based on `templates/`.
- `plans/` define technical implementations.

---

# Workflow Strictness (Commands vs. Configuration)

We utilize GitHub Issues as our UI console.
- **Labels** (e.g., `agent:codex`, `model:fast`) are **Configuration**. They never initiate an action.
- **Comments** (e.g., `ready for planning`, `ready for implementation`, `ready for rework`) are **Commands**. They always initiate an action.

Do not fake statuses. Always explicitly transition states via API (`state:planning` -> `state:planned`).

For Pull Requests, the human workflow is:
1. Leave review feedback on the PR and submit the review if needed.
2. Comment `ready for rework` on the PR once the feedback set is complete.
3. The bot collects that PR feedback and applies only the requested rework.

---

# Epic Splitting Rules

If you receive a `ready for specification` command on a parent issue:
1. Split the epic into isolated logical tasks.
2. For each task, generate a specification in `specs/` following exactly `specs/templates/feature-spec.md`.
3. Create a new GitHub child-issue for each spec.
4. Update the Parent Issue with a checklist of the child issues. Do NOT implement the code directly.

---

# Refactoring Rules

- Prefer **incremental implementations**: Implement in small steps and atomic local commits if possible. Do not rewrite everything into one massive file.
- Your ultimate goal isn't just to write code that works, but to write code that a human reviewer can easily understand, verify, and merge.

---

# Required Working Style for Agents

1. Identify the architectural layer (Orchestrator vs Worker) before changing anything.
2. Read `docs/architecture/` before proposing new features.
3. Keep GitHub-specific integration concerns out of `src/core/` and isolated to the action/provider layers.
4. Add **Jest** parity tests for pure functions in `src/core/`.
5. Summarize what was changed and preserve the existing local test strategy when extending controller or git constraints.

---

## What Not To Do

Never:
- Mix Orchestrator specific configuration into the Worker engine.
- Call LLMs inside the GitHub Action.
- Make undocumented architectural rewrites.
- Modify files in `specs/` without formal instruction.
- Commit all code into one large file instead of incrementing local Git commits via `GitManager`.

---

## Definition of Done

A task is complete only if:
- [ ] Code respects the stateless vs stateful boundary.
- [ ] No LLM API calls are introduced into the Orchestrator layer.
- [ ] New parsing commands are covered by `src/core/__tests__/`.
- [ ] Specifications are correctly logged in `specs/` or `plans/`.
- [ ] Existing automated tests remain structurally valid for the affected layer.
- [ ] ESLint passes.
- [ ] Jest tests pass.

---

## Final Note for Agents

This codebase prefers:
- clear boundaries over clever code
- small modules over large files
- state machines over implicit flags
- explicit commands over background magic

When in doubt, strictly adhere to `docs/` and ask the User before breaking the orchestration boundary.
