# Programmer Agent Memory

## Project Structure
- Simulations output to: `/home/kp/Desktop/Simulations/<class>/`
- Assessments output to: `/home/kp/Desktop/Assessments/<class>/`
- Skills live in: `/home/kp/Desktop/Porters-Portal/.claude/skills/`

## Babylon.js Patterns (confirmed)
- Always cap devicePixelRatio at 1.5 for Chromebook: `Math.min(window.devicePixelRatio || 1, 1.5)`
- Engine init: `preserveDrawingBuffer: false, stencil: false` for perf
- `CreatePlane` only renders one face by default. Set `material.backFaceCulling = false` on any plane-based mesh the camera might view from behind (walls, discs used as blood drops, billboard labels).
- `BABYLON.Animation.CreateAndStartAnimation` with multiple simultaneous calls on ArcRotateCamera causes conflicts. Use a manual lerp tween in the render loop instead (tick via `engine.runRenderLoop` delta time).
- ArcRotateCamera angle tween: normalise alpha diff to [-PI, PI] before lerping to take shortest arc.

## Assessment Design Rules
- Assessment simulations must NOT include analysis tools or reference tabs — students figure it out themselves.
- Evidence panels show only neutral physical descriptions (what is visible), never interpretation or cause.
- Marker legends show only numbers (#1, #2, ...) — no pattern type labels that give away answers.

## Proctor Bridge
- Standard contract: `PROCTOR_READY`, `SAVE_STATE`, `ANSWER`, `COMPLETE`
- Dispatch via `window.parent.postMessage({ source: 'portal-activity', type, ...data }, '*')`
