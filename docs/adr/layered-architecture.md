# ADR 0001: Layered Architecture

**Status:** Accepted
**Date:** 2026-03-27

## Context
As the repository grows, intermingling business logic with routing and database access creates testing difficulties, hidden bugs, and AI halluciations when implementing features.

## Decision
We enforce a strict layered architecture:
- UI components: Render data, no business logic.
- Service / Domain: Pure functions encapsulating business rules.
- Route Handlers: Parse, Validate, Route (no logic).
- Data Access: Abstracted DB connections.

## Consequences
- **Positive:** Clear boundaries, strong testability, understandable by AI context windows.
- **Negative:** Slightly more boilerplate per feature.
