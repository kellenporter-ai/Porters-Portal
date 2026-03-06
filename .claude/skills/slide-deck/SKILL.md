---
name: slide-deck
description: >
  Generate polished, presentation-ready HTML slide decks using Reveal.js with modern design,
  dynamic backgrounds, and smooth transitions. Use this skill whenever the user mentions
  slide deck, presentation, slides, lecture slides, PowerPoint, keynote, make a deck,
  build slides for class, present this topic, turn this into a presentation, slideshow,
  or wants content transformed into a visual presentation format. Also trigger when an agent
  in the dev-pipeline needs to create a slide deck to enhance content it is producing, or when
  the user says things like "I need to present this to my students", "make this into slides",
  "create a lecture deck", "build a presentation from this PDF", or "slide deck for parent night".
  Prefer this skill over study-guide when the user's intent is presentation/projection, not
  student self-study.
argument-hint: "[topic or file path] [optional: audience context]"
---

## What This Skill Does

Generates a standalone, self-contained HTML file using Reveal.js that can be opened in any browser and projected in a classroom. The deck features modern design, subtle animated backgrounds, smooth transitions, and visual storytelling — minimal text, maximum impact.

**Primary audience:** Students in class (projected by the teacher)
**Secondary audiences:** Parent nights, admin presentations, professional development, student self-review
**Output:** Single HTML file saved to `~/Desktop/Presentations/<class>/`

For Reveal.js patterns, theme presets, and animation recipes, see [references/reveal-patterns.md](references/reveal-patterns.md).

---

## Step 1: Parse Arguments & Ingest Content

Extract from `<ARGUMENTS>`:

- **Topic or file path(s)** — either a topic string ("projectile motion") or paths to source content (PDFs, lesson block JSON, reading materials, other documents)
- **Audience context** (optional) — "for parent night", "for students", "for admin"

If file paths are provided, read each one to extract:
- Key concepts, data, and narrative structure
- Visual opportunities (diagrams, charts, data that could become graphs)
- Logical flow and section breaks

If no arguments are provided, ask: "What should the presentation cover? You can give me a topic, paste content, or provide file paths to source materials."

---

## Step 2: Determine Context

Ask the user (or infer from the arguments if the context is clear):

**Class:** Which class is this for?
- AP Physics 1
- Honors Physics
- Forensic Science
- General / Other (for non-class presentations)

**Audience:** Who is this being presented to?
- Students in class (default) — educational, engaging, age-appropriate
- Parents/guardians — accessible, highlights student learning
- Admin/PD — professional, data-informed, pedagogical framing
- Other — adapt to stated context

Skip asking about class/audience if the context is obvious from the arguments or conversation history. When called by another agent (like dev-pipeline), infer from the calling context and proceed without asking.

---

## Step 3: Creative Direction

Before generating slides, briefly propose the creative treatment. This keeps the user aligned on aesthetics before you invest in the full build. Keep it to 3-4 lines:

- **Theme:** color palette name and mood (e.g., "Deep Space — dark indigo to purple, cyan accents")
- **Typography:** title and body font pairing
- **Background:** the dynamic effect (e.g., "slow-drifting CSS gradient, indigo → deep purple")
- **Transitions:** primary slide transition style

Then ask: "Does this direction work, or would you prefer a different feel?"

**When to skip this step:** If called by another agent programmatically, or if the user says "just make it" or gives urgency cues, pick a sensible default from the theme presets in [references/reveal-patterns.md](references/reveal-patterns.md) and proceed directly to generation.

---

## Step 4: Design the Slide Structure

Plan the deck before writing code. A good presentation follows this arc:

1. **Title slide** — topic, class/date, teacher name (Mr. Porter)
2. **Hook** — a compelling question, image prompt, or surprising fact to grab attention
3. **Core content slides** (3-8 depending on topic depth) — one key idea per slide
4. **Visual/interactive break** — a diagram, chart, demo reference, or think-pair-share prompt
5. **Summary/takeaway** — the 2-3 things students should remember
6. **Next steps** (optional) — what's coming next, assignments, or call to action

Slide design principles:
- **6 words per line, 6 lines per slide maximum** — this is a presentation, not a document
- **Every slide gets a visual** — icon suggestion, diagram description, chart, or image placeholder
- **Speaker notes carry the detail** — the slide shows the headline, the notes have the full explanation
- **Progressive disclosure** — use Reveal.js fragments to reveal bullet points one at a time

### ISLE Structure (when appropriate)

