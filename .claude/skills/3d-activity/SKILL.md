---
name: 3d-activity
description: Use when someone asks to create a 3D simulation, build a Babylon.js activity, make a 3D interactive scene, generate a physics sim, or create a forensic science simulation.
disable-model-invocation: true
argument-hint: [topic] [optional file paths for context]
---

## What This Skill Does

Generates a standalone, self-contained HTML file with an interactive 3D simulation using Babylon.js. The simulation integrates with Porter Portal's Proctor Bridge protocol and is optimized for student Chromebooks.

**Subjects:** AP Physics, Honors Physics, Forensic Science
**Output:** Single HTML file saved to `/home/kp/Desktop/Simulations/<class>/`

For Babylon.js coding patterns, performance budgets, and lighting recipes, see [babylon-reference.md](babylon-reference.md).
For the example simulation to use as a structural reference, see [example-sim.md](example-sim.md).

---

## Step 1: Parse Arguments

Extract from `<ARGUMENTS>`:

- **Topic/scenario** — the subject of the simulation (e.g., "projectile motion", "blood spatter analysis", "wave interference")
- **File paths** (optional) — paths to PDFs, images, or documents that provide additional context for the simulation goals

If file paths are provided, read each one using the Read tool. Use their content to understand:
- What the simulation needs to teach
- What equipment, apparatus, or scene elements to model
- What questions or assessment criteria to target
- Any specific diagrams, layouts, or visual references

If no arguments are provided, ask: "What topic should I build a 3D simulation for? You can also provide file paths to reference materials."

---

## Step 2: Ask Class and Mode

Ask the user two questions:

**Class:** Which class is this simulation for?
- AP Physics
- Honors Physics
- Forensic Science

This determines the output subdirectory under `/home/kp/Desktop/Simulations/`.

**Mode:** Should this simulation be graded or exploratory?
- **Graded** — includes assessment questions, calls `PortalBridge.answer()` and `PortalBridge.complete()`
- **Exploratory** — sandbox/free-explore experience, only calls `PortalBridge.init()` and `PortalBridge.save()`

---

## Step 3: Design the Simulation

Before writing code, plan the simulation:

1. **Educational goal** — what concept or skill the student should understand after interacting
2. **3D scene elements** — what objects, environment, and props to build (be specific)
3. **Interactions** — what the student can do (click, drag, adjust sliders, apply forces, rotate camera, toggle views)
4. **Physics/logic** — what simulation logic drives the behavior (gravity, collisions, trajectories, evidence placement)
5. **UI overlay** — what information panels, controls, and feedback the student sees
6. **Assessment** (graded mode only) — what questions to ask, correct answers, and when to trigger them

---

## Step 4: Generate the HTML File

Write a single self-contained HTML file. Follow the structure and patterns in [babylon-reference.md](babylon-reference.md).

### File Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>[Simulation Title]</title>
    <style>/* All CSS inline */</style>
    <script src="https://cdn.babylonjs.com/babylon.js"></script>
    <script src="https://cdn.babylonjs.com/materialsLibrary/babylonjs.materials.min.js"></script>
</head>
<body>
    <script>/* Portal Bridge */</script>
    <canvas id="renderCanvas"></canvas>
    <div id="ui-layer"><!-- Overlay UI --></div>
    <script>/* Babylon.js scene + simulation logic */</script>
