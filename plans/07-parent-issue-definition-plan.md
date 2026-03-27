# Plan: Feature 07 - Parent Issue Definition Workflow (Orchestrator Guard)

## Summary
The native bot can process specification-splitting logic, but the command and supporting docs must align on `ready for specification`. This plan modifies `parser.ts` and `state-machine.ts` to allow transitioning an issue from `idle` to a temporary `defining` state and handing control to the local bot controller.

## Affected Files
- `src/core/parser.ts`
- `src/core/state-machine.ts`
- `src/core/__tests__/parser.test.ts`
- `src/core/__tests__/state-machine.test.ts`

## New Files
- None

## Architectural Layer Placement
This takes place within the **Orchestrator Guard (Local CI Node)** logic, specifically in the intent parsing layer (`parser.ts`) and rule-validation layer (`state-machine.ts`).

## Data Access Changes
- None.

## Workflow / State Changes
1. `parser.ts` will return `{ type: 'define' }` upon intercepting exactly `ready for specification`.
2. `state-machine.ts` will add `defining` to its valid states tuple.
3. `evaluateTransition` logic will permit `idle` -> `define` -> `defining`.
4. The controller itself takes care of returning `idle` upon completion of `define`, as epics do not move into `plan` state automatically.

## Tests to Add or Update
- `parser.test.ts`: Verify `ready for specification` parses to `type: 'define'`.
- `state-machine.test.ts`: Verify `idle` -> `define` works, and invalid transitions (e.g. `planned` -> `define`) throw `IllegalTransitionError`.

## Rollout Steps
1. Add `define` to parser types and logic.
2. Add `defining` to state-machine states and valid transition paths.
3. Update tests.
4. Verify tests pass.

## Risks
- The controller needs to know how to transition the state back so the parent issue is not left in `defining` forever if it fails.

## Definition of Done
- [ ] Matches Feature Spec 07 (Orchestrator side).
- [ ] Boundaries respected (No git/LLM logic touching Orchestrator).
- [ ] Code is formatted and linted (Tests pass).
