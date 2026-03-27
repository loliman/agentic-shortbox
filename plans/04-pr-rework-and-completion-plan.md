# Plan: PR Rework and Completion Workflow

## Summary
To fully support the AI-First workflow lifecycle, we need to handle the post-implementation phases. This involves parsing instructions from Pull Request comments (e.g., `needs rework: fix the padding`) so the AI can iterate on its own code, rather than starting from scratch. Furthermore, upon a successful merge by a human reviewer, the AI will generate a final summary and automatically close the parent issue, explicitly transitioning the workflow state to `done`.

## Affected Files
- `src/core/parser.ts`: Expanding or ensuring our existing `needs rework: *` parser functionality is properly exposed to the PR domain.
- `src/core/state-machine.ts`: Adding the transitions for `in-review` -> `reworking` and `reworking` -> `in-review`, and `in-review` -> `done`.
- `src/github/api.ts`: Ensure it has Octokit support for creating PR-level comments, fetching PR diffs (for the final summary), and automatically closing issues.

## New Files
- `.github/workflows/ai-pr-orchestrator.yml`: A separate GitHub Action dedicated to monitoring Pull Requests (listening for `pull_request_review_comment`, `pull_request` edits, and `pull_request` closed/merged events).
- `src/github/pr-action.ts`: A dedicated TypeScript entrypoint to handle PR events, isolating PR webhook logic from standard Issue logic to keep boundaries extremely clean.
- `src/github/__tests__/pr-action.test.ts`: Robust Jest testing for PR payload resolution.

## Architectural Layer Placement
- **GitHub Trigger Layer (`src/github/pr-action.ts`)**: Direct edge boundary fetching PR webhooks.
- **API Handoff Layer (`src/github/api.ts`)**: Expanded to safely close issues and generate large payload summaries.

## Data Access Changes
- Interacts via GitHub API to fetch the PR's original parent issue number (either via branch name mappings or body parsings) so it can sync labels (`state:reworking`, `state:done`) back onto the source-of-truth Issue.

## Workflow / State Changes
- State loops during PR:
  - `implementing` (via AI PR Creation) ➔ `in-review`
  - `in-review` + `needs rework: ...` ➔ `reworking`
  - `reworking` (via AI PR update) ➔ `in-review`
  - `in-review` + (Human Merges) ➔ `done` (closes parent Issue).

## Tests to Add or Update
- Unit tests simulating PR event payloads (Closed vs Rework Commented).
- State Machine unit tests verifying the new PR-based state transition loops mapping accurately logic without crashing.

## Rollout Steps
1. **API Enhancements**: Expand `src/github/api.ts` to include `closeIssue(issueNumber)`, `getPullRequestDiff(prNumber)`, and `postPRComment(...)`.
2. **State Machine Additions**: Expand `src/core/state-machine.ts` with the new allowed PR-domain transitions.
3. **PR Action Entrypoint (`pr-action.ts`)**: Create the Node action file to securely decode `.yml` provided PR context data (checking if PR was authored by our specified Bot Identity).
4. **Draft PR Workflow (`ai-pr-orchestrator.yml`)**: Configure the trigger specifically on PR comments and the PR `closed` event.
5. **Merge Handoff**: Construct the logic ensuring a merged PR calculates the file diff summary and posts it to the parent issue, concluding with an auto-close.

## Risks
- **Mapping PRs to Parent Issues**: Pull Requests need a reliable way to map back to their parent issue for label state updates.
  - *Mitigation*: We will enforce that the AI always links the issue statically inside the PR body (e.g. "Resolves #123"), which the PR-Action will regex-extract, OR we pass it via Branch name convention (`ai-task/123-feature-name`).
- **Bot responding to external users' PRs**: If a human opens a PR, we don't want the bot summarizing it unless configured.
  - *Mitigation*: `.yml` job conditionally runs: `if: github.event.pull_request.user.login == 'github-actions[bot]'`.
- **Summary size limits**: Diff logic might crash GitHub's 65,536-character comment limit.
  - *Mitigation*: Implement a strict truncation utility when generating the PR completion summary.

## Definition of Done
- [ ] PR Action triggers on `needs rework: *`.
- [ ] Merge Action triggers on PR Close/Merge.
- [ ] Parent Issue is successfully closed automatically.
- [ ] Strict isolation logic prevents autonomous rewrites of Human PRs.
