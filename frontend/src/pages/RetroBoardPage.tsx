import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRetroSocket } from "../hooks/useRetroSocket";
import { useRetroCardDrag } from "../hooks/useRetroCardDrag";
import { useRetroReactions } from "../hooks/useRetroReactions";
import { useTheme } from "../hooks/useTheme";
import { useAccent } from "../hooks/useAccent";
import { RetroColumn } from "../components/RetroColumn";
import { RetroTimer } from "../components/RetroTimer";
import { ConfirmModal } from "../components/ConfirmModal";
import { RetroProfileMenu } from "../components/RetroProfileMenu";
import { RetroSettingsModal } from "../components/RetroSettingsModal";
import { RetroReactionsPanel } from "../components/RetroReactionsPanel";
import { ReactionFloater } from "../components/ReactionFloater";
import { DrawingCanvas, DRAW_COLORS } from "../components/DrawingCanvas";
import type { RetroParticipant } from "../types";
import QRCode from "qrcode";

const AVATAR_COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4"];
function getAvatarColor() {
  return localStorage.getItem("pp:avatar-color") || AVATAR_COLORS[0];
}
function saveAvatarColor(c: string) {
  localStorage.setItem("pp:avatar-color", c);
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
  const { floaters, handleReactionMessage } = useRetroReactions();
  const drawHandlerRef = useRef<((msg: object) => void) | null>(null);
  const handleDrawMessage = useCallback((msg: object) => { drawHandlerRef.current?.(msg); }, []);
  const { state, myParticipantId, connected, send, error, boardInactive } = useRetroSocket({
    boardId,
    participantId: storedParticipantId,
    nickname,
    onDrawMessage: handleDrawMessage,
    onReactionMessage: handleReactionMessage,
  });
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();
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
  const [showBoardSettings, setShowBoardSettings] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [pendingKick, setPendingKick] = useState<{ id: string; nickname: string } | null>(null);
  const [avatarColor, setAvatarColorState] = useState(getAvatarColor);
  const [currentNickname, setCurrentNickname] = useState(nickname);

  // Drawing mode — mirrors RoomPage's exactly.
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[4]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
  const colorPickerRef = useRef<HTMLDivElement>(null);

  function exitDrawing() {
    setIsDrawingMode(false);
    setShowColorPicker(false);
  }

  function handleLeaveBoard() {
    if (state?.facilitator_id === myParticipantId) {
      setShowCloseConfirm(true);
    } else {
      navigate("/");
    }
  }

  function handleAvatarColorChange(color: string) {
    saveAvatarColor(color);
    setAvatarColorState(color);
    send({ type: "update_avatar_color", color });
  }

  function handleNicknameChange(name: string) {
    setCurrentNickname(name);
    localStorage.setItem(`retro:${boardId}:nickname`, name);
    send({ type: "update_nickname", nickname: name });
  }

  // ESC exits drawing mode
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") exitDrawing(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Track cursor position for the local name label
  useEffect(() => {
    if (!isDrawingMode) return;
    function onMove(e: MouseEvent) { setCursorPos({ x: e.clientX, y: e.clientY }); }
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, [isDrawingMode]);

  // Close color picker on click outside
  useEffect(() => {
    if (!showColorPicker) return;
    function handler(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColorPicker]);

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
  const me = state.participants.find((p) => p.id === myParticipantId);
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
          {isFacilitator ? (
            <button
              onClick={() => setShowBoardSettings(true)}
              className="font-bold text-white hover:text-accent transition-colors truncate max-w-[120px] sm:max-w-none text-base sm:text-lg"
              title="Board settings"
            >
              {state.name}
            </button>
          ) : (
            <h1 className="font-bold text-white text-base sm:text-lg truncate">{state.name}</h1>
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
            {state.participants.filter((p) => p.id !== myParticipantId).map((p) => (
              <div
                key={p.id}
                data-testid="retro-participant"
                data-participant-nickname={p.nickname}
                title={p.nickname + (p.is_facilitator ? " (facilitator)" : "")}
                className={`relative w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ring-2 ring-[var(--c-bg)] ${!p.connected ? "opacity-40" : ""}`}
                style={{ backgroundColor: p.avatar_color }}
              >
                {p.nickname[0]?.toUpperCase()}
                {isFacilitator && (
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

          {/* Profile avatar (mirrors RoomPage) */}
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu((o) => !o)}
              title="Profile"
              className="flex items-center gap-1.5 bg-[var(--c-panel)] rounded-full px-2 sm:px-3 py-1.5 hover:bg-[var(--c-panel2)] transition-colors"
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: avatarColor }}
              >
                {(me?.nickname ?? currentNickname ?? "?")[0].toUpperCase()}
              </div>
              <span className="text-sm text-slate-300 hidden sm:block">{me?.nickname ?? currentNickname}</span>
            </button>
            {showProfileMenu && (
              <RetroProfileMenu
                nickname={me?.nickname ?? currentNickname}
                avatarColor={avatarColor}
                theme={theme}
                accent={accent}
                isFacilitator={isFacilitator}
                onNicknameChange={handleNicknameChange}
                onAvatarColorChange={handleAvatarColorChange}
                onThemeChange={setTheme}
                onAccentChange={setAccent}
                onLeaveBoard={handleLeaveBoard}
                onClose={() => setShowProfileMenu(false)}
              />
            )}
          </div>

          <button
            onClick={() => setShowInvite(true)}
            className="text-xs sm:text-sm bg-accent hover:bg-accent-hover text-accent-fg font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            Invite
          </button>

          {/* Reactions panel (issue #68) — header self-reactions, mirrors
              RoomPage's ReactionsPanel placement between Invite and drawing. */}
          <RetroReactionsPanel
            onReact={(value) => send({ type: "reaction", value })}
          />

          {/* Drawing mode button — mirrors RoomPage's toggle + color swatch. */}
          <div className="relative flex items-center gap-1 z-50">
            <button
              data-testid="drawing-toggle"
              data-active={isDrawingMode ? "true" : "false"}
              onClick={() => {
                if (isDrawingMode) { exitDrawing(); }
                else { setIsDrawingMode(true); setShowColorPicker(false); }
              }}
              title={isDrawingMode ? "Stop drawing (ESC)" : "Draw on screen"}
              className={`p-2 rounded-lg border transition-colors ${
                isDrawingMode
                  ? "border-yellow-500 text-yellow-400 bg-yellow-500/10"
                  : "border-[var(--c-border)] text-slate-400 hover:bg-[var(--c-panel2)]"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M13 2.5l2.5 2.5-9.5 9.5H3.5V12L13 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M11.5 4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <button
              data-testid="drawing-color-picker-toggle"
              onClick={() => setShowColorPicker((v) => !v)}
              title="Choose drawing color"
              className="w-7 h-7 rounded-full ring-2 ring-[var(--c-border)] hover:ring-white/60 transition-shadow shrink-0"
              style={{ backgroundColor: drawColor }}
            />
            {showColorPicker && (
              <div
                ref={colorPickerRef}
                className="absolute top-full right-0 mt-2 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl p-2.5 shadow-2xl z-50 flex gap-2"
              >
                {DRAW_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => { setDrawColor(color); setShowColorPicker(false); }}
                    className="w-7 h-7 rounded-full transition-transform hover:scale-125 shadow-md ring-2 ring-transparent hover:ring-white/40"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}
          </div>
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

      {/* Drawing canvas — always mounted so others' strokes are visible */}
      {myParticipantId && (
        <DrawingCanvas
          myPlayerId={myParticipantId}
          myNickname={me?.nickname ?? currentNickname}
          isActive={isDrawingMode}
          activeColor={drawColor}
          send={send}
          onRegister={(handler) => { drawHandlerRef.current = handler; }}
        />
      )}

      {/* Local pencil cursor when in drawing mode */}
      {isDrawingMode && (
        <div
          className="fixed z-50 pointer-events-none select-none"
          style={{ left: cursorPos.x, top: cursorPos.y }}
        >
          <svg
            width="22" height="22" viewBox="0 0 22 22" fill="none"
            style={{ position: "absolute", left: -20, top: -6, transform: "rotate(100deg)", transformOrigin: "20px 6px" }}
          >
            <path d="M16 2l4 4-11 11H5v-4L16 2z" fill={drawColor} stroke="white" strokeWidth="1" strokeLinejoin="round"/>
            <path d="M13 5l4 4" stroke="white" strokeWidth="0.8" strokeLinecap="round"/>
          </svg>
          <span
            className="absolute text-xs font-bold text-white px-1.5 py-0.5 rounded shadow-md whitespace-nowrap"
            style={{ backgroundColor: drawColor, left: 14, top: -28 }}
          >
            {me?.nickname ?? currentNickname}
          </span>
        </div>
      )}

      {showBoardSettings && (
        <RetroSettingsModal
          state={state}
          isFacilitator={isFacilitator}
          onSave={(patch) => send({ type: "update_board", ...patch })}
          onClose={() => setShowBoardSettings(false)}
        />
      )}

      {/* Rising reaction floaters in the lower-left of the screen (#68) —
          same lane-based animation as Planning Poker's, emoji-only. */}
      {floaters.map((f) => (
        <ReactionFloater
          key={f.id}
          kind="emoji"
          value={f.value}
          nickname={f.nickname}
          color={f.color}
          xLane={f.xLane}
        />
      ))}
    </div>
  );
}

function RetroInviteModal({ onClose }: { onClose: () => void }) {
  const url = window.location.href;
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (showQR && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, { width: 200, margin: 2 });
    }
  }, [showQR, url]);

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
          className="w-full bg-accent hover:bg-accent-hover text-accent-fg py-3 rounded-xl font-semibold transition-colors mb-3"
        >
          {copied ? "✓ Copied!" : "Copy link"}
        </button>

        <button
          onClick={() => setShowQR((v) => !v)}
          className="w-full border border-[var(--c-border)] text-slate-300 hover:bg-[var(--c-panel2)] py-2.5 rounded-xl text-sm transition-colors"
        >
          {showQR ? "Hide QR code" : "Show QR code"}
        </button>

        {showQR && (
          <div className="mt-4 flex justify-center bg-white rounded-xl p-3">
            <canvas ref={canvasRef} />
          </div>
        )}
      </div>
    </div>
  );
}
