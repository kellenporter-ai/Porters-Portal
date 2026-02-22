# Unified Skill Tree — "The Nexus"
## Draft v2 — Scaled for Level 500 Cap

---

## Design Philosophy

Modeled after Path of Exile's passive tree. One large, shared tree replaces the 4 separate specialization trees. Students pick one of 4 starting positions (their specialization) which determines where they begin on the tree, but they can path in any direction. The choice is about *proximity*, not *exclusion*.

**Core principles:**
- **Gear is the primary stat source.** The tree provides small incremental gains that *enhance* gear, not replace it.
- **Starting position = identity.** Where you begin shapes your natural direction, but you can invest points to reach any part of the tree.
- **Travel has cost.** Every minor node spent reaching a distant cluster is a node not spent deepening your home region. This is the fundamental strategic tension.
- **3 tiers of nodes:** Minor (small), Notable (meaningful), Keystone (build-defining with tradeoffs).

---

## Skill Point Economy

**Level cap: 500. Earning rate: 1 skill point per 2 levels = 250 max skill points.**

| Level Range | Points Earned | Cumulative | Typical Student |
|-------------|---------------|------------|-----------------|
| 1-20        | 10            | 10         | First semester  |
| 21-50       | 15            | 25         | First year      |
| 51-100      | 25            | 50         | Dedicated first year / second year |
| 101-200     | 50            | 100        | Multi-year veteran |
| 201-300     | 50            | 150        | Highly committed |
| 301-400     | 50            | 200        | Elite |
| 401-500     | 50            | 250        | Max level — completionist |

### Design Targets (tree size: ~400 nodes)

| Player Stage | Level | Points | % of Tree Fillable | Experience |
|-------------|-------|--------|---------------------|------------|
| New student | ~20   | 10     | ~2.5%              | Home cluster inner ring only |
| First year  | ~50   | 25     | ~6%                | Home cluster complete OR bridge to neighbor |
| Veteran     | ~100  | 50     | ~12%               | Home cluster + 1 bridge + starting neighbor cluster |
| Elite       | ~200  | 100    | ~25%               | Deep in 2 regions, or moderate in 3 |
| Near-max    | ~350  | 175    | ~44%               | Strong coverage of half the tree |
| Max (500)   | 500   | 250    | ~62%               | Meaningful choices still required — cannot fill everything |

**Key insight:** Even a level 500 student must leave ~38% of the tree unallocated. This ensures that *every* student — from first-semester to max level — faces strategic decisions about where to invest.

---

## Tree Layout

```
                               ╔═══════════════╗
                               ║   THEORIST    ║
                               ║  (Analysis)   ║
                               ║ Inner → Outer ║
                               ╚══════╤════════╝
                              ╱       │       ╲
                   ┌──NW Bridge──┐    │    ┌──NE Bridge──┐
                   │ (Tech+Ana)  │    │    │ (Ana+Foc)   │
                   │ Main+Alt    │    │    │ Main+Alt    │
                   └──────┬──────┘    │    └──────┬──────┘
                          │        ╔══╧══╗        │
           ╔══════════════╗   ╔════╡     ╞════╗   ╔══════════════╗
           ║ EXPERIMENTIST║───║    ║NEXUS║    ║───║   ANALYST    ║
           ║   (Tech)     ║   ║    ║Inner║    ║   ║   (Focus)    ║
           ║ Inner → Outer║   ║    ║+Outr║    ║   ║ Inner → Outer║
           ╚══════╤═══════╝   ╚════╡     ╞════╝   ╚═══════╤═════╝
                  │        ╔══╧══╗        │
                   └──────┬──────┘    │    └──────┬──────┘
                   │ (Tech+Cha)  │    │    │ (Foc+Cha)   │
                   │ Main+Alt    │    │    │ Main+Alt    │
                   ┌──SW Bridge──┘    │    └──SE Bridge──┐
                              ╲       │       ╱
                               ╔══════╧════════╗
                               ║   DIPLOMAT    ║
                               ║  (Charisma)   ║
                               ║ Inner → Outer ║
                               ╚═══════════════╝

    Cross-Bridges (long diagonal paths):
    Theorist ←─── N/S Cross ───→ Diplomat
    Experimentalist ←── E/W Cross ──→ Analyst
```

