## Workflow Orchestration

### 1. Plan Node Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Skills Framework

Skills live in `.agent/skills/<skill-name>/SKILL.md`. Use `view_file` to read them.

**The Rule:** If there is even a 1% chance a skill applies, read it with `view_file` BEFORE responding or taking any action. This is non-negotiable.

| Trigger                             | Skill to Read                                           |
| ----------------------------------- | ------------------------------------------------------- |
| Starting any session                | `.agent/skills/using-superpowers/SKILL.md`              |
| Building any feature/component      | `.agent/skills/brainstorming/SKILL.md`                  |
| Writing multi-step plan             | `.agent/skills/writing-plans/SKILL.md`                  |
| Executing a plan (same session)     | `.agent/skills/subagent-driven-development/SKILL.md`    |
| Executing a plan (new session)      | `.agent/skills/executing-plans/SKILL.md`                |
| Writing any implementation code     | `.agent/skills/test-driven-development/SKILL.md`        |
| Any bug / unexpected behavior       | `.agent/skills/systematic-debugging/SKILL.md`           |
| Claiming work done / fixed          | `.agent/skills/verification-before-completion/SKILL.md` |
| Completing a feature / before merge | `.agent/skills/requesting-code-review/SKILL.md`         |
| Receiving code review feedback      | `.agent/skills/receiving-code-review/SKILL.md`          |
| 2+ independent tasks in parallel    | `.agent/skills/dispatching-parallel-agents/SKILL.md`    |
| Starting isolated feature work      | `.agent/skills/using-git-worktrees/SKILL.md`            |
| Merging / finishing branch          | `.agent/skills/finishing-a-development-branch/SKILL.md` |

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## Loci Task Management

> **MANDATORY**: Before ANY interaction with Loci tickets, you MUST read `LOCI.md` in the project root. This is non-negotiable.

### Hard Rules (always enforced)
- **Project Guard**: Only manage tickets for the **Loci** project (prefix: `LCI`). Never read, list, or update tickets from other projects.
- When listing tickets, ALWAYS filter by the Loci project ID. Never call `list_tickets()` without a `project_id` filter.
- MCP server: http://localhost:3333/mcp

### Full Workflow
See `LOCI.md` for the complete ticket workflow (starting tickets, completing tickets, document conventions, assignee format, etc.).
