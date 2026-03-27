# Plan: Workflow State Machine

## Summary
To ensure agents follow the rigorous "Plan before Implement" architecture laid out in `AI_FIRST_AGENT_SPEC.md`, we will build a Workflow State Machine. This module dictates legal workflow transitions based on incoming commands and the repository's current state (tracked via `state:*` GitHub labels). It prevents chaotic AI execution by cleanly terminating out-of-order commands (e.g., jumping from `idle` straight to `implementing`) and informing the user via an automated GitHub comment.

## Affected Files
- `src/github/action.ts`: Must be updated to evaluate the current state via issue labels before executing further AI logic. It will orchestrate the state transitions and dictate whether to abort based on the State Machine's evaluation.
- `.github/workflows/ai-orchestrator.yml`: Needs to pass a valid `GITHUB_TOKEN` to the action context so that Octokit can update labels and post comments. (e.g., `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`).

## New Files
- `src/core/state-machine.ts`: Contains the pure semantic state transition matrix (`idle` -> `planning` -> `planned` -> `implementing` -> `review` -> `done`/`reworking`). Calculates allowed state shifts based on commands.
- `src/core/__tests__/state-machine.test.ts`: Jest tests verifying all legal and illegal matrix traversals.
- `src/github/api.ts`: A dedicated GitHub API integration module wrapping Octokit. It will handle adding/removing `state:*` labels and posting explanatory comments to the issue.

## Architectural Layer Placement
- **Core Logic Layer (`src/core/state-machine.ts`)**: Pure deterministic state logic. No side effects.
- **GitHub Application Layer (`src/github/api.ts`)**: Network barrier. Encapsulates all GitHub API REST calls, keeping the core pure.

## Data Access Changes
- The application will now read and mutate GitHub Issue Labels (`state:*`) and Issue Comments via the GitHub REST API. State is explicitly offloaded to GitHub as the single source of truth.

## Workflow / State Changes
- Allowed Transitions:
  - `idle` + `ready to plan` ➔ `planning`
  - `planning` + (Agent completes plan) ➔ `planned`
  - `planned` + `ready to implement` ➔ `implementing`
  - Any illegal transition (e.g., `idle` + `ready to implement`) ➔ State unchanged, throws `IllegalTransitionError`.

## Tests to Add or Update
- Exhaustive Jest tests (`state-machine.test.ts`) covering every node in the transition matrix.
- `action.test.ts` update to mock GitHub API calls and verify the orchestrator handles `IllegalTransitionError` by posting a comment gracefully rather than crashing silently.

## Rollout Steps
1. **API Integration (`src/github/api.ts`)**: Implement Octokit helper functions `setIssueStateLabel(issueNumber, newState)` and `postIssueComment(issueNumber, body)`.
2. **State Machine (`src/core/state-machine.ts`)**: Implement `evaluateTransition(currentState, command)`. Define error classes like `IllegalTransitionError`.
3. **Unit Tests**: Implement tests for the state machine.
4. **Action Integration**: Update `.yml` to provide the `GITHUB_TOKEN`. Update `src/github/action.ts` to instantiate Octokit, extract the `state:*` label from the parsed labels payload, compute the new state, catch illegal transitions to post a comment, and finally update the `state:*` GitHub label to reflect the new state.

## Risks
- **Race conditions**: Rapid-fire comments crossing each other.
  - *Mitigation*: GitHub Actions execute synchronously relative to the triggered event sequence. But state overrides might happen if issues are edited manually. Trust the GitHub State Label as absolute truth at the moment the webhook triggered.
- **API Token Permissions**: The default `GITHUB_TOKEN` must have write permissions for Issues/PRs.
  - *Mitigation*: Verify and add `permissions: issues: write` and `pull-requests: write` in `.github/workflows/ai-orchestrator.yml`.

## Definition of Done
- [ ] Matrix mapping `[Current State] + [Command] -> [New State]` exists.
- [ ] Updates GitHub Issue labels to reflect the internal state dynamically.
- [ ] Explains failures to users via automated comments.
- [ ] Enforces Plan-Approval choke-point.
