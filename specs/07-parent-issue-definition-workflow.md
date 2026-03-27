# Feature: Parent Issue Definition Workflow (Epic Splitting)

## Goal
Enable humans to quickly delegate large, coarse-grained feature ideas ("Epics") to the AI agent, instructing the agent to break down the monolithic idea into smaller, actionable specification issues using the repository's standard templates.

## User Value
Reduces the cognitive load and manual writing effort for developers when scoping out large features. The LLM handles the 80% heavy-lifting of writing boilerplate specs, and the human only needs to refine the final child issues.

## Scope
- **In Scope:** 
  - A new orchestration command: `ready for specification`.
  - The native bot breaking down a parent issue's prompt into multiple discrete sub-tasks.
  - Generating complete Markdown specs for each sub-task based exclusively on the local `specs/templates/feature-spec.md` template.
  - Creating new GitHub issues for each generated specification through the GitHub API.
  - Editing the Parent Issue to include a linked To-Do checklist tracking the newly spawned child issues.
  - Graceful failing if the target template file is missing.
- **Out of Scope (Non-Goals):** 
  - Actually implementing the code for all issues at once (sub-tasks must be planned or implemented individually through the normal command flow).

## Domain Context
Fits within the early specification phase of the GitHub-native workflow. Introduces a definition state prior to planning for large feature containers.

## User Scenarios
1. **Given** a rough massive feature request in an issue, **When** the user comments `ready for specification`, **Then** the bot generates child issues and updates the parent issue with a checklist.
2. **Given** the user commands `ready for specification`, **When** the `specs/templates/feature-spec.md` file is missing from the repository, **Then** the bot aborts immediately with a clear error comment.
3. **Given** the user commands `ready for planning` on an issue, **When** no `plans/templates/implementation-plan.md` exists, **Then** the bot aborts with a graceful error comment instead of inventing a random plan layout.

## Affected Areas
- **Orchestrator Guard (`src/core/parser.ts`)**: Must recognize `ready for specification` as a valid command intent.
- **Orchestrator Guard (`src/core/state-machine.ts`)**: Must allow transitioning from `idle` to `defining` (and back to `idle` upon completion, as Epics themselves aren't code-implemented).
- **Native Bot Controller**: Needs logic to read local templates from the checked-out repository, map child tasks from the LLM response, and create multiple issues sequentially.

## UX / Behavior
- The Parent Issue operates solely as an Epic tracker (a table of contents).
- Real work only happens inside the newly generated Child Issues.

## Business Rules
- The bot MUST NOT invent its own specification structure. It must enforce the template provided in `specs/templates/feature-spec.md`.
- Similarly, the `ready for planning` command MUST enforce `plans/templates/implementation-plan.md` if planning is template-driven.
- Wait for child issue creation to complete before updating the Parent Issue to avoid broken links.

## Test Plan
- Mock the file system / GitHub contents API to simulate missing template files and verify the graceful exit comment.
- Mock the LLM output yielding multiple sub-tasks and verify the loop successfully creates multiple mock GitHub issues.

## Definition of Done
- [ ] Orchestrator accepts `ready for specification`.
- [ ] Bot checks for `specs/templates/feature-spec.md` existence.
- [ ] Bot breaks down features into distinct issues.
- [ ] Parent issue is updated with checklist.
- [ ] Bot validates required templates on specification or planning runs.
