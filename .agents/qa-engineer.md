# QA Engineer — Porter's Portal Specialization

## Additional Verification: ISLE Pedagogy

When auditing educational content (assessments, lessons, simulations, boss questions):

1. **ISLE Cycle Check:** Verify lessons follow Observation → Hypothesis → Testing → Application. Reject content that provides formulas upfront.
2. **Question Quality:** Reject pure recall questions ("What is Newton's 2nd law?"). Questions must require application, prediction, or multi-representation reasoning.
3. **Rubric Alignment:** The 5-level rubric (Missing/Emerging/Approaching/Developing/Refining) must map to ISLE SAAR scale (0=Missing, 1=Inadequate, 2=Needs improvement, 3=Adequate).
4. **Growth Mindset:** Failure states must frame errors as hypothesis-disproving data, not punishment. Error messages guide revision.
5. **Backward Design Validation:** Confirm assessments measure declared learning outcomes before content creation proceeds.

## Visual Inspection — Portal Specifics

- **Primary viewport:** 1366x768 (Chromebook target) — always test this first
- **Secondary viewport:** 360x640 (mobile, only if the page claims responsive support)
- **Dark theme:** Portal uses dark theme by default — verify no bright/white flash on load
- **Touch targets:** Verify interactive elements appear to be at least 44x44px
- **Key pages to inspect** (when relevant to changes):
  - Student Dashboard: `/student`
  - Teacher Dashboard: `/teacher`
  - Lesson Viewer: `/lesson/:id`
  - Assessment/Proctor: `/assessment/:id`
- **Lesson blocks:** If block rendering changed, screenshot a lesson that uses that block type

## Chromebook Performance
- Test mental model: "Would this cause problems on a $200 Chromebook?"
- Flag animations, heavy DOM, or large bundles.

## Themed UI Audit — Portal Heuristics

These checks apply when auditing Portal components that use the CSS variable theming system (light/dark mode):

- **Sidebar token isolation:** Sidebar elements must use `--sidebar-*` tokens, NOT general `--text-*`/`--surface-*` tokens. The sidebar has its own color scheme independent of content area theming. Cross-contamination is a bug.
- **`text-white` preservation rule:** `text-white` on colored button backgrounds (e.g., `purple-600`, `emerald-600`, `red-600`) must NOT be converted to theme tokens. Flag any such conversion as a regression.
- **Hardcoded hex audit:** Scan every component for hardcoded dark hex values used as background colors, gradient stops, or overlay fills (e.g. `from-[#0d0e1a]`, `to-[#1a1b2e]`, `bg-[#0f0720]`, `bg-[#1a0d35]`). These values are invisible bugs in the opposite theme. The fix is always a CSS variable (`var(--surface-*)`) or an `isLight`-conditional className. **Severity: High.**
- **Inline style color audit:** Scan for `style={{ color: 'white' }}`, `style={{ color: '#fff' }}`, or any inline style that pins text/background to a fixed light/dark value. Inline styles bypass theme switching. Fix with `className` + `isLight` conditional. **Severity: High.**
- **400-series accent on tinted backgrounds:** When Tailwind 400-series accent classes (`text-orange-400`, `text-yellow-400`, etc.) appear alongside tinted background classes (`bg-orange-500/10`, `bg-X-50`, etc.), flag as likely WCAG AA contrast failure in light mode. Verify an `isLight` guard substitutes a -600 or -700 variant. **Severity: High.**
- **Settings / ThemeContext state sync:** Verify theme controls update BOTH the live context/hook (`setTheme()`) AND the local settings state object (`setLocalSettings(...)`). If only one is updated, Apply/Save silently reverts the selection. **Severity: High.**

## Responsive Breakpoint Audit — Portal Specifics

- **Chromebook check (1366px):** Determine which tier 1366px falls into under the Portal's Tailwind config. Flag any component that uses `xl:` layout changes intended for 1366px when the config places that width in `lg:`.
- **Custom breakpoints:** The Portal may redefine `xl` and `2xl` — always read `tailwind.config.js` before auditing responsive classes.

## Known Testing Infrastructure
- Frontend build: `npm run build`
- Functions build: `cd functions && npm run build`
- No formal test suite yet — QA is primarily code review + static analysis + accessibility audit.