For instructional content in Physics or Forensic Science, consider mapping the deck to the ISLE cycle:
- **Observation slides** — present the phenomenon, data, or case evidence
- **Hypothesis slides** — prompt students to propose explanations
- **Testing slides** — walk through the experiment or analysis
- **Application slides** — connect to real-world contexts

This is a natural fit, not a rigid requirement. Use it when the content is instructional; skip it for informational decks (parent night, admin presentations).

---

## Step 5: Generate the HTML File

Write a single self-contained HTML file. All CSS, JS, and Reveal.js are loaded from CDN. No external assets except approved CDNs.

### File Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[Presentation Title]</title>

    <!-- Reveal.js from CDN -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/theme/black.css" id="theme">

    <style>
        /* Custom theme overrides — colors, typography, backgrounds */
        /* Dynamic background animations */
        /* Speaker notes styling */
    </style>
</head>
<body>
    <div class="reveal">
        <div class="slides">
            <section><!-- Each section = one slide --></section>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/reveal.js@5/dist/reveal.js"></script>
    <script>
        Reveal.initialize({
            hash: true,
            transition: 'slide',
            backgroundTransition: 'fade',
            // ... config
        });
    </script>
</body>
</html>
```

### Reveal.js Configuration

```javascript
Reveal.initialize({
    hash: true,
    history: true,
    transition: 'slide',        // or 'fade', 'convex', 'zoom' per creative direction
    backgroundTransition: 'fade',
    transitionSpeed: 'default',
    center: true,
    controls: true,
    controlsTutorial: true,     // helps first-time users
    progress: true,
    slideNumber: 'c/t',         // shows "3/12" style
    keyboard: true,
    overview: true,             // Esc for bird's-eye view
    width: 1920,
    height: 1080,
    margin: 0.04,
    // Speaker notes with 'S' key
    plugins: []                 // keep minimal — no plugin CDNs needed for core features
});
```

### Dynamic Backgrounds

Use CSS animations for subtle, non-distracting motion. Defined in [references/reveal-patterns.md](references/reveal-patterns.md), but the core pattern:

```css
.reveal {
    background: linear-gradient(135deg, #0f0720, #1a0a3e, #0d1f4a);
    background-size: 400% 400%;
    animation: gradientShift 20s ease infinite;
}
@keyframes gradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}
```

Adapt gradient colors to the chosen theme. The animation should be slow enough that you barely notice it — it creates ambiance, not distraction. Per-slide backgrounds can override the global background using `data-background-color` or `data-background-gradient` for emphasis slides.

### Typography

Use Google Fonts loaded from CDN. Pair a display font for headings with a clean sans-serif for body. Common pairings from the presets:

- **Tech/Science:** Inter + JetBrains Mono
- **Modern:** Outfit + Inter
- **Classic:** Playfair Display + Source Sans Pro
- **Bold:** Bebas Neue + Open Sans

```html
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
```

### Slide Content Patterns

**Title slide:**
```html
<section data-background-gradient="radial-gradient(circle at 30% 50%, #1a0a3e, #0f0720)">
    <h1 style="font-size: 3.5em; font-weight: 800;">Projectile Motion</h1>
    <h3 style="color: var(--accent); font-weight: 300;">AP Physics 1 — Unit 2</h3>
    <p style="color: var(--muted); margin-top: 2em;">Mr. Porter</p>
</section>
```

**Content slide with fragments:**
```html
<section>
    <h2>Key Principles</h2>
    <ul>
        <li class="fragment fade-up">Horizontal and vertical motion are independent</li>
        <li class="fragment fade-up">Only gravity acts vertically (no air resistance)</li>
        <li class="fragment fade-up">Horizontal velocity remains constant</li>
    </ul>
    <aside class="notes">
        Walk through each point. Ask students to predict what happens
        if you throw a ball horizontally vs dropping it...
    </aside>
</section>
```

**Visual emphasis slide:**
```html
<section data-background-color="#0d1f4a">
    <h2 style="font-size: 2.5em;">Think About It</h2>
    <p style="font-size: 1.4em; color: var(--accent);">
        If you drop a ball and throw one horizontally at the same time,<br>
        which hits the ground first?
    </p>
    <p class="fragment" style="font-size: 1.8em; color: var(--highlight);">They land at the same time.</p>
