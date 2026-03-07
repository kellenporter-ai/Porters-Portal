# Porters-Portal

## Centralized Management

All skills, agents, and agent memory for this project are managed by the Executive Assistant at `/home/kp/Desktop/Executive Assistant/`. Do not look for `.claude/skills/`, `.claude/agents/`, or `.claude/agent-memory/` in this repo — they have been centralized.

- **Skills:** `/home/kp/Desktop/Executive Assistant/skills/`
- **Agents:** `/home/kp/Desktop/Executive Assistant/agents/`
- **Agent Memory:** `/home/kp/Desktop/Executive Assistant/agents/memory/`

## Pedagogical Framework

This portal uses three instructional frameworks. All content-generating agents and skills must adhere to them.

### Backward Design (Wiggins & McTighe)
- **Stage 1**: Define specific, measurable learning outcomes first
- **Stage 2**: Design the assessment that measures those outcomes
- **Stage 3**: Only then build the instructional content (lessons, simulations, quests)
- No lesson content or simulation work until the assessment is validated by QA

### ISLE (Investigative Science Learning Environment)
- Lessons cycle: Observation → Hypothesis → Testing Experiment → Application
- Students derive formulas through pattern observation — never provided upfront
- Multiple representations required (motion diagrams, graphs, bar charts, equations)
- Adapts to Forensic Science via case-based inquiry and Evidence Locker analysis

### 5-Level Rubric → ISLE SAAR Mapping

| Portal Level | SAAR Score | Description |
|-------------|------------|-------------|
| Missing (0%) | 0 | No evidence of the skill |
| Emerging (25%) | 1 | Inadequate representation |
| Approaching (50%) | 2 | Needs improvement |
| Developing (75%) | 3 | Adequate representation |
| Refining (100%) | — | Exceeds expectations (portal extension) |

### Danielson Framework (2022) — Domain 1 Targets
- **1a**: Use ISLE to structure content, anticipate misconceptions, require multiple representations
- **1b**: WCAG 2.2 AA compliance, Chromebook optimization, early warning for at-risk students
- **1c**: Outcomes defined first via Backward Design, supporting student autonomy and curiosity
- **1e**: RPG narrative woven into ISLE cycle — quests and boss fights are testing experiments
- **1f**: 5-level rubric + SAAR scale in Firestore for real-time teacher dashboards; students can self-assess
