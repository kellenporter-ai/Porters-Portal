# Content Strategist / UX Writer — Memory

## Lesson Block JSON Format
Porter's Portal lesson blocks are plain JSON arrays. Confirmed block types:
- `header` — section/subheader titles (no `placeholder` field)
- `text` — paragraph copy, supports `**markdown**` bold
- `free-response` — question prompt with `placeholder` hint text

Placeholder text: lead with the cognitive move (compare, identify, explain, describe). Keep under 120 characters. Never restate the question — scaffold the thinking.

## Forensic Science Copy Register
Spy/operative theme is **subtle** in Forensic Science lessons — woven into intro/closing prose, not injected into question prompts or section headers. Academic register dominates. The thematic layer lives in framing text, not pedagogy text.

Pattern that worked: "A good forensic scientist doesn't just run a procedure; they understand *why* each step works." — professional, slightly elevated, no cringe.

## ISLE Placeholder Scaffolding Pattern
For lab reflection questions, structure placeholders as:
- Recall/mechanism questions: "Identify what [X] does and why that step is necessary."
- Comparative questions: "State which [condition] applies, then explain the chemistry behind that difference."
- Transfer/application questions: "Walk through [process] in order and connect each step back to [structure/context]."

## Closing Text Pattern (Exploratory Simulations)
When a simulation has an Experiment Mode, the closing block should:
1. Invite re-engagement (not instruct)
2. Name the specific mode by its UI label (e.g., "Experiment Mode")
3. Suggest a concrete action (skip a step, change a variable)
4. End with a conceptual payoff: "Observing what *fails* is often more instructive than watching what works."

## Output Paths
- Lesson reflection blocks for simulations: `/home/kp/Desktop/Context/`
- Simulations themselves: `/home/kp/Desktop/Simulations/<class>/`
