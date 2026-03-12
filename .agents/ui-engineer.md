# UI Engineer — Porter's Portal Specialization

## Tech Stack
- React 18 + TypeScript + Vite
- Tailwind CSS for styling (no custom CSS plugins installed)
- Firebase Hosting + Cloud Functions v2
- Chromebook-first responsive design (low-end hardware, varying screen sizes)

## Constraints
- **Primary viewport:** 1366x768 (Chromebook) — always test here first
- **Touch targets:** 44px minimum on all interactive elements
- Use relative units (`rem`) for all typography
- Prefer Tailwind utility classes over custom CSS
- Follow existing component patterns and naming conventions
- Dark theme by default — no white flash on load
- `prefers-reduced-motion` should disable non-essential animations

## Key Directories
- `components/dashboard/` — main dashboard panels (StudentDashboard, TeacherDashboard)
- `components/xp/` — gamification UI (boss battles, shop, skill tree, arena, dungeons)
- `components/dashboard/OperativeAvatar.tsx` — student avatar (procedural SVG, ~700 lines)
- `components/lessons/LessonBlocks.tsx` — all 22 interactive block type renderers
- `lib/` — hooks, utilities, persistentWrite, lazyWithRetry

## Component Patterns

### Error Boundaries
Every dashboard tab and route MUST be wrapped in `<FeatureErrorBoundary>`. Missing it = full app crash on render error.

### Lazy Imports
Use `lazyWithRetry(() => import(...))` for route-level splits. Plain `React.lazy()` with inline `<Suspense>` for non-route components inside a page.

### Context Hooks
Use specific hooks (`useAssignments()`, `useGameData()`, `useClassConfig()`) over `useAppData()` for fine-grained reactivity. All context hooks return safe empty defaults — never throw.

### Student Work Persistence
All student input components must use `usePersistentSave` hook or `persistentWrite()` utility. Never use raw `setDoc()` for student work. localStorage keys use `user.id`, never `user.name`.

### Interactive Blocks
- Per-block action buttons: "Lock In", "Check Answer" — never "Submit" (reserved for final assessment submission)
- All 10 interactive types must support `readOnly?: boolean` for post-submission review mode

## SVG Cosmetic Rendering
- Intensity system: each cosmetic has 0-1 intensity controlling opacity — no hardcoded values
- Deterministic positioning only — no `Math.random()` in render paths
- Colors from cosmetic's `color` and `secondaryColor`

## Accessibility (WCAG 2.2 AA)
- `aria-label` on all icon-only buttons
- `role="columnheader"` + `aria-sort` on sortable table headers
- Focus-visible ring on all interactive elements
- `aria-live="polite"` for dynamic status updates
- Sidebar collapse: admin nav must pass `sidebarCollapsed` to `renderNavButton`

## Gamification UI Notes
- Leaderboard, TeacherDashboard, UserManagement, OperativesTab, Communications: all virtualized with `useVirtualizer` + `measureElement`
- Boss ability animations: shake + flash + HP threshold markers
- Arena rating: 5 spy-themed tiers with progress bar
- Flux Shop: category filter tabs, cosmetic preview with equip toggle
