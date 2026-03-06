# Porters-Portal

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

## Skills

### /lesson-plan
**Trigger:** "plan a lesson", "create a lesson plan", "build lesson blocks", "convert resource to lesson", "generate ISLE lesson"
**Usage:** `/lesson-plan [topic]` or `/lesson-plan [file path to PDF/document]`
**Description:** Generates ISLE-pedagogy-based physics lesson plans as importable JSON lesson blocks. Two modes: generate from a topic, or convert an existing resource (PDF) into ISLE-structured blocks. Outputs JSON ready for the lesson editor's JSON import.
**Audience:** High school physics / AP Physics 1

### /2d-activity
**Trigger:** "create a 2D activity", "interactive diagram", "drag-and-drop exercise", "canvas simulation", "graphing tool", "sorting activity", "matching exercise", "interactive timeline", "evidence board", "make an interactive for [topic]"
**Usage:** `/2d-activity [topic] [optional file paths for context]`
**Description:** Generates lightweight 2D interactive HTML activities using Canvas, SVG, or vanilla JS — no Babylon.js. Covers drag-and-drop, slider explorers, canvas physics, data builders, evidence boards, interactive diagrams, and sequencers. Asks which class and whether graded or exploratory. Integrates with Proctor Bridge. Optimized for Chromebook trackpads. Prefer this over /3d-activity unless the task genuinely needs 3D spatial interaction.
**Output:** `/home/kp/Desktop/Simulations/<class>/`

### /3d-activity
**Trigger:** "create a 3D simulation", "build a Babylon.js activity", "make a 3D interactive scene", "generate a physics sim", "create a forensic science simulation"
**Usage:** `/3d-activity [topic] [optional file paths for context]`
**Description:** Generates standalone HTML files with interactive 3D Babylon.js simulations for physics and forensic science. Supports reference materials (PDFs, images, documents) for context. Asks which class (AP Physics, Honors Physics, Forensic Science) and whether graded or exploratory. Integrates with Proctor Bridge. Optimized for Chromebook GPUs.
**Output:** `/home/kp/Desktop/Simulations/<class>/`

### /dev-pipeline
**Trigger:** "fix a bug", "implement a feature", "add functionality", "resolve an issue", "build and deploy", "fix and ship"
**Usage:** `/dev-pipeline [description of bug or feature]`
**Description:** Full development lifecycle automation. Analyzes the bug/feature, researches best practices, implements the solution (delegating to ui-accessibility-engineer and backend-integration-engineer as needed), builds, runs QA via the qa-bug-resolution agent, auto-fixes any issues found, then commits, pushes, and deploys to Firebase production. Fully autonomous — no checkpoints.

### /create-assessment
**Trigger:** "create an assessment", "build a quiz", "make a test", "generate an exam", "create assessment questions"
**Usage:** `/create-assessment [topic]` or `/create-assessment [topic] [file path to PDF/document]`
**Description:** Generates ISLE-pedagogy-aligned assessments with mixed question types (free response, interactive, simulation-based). Outputs either JSON lesson blocks or standalone HTML with Proctor Bridge integration. Always generates a matching 5-level rubric (Missing/Emerging/Approaching/Developing/Refining). Teacher-graded, not auto-graded.
**Output:** `/home/kp/Desktop/Assessments/<class>/`

### /generate-image
**Trigger:** "generate an image", "create a picture", "I need an image prompt for", "make an image prompt", "build an image prompt"
**Usage:** `/generate-image [subject or scene description]`
**Description:** Conversational image prompt builder for Nano Banana Pro 2 (Gemini). Guides through subject, scene, style, and technical discovery to produce structured JSON prompts optimized for highly detailed, realistic image generation. Outputs JSON ready to paste into Gemini / AI Studio.
**Output:** `/home/kp/Desktop/ImagePrompts/`

