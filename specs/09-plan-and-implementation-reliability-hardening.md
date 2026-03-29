# Feature: Plan and Implementation Reliability Hardening

## Goal
Improve the GitHub-native AI workflow so that a human can place a feature spec in an issue, trigger `ready for planning`, review the generated plan, trigger `ready for implementation`, and receive a meaningfully scoped, trustworthy result without dialog loops or misleading completion claims.

## User Value
Developers can treat the bot as a predictable executor instead of a conversational assistant. This reduces supervision overhead, improves trust in generated plans and PRs, and makes the workflow usable for real feature delivery instead of only experimentation.

## Scope
- **In Scope:**
  - Tightening the planning flow so `ready for planning` always returns a usable implementation plan instead of clarification questions.
  - Introducing explicit execution semantics for run types such as epic breakdown, main feature implementation, and child subtask implementation.
  - Strengthening publish gates so the bot only opens implementation PRs when the real repository diff matches the intended scope closely enough.
  - Adding scope-aware heuristics that detect weak runs such as test-only diffs for code-heavy specs or thin diffs for broad feature runs.
  - Making completion and PR summaries rely primarily on observable facts such as git diff, changed production files, and verification results.
  - Preserving the non-dialog workflow for implementation, rework, and refinement runs.
- **Out of Scope (Non-Goals):**
  - Replacing Codex with another model provider.
  - Adding human approval checkpoints inside a single bot run.
  - Building a generic project management system beyond the current GitHub issue and PR workflow.

## Domain Context
This feature refines the repository's core AI-first operating model. The repository already defines command-driven orchestration, issue-based specs, plan generation, and repository-native implementation. This work hardens that model so the bot behaves more like a stateful executor and less like a chat assistant.

## User Scenarios
1. **Given** a sufficiently detailed feature spec in a GitHub issue, **When** the user comments `ready for planning`, **Then** the bot returns a concrete implementation plan instead of requesting clarification.
2. **Given** a broad main feature issue, **When** the user comments `ready for implementation`, **Then** the bot prioritizes the highest-leverage in-scope work and does not present a tiny edge-case diff as a complete implementation.
3. **Given** a child subtask issue, **When** the user comments `ready for implementation`, **Then** the bot stays tightly within the subtask scope and does not drift into sibling responsibilities.
4. **Given** a run where Codex claims completion but only edits tests or governance artifacts, **When** the controller evaluates the result, **Then** the bot aborts or marks the run incomplete instead of opening a misleading PR.
5. **Given** an implementation PR opened by the bot, **When** the human reviews the summary, **Then** the listed changed files and completion claims reflect the actual repository diff and executed verification.

## Affected Areas
- `src/core/parser.ts`
- `src/core/state-machine.ts`
- `src/bot/controller.ts`
- `src/bot/codex/runner.ts`
- `src/bot/git/manager.ts`
- `src/core/__tests__/`
- `src/bot/__tests__/`

## UX / Behavior
- `ready for planning` behaves as a direct execution command, not a conversation starter.
- `ready for implementation` either produces a mergeable PR with a trustworthy summary or fails clearly with concrete reasons.
- Main feature runs and child subtask runs follow different scope expectations.
- The bot should prefer a clear failure over a polished but misleading success message.

## Business Rules
- Planning must be non-dialog by default. If a spec is imperfect, the bot should make conservative assumptions and still produce a plan.
- Implementation, rework, and refinement runs must not ask follow-up questions.
- A completed implementation PR must be grounded in the actual git diff, not only in model self-report.
- A run is invalid if the observed diff is inconsistent with the claimed scope or too weak for the requested feature size.
- Child subtasks must remain narrowly scoped and independently reviewable.
- Broad main-feature runs must not be marked complete when only a trivial subset was delivered.

## Data Impact
No persistent database schema changes are expected. The main data impact is on transient workflow artifacts, GitHub comments, labels, and PR summaries.

## Architectural Placement
- `src/core/` should continue to hold pure command and workflow-state logic.
- `src/bot/codex/runner.ts` should encode concise, execution-oriented instructions for each run type.
- `src/bot/controller.ts` should own the runtime quality gates that compare model claims against observable repository state.
- `src/bot/git/manager.ts` should expose the minimal git facts needed for controller-level validation.

## Risks
- Overly aggressive scope gates could reject legitimate narrow fixes if heuristics are too rigid.
- Too much run-type specialization could make the workflow harder to maintain if encoded implicitly instead of explicitly.
- Verification-based gating can become noisy if repositories have flaky or incomplete test setups.
- If prompts remain too long, future model iterations may still regress toward polished self-reporting instead of precise execution.

## Test Plan
- Add parser tests verifying that planning remains a direct, non-dialog command.
- Add controller tests that reject implementation runs with governance-only diffs or obviously insufficient diffs for code-heavy specs.
- Add runner tests covering main-feature vs child-subtask prompt differences.
- Add tests for diff-based PR summary generation so reported changed files come from git state rather than model claims.
- Add state-machine tests if explicit run typing introduces new workflow distinctions.

## Definition of Done
- [ ] `ready for planning` always produces a plan artifact rather than a clarification response.
- [ ] Implementation publish gates use actual repository diff data as the primary truth source.
- [ ] The bot distinguishes main-feature and child-subtask implementation behavior intentionally.
- [ ] Weak or misleading implementation runs are rejected or marked incomplete instead of being published as successful PRs.
- [ ] PR summaries reflect observable changed files and verification results.
- [ ] Relevant parser, controller, runner, and state-machine tests cover the hardened workflow.

## Open Questions
- [ ] Should run type become an explicit workflow property derived from issue metadata, labels, or issue hierarchy rather than title heuristics?
- [ ] How strict should insufficient-diff detection be for small bug fixes versus broader feature specs?
- [ ] Should the bot persist machine-readable execution metadata in comments to support stronger post-run validation?
