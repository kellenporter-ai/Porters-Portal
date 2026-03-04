---
name: workflow-agent
description: Use when someone asks to automate a workflow, run a pipeline, orchestrate multiple tasks, handle something end-to-end, batch process files, or says "workflow agent". Also triggers on "automate this", "run the full pipeline", or "handle this for me".
argument-hint: [task description]
---

## What This Skill Does

Fully autonomous meta-orchestrator. Takes any task description, analyzes it, breaks it into subtasks, routes them to the right subagents and skills, and runs a structured pipeline to completion.

**Pipeline:** Analyze → Route → Plan → Execute → Verify → Report

---

## Step 1: Analyze the Task

Parse `<ARGUMENTS>` to understand:

- **What** — the task, goal, or problem
- **Scope** — single file, multi-file, cross-system, or batch operation
- **Domain** — code change, content generation, file operations, deployment, or mixed
- **Dependencies** — what must happen before what

If no arguments are provided, ask: "What task should I automate? Describe what you want done."

---

## Step 2: Route to the Right Approach

Based on the analysis, determine which execution path fits:

### Path A: Skill Chain
If the task maps to one or more existing skills, invoke them in sequence:

| Task Pattern | Skill to Chain |
|---|---|
| Bug fix, feature, code change | `/dev-pipeline` |
| Lesson planning, ISLE content | `/lesson-plan` |
| Assessment or quiz creation | `/create-assessment` |
| 3D simulation or interactive | `/3d-activity` |
| Image prompt generation | `/generate-image` |

Chain multiple skills if the task spans domains (e.g., "create a lesson plan with a 3D sim and an assessment" → chain `/lesson-plan` + `/3d-activity` + `/create-assessment`).

### Path B: Subagent Orchestration
If the task requires custom work that no single skill covers:

1. Launch the **project-manager** agent to scope the task and produce subtasks
2. For each subtask, launch the appropriate agent:
   - **programmer** — for code implementation
   - **qa-tester** — for testing and validation
   - **Explore** — for codebase research and file discovery
   - **general-purpose** — for web research, data gathering, or mixed tasks
3. Run independent subtasks in parallel using multiple Agent tool calls
4. Run dependent subtasks sequentially

### Path C: Direct Execution
If the task is straightforward (batch file rename, data transformation, simple script):

1. Execute directly without subagent overhead
2. Use Bash, Read, Write, Edit, Glob, Grep tools as needed
3. Verify results before reporting

Choose the simplest path that gets the job done. Don't orchestrate subagents for a task that can be done directly.

---

## Step 3: Plan the Execution

Before executing, create a structured plan:

1. Use TodoWrite to create a task list with all subtasks
2. Order subtasks by dependency (independent tasks can run in parallel)
3. Identify verification criteria for each subtask — how do you know it's done correctly?

Do NOT present the plan to the user. This is autonomous — proceed directly to execution.

---

## Step 4: Execute

Run the plan:

1. Mark each task as `in_progress` when starting it
2. Execute the task using the routed approach (skill chain, subagent, or direct)
3. Mark each task as `completed` immediately when done
4. If a task fails:
   - Analyze the failure
   - Attempt an automatic fix
   - If the fix works, continue
   - If the fix fails after 2 attempts, log the failure and continue with remaining tasks

### Parallel Execution Rules
- Launch independent subagents simultaneously using multiple Agent tool calls in a single message
- Wait for dependent results before launching downstream tasks
- Use `run_in_background: true` for long-running tasks that don't block others

---

## Step 5: Verify

After all subtasks complete:

1. If code was changed → run `npm run build` and verify it passes
2. If code was changed → launch the **qa-tester** agent to validate
3. If files were generated → verify they exist and have expected content
4. If a deployment was part of the task → verify deployment succeeded

If verification fails:
1. Fix the issue
2. Re-verify
3. Repeat until clean (max 3 cycles, then report the issue)

---

## Step 6: Report

Provide a concise summary:

- **Task:** What was requested
- **Approach:** Which path was taken (skill chain / subagent orchestration / direct)
- **Results:** What was accomplished, files created/modified
- **Issues:** Any problems encountered and how they were resolved (or if unresolved)
- **Status:** Complete / Partial (with explanation)

---

## Guardrails

These are hard boundaries — never violate them:

- **No destructive git operations.** Never force push, hard reset, or delete branches. Use safe git operations only.
- **No paid API calls without confirmation.** If a subtask would invoke a paid external API (image generation, third-party services), stop and ask the user for permission before proceeding.
- **No skipping verification.** Always verify results before reporting success.
- **No infinite loops.** Cap retry cycles at 3 attempts. If still failing, report the issue and move on.

---

## Notes

- **Autonomous execution.** This skill runs end-to-end without pausing for user approval. The user trusts the pipeline.
- **Skill awareness.** This agent knows about all skills in the project and can invoke them. Check the skills section of CLAUDE.md for the current list.
- **Subagent delegation.** When delegating to subagents, provide detailed prompts that include all context the subagent needs. Don't assume subagents have conversation history.
- **Efficiency.** Prefer the simplest approach. Don't spin up subagents for tasks that can be done with a single tool call. Don't chain skills when one skill covers the whole task.
- **Context routing.** Read the task carefully. A request to "fix the login bug and deploy" is a `/dev-pipeline` invocation, not a multi-skill orchestration. Only orchestrate when the task genuinely spans multiple domains.
