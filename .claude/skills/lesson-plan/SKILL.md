---
name: lesson-plan
description: Use when someone asks to plan a lesson, create a lesson plan, build lesson blocks, convert a resource into a lesson, or generate an ISLE physics lesson.
disable-model-invocation: true
argument-hint: "[topic or file path]"
---

## What This Skill Does

Generates physics lesson plans structured around the ISLE (Investigative Science Learning Environment) pedagogy and outputs them as a JSON array of lesson blocks that can be directly imported into the Porters-Portal lesson editor.

**Two modes:**
- **Topic mode:** Given a physics topic (e.g., "projectile motion"), generates a complete ISLE lesson from scratch.
- **Resource mode:** Given a file path to a PDF or document, reads the resource and converts it into ISLE-structured lesson blocks.

**Audience:** High school physics and AP Physics 1.

For the full ISLE pedagogy reference, see [isle-pedagogy.md](isle-pedagogy.md).
For the complete JSON block schema, see [block-schema.md](block-schema.md).

---

## Step 1: Detect Mode

Determine the mode from `<ARGUMENTS>`:

- If the argument is a **file path** (contains `/`, `.pdf`, `.docx`, `.md`, or similar): use **Resource mode**. Read the file first.
- If the argument is a **topic string** (e.g., "rotational motion", "Newton's third law"): use **Topic mode**.
- If no argument is provided, ask the user: "What topic should I plan a lesson for, or provide a file path to a resource to convert?"

---

## Step 2: Analyze Content

### Topic Mode
1. Identify the key concepts, vocabulary, and common misconceptions for the topic.
2. Determine which ISLE phases are appropriate (see Step 3). Not all topics need all 5 phases.
3. Think about what observations, experiments, and models students would work with.

