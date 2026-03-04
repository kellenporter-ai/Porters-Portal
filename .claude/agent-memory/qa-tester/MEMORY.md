# QA Tester Agent Memory

## Project Architecture
- **Stack:** React + TypeScript + Firebase Firestore + Tailwind CSS
- **Key files:** `types.ts` (interfaces), `services/dataService.ts` (Firestore CRUD), `components/dashboard/ResourcesTab.tsx` (student UI), `components/lesson-editor/ResourceSidebar.tsx` (admin UI), `components/StudentDashboard.tsx` (parent dashboard)
- **Student path:** Chromebook + Chrome browser. Admin path: any browser.

## Known Patterns & Anti-Patterns

### Null Date Handling in Sort Comparators
- Null/missing `createdAt` is represented as `getTime() === 0` (epoch, year 1970).
- **Newest sort (dateB - dateA):** nulls (0) produce large positive → they sink. CORRECT.
- **Oldest sort (dateA - dateB):** nulls (0) produce large negative → they FLOAT TO TOP. BUG PATTERN.
- Always handle null dates explicitly in both ascending and descending sort directions.
- See: `ResourcesTab.tsx` `sortItems()` — 'oldest' case has this bug.

### "By Type" Subheader vs Badge Label Mismatch
- `isLessonOnly` resources display badge label `'Lesson'` but their `resource.category` is the real stored value (or undefined → `'Supplemental'`).
- The 'By Type' subheader uses `resource.category || 'Supplemental'`, not the badge label logic.
- This causes lesson-only items to appear under a `Supplemental` subheader while showing a `Lesson` badge.
- Fix: subheader computation should mirror badge label: `isLessonOnly ? 'Lesson' : resource.category || 'Supplemental'`.

### addAssignment Firestore Write Pattern
- Uses `setDoc(..., { merge: true })` on updates — preserves fields not in the write object (safe for `isAssessment`, `assessmentConfig`, `createdAt`).
- `createdAt` is only written on new documents (no `assignment.id`). Updates do NOT overwrite it. CORRECT.
- `updatedAt` is written on every save (new and update). CORRECT.
- `updateAssignmentStatus()` does NOT write `updatedAt` — minor pre-existing inconsistency.

### Sidebar Width Constraint (w-80 = 320px)
- ResourceSidebar has many badge pills per row: NEW + compactDate + block count + html + draft + arch + scheduled icon.
- Worst case ~7 badges (~200px) leaves only ~70px for title (truncate flex-1). Title still shows 3-5 chars.
- Not an overflow/wrap bug — Tailwind `truncate` prevents overflow. But title legibility degrades.

### Double Sort (StudentDashboard + ResourcesTab)
- `StudentDashboard.unitGroups` useMemo pre-sorts items newest-first within each unit.
- `ResourcesTab` default `sortBy='newest'` re-sorts the same data identically.
- Harmless but wastes ~N comparisons per render. Small arrays (10-40 resources per unit), acceptable.

## Testing Checklist for Assignment-Related Changes
- [ ] Null `createdAt` graceful handling in all sort directions (not just newest)
- [ ] Badge label vs subheader label consistency in 'By Type' mode
- [ ] `isAssessment`/`assessmentConfig` preservation after re-save (merge:true is safe)
- [ ] `formatRelativeDate` / `formatCompactDate` only called on truthy strings (both files guard correctly)
- [ ] Sidebar w-80 badge overflow with realistic worst-case badge combinations

## Assessment Score & Section Filter Patterns (added 2026-03-03)

### getEffectiveScore
Defined INLINE inside TeacherDashboard IIFE (line ~305). Not exported.
Priority: `rubricGrade?.overallPercentage ?? assessmentScore?.percentage ?? score ?? 0`.
`??` (nullish coalescing) correctly propagates score=0 (all-Missing rubric). 0 is NOT skipped.

### Stats Cards — Section Filter Inconsistency (BUG)
- avgScore / flaggedCount / totalSubmissions: use `sectionFilteredSubs` — section-aware. CORRECT.
- "Students" stat card: uses `allStudentGroups.length` (computed from `sectionFilteredSubs`) — CORRECT.
- "Graded" stat card: `gradedCount` / `allStudentGroups.length` — both from `sectionFilteredSubs` — CORRECT.
- All stats are section-filtered. No bug here.

