# Babylon.js Reference for 3D Activities

This file contains detailed coding patterns, performance budgets, and recipes for building Chromebook-friendly 3D simulations with Babylon.js.

---

## CDN Scripts

Always include exactly these two scripts in `<head>`:

```html
<script src="https://cdn.babylonjs.com/babylon.js"></script>
<script src="https://cdn.babylonjs.com/materialsLibrary/babylonjs.materials.min.js"></script>
```

Do NOT include Havok, Ammo.js, or other physics engine CDNs. Implement physics manually.

---

## Performance Budget (Chromebook Targets)

| Resource | Budget |
|---|---|
| Shadow map resolution | 1024 max |
| MSAA samples | 2 |
| Device pixel ratio cap | 1.5 |
| Max lights | 3 |
| Max particles (active) | 300 |
| Tessellation (curved surfaces) | 24–32 |
| GlowLayer intensity | 1.0–1.5 (opt-in only — requires `addIncludedOnlyMesh()`) |
| Blur kernel (shadows) | 16 |
| Post-process passes | FXAA + tone mapping only |

When in doubt, choose the lighter option. Students use Chromebooks with integrated GPUs.

---

## Engine & Scene Setup

```javascript
const canvas = document.getElementById('renderCanvas');

const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true
});
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, 1.5));

const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.059, 0.027, 0.125, 1.0); // #0f0720

// Fog for depth
scene.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
scene.fogColor   = new BABYLON.Color3(0.059, 0.027, 0.125);
scene.fogDensity = 0.015;
```

---

## Camera — ArcRotateCamera

```javascript
const camera = new BABYLON.ArcRotateCamera(
    "cam",
    -Math.PI / 2,  // alpha (horizontal angle)
    1.1,           // beta (vertical angle)
    12,            // radius (distance from target)
    new BABYLON.Vector3(0, 1.5, 0),  // target
    scene
);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 4;
camera.upperRadiusLimit = 20;
camera.upperBetaLimit   = Math.PI / 2 - 0.05; // prevent flipping under ground
camera.inertia          = 0.7;
camera.wheelPrecision   = 5;
camera.panningInertia   = 0.8;
camera.panningSensibility = 80;
```

Adjust `alpha`, `beta`, `radius`, and target to frame the specific scene. Use `BABYLON.Animation.CreateAndStartAnimation` for smooth camera transitions between views.

### Coordinate System & Rotation Direction

Babylon.js uses a **left-handed coordinate system**. With the default `ArcRotateCamera` at `alpha = -Math.PI / 2`:

- Camera sits on the **-Z axis**, looking toward **+Z**
- **X** = right, **Y** = up, **Z** = into the screen (away from camera)
- `rotation.z` on an object:
  - **Negative** = **clockwise** from the camera's perspective
  - **Positive** = **counter-clockwise** from the camera's perspective

This is critical for rotating wheels, pulleys, gears, etc. — if the physics says CW, use negative `rotation.z`.

---

## Three-Light Recipe

This lighting setup produces good results without overloading the GPU:

```javascript
// 1. Hemisphere — ambient fill
const hemi = new BABYLON.HemisphericLight("hemi", BABYLON.Vector3.Up(), scene);
hemi.intensity   = 0.35;
hemi.diffuse     = new BABYLON.Color3(0.8, 0.82, 1.0);   // cool sky tone
hemi.groundColor = new BABYLON.Color3(0.1, 0.06, 0.2);   // dark purple ground bounce

// 2. Directional — key/sun light (casts shadows)
const sun = new BABYLON.DirectionalLight(
    "sun",
    new BABYLON.Vector3(-0.5, -1.5, -0.7),  // direction
    scene
);
sun.position  = new BABYLON.Vector3(5, 10, 7);  // for shadow projection origin
sun.intensity = 0.9;

// 3. Point or Spot — accent (optional, for focal objects)
const accent = new BABYLON.PointLight("accent", new BABYLON.Vector3(0, 2, 0), scene);
accent.diffuse   = new BABYLON.Color3(0.5, 0.4, 1.0); // purple-blue mood
accent.specular  = BABYLON.Color3.Black();
accent.intensity = 2.0;
accent.range     = 5.0;
```

### Lighting Tips
- Keep hemisphere intensity low (0.3–0.4) to maintain contrast
- The directional light is the main shadow caster
- Use the accent light to draw attention to key objects — position it near the focal point
- Change accent light color to reflect simulation state (green = success, red = danger, blue = neutral)
- Never exceed 3 lights total

