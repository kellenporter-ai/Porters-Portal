# 3D Graphics & Visual Effects Reference (2026)

## Target Hardware Constraints
Student Chromebooks have:
- Low-end integrated GPUs (Intel UHD Graphics)
- Strict thermal and battery limits
- Limited RAM (4-8GB shared with OS)

Unoptimized 3D or massive JS particle systems = frame drops + battery drain + app stutter.

## Babylon.js 7.x Optimization

### Engine Initialization
```typescript
const engine = new Engine(canvas, true, {
  powerPreference: "high-performance", // Request dedicated GPU
  adaptToDeviceRatio: false, // Control scaling manually
});

// Dynamic resolution scaling based on frame rate
const targetFPS = 30;
let scalingLevel = 1;

engine.runRenderLoop(() => {
  if (engine.getFps() < targetFPS && scalingLevel < 2) {
    scalingLevel += 0.1;
    engine.setHardwareScalingLevel(scalingLevel);
  }
  scene.render();
});
```

### WebGPU vs WebGL
WebGPU compute shaders reduce particle system overhead:
- ~100x faster on high-end devices
- ~5-6x faster even on low-end integrated graphics
- Use `engine.isWebGPU` to detect and adapt

```typescript
const engine = await (navigator.gpu
  ? new WebGPUEngine(canvas, { powerPreference: "high-performance" })
  : new Engine(canvas, true, { powerPreference: "high-performance" })
);
```

### Static Mesh Optimization

**Thin Instances (preferred for repeated geometry):**
```typescript
// Instead of creating 100 separate wall meshes:
const wallMaster = MeshBuilder.CreateBox("wall", { size: 1 }, scene);
const matrices = Float32Array(16 * wallCount);
// Fill matrices for each wall position
wallMaster.thinInstanceSetBuffer("matrix", matrices);
```

**Freeze static objects:**
```typescript
mesh.freezeWorldMatrix(); // Stop recalculating world matrix every frame
mesh.doNotSyncBoundingInfo = true; // Skip bounding box updates
scene.freezeActiveMeshes(); // If the camera is fixed in a room
```

### Dungeon Room Procedural Generation
- Aggressively cull invisible faces (backs of walls, hidden corridors)
- Bake ambient occlusion (AO) directly into textures — do NOT use real-time SSAO2
- Use Level of Detail (LOD) for distant objects
- Dispose scenes aggressively when transitioning between dungeon rooms

### Memory Management
```typescript
// Always dispose when leaving a scene
scene.dispose();
engine.dispose();

// Dispose individual meshes when no longer needed
mesh.dispose(false, true); // dispose mesh, dispose materials
```

## CSS-Based Visual Effects (2D UI Elements)

For cosmetic auras, profile frames, mouse trails, and particles purchased in the Flux Shop — do NOT use WebGL canvas. Use CSS instead.

### GPU-Accelerated CSS Animations
Only animate `transform` and `opacity` — these properties are composited on the GPU without triggering reflow/repaint.

```css
/* GOOD — GPU composited */
@keyframes float {
  0%, 100% { transform: translateY(0); opacity: 1; }
  50% { transform: translateY(-8px); opacity: 0.8; }
}

/* BAD — triggers layout reflow */
@keyframes float-bad {
  0%, 100% { top: 0; } /* Forces reflow every frame */
  50% { top: -8px; }
}
```

### CSS @property for Advanced Effects
Register custom properties for animatable values that CSS can't normally interpolate:

```css
@property --glow-intensity {
  syntax: '<number>';
  inherits: false;
  initial-value: 0;
}

@keyframes pulse-glow {
  0%, 100% { --glow-intensity: 0.3; }
  50% { --glow-intensity: 1; }
}

.aura {
  animation: pulse-glow 2s ease-in-out infinite;
  box-shadow: 0 0 calc(var(--glow-intensity) * 20px) currentColor;
}
```

### CSS mask-image for Cosmetic Borders/Frames
```css
.operative-frame {
  mask-image: url('/frames/legendary-border.svg');
  mask-size: contain;
  mask-repeat: no-repeat;
}
```

### interpolate-size for Intrinsic Animations
Animate elements to/from `auto` height without JavaScript:

```css
.loot-reveal {
  interpolate-size: allow-keywords;
  transition: height 0.3s ease;
  height: 0;
}
.loot-reveal.open {
  height: auto; /* Smoothly animates to content height */
}
```

## Performance Budget for Chromebooks

| Metric | Target | Action if Exceeded |
|--------|--------|-------------------|
| Frame rate | 30+ FPS | Increase hardware scaling level |
| JS bundle (per route) | < 200KB gzipped | Split chunks, lazy load |
| Canvas memory | < 100MB | Dispose unused scenes/textures |
| CSS animations | transform/opacity only | Audit with Chrome DevTools Layers panel |
| Particle count | < 50 simultaneous | Use CSS for simple effects |

## Decision Matrix: Canvas vs CSS

| Effect Type | Use Canvas (Babylon.js) | Use CSS |
|-------------|------------------------|---------|
| Physics simulation | Yes | No |
| 3D environment | Yes | No |
| Cosmetic aura/glow | No | Yes |
| Profile frame | No | Yes |
| Mouse trail | No | Yes |
| Particle burst (loot reveal) | Maybe (if complex) | Yes (if simple) |
| Floating damage numbers | No | Yes |
| XP popup animations | No | Yes |
