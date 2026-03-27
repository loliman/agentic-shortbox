# Plan: GitHub Issue Orchestrator

## Summary
The goal is to establish the core execution entry point for our AI agents via a GitHub Action. The action will listen specifically to `issue_comment` creation events. To adhere to pure layered architecture boundaries, the action encapsulates ONLY the GitHub-specific trigger logic. It securely extracts the relevant payload (Issue number, Author, Comment body) and delegates the actual processing to a pure Node.js script (`scripts/ai/entrypoint.js`). To prevent infinite execution loops, the workflow will strictly filter out any comments authored by bots.

## Affected Files
- None (Clean addition of a new feature).

## New Files
- `.github/workflows/ai-orchestrator.yml`: The GitHub Action configuration file acting as the initial trigger.
- `scripts/ai/entrypoint.js`: A stateless Node.js script acting as the main entrypoint logic, decoupled from GitHub Action specifics.
- `scripts/ai/__tests__/entrypoint.test.js`: Unit tests verifying the extraction logic.

## Architectural Layer Placement
- **Orchestrator Layer**: This module sits at the very edge of our architecture. It transforms external infrastructure events (GitHub API triggers) into internal programmatic calls (Node.js script execution). It handles no complex business semantics or state tracking.

## Data Access Changes
- None (Stateless executor).

## Workflow / State Changes
- Introduces an asynchronous trigger pipeline for AI tasks directly on the GitHub Issue interface. 
- Execution logs will be visible in the GitHub Actions Tab, maintaining a transparent execution trail.

## Tests to Add or Update
- Unit tests for `scripts/ai/entrypoint.js` to ensure the Node script handles different payload structures properly and securely.
- E2E testing: Manually trigger an issue comment in a test repository and monitor the Action runner logs.

## Rollout Steps
1. **Create Node.js Entrypoint**: Implement `scripts/ai/entrypoint.js`. The script will be designed to read the payload via command-line arguments or environment variables. This keeps it purely Node.js and easy to test locally.
2. **Implement Unit Tests**: Create `scripts/ai/__tests__/entrypoint.test.js` to mock various incoming arguments and assert correct internal parsing.
3. **Create GitHub Workflow**: Implement `.github/workflows/ai-orchestrator.yml` targeting the `issue_comment` `created` event type.
4. **Implement Safeguards within the Workflow**: Add conditional check `if: github.event.comment.user.type != 'Bot'` to the workflow jobs.
5. **Data Extraction & Handoff**: Construct the action steps to pass `github.event.issue.number`, `github.event.comment.user.login`, and `github.event.comment.body` as explicit environment variables (e.g., `ISSUE_NUMBER`, `COMMENT_AUTHOR`, `COMMENT_BODY`) down to the `node scripts/ai/entrypoint.js` execution to keep boundaries clean.

## Risks
- **Infinite execution loops**: A bot responding to an issue could trigger another webhook.
  - *Mitigation*: The `if` condition on the job level (`github.event.comment.user.type != 'Bot'`) strictly prevents this.
- **Unsanitized Payload / Injection**: If the comment body contains executable characters passed insecurely to shell.
  - *Mitigation*: Passing the metadata via Environment Variables within the GitHub Action (e.g., `env: COMMENT_BODY: ${{ github.event.comment.body }}`) is the safest standard to prevent command injection, prior to reading them confidently in `process.env` via Node.js.
- **Secret leakage**: 
  - *Mitigation*: Limit the payload explicitly. We will not pass `GITHUB_TOKEN` to the entrypoint unless the subsequent orchestration explicitly requires API writes (left out of scope for the pure extraction boundary).

## Definition of Done
- [ ] Matches Feature Spec.
- [ ] Boundaries respected.
- [ ] Code is formatted and linted.
- [ ] Action fires on comment creation.
- [ ] Extracts Issue number, Author, and Body.
- [ ] Ignores bot comments.
- [ ] Passes payload securely to the Node.js entrypoint script.
