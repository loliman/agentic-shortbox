# ADR 0003: URL and Slug System

**Status:** Accepted
**Date:** 2026-03-27

## Context
Defining URLs manually throughout the UI code leads to broken links and inconsistent slug creation.

## Decision
URL generation and slug verification logic is strongly centralized. Components must call a central URL builder for any routing logic.

## Consequences
- **Positive:** Refactoring paths is trivial.
- **Negative:** Extra indirection layer.
