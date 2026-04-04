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
- `components/xp/` — gamification UI (boss battles, shop, skill tree, dungeons)
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

## Portal Theming System

The Portal supports light and dark modes via CSS custom properties (`:root` for light, `.dark` for dark) mapped to semantic Tailwind tokens (e.g., `bg-surface-base` → `var(--surface-base)`). Programmatic access via `ThemeContext` / `useTheme()`. Recharts consumers use `useChartTheme()`.

### Sidebar vs Content Tokens
- **Sidebar** uses `--sidebar-*` tokens (e.g., `bg-[var(--sidebar-bg)]`, `text-[var(--sidebar-text)]`). These are static — the sidebar stays dark-purple in both modes.
- **Content area** uses `--surface-*` and `--text-*` tokens (e.g., `bg-surface-base`, `text-[var(--text-primary)]`). These switch between light and dark.
- **Never use switching content tokens inside the sidebar.** Doing so makes text invisible when the content palette flips but the sidebar doesn't.

### `text-white` Conversion Rule
- **Keep `text-white`** on buttons with colored backgrounds (purple, green, red, amber) — the background provides contrast in both modes.
- **Convert to `text-[var(--text-primary)]`** for content text on surface backgrounds that switch between modes.

### Light Mode Color Rules

When a component must render correctly in both light and dark modes, apply these concrete rules. Access the current theme via `const { isLight } = useTheme()`.

**1. Colored text on light backgrounds**
Tailwind 400-series accent colors (`text-orange-400`, `text-yellow-400`, etc.) fail WCAG contrast on light/white/tinted surfaces. Use 600 or 700 variants in light mode. Pre-existing code using 400-series colors is not exempt — flag it.

Pattern:
```tsx
className={isLight ? 'text-orange-600' : 'text-orange-400'}
```

**2. Tinted card backgrounds**
`bg-X-500/10 border-X-500/20` wash out in light mode. Use solid low-saturation variants.

Pattern:
```tsx
className={isLight
  ? 'bg-orange-50 border-orange-200'
  : 'bg-orange-500/10 border-orange-500/20'}
```

**3. Inline style color fallbacks**
Never use `style={{ color: 'white' }}` as a no-value fallback. Use className conditional.

Pattern:
```tsx
className={!nameColor ? (isLight ? 'text-[var(--text-primary)]' : 'text-white') : ''}
style={nameColor ? { color: nameColor } : undefined}
```

**4. School MDM extensions override CSS custom properties**
MDM-deployed browser extensions can override CSS custom properties. Fix with two layers: `!important` on `:root` variables + direct property rules bypassing variable resolution.

**5. Dark mode borders must be purple-tinted, not white-tinted**
`rgba(255,255,255,X)` borders composite as visible white edges on Chromebook GPU. Use purple-derived rgba (e.g., `rgba(147, 51, 234, 0.12)`).

**6. Hardcoded hex backgrounds in modals/overlays**
Replace hardcoded dark hex values with `useTheme()` conditionals.

**7. Glassmorphism over textured backgrounds**
Reduce blur first, then tune opacity. High blur destroys detail even at near-zero opacity. Override blur globally for light mode: `backdrop-filter: blur(4px)`.

## Type Safety & Library Gotchas

### Discriminated Union Variant Naming

**High-risk phonetic pairs** — verify explicitly when any of these appear together in the same feature:
- `PAUSE` vs `PASTE` (time gap vs clipboard action)
- `COUNT` vs `AMOUNT` (integer quantity vs numeric value)
- `FLAG` vs `FLAT` (boolean marker vs data shape)
- `INPUT` vs `INSET` (event vs layout)

### Tailwind Opacity Modifiers

Only use values from Tailwind's default opacity scale: **5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95**. Arbitrary integers (e.g., `/8`, `/12`, `/18`) silently produce no output.

**If you need a non-standard value**, use arbitrary syntax: `bg-yellow-900/[8%]`.

### @tanstack/react-virtual v3 — No `enabled` Option

`useVirtualizer` does **not** accept `enabled`. Gate virtualization with conditional rendering:
```tsx
{useVirtual ? <VirtualList virtualizer={virtualizer} items={items} /> : <FlatList items={items} />}
```

Other non-existent options: `suspense`, `staleTime`, `cacheTime`.

## Gamification UI Notes
- Leaderboard, TeacherDashboard, UserManagement, OperativesTab, Communications: all virtualized with `useVirtualizer` + `measureElement`
- Boss ability animations: shake + flash + HP threshold markers
- Flux Shop: category filter tabs, cosmetic preview with equip toggle
