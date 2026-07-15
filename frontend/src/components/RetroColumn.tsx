import { useEffect, useRef, useState } from "react";
import type { RetroCard, RetroColumnDef, RetroParticipant } from "../types";
import { RetroCardItem } from "./RetroCardItem";
import { RetroCardStack } from "./RetroCardStack";
import { RetroCardAttachmentPicker } from "./RetroCardAttachmentPicker";
import { insertTextAtCursor } from "../lib/insertTextAtCursor";

interface Props {
  column: RetroColumnDef;
  cards: RetroCard[];
  participants: Record<string, RetroParticipant>;
  isFacilitator: boolean;
  anonymousMode: boolean;
  myParticipantId: string;
  votesLeft: number;
  onAddCard: (text: string, imageUrl: string | null) => void;
  onVote: (cardId: string) => void;
  onUnvote: (cardId: string) => void;
  onEditCard: (cardId: string, text: string, imageUrl: string | null) => void;
  onDeleteCard: (cardId: string) => void;
  // Issue #62 Phase 2 — grouping, lifted to the board so drag state is
  // shared across columns.
  onUngroupCard: (cardId: string) => void;
  draggingId: string | null;
  overId: string | null;
  onDragStart: (cardId: string, columnId: string) => void;
  onDragMove: (clientX: number, clientY: number) => void;
  onDragEnd: () => void;
  // Issue #65 — text comments on a card.
  onAddComment: (cardId: string, text: string) => void;
  onDeleteComment: (cardId: string, commentId: string) => void;
}

export function RetroColumn({
  column,
  cards,
  participants,
  isFacilitator,
  anonymousMode,
  myParticipantId,
  votesLeft,
  onAddCard,
  onVote,
  onUnvote,
  onEditCard,
  onDeleteCard,
  onUngroupCard,
  draggingId,
  overId,
  onDragStart,
  onDragMove,
  onDragEnd,
  onAddComment,
  onDeleteComment,
}: Props) {
  const [draft, setDraft] = useState("");
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [showAttachmentPicker, setShowAttachmentPicker] = useState(false);
  const addCardTextareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAttachmentPicker) return;
    function handler(e: MouseEvent) {
      if (attachmentPickerRef.current && !attachmentPickerRef.current.contains(e.target as Node)) {
        setShowAttachmentPicker(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAttachmentPicker]);

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAddCard(trimmed, pendingImageUrl);
    setDraft("");
    setPendingImageUrl(null);
  }

  // Issue #62 Phase 2 — a "stack" is a head card (group_id === null) plus any
  // cards pointing at it. Rendered head-first, children directly beneath.
  const heads = cards.filter((c) => !c.group_id);
  const childrenOf = (headId: string) => cards.filter((c) => c.group_id === headId);

  return (
    <div data-testid="retro-column" data-column-id={column.id} className="flex flex-col min-w-[260px] w-[260px] shrink-0">
      <div className="flex items-center gap-2 px-3 py-2 rounded-t-xl" style={{ backgroundColor: `${column.color}22` }}>
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: column.color }} />
        <h3 className="font-semibold text-white text-sm">{column.title}</h3>
        <span className="text-xs text-slate-400 ml-auto">{cards.length}</span>
      </div>

      <div className="flex-1 bg-[var(--c-panel2)] rounded-b-xl p-2 space-y-2 min-h-[120px]">
        {heads.map((head) => {
          const children = childrenOf(head.id);
          if (children.length > 0) {
            return (
              <RetroCardStack
                key={head.id}
                head={head}
                childCards={children}
                author={participants[head.author_id]}
                participants={participants}
                isFacilitator={isFacilitator}
                anonymousMode={anonymousMode}
                myParticipantId={myParticipantId}
                votesLeft={votesLeft}
                onVote={onVote}
                onUnvote={onUnvote}
                onUnmergeAll={() => onUngroupCard(head.id)}
                isDragging={draggingId === head.id}
                isDropTarget={overId === head.id}
                onDragStart={() => onDragStart(head.id, column.id)}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
                onAddComment={onAddComment}
                onDeleteComment={onDeleteComment}
              />
            );
          }
          return (
            <RetroCardItem
              key={head.id}
              card={head}
              author={participants[head.author_id]}
              participants={participants}
              isMine={head.author_id === myParticipantId}
              isFacilitator={isFacilitator}
              anonymousMode={anonymousMode}
              myParticipantId={myParticipantId}
              votesLeft={votesLeft}
              onVote={() => onVote(head.id)}
              onUnvote={() => onUnvote(head.id)}
              onEdit={(text, imageUrl) => onEditCard(head.id, text, imageUrl)}
              onDelete={() => onDeleteCard(head.id)}
              isDragging={draggingId === head.id}
              isDropTarget={overId === head.id}
              onDragStart={() => onDragStart(head.id, column.id)}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              onAddComment={(text) => onAddComment(head.id, text)}
              onDeleteComment={(commentId) => onDeleteComment(head.id, commentId)}
            />
          );
        })}

        {pendingImageUrl && (
          <div className="relative">
            <img
              data-testid="retro-add-card-image-preview"
              src={pendingImageUrl}
              alt=""
              className="h-24 rounded-lg object-cover w-full bg-[var(--c-panel2)]"
            />
            <button
              data-testid="retro-add-card-image-remove"
              onClick={() => setPendingImageUrl(null)}
              title="Remove image"
              className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center text-xs leading-none"
            >
              ✕
            </button>
          </div>
        )}
        <textarea
          ref={addCardTextareaRef}
          data-testid="retro-add-card-input"
          className="w-full bg-[var(--c-panel)] border border-[var(--c-border)] rounded-lg px-2.5 py-2 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-accent"
          rows={2}
          placeholder="Add a card…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
        />
        <div className="relative" ref={attachmentPickerRef}>
          <button
            data-testid="retro-add-card-attachment-trigger"
            onClick={() => setShowAttachmentPicker((v) => !v)}
            title="Add emoji, GIF, or image"
            className="text-xs text-slate-400 hover:text-white p-1 rounded transition-colors"
          >
            😀 +
          </button>
          {showAttachmentPicker && (
            <div className="absolute top-full left-0 mt-2 z-30">
              <RetroCardAttachmentPicker
                onPickEmoji={(emoji) => insertTextAtCursor(addCardTextareaRef, draft, emoji, setDraft)}
                onPickImage={(url) => { setPendingImageUrl(url); setShowAttachmentPicker(false); }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
