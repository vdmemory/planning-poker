import { useEffect, useRef, useState } from "react";
import type { RetroCard, RetroParticipant } from "../types";
import { RetroCardCommentThread } from "./RetroCardCommentThread";

/**
 * Issue #62 Phase 2 follow-up — merged cards render as ONE card with each
 * original text separated by a "---" divider, one shared vote count, and
 * one author label — not a stack of visually separate boxes. Matches the
 * reference product's behaviour the user pointed at. Per-card identity
 * still exists underneath (`RetroCard.group_id`), it's just not surfaced.
 *
 * Votes: the "one shared vote" is the UNION of voters across every card in
 * the merge, not a sum — a participant who voted on any of the merged
 * cards before the merge shows as already-voted. Voting writes to the
 * head; unvoting removes the vote from every underlying card the
 * participant actually voted on (almost always just one), so a stale vote
 * on a since-buried child card can't get stuck un-removable.
 */
interface Props {
  head: RetroCard;
  childCards: RetroCard[];
  author: RetroParticipant | undefined;
  participants: Record<string, RetroParticipant>;
  isFacilitator: boolean;
  anonymousMode: boolean;
  myParticipantId: string;
  votesLeft: number;
  onVote: (cardId: string) => void;
  onUnvote: (cardId: string) => void;
  onUnmergeAll: () => void;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragMove: (clientX: number, clientY: number) => void;
  onDragEnd: () => void;
  // Issue #65 — comments are summed across every card in the stack; new
  // ones are written to the head, same convention as voting.
  onAddComment: (cardId: string, text: string) => void;
  onDeleteComment: (cardId: string, commentId: string) => void;
}

export function RetroCardStack({
  head,
  childCards,
  author,
  participants,
  isFacilitator,
  anonymousMode,
  myParticipantId,
  votesLeft,
  onVote,
  onUnvote,
  onUnmergeAll,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragMove,
  onDragEnd,
  onAddComment,
  onDeleteComment,
}: Props) {
  const [showComments, setShowComments] = useState(false);
  const commentsRef = useRef<HTMLDivElement>(null);
  const all = [head, ...childCards];
  const showAuthor = !anonymousMode;
  const voters = new Set<string>();
  for (const card of all) for (const v of card.votes) voters.add(v);
  const hasVoted = voters.has(myParticipantId);
  const allComments = all.flatMap((c) => c.comments).sort((a, b) => a.created_at.localeCompare(b.created_at));

  useEffect(() => {
    if (!showComments) return;
    function handler(e: MouseEvent) {
      if (commentsRef.current && !commentsRef.current.contains(e.target as Node)) setShowComments(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showComments]);

  function handleAddComment(text: string) {
    onAddComment(head.id, text);
  }

  function handleDeleteComment(commentId: string) {
    const owner = all.find((c) => c.comments.some((cm) => cm.id === commentId));
    if (owner) onDeleteComment(owner.id, commentId);
  }

  function handleVoteClick() {
    if (hasVoted) {
      for (const card of all) if (card.votes.includes(myParticipantId)) onUnvote(card.id);
    } else {
      onVote(head.id);
    }
  }

  return (
    <div
      data-testid="retro-card"
      data-card-id={head.id}
      data-group-id=""
      data-stack-size={all.length}
      className={`relative bg-[var(--c-panel)] border rounded-xl p-3 shadow-sm transition-all ${
        isDropTarget ? "border-accent ring-2 ring-accent" : "border-[var(--c-border)]"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-1.5 mb-2">
        <span
          data-testid="retro-card-grip"
          role="button"
          aria-label="Drag to group with another card"
          title="Drag onto another card to add it to this merge"
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

        <div className="flex-1 min-w-0">
          {all.map((card, i) => (
            <div key={card.id} data-testid="retro-card-merged-block" data-card-id={card.id}>
              <p className="text-sm text-white whitespace-pre-wrap break-words">{card.text}</p>
              {i < all.length - 1 && (
                <div data-testid="retro-card-merge-divider" className="my-2 border-t border-[var(--c-border)]" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500 truncate flex items-center gap-1.5">
          {showAuthor ? (author?.nickname ?? "Unknown") : "Anonymous"}
          <span
            data-testid="retro-card-group-badge"
            title={`${all.length} cards merged together`}
            className="inline-flex items-center gap-0.5 bg-[var(--c-panel2)] text-slate-400 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          >
            🗂 {all.length}
          </span>
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            data-testid="retro-card-unmerge"
            onClick={onUnmergeAll}
            title="Undo merge — split back into separate cards"
            className="text-slate-500 hover:text-white p-1 rounded transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M13 2v3.5H9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <button
            data-testid="retro-card-vote"
            data-voted={hasVoted}
            onClick={handleVoteClick}
            disabled={!hasVoted && votesLeft <= 0}
            title={hasVoted ? "Remove your vote" : "Vote"}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold transition-colors ${
              hasVoted
                ? "bg-accent text-accent-fg"
                : "bg-[var(--c-panel2)] text-slate-300 hover:bg-accent-soft disabled:opacity-40 disabled:hover:bg-[var(--c-panel2)]"
            }`}
          >
            👍 {voters.size}
          </button>
          <div className="relative" ref={commentsRef}>
            <button
              data-testid="retro-card-comment-trigger"
              onClick={() => setShowComments((v) => !v)}
              title="Comments"
              className="relative text-slate-500 hover:text-white p-1 rounded transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6A1.5 1.5 0 0 1 12.5 11H6l-2.5 2.5V11H3.5A1.5 1.5 0 0 1 2 9.5v-6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              </svg>
              {allComments.length > 0 && (
                <span
                  data-testid="retro-card-comment-count"
                  className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 bg-accent text-accent-fg rounded-full text-[9px] font-semibold leading-none"
                >
                  {allComments.length}
                </span>
              )}
            </button>
            {showComments && (
              <div className="absolute top-full right-0 mt-2 z-30">
                <RetroCardCommentThread
                  comments={allComments}
                  participants={participants}
                  anonymousMode={anonymousMode}
                  myParticipantId={myParticipantId}
                  isFacilitator={isFacilitator}
                  onAddComment={handleAddComment}
                  onDeleteComment={handleDeleteComment}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
