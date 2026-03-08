import React, { useEffect, useRef, useCallback, useState } from 'react';
import { ActiveCosmetics } from '../../types';
import { AGENT_COSMETICS } from '../../lib/gamification';
import { DEFAULT_CHARACTER_MODEL, getCharacterModel } from '../../lib/characterModels';

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

// ---- Props ----
interface Avatar3DProps {
    /** Character model ID from characterModels.ts */
    characterModelId?: string;
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
    activeCosmetics,
    evolutionLevel = 0,
    compact = false,
    className = '',
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<any>(null);
    const sceneRef = useRef<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const mountedRef = useRef(true);

    const modelId = characterModelId || DEFAULT_CHARACTER_MODEL;
    const modelDef = getCharacterModel(modelId);

    // Resolve cosmetic effects
    const cosmetics = resolveCosmetics(activeCosmetics);
    const auraCosmetic = cosmetics.find(c => c.type === 'AURA');
    const particleCosmetic = cosmetics.find(c => c.type === 'PARTICLE');

    const setupScene = useCallback(async () => {
        const canvas = canvasRef.current;
        if (!canvas || !modelDef) return;

        try {
            const BABYLON = await ensureBabylon();

            // Chromebook-optimized engine settings
            const engine = new BABYLON.Engine(canvas, true, {
                preserveDrawingBuffer: false,
                stencil: false,
                antialias: !compact, // Skip AA in compact mode
                powerPreference: 'low-power',
                failIfMajorPerformanceCaveat: false,
                adaptToDeviceRatio: false, // Don't scale to device pixel ratio — saves GPU
            });

            engineRef.current = engine;

            const scene = new BABYLON.Scene(engine);
            sceneRef.current = scene;
            scene.clearColor = new BABYLON.Color4(0, 0, 0, 0); // Transparent background
            scene.ambientColor = new BABYLON.Color3(0.3, 0.3, 0.35);

            // Disable features we don't need
            scene.skipPointerMovePicking = true;
            scene.autoClear = true;
            scene.autoClearDepthAndStencil = true;

            // Camera — fixed arc rotate for avatar display
            const camera = new BABYLON.ArcRotateCamera(
                'avatarCam',
                Math.PI / 2,    // alpha — front view
                Math.PI / 2.4,  // beta — slightly above eye level
                compact ? 3.5 : 3,
                new BABYLON.Vector3(0, 0.8, 0), // Target slightly above ground
                scene
            );
            camera.lowerRadiusLimit = camera.radius;
            camera.upperRadiusLimit = camera.radius;
            // Allow horizontal rotation for interactivity (non-compact only)
            if (!compact) {
                camera.attachControl(canvas, false);
                camera.lowerBetaLimit = Math.PI / 3;
                camera.upperBetaLimit = Math.PI / 2;
            }
            camera.minZ = 0.1;

            // Lighting — lightweight setup
            const hemiLight = new BABYLON.HemisphericLight(
                'hemi',
                new BABYLON.Vector3(0, 1, 0),
                scene
            );
            hemiLight.intensity = 0.7;
            hemiLight.groundColor = new BABYLON.Color3(0.15, 0.1, 0.2);

            const dirLight = new BABYLON.DirectionalLight(
                'dir',
                new BABYLON.Vector3(-0.5, -1, 0.5),
                scene
            );
            dirLight.intensity = 0.5;

            // Load character model
            const result = await BABYLON.SceneLoader.ImportMeshAsync(
                '',
                '',
                modelDef.modelPath,
                scene
            );

            if (!mountedRef.current) {
                engine.dispose();
                return;
            }

            // Find root mesh and normalize scale
            const rootMesh = result.meshes[0];
            if (rootMesh) {
                // Auto-scale to fit viewport
                const bounds = rootMesh.getHierarchyBoundingVectors();
                const height = bounds.max.y - bounds.min.y;
                const targetHeight = 1.8;
                const scaleFactor = targetHeight / Math.max(height, 0.01);
                rootMesh.scaling = new BABYLON.Vector3(scaleFactor, scaleFactor, scaleFactor);

                // Center vertically
                const newBounds = rootMesh.getHierarchyBoundingVectors();
                rootMesh.position.y = -newBounds.min.y;
            }

            // Play idle animation if available
            if (result.animationGroups.length > 0) {
                // Prefer idle, fallback to first animation
                const idleAnim = result.animationGroups.find(
                    ag => ag.name.toLowerCase().includes('idle')
                ) || result.animationGroups[0];
                // Stop all others
                result.animationGroups.forEach(ag => ag.stop());
                idleAnim.start(true, 1.0);
            }

            // === COSMETIC EFFECTS ===

            // Aura: glow layer on the model
            if (auraCosmetic && !compact) {
                const glowLayer = new BABYLON.GlowLayer('auraGlow', scene, {
                    mainTextureSamples: 2,
                    blurKernelSize: 32,
                });
                const color = BABYLON.Color3.FromHexString(auraCosmetic.color);
                glowLayer.intensity = auraCosmetic.intensity * 0.8;
                glowLayer.customEmissiveColorSelector = (
                    _mesh: any,
                    _subMesh: any,
                    _material: any,
                    result: any
                ) => {
                    result.set(
                        color.r * auraCosmetic.intensity,
                        color.g * auraCosmetic.intensity,
                        color.b * auraCosmetic.intensity,
                        1
                    );
                };
            }

            // Particles: floating particles around the character
            if (particleCosmetic && !compact) {
                const particleSystem = new BABYLON.ParticleSystem(
                    'cosmeticParticles',
                    30, // Low count for performance
                    scene
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
                const pColor = BABYLON.Color4.FromHexString(particleCosmetic.color + 'ff');
                const sColor = BABYLON.Color4.FromHexString(particleCosmetic.secondaryColor + 'ff');
                particleSystem.color1 = pColor;
                particleSystem.color2 = sColor;
                particleSystem.colorDead = new BABYLON.Color4(
                    pColor.r, pColor.g, pColor.b, 0
                );
                particleSystem.start();
            }

            // Evolution glow — subtle rim light that increases with level
            if (evolutionLevel > 0 && !compact) {
                const rimLight = new BABYLON.PointLight(
                    'evoGlow',
                    new BABYLON.Vector3(0, 1.2, -1),
                    scene
                );
                rimLight.intensity = Math.min(evolutionLevel * 0.15, 1.5);
                rimLight.diffuse = new BABYLON.Color3(0.5, 0.3, 1.0);
            }

            // Render loop
            engine.runRenderLoop(() => {
                if (scene && !scene.isDisposed) {
                    scene.render();
                }
            });

            // Handle resize
            const handleResize = () => engine.resize();
            window.addEventListener('resize', handleResize);

            if (mountedRef.current) {
                setLoading(false);
            }

            // Cleanup function stored for unmount
            (canvas as any).__avatar3dCleanup = () => {
                window.removeEventListener('resize', handleResize);
            };
        } catch (err) {
            console.error('[Avatar3D] Failed to setup scene:', err);
            if (mountedRef.current) {
                setError(true);
                setLoading(false);
            }
        }
    }, [modelId, modelDef, compact, auraCosmetic, particleCosmetic, evolutionLevel]);

    useEffect(() => {
        mountedRef.current = true;
        setupScene();

        return () => {
            mountedRef.current = false;
            const canvas = canvasRef.current;
            if (canvas && (canvas as any).__avatar3dCleanup) {
                (canvas as any).__avatar3dCleanup();
            }
            if (sceneRef.current && !sceneRef.current.isDisposed) {
                sceneRef.current.dispose();
                sceneRef.current = null;
            }
            if (engineRef.current) {
                engineRef.current.dispose();
                engineRef.current = null;
            }
        };
    }, [setupScene]);

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
