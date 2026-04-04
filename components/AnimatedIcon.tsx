
import React, { useState } from 'react';

interface AnimatedIconProps {
  src: string;
  alt: string;
  size?: number;
  className?: string;
  disableAnimation?: boolean;
}

const AnimatedIcon: React.FC<AnimatedIconProps> = ({
  src,
  alt,
  size = 20,
  className = '',
  disableAnimation = false,
}) => {
  const [hovered, setHovered] = useState(false);
  const showParticles = hovered && !disableAnimation;

  return (
    <span
      className={`animated-icon-wrap ${className}`}
      style={{ display: 'inline-flex', position: 'relative', width: size, height: size }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        draggable={false}
        style={{ display: 'block', width: size, height: size, objectFit: 'contain' }}
      />
      {!disableAnimation && (
        <svg
          className="animated-icon-particles"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        >
          <circle
            className={`ai-particle ai-p1 ${showParticles ? 'ai-active' : ''}`}
            cx={size * 0.15}
            cy={size * 0.2}
            r={size * 0.06}
          />
          <circle
            className={`ai-particle ai-p2 ${showParticles ? 'ai-active' : ''}`}
            cx={size * 0.85}
            cy={size * 0.3}
            r={size * 0.05}
          />
          <circle
            className={`ai-particle ai-p3 ${showParticles ? 'ai-active' : ''}`}
            cx={size * 0.8}
            cy={size * 0.85}
            r={size * 0.055}
          />
          <circle
            className={`ai-particle ai-p4 ${showParticles ? 'ai-active' : ''}`}
            cx={size * 0.2}
            cy={size * 0.75}
            r={size * 0.045}
          />
        </svg>
      )}
    </span>
  );
};

export default AnimatedIcon;