</section>
```

### Speaker Notes

Every content slide should include `<aside class="notes">` with:
- What to say when presenting this slide
- Key points to emphasize
- Questions to ask students
- Transition phrases to the next slide

Speaker notes are visible in Reveal.js speaker view (press 'S'). They are essential — they carry the instructional substance while the slides stay visually clean.

### Custom CSS Variables

Define a consistent set of CSS custom properties that the theme presets populate:

```css
:root {
    --bg-primary: #0f0720;
    --bg-secondary: #1a0a3e;
    --text-primary: #e8e4f4;
    --text-muted: #8a85a8;
    --accent: #5b9cf6;
    --highlight: #22d47a;
    --warning: #f5a623;
}
```

### Accessibility

- Sufficient contrast ratios (WCAG AA minimum) between text and backgrounds
- `aria-label` on any non-text visual elements
- Font sizes never below 1.2em for body text on slides (projected content needs to be large)
- Color is never the sole indicator of meaning
- Keyboard navigation works by default with Reveal.js (arrows, space, Esc)

### Performance

- No heavy libraries beyond Reveal.js and Google Fonts
- CSS animations use `transform` and `opacity` only (GPU-composited properties)
- Keep total file size reasonable — the HTML should load instantly even on slow school wifi
- Particle effects (if used) should be CSS-only or very lightweight Canvas — never a full Canvas library

---

## Step 6: Save the File

Save to:

```
~/Desktop/Presentations/<class>/<filename>.html
```

Where:
- `~` expands to the user's home directory (works across machines)
- `<class>` matches the user's choice: `AP Physics`, `Honors Physics`, `Forensic Science`, or `General`
- `<filename>` is descriptive kebab-case (e.g., `projectile-motion-lecture.html`, `unit-3-review.html`, `parent-night-fall-2026.html`)

Create the class subdirectory if it doesn't exist.

---

## Step 7: Summary

After writing the file, provide:
- File path where it was saved
- Slide count and structure overview
- How to present: open in browser, use arrow keys to navigate, press 'S' for speaker notes
- Creative direction used (theme, transitions)
- Any placeholder notes (e.g., "Slide 4 has a placeholder for a diagram — consider using /generate-image to create one")

---

## Notes

- **Output ONLY the HTML file.** Write it with the Write tool — no conversational filler around the file content, except the summary after.
- **No external assets beyond approved CDNs.** Reveal.js, Google Fonts, and KaTeX (if math is needed) are the only allowed external loads. All icons should be Unicode or inline SVG.
- **Scientific accuracy matters.** Physics equations, forensic science principles, and educational content must be correct.
- **Less text, more impact.** A presentation is not a document. If a slide has more than 30 words of visible text, it has too many. Move detail to speaker notes.
- **KaTeX for math.** When slides include physics equations, load KaTeX from CDN and render them properly. Do not use plain text for equations like F=ma — render them as $F = ma$.
- **Images — embed when available, placeholder when not.** If the user provides a directory with images (or the source content includes images), embed them as base64 data URIs using a Python script (`base64.b64encode`) so the HTML is fully standalone and portable. Use relative `src="images/..."` paths during development, then convert to base64 as a final step before delivering the file. If no images are available, use styled placeholder cards with descriptive labels and suggest `/generate-image`. When embedding, check total image size first — up to ~8MB of source images (≈11MB base64) is acceptable for a standalone deck; beyond that, consider compressing or omitting lower-priority images.
- **Interactive elements need JS handlers.** Any clickable element (navigation buttons, decision points, loops) MUST have `addEventListener` wired up in the `Reveal.initialize().then()` callback. Styled `<div>` elements with `cursor: pointer` are NOT clickable without JS. Always use `id` attributes on target slides and find indices dynamically — never hardcode slide numbers. Add hover feedback (`onmouseenter`/`onmouseleave` or CSS `:hover`).
- **Grid overflow prevention.** For slides with 6+ items in a grid layout, use 3 columns at ≤0.6em font size. See the grid sizing table in `references/reveal-patterns.md`. Always test mentally: 7 items × 2 columns = 4 rows at 0.8em WILL overflow 1080p. Prefer 3 columns with smaller text over 2 columns that get clipped.
- **Ambient overlay effects.** Never use `::before`/`::after` pseudo-elements on `.reveal` for visual overlays — they are invisible behind Reveal.js's opaque background. Use child `<div>` elements inside `.reveal` with `z-index: 1`, and set `.reveal .slides` to `z-index: 2`. See `references/reveal-patterns.md` for the correct pattern and opacity guidelines.
- **Agent-callable.** When called from dev-pipeline or another agent, skip the interactive steps (class/audience questions, creative direction approval) and use sensible defaults. The calling agent should provide topic, class, and any source content in the prompt.
- **Chromebook-friendly.** These will be projected from a teacher's Chromebook. Keep animations smooth, fonts loaded quickly, and total page weight low.
