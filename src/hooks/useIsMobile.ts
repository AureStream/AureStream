import { useState, useEffect } from "react";

export function useIsMobile(threshold = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= threshold;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(`(max-width: ${threshold}px)`);
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };

    // Initialize
    setIsMobile(mediaQuery.matches);

    // Support both modern and older browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    } else {
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }
  }, [threshold]);

  return isMobile;
}
