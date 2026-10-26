import React, { useState, useRef, useCallback, useEffect } from 'react';
import { FORTUNE_WHEEL_PRIZES, RAIL_PRIZE_IDS_CLIENT } from '../../lib/achievements';
import { dataService } from '../../services/dataService';
import { sfx } from '../../lib/sfx';
import { useThrottle } from '../../lib/rateLimiting';
import { useToast } from '../ToastProvider';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useT, useInterpolate } from '../../lib/i18n';

interface FortuneWheelProps {
  currency: number;
  lastSpin?: string;
  classType?: string;
}

const SEGMENTS = FORTUNE_WHEEL_PRIZES;

// Same local-calendar-day rule the Cloud Function enforces (see localDateString there).
function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const FortuneWheel: React.FC<FortuneWheelProps> = ({ lastSpin, classType }) => {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [wonPrizeId, setWonPrizeId] = useState<string | null>(null);
  const wheelRef = useRef<SVGGElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toast = useToast();
  const reducedMotion = useReducedMotion();
  const t = useT();
  const interpolate = useInterpolate();
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const today = localDateString(new Date());
  const alreadySpun = lastSpin === today;
  const canSpin = !alreadySpun && !spinning;

  const doSpin = useCallback(async () => {
    if (!canSpin) return;
    setSpinning(true);
    setResult(null);
    setWonPrizeId(null);
    sfx.wheelSpin();

    try {
      const data = await dataService.spinFortuneWheel(classType);
      // Find prize index for animation target
      const prizeIdx = SEGMENTS.findIndex(p => p.id === data.prizeId);
      const segAngle = 360 / SEGMENTS.length;
      // Spin 5 full rotations + land on the prize segment
      const targetAngle = 360 * 5 + (360 - prizeIdx * segAngle - segAngle / 2);
      setRotation(prev => prev + targetAngle);

      // Wait for animation to finish — use short duration when reduced motion is preferred
      const spinDuration = reducedMotion ? 200 : 4000;
      const timerId = setTimeout(() => {
        sfx.wheelPrize();
        setResult(data.rewardDescription);
        setWonPrizeId(data.prizeId);
        setSpinning(false);
        if (data.prizeType !== 'NOTHING') {
          toast.success(interpolate('fortune.wonToast', { reward: data.rewardDescription }));
        } else {
          toast.info(data.rewardDescription);
        }
        timersRef.current = timersRef.current.filter(t => t !== timerId);
      }, spinDuration);
      timersRef.current.push(timerId);
    } catch (err) {
      setSpinning(false);
      toast.error(err instanceof Error ? err.message : t('fortune.spinFailed'));
    }
  }, [canSpin, classType, toast, t, interpolate, reducedMotion]);

  const handleSpin = useThrottle(doSpin, 5000);

  const segAngle = 360 / SEGMENTS.length;
  const radius = 140;
  const isRailPrize = wonPrizeId !== null && RAIL_PRIZE_IDS_CLIENT.has(wonPrizeId);

  return (
    <div className="flex flex-col items-center gap-6">
      <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
        {t('fortune.title')}
      </h3>
      <p className="text-sm text-slate-300">{t('fortune.subtitle')}</p>

      {/* Breathing idle animation on the gold ring — the only idle animation.
          Suppressed entirely under prefers-reduced-motion. */}
      {!reducedMotion && (
        <style>{`
          @keyframes fortune-ring-breathe {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.55; }
          }
          .fortune-ring-breathe { animation: fortune-ring-breathe 3s ease-in-out infinite; }
        `}</style>
      )}

      <div className="relative w-full max-w-[min(90vw,380px,52vh)] aspect-square mx-auto">
        <svg
          viewBox="-160 -160 320 320"
          className="w-full h-full drop-shadow-2xl overflow-visible"
          role="img"
          aria-label={t('fortune.title')}
        >
          {/* Static outer ring — contains the 13 wedges and carries the idle breathing */}
          <circle
            r="148"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="3"
            className={canSpin && !spinning ? 'fortune-ring-breathe' : undefined}
          />
          <defs>
            {/* Gold rail: a real gradient so the jackpot tier reads as metal, not flat rust */}
            <linearGradient id="fortune-rail-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="55%" stopColor="#e8a012" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
          </defs>
          <g
            style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: '0px 0px',
              transition: spinning
                ? reducedMotion
                  ? 'transform 0.2s ease-out'
                  : 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)'
                : 'none',
            }}
            ref={wheelRef}
            aria-hidden="true"
          >
            {SEGMENTS.map((seg, i) => {
              const startAngle = (i * segAngle - 90) * (Math.PI / 180);
              const endAngle = ((i + 1) * segAngle - 90) * (Math.PI / 180);
              const x1 = radius * Math.cos(startAngle);
              const y1 = radius * Math.sin(startAngle);
              const x2 = radius * Math.cos(endAngle);
              const y2 = radius * Math.sin(endAngle);
              const largeArc = segAngle > 180 ? 1 : 0;

              // Label layout solved by measurement, not by eye: 13px type at 0.82r with a
              // 6px row gap gives zero bounding-box overlap between all 13 adjacent
              // segments and keeps every glyph inside the 140px rim at 300–380px stages.
              // Label layout solved by measurement: single-line, 12px, at 0.78r.
              // Two-line labels were tried first and rejected: each tspan line box is
              // ~15px tall, so stacked rows need >=16px of radial separation, which a
              // 27.7 degree wedge cannot supply without colliding with its neighbours.
              // Single line at this size measures zero overlap and stays inside the rim
              // from a 280px to a 380px stage.
              const midAngle = ((i + 0.5) * segAngle - 90) * (Math.PI / 180);
              const labelR = radius * 0.78;
              const lx = labelR * Math.cos(midAngle);
              const ly = labelR * Math.sin(midAngle);
              // Fold any angle into -90..90 so no label ever reads upside-down.
              // A pure `>90 && <270` test misses segments past 270 degrees.
              let textAngle = (i + 0.5) * segAngle;
              textAngle = ((textAngle + 90) % 180 + 180) % 180 - 90;
              const label = seg.short ?? seg.label;

              return (
                <g key={seg.id}>
                  <path
                    d={`M0,0 L${x1},${y1} A${radius},${radius} 0 ${largeArc},1 ${x2},${y2} Z`}
                    fill={RAIL_PRIZE_IDS_CLIENT.has(seg.id) ? 'url(#fortune-rail-gold)' : seg.color}
                    stroke="#0b0b14"
                    strokeWidth="2"
                  />
                  <text
                    x={lx}
                    y={ly}
                    fill="white"
                    fontSize="11"
                    fontWeight="700"
                    letterSpacing="0.01em"
                    textAnchor="middle"
                    dominantBaseline="central"
                    paintOrder="stroke"
                    stroke="rgba(0,0,0,0.55)"
                    strokeWidth="2.5"
                    transform={`rotate(${textAngle}, ${lx}, ${ly})`}
                  >
                    {label}
                  </text>
                </g>
              );
            })}
            {/* Gold rail rim — 2px inner arc at r=132 on the three top-tier segments,
                with a soft glow so they read as one band ("the stars"). */}
            <g style={{ filter: 'drop-shadow(0 0 6px rgba(251,191,36,0.45))' }}>
              {SEGMENTS.map((seg, i) => {
                if (i < 10) return null;
                const startAngle = (i * segAngle - 90) * (Math.PI / 180);
                const endAngle = ((i + 1) * segAngle - 90) * (Math.PI / 180);
                const rx1 = 132 * Math.cos(startAngle);
                const ry1 = 132 * Math.sin(startAngle);
                const rx2 = 132 * Math.cos(endAngle);
                const ry2 = 132 * Math.sin(endAngle);
                return (
                  <path
                    key={`${seg.id}-rim`}
                    d={`M${rx1},${ry1} A132,132 0 0,1 ${rx2},${ry2}`}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="2"
                  />
                );
              })}
            </g>
            {/* Radial darkening toward the hub so labels sit on a calmer background */}
            <radialGradient id="fortune-hub-shade" gradientUnits="userSpaceOnUse" r="140">
              <stop offset="28.5%" stopColor="rgba(0,0,0,0.35)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
            <circle r="140" fill="url(#fortune-hub-shade)" pointerEvents="none" />
            {/* Center hub — deliberately NON-verbal. A "SPIN" label here competed with
                the real action button below and read as a second clickable target. */}
            <circle cx="0" cy="0" r="26" fill="#12121c" stroke="#fbbf24" strokeWidth="2" />
            <path
              d="M0,-11 L3.2,-3.2 L11,0 L3.2,3.2 L0,11 L-3.2,3.2 L-11,0 L-3.2,-3.2 Z"
              fill="#fbbf24"
              opacity="0.9"
            />
          </g>
          {/* Pointer — inside the SVG at 12 o'clock, drawn after the rotating group so it never rotates */}
          <path
            d="M-10,-160 L10,-160 L0,-148 Z"
            fill="#fbbf24"
            stroke="#0b0b14"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {result && (
        <div
          className="text-center animate-in fade-in zoom-in duration-300"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm text-gray-300">{t('fortune.wonLabel')}</p>
          <p
            className={`text-lg font-black ${
              isRailPrize
                ? 'text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                : 'text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-500'
            }`}
          >
            {result}
          </p>
        </div>
      )}

      <button
        onClick={handleSpin}
        disabled={!canSpin}
        aria-disabled={!canSpin}
        type="button"
        className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${
          canSpin
            ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:scale-105 hover:shadow-lg hover:shadow-purple-500/30'
            : 'bg-white/5 text-gray-600 cursor-not-allowed'
        }`}
      >
        {spinning ? t('fortune.spinning') : alreadySpun ? t('fortune.comeBack') : t('fortune.spinBtn')}
      </button>

      <p className="text-xs text-slate-400 text-center">{t('fortune.pityHint')}</p>
    </div>
  );
};

export default FortuneWheel;
