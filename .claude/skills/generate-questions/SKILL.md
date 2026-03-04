---
name: generate-questions
description: "Use when someone asks to generate questions, create a question bank, make boss battle questions, generate PVP arena questions, create dungeon room questions, or build quiz questions from content."
argument-hint: "[topic] [optional file path to PDF/document]"
disable-model-invocation: true
---

## What This Skill Does

Generates massive question banks (500-1000 per mode) from source content for a gamified LMS. Supports four game modes with distinct JSON formats. Uses parallel subagents to hit high question counts reliably.

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
- **Question Bank** — Bloom's taxonomy 3-tier, 9 question types, XP-based (10/25/50)
- **Boss Battle** — Easy/Medium/Hard MC, 4 options, damage bonus scoring. Also generates a complete boss config (name, stats, phases, abilities, loot) importable into the portal.
- **PVP Arena** — Balanced-difficulty MC for head-to-head competition, point-based
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

**Subagent delegation — for each mode, spawn agents as follows:**

#### Question Bank Mode
Spawn 3 subagents (one per Bloom's tier):

**Subagent 1 prompt:**
> You are an expert educational assessment designer. Generate 200 questions for TIER 1 (Remember & Understand) on the topic: [topic]. [If source content provided: Base ALL questions on this content: (paste content)]. Class level: [class].
>
> Use a MIX of these question formats: multiple_choice, multiple_select, ranking, qualitative_reasoning, linked_mc, troubleshooting, conflicting_contentions, whats_wrong, working_backwards.
>
> Each question awards +10 XP. See the JSON schema in schemas.md for the exact output format. IDs start at "t1q001".
>
> Output ONLY a valid JSON array. No markdown fences. No commentary. End cleanly with ].

**Subagent 2:** Same but TIER 2 (Apply & Analyze), +25 XP, IDs start at "t2q001", generate 200 questions.

**Subagent 3:** Same but TIER 3 (Evaluate & Create), +50 XP, IDs start at "t3q001", generate 200 questions.

#### Boss Battle Mode
Spawn 3 subagents (one per difficulty):

**Subagent prompt pattern:**
> You are an expert educational assessment designer. Generate 200 [EASY/MEDIUM/HARD] multiple choice questions for Boss Battles on the topic: [topic]. [If source content provided: Base ALL questions on this content: (paste content)]. Class level: [class].
>
> Each question has exactly 4 options. correctAnswer is the 0-based index. damageBonus: EASY=0, MEDIUM=25, HARD=50.
>
> See the JSON schema in schemas.md for the exact output format. IDs start at "[difficulty_prefix]q001".
>
> Output ONLY a valid JSON array. No markdown fences. No commentary. End cleanly with ].

#### PVP Arena Mode
Spawn 3 subagents (Balanced, Tactical, Blitz):

**Subagent prompt pattern:**
> You are an expert educational assessment designer. Generate 200 [BALANCED/TACTICAL/BLITZ] PVP Arena questions on the topic: [topic]. [If source content provided: Base ALL questions on this content: (paste content)]. Class level: [class].
>
> BALANCED: Standard MC, mixed difficulty, 10 points each.
> TACTICAL: Requires strategic thinking, multi-step reasoning, 20 points each.
> BLITZ: Quick-recall questions, short stems, designed for speed rounds, 5 points each.
>
> See the JSON schema in schemas.md for the exact output format.
>
> Output ONLY a valid JSON array. No markdown fences. No commentary. End cleanly with ].

#### Dungeon Rooms Mode
Spawn 2 subagents (Rooms 1-5 and Rooms 6-10):