The tree is a diamond with:
- **4 starting clusters** at cardinal points, each with an **Inner Ring** (early progression) and **Outer Ring** (late-game depth)
- **4 adjacent bridges** connecting neighboring specializations, each with a **main path** and an **alternate path**
- **2 cross-bridges** connecting opposite specializations (long, expensive travel)
- **Central Nexus** with **Inner** and **Outer** rings, reachable from all bridges

**Total target: ~400 allocatable nodes.**

---

## Node Types

### Minor Nodes (cost: 1 point each)
Small incremental bonuses. The connective tissue of the tree.
- **Stat minor:** +1 to a single stat (e.g., +1 Analysis)
- **Hybrid minor:** +1 to two stats (e.g., +1 Tech, +1 Analysis)
- **Percentage minor:** +2% to a specific XP source or mechanic

### Notable Nodes (cost: 1 point each)
Named nodes with stronger effects. The "payoff" at the end of a cluster.
- Typically +3 to a stat, or +5% to a mechanic, or a unique bonus
- Visually distinct (larger icon, named, border glow)

### Keystone Nodes (cost: 1 point each)
Rare, powerful, mechanic-altering. Always have a tradeoff.
- 5 total in the tree (1 per starting region outer edge + 1 in center)
- Cannot be undone without a full respec

---

## Complete Node List

### THEORIST STARTING CLUSTER (North) — Analysis
*"Understanding the universe through theory and mathematical elegance."*

```
                    [K: Grand Theorem]
                          │
                      [th_m9]
                      ╱       ╲
               [th_n3]         [th_m8]
                  │               │
              [th_m5]         [th_m7]
                  │               │
              [th_m4]         [th_m6]
                  │               │
              [th_n1]         [th_n2]
                  │               │
              [th_m2]         [th_m3]
                  │               │
              [th_m1]─────────[START]─────────[th_m3]
                 ↓                               ↓
            (to NW Bridge)                  (to NE Bridge)
                              ↓
                         (to Nexus)
```

| ID | Name | Type | Effect | Connects From |
|----|------|------|--------|---------------|
| th_start | — | Start | (free, automatic) | — |
| th_m1 | — | Minor | +1 Analysis | th_start |
| th_m2 | — | Minor | +1 Analysis | th_m1 |
| th_m3 | — | Minor | +1 Analysis, +1 Focus | th_start |
| th_m4 | — | Minor | +1 Analysis | th_n1 |
| th_m5 | — | Minor | +2% Quiz XP | th_m4 |
| th_m6 | — | Minor | +1 Focus | th_n2 |
| th_m7 | — | Minor | +1 Analysis | th_m6 |
| th_m8 | — | Minor | +1 Analysis, +1 Focus | th_m7 |
| th_m9 | — | Minor | +2% All XP | th_n3 or th_m8 |
| th_n1 | Equation Mind | Notable | +3 Analysis | th_m2 |
| th_n2 | Deep Reader | Notable | +5% XP from study/review activities | th_m3 |
| th_n3 | Theoretical Framework | Notable | +2 Analysis, +2 Focus, +2% Boss damage | th_m5 |
| th_k1 | Grand Theorem | Keystone | **All XP gains +15%. Flux income -30%.** | th_m9 |

**Total: 14 nodes (10 minor, 3 notable, 1 keystone)**

---

### EXPERIMENTALIST STARTING CLUSTER (West) — Tech
*"Knowledge through doing — the lab is the ultimate classroom."*

