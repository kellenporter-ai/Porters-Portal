---
name: dev-pipeline
description: Use when someone asks to fix a bug, implement a feature, add functionality, resolve an issue, or build something new in Porter's Portal. Also triggers on "dev pipeline", "fix and ship", or "build and deploy".
argument-hint: [description of bug or feature]
---

## What This Skill Does

Full development lifecycle automation for Porter's Portal. Takes a bug report or feature request, researches best practices, implements the solution, runs QA, and deploys to Firebase production — all autonomously.

**Pipeline stages:** Analyze → Research → Implement → Build → QA → Deploy

---

## Step 1: Analyze the Request

Parse `<ARGUMENTS>` to extract:

- **What** — the bug symptom or feature description
- **Where** — any mentioned files, components, or areas of the codebase
- **Why** — the user's intent or the problem being solved

Then explore the codebase to understand the affected areas:

1. Use the Explore agent to map out relevant files, components, and data flows
2. If it's a bug, reproduce the issue by reading the relevant code paths and identifying the root cause
3. If it's a feature, identify where the new code fits into the existing architecture
4. Check `types.ts`, `services/dataService.ts`, and relevant components to understand current data models and patterns

If no arguments are provided, ask: "What bug should I fix or feature should I build? Describe the problem or what you want added."

---

## Step 2: Research Best Practices

Search for current best practices and proven solutions using web search. Target these resources:

- **Stack Overflow** — search for the specific error, pattern, or technique
- **MDN Web Docs** — for web API, CSS, and JavaScript reference
- **Official docs** — React, Firebase/Firestore, TypeScript, Tailwind CSS, Vite docs as relevant
- **GitHub issues/discussions** — search for similar bugs or feature implementations in related projects

Research goals:
- Find the recommended approach for the specific problem
- Identify potential pitfalls or edge cases others have encountered
- Confirm the solution aligns with the project's tech stack (React 19, Firebase 10, TypeScript, Tailwind, Vite)

Synthesize findings into a clear implementation approach. Do NOT present research findings to the user — proceed directly to implementation.

---

## Step 3: Implement the Solution

Apply the researched approach to the codebase:

1. **Follow existing patterns** — Match the coding style, naming conventions, and architectural patterns already in the project:
   - Dark theme UI with Tailwind (backdrop-blur, rounded cards, glassmorphism)
   - Firestore subscriptions via `onSnapshot` in `dataService.ts`
   - Lazy-loaded components via `React.lazy()`
   - Types defined in `types.ts`
   - Firebase callable functions in `functions/src/index.ts`

2. **Make minimal, focused changes** — Only modify what's necessary. Don't refactor surrounding code, add unnecessary abstractions, or over-engineer.

3. **Handle the data layer** — If the change involves new data:
   - Add types to `types.ts`
   - Add Firestore CRUD operations to `services/dataService.ts`
   - Add Cloud Functions to `functions/src/index.ts` if server-side logic is needed
   - Update `firestore.rules` if new collections/documents are added

4. **Handle the UI layer** — If the change involves UI:
   - Use existing Tailwind classes and the dark theme color scheme
   - Ensure mobile responsiveness for Chromebook screens
   - Add lazy loading for new route-level components

---

## Step 4: Build

Run the build to catch compile errors:

```bash
cd /home/kp/Desktop/Porters-Portal && npm run build
```

If the build fails:
1. Read the error output carefully
2. Fix the issues (type errors, import errors, syntax errors)
3. Re-run the build
4. Repeat until the build passes

If Cloud Functions were modified, also build those:

```bash
cd /home/kp/Desktop/Porters-Portal/functions && npm run build
```

---

## Step 5: QA Testing

Launch the **qa-tester** agent to verify the changes work correctly:

- Test from the student perspective (Chromebook browser)
- Test from the admin/teacher perspective
- Verify the fix actually resolves the reported bug or the feature works as described
- Check for regressions in related functionality

If the QA agent finds bugs:
1. Analyze the QA report
2. Fix the identified issues
3. Re-run the build (Step 4)
4. Re-launch QA testing
5. Repeat until QA passes

---

## Step 6: Deploy

Once build passes and QA is clean:

### 6a: Commit and Push

```bash
cd /home/kp/Desktop/Porters-Portal
git add -A
git commit -m "<concise description of what was fixed/added>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push origin main
```

Write a commit message that describes the **why**, not the **what**. Keep it under 72 characters for the first line.

### 6b: Deploy to Firebase

```bash
cd /home/kp/Desktop/Porters-Portal && firebase deploy
```

If only hosting changed (no Cloud Functions modified):

```bash
firebase deploy --only hosting
```

If only Cloud Functions changed:

```bash
firebase deploy --only functions
```

Wait for deployment to complete and verify no errors in the output.

---

## Step 7: Report

After successful deployment, provide a brief summary:

- What was changed and why
- Files modified
- Build status
- QA results
- Deploy status and URL

---

## Notes

- **Autonomous execution.** This skill runs the full pipeline without pausing for approval. The user trusts the process.
- **No file limits.** Any file in the project can be modified as needed.
- **Research is mandatory.** Always search for best practices before implementing. Don't rely solely on existing knowledge — the web has the latest patterns and solutions.
- **Build must pass.** Never skip the build step. Never deploy broken code.
- **QA is mandatory.** Always run the qa-tester agent before deploying. Never skip QA.
- **Auto-fix on QA failure.** If QA finds issues, fix them and re-test automatically. Do not stop to ask the user.
- **Commit messages matter.** Write clear, descriptive commit messages. Use imperative mood ("Fix X" not "Fixed X").
- **Firebase deploy is production.** The deploy goes to the live production site. This is why build + QA must pass first.
