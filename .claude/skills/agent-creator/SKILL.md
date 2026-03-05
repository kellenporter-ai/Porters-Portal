---
name: agent-creator
description: "Create, audit, and improve Claude Code agents (subagent .md files). Use this skill whenever the user mentions creating a new agent, writing an agent prompt, auditing agent performance, improving an agent's instructions, optimizing agent triggering, reviewing agent descriptions, benchmarking agent quality, or iterating on agent behavior. Also trigger when the user says things like 'make me an agent for X', 'this agent isn't working well', 'audit the QA agent', 'improve the orchestrator', 'my agent keeps doing Y wrong', 'add a new agent to the team', or 'the agent description needs work'. Even if they don't say 'agent' explicitly but describe wanting a specialized autonomous worker that handles a category of tasks, this skill applies."
argument-hint: "[create|audit|improve] [agent name or description]"
---

# Agent Creator

A skill for creating new agents, auditing existing agents, and iteratively improving them.

## What Are Agents?

Agents are specialized autonomous workers defined as Markdown files (`.md`) in `.claude/agents/`. Each agent has:

- **YAML frontmatter**: `name`, `description`, `model`, `color`, `memory` fields
- **Markdown body**: Detailed instructions, protocols, and guidelines
- **Persistent memory**: A directory at `.claude/agent-memory/<agent-name>/` with a `MEMORY.md` file auto-loaded into the agent's system prompt

The `description` field in frontmatter is the primary triggering mechanism — it determines when Claude invokes the agent. The body is only loaded when the agent is actually launched.

Agents are invoked via the `Agent` tool with a `subagent_type` parameter matching the agent's `name`.

## The Process

At a high level, the agent lifecycle works like this:

1. **Decide** what the agent should do and roughly how it should operate
2. **Write** a draft of the agent's `.md` file
3. **Test** by spawning the agent on realistic task prompts
4. **Evaluate** the results — both qualitative review and quantitative grading
5. **Improve** the agent based on feedback
6. **Repeat** until the agent reliably produces excellent work
7. **Optimize** the description for accurate triggering

Your job is to figure out where the user is in this process and help them progress. Maybe they want to create an agent from scratch, or maybe they already have one that isn't performing well and needs improvement. Be flexible — if the user says "just vibe with me", skip the formal evaluation machinery.

## Communicating with the User

Match your communication style to the user's technical level. If they're casually describing what they want ("I need something that handles X"), don't bombard them with JSON schemas. If they're already talking about frontmatter fields and evaluation metrics, match that energy.

---

## Creating an Agent

### Capture Intent

Start by understanding what the agent should do. If the conversation already contains context (e.g., "turn this workflow into an agent"), extract what you can first.

Key questions to answer:

1. **Role**: What is this agent responsible for? What does it do that the main Claude session shouldn't?
2. **Boundaries**: What should this agent NOT do? (e.g., "never write production code", "frontend only", "never modify backend files")
3. **Triggering**: When should this agent be launched? What user phrases or contexts indicate this agent is needed?
4. **Model**: Does this agent need maximum capability (`opus`) or is balanced capability sufficient (`sonnet`)? Opus is best for orchestrators and complex reasoning tasks. Sonnet handles most specialist work well.
5. **Team fit**: Does this agent interact with other agents? Who delegates to it? Who does it delegate to?
6. **Output format**: What does a successful completion look like? Structured reports? Code changes? Documents?

### Interview and Research

Before writing, investigate the existing agent team to understand conventions:

1. Read existing agents in `.claude/agents/` to match style and patterns
2. Check `.claude/agent-memory/` to understand the memory system
3. Look at how agents reference each other and the project's CLAUDE.md
4. Identify gaps in the current team — where would this new agent fit?

### Write the Agent File

Agent files follow this structure:

```markdown
---
name: agent-name
description: "Detailed description explaining when to use this agent. Include 3-4 concrete examples showing user messages and assistant responses that trigger the agent. Be specific about the types of tasks this agent handles. Err on the side of being 'pushy' — undertriggering is more common than overtriggering."
model: sonnet
color: green
memory: project
---

# Agent body follows...
```

#### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Kebab-case identifier (e.g., `data-pipeline-engineer`) |
| `description` | Yes | Triggering description with examples (see below) |
| `model` | Yes | `opus` for orchestrators/complex reasoning, `sonnet` for specialists |
| `color` | Yes | Visual identifier: `purple`, `pink`, `red`, `blue`, `green`, `orange`, `yellow` |
| `memory` | Yes | Scope: `project` (shared via version control) or `user` (personal) |

#### Writing the Description

The description is the most critical field — it determines whether the agent gets invoked. Study the existing agents' descriptions for the pattern:

1. **Lead with the role**: "Use this agent when..."
2. **List specific scenarios**: "This includes [X], [Y], [Z]..."
3. **Provide 3-4 examples** with user messages and assistant responses showing exactly when to trigger
4. **Include proactive usage** if the agent should be auto-invoked (e.g., after another agent completes work)

The description lives in the system prompt metadata and is always visible to Claude, so it must be comprehensive enough to trigger correctly but concise enough not to waste context.

#### Writing the Body

The body should follow these principles, drawn from what makes the best agents in this project effective:

**1. Establish identity and boundaries first.**
Open with a clear statement of who the agent is and what it does NOT do. The portal-orchestrator says "you never write production code." The QA agent says "you do NOT fix bugs yourself." These boundaries prevent scope creep and maintain clean handoffs.

**2. Define protocols, not just instructions.**
The best agents have named protocols (e.g., "Spec Before Code Protocol", "Bug Reporting Protocol") with numbered steps. This gives the agent a clear playbook to follow rather than vague guidance.

**3. Explain the why.**
Rather than heavy-handed MUSTs everywhere, explain reasoning. Today's models are smart — when they understand *why* something matters, they follow it more reliably than when they're just told to. Reserve emphatic language for genuine non-negotiables (security, accessibility, data integrity).

**4. Define output formats explicitly.**
Show the exact template for reports, sign-offs, delegations, or whatever the agent produces. The QA agent's sign-off format and the orchestrator's delegation tags are good examples. This ensures consistent, parseable output.

**5. Include a self-check workflow.**
Before the agent reports completion, it should verify its own work. The UI agent has a 14-point self-audit checklist. The orchestrator has quality assurance self-checks. Build this into the agent's workflow.

**6. Address the memory system.**
Every agent should include instructions about what to save to persistent memory and what not to save. Use the standard memory block (see `references/agent-patterns.md`).

**7. Keep it focused.**
An agent file should be under 200 lines for specialists, up to 250 for orchestrators. If you need more space, create reference files and point to them. The agent's body loads into context every time it's invoked, so bloat directly costs performance.

### Test the Agent

After writing the draft, come up with 2-3 realistic test prompts. These should be the kind of task a real user would actually delegate to this agent — specific, detailed, with enough context that the agent has real work to do.

Share the test prompts with the user for review, then run them.

Save test cases to `evals/evals.json`:

```json
{
  "agent_name": "example-agent",
  "evals": [
    {
      "id": 1,
      "prompt": "Realistic task prompt the user would say",
      "expected_output": "Description of what success looks like",
      "context_files": [],
      "expectations": []
    }
  ]
}
```

See `references/schemas.md` for the full schema.

---

## Running and Evaluating Test Cases

This is one continuous sequence. Put results in `agent-creator-workspace/` as a sibling to the `.claude/skills/agent-creator/` directory. Organize by iteration (`iteration-1/`, `iteration-2/`, etc.) and within that, each test case gets a directory.

### Step 1: Spawn All Runs

For each test case, spawn two subagents in the same turn:

**With-agent run:** Launch the agent using the Agent tool with the test prompt. Have it save outputs to the workspace.

```
Execute this task using the agent defined at <path-to-agent.md>:
- Task: <eval prompt>
- Context files: <eval files if any>
- Save outputs to: <workspace>/iteration-N/eval-<ID>/with_agent/outputs/
```

**Baseline run:** Same prompt, but without the agent — just a general-purpose subagent with no specialized instructions.

When **improving** an existing agent, snapshot the original first (`cp <agent.md> <workspace>/agent-snapshot.md`) and use the snapshot as baseline.

Write an `eval_metadata.json` for each test case:

```json
{
  "eval_id": 0,
  "eval_name": "descriptive-name",
  "prompt": "The task prompt",
  "assertions": []
}
```

### Step 2: Draft Assertions While Runs Are In Progress