**Subagent prompt pattern:**
> You are an expert educational assessment designer. Generate dungeon room questions for Rooms [1-5 / 6-10] on the topic: [topic]. [If source content provided: Base ALL questions on this content: (paste content)]. Class level: [class].
>
> Each room has 50 questions. Difficulty escalates per room. Room 1 = easy recall, Room 10 = expert synthesis.
>
> See the JSON schema in schemas.md for the exact output format.
>
> Output ONLY a valid JSON array. No markdown fences. No commentary. End cleanly with ].

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
> - Modifiers appropriate for the difficulty tier
> - Phases with descending HP thresholds (e.g. 75%, 50%, 25%)
> - Abilities with varied triggers and effects
> - Loot table with thematically named items and stat allocations
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
6. **Shuffle answer positions (MANDATORY)** — LLMs heavily bias the correct answer toward option A/B (index 0/1). After collecting all questions, run a Fisher-Yates shuffle on every question's `options` array and remap `correctAnswer` to the new position. Use a **Python script** (not manual editing) to guarantee uniform randomization:

```python
import json, random

def shuffle_options(q):
    opts = q.get('options', [])
    ca = q.get('correctAnswer')
    if not opts or ca is None:
        return q
    # Index-based correctAnswer (boss/dungeon/pvp: int 0-3)
    if isinstance(ca, int) and 0 <= ca < len(opts):
        correct = opts[ca]
        random.shuffle(opts)
        q['options'] = opts
        q['correctAnswer'] = opts.index(correct)
    # Object options {id, text} with letter correctAnswer
    elif isinstance(opts[0], dict) and isinstance(ca, str) and len(ca) == 1:
        old_map = {o['id']: o['text'] for o in opts}
        correct_text = old_map.get(ca)
        random.shuffle(opts)
        ids = ['a','b','c','d','e','f'][:len(opts)]
        new_map = {}
        for i, o in enumerate(opts):
            new_map[o['text']] = ids[i]
            o['id'] = ids[i]
        q['correctAnswer'] = new_map.get(correct_text, ca)
    # Array correctAnswer (multiple_select)
    elif isinstance(ca, list) and isinstance(opts[0], dict):
        old_map = {o['id']: o['text'] for o in opts}
        correct_texts = {old_map[l] for l in ca if l in old_map}
        random.shuffle(opts)
        ids = ['a','b','c','d','e','f'][:len(opts)]
        new_ca = []
        for i, o in enumerate(opts):
            if o['text'] in correct_texts:
                new_ca.append(ids[i])
            o['id'] = ids[i]
        q['correctAnswer'] = sorted(new_ca)
    # Ranking: shuffle display order, correctAnswer tracks ids (unchanged)
    elif q.get('type') == 'ranking':
        random.shuffle(opts)
    # Shuffle linkedFollowUp too
    if q.get('linkedFollowUp'):
        shuffle_options(q['linkedFollowUp'])
    return q

# Apply to all questions
for q in questions:
    shuffle_options(q)
```

**Target distribution:** ~25% per answer position (A/B/C/D). Verify after shuffling. If any position exceeds 35%, re-shuffle with a different seed.

### Step 5b: Merge Questions into Boss/Dungeon Configs

**For Boss Battle mode:** Take the boss config JSON and add the merged questions array as `boss.questions`. Select a representative sample of questions (20-30) across all difficulties. The full question bank is written separately.

**For Dungeon Rooms mode:** Take the dungeon config JSON and distribute questions from the question bank into each room:
- For each room in the dungeon config, assign 3-6 questions from the question bank matching the room's difficulty level (EASY rooms get Novice/Apprentice questions, MEDIUM rooms get Journeyman questions, HARD rooms get Expert/Master questions).
- Map the dungeon room question format: `{ id, stem, options, correctAnswer, difficulty, damageBonus }`.

### Step 6: Write Output Files

Create the output directory structure and write files:

```
~/Desktop/Questions/[class]/[mode]/[topic-slug].json
```

- `[class]` = "AP Physics 1", "Honors Physics", "Forensic Science", or "General"
- `[mode]` = "question-bank", "boss-battle", "pvp-arena", "dungeon-rooms"
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
- **Always prioritize project agents over general-purpose.** Use content-strategist-ux-writer for question generation, qa-bug-resolution for validation, backend-integration-engineer for config structures. General-purpose is a fallback only.
