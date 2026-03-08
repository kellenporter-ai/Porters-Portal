# Backend Engineer — Porter's Portal Specialization

## Stack
Firebase callable Cloud Functions v2, Firestore, Firebase Auth with custom claims.

## Key Files

| File | Purpose | Size |
|------|---------|------|
| `functions/src/index.ts` | ALL Cloud Functions (~50 exports) | ~5,060 lines |
| `types.ts` | ALL shared TypeScript types | ~1,482 lines |
| `services/dataService.ts` | ALL client-side Firestore CRUD | ~1,985 lines |
| `firestore.rules` | Firestore security rules | — |
| `firestore.indexes.json` | Composite index definitions | — |
| `lib/gamification.ts` | Client-side display math (read-only reference) | ~455 lines |

## Cloud Function Pattern
```typescript
export const functionName = onCall(
  { region: "us-east1", enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "...");
    const { field } = request.data;
    if (!field) throw new HttpsError("invalid-argument", "...");
    await db.runTransaction(async (t) => { /* read, validate, write */ });
    return { success: true };
  }
);
```

## Conventions
- `HttpsError` for all errors (not generic throws).
- Transactions for multi-document atomicity (XP + inventory + currency).
- Admin ops check `request.auth.token.admin === true`.
- XP math must mirror `lib/gamification.ts` bracket logic (xpForLevel/levelForXp).
- Loot rolls use weighted rarity tables — validate server-side.

## Firestore Schema
- `users/{uid}` — full RPG payload (gamification nested object)
- `assignments/{id}` — lesson blocks, assessment config
- `submissions/{id}` — student responses with telemetry
- `classConfigs/{classType}` — per-class feature flags
- `notifications/{id}` — push notification records

## dataService.ts Pattern
- Subscriptions return unsubscribe functions.
- `setDoc` with `{ merge: true }` for updates.
- `serverTimestamp()` for time fields.
- Map docs: `{ id: doc.id, ...doc.data() }`.

## Security Rules Pattern
- Students read only their own data (unless admin).
- Writes validate auth UID matches document's userId.
- Admin claim (`token.admin`) bypasses read restrictions.

## Pitfalls
- XP bracket math must match client and server — changes must be mirrored.
- Transactions required for any read-then-write on user data.
- Composite indexes needed for multi-where or where+orderBy queries.
- No `limit(1)` without `orderBy`.
