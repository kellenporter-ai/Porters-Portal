# Porters-Portal RPG Economy — Complete Reference

This file contains every constant, formula, and data structure in the gamification system. All values are sourced from `lib/gamification.ts`, `lib/achievements.ts`, `lib/runewords.ts`, and `functions/src/index.ts`.

## Table of Contents
1. [XP Economy](#1-xp-economy)
2. [Level Progression](#2-level-progression)
3. [Currency (Cyber-Flux)](#3-currency-cyber-flux)
4. [Loot System](#4-loot-system)
5. [Gem & Runeword System](#5-gem--runeword-system)
6. [Combat Stats](#6-combat-stats)
7. [Boss Encounters](#7-boss-encounters)
8. [Boss Quizzes](#8-boss-quizzes)
9. [Dungeons](#9-dungeons)
10. [Arena / PvP](#10-arena--pvp)
11. [Idle Missions](#11-idle-missions)
12. [Fortune Wheel](#12-fortune-wheel)
13. [Achievements](#13-achievements)
14. [Skill Tree](#14-skill-tree)
15. [Daily Systems](#15-daily-systems)
16. [Telemetry & Engagement](#16-telemetry--engagement)
17. [Item Sets](#17-item-sets)
18. [Seasonal Cosmetics](#18-seasonal-cosmetics)

---

## 1. XP Economy

### Global Constants
| Constant | Value |
|----------|-------|
| MAX_LEVEL | 500 |
| MAX_XP_PER_SUBMISSION | 500 |
| DEFAULT_XP_PER_MINUTE | 10 |
| ENGAGEMENT_COOLDOWN_MS | 300,000 (5 min) |
| Minimum engagement time | 10 seconds |
| Maximum engagement time | 4 hours |

### XP Brackets
```
Level 1-50:    1,000 XP per level  (cumulative: 50,000)
Level 51-200:  2,000 XP per level  (cumulative: 350,000)
Level 201-350: 3,000 XP per level  (cumulative: 800,000)
Level 351-450: 4,000 XP per level  (cumulative: 1,200,000)
Level 451-500: 5,000 XP per level  (cumulative: 1,450,000)
```
**Total XP for max level: 1,450,000**

### XP Sources
| Source | Formula / Value | Cap | Server-Enforced |
|--------|----------------|-----|-----------------|
| Engagement (viewing resources) | `min(round(minutes × xpPerMinute), 500)` | 500 per submission | Yes |
| Review question (correct) | 10 / 25 / 50 XP by tier | Once per question ID | Yes |
| Review question (wrong) | `-ceil(question.xp / 2)` penalty | Floor at 0 XP | Yes |
| Assessment completion | `round(percentage × 0.5)` → 0-50 XP | 50 | Yes |
| Boss encounter hit | `boss.xpRewardPerHit` (admin-set) | Per-hit | Yes |
| Boss quiz correct | Damage dealt = XP earned | Per-answer | Yes |
| Quest completion | `quest.xpReward` (admin-set) | Per-quest | Yes |
| Dungeon completion | `dungeon.rewards.xp` (admin-set) | Per-run | Yes |
| Idle mission | `mission.rewards.xp × statBonuses × gearScoreBonus` | Per-claim | Yes |
| Arena match (win) | 50 XP | 5 matches/day | Yes |
| Arena match (loss) | 20 XP | 5 matches/day | Yes |
| Tutoring session | `session.xpReward` (default ~75) | Per-session | Yes |
| Fortune wheel | 50 / 100 / 250 XP (weighted) | 1 spin/day | Yes |
| Daily challenge | 30-250 XP (admin-set templates) | 3 daily + weekly | Yes |
| Daily login | 25-150 XP (7-day cycle) | 1/day | Yes |
| Achievement unlock | 25-10,000 XP (per achievement) | Once | Yes |

### XP Multipliers
- **XP Events** (`xp_events` collection): GLOBAL or CLASS_SPECIFIC. Only highest active multiplier applies.
- **Streak multiplier** (display only, not server-applied to submissions):
  ```
  0 weeks:  1.0x
  1-2:      1.05x
  3-4:      1.10x
  5-7:      1.15x
  8-12:     1.25x
  13+:      1.50x
  ```
- **Skill tree bonuses**: Up to +25% from Theorist th_6, +30% from Analyst an_6, +10% from Singularity runeword.

---

## 2. Level Progression

### Level Milestones
| Level | Cumulative XP | Evolution Tier | Wing | Crown | New Unlock |
|-------|--------------|----------------|------|-------|------------|
| 1 | 0 | Recruit | NONE | NONE | — |
| 10 | 9,000 | Agent | NONE | NONE | — |
| 25 | 24,000 | Specialist | NONE | NONE | 2nd idle mission slot |
| 50 | 49,000 | Operative | NONE | CIRCLET | 3rd idle mission slot, Tier 2 loot |
| 75 | 99,000 | Lieutenant | NONE | CIRCLET | — |
| 100 | 149,000 | Commander | NONE | CIRCLET | Tier 3 loot, Tier 2 gems |
| 150 | 249,000 | Elite | ENERGY | CIRCLET | Tier 4 loot |
| 200 | 349,000 | Vanguard | ENERGY | HALO | Tier 5 loot, Tier 3 gems |
| 250 | 499,000 | Warden | ENERGY | HALO | Tier 6 loot |
| 300 | 649,000 | Mythic | CRYSTAL | HALO | Tier 7 loot, Tier 4 gems |
| 350 | 799,000 | Ascendant | CRYSTAL | CROWN | Tier 8 loot |
| 400 | 999,000 | Paragon | PHOENIX | CROWN | Tier 9 loot, Tier 5 gems |
| 450 | 1,199,000 | Archon | PHOENIX | CROWN | Tier 10 loot |
| 500 | 1,449,000 | Eternal | PHOENIX | CROWN | Max |

### Rank System (Element-Based)
- `elementIndex = floor((level - 1) / 5)` → picks from 100 elements (Hydrogen through Fermium)
- `romanIndex = (level - 1) % 5` → I through V
- Example: Level 1 = "Hydrogen I", Level 6 = "Helium I", Level 500 = "Fermium V"

### Level-Up Rewards (Per Level)
- +100 Cyber-Flux
- +1 Skill Point every 2 levels (even levels only)
- +1 loot item generated at new level

---

## 3. Currency (Cyber-Flux)

### Flux Income Sources
| Source | Amount |
|--------|--------|
| Level-up | 100 per level |
| Daily login | 5-50 (7-day cycle: 5/5/10/10/15/20/50) |
| Fortune wheel | 10/25/100 (weighted) |
| Achievement unlock | 0-5,000 per achievement |
| Arena win | 10 |
| Arena loss | 5 |
| Daily challenge | 0-75 per challenge |
| Boss completion | `boss.completionRewards.flux` (admin-set) |
| Dungeon completion | `dungeon.rewards.flux` (admin-set) |
| Idle mission | `mission.rewards.flux × bonuses` |
| Item disenchant | `floor(base × (1 + avgTier × 0.2))` |

### Flux Sinks
| Sink | Cost |
|------|------|
| Fortune wheel spin | 25 |
| Recalibrate item | 5 |
| Reforge item | 25 |
| Optimize item | 50 |
| Add socket | 30 |
| Enchant (insert gem) | 15 |
| Unsocket gem | `ceil(10 × rarityMult × max(1, gemTier) × (1 + unsocketCount))` |
| Seasonal cosmetics | 30-100 each |

### Disenchant Values
| Rarity | Base | At Tier 1 | At Tier 5 | At Tier 10 |
|--------|------|-----------|-----------|------------|
| COMMON | 2 | 2 | 4 | 6 |
| UNCOMMON | 5 | 6 | 10 | 15 |
| RARE | 15 | 18 | 30 | 45 |
| UNIQUE | 50 | 60 | 100 | 150 |

---

## 4. Loot System

### Drop Rate Table
| Rarity | Probability | Affix Count |
|--------|-------------|-------------|
| COMMON | 40% | 1 prefix OR 1 suffix (50/50) |
| UNCOMMON | 25% | 1 prefix + 1 suffix |
| RARE | 13% | 2 prefix + 1 suffix OR 1 prefix + 2 suffix (50/50) |
| UNIQUE | 2% | 1 prefix + 1 suffix + unique base stat |
| Custom pool | 8% | (admin-configured override) |
| No drop (remainder) | 12% | — |

### Equipment Slots
HEAD, CHEST, HANDS, FEET, BELT, AMULET, RING (RING1/RING2). Max 3 sockets per item.

### Tier Scaling
```
maxTierAvailable = min(10, max(1, floor(level / 50) + 1))

COMMON:   tier range [1, ceil(maxAvail × 0.5)]
UNCOMMON: tier range [floor(maxAvail × 0.3), floor(maxAvail × 0.8)]
RARE:     tier range [floor(maxAvail × 0.5), maxAvail]
UNIQUE:   tier range [floor(maxAvail × 0.8), maxAvail]
```

### Stat Values
```
rollValue(tier) = max(1, tier × 5 + floor(random() × 5) - 2)
Tier 1:  3-7
Tier 5:  23-27
Tier 10: 48-52
```

### Affix Pool
**Prefixes:** Reinforced (focus), Calculated (analysis), Diplomatic (charisma), Hardened (focus), Tech-Savvy (tech), Dynamic (tech)
**Suffixes:** of Computing (tech), of Insight (analysis), of the Hawk (focus), of Command (charisma), of Precision (tech), of the Owl (analysis)

### Unique Items (4 Total)
| Name | Slot | Unique Stat | Flavor |
|------|------|-------------|--------|
| Newton's Prism | AMULET | analysis +50 | +20% XP from light refraction |
| Tesla's Coils | HANDS | tech +45 | Bonus resources from discoveries |
| Curie's Determination | RING | focus +40 | Mental fatigue reduction |
| Einstein's Relativistic Boots | FEET | tech +50 | Late submission grace period |

### Gear Score Formula
```
Per item: itemScore = (avgAffixTier × 10) + rarityBonus
  rarityBonus: COMMON=0, UNCOMMON=10, RARE=30, UNIQUE=60
Total gear score = floor(sum of all equipped itemScores)
```

---

## 5. Gem & Runeword System

### Gem Types
| Gem | Stat | Color |
|-----|------|-------|
| Ruby | tech | red |
| Emerald | focus | green |
| Sapphire | analysis | blue |
| Amethyst | charisma | purple |

### Gem Tier Scaling
```
tier = min(5, max(1, floor(level / 100) + 1))
value = tier × 3 + floor(random() × 3)
Tier 1: 3-5, Tier 3: 9-11, Tier 5: 15-17
```

### 2-Socket Runewords
| Name | Pattern | Bonus |
|------|---------|-------|
| Binary | Ruby, Ruby | tech +15 |
| Harmony | Emerald, Sapphire | focus +8, analysis +8 |
| Catalyst | Ruby, Emerald | tech +8, focus +8 |
| Resonance | Amethyst, Amethyst | charisma +15 |
| Enigma | Sapphire, Amethyst | analysis +10, charisma +6 |

### 3-Socket Runewords
| Name | Pattern | Bonus | Special |
|------|---------|-------|---------|
| Quantum Entanglement | Sapphire, Ruby, Sapphire | analysis +18, tech +10 | +5% XP all sources |
| Nuclear Fusion | Ruby, Emerald, Ruby | tech +20, focus +10 | +5% XP from engagement |
| Photosynthesis | Emerald, Emerald, Ruby | focus +20, tech +8 | +3 to all stats |
| Supernova | Ruby, Sapphire, Amethyst | tech +12, analysis +12, charisma +12 | +8% XP all sources |
| Double Helix | Emerald, Amethyst, Emerald | focus +15, charisma +15 | +4 Focus and Charisma |
| Singularity | Amethyst, Sapphire, Ruby | all stats +10 each | +10% XP all sources |

---

## 6. Combat Stats

### Derivation from Base Stats
```
Base stats (no gear): tech=10, focus=10, analysis=10, charisma=10

maxHp         = 100 + max(0, charisma - 10) × 5
armorPercent  = min(analysis × 0.5, 50)     // capped at 50%
critChance    = min(focus × 0.01, 0.40)      // capped at 40%
critMultiplier = 2 + max(0, focus - 10) × 0.02
```

### Player Roles (highest stat)
| Role | Bonus |
|------|-------|
| VANGUARD (tech) | +15% base damage |
| STRIKER (focus) | +10% crit chance, +0.5 crit multiplier |
| SENTINEL (analysis) | +10% armor; absorbs 20% AoE in boss quizzes |
| COMMANDER (charisma) | Heals 5 HP to 2 random allies (boss quiz); +3 HP self-heal/round (arena) |

### Boss Damage Formula
```
damage = 8 + floor(tech / 5) + floor(gearScore / 50)
damage *= (0.8 + random() × 0.4)   // ±20% variance
damage = round(damage)
if random() < critChance: damage = round(damage × critMultiplier)
return max(1, min(damage, 200))
```

---

## 7. Boss Encounters (Shared HP)

- 10 shards for distributed writes
- `xpRewardPerHit` (admin-set)
- `completionRewards: { xp, flux, itemRarity? }`
- Deadline-based expiry
- All contributors in `damage_log` receive rewards on defeat

---

## 8. Boss Quizzes (Per-Student HP Combat)

### Difficulty Multipliers
```
NORMAL:     1.0x HP
HARD:       1.5x HP + BOSS_DAMAGE_BOOST
NIGHTMARE:  2.5x HP + BOSS_DAMAGE_BOOST + TIME_PRESSURE + ARMOR_BREAK
APOCALYPSE: 4.0x HP + all Nightmare mods + DOUBLE_OR_NOTHING
```

### Auto-Scale Factors
```
CLASS_SIZE:     scaledHp *= 1 + ((classSize - 10) × 0.10)
AVG_GEAR_SCORE: scaledHp *= 1 + ((avgGearScore - 50) × 0.01)
AVG_LEVEL:      scaledHp *= 1 + ((avgLevel - 10) × 0.005)
```

### Boss Retaliation (wrong answer)
```
HARD=30, MEDIUM=20, EASY=15 base damage, reduced by player armor
```

### Reward Tiers (Top 5 Damage Dealers)
```
1st: 1.5x rewards
2nd: 1.4x
3rd: 1.3x
4th: 1.2x
5th: 1.1x
Minimum participation: 5 attempts AND 1 correct answer
```

### Modifiers
PLAYER_DAMAGE_BOOST (+25), BOSS_DAMAGE_BOOST (+15), HARD_ONLY, DOUBLE_OR_NOTHING, CRIT_SURGE (+20%), ARMOR_BREAK, HEALING_WAVE (10 HP), SHIELD_WALL (2 blocked), STREAK_BONUS (+10/streak), GLASS_CANNON (2x dmg/0 armor), LAST_STAND (+50% below 25% HP), TIME_PRESSURE (-5 HP/question)

### Boss Abilities
Triggers: EVERY_N_QUESTIONS, HP_THRESHOLD, RANDOM_CHANCE, ON_PHASE
Effects: AOE_DAMAGE, HEAL_BOSS, ENRAGE, SILENCE, FOCUS_FIRE

---

## 9. Dungeons

### Room Types
COMBAT, PUZZLE, BOSS, REST (heals player), TREASURE (loot roll)

### Combat
Uses same `calculateBossDamage` formula. Enemy retaliation: HARD=25, MEDIUM=15, EASY=10 (or custom `enemyDamage`).

### Reset
DAILY (once per calendar day) or WEEKLY (7-day cooldown).

### Rewards
XP (triggers level-up), Flux, optional guaranteed loot at specified rarity.

---

## 10. Arena / PvP

### Matchmaking
Gear score within ±100. Same classType. Daily limit: 5 matches.

### Combat (10 rounds, simultaneous)
Both players attack each round using `calculateBossDamage`. Role bonuses apply. Winner = higher HP after 10 rounds.

### Rewards
```
Win:  +50 XP, +10 Flux, rating +15
Loss: +20 XP, +5 Flux,  rating -10
Starting rating: 1000. Minimum: 0.
```

---

## 11. Idle Missions

### Slots by Level
```
Level 1-24:  1 slot
Level 25-49: 2 slots
Level 50+:   3 slots
```

### Reward Formula
```
xpReward = base × statBonusMultipliers (stacking)
gearScoreBonus = 1 + (gearScore / 1000)
finalXP = round(xpReward × gearScoreBonus)
finalFlux = round(fluxReward × gearScoreBonus)
```

---

## 12. Fortune Wheel

Cost: 25 Flux. Limit: 1 spin/day.

| Prize | Weight | Effective % |
|-------|--------|-------------|
| 50 XP | 25 | 19.5% |
| 100 XP | 18 | 14.1% |
| 250 XP | 8 | 6.3% |
| 10 Flux | 20 | 15.6% |
| 25 Flux | 12 | 9.4% |
| 100 Flux | 3 | 2.3% |
| Common Item | 15 | 11.7% |
| Uncommon Item | 8 | 6.3% |
| Rare Item | 3 | 2.3% |
| Random Gem | 10 | 7.8% |
| Skill Point | 5 | 3.9% |
| Nothing | 15 | 11.7% |
| **Total** | **128** | |

### Expected Flux Return Per Spin
```
E[Flux] = (0.156 × 10) + (0.094 × 25) + (0.023 × 100) = 1.56 + 2.35 + 2.3 = 6.21 Flux
Net cost per spin: 25 - 6.21 = ~18.8 Flux
```

---

## 13. Achievements

### Progression
| ID | Condition | XP | Flux |
|----|-----------|------|------|
| first_steps | 100 total XP | 25 | — |
| rising_star | Level 10 | 100 | 50 |
| veteran | Level 25 | 250 | 100 |
| elite | Level 50 | 500 | 250 |
| legend | Level 100 | 1000 | 500 |
| vanguard | Level 200 | 2000 | 750 |
| mythic_rank | Level 300 | 3000 | 1000 |
| paragon | Level 400 | 5000 | 2000 |
| eternal | Level 500 | 10000 | 5000 |
| xp_5k | 5K XP | 150 | — |
| xp_25k | 25K XP | 500 | 200 |
| xp_100k | 100K XP | 1000 | 500 |
| xp_500k | 500K XP | 3000 | 1500 |
| xp_1m | 1M XP | 5000 | 3000 |

### Collection
| ID | Condition | XP | Flux |
|----|-----------|------|------|
| collector_10 | 10 items | 50 | — |
| collector_50 | 50 items | 150 | 75 |
| collector_150 | 150 items | 500 | 200 |
| gear_score_100 | GS 100 | 100 | — |
| gear_score_500 | GS 500 | 300 | 150 |
| gear_score_1000 | GS 1000 | 750 | 400 |

### Combat
| ID | Condition | XP | Flux |
|----|-----------|------|------|
| first_mission | 1 quest | 50 | — |
| mission_5 | 5 quests | 150 | — |
| mission_20 | 20 quests | 400 | 200 |
| mission_50 | 50 quests | 1000 | 500 |
| boss_slayer | 3 boss kills | 300 | 150 |
| boss_hunter | 10 boss kills | 750 | 400 |

### Dedication
| ID | Condition | XP | Flux |
|----|-----------|------|------|
| streak_3 | 3-week streak | 75 | — |
| streak_8 | 8-week streak | 200 | 100 |
| streak_16 | 16-week streak | 500 | 250 |
| streak_30 | 30-week streak | 1500 | 750 |
| login_7 | 7-day login | 100 | — |
| login_30 | 30-day login | 300 | 150 |
| login_90 | 90-day login | 1000 | 500 |
| challenges_10 | 10 challenges | 100 | — |
| challenges_50 | 50 challenges | 400 | 200 |
| challenges_200 | 200 challenges | 1500 | 750 |

### Social & Mastery
| ID | Condition | XP | Flux |
|----|-----------|------|------|
| tutor_1 | 1 session | 75 | — |
| tutor_10 | 10 sessions | 300 | 200 |
| tutor_25 | 25 sessions | 750 | 500 |
| tech/focus/analysis/charisma_50 | Stat at 50 | 100 | — |
| tech/focus/analysis/charisma_100 | Stat at 100 | 500 | 200 |
| craft_10 | 10 crafts | 100 | 50 |
| craft_50 | 50 crafts | 400 | 200 |
| wheel_25 | 25 spins | 200 | 100 |

---

## 14. Skill Tree

4 specializations, 6 nodes each. 1 SP per 2 levels (max 250 SP at level 500). 14 SP to complete one tree.

### THEORIST (analysis/XP)
- th_1 (1 SP): +5 Analysis from equipment
- th_2 (1 SP): +10% XP from review questions
- th_3 (2 SP): +8 Analysis
- th_4 (2 SP): +15% XP from study materials
- th_5 (3 SP): +12 Analysis, +5 Tech
- th_6 (5 SP): +25% XP from all sources

### EXPERIMENTALIST (tech/crafting)
- ex_1 (1 SP): +5 Tech
- ex_2 (1 SP): +10% XP from engagement
- ex_3 (2 SP): +8 Tech
- ex_4 (2 SP): 20% crafting Flux discount
- ex_5 (3 SP): +12 Tech, crafting tier bonus +1
- ex_6 (5 SP): +20% better craft results (tier bonus +2)

### ANALYST (focus/streak)
- an_1 (1 SP): +5 Focus
- an_2 (1 SP): +50% streak bonus
- an_3 (2 SP): +8 Focus
- an_4 (2 SP): +15% XP from engagement
- an_5 (3 SP): +12 Focus, streak bonus doubled
- an_6 (5 SP): +30% XP from quiz answers

### DIPLOMAT (charisma/social)
- di_1 (1 SP): +5 Charisma
- di_2 (1 SP): +20% XP from group quests
- di_3 (2 SP): +8 Charisma
- di_4 (2 SP): +50% tutoring rewards
- di_5 (3 SP): +12 Charisma, party size +1
- di_6 (5 SP): all party members get +10% XP

---

## 15. Daily Systems

### Login Rewards (7-day cycle)
| Day | XP | Flux |
|-----|-----|------|
| 1 | 25 | 5 |
| 2 | 30 | 5 |
| 3 | 40 | 10 |
| 4 | 50 | 10 |
| 5 | 75 | 15 |
| 6 | 100 | 20 |
| 7 | 150 | 50 |

### Daily Challenges (3/day, date-seeded)
Templates: XP Hunter (200 XP target, +50 XP +10 Flux), Resource Explorer (+75 XP), Quiz Whiz (+60 XP +15 Flux), Deep Focus (+80 XP), Tinkerer (+40 XP +5 Flux), Gear Up (+30 XP)

### Weekly Challenges (Monday)
Templates: XP Surge (+100 XP +25 Flux), Scholar (+200 XP +50 Flux), Marathon (+250 XP +75 Flux)

---

## 16. Telemetry & Engagement

### Submission Flags
| Status | Trigger |
|--------|---------|
| FLAGGED | pastes > 5 AND engagementTime < 300s |
| SUPPORT_NEEDED | keystrokes > 500 AND engagementTime > 1800s |
| SUCCESS | pastes = 0 AND keystrokes > 100 |
| NORMAL | default |

### Engagement Score
```
ES = (timeNorm × 0.4) + (subNorm × 0.3) + (clickNorm × 0.3)
```

### Student Buckets (7-day window)
INACTIVE, COPYING, STRUGGLING, DISENGAGING, SPRINTING, COASTING, THRIVING, ON_TRACK

---

## 17. Item Sets

| Set | Items | 2-Piece | 3-Piece |
|-----|-------|---------|---------|
| Tesla's Arsenal | Data Gauntlets, Neural Band, Circuit Ring | +10 tech | +25 tech, +10 focus |
| Newton's Laws | Fiber Helm, Polymer Vest, Mag-Boots | +10 analysis | +25 analysis, +10 charisma |
| Curie's Focus | Precision Grips, Quantum Chip, Focus Band | +10 focus | +25 focus, +10 analysis |
| Diplomat's Ensemble | Exo-Plate, Utility Belt, Resonance Core | +10 charisma | +25 charisma, +10 tech |

---

## 18. Seasonal Cosmetics

All currently `isAvailable: false`. Types: PARTICLE, FRAME, AURA, TRAIL. Costs: 30-100 Flux.
