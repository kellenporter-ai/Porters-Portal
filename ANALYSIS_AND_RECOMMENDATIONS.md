# Porter Portal: Analysis & Recommendations

## Executive Summary

Porter Portal is a remarkably feature-rich educational platform with deep gamification (RPG items, boss quizzes, skill trees, peer tutoring). The codebase is well-structured with lazy loading, context providers, and Cloud Functions for security-sensitive operations. Below are prioritized suggestions organized by the admin's primary interest — **test/quiz administration with student resubmission** — followed by broader UX, performance, code quality, and accessibility improvements.

---

## 1. HIGHEST PRIORITY: Test/Quiz Administration with Resubmission

### 1A. Formal Assessment Mode (Standalone Tests & Quizzes)
**Current state:** The platform has two quiz mechanisms — `ReviewQuestions` (per-assignment question banks with XP) and `BossQuizPanel` (collaborative boss fights). Neither is designed for formal, graded assessments that produce a score record the admin can review.

**Suggestion:** Create a dedicated `Assessment` entity and workflow:
- Admin creates an assessment from a question bank (or builds one inline), sets attempt limits, time limits, and score thresholds
- Students take the assessment in a locked-down Proctor-like view
- Each attempt produces an `AssessmentAttempt` record with score, answers, timestamp
- Students see their score history and can reattempt (up to the configured limit)
- Admin sees a gradebook view with best/latest/average scores per student

**Data model sketch:**
```typescript
interface Assessment {
  id: string;
  title: string;
  classType: string;
  questionBankId: string;       // Links to existing question_banks collection
  questionsPerAttempt: number;  // Random subset per attempt
  maxAttempts: number;          // 0 = unlimited
  timeLimitMinutes?: number;
  passingScore: number;         // Percentage threshold
  showCorrectAnswers: 'NEVER' | 'AFTER_SUBMIT' | 'AFTER_DEADLINE';
  isActive: boolean;
  dueDate?: string;
  targetSections?: string[];
}

interface AssessmentAttempt {
  id: string;
  assessmentId: string;
  userId: string;
  userName: string;
  attemptNumber: number;
  answers: { questionId: string; selected: string | string[]; correct: boolean }[];
  score: number;               // Percentage
  startedAt: string;
  completedAt: string;
  xpAwarded: number;
}
```

**Expected benefit:** Directly addresses the admin's primary need. Enables formal grading with retry workflows, distinct from the XP-gamified review questions.
**Complexity:** Large (new collection, Cloud Function for scoring, admin UI for creation/grading, student attempt UI)

---

### 1B. Improved Resubmission Flow for Existing Review Questions
**Current state (`ReviewQuestions.tsx`):** Students can click "New Set" to get fresh random questions. XP is only awarded once per question (`answeredBefore` set). However:
- There is no score summary persisted across sessions
- No "best score" tracking visible to students
- No admin visibility into per-student review question performance
- The penalty system (`-50% XP for wrong`) discourages experimentation

**Suggestions:**
1. **Score persistence per set:** After completing a set, save `{ setId, score, attemptDate, questionsCorrect, questionsTotal }` to a `review_attempts` subcollection. Show a history panel so students see improvement over time.
2. **Best-score badge on resource cards:** The `practiceCompletion` state in `StudentDashboard.tsx:64` already tracks best scores. Surface this in the resource list as a badge (e.g., "Best: 85%").
3. **Configurable penalty:** Let the admin set the wrong-answer penalty per assignment (0%, 25%, 50%) instead of the hardcoded `Math.ceil(question.xp / 2)` at `ReviewQuestions.tsx:192`.
4. **Admin review dashboard:** Add a tab in TeacherDashboard showing per-student question accuracy heatmaps — which questions are most commonly missed.

**Expected benefit:** Makes review questions feel more like a resubmittable quiz with visible progress.
**Complexity:** Medium

---

### 1C. Boss Quiz Replayability Improvements
**Current state (`BossQuizPanel.tsx`):** Each boss quiz is a one-shot encounter — once all questions are answered or the boss is defeated, students see an endgame screen. There's no mechanism to retry questions or face the boss again.

**Suggestions:**
1. **Recurring boss events:** Let the admin schedule boss quizzes that reset weekly (or on a custom cadence), drawing from the same question bank but reshuffling.
2. **Practice mode:** After a boss is defeated, allow students to replay the questions in a low-stakes "training" mode for reduced XP, keeping the engagement loop.
3. **Score improvement tracking:** Show students their accuracy trend across boss encounters.