Don't wait — use this time to draft quantitative assertions. Good assertions for agents focus on:

- **Behavioral boundaries**: "The agent did not modify files outside its domain"
- **Output format compliance**: "The agent produced a structured sign-off report"
- **Protocol adherence**: "The agent followed the delegation protocol with all required fields"
- **Quality indicators**: "The output addresses all requirements from the prompt"
- **Boundary respect**: "The agent reported backend needs rather than implementing them itself"

Update `eval_metadata.json` and `evals/evals.json` with the assertions.

### Step 3: Capture Timing Data

When each subagent completes, save `total_tokens` and `duration_ms` from the notification to `timing.json` in the run directory.

### Step 4: Grade, Aggregate, and Review

Once all runs complete:

1. **Grade each run** — read `agents/grader.md` and evaluate each assertion against the outputs. Save to `grading.json`. Use `text`, `passed`, and `evidence` fields.

2. **Aggregate into benchmark** — use the skill-creator's aggregation script:
   ```bash
   python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <agent-name>
   ```
   (Run from the skill-creator directory: `/home/kp/.claude/plugins/cache/claude-plugins-official/skill-creator/205b6e0b3036/skills/skill-creator/`)

3. **Analyst pass** — read benchmark data and surface patterns. See `agents/analyzer.md`.

4. **Launch the viewer** using the skill-creator's eval viewer:
   ```bash
   nohup python /home/kp/.claude/plugins/cache/claude-plugins-official/skill-creator/205b6e0b3036/skills/skill-creator/eval-viewer/generate_review.py \
     <workspace>/iteration-N \
     --skill-name "<agent-name>" \
     --benchmark <workspace>/iteration-N/benchmark.json \
     > /dev/null 2>&1 &
   VIEWER_PID=$!
   ```
   For iteration 2+, add `--previous-workspace <workspace>/iteration-<N-1>`.

5. **Tell the user** the viewer is open and explain what they'll see.

### Step 5: Read Feedback

When the user says they're done reviewing, read `feedback.json`. Empty feedback = looks good. Focus improvements on test cases with specific complaints.

Kill the viewer when done: `kill $VIEWER_PID 2>/dev/null`

---

## Auditing an Existing Agent

When the user asks to audit an agent, perform a systematic review:

### 1. Structure Audit

- [ ] Frontmatter has all required fields (`name`, `description`, `model`, `color`, `memory`)
- [ ] Description includes triggering examples (3-4 minimum)
- [ ] Description covers proactive usage scenarios where applicable
- [ ] Body length is appropriate (<200 lines for specialists, <250 for orchestrators)

### 2. Instruction Quality Audit

- [ ] Clear identity and boundary statement at the top
- [ ] Named protocols with numbered steps (not vague guidance)
- [ ] Explains "why" behind critical rules rather than just stating mandates
- [ ] Output formats are explicitly defined with templates
- [ ] Self-check/verification step before completion
- [ ] Memory system instructions included

### 3. Team Integration Audit

