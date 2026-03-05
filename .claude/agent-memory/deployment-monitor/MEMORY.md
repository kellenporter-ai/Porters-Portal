# Deployment Monitor — Agent Memory

## Firebase CLI Notes
- `firebase functions:log --limit N` is INVALID. Correct flag is `-n <num>` (e.g., `firebase functions:log -n 50`)
- `firebase functions:log --only <name> -n 30` works for per-function runtime logs
- `firebase hosting:channel:list` shows last release time for the live channel

## Deployment Patterns
- Functions deploy with a shared `firebase-functions-hash` label — all functions in a deploy share the same hash
- Deploy audit logs appear as type `N` (Notice) in function logs; runtime logs are `I` (Info) and `D` (Debug)
- Cold start pattern: "Starting new instance. Reason: AUTOSCALING" followed by "STARTUP TCP probe succeeded" — normal, not an error
- All functions run on nodejs22 runtime, Gen 2, us-central1, 256Mi memory, 60s timeout, 20 max instances

## Known Baseline — Flux Shop Functions
- `purchaseFluxItem`: created 2026-03-05T01:28, active, no errors in logs; auth verification passes cleanly
- `equipFluxCosmetic`: created 2026-03-05T09:47, active, no errors in logs; auth verification passes cleanly
- Both functions see real invocations post-deploy with valid auth — shop is live and being used

## Firestore Indexes
- Only 1 composite index deployed: `notifications` collection on `userId ASC + timestamp DESC`
- No indexes required for the cosmetics/Flux Shop feature (cosmetics live on user documents, not queried as a collection)

## Hosting
- Production URL: https://porters-portal.web.app (live channel, never expires)
- Last verified deploy: 2026-03-05 11:49:09 UTC (commit f825bb6, cosmetics expansion)

## App Check Baseline
- All function logs show `"app":"MISSING"` in verifications — App Check is not enforced (expected for this environment)
- Auth always shows `"auth":"VALID"` on real invocations — authentication is working correctly

## Commit f825bb6 Deploy Summary (2026-03-05)
- 16 new cosmetics added to AGENT_COSMETICS (4 auras, 4 particles, 4 frames, 4 trails)
- FluxShopPanel.tsx reorganized into subcategory sections
- Trail rendering enhanced in OperativeAvatar.tsx (multi-layered bloom/wisp/sparkle)
- FLUX_SHOP_CATALOG synced server-side in functions/src/index.ts
- Result: HEALTHY — no errors detected post-deploy
