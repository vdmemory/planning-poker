import { useEffect, useState } from "react";

/**
 * Issue #42 — accent palette: blue (default) and 6 alternatives. Orthogonal
 * to dark/light mode (`useTheme`). The accent name is set as
 * `data-accent="…"` on `<html>` and CSS variables in `index.css` swap the
 * `--c-accent-*` set. No re-render needed for non-accent code.
 *
 * Default is `blue` so existing users see no change on first load post-update.
 */

export const ACCENTS = [
  "blue",
  "green",
  "red",
  "purple",
  "yellow",
  "orange",
  "teal",
] as const;

export type Accent = (typeof ACCENTS)[number];

const STORAGE_KEY = "pp:accent";
const DEFAULT_ACCENT: Accent = "blue";

function isAccent(v: unknown): v is Accent {
  return typeof v === "string" && (ACCENTS as readonly string[]).includes(v);
}

function readStored(): Accent {
  const raw = localStorage.getItem(STORAGE_KEY);
  return isAccent(raw) ? raw : DEFAULT_ACCENT;
}

function applyAccent(accent: Accent) {
  // For the default (blue) we leave the attribute off so `:root` selectors
  // win without specificity tricks. Anything else gets the attribute.
  if (accent === DEFAULT_ACCENT) {
    document.documentElement.removeAttribute("data-accent");
  } else {
    document.documentElement.setAttribute("data-accent", accent);
  }
}

export function useAccent() {
  const [accent, setAccentState] = useState<Accent>(readStored);

  // Apply on first mount in case localStorage was set in a previous session.
  useEffect(() => {
    applyAccent(accent);
    // Intentionally empty dep array — `setAccent` keeps state and DOM in sync
    // for any subsequent change. This effect just handles the initial render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setAccent(next: Accent) {
    localStorage.setItem(STORAGE_KEY, next);
    applyAccent(next);
    setAccentState(next);
  }

  return { accent, setAccent };
}
