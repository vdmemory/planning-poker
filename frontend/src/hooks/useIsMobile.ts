import { useEffect, useState } from "react";

// Matches Tailwind's `md` breakpoint (768px) used everywhere else in the app
// for the mobile/desktop split, so JS-computed layouts (PokerTable's pixel
// dimensions) stay in sync with the CSS ones.
const QUERY = "(max-width: 767px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isMobile;
}
