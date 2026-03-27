# GitHub Setup

Instructions for configuring the repo to support the AI workflow:
- Actions setup
- Labels supported (`agent:*`, `model:*`, and bot-managed `state:*`)
- Repository secrets:
  - `GITHUB_TOKEN` available to the workflow
  - `OPENAI_API_KEY` for `agent:codex`
  - `GEMINI_API_KEY` for `agent:gemini`
- Workflow triggers:
  - `issues.opened` for the welcome message
  - `issue_comment.created` for issue commands and PR fix commands
