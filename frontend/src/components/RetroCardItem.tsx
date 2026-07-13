import { useState } from "react";
import type { RetroCard, RetroParticipant } from "../types";

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
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.text);
  const canManage = isMine || isFacilitator;
  const hasVoted = card.votes.includes(myParticipantId);
  const showAuthor = !anonymousMode || isMine;

  function saveEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== card.text) onEdit(trimmed);
    setEditing(false);
  }

  return (
    <div
      data-testid="retro-card"
      data-card-id={card.id}
      className="bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl p-3 shadow-sm"
    >
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
          <p className="text-sm text-white whitespace-pre-wrap break-words mb-2">{card.text}</p>
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
