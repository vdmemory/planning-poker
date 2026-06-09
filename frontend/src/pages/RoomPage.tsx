import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { useTheme } from "../hooks/useTheme";
import { useAccent } from "../hooks/useAccent";
import { useSettings } from "../hooks/useSettings";
import { IssueSidebar } from "../components/IssueSidebar";
import { GameSettingsModal, CARD_BACKS } from "../components/GameSettingsModal";
import { DrawingCanvas, DRAW_COLORS } from "../components/DrawingCanvas";
import { ProfileMenu } from "../components/ProfileMenu";
import { ReactionsPanel } from "../components/ReactionsPanel";
import { ReactionFloater } from "../components/ReactionFloater";
import { ConfirmModal } from "../components/ConfirmModal";
import { useReactionAnimations, type CardReaction } from "../hooks/useReactionAnimations";
import type { Player, RoomState, Stats, GameSettings } from "../types";
import QRCode from "qrcode";

const AVATAR_COLORS = ["#3b82f6","#8b5cf6","#ec4899","#ef4444","#f97316","#eab308","#22c55e","#06b6d4"];
function getAvatarColor() {
  return localStorage.getItem("pp:avatar-color") || AVATAR_COLORS[0];
}
function saveAvatarColor(c: string) {
  localStorage.setItem("pp:avatar-color", c);
}

/**
 * Pick a text color that contrasts the given background — used by the name pill
 * above the player card. YIQ luma threshold of 160 keeps text readable on the
 * mid-light palette colors (e.g. amber #eab308) while staying white on the
 * darker ones (blue, purple, pink).
 */
function pickContrastTextColor(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "#ffffff";
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? "#0f172a" : "#ffffff";
}

export default function RoomPage() {
  const { roomId = "" } = useParams();
  const storedPlayerId = localStorage.getItem(`pp:${roomId}:player_id`);
  const storedNick = localStorage.getItem(`pp:${roomId}:nickname`);

  const [nickname, setNickname] = useState(storedNick || "");
  const [isSpectator, setIsSpectator] = useState(false);
  const [joined, setJoined] = useState(!!storedNick);

  if (!joined) {
    return (
      <JoinModal
        roomId={roomId}
        onJoin={(nick, spectator) => {
          setNickname(nick);
          setIsSpectator(spectator);
          localStorage.setItem(`pp:${roomId}:nickname`, nick);
          setJoined(true);
        }}
      />
    );
  }

  return (
    <Room
      roomId={roomId}
      nickname={nickname}
      storedPlayerId={storedPlayerId}
      isSpectator={isSpectator}
    />
  );
}

function JoinModal({
  roomId,
  onJoin,
}: {
  roomId: string;
  onJoin: (nick: string, spectator: boolean) => void;
}) {
  const [nick, setNick] = useState("");
  const [spectator, setSpectator] = useState(false);
  const avatarColor = getAvatarColor();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--c-bg)]">
      <div className="bg-[var(--c-panel)] rounded-2xl shadow-xl p-8 w-full max-w-md">
        <h2 className="text-xl font-bold mb-2 text-white">Choose your display name</h2>
        <p className="text-slate-400 text-sm mb-6">Room: {roomId}</p>

        <div className="flex justify-center mb-5">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white"
            style={{ backgroundColor: avatarColor }}
          >
            {nick[0]?.toUpperCase() ?? "?"}
          </div>
        </div>

        <div className="relative mb-4">
          <label className="absolute -top-2 left-3 bg-[var(--c-panel)] px-1 text-xs text-slate-400">
            Your display name
          </label>
          <input
            className="w-full bg-transparent border border-[var(--c-border-hi)] rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-accent"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nick.trim()) onJoin(nick.trim(), spectator);
            }}
            placeholder="Alice"
            autoFocus
          />
        </div>

        <label className="flex items-center gap-3 mb-6 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only"
              checked={spectator}
              onChange={(e) => setSpectator(e.target.checked)}
            />
            <div
              className={`w-11 h-6 rounded-full transition-colors ${spectator ? "bg-accent" : "bg-[var(--c-border)]"}`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  spectator ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </div>
          </div>
          <div>
            <div className="text-sm text-white font-medium">Join as spectator</div>
            <div className="text-xs text-slate-400">You can observe without voting</div>
          </div>
        </label>

        <button
          disabled={!nick.trim()}
          onClick={() => onJoin(nick.trim(), spectator)}
          className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-accent-fg py-3 rounded-xl font-semibold transition-colors"
        >
          Continue to game
        </button>
      </div>
    </div>
  );
}

