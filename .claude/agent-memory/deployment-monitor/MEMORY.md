# Deployment Monitor — Agent Memory

## Firebase CLI Notes
- `firebase functions:log --limit N` is INVALID. Correct flag is `-n <num>` (e.g., `firebase functions:log -n 50`)
- `firebase functions:log --only <name> -n 30` works for per-function runtime logs
- `firebase hosting:channel:list` shows last release time for the live channel

## Deployment Patterns
- Functions deploy with a shared `firebase-functions-hash` label — all functions in a deploy share the same hash
- Deploy audit logs appear as type `N` (Notice) in function logs; runtime logs are `I` (Info) and `D` (Debug)
- Cold start pattern: "Starting new instance. Reason: AUTOSCALING" followed by "STARTUP TCP probe succeeded" — normal, not an error
- Deploy rollout cold start: "Starting new instance. Reason: DEPLOYMENT_ROLLOUT" — also normal, occurs during function update
- All functions run on nodejs22 runtime, Gen 2, us-central1, 256Mi memory, 60s timeout, 20 max instances

## Known Baseline — Flux Shop Functions
- `purchaseFluxItem`: active, no errors in logs; auth verification passes cleanly; sees real invocations
- `equipFluxCosmetic`: active, per-slot equip logic deployed (commit d5d2481); auth verification passes cleanly; multiple real invocations seen post-deploy
- Both functions see real invocations post-deploy with valid auth — shop is live and being used

## Firestore Indexes
- Only 1 composite index deployed: `notifications` collection on `userId ASC + timestamp DESC`
- No indexes required for the cosmetics/Flux Shop feature (cosmetics live on user documents, not queried as a collection)
- Multi-equip slots (aura/particle/frame/trail) stored on user documents — no new indexes needed

## Hosting
- Production URL: https://porters-portal.web.app (live channel, never expires)
- Last verified deploy: 2026-03-06 14:15:18 UTC (assessment session token security deploy)

## Log Inspection Pattern — Per-Function vs Cross-Function
- `firebase functions:log --only <name> -n 50` can miss the most recent deploy audit entries if 50 entries fills up with older runtime logs
- When a function's deploy hash is in doubt, use `firebase functions:log -n 100` (all functions) and grep for the hash — deploy completion audits (type N, UpdateFunction/CreateFunction with `"status":{}`) appear there even when per-function log window is saturated
- Always confirm deploy hash via cross-function log if per-function result looks stale

## App Check Baseline
- All function logs show `"app":"MISSING"` in verifications — App Check is not enforced (expected for this environment)
- Auth always shows `"auth":"VALID"` on real invocations — authentication is working correctly

## Assessment Session Token Deploy Summary (2026-03-06)
- Deploy hash: `dfff44de86a22f7883261dc5c80dc65c9a7ae1c0`
- New function: `startAssessmentSession` (CreateFunction, first deploy, revision startassessmentsession-00001-vod)
- Updated function: `submitAssessment` (UpdateFunction, now on dfff44, revision submitassessment-00013-len)
- Frontend changes: Proctor.tsx and ResourceViewer.tsx (not verified directly, hosting deploy included)
- Firestore: No new indexes deployed — `assessment_sessions` collection requires no composite indexes (likely queried by document ID only)
- Hosting released at 14:15:18 UTC
- startAssessmentSession: cold start at 19:13:50, STARTUP TCP probe succeeded — state ACTIVE, no runtime errors
- submitAssessment: confirmed on dfff44 hash at 19:14:03 UTC, state ACTIVE — no post-deploy errors
- No `assessment_sessions` index in firestore:indexes output — consistent with session tokens read by doc ID, not queried
- Zero errors detected post-deploy
- Result: HEALTHY — hosting up, HTTP 200, both functions deployed and active

## Commit e1863de Deploy Summary (2026-03-06)
- Hosting-only deploy (no Cloud Functions or Firestore changes)
- Assessment grading UX overhaul in TeacherDashboard.tsx: side-by-side layout (student answers left, rubric panel right with sticky positioning)
- Tier descriptors always visible in grade mode; compact prop added to RubricViewer
- Hosting released at 12:45:03 UTC
- Functions unchanged — dismissAlert, submitEngagement, updateStreak all firing cleanly post-deploy
- Zero errors detected post-deploy
- Result: HEALTHY — hosting up, HTTP 200, zero errors

