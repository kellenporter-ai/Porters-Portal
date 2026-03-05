# Question Schemas Reference

JSON schema definitions for each game mode. Subagents MUST follow these exactly.

---

## Question Bank Schema

The Question Bank uses the same `BossQuizQuestion` format as Boss Battle — this is what the portal's `QuestionBankFormModal` actually imports. Questions are organized into 3 difficulty tiers that map to Bloom's Taxonomy levels, but the stored format is identical to Boss Battle questions.

### Tier Distribution
| Tier | Bloom's Levels | Difficulty | Target Count |
|------|---------------|------------|-------------|
| 1 | Remember, Understand | EASY | 150-350 |
| 2 | Apply, Analyze | MEDIUM | 150-350 |
| 3 | Evaluate, Create | HARD | 150-350 |

### Question Variety
Vary question stems across these pedagogical styles — do not cluster by style:
- Standard multiple choice (1 correct)
- Conflicting contentions ("Student A says X, Student B says Y. Who is correct?")
- Qualitative reasoning (conceptual MC requiring deep understanding)
- Troubleshooting (identify the error in a scenario)
- What's wrong (find the flaw in given reasoning/solution)
- Working backwards (given the answer, determine what produced it)

Encode all of these as standard 4-option MC — the variety comes from stem design, not from the JSON structure.

### JSON Object Format

```json
{
  "id": "t1q001",
  "stem": "The question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswer": 0,
  "difficulty": "EASY",
  "damageBonus": 0
}
```