---

## Shadows

```javascript
const shadowGen = new BABYLON.ShadowGenerator(1024, sun);
shadowGen.useBlurExponentialShadowMap = true;
shadowGen.blurKernel = 16;
shadowGen.darkness   = 0.4;

// Add objects as shadow casters:
shadowGen.addShadowCaster(myMesh);

// Ground receives shadows:
ground.receiveShadows = true;
```

---

## PBR Materials

Use `PBRMaterial` for all objects:

```javascript
function pbr(name, hexColor, roughness, metallic) {
    const m = new BABYLON.PBRMaterial(name, scene);
    m.albedoColor = BABYLON.Color3.FromHexString(hexColor);
    m.roughness   = roughness;
    m.metallic    = metallic;
    return m;
}

// Examples:
const matWood   = pbr("wood",   "#8B6914", 0.85, 0.0);  // rough, non-metallic
const matMetal  = pbr("metal",  "#888888", 0.25, 0.8);   // smooth, metallic
const matPlastic = pbr("plastic","#2277cc", 0.45, 0.0);  // medium smooth
const matGlass  = pbr("glass",  "#aaddff", 0.05, 0.0);   // very smooth
```

### Common Material Presets

| Surface | Roughness | Metallic | Notes |
|---|---|---|---|
| Wood | 0.80–0.90 | 0.0 | |
| Metal (brushed) | 0.25–0.40 | 0.7–0.9 | |
| Metal (polished) | 0.05–0.15 | 0.9–1.0 | |
| Plastic | 0.40–0.55 | 0.0 | |
| Rubber | 0.90–1.00 | 0.0 | |
| Glass | 0.02–0.08 | 0.0 | Add alpha for transparency |
| Concrete/stone | 0.85–0.95 | 0.0 | |
| Fabric | 0.90–1.00 | 0.0 | |
| Skin/organic | 0.60–0.75 | 0.0 | |
| Chalk | 0.95 | 0.0 | Subtle emissive for glow |

### Emissive & Glow
- **Do NOT set `emissiveColor` on PBR materials by default.** Only add emissive to meshes that are explicitly whitelisted in a GlowLayer via `addIncludedOnlyMesh()`.
- If no GlowLayer is used, emissive on PBR materials is unnecessary — use `albedoColor` + the three-light recipe for proper appearance.
- Self-lit elements (labels, text planes) use `emissiveColor` with `disableLighting = true` on StandardMaterial — this is fine, but these meshes must NEVER be added to a GlowLayer.
- If you do use emissive for glow, keep values subtle (0.05–0.15 per channel).

---

## Building Models from Primitives

All models must be built procedurally — no external .glb/.obj files.

### Primitive Catalog

```javascript
// Box
BABYLON.MeshBuilder.CreateBox("name", { width, height, depth }, scene);

// Cylinder / Tube
BABYLON.MeshBuilder.CreateCylinder("name", {
    diameter, height, tessellation: 28,
    diameterTop, diameterBottom  // for cones/tapered shapes
}, scene);

// Sphere
BABYLON.MeshBuilder.CreateSphere("name", { diameter, segments: 24 }, scene);

// Torus
BABYLON.MeshBuilder.CreateTorus("name", { diameter, thickness, tessellation: 28 }, scene);

// Lathe (rotational surface from a profile curve)
BABYLON.MeshBuilder.CreateLathe("name", { shape: pointsArray, tessellation: 28 }, scene);

// Tube (path extrusion)
BABYLON.MeshBuilder.CreateTube("name", { path: pointsArray, radius, tessellation: 20 }, scene);

// Ground
BABYLON.MeshBuilder.CreateGround("name", { width, height, subdivisions: 1 }, scene);

// Ribbon (freeform surface from path arrays)
BABYLON.MeshBuilder.CreateRibbon("name", { pathArray, closePath: false }, scene);

// Plane
BABYLON.MeshBuilder.CreatePlane("name", { width, height }, scene);

// Disc
BABYLON.MeshBuilder.CreateDisc("name", { radius, tessellation: 28 }, scene);
```

### Grouping with TransformNode

```javascript
const group = new BABYLON.TransformNode("myGroup", scene);
partA.parent = group;
partB.parent = group;
// Now move/rotate/scale the group as one unit
group.position.set(x, y, z);
```

### CSG (Constructive Solid Geometry)

For complex shapes — cut holes, combine forms:

