# Example Simulation: Save the Chalk (Babylon.js)

This is a structural reference for how a well-built 3D activity is organized. Use this as a template for the overall file structure, UI layout, and code organization — but always build original content for each new simulation.

---

## File Structure Pattern

```
1. DOCTYPE + head
   - meta tags (charset, viewport)
   - title
   - inline <style> (all CSS)
   - Babylon.js CDN scripts

2. body
   - PortalBridge script block
   - <canvas id="renderCanvas">
   - <div id="ui-layer"> with overlay panels
   - Main <script> block:
     a. Engine + Scene setup
     b. Camera
     c. Lighting (3-light recipe)
     d. Shadows
     e. Post-processing (pipeline, glow, highlight)
     f. Procedural textures (particle tex, labels)
     g. Materials (PBR)
     h. Environment (ground, walls, context)
     i. Scene objects (the simulation models)
     j. Arrow/vector helpers (if physics sim)
     k. Particle functions (if needed)
     l. Visibility/state management
     m. Physics state variables
     n. UI helper functions
     o. Event bindings (buttons, touch, keyboard)
     p. Render loop (physics + animation logic)
     q. engine.runRenderLoop + resize listener
     r. Init (set initial state, intro camera animation)
```

---

## UI Overlay Pattern

The UI floats over the 3D canvas. The container is `pointer-events: none` so the canvas receives mouse/touch input. Individual panels are `pointer-events: auto`.

```html
<div id="ui-layer">
    <!-- Info panel (top-left or top on mobile) -->
    <div class="panel header-panel">
        <h1>Simulation Title</h1>
        <p class="subtitle">Brief educational context</p>
        <!-- Tabs, legend, stats, status -->
    </div>

    <!-- Controls panel (bottom or right side) -->
    <div class="panel controls-panel">
        <!-- Buttons, sliders, toggles -->
    </div>
</div>
```

**Layout:** On desktop (min-width: 768px), panels go side-by-side using flexbox `row`. On mobile, they stack vertically.

---

## What the Example Sim Does Well

- **ArcRotateCamera** with orbit, zoom, pan — students can explore the 3D scene freely
- **PBR materials** on all objects for realistic light response
- **GlowLayer** on emissive arrow meshes for bloom effect on vectors
- **HighlightLayer** for visual feedback when objects are active
- **Particle burst** on impact (chalk dust) — procedural texture, no external assets
- **Glassmorphism UI panels** with backdrop-filter blur
- **Camera animations** using `BABYLON.Animation.CreateAndStartAnimation`
- **Frame-rate-independent physics** using `engine.getDeltaTime()`
- **Touch support** for force button (mousedown + touchstart)
- **State machine** (IDLE → RUNNING → ENDED) for clean simulation flow

---

## Gold Standard: The Break-In (DNA Profiling)

The Break-In simulation (`Forensic Science/the-break-in-dna-profiling.html`) represents the quality bar to aim for. Key patterns it demonstrates:

1. **Procedural textures on every major surface** — uses the `pbrTex()` helper to paint:
   - Floor: vinyl linoleum tiles with grout lines and per-tile hue variation
   - Walls: cinderblock with mortar lines and staggered bond pattern
   - Ceiling: drop-ceiling grid with recessed tile faces
   - Doors: wood grain with sine-wave wobble lines and recessed panel insets
   - Lockers: metal panels with vent slits, door seam, handle, and sheen highlight
   - Desk surface: dark laminate with subtle wood-grain streaks and edge band
   - Crime scene tape: yellow with repeating "CRIME SCENE DO NOT CROSS" text

2. **Composite models with realistic detail** — the soft-drink can uses 6 primitives (body, bottom dome, neck taper, lid, pull tab torus, tab lever). Evidence markers are A-frame tent-style with numbered DynamicTexture faces.

3. **Context-rich environment** — the scene has walls, ceiling, doors (propped open with paper wedge evidence), lockers, desks, computers, crime scene tape strung as sagging catenary tubes, and numbered evidence markers placed at key locations.

4. **Police strobe accent light** — the third light slot alternates red/blue to simulate police presence outside, adding atmosphere without extra GPU cost.

5. **Clickable 3D evidence** — objects in the scene have `metadata.evidence` flags. Students click highlighted items to collect them. Tooltip follows the pointer with item description.

---

## What to Improve Over the Save the Chalk Example

When building new simulations, improve on these areas from the basic Save the Chalk example:

1. **Textures:** The basic example uses flat-color `pbr()` everywhere. Use `pbrTex()` with Canvas 2D painting for all major surfaces — see the texture recipes in babylon-reference.md. This is the single biggest visual quality improvement.

2. **Models:** The basic example uses single-primitive objects (one box = brick, one cylinder = chalk). Build multi-primitive composite models — e.g., a soda can with body, neck taper, lid, and pull tab; a door with window pane and push bar.

3. **Environment:** The basic example uses a `GridMaterial` floor floating in void. Build context-appropriate environments:
   - Lab simulations → textured lab table, cinderblock walls, tile floor, ceiling
   - Outdoor physics → terrain ground, sky gradient, distant horizon
   - Forensic scenes → room with walls, doors, furniture, evidence markers, crime scene tape

4. **Lighting:** The basic example lighting is functional but flat. Use the three-light recipe with:
   - Warmer/cooler color contrast between hemisphere up and down
   - Accent light positioned to create dramatic shadows on the focal area
   - Consider thematic accent colors (police strobes, UV light, emergency red)

5. **Interactivity:** Go beyond buttons — add clickable objects in the 3D scene, draggable elements, slider controls for variables, toggle switches for conditions.
