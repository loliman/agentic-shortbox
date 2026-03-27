# Agentic Shortbox — AI Developer Bot

> A GitHub-native AI bot that plans, implements, and reviews code — driven entirely by Issue comments. No server required.

[![CI](https://github.com/christian-riese/agentic-shortbox/actions/workflows/ci.yml/badge.svg)](https://github.com/christian-riese/agentic-shortbox/actions/workflows/ci.yml)

---

## ✨ What It Does

Open an Issue. Comment a command. The bot does the rest.

| Command | What happens |
|---|---|
| *(open an issue)* | Bot welcomes you and lists available LLMs |
| `ready for specification` | Splits an Epic into labelled sub-issues |
| `ready for planning` | Generates a full implementation plan (hesitates if spec is vague) |
| `ready for planning!` | Forces a plan without hesitation |
| `ready for implementation` | Writes code, commits to a branch, opens a PR |
| `ai: fix <feedback>` | In a PR comment: bot commits a targeted fix |

---

## 🚀 Add to Your Repository

### Step 1 — Create the workflow file

Add `.github/workflows/ai-bot.yml` to your repo:

```yaml
name: AI Developer Bot

on:
  issues:
    types: [opened]
  issue_comment:
    types: [created]

jobs:
  ai-bot:
    runs-on: ubuntu-latest
    if: github.event.sender.type != 'Bot'

    permissions:
      contents: write
      issues: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v4

      - uses: christian-riese/agentic-shortbox@v1
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

### Step 2 — Add your API secrets

In your repo: **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Required |
|---|---|
| `OPENAI_API_KEY` | Optional (enables `agent:codex`) |
| `GEMINI_API_KEY` | Optional (enables `agent:gemini`) |

At least one key must be set for the bot to be active.

### Step 3 — Configure per Issue

Apply labels to each issue before giving commands:

| Label | Meaning |
|---|---|
| `agent:codex` | Use OpenAI (GPT-4o) |
| `agent:gemini` | Use Google Gemini |
| `model:fast` | Use the faster/cheaper model |
| `model:strong` | Use the strongest model (default) |

That's it. Open an issue and the bot greets you.

---

## 🧠 AI Governance

The bot automatically reads your repository's governance files and injects them into every LLM prompt before executing any command:

- `AGENTS.md` — Architectural rules and boundaries
- `README.md` — Project overview
- `specs/templates/feature-spec.md` — Spec format
- `plans/templates/implementation-plan.md` — Plan format

The better your `AGENTS.md`, the smarter the bot. It cannot invent architecture it hasn't been told about.

---

## 🔖 Releasing a New Version

```bash
npm run build          # Regenerate dist/index.js
git add dist/
git commit -m "build: release vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

Then update consumers from `@v1` to `@vX.Y.Z` (or keep `@v1` pointing to the latest tag via a moving tag).
