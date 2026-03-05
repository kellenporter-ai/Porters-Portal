# QA Agent Memory — Porters-Portal

## Project Structure
- Main types: `types.ts` (~1,482 lines, single flat file)
- Services: `services/dataService.ts` (~1,985 lines, all Firestore CRUD)
- Cloud Functions: `functions/src/index.ts` (~5,060 lines, ~50 exports)
- Tailwind config: `tailwind.config.js` — plugins: [] (NO extra plugins)
- No ESLint script defined (`npm run lint` fails). Use `npx tsc --noEmit` for type checking.
- Build: `npm run build` (tsc + vite). Functions: `cd functions && npm run build`
- Build produces one CSS warning: `.backdrop-blur-[3px]` (pre-existing, not new).
- Chunk size warning on large bundles is pre-existing and acknowledged.

## Open Bugs (ordered by severity)

### MAJOR
- `unflagSubmissionAsAI` does not restore score/status after unflagging — score stays 0, status stays FLAGGED
- `integrityAnalysis.ts`: `mcWrong` denominator counts union instead of intersection — produces false negatives
- `integrityAnalysis.ts`: MC blocks with `correctAnswer: undefined` generate false positives
- PhysicsTools.tsx: missing `onPointerCancel` — toolbar stuck in permanent drag on ChromeOS gesture interruptions
- PhysicsTools.tsx: no mount-time viewport clamp — position saved on large monitor restores off-screen on Chromebook
- `existingSubmission` query uses `limit(1)` without `orderBy` — may return stale flagged submission instead of latest
- **[Mar 2026] Agent Cosmetics: `equipCosmetic` in dataService.ts is a direct client Firestore write to `gamification.activeCosmetic` — field NOT in Firestore student self-write allowlist. All equip/unequip silently fail in production. Must move to a Cloud Function.**

### MEDIUM
- **[Mar 2026] Agent Cosmetics: `handleEquipCosmetic` in FluxShopPanel.tsx is fire-and-forget (no await, no catch). Shows false success toast before write resolves/fails.**
- **[Mar 2026] Agent Cosmetics: `purchaseFluxItem` writes `consumablePurchases` key for AGENT_COSMETIC items despite `dailyLimit: 0`. Creates unbounded map growth. Skip the write for unlimited items.**
- FluxShopPanel: zero ARIA attributes, purchase buttons lack aria-label, no focus ring on item cards (pre-existing, NOT the new cosmetic buttons which are correct)
- `scrollbar-hide` Tailwind class used but plugin not installed — no-op on non-Chrome browsers
- FLAGGED status banner hidden when `showScoreOnSubmit === false` — flagged student sees no warning
- `completedBlocks` Set not decremented on Edit — progress bar stays at 100% after student revises answer

### MINOR
- AI_FLAGGED notification icon uses `text-red-400` instead of `text-purple-400`
- `avgScore` includes AI-flagged submissions (score:0), artificially deflating class average
- Stats card grid: 4 cards in `md:grid-cols-3` — last card wraps to new row alone
- `handleRetake` confirm dialog overstates remaining attempts by 1
- `needsReview` missing from submitAssessment return type — "Pending Review" not shown immediately
- `getStatusLabel` shows raw enum strings ('SUCCESS', 'SUPPORT_NEEDED') for non-flagged statuses
- `NotificationBell.expandedId` not reset on panel close
- `consumablePurchases` map grows unboundedly (~1260 keys/year max, safe but messy)
- Dead code in results modal Exit button className: `${!canRetake ? '' : ''}`

## Resolved Patterns
- Multi-question room answer bleeding: fixed by adding questionId to useEffect dep array (2026-03-04)
- setTimeout cleanup: both overlay and attack timers correctly guarded with refs + useEffect cleanup
- Section filter: all stats cards correctly use sectionFilteredSubs
- saveRubricGrade dual-write: atomically writes rubricGrade + score — correct

## Recurring Patterns to Watch
- **Firestore student self-write allowlist** (firestore.rules ~line 53-61): only `codename`, `privacyMode`, `lastLevelSeen`, `appearance`, `classProfiles`, `activeQuests` are permitted within `gamification`. Any new gamification field written client-side will silently fail. Backend agent repeatedly adds client-side writes for economy-adjacent fields.
- **Fire-and-forget async UI pattern**: UI agent frequently omits `await` and `try/catch` on `onXxx` prop calls, then shows success toast prematurely. Always check equip/purchase/save handlers.
- **consumablePurchases map bloat**: items with `dailyLimit: 0` should not write to this map. Flag whenever new unlimited items are added to FLUX_SHOP_CATALOG.
- Null date sort: ascending sort sends null dates (epoch 0) to top — always handle explicitly
- "By Type" subheader vs badge label mismatch for lesson-only resources
- `updateAssignmentStatus()` does NOT write `updatedAt` — minor inconsistency
- Old submissions without `isAssessment: true` excluded from assessment filter in ResourcesTab
- XP Boost stacking: highest-wins (Math.max), not additive — by design
- `integrityAnalysis.ts` runs synchronously on main thread — acceptable for <30 students, risky for 100+

## Pre-Existing Test Failures (do NOT re-flag as regressions)
- `lib/__tests__/achievements.test.ts`: 2 failing assertions in `generateDailyChallenges` (Monday weekly challenge count). Pre-dates Agent Cosmetics feature.

## Babylon.js Simulation Patterns
- GUI labels: use `labelAtWorldPos` with invisible sphere anchors + `linkWithMesh` on Rectangle — correct pattern for world-space labels
- `onPointerCancel` not handled in Babylon scene pointer events — same pattern as PhysicsTools.tsx, causes drag state lock on ChromeOS gesture interruptions
- Drag source detection for TransformNode groups: child meshes need `setPickableRecursive` to pick them. testTubeGroup uses only `testTubeMesh.isPickable = true` without tagging metadata — liquid/strand children are unpickable as drag sources but tubeMesh is enough to initiate the drag. Watch this pattern in new sims.
- `stepInProgress` locking: set true at drag step completions, only reset inside explain overlay close handler. Locking is correct for its purpose but creates permanent lockout if explain overlay is blocked/skipped.
- Drop detection correctness: `BABYLON.Vector3.Distance` between `dragState.node.position` and `dragState.targetNode.position` — both world-space for TransformNodes, works correctly.
- Dead state field pattern: `dragState.targetDist` declared in state object but never read; actual field used is `dragState.threshold`. Check for dead state fields in drag objects.

## Architecture Notes
- No tests exist for Cloud Functions (purchaseFluxItem, equipItem, etc.)
- No tests for OperativeAvatar rendering or FluxShopPanel behavior
- SVG avatar uses SMIL animations (CPU-rendered). On Chromebooks, 10+ concurrent animations per avatar may cause composite-layer pressure. `prefers-reduced-motion` not respected.
- AGENT_COSMETICS array has 14 items; spec described 15. Confirm count with product owner.

## Accessibility Confirmed Correct
- BattleScene wrapped with aria-hidden, events announced via aria-live
- fieldset/legend pattern for answer choices with sr-only legend
- aria-current="step" on active dungeon room tile
- HpBar: aria-hidden with numeric label above for screen readers
- RoomClearedOverlay: aria-live="polite" + role="status"
- Enemy preview thumbnail in DungeonCard: aria-hidden (decorative)
- FluxShopPanel (new cosmetics): aria-pressed on equip toggle, aria-label on all buttons, color swatches aria-hidden with adjacent text labels — CORRECT
