---
name: generate-questions
description: "Use when someone asks to generate questions, create a question bank, make boss battle questions, create dungeon room questions, or build quiz questions from content."
argument-hint: "[topic] [optional file path to PDF/document]"
disable-model-invocation: true
---

## What This Skill Does

Generates massive question banks (500-1000 per mode) from source content for a gamified LMS. Supports three game modes with distinct JSON formats. Uses parallel subagents to hit high question counts reliably.

When **Boss Battle** or **Dungeon Rooms** modes are selected, also generates the complete game structure (boss config or dungeon config) as an importable JSON file — ready to import directly into the portal's boss/dungeon creation forms.

For detailed JSON schemas for each mode, see [schemas.md](schemas.md).

## Steps

### Step 1: Parse Input

- `$0` = topic (required)
- `$1` = file path to source material (optional)
- If a file path is provided, read it first to ground all questions in the source content.
- If only a topic is provided, use domain knowledge to generate questions.

### Step 2: Ask Class (Optional)

Ask the user which class these questions are for. This affects depth, terminology, and content scope.

Use AskUserQuestion:
- **AP Physics 1** — College-level, calculus-adjacent, deep conceptual reasoning
- **Honors Physics** — High school advanced, algebra-based, strong conceptual focus
- **Forensic Science** — Applied science, evidence analysis, lab techniques
- **General / Infer from content** — Let the content determine the level

Default to "General" if the user skips or says it doesn't matter.

### Step 3: Ask Which Mode(s)

Ask the user which game mode(s) to generate questions for. Allow multiple selections.

Use AskUserQuestion with multiSelect:
- **Question Bank** — Easy/Medium/Hard MC across 3 Bloom's taxonomy tiers, importable via Question Bank form
- **Boss Battle** — Easy/Medium/Hard MC, 4 options, damage bonus scoring. Also generates a complete boss config (name, stats, phases, abilities, loot) importable into the portal.
- **Dungeon Rooms** — Progressive difficulty across 10 rooms, room-themed groupings. Also generates a complete dungeon config (rooms, monsters, structure) importable into the portal.

### Step 3b: Ask Boss/Dungeon Preferences (if applicable)

**If Boss Battle was selected**, ask the user:

Use AskUserQuestion:
- **Difficulty Tier** — NORMAL / HARD / NIGHTMARE / APOCALYPSE
  - NORMAL: 0-1 phases, 1-2 abilities, 1-2 modifiers
  - HARD: 1-2 phases, 2-3 abilities, 2-3 modifiers
  - NIGHTMARE: 2-3 phases, 3-4 abilities, 3-5 modifiers
  - APOCALYPSE: 3-4 phases, 4-5 abilities, 4-6 modifiers

**If Dungeon Rooms was selected**, ask the user:

Use AskUserQuestion:
- **Number of rooms** — 6 / 8 / 10 / 12
- **Overall difficulty** — EASY / MEDIUM / HARD

### Step 4: Generate Questions Using Subagents

For each selected mode, spawn subagents to generate questions in parallel. Target: **500-1000 questions per mode**.

**Agent priority:** Always use the project's custom agents first:
- **content-strategist-ux-writer** — for question generation subagents (educational content is its specialty)
- **qa-bug-resolution** — for validation passes
- **backend-integration-engineer** — for config generation (boss/dungeon structures)
- Only fall back to **general-purpose** agents if project agents are busy or unavailable.

**Batching strategy:**
- Each subagent generates ONE tier/difficulty level worth of questions (150-350 per batch)
- Spawn all tier subagents for a mode concurrently
- Each subagent outputs valid JSON arrays ONLY — no markdown fences, no commentary

**Subagent delegation — for each mode, spawn agents as follows.**

Every subagent prompt follows this template (customize the bracketed parts):

> You are an expert educational assessment designer. Generate 200 [MODE-SPECIFIC DETAILS] questions on the topic: [topic]. [If source content: Base ALL questions on this content: (paste)]. Class: [class]. See schemas.md for the exact JSON format. IDs start at "[prefix]q001". Output ONLY a valid JSON array — no markdown fences, no commentary. End cleanly with ].

#### Question Bank Mode — 3 subagents (one per difficulty tier)

Each question: 4 MC options (plain string array), correctAnswer is 0-based index. Same format as Boss Battle questions.

