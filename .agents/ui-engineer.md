# UI Engineer — Porter's Portal Specialization

## Tech Stack
- React 18 + TypeScript + Vite
- Tailwind CSS for styling
- Chromebook-first responsive design (low-end hardware, varying screen sizes)

## Key Files
- `components/dashboard/` — main dashboard panels
- `components/xp/` — gamification UI (boss battles, shop, skill tree)
- `components/dashboard/OperativeAvatar.tsx` — student avatar (procedural SVG)

## Constraints
- Chromebook viewport optimization is critical — test at 1366x768.
- Use relative units (`rem`) for all typography.
- Prefer Tailwind utility classes over custom CSS.
- Follow existing component patterns and naming conventions in the codebase.
- SVG cosmetic rendering uses intensity system (0-1 opacity scaling) — no hardcoded opacity.
