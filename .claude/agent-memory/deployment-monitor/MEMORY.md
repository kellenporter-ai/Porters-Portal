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
- Last verified deploy: 2026-03-05 12:59:09 UTC (commit d5d2481, multi-equip + ProfileFrame)

## App Check Baseline
- All function logs show `"app":"MISSING"` in verifications — App Check is not enforced (expected for this environment)
- Auth always shows `"auth":"VALID"` on real invocations — authentication is working correctly

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
