# Portal tooling

## `rules-test-cuticle.js`

Live-fire test for the `resource_saves` security rules that back the
standalone-activity save layer (`public/portal-save.js`).

Run it under the emulator (the emulator port comes from the environment;
`firebase.json` puts Firestore on 8085, not the default 8080):

```bash
firebase emulators:exec --only firestore --project porters-portal \
  "node tools/rules-test-cuticle.js"
```

It asserts four things, and all four must hold:

| Case | Expected |
|---|---|
| Whitelisted student writes their own doc | allowed |
| Whitelisted student reads their own doc | allowed |
| Non-whitelisted account writes its own doc | denied |
| Whitelisted student writes another student's doc | denied |

The `updatedAt: serverTimestamp()` field is mandatory. The rules require
`d.updatedAt == request.time`, so a test doc without it is denied and reads
as a rules failure when the rules are actually fine.
