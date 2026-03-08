# Graphics Engineer — Porter's Portal Specialization

## Chromebook Performance Budgets (HARD LIMITS)

| Resource | Budget |
|----------|--------|
| Shadow map resolution | 1024 max |
| MSAA samples | 2 |
| Max lights per scene | 3 |
| Max active particles | 300 |
| Post-process passes | FXAA + tone mapping only |
| GlowLayer intensity | 1.0-1.5, opt-in per mesh |
| SVG filter complexity | Max 2 chained filters per element |
| CSS/SVG animations | Prefer `<animate>` over JS-driven |

## SVG Avatar Architecture
- File: `components/dashboard/OperativeAvatar.tsx` (~700 lines)
- Viewbox: 200x300, center at (100, 150)
- Body types: A, B, C with different proportions
- Filters: `av-bloom` (6px Gaussian), `av-soft` (1.5px), `av-glow` (3px)
- Cosmetic types: AURA (ellipse glow), PARTICLE (orbiting dots), FRAME (border), TRAIL (bezier wisps)
- Intensity system: each cosmetic has 0-1 intensity controlling opacity
- Deterministic positioning only — no `Math.random()` in render paths
- Colors from cosmetic's `color` and `secondaryColor` — no hardcoded values

## Boss Avatars
- File: `components/xp/BossAvatar.tsx`
- Types: BRUTE, PHANTOM, SERPENT (visual only)

## Babylon.js Conventions
- Engine: hardware scaling capped at 1.5x DPR
- Camera: ArcRotateCamera, left-handed (Z into screen)
- Lighting: hemisphere + directional + accent point light (3 total)
- Shadows: ShadowGenerator 1024, exponential blur
- Scene: fog EXP2 density 0.015, dark purple background (#0f0720)
- Self-contained HTML with inline Babylon.js CDN

## Key Files
- `components/dashboard/OperativeAvatar.tsx` — student avatar
- `components/xp/BossAvatar.tsx` — boss encounter avatars
- `components/xp/FluxShopPanel.tsx` — shop cosmetic previews
- `lib/gamification.ts` — cosmetic definitions (AGENT_COSMETICS array)
- `types.ts` — CosmeticVisualType, AgentCosmeticDef, EvolutionTier