| Subagent | Tier (Bloom's) | Difficulty | damageBonus | ID Prefix |
|----------|----------------|-----------|------------|-----------|
| 1 | Remember & Understand | EASY | 0 | t1q |
| 2 | Apply & Analyze | MEDIUM | 25 | t2q |
| 3 | Evaluate & Create | HARD | 50 | t3q |

Vary stem styles (standard MC, conflicting contentions, troubleshooting, what's wrong, working backwards, qualitative reasoning) — but all encode as standard 4-option MC.

#### Boss Battle Mode — 3 subagents (one per difficulty)

Each question: 4 MC options, correctAnswer is 0-based index.

| Subagent | Difficulty | damageBonus | ID Prefix |
|----------|-----------|------------|-----------|
| 1 | EASY | 0 | eq |
| 2 | MEDIUM | 25 | mq |
| 3 | HARD | 50 | hq |

#### Dungeon Rooms Mode — 2 subagents

| Subagent | Rooms | Notes |
|----------|-------|-------|
| 1 | Rooms 1–5 | 50 questions per room. Difficulty escalates: Room 1 = easy recall |
| 2 | Rooms 6–10 | 50 questions per room. Room 10 = expert synthesis |

### Step 4b: Generate Boss Config (if Boss Battle selected)

After the question subagents are spawned, spawn ONE additional subagent to generate the boss structure config.

**Boss Config Subagent prompt:**
> You are an expert game designer for a gamified high school LMS. Generate a complete boss encounter config for the topic: "[topic]". Class: [class]. Difficulty tier: [selected tier].
>
> Output a SINGLE JSON object (not array) with this exact structure. See the Boss Config Schema in schemas.md for the complete format.
>
> The boss config must include:
> - Creative thematic boss name and description tied to the topic
> - Stats scaled to the difficulty tier (HP, damage per correct)
> - Boss appearance (type: BRUTE/PHANTOM/SERPENT, hue: 0-360)
> - Top-level modifiers appropriate for the difficulty tier
> - Phases with descending HP thresholds (e.g. 75%, 50%, 25%) — do NOT include modifiers on phases (the importer ignores them)
> - Abilities with varied triggers and effects
> - Loot table with thematically named items and stat allocations (slots: HEAD, CHEST, HANDS, FEET, BELT, AMULET, RING1, RING2)
> - Rewards (XP, flux, item rarity)
>
> Do NOT include questions — they are generated separately and will be merged in.
>
> Output ONLY the JSON object. No markdown fences. No commentary.

### Step 4c: Generate Dungeon Config (if Dungeon Rooms selected)

After the question subagents are spawned, spawn ONE additional subagent to generate the dungeon structure config.

**Dungeon Config Subagent prompt:**
> You are an expert game designer for a gamified high school LMS. Generate a complete dungeon config for the topic: "[topic]". Class: [class]. Number of rooms: [selected count]. Overall difficulty: [selected difficulty].
>
> Output a SINGLE JSON object (not array) with this exact structure. See the Dungeon Config Schema in schemas.md for the complete format.
>
> The dungeon config must include:
> - Creative thematic dungeon name and description
> - Room sequence following the pattern: COMBAT/PUZZLE warm-up rooms → escalating difficulty → REST rooms for recovery → BOSS room as climax
> - Creative enemy names tied to the topic for COMBAT/BOSS rooms
> - Appropriate enemy HP and damage scaling per room difficulty
> - REST rooms with heal amounts
> - Optional TREASURE rooms
> - Rewards and entry requirements scaled to difficulty
>
> Do NOT include questions in the rooms — they are generated separately and will be merged in.
> Set each room's `questions` to an empty array `[]`.
>
> Output ONLY the JSON object. No markdown fences. No commentary.

### Step 5: Collect and Validate

After all subagents complete:

1. **Parse each result** as JSON. If a subagent returned invalid JSON, attempt to fix (common issues: trailing commas, truncated arrays — close the array with `]`).
2. **Merge tier/difficulty arrays** into a single array per mode.
3. **Count questions** — report the final count per mode. If significantly under 500, note it to the user.
4. **Deduplicate** — scan for duplicate stems (exact or near-match). Remove duplicates.
5. **Validate IDs** — ensure no duplicate IDs. Reassign sequential IDs if needed.
6. **Shuffle answer positions (MANDATORY)** — LLMs heavily bias the correct answer toward option A/B (index 0/1). Run the bundled shuffle script on every output file:

```bash
python scripts/shuffle_options.py <input.json> <output.json>
```

The script handles all question formats (index-based, letter-based, multiple-select, ranking, linkedFollowUp) and verifies ~25% distribution per answer position, re-shuffling if any position exceeds 35%. See [scripts/shuffle_options.py](scripts/shuffle_options.py) for the implementation.

### Step 5b: Merge Questions into Boss/Dungeon Configs

**For Boss Battle mode:** Take the boss config JSON and add the merged questions array as `boss.questions`. Select a representative sample of questions (20-30) across all difficulties. The full question bank is written separately.

**For Dungeon Rooms mode:** Take the dungeon config JSON and distribute questions from the question bank into each room. The question count per room must be high enough that a student can always either kill the enemy or die trying — running out of questions soft-locks the dungeon run with no recovery. Use this formula based on enemy HP and expected player damage:

- **EASY COMBAT rooms (enemyHp 100-200):** 10-15 questions
- **MEDIUM COMBAT rooms (enemyHp 200-400):** 15-20 questions
- **HARD COMBAT rooms (enemyHp 300-500):** 20-25 questions
- **BOSS rooms (enemyHp 500-800):** 25-30 questions
- **PUZZLE rooms:** 8-12 questions (all must be answered to clear)
- **REST/TREASURE rooms:** 1-2 questions (auto-clear)

Match room difficulty to question difficulty: EASY rooms get EASY questions, MEDIUM rooms get MEDIUM questions, HARD/BOSS rooms get HARD questions. Map the dungeon room question format: `{ id, stem, options, correctAnswer, difficulty, damageBonus }`.

### Step 6: Write Output Files

Create the output directory structure and write files:

```
~/Desktop/Questions/[class]/[mode]/[topic-slug].json
```

- `[class]` = "AP Physics", "Honors Physics", "Forensic Science", or "GLOBAL"
- `[mode]` = "question-bank", "boss-battle", "dungeon-rooms"
- `[topic-slug]` = topic in kebab-case (e.g., "newtons-laws")

Each questions file contains a single JSON array of question objects.

**Additional config files for Boss Battle and Dungeon Rooms:**

```
~/Desktop/Questions/[class]/boss-battle/[topic-slug]-boss-config.json
~/Desktop/Questions/[class]/dungeon-rooms/[topic-slug]-dungeon-config.json
```

These config files contain a single JSON object (not array) that can be directly imported into the portal's boss/dungeon creation forms via the "Import JSON" button.

### Step 7: Report Summary

After writing all files, report to the user:

```
Questions generated:
- [Mode]: [count] questions -> [file path]
- [Mode]: [count] questions -> [file path]
...

Boss/Dungeon configs generated:
- Boss Config: [file path] (import into Boss Ops → Deploy Quiz Boss → Import JSON)
- Dungeon Config: [file path] (import into Dungeons → New Dungeon → Import JSON)

Total: [total] questions across [n] modes
```

Flag any issues (low counts, parse errors, deduplications).

## Notes

- **Distractors must be plausible and educational** — never use joke answers or obviously wrong options.
- **Questions must be grounded in source content** when a file is provided. Do not invent facts not in the source.
- **Output is pure JSON** — no markdown fences, no wrapper objects, just arrays (for questions) or objects (for configs).
- **If a subagent hits output limits**, it should end the JSON array cleanly with `]` so it can still be parsed.
- **ID format matters** — each mode has its own ID prefix convention (see schemas.md).
- **Do NOT auto-invoke this skill** — it generates large files and uses significant compute. User must explicitly request it.
- **Boss/Dungeon config files are separate from question files.** The config file includes a sample of questions embedded in it for convenience, but the full question bank is always the separate questions file.
- **CRITICAL: Always shuffle answer positions.** LLMs consistently place the correct answer as option A or B (~90%+ of the time). The Fisher-Yates shuffle in Step 5.6 is MANDATORY. Never skip it. Never write question files without first shuffling. Verify the distribution is ~25% per position before writing files.
- **The config files match the portal's import format.** The boss config matches what `QuizBossFormModal` expects; the dungeon config matches what `DungeonFormModal` expects. Teachers import, review, tweak, and deploy.
- **Dungeon rooms need enough questions to resolve combat.** If a room runs out of questions before the enemy dies or the player dies, the run is permanently soft-locked with no recovery. A base student deals ~10 damage per correct answer (plus damageBonus), so a 200 HP enemy needs ~20 correct answers with no bonus, or ~6 with +25 bonus. Always embed generously — it's better to have unused questions than a soft-locked dungeon.
- **Always prioritize project agents over general-purpose.** Use content-strategist-ux-writer for question generation, qa-bug-resolution for validation, backend-integration-engineer for config structures. General-purpose is a fallback only.
