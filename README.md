# Agentic Shortbox — AI Developer Bot

> A GitHub-native AI bot that plans, implements, and reviews code — driven entirely by Issue comments. No server required.

[![CI](https://github.com/christian-riese/agentic-shortbox/actions/workflows/ci.yml/badge.svg)](https://github.com/christian-riese/agentic-shortbox/actions/workflows/ci.yml)

---

## ✨ What It Does

Open an Issue. Comment a command. The bot does the rest.

| Command | What happens |
|---|---|
| *(open an issue)* | Bot welcomes you and explains the Codex workflow |
| `ready for specification` | Splits an Epic into labelled sub-issues |
| `ready for planning` | Generates a full implementation plan (hesitates if spec is vague) |
| `ready for planning without questions` | Forces a plan without a clarification step |
| `ready for implementation` | Runs Codex in the checked-out repo, commits to a branch, opens a PR |
| `ready for rework` | On a PR: bot passes the linked feature spec, plan, and open review feedback to Codex |
| `ready for refinement <instruction>` | On a PR: bot passes the linked feature spec, plan, and your refinement instruction to Codex |

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
    if: github.event_name != 'issue_comment' || github.event.sender.type != 'Bot'

    permissions:
      contents: write
      issues: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v4

      - uses: christian-riese/agentic-shortbox@v1.6.0
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```

### Step 2 — Add your API secrets

In your repo: **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Required |
|---|---|
| `OPENAI_API_KEY` | Required |

### Step 3 — Configure per Issue

Apply labels to each issue before giving commands:

| Label | Meaning |
|---|---|
| `agent:codex` | Optional explicit Codex label |
| `model:fast` | Use the faster/cheaper model |
| `model:strong` | Use the strongest model (default) |

That's it. Open an issue and the bot greets you.

For Pull Requests:
- Use `ready for rework` after concrete review feedback is in place.
- Use `ready for refinement <instruction>` when you want broader polish and put the full instruction in the same comment.

Command rules:
- Commands should stand alone in the comment.
- The only exception is `ready for refinement <instruction>`, where everything after the command is treated as the refinement instruction.

---

## 🧠 AI Governance

Every command runs through Codex in the repository workspace.

The bot gives Codex:
- the feature spec
- the latest implementation plan, when one exists
- the command-specific instruction

Codex is then expected to inspect and obey:
- `AGENTS.md`
- `docs/`
- `plans/`
- `specs/`

This keeps the system AI-first: the agent gathers its own repository context instead of relying on a giant prebuilt prompt dump.

---

## 🔖 Releasing a New Version

```bash
npm run release:prepare          # patch bump
npm run release:prepare -- minor # optional minor bump
npm run release:prepare -- major # optional major bump
```

The script updates `package.json`, [`.github/workflows/agentic-bot.yml`](/Users/christian/agentic-shortbox/.github/workflows/agentic-bot.yml), and [`README.md`](/Users/christian/agentic-shortbox/README.md), runs the build, stages everything, creates the release commit, and tags it. Push remains manual.