## Commit a608b89 Deploy Summary (2026-03-06)
- Hosting-only deploy (no Cloud Functions or Firestore changes)
- saveRubricGrade in dataService.ts auto-clears AI integrity flag when teacher grades a flagged submission
- TeacherDashboard.tsx adds inline info banner explaining the auto-clear behavior + contextual toast
- Files changed: services/dataService.ts, components/TeacherDashboard.tsx
- Hosting released at 07:24:11 UTC
- No function deploys — functions unchanged (still on hash 589dcccc)
- Zero errors detected post-deploy
- Result: HEALTHY — hosting up, HTTP 200, zero errors

## Commit d5d2481 Deploy Summary (2026-03-05)
- Deploy hash: `589dcccc3dde943c6b48e8720adb081394804483`
- Multi-equip cosmetics: aura + particle + frame + trail simultaneously
- Frames moved from agent avatar to profile picture (Path of Exile-style portrait frames)
- New ProfileFrame component with 7 unique SVG frame designs
- Cloud Functions updated for per-slot equip logic (equipFluxCosmetic)
- Hosting released at 12:59:09 UTC
- equipFluxCosmetic: multiple real invocations post-deploy, all auth VALID, zero errors
- purchaseFluxItem: real invocations post-deploy, all auth VALID, zero errors
- Result: HEALTHY — zero errors detected post-deploy

## Commit 1436d1d Deploy Summary (2026-03-05)
- Deploy hash: `e3bd695d7454ee28c7d00c15a21ab836a660d8a5`
- Unique aura/trail visuals (not recolors), larger aura sizing
- Preview system added — try-before-you-buy cosmetics
- Hosting released at 12:31:27 UTC
- Result: HEALTHY — zero errors detected post-deploy

## Commit f825bb6 Deploy Summary (2026-03-05)
- 16 new cosmetics added to AGENT_COSMETICS (4 auras, 4 particles, 4 frames, 4 trails)
- FluxShopPanel.tsx reorganized into subcategory sections
- Trail rendering enhanced in OperativeAvatar.tsx (multi-layered bloom/wisp/sparkle)
- FLUX_SHOP_CATALOG synced server-side in functions/src/index.ts
- Result: HEALTHY — no errors detected post-deploy

## Commit 98cd9e6 Deploy Summary (2026-03-05)
- Hosting-only deploy (no Cloud Functions or Firestore changes)
- Grade save flow in TeacherDashboard.tsx: success toast, error toast, empty-grades validation, stopPropagation fix
- Hosting released at 22:50:58 UTC
- Active functions post-deploy: claimdailylogin, ongradeposted, submitassessment, submitengagement, updatestreak
- Log window (22:45–03:43 UTC): 100 entries, all INFO or DEBUG, zero errors or warnings
- Result: HEALTHY — hosting up, HTTP 200, zero errors

## Commit fbadda0 Deploy Summary (2026-03-05)
- Hosting-only deploy (no Cloud Functions or Firestore changes)
- Assessment grade aggregation changed to use best score across attempts (not latest)
- Trivial attempt detection added (<30s + 0% = flagged, not counted toward best)
- Best attempt highlighting with blue badge, auto-expand on click
- Improved grading UX in TeacherDashboard
- Hosting released at 23:03:14 UTC
- Functions active post-deploy: submitAssessment, onGradePosted (both firing cleanly)
- submitAssessment: multiple real invocations (attempts #1, #2, #5 observed), all auth VALID, zero errors
- onGradePosted: multiple grade-post events processed, grade notifications queued for yrodriguez186@paps.net
- 0% scores on assignment EKHyCqwEosoWyuc0anc6 are expected (trivial attempt detection — new feature)
- Result: HEALTHY — hosting up, HTTP 200, zero errors

## Commit f0390f1 Deploy Summary (2026-03-05)
- Hosting-only deploy (no Cloud Functions or Firestore changes)
- Student sidebar navigation reorganized from 16 flat items into 3 collapsible groups (Learning, Operations, Intel) with Home ungrouped at top
- Files changed: src/components/Layout.tsx, src/constants.tsx
- Hosting released at 21:53:56 UTC
- Zero function errors post-deploy; WARNING entries are the known benign GCP infra pattern (no message body, deployment-callable label only)
- Result: HEALTHY — hosting up, HTTP 200, zero errors
