# AGENTS.md

This document is written for AI coding agents.  
It defines the architecture, rules, and working style for this codebase.  
Follow these rules exactly unless explicitly instructed otherwise.

This repository is **AI-first**: code should be structured so that automated agents can understand, extend, and refactor it safely.

---

# Project Overview

[Project Name] is a [Technology/Framework] application written in [Language].

It is a [Brief description of what the project does] with:
- [Key feature 1]
- [Key feature 2]
- [Key feature 3]

The application manages [System contexts or domain boundaries if applicable].

**Important:**  
[Domain specific rule 1 - e.g. 'Do not introduce i18n frameworks']  
[Domain specific rule 2]

---

# Architectural Layers

The project is organized into logical layers.  
Dependencies should generally point **downwards**.

## Preferred dependency direction

- `[Upper Layer 1]/` → acts completely isolated, invoking `[Layer 2]/` and `[Layer 3]/`
- `[Layer 2]/` → may use `[Layer 3]/`, `[Layer 4]/`
- `[Layer 3]/` → may use `[Layer 4]/`
- `[Bottom Utility Layer]/` → must not import from any layers above it.

This is a **guideline** (or rigid boundary), not a rigid compile-time rule, but new code must follow it.

---

# Folder Responsibilities

## `[Folder 1]/` – [Layer Purpose]
Contains:
- [Component type 1]
- [Component type 2]

**Rules:**
- [Rule 1 - e.g., 'Pages must be thin']
- [Rule 2]
- [Rule 3]

## `[Folder 2]/` – [Layer Purpose]
Contains:
- [Component type 1]

**Rules:**
- [Rule 1]
- [Rule 2]

---

# Refactoring Rules

When modifying existing code:

- Prefer **incremental implementations**: Implement in small steps and atomic local commits if possible. Do not rewrite everything into one massive file.
- Prefer **extraction and delegation** over moving many files.
- Preserve public APIs unless explicitly instructed to change them.
- When touching legacy code, improve boundaries locally (“boy scout rule”).
- Your ultimate goal isn't just to write code that works, but to write code that a human reviewer can easily understand, verify, and merge.

---

# Required Working Style for Agents

For non-trivial tasks, follow this workflow:

1. Identify the architectural layer of the change before beginning.
2. Reuse existing utilities and patterns where possible.
3. Prefer the smallest safe implementation.
4. Add **Jest** parity tests for pure functions.
5. Summarize what was changed and what was intentionally left unchanged.

---

# Legacy Hotspots (Optional)

Be extra careful when modifying these areas:
- `[Legacy Folder 1]/`
- `[Legacy File 1].ts`

When working in these areas:
- prefer extraction over rewriting
- add regression tests first

---

## What Not To Do

Never:
- [Anti-pattern 1]
- [Anti-pattern 2]
- [Anti-pattern 3]

---

## Definition of Done

A task is complete only if:
- [ ] Code is placed in the correct architectural layer
- [ ] Specific domain rules respected
- [ ] Tests added/updated for pure logic
- [ ] ESLint passes
- [ ] Automated tests pass

---

## Final Note for Agents

This codebase prefers:
- clear boundaries over clever code
- pure functions over large classes
- small modules over large files
- explicit commands over background magic
- incremental refactoring over rewrites

When in doubt, choose the solution that **keeps architectural boundaries clear** and **keeps behavior stable**.
