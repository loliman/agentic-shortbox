# ADR 0002: Filter Architecture

**Status:** Accepted
**Date:** 2026-03-27

## Context
Filtering logic across different entities often duplicates code and leads to inconsistent UX.

## Decision
Filter definitions, mapping, and extraction will be centralized within the Domain/Service layer and standardized so UI components simply render them, and Data Layers simply execute them.

## Consequences
- **Positive:** Single source of truth.
- **Negative:** Rigid definitions up front are required.
