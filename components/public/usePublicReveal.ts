import React, { useEffect } from 'react';

/**
 * One-way scroll-reveal for public pages. Watches every `.pub-reveal` element
 * inside `rootRef` and adds `.pub-reveal-visible` the first time it enters the
 * viewport. Chromebook-safe: transform/opacity only, 350ms, no loops.
 * Elements start visible if IntersectionObserver is unavailable.
 */
export function usePublicReveal<T extends HTMLElement>(): React.RefObject<T | null> {
  const rootRef = React.useRef<T>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (typeof IntersectionObserver === 'undefined') {
      root.querySelectorAll('.pub-reveal').forEach((el) => el.classList.add('pub-reveal-visible'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('pub-reveal-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    root.querySelectorAll('.pub-reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return rootRef;
}
