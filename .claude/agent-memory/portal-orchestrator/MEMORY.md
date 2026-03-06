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

## Cosmetic System (Multi-Equip)
- 30 cosmetics total: 8 Auras (150 Flux), 8 Particles (200 Flux), 7 Frames (250 Flux), 7 Trails (300 Flux)
- **Multi-equip:** One of each type active simultaneously via `ActiveCosmetics { aura, particle, frame, trail }` in types.ts
- Old `activeCosmetic` (single string) kept for backward compat but deprecated
- Slot derived from ID prefix: `aura_*`, `particle_*`, `frame_*`, `trail_*`
- Definitions: `lib/gamification.ts` AGENT_COSMETICS array (AgentCosmeticDef[])
- Server catalog: `functions/src/index.ts` FLUX_SHOP_CATALOG — must stay in sync with client
- **OperativeAvatar** (`components/dashboard/OperativeAvatar.tsx`): renders aura + particle + trail simultaneously. Does NOT render frames.
- **ProfileFrame** (`components/dashboard/ProfileFrame.tsx`): wraps profile pictures with 7 unique SVG frame designs. Used in Leaderboard, ProfileShowcase, PlayerInspectModal.
- Frame designs: circuit (PCB traces), thorns (organic vines), diamond (faceted gem), hex (tessellating grid), glitch (RGB offset/scanlines), rune (mystical glyphs), neon (glowing tube)
- FluxShopPanel: per-slot equip/unequip, preview merges with current equipped set
- Backend: `equipFluxCosmetic` writes to `gamification.activeCosmetics.{slot}`, `purchaseFluxItem` auto-equips to correct slot

## Assessment Security (fixed 2026-03-06)
- **Pre-fill exploit patched**: Students could write answers into `lesson_block_responses` via DevTools before timer starts. Fix: Proctor clears saved responses on mount for assessments.
- **Server telemetry validation**: `calculateFeedbackServerSide` now flags: <30s engagement with responses, <5s/response, 0 keystrokes+0 pastes with responses (ghost submissions).
- **Server elapsed time cap**: `submitAssessment` computes `serverElapsedSec`, caps `engagementTime` to prevent fabricated high values. Stores audit fields: `clientReportedEngagement`, `serverElapsedSec`.
- **Client gate**: 30s minimum engagement before submit button works (UX only; server enforces independently).
- **Session tokens (added 2026-03-06)**: `startAssessmentSession` CF issues crypto token -> stored in `assessment_sessions/{token}`. `submitAssessment` validates + consumes token atomically via transaction. Token provides server-authoritative `startedAt` for elapsed time. Grace period (12h from deploy) allows tokenless submissions with `legacySubmission: true` flag. After grace, tokenless submissions rejected. Client stores token in sessionStorage (key: `assessment_session_{assignmentId}`), clears on submit/retake.
- RULE: Never trust client-reported metrics. Always validate server-side.

## Known Technical Debt
- `functions/src/index.ts` is a 5,060-line monolith — should be split into modules
- `dataService.ts` at ~2,020 lines handles everything — could use domain splitting
- No ESLint configuration
- `scrollbar-hide` Tailwind class used without plugin
- Assignment type historically lacked createdAt/updatedAt (partially addressed)
- `subscribeToSubmissions` global limit(200) still affects non-assessment views using global submissions
- Workspace dirs excluded from tsconfig but still on disk (dev-pipeline-workspace, study-guide-workspace, game-balance-workspace)

## Bug Patterns
- **Global query limits + client-side filtering = silent data loss**: subscribeToSubmissions limit(200) caused assessment submissions to vanish as total count grew past 200. Fixed 2026-03-05 with `subscribeToAssignmentSubmissions` (scoped by assignmentId, no limit). Same pattern could recur in any view filtering the global submissions list.
- **Silent Firestore write failures**: TeacherDashboard rubric grade save had try/catch with only console logging. No toast feedback. Fixed 2026-03-05. RULE: every user-initiated Firestore write must have toast feedback on success and failure.
- **"Latest" vs "Best" attempt confusion**: Grade aggregation used `latest` (highest attemptNumber) instead of best score. Fixed 2026-03-05. RULE: always use best score across attempts for student-facing and teacher-facing grade display. The `best` field on studentGroup now holds the highest-scoring non-AI-flagged submission.
- **Missing try/catch on async handlers**: `handleSaveDraft` in QuizBossFormModal had no try/catch — Firestore write failures were unhandled promise rejections with zero user feedback. Fixed 2026-03-06. RULE: every async handler that calls Firestore must have try/catch with toast.error AND console.error showing the actual error message, not a generic string. Also add `isSaving` state to prevent double-clicks.

## Assessment Grading Architecture
- `TeacherDashboard.tsx` handles all assessment grading UI (~1,590 lines)
- Student groups computed in `useMemo` within the assessments tab IIFE (line ~291+)
- Key fields per group: `latest` (most recent), `best` (highest score), `bestGraded` (highest rubric-graded)
- `getEffectiveScore()`: rubricGrade.overallPercentage > assessmentScore.percentage > score > 0
- `isTrivialAttempt()`: <30s engagement + 0% score + not FLAGGED -> dimmed in UI
- `saveRubricGrade` in dataService writes rubricGrade + score to submission doc, sends notification
- `rubricDraft` state holds in-progress rubric tier selections (single shared state, resets on attempt switch)
- **Side-by-side layout**: Expanded submission uses `flex lg:flex-row` — answers left (lg:w-1/2), rubric right (lg:w-1/2 sticky). Stacks on mobile.
- **RubricViewer** has `compact` prop for tighter spacing in side panels. Grade mode always shows tier descriptors (no toggle).
- Rubric panel is `lg:sticky lg:top-0 lg:max-h-[80vh] lg:overflow-y-auto` — stays visible while scrolling answers. Save bar is `sticky bottom-0`.

## Simulation Output
- Simulations live at `/home/kp/Desktop/Simulations/<class>/` (AP Physics, Honors Physics, Forensic Science)
- `/3d-activity` skill has `disable-model-invocation: true` — must follow instructions manually, cannot use Skill tool
- First Forensic Science sim: `dna-extraction-lab.html` (Activity 7-1, DNA Extraction)
- Second Forensic Science sim: `the-break-in-dna-profiling.html` (Activity 7-2, DNA Profiling + Debate Prep)
  - Redesigned for ISLE: no auto-match, students record own observations, theory-building before feedback
  - 6 phases: Engage -> Investigate -> Gel Lab -> Analysis Worksheet -> Theory Building -> Debate Prep
  - Hybrid sim+debate format: sim prepares students for in-person class debate
  - Evidence feedback: wrong forensic test selections get specific corrective feedback
- Simulation reference files: `babylon-reference.md`, `example-sim.md` in `.claude/skills/3d-activity/`
- `portal-bridge.md` does NOT exist in skills dir (checked 2026-03-05)
- 3d-graphics-engineer agent owns visual quality; content-strategist owns instructional text (no code)
- Agent tool is NOT available as a deferred tool — for standalone HTML sims, orchestrator implements directly

## User Preferences
- Fully autonomous pipelines — no checkpoints during dev-pipeline
- Prioritize shipping over perfection
- Always deploy to Firebase production after QA passes

## Project File Structure
- No `src/` directory — components, lib, services, types.ts all at project root
- `/dev-pipeline` skill has `disable-model-invocation: true` — must follow its instructions manually
- OperativeAvatar.tsx is ~1,200 lines of inline SVG — read in chunks, never try to read whole file at once
