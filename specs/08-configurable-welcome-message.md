# Feature: Configurable Welcome Message

## Goal
Allow repository owners to customize the welcome message the bot posts when a new Issue is opened, via a dedicated configuration file (`bot.config.yml`) in the repository root.

## User Value
Currently the welcome message is hardcoded in `src/bot/controller.ts`. Repository owners who adopt this action cannot adapt the tone, language, or content of the greeting without forking the action. A lightweight config file makes the bot feel native to any project without code changes.

## Scope
- **In Scope:**
  - Reading a `bot.config.yml` file from the root of the consumer repository at runtime.
  - Supporting a `welcome.header` and `welcome.footer` field that prepend/append to the auto-generated Codex workflow guidance.
  - Graceful fallback to the current hardcoded message if no config file is present.
- **Out of Scope (Non-Goals):**
  - Full templating engines or variable interpolation inside the message.
  - Changing the LLM availability section itself (that remains dynamic and auto-generated).
  - Per-issue or per-label customisation.

## Domain Context
The welcome routine lives entirely in `src/bot/controller.ts` → `handleWelcome()`. It is a pure GitHub API side-effect (posting a comment) with no state-machine dependency. This feature touches only the `src/bot/` layer and adds a new lightweight config-reading utility.

## User Scenarios
1. **Given** a repo with a `bot.config.yml` containing a custom `welcome.header`, **When** an Issue is opened, **Then** the bot posts the custom header above the auto-generated Codex workflow guidance.
2. **Given** a repo with a `bot.config.yml` containing a custom `welcome.footer`, **When** an Issue is opened, **Then** the bot appends the custom footer below the how-to-use instructions.
3. **Given** a repo with **no** `bot.config.yml`, **When** an Issue is opened, **Then** the bot behaves exactly as today — no errors, no regression.
4. **Given** a `bot.config.yml` with missing or empty fields, **When** an Issue is opened, **Then** only the present fields are applied; absent fields fall back to defaults silently.

## Affected Areas
- `src/bot/controller.ts` — `handleWelcome()` reads optional config and interpolates header/footer.
- `src/bot/config.ts` (**NEW**) — Small pure utility that reads and validates `bot.config.yml` from `process.cwd()`.

## UX / Behavior

**`bot.config.yml` format (in consumer repo root):**
```yaml
welcome:
  header: |
    👾 Welcome to **My Project AI Bot**!
    I'm here to help you build features fast.
  footer: |
    📖 Read our [Contributing Guide](./CONTRIBUTING.md) before getting started.
```

**Resulting comment structure:**
```
[welcome.header — if set]

This repository is configured to run Codex through OpenAI...

**How to use me:**
1. Apply labels...
...

[welcome.footer — if set]
```

**Offline state (no secrets):** The custom header is still shown before the ⚠️ offline warning. The footer is omitted in offline mode.

## Business Rules
- `bot.config.yml` is read fresh on every issue open event (no caching).
- Fields are optional. An entirely absent `welcome:` block is valid.
- YAML parse errors in `bot.config.yml` must be caught and logged via `core.warning()` — they must not crash the action.
- Maximum length for header and footer is 1000 characters each (truncated with a warning if exceeded).

## Data Impact
No schema or database changes. Config is read from the filesystem at runtime only.

## Architectural Placement
- New file `src/bot/config.ts` lives in the `src/bot/` layer.
- It is a pure utility: no network calls, no Octokit access — only `fs` and `js-yaml`.
- Must be covered by unit tests in `src/bot/__tests__/config.test.ts`.

## Risks
- `js-yaml` adds a new dependency. It is small and widely used. Acceptable.
- If the consumer's `bot.config.yml` has unrelated top-level keys, those should be silently ignored (no strict schema enforcement beyond the `welcome` block).

## Test Plan
- **Unit:** `src/bot/__tests__/config.test.ts`
  - Returns defaults when file is missing.
  - Parses valid `welcome.header` and `welcome.footer` correctly.
  - Catches and warns on malformed YAML without throwing.
  - Truncates fields exceeding 1000 characters.
- **Integration:** `src/bot/__tests__/controller.test.ts`
  - `handleWelcome()` includes custom header/footer in the posted comment when config is present.
  - `handleWelcome()` falls back cleanly when config returns defaults.

## Definition of Done
- [ ] `src/bot/config.ts` implemented and exported.
- [ ] `handleWelcome()` in `controller.ts` reads and applies config.
- [ ] Unit tests in `config.test.ts` pass.
- [ ] Controller integration tests updated and passing.
- [ ] `js-yaml` added to `dependencies` in `package.json`.
- [ ] `bot.config.yml` example added to repository root as documentation.
- [ ] No regression on existing welcome message when config is absent.

## Open Questions
- Should the `welcome.header` support basic Markdown only, or also raw HTML (GitHub renders both in comments)? → **Markdown only for now**, HTML adds XSS risk.
