# AI Feature Development Workflow

This document explicitly defines the high-level process for moving a feature from Spec to Implementation using AI agents.

## Phases
0. **Definition (Epic Splitting)**: User writes a large feature request. AI can break it into child issues via `ready for specification`.
1. **Specification**: Human completely writes or refines `specs/...` manually or via Phase 0.
2. **Planning**: AI creates a plan directly from the issue after a `ready for planning` comment.
3. **Approval**: Human reviews the generated plan and decides whether the issue is ready for implementation.
4. **Implementation**: AI implements according to plan after `ready for implementation`. It only opens a Pull Request if the observed implementation diff is publishable for that run type.
5. **Review**: Human reviews the PR, submits the review feedback, and then either triggers `ready for rework` for targeted fixes or `ready for refinement <instruction>` for broader polish.

## Operating Model
- Planning is non-dialog in the normal workflow.
- Implementation, rework, and refinement are execute-or-fail flows.
- The bot evaluates broad features, narrow features, and child subtasks with different publication thresholds.
- Human review still happens on the PR, but weak runs should fail before publication rather than being published optimistically.
