# Feature: AI Worker Engine & Workflow Operations

## Goal
Build the robust implementation of the external AI Worker Engine API. It securely receives commands from the GitHub Orchestrator Guard, assumes full control of its own Workflow State (via its own GitHub API instance), prepares model prompts based on the labels, and performs hard Git/Repository operations to deliver code and plans.

## User Value
Turns the "planning" and "implementing" commands into real actionable results. The Bot operates just like a human developer: it clones the code, reads the issue, pushes commits back, and requests reviews.

## Scope
- **In Scope:** 
  - An API Webhook receiver endpoint.
  - Integration with the chosen LLM backend (based on the `model:` tier passed in the config).
  - GitHub Octokit integrations to manually set `state:planning`, `state:planned`, `state:implementing`, and `state:in-review` dynamically as the engine progresses.
  - Complete Git operation flows: creating branches, pulling code, generating patches/commits, and opening Pull Requests.
  - Implementing the "Fix Chain" (updating an existing PR with new commits).
  - **Dockerization (Zero-Config Deployment):** A fully bundled `Dockerfile` / `docker-compose.yml` that only requires a `.env` file containing `GITHUB_TOKEN` and API keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`).
- **Out of Scope (Non-Goals):** 
  - Polling GitHub for comments (we rely on the Orchestrator Webhook PUSH).

## Domain Context
This forms the core "Execution Engine" of the entire AI-first repository architecture, honoring the boundaries established in `AI_FIRST_AGENT_SPEC.md`.

## User Scenarios
1. **Given** an API request for an `implement` command on `external-org/cool-project`, **When** the workflow starts, **Then** the Agent sets the GitHub Issue label on that specific remote project to `state:implementing`.
2. **Given** model generation finishes, **When** code is produced, **Then** the Agent uses the provided repo context to clone `external-org/cool-project`, creates a new branch, pushes commits, creates a Pull Request back on that repo, assigns the human trigger-author for review, and updates the state to `state:in-review`.
3. **Given** a `rework` command arrives for an existing PR, **Then** the Agent checks out the existing PR branch from the remote repo, applies the incremental fixes requested, pushes a new commit to the origin, and pings the author.

## Affected Areas
- `src/agents/` (or a completely isolated server application infrastructure block, depending on hosting strategy – for our repo context, we will build a placeholder or standalone worker node app inside `src/worker/`).
- GitHub API interactions (Octokit).
- Local Git file-system executions (or isomorphic Git libraries like `isomorphic-git`).

## UX / Behavior
- Transparent Status: The Agent sets `planning` explicitly while the LLM generates tokens. 
- Iterative Feedback: Commits are small and incremental.

## Business Rules
- The worker MUST strictly respect the model tier requested (`model:strong` vs `model:fast`).
- The worker MUST set the correct `state:` label immediately before doing heavy workloads to prevent duplicate manual commands.
- The worker MUST assign the human who wrote the command as a Reviewer to the newly created Pull Request.
- **Deployability**: The server must be completely stateless between runs and configured 100% via environment variables (`.env`). "Start image, it runs." There must be no manual setup steps inside the container.

## Test Plan
- Unit tests verifying Webhook authentication handlers.
- End-to-end tests mapping the prompt generation layer securely.

## Definition of Done
- [ ] API Endpoint defined and authenticated.
- [ ] Agent actively manages GitHub Issue state before and after workflow runs.
- [ ] Agent can execute git operations and open a targeted PR.
- [ ] End-to-end logic handles Planning, Implementation, and Rework flows correctly.
