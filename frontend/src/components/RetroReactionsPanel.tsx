import { useState, useRef, useEffect } from "react";
import { REACTION_EMOJIS, REACTION_THROTTLE_MS } from "./ReactionsPanel";
import { preloadAllReactionLottie } from "./reaction-lottie-cache";

/**
 * Issue #68 — Retro Board's header reactions panel. Clone of Planning
 * Poker's `ReactionsPanel` (issue #32), not an extension of it — same
 * convention as `RetroProfileMenu`/`RetroSettingsModal` — but emoji-only:
 * no mode toggle, no time-value chips (those are specific to Planning
 * Poker's capacity gut-check and don't apply to a retro board).
 *
 * Reuses the shared `REACTION_EMOJIS` list and Lottie assets from
 * `ReactionsPanel.tsx` — those are just data/asset constants tied to files
 * in `public/reactions-lottie/`, not Planning-Poker-specific UI.
 */

interface Props {
  onReact: (value: string) => void;
}

export function RetroReactionsPanel({ onReact }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const lastReactAtRef = useRef(0);

  // Same warm-up as ReactionsPanel (issue #43) — both panels share the
  // same Lottie assets, so whichever mounts first pays the preload cost.
  useEffect(() => {
    void import("lottie-react");
    void preloadAllReactionLottie();
  }, []);

  const fire = (value: string) => {
    const now = Date.now();
    if (now - lastReactAtRef.current < REACTION_THROTTLE_MS) return;
    lastReactAtRef.current = now;
    onReact(value);
    if (mobileOpen) setMobileOpen(false);
  };

  const ariaLabel = (v: string) => `React with ${v}`;

  return (
    <>
      {/* Desktop: inline row in the header. */}
      <div
        className="hidden md:flex items-center gap-0.5 bg-[var(--c-panel2)] rounded-full px-2 py-1 border border-[var(--c-border)] z-50 relative"
        data-testid="retro-reactions-panel"
      >
        {REACTION_EMOJIS.map((v) => (
          <button
            key={v}
            type="button"
            data-testid="retro-reaction-button"
            data-reaction-value={v}
            aria-label={ariaLabel(v)}
            title={ariaLabel(v)}
            onClick={() => fire(v)}
            className="w-8 h-8 text-lg flex items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-95"
          >
            {v}
          </button>
        ))}
      </div>

      {/* Mobile: single trigger button + centered modal. */}
      <div className="md:hidden relative z-50" data-testid="retro-reactions-panel-mobile">
        <button
          data-testid="retro-reactions-mobile-trigger"
          onClick={() => setMobileOpen((v) => !v)}
          title="Reactions"
          className="p-2 rounded-lg border border-[var(--c-border)] text-slate-400 hover:bg-[var(--c-panel2)]"
        >
          <span className="text-base leading-none">😀</span>
        </button>
        {mobileOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setMobileOpen(false)}
          >
            <div
              data-testid="retro-reactions-mobile-modal"
              className="w-full max-w-sm bg-[var(--c-panel)] border border-[var(--c-border)] rounded-2xl p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white">Reactions</h2>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="text-slate-400 hover:text-white text-xl leading-none"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {REACTION_EMOJIS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    data-testid="retro-reaction-button"
                    data-reaction-value={v}
                    aria-label={ariaLabel(v)}
                    title={ariaLabel(v)}
                    onClick={() => fire(v)}
                    className="w-12 h-12 text-2xl flex items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-95"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
