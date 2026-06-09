import { ACCENTS, type Accent } from "../hooks/useAccent";

/**
 * Issue #42 — 7-swatch row for picking the accent palette.
 *
 * Visual: a horizontal row of round swatches, each painted with the
 * palette's "primary" hex (the same hex used as `--c-accent` on the dark
 * variant). The currently-selected swatch has a 2-px white ring; others
 * have a subtle border that fades on hover.
 *
 * Used inside `ProfileMenu` under the Light/Dark/System row.
 *
 * The swatches use a *constant* hex per accent — not the theme-aware
 * `--c-accent`, because we want to preview all 7 options side by side
 * regardless of the current selection.
 */

interface Props {
  value: Accent;
  onChange: (next: Accent) => void;
}

// Constant hex values matching the DARK-mode `--c-accent` from index.css.
// Kept in sync manually; the test in `theme-accent.spec.ts` guards the
// "current selection ring" behaviour, not the swatch colour itself.
const SWATCH_HEX: Record<Accent, string> = {
  blue: "#3b82f6",
  green: "#22c55e",
  red: "#ef4444",
  purple: "#8b5cf6",
  yellow: "#eab308",
  orange: "#f97316",
  teal: "#14b8a6",
};

const LABELS: Record<Accent, string> = {
  blue: "Blue",
  green: "Green",
  red: "Red",
  purple: "Purple",
  yellow: "Yellow",
  orange: "Orange",
  teal: "Teal",
};

export function AccentPicker({ value, onChange }: Props) {
  return (
    <div data-testid="accent-picker" className="flex flex-wrap gap-1.5">
      {ACCENTS.map((accent) => {
        const selected = accent === value;
        return (
          <button
            key={accent}
            type="button"
            data-testid="accent-swatch"
            data-accent={accent}
            data-selected={selected ? "true" : "false"}
            aria-label={`Use ${LABELS[accent]} accent`}
            aria-pressed={selected}
            title={LABELS[accent]}
            onClick={() => onChange(accent)}
            className={`w-7 h-7 rounded-full transition-all shadow-sm ${
              selected
                ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--c-panel)] scale-110"
                : "ring-1 ring-[var(--c-border)] hover:scale-105 hover:ring-white/60"
            }`}
            style={{ backgroundColor: SWATCH_HEX[accent] }}
          />
        );
      })}
    </div>
  );
}