- [ ] Agent role doesn't overlap significantly with existing agents
- [ ] Delegation paths are clear (who delegates to this agent, who it delegates to)
- [ ] Handoff points are well-defined (what this agent produces for others to consume)
- [ ] Error escalation path exists (what happens when the agent can't complete a task)

### 4. Triggering Accuracy Audit

- [ ] Description accurately captures when the agent should be used
- [ ] No obvious false-positive triggers (would this fire on unrelated tasks?)
- [ ] No obvious false-negative gaps (are there scenarios where this agent should trigger but wouldn't?)
- [ ] Examples are realistic and diverse

### 5. Behavioral Testing

Run 2-3 test prompts to verify:
- Does the agent stay within its boundaries?
- Does it follow its own protocols?
- Does it produce output in the specified format?
- Does it handle edge cases gracefully?

Present the audit as a structured report with findings and recommendations.

---

## Improving an Agent

This is the core iteration loop — the same pattern as skill improvement but adapted for agents.

### How to Think About Agent Improvements

1. **Generalize from feedback.** The agent will be used across many different tasks. If a test case reveals a problem, think about the underlying cause rather than patching the specific symptom. A narrow fix ("always mention X in the output") is less valuable than a structural improvement ("follow a consistent output template").

2. **Keep the prompt lean.** Agent instructions load into context every invocation. Remove things that aren't pulling their weight. Read the transcripts — if the agent spends time on unproductive steps, trim the instructions causing that behavior.

3. **Explain the why.** When you find yourself writing ALWAYS or NEVER in caps, that's a yellow flag. Reframe with reasoning: "Validate inputs before processing because invalid data has historically caused silent failures that are hard to debug downstream" is better than "ALWAYS validate inputs."

4. **Watch for boundary violations.** The most common agent failure mode is scope creep — doing work that belongs to another agent. Strengthen boundary language when you see this pattern.

5. **Check protocol adherence.** Read transcripts to see if the agent actually follows its own protocols. If it consistently skips steps, either the steps aren't valuable (remove them) or the instructions aren't clear enough (rewrite them).

6. **Look at handoff quality.** How well does this agent's output integrate with the next step in the workflow? If downstream agents or the user consistently need to reformat or supplement the output, improve the output specification.

### The Iteration Loop

1. Apply improvements to the agent `.md` file
2. Rerun all test cases into `iteration-<N+1>/`
3. Launch the viewer with `--previous-workspace` pointing at the previous iteration
4. Wait for user review
5. Read feedback, improve, repeat

Keep going until:
- The user is happy
- All feedback is empty
- You're not making meaningful progress

---

## Description Optimization

After the agent is working well, optimize its description for triggering accuracy. This uses the same approach as skill description optimization.

### Step 1: Generate Trigger Eval Queries

Create 20 eval queries — a mix of should-trigger and should-not-trigger. Save as JSON:

```json
[
  {"query": "the user prompt", "should_trigger": true},
  {"query": "another prompt", "should_trigger": false}
]
```

Queries must be realistic — specific tasks with file paths, personal context, details. Not abstract requests.

**Should-trigger queries (8-10):** Different phrasings of tasks this agent handles. Include cases where the user doesn't name the agent explicitly. Include edge cases where this agent competes with another but should win.

**Should-not-trigger queries (8-10):** Near-misses that share keywords but actually need a different agent or no agent at all. These are the tricky cases — not obviously irrelevant prompts.

### Step 2: Review with User

Present the eval set using the skill-creator's HTML template:

1. Read template from `/home/kp/.claude/plugins/cache/claude-plugins-official/skill-creator/205b6e0b3036/skills/skill-creator/assets/eval_review.html`
2. Replace `__EVAL_DATA_PLACEHOLDER__` with the JSON array, `__SKILL_NAME_PLACEHOLDER__` with agent name, `__SKILL_DESCRIPTION_PLACEHOLDER__` with current description
3. Write to `/tmp/eval_review_<agent-name>.html` and open it
4. User edits and exports — check `~/Downloads/eval_set.json`

### Step 3: Run the Optimization Loop

```bash
python -m scripts.run_loop \
  --eval-set <path-to-trigger-eval.json> \
  --skill-path <path-to-agent-dir> \
  --model <model-id> \
  --max-iterations 5 \
  --verbose
```

Run from the skill-creator scripts directory. Periodically check progress.

### Step 4: Apply the Result

Take `best_description` from the output and update the agent's frontmatter. Show before/after and report scores.

---

## Reference Files

- `references/agent-patterns.md` — Standard patterns, boilerplate blocks, and conventions for agent files
- `references/schemas.md` — JSON schemas for evals.json, grading.json, benchmark.json
- `agents/grader.md` — How to evaluate assertions against agent outputs
- `agents/analyzer.md` — How to analyze benchmark results and surface patterns

The skill-creator at `/home/kp/.claude/plugins/cache/claude-plugins-official/skill-creator/205b6e0b3036/skills/skill-creator/` provides reusable infrastructure:
- `eval-viewer/generate_review.py` — HTML review viewer
- `scripts/aggregate_benchmark.py` — Benchmark aggregation
- `agents/comparator.md` — Blind A/B comparison (for advanced use)

---

## Core Loop Summary

1. Understand what the agent should do
2. Draft or edit the agent `.md` file
3. Test by spawning the agent on realistic prompts
4. Evaluate: create benchmark.json and run `generate_review.py` so the user can review
5. Improve based on feedback
6. Repeat until satisfied
7. Optimize the description for triggering accuracy
