---
name: 2d-activity
description: >
  Generate lightweight 2D interactive HTML activities using Canvas, SVG, or vanilla JS — no Babylon.js.
  Use this skill whenever the user asks to create a 2D activity, interactive diagram, drag-and-drop exercise,
  canvas simulation, graphing tool, sorting activity, matching exercise, interactive timeline, evidence board,
  data visualization, or any interactive HTML that doesn't need 3D rendering. Also trigger when someone says
  "make an interactive for [topic]", "build a drag-and-drop", "create a labeling activity",
  "interactive graph", "virtual lab that doesn't need 3D", or wants a lightweight alternative to a full
  Babylon.js simulation. If the request clearly needs 3D spatial reasoning (rotating objects, 3D scenes,
  camera orbiting), use the 3d-activity skill instead — but if 2D can do the job, prefer this skill
  because it's faster to load and runs better on Chromebooks.
disable-model-invocation: true
argument-hint: "[topic] [optional file paths for context]"
---

## What This Skill Does

Generates a standalone, self-contained HTML file with a lightweight 2D interactive activity. Uses HTML5 Canvas, SVG, CSS animations, and vanilla ES6+ JavaScript — no heavy 3D engine. Integrates with Porter Portal's Proctor Bridge and matches the portal's dark theme.

**Subjects:** AP Physics 1, Honors Physics, Forensic Science
**Output:** Single HTML file saved to `/home/kp/Desktop/Simulations/<class>/`

For 2D interaction patterns, Canvas recipes, and activity archetypes, see [2d-patterns.md](2d-patterns.md).
For the shared Proctor Bridge and dark theme, see [portal-bridge.md](../shared/portal-bridge.md).

---

## When to Use This vs. 3d-activity

| Use **2d-activity** | Use **3d-activity** |
|---|---|
| Graphs, charts, bar charts | 3D spatial scenes (rooms, labs) |
| Drag-and-drop sorting/matching | Rotating 3D objects |
| Interactive diagrams with labels | Camera orbit/pan exploration |
| Sliders controlling 2D visualizations | Force vectors in 3D space |
| Evidence boards, timelines | Crime scene walkthroughs |
| Canvas-based physics (projectile paths, wave plots) | Full physics sandboxes (dropping objects, collisions in 3D) |
| Flowcharts, process diagrams | Molecular/structural 3D models |

When in doubt, 2D is the right default. It loads instantly on Chromebooks and is easier for students to interact with via trackpad.

---

## Step 1: Parse Arguments

Extract from `<ARGUMENTS>`:

- **Topic/scenario** — the subject of the activity (e.g., "free body diagrams", "evidence classification", "wave superposition")
- **File paths** (optional) — paths to PDFs, images, or documents providing context

If file paths are provided, read each one to understand:
- What the activity needs to teach or practice
- What data, diagrams, or scenarios to include
- What questions or learning objectives to target

If no arguments are provided, ask: "What topic should I build a 2D interactive activity for? You can also provide file paths to reference materials."

---

## Step 2: Ask Class and Mode

**Class:** Which class is this for?
- AP Physics 1
- Honors Physics
- Forensic Science

This determines the output subdirectory under `/home/kp/Desktop/Simulations/`.

**Mode:** Should this activity be graded or exploratory?
- **Graded** — includes assessment checkpoints, calls `PortalBridge.answer()` and `PortalBridge.complete()`
- **Exploratory** — sandbox/free-explore, only calls `PortalBridge.init()` and `PortalBridge.save()`

---

## Step 3: Choose the Activity Archetype

Before writing code, identify which interaction pattern fits the learning goal. See [2d-patterns.md](2d-patterns.md) for detailed implementations, but here are the core archetypes:

