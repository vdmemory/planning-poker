import { useState, useRef } from "react";

/**
 * Issue #32 — Google Meet-style quick reactions panel.
 *
 * Two reaction modes the user can toggle between:
 *   - emoji:  pure feeling reactions
 *   - number: time-based labels for capacity gut-check (1h..3d), per the
 *             user's choice of variant A in the issue discussion
 *
 * The panel lives in the room header on desktop (visible inline). On mobile
 * it collapses into a single button that opens a bottom-sheet drawer.
 *
 * Throttling: at most one reaction every 600 ms per client. Anything faster
 * is silently dropped — kept tight so the float-up animation stays lively
 * without spamming peers.
 *
 * Emoji list is pinned to the animated MP4 assets in `public/reactions/` —
 * see `REACTION_EMOJI_VIDEO` below. Adding a new emoji means dropping an
 * MP4 in there AND adding a row to that map.
 */

// Codepoint hex (matches the MP4 filenames in public/reactions/) → emoji.
// Kept in this order so the panel reads positive → neutral → negative.
export const REACTION_EMOJIS = ["💖", "👍", "👏", "😂", "😮", "🤔", "😢", "👎"];

// Each emoji has a matching MP4 in `public/reactions/`. The mapping is
// codepoint-based so a designer can swap assets without touching JSX.
export const REACTION_EMOJI_VIDEO: Record<string, string> = {
  "💖": "/reactions/1f496.mp4",
  "👍": "/reactions/1f44d.mp4",
  "👏": "/reactions/1f44f.mp4",
  "😂": "/reactions/1f602.mp4",
  "😮": "/reactions/1f62e.mp4",
  "🤔": "/reactions/1f914.mp4",
  "😢": "/reactions/1f622.mp4",
  "👎": "/reactions/1f44e.mp4",
};

// Time-value chips for the "capacity gut-check" mode. The list is the user's
// chosen ladder — not strictly monotonic (1d sits before 12h on purpose, so
// the most common "a day" chip is one tap away).
export const REACTION_NUMBERS = ["1h", "2h", "3h", "5h", "1d", "12h", "2d", "3d"];

export type ReactionKind = "emoji" | "number";

const THROTTLE_MS = 600;

interface Props {
  onReact: (kind: ReactionKind, value: string) => void;
}

export function ReactionsPanel({ onReact }: Props) {
  const [mode, setMode] = useState<ReactionKind>("emoji");
  const [mobileOpen, setMobileOpen] = useState(false);
  const lastReactAtRef = useRef(0);

  const fire = (value: string) => {
    const now = Date.now();
    if (now - lastReactAtRef.current < THROTTLE_MS) return;
    lastReactAtRef.current = now;
    onReact(mode, value);
    if (mobileOpen) setMobileOpen(false);
  };

  const items = mode === "emoji" ? REACTION_EMOJIS : REACTION_NUMBERS;
  const ariaLabel = (v: string) => `React with ${v}`;

  return (
    <>
      {/* Desktop: inline row in the header. Always visible at md+ widths. */}
      <div className="hidden md:flex items-center gap-1 z-50 relative" data-testid="reactions-panel">
        <ModeToggle mode={mode} setMode={setMode} />
        <div className="flex items-center gap-0.5 bg-[var(--c-panel2)] rounded-full px-2 py-1 border border-[var(--c-border)]">
          {items.map((v) => (
            <ReactionButton key={v} mode={mode} value={v} label={ariaLabel(v)} onClick={() => fire(v)} />
          ))}
        </div>
      </div>

      {/* Mobile: single trigger button + slide-up bottom-sheet. */}
      <div className="md:hidden relative z-50" data-testid="reactions-panel-mobile">
        <button
          data-testid="reactions-mobile-trigger"
          onClick={() => setMobileOpen((v) => !v)}
          title="Reactions"
          className="p-2 rounded-lg border border-[var(--c-border)] text-slate-400 hover:bg-[var(--c-panel2)]"
        >
          <span className="text-base leading-none">😀</span>
        </button>
        {mobileOpen && (
          <>
            {/* Backdrop — close on outside tap */}
            <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)} />
            <div
              data-testid="reactions-mobile-sheet"
              className="fixed left-0 right-0 bottom-0 z-50 bg-[var(--c-panel)] border-t border-[var(--c-border)] rounded-t-2xl p-4 shadow-2xl"
            >
              <div className="mx-auto max-w-md flex flex-col gap-3">
                <ModeToggle mode={mode} setMode={setMode} centered />
                <div className="flex flex-wrap gap-2 justify-center">
                  {items.map((v) => (
                    <ReactionButton key={v} mode={mode} value={v} label={ariaLabel(v)} onClick={() => fire(v)} big />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function ModeToggle({ mode, setMode, centered = false }: {
  mode: ReactionKind; setMode: (m: ReactionKind) => void; centered?: boolean;
}) {
  return (
    <div className={`flex bg-[var(--c-panel2)] rounded-full p-0.5 border border-[var(--c-border)] ${centered ? "self-center" : ""}`} role="tablist" aria-label="Reaction type">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "emoji"}
        data-testid="reactions-mode-emoji"
        onClick={() => setMode("emoji")}
        className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
          mode === "emoji" ? "bg-blue-500 text-white" : "text-slate-300 hover:text-white"
        }`}
      >
        😀
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "number"}
        data-testid="reactions-mode-number"
        onClick={() => setMode("number")}
        className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
          mode === "number" ? "bg-blue-500 text-white" : "text-slate-300 hover:text-white"
        }`}
      >
        ⏱
      </button>
    </div>
  );
}

function ReactionButton({
  mode, value, label, onClick, big = false,
}: { mode: ReactionKind; value: string; label: string; onClick: () => void; big?: boolean }) {
  const size = big ? "w-12 h-12 text-2xl" : "w-8 h-8 text-lg";
  const isEmoji = mode === "emoji";
  return (
    <button
      type="button"
      data-testid="reaction-button"
      data-reaction-value={value}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`${size} flex items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-95 ${
        isEmoji ? "" : "text-slate-100 text-sm font-semibold bg-[var(--c-panel)]"
      }`}
    >
      {value}
    </button>
  );
}

// Used by the room when wiring up auto-cleanup of stale floaters / overlays.
// Mirrors the constants used in the floater + overlay components so callers
// can configure expirations without hard-coding magic numbers.
export const REACTION_OVERLAY_MS = 3000;
export const REACTION_FLOATER_MS = 3500;

// Re-export for tests that want to wait `THROTTLE_MS + small buffer`.
export const REACTION_THROTTLE_MS = THROTTLE_MS;