</body>
</html>
```

### Proctor Bridge — Always Include

```javascript
const PortalBridge = (() => {
    const send = (type, data) => {
        if (window.parent) window.parent.postMessage({ source: 'portal-activity', type, ...data }, '*');
    };
    return {
        init:     ()              => send('PROCTOR_READY'),
        save:     (state, q)      => send('SAVE_STATE',  { state, currentQuestion: q }),
        answer:   (id, ok, tries) => send('ANSWER',      { questionId: id, correct: ok, attempts: tries }),
        complete: (s, t, c)       => send('COMPLETE',    { score: s, total: t, correct: c })
    };
})();
window.addEventListener('load', () => PortalBridge.init());
```

- **Graded mode:** Call `PortalBridge.answer(questionId, correct, attempts)` when a student answers a question. Call `PortalBridge.complete(score, total, correct)` when the activity finishes. Call `PortalBridge.save(stateObj, currentQuestionIndex)` periodically.
- **Exploratory mode:** Call `PortalBridge.save(stateObj, 0)` periodically to preserve student progress. Do NOT call `answer` or `complete`.

### Dark Theme UI

Use this color scheme for all overlay panels:

```css
:root {
    --bg:       #0f0720;
    --panel-bg: rgba(18, 10, 38, 0.88);
    --border:   rgba(160, 100, 255, 0.18);
    --text:     #e8e4f4;
    --muted:    #8a85a8;
    --blue:     #5b9cf6;
    --green:    #22d47a;
    --orange:   #f5a623;
    --red:      #e8504a;
    --purple:   #9b6bff;
}
```

- Glassmorphism panels: `backdrop-filter: blur(14px); background: var(--panel-bg); border: 1px solid var(--border); border-radius: 14px;`
- Canvas fills the viewport. UI overlays on top with `pointer-events: none` on the container, `pointer-events: auto` on interactive panels.
- Mobile responsive — stack panels vertically on narrow screens.

### Babylon.js Scene Requirements

Follow the detailed patterns in [babylon-reference.md](babylon-reference.md). Key requirements:

**Engine & Scene:**
- Use `BABYLON.Engine` with `stencil: true`
- Hardware scaling: `Math.min(window.devicePixelRatio, 1.5)` — cap at 1.5 for Chromebooks
- Clear color matching the dark theme background
- Scene fog (EXP2) for depth

**Camera:**
- `ArcRotateCamera` with orbit, zoom, and pan
- Set `lowerRadiusLimit` and `upperRadiusLimit` to keep the scene framed
- Set `upperBetaLimit` to prevent flipping under the ground
- Enable inertia for smooth feel

**Lighting — Use the Three-Light Recipe:**
1. `HemisphericLight` (intensity 0.3–0.4) — ambient fill with cool diffuse and dark ground color
2. `DirectionalLight` (intensity 0.8–1.0) — main sun/key light, casts shadows
3. `PointLight` or `SpotLight` (optional) — accent/mood light for focal objects

Do NOT add more than 3 lights. See [babylon-reference.md](babylon-reference.md) for the exact lighting setup.

**Shadows:**
- `ShadowGenerator` with `useBlurExponentialShadowMap = true`
- Shadow map size: **1024** (not 2048 — Chromebook budget)
- `blurKernel: 16`, `darkness: 0.4`
- Add key objects as shadow casters. Ground receives shadows.

**Materials — Use PBR:**
- `PBRMaterial` for all objects — set `albedoColor`, `roughness`, `metallic`
- Use `emissiveColor` sparingly for glowing/highlighted objects
- For ground: use `GridMaterial` for lab/abstract settings, OR create a textured ground with `PBRMaterial` for realistic environments

**Models — Procedural Construction:**
- Build all models from Babylon.js primitives: `CreateBox`, `CreateCylinder`, `CreateSphere`, `CreateTorus`, `CreateLathe`, `CreateTube`, `CreateRibbon`, etc.
- Use `TransformNode` to group multi-part objects
- Use CSG (Constructive Solid Geometry) for complex shapes when needed
- Target medium polygon counts — use `tessellation: 24-32` for curved surfaces (not 8-12, not 64+)
- Make objects recognizable — combine multiple primitives to build representative models rather than using a single low-poly box

**Environment — Make It Realistic:**
- Add context-appropriate surroundings: lab tables, walls, floor textures, outdoor terrain — not just a floating grid
- Use a skybox or gradient background for outdoor scenes
- Use fog to fade distant edges naturally
- Add subtle environmental details: baseboards, table legs, equipment stands — things that ground the scene in reality

**Post-Processing Pipeline:**
- `DefaultRenderingPipeline` with FXAA enabled
- `samples: 2` (not 4 — Chromebook budget)
- Tone mapping enabled, contrast ~1.1, exposure ~1.05
- `GlowLayer` with intensity 1.0–1.5 for emissive objects
- `HighlightLayer` for interactive object outlines (optional)

**Particles (when appropriate):**
- Use built-in `ParticleSystem` for effects (dust, sparks, splatter)
- Keep max particles under 300
- Use procedural `DynamicTexture` for particle textures — no external images

**Animation:**
- Use `BABYLON.Animation.CreateAndStartAnimation` for camera transitions and UI-triggered animations
- Use `scene.onBeforeRenderObservable` for physics/simulation loops
- Use `engine.getDeltaTime()` for frame-rate-independent physics

**Resize & Render Loop:**
```javascript
engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
```

---

## Step 5: Save the File

Save the HTML file to:

```
/home/kp/Desktop/Simulations/<class>/<filename>.html
```

Where:
- `<class>` is the subdirectory matching the user's class choice: `AP Physics`, `Honors Physics`, or `Forensic Science`
- `<filename>` is a descriptive kebab-case name derived from the topic (e.g., `projectile-motion-sim.html`, `blood-spatter-analysis.html`)

---

## Step 6: Summary

After writing the file, provide a brief summary:
- File path where it was saved
- What the simulation covers
- What interactions are available
- Whether it's graded or exploratory
- Any notes about limitations or things the user might want to tweak

---

## Notes

- **Output ONLY the HTML file.** Do not add explanation or commentary before/after the file content — just write it with the Write tool.
- **No external assets.** Everything must be inline or from the Babylon.js CDN. All textures, models, and particle images must be procedurally generated.
- **Chromebook performance is critical.** Follow the performance budgets in [babylon-reference.md](babylon-reference.md). If in doubt, optimize for performance over visual fidelity.
- **Scientific accuracy matters.** Physics equations, forensic science principles, and educational content must be correct. Do not fabricate inaccurate science.
- **Mobile/touch support.** The ArcRotateCamera handles touch natively. Ensure UI buttons are large enough for touch (min 44px tap targets). Use `touch-action: none` on the canvas.
- **Do NOT use Havok or Ammo.js physics engines** — they require additional large CDN downloads. Implement physics logic manually (gravity, velocity, collisions) in the render loop, as shown in the example simulation.
