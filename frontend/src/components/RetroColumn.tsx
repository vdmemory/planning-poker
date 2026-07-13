import { useState } from "react";
import type { RetroCard, RetroColumnDef, RetroParticipant } from "../types";
import { RetroCardItem } from "./RetroCardItem";

interface Props {
  column: RetroColumnDef;
  cards: RetroCard[];
  participants: Record<string, RetroParticipant>;
  isFacilitator: boolean;
  anonymousMode: boolean;
  myParticipantId: string;
  votesLeft: number;
  onAddCard: (text: string) => void;
  onVote: (cardId: string) => void;
  onUnvote: (cardId: string) => void;
  onEditCard: (cardId: string, text: string) => void;
  onDeleteCard: (cardId: string) => void;
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
}: Props) {
  const [draft, setDraft] = useState("");

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAddCard(trimmed);
    setDraft("");
  }

  return (
    <div data-testid="retro-column" data-column-id={column.id} className="flex flex-col min-w-[260px] w-[260px] shrink-0">
      <div className="flex items-center gap-2 px-3 py-2 rounded-t-xl" style={{ backgroundColor: `${column.color}22` }}>
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: column.color }} />
        <h3 className="font-semibold text-white text-sm">{column.title}</h3>
        <span className="text-xs text-slate-400 ml-auto">{cards.length}</span>
      </div>

      <div className="flex-1 bg-[var(--c-panel2)] rounded-b-xl p-2 space-y-2 min-h-[120px]">
        {cards.map((card) => (
          <RetroCardItem
            key={card.id}
            card={card}
            author={participants[card.author_id]}
            isMine={card.author_id === myParticipantId}
            isFacilitator={isFacilitator}
            anonymousMode={anonymousMode}
            myParticipantId={myParticipantId}
            votesLeft={votesLeft}
            onVote={() => onVote(card.id)}
            onUnvote={() => onUnvote(card.id)}
            onEdit={(text) => onEditCard(card.id, text)}
            onDelete={() => onDeleteCard(card.id)}
          />
        ))}

        <textarea
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
      </div>
    </div>
  );
}