**Expected benefit:** Extends the most engaging feature (boss quizzes) into a resubmission-friendly format.
**Complexity:** Medium

---

## 2. UX Improvements

### 2A. Student Progress Overview Dashboard
**Current state:** Students have many tabs (Resources, Loadout, Missions, Badges, Skills, Fortune, Tutoring, Intel, Progress, Calendar) — 10 tabs. This can be overwhelming.

**Suggestion:** Add a "Home" dashboard that aggregates: upcoming due dates, current streak, active boss fights, pending quests, and recent XP gains into a single glanceable view. Reduce cognitive load for new students.

**Expected benefit:** Faster orientation, higher engagement.
**Complexity:** Medium

### 2B. Assignment Due Date Reminders
**Current state:** Assignments have an optional `dueDate` field but there's no reminder system.

**Suggestion:** Use the existing notification infrastructure (`Notification` type, `NotificationBell` component) to send reminders at 24h and 1h before due dates. Can be implemented as a scheduled Cloud Function.

**Expected benefit:** Reduces late submissions.
**Complexity:** Small

### 2C. Inline Score Feedback on Resource Cards
**Current state:** Resource cards show completion status but not scores.

**Suggestion:** Show the student's best score as a small badge on each resource card in the resource list. The `practiceCompletion` data is already loaded in `StudentDashboard.tsx:64`.

**Expected benefit:** At-a-glance progress visibility encourages retakes.
**Complexity:** Small

### 2D. Bulk Operations for Admin
**Current state:** TeacherDashboard supports multi-select (`selectedIds`) and behavior quick-awards, but bulk XP adjustments, bulk messaging, and bulk section reassignment require visiting multiple screens.

**Suggestion:** Add a bulk-action toolbar that appears when students are selected, offering: award XP, send message, move section, export data.

**Expected benefit:** Significant time savings for admins managing large classes.
**Complexity:** Medium

---

## 3. Performance Optimizations

### 3A. Firestore Query Optimization for Large Classes
**Current state (`dataService.ts`):** The `subscribeToSubmissions` method fetches ALL submissions across ALL assignments without pagination. For a class of 150 students with 30 assignments, that's potentially 4,500+ documents loaded into memory.

**Suggestion:**
1. Add composite indexes and use `where('classType', '==', classType)` filters before subscribing
2. Implement pagination for the admin submission view (load 50 at a time)
3. Consider Firestore aggregation queries for summary statistics instead of computing client-side

**Expected benefit:** Faster load times, lower Firestore read costs.
**Complexity:** Medium

### 3B. Virtual Scrolling for Student Tables
**Current state:** `TeacherDashboard.tsx` already imports `@tanstack/react-virtual` and uses virtualization for the student table. This is good, but the `Leaderboard.tsx` component also uses it.

**Suggestion:** Ensure all list views with >50 items use virtualization. The submission list in the admin panel should also be virtualized.

**Expected benefit:** Smooth scrolling with hundreds of students.
**Complexity:** Small

### 3C. Reduce Bundle Size for Student Users
**Current state:** Admin-only components are lazy-loaded (good), but the student bundle still imports many heavy components upfront.

**Suggestion:**
1. The `StudentDashboard.tsx` imports 10+ tab components at the top level. These should be lazy-loaded per tab.
2. `katex` (in Proctor.tsx) and `DOMPurify` should be dynamically imported only when HTML content is present.

**Expected benefit:** Faster initial load for students (likely 30-40% bundle reduction).
**Complexity:** Small

### 3D. Debounce Telemetry Event Listeners
**Current state (`ReviewQuestions.tsx:72-77`):** Four global event listeners (`mousemove`, `keydown`, `scroll`, `click`) update `lastInteractionRef` on every event.

**Suggestion:** The `mousemove` listener is particularly expensive. Throttle it to once per 500ms using a simple timestamp check inside the handler.

**Expected benefit:** Reduced main-thread overhead during active use.
**Complexity:** Small

---

## 4. Missing Features Common in Educational Platforms

### 4A. Gradebook / Grade Export
**Current state:** No formal gradebook. The admin sees engagement metrics and XP, but no unified score-per-assignment view.

**Suggestion:** Build a gradebook grid (students x assignments) showing best scores. Include CSV/Excel export for integration with school LMS systems.

