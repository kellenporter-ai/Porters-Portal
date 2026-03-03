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

## What to Improve Over the Example

When building new simulations, improve on these areas:

1. **Models:** The example uses single-primitive objects (one box = brick, one cylinder = chalk). Build multi-primitive composite models that are more recognizable — e.g., a brick with beveled edges and mortar texture lines, a piece of chalk with tapered ends and a rounded cross-section.

2. **Environment:** The example uses a `GridMaterial` floor floating in void. Build context-appropriate environments:
   - Lab simulations → lab table, walls, floor with realistic materials
   - Outdoor physics → ground plane with terrain color, sky gradient, distant horizon
   - Forensic scenes → room with walls, floor, doorways, furniture, evidence markers

3. **Lighting:** The example lighting is functional but flat. Use the three-light recipe with:
   - Warmer/cooler color contrast between hemisphere up and down
   - Accent light positioned to create dramatic shadows on the focal area
   - Adjust intensity so shadows have depth but fill light prevents pure black areas

4. **Shadow map:** The example uses 2048 resolution. Use 1024 for Chromebook performance and compensate with slightly higher blur kernel.

5. **Interactivity:** Go beyond buttons — add clickable objects in the 3D scene, draggable elements, slider controls for variables, toggle switches for conditions.
