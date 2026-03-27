# System Architecture Overview

This document describes the high-level system architecture, external dependencies, and execution model for the AI-First workflow project. We apply a decentralized, provider-agnostic separation of concerns.

## 1. The Orchestrator Guard (Stateless Edge)
The Orchestrator acts as the "Gatekeeper". It lives natively inside the source code repository's CI flow (e.g., GitHub Actions, GitLab CI).
- **Responsibility**: Listens to issue/merge-request comments. Parses the command intent (`ready to plan`, `ready to implement`, `needs rework`, etc.) and the configuration labels (`model:strong`, `agent:codex`).
- **Validation**: Enforces strict State Machine rules. If a command is illegal (e.g., trying to `implement` before a `plan` exists), it aborts and notifies the user via comment.
- **Handoff**: If valid, the Orchestrator does NOT perform work. It wraps the command and repository context into a standardized JSON payload and fires it securely to an external `AGENT_WEBHOOK_URL`.

## 2. The Universal Webhook Payload
The communication between the repository and the execution worker is fully decoupled and Version Control System (VCS) agnostic.
The Orchestrator dispatches a payload containing:
- `provider`: Explicitly defines the origin (e.g., `'github'`, `'gitlab'`).
- `repository`: Owner and name of the repo needing attention.
- `triggerContext`: Who trigged the command, and what the command was.
- `configuration`: The exact models and agent-skills requested.

## 3. The AI Worker Engine (Stateful Worker)
The Worker is a completely isolated, dockerized Node application configured with `.env` files.
- **Responsibility**: It receives Webhooks seamlessly across multiple different repositories.
- **Execution**: Based on the `provider` string, it utilizes the correct API SDK to manipulate the remote repository. It clones the remote, runs the specified LLM pipeline (Planning, Epic Definition, or Code Implementation), commits new branches, pushes them, creates Pull Requests, and assigns reviewers.
- **Status Updates**: The Worker Engine actively updates the Issue states natively (`state:planning`, `state:implementing`) as its asynchronous work progresses.
