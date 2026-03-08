# Porter's Portal — Project Context

## Overview
Gamified high school LMS (AP Physics 1, Honors Physics, Forensic Science) with deep RPG progression. Students are "operatives" in a spy/covert-ops theme.

## Audience
High school students on Chromebooks (low-end hardware). Teachers use it for lesson delivery, assessment, and progress tracking.

## Tech Stack
- **Frontend:** React 18 + TypeScript + Vite, Tailwind CSS
- **Backend:** Firebase callable Cloud Functions v2 (Node.js + TypeScript) — NOT Express/REST
- **Database:** Firestore (NoSQL) — NOT SQL, no ORM, no migrations
- **Auth:** Firebase Auth with custom claims for roles
- **Hosting:** Firebase Hosting
- **Pedagogy:** ISLE (Investigative Science Learning Environment) — constructivist, observation-first

## Build Commands
- **Frontend:** `npm run build`
- **Functions:** `cd functions && npm run build`

## Deploy Commands
- **Hosting only:** `firebase deploy --only hosting`
- **Functions only:** `firebase deploy --only functions`
- **Firestore rules/indexes:** `firebase deploy --only firestore`
- **Full deploy:** `firebase deploy`

## Key Architecture Patterns
- Economy enforcement (XP, loot, currency) is server-side ONLY. Client `lib/gamification.ts` is display-only.
- Top-level Firestore collections with field-based filtering (no subcollections).
- All Cloud Functions use `onCall` with `{ region: "us-east1" }`.
- Real-time subscriptions via `onSnapshot` returning unsubscribe functions.

## Project-Specific QA Criteria
- ISLE pedagogy compliance: lessons must follow Observation → Hypothesis → Testing → Application.
- Questions must require application/reasoning, not rote recall.
- Failure states must frame errors as hypothesis-disproving data, not punishment.
- Rubrics must map to ISLE SAAR scale (0-3), not vague effort descriptors.
- Chromebook performance is a hard constraint — test against low-end assumptions.
