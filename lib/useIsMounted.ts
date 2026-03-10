import { useRef, useEffect } from 'react';

/** Returns a stable callback that reports whether the component is still mounted. */
export function useIsMounted(): () => boolean {
  const ref = useRef(false);
  useEffect(() => {
    ref.current = true;
    return () => { ref.current = false; };
  }, []);
  return () => ref.current;
}
