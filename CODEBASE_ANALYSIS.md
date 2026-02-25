# Porter Portal — Codebase Analysis & Improvement Roadmap

**Date:** 2026-02-25
**Codebase:** ~25,500 lines across 75+ TSX/TS files
**Stack:** React 19, TypeScript, Tailwind CSS 3, Firebase (Firestore, Auth, Functions, Storage), Vite 6

---

## Executive Summary

Porter Portal is an ambitious, feature-rich educational platform with deep RPG-style gamification (items, skill trees, boss encounters, achievements, daily challenges). The codebase is functional but has accumulated technical debt in several areas: performance bottlenecks with large datasets, inconsistent error handling, limited accessibility, and sparse test coverage. The suggestions below are organized by category and prioritized by impact.

---

## 1. UX Improvements

### 1.1 Auto-Save for Lesson Editor *(High Impact — Medium Complexity)*

**Problem:** `LessonBlockEditor.tsx` (1,071 lines) has no auto-save. Teachers creating complex lessons with 20+ block types can lose all work on a browser crash or accidental navigation.

**Suggestion:** Implement debounced auto-save to `localStorage` (with a "Saved X seconds ago" indicator), plus a `beforeunload` warning when there are unsaved changes. Sync to Firestore on an interval (e.g., every 60s) or on explicit save.

**Benefit:** Prevents data loss for the primary content-creation workflow.

---

### 1.2 Drag-and-Drop Block Reordering *(High Impact — Medium Complexity)*

**Problem:** `LessonBlockEditor.tsx` renders drag icons on blocks, but actual drag-and-drop reordering is not implemented. Block reordering requires manual up/down arrows or cut/paste.

**Suggestion:** Wire up `@dnd-kit/core` (already in `package.json`) to enable drag-and-drop reordering of lesson blocks. Add visual drop targets and smooth animations.

**Benefit:** Drastically improves the lesson authoring experience — the most important admin workflow.

---

### 1.3 Student Progress Breadcrumbs in ResourceViewer *(Medium Impact — Small Complexity)*

**Problem:** `ResourceViewer.tsx` shows lesson content across WORK/REVIEW/STUDY tabs but provides no visual breadcrumb of where the student is within a long lesson or how much remains.

**Suggestion:** Add a `LessonProgressSidebar.tsx`-style progress indicator showing completed/in-progress/remaining blocks. Already partially exists but could be surfaced more prominently with a floating progress bar.

**Benefit:** Reduces student confusion and provides a sense of accomplishment on long lessons.

---

### 1.4 Batch Student Actions on Teacher Dashboard *(Medium Impact — Medium Complexity)*

**Problem:** `TeacherDashboard.tsx` shows a student table but only supports one-at-a-time actions (view drawer, mute). Common teacher tasks like "message all flagged students" or "award XP to a section" require repetitive clicks.

**Suggestion:** Add multi-select checkboxes to the student table with batch actions: bulk message, bulk award XP, export selected as CSV.

**Benefit:** Saves significant teacher time with large classes (30+ students per section, multiple sections).

---

### 1.5 Improved Mobile Responsiveness *(Medium Impact — Medium Complexity)*

**Problem:** `Layout.tsx` has a mobile menu toggle, but many inner components (Communications, LessonBlockEditor, TeacherDashboard sortable tables) are designed desktop-first with fixed widths and horizontal scrolling issues.

**Suggestion:** Audit all major views at 375px/768px breakpoints. Key fixes: stack chat channels vertically on mobile, use bottom-sheet patterns for modals instead of centered overlays, make data tables horizontally scrollable with sticky first columns.

**Benefit:** Many students access the portal on phones/tablets. A poor mobile experience directly impacts engagement.

---

### 1.6 Offline-First Evidence Locker *(Medium Impact — Large Complexity)*

**Problem:** `EvidenceLocker.tsx` requires an active connection to upload photos. Students in lab settings may have spotty WiFi, losing evidence photos.

**Suggestion:** Use a Service Worker to queue uploads. Store photos in IndexedDB until connectivity is restored, with a sync indicator showing pending uploads.

**Benefit:** Prevents evidence loss in common classroom scenarios where WiFi is unreliable.

---

## 2. Performance Optimizations