### Resource Mode
1. Read the entire resource using the Read tool.
2. Identify the pedagogical structure already present (many physics resources, especially Etkina's Active Learning Guides, already follow ISLE phases).
3. Map existing sections to ISLE phases:
   - "Observe and find a pattern" / "Observe" -> Observational Experimentation
   - "Describe" / "Represent and reason" -> Model Development
   - "Test" / "Observe and analyze" -> Hypothesis Testing
   - "Reason" / "Apply" / problem sets -> Application
   - Introductions, prerequisites, reading exercises -> Preparation
4. Note which activities are hands-on/physical and will need digital adaptation.

---

## Step 3: Structure the Lesson Using ISLE Phases

Apply the ISLE phases flexibly. Include a phase only if it fits the content. For each phase you include, use a SECTION_HEADER block to mark it, then fill it with appropriate blocks.

### Phase 1: Preparation
**Purpose:** Establish foundational understanding through accessible observations. Activate prior knowledge.

Typical blocks:
- SECTION_HEADER with icon (e.g., "1. Preparation")
- TEXT introducing the context or phenomenon
- OBJECTIVES listing what students will learn
- VOCAB_LIST or VOCABULARY for key terms
- MC or SHORT_ANSWER to probe prior knowledge
- INFO_BOX (note) for prerequisite reminders

### Phase 2: Observational Experimentation
**Purpose:** Students make direct observations that generate questions about physical phenomena.

Typical blocks:
- SECTION_HEADER (e.g., "2. Observe and Find a Pattern")
- ACTIVITY describing the observation/experiment (adapt physical labs to guided digital activities)
- DATA_TABLE for recording observations
- SHORT_ANSWER asking "What do you notice?" / "What patterns do you see?"
- IMAGE with placeholder for diagrams or setup photos

### Phase 3: Model Development
**Purpose:** Students propose multiple competing explanations for their observations.

Typical blocks:
- SECTION_HEADER (e.g., "3. Develop a Model")
- TEXT framing the modeling task
- SHORT_ANSWER asking students to propose explanations
- SORTING to categorize variables or relationships
- ACTIVITY for whiteboard/discussion tasks (adapted digitally)
- INFO_BOX (tip) with representational guidance

### Phase 4: Hypothesis Testing
**Purpose:** Students use hypothetico-deductive reasoning to test their models. "If [model] is correct and I do [experiment], then [prediction] should occur."

Typical blocks:
- SECTION_HEADER (e.g., "4. Test Your Model")
- TEXT explaining the testing framework
- SHORT_ANSWER asking for predictions: "If your model is correct, what would you expect to observe if...?"
- ACTIVITY describing the testing experiment
- DATA_TABLE for recording test results
- MC asking which model is supported by evidence
- SHORT_ANSWER for reflection on results

### Phase 5: Application
**Purpose:** Students apply validated understanding to novel situations and problems.

Typical blocks:
- SECTION_HEADER (e.g., "5. Apply Your Understanding")
- TEXT introducing novel scenarios
- MC for conceptual application questions
- SHORT_ANSWER for problem-solving
- RANKING for ordering steps or reasoning
- SORTING for categorization tasks
- LINKED for follow-up questions

---

## Step 4: Convert to Lesson Blocks

For each phase, generate lesson blocks following the JSON schema defined in [block-schema.md](block-schema.md).

**Content rules:**
- Every block needs a `type` field. Include only the fields relevant to that block type.
- Do NOT include `id` fields — the import system auto-generates them.
- Use placeholder URLs for images, videos, and external links: `"url": "PLACEHOLDER: [description of what resource to add]"`
- For SHORT_ANSWER `acceptedAnswers`, include 2-4 scientifically accurate answer variations. Never fabricate inaccurate answers.
- For MC `correctAnswer`, use the 0-based index of the correct option.
- For SORTING `sortItems`, set `correct` to `"left"` or `"right"` appropriately.
- For DATA_TABLE, set `editable: false` for label columns and `editable: true` for student-input columns.
- For RANKING `items`, list them in the CORRECT order (the system scrambles them for the student).
- Keep TEXT blocks concise — students are doing, not reading.

**Resource mode adaptations:**
- Hands-on experiments (e.g., "use meter sticks") -> ACTIVITY block with adapted instructions for what to observe/discuss, or an equivalent digital representation using DATA_TABLE / BAR_CHART
- Fill-in tables from PDFs -> DATA_TABLE blocks with appropriate columns
- Discussion questions -> SHORT_ANSWER blocks
- Multiple-choice or conceptual questions -> MC blocks
- "Discuss with your group" prompts -> SHORT_ANSWER asking students to write their reasoning
- Physical equipment descriptions -> INFO_BOX (note) explaining the setup, paired with an IMAGE placeholder

---

## Step 5: Output the JSON

Output the complete JSON array in a code block. Format:

```json
[
  { "type": "SECTION_HEADER", "icon": "...", "title": "...", "subtitle": "..." },
  { "type": "TEXT", "content": "..." },
  ...
]
```

After the JSON, provide a brief summary:
- How many blocks were generated
- Which ISLE phases were included
- Any notes about content that may need manual review (e.g., placeholder URLs to fill in, activities that may need further adaptation)

---

## Notes

- **Scope:** Keep lessons appropriately scoped for high school / AP Physics 1. Don't overload a single lesson.
- **Phase flexibility:** Not every topic warrants all 5 phases. A lesson focused on problem-solving practice may emphasize Application. A lab-focused lesson may emphasize Observation and Testing.
- **Scientific accuracy:** Double-check physics content. Do not include incorrect equations, wrong units, or misconceptions presented as fact.
- **Block variety:** Use a mix of block types within each phase. Avoid long stretches of TEXT-only blocks — interleave with interactive blocks (MC, SHORT_ANSWER, SORTING, DATA_TABLE) to keep students engaged.
- **SECTION_HEADER icons:** Use relevant emojis: magnifying glass for observation, lightbulb for model development, test tube for hypothesis testing, rocket for application, book for preparation.
- **Dividers:** Use DIVIDER blocks between major phases for visual separation.
