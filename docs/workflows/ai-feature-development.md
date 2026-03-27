# AI Feature Development Workflow

This document explicitly defines the high-level process for moving a feature from Spec to Implementation using AI agents.

## Phases
0. **Definition (Epic Splitting)**: User writes monolithic feature request. AI explicitly breaks it into 3-5 child specs (via `ready to define`).
1. **Specification**: Human completely writes or refines `specs/...` manually or via Phase 0.
2. **Planning**: AI analyzes spec, creates `plans/...` after `ready to plan` command.
3. **Approval**: Human reviews and approves plan iteratively.
4. **Implementation**: AI implements according to plan after `ready to implement` command. It pushes code to a Pull Request.
5. **Review**: Human reviews the PR and demands fixes via `needs rework: <text>` on the PR.