| Archetype | Best For | Core Tech |
|---|---|---|
| **Canvas Simulation** | Physics visualization (trajectories, waves, fields) | HTML5 Canvas + requestAnimationFrame |
| **Drag-and-Drop** | Classification, sorting, matching, sequencing | DOM elements + pointer events |
| **Interactive Diagram** | Labeling, annotation, system identification | SVG or positioned DOM + click/hover |
| **Slider Explorer** | Parameter sweeps, "what if" scenarios | Range inputs + real-time Canvas redraw |
| **Data Builder** | Graphing, data collection, bar chart construction | Canvas grid + click-to-plot or drag bars |
| **Evidence Board** | Forensic analysis, clue organization, hypothesis building | Cards + drag-to-zone + connections |
| **Sequencer** | Process ordering, timeline construction | Sortable list + validation |

Most activities combine 2-3 archetypes. A projectile motion explorer uses Slider Explorer + Canvas Simulation. An evidence classification activity uses Drag-and-Drop + Evidence Board.

---

## Step 4: Design the Activity

Plan before coding:

1. **Educational goal** — what concept or skill the student practices
2. **Visual layout** — what the student sees (canvas area, control panel, info display)
3. **Interactions** — what the student does (drag, click, adjust, draw, sort)
4. **Feedback** — how the activity responds (animations, color changes, score updates, explanatory text)
5. **State** — what data to preserve via PortalBridge.save() (positions, answers, progress)
6. **Assessment** (graded mode only) — checkpoints, correct answers, scoring logic

---

## Step 5: Generate the HTML File

Write a single self-contained HTML file following this structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>[Activity Title]</title>
    <style>
        /* All CSS inline — use portal dark theme variables */
    </style>
</head>
<body>
    <script>/* Proctor Bridge */</script>

    <div id="activity-container">
        <header class="activity-header">
            <h1>[Activity Title]</h1>
            <p class="subtitle">[Brief educational context]</p>
        </header>

        <div class="activity-workspace">
            <!-- Canvas, SVG, or interactive DOM elements -->
        </div>

        <div class="controls-panel">
            <!-- Sliders, buttons, toggles, info display -->
        </div>
    </div>

    <script>
        /* Activity logic — vanilla ES6+ */
    </script>
</body>
</html>
```

### Proctor Bridge & Dark Theme

Use the shared patterns from [portal-bridge.md](../shared/portal-bridge.md). Include the PortalBridge snippet and use the portal's CSS variables for all colors.

### Technical Requirements

**JavaScript:**
- Vanilla ES6+ only — no frameworks, no jQuery
- Use `const`/`let`, arrow functions, template literals, destructuring
- All state in a single `state` object for clean save/restore via PortalBridge
- Use `requestAnimationFrame` for animations — never `setInterval`
- Pointer Events API (`pointerdown`, `pointermove`, `pointerup`) for unified mouse+touch handling — not separate mouse and touch listeners
- Graceful error handling: wrap initialization in try/catch, show a user-visible error message if something fails

**Canvas (when used):**
- Get context once, store it: `const ctx = canvas.getContext('2d')`
- Handle high-DPI displays: scale canvas by `Math.min(devicePixelRatio, 2)`, then use CSS to set display size
- Clear and redraw each frame — no persistent canvas state between frames
- Use `canvas.getBoundingClientRect()` for coordinate mapping from pointer events

**SVG (when used):**
- Inline SVG in the HTML — no external files
- Use `viewBox` for responsive scaling
- Prefer SVG for diagrams with labels and clickable regions; prefer Canvas for physics animations with many moving objects

**CSS:**
- Portal dark theme variables from [portal-bridge.md](../shared/portal-bridge.md)
- Responsive: activity must work on 1366x768 Chromebook screens (the most common resolution)
- Glassmorphism panels: `backdrop-filter: blur(14px); background: var(--panel-bg); border: 1px solid var(--border); border-radius: 14px;`
- Minimum 44px touch targets for all interactive elements
- Smooth transitions on state changes (0.2-0.3s ease)
- `user-select: none` on draggable elements and canvas
- `touch-action: none` on canvas and drag surfaces

**Accessibility:**
- Semantic HTML structure (header, main, section, button — not div soup)
- ARIA labels on all interactive elements: buttons, sliders, draggable items, canvas
- `role="img"` and `aria-label` on Canvas elements describing what's shown
- Keyboard support: Tab navigation through controls, Enter/Space to activate, arrow keys for fine adjustments where applicable
- Visible focus indicators (outline, not just color change)
- Color is never the only indicator — pair with shape, pattern, label, or icon
- `prefers-reduced-motion` media query: disable non-essential animations

**Performance:**
- No heavy libraries. Allowed CDNs: KaTeX (for math rendering if needed). D3.js only if the activity genuinely needs complex data visualization that would be painful to hand-code.
- Canvas animations should target 30fps minimum on Chromebook hardware
- Debounce slider inputs that trigger expensive redraws (16ms minimum)
- Limit particle/object count — if you're drawing more than 500 objects per frame, rethink the approach

### Drag-and-Drop Implementation

When the activity uses drag-and-drop, follow these patterns to avoid common bugs:

```javascript
// Use Pointer Events — they handle mouse, touch, and pen
element.addEventListener('pointerdown', startDrag);
document.addEventListener('pointermove', moveDrag);
document.addEventListener('pointerup', endDrag);

