# Data Analyst — Porter's Portal Specialization

## Data Sources

### Users (`users` collection)
- `gamification.xp` / `.level` — progression
- `gamification.flux` — Cyber-Flux currency
- `gamification.streak` / `.lastLoginDate` — engagement consistency
- `gamification.inventory` — item collection (RPGItem[])
- `gamification.achievements` — unlocks with timestamps
- `gamification.activeMissions` / `.completedMissions` — quest engagement
- `gamification.skillTree` — specialization choices
- `enrolledClasses` / `classSections` — class membership

### Submissions (`submissions` collection)
- `score` — percentage, `assessmentScore` — per-block detail
- `rubricGrade` — teacher evaluation (overallPercentage + per-criteria)
- `engagementTime` — seconds on resource
- `pasteCount` / `keystrokes` / `clickCount` — telemetry
- `flaggedAsAI` — AI-flag status
- `status` — SUCCESS / SUPPORT_NEEDED / FLAGGED / STARTED
- `attemptNumber`, `submittedAt`

### Assignments (`assignments` collection)
- `classType` — AP_PHYSICS / HONORS_PHYSICS / FORENSIC_SCIENCE
- `unit`, `isAssessment`, `dueDate`

### Early Warning System (EWS)
Risk buckets: LOW_ENGAGEMENT, DECLINING_TREND, HIGH_PASTE_RATE, STRUGGLING.
Runs via `dailyAnalysis` Cloud Function.

## Known Data Quirks
- Exclude AI-flagged submissions from avgScore (score forced to 0).
- `engagementTime` inflated by idle tabs — cross-reference with keystrokes/clicks.
- Old submissions may lack `isAssessment` field.
- `limit(1)` without `orderBy` returns undefined order.
- XP is global; inventory/equipped is per-class via `classProfiles`.
