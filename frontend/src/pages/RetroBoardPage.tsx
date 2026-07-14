import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRetroSocket } from "../hooks/useRetroSocket";
import { useRetroCardDrag } from "../hooks/useRetroCardDrag";
import { useRetroCardReactions } from "../hooks/useRetroCardReactions";
import { RetroColumn } from "../components/RetroColumn";
import { RetroTimer } from "../components/RetroTimer";
import { ConfirmModal } from "../components/ConfirmModal";
import type { RetroParticipant } from "../types";

const AVATAR_COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4"];
function getAvatarColor() {
  return localStorage.getItem("pp:avatar-color") || AVATAR_COLORS[0];
}

export default function RetroBoardPage() {
  const { boardId = "" } = useParams();
  const storedParticipantId = localStorage.getItem(`retro:${boardId}:participant_id`);
  const storedNick = localStorage.getItem(`retro:${boardId}:nickname`);

  const [nickname, setNickname] = useState(storedNick || "");
  const [joined, setJoined] = useState(!!storedNick);

  if (!joined) {
    return (
      <RetroJoinModal
        boardId={boardId}
        onJoin={(nick) => {
          setNickname(nick);
          localStorage.setItem(`retro:${boardId}:nickname`, nick);
          setJoined(true);
        }}
      />
    );
  }

  return <RetroBoard boardId={boardId} nickname={nickname} storedParticipantId={storedParticipantId} />;
}

function RetroJoinModal({ boardId, onJoin }: { boardId: string; onJoin: (nick: string) => void }) {
  const [nick, setNick] = useState("");
  const avatarColor = getAvatarColor();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--c-bg)]">
      <div className="bg-[var(--c-panel)] rounded-2xl shadow-xl p-8 w-full max-w-md">
        <h2 className="text-xl font-bold mb-2 text-white">Choose your display name</h2>
        <p className="text-slate-400 text-sm mb-6">Board: {boardId}</p>

        <div className="flex justify-center mb-5">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white"
            style={{ backgroundColor: avatarColor }}
          >
            {nick[0]?.toUpperCase() ?? "?"}
          </div>
        </div>

        <div className="relative mb-6">
          <label className="absolute -top-2 left-3 bg-[var(--c-panel)] px-1 text-xs text-slate-400">
            Your display name
          </label>
          <input
            className="w-full bg-transparent border border-[var(--c-border-hi)] rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-accent"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && nick.trim()) onJoin(nick.trim()); }}
            placeholder="Alice"
            autoFocus
          />
        </div>

        <button
          disabled={!nick.trim()}
          onClick={() => onJoin(nick.trim())}
          className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-accent-fg py-3 rounded-xl font-semibold transition-colors"
        >
          Continue to board
        </button>
      </div>
    </div>
  );
}

