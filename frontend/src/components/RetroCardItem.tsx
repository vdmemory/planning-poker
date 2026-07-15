import { useEffect, useRef, useState } from "react";
import type { RetroCard, RetroParticipant } from "../types";
import { RetroCardCommentThread } from "./RetroCardCommentThread";
import { RetroCardAttachmentPicker } from "./RetroCardAttachmentPicker";
import { insertTextAtCursor } from "../lib/insertTextAtCursor";

// Issue #62 Phase 2 follow-up — this renders only STANDALONE (never-grouped)
// cards. A card that's part of a merge renders through `RetroCardStack`
// instead (single card, texts joined by "---", one shared vote/author) —
// see that component for the grouped case.
interface Props {
  card: RetroCard;
  author: RetroParticipant | undefined;
  participants: Record<string, RetroParticipant>;
  isMine: boolean;
  isFacilitator: boolean;
  anonymousMode: boolean;
  myParticipantId: string;
  votesLeft: number;
  onVote: () => void;
  onUnvote: () => void;
  onEdit: (text: string, imageUrl: string | null) => void;
  onDelete: () => void;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragMove: (clientX: number, clientY: number) => void;
  onDragEnd: () => void;
  // Issue #65 — text comments on the card.
  onAddComment: (text: string) => void;
  onDeleteComment: (commentId: string) => void;
}

export function RetroCardItem({
  card,
  author,
  participants,
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
  onAddComment,
  onDeleteComment,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.text);
  const [draftImageUrl, setDraftImageUrl] = useState<string | null>(card.image_url);
  const [showComments, setShowComments] = useState(false);
  const [showEditAttachmentPicker, setShowEditAttachmentPicker] = useState(false);
  const commentsRef = useRef<HTMLDivElement>(null);
  const editAttachmentPickerRef = useRef<HTMLDivElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const canManage = isMine || isFacilitator;
  const hasVoted = card.votes.includes(myParticipantId);
  const showAuthor = !anonymousMode || isMine;

  useEffect(() => {
    if (!showComments) return;
    function handler(e: MouseEvent) {
      if (commentsRef.current && !commentsRef.current.contains(e.target as Node)) setShowComments(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showComments]);

  useEffect(() => {
    if (!showEditAttachmentPicker) return;
    function handler(e: MouseEvent) {
      if (editAttachmentPickerRef.current && !editAttachmentPickerRef.current.contains(e.target as Node)) {
        setShowEditAttachmentPicker(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEditAttachmentPicker]);

  function startEdit() {
    setDraft(card.text);
    setDraftImageUrl(card.image_url);
    setEditing(true);
  }

  function saveEdit() {
    const trimmed = draft.trim();
    if (trimmed && (trimmed !== card.text || draftImageUrl !== card.image_url)) onEdit(trimmed, draftImageUrl);
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
      {editing ? (
        <div className="space-y-2">
          {draftImageUrl && (
            <div className="relative">
              <img
                data-testid="retro-card-edit-image-preview"
                src={draftImageUrl}
                alt=""
                className="h-24 rounded-lg object-cover w-full bg-[var(--c-panel2)]"
              />
              <button
                data-testid="retro-card-edit-image-remove"
                onClick={() => setDraftImageUrl(null)}
                title="Remove image"
                className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center text-xs leading-none"
              >
                ✕
              </button>
            </div>
          )}
          <textarea
            ref={editTextareaRef}
            autoFocus
            className="w-full bg-[var(--c-bg)] border border-[var(--c-border-hi)] rounded-lg px-2.5 py-2 text-sm text-white resize-none focus:outline-none focus:border-accent"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
              if (e.key === "Escape") { setDraft(card.text); setDraftImageUrl(card.image_url); setEditing(false); }
            }}
          />
          <div className="relative" ref={editAttachmentPickerRef}>
            <button
              data-testid="retro-card-edit-attachment-trigger"
              onClick={() => setShowEditAttachmentPicker((v) => !v)}
              title="Add emoji, GIF, or image"
              className="text-xs text-slate-400 hover:text-white p-1 rounded transition-colors"
            >
              😀 +
            </button>
            {showEditAttachmentPicker && (
              <div className="absolute top-full left-0 mt-2 z-30">
                <RetroCardAttachmentPicker
                  onPickEmoji={(emoji) => insertTextAtCursor(editTextareaRef, draft, emoji, setDraft)}
                  onPickImage={(url) => { setDraftImageUrl(url); setShowEditAttachmentPicker(false); }}
                />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setDraft(card.text); setDraftImageUrl(card.image_url); setEditing(false); }}
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
          {card.image_url && (
            <img
              data-testid="retro-card-image"
              src={card.image_url}
              alt=""
              className="max-h-32 rounded-lg object-cover w-full mb-2"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500 truncate">
              {showAuthor ? (author?.nickname ?? "Unknown") : "Anonymous"}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {canManage && (
                <>
                  <button
                    data-testid="retro-card-edit"
                    onClick={startEdit}
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
                  {card.comments.length > 0 && (
                    <span
                      data-testid="retro-card-comment-count"
                      className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 bg-accent text-accent-fg rounded-full text-[9px] font-semibold leading-none"
                    >
                      {card.comments.length}
                    </span>
                  )}
                </button>
                {showComments && (
                  <div className="absolute top-full right-0 mt-2 z-30">
                    <RetroCardCommentThread
                      comments={card.comments}
                      participants={participants}
                      anonymousMode={anonymousMode}
                      myParticipantId={myParticipantId}
                      isFacilitator={isFacilitator}
                      onAddComment={onAddComment}
                      onDeleteComment={onDeleteComment}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
