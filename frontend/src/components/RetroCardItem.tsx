import { useEffect, useRef, useState } from "react";
import type { RetroCard, RetroParticipant } from "../types";
import { RetroCardReactionBar } from "./RetroCardReactionBar";
import type { CardReactionOverlay } from "../hooks/useRetroCardReactions";

// Issue #62 Phase 2 follow-up — this renders only STANDALONE (never-grouped)
// cards. A card that's part of a merge renders through `RetroCardStack`
// instead (single card, texts joined by "---", one shared vote/author) —
// see that component for the grouped case.
interface Props {
  card: RetroCard;
  author: RetroParticipant | undefined;
  isMine: boolean;
  isFacilitator: boolean;
  anonymousMode: boolean;
  myParticipantId: string;
  votesLeft: number;
  onVote: () => void;
  onUnvote: () => void;
  onEdit: (text: string) => void;
  onDelete: () => void;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragMove: (clientX: number, clientY: number) => void;
  onDragEnd: () => void;
  // Issue #62 Phase 2 — quick emoji reactions on a card.
  reactionOverlay: CardReactionOverlay | null;
  onReact: (emoji: string) => void;
}

export function RetroCardItem({
  card,
  author,
  isMine,
  isFacilitator,
  anonymousMode,
  myParticipantId,
  votesLeft,
  onVote,
  onUnvote,
  onEdit,
  onDelete,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragMove,
  onDragEnd,
  reactionOverlay,
  onReact,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.text);
  const [showReactions, setShowReactions] = useState(false);
  const reactionsRef = useRef<HTMLDivElement>(null);
  const canManage = isMine || isFacilitator;
  const hasVoted = card.votes.includes(myParticipantId);
  const showAuthor = !anonymousMode || isMine;

  useEffect(() => {
    if (!showReactions) return;
    function handler(e: MouseEvent) {
      if (reactionsRef.current && !reactionsRef.current.contains(e.target as Node)) setShowReactions(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showReactions]);

  function saveEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== card.text) onEdit(trimmed);
    setEditing(false);
  }

  return (
    <div
      data-testid="retro-card"
      data-card-id={card.id}
      data-group-id=""
      className={`relative bg-[var(--c-panel)] border rounded-xl p-3 shadow-sm transition-all ${
        isDropTarget ? "border-accent ring-2 ring-accent" : "border-[var(--c-border)]"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      {/* Reaction overlay pop — mirrors PlayerCard's issue #32 treatment. */}
      {reactionOverlay && (
        <div
          data-testid="retro-card-reaction-overlay"
          data-reaction-value={reactionOverlay.value}
          className="absolute top-0 right-2 -translate-y-1/2 pointer-events-none z-10"
        >
          <div className="reactions-overlay-pop inline-flex items-center justify-center w-9 h-9 text-2xl leading-none">
            {reactionOverlay.value}
          </div>
        </div>
      )}

      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            className="w-full bg-[var(--c-bg)] border border-[var(--c-border-hi)] rounded-lg px-2.5 py-2 text-sm text-white resize-none focus:outline-none focus:border-accent"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
              if (e.key === "Escape") { setDraft(card.text); setEditing(false); }
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setDraft(card.text); setEditing(false); }}
              className="flex-1 text-xs border border-[var(--c-border)] text-slate-300 py-1.5 rounded-lg hover:bg-[var(--c-panel2)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveEdit}
              className="flex-1 text-xs bg-accent hover:bg-accent-hover text-accent-fg py-1.5 rounded-lg font-medium transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-1.5 mb-2">
            {/* Drag handle — pointer capture keeps move/up routed here
                regardless of where the pointer travels, so no document
                listeners are needed. touch-none stops the browser turning
                a vertical drag into a page scroll. */}
            <span
              data-testid="retro-card-grip"
              role="button"
              aria-label="Drag to group with another card"
              title="Drag onto another card to group them"
              className="cursor-grab active:cursor-grabbing touch-none select-none text-slate-600 hover:text-slate-400 shrink-0 mt-0.5 leading-none"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                onDragStart();
              }}
              onPointerMove={(e) => { if (isDragging) onDragMove(e.clientX, e.clientY); }}
              onPointerUp={(e) => {
                if (isDragging) onDragEnd();
                e.currentTarget.releasePointerCapture(e.pointerId);
              }}
            >
              ⠿
            </span>
            <p className="text-sm text-white whitespace-pre-wrap break-words flex-1">{card.text}</p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500 truncate">
              {showAuthor ? (author?.nickname ?? "Unknown") : "Anonymous"}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {canManage && (
                <>
                  <button
                    data-testid="retro-card-edit"
                    onClick={() => setEditing(true)}
                    title="Edit"
                    className="text-slate-500 hover:text-white p-1 rounded transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M8.5 1.5a1.5 1.5 0 0 1 2 2L3.5 10.5 1 11l.5-2.5L8.5 1.5z"/>
                    </svg>
                  </button>
                  <button
                    data-testid="retro-card-delete"
                    onClick={onDelete}
                    title="Delete"
                    className="text-slate-500 hover:text-red-400 p-1 rounded transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M2 4h12M6 4V2.5A1 1 0 0 1 7 1.5h2A1 1 0 0 1 10 2.5V4M3.5 4l.6 8.4a1 1 0 0 0 1 .9h5.8a1 1 0 0 0 1-.9L12.5 4"
                        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </>
              )}
              {/* Reaction trigger — click-to-open popover anchored to this
                  button, not a hover-reveal overlay: retro cards stack with
                  only an 8px gap (unlike Planning Poker's player cards on a
                  spaced-out oval table), so a floating bar has nowhere to
                  sit without covering the card's own text. A click-triggered
                  popover also sidesteps touch devices having no hover state
                  at all — it works identically with mouse or finger. */}
              <div className="relative" ref={reactionsRef}>
                <button
                  data-testid="retro-card-reaction-trigger"
                  onClick={() => setShowReactions((v) => !v)}
                  title="React"
                  className="text-slate-500 hover:text-white p-1 rounded transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M5.5 9.5s.9 1.5 2.5 1.5 2.5-1.5 2.5-1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    <circle cx="5.8" cy="6.3" r="0.9" fill="currentColor"/>
                    <circle cx="10.2" cy="6.3" r="0.9" fill="currentColor"/>
                  </svg>
                </button>
                {showReactions && (
                  // Opens downward, not upward: the trigger sits in the
                  // card's last row, so `bottom-full` would land the popover
                  // right on top of the card's own text above it. `top-full`
                  // spills into the gap below instead — the same convention
                  // ThrowReactionBar's "+" picker uses in Planning Poker.
                  <div className="absolute top-full right-0 mt-2 z-30">
                    <RetroCardReactionBar onReact={(emoji) => { onReact(emoji); setShowReactions(false); }} />
                  </div>
                )}
              </div>
              <button
                data-testid="retro-card-vote"
                data-voted={hasVoted}
                onClick={hasVoted ? onUnvote : onVote}
                disabled={!hasVoted && votesLeft <= 0}
                title={hasVoted ? "Remove your vote" : "Vote"}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold transition-colors ${
                  hasVoted
                    ? "bg-accent text-accent-fg"
                    : "bg-[var(--c-panel2)] text-slate-300 hover:bg-accent-soft disabled:opacity-40 disabled:hover:bg-[var(--c-panel2)]"
                }`}
              >
                👍 {card.votes.length}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
