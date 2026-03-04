# Portal Bridge & Dark Theme Reference

Shared patterns used by 3d-activity, create-assessment, and any HTML-outputting skill.

---

## Proctor Bridge — Always Include

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

### Usage by Mode

- **Graded / Assessment:** Call `PortalBridge.answer(questionId, correct, attempts)` when a student answers. Call `PortalBridge.complete(score, total, correct)` when the activity finishes. Call `PortalBridge.save(stateObj, currentQuestionIndex)` periodically.
- **Exploratory:** Call `PortalBridge.save(stateObj, 0)` periodically to preserve progress. Do NOT call `answer` or `complete`.
- **Teacher-graded assessment:** Call `PortalBridge.complete(0, numQuestions, 0)` on submit — the teacher will override with actual grades. Call `PortalBridge.save()` on every input change.

---

## Dark Theme CSS Variables

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

## Glassmorphism Panel Pattern

```css
.panel {
    backdrop-filter: blur(14px);
    background: var(--panel-bg);
    border: 1px solid var(--border);
    border-radius: 14px;
}
```

## Responsive & Touch

- Canvas fills the viewport. UI overlays on top with `pointer-events: none` on the container, `pointer-events: auto` on interactive panels.
- Stack panels vertically on narrow screens (Chromebook portrait).
- Minimum 44px touch targets for all interactive elements.
- Use `touch-action: none` on the canvas element.