### 2.1 [CRITICAL] Virtualize All Long Lists *(High Impact — Medium Complexity)*

**Problem:** Multiple components load *all* data into memory without pagination or virtualization:
- `Leaderboard.tsx` — subscribes to all students for ranking (line ~43-48)
- `TeacherDashboard.tsx` — loads all students, submissions, alerts with no limits
- `Communications.tsx` — loads entire message history per channel
- `AdminPanel.tsx` — bug report list with no pagination

The app already depends on `@tanstack/react-virtual` but several components don't use it, and those that do (Communications, Leaderboard) have incorrect `estimateSize` values (constant 72px when row heights vary significantly).

**Suggestion:**
1. Add `limit()` to Firestore subscriptions (e.g., last 100 messages, paginate on scroll-up)
2. Apply virtualization to all lists exceeding ~50 items
3. Fix `estimateSize` to use a dynamic function or realistic averages per component

**Benefit:** Prevents browser freezing with 200+ students or 1000+ chat messages. This is the single most important performance fix.

---

### 2.2 [CRITICAL] Parallelize EvidenceLocker PDF Generation *(High Impact — Small Complexity)*

**Problem:** `EvidenceLocker.tsx` (line ~182-217) generates PDFs by fetching images sequentially in a loop. With 5 images per day × 5 days, this creates 25 sequential network requests.

**Suggestion:** Replace the sequential loop with `Promise.all()` to fetch all images in parallel. Also add image compression before base64 conversion to prevent memory blowup.

**Benefit:** Reduces PDF generation time from ~25s to ~5s (5x improvement).

---

### 2.3 Memoize Expensive Derived State *(Medium Impact — Small Complexity)*

**Problem:** Several components compute expensive derived state on every render:
- `TeacherDashboard.tsx` — stats calculations (line ~114-117) run every render
- `IntelDossier.tsx` — `StatBar` component defined inside render, causing recreation each cycle
- `StudentDashboard.tsx` — multiple XP breakdowns, quest filtering, etc. on every render
- `BehaviorQuickAward.tsx` — student list filtered/sliced every render without `useMemo`

**Suggestion:** Wrap all derived calculations in `useMemo` with appropriate dependency arrays. Extract inner component definitions (like `StatBar`) to module scope.

**Benefit:** Reduces unnecessary re-renders, especially on the student dashboard which has 5+ subscriptions updating simultaneously.

---

### 2.4 Add Missing Firestore Composite Indexes *(Medium Impact — Small Complexity)*

**Problem:** `firestore.indexes.json` only defines one index (`notifications` by userId + timestamp). The app queries multiple collections with compound filters that would benefit from indexes:
- `announcements` filtered by `classType` + sorted by `createdAt`
- `class_messages` filtered by `channelId` + sorted by `timestamp`
- `submissions` filtered by `userId` + sorted by `submittedAt`
- `xp_events` filtered by `isActive` + `type`

**Suggestion:** Add composite indexes for common query patterns. Firebase will log index creation links in the console when queries fail, but proactively adding them prevents runtime errors.

**Benefit:** Queries that currently scan entire collections will use indexes, reducing read costs and latency.

---

### 2.5 Lazy-Load Heavy Routes *(Medium Impact — Small Complexity)*

**Problem:** Several heavy components may not be lazily loaded despite the codebase partially supporting `React.lazy()`. Heavy components like `LessonBlockEditor` (1,071 lines), `Communications` (579 lines), and the full XP management suite add to the initial bundle.

**Suggestion:** Ensure all non-critical routes use `React.lazy()` with `Suspense`. The existing `RouteSkeleton.tsx` component can serve as the fallback. Verify all admin-only components are in a separate chunk from student-facing ones.

**Benefit:** Reduces initial JavaScript bundle by ~40-60%, improving Time to Interactive for students on slower connections.

---

### 2.6 Reduce Firebase Subscription Overhead *(Medium Impact — Medium Complexity)*

**Problem:** `StudentDashboard.tsx` creates 5+ simultaneous Firestore `onSnapshot` subscriptions on mount (xp_events, quests, practice_progress, announcements, plus those from App.tsx). Each subscription is a persistent WebSocket connection.

