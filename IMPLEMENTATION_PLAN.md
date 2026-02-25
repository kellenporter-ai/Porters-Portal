# Implementation Plan — Porter Portal Improvements

**Strategy:** Group all changes to each file into a single phase so we never revisit a file. Phases are ordered so that foundational work (utilities, services) happens before component work that depends on it.

**Excluded:** 3.1 (Grade Book)

---

## Phase 1: Foundation — New Utilities, Config & Standalone Fixes

*Creates all new utility files and makes config/rules changes that later phases depend on. No major component rewrites.*

| Item | File | Change |
|------|------|--------|
| 4.5 | **NEW `lib/errorReporting.ts`** | Centralized error utility (logs to console in dev, supports future Sentry integration); exports `reportError()` and `withErrorToast()` |
| 5.4 | **NEW `lib/useFocusTrap.ts`** | Focus trap hook: moves focus on open, traps Tab/Shift+Tab, restores focus on close |
| 6.4 | **NEW `lib/rateLimiting.ts`** | Exports `useThrottle()` and `useDebounce()` hooks for rapid-fire protection |
| 2.4 | **`firestore.indexes.json`** | Add 4 composite indexes: announcements (classType+createdAt), class_messages (channelId+timestamp), submissions (userId+submittedAt), xp_events (isActive+type) |
| 6.2 | **`firestore.rules`** | Restrict enrollment_codes update to `usedCount` only |
| 6.3 | **`firestore.rules`** | Restrict class_messages read to enrolled classes (or channelId matching) |
| 6.1 | **`package.json`** | Add `dompurify` dependency (types already present) |
| 4.4 | **`components/AnnotationOverlay.tsx`** | Fix eraser tool: reset `globalCompositeOperation` to `source-over` on new strokes |

**Files touched:** 6 (3 new, 3 existing — none revisited later)

---

## Phase 2: Service Layer — dataService.ts, types.ts, App.tsx

*All changes to the data layer in one pass. These are the most-touched backend files.*

| Item | File | Change |
|------|------|--------|
| 4.7 | **`services/dataService.ts`** | Replace `_deniedCollections` Set with Map\<string, timestamp\>; add 5-min TTL; clear on auth change |
| 4.5 | **`services/dataService.ts`** | Standardize error handling: all subscription errors call `reportError()`; all mutating methods throw consistently |
| 2.1 | **`services/dataService.ts`** | Add optional `limit` parameter to `subscribeToUsers`, `subscribeToSubmissions`, `subscribeToChannelMessages`, `subscribeToLeaderboard` |
| 4.6 | **`types.ts`** | Add type guard functions for `User`, `Assignment`, `Submission` (validate shape at Firestore boundaries) |
| 4.6 | **`App.tsx`** | Apply type guards to user profile snapshot merging |
| 2.5 | **`App.tsx`** | Verify/add `React.lazy()` for all heavy route components; ensure `Suspense` + `RouteSkeleton` fallbacks |

**Files touched:** 3 (none revisited later except App.tsx gets a minor subscription-context tweak in Phase 5)

---

## Phase 3: Communications.tsx — All Changes in One Pass

*The 2nd most-touched component file. Every change lands here at once.*

| Item | Change |
|------|--------|
| 2.1 | Add `limit(100)` to message subscription; implement scroll-up pagination for history; fix virtualizer `estimateSize` to dynamic function |
| 5.1 | Add `role="log"` and `aria-live="polite"` to message list; add `aria-label` to channel buttons |
| 5.2 | Add keyboard navigation: Up/Down for channels, Enter to select, Escape to close emoji picker; add `onKeyDown` to reaction buttons |
| 5.3 | Fix disabled input text contrast; increase muted-text opacity throughout |
| 6.1 | Import `dompurify`; sanitize message `content` before any raw-HTML rendering |
| 6.4 | Wrap `sendMessage` in throttle (1 message per 2 seconds) using `useThrottle` from Phase 1 |

**Files touched:** 1

---

