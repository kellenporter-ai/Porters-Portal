# Portal Orchestrator — Agent Memory

## Project Architecture
- **Stack:** Vite 6 + React 19 + TypeScript, Firebase 10 (Firestore, Auth, Hosting), Tailwind CSS 3.4
- **Build:** `npm run build` (tsc + vite). No ESLint. Type check: `npx tsc --noEmit`
- **Functions:** `cd functions && npm run build`. Deploy: `firebase deploy`
- **Target:** Chromebooks (cap devicePixelRatio, compact layouts, minimize bundle)

## Key Files (by role)
- `types.ts` (1,482 lines) — ALL shared TypeScript types, single flat file
- `services/dataService.ts` (1,985 lines) — ALL Firestore CRUD, real-time subscriptions via onSnapshot
- `functions/src/index.ts` (5,060 lines) — ALL Cloud Functions (~50 exports), economy enforcement is server-side only
- `lib/gamification.ts` (455 lines) — Client-side display: XP math, rank names, gear score, combat stats
- `App.tsx` — Route definitions, lazy-loaded components, auth gating

## Data Model Essentials
- `Assignment` serves as both "resource" and "assignment" — has `lessonBlocks`, assessment config, rubric
- `User` carries full RPG payload: XP, level, currency (Cyber-Flux), inventory, equipped gear, class profiles, skill tree, achievements, quests, streaks, cosmetics, active boosts
- Per-class RPG profiles: each class gets own inventory/equipped/avatar. XP/level/currency are global.
- `ClassConfig` has per-class feature flags (dungeons, pvpArena, bossFights, etc.)

## Agent Team Capabilities
- **ui-accessibility-engineer:** Strong WCAG knowledge, rich memory of component patterns. Has best memory of all agents.
- **backend-integration-engineer:** Firebase callable functions, Firestore, security rules. Route all server-side work here.
- **qa-bug-resolution:** Excellent bug catalog in memory. Does NOT fix — only reports. Has ~15 open bugs tracked.
- **content-strategist-ux-writer:** RPG/spy theme copy, ISLE pedagogy text. No code output.
- **data-analyst:** Student engagement analytics, EWS reports, grade distributions.
- **economy-designer:** RPG system implementation — items, abilities, loot tables, economy tuning.
- **deployment-monitor:** Post-deploy verification, function logs, hosting checks.

## Delegation Patterns
- Frontend changes → ui-accessibility-engineer
- Cloud Functions / Firestore → backend-integration-engineer
- Post-implementation audit → qa-bug-resolution (mandatory before deploy)
- Student-facing copy → content-strategist-ux-writer
- Economy/RPG features → economy-designer (understands loot pipeline, stat system)
- Simple end-to-end changes → can be done directly without delegation

## Architecture Decisions
- Economy enforcement is SERVER-SIDE ONLY — client gamification.ts is display-only
- All routes are lazy-loaded via React.lazy()
- Dark theme with glassmorphism: bg-white/5, backdrop-blur-xl, border-white/10
- Proctor Bridge: postMessage protocol (PROCTOR_READY, SAVE_STATE, ANSWER, COMPLETE) for embedded HTML activities
- ISLE pedagogy: observe → model → test → apply before formulas

## Cosmetic System
- 30 cosmetics total: 8 Auras (150 Flux), 8 Particles (200 Flux), 7 Frames (250 Flux), 7 Trails (300 Flux)
- Definitions: `lib/gamification.ts` AGENT_COSMETICS array (AgentCosmeticDef[])
- Server catalog: `functions/src/index.ts` FLUX_SHOP_CATALOG — must stay in sync with client
- Shop UI: `components/xp/FluxShopPanel.tsx` — subcategories by visualType (AURA/PARTICLE/FRAME/TRAIL)
- Avatar rendering: `components/dashboard/OperativeAvatar.tsx` — SVG animations per cosmetic type, keyed by activeCosmetic ID
- Type: `CosmeticVisualType` in `types.ts`; `ConsumableType` includes 'AGENT_COSMETIC'
- Only one cosmetic active at a time (global, not per-class)
- Each aura/trail has UNIQUE rendering (not just color swaps): ember=flame tongues, frost=crystal shards, void=vortex, radiant=starburst, toxic=bubbles, bloodmoon=heartbeat, aurora=bands, solar=corona; trails similarly differentiated
- FluxShopPanel has preview system: Eye icon per card, avatar panel at top. Accepts playerEquipped/playerAppearance/playerEvolutionLevel props

## Known Technical Debt
- `functions/src/index.ts` is a 5,060-line monolith — should be split into modules
- `dataService.ts` at 1,985 lines handles everything — could use domain splitting
- No ESLint configuration
- `scrollbar-hide` Tailwind class used without plugin
- Assignment type historically lacked createdAt/updatedAt (partially addressed)

## Simulation Output
- Simulations live at `/home/kp/Desktop/Simulations/<class>/` (AP Physics, Honors Physics, Forensic Science)
- `/3d-activity` skill has `disable-model-invocation: true` — must follow instructions manually, cannot use Skill tool
- First Forensic Science sim: `dna-extraction-lab.html` (Activity 7-1, DNA Extraction)
- Simulation reference files: `babylon-reference.md`, `example-sim.md`, `portal-bridge.md` in `.claude/skills/`
- 3d-graphics-engineer agent owns visual quality; content-strategist owns instructional text (no code)

## User Preferences
- Fully autonomous pipelines — no checkpoints during dev-pipeline
- Prioritize shipping over perfection
- Always deploy to Firebase production after QA passes
