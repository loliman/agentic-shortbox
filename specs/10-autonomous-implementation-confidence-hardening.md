# Feature: Production-Ready Autonomous GitHub Implementation Bot

## Goal
Establish the GitHub-native bot as a production-ready autonomous implementation bot for the workflow `spec in issue -> ready for planning -> ready for implementation`. A human must be able to provide a high-quality feature spec, review the generated plan, trigger implementation, and trust that the bot will either publish a scope-credible implementation PR or fail cleanly before publication.

## User Value
Developers can use the bot as a real autonomous implementation worker in daily GitHub workflows instead of as an experimental assistant. The human role is spec author, plan reviewer, and PR reviewer, not constant babysitter of unclear runs or misleading success claims.

## Scope
- **In Scope:**
  - Defining a final publishability model for implementation runs where PR creation depends on both execution evidence and credible scope coverage.
  - Requiring the bot to distinguish broad feature runs, narrow feature runs, and child-subtask runs using explicit workflow semantics rather than weak inference.
  - Enforcing minimum implementation evidence for each run type, including ownership alignment, affected production areas, and verification sufficiency.
  - Rejecting “thin success” runs where Codex returns `completed` but the observed repository changes are too weak, too narrow, or misaligned with the spec and plan.
  - Tightening implementation prompts so the model operates inside a narrower execution corridor with fewer ways to satisfy the prompt text while missing the real job.
  - Producing PR summaries that justify why the run is publishable using observed repository state and verification evidence.
  - Preserving the non-dialog contract for planning, implementation, rework, and refinement.
- **Out of Scope (Non-Goals):**
  - Eliminating human PR review entirely.
  - Building a general-purpose issue management platform outside the current GitHub-native bot workflow.
  - Solving downstream repository quality problems such as flaky tests, broken CI, or missing specs.

## Domain Context
This feature defines the end-state behavior of the repository's AI-first orchestration model. Earlier work established command-driven planning, repository-native implementation, non-dialog execution, and stronger diff-based publication rules. The system must now reach the final confidence level required for real daily autonomous use rather than supervised experimentation.

## User Scenarios
1. **Given** a well-written feature spec in a GitHub issue, **When** the user comments `ready for planning`, **Then** the bot produces a usable implementation plan without starting a dialog.
2. **Given** an approved plan, **When** the user comments `ready for implementation`, **Then** the bot either opens a scope-credible PR or fails clearly before publication.
3. **Given** a broad feature issue touching multiple areas, **When** the bot claims the work is complete, **Then** the controller verifies that the observed diff plausibly covers the requested breadth before allowing publication.
4. **Given** a child subtask issue with a clearly bounded ownership area, **When** the bot claims completion, **Then** the result must change that ownership area and avoid drifting into sibling scope.
5. **Given** a run where tests pass but the actual code changes are too thin for the requested feature, **When** the bot evaluates publication, **Then** the run is rejected rather than published as a misleading success.
6. **Given** a run that is genuinely implementation-complete for its scope, **When** the PR is opened, **Then** the PR summary should explain what changed, what verification passed, and why the run qualified for autonomous publication.

## Affected Areas
- `src/core/implementation-workflow.ts`
- `src/core/parser.ts`
- `src/core/state-machine.ts`
- `src/bot/controller.ts`
- `src/bot/codex/runner.ts`
- `src/bot/git/manager.ts`
- `src/core/__tests__/`
- `src/bot/__tests__/`

## UX / Behavior
- The bot remains non-dialog during planning, implementation, rework, and refinement.
- A bot PR should feel meaningfully earned: it exists because the run crossed clear publication thresholds, not merely because Codex returned `completed`.
- Failed implementation runs should explain whether the problem was scope insufficiency, ownership mismatch, verification failure, or inconsistent execution evidence.
- Main-feature runs, narrow feature runs, and child-subtask runs should behave differently in both prompt guidance and publication gating.
- The bot should feel strict, predictable, and trustworthy rather than optimistic or conversational.
- The system should be suitable for daily autonomous implementation use in well-specified GitHub workflows.

## Business Rules
- A completed implementation is valid only when execution evidence, verification evidence, and scope coverage are all strong enough for the declared run type.
- Verification success alone is not enough; the observed diff must still credibly satisfy the requested feature scope.
- Main-feature runs must satisfy stricter breadth thresholds than narrow feature runs, and narrow feature runs must satisfy stricter thresholds than child-subtask runs.
- Child-subtask runs must show explicit ownership alignment with the assigned primary implementation area.
- The controller must reject ambiguous “maybe good enough” runs instead of publishing them as completed PRs.
- Any machine-readable execution metadata introduced for validation is secondary evidence only; actual repository state remains the primary truth source.
- The system must remain non-dialog in execution modes even when scope confidence is low; low confidence results in failure, not follow-up questions.
- The bot must be evaluated against the standard of trustworthy autonomous publication, not merely helpful assistance.

## Data Impact
No database changes are expected. Additional structured execution metadata may be emitted in comments or runner output if needed for validation, but publication decisions must remain grounded primarily in repository diff and verification evidence.

## Architectural Placement
- `src/core/implementation-workflow.ts` should become the primary home for pure scope-confidence and publication-decision logic.
- `src/bot/controller.ts` should orchestrate evidence gathering and call pure decision helpers, but should not absorb large heuristic rule sets directly.
- `src/bot/codex/runner.ts` should receive compact, explicit execution constraints derived from run type, ownership area, and minimum completion expectations.
- `src/bot/git/manager.ts` should expose only the minimal additional git facts needed to support stronger publication decisions.

## Risks
- Publication thresholds can become brittle if they rely too heavily on naming conventions instead of stable structural signals.
- Overly strict gates could reject legitimate narrow implementations and reduce user trust in another direction.
- If structured execution evidence becomes too elaborate, the system could recreate prompt overengineering in a different form.
- Broad-feature scope-confidence rules may need careful tuning across repositories with different codebase structures.

## Test Plan
- Add pure unit tests for final publication-decision helpers in `src/core/implementation-workflow.ts`.
- Add controller tests for broad-feature insufficiency, ownership mismatch, thin-but-passing diffs, and publication rejections despite optimistic model output.
- Add runner tests proving that broad feature, narrow feature, and child-subtask runs receive different minimum completion expectations.
- Add tests for any structured execution metadata parsing if it is introduced.
- Keep non-dialog planning and execution behavior covered.

## Definition of Done
- [ ] `ready for planning` and `ready for implementation` form a trustworthy non-dialog execution path for well-written specs.
- [ ] Completed implementation PR publication requires execution evidence, verification evidence, and scope-confidence checks to pass.
- [ ] Broad feature, narrow feature, and child-subtask runs use intentionally different publication thresholds.
- [ ] Scope-insufficient runs are rejected even when verification passes.
- [ ] Ownership-mismatched child-subtask runs are rejected.
- [ ] PR summaries explain why a run qualified for publication using observed evidence.
- [ ] Controller logic remains thin and delegates publication heuristics to pure, testable core logic.
- [ ] Relevant core and bot tests cover the final autonomy-confidence behavior.
- [ ] The resulting bot behavior is suitable for daily autonomous use on well-specified implementation issues.

## Open Questions
- [ ] Which structural signals should count most for publication confidence: changed files, ownership areas, acceptance-criteria coverage, or verification evidence?
- [ ] Should the bot emit lightweight structured execution evidence that the controller can compare against the observed diff?
- [ ] Do we want separate publication thresholds for bug fixes, narrow enhancements, and broad feature implementations?
