# ADR 0004: AI Workflow and Orchestration

**Status:** Accepted
**Date:** 2026-03-27

## Context
Running AI scripts ad-hoc creates unpredictable git states and untrackable architectural drift.

## Decision
The core execution engine is orchestrated primarily via explicit GitHub triggers:
- Labels (e.g., `agent:codex`, `model:strong`)
- Comments (`ready to plan`, `ready to implement`)

Planning and implementation remain distinct, explicit, tracked phases.

## Consequences
- **Positive:** Understandable workflow, auditable actions, explicit human approval gating.
- **Negative:** Increased latency waiting for the automation to pick up events.
