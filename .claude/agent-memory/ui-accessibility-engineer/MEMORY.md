# UI/Accessibility Engineer — Agent Memory

## Project Stack
- Framework: Vite 6 + React 19 + TypeScript
- Styling: Tailwind CSS 3.4 (dark theme, glassmorphism conventions)
- Icons: lucide-react
- Auth/DB: Firebase / Firestore (client SDK)
- Build: `npm run build` (tsc + vite). No ESLint — use `npx tsc --noEmit` for type checking.

## Key File Paths
- Types: `/home/kp/Desktop/Porters-Portal/types.ts`
- Gamification lib: `/home/kp/Desktop/Porters-Portal/lib/gamification.ts`
- Firebase client: `/home/kp/Desktop/Porters-Portal/lib/firebase.ts`
- Data service: `/home/kp/Desktop/Porters-Portal/services/dataService.ts`

## Component Locations
- `OperativeAvatar` — `components/dashboard/OperativeAvatar.tsx`
  - Props: `equipped`, `appearance` (bodyType/hue/skinTone/hairStyle/hairColor), `evolutionLevel`, `activeCosmetic`, `cosmeticColor`
  - Renders as full SVG; use `aria-hidden="true"` when decorative
- `BossAvatar` — `components/xp/BossAvatar.tsx`
  - Props: `bossType` ('BRUTE'|'PHANTOM'|'SERPENT'), `hue` (0-360), optional `size` (px height)
- `BattleScene` — `components/xp/BattleScene.tsx`
  - Renders full animated player-vs-boss encounter
  - `attackState`: 'idle'|'player-attack'|'boss-attack' — set briefly, reset after ~600ms
  - `damage` is shared for both player attack damage AND boss attack damage (playerDamage field)
  - Wrap in `aria-hidden="true"`; provide accessible text feedback separately via aria-live
- `DungeonPanel` — `components/xp/DungeonPanel.tsx`
  - Accepts `playerAppearance`, `playerEquipped`, `playerEvolutionLevel` in addition to `userId`, `classType`

## Gamification Types (types.ts)
- `BossAppearance`: `{ bossType: BossType; hue: number }`
- `BossType`: `'BRUTE' | 'PHANTOM' | 'SERPENT'`
- `DungeonRoom.enemyAppearance?: BossAppearance` — room-level enemy visual
- `DungeonRun.combatStats: BossQuizCombatStats` — live stats (criticalHits, damageReduced, etc.)
- `DungeonRun.combatStats.role?: PlayerRole` — pass as `playerRole` to BattleScene

## Gamification Functions (lib/gamification.ts)
- `calculateGearScore(equipped)` — returns numeric gear score
- `deriveCombatStats(stats)` — returns `{ maxHp, armorPercent, critChance, critMultiplier }`
  - Input: `{ tech, focus, analysis, charisma }` — NOT directly from equipped items
  - Use `calculatePlayerStats(user)` first to get stats from equipped items

## Design Conventions
- Dark theme: `bg-white/5`, `bg-black/20`, `bg-black/30`, `border-white/10`, `border-white/5`
- Glassmorphism: `backdrop-blur-xl`, rounded cards
- Amber accent for active/primary: `text-amber-400`, `bg-amber-600`
- Emerald for player HP and success: `text-emerald-400`
- Red for enemy/danger: `text-red-400`
- Yellow for UNIQUE loot, treasure
- Purple for RARE loot
- Blue for UNCOMMON loot
- Chromebook screens: keep layouts compact, use `overflow-x-auto` for horizontal scroll

## Accessibility Patterns for This Portal
- Answer choice buttons: use `<fieldset>/<legend>` grouping with `legend className="sr-only"`
- Battle animations: wrap in `aria-hidden="true"`, provide adjacent `aria-live="polite"` text
- Room state in map: use `aria-current="step"` on the active room tile
- Loot discovery, heal results, combat feedback: `aria-live="polite" role="status"`
- Avatar components (OperativeAvatar, BossAvatar): `aria-hidden="true"` when decorative
- HP bars: numeric label in plain text above the bar; bar div itself gets `aria-hidden="true"`
- All buttons: explicit `type="button"` and `focus-visible:outline` classes
- Dungeon cards: wrap in `<article>` with `aria-label`
- Section landmarks: `<section aria-label="...">` for major regions

## SVG / Animation Patterns
- Healing particles in REST room: pure SVG `<animate>` — no JS timers needed
- attackState reset: `useRef<ReturnType<typeof setTimeout>>` + cleanup in useEffect return
- Room cleared overlay: CSS `transition-opacity` toggled by boolean state, `aria-live="polite"`
- Auto-scroll map to active room: `useRef` on active tile + `scrollIntoView({ inline: 'center' })`

## Common Mistakes to Avoid
- Do NOT import `deriveCombatStats` unless you have raw `{ tech, focus, analysis, charisma }` stats
  — the dungeon run only exposes `combatStats` (post-fight metrics), not raw gear stats
- Do NOT use `text-transform: uppercase` on paragraph text
- Do NOT underline non-link text
- BattleScene's `phaseTransition` and `triggeredAbility` props accept `null` (not undefined) to clear
