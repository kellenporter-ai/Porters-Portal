# Testing & QA Reference (2026)

## Biome (Replaces ESLint + Prettier)

### Why Biome
- Rust-based toolchain: ~15x faster than ESLint
- Single tool for both linting and formatting
- Single `biome.json` config replaces fragmented ESLint plugin ecosystem
- ~70% less energy consumption on modern architectures
- Enforces TypeScript 5.6+ strict mode invariants

### Setup
```json
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/2.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  }
}
```

### Integration
- Replace `npx tsc --noEmit` + no-ESLint workflow with `biome check .`
- Add to /dev-pipeline: `biome check --write .` for auto-fix before build
- CI: `biome ci .` — exits non-zero on any violation

### Current Status
Portal currently has no ESLint. Biome is the recommended migration path when adding linting.

## Vitest Browser Mode (Component Testing)

### Why Not jsdom
jsdom simulates the DOM in Node.js but cannot accurately test:
- CSS layouts and computed styles
- Native browser APIs (IntersectionObserver, ResizeObserver)
- Event propagation in complex UIs
- Babylon.js WebGL/WebGPU rendering contexts
- @dnd-kit collision detection algorithms

### Vitest Browser Mode
Executes component tests inside real browser engines via Playwright or WebdriverIO.

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: 'playwright',
      name: 'chromium',
    },
  },
});
```

### Testing Patterns

**Component mounting with `vitest-browser-react`:**
```typescript
import { render } from 'vitest-browser-react';
import { FluxShopPanel } from './FluxShopPanel';

test('purchase updates inventory optimistically', async () => {
  const { getByRole } = render(<FluxShopPanel userId="test" />);
  // Test against actual rendered DOM in real Chrome
});
```

**Network mocking with Mock Service Worker (MSW):**
Intercept Firebase network requests without touching Firestore:
```typescript
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  http.post('*/purchaseFluxItem', () => {
    return HttpResponse.json({ success: true, newBalance: 500 });
  })
);
```

**Testing async/optimistic states:**
Verify that when a student clicks to purchase, the optimistic UI updates instantly while the simulated network request processes in the background.

## Playwright (Visual Regression & E2E)

### Visual Regression Testing
Pixel-by-pixel comparison of UI snapshots:
- Catches unintended layout shifts from CSS changes
- Verifies RPG inventory grids, leaderboard tables, KaTeX math rendering

**Normalizing dynamic content for stable snapshots:**
- Hide timestamped notifications
- Replace randomized loot affixes with static values
- Disable floating particle trails
- Use strict browser launch flags for consistent rendering

```typescript
test('inventory grid layout', async ({ page }) => {
  // Disable animations for stable snapshots
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard');
  await expect(page.locator('.inventory-grid')).toHaveScreenshot();
});
```

### Accessibility Testing with axe-core

**@axe-core/playwright integration:**
Automatically injects axe-core into functional test suite, scanning DOM for WCAG 2.2 AA compliance post-render.

```typescript
import AxeBuilder from '@axe-core/playwright';

test('boss encounter modal is accessible', async ({ page }) => {
  await page.goto('/dungeon');
  await page.click('[data-testid="start-boss"]');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2aa', 'wcag22aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});
```

**What it catches:**
- Missing ARIA attributes on dynamically injected modals
- Semantic HTML violations in generated lesson blocks
- Insufficient color contrast against dark spy-themed backgrounds
- Focus management issues in boss encounter overlays

## Testing Strategy Summary

| Layer | Tool | Scope |
|-------|------|-------|
| Static Analysis | Biome | Linting, formatting, TypeScript strict mode |
| Unit/Component | Vitest Browser Mode | React 19 hooks, concurrent state, real DOM |
| Visual Regression | Playwright | CSS geometry, layout integrity |
| Accessibility | axe-core + Playwright | WCAG 2.2 AA automated scanning |
| E2E | Playwright | Full user flows on Chromium |