**Suggestion:** Consolidate subscriptions using a shared data layer (e.g., the existing `AppDataContext`). Use `getDoc` for data that doesn't need real-time updates (like announcements that change infrequently). Consider using the Firestore bundle feature for initial data hydration.

**Benefit:** Reduces concurrent WebSocket connections, lowers Firestore read costs, and prevents race conditions between overlapping subscription callbacks.

---

## 3. Missing Features

### 3.1 Grade Book / Assignment Grading *(High Impact — Large Complexity)*

**Problem:** The platform tracks submissions with telemetry metrics and a status enum (FLAGGED/SUCCESS/SUPPORT_NEEDED/NORMAL/STARTED) but has no formal grading system. Teachers cannot assign scores to lesson completions, and students have no grades view.

**Suggestion:** Add:
- A `grade` field to the `Submission` type (numeric 0-100 + optional letter grade)
- A grading interface in `StudentDetailDrawer.tsx` or a dedicated grading page
- A student-facing grades summary with per-assignment and per-unit averages
- CSV/PDF grade export for teacher records

**Benefit:** This is the #1 expected feature for any educational platform. Without it, teachers must maintain a separate grade book, creating friction.

---

### 3.2 Assignment Due Dates & Calendar View *(High Impact — Medium Complexity)*

**Problem:** The `Assignment` type has an optional `dueDate` field and `scheduledAt` for delayed publishing, but there's no student-facing calendar or upcoming-due-dates view. The `CalendarView.tsx` component exists in `components/dashboard/` but appears to be a basic placeholder.

**Suggestion:** Build out the calendar view with:
- Month/week/day views showing assignment due dates
- Color-coded by class type
- Overdue items highlighted
- Integration with the notification system for reminders (24h, 1h before due)

**Benefit:** Helps students manage their workload across multiple classes. Reduces "I didn't know it was due" situations.

---

### 3.3 Search & Filter Across Resources *(Medium Impact — Medium Complexity)*

**Problem:** Students navigate resources only through class > unit > resource hierarchy. There's no global search to find a specific topic, keyword, or previously-viewed resource.

**Suggestion:** Add a search bar to the student dashboard's resources tab. Search should cover assignment titles, descriptions, unit names, and lesson block content. Consider a lightweight client-side search index (e.g., Fuse.js) since the resource count is bounded.

**Benefit:** Students frequently need to revisit specific content for studying. Search is dramatically faster than manual navigation.

---

### 3.4 Student-to-Student Direct Messaging *(Medium Impact — Large Complexity)*

**Problem:** The `Conversation` type and DM infrastructure exist but are admin-to-student only (Firestore rules: "Only admin can create or modify conversation metadata"). Students can only communicate via class/group channels.

**Suggestion:** Enable student-to-student DMs within the same class, with:
- Admin visibility/moderation of all DMs
- Rate limiting to prevent spam
- Ability for admin to disable DMs per student
- Auto-flagging using the existing chat moderation pipeline

**Benefit:** Facilitates peer collaboration and tutoring (complements the existing peer tutoring system).

---

### 3.5 Analytics Dashboard for Teachers *(Medium Impact — Large Complexity)*

**Problem:** `TeacherDashboard.tsx` shows real-time student status but lacks historical analytics. Teachers can't answer questions like "How has engagement trended this semester?" or "Which units have the lowest completion rates?"

**Suggestion:** Add an analytics tab with:
- Engagement trends over time (line chart using `recharts`, already a dependency)
- Completion rates by unit/assignment
- Class-wide XP distribution histogram
- Telemetry bucket distribution over time
- Export to CSV/PDF

**Benefit:** Enables data-driven instruction decisions. The data already exists in Firestore — it just needs aggregation and visualization.

---

### 3.6 Assignment Scheduling & Pacing Guides *(Small Impact — Medium Complexity)*

**Problem:** Assignments have `scheduledAt` for delayed publishing, but there's no pacing guide or curriculum timeline view for teachers to plan the semester.

**Suggestion:** Add a teacher-facing timeline/Gantt view where assignments can be dragged into date slots, with visual indicators for unit boundaries and assessment dates.

**Benefit:** Helps with long-term curriculum planning, especially across multiple sections with different pacing.

---

## 4. Code Quality & Bug Fixes

