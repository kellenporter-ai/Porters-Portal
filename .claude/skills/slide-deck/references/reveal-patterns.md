# Reveal.js Patterns & Theme Presets

Reference for the slide-deck skill. Read this when you need specific theme colors, animation recipes, or Reveal.js patterns beyond what SKILL.md covers.

---

## Theme Presets

Each preset defines colors, fonts, background animation, and a default transition. Pick the one that best fits the content, or let the user choose.

### Deep Space (default for Physics)
Best for: AP Physics, Honors Physics, science lectures
- **Palette:** `#0f0720` (bg), `#1a0a3e` (bg-secondary), `#5b9cf6` (accent), `#22d47a` (highlight), `#e8e4f4` (text)
- **Fonts:** Outfit (headings, weight 800) + Inter (body, weight 300-400)
- **Background:** Slow gradient shift — indigo → deep purple → dark blue, 20s cycle
- **Transition:** `slide` with `fade` background transition
- **Vibe:** The portal's native look — familiar to students, matches the app they use daily

```css
:root {
    --bg-primary: #0f0720;
    --bg-secondary: #1a0a3e;
    --bg-tertiary: #0d1f4a;
    --text-primary: #e8e4f4;
    --text-muted: #8a85a8;
    --accent: #5b9cf6;
    --highlight: #22d47a;
    --warning: #f5a623;
    --danger: #e8504a;
}
.reveal {
    background: linear-gradient(135deg, var(--bg-primary), var(--bg-secondary), var(--bg-tertiary));
    background-size: 400% 400%;
    animation: gradientShift 20s ease infinite;
}
```

### Noir Lab (default for Forensic Science)
Best for: Forensic Science, crime scenes, evidence analysis
- **Palette:** `#0a0a0f` (bg), `#1a1a2e` (bg-secondary), `#e8504a` (accent), `#f5a623` (highlight/evidence), `#c8c8d4` (text)
- **Fonts:** JetBrains Mono (headings, weight 700) + Inter (body)
- **Background:** Very slow pulse between near-black and dark navy, 25s cycle
- **Transition:** `fade` with slow speed
- **Vibe:** Crime lab, redacted files, evidence under examination

```css
:root {
    --bg-primary: #0a0a0f;
    --bg-secondary: #1a1a2e;
    --bg-tertiary: #0f1528;
    --text-primary: #c8c8d4;
    --text-muted: #6a6a7e;
    --accent: #e8504a;
    --highlight: #f5a623;
    --warning: #f5a623;
    --danger: #e8504a;
}
```

### Clean Slate (for Parents / Admin / PD)
Best for: Parent nights, admin presentations, professional development
- **Palette:** `#0f172a` (bg), `#1e293b` (bg-secondary), `#3b82f6` (accent), `#10b981` (highlight), `#f1f5f9` (text)
- **Fonts:** Inter (headings, weight 700) + Inter (body, weight 400)
- **Background:** Subtle dark blue static gradient (no animation, or very slow 30s shift)
- **Transition:** `fade` at default speed
- **Vibe:** Professional, trustworthy, easy to read from the back of a cafeteria

```css
:root {
    --bg-primary: #0f172a;
    --bg-secondary: #1e293b;
    --bg-tertiary: #1e3a5f;
    --text-primary: #f1f5f9;
    --text-muted: #94a3b8;
    --accent: #3b82f6;
    --highlight: #10b981;
    --warning: #f59e0b;
    --danger: #ef4444;
}
```

### Neon Pulse (for high-energy topics)
Best for: Engaging review sessions, game-related presentations, RPG-themed content
- **Palette:** `#0a0014` (bg), `#1a0030` (bg-secondary), `#9b6bff` (accent/purple), `#00f0ff` (highlight/cyan), `#f0e8ff` (text)
- **Fonts:** Bebas Neue (headings, weight 400) + Open Sans (body)
- **Background:** Diagonal gradient with purple → magenta → dark blue, 15s cycle — slightly faster for energy
- **Transition:** `convex` for a subtle 3D feel
- **Vibe:** Arcade, cyber-operative, high energy — use sparingly, not for every lecture

```css
:root {
    --bg-primary: #0a0014;
    --bg-secondary: #1a0030;
    --bg-tertiary: #0d0028;
    --text-primary: #f0e8ff;
    --text-muted: #7a6a9e;
    --accent: #9b6bff;
    --highlight: #00f0ff;
    --warning: #ff6b9d;
    --danger: #ff4444;
}
```

---

## Background Animation Recipes

### Slow Gradient Shift (most common)
```css
@keyframes gradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}
.reveal {
    background: linear-gradient(135deg, var(--bg-primary), var(--bg-secondary), var(--bg-tertiary));
    background-size: 400% 400%;
    animation: gradientShift 20s ease infinite;
}
```