## Phase 4: TeacherDashboard.tsx — All Changes in One Pass

*The most-touched admin component.*

| Item | Change |
|------|--------|
| 4.2 | Fix `setInterval` cleanup: verify interval ID is captured and cleared in useEffect cleanup |
| 2.1 | Apply virtualization to student list; use `limit()` on subscriptions from Phase 2; fix estimateSize |
| 2.3 | Wrap stats calculations, `alertsByStudent`, and `bucketsByStudent` in `useMemo` with correct deps |
| 5.1 | Add `aria-sort` to sortable table headers; add `role="columnheader"` |
| 5.3 | Fix muted status text contrast; ensure all text ≥ 12px |
| 1.4 | Add multi-select checkboxes to student table; add batch action bar (bulk message, bulk XP, CSV export) |

**Files touched:** 1

---

## Phase 5: Student Experience — Dashboard, Context, Small Components

*All changes to the student data flow and smaller components in one pass.*

| Item | File | Change |
|------|------|--------|
| 2.3 | **`components/StudentDashboard.tsx`** | Wrap XP breakdowns, quest filtering, active event calculation in `useMemo` |
| 2.6 | **`components/StudentDashboard.tsx`** | Replace direct `dataService` subscriptions with AppDataContext where applicable; coordinate async operations |
| 4.5 | **`components/StudentDashboard.tsx`** | Replace silent `try-catch` blocks (lines ~88-106) with `toast.error()` using `withErrorToast` from Phase 1 |
| 2.6 | **`lib/AppDataContext.tsx`** | Extend to provide `xpEvents`, `quests`, and consolidate shared subscriptions |
| 4.1 | **`components/BehaviorQuickAward.tsx`** | Create `COLOR_MAP` object; replace dynamic template literals with static class lookups |
| 6.4 | **`components/BehaviorQuickAward.tsx`** | Add debounce to award button using `useThrottle` from Phase 1 |
| 4.5 | **`components/BugReporter.tsx`** | Add proper error feedback (toast on failure instead of silent catch) |
| 6.4 | **`components/BugReporter.tsx`** | Add submission cooldown (disable button for 5 seconds after submit) |
| 6.4 | **`components/xp/FortuneWheel.tsx`** | Add throttle to spin action |
| 4.5 | **`components/GoogleLogin.tsx`** | Sanitize error messages before display (strip Firebase config details) |
| 2.3 | **`components/IntelDossier.tsx`** | Extract `StatBar` to module scope; verify all derived state in `useMemo` |

**Files touched:** 7 (none revisited later)

---

## Phase 6: Lesson System — Blocks, Editor, Editor Page

*All lesson-related components in one pass.*

| Item | File | Change |
|------|------|--------|
| 4.3 | **`components/LessonBlocks.tsx`** | Add `VOCAB_LIST`, `ACTIVITY`, `BAR_CHART`, `DATA_TABLE` to `INTERACTIVE_TYPES` |
| 5.1 | **`components/LessonBlocks.tsx`** | Add ARIA: `role="radiogroup"` on MC, `role="checkbox"` on checklist items, labels on interactive blocks |
| 4.1 | **`components/LessonBlockEditor.tsx`** | Create `COLOR_MAP` object; replace dynamic Tailwind template literals |
| 1.2 | **`components/LessonBlockEditor.tsx`** | Wire up `@dnd-kit/core` for drag-and-drop block reordering with visual drop targets |
| 5.2 | **`components/LessonBlockEditor.tsx`** | Add keyboard shortcuts: Delete to remove block, Ctrl+Up/Down to reorder |
| 1.1 | **`components/LessonEditorPage.tsx`** | Add debounced auto-save to localStorage; add "Last saved" indicator; add `beforeunload` warning for unsaved changes |

**Files touched:** 3 (none revisited later)

---

## Phase 7: Layout, Modal, Remaining Components

*All remaining component changes that haven't been touched yet.*

