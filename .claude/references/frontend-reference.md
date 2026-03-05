# Frontend Engineering Reference (2026)

## React 19 Concurrent Features

### useTransition
Use for heavy state calculations that shouldn't block the UI. Wraps state updates so React can interrupt them to keep the interface responsive.

**Portal use cases:**
- Processing 5-level grading rubrics
- Calculating cascading effects of skill tree node unlocks
- Filtering/sorting large student data tables
- Any state update that causes noticeable jank on Chromebooks

```tsx
const [isPending, startTransition] = useTransition();

function handleUnlockNode(nodeId: string) {
  startTransition(() => {
    // Heavy recalculation of skill tree dependencies
    setSkillTree(recalculateTree(nodeId));
  });
}
```

### useOptimistic
Provides instant UI feedback while async operations (Firestore writes) process in the background. Critical for perceived performance on slow school networks.

```tsx
const [optimisticInventory, addOptimistic] = useOptimistic(
  inventory,
  (current, newItem) => [...current, newItem]
);

async function handlePurchase(item: ShopItem) {
  addOptimistic(item); // Instant UI update
  await purchaseFluxItem(item.id); // Network call
}
```

### Why NOT React Server Components
Porters-Portal is deployed as a static bundle to Firebase Hosting with Cloud Functions as the API layer. RSC requires a Node.js server rendering layer. The SPA architecture with TanStack Query for server state and Zustand for client state is the correct pattern for this deployment model.

## State Management

### TanStack Query (Server State)
Handles all Firestore data with built-in caching, background refetching, and stale-while-revalidate. Superior for educational apps that must handle frequent network drops on school Wi-Fi.

**Key patterns:**
- `staleTime` — how long cached data is considered fresh
- `gcTime` — how long inactive data stays in cache
- Background refetching keeps UI current without loading spinners
- Automatic retry on network failure

### Zustand (Client State)
Lightweight store for ephemeral client state only:
- Active drag-and-drop payload (@dnd-kit interactions)
- UI modal states
- Temporary form state
- Animation triggers

Do NOT put Firestore data in Zustand — that's TanStack Query's job.

## Tailwind CSS v4

### Key Migration Changes from v3 to v4
1. **No more `tailwind.config.js`** — v4 uses CSS-first configuration
2. **Single import:** `@import "tailwindcss"` in main CSS entry point
3. **Vite plugin:** `@tailwindcss/vite` replaces PostCSS setup
4. **Rust-based compiler** — microsecond incremental builds
5. **Design tokens as CSS variables** — spacing, colors, breakpoints are native `--tw-*` custom properties
6. **Reduced dependencies** — no PostCSS overhead

### Migration checklist
- Replace `tailwind.config.js` with CSS `@theme` directives
- Install `@tailwindcss/vite` plugin, remove `tailwindcss` from PostCSS
- Custom values use `@theme { --color-amber-400: ...; }` instead of JS config
- v4 auto-detects content files — no `content` array needed

### Current Status
Portal currently uses Tailwind 3.4. Migration to v4 is a future consideration. Reference this when the migration happens.

## WCAG 2.2 AA Compliance

### Critical Criteria for Gamified Interfaces

**2.4.11 Focus Not Obscured (AA)**
Keyboard focus indicators must never be entirely hidden by author-created content.
- Floating damage numbers, XP popups, and modal loot notifications must NOT obscure quiz/assessment elements
- Use strict z-index stacking contexts: gamification overlays < focus indicators
- Implement focus-trapping in modals to prevent focus from reaching obscured elements

**2.5.7 Dragging Movements (AA)**
All drag-and-drop interactions must have tap/click alternatives.
- @dnd-kit forensic evidence matching must support keyboard and single-click alternatives
- Provide "move to" button or dropdown as an alternative to drag

**2.5.8 Target Size Minimum (AA)**
Interactive elements must have a minimum bounding box of 24x24 CSS pixels.
- Inventory icons, gem sockets, skill tree nodes — all must meet 24x24 minimum
- Audit dense data views: student skill tree, inventory grid, gem socketing interfaces
- Use `min-w-6 min-h-6` (24px) as baseline for all interactive elements

**3.3.8 Accessible Authentication (AA)**
Login must not require cognitive tests (memorization, transcription puzzles).
- Google SSO with email whitelist enrollment is WCAG-compliant
- Never add CAPTCHA or cognitive challenges to the login flow

### Implementation Patterns
- `shadcn/ui` — unstyled, accessible-by-default components with built-in ARIA states and keyboard navigation
- All gamification popups: `aria-hidden="true"` with adjacent `aria-live="polite"` text
- Focus rings: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`
- Interactive cosmetics: `aria-pressed` for toggle states, `aria-label` on all buttons

## Vite 6 Optimization

### Build Targets for Chromebooks
- Set `build.target` to match Chrome versions on school Chromebooks
- Use `build.rollupOptions.output.manualChunks` to split vendor code
- Lazy-load routes with `React.lazy()` (already implemented)
- Monitor chunk sizes — large bundles cause slow first-load on school networks
