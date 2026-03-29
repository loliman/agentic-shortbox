# Plan: Plan and Implementation Reliability Hardening

## Summary
We will harden the GitHub-native AI workflow so that it behaves like a predictable executor for the sequence `spec in issue -> ready for planning -> ready for implementation`. The technical focus is to move success decisions away from model self-report and toward observable repository facts, while also making run intent explicit enough that broad feature runs and narrow child-subtask runs are evaluated differently.

This plan assumes the recent baseline improvements are already in place:
- planning is non-dialog by default
- implementation PR summaries use actual working tree files
- governance-only implementation diffs are rejected

The remaining work is to make the workflow more intentional and harder to fool with plausible but weak model output.

## Affected Files
- `src/core/parser.ts`
- `src/core/state-machine.ts`
- `src/bot/controller.ts`
- `src/bot/codex/runner.ts`
- `src/bot/git/manager.ts`
- `src/core/__tests__/parser.test.ts`
- `src/core/__tests__/state-machine.test.ts`
- `src/bot/__tests__/controller.test.ts`
- `src/bot/codex/__tests__/runner.test.ts`

## New Files
- None required for the implementation itself.

## Architectural Layer Placement
- `src/core/` remains responsible for pure command and workflow semantics.
- `src/bot/codex/runner.ts` remains responsible for concise, command-specific execution prompts.
- `src/bot/controller.ts` remains the source of truth for runtime validation, publish gating, and GitHub-facing summaries.
- `src/bot/git/manager.ts` remains a thin git facts adapter and should not absorb workflow policy.

## Data Access Changes
No database or persistent application data changes are required. The only durable outputs are GitHub comments, labels, and PR metadata derived from repository state.

## Workflow / State Changes
- Keep `ready for planning` as a direct execution command with no clarification branch.
- Introduce an explicit internal notion of run type for implementation:
  - epic breakdown
  - main feature implementation
  - child subtask implementation
  - PR rework
  - PR refinement
- Use run type inside the controller and runner instead of relying only on title heuristics.
- Tighten completion rules so a run can be rejected even if Codex returns `completed`, when the observed diff is clearly inconsistent with requested scope.

## Tests to Add or Update
- Update parser tests so planning remains a direct non-dialog command.
- Add state-machine coverage if explicit run typing introduces new pure decision helpers.
- Add controller tests for insufficient-diff failure modes:
  - governance-only diff
  - test-only diff for production-code specs
  - broad main-feature issue with suspiciously tiny diff
- Add runner tests verifying different prompt contracts for explicit run types.
- Add tests for PR summary generation from git-observed files and verification evidence.

## Rollout Steps
1. Add an explicit implementation run classification helper in the controller layer so the bot can distinguish main-feature and child-subtask runs intentionally instead of inferring everything from the issue title.
2. Pass the classified run type into `CodexRunner.implementFeature(...)` so prompt behavior is driven by workflow semantics rather than title parsing.
3. Add stronger diff-quality heuristics in `src/bot/controller.ts` that evaluate whether the observed file changes are credible for the requested scope.
4. Extend `src/bot/git/manager.ts` only as needed to expose additional observable facts, such as staged file status or diff stats, without moving policy into the git layer.
5. Tighten implementation PR publishing so summaries, changed files, and completion status are derived from git and verification evidence first, with model text treated as secondary.
6. Add or update tests for parser, controller, runner, and any new pure helpers until the hardened workflow is explicitly covered.
7. Run targeted bot and core test suites, then a broader repository test pass if the changed surface area expands.

## Risks
- If diff-quality heuristics are too strict, legitimate small fixes may be rejected.
- If run classification is encoded inconsistently across layers, prompt behavior and publish gates may diverge.
- If we overfit heuristics to current repository conventions, the bot may become brittle in differently structured repos.
- If verification evidence is required too aggressively, repositories with partial tooling may see too many `partial` outcomes.

## Definition of Done
- [ ] Matches `specs/09-plan-and-implementation-reliability-hardening.md`.
- [ ] Planning and implementation remain non-dialog execution flows.
- [ ] Main-feature and child-subtask runs are classified intentionally and handled differently.
- [ ] Implementation PR publication requires a scope-credible observed diff.
- [ ] PR summaries are grounded in git-observed changes and verification evidence.
- [ ] Parser, controller, runner, and state-machine tests cover the hardened behavior.
- [ ] Code is formatted and linted.
