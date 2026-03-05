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