function RetroBoard({ boardId, nickname, storedParticipantId }: {
  boardId: string; nickname: string; storedParticipantId: string | null;
}) {
  const navigate = useNavigate();
  const { cardReactionOverlays, handleCardReactionMessage } = useRetroCardReactions();
  const { state, myParticipantId, connected, send, error, boardInactive } = useRetroSocket({
    boardId,
    participantId: storedParticipantId,
    nickname,
    onCardReactionMessage: handleCardReactionMessage,
  });
  // Issue #62 Phase 2 follow-up — merging is destructive-feeling enough
  // (cards visually fold into one) that it's gated by a confirmation
  // instead of firing straight from the drop, the same pattern already used
  // for kick/close below.
  const [pendingMerge, setPendingMerge] = useState<{ sourceId: string; targetId: string; sourceText: string; targetText: string } | null>(null);
  const { draggingId, overId, startDrag, moveDrag, endDrag } = useRetroCardDrag(
    (sourceCardId, targetCardId) => {
      const sourceText = state?.cards.find((c) => c.id === sourceCardId)?.text ?? "";
      const targetText = state?.cards.find((c) => c.id === targetCardId)?.text ?? "";
      setPendingMerge({ sourceId: sourceCardId, targetId: targetCardId, sourceText, targetText });
    }
  );

  const avatarSyncedRef = useRef(false);
  useEffect(() => {
    if (myParticipantId && connected && !avatarSyncedRef.current) {
      avatarSyncedRef.current = true;
      send({ type: "update_avatar_color", color: getAvatarColor() });
    }
  }, [myParticipantId, connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showInvite, setShowInvite] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [pendingKick, setPendingKick] = useState<{ id: string; nickname: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--c-bg)] text-white p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  if (boardInactive) {
    const copy = (() => {
      if (boardInactive === "expired") {
        return { icon: "⌛", title: "This board is no longer active", body: "The board timer ran out and it was closed automatically." };
      }
      if (boardInactive === "closed") {
        return { icon: "🚪", title: "The board was closed by the facilitator", body: "The session ended, so the board is no longer available." };
      }
      if (boardInactive === "kicked") {
        return { icon: "👋", title: "You were removed from this board", body: "The facilitator removed you from this session." };
      }
      return { icon: "🔗", title: "Board not found", body: "We couldn't find a board at this URL — it may have already been closed." };
    })();
    return (
      <div data-testid="retro-inactive-overlay" data-reason={boardInactive}
        className="min-h-screen flex items-center justify-center bg-[var(--c-bg)] text-white p-6">
        <div className="max-w-md text-center space-y-5">
          <div className="text-6xl">{copy.icon}</div>
          <h1 className="text-2xl font-bold">{copy.title}</h1>
          <p className="text-slate-300">{copy.body}</p>
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-accent-fg font-semibold shadow"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  if (!state || !myParticipantId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--c-bg)]">
        <div className="text-slate-400">Connecting…</div>
      </div>
    );
  }

  const isFacilitator = state.facilitator_id === myParticipantId;
  const participantsById: Record<string, RetroParticipant> = Object.fromEntries(
    state.participants.map((p) => [p.id, p])
  );
  const votesUsed = state.cards.filter((c) => c.votes.includes(myParticipantId)).length;
  const votesLeft = state.max_votes_per_person - votesUsed;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--c-bg)] text-white">
      <header className="flex items-center justify-between px-3 sm:px-6 py-3 border-b border-[var(--c-border)] shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-accent rounded-full flex items-center justify-center text-sm shrink-0">📝</div>
          {renaming ? (
            <input
              autoFocus
              className="bg-transparent border-b border-accent text-white font-bold text-base sm:text-lg focus:outline-none min-w-0"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => { send({ type: "update_board", name: nameDraft }); setRenaming(false); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { send({ type: "update_board", name: nameDraft }); setRenaming(false); }
                if (e.key === "Escape") setRenaming(false);
              }}
            />
          ) : (
            <h1
              className={`font-bold text-white text-base sm:text-lg truncate ${isFacilitator ? "cursor-pointer hover:text-accent" : ""}`}
              title={isFacilitator ? "Click to rename" : state.name}
              onClick={() => { if (isFacilitator) { setNameDraft(state.name); setRenaming(true); } }}
            >
              {state.name}
            </h1>
          )}
          <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? "bg-green-500" : "bg-amber-500"}`} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <RetroTimer
            timerRunning={state.timer_running}
            timerEndsAt={state.timer_ends_at}
            timerRemainingSeconds={state.timer_remaining_seconds}
            isFacilitator={isFacilitator}
            onStart={(seconds) => send({ type: "start_timer", seconds })}
            onPause={() => send({ type: "pause_timer" })}
            onResume={() => send({ type: "resume_timer" })}
            onReset={() => send({ type: "reset_timer" })}
          />

          <div className="flex items-center -space-x-2">
            {state.participants.map((p) => (
              <div
                key={p.id}
                data-testid="retro-participant"
                data-participant-nickname={p.nickname}
                title={p.nickname + (p.is_facilitator ? " (facilitator)" : "")}
                className={`relative w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ring-2 ring-[var(--c-bg)] ${!p.connected ? "opacity-40" : ""}`}
                style={{ backgroundColor: p.avatar_color }}
              >
                {p.nickname[0]?.toUpperCase()}
                {isFacilitator && p.id !== myParticipantId && (
                  <button
                    data-testid="retro-kick-button"
                    onClick={() => setPendingKick({ id: p.id, nickname: p.nickname })}
                    title="Remove from board"
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-[9px] leading-none"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => setShowInvite(true)}
            className="text-xs sm:text-sm bg-accent hover:bg-accent-hover text-accent-fg font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            Invite
          </button>

          {isFacilitator && (
            <div className="relative">
              <button
                onClick={() => setShowSettings((v) => !v)}
                title="Board settings"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[var(--c-panel2)] transition-colors"
              >
                ⚙️
              </button>
              {showSettings && (
                <RetroSettingsDropdown
                  anonymousMode={state.anonymous_mode}
                  maxVotes={state.max_votes_per_person}
                  onClose={() => setShowSettings(false)}
                  onChangeAnonymous={(v) => send({ type: "update_board", anonymous_mode: v })}
                  onChangeMaxVotes={(v) => send({ type: "update_board", max_votes_per_person: v })}
                  onCloseBoard={() => { setShowSettings(false); setShowCloseConfirm(true); }}
                />
              )}
            </div>
          )}
        </div>
      </header>

      <div className="px-3 sm:px-6 py-2 text-xs text-slate-400">
        Votes left: <span className="font-semibold text-white">{Math.max(0, votesLeft)}</span> / {state.max_votes_per_person}
      </div>

      <div className="flex-1 overflow-x-auto p-3 sm:p-6 pt-2">
        <div className="flex gap-4 min-w-max">
          {state.columns.map((column) => (
            <RetroColumn
              key={column.id}
              column={column}
              cards={state!.cards.filter((c) => c.column_id === column.id)}
              participants={participantsById}
              isFacilitator={isFacilitator}
              anonymousMode={state!.anonymous_mode}
              myParticipantId={myParticipantId}
              votesLeft={votesLeft}
              onAddCard={(text) => send({ type: "add_card", column_id: column.id, text })}
              onVote={(cardId) => send({ type: "vote_card", card_id: cardId })}
              onUnvote={(cardId) => send({ type: "unvote_card", card_id: cardId })}
              onEditCard={(cardId, text) => send({ type: "edit_card", card_id: cardId, text })}
              onDeleteCard={(cardId) => send({ type: "delete_card", card_id: cardId })}
              onUngroupCard={(cardId) => send({ type: "ungroup_card", card_id: cardId })}
              draggingId={draggingId}
              overId={overId}
              onDragStart={startDrag}
              onDragMove={moveDrag}
              onDragEnd={endDrag}
              cardReactionOverlays={cardReactionOverlays}
              onReactToCard={(cardId, value) => send({ type: "react_to_card", card_id: cardId, value })}
            />
          ))}
        </div>
      </div>

      {showInvite && <RetroInviteModal onClose={() => setShowInvite(false)} />}

      <ConfirmModal
        open={showCloseConfirm}
        icon="🚪"
        title="Close board for everyone?"
        message="All participants will be disconnected and the session will end."
        confirmLabel="Close board"
        onConfirm={() => { send({ type: "close_board" }); setShowCloseConfirm(false); }}
        onCancel={() => setShowCloseConfirm(false)}
      />

      <ConfirmModal
        open={pendingMerge !== null}
        icon="🔗"
        title="Merge these cards?"
        message={pendingMerge ? `"${pendingMerge.sourceText}" will be merged into "${pendingMerge.targetText}". You can undo this from the merged card afterward.` : ""}
        confirmLabel="Merge"
        variant="primary"
        onConfirm={() => {
          if (pendingMerge) send({ type: "group_cards", source_card_id: pendingMerge.sourceId, target_card_id: pendingMerge.targetId });
          setPendingMerge(null);
        }}
        onCancel={() => setPendingMerge(null)}
      />

      <ConfirmModal
        open={pendingKick !== null}
        icon="👋"
        title={pendingKick ? `Remove ${pendingKick.nickname} from the board?` : ""}
        message="They'll be disconnected and won't be able to reconnect to this board."
        confirmLabel="Remove"
        onConfirm={() => {
          if (pendingKick) send({ type: "kick_participant", target_id: pendingKick.id });
          setPendingKick(null);
        }}
        onCancel={() => setPendingKick(null)}
      />
    </div>
  );
}

function RetroSettingsDropdown({
  anonymousMode, maxVotes, onClose, onChangeAnonymous, onChangeMaxVotes, onCloseBoard,
}: {
  anonymousMode: boolean;
  maxVotes: number;
  onClose: () => void;
  onChangeAnonymous: (v: boolean) => void;
  onChangeMaxVotes: (v: number) => void;
  onCloseBoard: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-testid="retro-settings-dropdown"
      className="absolute top-full mt-2 right-0 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl p-4 z-30 w-64 space-y-4"
    >
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <div>
          <div className="text-sm text-white font-medium">Anonymous cards</div>
          <div className="text-xs text-slate-400">Hide who wrote each card</div>
        </div>
        <button
          data-testid="retro-anonymous-toggle"
          onClick={() => onChangeAnonymous(!anonymousMode)}
          className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${anonymousMode ? "bg-accent" : "bg-[var(--c-border)]"}`}
        >
          <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${anonymousMode ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </label>

      <div>
        <label className="text-sm text-white font-medium block mb-1">Votes per person</label>
        <input
          data-testid="retro-max-votes-input"
          type="number"
          min={1}
          value={maxVotes}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v) && v >= 1) onChangeMaxVotes(v);
          }}
          className="w-full bg-[var(--c-bg)] border border-[var(--c-border-hi)] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
        />
      </div>

      <button
        onClick={onCloseBoard}
        className="w-full text-left text-sm text-red-400 hover:text-red-300 font-medium pt-2 border-t border-[var(--c-border)]"
      >
        Close board for everyone
      </button>
    </div>
  );
}

function RetroInviteModal({ onClose }: { onClose: () => void }) {
  const url = window.location.href;
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => onClose(), 1000);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[var(--c-panel)] rounded-2xl p-8 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Invite participants</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>
        <label className="text-xs text-slate-400 mb-1 block">Board's url</label>
        <input
          readOnly
          value={url}
          className="w-full bg-[var(--c-bg)] border border-[var(--c-border-hi)] rounded-lg px-3 py-2.5 text-sm text-slate-300 mb-4 focus:outline-none"
          onFocus={(e) => e.target.select()}
        />
        <button
          onClick={copy}
          className="w-full bg-accent hover:bg-accent-hover text-accent-fg py-3 rounded-xl font-semibold transition-colors"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