### 4.1 [CRITICAL] Fix Dynamic Tailwind Class Generation *(High Impact — Small Complexity)*

**Problem:** Multiple components use template literal interpolation for Tailwind classes, which Tailwind's JIT compiler cannot detect:
- `BehaviorQuickAward.tsx` (~line 120): `` bg-${cat.color}-500/5 ``
- `LessonBlockEditor.tsx` (~line 120): `` bg-${cat.color}-500/5 ``

These classes will **never be generated** in the CSS output, resulting in missing backgrounds/colors.

**Suggestion:** Create a color mapping object:
```typescript
const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-500/5 border-blue-500/20 text-blue-400',
  green: 'bg-green-500/5 border-green-500/20 text-green-400',
  // ... all used colors
};
```

**Benefit:** Fixes broken visual styling that's currently invisible in development (if safelist is used) but breaks in production.

---

### 4.2 [CRITICAL] Fix Memory Leak in TeacherDashboard *(High Impact — Small Complexity)*

**Problem:** `TeacherDashboard.tsx` (~line 58) sets up a `setInterval` to update `now` every 60 seconds but the cleanup function may not properly clear it on unmount, leading to memory leaks and state updates on unmounted components.

**Suggestion:** Ensure the interval is properly cleared in the useEffect cleanup. Verify the interval ID is captured in a ref or directly in the cleanup closure.

**Benefit:** Prevents "Can't perform a React state update on an unmounted component" warnings and memory leaks during long sessions.

---

### 4.3 Fix INTERACTIVE_TYPES in LessonBlocks.tsx *(Medium Impact — Small Complexity)*

**Problem:** `LessonBlocks.tsx` (~line 24) defines `INTERACTIVE_TYPES` for tracking block completion, but it's missing several interactive block types: `VOCAB_LIST`, `ACTIVITY`, `BAR_CHART`, `DATA_TABLE`. This means completion tracking is broken for these block types — students can't get credit for completing them.

**Suggestion:** Add all interactive block types to the set:
```typescript
const INTERACTIVE_TYPES = new Set([
  'MC', 'SHORT_ANSWER', 'VOCABULARY', 'CHECKLIST', 'SORTING',
  'RANKING', 'VOCAB_LIST', 'ACTIVITY', 'BAR_CHART', 'DATA_TABLE'
]);
```

**Benefit:** Fixes broken completion tracking that directly impacts student XP and progress.

---

### 4.4 Fix Eraser Tool in AnnotationOverlay *(Medium Impact — Small Complexity)*

**Problem:** `AnnotationOverlay.tsx` (~line 120) sets `globalCompositeOperation = 'destination-out'` for the eraser tool but doesn't properly reset it to `'source-over'` for subsequent pen strokes. This can cause visual artifacts when switching between pen and eraser.

**Suggestion:** Reset `globalCompositeOperation` to `'source-over'` at the start of each new stroke, or when switching tools.

**Benefit:** Fixes a user-visible drawing bug in the annotation tool.

---

### 4.5 Add Comprehensive Error Handling *(Medium Impact — Medium Complexity)*

**Problem:** The codebase has pervasive silent error swallowing:
- `StudentDashboard.tsx` (~line 88-106): multiple `try-catch` blocks with empty catch or `console.error` only
- `BugReporter.tsx` (~line 35): catch block succeeds silently — user thinks bug was submitted even when it fails
- `ResourceViewer.tsx` (~line 44-50): `getDoc().catch()` silently drops errors
- `dataService.ts`: inconsistent patterns — some methods throw, some swallow with console.error
- No error tracking service (Sentry, LogRocket, etc.)

**Suggestion:**
1. Add a centralized error reporting utility that logs to console in dev and to an error tracking service in production
2. Replace silent catches with user-visible error toasts (the `ToastProvider` already exists)
3. Add retry logic for transient Firestore errors

**Benefit:** Reduces time-to-diagnose for production issues and prevents users from believing actions succeeded when they failed.

---

### 4.6 Add Type Guards for Firestore Data *(Medium Impact — Medium Complexity)*

**Problem:** `App.tsx` merges Firestore snapshot data directly into component state without type validation. If the Firestore document structure changes (e.g., a field is renamed or removed), the app will crash with unhelpful runtime errors. `dataService.ts` also has 30+ uses of `any`.

