# Plan: Feature 08 - Happy Path E2E Testing (Mocked APIs)

## Summary
The current E2E test fails due to "Unauthorized" since we don't provide real tokens for GitHub/OpenAI in the CI sandbox. We want a perfect, pristine "Happy Path" test that asserts the Worker Docker Container boots up, receives a webhook, executes Git logic, requests OpenAI plans, and interacts with GitHub APIs flawlessly.

We achieve this by mocking the external network APIs and bypassing the raw external git protocol, while testing 100% of our actual Docker image routing logic.

## Affected Files
- `src/worker/provider/github.ts`
- `src/worker/llm/client.ts`
- `src/worker/git/manager.ts`
- `src/worker/__tests__/e2e.test.ts`

## New Files
- None

## Architectural Layer Placement
This affects the Worker Engine's Infrastructure interfaces (Git, LLM, Github).

## Data Access Changes
- `github.ts`: Octokit initialization respects an optional `GITHUB_API_URL` override if present.
- `client.ts`: OpenAI initialization respects `OPENAI_BASE_URL`.
- `manager.ts`: Exposes a strict `MOCK_NETWORK_GIT` bypass boolean purely for neutralizing network errors in testing.

## Workflow / State Changes
The Docker container behaves exactly the same but redirects its HTTP traffic to our Jest runner's local mock server on `host.docker.internal`.

## Tests to Add or Update
- `e2e.test.ts`:
  1. Boot a temporary Mock Express API server on the host machine.
  2. Implement mock endpoints for `/repos/owner/repo/pulls` and `/chat/completions`.
  3. Start Testcontainer with `GITHUB_API_URL=http://host.docker.internal:<port>`.
  4. Fire webhook.
  5. Assert that the mock server received the expected HTTP requests from the container!

## Rollout Steps
1. Add URL overrides to Worker logic.
2. Spin up local mock API server in Jest.
3. Assert requests hit the mock server.

## Risks
- Resolving `host.docker.internal` within an Alpine Linux container can be tricky on Linux environments compared to Mac/Windows. Testcontainers handles gateway routing smoothly, but we may need to inject the host IP manually if resolving fails.

## Definition of Done
- [ ] Worker supports API Base URL overrides.
- [ ] `MOCK_NETWORK_GIT` neutralizes git remote networks.
- [ ] E2E Test executes the entire LLM/GitHub loop using the Mock Server successfully (HTTP 202 -> Octokit Mock -> PR created).
