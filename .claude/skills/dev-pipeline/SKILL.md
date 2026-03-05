---
name: dev-pipeline
description: Use when someone asks to fix a bug, implement a feature, add functionality, resolve an issue, or build something new in Porter's Portal. Also triggers on "dev pipeline", "fix and ship", or "build and deploy".
disable-model-invocation: true
argument-hint: "[description of bug or feature]"
---

## What This Skill Does

Orchestrator-driven development pipeline for Porter's Portal. Takes a bug report or feature request, hands it to the portal-orchestrator who coordinates specialized agents to investigate, implement, and QA the work — then builds, commits, and deploys to Firebase production.

**Pipeline:** Orchestrate → Build → Deploy → Verify

You are a thin dispatch layer. Your job is to launch agents, run builds, and deploy. You do NOT write production code or investigate bugs yourself.

---

## Step 1: Hand Off to the Orchestrator

Parse `<ARGUMENTS>` to extract the user's request. If no arguments are provided, ask: "What bug should I fix or feature should I build?"

Immediately launch the **portal-orchestrator** agent with the full request. The orchestrator's job is to:

1. **Investigate** — deploy specialized agents to explore the affected systems and report back
2. **Decompose** — break the work into atomic tasks assigned to the right agents
3. **Delegate** — send each task to the specialist who owns that layer
4. **Integrate** — ensure all agent outputs work together cleanly
5. **QA** — send the integrated result to qa-bug-resolution for sign-off

Prompt the orchestrator like this:

```
The user wants: [full description from ARGUMENTS]

Run your full protocol for this request:
1. Investigate the relevant systems by delegating exploration to the appropriate specialist agents (ui-accessibility-engineer for frontend, backend-integration-engineer for backend/data, content-strategist-ux-writer for copy). Have them report back what they find before you plan any changes.
2. Based on their investigation reports, decompose the work into tasks and delegate implementation to the responsible agents.
3. After all agents complete their work, send the integrated result to qa-bug-resolution for audit.
4. If QA rejects, route each bug back to the responsible agent, then re-run QA.
5. Report back with: all files changed, QA sign-off status, and any issues encountered.

This is autonomous — do not pause to ask the user questions. If requirements are ambiguous, investigate the codebase for answers rather than asking. Make your best judgment call and proceed.

Available agents and their domains:
- ui-accessibility-engineer: React components, Tailwind styling, WCAG compliance, responsive design
- backend-integration-engineer: Cloud Functions, Firestore queries/rules/indexes, types.ts, dataService.ts
- qa-bug-resolution: Testing, static analysis, accessibility audit, integration sign-off
- content-strategist-ux-writer: UI copy, error messages, RPG flavor text, instructional content
- data-analyst: Student data queries, engagement metrics (for data-driven investigation)
- economy-designer: RPG economy items, abilities, loot, boss tuning (for gamification changes)
- 3d-graphics-engineer: Visual effects, avatars, Babylon.js scenes (for graphics changes)
```

Wait for the orchestrator to complete. It will return a summary of all work done, files changed, and QA status.

---

## Step 2: Build

Once the orchestrator reports back with QA sign-off, you MUST actually execute the build — never skip it or predict the result. The orchestrator's QA is a code review; the build is a compiler check. Both are required.

```bash
cd /home/kp/Desktop/Porters-Portal && npm run build
```

If Cloud Functions were modified:

```bash
cd /home/kp/Desktop/Porters-Portal/functions && npm run build
```

If the build fails:
1. Read the errors — determine which agent's code caused them (frontend vs backend)
2. Launch the responsible agent to fix the build errors
3. Re-build until clean

---

## Step 3: Commit and Push

```bash
cd /home/kp/Desktop/Porters-Portal
git add <specific files that were modified>
git commit -m "<concise description of what was fixed/added>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push origin main
```

Stage specific files by name — never use `git add -A` or `git add .`. Write a commit message that describes the **why**, not the **what**. Keep the first line under 72 characters. Use imperative mood ("Fix X" not "Fixed X").

---

## Step 4: Deploy to Firebase

Choose the narrowest scope that covers the changes:

```bash
# Only frontend changes (most common)
firebase deploy --only hosting

# Only Cloud Functions changed
firebase deploy --only functions

# Firestore rules or indexes changed
firebase deploy --only firestore

# Multiple layers changed
firebase deploy
```

Skip deploy if the fix is purely local tooling, dev config, or documentation.

---

## Step 5: Post-Deploy Verification

Launch the **deployment-monitor** agent to verify production health:

```
Verify the deployment that just completed. Changes made: [summary from orchestrator].
Check hosting status, Cloud Function logs for errors, and Firestore index deployment.
```

---

## Step 6: Report

Provide a brief summary:

- What was changed and why
- Which agents contributed
- Files modified
- Build + QA status
- Deploy status
- Post-deploy health check results

---

## Notes

- **Orchestrator-first.** Every request goes through the portal-orchestrator. You never investigate bugs or implement features yourself — you dispatch, build, and deploy.
- **Autonomous execution.** The full pipeline runs without pausing for user approval.
- **Agent team is the workforce.** The orchestrator coordinates specialists. Each agent works on the layer they own. This produces better results than one generalist trying to do everything.
- **Build must pass.** Never deploy broken code. If the build fails after agent work, route the errors back to the responsible agent.
- **QA is mandatory.** The orchestrator must get qa-bug-resolution sign-off before you proceed to build. If QA rejects, the orchestrator routes bugs back to agents and re-tests.
- **Deploy is production.** Firebase deploy goes to the live site students use. Build + QA must pass first.
- **Post-deploy verification.** Always run the deployment-monitor after deploying to catch issues early.
