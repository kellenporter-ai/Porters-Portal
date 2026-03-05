# JSON Schemas for Agent Creator

This document defines the JSON schemas used by the agent-creator skill. These are adapted from the skill-creator schemas to work with agent evaluation.

---

## evals.json

Defines test cases for an agent. Located at `evals/evals.json` within the skill directory.

```json
{
  "agent_name": "example-agent",
  "evals": [
    {
      "id": 1,
      "prompt": "Realistic task prompt the user would say",
      "expected_output": "Description of what success looks like",
      "context_files": ["path/to/relevant/file.ts"],
      "expectations": [
        "The agent stayed within its defined boundaries",
        "The output follows the specified format template",
        "The agent used the correct protocol for this task type"
      ]
    }
  ]
}
```

**Fields:**
- `agent_name`: Must match the agent's frontmatter `name` field
- `evals[].id`: Unique integer identifier
- `evals[].prompt`: The task to give the agent (what the user would say)
- `evals[].expected_output`: Human-readable description of success
- `evals[].context_files`: Optional list of file paths the agent needs access to
- `evals[].expectations`: List of verifiable statements — the grader evaluates each

**Agent-specific expectation categories:**

| Category | Example Expectations |
|----------|---------------------|
| Boundary compliance | "The agent did not modify backend files" |
| Protocol adherence | "The agent followed the 5-step review protocol" |
| Output format | "The sign-off report includes all required sections" |
| Quality | "The spec covers edge cases and error states" |
| Team integration | "The agent reported backend needs via the escalation pattern" |
| Memory usage | "The agent consulted existing memory before starting" |

---

## eval_metadata.json

Metadata for a single test case run. Located at `<workspace>/iteration-N/eval-<ID>/eval_metadata.json`.

```json
{
  "eval_id": 0,
  "eval_name": "descriptive-name-here",
  "prompt": "The task prompt",
  "assertions": [
    "The agent produced a structured delegation with all required fields",
    "The agent did not write production code"
  ]
}
```

---

## grading.json

Output from the grader. Located at `<run-dir>/grading.json`.

**Important:** Use exactly the fields `text`, `passed`, and `evidence` in the expectations array. The eval viewer depends on these exact field names.

```json
{
  "expectations": [
    {
      "text": "The agent stayed within frontend-only boundaries",
      "passed": true,
      "evidence": "Transcript shows agent modified only .tsx and .css files"
    },
    {
      "text": "The agent produced a self-audit checklist",
      "passed": false,
      "evidence": "Agent reported completion without running through the verification checklist"
    }
  ],
  "summary": {
    "passed": 1,
    "failed": 1,
    "total": 2,
    "pass_rate": 0.50
  },
  "execution_metrics": {
    "tool_calls": {"Read": 8, "Edit": 3, "Bash": 2},
    "total_tool_calls": 13,
    "total_steps": 5,
    "errors_encountered": 0
  },
  "timing": {
    "executor_duration_seconds": 95.0,
    "grader_duration_seconds": 20.0,
    "total_duration_seconds": 115.0
  },
  "claims": [
    {
      "claim": "All form inputs have associated labels",
      "type": "quality",
      "verified": true,
      "evidence": "Inspected output HTML — all 6 inputs have matching <label for=...>"
    }
  ],
  "eval_feedback": {
    "suggestions": [],
    "overall": "Assertions cover boundaries and output format well."
  }
}
```

---

## timing.json

Captured from subagent task notifications. Located at `<run-dir>/timing.json`.

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

**How to capture:** When a subagent task completes, the notification includes `total_tokens` and `duration_ms`. Save immediately — this data isn't persisted elsewhere.

---

## benchmark.json

Aggregated benchmark results. Uses the same schema as skill-creator's benchmark.json so the eval viewer can display it. See the skill-creator's `references/schemas.md` for the full schema.

Key fields: `metadata`, `runs[]` (with `configuration: "with_skill"` or `"without_skill"`), `run_summary`, `notes`.

Note: Even though we're benchmarking agents, the viewer expects `configuration` values of `with_skill` / `without_skill`. Use these exact strings.

---

## audit_report.json

Output from an agent audit. Located at `<workspace>/audit_report.json`.

```json
{
  "agent_name": "qa-bug-resolution",
  "agent_path": ".claude/agents/qa-bug-resolution.md",
  "audit_date": "2026-03-04",
  "sections": {
    "structure": {
      "score": "pass",
      "findings": ["All frontmatter fields present", "Description includes 4 examples"],
      "issues": []
    },
    "instruction_quality": {
      "score": "needs_improvement",
      "findings": ["Clear identity statement", "Named protocols present"],
      "issues": ["Missing self-check before sign-off in some paths"]
    },
    "team_integration": {
      "score": "pass",
      "findings": ["Clear delegation sources", "Well-defined handoff format"],
      "issues": []
    },
    "triggering": {
      "score": "pass",
      "findings": ["Description covers main use cases"],
      "issues": ["Missing proactive trigger for post-deploy audits"]
    },
    "behavioral": {
      "score": "needs_improvement",
      "findings": ["Stays within boundaries in test 1 and 2"],
      "issues": ["Skipped accessibility audit steps in test 3"]
    }
  },
  "overall_assessment": "Agent is structurally sound but occasionally skips protocol steps under time pressure. Recommend strengthening the self-audit checklist.",
  "recommendations": [
    {
      "priority": "high",
      "area": "instruction_quality",
      "suggestion": "Add explicit 'do not skip steps' guidance with reasoning"
    }
  ]
}
```
