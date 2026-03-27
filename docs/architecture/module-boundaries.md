# Module Boundaries & Responsibilities

This document defines the project-local module boundaries for the GitHub-native bot.

## Boundaries
- `.github/workflows/`: GitHub event wiring only. No bot logic, no LLM logic.
- `src/github/action.ts`: Action entrypoint. Parse GitHub event shape, gather labels/comment metadata, delegate to `BotController`.
- `src/core/`: Pure domain logic. Command parsing and workflow-state validation only. No network, filesystem, or git side effects.
- `src/bot/controller.ts`: Workflow coordinator. Owns the high-level sequencing for welcome, specification, planning, implementation, and PR fix flows.
- `src/bot/llm/`: Model-facing prompt and client logic.
- `src/bot/git/manager.ts`: Exclusive boundary for local git and filesystem mutation performed as part of bot execution.
- `src/bot/provider/`: Provider-specific integration helpers. GitHub-specific API shaping belongs here, not in `src/core/`.

## Dependency Direction
- Workflows -> `src/github/action.ts`
- `src/github/action.ts` -> `src/bot/controller.ts` and `src/core/`
- `src/bot/controller.ts` -> `src/core/`, `src/bot/llm/`, `src/bot/git/`, `src/bot/provider/`
- `src/core/` -> no project-internal runtime dependencies with side effects

## Rules
- `src/core/` must stay deterministic and unit-testable.
- GitHub-specific payloads or Octokit response shapes must not leak into `src/core/`.
- The controller must not bypass `GitManager` for repository mutations.
