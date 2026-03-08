import React, { useEffect, useRef, useMemo, useState } from 'react';
import { ActiveCosmetics } from '../../types';
import { AGENT_COSMETICS } from '../../lib/gamification';
import { DEFAULT_CHARACTER_MODEL, getCharacterModel } from '../../lib/characterModels';
import { getHairModel } from '../../lib/hairModels';
import { SKIN_TONES, HAIR_COLORS } from './OperativeAvatar';

// Lazy-load Babylon to avoid blocking initial bundle
let babylonCore: typeof import('@babylonjs/core') | null = null;
let babylonLoaded = false;
let babylonLoadPromise: Promise<void> | null = null;

const ensureBabylon = async () => {
    if (babylonLoaded) return babylonCore!;
    if (!babylonLoadPromise) {
        babylonLoadPromise = (async () => {
            const [core] = await Promise.all([
                import('@babylonjs/core'),
                import('@babylonjs/loaders/glTF'),
            ]);
            babylonCore = core;
            babylonLoaded = true;
        })();
    }
    await babylonLoadPromise;
    return babylonCore!;
};

// ---- Cosmetic resolution helpers ----
interface ResolvedCosmetic3D {
    id: string;
    color: string;
    secondaryColor: string;
    type: 'AURA' | 'PARTICLE' | 'FRAME' | 'TRAIL';
    intensity: number;
}

const resolveCosmetics = (activeCosmetics?: ActiveCosmetics): ResolvedCosmetic3D[] => {
    if (!activeCosmetics) return [];
    const resolved: ResolvedCosmetic3D[] = [];
    const slots = ['aura', 'particle', 'frame', 'trail'] as const;
    for (const slot of slots) {
        const cosmeticId = activeCosmetics[slot];
        if (!cosmeticId) continue;
        const def = AGENT_COSMETICS.find(c => c.id === cosmeticId);
        if (!def) continue;
        resolved.push({
            id: def.id,
            color: def.color,
            secondaryColor: def.secondaryColor || def.color,
            type: def.visualType,
            intensity: def.intensity ?? 0.5,
        });
    }
    return resolved;
};

// ---- Material classification for color tinting ----
// Quaternius GLB models use a single mesh with multiple primitives.
// Babylon splits primitives into sub-meshes, each with its own material.
// Material names (Skin, Hair, Shirt, Pants, etc.) are the reliable classifier.
type MeshCategory = 'skin' | 'hair' | 'clothing' | 'unknown';

const SKIN_MAT_PATTERNS = /^skin$/i;
const HAIR_MAT_PATTERNS = /hair/i;
const CLOTHING_MAT_PATTERNS = /shirt|pants|suit|dress|shoe|boot|sock|top|sleeve|jacket|skirt|tank|collar|tie|belt|vest|coat|shorts|details/i;
const EYES_MAT_PATTERN = /^eyes$/i;

const classifyByMaterial = (materialName: string): MeshCategory => {
    if (EYES_MAT_PATTERN.test(materialName)) return 'unknown'; // Don't tint eyes
    if (HAIR_MAT_PATTERNS.test(materialName)) return 'hair';
    if (CLOTHING_MAT_PATTERNS.test(materialName)) return 'clothing';
    if (SKIN_MAT_PATTERNS.test(materialName)) return 'skin';
    return 'unknown';
};

/** Convert hex color string to {r,g,b} in 0-1 range */
const hexToRgb = (hex: string) => {
    const h = hex.replace('#', '');
    return {
        r: parseInt(h.substring(0, 2), 16) / 255,
        g: parseInt(h.substring(2, 4), 16) / 255,
        b: parseInt(h.substring(4, 6), 16) / 255,
    };
};

/** Convert RGB (0-1) to HSL */
const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return [h, s, l];
};

/** Convert HSL to RGB (0-1) */
const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
    if (s === 0) return [l, l, l];
    const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
};