```javascript
const boxCSG = BABYLON.CSG.FromMesh(boxMesh);
const cylCSG = BABYLON.CSG.FromMesh(cylinderMesh);
const result = boxCSG.subtract(cylCSG); // cut cylinder hole from box
const finalMesh = result.toMesh("result", material, scene);
boxMesh.dispose();
cylinderMesh.dispose();
```

### Model Quality Guidelines

- **Tessellation 24–32** for curved surfaces (cylinders, spheres, tori). Lower looks faceted; higher wastes GPU.
- **Combine 3–8 primitives** per recognizable object. A single box for a "table" looks bad. A box + 4 cylinders for legs + a thin box for the surface looks like a table.
- **Use Lathe** for objects with rotational symmetry: bottles, beakers, vases, rounded handles.
- **Use Tube** for wires, ropes, curved pipes.
- **Scale matters** — use real-world-ish proportions. A table is ~0.75m tall, a person ~1.7m, a pencil ~0.19m long.

### Z-Fighting Prevention (Critical)

When multiple meshes share the same position/depth, the GPU cannot decide which surface to draw in front, causing shimmering/flickering artifacts (z-fighting). **This is the #1 visual bug in multi-part assemblies.**

**Rule: Never place coplanar surfaces at the same z-depth.** Separate parts into distinct z-layers with physical gaps between them.

Example — a wheel/pulley with a disc, rim tori, and spokes:

```javascript
// ── Z-LAYER PLAN (camera at -Z looking +Z, positive z = behind) ──
// Layer 0 (back):  Disc at z = +0.10   (behind torus back face)
// Layer 1 (mid):   Tori at z = 0       (tube extends ±0.06)
// Layer 2 (front): Spokes at z = -0.09 (in front of torus front face)
// Layer 3 (front): Hub at z = -0.10

// Disc — fully behind the tori (no geometric overlap)
disc.position.z = 0.10;

// Tori stay at z = 0 (default)

// Spokes — in front of torus front face
spoke.position.z = -0.09;
```

**Key principles:**
1. Plan z-layers before building — sketch which parts are back/mid/front
2. Gaps between layers must be larger than the tube/thickness radius of any mesh in that layer
3. **Do NOT use `material.zOffset`** — it's a fragile hack. Use real geometric separation instead.
4. When a parent `TransformNode` is scaled dynamically (e.g., radius slider), all child z-offsets scale proportionally. Make gaps large enough to survive the minimum scale factor.
5. For flat-on-flat surfaces (cylinder face on plane), offset by at least 0.02–0.04 in z.

---

## Environment Building

### Indoor Lab / Classroom

```javascript
// Floor
const floor = BABYLON.MeshBuilder.CreateGround("floor", { width: 20, height: 20 }, scene);
const matFloor = pbr("floor", "#3a3a40", 0.7, 0.0);
floor.material = matFloor;
floor.receiveShadows = true;

// Back wall
const wall = BABYLON.MeshBuilder.CreatePlane("wall", { width: 20, height: 4 }, scene);
wall.position.set(0, 2, -10);
wall.material = pbr("wall", "#2a2535", 0.9, 0.0);

// Lab table (example composite object)
function createLabTable(x, z) {
    const group = new BABYLON.TransformNode("table", scene);
    const top = BABYLON.MeshBuilder.CreateBox("tableTop", { width: 2.0, height: 0.06, depth: 1.0 }, scene);
    top.material = pbr("tableTopMat", "#1a1a22", 0.3, 0.0);
    top.parent = group;
    top.position.y = 0.9;
    shadowGen.addShadowCaster(top);
    // Legs
    for (const [lx, lz] of [[-0.85, -0.4], [0.85, -0.4], [-0.85, 0.4], [0.85, 0.4]]) {
        const leg = BABYLON.MeshBuilder.CreateCylinder("leg", { diameter: 0.05, height: 0.9, tessellation: 12 }, scene);
        leg.material = pbr("legMat", "#555555", 0.3, 0.8);
        leg.parent = group;
        leg.position.set(lx, 0.45, lz);
    }
    group.position.set(x, 0, z);
    return group;
}
```

### Outdoor Scene

```javascript
// Terrain ground
const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 60, height: 60, subdivisions: 2 }, scene);
ground.material = pbr("grass", "#2d4a1e", 0.95, 0.0);
ground.receiveShadows = true;

// Skybox using a procedural gradient
const skyMat = new BABYLON.StandardMaterial("skyMat", scene);
skyMat.backFaceCulling = false;
skyMat.disableLighting = true;
skyMat.emissiveColor = new BABYLON.Color3(0.04, 0.02, 0.1);
const skybox = BABYLON.MeshBuilder.CreateBox("skybox", { size: 200 }, scene);
skybox.material = skyMat;
skybox.infiniteDistance = true;
```

