# 3D Graphics Engineer Memory

## Babylon.js GUI Labels (linkWithMesh pattern)
- `BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI()` creates a 2D overlay projecting 3D-linked controls
- `Rectangle` + `TextBlock` gives a pill/badge label; `rect.linkWithMesh(mesh)` pins it to world space
- TransformNodes cannot be passed to `linkWithMesh` — use a small invisible sphere anchor at the world position
- Anchor: `MeshBuilder.CreateSphere({ diameter: 0.001 })`, `isPickable: false`, `isVisible: false`
- Label Y height: anchor.position.y = TABLE_Y + 0.62 floats nicely above items
- Color scheme: background `rgba(15, 7, 32, 0.75)`, border `rgba(160, 100, 255, 0.55)`, text `#c0a0ff`
- Size: `width "140px"`, `height "22px"`, `cornerRadius 4`, `fontSize 11`
- GUI CDN: `https://cdn.babylonjs.com/gui/babylon.gui.min.js` (must add separately from babylon.js)
- Frustum cull labels in render loop: `labLabels.forEach(({anchor, rect}) => { rect.isVisible = camera.isInFrustum(anchor); })`
- Store `{ rect, lbl, anchor }` in array when calling `labelAtWorldPos` so render loop can iterate them

## Babylon.js Drag-and-Drop on Table Plane
- Disable camera on drag start: `camera.detachControl(canvas)`; restore on pointer up
- Project pointer to y-plane: `scene.createPickingRay(scene.pointerX, scene.pointerY, Matrix.Identity(), camera)`, solve `t = (TARGET_Y - origin.y) / direction.y`
- Clamp dragged node x/z to table bounds after projection
- Snap-back: `BABYLON.Animation.CreateAndStartAnimation("snapBack", node, "position", 60, 12, from, to, LOOP_CONSTANT)`
- Drop detection: `BABYLON.Vector3.Distance(dragged.position, target.position) < threshold`
- Highlight target green with `hl.addMesh()` when near; clear on far/release
- Store `originPos = node.position.clone()` at drag start; post-success return via setTimeout + animation
- Multi-touch guard: add `if (dragState.active) return;` as FIRST line of onPointerDown — protects originPos from mid-flight overwrites
- pointercancel handler: `canvas.addEventListener('pointercancel', ...)` must snap back, reattach camera, reset dragState — permanent lock-in bug otherwise
- Double-trigger guard: set `stepInProgress = true` in the click handler BEFORE calling the action, not inside the action itself

## Equipment Child Mesh Pattern
- Child meshes of TransformNode groups need metadata: `m.metadata = { parentName: node.name }`
- `setPickableRecursive(node)` utility: `node.getChildMeshes().forEach(m => { m.isPickable = true; m.metadata = {...} })`
- beakerMesh and testTubeMesh are direct meshes (not children), tagged directly
- All draggable TransformNode groups must be passed to `setPickableRecursive` — missing one means child mesh picks fail silently
- In `getDraggableNode` and `canInteractWith`, check BOTH `parentName === 'nodeName'` AND name string includes for robustness

## Accessibility (WCAG) — Modal Focus
- When any overlay opens, immediately call `.focus()` on the primary action button or first interactive element
- Engage overlay (visible on load): add `tabindex="-1"` to the container div and focus it in `window.addEventListener('load', ...)`
- Explain/Elaborate overlays: focus the close button on open
- Evaluate overlay: focus the first textarea, falling back to the submit button

## Simulation Files
- Standalone HTML sims live at `/home/kp/Desktop/Context/` or `/home/kp/Desktop/Simulations/`
- Pattern: single `<script>` block after canvas, all Babylon code inline
- Forensic Science sims: `/home/kp/Desktop/Simulations/Forensic Science/`

## DynamicTexture Procedural Material Pattern (confirmed working)
- Use `pbrTex(name, texW, texH, roughness, metallic, paintFn)` factory that creates DynamicTexture + PBRMaterial
- Set `tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE` before painting for tiling
- Set `mat.albedoTexture.uScale` / `vScale` AFTER the factory returns (not inside the callback)
- Canvas 2D API is available via `tex.getContext()` — standard `fillRect`, `strokeRect`, `fillText`, `arc` all work
- Always call `tex.update()` after all drawing operations
- For grout/seam lines: draw colored background first, then overlay border/line geometry in a darker shade
- `backFaceCulling = false` needed on any panel material that may be seen from both sides (evidence marker panels)

## A-Frame Evidence Marker Pattern
- Two `CreateBox` panels parented to TransformNode, rotated `rotation.x = ±leanAngle` (~0.52 rad = 30°)
- Position each panel at `y = (panelH/2) * cos(leanAngle)`, `z = ±(panelH/2) * sin(leanAngle)` so bases meet at floor
- Number texture: 128x128 DynamicTexture, yellow fill, black border, bold 72px numeral centered
- Set `backFaceCulling = false` on panel material so number is readable from all angles

## Catenary Crime Scene Tape Pattern
- `CreateTube` with 14-step parabolic path: `sagY = yMid - sag * 4 * t * (1-t)` (sag ~0.08-0.15 looks natural)
- `radius: 0.018`, `tessellation: 6` — low-poly enough for Chromebook budget
- Apply `matTape.albedoTexture.uScale = 6` to repeat "CRIME SCENE DO NOT CROSS" text along length
- DynamicTexture for tape: 512x64px, yellow fill, black bold 11px text; use `measureText` loop to tile text

## Police Strobe Light Pattern
- Use the 3rd PointLight slot (hemi + directional = 2, so 1 slot left)
- Position outside door: `position.z = 8.5`, `range = 14.0`, `intensity = 5.0` when active
- Cycle in render loop: 0.3s red -> 0.1s dim -> 0.3s blue -> 0.1s dim -> 0.2s ambient
- Rotate position: `x = cos(t * 0.4) * 3.5`, `z = 8.5 + sin(t * 0.4) * 1.5` for sweep effect
- Set `specular = Color3.Black()` to prevent harsh specular glints on low-poly geometry

## Soda Can Proportions (12oz standard)
- Body: `diameter: 0.066`, `height: 0.108`, `tessellation: 28`
- Neck taper: `CreateCylinder` with `diameterTop: 0.053`, `diameterBottom: 0.066`, `height: 0.014`
- Lid: `diameter: 0.053`, `height: 0.006`
- Pull tab: `CreateTorus` with `diameter: 0.016`, `thickness: 0.003`, `tessellation: 12`, rotated on X axis
- Tab lever: thin box `0.022 x 0.002 x 0.010`

## Monitor Detail Pattern
- Wrap monitor parts in a TransformNode parented to desk group
- Apply `rotation.x = -0.18` to the group for a realistic backward tilt (~10 degrees)
- Bezel: slightly smaller box with dark `albedoColor`, `roughness: 0.6`, `metallic: 0.3`, positioned 2mm in front of body
- Power LED: `CreateSphere` diameter 0.008, `StandardMaterial` with `emissiveColor = (0.1, 0.8, 0.3)` (green standby)
- Stand base: use `CreateBox` (rectangular footprint) rather than cylinder for modern monitor style

## Large File Visual Upgrade Strategy
- Never attempt to rewrite a file >1000 lines in one Write call — hits output token limit every time
- Use surgical Edit operations per visual system: materials block, geometry block, props block, render loop
- Organize edits by section marker comments (// ===) for reliable old_string anchoring
- Add pbrTex factory immediately after existing pbr() helper — same section, clean insertion point
- Environmental props go between the last geometry section and the INTERACTIVITY marker