/** Apply color tinting to pre-classified materials without rebuilding the scene */
const applyTinting = (
    tintData: Array<{ material: any; category: MeshCategory; originalColor: { r: number; g: number; b: number } }>,
    app: AppearanceProps | undefined,
) => {
    for (const { material, category, originalColor: ac } of tintData) {
        if (category === 'skin' && app?.skinTone != null) {
            const tone = hexToRgb(SKIN_TONES[app.skinTone] || SKIN_TONES[0]);
            material.diffuseColor.r = ac.r * 0.1 + tone.r * 0.9;
            material.diffuseColor.g = ac.g * 0.1 + tone.g * 0.9;
            material.diffuseColor.b = ac.b * 0.1 + tone.b * 0.9;
        } else if (category === 'hair' && app?.hairColor != null) {
            const hc = hexToRgb(HAIR_COLORS[app.hairColor] || HAIR_COLORS[0]);
            material.diffuseColor.r = hc.r;
            material.diffuseColor.g = hc.g;
            material.diffuseColor.b = hc.b;
            material.ambientColor.r = hc.r * 0.3;
            material.ambientColor.g = hc.g * 0.3;
            material.ambientColor.b = hc.b * 0.3;
        } else if (category === 'clothing' && app?.suitHue != null) {
            const [, s, l] = rgbToHsl(ac.r, ac.g, ac.b);
            // Enforce minimum saturation so white/gray/dark clothing still tints
            const effectiveS = Math.max(s, 0.45);
            // Clamp lightness to a visible range so very dark clothing shows color
            const effectiveL = Math.max(Math.min(l, 0.55), 0.2);
            const [nr, ng, nb] = hslToRgb(app.suitHue / 360, effectiveS, effectiveL);
            material.diffuseColor.r = nr;
            material.diffuseColor.g = ng;
            material.diffuseColor.b = nb;
        } else if (category === 'skin' || category === 'hair' || category === 'clothing') {
            // Reset to original if no appearance value set
            material.diffuseColor.r = ac.r;
            material.diffuseColor.g = ac.g;
            material.diffuseColor.b = ac.b;
        }
    }
};

// ---- Appearance type ----
interface AppearanceProps {
    bodyType?: 'A' | 'B' | 'C';
    hue?: number;
    suitHue?: number;
    skinTone?: number;
    hairStyle?: number;
    hairColor?: number;
}

// ---- Props ----
interface Avatar3DProps {
    /** Character model ID from characterModels.ts */
    characterModelId?: string;
    /** Appearance settings for color tinting */
    appearance?: AppearanceProps;
    /** Active cosmetics for visual effects */
    activeCosmetics?: ActiveCosmetics;
    /** Evolution level for glow intensity */
    evolutionLevel?: number;
    /** If true, render a static fallback instead of full 3D scene */
    compact?: boolean;
    /** CSS class for the container */
    className?: string;
}

/**
 * 3D Avatar component using Babylon.js.
 *
 * Renders a character model in a lightweight scene optimized for Chromebooks:
 * - Single directional light + ambient
 * - No shadows (too expensive for low-end GPUs)
 * - Small canvas size with CSS scaling
 * - Idle animation only
 * - Cosmetic effects rendered as simple glow/particle overlays
 */
