# Feature: Orchestrator Guard Handoff & Webhook

## Goal
Transform the current GitHub Actions ("Orchestrator") from an active workflow-manager into a pure, stateless "Guard". It will strictly validate commands, but will NOT update GitHub labels anymore. Instead, it forwards the validated intent via a Webhook (POST) to the actual AI Agent API.

## User Value
Ensures that GitHub status labels (like `state:planning`) are only ever set when the AI Agent has *actually* begun working. It completely disconnects the execution runtime restrictions of GitHub Actions from our heavy, asynchronous AI operations.

## Scope
- **In Scope:** Refactoring `src/github/action.ts` and `src/github/pr-action.ts` to remove `updateStateLabel(...)`. Constructing a standardized JSON payload (including `agent:`, `model:` config) and firing it to a defined `AGENT_WEBHOOK_URL`.
- **Out of Scope (Non-Goals):** Implementing the receiving logic at the Webhook URL.

## Domain Context
This is an architectural pivot enforcing that "GitHub is just the interface/door, not the brain". Implements the "Handoff" section described in our discussions.

## User Scenarios
1. **Given** a validated `ready to plan` command in an `idle` state Issue, **When** evaluated, **Then** the Orchestrator fires a POST request to the API with payload `{ command: 'plan', model: 'fast', issueNumber: 1, ... }` and exits successfully.
2. **Given** an invalid command, **When** evaluated, **Then** the Orchestrator posts a GitHub error comment as usual, and does NOT fire the Webhook.

## Affected Areas
- `src/github/action.ts`
- `src/github/pr-action.ts`
- `.github/workflows/ai-orchestrator.yml` (Requires new Secret: `AGENT_WEBHOOK_URL` & `WEBHOOK_SECRET`)

## UX / Behavior
- Users will no longer see an immediate status change upon commenting. The status change will be delayed until the remote Agent picks up the task and pings back.

## Business Rules
- The Webhook URL MUST NOT be hardcoded. It must be injected dynamically via GitHub Secrets (`AGENT_WEBHOOK_URL`) to allow testing across different environments (Staging, Dev, Prod).
- The Webhook Payload MUST contain the extracted configuration labels (which model/agent to use) AND the explicit GitHub repository context (`owner`, `repo`, `issueNumber` or `prNumber`).
- The Webhook Request MUST be authenticated to prevent external tampering (e.g., passing a shared secret header).

## Test Plan
- Unit tests mocking the `fetch` function to verify the payload structure.
- Asserting that `api.updateStateLabel` is never called by the orchestrator.

## Definition of Done
- [ ] Guard logic preserved.
- [ ] Label mutation removed.
- [ ] Target API is called securely (fetch) with structured payload.