| ID | Name | Type | Effect | Connects From |
|----|------|------|--------|---------------|
| ex_start | — | Start | (free, automatic) | — |
| ex_m1 | — | Minor | +1 Tech | ex_start |
| ex_m2 | — | Minor | +1 Tech | ex_m1 |
| ex_m3 | — | Minor | +1 Tech, +1 Charisma | ex_start |
| ex_m4 | — | Minor | +1 Tech | ex_n1 |
| ex_m5 | — | Minor | +2% Engagement XP | ex_m4 |
| ex_m6 | — | Minor | +1 Charisma | ex_n2 |
| ex_m7 | — | Minor | +1 Tech | ex_m6 |
| ex_m8 | — | Minor | +1 Tech, +1 Charisma | ex_m7 |
| ex_m9 | — | Minor | +2% Craft quality | ex_n3 or ex_m8 |
| ex_n1 | Lab Precision | Notable | +3 Tech | ex_m2 |
| ex_n2 | Hands-On Mastery | Notable | Crafting costs -15% Flux | ex_m3 |
| ex_n3 | Breakthrough Discovery | Notable | +2 Tech, +2 Charisma, crafting +1 tier | ex_m5 |
| ex_k1 | Master Inventor | Keystone | **Crafting always produces +1 rarity tier. Cannot equip UNIQUE items.** | ex_m9 |

**Total: 14 nodes (10 minor, 3 notable, 1 keystone)**

---

### ANALYST STARTING CLUSTER (East) — Focus
*"See the patterns others miss. Data reveals all."*

| ID | Name | Type | Effect | Connects From |
|----|------|------|--------|---------------|
| an_start | — | Start | (free, automatic) | — |
| an_m1 | — | Minor | +1 Focus | an_start |
| an_m2 | — | Minor | +1 Focus | an_m1 |
| an_m3 | — | Minor | +1 Focus, +1 Analysis | an_start |
| an_m4 | — | Minor | +1 Focus | an_n1 |
| an_m5 | — | Minor | +2% Streak bonus | an_m4 |
| an_m6 | — | Minor | +1 Analysis | an_n2 |
| an_m7 | — | Minor | +1 Focus | an_m6 |
| an_m8 | — | Minor | +1 Focus, +1 Analysis | an_m7 |
| an_m9 | — | Minor | +2% Crit chance | an_n3 or an_m8 |
| an_n1 | Pattern Recognition | Notable | +3 Focus | an_m2 |
| an_n2 | Streak Amplifier | Notable | Streak bonuses +25% | an_m3 |
| an_n3 | Predictive Model | Notable | +2 Focus, +2 Analysis, +5% crit damage | an_m5 |
| an_k1 | Omniscient | Keystone | **+30% XP from quiz/boss answers. Engagement time XP -20%.** | an_m9 |

**Total: 14 nodes (10 minor, 3 notable, 1 keystone)**

---

### DIPLOMAT STARTING CLUSTER (South) — Charisma
*"Strength through unity. The whole is greater than its parts."*

| ID | Name | Type | Effect | Connects From |
|----|------|------|--------|---------------|
| di_start | — | Start | (free, automatic) | — |
| di_m1 | — | Minor | +1 Charisma | di_start |
| di_m2 | — | Minor | +1 Charisma | di_m1 |
| di_m3 | — | Minor | +1 Charisma, +1 Tech | di_start |
| di_m4 | — | Minor | +1 Charisma | di_n1 |
| di_m5 | — | Minor | +2% Group quest XP | di_m4 |
| di_m6 | — | Minor | +1 Tech | di_n2 |
| di_m7 | — | Minor | +1 Charisma | di_m6 |
| di_m8 | — | Minor | +1 Charisma, +1 Tech | di_m7 |
| di_m9 | — | Minor | +2% Party XP share | di_n3 or di_m8 |
| di_n1 | Inspiring Presence | Notable | +3 Charisma | di_m2 |
| di_n2 | Peer Mentor | Notable | Tutoring rewards +30% | di_m3 |
| di_n3 | Natural Leader | Notable | +2 Charisma, +2 Tech, party size +1 | di_m5 |
| di_k1 | Commander | Keystone | **All party members gain +10% XP. Your personal crit chance is halved.** | di_m9 |

**Total: 14 nodes (10 minor, 3 notable, 1 keystone)**

---