### Section Filter Reset
Resets to `''` when assessment selector changes (line ~419 `onChange`). CORRECT.
Dropdown only renders when `availableSections.length > 1`. CORRECT.

### saveRubricGrade Dual-Write
`saveRubricGrade` in `dataService.ts` line ~987 atomically writes `rubricGrade` + `score: rubricGrade.overallPercentage`. CORRECT.

### Cloud Function Section Lookup vs getUserSectionForClass
Both use identical logic: `classSections?.[classType]` first, then legacy `section` field with class enrollment check. MATCH.

### Submission Mapping
Both `subscribeToSubmissions` and `subscribeToUserSubmissions` map `userSection: data.userSection || undefined`. CORRECT.

### Backward Compat for Old Submissions
`getSubmissionSection()` in TeacherDashboard falls back to `users.find(u => u.id === s.userId)` when `s.userSection` is absent.
Edge case: if user not in `users` prop array, section is `undefined` — submission is excluded from section-specific stats.

## AI Flag / Auto Flag Visual Differentiation (added 2026-03-03)

### unflagSubmissionAsAI Score Not Restored (MAJOR BUG — open)
- `unflagSubmissionAsAI` only clears `flaggedAsAI / flaggedAsAIBy / flaggedAsAIAt`.
- Does NOT restore `status`, `score`, or `assessmentScore.percentage`.
- After unflagging: score stays 0, status stays 'FLAGGED', student still sees 0%.
- Fix: unflag must also restore original score/status, or at minimum clear status back to prior value.

### Notification Icon Color Mismatch (MINOR BUG — open)
- `AI_FLAGGED` entry in `NotificationBell ICON_MAP` uses `text-red-400`.
- All other AI flag UI uses purple (`text-purple-400`, `bg-purple-*`).
- Fix: change to `text-purple-400` for color consistency.

### avgScore Double-Counts AI-Flagged Submissions (MINOR BUG — open)
- `getEffectiveScore` returns `rubricGrade?.overallPercentage ?? assessmentScore?.percentage ?? score ?? 0`.
- AI-flagged submissions have `score: 0` written to Firestore. `getEffectiveScore` returns 0 for them.
- Those 0s are included in `avgScore` calculation, dragging down the average.
- A teacher who flags one cheater artificially deflates the class average stat.
- Fix: exclude `s.flaggedAsAI` submissions from avgScore (same way STARTED are excluded).

### Stats Card Grid Layout Bug (MINOR BUG — open)
- Summary stats grid is always `grid-cols-2 md:grid-cols-3` (no rubric) or `grid-cols-2 md:grid-cols-4` (rubric).
- Now there are always 4 cards minimum (avg, students, auto-flagged, AI-flagged).
- Without rubric: 4 cards in `md:grid-cols-3` → last card wraps to a new row alone on desktop.
- Fix: base breakpoint should be `md:grid-cols-4` regardless of rubric; rubric card makes it 5.

### getStatusLabel Falls Through for Non-FLAGGED, Non-AI Statuses
- `getStatusLabel` returns raw `status` string (e.g. 'SUCCESS', 'SUPPORT_NEEDED') for non-flagged.
- These are internal enum values — shown verbatim in the badge. Pre-existing cosmetic issue, not new.

### Banner Shown During Active Assessment (WARNING)
- `existingSubmission` query fetches the student's latest submission.
- If a student previously had a submission flagged, resubmitted, and a new submission exists, `existingSubmission` is the LATEST (due to `limit(1)` with no orderBy). If the latest is not flagged, banner correctly hides.
- BUT: `limit(1)` with no `orderBy` — Firestore returns in insertion order (not attempt number order). If the unflagged resubmission is doc 2, `limit(1)` may return doc 1 (the flagged one). Banner could show incorrectly after resubmit.
- Fix: add `orderBy('attemptNumber', 'desc')` or `orderBy('submittedAt', 'desc')` before the `limit(1)`.

## Assessment Resubmission UX Patterns (added 2026-03-03)

