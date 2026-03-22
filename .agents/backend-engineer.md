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

## Firestore Write Safety (CRITICAL — silent production failures)

Before implementing ANY client-side Firestore write, verify the target field is in the security rules allowlist. Writes to non-allowlisted fields succeed in the emulator but **fail silently in production** — no error, no log, false success in the UI.

**Checkpoint (every write):**
1. Identify the exact field path being written (e.g., `gamification.activeCosmetic`)
2. Check `firestore.rules` allowlist for that collection's update rule (`hasOnly([...])`)
3. If the field is NOT in the allowlist → use a Cloud Function
4. If adding a new allowlisted field → update the `hasOnly` set in `firestore.rules` AND document it

**Student self-write allowlist (user profiles):** `codename`, `privacyMode`, `lastLevelSeen`, `appearance`, `classProfiles`, `activeQuests` — everything else requires a Cloud Function.

**Query bounds (mandatory):** Every `onSnapshot` and CF `.get()` must include `.limit()`. Unbounded queries cause OOM/timeout at scale. Defaults: submissions 500, users 500, leaderboard 200, CF gets `.limit(499)` with pagination.

### Pre-Submit Safety Gate (MANDATORY — do not skip)
Before reporting work as complete, verify ALL of the following:
- [ ] Every new client-side Firestore write targets a field in the `hasOnly([...])` allowlist in `firestore.rules`
- [ ] New gamification/economy fields use **Cloud Functions**, NOT client writes
- [ ] All new queries include `.limit()` (submissions 500, users 500, leaderboard 200, CF gets 499)
- [ ] If you added a field to the allowlist, the `firestore.rules` file is in your changeset

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
