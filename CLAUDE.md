# Porters-Portal

## Skills

### /lesson-plan
**Trigger:** "plan a lesson", "create a lesson plan", "build lesson blocks", "convert resource to lesson", "generate ISLE lesson"
**Usage:** `/lesson-plan [topic]` or `/lesson-plan [file path to PDF/document]`
**Description:** Generates ISLE-pedagogy-based physics lesson plans as importable JSON lesson blocks. Two modes: generate from a topic, or convert an existing resource (PDF) into ISLE-structured blocks. Outputs JSON ready for the lesson editor's JSON import.
**Audience:** High school physics / AP Physics 1

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
