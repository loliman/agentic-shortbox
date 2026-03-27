# Feature: Command and Label Configuration Parser

## Goal
Build a strict parser that intercepts the orchestrator's payload to determine *what* to run (Command) and *how* to run it (Labels Configuration) according to the AI-First specification.

## User Value
Users need a standardized, deterministic way to interact with the system. Without this, agents might try to guess intent via natural language, leading to chaos. Explicit commands guarantee predictable results.

## Scope
- **In Scope:** Parsing labels `agent:<name>`, `model:<tier>`. Establishing fallback defaults. Extracting strict text commands like `ready for specification`, `ready for planning`, and `ready for implementation`.
- **Out of Scope (Non-Goals):** Executing the underlying agent scripts. Managing historical workflow state.

## Domain Context
Implements Section 5 (Execution Configuration) and Section 6 (Commands) of `AI_FIRST_AGENT_SPEC.md`.

## User Scenarios
1. **Given** a comment `ready for planning`, **When** labels `agent:codex` and `model:fast` are present, **Then** the parser returns a plan command with the requested configuration.
2. **Given** conflicting labels `agent:codex`, `agent:gemini`, **When** a command is parsed, **Then** the system gracefully fails and posts an error comment.
3. **Given** free-text "Please write the code for me", **Then** the parser ignores it.

## Affected Areas
- `scripts/ai/parser.js` (NEW)

## UX / Behavior
- If a command is recognized but config is broken, bot replies: "Error: Conflicting agent labels found."
- If no defaults configurations are defined, and no labels exist, fails gracefully.

## Business Rules
- Labels = Configuration. Comments = Commands.
- Strict string matching (or trim/lowercase matching) for commands. No NLP classification.
- Max one `agent` and one `model` label active at a time.

## Architectural Placement
- `scripts/ai/` core logic, pure functions. No GitHub API access here.

## Risks
- Users mistyping commands. Mitigation: Clear error output.

## Test Plan
- Unit tests for all valid label states.
- Unit tests for conflicting/invalid label states.
- Unit tests for command extraction ignoring surrounding whitespace.

## Definition of Done
- [ ] Parses `ready for specification`, `ready for planning`, and `ready for implementation`.
- [ ] Parses `agent:*` and `model:*` via pure functional logic.
- [ ] Gracefully detects multiple labels of the same category and throws.
- [ ] Returns default settings if missing.