**Suggestion:** Create type guard functions for critical types (`User`, `Assignment`, `Submission`) that validate shape at the boundary. Use Zod or a lightweight validator at Firestore read points.

**Benefit:** Catches data shape mismatches early with clear error messages instead of cryptic "cannot read property of undefined" errors deep in the component tree.

---

### 4.7 Fix guardedSnapshot Permanent Denial Cache *(Medium Impact — Small Complexity)*

**Problem:** `dataService.ts` uses a `_deniedCollections` set to permanently skip collections after a permission-denied error. Once a collection is denied, it's never retried — even after the user's permissions are fixed (e.g., after being whitelisted).

**Suggestion:** Add a TTL to the denial cache (e.g., retry after 5 minutes) or clear it on auth state changes.

**Benefit:** Prevents students from getting permanently locked out of data until they hard-refresh.

---

### 4.8 Decompose Large Components *(Low Impact — Medium Complexity)*

**Problem:** Several components are monolithic:
- `LessonBlockEditor.tsx` — 1,071 lines
- `UserManagement.tsx` — 904 lines
- `LessonBlocks.tsx` — 870 lines
- `QuestionBankManager.tsx` — 790 lines
- `AdminPanel.tsx` — 709 lines
- `dataService.ts` — 1,625 lines with ~100 methods

**Suggestion:** Extract logical sub-sections into smaller components/modules. For example, `LessonBlockEditor` could have separate files for the block palette, individual block editors, and the block list. Split `dataService.ts` by domain (users, assignments, messaging, gamification).

**Benefit:** Improves code navigability, reduces merge conflicts, and enables more granular code review.

---

### 4.9 Expand Test Coverage *(Low Impact — Large Complexity)*

**Problem:** Only 4 test files exist, all in `lib/__tests__/`, covering only pure utility functions (achievements, gamification, runewords, telemetry). Zero component tests. Zero integration tests.

**Suggestion:** Prioritize tests for:
1. **Cloud Function callables** — mock Firebase and test XP award, quest resolution, item crafting logic
2. **Critical user flows** — login, submission, lesson completion (using React Testing Library)
3. **Data transformations** — Firestore snapshot → component state mappers

**Benefit:** Reduces regression risk, especially for the gamification economy where bugs can grant or remove student XP/items.

---

## 5. Accessibility Improvements

### 5.1 Add ARIA Labels to Interactive Components *(High Impact — Medium Complexity)*

**Problem:** Most interactive elements lack proper ARIA attributes:
- `Communications.tsx`: Message list missing `role="log"` and `aria-live="polite"` for screen reader announcements of new messages
- `TeacherDashboard.tsx`: Sortable table headers need `aria-sort` attribute and `role="columnheader"`
- `Leaderboard.tsx`: Ranking list needs `role="list"` and meaningful item labels
- `LessonBlocks.tsx`: Interactive blocks (MC, sorting, ranking) need `role="radiogroup"`, `aria-required`, etc.
- All modals: Most are missing `aria-describedby` (only `ConfirmDialog` has proper ARIA)

**Suggestion:** Install `eslint-plugin-jsx-a11y` and audit all components. Add proper roles, labels, and live regions. Start with the student-facing components (ResourceViewer, LessonBlocks, Communications, StudentDashboard).

**Benefit:** Required for educational platforms that may need to comply with Section 508 or WCAG 2.1 Level AA. Also improves usability for all students.

---

### 5.2 Implement Keyboard Navigation *(High Impact — Medium Complexity)*

**Problem:**
- `Communications.tsx`: Emoji picker, reaction buttons, and channel list are mouse-only
- `Layout.tsx`: Sidebar navigation cannot be traversed with Tab/Arrow keys
- `LessonBlockEditor.tsx`: Block operations (move, delete, configure) require mouse clicks
- `Leaderboard.tsx`: No keyboard focus management for the player inspect modal

**Suggestion:** Add `tabIndex`, `onKeyDown` handlers, and focus management:
- Arrow key navigation for lists (sidebar, channels, blocks)
- Enter/Space to activate buttons and toggles
- Escape to close modals (partially implemented in `ConfirmDialog` — extend to all modals)
- Focus trapping in modals and drawers