### /game-balance
**Trigger:** "game balance", "XP economy", "loot tuning", "boss difficulty", "dungeon scaling", "progression curves", "are rewards balanced", "how fast do students level up"
**Usage:** `/game-balance [optional: specific subsystem or question]`
**Description:** Analyzes and tunes the RPG gamification economy. Runs progression simulations for casual/active/power student profiles, identifies XP dominance, Flux inflation, rarity cliffs, dead zones, and engagement bypasses. Outputs structured balance reports with specific tuning recommendations. References the complete economy constants in `references/economy-reference.md`.

### /study-guide
**Trigger:** "study guide", "review sheet", "exam prep", "cheat sheet", "review notes", "unit summary", "make a review for the test", "create practice problems with solutions"
**Usage:** `/study-guide [topic or unit]` or `/study-guide [file path to source content]`
**Description:** Generates condensed student-facing study guides from existing lessons, question banks, and reading materials. Includes key concepts, vocabulary, formulas, practice problems with worked solutions, and self-check questions. Outputs either JSON lesson blocks (importable to the lesson editor) or printable HTML with dark/print themes.
**Output:** JSON blocks or `/home/kp/Desktop/StudyGuides/<class>/`

### /crime-scene-generator (model-invocable)
**Trigger:** "crime scene", "forensic scenario", "mystery case", "investigative activity", or any forensic topic (arson, DNA, trace evidence, toxicology, blood spatter, ballistics, fingerprinting, digital forensics, entomology)
**Usage:** `/crime-scene-generator [forensic topic] [optional: downstream context]`
**Description:** Generates detailed, scientifically grounded forensic crime scene dossiers as structured JSON. Designed as a foundational skill — other content-generating skills and agents call it when they need a crime scene for assessments, 3D simulations, lesson activities, or quests. Outputs include: scene layout, 4-6 ambiguous evidence pieces, morally gray characters, debate triggers, a teacher key, and portal integration hooks. Not user-invocable — triggered automatically by agents.
**Output:** Structured JSON consumed by downstream skills/agents

### /agent-creator
**Trigger:** "create an agent", "make me an agent", "audit an agent", "improve an agent", "agent isn't working well", "add a new agent to the team", "optimize agent triggering"
**Usage:** `/agent-creator [create|audit|improve] [agent name or description]`
**Description:** Creates, audits, and improves Claude Code agents (subagent `.md` files). Handles the full agent lifecycle: capturing intent, writing the agent file with proper frontmatter and protocols, testing with realistic prompts, evaluating with benchmarks, and iterating based on feedback. Can also audit existing agents for structural quality, instruction clarity, team integration, and triggering accuracy. Reuses skill-creator's eval viewer and benchmark infrastructure for quantitative evaluation.

## Agent Team

The following specialized agents are available for delegation:

| Agent | Role | When to Use |
|-------|------|-------------|
| **portal-orchestrator** | Lead architect — plans, decomposes, delegates | Complex multi-step features, architectural decisions, cross-cutting work |
| **ui-accessibility-engineer** | Frontend specialist — WCAG compliance, components, responsive design | UI changes, accessibility fixes, visual bugs, layout issues |
| **backend-integration-engineer** | Firebase specialist — Cloud Functions, Firestore, security rules | Cloud Functions, Firestore schemas, security rules, data model changes |
| **qa-bug-resolution** | QA gatekeeper — tests, static analysis, accessibility audit | Post-implementation audit, integration sign-off, regression testing |
| **content-strategist-ux-writer** | UX copy — RPG flavor text, ISLE content, UI microcopy | Student-facing copy, loot descriptions, quest text, instructional content |
| **data-analyst** | Analytics — student engagement, grades, progression, EWS | Performance reports, at-risk identification, engagement trends, integrity audits |
| **economy-designer** | RPG economy — items, abilities, loot, bosses, tuning | New items/abilities, economy tuning, seasonal events, skill tree extensions |
| **deployment-monitor** | Post-deploy verification — logs, hosting, indexes | Production health checks, post-deploy verification, error diagnosis |
