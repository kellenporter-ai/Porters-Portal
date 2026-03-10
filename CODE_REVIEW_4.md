# Porter's Portal — Code Review #4: UX & Visual Polish

**Date:** Feb 16, 2026
**Focus:** User quality of life, visual excitement, modern feel
**Scope:** All student-facing + teacher-facing components

---

## Priority Legend

| Tag | Meaning |
|-----|---------|
| **V1** | High-impact visual upgrade — students will notice immediately |
| **V2** | Quality-of-life UX — removes friction or adds delight |
| **V3** | Polish — refinement that elevates the overall feel |

---

## #1 — OperativeAvatar is a flat stick figure (V1) ✅ COMPLETED

**File:** `components/dashboard/OperativeAvatar.tsx`
**Problem:** The avatar is ~95 lines of basic SVG rectangles and circles. A gray circle head, two rectangle arms, two rectangle legs, rectangle torso. Equipment overlays are just colored rectangles placed on top. The only customization is a CSS `hue-rotate()` applied to the whole figure.

For a game system where students earn gear, craft items, and compare loadouts — the visual payoff of equipping something needs to feel exciting. Currently it doesn't.

**Fix delivered:** New 350-line OperativeAvatar with:
- Proper humanoid silhouette with shaped paths, shoulder pads, curved limbs
- Idle breathing animation (body + shadow pulse every 3.5s)
- Animated energy core at chest that brightens with each equipped item
- Per-slot equipment visuals: armor plates, boots, gauntlets, helmets (3 variants), belt with utility pods, diamond amulet pendant
- Rarity-based coloring: gray/green/blue/gold with matching glow filters
- UNIQUE item particle aura (6 orbiting golden particles)
- Suit energy lines that activate at 3+ equipped items
- Hue customization that shifts the entire suit palette, not just a filter
- Two body type silhouettes (A/B)
- Drop-in replacement — same file path, same props, zero changes to parent

---

## #2 — Customize modal only offers hue, no body type selector (V1) ✅ COMPLETED

**File:** `StudentDashboard.tsx` lines 703-739
**Problem:** The type system has `bodyType: 'A' | 'B'` and the new avatar supports both silhouettes, but the "Edit DNA Profile" modal only shows the hue grid. Students can't pick their body type. This is the single cheapest way to double avatar variety.

**Fix:** Add a body type toggle above the hue grid:
```tsx
<div className="flex justify-center gap-4 mb-6">
    <button onClick={() => setPreviewBodyType('A')}
        className={`px-6 py-3 rounded-xl border-2 transition font-bold text-sm ${activeBodyType === 'A' ? 'border-purple-500 bg-purple-500/20 text-white' : 'border-white/10 text-gray-500'}`}>
        Frame Alpha
    </button>
    <button onClick={() => setPreviewBodyType('B')}
        className={`px-6 py-3 rounded-xl border-2 transition font-bold text-sm ${activeBodyType === 'B' ? 'border-purple-500 bg-purple-500/20 text-white' : 'border-white/10 text-gray-500'}`}>
        Frame Beta
    </button>
</div>
```
Also update `handleCustomizeSave` to persist `bodyType` alongside `hue`, and `updateUserAppearance` in dataService to accept both fields.

---

## #3 — Settings modal uses light-mode styling inside dark app (V2) ✅ COMPLETED

**File:** `SettingsModal.tsx` lines 55-72
**Problem:** The `SettingRow` component uses `bg-gray-50`, `border-gray-100`, `text-gray-900` — these are light-mode colors. Inside the dark glass modal, these rows render as bright white boxes that completely break the aesthetic. This is the most visually jarring inconsistency in the app.

**Fix:** Replace light classes with dark equivalents:
```
bg-gray-50       → bg-white/5
border-gray-100  → border-white/10
text-gray-900    → text-white
bg-gray-100      → bg-white/10
text-gray-400    → text-gray-500
bg-gray-200      → bg-white/20
shadow-purple-100 → shadow-purple-900/30
```

---

## #4 — No item comparison when equipping gear (V2) ✅ COMPLETED

**File:** `StudentDashboard.tsx` lines 782-789
**Problem:** When a student clicks "Equip Gear" in the Nano-Fabricator Terminal, they have no way to see what's currently in that slot. If they have a RARE belt equipped and find a new UNCOMMON belt, they might accidentally downgrade. The equip action should show a side-by-side comparison.

