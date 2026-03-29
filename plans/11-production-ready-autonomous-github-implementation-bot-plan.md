# Plan: Production-Ready Autonomous GitHub Implementation Bot

## Summary
We will bring the GitHub-native bot to a production-ready autonomy threshold for the workflow `spec in issue -> ready for planning -> ready for implementation`. The system should no longer be judged by whether it can produce plausible AI output, but by whether it can make trustworthy publication decisions for implementation PRs.

The final technical objective is:
- non-dialog planning and implementation
- explicit run-type semantics
- strong scope-confidence evaluation
- publication only when observed evidence justifies trust
- clear failure when that evidence is insufficient

This plan assumes the current baseline is already in place:
- planning is direct and non-dialog
- implementation summaries use git-observed changed files
- governance-only diffs are rejected
- broad vs child-subtask implementation already differs at a basic level

The remaining work is the final confidence layer that determines whether the bot is truly suitable for daily autonomous implementation use.

## Affected Files
- `src/core/implementation-workflow.ts`
- `src/core/parser.ts`
- `src/core/state-machine.ts`
- `src/bot/controller.ts`
- `src/bot/codex/runner.ts`
- `src/bot/git/manager.ts`
- `src/core/__tests__/implementation-workflow.test.ts`
- `src/core/__tests__/parser.test.ts`
- `src/core/__tests__/state-machine.test.ts`
- `src/bot/__tests__/controller.test.ts`
- `src/bot/codex/__tests__/runner.test.ts`

## New Files
- None required by default.
- Optional new pure helper files inside `src/core/` are acceptable if scope-confidence logic becomes too large for a single module.

## Architectural Layer Placement
- `src/core/implementation-workflow.ts` becomes the canonical home for publication-confidence rules and run-type-aware scope evaluation.
- `src/bot/controller.ts` gathers evidence, calls pure decision logic, and performs the GitHub-facing side effects.
- `src/bot/codex/runner.ts` receives compact execution constraints derived from run type, ownership expectations, and publication rules.
- `src/bot/git/manager.ts` stays a thin adapter for git facts and must not absorb workflow policy.
- `src/core/` remains pure and fully unit-testable.

## Data Access Changes
No persistent database changes are required. Durable outputs remain GitHub comments, labels, PR metadata, and repository diffs. If structured execution metadata is introduced, it should live in transient runner output or issue/PR comments, not in a new storage layer.

## Workflow / State Changes
- Keep `ready for planning` and `ready for implementation` as a direct non-dialog execution path.
- Formalize implementation run categories beyond the current broad split:
  - broad feature implementation
  - narrow feature implementation
  - child-subtask implementation
- Define publication thresholds per run type.
- Require publication decisions to combine:
  - observed changed files
  - production-file coverage
  - ownership alignment
  - verification outcomes
  - spec/plan scope signals
- Ensure that failure to satisfy publication confidence results in a hard no-publish outcome instead of a “best effort” PR.

## Tests to Add or Update
- Expand `src/core/__tests__/implementation-workflow.test.ts` to cover final publication-confidence cases:
  - broad feature with insufficient breadth
  - narrow feature with ownership mismatch
  - child-subtask with sibling-scope drift
  - verification-passing but scope-insufficient diff
  - strong diff with credible coverage that should publish
- Expand controller tests for final no-publish and publish-success paths.
- Expand runner tests so prompt contracts differ explicitly across broad feature, narrow feature, and child-subtask runs.
- Update parser or state-machine tests only if explicit run typing affects pure command/state behavior.

## Rollout Steps
1. Refine `src/core/implementation-workflow.ts` so it evaluates final publication confidence using explicit run-type thresholds instead of only lightweight heuristics.
2. Add ownership-alignment rules so child-subtask and narrow-feature runs must touch the expected primary implementation area before publication.
3. Add stronger scope-breadth rules so broad-feature runs must demonstrate credible coverage across multiple expected change areas.
4. Extend `src/bot/git/manager.ts` only if additional observable git facts are required, such as diff stats or file-status categories.
5. Update `src/bot/controller.ts` so implementation publication is driven entirely by core publication-confidence decisions plus verification evidence.
6. Tighten `src/bot/codex/runner.ts` prompts so each implementation run type receives a narrower execution corridor and clearer minimum completion expectations.
7. Improve PR summary generation so the publication rationale is visible to the human reviewer: what changed, what verification passed, and why the run met publication thresholds.
8. Add and update tests until the final autonomy threshold is covered by pure logic tests and controller integration tests.
9. Run targeted tests and the repository build to verify that the GitHub action entrypoint still compiles cleanly.

## Risks
- Final publication-confidence rules may become overly rigid if tuned too aggressively.
- Ownership-alignment rules may need careful repository-agnostic design to avoid overfitting naming conventions.
- Introducing more structured execution evidence may accidentally recreate prompt complexity if not kept minimal.
- The line between broad and narrow feature implementations must remain understandable and testable.

## Definition of Done
- [ ] Matches `specs/10-autonomous-implementation-confidence-hardening.md`.
- [ ] `ready for planning` and `ready for implementation` operate as a trustworthy non-dialog path for well-written specs.
- [ ] Broad feature, narrow feature, and child-subtask runs have explicit publication thresholds.
- [ ] Publication requires credible scope coverage as well as verification success.
- [ ] Ownership-mismatched and scope-insufficient runs are rejected before PR publication.
- [ ] PR summaries explain why the run qualified for autonomous publication using observed evidence.
- [ ] Publication-confidence logic lives primarily in pure, testable core helpers.
- [ ] Relevant core and bot tests cover the final autonomy-confidence rules.
- [ ] Repository build passes for the GitHub action entrypoint.
