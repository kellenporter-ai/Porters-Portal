import React from 'react';

interface PortalLogoProps {
  size?: number;
}

const PortalLogo: React.FC<PortalLogoProps> = ({ size = 40 }) => {
  const particleCount = 5;
  const svgSize = size + 12; // extra space for particles orbiting outside
  const center = svgSize / 2;
  const orbitRadius = size / 2 + 3;

  return (
    <div
      className="relative shrink-0"
      style={{ width: svgSize, height: svgSize }}
    >
      {/* Logo image */}
      <img
        src="/assets/portal-logo.png"
        alt="Porter's Portal"
        className="rounded-xl absolute"
        style={{
          width: size,
          height: size,
          top: (svgSize - size) / 2,
          left: (svgSize - size) / 2,
        }}
        draggable={false}
      />

      {/* SVG particle overlay */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={svgSize}
        height={svgSize}
        viewBox={`0 0 ${svgSize} ${svgSize}`}
      >
        {Array.from({ length: particleCount }, (_, i) => {
          const duration = 2.5 + i * 0.4; // 2.5s to 4.1s
          const startAngle = (360 / particleCount) * i;
          const particleSize = 1.5 + (i % 2) * 0.8;
          const opacity = 0.6 + (i % 3) * 0.15;

          return (
            <circle
              key={i}
              r={particleSize}
              fill="#a78bfa"
              opacity={opacity}
            >
              <animateMotion
                dur={`${duration}s`}
                repeatCount="indefinite"
                path={`M ${center + Math.cos((startAngle * Math.PI) / 180) * orbitRadius} ${center + Math.sin((startAngle * Math.PI) / 180) * orbitRadius} A ${orbitRadius} ${orbitRadius} 0 1 1 ${center + Math.cos(((startAngle - 0.01) * Math.PI) / 180) * orbitRadius} ${center + Math.sin(((startAngle - 0.01) * Math.PI) / 180) * orbitRadius}`}
              />
              <animate
                attributeName="opacity"
                values={`${opacity};${opacity * 0.3};${opacity};${opacity * 0.5};${opacity}`}
                dur={`${duration * 0.7}s`}
                repeatCount="indefinite"
              />
            </circle>
          );
        })}
      </svg>

    </div>
  );
};

export default PortalLogo;
