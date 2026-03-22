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

## Submission Schema Traps (5 confirmed — silent data corruption)

| Trap | Correct | Wrong | Why it matters |
|------|---------|-------|----------------|
| No `classType` on submissions | Derive via `assignments[assignmentId].classType` | `submission.classType` | Field doesn't exist — grouping by class silently produces an empty/undefined bucket |
| Rubric tier field | `rubricGrade.grades[qId][skillId].selectedTier` (0-4) | `.tier` | Wrong field name → undefined → false "ungraded" counts |
| AI suggestion tier | `aiSuggestedGrade.suggestedTier` | `aiSuggestedGrade.selectedTier` | Different field name than teacher grades — mixing them up drops AI suggestions from analysis |
| STARTED status included | Filter or explicitly handle `status === 'STARTED'` | Assume all submissions are complete | Inflates completion counts, pollutes score averages with partial work |
| Score semantics | Check `isAssessment` first: XP (classwork) vs percentage (assessment) | Treat all `score` fields the same | Averaging XP and percentages together produces meaningless numbers |

## Query Bounds (mandatory)
- **Always `.limit()`** — unbounded queries cause OOM at scale. Defaults: 500 submissions, 500 users, 200 leaderboard.
- **Deduplicate retakes** — students with retakes have multiple submission docs per assignment. Use `new Set(submissions.map(s => s.assignmentId)).size` for completion counts. Use `Map<assignmentId, bestScore>` for averages.
- **Best-per-assignment for scores** — never average all submission scores; retakes inflate or deflate depending on trajectory.
- **Exclude AI-flagged (score === 0)** — flagged submissions have score zeroed out; including them tanks averages.

## Known Data Quirks
- Exclude AI-flagged submissions from avgScore (score forced to 0).
- `engagementTime` inflated by idle tabs — cross-reference with keystrokes/clicks.
- Old submissions may lack `isAssessment` field.
- `limit(1)` without `orderBy` returns undefined order.
- XP is global; inventory/equipped is per-class via `classProfiles`.