### Field Rules
- `correctAnswer`: 0-based index (0=A, 1=B, 2=C, 3=D)
- `options`: array of 4 strings (NOT objects — plain string array)
- `difficulty`: EASY, MEDIUM, or HARD (maps to Bloom's tiers 1, 2, 3)
- `damageBonus`: EASY=0, MEDIUM=25, HARD=50

### ID Convention
- Tier 1 (EASY): `t1q001`, `t1q002`, ... `t1q350`
- Tier 2 (MEDIUM): `t2q001`, `t2q002`, ... `t2q350`
- Tier 3 (HARD): `t3q001`, `t3q002`, ... `t3q350`

---

## Boss Battle Schema

Multiple choice questions with difficulty-based damage bonuses.

### Difficulty Distribution
| Difficulty | Damage Bonus | Target Count |
|-----------|-------------|-------------|
| EASY | 0 | 150-350 |
| MEDIUM | 25 | 150-350 |
| HARD | 50 | 150-350 |

### JSON Object Format

```json
{
  "id": "eq001",
  "stem": "The question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswer": 0,
  "difficulty": "EASY",
  "damageBonus": 0
}
```

### Field Rules
- `correctAnswer`: 0-based index (0=A, 1=B, 2=C, 3=D)
- `options`: array of 4 strings (NOT objects)
- `damageBonus`: must match difficulty (EASY=0, MEDIUM=25, HARD=50)

### ID Convention
- EASY: `eq001`, `eq002`, ...
- MEDIUM: `mq001`, `mq002`, ...
- HARD: `hq001`, `hq002`, ...

---

## Dungeon Rooms Schema

Progressive difficulty across 10 rooms. Each room is a thematic cluster. Difficulty escalates from Room 1 (basic recall) to Room 10 (expert synthesis).

### Room Distribution
| Room | Difficulty | Theme | Questions per Room |
|------|-----------|-------|-------------------|
| 1 | Novice | Foundations | 50 |
| 2 | Novice | Core Concepts | 50 |
| 3 | Apprentice | Applied Basics | 50 |
| 4 | Apprentice | Connections | 50 |
| 5 | Journeyman | Problem Solving | 50 |
| 6 | Journeyman | Analysis | 50 |
| 7 | Expert | Edge Cases | 50 |
| 8 | Expert | Integration | 50 |
| 9 | Master | Evaluation | 50 |
| 10 | Master | Synthesis | 50 |

### JSON Object Format

```json
{
  "id": "r01q001",
  "stem": "The question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswer": 0,
  "room": 1,
  "difficulty": "Novice",
  "roomTheme": "Foundations",
  "xpReward": 10
}
```

### Field Rules
- `correctAnswer`: 0-based index (0=A, 1=B, 2=C, 3=D)
- `options`: array of 4 strings
- `room`: integer 1-10
- `xpReward`: scales with room — Room 1-2: 10, Room 3-4: 20, Room 5-6: 35, Room 7-8: 50, Room 9-10: 75

### ID Convention
- Room 1: `r01q001`, `r01q002`, ... `r01q050`
- Room 2: `r02q001`, ...
- Room 10: `r10q001`, ... `r10q050`

### Difficulty Calibration by Room
- **Rooms 1-2 (Novice):** Direct recall, definitions, basic identification. A student who read the material once should get 80%+ correct.
- **Rooms 3-4 (Apprentice):** Apply concepts to straightforward scenarios. Requires understanding, not just memory.
- **Rooms 5-6 (Journeyman):** Multi-step problems, compare/contrast, predict outcomes. Requires solid working knowledge.
- **Rooms 7-8 (Expert):** Edge cases, exceptions, non-obvious applications. Catches misconceptions.
- **Rooms 9-10 (Master):** Synthesize across topics, evaluate competing approaches, design solutions. Only students with deep understanding succeed.

---

## Boss Config Schema (Importable)

This is the complete boss encounter config that gets imported into the portal's "Deploy Quiz Boss" form. Generated alongside Boss Battle questions.

**This is a single JSON object, NOT an array.**

```json
{
  "bossName": "The Gravity Phantom",
  "description": "A spectral entity born from collapsed spacetime. It warps the very fabric of physics around it, testing students' mastery of gravitational concepts.",
  "maxHp": 2500,
  "damagePerCorrect": 40,
  "classType": "AP Physics",
  "bossType": "PHANTOM",
  "bossHue": 270,
  "difficultyTier": "HARD",
  "modifiers": [
    { "type": "BOSS_DAMAGE_BOOST", "value": 15 },
    { "type": "STREAK_BONUS", "value": 10 },
    { "type": "CRIT_SURGE", "value": 20 }
  ],
  "phases": [
    {
      "name": "Gravitational Distortion",
      "hpThreshold": 75,
      "dialogue": "You think you understand gravity? Let me show you its true power!",
      "damagePerCorrect": 45,
      "bossAppearance": { "bossType": "PHANTOM", "hue": 240 }
    },
    {
      "name": "Singularity Form",
      "hpThreshold": 40,
      "dialogue": "I am become singularity... all knowledge collapses before me!",
      "damagePerCorrect": 55,
      "bossAppearance": { "bossType": "SERPENT", "hue": 300 }
    }
  ],
  "bossAbilities": [
    {
      "id": "ab01",
      "name": "Gravitational Wave",
      "description": "A ripple in spacetime damages all students",
      "trigger": "EVERY_N_QUESTIONS",
      "triggerValue": 5,
      "effect": "AOE_DAMAGE",
      "value": 15,
      "duration": 0
    },
    {
      "id": "ab02",
      "name": "Time Dilation",
      "description": "Boss regenerates health by bending time",
      "trigger": "HP_THRESHOLD",
      "triggerValue": 50,
      "effect": "HEAL_BOSS",
      "value": 5,
      "duration": 0
    }
  ],
  "lootTable": [
    {
      "id": "lt01",
      "itemName": "Newton's Crown of Insight",
      "slot": "HEAD",
      "rarity": "UNIQUE",
      "stats": { "analysis": 12, "focus": 8 },
      "dropChance": 25,
      "isExclusive": true
    },
    {
      "id": "lt02",
      "itemName": "Graviton Ring",
      "slot": "RING1",
      "rarity": "RARE",
      "stats": { "tech": 6, "analysis": 6 },
      "dropChance": 40,
      "isExclusive": true
    }
  ],
  "rewards": {
    "xp": 800,
    "flux": 200,
    "itemRarity": "RARE"
  },
  "questions": [
    {
      "id": "eq001",
      "stem": "Example question from the question bank...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 2,
      "difficulty": "EASY",
      "damageBonus": 0
    }
  ]
}
```

### Boss Config Field Rules

**Required fields:**
- `bossName`: Creative name thematically tied to the topic
- `description`: 2-3 dramatic sentences
- `maxHp`: Scale with difficulty — NORMAL: 800-1500, HARD: 2000-3500, NIGHTMARE: 4000-6000, APOCALYPSE: 8000-12000
- `damagePerCorrect`: NORMAL: 40-60, HARD: 30-50, NIGHTMARE: 25-40, APOCALYPSE: 20-35
- `classType`: "AP Physics", "Honors Physics", "Forensic Science", or "GLOBAL" (must match the portal's class config display names)
- `bossType`: BRUTE, PHANTOM, or SERPENT
- `bossHue`: 0-360 (color wheel)
- `difficultyTier`: NORMAL, HARD, NIGHTMARE, or APOCALYPSE
- `rewards`: { xp, flux, itemRarity }
- `questions`: Array of Boss Battle question objects (sample of 20-30 from the full bank)

**Optional fields (scale with difficulty):**
- `modifiers`: Array of `{ type, value? }`. Available types: PLAYER_DAMAGE_BOOST, BOSS_DAMAGE_BOOST, HARD_ONLY, DOUBLE_OR_NOTHING, CRIT_SURGE, ARMOR_BREAK, HEALING_WAVE, SHIELD_WALL, STREAK_BONUS, GLASS_CANNON, LAST_STAND, TIME_PRESSURE
- `phases`: Array of phase objects. HP thresholds should descend (75, 50, 25).
- `bossAbilities`: Array of ability objects. Triggers: ON_PHASE, EVERY_N_QUESTIONS, HP_THRESHOLD, RANDOM_CHANCE. Effects: AOE_DAMAGE, HEAL_BOSS, ENRAGE, SILENCE, FOCUS_FIRE.
- `lootTable`: Array of loot objects. Slots: HEAD, CHEST, HANDS, FEET, BELT, AMULET, RING1, RING2. Rarities: UNCOMMON, RARE, UNIQUE. Stats: tech, focus, analysis, charisma (0-15 each).

---

## Dungeon Config Schema (Importable)

This is the complete dungeon config that gets imported into the portal's "New Dungeon" form. Generated alongside Dungeon Rooms questions.

**This is a single JSON object, NOT an array.**

```json
{
  "name": "The Kinematic Catacombs",
  "description": "Ancient tunnels carved by the forces of motion itself. Each chamber tests a deeper understanding of how objects move through space and time.",
  "classType": "AP Physics",
  "rooms": [
    {
      "id": "rm01",
      "name": "Hall of First Steps",
      "description": "A dimly lit entrance where basic motion concepts echo off the walls.",
      "type": "COMBAT",
      "difficulty": "EASY",
      "enemyHp": 150,
      "enemyDamage": 15,
      "enemyName": "Velocity Wisp",
      "healAmount": 0,
      "questions": [
        {
          "id": "d01q001",
          "stem": "Question text...",
          "options": ["A", "B", "C", "D"],
          "correctAnswer": 0,
          "difficulty": "EASY",
          "damageBonus": 0
        }
      ]
    },
    {
      "id": "rm02",
      "name": "Puzzle of Displacement",
      "description": "Glowing runes on the floor form kinematic equations.",
      "type": "PUZZLE",
      "difficulty": "EASY",
      "enemyHp": 0,
      "enemyDamage": 0,
      "enemyName": "",
      "healAmount": 0,
      "questions": []
    },
    {
      "id": "rm03",
      "name": "Rest Chamber",
      "description": "A quiet alcove with a healing spring.",
      "type": "REST",
      "difficulty": "EASY",
      "enemyHp": 0,
      "enemyDamage": 0,
      "enemyName": "",
      "healAmount": 30,
      "questions": []
    },
    {
      "id": "rm04",
      "name": "The Acceleration Gauntlet",
      "description": "Walls close in as questions grow harder.",
      "type": "COMBAT",
      "difficulty": "MEDIUM",
      "enemyHp": 300,
      "enemyDamage": 25,
      "enemyName": "Acceleration Golem",
      "healAmount": 0,
      "questions": []
    },
    {
      "id": "rm05",
      "name": "Treasure Vault",
      "description": "A hidden cache of loot.",
      "type": "TREASURE",
      "difficulty": "MEDIUM",
      "enemyHp": 0,
      "enemyDamage": 0,
      "enemyName": "",
      "healAmount": 0,
      "questions": []
    },
    {
      "id": "rm06",
      "name": "Chamber of the Motion Lord",
      "description": "The final boss awaits at the heart of the catacombs.",
      "type": "BOSS",
      "difficulty": "HARD",
      "enemyHp": 500,
      "enemyDamage": 35,
      "enemyName": "The Motion Lord",
      "healAmount": 0,
      "questions": []
    }
  ],
  "rewards": {
    "xp": 600,
    "flux": 150,
    "itemRarity": "RARE"
  },
  "minLevel": 5,
  "minGearScore": 25,
  "resetsAt": "WEEKLY"
}
```

### Dungeon Config Field Rules

**Required fields:**
- `name`: Creative dungeon name themed to the topic
- `description`: 2-3 atmospheric sentences
- `classType`: "AP Physics", "Honors Physics", "Forensic Science", or "GLOBAL" (must match the portal's class config display names)
- `rooms`: Array of room objects (see below)
- `rewards`: { xp, flux, itemRarity }

**Optional fields:**
- `minLevel`: 0-20 based on difficulty
- `minGearScore`: 0-100 based on difficulty
- `resetsAt`: "DAILY" or "WEEKLY"

### Room Object Fields
- `id`: Unique string (e.g., "rm01", "rm02")
- `name`: Creative room name
- `description`: Brief atmospheric description
- `type`: COMBAT, PUZZLE, BOSS, REST, or TREASURE
- `difficulty`: EASY, MEDIUM, or HARD
- `enemyHp`: Number (0 for non-combat rooms)
- `enemyDamage`: Number (0 for non-combat rooms)
- `enemyName`: Creative enemy name for COMBAT/BOSS rooms, empty string otherwise
- `healAmount`: Number for REST rooms (20-50), 0 otherwise
- `questions`: Array of Boss Battle question objects. Set to `[]` initially — the skill will populate from the question bank. Question counts must be high enough to guarantee the encounter resolves (enemy dies or player dies) before running out — running out of questions soft-locks the run. Minimums: EASY COMBAT 10-15, MEDIUM COMBAT 15-20, HARD COMBAT 20-25, BOSS 25-30, PUZZLE 8-12, REST/TREASURE 1-2.

### Room Sequence Pattern
Follow this progression:
1. 1-2 EASY COMBAT/PUZZLE rooms (warm up)
2. MEDIUM COMBAT/PUZZLE rooms (escalation)
3. 1-2 REST rooms (recovery, spread through middle)
4. 0-1 TREASURE rooms (optional reward)
5. HARD COMBAT rooms (challenge)
6. BOSS room (climax — always last)

### Enemy Stats by Difficulty
- EASY: HP 100-200, Damage 10-20
- MEDIUM: HP 200-400, Damage 20-35
- HARD/BOSS: HP 300-800, Damage 25-50