**Benefit:** Makes the platform usable for students who rely on keyboard navigation (motor disabilities, power users, assistive technology).

---

### 5.3 Fix Color Contrast and Font Sizes *(Medium Impact — Small Complexity)*

**Problem:** The app uses a dark sci-fi theme with many low-contrast color combinations:
- Disabled input text in `Communications.tsx` (~line 567)
- Muted status text in `TeacherDashboard.tsx`
- Placeholder text across many form fields
- Extensive tiny font sizes: `text-[9px]`, `text-[10px]` throughout — below WCAG AA minimum of 12px
- Several text-on-dark-background combinations likely fail WCAG AA (4.5:1 ratio)

**Suggestion:** Audit all text colors against their backgrounds using a contrast checker. Increase minimum font size to 12px for body text. Increase opacity/lightness of gray text for disabled states and placeholders.

**Benefit:** Improves readability for all users, especially in classroom settings with projectors or bright ambient lighting.

---

### 5.4 Add Focus Management for Modals and Drawers *(Medium Impact — Small Complexity)*

**Problem:** When modals open (e.g., `BehaviorQuickAward`, `InspectInventoryModal`, `PlayerInspectModal`), focus doesn't move to the modal, and when they close, focus doesn't return to the trigger element. This breaks the screen reader and keyboard navigation experience.

**Suggestion:** Implement a `useFocusTrap` hook that:
1. Moves focus to the first focusable element in the modal on open
2. Traps Tab/Shift+Tab within the modal
3. Returns focus to the trigger element on close

The existing `Modal.tsx` component should get this behavior built in so all 15+ modal components inherit it.

**Benefit:** Eliminates focus-loss confusion for keyboard/screen reader users.

---

### 5.5 Add Skip Navigation and Semantic HTML *(Low Impact — Small Complexity)*

**Problem:** The app has a persistent sidebar navigation. Keyboard users must Tab through every nav item before reaching the main content area on each page load. Additionally, components use generic `<div>` elements where semantic HTML (`<nav>`, `<main>`, `<section>`, `<article>`) would improve screen reader navigation.

**Suggestion:** Add a visually-hidden "Skip to main content" link as the first focusable element in `Layout.tsx`. Replace generic `<div>` wrappers with semantic elements where appropriate.

**Benefit:** Standard accessibility requirement, simple to implement, significantly improves keyboard and screen reader navigation.

---

## 6. Security Considerations

### 6.1 Sanitize Chat Messages *(High Impact — Small Complexity)*

**Problem:** `Communications.tsx` renders chat message content that could contain user-crafted HTML/script. While React's JSX escapes by default, if `dangerouslySetInnerHTML` is used anywhere in the message rendering pipeline (e.g., for rich text or markdown), XSS is possible. The `@types/dompurify` is in package.json but `dompurify` itself is not in dependencies — suggesting sanitization may be incomplete.

**Suggestion:** Audit all message/content rendering paths. Add `dompurify` to dependencies and apply it before any raw HTML rendering. Consider a Content Security Policy header.

**Benefit:** Prevents XSS attacks through chat, comments, and user-generated content.

---

### 6.2 Harden Enrollment Code Redemption *(Medium Impact — Small Complexity)*

**Problem:** `enrollment_codes` Firestore rules allow any authenticated user to update a code document (for incrementing `usedCount`). A malicious student could modify other fields on the enrollment code document (e.g., `maxUses`, `isActive`, `classType`).

**Suggestion:** Restrict the student update rule to only allow `usedCount` changes:
```
allow update: if isAuthenticated()
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['usedCount']);
```

**Benefit:** Prevents enrollment code manipulation.

---

### 6.3 Restrict Cross-Class Message Visibility *(Medium Impact — Medium Complexity)*

**Problem:** `class_messages` Firestore rules allow any authenticated user to read all messages (`allow read: if isAuthenticated()`). This means a student enrolled in AP Physics can read Forensic Science chat messages.

**Suggestion:** Add class enrollment verification to the read rule, or filter by `channelId` matching the student's enrolled classes.

**Benefit:** Enforces proper data isolation between classes.

---

### 6.4 Rate-Limit Client-Side Actions *(Medium Impact — Medium Complexity)*