### NW BRIDGE — Tech + Analysis (Experimentalist <-> Theorist)
*"Where theory meets practice."*

| ID | Name | Type | Effect | Connects From |
|----|------|------|--------|---------------|
| nw_m1 | — | Minor | +1 Tech | th_m1 (Theorist side) |
| nw_m2 | — | Minor | +1 Analysis | nw_m1 |
| nw_n1 | Applied Theory | Notable | +2 Tech, +2 Analysis | nw_m2 |
| nw_m3 | — | Minor | +1 Tech | nw_n1 |
| nw_m4 | — | Minor | +1 Analysis | nw_m3 |
| nw_m5 | — | Minor | +1 Tech, +1 Analysis | nw_m4, connects to ex_m1 (Experimentalist side) |

*Also connects: nw_n1 → core_m1 (path to Nexus center)*

**Total: 6 nodes (5 minor, 1 notable)**

---

### NE BRIDGE — Analysis + Focus (Theorist <-> Analyst)
*"The analytical mind — where understanding deepens into insight."*

| ID | Name | Type | Effect | Connects From |
|----|------|------|--------|---------------|
| ne_m1 | — | Minor | +1 Analysis | th_m3 (Theorist side) |
| ne_m2 | — | Minor | +1 Focus | ne_m1 |
| ne_n1 | Scholarly Insight | Notable | +2 Analysis, +2 Focus | ne_m2 |
| ne_m3 | — | Minor | +1 Focus | ne_n1 |
| ne_m4 | — | Minor | +1 Analysis | ne_m3 |
| ne_m5 | — | Minor | +1 Focus, +1 Analysis | ne_m4, connects to an_m1 (Analyst side) |

*Also connects: ne_n1 → core_m2 (path to Nexus center)*

**Total: 6 nodes (5 minor, 1 notable)**

---

### SE BRIDGE — Focus + Charisma (Analyst <-> Diplomat)
*"Empathetic precision — reading people like data."*

| ID | Name | Type | Effect | Connects From |
|----|------|------|--------|---------------|
| se_m1 | — | Minor | +1 Focus | an_m3 (Analyst side) |
| se_m2 | — | Minor | +1 Charisma | se_m1 |
| se_n1 | Empathic Analysis | Notable | +2 Focus, +2 Charisma | se_m2 |
| se_m3 | — | Minor | +1 Charisma | se_n1 |
| se_m4 | — | Minor | +1 Focus | se_m3 |
| se_m5 | — | Minor | +1 Focus, +1 Charisma | se_m4, connects to di_m1 (Diplomat side) |

*Also connects: se_n1 → core_m4 (path to Nexus center)*

**Total: 6 nodes (5 minor, 1 notable)**

---

### SW BRIDGE — Charisma + Tech (Diplomat <-> Experimentalist)
*"Building together — collaboration in the workshop."*

| ID | Name | Type | Effect | Connects From |
|----|------|------|--------|---------------|
| sw_m1 | — | Minor | +1 Charisma | di_m3 (Diplomat side) |
| sw_m2 | — | Minor | +1 Tech | sw_m1 |
| sw_n1 | Workshop Leader | Notable | +2 Charisma, +2 Tech | sw_m2 |
| sw_m3 | — | Minor | +1 Tech | sw_n1 |
| sw_m4 | — | Minor | +1 Charisma | sw_m3 |
| sw_m5 | — | Minor | +1 Tech, +1 Charisma | sw_m4, connects to ex_m3 (Experimentalist side) |

*Also connects: sw_n1 → core_m3 (path to Nexus center)*

**Total: 6 nodes (5 minor, 1 notable)**

---

### CENTRAL NEXUS — Universal
*"The heart of the tree. Where all paths converge."*

The Nexus is reachable from any bridge notable (nw_n1, ne_n1, se_n1, sw_n1) via a single connecting minor node. It contains balanced bonuses and the only cross-domain Keystone.

