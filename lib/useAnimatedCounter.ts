import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from its previous value to the current value.
 * Returns the display value that smoothly transitions.
 */
export function useAnimatedCounter(target: number, duration: number = 800): number {
    const [display, setDisplay] = useState(target);
    const prevRef = useRef(target);
    const frameRef = useRef<number>(0);

    useEffect(() => {
        const from = prevRef.current;
        const to = target;
        prevRef.current = target;

        if (from === to) return;

        const start = performance.now();
        const diff = to - from;

        const step = (now: number) => {
            const elapsed = now - start;
            const t = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - t, 3);
            setDisplay(Math.round(from + diff * eased));
            if (t < 1) {
                frameRef.current = requestAnimationFrame(step);
            }
        };

        frameRef.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frameRef.current);
    }, [target, duration]);

    return display;
}
