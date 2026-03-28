# Feature: Deterministic PR Artifact Index Upsert

## Goal
Implement deterministic create-or-update behavior for a single `AI Artifact Index` pull request comment so that implementation, rework, and refinement runs always target the same bot-owned comment.

## User Value
Reviewers and issue owners see one stable summary location in the PR instead of multiple duplicate bot summaries, making review history clearer and easier to trust.

## Scope
- **In Scope:** Add explicit bot marker strategy for identifying the artifact index comment; implement upsert flow (find existing, update if found, create if missing) in PR comment orchestration; ensure only bot-authored marker comment is eligible for overwrite.
- **Out of Scope (Non-Goals):** No changes to command parsing semantics; no redesign of unrelated PR welcome/review comments; no GitHub Checks or timeline cleanup.

## Domain Context
This belongs in the orchestration layer where PR comment lifecycle is managed after bot actions. The repository emphasizes explicit workflow artifacts and deterministic state transitions, so comment identity must be explicit and machine-reliable.

## User Scenarios
1. Given a PR with no existing artifact index comment, when a qualifying bot run succeeds, then one `AI Artifact Index` comment is created with the bot marker.
2. Given a PR already containing the bot marker comment, when a subsequent qualifying run succeeds, then that same comment is updated rather than creating a second summary comment.
3. Given human-authored comments that contain similar wording but not the bot marker, when updating artifact index content, then those comments are never modified.

## Affected Areas
- Bot controller PR comment orchestration flow
- GitHub PR comment retrieval/update/create integration
- Bot-owned comment marker definition and matching

## UX / Behavior
The PR contains one clearly labeled `AI Artifact Index` comment maintained over time. The comment identity is explicit via a hidden marker token so update targeting is deterministic and safe.

## Business Rules
- At most one bot-owned artifact index comment may be active per PR workflow.
- Update-vs-create must be deterministic and based on explicit marker ownership.
- Human comments must not be overwritten.
- Artifact index maintenance occurs only after successful implementation/rework/refinement actions.

## Data Impact
No schema changes. Data impact is limited to GitHub PR comments (create/update/read).

## Architectural Placement
Implement in `src/bot/controller.ts` with minimal supporting helper(s) colocated in bot orchestration utilities if needed. No changes to `src/core/` parsing/state-machine logic.

## Risks
- Marker mismatch could cause duplicate comments.
- Overly broad matching could overwrite unintended bot comments.
- Missing PR context in some flows could skip expected updates.

## Test Plan
- Add controller tests for create path when marker comment does not exist.
- Add controller tests for update path when marker comment exists.
- Add controller tests proving non-marker comments are ignored for overwrite.
- Add regression test ensuring no duplicate artifact index comments from repeated successful runs.

## Definition of Done
- [ ] Deterministic upsert behavior implemented for artifact index comment.
- [ ] No human-authored comments are overwritten.
- [ ] Controller tests pass for create/update/ignore scenarios.
- [ ] No architecture violations.

## Open Questions
- Should legacy bot summary comments without marker be migrated or left untouched?
- If multiple marker comments already exist from historical bugs, should latest be updated and others preserved, or should one canonical comment be selected by a deterministic rule?