**Expected benefit:** Essential for teachers who need to report grades.
**Complexity:** Large

### 4B. Assignment Scheduling with Auto-Publish
**Current state:** Assignments have a `scheduledAt` field, and the student view filters by it. But there's no visual calendar for scheduling or batch-scheduling.

**Suggestion:** Add a drag-and-drop calendar in the admin panel for scheduling assignments across the semester. Show published, scheduled, and draft assignments in different colors.

**Expected benefit:** Better lesson planning workflow.
**Complexity:** Medium

### 4C. Student Self-Assessment / Reflection
**Current state:** The Evidence Locker has a `reflection` field, but there's no general self-assessment mechanism.

**Suggestion:** After completing a quiz/assessment, prompt students with a short reflection: "What did you find most challenging?" and "What will you study before retaking?" Store these as part of the attempt record. Surface them to the admin alongside scores.

**Expected benefit:** Promotes metacognition; gives teachers insight into student thinking.
**Complexity:** Small

### 4D. Parent/Guardian View
**Suggestion:** A read-only portal where parents can see their child's progress, upcoming due dates, and engagement metrics. Use a separate auth flow with invite codes.

**Expected benefit:** Increases accountability and home-school connection.
**Complexity:** Large

---

## 5. Code Quality Improvements

### 5A. Type Safety — Eliminate `as never` and Type Assertions
**File:** `App.tsx:187`
```typescript
<AdminPanel assignments={[]} submissions={submissions} users={rawUsers}
  onCreateAssignment={undefined as never} classConfigs={[]} />
```
The `as never` cast is a code smell indicating the `AdminPanel` props interface doesn't match how it's being used. The `onCreateAssignment` prop should be made optional in the component interface.

**Complexity:** Small

### 5B. Consolidate Question Types
**Current state:** There are three separate question/quiz systems:
1. `LessonBlocks` MC questions (inline in assignments)
2. `ReviewQuestions` (per-assignment question banks)
3. `BossQuizPanel` (boss encounter questions)

Each has its own question format, answer checking logic, and XP award mechanism.

**Suggestion:** Create a shared `QuestionRenderer` component and a unified question schema. Each system can still have its own context (boss fight animation, review tiers, etc.) but the core question display and answer checking should be shared.

**Expected benefit:** Reduces duplicated logic, ensures consistent behavior, makes it easier to add new question types.
**Complexity:** Medium

### 5C. Extract Magic Numbers into Constants
**File:** `ReviewQuestions.tsx:35` — `QUESTIONS_PER_TIER = 3` (good)
**File:** `ReviewQuestions.tsx:192` — `Math.ceil(question.xp / 2)` (penalty ratio hardcoded)
**File:** `Proctor.tsx` — Various timeout values embedded inline
**File:** `BossQuizPanel.tsx:299` — `setTimeout(..., 800)` and `setTimeout(..., 2000)` hardcoded

**Suggestion:** Move all timing, scoring, and threshold constants to `constants.tsx` or to per-feature config objects.

**Complexity:** Small

### 5D. Error Boundary Coverage Gaps
**Current state:** The app wraps some features in `FeatureErrorBoundary` but not all. The XP management panel, admin panel, and several student tabs lack error boundaries.

**Suggestion:** Wrap each lazy-loaded route in its own `FeatureErrorBoundary`. Currently some routes in `App.tsx` use `<Suspense>` without an error boundary.

**Complexity:** Small

### 5E. Missing Cleanup in useEffect
**File:** `ResourceViewer.tsx:60-71` — Two `getDoc` calls fire independently with no abort controller. If the component unmounts before both resolve, the `.then()` callbacks will run on unmounted state.

**Suggestion:** Use an `isCancelled` flag pattern or abort controller to prevent state updates after unmount.

**Complexity:** Small

---

## 6. Accessibility Improvements

### 6A. Keyboard Navigation for Quiz Interactions
**Current state:** The `MCBlock` in `LessonBlocks.tsx:70` uses `role="radiogroup"` and `role="radio"` (good). However, `ReviewQuestions.tsx` and `BossQuizPanel.tsx` quiz options lack ARIA roles entirely.

**Suggestion:** Add `role="radiogroup"` to option containers, `role="radio"` and `aria-checked` to individual options, and support keyboard navigation (arrow keys to move between options, Enter/Space to select).

**Expected benefit:** Screen reader users and keyboard-only users can take quizzes.
**Complexity:** Medium