const Avatar3D: React.FC<Avatar3DProps> = ({
    characterModelId,
    appearance,
    activeCosmetics,
    evolutionLevel = 0,
    compact = false,
    className = '',
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<any>(null);
    const sceneRef = useRef<any>(null);
    const cleanupRef = useRef<(() => void) | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const mountedRef = useRef(true);
    // Store per-mesh tinting data so appearance changes don't rebuild the scene
    const meshTintDataRef = useRef<Array<{ material: any; category: MeshCategory; originalColor: { r: number; g: number; b: number } }>>([]);
    // Track loaded hair overlay meshes for cleanup and tinting
    const hairMeshesRef = useRef<any[]>([]);
    const currentHairStyleRef = useRef<number | undefined>(undefined);

    const modelId = characterModelId || DEFAULT_CHARACTER_MODEL;
    const modelDef = getCharacterModel(modelId);

    // Resolve cosmetic effects — memoize to keep stable references
    const cosmetics = useMemo(() => resolveCosmetics(activeCosmetics), [
        activeCosmetics?.aura, activeCosmetics?.particle,
        activeCosmetics?.frame, activeCosmetics?.trail,
    ]);
    const auraCosmetic = useMemo(() => cosmetics.find(c => c.type === 'AURA'), [cosmetics]);
    const particleCosmetic = useMemo(() => cosmetics.find(c => c.type === 'PARTICLE'), [cosmetics]);

    // Stable ref for cosmetics so the setup callback doesn't depend on them
    const auraCosmeticRef = useRef(auraCosmetic);
    auraCosmeticRef.current = auraCosmetic;
    const particleCosmeticRef = useRef(particleCosmetic);
    particleCosmeticRef.current = particleCosmetic;
    const evolutionRef = useRef(evolutionLevel);
    evolutionRef.current = evolutionLevel;
    const appearanceRef = useRef(appearance);
    appearanceRef.current = appearance;

    // Only re-run the 3D setup when the model or compact mode changes
    useEffect(() => {
        mountedRef.current = true;
        let disposed = false;

        const setup = async () => {
            const canvas = canvasRef.current;
            if (!canvas || !modelDef) return;

            // Dispose previous scene/engine if any
            if (sceneRef.current && !sceneRef.current.isDisposed) {
                sceneRef.current.dispose();
                sceneRef.current = null;
            }
            if (engineRef.current) {
                engineRef.current.dispose();
                engineRef.current = null;
            }

            try {
                const BABYLON = await ensureBabylon();
                if (disposed) return;

                // Chromebook-optimized engine settings
                const engine = new BABYLON.Engine(canvas, true, {
                    preserveDrawingBuffer: false,
                    stencil: false,
                    antialias: !compact,
                    powerPreference: 'low-power',
                    failIfMajorPerformanceCaveat: false,
                    adaptToDeviceRatio: false,
                });

                if (disposed) { engine.dispose(); return; }
                engineRef.current = engine;

                const scene = new BABYLON.Scene(engine);
                if (disposed) { scene.dispose(); engine.dispose(); return; }
                sceneRef.current = scene;
                scene.clearColor = new BABYLON.Color4(0.04, 0.02, 0.06, 1);
                scene.ambientColor = new BABYLON.Color3(0.35, 0.35, 0.35);

                // Disable features we don't need
                scene.skipPointerMovePicking = true;
                scene.autoClear = true;
                scene.autoClearDepthAndStencil = true;

                // Camera — fixed arc rotate for avatar display
                const camera = new BABYLON.ArcRotateCamera(
                    'avatarCam',
                    -Math.PI / 2,
                    Math.PI / 2.4,
                    compact ? 3.5 : 3,
                    new BABYLON.Vector3(0, 0.8, 0),
                    scene
                );
                camera.lowerRadiusLimit = camera.radius;
                camera.upperRadiusLimit = camera.radius;
                if (!compact) {
                    camera.attachControl(canvas, false);
                    camera.lowerBetaLimit = Math.PI / 3;
                    camera.upperBetaLimit = Math.PI / 2;
                }
                camera.minZ = 0.1;

                // Lighting — lightweight setup
                const hemiLight = new BABYLON.HemisphericLight(
                    'hemi', new BABYLON.Vector3(0, 1, 0), scene
                );
                hemiLight.intensity = 1.4;
                hemiLight.diffuse = new BABYLON.Color3(1, 0.97, 0.95);
                hemiLight.groundColor = new BABYLON.Color3(0.4, 0.4, 0.45);

                const dirLight = new BABYLON.DirectionalLight(
                    'dir', new BABYLON.Vector3(-0.5, -1, 0.5), scene
                );
                dirLight.intensity = 1.0;
                dirLight.diffuse = new BABYLON.Color3(1, 0.98, 0.95);

                // Load character model — split path into rootUrl + filename for Babylon
                const lastSlash = modelDef.modelPath.lastIndexOf('/');
                const rootUrl = modelDef.modelPath.substring(0, lastSlash + 1);
                const fileName = modelDef.modelPath.substring(lastSlash + 1);

                let result;
                try {
                    result = await BABYLON.SceneLoader.ImportMeshAsync(
                        '', rootUrl, fileName, scene
                    );
                } catch (loadErr) {
                    console.error('[Avatar3D] Model load failed:', modelDef.modelPath, loadErr);
                    throw loadErr;
                }

                if (disposed || scene.isDisposed) return;

                // Find root mesh and normalize scale
                const rootMesh = result.meshes[0];
                if (rootMesh) {
                    const bounds = rootMesh.getHierarchyBoundingVectors();
                    const height = bounds.max.y - bounds.min.y;
                    const targetHeight = 1.8;
                    const scaleFactor = targetHeight / Math.max(height, 0.01);
                    rootMesh.scaling = new BABYLON.Vector3(scaleFactor, scaleFactor, scaleFactor);
                    const newBounds = rootMesh.getHierarchyBoundingVectors();
                    rootMesh.position.y = -newBounds.min.y;
                }

                // Convert PBR → StandardMaterial. GLB PBR materials need IBL
                // (environment texture) to look correct, which is expensive on
                // Chromebooks. StandardMaterial uses Blinn-Phong and works well
                // with directional + hemispheric lights.
                // Store tinting metadata so appearance updates don't rebuild the scene.
                const tintData: typeof meshTintDataRef.current = [];
                result.meshes.forEach(mesh => {
                    if (!mesh.material) return;
                    const pbr = mesh.material as any;
                    const ac = pbr.albedoColor;
                    if (!ac) return;
                    const stdMat = new BABYLON.StandardMaterial(pbr.name + '_std', scene);
                    stdMat.diffuseColor = ac.clone();
                    stdMat.specularColor = new BABYLON.Color3(0.15, 0.15, 0.15);
                    stdMat.alpha = 1;

                    const category = classifyByMaterial(pbr.name || '');
                    tintData.push({ material: stdMat, category, originalColor: { r: ac.r, g: ac.g, b: ac.b } });

                    mesh.material = stdMat;
                    pbr.dispose();
                });
                meshTintDataRef.current = tintData;

                // Apply initial tinting
                applyTinting(tintData, appearanceRef.current);

                // Load hair overlay if hairStyle > 0
                const hairStyleIdx = appearanceRef.current?.hairStyle;
                currentHairStyleRef.current = hairStyleIdx;
                const hairDef = hairStyleIdx != null ? getHairModel(hairStyleIdx) : undefined;
                if (hairDef && rootMesh) {
                    // Hide built-in hair meshes on the character
                    result.meshes.forEach(mesh => {
                        if (mesh.material && HAIR_MAT_PATTERNS.test((mesh.material as any).name || '')) {
                            mesh.isVisible = false;
                        }
                    });

                    try {
                        const hairLastSlash = hairDef.modelPath.lastIndexOf('/');
                        const hairRootUrl = hairDef.modelPath.substring(0, hairLastSlash + 1);
                        const hairFileName = hairDef.modelPath.substring(hairLastSlash + 1);

                        const hairResult = await BABYLON.SceneLoader.ImportMeshAsync(
                            '', hairRootUrl, hairFileName, scene
                        );

                        if (disposed || scene.isDisposed) return;

                        // Both our character models and the hair GLBs are Quaternius
                        // origin-at-0 models. Apply the same world transform so they align.
                        const hairRoot = hairResult.meshes[0];
                        if (hairRoot) {
                            hairRoot.scaling = rootMesh.scaling.clone();
                            hairRoot.position = rootMesh.position.clone();
                        }

                        // Convert hair PBR → StandardMaterial and add to tint data
                        hairResult.meshes.forEach(mesh => {
                            if (!mesh.material) return;
                            const pbr = mesh.material as any;
                            const ac = pbr.albedoColor || pbr.baseColor;
                            const fallbackColor = { r: 0.5, g: 0.5, b: 0.5 };
                            const color = ac ? { r: ac.r, g: ac.g, b: ac.b } : fallbackColor;

                            const stdMat = new BABYLON.StandardMaterial(pbr.name + '_hair_std', scene);
                            stdMat.diffuseColor = new BABYLON.Color3(color.r, color.g, color.b);
                            stdMat.specularColor = new BABYLON.Color3(0.15, 0.15, 0.15);
                            stdMat.ambientColor = new BABYLON.Color3(color.r * 0.3, color.g * 0.3, color.b * 0.3);
                            stdMat.alpha = 1;
                            stdMat.backFaceCulling = false;
                            // Force opaque rendering (fix Quaternius alpha=0 bug)
                            stdMat.transparencyMode = 0; // OPAQUE

                            // Ensure mesh is visible
                            mesh.isVisible = true;
                            mesh.visibility = 1;

                            tintData.push({ material: stdMat, category: 'hair', originalColor: color });

                            mesh.material = stdMat;
                            pbr.dispose();
                        });

                        hairMeshesRef.current = hairResult.meshes;
                        meshTintDataRef.current = tintData;
                        applyTinting(tintData, appearanceRef.current);

                        console.log('[Avatar3D] Hair overlay loaded:', hairDef.modelPath,
                            'meshes:', hairResult.meshes.length,
                            'hairRoot scaling:', hairRoot?.scaling?.toString());
                    } catch (hairErr) {
                        console.warn('[Avatar3D] Hair overlay failed to load:', hairErr);
                    }
                }

                // Play idle animation if available
                if (result.animationGroups.length > 0) {
                    const idleAnim = result.animationGroups.find(
                        ag => ag.name.toLowerCase().includes('idle')
                    ) || result.animationGroups[0];
                    result.animationGroups.forEach(ag => ag.stop());
                    idleAnim.start(true, 1.0);
                }

                // === COSMETIC EFFECTS (read from refs for current values) ===
                const aura = auraCosmeticRef.current;
                const particles = particleCosmeticRef.current;
                const evoLevel = evolutionRef.current;

                // Aura: glow layer on the model — skip GlowLayer (causes postProcessManager
                // null errors on dispose race). Use a simple emissive color boost instead.
                if (aura && !compact) {
                    const color = BABYLON.Color3.FromHexString(aura.color);
                    result.meshes.forEach(mesh => {
                        if (mesh.material && 'emissiveColor' in mesh.material) {
                            (mesh.material as any).emissiveColor = new BABYLON.Color3(
                                color.r * aura.intensity * 0.4,
                                color.g * aura.intensity * 0.4,
                                color.b * aura.intensity * 0.4,
                            );
                        }
                    });
                }

                // Particles: floating particles around the character
                if (particles && !compact) {
                    const particleSystem = new BABYLON.ParticleSystem(
                        'cosmeticParticles', 30, scene
                    );
                    particleSystem.createPointEmitter(
                        new BABYLON.Vector3(-0.5, 0, -0.5),
                        new BABYLON.Vector3(0.5, 2, 0.5)
                    );
                    particleSystem.emitter = new BABYLON.Vector3(0, 1, 0);
                    particleSystem.minLifeTime = 1.5;
                    particleSystem.maxLifeTime = 3;
                    particleSystem.emitRate = 5;
                    particleSystem.minSize = 0.02;
                    particleSystem.maxSize = 0.06;
                    particleSystem.gravity = new BABYLON.Vector3(0, 0.1, 0);
                    const pColor = BABYLON.Color4.FromHexString(particles.color + 'ff');
                    const sColor = BABYLON.Color4.FromHexString(particles.secondaryColor + 'ff');
                    particleSystem.color1 = pColor;
                    particleSystem.color2 = sColor;
                    particleSystem.colorDead = new BABYLON.Color4(pColor.r, pColor.g, pColor.b, 0);
                    particleSystem.start();
                }

                // Evolution glow — subtle rim light that increases with level
                if (evoLevel > 0 && !compact) {
                    const rimLight = new BABYLON.PointLight(
                        'evoGlow', new BABYLON.Vector3(0, 1.2, -1), scene
                    );
                    rimLight.intensity = Math.min(evoLevel * 0.15, 1.5);
                    rimLight.diffuse = new BABYLON.Color3(0.5, 0.3, 1.0);
                }

                // Force engine to pick up actual canvas dimensions after layout
                // (modal may still be animating when useEffect fires)
                engine.resize();
                requestAnimationFrame(() => {
                    if (!engine.isDisposed) engine.resize();
                });

                // Render loop
                engine.runRenderLoop(() => {
                    if (scene && !scene.isDisposed) {
                        scene.render();
                    }
                });

                // Handle resize
                const handleResize = () => { if (!engine.isDisposed) engine.resize(); };
                window.addEventListener('resize', handleResize);
                cleanupRef.current = () => window.removeEventListener('resize', handleResize);

                if (mountedRef.current && !disposed) {
                    setLoading(false);
                    setError(false);
                }
            } catch (err) {
                console.error('[Avatar3D] Failed to setup scene:', err);
                if (mountedRef.current && !disposed) {
                    setError(true);
                    setLoading(false);
                }
            }
        };

        setLoading(true);
        setup();

        return () => {
            disposed = true;
            mountedRef.current = false;
            cleanupRef.current?.();
            cleanupRef.current = null;
            if (sceneRef.current && !sceneRef.current.isDisposed) {
                sceneRef.current.dispose();
                sceneRef.current = null;
            }
            if (engineRef.current && !engineRef.current.isDisposed) {
                engineRef.current.dispose();
                engineRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modelId, compact, appearance?.hairStyle]);

    // Update material tints in-place when appearance changes (no scene rebuild)
    useEffect(() => {
        if (meshTintDataRef.current.length > 0) {
            applyTinting(meshTintDataRef.current, appearance);
        }
    }, [appearance?.skinTone, appearance?.hairColor, appearance?.suitHue]);

    // === COMPACT FALLBACK ===
    // For tiny display contexts (leaderboard rows, chat), render a colored silhouette
    if (compact) {
        const bgColor = modelDef?.thumbnailColor || '#4a4a6a';
        return (
            <div
                className={`relative w-full h-full rounded-lg overflow-hidden ${className}`}
                style={{ background: `linear-gradient(135deg, ${bgColor}33, ${bgColor}11)` }}
            >
                <canvas
                    ref={canvasRef}
                    className="w-full h-full"
                    style={{ imageRendering: 'auto' }}
                    width={64}
                    height={96}
                />
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-purple-400/40 border-t-purple-400 rounded-full animate-spin" />
                    </div>
                )}
            </div>
        );
    }

    // === FULL 3D SCENE ===
    return (
        <div className={`relative w-full h-full ${className}`}>
            {/* Aura background glow (CSS, not 3D — very cheap) */}
            {auraCosmetic && (
                <div
                    className="absolute inset-0 rounded-2xl opacity-40 blur-xl pointer-events-none"
                    style={{
                        background: `radial-gradient(ellipse at 50% 60%, ${auraCosmetic.color}66, transparent 70%)`,
                    }}
                />
            )}

            <canvas
                ref={canvasRef}
                className="w-full h-full rounded-xl"
                style={{ imageRendering: 'auto' }}
                width={200}
                height={300}
            />

            {/* Loading overlay */}
            {loading && !error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 rounded-xl">
                    <div className="w-6 h-6 border-2 border-purple-400/40 border-t-purple-400 rounded-full animate-spin mb-2" />
                    <span className="text-[9px] text-gray-400 font-mono uppercase tracking-wider">Loading model...</span>
                </div>
            )}

            {/* Error fallback */}
            {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-xl">
                    <span className="text-2xl mb-1">&#x1F916;</span>
                    <span className="text-[9px] text-gray-500 font-mono">3D unavailable</span>
                </div>
            )}

            {/* Frame cosmetic (CSS border overlay) */}
            {cosmetics.find(c => c.type === 'FRAME') && (
                <div
                    className="absolute inset-0 rounded-xl pointer-events-none"
                    style={{
                        border: `2px solid ${cosmetics.find(c => c.type === 'FRAME')!.color}`,
                        boxShadow: `inset 0 0 12px ${cosmetics.find(c => c.type === 'FRAME')!.color}44,
                                     0 0 8px ${cosmetics.find(c => c.type === 'FRAME')!.color}33`,
                    }}
                />
            )}

            {/* Trail cosmetic (bottom glow) */}
            {cosmetics.find(c => c.type === 'TRAIL') && (
                <div
                    className="absolute bottom-0 left-0 right-0 h-8 rounded-b-xl pointer-events-none"
                    style={{
                        background: `linear-gradient(to top, ${cosmetics.find(c => c.type === 'TRAIL')!.color}44, transparent)`,
                    }}
                />
            )}
        </div>
    );
};

export default Avatar3D;
