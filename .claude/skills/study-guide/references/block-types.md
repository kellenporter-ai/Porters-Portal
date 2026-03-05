# Porters-Portal Lesson Block JSON Schema

This is the complete reference for all 19 block types supported by the Porters-Portal lesson editor. The JSON import accepts either a plain array of blocks or an object with a `blocks` property.

## Import Formats

**Array format (preferred for this skill):**
```json
[
  { "type": "TEXT", "content": "..." },
  { "type": "MC", "content": "...", "options": [...], "correctAnswer": 0 }
]
```

**Object format:**
```json
{
  "blocks": [
    { "type": "TEXT", "content": "..." }
  ]
}
```

## General Rules

- Every block MUST have a `type` field.
- Do NOT include `id` fields — they are auto-generated on import.
- Only include fields relevant to the specific block type.
- Blocks that don't use `content` as their primary field should still include `"content": ""` for consistency.

---

## Content Blocks

### TEXT
Plain text content.
```json
{
  "type": "TEXT",
  "content": "Your text content here"
}
```

### SECTION_HEADER
Section heading with icon and optional subtitle.
```json
{
  "type": "SECTION_HEADER",
  "icon": "emoji here",
  "title": "Section Title",
  "subtitle": "Optional subtitle"
}
```

### IMAGE
Image with caption and alt text.
```json
{
  "type": "IMAGE",
  "url": "https://example.com/image.png",
  "caption": "Figure caption",
  "alt": "Description of image"
}
```

### VIDEO
YouTube video embed.
```json
{
  "type": "VIDEO",
  "url": "https://youtube.com/watch?v=...",
  "caption": "Optional caption"
}
```

### OBJECTIVES
Learning objectives list.
```json
{
  "type": "OBJECTIVES",
  "title": "Learning Objectives",
  "items": [
    "Objective 1",
    "Objective 2",
    "Objective 3"
  ]
}
```

### DIVIDER
Horizontal separator.
```json
{
  "type": "DIVIDER",
  "content": ""
}
```

### EXTERNAL_LINK
Styled link card with button.
```json
{
  "type": "EXTERNAL_LINK",
  "title": "Resource Title",
  "url": "https://example.com",
  "content": "Description of the resource",
  "buttonLabel": "Open",
  "openInNewTab": true
}
```

### EMBED
iFrame embed (Codepen, PhET simulations, etc.).
```json
{
  "type": "EMBED",
  "url": "https://codepen.io/example",
  "caption": "Interactive example",
  "height": 500
}
```

### INFO_BOX
Callout box with variant styling.
```json
{
  "type": "INFO_BOX",
  "variant": "tip",
  "content": "Helpful information here"
}
```
Variants: `"tip"` (green), `"warning"` (amber), `"note"` (blue)

---

## Vocabulary Blocks

### VOCABULARY
Single term with definition.
```json
{
  "type": "VOCABULARY",
  "term": "Angular velocity",
  "definition": "The rate of change of angular position"
}
```

### VOCAB_LIST
Multiple terms with definitions.
```json
{
  "type": "VOCAB_LIST",
  "terms": [
    { "term": "Term 1", "definition": "Definition 1" },
    { "term": "Term 2", "definition": "Definition 2" }
  ]
}
```

---

## Activity Blocks

### ACTIVITY
Activity card with instructions.
```json
{
  "type": "ACTIVITY",
  "icon": "emoji",
  "title": "Activity Title",
  "instructions": "Detailed instructions for the activity"
}
```

### CHECKLIST
Interactive checkbox list.
```json
{
  "type": "CHECKLIST",
  "content": "Checklist Title",
  "items": [
    "Item 1",
    "Item 2",
    "Item 3"
  ]
}
```

### SORTING
Two-category drag-and-drop sorting.
```json
{
  "type": "SORTING",
  "title": "Sorting Activity Title",
  "instructions": "Sort these items into the correct categories",
  "leftLabel": "Category A",
  "rightLabel": "Category B",
  "sortItems": [
    { "text": "Item 1", "correct": "left" },
    { "text": "Item 2", "correct": "right" },
    { "text": "Item 3", "correct": "left" }
  ]
}
```

### DATA_TABLE
Editable data table for experiments.
```json
{
  "type": "DATA_TABLE",
  "title": "Table Title",
  "columns": [
    { "key": "trial", "label": "Trial", "editable": false },
    { "key": "measurement", "label": "Measurement", "unit": "m", "editable": true }
  ],
  "trials": 3
}
```

### BAR_CHART
Interactive bar chart.
```json
{
  "type": "BAR_CHART",
  "title": "Chart Title",
  "barCount": 3,
  "initialLabel": "Initial",
  "finalLabel": "Final",
  "deltaLabel": "Change",
  "height": 300
}
```

---

## Question Blocks (Interactive, tracked for completion)

### MC (Multiple Choice)
```json
{
  "type": "MC",
  "content": "Question text here?",
  "options": [
    "Option A",
    "Option B",
    "Option C",
    "Option D"
  ],
  "correctAnswer": 1
}
```
- `correctAnswer` is 0-based index
- 2-6 options supported

### SHORT_ANSWER
```json
{
  "type": "SHORT_ANSWER",
  "content": "Question text here?",
  "acceptedAnswers": [
    "acceptable answer 1",
    "acceptable answer 2"
  ]
}
```
- Matching is case-insensitive, substring
- For open-ended questions, `acceptedAnswers` can be omitted or left as an empty array

### RANKING
Drag-to-reorder items. List items in the CORRECT order — the system scrambles them.
```json
{
  "type": "RANKING",
  "content": "Arrange these in the correct order:",
  "items": [
    "First item (correct position 1)",
    "Second item (correct position 2)",
    "Third item (correct position 3)"
  ]
}
```

### LINKED
Follow-up question linked to another block. Only shown if the referenced block is answered correctly.
```json
{
  "type": "LINKED",
  "linkedBlockId": "block_id_here",
  "content": "Follow-up question based on previous answer",
  "acceptedAnswers": [
    "answer variation 1"
  ]
}
```
Note: Since IDs are auto-generated on import, LINKED blocks are difficult to use in imported JSON. Avoid using LINKED blocks in generated lessons unless the user specifically requests them.