### Subtle Radial Pulse
```css
@keyframes radialPulse {
    0%, 100% { background-size: 100% 100%; }
    50% { background-size: 120% 120%; }
}
.reveal {
    background: radial-gradient(ellipse at 30% 50%, var(--bg-secondary), var(--bg-primary));
    animation: radialPulse 25s ease-in-out infinite;
}
```

### Floating Orbs (CSS-only, lightweight)
Use pseudo-elements for 2-3 blurred orbs that drift slowly:
```css
.reveal::before,
.reveal::after {
    content: '';
    position: fixed;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.15;
    z-index: -1;
    pointer-events: none;
}
.reveal::before {
    width: 40vw; height: 40vw;
    background: var(--accent);
    top: -10vh; left: -10vw;
    animation: orbFloat1 30s ease-in-out infinite;
}
.reveal::after {
    width: 30vw; height: 30vw;
    background: var(--highlight);
    bottom: -10vh; right: -10vw;
    animation: orbFloat2 25s ease-in-out infinite;
}
@keyframes orbFloat1 {
    0%, 100% { transform: translate(0, 0); }
    33% { transform: translate(15vw, 10vh); }
    66% { transform: translate(-5vw, 20vh); }
}
@keyframes orbFloat2 {
    0%, 100% { transform: translate(0, 0); }
    33% { transform: translate(-10vw, -15vh); }
    66% { transform: translate(10vw, -5vh); }
}
```

### Static (no animation)
For professional contexts or when projecting over slow hardware:
```css
.reveal {
    background: linear-gradient(160deg, var(--bg-primary), var(--bg-secondary));
}
```

---

## Transition Reference

Reveal.js built-in transitions, from most to least subtle:

| Transition | Effect | Best For |
|---|---|---|
| `none` | Instant switch | Fast-paced reviews, lots of slides |
| `fade` | Cross-dissolve | Professional, calm, forensic |
| `slide` | Horizontal slide | Default, feels natural |
| `convex` | 3D convex rotation | Energetic, engaging |
| `concave` | 3D concave rotation | Dramatic reveals |
| `zoom` | Zoom in/out | Emphasis moments (use sparingly) |

Mix transitions per-slide with `data-transition`:
```html
<section data-transition="zoom"><!-- Big reveal --></section>
<section data-transition="fade"><!-- Back to normal --></section>
```

---

## Fragment Animations

Reveal content incrementally within a slide:

```html
<p class="fragment fade-up">Appears with upward fade</p>
<p class="fragment fade-in">Simple fade in</p>
<p class="fragment highlight-blue">Text turns blue</p>
<p class="fragment grow">Grows slightly</p>
<p class="fragment shrink">Shrinks slightly</p>
<p class="fragment strike">Gets strikethrough (great for misconceptions)</p>
```

Fragment order control:
```html
<p class="fragment" data-fragment-index="2">Second</p>
<p class="fragment" data-fragment-index="1">First</p>
```

---

## KaTeX Integration

When slides include math (physics especially), load KaTeX:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/contrib/auto-render.min.js"></script>
```

Initialize after Reveal:
```javascript
Reveal.initialize({ /* ... */ }).then(() => {
    renderMathInElement(document.body, {
        delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
        ]
    });
});
```

Usage in slides:
```html
<p>Newton's Second Law: $\vec{F}_{net} = m\vec{a}$</p>
<p>$$v^2 = v_0^2 + 2a\Delta x$$</p>
```

---

## Image Placeholder Pattern

Since we can't embed real photos, use styled placeholder cards:

```html
<div class="image-placeholder">
    <div class="placeholder-icon">📸</div>
    <div class="placeholder-label">Free body diagram of a block on a 30° incline</div>
</div>
```

```css
.image-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 60%;
    aspect-ratio: 16/9;
    margin: 1em auto;
    border: 2px dashed var(--text-muted);
    border-radius: 12px;
    background: rgba(255,255,255,0.03);
    padding: 2em;
}
.placeholder-icon { font-size: 3em; margin-bottom: 0.3em; }
.placeholder-label { color: var(--text-muted); font-style: italic; text-align: center; }
```

Suggest the user run `/generate-image` for real visuals. Include the description in the placeholder so they know exactly what image to generate.

---

## Responsive / Projection Notes

- Reveal.js handles scaling automatically via `width`/`height` config
- Use `1920x1080` as the base — it scales down gracefully to 1366x768 Chromebook projector output
- Test at browser zoom 100% — Reveal handles the rest
- Avoid absolute pixel positioning inside slides; use flexbox/grid and em/rem units
- Speaker view ('S' key) opens a separate window — remind the teacher about this in the summary
