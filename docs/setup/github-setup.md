# GitHub Setup

Instructions for configuring the repo to support the AI workflow:
- Actions setup
- Labels supported (`agent:codex`, `model:*`, and bot-managed `state:*`)
- Repository secrets:
  - `GITHUB_TOKEN` available to the workflow
  - `OPENAI_API_KEY` for Codex
- Repository setting in `Settings -> Actions -> General -> Workflow permissions`:
  - `Read and write permissions`
  - `Allow GitHub Actions to create and approve pull requests`
- Workflow triggers:
  - `issues.opened` for the welcome message
  - `issue_comment.created` for issue commands and PR commands
  - `pull_request_review.submitted` for review submissions such as `ready for rework`