function Room({
  roomId,
  nickname,
  storedPlayerId,
  isSpectator: initialSpectator,
}: {
  roomId: string;
  nickname: string;
  storedPlayerId: string | null;
  isSpectator: boolean;
}) {
  const navigate = useNavigate();
  const drawHandlerRef = useRef<((msg: object) => void) | null>(null);
  const handleDrawMessage = useCallback((msg: object) => { drawHandlerRef.current?.(msg); }, []);

  // Issue #32 — receive `reaction` broadcasts and feed them to the animation
  // manager. Used for the on-card overlay AND the rising floaters.
  const { cardReactions, floaters, handleReactionMessage } = useReactionAnimations();

  const { state, stats, myPlayerId, connected, send, error, countdown, roomInactive } = useRoomSocket({
    roomId,
    playerId: storedPlayerId,
    nickname,
    onDrawMessage: handleDrawMessage,
    onReactionMessage: handleReactionMessage,
  });
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();
  const { settings, setSettings } = useSettings();

  const [localVote, setLocalVote] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showGameSettings, setShowGameSettings] = useState(false);
  const [avatarColor, setAvatarColorState] = useState(getAvatarColor);
  const [currentNickname, setCurrentNickname] = useState(nickname);
  const prevRevealedRef = useRef(false);
  const avatarSyncedRef = useRef(false);

  // Drawing mode
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[4]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
  const colorPickerRef = useRef<HTMLDivElement>(null);

  const [showCloseRoomModal, setShowCloseRoomModal] = useState(false);
  // Issue #4 — facilitator confirms before kicking a player. The state holds
  // the target id + nickname; the ConfirmModal reads them, the close handler
  // clears them. Previously kick was a single-click action with no guardrail.
  const [pendingKick, setPendingKick] = useState<{ id: string; nickname: string } | null>(null);

  function exitDrawing() {
    setIsDrawingMode(false);
    setShowColorPicker(false);
  }

  function handleLeaveRoom() {
    if (state?.facilitator_id === myPlayerId) {
      setShowCloseRoomModal(true);
    } else {
      navigate("/");
    }
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

  // Reset localVote when a new round starts
  useEffect(() => {
    if (state) {
      if (prevRevealedRef.current && !state.revealed) {
        setLocalVote(null);
      }
      prevRevealedRef.current = state.revealed;
    }
  }, [state?.revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync avatar color to server on first connect
  useEffect(() => {
    if (myPlayerId && connected && !avatarSyncedRef.current) {
      avatarSyncedRef.current = true;
      send({ type: "update_avatar_color", color: getAvatarColor() });
    }
  }, [myPlayerId, connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-reveal when everyone voted
  useEffect(() => {
    if (!state || !settings.autoReveal || state.revealed) return;
    const isFacilitator = state.facilitator_id === myPlayerId;
    if (!isFacilitator) return;
    const activePlayers = state.players.filter((p) => !p.is_spectator);
    const everyoneVoted =
      activePlayers.length > 0 &&
      activePlayers.every((p) => state.voted_player_ids.includes(p.id));
    if (everyoneVoted) {
      triggerReveal();
    }
  }, [state?.voted_player_ids.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function triggerReveal() {
    send({ type: "countdown", seconds: 3 });
    window.setTimeout(() => send({ type: "reveal" }), 3000);
  }

  function handleAvatarColorChange(color: string) {
    saveAvatarColor(color);
    setAvatarColorState(color);
    send({ type: "update_avatar_color", color });
  }

  function handleNicknameChange(name: string) {
    setCurrentNickname(name);
    localStorage.setItem(`pp:${roomId}:nickname`, name);
    send({ type: "update_nickname", nickname: name });
  }

  function handleGameSettingsSave(
    roomPatch: {
      name?: string;
      deck_type?: string;
      card_back?: string;
      who_can_reveal?: string;
      who_can_manage_issues?: string;
      // Issue #19 — when changed in settings, the backend hands this back
      // in the next `room_state` so every client renders consistently.
      close_on_facilitator_leave?: boolean;
    },
    settingsPatch: Partial<GameSettings>
  ) {
    if (Object.keys(roomPatch).length > 0) {
      send({ type: "update_room", ...roomPatch });
    }
    setSettings(settingsPatch);
  }

  if (error) {
    return <RoomErrorScreen error={error} />;
  }

  // Room expired (timer), never existed at this URL, was closed by the
  // facilitator (#19), OR (issue #37) the facilitator kicked this specific
  // player. useRoomSocket has already disabled reconnect for all four, so
  // we just render the dead end with a way back home.
  if (roomInactive) {
    const copy = (() => {
      if (roomInactive === "expired") {
        return {
          icon: "⌛",
          title: "This room is no longer active",
          body: "The room timer ran out and it was closed automatically. Start a new one to keep planning.",
        };
      }
      if (roomInactive === "closed") {
        return {
          icon: "🚪",
          title: "The room was closed by the creator",
          body: "The facilitator ended the session, so the room is no longer available. Start a new one to keep planning.",
        };
      }
      if (roomInactive === "kicked") {
        // Issue #37 — distinct copy from "closed": the room is still alive
        // for everyone else, but it's no longer available to *this* user.
        return {
          icon: "👋",
          title: "You were removed from this room",
          body: "The facilitator removed you from this session. You can start a new game to keep planning.",
        };
      }
      return {
        icon: "🔗",
        title: "Room not found",
        body: "We couldn't find a room at this URL — it may have already been closed.",
      };
    })();
    return (
      <div
        data-testid="room-inactive-overlay"
        data-reason={roomInactive}
        className="min-h-screen flex items-center justify-center bg-[var(--c-bg)] text-white p-6"
      >
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

  if (!state || !myPlayerId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--c-bg)]">
        <div className="text-slate-400">Connecting…</div>
      </div>
    );
  }

  const me = state.players.find((p) => p.id === myPlayerId);
  const isFacilitator = state.facilitator_id === myPlayerId;
  const canReveal = isFacilitator || state.who_can_reveal === "everyone";
  const canManageIssues = isFacilitator || state.who_can_manage_issues === "everyone";
  function onKickPlayer(targetId: string) {
    // `state` is non-null below the early return above, but TS can't track
    // that across a closure — guard explicitly.
    const target = state?.players.find((p) => p.id === targetId);
    if (!target) return;
    setPendingKick({ id: target.id, nickname: target.nickname });
  }
  const currentIssue = state.issues.find((i) => i.id === state.current_issue_id);
  const activePlayers = state.players.filter((p) => !p.is_spectator);
  const everyoneVoted =
    activePlayers.length > 0 &&
    activePlayers.every((p) => state.voted_player_ids.includes(p.id));
  const onlyMe = state.players.filter((p) => p.connected).length <= 1;
  const facilitator = state.players.find((p) => p.id === state.facilitator_id);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--c-bg)] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-3 sm:px-6 py-3 border-b border-[var(--c-border)] shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-accent rounded-full flex items-center justify-center text-sm shrink-0">
            🃏
          </div>
          {isFacilitator ? (
            <button
              onClick={() => setShowGameSettings(true)}
              className="font-semibold text-white hover:text-accent transition-colors truncate max-w-[120px] sm:max-w-none text-sm sm:text-base"
              title="Game settings"
            >
              {state.name}
            </button>
          ) : (
            <span className="font-semibold text-white truncate max-w-[120px] sm:max-w-none text-sm sm:text-base">
              {state.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? "bg-green-500" : "bg-amber-500"}`} />

          {/* Profile avatar */}
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu((o) => !o)}
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
              <ProfileMenu
                nickname={me?.nickname ?? currentNickname}
                avatarColor={avatarColor}
                theme={theme}
                isSpectator={me?.is_spectator ?? false}
                isFacilitator={isFacilitator}
                onNicknameChange={handleNicknameChange}
                onAvatarColorChange={handleAvatarColorChange}
                onThemeChange={setTheme}
                accent={accent}
                onAccentChange={setAccent}
                onSpectatorToggle={() => send({ type: "toggle_spectator" })}
                onLeaveRoom={handleLeaveRoom}
                onClose={() => setShowProfileMenu(false)}
              />
            )}
          </div>

          <button
            onClick={() => setShowInvite(true)}
            className="hidden sm:flex items-center gap-2 border border-accent text-accent px-4 py-1.5 rounded-lg hover:bg-accent-soft text-sm font-medium transition-colors"
          >
            👥 Invite players
          </button>
          {/* Mobile invite — icon only */}
          <button
            onClick={() => setShowInvite(true)}
            className="sm:hidden p-2 rounded-lg border border-accent text-accent hover:bg-accent-soft transition-colors"
            title="Invite players"
          >
            👥
          </button>

          {/* Reactions panel (issue #32) — Google Meet-style quick reactions.
              Desktop: inline row; mobile: collapses to a single trigger that
              opens a bottom-sheet. Sends `reaction` WS messages; the server
              broadcasts back to all connected clients (sender included). */}
          <ReactionsPanel
            onReact={(kind, value) => send({ type: "reaction", kind, value })}
          />

          {/* Drawing mode button — click to toggle on/off (issue #6).
              Color picker moved to the small swatch button next to it. ESC
              still exits via the keydown handler.
              z-50 keeps the toggle (and the color swatch) clickable when the
              drawing canvas covers the screen — the canvas itself is z-40
              with pointer-events:auto, so anything below z-50 gets eaten. */}
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

          <button
            onClick={() => setSidebarOpen((o) => !o)}
            title="Toggle issues sidebar"
            className={`p-2 rounded-lg border transition-colors ${
              sidebarOpen
                ? "border-accent text-accent bg-accent-soft"
                : "border-[var(--c-border)] text-slate-400 hover:bg-[var(--c-panel2)]"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
              <rect x="1" y="1" width="7" height="16" rx="1" opacity="0.5" />
              <rect x="10" y="1" width="7" height="16" rx="1" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 flex flex-col items-center p-4 sm:p-6 gap-4 sm:gap-5 overflow-y-auto">
          {onlyMe && (
            <p className="text-slate-400 text-sm">
              Feeling lonely? 🤙{" "}
              <button onClick={() => setShowInvite(true)} className="text-accent hover:underline">
                Invite players
              </button>
            </p>
          )}

          {/* Current issue indicator */}
          {currentIssue && (
            <div className="w-full max-w-2xl bg-[var(--c-panel)] rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-xs text-slate-500 shrink-0">
                {state.issues.findIndex((i) => i.id === currentIssue.id) + 1}/{state.issues.length}
              </span>
              <span className="text-sm text-slate-200 truncate">{currentIssue.title}</span>
              {currentIssue.final_estimate && (
                <span className="ml-auto shrink-0 bg-accent-soft border border-accent-soft-hi text-accent text-xs font-bold px-2 py-0.5 rounded-lg">
                  {currentIssue.final_estimate}
                </span>
              )}
            </div>
          )}

          {/* Poker table (desktop) */}
          <div className="hidden md:flex flex-col items-center w-full">
            <PokerTable
              state={state}
              stats={stats}
              isFacilitator={isFacilitator}
              canReveal={canReveal}
              myPlayerId={myPlayerId}
              avatarColor={avatarColor}
              everyoneVoted={everyoneVoted}
              countdown={countdown}
              cardBack={state.card_back}
              onReveal={triggerReveal}
              onReset={() => send({ type: "reset" })}
              onRevote={(card) => send({ type: "revote", card })}
              onKickPlayer={isFacilitator ? onKickPlayer : undefined}
              cardReactions={cardReactions}
            />
          </div>

          {/* Mobile: ActionBox + player list */}
          <div className="md:hidden w-full flex flex-col items-center gap-4">
            <ActionBox
              state={state}
              stats={stats}
              isFacilitator={isFacilitator}
              canReveal={canReveal}
              everyoneVoted={everyoneVoted}
              countdown={countdown}
              onReveal={triggerReveal}
              onReset={() => send({ type: "reset" })}
            />
            <div className="flex flex-wrap justify-center gap-4">
              {state.players.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  voted={state.voted_player_ids.includes(player.id)}
                  revealed={state.revealed}
                  cardValue={state.revealed ? state.votes[player.id] : null}
                  isFacilitator={player.id === state.facilitator_id}
                  avatarColor={player.id === myPlayerId ? avatarColor : player.avatar_color}
                  isMe={player.id === myPlayerId}
                  deck={state.deck}
                  cardBack={state.card_back}
                  onRevote={(card) => send({ type: "revote", card })}
                  canKick={isFacilitator && player.id !== myPlayerId}
                  onKick={() => onKickPlayer(player.id)}
                  reaction={cardReactions[player.id]}
                />
              ))}
            </div>
          </div>

          {/* Bottom: voting deck */}
          {!state.revealed && !me?.is_spectator && countdown === null && (
            <div className="mt-auto w-full pt-4 text-center">
              <p className="text-slate-400 text-sm mb-3">Choose your card 👇</p>
              <div className="flex gap-2 overflow-x-auto pb-2 pt-4 justify-start sm:justify-center px-2 sm:px-0">
                {state.deck.map((value) => (
                  <VotingCard
                    key={value}
                    value={value}
                    selected={localVote === value}
                    onClick={() => {
                      send({ type: "vote", card: value });
                      setLocalVote(value);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </main>

        {sidebarOpen && (
          <aside className="w-72 sm:w-80 border-l border-[var(--c-border)] overflow-y-auto shrink-0">
            <IssueSidebar
              state={state}
              canManageIssues={canManageIssues}
              myPlayerId={myPlayerId}
              send={send}
              onClose={() => setSidebarOpen(false)}
            />
          </aside>
        )}
      </div>

      {/* Rising reaction floaters in the lower-left of the screen (#32).
          The hook hands each floater an X-lane so concurrent reactions
          don't stack on the same column. */}
      {floaters.map((f) => (
        <ReactionFloater
          key={f.id}
          kind={f.kind}
          value={f.value}
          nickname={f.nickname}
          color={f.color}
          xLane={f.xLane}
        />
      ))}

      {/* Drawing canvas — always mounted so others' strokes are visible */}
      {myPlayerId && (
        <DrawingCanvas
          myPlayerId={myPlayerId}
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
          {/* Pencil icon — tip aligns with cursor position */}
          <svg
            width="22" height="22" viewBox="0 0 22 22" fill="none"
            style={{ position: "absolute", left: -2, top: -20, transform: "rotate(-45deg)" }}
          >
            <path d="M16 2l4 4-11 11H5v-4L16 2z" fill={drawColor} stroke="white" strokeWidth="1" strokeLinejoin="round"/>
            <path d="M13 5l4 4" stroke="white" strokeWidth="0.8" strokeLinecap="round"/>
          </svg>
          {/* Name badge */}
          <span
            className="absolute text-xs font-bold text-white px-1.5 py-0.5 rounded shadow-md whitespace-nowrap"
            style={{ backgroundColor: drawColor, left: 14, top: -28 }}
          >
            {me?.nickname ?? currentNickname}
          </span>
        </div>
      )}

      {/* Issue #4 — close-room confirmation uses the shared ConfirmModal
          instead of the old bespoke CloseRoomModal (which has been removed). */}
      <ConfirmModal
        open={showCloseRoomModal}
        title="Close room for everyone?"
        message="All participants will be disconnected and the session will end."
        confirmLabel="Close room"
        onConfirm={() => { send({ type: "close_room" }); setShowCloseRoomModal(false); }}
        onCancel={() => setShowCloseRoomModal(false)}
      />

      {/* Issue #4 — kick-player confirmation. New guardrail; previously the
          facilitator's click on the hover X kicked instantly. */}
      <ConfirmModal
        open={pendingKick !== null}
        icon="👋"
        title={pendingKick ? `Remove ${pendingKick.nickname} from the room?` : ""}
        message="They'll be disconnected and won't be able to reconnect to this room."
        confirmLabel="Remove"
        onConfirm={() => {
          if (pendingKick) send({ type: "kick_player", target_player_id: pendingKick.id });
          setPendingKick(null);
        }}
        onCancel={() => setPendingKick(null)}
      />

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}

      {showGameSettings && (
        <GameSettingsModal
          state={state}
          settings={settings}
          isFacilitator={isFacilitator}
          facilitatorName={facilitator?.nickname ?? "?"}
          onSave={handleGameSettingsSave}
          onClose={() => setShowGameSettings(false)}
        />
      )}
    </div>
  );
}

// ─── Poker Table ─────────────────────────────────────────────────────────────

function PokerTable({
  state,
  stats,
  isFacilitator,
  canReveal,
  myPlayerId,
  avatarColor,
  everyoneVoted,
  countdown,
  cardBack,
  onReveal,
  onReset,
  onRevote,
  onKickPlayer,
  cardReactions,
}: {
  state: RoomState;
  stats: Stats | null;
  isFacilitator: boolean;
  canReveal: boolean;
  myPlayerId: string;
  avatarColor: string;
  everyoneVoted: boolean;
  countdown: number | null;
  cardBack: string;
  onReveal: () => void;
  onReset: () => void;
  onRevote: (card: string) => void;
  onKickPlayer?: (id: string) => void;
  cardReactions: Record<string, CardReaction>;
}) {
  const players = state.players;
  const n = players.length;

  // Table oval dimensions (px)
  const TW = 520;
  const TH = 250;

  // Gap from table edge to player card center
  const GAP = 56;

  // Orbit radii (center → player card center)
  const ORX = TW / 2 + GAP;
  const ORY = TH / 2 + GAP;

  // Player card area size (w × h, including avatar + card + name)
  const PW = 64;
  const PH = 100;

  // Container size
  const CW = Math.round((ORX + PW / 2 + 8) * 2);
  const CH = Math.round((ORY + PH / 2 + 8) * 2);
  const CX = CW / 2;
  const CY = CH / 2;

  return (
    <div className="relative mx-auto shrink-0" style={{ width: CW, height: CH }}>
      {/* Felt oval */}
      <div
        className="absolute poker-felt"
        style={{
          left: (CW - TW) / 2,
          top: (CH - TH) / 2,
          width: TW,
          height: TH,
          borderRadius: "50%",
          background: "radial-gradient(ellipse at 42% 38%, #16a34a, #15803d, #14532d)",
          border: "10px solid #92400e",
          boxShadow:
            "0 0 0 3px #78350f, inset 0 2px 10px rgba(255,255,255,0.08), inset 0 -6px 20px rgba(0,0,0,0.35), 0 12px 48px rgba(0,0,0,0.55)",
        }}
      >
        {/* Center action area */}
        <div className="absolute inset-0 flex items-center justify-center">
          <TableCenter
            state={state}
            stats={stats}
            isFacilitator={isFacilitator}
            canReveal={canReveal}
            everyoneVoted={everyoneVoted}
            countdown={countdown}
            onReveal={onReveal}
            onReset={onReset}
          />
        </div>
      </div>

      {/* Players around the oval */}
      {players.map((player, i) => {
        const angle = n === 1 ? -Math.PI / 2 : (i / n) * 2 * Math.PI - Math.PI / 2;
        const x = Math.round(CX + ORX * Math.cos(angle) - PW / 2);
        const y = Math.round(CY + ORY * Math.sin(angle) - PH / 2);

        return (
          <div key={player.id} className="absolute" style={{ left: x, top: y, width: PW }}>
            <PlayerCard
              player={player}
              voted={state.voted_player_ids.includes(player.id)}
              revealed={state.revealed}
              cardValue={state.revealed ? state.votes[player.id] : null}
              isFacilitator={player.id === state.facilitator_id}
              avatarColor={player.id === myPlayerId ? avatarColor : player.avatar_color}
              isMe={player.id === myPlayerId}
              deck={state.deck}
              cardBack={cardBack}
              onRevote={onRevote}
              canKick={!!onKickPlayer && player.id !== myPlayerId}
              onKick={onKickPlayer ? () => onKickPlayer(player.id) : undefined}
              reaction={cardReactions[player.id]}
            />
          </div>
        );
      })}
    </div>
  );
}

function TableCenter({
  state,
  stats,
  isFacilitator,
  canReveal,
  everyoneVoted,
  countdown,
  onReveal,
  onReset,
}: {
  state: RoomState;
  stats: Stats | null;
  isFacilitator: boolean;
  canReveal: boolean;
  everyoneVoted: boolean;
  countdown: number | null;
  onReveal: () => void;
  onReset: () => void;
}) {
  if (countdown !== null) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="text-green-200/60 text-xs">Revealing in…</div>
        <div
          key={countdown}
          className="text-6xl font-bold text-white"
          style={{ animation: "countdownPop 0.3s ease-out", textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
        >
          {countdown}
        </div>
      </div>
    );
  }

  if (state.revealed && stats) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-5">
          {state.deck_type !== "tshirt" && (
            <div>
              <div className="text-green-300/70 text-xs">Average</div>
              <div className="text-3xl font-bold text-white" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
                {stats.average ?? "—"}
              </div>
            </div>
          )}
          <div>
            <div className="text-green-300/70 text-xs">{stats.consensus ? "Consensus" : "No consensus"}</div>
            <div className="text-3xl">{stats.consensus ? "😎" : "🤔"}</div>
          </div>
        </div>
        {canReveal && (
          <button
            onClick={onReset}
            className="mt-1 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold px-6 py-2 rounded-full transition-colors"
          >
            New round
          </button>
        )}
      </div>
    );
  }

  if (everyoneVoted) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="text-green-300/70 text-sm">All voted!</div>
        {canReveal && (
          <button
            onClick={onReveal}
            className="bg-white/20 hover:bg-white/30 text-white text-base font-semibold px-7 py-2.5 rounded-full transition-colors"
          >
            Reveal cards
          </button>
        )}
      </div>
    );
  }

  const total = state.players.filter((p) => !p.is_spectator).length;
  const voted = state.voted_player_ids.length;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-white/40 text-4xl font-bold">
        {voted}/{total}
      </div>
      <div className="text-green-300/60 text-xs">voted</div>
      {canReveal && voted > 0 && (
        <button
          onClick={onReveal}
          className="mt-1 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors"
        >
          Reveal early
        </button>
      )}
    </div>
  );
}

// ─── ActionBox (mobile / fallback) ───────────────────────────────────────────

function ActionBox({
  state,
  stats,
  isFacilitator,
  canReveal,
  everyoneVoted,
  countdown,
  onReveal,
  onReset,
}: {
  state: RoomState;
  stats: Stats | null;
  isFacilitator: boolean;
  canReveal: boolean;
  everyoneVoted: boolean;
  countdown: number | null;
  onReveal: () => void;
  onReset: () => void;
}) {
  if (countdown !== null) {
    return (
      <div className="bg-[var(--c-panel)] rounded-2xl px-8 py-8 w-full max-w-2xl flex flex-col items-center gap-2">
        <div className="text-slate-400 text-sm">Revealing in…</div>
        <div
          key={countdown}
          className="text-8xl font-bold text-white"
          style={{ animation: "countdownPop 0.3s ease-out" }}
        >
          {countdown}
        </div>
      </div>
    );
  }

  if (state.revealed) {
    return (
      <div className="bg-[var(--c-panel)] rounded-2xl px-8 py-6 w-full max-w-2xl flex flex-wrap justify-center items-center gap-8">
        {stats && (
          <>
            {state.deck_type !== "tshirt" && (
              <>
                <div className="text-center">
                  <div className="text-xs text-slate-400 mb-1">Average</div>
                  <div className="text-4xl font-bold">{stats.average ?? "—"}</div>
                </div>
                <div className="w-px h-12 bg-[var(--c-border)]" />
              </>
            )}
            <div className="text-center">
              <div className="text-xs text-slate-400 mb-1">Agreement</div>
              <div className="text-4xl">{stats.consensus ? "😎" : "🤔"}</div>
            </div>
            <div className="w-px h-12 bg-[var(--c-border)]" />
            <div className="text-center">
              <div className="text-xs text-slate-400 mb-1">Votes</div>
              <div className="text-4xl font-bold">{stats.total_votes}</div>
            </div>
          </>
        )}
        {canReveal && (
          <button
            onClick={onReset}
            className="bg-[var(--c-panel2)] hover:bg-[var(--c-border)] border border-[var(--c-border-hi)] text-slate-200 px-8 py-3 rounded-xl font-semibold text-lg transition-colors"
          >
            New round
          </button>
        )}
      </div>
    );
  }

  if (everyoneVoted) {
    return (
      <div className="bg-[var(--c-panel)] rounded-2xl px-8 py-8 w-full max-w-2xl flex flex-col items-center gap-3">
        <div className="text-7xl font-bold text-[var(--c-dim)]">{state.voted_player_ids.length}</div>
        <p className="text-slate-400">
          All voted!{" "}
          {canReveal && (
            <button onClick={onReveal} className="text-accent hover:underline font-semibold text-lg">
              Reveal cards
            </button>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--c-panel)] rounded-2xl px-8 py-8 w-full max-w-2xl flex items-center justify-center min-h-[100px]">
      {canReveal ? (
        <button
          onClick={onReveal}
          disabled={state.voted_player_ids.length === 0}
          className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-accent-fg px-10 py-4 rounded-xl font-semibold text-xl transition-colors"
        >
          Reveal cards
        </button>
      ) : (
        <p className="text-slate-300 text-lg font-medium">Pick your cards!</p>
      )}
    </div>
  );
}

// ─── Player Card ──────────────────────────────────────────────────────────────

function PlayerCard({
  player,
  voted,
  revealed,
  cardValue,
  isFacilitator,
  avatarColor,
  isMe,
  deck,
  cardBack,
  onRevote,
  canKick,
  onKick,
  reaction,
}: {
  player: Player;
  voted: boolean;
  revealed: boolean;
  cardValue: string | null;
  isFacilitator: boolean;
  avatarColor: string;
  isMe?: boolean;
  deck?: string[];
  cardBack?: string;
  onRevote?: (card: string) => void;
  canKick?: boolean;
  onKick?: () => void;
  // Issue #32 — most recent reaction this player has fired; shown as a
  // pop-in overlay above the card for REACTION_OVERLAY_MS. Parent (RoomPage)
  // owns the timer.
  reaction?: CardReaction | null;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const bgColor = avatarColor || "#3a4f6a";
  const canEdit = isMe && revealed && !!onRevote;
  const cardBackStyle = voted && !revealed
    ? (CARD_BACKS.find((b) => b.id === cardBack) ?? CARD_BACKS[0]).style
    : {};

  return (
    <div
      data-testid="player-card"
      data-player-nickname={player.nickname}
      className={`flex flex-col items-center gap-1.5 group ${!player.connected ? "opacity-40" : ""}`}
    >
      {/* Name pill above the card. Replaces the previous letter-avatar circle:
          the avatar color is preserved as the pill background so the player's
          color identity stays visible. */}
      <div
        data-testid="player-name-pill"
        className="px-2 py-0.5 rounded-full text-xs font-semibold max-w-[88px] truncate text-center shadow-sm"
        style={{ backgroundColor: bgColor, color: pickContrastTextColor(bgColor) }}
        title={player.nickname}
      >
        {player.nickname}
      </div>

      {/* Card with optional edit/kick buttons */}
      <div className="relative">
        <div
          className={`w-14 h-20 rounded-xl border-2 flex items-center justify-center font-bold text-lg transition-all ${
            !voted
              ? "bg-[var(--c-panel)] border-[var(--c-border-hi)]"
              : revealed
              ? "bg-[var(--c-panel)] border-accent text-white"
              : "border-accent"
          }`}
          style={cardBackStyle}
        >
          {revealed && cardValue && cardValue !== "hidden" ? cardValue : null}
          {player.is_spectator && !voted && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-slate-400 opacity-70">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
            </svg>
          )}
          {/* Issue #32 — reaction overlay above the card (centered, pop-in). */}
          {reaction && (
            <div
              data-testid="reaction-overlay"
              data-reaction-value={reaction.value}
              data-reaction-kind={reaction.kind}
              // Emoji glyph stays centred above the card; number pill
              // sits to the right of the card, vertically centred against
              // the card itself (not the name pill above) — keeps it
              // away from the centred name pill entirely.
              className={`absolute pointer-events-none reactions-overlay-pop ${
                reaction.kind === "emoji"
                  ? "-top-7 left-1/2 -translate-x-1/2 text-3xl"
                  : "top-1/2 -translate-y-1/2 left-full ml-1 text-xs font-bold bg-accent text-accent-fg rounded-full px-2.5 py-0.5 shadow-md ring-1 ring-white/30 whitespace-nowrap"
              }`}
            >
              {reaction.value}
            </div>
          )}
        </div>

        {/* Edit pencil icon */}
        {canEdit && (
          <button
            onClick={() => setShowPicker(true)}
            className="absolute -top-2 -left-2 w-6 h-6 bg-accent hover:bg-accent-hover rounded-full flex items-center justify-center shadow-lg transition-colors"
            title="Change your vote"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="white">
              <path d="M8.5 1.5a1.5 1.5 0 0 1 2 2L3.5 10.5 1 11l.5-2.5L8.5 1.5z"/>
            </svg>
          </button>
        )}

        {/* Kick button (facilitator only, on hover) */}
        {canKick && onKick && (
          <button
            onClick={onKick}
            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center shadow-lg transition-all opacity-0 group-hover:opacity-100"
            title="Remove from room"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2l6 6M8 2l-6 6" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Status badges under the card. The duplicate name caption was removed —
          the name now lives in the pill above the card (see issue #7). */}
      {isFacilitator && <span className="text-xs text-accent/70">host</span>}
      {player.is_spectator && <span className="text-xs text-slate-500">spectator</span>}
      {!player.connected && <span className="text-xs text-slate-500">offline</span>}

      {/* Revote picker */}
      {showPicker && deck && onRevote && (
        <RevotePicker
          deck={deck}
          current={cardValue}
          onSelect={(v) => { onRevote(v); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ─── Revote Picker ────────────────────────────────────────────────────────────

function RevotePicker({
  deck,
  current,
  onSelect,
  onClose,
}: {
  deck: string[];
  current: string | null;
  onSelect: (v: string) => void;
  onClose: () => void;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        ref={ref}
        className="bg-[var(--c-panel)] border border-[var(--c-border)] rounded-2xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-slate-400 mb-3 text-center">Change your vote</p>
        <div className="grid grid-cols-4 gap-2">
          {deck.map((v) => (
            <button
              key={v}
              onClick={() => onSelect(v)}
              className={`w-14 h-20 rounded-xl border-2 font-bold text-lg transition-all ${
                v === current
                  ? "bg-accent border-accent text-accent-fg scale-105"
                  : "bg-[var(--c-panel2)] border-[var(--c-border)] text-slate-300 hover:border-accent hover:scale-105"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Error Screen ─────────────────────────────────────────────────────────────

function RoomErrorScreen({ error }: { error: string }) {
  const navigate = useNavigate();
  const isNotFound = error === "Room not found";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--c-bg)] p-4">
      <div className="bg-[var(--c-panel)] rounded-2xl shadow-xl p-10 w-full max-w-md text-center">
        <div className="text-5xl mb-4">{isNotFound ? "🔗" : "⚠️"}</div>
        <h2 className="text-xl font-bold text-white mb-2">
          {isNotFound ? "Link is no longer valid" : "Something went wrong"}
        </h2>
        <p className="text-slate-400 text-sm mb-6">
          {isNotFound
            ? "This game session has ended or the link is incorrect. Games are not persisted between server restarts."
            : error}
        </p>
        <button
          onClick={() => navigate("/")}
          className="w-full bg-accent hover:bg-accent-hover text-accent-fg font-semibold py-3 rounded-xl transition-colors"
        >
          Create a new game
        </button>
      </div>
    </div>
  );
}

// ─── Voting Card ──────────────────────────────────────────────────────────────

function VotingCard({
  value,
  selected,
  onClick,
}: {
  value: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-14 h-20 rounded-xl border-2 font-bold text-lg transition-all shrink-0 ${
        selected
          ? "bg-accent border-accent text-accent-fg -translate-y-3 shadow-lg shadow-accent/40"
          : "bg-[var(--c-panel)] border-[var(--c-border)] text-slate-300 hover:border-accent hover:-translate-y-1"
      }`}
    >
      {value}
    </button>
  );
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({ onClose }: { onClose: () => void }) {
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
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--c-panel)] rounded-2xl p-8 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Invite players</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">
            ✕
          </button>
        </div>

        <label className="text-xs text-slate-400 mb-1 block">Game's url</label>
        <input
          readOnly
          value={url}
          className="w-full bg-[var(--c-bg)] border border-[var(--c-border-hi)] rounded-lg px-3 py-2.5 text-sm text-slate-300 mb-4 focus:outline-none"
          onFocus={(e) => e.target.select()}
        />

        <button
          onClick={copy}
          className="w-full bg-accent hover:bg-accent-hover text-accent-fg font-semibold py-3 rounded-xl transition-colors mb-3"
        >
          {copied ? "✓ Copied!" : "Copy invitation link"}
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