| Item | File | Change |
|------|------|--------|
| 5.5 | **`components/Layout.tsx`** | Add visually-hidden "Skip to main content" link; replace `<div>` wrappers with `<nav>`, `<main>`, `<section>` |
| 5.2 | **`components/Layout.tsx`** | Add Arrow key navigation for sidebar; add `aria-expanded` to collapsible sections; add `aria-current` to active nav |
| 5.4 | **`components/Modal.tsx`** | Integrate `useFocusTrap` from Phase 1 (all 15+ modal components inherit it automatically) |
| 2.1 | **`components/Leaderboard.tsx`** | Add `limit()` to Firestore query; fix virtualizer `estimateSize` to dynamic function |
| 5.1 | **`components/Leaderboard.tsx`** | Add `role="list"`, meaningful `aria-label` to ranking items |
| 5.2 | **`components/Leaderboard.tsx`** | Add keyboard focus management for player inspect modal |
| 2.2 | **`components/EvidenceLocker.tsx`** | Replace sequential image fetch loop with `Promise.all()`; add image compression |
| 1.3 | **`components/ResourceViewer.tsx`** | Surface floating progress bar showing completed/remaining blocks |
| 4.5 | **`components/ResourceViewer.tsx`** | Wrap `getDoc` calls with error toast |

**Files touched:** 5 (none revisited later)

---

## Phase 8: New Features — Calendar, Search, Analytics

*Build out new feature components. Minimal edits to existing files.*

| Item | File | Change |
|------|------|--------|
| 3.2 | **`components/dashboard/CalendarView.tsx`** | Build full month/week view with due dates, color-coded by class, overdue highlighting |
| 3.3 | **`components/dashboard/ResourcesTab.tsx`** | Add search bar with client-side fuzzy search (Fuse.js or simple filter) across titles, descriptions, unit names |
| 3.5 | **NEW `components/dashboard/AnalyticsTab.tsx`** | Engagement trends (recharts line chart), completion rates by unit, XP distribution histogram, telemetry bucket breakdown |
| 3.5 | **`components/TeacherDashboard.tsx`** | — EXCEPTION: Add Analytics tab routing. This is the one file touched twice (Phase 4 + Phase 8). It's a 1-line addition to the tab list, acceptable tradeoff vs. building analytics first without the perf/a11y fixes. |

**Files touched:** 3 (1 existing + 1 new + 1 re-touched with 1-line add)

---

## Items Deferred to Backlog

These are lower-priority and would require significant work with diminishing returns:

| Item | Reason |
|------|--------|
| 1.5 Mobile responsiveness | Spread across every component; better done as a dedicated responsive audit pass |
| 1.6 Offline evidence locker | Requires Service Worker infrastructure (large complexity, medium impact) |
| 3.4 Student-to-student DMs | Large feature with security implications; needs its own design doc |
| 3.6 Pacing guides | Nice-to-have; low impact |
| 4.8 Decompose large components | Low impact; doing it mid-stream would invalidate all file-grouping plans |
| 4.9 Expand tests | Large scope; can be done incrementally after all other changes land |
| 2.6 Full subscription consolidation | Partially addressed in Phase 5; full overhaul is a separate refactor |

---

## Summary

| Phase | Focus | Files Touched | Key Deliverables |
|-------|-------|---------------|------------------|
| **1** | Foundation | 6 (3 new) | Utilities, config, rules, standalone fixes |
| **2** | Service layer | 3 | dataService hardening, type guards, lazy routes |
| **3** | Communications | 1 | Virtualized, accessible, secure chat |
| **4** | TeacherDashboard | 1 | Performant, accessible admin view with batch actions |
| **5** | Student experience | 7 | Memoized dashboard, fixed small components |
| **6** | Lesson system | 3 | Completion tracking fix, drag-drop, auto-save |
| **7** | Remaining components | 5 | Layout a11y, modal focus, leaderboard perf, PDF fix |
| **8** | New features | 3 | Calendar, search, analytics |

**Total: 8 phases, ~29 files touched, only 1 file revisited (TeacherDashboard — 1-line tab addition in Phase 8)**
