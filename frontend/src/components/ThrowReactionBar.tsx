import { useEffect, useRef, useState } from "react";

/**
 * Issue #51 — hover (or tap, on touch) panel shown above another player's
 * card: default quick-throw emoji, a "+" for more, and — facilitator only —
 * a trash icon that replaces the old always-on-hover kick "X" from issue
 * #23. Visibility (hover-reveal on real pointers, always-on for touch) is
 * driven by the parent (`PlayerCard`), same convention as the old kick
 * button; this component only owns the "+" picker's own open/close state.
 */

export const DEFAULT_THROW_EMOJIS = ["🎯", "✈️", "🧻", "❤️"];

// A distinct "throwable stuff" palette from the header ReactionsPanel's
// feelings-oriented set (issue #32) — these lean into the goofy
// projectile theme instead of duplicating it.
export const EXTRA_THROW_EMOJIS = ["🍅", "🥚", "💩", "🔥", "😂", "👏", "😱", "🙌", "👋", "💯"];

interface Props {
  canThrow: boolean;
  canKick: boolean;
  onThrow: (emoji: string) => void;
  onKick: () => void;
}

export function ThrowReactionBar({ canThrow, canKick, onThrow, onKick }: Props) {
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMore) return;
    function handler(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setShowMore(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMore]);

  if (!canThrow && !canKick) return null;

  return (
    <div
      data-testid="throw-reaction-bar"
      className="flex items-center gap-0.5 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-full px-1.5 py-1 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      {canThrow && DEFAULT_THROW_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          data-testid="throw-reaction-button"
          data-reaction-value={emoji}
          onClick={() => onThrow(emoji)}
          title={`Throw ${emoji}`}
          className="w-6 h-6 flex items-center justify-center text-sm rounded-full hover:bg-[var(--c-panel2)] hover:scale-125 transition-transform"
        >
          {emoji}
        </button>
      ))}

      {canThrow && (
        <div className="relative">
          <button
            data-testid="throw-reaction-more"
            onClick={() => setShowMore((v) => !v)}
            title="More reactions"
            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white hover:bg-[var(--c-panel2)] rounded-full transition-colors text-base leading-none"
          >
            +
          </button>
          {showMore && (
            <div
              ref={moreRef}
              data-testid="throw-reaction-picker"
              className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl p-2 shadow-2xl grid grid-cols-5 gap-1 w-44 z-30"
            >
              {EXTRA_THROW_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  data-testid="throw-reaction-button"
                  data-reaction-value={emoji}
                  onClick={() => { onThrow(emoji); setShowMore(false); }}
                  className="w-7 h-7 flex items-center justify-center text-base rounded-lg hover:bg-[var(--c-panel2)] hover:scale-110 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {canKick && (
        <button
          data-testid="kick-player-button"
          onClick={onKick}
          title="Remove from room"
          className={`w-6 h-6 flex items-center justify-center rounded-full text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors ${
            canThrow ? "ml-1 border-l border-[var(--c-border)] pl-1.5" : ""
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 4h12M6 4V2.5A1 1 0 0 1 7 1.5h2A1 1 0 0 1 10 2.5V4M3.5 4l.6 8.4a1 1 0 0 0 1 .9h5.8a1 1 0 0 0 1-.9L12.5 4"
              stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
