# Deployment Monitor — Porter's Portal Specialization

## Platform
Firebase (Hosting + Cloud Functions + Firestore)

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
```

## Key Scheduled Functions
- `sundayReset` — weekly reset
- `dailyAnalysis` — EWS and engagement analysis
- `checkStreaksAtRisk` — streak maintenance

## Critical Functions (errors = CRITICAL)
- `awardXP`, `submitAssessment`, `claimDailyLogin`