**Problem:** No client-side rate limiting on:
- Chat message sending
- Bug report submission
- Behavior award granting
- Fortune wheel spins (server-side may limit, but client doesn't throttle)

**Suggestion:** Add debouncing/throttling to rapid-fire actions. For critical economy actions (XP awards, loot), ensure the Cloud Functions enforce server-side rate limits regardless of client behavior.

**Benefit:** Prevents abuse and reduces Firestore write costs from rapid duplicate submissions.

---

## Priority Ranking Summary

| Priority | Item | Category | Complexity | Impact |
|----------|------|----------|------------|--------|
| **P0** | 2.1 Virtualize long lists | Performance | Medium | Critical |
| **P0** | 4.1 Fix Tailwind dynamic classes | Bug Fix | Small | Critical |
| **P0** | 4.3 Fix INTERACTIVE_TYPES | Bug Fix | Small | Critical |
| **P1** | 2.2 Parallelize PDF generation | Performance | Small | High |
| **P1** | 4.2 Fix TeacherDashboard interval leak | Bug Fix | Small | High |
| **P1** | 1.1 Auto-save lesson editor | UX | Medium | High |
| **P1** | 5.1 Add ARIA labels | Accessibility | Medium | High |
| **P1** | 6.1 Sanitize chat messages | Security | Small | High |
| **P2** | 3.1 Grade book | Feature | Large | High |
| **P2** | 2.3 Memoize derived state | Performance | Small | Medium |
| **P2** | 2.5 Lazy-load routes | Performance | Small | Medium |
| **P2** | 1.2 Drag-and-drop blocks | UX | Medium | High |
| **P2** | 5.2 Keyboard navigation | Accessibility | Medium | High |
| **P2** | 6.2 Harden enrollment codes | Security | Small | Medium |
| **P3** | 3.2 Calendar view | Feature | Medium | High |
| **P3** | 3.3 Resource search | Feature | Medium | Medium |
| **P3** | 2.4 Firestore indexes | Performance | Small | Medium |
| **P3** | 4.5 Error handling | Code Quality | Medium | Medium |
| **P3** | 5.3 Color contrast & fonts | Accessibility | Small | Medium |
| **P3** | 5.4 Focus management | Accessibility | Small | Medium |
| **P3** | 6.3 Cross-class message isolation | Security | Medium | Medium |
| **P4** | 3.5 Analytics dashboard | Feature | Large | Medium |
| **P4** | 1.4 Batch student actions | UX | Medium | Medium |
| **P4** | 4.6 Type guards | Code Quality | Medium | Medium |
| **P4** | 4.7 Fix guardedSnapshot cache | Code Quality | Small | Medium |
| **P4** | 4.8 Decompose components | Code Quality | Medium | Low |
| **P4** | 4.9 Expand tests | Code Quality | Large | Low |
| **P4** | 1.5 Mobile responsiveness | UX | Medium | Medium |
| **P5** | 3.4 Student DMs | Feature | Large | Medium |
| **P5** | 3.6 Pacing guides | Feature | Medium | Small |
| **P5** | 1.6 Offline evidence locker | UX | Large | Medium |
| **P5** | 5.5 Skip navigation | Accessibility | Small | Low |
| **P5** | 6.4 Rate limiting | Security | Medium | Medium |
| **P5** | 2.6 Reduce subscriptions | Performance | Medium | Medium |

---

## Quick Wins (< 1 hour each)

1. **Fix `INTERACTIVE_TYPES`** in `LessonBlocks.tsx` — add missing block types
2. **Fix dynamic Tailwind classes** — create color mapping objects in BehaviorQuickAward + LessonBlockEditor
3. **Add `aria-live="polite"`** to chat message list in Communications.tsx
4. **Add `aria-sort`** to TeacherDashboard sortable table headers
5. **Fix `setInterval` cleanup** in TeacherDashboard useEffect
6. **Add `beforeunload` handler** to LessonEditorPage for unsaved changes
7. **Parallelize image fetching** in EvidenceLocker with `Promise.all()`
8. **Add composite indexes** to `firestore.indexes.json` for common queries
9. **Restrict enrollment code update rule** in `firestore.rules` to `usedCount` only
10. **Add `dompurify`** to dependencies (types already present, library missing)
