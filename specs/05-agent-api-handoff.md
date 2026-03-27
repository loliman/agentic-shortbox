# Feature: GitHub Action to Bot Controller Handoff

## Goal
Standardize the internal handoff from the GitHub Action entrypoint into the native bot controller so event parsing stays thin, while workflow logic lives in application code.

## User Value
Keeps the event edge small and testable while still allowing the bot to execute planning and implementation directly inside the checked-out repository.

## Scope
- **In Scope:** Parsing `issues` and `issue_comment` events in `src/github/action.ts`, extracting issue/PR metadata, mapping labels/comments into controller payloads, and instantiating the controller with repository-scoped Octokit context.
- **Out of Scope (Non-Goals):** External webhook dispatch, remote worker hosting, or cross-provider payload contracts.

## Domain Context
This is the execution seam between the stateless GitHub event payload and the stateful bot logic that runs in the GitHub Actions workspace.

## User Scenarios
1. **Given** a new issue is opened, **When** the GitHub Action runs, **Then** it calls `handleWelcome(issue.number)` and exits without attempting other workflows.
2. **Given** an issue comment is created, **When** the payload includes labels and comment text, **Then** the action forwards `{ number, author, body, labels, isPR }` to the controller.
3. **Given** the comment is irrelevant, **When** the controller sees no valid command, **Then** the run exits cleanly without side effects.

## Affected Areas
- `src/github/action.ts`
- `src/github/__tests__/action.test.ts`
- `.github/workflows/`

## UX / Behavior
- Users interact only through GitHub issues and PR comments.
- The action should not invent workflow decisions; it should delegate to the controller with the minimum event context needed.

## Business Rules
- GitHub runtime credentials must be read from environment variables or action inputs, not hardcoded.
- The handoff payload must include labels unchanged so configuration parsing remains centralized in `src/core/`.
- The action layer must stay free of LLM prompting, git mutation, and workflow-state business rules.

## Test Plan
- Unit tests covering issue-open and issue-comment routing.
- Assertions that controller methods receive the expected payload shape.

## Definition of Done
- [ ] The action routes issue-opened events to the welcome flow.
- [ ] The action routes issue comments to the command flow with labels and PR metadata.
- [ ] No external webhook handoff remains in the entrypoint design.