### attemptsRemaining vs. handleRetake confirm dialog — off-by-one
- Modal `attemptsRemaining = maxAttempts - attemptNumber` (remaining BEFORE retake).
- Button label and retake info panel correctly show this as "X left" (attempts you still have).
- `handleRetake` confirm dialog says "You have X attempts remaining **after this**" using the same formula.
- But "after this" implies post-retake count, which would be X-1. The dialog overstates by 1.
- Fix: change dialog to `attLeft - 1` OR rephrase to "You have X attempts remaining (including this one)."

### FLAGGED status hidden when showScoreOnSubmit === false
- The FLAGGED amber banner (ResourceViewer line 331) is inside the `showScore &&` block.
- If `showScoreOnSubmit: false`, a FLAGGED student sees no flagged warning in the results modal.
- They only see "Assessment Submitted" + checkmark + "teacher will review" — no mention of flag.
- Fix: move FLAGGED banner outside the `showScore &&` guard, or duplicate it in the hidden-score path.

### `needsReview` missing from Cloud Function return type
- `dataService.submitAssessment` return type declares `perBlock: Record<string, { correct: boolean; answer: unknown }>` — no `needsReview`.
- The results modal checks `result.needsReview` (mapped as `isPending`) right after submit.
- `isPending` will always be falsy on first render; "Pending Review" / Clock icon never shown immediately.
- Only shows after `existingSubmission` Firestore listener updates, which has a brief latency.
- Fix: add `needsReview?: boolean` to the `submitAssessment` return type declaration (and ensure Cloud Function returns it).

### "No retakes left" badge not shown when allowResubmission === false
- ResourcesTab line 234: `!canStillRetake && assessmentConfig.allowResubmission !== false && !isUnlimitedAttempts`.
- If `allowResubmission === false`, no badge appears for the retake column — student just sees score + attempts.
- Acceptable UX gap (no retakes ever allowed), but student has no explicit "Retakes not allowed" indicator.

### Dead code in results modal Exit button className
- ResourceViewer line 425: `${!canRetake ? '' : ''}` — both branches return empty string. No-op.
- Indicates incomplete conditional styling that was never finished.

### assessmentSubs filter requires isAssessment field
- ResourcesTab: `submissions.filter(s => s.assignmentId === resource.id && s.isAssessment)`
- Old submissions without `isAssessment: true` in Firestore will be excluded → card shows "Not yet submitted" incorrectly.
- This is a backward-compat risk for any submission created before the isAssessment field was added.

## Edit Button / completedBlocks Desync (added 2026-03-03)

### BUG PATTERN — Edit does not remove block from completedBlocks
- `completedBlocks` is a Set managed in `LessonBlocks` parent component.
- `handleBlockComplete` only ADDS to the set; nothing removes blocks from it.
- Edit buttons in MCBlock, ShortAnswerBlock, SortingBlock, RankingBlock, LinkedBlock reset
  local `answered`/`submitted` state and call `onResponseChange` with answered:false — but they
  do NOT call any parent callback to remove the block from `completedBlocks`.
- Result: progress bar stays at 100% (or retains the count) and sidebar shows block as completed
  even after student presses Edit to revise their answer.
- Fix: expose a `onBlockUndo(blockId)` callback prop from `LessonBlocks`, wire it to
  `setCompletedBlocks(prev => { const n = new Set(prev); n.delete(blockId); return n; })`, and
  call it from each Edit handler.

### expandedId Not Reset on Panel Close
- `NotificationBell.expandedId` persists when the bell panel is closed and reopened.
- A notification expanded in the previous session remains expanded on reopen, which can be surprising.
- Low severity (cosmetic/UX), not a data issue.
- Fix: reset `expandedId` to `null` when `isOpen` transitions to `false`.

### saveRubricGrade notification is fire-and-forget (correct pattern)
- The `addDoc` for `ASSESSMENT_GRADED` notification is wrapped in `.catch(() => {})`.
- Means a Firestore failure silently drops the notification without surfacing an error to the teacher.
- Same pattern used by `flagSubmissionAsAI`. Consistent and intentional.
- If the grade write itself succeeds but notification fails, student never gets notified.
- Consider logging the error at minimum (reportError pattern used elsewhere).

