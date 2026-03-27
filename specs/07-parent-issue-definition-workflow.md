# Feature: Parent Issue Definition Workflow (Epic Splitting)

## Goal
Enable humans to quickly delegate large, coarse-grained feature ideas ("Epics") to the AI agent, instructing the agent to break down the monolithic idea into smaller, actionable specification issues using the repository's standard templates.

## User Value
Reduces the cognitive load and manual writing effort for developers when scoping out large features. The LLM handles the 80% heavy-lifting of writing boilerplate specs, and the human only needs to refine the final child issues.

## Scope
- **In Scope:** 
  - A new orchestration command: `ready to define`.
  - The AI Worker breaking down a parent issue's prompt into multiple discrete sub-tasks.
  - Generating complete Markdown specs for each sub-task based exclusively on the local `specs/templates/feature-spec.md` template.
  - Creating new GitHub issues for each generated specification through the GitHub API.
  - Editing the Parent Issue to include a linked To-Do checklist tracking the newly spawned child issues.
  - Graceful failing if the target template file is missing.
- **Out of Scope (Non-Goals):** 
  - Actually implementing the code for all issues at once (sub-tasks must be planned/implemented individually via `ready to plan`).

## Domain Context
Fits within the early "Specification Phase" of `AI_FIRST_AGENT_SPEC.md`. Introduces a "Definition" state prior to the "Planning" state for large feature containers.

## User Scenarios
1. **Given** a rough massive feature request in an issue, **When** the user comments `ready to define`, **Then** the AI Worker generates 3 new child issues (each containing a properly formatted specification matching the template), and updates the parent issue with `- [ ] #101`, `- [ ] #102`, `- [ ] #103`.
2. **Given** the user commands `ready to define`, **When** the `specs/templates/feature-spec.md` file is missing from the repository, **Then** the Worker aborts immediately, posting a comment: "Cannot define specifications. The required template `specs/templates/feature-spec.md` is missing from the repository."
3. **Given** the user commands `ready to plan` on an issue, **When** no `plans/templates/implementation-plan.md` exists, **Then** the Worker aborts with a graceful error comment instead of halluzinating a random plan layout.

## Affected Areas
- **Orchestrator Guard (`src/core/parser.ts`)**: Must recognize `ready to define` as a valid command intent.
- **Orchestrator Guard (`src/core/state-machine.ts`)**: Must allow transitioning from `idle` to `defining` (and back to `idle` upon completion, as Epics themselves aren't code-implemented).
- **AI Worker Engine**: Needs new logic to read local templates via the GitHub API (or local filesystem clone), loop through the LLM response to map child issues, and create multiple issues sequentially.

## UX / Behavior
- The Parent Issue operates solely as an Epic tracker (a table of contents).
- Real work only happens inside the newly generated Child Issues.

## Business Rules
- The AI Worker MUST NOT invent its own specification structure. It must enforce the template provided in `specs/templates/feature-spec.md`.
- Similarly, the `ready to plan` command MUST enforce `plans/templates/implementation-plan.md` (if the file is absent, failing cleanly is required).
- Wait for child issue creation to complete before updating the Parent Issue to avoid broken links.

## Test Plan
- Mock the file system / GitHub contents API to simulate missing template files and verify the graceful exit comment.
- Mock the LLM output yielding multiple sub-tasks and verify the loop successfully creates multiple mock GitHub issues.

## Definition of Done
- [ ] Orchestrator accepts `ready to define`.
- [ ] Worker checks for `specs/templates/feature-spec.md` existence.
- [ ] Worker breaks down features into distinct issues.
- [ ] Parent issue is updated with checklist.
- [ ] Worker universally validates `plans/templates/...` on `ready to plan` runs.
