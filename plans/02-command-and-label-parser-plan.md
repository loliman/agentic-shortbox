# Plan: Command and Label Configuration Parser

## Summary
The system requires a strict, predictable parser to determine intent from GitHub comment text without relying on ambiguous Natural Language Processing. This module exposes pure functions to extract exact textual commands (`ready for specification`, `ready for planning`, `ready for implementation`) and to parse agent configuration from an array of labels (`agent:*`, `model:*`). The parser strictly fails if conflicting configurations are detected and falls back to sensible defaults when no configuration is specified.

## Affected Files
- `.github/workflows/ai-orchestrator.yml`: To provide label context, we must pass the active issue labels array down to the entrypoint (e.g., `ISSUE_LABELS: ${{ toJson(github.event.issue.labels.*.name) }}`).
- `scripts/ai/entrypoint.js`: Must be updated to read and parse the new `ISSUE_LABELS` environment variable.

## New Files
- `src/core/parser.ts`: A purely functional module exporting parsing logic without side effects.
- `src/core/__tests__/parser.test.ts`: Comprehensive Jest tests guaranteeing deterministic behavior.

## Architectural Layer Placement
- **Core Logic Layer**: Positioned entirely within `src/core/`. It does not interface with GitHub API directly; it solely consumes and returns data arguments. It is entirely deterministic and stateless.

## Data Access Changes
- None (Stateless executor).

## Workflow / State Changes
- Ensures that AI execution paths are explicit. Unsupported commands or ambiguous labels will now halt execution before costly agent invocations occur.
- Fails gracefully by producing a parse error message which can later be posted to the issue by a downstream action (Out of scope for this module).

## Tests to Add or Update
- Unit tests (`src/core/__tests__/parser.test.ts`) verifying:
  - Valid command extraction (ignoring whitespace).
  - Proper mapping of `agent:name` and `model:tier` labels.
  - Exception throwing on unsupported provider labels (e.g. `['agent:gemini']`).
  - Fallback to default `agent` and `model` if none are provided.
- Update `src/github/__tests__/action.test.ts` to assert we handle `ISSUE_LABELS` safely.

## Rollout Steps
1. **Extend Orchestrator Payload**: Update the GitHub Action `.yml` and `src/github/action.ts` to extract and forward issue labels stringified as JSON. Update `action.test.ts` accordingly.
2. **Implement Parser Logic**: Create `src/core/parser.ts`. Define logic to recognize `ready for specification`, `ready for planning`, and `ready for implementation` against comment text. Provide a separate label array iteration logic mapping config keys and catching duplicates.
3. **Implement Fallback/Error Checks**: Include checks throwing standardized `Error` objects on configuration clashes.
4. **Implement Unit Tests**: Add test matrices covering all stated user scenarios.
5. **Hook Parser to Orchestrator (Optional within this scope)**: Import `parser` into `src/github/action.ts` and validate the payload payload.

## Risks
- **Command mismatch** due to trailing spaces, casing, or newlines.
  - *Mitigation*: We will strip whitespace, normalize to lowercase, and use aggressive regex trimming.
- **Malformed JSON label payload**: Handling failures if GitHub Action sends malformed `ISSUE_LABELS`.
  - *Mitigation*: Defensive `try/catch` JSON parsing over the `ISSUE_LABELS` `process.env` mapping to fallback on an empty array.

## Definition of Done
- [ ] Parses `ready for specification`, `ready for planning`, and `ready for implementation`.
- [ ] Parses `agent:*` and `model:*` via pure functional logic.
- [ ] Gracefully detects multiple labels of the same category and throws.
- [ ] Returns default settings if missing.
- [ ] `ISSUE_LABELS` integration in Orchestrator is successfully piped into parser constraints.
