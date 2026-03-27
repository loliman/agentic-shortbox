# Plan: GitHub-Native AI Bot Pivot

## Summary
We are discarding the completely decoupled Docker/Express "Worker Engine" architecture and pivoting strictly to a **GitHub Actions-Native AI Bot**.
All LLM prompts, state machine transitions, label modifications, and Git operations will run directly as a unified Node.js executable within the GitHub Actions runner environment.

## User Review Required
> [!IMPORTANT]
> **Loss of Provider Agnosticism:** This pivot means the codebase will strictly bind to `@actions/github` and GitHub Actions environments. GitLab/Bitbucket support is officially dropped. Do you confirm this trade-off?

> [!CAUTION]
> GitHub Actions have time limits (usually 6 hours) and require passing the `.env` API keys natively into the repository secrets. The Docker/Express Sandbox will be sunset.

## Proposed Changes

---

### Phase 1: Cleanup & Teardown

#### [DELETE] `Dockerfile`
#### [DELETE] `docker-compose.yml`
#### [DELETE] `src/worker/server.ts`
#### [DELETE] `src/worker/__tests__/e2e.test.ts`
Throwing away the server, the testcontainers e2e, and docker orchestration since the AI Bot runs completely serverless via Actions.

---

### Phase 2: Action Orchestrator Refactoring
The heart of the application moves to `src/github/action.ts` and `.github/workflows/`.

#### [MODIFY] `src/github/action.ts`
- Remove `dispatchToAgentWorker` (the webhook boundary).
- Instead, directly import the business logic (previously in the `worker` module).
- Establish the `GithubActionContext` injection (reading `OPENAI_API_KEY` from `process.env`).

#### [MODIFY] `.github/workflows/ai-orchestrator.yml`
- Expand triggers to listen to `issues: [opened]` for the welcome bot.
- Inject `OPENAI_API_KEY` and `GEMINI_API_KEY` directly from `secrets`.
- Run the compiled `dist/github/action.js` natively on the runner.

---

### Phase 3: Core Workflow Implementations
We refactor the domain logic to execute locally inside the Action Runner.

#### [NEW] `src/core/bot.ts` (or similar)
Instead of a router, we create a native Bot Controller that handles:
- **Welcome Trigger**: When an issue opens, lists available LLMs based on `process.env` configs and posts usage instructions.
- **Planning Pipeline**: On `ready for planning` or `ready for planning!`. Forces a plan generation against `/plans/template`.
- **Implementation Pipeline**: On `ready for implementation`. Creates a branch on the local actions-runner workspace, triggers the LLM, commits files, pushes to `origin`, and creates a PR.
- **Review Pipeline**: On PR comments starting with `ai: fix`, alters code and pushes.
- **Specification Pipeline**: On `ready for specification`. Splits issues based on `specs/templates`.

#### [MODIFY] `src/worker/llm/client.ts`
- Upgrade prompts to strictly inject system context: "You must adhere to `/docs`, `/specs`, `README.md`, and `AGENTS.md`". We will read these files natively from the repo tree using `fs.readFileSync` since the GitHub Actions runner checks out the full codebase before executing the script!

## Open Questions
- **Action Triggers**: Do we want the "Welcome Message" to be posted *only* if the issue has a specific label (like `ai-request`), or on *every single* issue opened in the repository?
- **AI "Bedenken" (Hesitation)**: When the bot asks clarification questions instead of returning a plan, should it change the state label to `state:clarification_needed`?

## Verification Plan
### Automated Tests
- Unit tests for the new `bot.ts` methods mocking GitHub context.

### Manual Verification
- We will trigger an issue locally/remotely and observe if the GitHub Action picks it up, posts the welcome model, and correctly executes a `ready for planning!` command directly on GitHub without webhooks.
