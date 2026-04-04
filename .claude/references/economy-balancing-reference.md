# Game Economy Balancing Reference (2026)

Supplements the existing `economy-reference.md` in the game-balance skill with mathematical models and anti-exploitation patterns.

## Progression Curve Mathematics

### Why Not Linear
Linear: `XP_req = 1000 * Level`
- Rapid level inflation
- Diminished psychological reward at higher levels
- Students trivialize the system mid-semester

### Why Not Pure Exponential
Exponential: `XP_req = Base * e^(k * Level)`
- Creates insurmountable grind in later stages
- Severely demotivating — defeats the purpose of gamification
- Only top students progress meaningfully

### Recommended: Quadratic/Polynomial
```
XP_req = C * (Level - 1)^2
```
Or with fractional exponent:
```
Level = C * sqrt(XP)
```

**Benefits:**
- Rapid initial progression — immediate dopamine, habit-forming in first weeks
- Steady, meaningful plateau in latter half of semester
- Students always feel progress, but it takes more effort over time

### Tuning Parameters
- `C` (constant) controls the steepness — lower C = faster progression
- Test by simulating casual (1 assignment/day), active (3/day), and power (5+/day) student profiles
- Target: casual students reach ~Level 50 by semester end, power students reach ~Level 200

## Loot Drop Mathematics

### Weighted Random Selection
```typescript
function weightedRandom(items: { item: Item; weight: number }[]): Item {
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  let random = Math.random() * totalWeight;
  for (const { item, weight } of items) {
    random -= weight;
    if (random <= 0) return item;
  }
  return items[items.length - 1].item;
}
```

### Rarity Distribution Guidelines
| Rarity | Drop Weight | Approximate % |
|--------|-----------|---------------|
| Common | 60 | ~60% |
| Uncommon | 25 | ~25% |
| Rare | 10 | ~10% |
| Epic | 4 | ~4% |
| Legendary | 1 | ~1% |

### Pity Timer System
Incrementally increase high-tier drop probability after consecutive failures to prevent prolonged negative variance:

```typescript
// Pseudocode
const pityCounter = getUserPityCount(userId, rarityTier);
const baseProbability = RARITY_WEIGHTS[rarityTier];
const pityBonus = Math.min(pityCounter * 0.5, baseProbability * 3); // Cap at 3x base
const adjustedProbability = baseProbability + pityBonus;

// Reset counter on successful drop
if (droppedRarity >= rarityTier) resetPityCount(userId, rarityTier);
else incrementPityCount(userId, rarityTier);
```

## Anti-Exploitation Patterns

### Idle Farming Prevention
Students may leave the portal open on Chromebooks to accrue engagement-time XP.

**Solutions:**
- Engagement-time XP must have a daily hard cap (asymptotic curve)
- `XP_time = MaxDaily * (1 - e^(-k * minutes))` — diminishing returns
- After the cap, additional time yields zero XP
- Require active interaction signals (clicks, keystrokes) to count as "engaged"

### Currency Inflation Prevention
If Cyber-Flux is too easy to earn, the Flux Shop loses perceived value.

**Controls:**
- Hard daily caps on all Flux income sources
- Flux sinks: consumables that are destroyed on use, repair costs, reroll fees
- Price scaling: popular items gradually increase in price (demand-based)
- Monitor Flux velocity: total Flux entering vs. leaving the economy per day

### Stat Utility Normalization
Equippable gear must provide balanced advantages without trivializing quizzes.

**Principles:**
- Gear provides percentage bonuses, not flat overrides
- No single stat should dominate all content types
- Highest-wins stacking (Math.max), not additive — prevents exponential scaling

## Monte Carlo Simulation Guidelines

When the /game-balance skill runs progression simulations:

**Student Profiles:**
| Profile | Assignments/Day | Boss Attempts/Week | Engagement Hours/Day |
|---------|----------------|-------------------|---------------------|
| Casual | 1 | 1 | 0.5 |
| Active | 3 | 3 | 1.5 |
| Power | 5+ | 5+ | 3+ |

**What to check:**
1. XP dominance — is one source providing >50% of total XP?
2. Flux inflation — is total Flux in circulation growing faster than Flux sinks?
3. Rarity cliffs — are students hitting long streaks without upgrades?
4. Dead zones — level ranges where no new content/rewards unlock?
5. Engagement bypasses — can students progress meaningfully without academic engagement?

**Output:** Structured balance report with specific constant adjustments
