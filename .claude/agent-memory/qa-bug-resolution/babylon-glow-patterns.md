# Babylon.js Glow & Emissive Patterns — Audit Notes

## Confirmed Correct Patterns (do not flag)

| Usage | Material | emissiveColor | disableLighting | GlowLayer? | Status |
|---|---|---|---|---|---|
| Text label planes | StandardMaterial | (1,1,1) | true | No | CORRECT |
| Nucleotide description panel | StandardMaterial | (1,1,1) | true | No | CORRECT |
| H-bond cylinders | StandardMaterial | (0.15, 0.15, 0.15) | false | No | CORRECT (subtle self-lit) |
| Base nucleotides (A/T/C/G) | PBRMaterial | none | n/a | No | CORRECT |
| Backbone tubes | PBRMaterial | none | n/a | No | CORRECT |
| Phosphate/sugar spheres | PBRMaterial | none | n/a | No | CORRECT |
| Skybox mesh | StandardMaterial | emissive for unlit sky | true | No | CORRECT |
| Arrow/vector visualizers | StandardMaterial | emissive = color | true | No | CORRECT — per ref doc |

## Root Cause of the Bug (for future reference)

The original DNA sim instantiated `new BABYLON.GlowLayer("glow", scene)` without any `addIncludedOnlyMesh()` calls. GlowLayer's default behavior is opt-out, not opt-in — it blooms every mesh that has a non-zero emissiveColor. Since labels use `emissiveColor = (1,1,1)`, they were fully bloomed into unreadable white blobs.

Fix options (in order of preference):
1. Remove GlowLayer entirely if no bloom is needed (applied here)
2. Use `glow.addIncludedOnlyMesh(specificMesh)` to restrict bloom to only the intended meshes

## Performance Budget Table Inconsistency (Low Severity)
`babylon-reference.md` line 30 lists `GlowLayer intensity | 1.0–1.5` in the performance budget table. This row is not wrong (it's a max cap for when GlowLayer IS used), but it lives above the CRITICAL warning section. A future agent reading only the budget table could miss the guardrails. Consider removing the row or adding a note like "(only if addIncludedOnlyMesh() used)" in a future skill update.
