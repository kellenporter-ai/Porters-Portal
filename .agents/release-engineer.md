# Release Engineer — Porter's Portal Specialization

## Platform
Firebase (Hosting + Cloud Functions v2 + Firestore)

## Deploy Commands

```bash
# Portal hosting
cd projects/Porters-Portal && npm run build && firebase deploy --only hosting

# Portal functions
cd projects/Porters-Portal/functions && npm run build && cd .. && firebase deploy --only functions

# Portal rules
cd projects/Porters-Portal && firebase deploy --only firestore:rules

# Portal indexes
cd projects/Porters-Portal && firebase deploy --only firestore:indexes

# Targeted function deploy (single function)
cd projects/Porters-Portal && firebase deploy --only functions:<functionName>
```

## Deploy Order (Firebase-specific)

Multi-target deploys MUST follow this order:
1. **Firestore indexes** — new queries fail without indexes; deploy first and wait for build completion
2. **Firestore security rules** — new fields need rules before functions write them
3. **Cloud Functions** — depend on indexes and rules being in place
4. **Hosting** — depends on functions being live (API calls from frontend)

## Known Deploy Gotchas

- **Stale chunks:** After hosting deploy, cached `index.js` may reference old chunk hashes. `lazyWithRetry` handles auto-reload, but verify no infinite reload loops.
- **Cache headers:** `firebase.json` sets `/assets/**` to `immutable` (1yr) and `index.html` to `no-cache`
- **Module-level throws:** A top-level `throw` in `functions/src/index.ts` prevents ALL functions from loading. Check logs for "Error: could not handle the request"
- **Linter strips imports:** After linter runs during deploy, re-check that needed imports weren't removed
- **CRITICAL:** `firebase deploy --only hosting` ships whatever is in `dist/` — the predeploy script only builds functions, NOT frontend. Always `npm run build` first.

## Rollback Commands

```bash
# Hosting rollback
firebase hosting:clone porters-portal:<previous-version> porters-portal:live

# Functions rollback (from known-good commit)
git stash && git checkout <commit> && firebase deploy --only functions && git checkout - && git stash pop

# Rules rollback
firebase deploy --only firestore:rules  # after checking out previous rules file
```
