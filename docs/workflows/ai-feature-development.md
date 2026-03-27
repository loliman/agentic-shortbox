# AI Feature Development Workflow

This document explicitly defines the high-level process for moving a feature from Spec to Implementation using AI agents.

## Phases
0. **Definition (Epic Splitting)**: User writes a large feature request. AI can break it into child issues via `ready for specification`.
1. **Specification**: Human completely writes or refines `specs/...` manually or via Phase 0.
2. **Planning**: AI analyzes the issue and creates a plan after a `ready for planning` comment.
3. **Approval**: Human reviews and approves plan iteratively.
4. **Implementation**: AI implements according to plan after `ready for implementation`. It pushes code to a Pull Request.
5. **Review**: Human reviews the PR, submits the review feedback, and comments `ready for rework` on the PR once the review feedback is complete.
