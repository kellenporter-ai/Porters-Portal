---
name: create-assessment
description: Use when someone asks to create an assessment, build a quiz, make a test, generate an exam, or create assessment questions for a class.
disable-model-invocation: true
argument-hint: "[topic] [optional file paths for context]"
---

## What This Skill Does

Generates ISLE-pedagogy-aligned assessments with mixed question types (free response, interactive, simulation-based) for any course. Outputs either importable JSON lesson blocks or a standalone HTML file with Proctor Bridge integration. Every assessment includes a matching rubric using the 5-level grading scale (Missing/Emerging/Approaching/Developing/Refining).

**Output formats:** JSON lesson blocks OR standalone HTML (user chooses)
**Output location:** `/home/kp/Desktop/Assessments/<class>/`

For the rubric format specification and exemplars, see [rubric-format.md](rubric-format.md).
For the ISLE pedagogy reference, see the lesson-plan skill's [isle-pedagogy.md](../lesson-plan/isle-pedagogy.md).
For the JSON block schema, see the lesson-plan skill's [block-schema.md](../lesson-plan/block-schema.md).

---

## Step 1: Parse Arguments

Extract from `<ARGUMENTS>`:

- **Topic/scenario** — the subject of the assessment (e.g., "energy conservation", "Newton's second law", "blood spatter analysis")
- **File paths** (optional) — paths to PDFs, images, or documents that provide context for the assessment content

If file paths are provided, read each one. Use their content to understand:
- What concepts the assessment should cover
- What level of depth is expected
- What specific skills or representations to assess
- Any diagrams, data, or scenarios to reference

If no arguments are provided, ask: "What topic should I create an assessment for? You can also provide file paths to reference materials."

---

## Step 2: Analyze and Confirm with User

Analyze the topic (and any reference materials) to infer:
- **Course level** — AP Physics, Honors Physics, Forensic Science, or other
- **Key concepts** — what physics/science concepts are involved
- **ISLE alignment** — which ISLE phases the assessment naturally targets (assessments most often target Application and Hypothesis Testing, but can target any phase)

Present your analysis to the user and ask them to confirm or correct:

1. **Course:** Which class is this for? (Present your best guess first)
2. **Output format:** JSON lesson blocks (for the lesson editor) or standalone HTML?
3. **Scope:** Confirm the key concepts and skills you plan to assess

Do NOT proceed until the user confirms.

---

## Step 3: Design the Assessment

Plan the assessment before generating anything:

### Question Design

Design a mix of question types appropriate to the content:

- **Free response / short answer** — Students explain, defend, predict, or analyze. These are the primary question type. Require students to show reasoning, not just answers.
- **Interactive elements** — Choose the best fit for each question:
  - **2D HTML5 Canvas** — for graphs, drag-and-drop diagrams, sliders, bar charts (lightweight, best for most cases)
  - **Babylon.js 3D simulations** — for spatial/physics concepts where 3D interaction adds genuine value (projectile motion, force visualization, crime scene reconstruction)
  - **Links to existing simulations** — when a relevant simulation already exists in `/home/kp/Desktop/Simulations/`
- **Data tables and bar charts** — for quantitative analysis questions
- **Sorting and ranking** — for classification and ordering tasks

### ISLE Phase Alignment

Map each assessment question to the ISLE phase it targets:

- **Preparation** questions probe prior knowledge or vocabulary (rarely the focus of assessments)
- **Observational Experimentation** questions ask students to identify patterns from data or observations
- **Model Development** questions ask students to propose, represent, or compare models/explanations
- **Hypothesis Testing** questions ask students to make predictions and evaluate evidence (common in assessments)
- **Application** questions ask students to apply understanding to novel situations (common in assessments)

### Rubric Planning

For each question, identify 2-4 distinct skills being assessed. Each skill will become a row in the rubric table. Skills should be:

- Specific to the physics/science content (not generic)
- Written as "I am able to..." statements
- Assessable across the 5-level scale with concrete, observable criteria

---

## Step 4: Generate the Assessment

### JSON Mode

Generate an array of lesson blocks following the schema in [block-schema.md](../lesson-plan/block-schema.md).

Structure the assessment as:

1. **SECTION_HEADER** — Assessment title with relevant icon
2. **OBJECTIVES** — Skills being assessed (these become the rubric skill statements)
3. **TEXT** — Brief context or scenario introduction (keep short — students are doing, not reading)
4. **Assessment questions** — Mix of block types per question:
   - **SHORT_ANSWER** for free response questions. For open-ended responses, omit `acceptedAnswers` or leave it as an empty array.
   - **MC** for multiple choice (use sparingly — prefer free response)
   - **DATA_TABLE** for quantitative analysis
   - **BAR_CHART** for energy/momentum bar chart tasks
   - **SORTING** for classification tasks
   - **RANKING** for ordering tasks
   - **ACTIVITY** for interactive or simulation-based prompts
   - **IMAGE** with placeholder URLs for diagrams students need to analyze
5. **DIVIDER** between major question groups
6. **INFO_BOX** (variant: "note") for hints or scaffolding where appropriate

Content rules:
- Do NOT include `id` fields — auto-generated on import
- Use placeholder URLs for images: `"url": "PLACEHOLDER: [description]"`
- For SHORT_ANSWER open-ended questions, omit `acceptedAnswers` or use an empty array
- Keep TEXT blocks concise

After the JSON, output the rubric (see Step 5).

### HTML Mode

Generate a single self-contained HTML file.

#### File Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>[Assessment Title]</title>
    <style>/* All CSS inline */</style>
</head>
<body>
    <script>/* Portal Bridge */</script>
    <div id="assessment-container"><!-- Assessment content --></div>
    <script>/* Assessment logic */</script>
</body>
</html>
```

#### Proctor Bridge — Always Include

```javascript
const PortalBridge = (() => {
    const send = (type, data) => {
        if (window.parent) window.parent.postMessage({ source: 'portal-activity', type, ...data }, '*');
    };
    return {
        init:     ()              => send('PROCTOR_READY'),
        save:     (state, q)      => send('SAVE_STATE',  { state, currentQuestion: q }),
        answer:   (id, ok, tries) => send('ANSWER',      { questionId: id, correct: ok, attempts: tries }),
        complete: (s, t, c)       => send('COMPLETE',    { score: s, total: t, correct: c })
    };
})();
window.addEventListener('load', () => PortalBridge.init());
```

Call `PortalBridge.save(stateObj, currentQuestionIndex)` whenever a student modifies an answer, so progress is preserved.
Call `PortalBridge.complete(score, total, correct)` when the student submits the assessment. Since this is teacher-graded, pass `score: 0, total: [numQuestions], correct: 0` — the teacher will override with actual grades.

#### Dark Theme UI

Use this color scheme for the assessment:

```css
:root {
    --bg:       #0f0720;
    --panel-bg: rgba(18, 10, 38, 0.88);
    --border:   rgba(160, 100, 255, 0.18);
    --text:     #e8e4f4;
    --muted:    #8a85a8;
    --blue:     #5b9cf6;
    --green:    #22d47a;
    --orange:   #f5a623;
    --red:      #e8504a;
    --purple:   #9b6bff;
}
```

- Glassmorphism panels: `backdrop-filter: blur(14px); background: var(--panel-bg); border: 1px solid var(--border); border-radius: 14px;`
- Clean, readable layout — questions flow vertically
- Mobile responsive for Chromebook screens
- Min 44px touch targets for all interactive elements

#### Assessment Features

- **Text areas** for free response questions with auto-expanding height
- **Interactive elements** inline (Canvas-based or Babylon.js as needed)
- **Submit button** that triggers Proctor Bridge completion and displays confirmation
- **Print/Export button** that opens the browser print dialog (include `@media print` styles that hide UI chrome and format for paper)
- **Progress indicator** showing which questions have been answered
- **Auto-save** via PortalBridge.save() on every input change

#### Interactive Elements

When a question requires an interactive element:

- **2D Canvas elements:** Build inline using HTML5 Canvas. Include drag-and-drop, sliders, and graphing tools as needed. Keep Canvas elements under 600x400px.
- **Babylon.js 3D elements:** Only when 3D adds genuine value. Include `<script src="https://cdn.babylonjs.com/babylon.js"></script>` only if used. Follow the performance budgets from the 3d-activity skill (cap devicePixelRatio at 1.5, shadow maps at 1024, etc.).
- **Links to existing simulations:** Check `/home/kp/Desktop/Simulations/` for relevant existing simulations. If one exists, embed a link or iframe rather than rebuilding it.

#### Rubric Inclusion

Include the rubric as a collapsible section at the top of the assessment (visible to students). Use a `<details><summary>` element:

```html
<details class="rubric-panel">
    <summary>View Rubric</summary>
    <!-- Rubric table here -->