**Fix:** Above the "Equip Gear" button, add a comparison row when the slot is already occupied:
```tsx
{currentlyEquipped && (
    <div className="bg-black/20 border border-white/10 rounded-xl p-3 mb-3">
        <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-2">Currently Equipped</div>
        <div className="flex justify-between text-xs">
            <span className={getAssetColors(currentlyEquipped.rarity).text}>{currentlyEquipped.name}</span>
            <span className="text-gray-400">{currentlyEquipped.rarity}</span>
        </div>
        <div className="flex gap-3 mt-1 text-[10px] font-mono">
            {Object.entries(currentlyEquipped.stats).map(([stat, val]) => {
                const newVal = inspectItem.stats[stat] || 0;
                const diff = newVal - val;
                return <span key={stat} className={diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-gray-500'}>
                    {stat}: {diff > 0 ? '+' : ''}{diff}
                </span>;
            })}
        </div>
    </div>
)}
```

---

## #5 — Inventory items have no tooltip on hover (V2) ✅ COMPLETED

**File:** `StudentDashboard.tsx` lines 629-655
**Problem:** The inventory grid shows slot icons with rarity-colored borders, but the only way to learn an item's name is to click it and open the full modal. In any RPG, hovering over an item in your bag shows a quick tooltip. This forces unnecessary clicks for browsing.

**Fix:** Add `title` attribute to each inventory button (quick win), or build a lightweight hover tooltip:
```tsx
<button 
    key={idx} 
    onClick={() => setInspectItem(item)}
    title={`${item.name}\n${item.rarity} ${item.slot}\n${Object.entries(item.stats).map(([k,v]) => `+${v} ${k}`).join(', ')}`}
    ...
>
```
For a more polished version, add a CSS tooltip with `group-hover` that shows name + rarity without opening the modal.

---

## #6 — Leaderboard has no animation or visual flair for top 3 (V1) ✅ COMPLETED

**File:** `Leaderboard.tsx` lines 91-128
**Problem:** The leaderboard is a flat list with Trophy/Medal icons. The top 3 get a faint purple gradient background. For students, rankings are one of the biggest motivators — this needs more ceremony.

**Fix suggestions:**
- **Podium layout** for top 3: show them in a centered 3-column layout above the list (2nd | 1st | 3rd), with the #1 slot elevated and larger
- **Animated rank numbers**: stagger-animate rows on load with `animation-delay`
- **Rank change indicators**: if data allows, show ↑/↓ arrows for rank movement since last session
- **Glow effect on #1**: give the leader a subtle pulsing border or shadow
- **XP bar**: show a mini progress bar next to XP total showing how close each student is to the next rank

---

## #7 — Teacher Dashboard engagement table lacks visual signals (V2) ✅ COMPLETED

**File:** `TeacherDashboard.tsx` lines 199-235
**Problem:** The Student Engagement Ranking table shows raw numbers but provides no visual cues for interpretation. A teacher scanning 30+ students can't quickly identify who's falling behind or excelling.

**Fix suggestions:**
- **Color-code "Last Seen"**: green for <1hr, yellow for <24hr, red for >24hr, gray for "Never"
- **Inline XP bar**: add a tiny progress bar in the XP column, scaled to the class max
- **Activity heat indicator**: a small colored dot (green/yellow/red) next to each student name based on engagement frequency
- **Sortable columns**: clicking column headers should toggle sort (the table currently only sorts by XP descending)
- **Student avatar**: show the student's avatar thumbnail instead of just an initial — the data (`student.avatarUrl`) is available but unused

---

## #8 — No transition animations between tabs (V3) ✅ COMPLETED

**File:** `StudentDashboard.tsx` lines 371-383
**Problem:** Switching between RESOURCES / LOADOUT / MISSIONS tabs has entry animations (`animate-in fade-in slide-in-from-*`) but no exit animation — the old content vanishes instantly and the new content fades in. This creates a jarring pop.

**Fix:** Use a content wrapper with a CSS transition on opacity + transform. When `activeTab` changes, fade out the current content over ~150ms, then fade in the new content. Can be done purely with CSS:
```css
.tab-exit { animation: tabOut 0.15s ease-in forwards; }
.tab-enter { animation: tabIn 0.2s ease-out 0.15s both; }
@keyframes tabOut { to { opacity: 0; transform: translateY(8px); } }
@keyframes tabIn { from { opacity: 0; transform: translateY(-8px); } }
```
Alternatively, use `framer-motion`'s `AnimatePresence` for cleaner orchestration.

---

## #9 — Loadout background is too subtle (V3) ✅ COMPLETED