### Crime Scene / Forensic Environment

Build with context: a room with walls, floor markings, numbered evidence markers, tape lines. Use yellow/red accent colors for evidence items. Position the camera to give an investigator's-eye view.

---

## Post-Processing Pipeline

```javascript
const pipeline = new BABYLON.DefaultRenderingPipeline("pipe", true, scene, [camera]);
pipeline.fxaaEnabled = true;
pipeline.samples     = 2;  // Chromebook budget
pipeline.imageProcessingEnabled = true;
pipeline.imageProcessing.contrast   = 1.1;
pipeline.imageProcessing.exposure   = 1.05;
pipeline.imageProcessing.toneMappingEnabled = true;
```

### GlowLayer

**CRITICAL: GlowLayer blooms ALL meshes with `emissiveColor` by default.** If you create a GlowLayer without restricting it, every PBR material with emissive, every self-lit label, and every StandardMaterial with emissive will bloom — turning labels into unreadable white blobs and flooding the scene with light.

**Rules:**
1. **ALWAYS use `addIncludedOnlyMesh()`** to whitelist only the specific meshes that should glow. Never rely on the default "glow everything with emissive" behavior.
2. **NEVER add labels/text planes** to the GlowLayer — they use `emissiveColor` for self-lit display, not for bloom.
3. **Do NOT set `emissiveColor` on PBR materials** unless the mesh is explicitly added to the GlowLayer's include list. Use `albedoColor` + proper lighting instead.
4. **If no meshes need bloom, skip GlowLayer entirely.** Educational/exploratory sims rarely need it.

```javascript
// CORRECT — opt-in glow on specific meshes only
const glow = new BABYLON.GlowLayer("glow", scene);
glow.intensity = 1.0;
glow.addIncludedOnlyMesh(glowingOrb);  // ONLY this mesh blooms
glowingOrb.material.emissiveColor = new BABYLON.Color3(0.1, 0.3, 0.1);

// WRONG — blanket glow that blooms everything
// const glow = new BABYLON.GlowLayer("glow", scene);
// glow.intensity = 1.2;
// (now every emissive material in the scene blooms uncontrollably)
```

### HighlightLayer

```javascript
const hl = new BABYLON.HighlightLayer("hl", scene);

// Add/remove outlines at runtime:
hl.addMesh(mesh, BABYLON.Color3.FromHexString("#22d47a"));
hl.removeMesh(mesh);
```

---

## Particles

```javascript
// Procedural particle texture (no external images)
const particleTex = (() => {
    const t = new BABYLON.DynamicTexture("ptex", { width: 64, height: 64 }, scene, false);
    const ctx = t.getContext();
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0,   "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.6)");
    g.addColorStop(1,   "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    t.update();
    return t;
})();

// Burst effect
function spawnBurst(position, color1Hex, color2Hex, count) {
    const ps = new BABYLON.ParticleSystem("burst", count, scene);
    ps.particleTexture = particleTex;
    ps.emitter         = position.clone();
    ps.minEmitBox      = new BABYLON.Vector3(-0.1, 0, -0.1);
    ps.maxEmitBox      = new BABYLON.Vector3(0.1, 0.05, 0.1);
    ps.color1    = BABYLON.Color4.FromHexString(color1Hex + "ff");
    ps.color2    = BABYLON.Color4.FromHexString(color2Hex + "cc");
    ps.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    ps.minSize = 0.03; ps.maxSize = 0.18;
    ps.minLifeTime = 0.4; ps.maxLifeTime = 2.0;
    ps.emitRate = 0;
    ps.manualEmitCount = count;
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    ps.gravity   = new BABYLON.Vector3(0, -3, 0);
    ps.direction1 = new BABYLON.Vector3(-2, 4, -2);
    ps.direction2 = new BABYLON.Vector3(2, 8, 2);
    ps.minEmitPower = 0.3; ps.maxEmitPower = 2.5;
    ps.updateSpeed  = 0.02;
    ps.start();
    setTimeout(() => ps.stop(), 60);
    setTimeout(() => ps.dispose(), 3000);
}
```

Keep `count` under 300 per burst.

---

## Physics Simulation Loop

Implement physics manually in the render loop — do NOT use Havok/Ammo:

```javascript
scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.1); // seconds, capped
    if (simState !== 'RUNNING') return;

    // Apply forces -> update velocity -> update position
    const acceleration = netForce / mass;
    velocity += acceleration * dt;
    position += velocity * dt;

    // Update mesh positions
    myMesh.position.y = position;

    // Collision detection
    if (position <= groundLevel) {
        position = groundLevel;
        // Handle collision...
    }
});
```

### Common Physics Patterns

- **Gravity:** `acceleration = -9.8` (m/s²)
- **Projectile:** separate x/y velocity components, gravity on y only
- **Spring:** `F = -k * displacement`
- **Friction:** `F_friction = -mu * normalForce * sign(velocity)`
- **Drag:** `F_drag = -0.5 * rho * Cd * A * v²`
- **Rotational:** `τ = Iα`, `I = ½MR²` (disc), `I = MR²` (ring). For coupled translational-rotational systems (e.g., hanging mass on pulley), solve `a = mg / (m + I/r²)`.
- **Collisions:** Always implement explicit boundary checks. Objects must not clip through floors, tables, or walls. Clamp positions and zero/reverse velocities on contact:

```javascript
if (objectY <= floorY) {
    objectY = floorY;
    velocityY = 0;
    // Transition to post-collision state (e.g., coasting)
}
```

- **State transitions:** Use a state machine (`IDLE → RUNNING → COASTING → ENDED`) for clean simulation flow. After a collision event (e.g., pail lands), transition to a new state rather than stopping abruptly.

---

## Camera Animations

```javascript
// Smooth camera transition
BABYLON.Animation.CreateAndStartAnimation(
    "camMove", camera, "radius",
    30,   // fps
    40,   // total frames
    camera.radius, 10,  // from, to
    BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
);

// Animate any property: "alpha", "beta", "radius", "target.x", etc.
```

---

## Render Loop & Resize

Always end the main script with:

```javascript
engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
```

---

## Arrow / Vector Visualization

For force and velocity vectors, build from a cylinder (shaft) + cone (head). Use **solid opaque StandardMaterial** with `disableLighting = true` — do NOT use GlowLayer on arrows, as bloom makes thin meshes unreadable.

```javascript
function makeArrow(name, hexColor) {
    const color = BABYLON.Color3.FromHexString(hexColor);
    const mat   = new BABYLON.StandardMaterial(name + "_m", scene);
    mat.emissiveColor    = color;
    mat.diffuseColor     = color;
    mat.disableLighting  = true;
    mat.backFaceCulling  = false;
    // Do NOT add to GlowLayer — bloom makes arrows hard to read

    const root = new BABYLON.TransformNode(name, scene);

    const shaft = BABYLON.MeshBuilder.CreateCylinder(name + "_s", {
        diameter: 0.05, height: 1.0, tessellation: 12
    }, scene);
    shaft.material = mat;
    shaft.parent   = root;
    shaft.position.y = 0.5;

    const head = BABYLON.MeshBuilder.CreateCylinder(name + "_h", {
        diameterTop: 0, diameterBottom: 0.14, height: 0.18, tessellation: 12
    }, scene);
    head.material = mat;
    head.parent   = root;
    head.position.y = 1.09;

    return {
        root,
        set(len, x, y, z, pointDown) {
            if (len < 0.04) { root.setEnabled(false); return; }
            root.setEnabled(true);
            root.scaling.set(1, len, 1);
            if (pointDown) {
                root.position.set(x, y - len, z);
                root.rotation.set(0, 0, Math.PI);
            } else {
                root.position.set(x, y, z);
                root.rotation.set(0, 0, 0);
            }
        },
        hide() { root.setEnabled(false); }
    };
}
```

Position arrows **in front** of the objects they annotate (use a separate z-layer, e.g., `ARROW_Z = OBJECT_Z - 0.15`).

---

## Procedural Textures with DynamicTexture

For labels, rulers, measurement markings, or simple patterns:

```javascript
const labelTex = new BABYLON.DynamicTexture("label", { width: 256, height: 64 }, scene, false);
const ctx = labelTex.getContext();
ctx.fillStyle = "#222";
ctx.fillRect(0, 0, 256, 64);
ctx.font = "bold 28px Arial";
ctx.fillStyle = "#fff";
ctx.textAlign = "center";
ctx.fillText("5.0 m/s", 128, 42);
labelTex.update();

const labelMat = new BABYLON.StandardMaterial("labelMat", scene);
labelMat.diffuseTexture = labelTex;
labelMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
labelMat.disableLighting = true;
```
