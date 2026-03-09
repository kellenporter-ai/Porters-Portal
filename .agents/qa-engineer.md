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

## Known Testing Infrastructure
- Frontend build: `npm run build`
- Functions build: `cd functions && npm run build`
- No formal test suite yet — QA is primarily code review + static analysis + accessibility audit.
