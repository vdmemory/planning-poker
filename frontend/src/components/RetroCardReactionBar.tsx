/**
 * Issue #62 Phase 2 — quick emoji reactions on a retro card. Simplified
 * sibling of Planning Poker's `ThrowReactionBar` (issue #51): no facilitator
 * action mixed in here, and no "+" picker for more emoji — a card reaction
 * is a lightweight team-sentiment ping, not a full palette.
 */

const CARD_REACTION_EMOJIS = ["👍", "😂", "💡", "❤️", "😮", "🎉"];

interface Props {
  onReact: (emoji: string) => void;
}

export function RetroCardReactionBar({ onReact }: Props) {
  return (
    <div
      data-testid="retro-card-reaction-bar"
      className="flex items-center gap-0.5 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-full px-1.5 py-1 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      {CARD_REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          data-testid="retro-card-reaction-button"
          data-reaction-value={emoji}
          onClick={() => onReact(emoji)}
          title={`React with ${emoji}`}
          className="w-6 h-6 flex items-center justify-center text-sm rounded-full hover:bg-[var(--c-panel2)] hover:scale-125 transition-transform"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
