# 2D Activity Patterns Reference

Detailed interaction patterns and code recipes for building 2D interactive activities. Read this before writing any activity code.

---

## Table of Contents

1. [Canvas Simulation Pattern](#canvas-simulation)
2. [Drag-and-Drop Pattern](#drag-and-drop)
3. [Interactive Diagram Pattern](#interactive-diagram)
4. [Slider Explorer Pattern](#slider-explorer)
5. [Data Builder Pattern](#data-builder)
6. [Evidence Board Pattern](#evidence-board)
7. [Sequencer Pattern](#sequencer)
8. [State Management](#state-management)
9. [Responsive Layout](#responsive-layout)
10. [Common Pitfalls](#common-pitfalls)

---

## Canvas Simulation

Use for: projectile motion, wave visualization, field lines, particle systems, collision demos.

### Setup

```javascript
const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

// High-DPI scaling
function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Display dimensions (CSS pixels, use these for all drawing logic)
const W = () => canvas.width / Math.min(window.devicePixelRatio, 2);
const H = () => canvas.height / Math.min(window.devicePixelRatio, 2);
```

### Animation Loop

```javascript
let lastTime = 0;
let running = false;

function update(timestamp) {
    if (!running) return;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // Cap dt to prevent spiral of death
    lastTime = timestamp;

    // Physics update
    state.x += state.vx * dt;
    state.vy += state.gravity * dt;
    state.y += state.vy * dt;

    // Draw
    ctx.clearRect(0, 0, W(), H());
    drawBackground();
    drawObjects();
    drawUI();

    requestAnimationFrame(update);
}

function start() {
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(update);
}
```

### Drawing Recipes

**Coordinate axes with grid:**
```javascript
function drawAxes(originX, originY, scaleX, scaleY, labelX, labelY) {
    ctx.strokeStyle = 'rgba(160, 100, 255, 0.3)';
    ctx.lineWidth = 1;

    // Grid lines
    for (let x = originX; x < W(); x += scaleX) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H()); ctx.stroke();
    }
    for (let y = originY; y > 0; y -= scaleY) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W(), y); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = 'var(--text, #e8e4f4)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(originX, 0); ctx.lineTo(originX, H()); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, originY); ctx.lineTo(W(), originY); ctx.stroke();

    // Labels
    ctx.fillStyle = 'var(--muted, #8a85a8)';
    ctx.font = '13px sans-serif';
    ctx.fillText(labelX, W() - 40, originY + 20);
    ctx.fillText(labelY, originX + 10, 20);
}
```

**Arrow / vector:**
```javascript
function drawArrow(x1, y1, x2, y2, color, label) {
    const headLen = 12;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;

    // Shaft
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
    ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();

    // Label
    if (label) {
        ctx.font = 'bold 14px sans-serif';
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        ctx.fillText(label, midX + 8, midY - 8);
    }
}
```

**Traced path (trajectory dots):**
```javascript
const trail = []; // Array of {x, y}

function recordTrail(x, y) {
    trail.push({ x, y });
    if (trail.length > 300) trail.shift();
}

function drawTrail() {
    for (let i = 0; i < trail.length; i++) {
        const alpha = i / trail.length;
        ctx.fillStyle = `rgba(96, 165, 250, ${alpha * 0.7})`;
        ctx.beginPath();
        ctx.arc(trail[i].x, trail[i].y, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
}
```

---

## Drag-and-Drop

Use for: classification, sorting, matching, labeling, ordering.

### DOM-Based Drag (preferred for labeled items)

```javascript
const items = document.querySelectorAll('.draggable');
const zones = document.querySelectorAll('.drop-zone');

let activeItem = null;
let offsetX, offsetY;

items.forEach(item => {
    item.addEventListener('pointerdown', e => {
        e.preventDefault();
        activeItem = item;
        item.setPointerCapture(e.pointerId);

        const rect = item.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        item.style.zIndex = '100';
        item.classList.add('dragging');
    });
});

document.addEventListener('pointermove', e => {
    if (!activeItem) return;
    const containerRect = document.getElementById('activity-container').getBoundingClientRect();
    activeItem.style.transform = `translate(${e.clientX - containerRect.left - offsetX}px, ${e.clientY - containerRect.top - offsetY}px)`;
});

document.addEventListener('pointerup', e => {
    if (!activeItem) return;

    // Check drop zones
    const itemRect = activeItem.getBoundingClientRect();
    let dropped = false;

    zones.forEach(zone => {
        const zoneRect = zone.getBoundingClientRect();
        if (rectsOverlap(itemRect, zoneRect)) {
            zone.appendChild(activeItem);
            activeItem.style.transform = '';
            dropped = true;
            zone.classList.add('has-item');
            checkAnswer(activeItem, zone);
        }
    });

    if (!dropped) {
        // Snap back to origin
        activeItem.style.transform = '';
    }

    activeItem.style.zIndex = '';
    activeItem.classList.remove('dragging');
    activeItem = null;
});

function rectsOverlap(a, b) {
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}
```

### CSS for Draggables

```css
.draggable {
    padding: 10px 16px;
    background: var(--panel-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    cursor: grab;
    user-select: none;
    touch-action: none;
    will-change: transform;
    transition: box-shadow 0.2s, border-color 0.2s;
    min-height: 44px;
    display: flex;
    align-items: center;
}
.draggable.dragging {
    cursor: grabbing;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    border-color: var(--blue);
    opacity: 0.9;
}
.drop-zone {
    min-height: 60px;
    border: 2px dashed var(--border);
    border-radius: 12px;
    padding: 12px;
    transition: border-color 0.2s, background 0.2s;
}
.drop-zone.hover {
    border-color: var(--blue);
    background: rgba(91, 156, 246, 0.08);
}
.drop-zone.correct {
    border-color: var(--green);
    background: rgba(34, 212, 122, 0.08);
}
.drop-zone.incorrect {
    border-color: var(--red);
    background: rgba(232, 80, 74, 0.08);
}
```

---

## Interactive Diagram

Use for: labeling anatomy, identifying circuit components, annotating crime scenes, identifying forces on a free body diagram.

### SVG-Based (best for diagrams with clickable regions)

```html
<svg viewBox="0 0 800 600" id="diagram" role="img" aria-label="Interactive diagram of [subject]">
    <!-- Background image or drawing -->
    <rect width="800" height="600" fill="var(--bg)" />

    <!-- Clickable hotspots -->
    <circle class="hotspot" cx="200" cy="300" r="20" data-label="Component A"
            fill="transparent" stroke="var(--blue)" stroke-width="2"
            tabindex="0" role="button" aria-label="Identify this component" />

    <!-- Label that appears on click -->
    <g class="label-group" data-for="Component A" style="display:none">
        <rect x="160" y="250" width="120" height="30" rx="6"
              fill="var(--panel-bg)" stroke="var(--border)" />
        <text x="220" y="270" text-anchor="middle" fill="var(--text)"
              font-size="14">Component A</text>
    </g>
</svg>
```

```javascript
document.querySelectorAll('.hotspot').forEach(spot => {
    const handler = () => {
        const label = spot.dataset.label;
        // Toggle label visibility, update state, check answers
    };
    spot.addEventListener('click', handler);
    spot.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
});
```

---

## Slider Explorer

Use for: parameter sweeps, "what happens if I change the angle?", real-time equation visualization.

### Pattern

```html
<div class="slider-group">
    <label for="angle-slider">Launch Angle: <span id="angle-value">45</span>&deg;</label>
    <input type="range" id="angle-slider" min="0" max="90" value="45"
           aria-label="Launch angle in degrees">
</div>
```

```javascript
const angleSlider = document.getElementById('angle-slider');
const angleDisplay = document.getElementById('angle-value');

let redrawQueued = false;

angleSlider.addEventListener('input', () => {
    angleDisplay.textContent = angleSlider.value;
    state.angle = Number(angleSlider.value);

    // Debounced redraw
    if (!redrawQueued) {
        redrawQueued = true;
        requestAnimationFrame(() => {
            redraw();
            redrawQueued = false;
        });
    }
});
```

### Slider CSS

```css
.slider-group {
    margin: 8px 0;
}
.slider-group label {
    display: block;
    font-size: 14px;
    color: var(--text);
    margin-bottom: 4px;
}
input[type="range"] {
    width: 100%;
    height: 6px;
    -webkit-appearance: none;
    background: rgba(160, 100, 255, 0.2);
    border-radius: 3px;
    outline: none;
}
input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--purple);
    cursor: pointer;
    border: 2px solid var(--text);
}
input[type="range"]:focus {
    outline: 2px solid var(--blue);
    outline-offset: 4px;
    border-radius: 3px;
}
```

---

## Data Builder

Use for: plotting data from experiments, building bar charts (energy, momentum), collecting measurements.

### Click-to-Plot on Canvas

```javascript
canvas.addEventListener('pointerdown', e => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert pixel to data coordinates
    const dataX = (x - originX) / scaleX;
    const dataY = (originY - y) / scaleY;

    state.dataPoints.push({ x: dataX, y: dataY });
    redraw();
    PortalBridge.save(state, 0);
});
```

### Bar Chart Builder

```javascript
function drawBarChart(bars, x0, y0, barWidth, maxHeight) {
    const maxVal = Math.max(...bars.map(b => b.value), 1);

    bars.forEach((bar, i) => {
        const barH = (bar.value / maxVal) * maxHeight;
        const bx = x0 + i * (barWidth + 8);
        const by = y0 - barH;

        // Bar
        ctx.fillStyle = bar.color || 'var(--blue)';
        ctx.fillRect(bx, by, barWidth, barH);

        // Label
        ctx.fillStyle = 'var(--text, #e8e4f4)';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(bar.label, bx + barWidth / 2, y0 + 16);

        // Value
        ctx.fillText(bar.value.toFixed(1), bx + barWidth / 2, by - 6);
    });
}
```

---

## Evidence Board

Use for: forensic activities — organizing clues, connecting evidence to suspects, building arguments.

This is a combination of Drag-and-Drop + visual connections. Items are cards that can be dragged between zones (categories, suspect profiles, hypothesis columns). Lines or arrows connect related items.

### Connection Drawing

```javascript
function drawConnections() {
    state.connections.forEach(conn => {
        const from = document.getElementById(conn.from).getBoundingClientRect();
        const to = document.getElementById(conn.to).getBoundingClientRect();
        const container = document.getElementById('board').getBoundingClientRect();

        const x1 = from.left + from.width / 2 - container.left;
        const y1 = from.top + from.height / 2 - container.top;
        const x2 = to.left + to.width / 2 - container.left;
        const y2 = to.top + to.height / 2 - container.top;

        // Draw on an overlay canvas
        connCtx.strokeStyle = conn.color || 'var(--purple)';
        connCtx.lineWidth = 2;
        connCtx.setLineDash([6, 4]);
        connCtx.beginPath();
        connCtx.moveTo(x1, y1);
        connCtx.lineTo(x2, y2);
        connCtx.stroke();
        connCtx.setLineDash([]);
    });
}
```

---

## Sequencer

Use for: ordering steps in a process, building timelines, arranging events chronologically.

### Sortable List

```javascript
let draggedItem = null;

document.querySelectorAll('.seq-item').forEach(item => {
    item.addEventListener('pointerdown', e => {
        draggedItem = item;
        item.classList.add('dragging');
    });

    item.addEventListener('pointerenter', () => {
        if (!draggedItem || draggedItem === item) return;
        const list = item.parentNode;
        const items = [...list.children];
        const dragIdx = items.indexOf(draggedItem);
        const hoverIdx = items.indexOf(item);

        if (dragIdx < hoverIdx) {
            list.insertBefore(draggedItem, item.nextSibling);
        } else {
            list.insertBefore(draggedItem, item);
        }
    });
});

document.addEventListener('pointerup', () => {
    if (draggedItem) {
        draggedItem.classList.remove('dragging');
        draggedItem = null;
        checkSequenceOrder();
    }
});
```

---

## State Management

Every activity stores its state in a single object and saves it periodically:

```javascript
const state = {
    // Activity-specific data
    answers: {},
    positions: [],
    dataPoints: [],
    score: 0,
    completed: false
};

// Save on every meaningful interaction
function saveState() {
    PortalBridge.save(state, 0);
}

// Restore on load (if the portal sends saved state back)
window.addEventListener('message', e => {
    if (e.data?.type === 'RESTORE_STATE' && e.data.state) {
        Object.assign(state, e.data.state);
        redraw();
    }
});
```

---

## Responsive Layout

Activities should work on Chromebook screens (1366x768) down to tablet portrait (768x1024).

```css
#activity-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
}

.activity-header {
    padding: 16px 20px;
    flex-shrink: 0;
}

.activity-workspace {
    flex: 1;
    position: relative;
    overflow: hidden;
    min-height: 0; /* Prevents flex child from overflowing */
}

.controls-panel {
    padding: 12px 20px;
    flex-shrink: 0;
    backdrop-filter: blur(14px);
    background: var(--panel-bg);
    border-top: 1px solid var(--border);
}

/* Side-by-side on wider screens */
@media (min-width: 900px) {
    .activity-body {
        display: flex;
        flex: 1;
        min-height: 0;
    }
    .activity-workspace {
        flex: 1;
    }
    .controls-panel {
        width: 280px;
        flex-shrink: 0;
        border-top: none;
        border-left: 1px solid var(--border);
        overflow-y: auto;
    }
}
```

---

## Common Pitfalls

These cause the most bugs — internalize them:

1. **Forgetting `setPointerCapture`** — Drag breaks when pointer leaves the element. Always capture.
2. **Using `clientX/Y` without subtracting container offset** — Coordinates are wrong if the activity isn't at (0,0) in the viewport.
3. **Canvas not clearing between frames** — Ghosting artifacts. Always `clearRect` the full canvas.
4. **Fixed pixel dimensions on canvas** — Breaks on different screen sizes. Always use the resize handler.
5. **`setInterval` for animation** — Drifts, doesn't sync with display. Use `requestAnimationFrame`.
6. **Not capping `dt`** — If the tab is backgrounded, `dt` spikes and physics explodes. Cap at 0.05s.
7. **`var(--color)` inside Canvas API** — Canvas `fillStyle` doesn't resolve CSS variables. Use the computed value: `getComputedStyle(document.documentElement).getPropertyValue('--blue').trim()` once at init and store it.
8. **No keyboard support on custom interactive elements** — Add `tabindex="0"` and keydown listeners. Screen reader users exist.
9. **Drag-and-drop using `left`/`top`** — Triggers layout reflow every frame. Use `transform: translate()`.
10. **Not debouncing slider-driven redraws** — Slider fires dozens of events per second. Queue one redraw per animation frame.