| ID | Name | Type | Effect | Connects From |
|----|------|------|--------|---------------|
| core_m1 | — | Minor | +1 Tech, +1 Analysis | nw_n1 (NW bridge) |
| core_m2 | — | Minor | +1 Analysis, +1 Focus | ne_n1 (NE bridge) |
| core_m3 | — | Minor | +1 Charisma, +1 Tech | sw_n1 (SW bridge) |
| core_m4 | — | Minor | +1 Focus, +1 Charisma | se_n1 (SE bridge) |
| core_n1 | Nexus Attunement | Notable | +1 to ALL stats | core_m1 or core_m2 |
| core_n2 | Adaptive Learner | Notable | +3% XP from all sources | core_m3 or core_m4 |
| core_m5 | — | Minor | +1 to ALL stats | core_n1 and core_n2 |
| core_k1 | Renaissance Mind | Keystone | **+2 to ALL stats. +5% ALL XP. Gear stat bonuses reduced by 10%.** | core_m5 |

**Total: 8 nodes (5 minor, 2 notable, 1 keystone)**

---

## Summary

| Region | Minor | Notable | Keystone | Total |
|--------|-------|---------|----------|-------|
| Theorist Cluster | 10 | 3 | 1 | 14 |
| Experimentalist Cluster | 10 | 3 | 1 | 14 |
| Analyst Cluster | 10 | 3 | 1 | 14 |
| Diplomat Cluster | 10 | 3 | 1 | 14 |
| NW Bridge | 5 | 1 | 0 | 6 |
| NE Bridge | 5 | 1 | 0 | 6 |
| SE Bridge | 5 | 1 | 0 | 6 |
| SW Bridge | 5 | 1 | 0 | 6 |
| Central Nexus | 5 | 2 | 1 | 8 |
| **TOTAL** | **65** | **18** | **5** | **88** |

---

## Keystone Summary

Keystones are the defining choice nodes. Each has a powerful upside with a meaningful downside, ensuring no single keystone is universally optimal.

| Keystone | Location | Upside | Downside |
|----------|----------|--------|----------|
| **Grand Theorem** | Theorist outer | All XP gains +15% | Flux income -30% |
| **Master Inventor** | Experimentalist outer | Crafting always +1 rarity tier | Cannot equip UNIQUE items |
| **Omniscient** | Analyst outer | +30% quiz/boss answer XP | Engagement time XP -20% |
| **Commander** | Diplomat outer | Party members gain +10% XP | Your crit chance halved |
| **Renaissance Mind** | Center | +2 all stats, +5% all XP | Gear stat bonuses -10% |

---

## Typical Builds (Skill Point Allocation)

### "Pure Theorist" (10 points, level 20)
Path: th_start → th_m1 → th_m2 → th_n1 → th_m4 → th_m5 → th_m3 → th_n2 → th_m6 → th_n3
**Result:** +9 Analysis, +3 Focus, +5% study XP, +2% quiz XP, +2% boss damage
*Focused on deepening Analysis with minor Focus gains.*

### "Theorist reaching for Analyst" (12 points, level 24)
Path: th_start → th_m1 → th_m2 → th_n1 → th_m3 → ne_m1 → ne_m2 → ne_n1 → ne_m3 → ne_m4 → ne_m5 → an_m1
**Result:** +5 Analysis, +5 Focus, Scholarly Insight notable
*Sacrificed depth in Theorist to bridge into Analyst territory.*

### "Diplomat going for Commander" (15 points, level 30)
Path: di_start → di_m1 → di_m2 → di_n1 → di_m4 → di_m5 → di_m3 → di_n2 → di_m6 → di_m7 → di_n3 → di_m8 → di_m9 → di_k1
**Result:** +9 Charisma, +3 Tech, tutoring +30%, party +1, Commander keystone
*Deep investment into Diplomat, reaching the keystone for team play.*

### "Renaissance Experimentalist" (15 points, level 30)
Path: ex_start → ex_m1 → ex_m2 → ex_n1 → ex_m3 → nw_m3(reverse) → nw_n1 → nw_m2 → nw_m1 → core_m1 → core_n1 → core_m5 → core_k1
**Result:** +6 Tech, +3 Analysis, +1 all stats, +2 all stats, Renaissance Mind keystone
*Pathed through the NW bridge to grab the center keystone. Broad but shallow.*