**File:** `StudentDashboard.tsx` line 619-620
**Problem:** The loadout character visualizer panel has a `bg-black/30` with a faint radial blue gradient. This makes the avatar area feel like another card rather than a dramatic character display. The hex grid CSS class (`loadout-hex-bg`) exists in style.css but is only used in the customize modal, not the main loadout.

**Fix:** Apply the `loadout-hex-bg` class to the main loadout panel, and add a stronger ambient glow:
```tsx
<div className="bg-black/30 rounded-2xl border border-white/10 relative overflow-hidden ... loadout-hex-bg">
    {/* Stronger radial glow behind avatar */}
    <div className="absolute inset-0 pointer-events-none"
         style={{ background: `radial-gradient(ellipse at 50% 60%, hsla(${hue + 200}, 60%, 30%, 0.25) 0%, transparent 70%)` }} />
```

---

## #10 — Slot hover states don't preview item details (V3) ✅ COMPLETED

**File:** `StudentDashboard.tsx` lines 228-258 (SlotRender)
**Problem:** Equipment slots show a tiny icon + truncated name. Hovering scales the slot up by 10% but reveals nothing new. Students need to click to learn what's actually equipped.

**Fix:** On hover, expand the slot card to show full item name + rarity badge + primary stat. This can be done with CSS `group-hover` without state changes:
```tsx
<div className="absolute -top-16 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition pointer-events-none z-30 bg-black/90 border border-white/10 px-3 py-2 rounded-lg whitespace-nowrap">
    <div className={`text-xs font-bold ${colors.text}`}>{item.name}</div>
    <div className="text-[9px] text-gray-400 font-mono">{item.rarity} · {Object.entries(item.stats).map(([k,v]) => `+${v} ${k.slice(0,3)}`).join(' ')}</div>
</div>
```

---

## #11 — No sound effects or haptic feedback on key actions (V2) ✅ COMPLETED

**Problem:** Equipping items, leveling up, accepting quests, crafting — these are high-moment actions with no audio reinforcement. The level-up modal has confetti but is silent. This is a gamification app — sound matters.

**Fix:** Add an optional sound effects system (respect the existing Performance Mode setting):
- Create `lib/sfx.ts` with a simple `playSound(name)` function using the Web Audio API
- Key sounds: level up chime, item equip click, quest accepted tone, craft success, salvage crunch
- Store 3-5 short `.mp3` files in Firebase Storage `public/sfx/`
- Add a "Sound Effects" toggle to SettingsModal
- Wrap all calls in a `if (!settings.performanceMode && settings.sfxEnabled)` guard

---

## #12 — Codename/identity system is underutilized (V3) ✅ COMPLETED

**File:** `SettingsModal.tsx`, `Layout.tsx`, `StudentDashboard.tsx`
**Problem:** Students can toggle "Privacy Codename" in settings, which swaps their real name for `user.gamification?.codename` on the leaderboard. But there's no way for students to *choose* their codename — it appears to be assigned or empty. This is a missed engagement opportunity.

**Fix:** Add a codename editor to the Settings modal or Customize modal:
```tsx
<div className="mt-4">
    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Agent Codename</label>
    <input value={codename} onChange={e => setCodename(e.target.value)} maxLength={20}
           className="w-full mt-1 bg-black/40 border border-white/20 text-white px-3 py-2 rounded-xl text-sm" 
           placeholder="Enter codename..." />
</div>
```
Validate: 3-20 chars, alphanumeric + spaces, no profanity (reuse existing moderation filter).

---

## Implementation Priority

| # | Item | Impact | Status |
|---|------|--------|--------|
| 1 | ✅ Avatar overhaul | 🔥🔥🔥 | Done |
| 2 | ✅ Body type selector (Alpha/Beta/Femme) | 🔥🔥🔥 | Done |
| 3 | ✅ Settings modal dark-mode styling | 🔥🔥 | Done |
| 4 | ✅ Item comparison on equip | 🔥🔥 | Done |
| 5 | ✅ Inventory item tooltips | 🔥🔥 | Done |
| 6 | ✅ Leaderboard podium + animations | 🔥🔥🔥 | Done |
| 7 | ✅ Teacher dashboard visual signals | 🔥🔥 | Done |
| 8 | ✅ Tab transition animations | 🔥 | Done (Mar 9, 2026) |
| 9 | ✅ Loadout background enhancement | 🔥 | Done |
| 10 | ✅ Slot hover tooltips | 🔥 | Done |
| 11 | ✅ Sound effects system (Kenney .ogg) | 🔥🔥 | Done |
| 12 | ✅ Codename editor | 🔥 | Done |

**All items complete.** CODE_REVIEW_4 is fully resolved.
