# GitHub AI Workflow

This document explains the technical implementation of orchestrating AI execution via GitHub.

## Orchestration Handoff
GitHub Actions serve strictly as the Guard (Validating intent). When a valid command is posted, the Orchestrator safely dispatches the environment context (Webhooks) to the Remote Worker node, completely detaching the heavy LLM tasks from GitHub Actions' runtime.
Local visual changes on GitHub (like `state:` labels updating) do *not* happen immediately upon Command commenting, but occur as soon as the Remote Worker acknowledges and starts processing the payload.

## Labels (Configuration)
- `agent:<name>`
- `model:<tier>`

## Issue Commands (Triggers)
- `ready to define` (Splits Epic into Child-Specs)
- `ready to plan` (Creates technical `.md` plans)
- `ready to implement` (Clones code, Writes code, opens PR)

## PR Commands (Triggers)
- `needs rework: <text>` (Appends fixes to existing PR)
