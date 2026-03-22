# Performance Engineer — Porter's Portal Specialization

## Portal Data Type Reference

When writing performance thresholds, analytics comparisons, or engagement heuristics against Portal data, unit errors cause silent 60x bugs. Always verify units from `types.ts` comments before arithmetic.

### Time Field Units (confirmed from types.ts + HomeTab.tsx)

| Field | Type | Unit | Notes |
|-------|------|------|-------|
| `User.stats.totalTime` | `number` | **seconds** | Divide by 3600 for hours display |
| `StudentBucketProfile.metrics.totalTime` | `number` | **seconds** | Same convention |
| JS Date / `Date.now()` | `number` | **milliseconds** | Standard JS |
| Firestore `Timestamp` (createdAt, updatedAt, etc.) | `Timestamp` | Firestore Timestamp object | Use `.toMillis()` for math |
| Assessment session timestamps | `number` | **milliseconds** | Standard JS Date epoch |
| `DailyChallenge.date` | `string` | ISO date string (YYYY-MM-DD) | No time component |

### Rules

1. **Never assume minutes.** `totalTime` sounds like it could be minutes — it is seconds.
2. **Never invert the conversion.** If a field is in seconds and you want to compare against a minute threshold, convert the threshold: `15 minutes → 900 seconds`. Do NOT multiply the field value.
3. **Any `*Time`, `*Duration`, or `*Seconds` field:** check the unit in `types.ts` comments before writing a comparison. If no comment exists, trace the field to where it is written (usually `useActivity` or `useSession`) to confirm.
4. **Engagement thresholds must name their unit in code comments.** Example: `// 900 seconds = 15 minutes`

### Quick check examples

```ts
// CORRECT — totalTime is seconds, threshold in seconds
const isEngaged = user.stats.totalTime >= 900; // 900 s = 15 min

// WRONG — do not multiply totalTime (it is already seconds, not minutes)
// const isEngaged = user.stats.totalTime * 60 >= 900;

// CORRECT — Firestore Timestamp comparison
const ageMs = Date.now() - user.createdAt.toMillis();
```

## Performance Budgets (Portal-specific)

| Metric | Budget | Tool |
|--------|--------|------|
| Initial bundle (gzipped) | < 250 KB | `vite build` + analyze |
| Cloud Function cold start | < 3s | Firebase logs |
| Firestore query response | < 500ms | profiling |

## Key Files
- `vite.config.ts` — build config, manual chunks
- `lib/lazyWithRetry.ts` — route-level code splitting wrapper
- `types.ts` — all shared types (~1,482 lines)
