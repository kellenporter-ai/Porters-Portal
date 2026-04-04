
import React, { useState } from 'react';

interface AnimatedIconProps {
  src: string;
  alt: string;
  size?: number;
  className?: string;
  disableAnimation?: boolean;
  /** When true (default), particles activate on parent .group hover via CSS.
   *  When false, uses internal hover state (for standalone use like the logo). */
  groupHover?: boolean;
}

const AnimatedIcon: React.FC<AnimatedIconProps> = ({
  src,
  alt,
  size = 20,
  className = '',
  disableAnimation = false,
  groupHover = true,
}) => {
  // Internal hover state only used when groupHover is false (standalone mode)
  const [hovered, setHovered] = useState(false);
  const useInternalHover = !groupHover;
  const showParticles = useInternalHover && hovered && !disableAnimation;

  // Particle SVG needs extra room for orbiting particles beyond the icon bounds
  const svgPad = Math.max(size * 0.5, 10);
  const svgSize = size + svgPad * 2;
  const c = svgSize / 2; // center of SVG

  return (
    <span
      className={`animated-icon-wrap ${className}`}
      style={{ display: 'inline-flex', position: 'relative', width: size, height: size }}
      {...(useInternalHover ? {
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
      } : {})}
    >
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        draggable={false}
        className={`ai-icon-img ${useInternalHover && hovered && !disableAnimation ? 'ai-icon-hovered' : ''}`}
        style={{ display: 'block', width: size, height: size, objectFit: 'contain', transition: 'filter 0.25s ease-out' }}
      />
      {!disableAnimation && (
        <svg
          className="animated-icon-particles"
          width={svgSize}
          height={svgSize}
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          style={{ position: 'absolute', top: -svgPad, left: -svgPad, pointerEvents: 'none', overflow: 'visible' }}
        >
          <circle
            className={`ai-particle ai-p1 ${showParticles ? 'ai-active' : ''}`}
            cx={c - size * 0.35}
            cy={c - size * 0.3}
            r={Math.max(size * 0.1, 3)}
          />
          <circle
            className={`ai-particle ai-p2 ${showParticles ? 'ai-active' : ''}`}
            cx={c + size * 0.35}
            cy={c - size * 0.2}
            r={Math.max(size * 0.09, 2.5)}
          />
          <circle
            className={`ai-particle ai-p3 ${showParticles ? 'ai-active' : ''}`}
            cx={c + size * 0.3}
            cy={c + size * 0.35}
            r={Math.max(size * 0.1, 3)}
          />
          <circle
            className={`ai-particle ai-p4 ${showParticles ? 'ai-active' : ''}`}
            cx={c - size * 0.3}
            cy={c + size * 0.25}
            r={Math.max(size * 0.08, 2.5)}
          />
        </svg>
      )}
    </span>
  );
};

export default AnimatedIcon;
