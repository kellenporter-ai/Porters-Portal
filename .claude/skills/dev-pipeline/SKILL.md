---
name: dev-pipeline
description: Use when someone asks to fix a bug, implement a feature, add functionality, resolve an issue, or build something new in Porter's Portal. Also triggers on "dev pipeline", "fix and ship", or "build and deploy".
disable-model-invocation: true
argument-hint: "[description of bug or feature]"
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

**Skip this step for trivial fixes** — typos, missing imports, simple CSS adjustments, and obvious one-line bugs don't need web research. Jump straight to Step 3.

For non-trivial changes, search for current best practices and proven solutions using web search. Target these resources:

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

Apply the researched approach to the codebase. For complex changes that span both frontend and backend, delegate to the specialized agents:

### Agent Delegation

- **UI changes** (components, layouts, styling, accessibility) — delegate to the **ui-accessibility-engineer** agent:
  ```
  Implement the following UI changes for [feature/fix]. Files to modify: [paths].
  Requirements: [specific UI requirements from your analysis].
  Follow existing Tailwind dark theme patterns. Ensure Chromebook responsiveness and WCAG AA compliance.
  ```

- **Backend changes** (Cloud Functions, Firestore rules, data models, API endpoints) — delegate to the **backend-integration-engineer** agent:
  ```
  Implement the following backend changes for [feature/fix]. Files to modify: [paths].
  Requirements: [specific backend requirements from your analysis].
  Follow existing patterns in dataService.ts and functions/src/index.ts. Parameterize all queries.
  ```

- **Simple or tightly coupled changes** — implement directly without delegation when the fix is small and spans both layers (e.g., adding a field end-to-end).

### Implementation Guidelines

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

Launch the **qa-bug-resolution** agent to audit the changes:

```
Audit the following changes for [feature/fix description].

Files changed: [list all modified files with paths].

Verify:
1. Build passes without errors or warnings
2. No security vulnerabilities (XSS, injection, exposed secrets)
3. No performance regressions (unnecessary re-renders, N+1 queries, large bundle impact)
4. WCAG AA accessibility compliance on any UI changes
5. The fix resolves the reported issue / the feature works as described
6. No regressions in related functionality

Test from both student (Chromebook) and admin/teacher perspectives.
Provide your QA Integration Sign-Off report.
```

If the QA agent rejects with bug reports:
1. Route each bug to the responsible agent (ui-accessibility-engineer for frontend bugs, backend-integration-engineer for backend bugs) or fix directly if simple
2. Re-run the build (Step 4)
3. Re-launch QA with the qa-bug-resolution agent
4. Repeat until QA grants integration sign-off

---

## Step 6: Deploy

Once build passes and QA is clean:

### 6a: Commit and Push

```bash
cd /home/kp/Desktop/Porters-Portal
git add <specific files that were modified>
git commit -m "<concise description of what was fixed/added>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push origin main
```

**Important:** Stage specific files by name — do NOT use `git add -A` or `git add .`, which can accidentally stage sensitive files (.env, credentials, local config). List each modified file explicitly.

Write a commit message that describes the **why**, not the **what**. Keep it under 72 characters for the first line.

### 6b: Deploy to Firebase

Choose the narrowest deploy scope that covers your changes:

```bash
# Only frontend changes (most common)
firebase deploy --only hosting

# Only Cloud Functions changed
firebase deploy --only functions

# Both hosting and functions changed
firebase deploy
```

Wait for deployment to complete and verify no errors in the output.

**When to skip deploy:** If the fix is purely local tooling, dev config, or documentation — don't deploy. Only deploy when production-facing code changed.

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
- **QA is mandatory.** Always run the qa-bug-resolution agent before deploying. Never skip QA.
- **Auto-fix on QA failure.** If QA finds issues, route bugs to the responsible agent (ui-accessibility-engineer or backend-integration-engineer) and re-test. Do not stop to ask the user.
- **Commit messages matter.** Write clear, descriptive commit messages. Use imperative mood ("Fix X" not "Fixed X").
- **Firebase deploy is production.** The deploy goes to the live production site. This is why build + QA must pass first.
- **Agent team — ALWAYS prioritize project agents over general-purpose.** The available specialized agents are:
  - **ui-accessibility-engineer** — frontend UI, components, styling, WCAG accessibility
  - **backend-integration-engineer** — Cloud Functions, Firestore, APIs, auth, data models
  - **qa-bug-resolution** — testing, static analysis, accessibility audit, integration sign-off
  - **content-strategist-ux-writer** — UI copy, error messages, instructional text (use when adding user-facing text)
  - **portal-orchestrator** — for complex multi-step features that need architectural planning (not typically needed in dev-pipeline, but available for large features)
  - General-purpose agents are a **fallback only** — use project agents first for all delegated work.