function startDrag(e) {
    e.preventDefault();
    element.setPointerCapture(e.pointerId); // Critical: captures pointer even if it leaves the element
    // Store offset between pointer and element origin
}
```

- Always call `setPointerCapture()` on pointerdown — this prevents drag from breaking when the pointer leaves the element bounds
- Use `transform: translate()` for positioning dragged elements, not `left`/`top` — it's GPU-accelerated and doesn't trigger layout
- Add `will-change: transform` to draggable elements
- Show a visual drop zone highlight when dragging over valid targets
- Snap to grid or target position on drop — don't leave items floating between zones

### Canvas Physics Patterns

When the activity simulates physics on a 2D canvas:

- Use real units internally (meters, seconds, m/s) and convert to pixels only for drawing
- Scale factor: define a `PIXELS_PER_METER` constant
- Time step: use `requestAnimationFrame` with delta time, not fixed step
- Common equations to get right:
  - Projectile: `x = x0 + vx*dt`, `vy = vy + g*dt`, `y = y0 + vy*dt`
  - Spring: `F = -k * displacement`, `a = F/m`
  - Collision: conserve momentum and (optionally) energy
- Draw coordinate axes with labeled tick marks when showing graphs
- Use distinct colors from the portal palette for different data series

---

## Step 6: Save the File

Save to:

```
/home/kp/Desktop/Simulations/<class>/<filename>.html
```

Where:
- `<class>` matches the user's choice: `AP Physics`, `Honors Physics`, or `Forensic Science`
- `<filename>` is descriptive kebab-case (e.g., `free-body-diagram-builder.html`, `evidence-classification.html`)

---

## Step 7: Summary

After writing the file, provide:
- File path where it was saved
- What the activity covers
- What interactions are available
- Archetype(s) used
- Whether it's graded or exploratory
- Any limitations or things to tweak

---

## Notes

- **Output ONLY the HTML file.** Write it with the Write tool — no conversational filler around the file content.
- **No external assets.** Everything inline or from approved CDNs (KaTeX, D3.js if justified). All images, icons, and textures must be procedural (Canvas drawing, CSS shapes, inline SVG).
- **Scientific accuracy matters.** Physics equations, forensic science principles, and educational content must be correct.
- **Chromebook-first.** Optimize for 1366x768, trackpad input, integrated GPU. If an animation stutters on low-end hardware, reduce complexity.
- **2D means 2D.** If you find yourself wanting a camera, orbit controls, or z-depth, use the 3d-activity skill instead.
- **Agent delegation.** After generating the HTML file, delegate to project agents:
  - **qa-bug-resolution** — validate HTML output (accessibility, Proctor Bridge, Chromebook perf). Delegate for graded activities.
  - **content-strategist-ux-writer** — review instructions, labels, question wording. Delegate when the activity has assessment questions or complex instructions.