---

## Balance Notes for Review

### Stat Budget
- **10 points invested in home cluster:** ~+8-10 primary stat, +2-3 secondary stat, plus notable effects
- **15 points reaching a keystone:** ~+10-12 total stats plus the keystone effect
- **15 points pathing to center keystone:** ~+6-8 stats spread across multiple, plus Renaissance Mind
- Compare: a single UNCOMMON item might give +3-5 to one stat. A RARE item: +5-10. The tree adds about 1-2 items' worth of stats over a semester.

### XP Multiplier Budget
- Minor % nodes: +2% each (small, requires specific activity)
- Notable % nodes: +5% (specific activity type)
- Keystones: +15-30% (broad, but with tradeoff)
- A student stacking XP bonuses from the Theorist tree might get +7-9% total from minors/notables, or +15% from the keystone (but loses 30% Flux)

### Travel Cost
- Reaching an adjacent specialization's first notable costs ~6 points (bridge traversal)
- Reaching the center keystone costs ~8-10 points from any starting position
- Reaching the OPPOSITE specialization costs ~12+ points (two full bridges)
- This means a level-20 student (10 points) can comfortably fill their home cluster OR bridge to one neighbor, but not both deeply

### Keystone Tradeoffs
- **Grand Theorem:** Great for pure XP grinders. The Flux penalty hurts crafting — you get less currency for new gear. Makes you reliant on quest/loot drops.
- **Master Inventor:** Best crafting in the game, but UNIQUE items (the best gear) are off-limits. You become a crafter, not a collector.
- **Omniscient:** Rewards quiz-focused players. Engagement time XP penalty means you need to be answering questions, not just passively engaging.
- **Commander:** Team-focused support build. Your personal combat (boss fights) suffers from halved crit, but your team benefits.
- **Renaissance Mind:** Jack-of-all-trades. Modest gains everywhere, but the 10% gear reduction means specialized builds will always have higher peak stats.

---

## Open Questions for Balancing

1. **Respec system:** Should students be able to reallocate points? If so, at what cost?
   - Option A: Free respec once per semester
   - Option B: Costs Flux (e.g., 10 Flux per node)
   - Option C: No respec (permanent choices, like PoE's limited refund points)

2. **Specialization lock timing:** When does the starting position become permanent?
   - Option A: Chosen at level 2 (first skill point)
   - Option B: Chosen during onboarding / character creation
   - Option C: Chosen when first point is allocated (current behavior)

3. **Should bridges be bidirectional?** Currently designed so you can path from either direction. This means a Theorist and an Analyst both have equal access to the NE bridge. Should one side be "cheaper" to enter?

4. **Keystone power level:** Are the tradeoffs punishing enough? In PoE, keystones like "Chaos Inoculation" (life set to 1) are extremely harsh. Ours are milder since this is an educational game and we don't want to punish students.

5. **Should the tree grow over time?** Could add new clusters or "expansion" nodes in future semesters, similar to how PoE adds new notables each league.

---

## Visual Rendering Notes

When implemented, the tree should be rendered as an interactive node graph (not a list). Each node is a circle connected by lines to its neighbors. Recommended approach:
- SVG or Canvas-based rendering
- Nodes positioned on a fixed coordinate grid (diamond layout)
- Allocated nodes glow in the specialization color
- Available-to-allocate nodes pulse subtly
- Locked nodes are dimmed
- Hover shows tooltip with name + effect
- Click to allocate (with confirmation)
- Zoom/pan for the full tree view

Color scheme per region:
- Theorist: Blue (#3B82F6)
- Experimentalist: Green (#22C55E)
- Analyst: Amber (#F59E0B)
- Diplomat: Purple (#A855F7)
- Bridges: Gradient between adjacent colors
- Center: White/Silver (#E5E7EB)
- Keystones: Gold border with red inner glow
