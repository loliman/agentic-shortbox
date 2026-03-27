# Plan: Feature 08 - Happy Path E2E Testing (Mocked APIs)

## Summary
The integration strategy should validate the GitHub-native bot without reviving the removed remote-worker or Docker architecture. The happy path should cover the action entrypoint, controller orchestration, mocked Octokit interactions, and local git-manager seams.

## Affected Files
- `src/github/__tests__/action.test.ts`
- `src/bot/__tests__/controller.test.ts`
- `src/bot/git/manager.ts`

## New Files
- None

## Architectural Layer Placement
This affects the GitHub action edge and the bot execution layer.

## Data Access Changes
- Introduce or preserve mock seams around Octokit, LLM client, and `GitManager`.
- Avoid coupling tests to real network credentials.

## Workflow / State Changes
The runner-hosted bot behaves the same as production code, but with external integrations mocked in-process.

## Tests to Add or Update
- `action.test.ts`:
  1. Mock the GitHub event payload for issue-open and issue-comment flows.
  2. Assert the correct controller methods are called.
- `controller.test.ts`:
  1. Mock LLM output and Octokit responses.
  2. Assert planning comments, state label changes, branch/PR calls, and PR fix flows.

## Rollout Steps
1. Strengthen test seams around controller collaborators.
2. Cover the issue happy path and PR fix path with mocks.
3. Keep tests fully local and deterministic.

## Risks
- Mock-heavy tests can drift from production behavior if controller contracts change without test maintenance.

## Definition of Done
- [ ] The happy path is covered without external network calls.
- [ ] The tests exercise action entrypoint routing and controller orchestration.
- [ ] The test plan reflects the GitHub-native runtime rather than a Docker worker.
