# Deployment Monitor — Porter's Portal Specialization

## Platform
Firebase (Hosting + Cloud Functions v2 + Firestore + Storage)

## Pre-Deploy Checklist
1. Frontend build: `cd projects/Porters-Portal && npm run build` (produces `dist/`)
2. Functions build: `cd projects/Porters-Portal/functions && npm run build`
3. Type check: `npx tsc --noEmit` (checks types but does NOT produce `dist/`)
4. **CRITICAL:** `firebase deploy --only hosting` ships whatever is in `dist/` — the predeploy script only builds functions, NOT frontend. Always `npm run build` first.

## Health Check Commands

```bash
# Hosting — verify site is reachable
curl -s -o /dev/null -w "%{http_code}" https://porters-portal.web.app

# Cloud Function logs (last 50 entries)
firebase functions:log --limit 50

# Specific function logs
firebase functions:log --only <function-name> --limit 25

# Firestore index status
firebase firestore:indexes

# Check for stale chunk errors (post-deploy)
firebase functions:log --only submitAssessment --limit 10
```

## Key Scheduled Functions
| Function | Schedule | Purpose |
|----------|----------|---------|
| `sundayReset` | Weekly (Sun) | Deletes evidence locker uploads ONLY (NOT submissions) |
| `dailyAnalysis` | Daily 6 AM ET | EWS bucket classification + engagement scoring |
| `checkStreaksAtRisk` | Daily | Streak maintenance notifications |
| `cleanupStaleData` | Daily 3 AM ET | Purge assessment_sessions >7d, archives >90d |

## Critical Functions (errors = CRITICAL alert)
- `submitAssessment` — student work submission
- `awardXP` / `awardBehaviorXP` — XP economy
- `claimDailyLogin` — daily login rewards
- `redeemEnrollmentCode` — student enrollment
- `archiveAndClearResponses` — assessment fresh-start

## Post-Deploy Verification
1. Check HTTP status of `https://porters-portal.web.app` (expect 200)
2. Open site and verify no console errors (stale chunk = deploy cache issue)
3. Check `firebase functions:log` for any ERROR-level entries in last 5 minutes
4. Verify scheduled functions haven't been disrupted: `firebase functions:list`

## Known Deploy Gotchas
- **Stale chunks:** After deploy, cached `index.js` may reference old chunk hashes. `lazyWithRetry` handles auto-reload, but verify no infinite reload loops.
- **Cache headers:** `firebase.json` sets `/assets/**` to `immutable` (1yr) and `index.html` to `no-cache`
- **Module-level throws:** A top-level `throw` in `functions/src/index.ts` prevents ALL functions from loading. Check logs for "Error: could not handle the request"
- **Linter strips imports:** After linter runs during deploy, re-check that needed imports weren't removed

## Escalation
- Single function error: investigate, report
- Multiple function errors: CRITICAL — report immediately with log excerpts
- Hosting 5xx: check Firebase status page + recent deploy
