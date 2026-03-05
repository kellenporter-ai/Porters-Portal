---
name: study-guide
description: >
  Generate condensed student-facing study guides from existing Porters-Portal lesson content and
  question banks. Use this skill whenever the user mentions study guide, review sheet, exam prep,
  cheat sheet, study material, review notes, unit summary, concept review, test prep, or wants to
  create student-facing review content from existing lessons or question banks. Also trigger when
  the user says things like "students need something to study from", "make a review for the test",
  "summarize this unit for students", or "create practice problems with solutions".
---

# Study Guide Generator

You generate focused, student-facing study guides from existing Porters-Portal content. Study guides distill lessons, assessments, and question banks into condensed review materials that help students prepare for tests, reinforce key concepts, and practice with worked solutions.

The output is always student-facing — written for high school physics or forensic science students, not for the teacher. The tone should be clear, encouraging, and concise.

## Output Formats

The user can choose between two formats:

### 1. JSON Lesson Blocks (default)
An importable JSON array of lesson blocks that can be pasted directly into the Porters-Portal lesson editor via JSON import. This is the preferred format because it lives inside the portal, tracks engagement, and awards XP.

### 2. Printable HTML
A standalone, self-contained HTML file with the portal's dark theme, optimized for printing (with a white print stylesheet). Saved to `/home/kp/Desktop/StudyGuides/<class>/`. Use this when the teacher wants physical handouts.

## Workflow

### Step 1: Identify Source Content

The user will specify content in one of these ways:

- **By topic:** "Make a study guide for projectile motion" → search existing assignments for matching content
- **By unit:** "Study guide for Unit 3" → pull all assignments in that unit
- **By file path:** "Study guide from this PDF" → read and distill the document
- **By assignment:** "Study guide for [assignment title]" → use that specific lesson's blocks and question bank

When given a topic or unit, search the codebase and existing content to understand what has been taught. Read relevant lesson blocks, question banks, and reading materials to gather source content.

### Step 2: Ask Clarifying Questions

Confirm with the user:
1. **Class:** AP Physics 1, Honors Physics, or Forensic Science?
2. **Scope:** Full unit review or targeted concept review?
3. **Format:** JSON blocks (importable) or printable HTML?
4. **Include practice problems?** (default: yes, 8-12 problems with worked solutions)

### Step 3: Structure the Study Guide

Every study guide follows this structure, adapted to fit the content:

#### A. Header Section
- Title: "Study Guide: [Topic/Unit]"
- Scope statement: what's covered, what's not
- Estimated study time

#### B. Key Concepts
- 3-8 core concepts, each with:
  - A clear, jargon-free explanation (2-3 sentences max)
  - A concrete example or analogy
  - Common misconception to avoid (when relevant)

#### C. Vocabulary
- Essential terms with plain-language definitions
- Group related terms together rather than alphabetical listing

#### D. Formulas & Relationships (physics only)
- Key equations with variable definitions
- When to use each formula
- Unit analysis reminders

#### E. Visual Summary (when appropriate)
- Describe diagrams or suggest what students should sketch
- Reference specific simulations or activities from the course

#### F. Practice Problems with Worked Solutions
- 8-12 problems spanning Bloom's tiers:
  - 3-4 recall/understand (Tier 1)
  - 3-4 apply/analyze (Tier 2)
  - 2-4 evaluate/create (Tier 3)
- Each problem includes a full worked solution showing reasoning, not just the answer
- Pull from existing question banks when available, adapting MC questions into free-response format for deeper practice

#### G. Self-Check
- 5-8 quick true/false or fill-in-the-blank questions for rapid self-assessment
- Answers at the bottom (or in a collapsed INFO_BOX for JSON format)

### Concise Mode

When the user asks to "keep it short", "make it quick", "just the basics", or similar brevity cues, switch to concise mode:

- **Target: 15-20 blocks max.** This is a hard constraint — do not exceed 25 blocks.
- Skip the self-check section entirely
- Reduce practice problems to 3-4 (one per Bloom's tier)
- Combine vocabulary into a single VOCAB_LIST instead of individual entries
- Use 1-2 sentence concept explanations instead of full paragraphs
- Omit the visual summary section
- Keep worked solutions but make them shorter (key steps only, not full narration)

The user is asking for a quick refresher, not a comprehensive review. Respect that intent.

### Step 4: Generate the Output

#### For JSON Lesson Blocks:

Use these block types from the schema in `references/block-types.md`:

| Section | Block Types |
|---------|-------------|
| Title & scope | SECTION_HEADER, TEXT |
| Key concepts | TEXT, INFO_BOX (variant: "tip" for key insights) |
| Vocabulary | VOCAB_LIST |
| Formulas | TEXT (with LaTeX: `$F = ma$`) |
| Practice problems | TEXT (problem stem), SHORT_ANSWER (student workspace), INFO_BOX (variant: "note", collapsed solution) |
| Self-check | MC (for quick self-test) |
| Answers | INFO_BOX (variant: "tip") |

Generate a valid JSON array. Each block must have `type` and `content` at minimum. Follow the exact field names from `references/block-types.md`.

**Wrap the JSON in a code fence for easy copy-paste:**
```json
[
  { "type": "SECTION_HEADER", "icon": "📋", "title": "Study Guide: [Topic]", "subtitle": "Key concepts and practice" },
  ...
]
```

#### For Printable HTML:

Generate a single self-contained HTML file following the portal's dark theme. Include a `@media print` stylesheet that switches to white background with black text for printing.

Structure:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Study Guide: [Topic]</title>
  <style>
    /* Dark theme for screen */
    :root {
      --bg: #0f0720;
      --panel-bg: rgba(18, 10, 38, 0.88);
      --border: rgba(160, 100, 255, 0.18);
      --text: #e8e4f4;
      --muted: #8a85a8;
      --blue: #60a5fa;
      --green: #4ade80;
      --orange: #fb923c;
      --purple: #a78bfa;
    }
    /* Print overrides */
    @media print {
      :root { --bg: #fff; --panel-bg: #fff; --text: #000; --muted: #666; --border: #ccc; }
      body { font-size: 11pt; }
      .no-print { display: none; }
    }
    /* ... layout styles ... */
  </style>
</head>
<body>
  <!-- Study guide content -->
</body>
</html>
```

For math formulas in HTML mode, use plain Unicode symbols and HTML entities (e.g., `F = ma`, `v² = v₀² + 2a·Δx`, `½mv²`) rather than LaTeX rendering. This keeps the file fully self-contained with no external dependencies — important because students may not have internet access when studying from a printed or saved file.

### Step 5: Present the Output

For JSON: display the block array in a code fence and tell the teacher how to import it (Lesson Editor → JSON Import → paste → import).

For HTML: save to `/home/kp/Desktop/StudyGuides/<class>/[topic-slug]-study-guide.html` and confirm the file path.

## Writing Guidelines

These guides are for **high school students**. Write accordingly:

- **Plain language first.** Define jargon before using it. "The normal force (the push a surface exerts back on an object resting on it)..."
- **Short paragraphs.** 2-3 sentences max per concept explanation.
- **Active voice.** "Gravity pulls objects toward Earth" not "Objects are pulled toward Earth by gravity."
- **Concrete examples.** Every abstract concept gets a real-world example. "A 2 kg book on a table" not "an object of mass m."
- **Worked solutions show thinking.** Don't just show math steps — narrate the reasoning. "First, identify what we know and what we're solving for..."
- **Encourage, don't intimidate.** "This is a tricky concept — here's how to think about it" not "This is a common mistake."

## Reference

Read `references/block-types.md` for the complete lesson block JSON schema.