## PhysicsTools.tsx Draggable Toolbar Patterns (added 2026-03-03)
- **Key file:** `components/PhysicsTools.tsx`
- **localStorage key:** `portersPortal_toolBtnPos` — stores `{x, y}` as left/top pixel values.
- **CRITICAL (open):** Missing `onPointerCancel` handler. OS interruptions (ChromeOS gestures, app switch) fire `pointercancel` without `pointerup`. dragRef and isDragging are never cleared → toolbar stuck in permanent drag state (no hover, no tooltips, no clicks) until page refresh.
- **MAJOR (open):** No mount-time viewport clamp. Position saved on large monitor restores off-screen on Chromebook. Resize handler only runs on `window.resize`, not on mount. Fix: clamp in useState initializer or mount useEffect.
- **MINOR (open):** `dblclick` on grip is not guarded after a drag — a drag followed within ~500ms by a second tap triggers `resetPosition()` unexpectedly.
- **MINOR (open):** No structural validation of localStorage restore. Valid JSON but non-`{x,y}` shape (e.g. `{}`) renders toolbar at viewport top-left.
- **MINOR (open):** Grip div has static `cursor-grab` — during active drag, grip shows grab instead of grabbing (child cursor overrides parent during drag).
- **MINOR (open):** Tooltip `<span>` elements rendered conditionally on `!isDragging`. React `setIsDragging(true)` batches asynchronously; on very fast drags tooltips may briefly flash before state updates.
- **WARNING:** `e.button !== 0` guard blocks touch events on browsers where touch `pointerdown` fires `button=-1` (non-standard but observed on some Android/ChromeOS builds). Recommend checking `e.pointerType === 'touch'` as fallback bypass.
- **CONFIRMED CORRECT:** 5px drag threshold uses per-axis `Math.abs(dx) > 5` — good for touchscreen tremor. Guard function uses `skipClick` ref (not state) — no race condition. Coordinate system on first drag uses `rect.left/rect.top` correctly. z-index: Communications z-60 > PhysicsTools z-50 — correct hierarchy.

## integrityAnalysis.ts Known Bugs & Patterns
- **MC denominator inflation (MAJOR):** `mcWrong` increments on `(aWrong || bWrong)`, not `(aWrong && bWrong)`. If one student has 3+ solo wrong answers, shared-wrong ratio dilutes below 0.75 threshold → false negatives. Fix: count only questions where BOTH got it wrong.
- **Missing `correctAnswer` false positive (MAJOR):** MC blocks with `correctAnswer: undefined` treat every student selection as wrong. 3+ such blocks where both students selected same answer triggers `mcSuspicious = true` even for correct answers. Guard: `if (block.correctAnswer == null) continue;`
- **MC-only pairs display 0% similarity (MINOR):** `overallSimilarity=0` (no text blocks compared) shows amber badge reading `0%` — teachers may dismiss it. Display should indicate "MC pattern only" when `compared===0 && mcSuspicious`.
- **MC-only pairs sort last (MINOR):** `flaggedPairs.sort((a,b) => b.overallSimilarity - a.overallSimilarity)` puts `overallSimilarity=0` pairs at the bottom, burying MC-pattern cheaters.
- **Question truncation cosmetic (MINOR):** `block.question.length >= 120` appends `...` even when content was exactly 120 chars (not actually truncated). Fix: `> 120`.
- **Performance (WARNING):** Runs synchronously on main thread. 30 students × 5 blocks: ~60–180ms on Chromebook (acceptable). 100 students × 3 blocks: ~500–750ms (noticeable freeze). Consider `setTimeout/queueMicrotask` or Web Worker for large classes.
- **textSimilarity edge behavior:** `a === b` check runs before length check, so identical short strings (< 15 chars) return 1.0. This is intentional and correct.
- **`pairsAnalyzed` formula:** `Math.floor(n*(n-1)/2)` — correct C(n,2), verified.
- **State clearing on assessment change:** Line 396 `onChange` atomically resets `integrityReport`, `showIntegrityPanel`, `expandedPairIdx` — correct, no stale state.
- **Student isolation confirmed:** `analyzeIntegrity` only imported in `TeacherDashboard.tsx`, not in any student-facing component.
