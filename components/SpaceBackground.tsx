
import React, { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  radius: number;
  baseOpacity: number;
  opacity: number;
  twinkleSpeed: number;
  twinkleOffset: number;
  drift: number;
  driftOffset: number;
}

interface NebulaCloud {
  x: number;
  y: number;
  rx: number;
  ry: number;
  color: string;
  opacity: number;
  driftX: number;
  driftY: number;
}

const STAR_COUNT = 220;
const NEBULA_COUNT = 5;

// Seeded pseudo-random using a simple LCG — deterministic, no Math.random() in render
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (1664525 * s + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const SpaceBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const starsRef = useRef<Star[]>([]);
  const nebulaeRef = useRef<NebulaCloud[]>([]);
  const timeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rand = lcg(42);

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    // Build star field once on mount
    starsRef.current = Array.from({ length: STAR_COUNT }, () => ({
      x: rand() * window.innerWidth,
      y: rand() * window.innerHeight,
      radius: rand() * 1.4 + 0.3,
      baseOpacity: rand() * 0.5 + 0.3,
      opacity: rand() * 0.5 + 0.3,
      twinkleSpeed: rand() * 0.006 + 0.002,
      twinkleOffset: rand() * Math.PI * 2,
      drift: (rand() - 0.5) * 0.06,
      driftOffset: rand() * Math.PI * 2,
    }));

    // Nebula clouds — deep purples and blues
    const NEBULA_COLORS = [
      'rgba(107, 33, 168, 0.12)',   // purple-700
      'rgba(45, 27, 105, 0.14)',    // indigo-deep
      'rgba(26, 5, 51, 0.18)',      // ultra-deep purple
      'rgba(59, 7, 100, 0.10)',     // violet
      'rgba(17, 24, 80, 0.13)',     // deep blue-purple
    ];

    nebulaeRef.current = Array.from({ length: NEBULA_COUNT }, (_, i) => ({
      x: rand() * window.innerWidth,
      y: rand() * window.innerHeight,
      rx: rand() * 380 + 200,
      ry: rand() * 220 + 120,
      color: NEBULA_COLORS[i % NEBULA_COLORS.length],
      opacity: rand() * 0.5 + 0.5,
      driftX: (rand() - 0.5) * 0.025,
      driftY: (rand() - 0.5) * 0.015,
    }));

    const draw = (timestamp: number) => {
      timeRef.current = timestamp * 0.001; // seconds
      const t = timeRef.current;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // --- Layer 1: Deep space radial gradient ---
      const bgGrad = ctx.createRadialGradient(
        canvas.width * 0.5, canvas.height * 0.35, 0,
        canvas.width * 0.5, canvas.height * 0.5, Math.max(canvas.width, canvas.height) * 0.75
      );
      bgGrad.addColorStop(0, '#1e0b3b');
      bgGrad.addColorStop(0.45, '#120624');
      bgGrad.addColorStop(1, '#0f0720');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // --- Layer 2: Nebula clouds (slow drift) ---
      for (const neb of nebulaeRef.current) {
        neb.x += neb.driftX;
        neb.y += neb.driftY;

        // Wrap at edges with generous margin
        if (neb.x > canvas.width + neb.rx) neb.x = -neb.rx;
        if (neb.x < -neb.rx) neb.x = canvas.width + neb.rx;
        if (neb.y > canvas.height + neb.ry) neb.y = -neb.ry;
        if (neb.y < -neb.ry) neb.y = canvas.height + neb.ry;

        const grad = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.rx);
        grad.addColorStop(0, neb.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.save();
        ctx.globalAlpha = neb.opacity;
        ctx.beginPath();
        ctx.ellipse(neb.x, neb.y, neb.rx, neb.ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      }

      // --- Layer 3: Twinkling stars ---
      for (const star of starsRef.current) {
        // Gentle sine-based twinkling
        const twinkle = Math.sin(t * star.twinkleSpeed * 60 + star.twinkleOffset);
        star.opacity = star.baseOpacity + twinkle * 0.25;
        star.opacity = Math.max(0.05, Math.min(1, star.opacity));

        // Subtle horizontal drift
        const driftX = Math.sin(t * star.drift + star.driftOffset) * 0.3;
        const px = star.x + driftX;

        ctx.save();
        ctx.globalAlpha = star.opacity;

        // Larger stars get a subtle glow
        if (star.radius > 1.2) {
          const glow = ctx.createRadialGradient(px, star.y, 0, px, star.y, star.radius * 3.5);
          glow.addColorStop(0, 'rgba(216, 180, 254, 0.4)');
          glow.addColorStop(1, 'rgba(216, 180, 254, 0)');
          ctx.beginPath();
          ctx.arc(px, star.y, star.radius * 3.5, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Star core
        ctx.beginPath();
        ctx.arc(px, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = star.radius > 1.0
          ? `rgba(233, 213, 255, ${star.opacity})`   // slightly purple-white for larger
          : `rgba(255, 255, 255, ${star.opacity})`;   // pure white for small
        ctx.fill();
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    const handleResize = () => {
      resize();
      // Re-scatter stars on resize to fill new dimensions
      const r2 = lcg(42);
      starsRef.current = starsRef.current.map(star => ({
        ...star,
        x: r2() * canvas.width,
        y: r2() * canvas.height,
      }));
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: -2 }}
    />
  );
};

export default SpaceBackground;
