# PantherLearn Integration Analysis for Porters-Portal

## Overview

This document analyzes the [PantherLearn](https://github.com/lmccart4/pantherlearn) LMS project and identifies features that could be adapted and integrated into Porters-Portal. Both projects serve the same school district (`@paps.net`), share the same tech foundation (React + Firebase), and target similar educational use cases — making integration and feature sharing highly practical.

---

## Side-by-Side Comparison

| Dimension | Porters-Portal | PantherLearn |
|-----------|---------------|--------------|
| **Framework** | React 19 + TypeScript | React 19 + JavaScript |
| **Build Tool** | Vite 6 | Vite |
| **Backend** | Firebase (Firestore, Functions, Hosting) | Firebase (Firestore, Functions, Hosting) |
| **Functions Runtime** | Node.js 22 | Node.js 20 |
| **AI Provider** | Google Gemini (question generation) | Google Gemini + OpenAI + Anthropic |
| **Styling** | Tailwind CSS | Plain CSS |
| **State Mgmt** | React hooks + Context | React hooks + Context |
| **Type Safety** | TypeScript (strict) | JavaScript (no types) |
| **Components** | ~53 components | ~56 components |
| **Cloud Functions** | 40+ functions | 8 functions |

---

## Features Unique to PantherLearn (Not in Porters-Portal)

### 1. Block-Based Lesson Editor
PantherLearn has a comprehensive in-app lesson authoring tool (`LessonEditor.jsx` — 73KB) supporting 25+ content block types: text (markdown), images, videos, embeds, definitions, callouts, objectives, checklists, vocabulary lists, simulations, calculators, data tables, bar charts, sketch pads, sorting activities, and evidence uploads.

**Porters-Portal gap:** Currently relies on external HTML content or URLs loaded through the Proctor engine. There is no native lesson authoring capability.

### 2. AI Tutor Chatbot
An in-lesson conversational AI powered by Google Gemini, proxied through a Cloud Function (`geminiChat`). Rate-limited to 10 requests/minute with all conversations logged for teacher review.

**Porters-Portal gap:** Has AI for question bank generation but no interactive student-facing AI tutor.

### 3. AI Plagiarism / AI-Generated Content Detection
- **Client-side heuristic detection** — analyzes phrase patterns, sentence uniformity, vocabulary, structural patterns, and behavioral signals to produce risk scores without API calls.
- **Multi-provider baseline generation** — generates canonical AI answers using Gemini, OpenAI, and Anthropic to detect student copy-paste plagiarism during grading.

**Porters-Portal gap:** Tracks paste events and paste rates via telemetry but lacks AI-specific content detection or baseline comparison.

### 4. Reflection Validation
A Cloud Function using Gemini to verify that daily student reflections are genuine and not gibberish.

**Porters-Portal gap:** The Evidence Locker accepts reflections but has no automated quality validation.

### 5. Mana System (Shared Classroom Currency)
A collective resource where students earn mana points together and vote to spend them on classroom powers (Drop Lowest Quiz, Free Time, Assignment Extension). Includes weekly decay mechanics.

**Porters-Portal gap:** Has individual Flux currency but no shared/collective resource mechanic.

### 6. Google Classroom Integration
OAuth-based import of courses and student rosters via the Google Classroom API.

**Porters-Portal gap:** Uses CSV roster import and manual enrollment. No Google Classroom sync.

### 7. Background Music Player
Teacher-configurable YouTube playlists with shuffle, repeat, and a minimizable floating player.

**Porters-Portal gap:** No ambient music feature.

### 8. Guess Who Game
A classic deduction board game with a heuristic AI opponent using trait-based logic across 40 characters.

**Porters-Portal gap:** Has boss battles and boss quizzes but no casual/mini-game offerings.

---

## Features Unique to Porters-Portal (Not in PantherLearn)

| Feature | Description |
|---------|-------------|
| **Equipment & Inventory System** | Full RPG gear with 7 slots, affixes, sockets, gems, runewords, crafting |
| **Skill Tree & Specializations** | 4 specializations (Theorist, Experimentalist, Analyst, Diplomat) with multi-tier trees |
| **Fortune Wheel** | Weighted loot spinning wheel with animations |
| **Daily Challenges** | 7 challenge types with streak system |
| **Peer Tutoring** | Formalized matching, session tracking, verification, and rewards |
| **Early Warning System (EWS)** | Behavioral bucketing, risk alerts, and teacher dashboard |
| **Seasonal Cosmetics** | Time-limited auras, particles, frames, trails |
| **Proctor Engine** | Advanced telemetry (keystroke, click, paste tracking) |
| **Enrollment Codes** | Self-service enrollment with usage tracking |
| **Boss Quizzes** | Knowledge-based boss battles with live question delivery and 12 combat modifiers |
| **Per-Class RPG Profiles** | Separate inventory/equipment/specialization per class enrollment |

---

## Recommended Integrations (PantherLearn → Porters-Portal)

### Priority 1: High Impact, Moderate Effort

#### A. AI Tutor Chatbot
**What:** Add an in-lesson AI tutor that students can ask questions to while completing assignments.

**Why:** Directly improves learning outcomes. Students get immediate help without waiting for the teacher. All conversations are logged, giving teachers visibility into student struggles.

**Implementation approach:**
- Add a new Cloud Function (`geminiTutor`) that proxies Gemini API calls with rate limiting (10 req/min per student)
- Create a `ChatTutor.tsx` component as a collapsible panel inside the Proctor view
- Store conversations in a `tutor_sessions` Firestore collection, linked to the assignment and student
- Add a teacher review interface in the admin dashboard to browse AI tutor logs
- Scope the AI's system prompt to the current assignment content for relevant responses

**Firestore additions:** `tutor_sessions` collection with fields: `studentId`, `assignmentId`, `classId`, `messages[]`, `createdAt`, `messageCount`

---

#### B. AI Content Detection (Heuristic)
**What:** Client-side analysis of student submissions to flag potential AI-generated content.

**Why:** Porters-Portal already tracks paste rates, but PantherLearn's heuristic approach adds deeper analysis: phrase pattern detection, sentence uniformity scoring, vocabulary assessment, and behavioral signal correlation — all without external API calls.

**Implementation approach:**
- Port PantherLearn's `aiDetection.jsx` to TypeScript as `lib/aiDetection.ts`
- Integrate detection scoring into the submission review flow in `AdminPanel.tsx` and `StudentDetailDrawer.tsx`
- Add a risk score badge to submission cards (Low / Medium / High risk)
- Combine with existing paste-rate telemetry for a composite integrity score

**No new Firestore collections needed** — scores can be computed on-demand from existing submission data or stored as a field on existing `submissions` documents.

---

#### C. Mana System (Shared Classroom Currency)
**What:** A collective resource where the entire class earns and votes to spend mana on classroom perks.

**Why:** Adds a collaborative dimension that complements the individual Flux currency. Creates positive peer pressure and class-wide engagement incentives. PantherLearn's implementation includes weekly decay to keep it dynamic.

**Implementation approach:**
- Add a `class_mana` Firestore collection tracking per-class mana balance, pending votes, and active powers
- Create a `ManaPanel.tsx` component as a new tab on the Student Dashboard
- Add mana earning triggers to existing Cloud Functions (e.g., bonus mana when class-wide assignment completion exceeds thresholds)
- Build a voting UI for students to propose and vote on power usage
- Powers: Drop Lowest Quiz, Free Time, Assignment Extension, Double XP Day

**Firestore additions:** `class_mana` collection, `mana_votes` sub-collection

---

### Priority 2: Medium Impact, Lower Effort

#### D. Reflection Validation
**What:** AI-powered validation of Evidence Locker reflections to ensure they are genuine.

**Why:** The Evidence Locker already collects daily reflections. Adding automated validation means teachers don't have to manually check each one for quality. Low implementation effort since the infrastructure (Gemini Cloud Functions) already exists.

**Implementation approach:**
- Add a `validateReflection` Cloud Function that sends the reflection text to Gemini with a validation prompt
- Call it on Evidence Locker submission before accepting the reflection
- Flag low-quality reflections for teacher review rather than rejecting outright
- Display validation status (Validated / Needs Review) in the admin Evidence Locker view

---

#### E. Google Classroom Roster Sync
**What:** Import student rosters directly from Google Classroom via OAuth.

**Why:** Eliminates manual CSV import and enrollment code workflows for teachers who already use Google Classroom. Since both platforms use Google auth on the same domain, the OAuth flow is straightforward.

**Implementation approach:**
- Add Google Classroom API scopes to the existing Firebase Auth configuration
- Create a `RosterSync.tsx` component in the admin panel
- Build a Cloud Function that fetches course rosters via the Google Classroom API
- Map imported students to `allowed_emails` and auto-enroll in the selected class
- Support periodic re-sync to catch new students

---

#### F. Block-Based Lesson Content
**What:** Native lesson authoring with structured content blocks instead of raw HTML.

**Why:** Removes dependency on external HTML files or URLs. Teachers can create, edit, and preview lessons entirely within the portal. PantherLearn supports 25+ block types.

**Implementation approach:**
- Start with a subset of block types: Text (markdown), Image, Video, Embed, Definition, Callout, Checklist
- Create a `LessonEditor.tsx` component for the admin panel
- Create a `LessonViewer.tsx` rendering component (or extend existing `LessonBlocks.tsx`)
- Store lesson content as an array of typed block objects in Firestore
- Integrate with the existing Proctor engine as a content source alongside HTML and URL modes

**Note:** This is the largest effort item. PantherLearn's editor is 73KB of code. A phased rollout starting with core block types is recommended.

---

### Priority 3: Nice-to-Have, Low Effort

#### G. Background Music Player
**What:** A floating, minimizable YouTube playlist player for ambient classroom music.

**Why:** Small quality-of-life feature that teachers appreciate. Low implementation effort.

**Implementation approach:**
- Create a `MusicPlayer.tsx` floating component using YouTube IFrame API
- Add teacher controls for playlist URL configuration in `class_configs`
- Store playlist preferences per class

---

#### H. Guess Who Mini-Game
**What:** A casual deduction board game with AI opponent.

**Why:** Adds variety beyond boss battles. Could be used as a reward activity for students who complete work early.

**Implementation approach:**
- Port PantherLearn's `GuessWhoGame.jsx` to TypeScript
- Add as an optional tab on the Student Dashboard (behind a feature flag in `class_configs`)
- Consider tying it into the gamification system (Flux cost to play, XP reward for winning)

---

## Integration Considerations

### Shared Tech Stack Advantages
- Both use React + Firebase, so component logic and Firestore patterns translate directly
- Cloud Function patterns are nearly identical
- Auth is the same (Google OAuth on `@paps.net`)

### Key Differences to Navigate
| Concern | Approach |
|---------|----------|
| **JS → TS conversion** | PantherLearn code is JavaScript; all ported code needs TypeScript types |
| **CSS → Tailwind** | PantherLearn uses plain CSS; ported components need Tailwind class conversion |
| **Data model alignment** | Firestore collection names and field structures differ; mapping layer needed |
| **Function runtime** | PantherLearn uses Node 20, Porters-Portal uses Node 22 — minor compat check needed |

### Recommended Integration Order
1. **AI Tutor Chatbot** — highest student impact, moderate effort
2. **AI Content Detection** — enhances existing integrity monitoring
3. **Mana System** — unique collaborative mechanic
4. **Reflection Validation** — quick win for Evidence Locker
5. **Google Classroom Sync** — operational efficiency
6. **Block-Based Lessons** — largest effort, highest long-term value
7. **Background Music** — quick win
8. **Guess Who Game** — fun addition

---

## Summary

PantherLearn and Porters-Portal are complementary projects built on the same stack for the same school district. PantherLearn excels in **content authoring** (block-based editor), **AI-powered learning tools** (tutor chatbot, plagiarism detection), and **collaborative mechanics** (mana system). Porters-Portal excels in **deep gamification** (equipment, skill trees, crafting), **behavioral analytics** (EWS), and **structured progression** (daily challenges, peer tutoring).

The highest-value integrations are the **AI Tutor Chatbot** and **AI Content Detection**, which directly enhance the learning experience and academic integrity monitoring that Porters-Portal already emphasizes through its telemetry system. The **Mana System** adds a collaborative layer that doesn't exist in Porters-Portal today and would complement the existing individual gamification economy.
