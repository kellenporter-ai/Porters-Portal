# Agent Patterns & Conventions

Standard patterns used across all agents in this project. Reference this when creating or auditing agents.

---

## Frontmatter Template

```yaml
---
name: agent-name-here
description: "Use this agent when [specific scenarios]. This includes [list of task types].\n\nExamples:\n\n- Example 1:\n  user: \"[realistic user message]\"\n  assistant: \"[how the assistant decides to use this agent]\"\n  <Agent tool call: agent-name-here>\n\n- Example 2:\n  ...\n\n- Example 3:\n  ...\n\n- Example 4 (proactive usage):\n  Context: [when this agent should auto-trigger]\n  assistant: \"[proactive invocation reasoning]\""
model: sonnet
color: green
memory: project
---
```

### Model Selection Guide

| Model | Best For | Examples |
|-------|----------|---------|
| `opus` | Orchestration, complex reasoning, architectural planning, multi-agent coordination | portal-orchestrator |
| `sonnet` | Specialist tasks, code generation, auditing, content writing, focused domain work | ui-accessibility-engineer, backend-integration-engineer, qa-bug-resolution, content-strategist-ux-writer |

### Color Palette

Pick a color that hasn't been used yet, or that makes semantic sense:

| Color | Current Usage |
|-------|---------------|
| `purple` | portal-orchestrator |
| `pink` | ui-accessibility-engineer |
| `red` | backend-integration-engineer |
| `blue` | qa-bug-resolution |
| `green` | content-strategist-ux-writer |
| `orange` | available |
| `yellow` | available |

---

## Body Structure Template

```markdown
You are the **[Role Title]** — [one-sentence identity statement with expertise areas].

## Core Identity

[2-3 sentences establishing expertise, perspective, and value proposition.]

## Core Identity & Boundaries

You are a **[domain]-only** specialist. You must:
- [What this agent DOES]
- [What this agent DOES]

You must NOT:
- [Hard boundary 1]
- [Hard boundary 2]

If a task requires [out-of-scope work], report exactly what you need and stop.

---

## Primary Protocols

### 1. [Protocol Name]

[Numbered steps for this workflow]

### 2. [Protocol Name]

[Numbered steps for this workflow]

---

## Output Formats

### [Format Name]

\`\`\`markdown
## [Template Title]

**Field 1:** [value]
**Field 2:** [value]

### Section
- [items]
\`\`\`

---

## Workflow

1. **[Phase]**: [what happens]
2. **[Phase]**: [what happens]
3. **Self-Audit**: Before reporting completion, verify:
   - [ ] [Check 1]
   - [ ] [Check 2]
4. **Report**: Provide concise summary listing:
   - [Output item 1]
   - [Output item 2]

---

## Decision Framework

- **Favor X** over Y. [Why.]
- **Favor A** over B. [Why.]

---

## Update Your Agent Memory

As you work across conversations, update your agent memory with discoveries about:
- [Domain-specific pattern 1]
- [Domain-specific pattern 2]
- [Domain-specific pattern 3]
```

---

## Standard Memory Block

Every agent MUST include this block at the end. Replace `<agent-name>` with the actual agent name and `<project-root>` with the project root path.

```markdown
# Persistent Agent Memory

You have a persistent Persistent Agent Memory directory at `<project-root>/.claude/agent-memory/<agent-name>/`. Its contents persist across conversations.

As you work, consult your memory files to build on previous experience. When you encounter a mistake that seems like it could be common, check your Persistent Agent Memory for relevant notes — and if nothing is written yet, record what you learned.

Guidelines:
- `MEMORY.md` is always loaded into your system prompt — lines after 200 will be truncated, so keep it concise
- Create separate topic files (e.g., `debugging.md`, `patterns.md`) for detailed notes and link to them from MEMORY.md
- Update or remove memories that turn out to be wrong or outdated
- Organize memory semantically by topic, not chronologically
- Use the Write and Edit tools to update your memory files

What to save:
- Stable patterns and conventions confirmed across multiple interactions
- Key architectural decisions, important file paths, and project structure
- User preferences for workflow, tools, and communication style
- Solutions to recurring problems and debugging insights

What NOT to save:
- Session-specific context (current task details, in-progress work, temporary state)
- Information that might be incomplete — verify against project docs before writing
- Anything that duplicates or contradicts existing CLAUDE.md instructions
- Speculative or unverified conclusions from reading a single file

Explicit user requests:
- When the user asks you to remember something across sessions (e.g., "always use bun", "never auto-commit"), save it — no need to wait for multiple interactions
- When the user asks to forget or stop remembering something, find and remove the relevant entries from your memory files
- Since this memory is project-scope and shared with your team via version control, tailor your memories to this project

## MEMORY.md

Your MEMORY.md is currently empty. When you notice a pattern worth preserving across sessions, save it here. Anything in MEMORY.md will be included in your system prompt next time.
```

---

## Common Agent Anti-Patterns

Avoid these when writing or improving agents:

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Vague boundaries | Agent does work belonging to other agents | Explicit "you must NOT" list with specific examples |
| Wall of MUSTs | Agent ignores emphatic instructions buried in noise | Explain reasoning; reserve emphasis for true non-negotiables |
| No output template | Agent invents different formats each time | Provide exact markdown/JSON template with all required fields |
| No self-check | Agent reports completion without verification | Add numbered verification checklist before the report step |
| Overly long body | Wastes context tokens on every invocation | Keep under 200 lines; move details to reference files |
| Missing examples in description | Undertriggers — Claude doesn't invoke the agent | Add 3-4 realistic examples with user/assistant pairs |
| Generic memory instructions | Agent saves unhelpful or duplicate information | Customize memory guidance with domain-specific examples |
| No error escalation | Agent gets stuck on tasks it can't complete | Define what to do when blocked: report needs and stop |

---

## Agent Team Interaction Patterns

### Delegation Pattern (Orchestrator → Specialist)

```markdown
<delegation>
**Target Agent:** [Agent Name]
**Task ID:** [ID]
**Task:** [Description]
**Input Spec:** [Reference]
**Deliverable Path:** [File paths]
**Constraints:**
- [Constraint 1]
- [Constraint 2]
**Report Format:** Files changed, impact, test status (max 300 words)
</delegation>
```

### Handoff Pattern (Specialist → QA)

After completing work, the specialist reports what was done. The QA agent then audits independently. The specialist never self-certifies quality.

### Escalation Pattern (Specialist → Orchestrator)

When a specialist encounters work outside its domain:
1. Complete what it can within its boundaries
2. Report exactly what additional work is needed
3. Specify which agent should handle it
4. Stop — do not attempt cross-domain work
