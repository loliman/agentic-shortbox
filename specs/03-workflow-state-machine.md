# Feature: Workflow State Machine

## Goal
Ensure the AI workflow progresses logically (Spec -> Plan -> Implement) and prevent out-of-order execution (e.g., Implementing without a Plan).

## User Value
Protects the repository from wild AI modifications by enforcing human chokepoints (Plan Approval). Agents cannot jump straight to PR creation.

## Scope
- **In Scope:** Tracking state using GitHub Issue Labels (or status). Validating allowed transitions. Posting explanatory comments when illegal transitions are attempted.
- **Out of Scope (Non-Goals):** Actually reading/writing the specs or plans from the disk.

## Domain Context
Implements Section 7 (Workflow Phases) and Section 8 (Workflow State Model) of `AI_FIRST_AGENT_SPEC.md`.

## User Scenarios
1. **Given** state `idle`, **When** user triggers `ready for implementation`, **Then** the system replies that implementation cannot begin without an approved plan.
2. **Given** state `planning`, **When** the AI finishes creating the plan, **Then** state transitions to `planned`.
3. **Given** state `planned`, **When** user triggers `ready for implementation`, **Then** state transitions to `implementing` and execution starts.

## Affected Areas
- `scripts/ai/state-machine.js` (NEW)
- GitHub API integration helper.

## UX / Behavior
- Visible GitHub Labels update dynamically to show current status: `state:idle`, `state:planning`, `state:planned`, `state:implementing`, `state:failed`.
- Unlawful commands trigger a bot comment explaining the correct next step.

## Business Rules
- Implementation Phase CANNOT begin unless Planning Phase is marked as completed successfully.
- If an agent task crashes, the state transitions to `failed` to prevent infinite retries.

## Architectural Placement
- `scripts/ai/` layer, requiring access to GitHub metadata abstraction objects.

## Risks
- Race conditions if multiple commands are posted rapidly.

## Test Plan
- Unit tests for the state transition matrix asserting allowed/denied paths.

## Definition of Done
- [ ] Matrix mapping `[Current State] + [Command] -> [New State]` exists.
- [ ] Updates GitHub Issue labels to reflect the internal state.
- [ ] Explains failures to users via automated comment.
