import { useState } from "react";
import type { RetroComment, RetroParticipant } from "../types";

/**
 * Issue #65 — text comment thread for a retro card, opened from a
 * click-triggered popover (same `top-full` pattern the old card-reaction
 * popover used) anchored to `retro-card-comment-trigger`. Shared between
 * `RetroCardItem` (standalone card) and `RetroCardStack` (merged card) since
 * both just need a list + an add-form for whatever `comments` array they own.
 */

interface Props {
  comments: RetroComment[];
  participants: Record<string, RetroParticipant>;
  anonymousMode: boolean;
  myParticipantId: string;
  isFacilitator: boolean;
  onAddComment: (text: string) => void;
  onDeleteComment: (commentId: string) => void;
}

export function RetroCardCommentThread({
  comments,
  participants,
  anonymousMode,
  myParticipantId,
  isFacilitator,
  onAddComment,
  onDeleteComment,
}: Props) {
  const [draft, setDraft] = useState("");

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAddComment(trimmed);
    setDraft("");
  }

  return (
    <div
      data-testid="retro-card-comment-thread"
      className="w-72 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl p-2.5 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {comments.length > 0 && (
        <div className="max-h-48 overflow-y-auto space-y-2 mb-2">
          {comments.map((comment) => {
            const isMine = comment.author_id === myParticipantId;
            const showAuthor = !anonymousMode || isMine;
            const canDelete = isMine || isFacilitator;
            return (
              <div
                key={comment.id}
                data-testid="retro-card-comment"
                data-comment-id={comment.id}
                className="text-xs bg-[var(--c-panel2)] rounded-lg px-2 py-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-400 font-medium">
                    {showAuthor ? (participants[comment.author_id]?.nickname ?? "Unknown") : "Anonymous"}
                  </span>
                  {canDelete && (
                    <button
                      data-testid="retro-card-comment-delete"
                      onClick={() => onDeleteComment(comment.id)}
                      title="Delete comment"
                      className="text-slate-500 hover:text-red-400 shrink-0 leading-none"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <p className="text-white whitespace-pre-wrap break-words">{comment.text}</p>
              </div>
            );
          })}
        </div>
      )}
      <textarea
        data-testid="retro-card-comment-input"
        className="w-full bg-[var(--c-bg)] border border-[var(--c-border-hi)] rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-500 resize-none focus:outline-none focus:border-accent"
        rows={2}
        placeholder="Add a comment…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
        }}
      />
    </div>
  );
}