</details>
```

Save the HTML file to: `/home/kp/Desktop/Assessments/<class>/<filename>.html`

Where `<class>` matches the user's course choice and `<filename>` is descriptive kebab-case (e.g., `energy-conservation-assessment.html`).

---

## Step 5: Generate the Rubric

Generate a rubric for every assessment, regardless of output format. Follow the exact format specified in [rubric-format.md](rubric-format.md).

### Rubric Generation Process

1. **Identify skills:** For each assessment question, identify 2-4 distinct skills being assessed. Write each as an "I am able to..." statement specific to the physics/science content.

2. **Write level descriptors:** For each skill, write all 5 level descriptors following the exact patterns:

   - **Missing (0%):** "There is no attempt to [skill action]."
   - **Emerging (55%):** "There is [some/an] attempt to [skill action] -BUT- [critical failure criteria] -OR- [alternative failure]"
   - **Approaching (65%):** "There is a decent attempt to [skill action] -BECAUSE- [what's correct] -BUT- [significant remaining issues] -OR- [alternative issue]"
   - **Developing (85%):** "There is a good attempt to [skill action] -BECAUSE- [correct] -AND- [more correct] -BUT- [minor issues]"
   - **Refining (100%):** "There is an excellent attempt to [skill action] -BECAUSE- [correct] -AND- [correct] -AND- [mastery indicator]"

3. **Use structured connectors:** Always write -BUT-, -BECAUSE-, -AND-, -OR- on their own lines.

4. **Be content-specific:** Rubric criteria must reference the actual physics concepts, representations, and reasoning being assessed. Never use generic criteria.

5. **Include concrete examples** at the Approaching and Developing levels where helpful (use bullet points under "For example").

### Rubric Output

- **JSON mode:** Output the rubric as a formatted markdown table in a code block after the JSON lesson blocks.
- **HTML mode:** Embed the rubric in the HTML file as a collapsible section (see Step 4).

---

## Step 6: Present to User for Review

After generating the assessment and rubric, provide a summary:

- Assessment title and course
- Number of questions and types used
- ISLE phases targeted
- Skills assessed (rubric skill statements)
- Output format and file path (if HTML)
- Any notes about content that may need manual review (placeholder images, activities needing further context, etc.)

Ask the user if they want to make any changes before finalizing.

---

## Notes

- **Scientific accuracy is critical.** Physics equations, units, concepts, and reasoning must be correct. Do not fabricate inaccurate science.
- **Rubric is mandatory.** Every assessment gets a rubric. No exceptions.
- **Free response emphasis.** Prefer free response questions over multiple choice. Assessments should require students to explain, defend, and reason — not just select answers.
- **ISLE alignment.** Assessment questions should reflect ISLE practices — students predicting, testing, observing patterns, building models, applying understanding. Avoid rote recall questions.
- **Chromebook performance.** If using Babylon.js in HTML mode, follow the same performance constraints as the 3d-activity skill.
- **No external assets.** HTML files must be fully self-contained. All styles inline, all scripts inline or from CDN.
- **Teacher-graded.** These assessments are graded by the teacher using the rubric, not auto-graded. The assessment collects student responses; the teacher evaluates them.
- **Print support.** HTML assessments must include print-friendly styles so students or teachers can print a paper copy if needed.
- **Agent delegation.** For HTML mode assessments, delegate to the project's specialized agents (always prioritize these over general-purpose):
  - **content-strategist-ux-writer** — for reviewing assessment instructions, question wording, and rubric clarity. Delegate when assessment copy needs refinement for student comprehension.
  - **qa-bug-resolution** — for validating HTML output (accessibility, Proctor Bridge integration, print styles). Delegate after generating the HTML file to get a quality audit before delivering to the user.
  - Always use project agents first. Only fall back to general-purpose agents if project agents are unavailable.
