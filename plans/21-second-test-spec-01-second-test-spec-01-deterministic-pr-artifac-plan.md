# Implementation Plan: Deterministic PR Artifact Index Upsert

## 1) Scope & Governance Alignment

### Objective
Implement deterministic create-or-update behavior for a single bot-owned `AI Artifact Index` PR comment so repeated successful runs (`implementation`, `rework`, `refinement`) update one stable comment instead of creating duplicates.

### In-Scope
- Define an explicit hidden marker token for artifact index ownership.
- Implement upsert flow in bot orchestration:
  - list PR comments
  - find eligible bot-owned marker comment
  - update when found
  - create when missing
- Restrict overwrite eligibility to marker-qualified bot-authored comments only.
- Add/extend controller-layer tests for create/update/ignore/no-duplicate behavior.

### Out-of-Scope
- Any command parsing/state-machine changes in `src/core/`.
- Redesign of other PR comments (welcome/review/other summaries).
- Timeline cleanup, migration tools, or GitHub Checks integration.

### Architectural Constraints
- Keep logic in orchestration layer (`src/bot/`), centered in `src/bot/controller.ts`.
- Preserve `src/core/` purity (no side effects added there).
- Use existing GitHub provider abstractions for PR comment IO.
- Keep changes incremental and minimal, consistent with repository layering guidance.

## 2) Current-State Analysis (to perform before code changes)

1. Inspect `src/bot/controller.ts` for current artifact index comment publish flow and trigger points after successful implementation/rework/refinement.
2. Inspect `src/bot/provider/github.ts` interfaces and methods for:
   - listing issue/PR comments
   - creating comments
   - updating comments
   - available author metadata from returned comments
3. Inspect `src/bot/__tests__/controller.test.ts` for existing coverage patterns and mock strategy for GitHub provider interactions.
4. Confirm whether any existing constant/util location is used for comment templates/markers to avoid introducing parallel conventions.

## 3) Design Decisions

### 3.1 Marker Strategy
- Introduce a single explicit hidden marker constant (e.g., HTML comment token) embedded in every artifact index body.
- Marker must be unique to artifact index and machine-detectable by exact substring match.
- Marker inclusion is mandatory in both create and update bodies.

### 3.2 Eligibility Rule for Update
A comment is update-eligible only when all are true:
1. Comment body contains the exact artifact index marker token.
2. Comment author is bot-owned (derived from GitHub comment author metadata already exposed by provider/mocks).

Non-marker comments (including human text with similar phrasing) are never updated.

### 3.3 Deterministic Selection if Multiple Marker Comments Exist
- Use deterministic canonical selection rule:
  - choose the most recent marker-qualified bot comment (highest comment id / latest created timestamp based on available API fields).
- Update only the selected canonical comment.
- Do not mutate or delete other historical marker comments in this feature.

### 3.4 Trigger Guard
- Execute artifact index upsert only on successful implementation/rework/refinement completion paths already intended for summary publication.
- Preserve existing failure-path behavior (no artifact index write on failed run).

## 4) Implementation Steps

### Step 1 — Add marker constants/utilities (bot layer)
- Add/extend a small utility or constants section in `src/bot/controller.ts` (or existing neighboring bot utility if already present) for:
  - artifact index marker token
  - helper to build artifact index body with marker
  - helper predicate to identify update-eligible comments
- Keep helper scope minimal and local to orchestration concerns.

### Step 2 — Implement upsert flow in controller
- Replace/create current artifact index publish path with deterministic upsert:
  1. fetch PR comments via provider
  2. filter to marker + bot-authored
  3. deterministically select canonical target (if any)
  4. `update` selected comment when present
  5. otherwise `create` new artifact index comment
- Ensure updated body always contains current marker.

### Step 3 — Preserve provider boundaries
- Reuse existing provider methods where possible.
- If provider lacks required metadata (author/type/id/timestamp), extend provider type surface minimally and update mocks accordingly.
- Avoid introducing controller direct Octokit calls if provider abstraction already exists.

### Step 4 — Add/extend controller tests
In `src/bot/__tests__/controller.test.ts`, add focused tests for:
1. **Create path**: no marker comment exists → create called once with marker included.
2. **Update path**: marker-qualified bot comment exists → update called with same comment id; create not called.
3. **Ignore non-marker**: similar human/non-marker comments exist → none updated; create occurs.
4. **No duplicate regression**: repeated successful run with existing marker comment updates same id and does not create additional artifact index comments.
5. **Multi-marker deterministic rule**: when multiple marker bot comments exist, canonical one is selected and updated deterministically.

### Step 5 — Validate locally
- Run targeted tests first:
  - `src/bot/__tests__/controller.test.ts`
- Run project validation required by repo DoD:
  - `npm run lint`
  - `npm test`
- If unrelated failures appear, document them separately without broad unrelated fixes.

## 5) File-Level Change Plan

Primary expected files:
- `src/bot/controller.ts`
- `src/bot/__tests__/controller.test.ts`

Potentially (only if needed for metadata/type support):
- `src/bot/provider/github.ts`
- Any directly related test mock definitions used by controller tests

No planned changes:
- `src/core/*`
- `specs/*`

## 6) Acceptance Criteria Mapping

- Deterministic upsert implemented: controller always create-or-update one canonical artifact index comment.
- Human comments protected: only marker + bot-authored comments are eligible for overwrite.
- Test coverage present for create/update/ignore/no-duplicate (+multi-marker deterministic behavior).
- Architecture preserved: all changes remain in bot/provider orchestration layer.

## 7) Open Questions & Planned Handling

1. **Legacy non-marker bot summaries**
   - Plan behavior: leave untouched; new deterministic behavior starts with marker-bearing comment only.
2. **Multiple historical marker comments**
   - Plan behavior: deterministically select canonical latest and update only that one; do not auto-cleanup in this feature.

## 8) Rollout Notes

- Backward-compatible: no schema/state-machine/parser changes.
- Determinism improves immediately on first successful run after deployment.
- Any pre-existing duplicates remain visible but no new duplicates should be produced under normal flow.
