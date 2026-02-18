
import React, { useState, useRef } from 'react';
import { FORTUNE_WHEEL_PRIZES } from '../../lib/achievements';
import { dataService } from '../../services/dataService';
import { sfx } from '../../lib/sfx';
import { useToast } from '../ToastProvider';

interface FortuneWheelProps {
  currency: number;
  lastSpin?: string;
  classType?: string;
}

const WHEEL_COST = 25;
const SEGMENTS = FORTUNE_WHEEL_PRIZES;

const FortuneWheel: React.FC<FortuneWheelProps> = ({ currency, lastSpin, classType }) => {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const wheelRef = useRef<SVGGElement>(null);
  const toast = useToast();

  const today = new Date().toISOString().split('T')[0];
  const alreadySpun = lastSpin === today;
  const canSpin = !alreadySpun && currency >= WHEEL_COST && !spinning;

  const handleSpin = async () => {
    if (!canSpin) return;
    setSpinning(true);
    setResult(null);
    sfx.wheelSpin();

    try {
      const data = await dataService.spinFortuneWheel(classType);
      // Find prize index for animation target
      const prizeIdx = SEGMENTS.findIndex(p => p.id === data.prizeId);
      const segAngle = 360 / SEGMENTS.length;
      // Spin 5 full rotations + land on the prize segment
      const targetAngle = 360 * 5 + (360 - prizeIdx * segAngle - segAngle / 2);
      setRotation(prev => prev + targetAngle);

      // Wait for animation to finish
      setTimeout(() => {
        sfx.wheelPrize();
        setResult(data.rewardDescription);
        setSpinning(false);
        if (data.prizeType !== 'NOTHING') {
          toast.success(`You won: ${data.rewardDescription}!`);
        } else {
          toast.info(data.rewardDescription);
        }
      }, 4000);
    } catch (err) {
      setSpinning(false);
      toast.error(err instanceof Error ? err.message : 'Spin failed');
    }
  };

  const segAngle = 360 / SEGMENTS.length;
  const radius = 140;

  return (
    <div className="flex flex-col items-center gap-6">
      <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
        Fortune Terminal
      </h3>
      <p className="text-xs text-gray-500">Spend {WHEEL_COST} Flux for a daily spin</p>

      <div className="relative w-[320px] h-[320px]">
        {/* Pointer */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[24px] border-t-yellow-400 drop-shadow-lg" />

        <svg viewBox="-160 -160 320 320" className="w-full h-full drop-shadow-2xl">
          <g
            style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: 'center',
              transition: spinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none',
            }}
            ref={wheelRef}
          >
            {SEGMENTS.map((seg, i) => {
              const startAngle = (i * segAngle - 90) * (Math.PI / 180);
              const endAngle = ((i + 1) * segAngle - 90) * (Math.PI / 180);
              const x1 = radius * Math.cos(startAngle);
              const y1 = radius * Math.sin(startAngle);
              const x2 = radius * Math.cos(endAngle);
              const y2 = radius * Math.sin(endAngle);
              const largeArc = segAngle > 180 ? 1 : 0;

              // Label position
              const midAngle = ((i + 0.5) * segAngle - 90) * (Math.PI / 180);
              const lx = (radius * 0.65) * Math.cos(midAngle);
              const ly = (radius * 0.65) * Math.sin(midAngle);
              const textAngle = (i + 0.5) * segAngle;

              return (
                <g key={seg.id}>
                  <path
                    d={`M0,0 L${x1},${y1} A${radius},${radius} 0 ${largeArc},1 ${x2},${y2} Z`}
                    fill={seg.color}
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="1"
                  />
                  <text
                    x={lx}
                    y={ly}
                    fill="white"
                    fontSize="9"
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="central"
                    transform={`rotate(${textAngle}, ${lx}, ${ly})`}
                  >
                    {seg.label}
                  </text>
                </g>
              );
            })}
            {/* Center circle */}
            <circle cx="0" cy="0" r="18" fill="#1a1b26" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
            <text x="0" y="0" fill="white" fontSize="8" fontWeight="bold" textAnchor="middle" dominantBaseline="central">SPIN</text>
          </g>
        </svg>
      </div>

      {result && (
        <div className="text-center animate-in fade-in zoom-in duration-300">
          <p className="text-sm text-gray-300">You won:</p>
          <p className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-500">{result}</p>
        </div>
      )}

      <button
        onClick={handleSpin}
        disabled={!canSpin}
        className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
          canSpin
            ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:scale-105 hover:shadow-lg hover:shadow-purple-500/30'
            : 'bg-white/5 text-gray-600 cursor-not-allowed'
        }`}
      >
        {spinning ? 'Spinning...' : alreadySpun ? 'Come back tomorrow!' : `Spin (${WHEEL_COST} Flux)`}
      </button>
    </div>
  );
};

export default FortuneWheel;