### 6B. Color Contrast Issues
**Current state:** Several text elements use low-contrast combinations:
- `text-gray-600` on dark backgrounds (`bg-black/30`) — fails WCAG AA
- `text-[9px]` and `text-[10px]` — extremely small text that may be unreadable for some students

**Suggestion:** Audit all text for WCAG AA contrast (4.5:1 ratio). Replace sub-11px text with at least 11px (0.6875rem). Consider adding a "high contrast" mode to UserSettings.

**Expected benefit:** Meets accessibility standards; benefits students with visual impairments.
**Complexity:** Medium

### 6C. Focus Management on Modal/Drawer Open
**Current state:** The codebase has a `useFocusTrap` hook (`lib/useFocusTrap.ts`), but it's not consistently used across all modals and drawers.

**Suggestion:** Ensure every modal (`Modal.tsx`, `ConfirmDialog.tsx`, `SettingsModal.tsx`, `PlayerInspectModal.tsx`, etc.) traps focus and returns focus to the trigger element on close.

**Expected benefit:** Screen reader and keyboard users don't get lost behind modals.
**Complexity:** Small

### 6D. Skip Navigation Link
**Suggestion:** Add a "Skip to main content" link at the top of `Layout.tsx` that becomes visible on focus. This lets keyboard users bypass the navigation sidebar.

**Expected benefit:** Standard accessibility pattern; low effort, high impact.
**Complexity:** Small

### 6E. Live Regions for Dynamic Content
**Current state:** Toast notifications (`ToastProvider.tsx`) and XP awards appear visually but may not be announced to screen readers.

**Suggestion:** Add `aria-live="polite"` to the toast container and `aria-live="assertive"` for error toasts.

**Expected benefit:** Screen reader users are informed of important state changes.
**Complexity:** Small

---

## Priority Summary

| # | Suggestion | Impact | Complexity | Category |
|---|-----------|--------|------------|----------|
| 1A | Formal Assessment Mode | **Critical** | Large | Tests/Quizzes |
| 1B | Review Question resubmission improvements | **High** | Medium | Tests/Quizzes |
| 1C | Boss Quiz replayability | **High** | Medium | Tests/Quizzes |
| 2C | Score badges on resource cards | High | Small | UX |
| 5B | Consolidate question types | High | Medium | Code Quality |
| 3C | Lazy-load student tab components | High | Small | Performance |
| 4A | Gradebook / Grade export | **High** | Large | Missing Feature |
| 6A | Keyboard navigation for quizzes | High | Medium | Accessibility |
| 2B | Due date reminders | Medium | Small | UX |
| 3A | Firestore query optimization | Medium | Medium | Performance |
| 6D | Skip navigation link | Medium | Small | Accessibility |
| 6E | Live regions for toasts | Medium | Small | Accessibility |
| 5A | Fix `as never` type assertions | Medium | Small | Code Quality |
| 5D | Error boundary coverage | Medium | Small | Code Quality |
| 3D | Throttle telemetry listeners | Medium | Small | Performance |
| 2A | Student home dashboard | Medium | Medium | UX |
| 2D | Admin bulk operations | Medium | Medium | UX |
| 4C | Student self-assessment | Medium | Small | Missing Feature |
| 4B | Assignment scheduling calendar | Medium | Medium | Missing Feature |
| 5C | Extract magic numbers | Low | Small | Code Quality |
| 5E | useEffect cleanup | Low | Small | Code Quality |
| 6B | Color contrast audit | Medium | Medium | Accessibility |
| 6C | Focus trap consistency | Low | Small | Accessibility |
| 4D | Parent/guardian portal | Low | Large | Missing Feature |

---

## Recommended Implementation Order

**Phase 1 (Quick Wins — 1-2 days each):**
- 2C: Score badges on resource cards
- 3C: Lazy-load student tab components
- 5A: Fix type assertions
- 5D: Add missing error boundaries
- 6D: Skip navigation link
- 6E: Aria-live on toasts

**Phase 2 (Core Quiz/Test Features — 1-2 weeks):**
- 1B: Review Question resubmission improvements
- 1C: Boss Quiz replayability
- 5B: Consolidate question rendering

**Phase 3 (Formal Assessments — 2-3 weeks):**
- 1A: Full Assessment Mode with attempt tracking
- 4A: Gradebook and grade export

**Phase 4 (Polish — ongoing):**
- Remaining UX, performance, and accessibility items
