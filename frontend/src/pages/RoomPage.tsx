import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { useTheme } from "../hooks/useTheme";
import { useSettings } from "../hooks/useSettings";
import { IssueSidebar } from "../components/IssueSidebar";
import { GameSettingsModal } from "../components/GameSettingsModal";
import { ProfileMenu } from "../components/ProfileMenu";
import type { Player, RoomState, Stats, GameSettings } from "../types";
import QRCode from "qrcode";

// Avatar colors stored per-user
const AVATAR_COLORS = ["#3b82f6","#8b5cf6","#ec4899","#ef4444","#f97316","#eab308","#22c55e","#06b6d4"];
function getAvatarColor() {
  return localStorage.getItem("pp:avatar-color") || AVATAR_COLORS[0];
}
function setAvatarColor(c: string) {
  localStorage.setItem("pp:avatar-color", c);
}

export default function RoomPage() {
  const { roomId = "" } = useParams();
  const storedPlayerId = localStorage.getItem(`pp:${roomId}:player_id`);
  const storedNick = localStorage.getItem(`pp:${roomId}:nickname`);

  const [nickname, setNickname] = useState(storedNick || "");
  const [isSpectator, setIsSpectator] = useState(false);
  // Show join modal unless we already have a nickname stored
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#1a2332]">
      <div className="bg-[#243447] rounded-2xl shadow-xl p-8 w-full max-w-md">
        <h2 className="text-xl font-bold mb-2 text-white">Choose your display name</h2>
        <p className="text-slate-400 text-sm mb-6">Room: {roomId}</p>

        {/* Avatar preview */}
        <div className="flex justify-center mb-5">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white"
            style={{ backgroundColor: avatarColor }}
          >
            {nick[0]?.toUpperCase() ?? "?"}
          </div>
        </div>

        <div className="relative mb-4">
          <label className="absolute -top-2 left-3 bg-[#243447] px-1 text-xs text-slate-400">
            Your display name
          </label>
          <input
            className="w-full bg-transparent border border-[#4a6a8a] rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nick.trim()) onJoin(nick.trim(), spectator);
            }}
            placeholder="Alice"
            autoFocus
          />
        </div>

        {/* Spectator toggle */}
        <label className="flex items-center gap-3 mb-6 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only"
              checked={spectator}
              onChange={(e) => setSpectator(e.target.checked)}
            />
            <div
              className={`w-11 h-6 rounded-full transition-colors ${spectator ? "bg-blue-600" : "bg-[#3a4f6a]"}`}
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
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-colors"
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
  isSpectator,
}: {
  roomId: string;
  nickname: string;
  storedPlayerId: string | null;
  isSpectator: boolean;
}) {
  const { state, stats, myPlayerId, connected, send, error } = useRoomSocket({
    roomId,
    playerId: storedPlayerId,
    nickname,
  });
  const { theme, setTheme } = useTheme();
  const { settings, setSettings } = useSettings();

  const [localVote, setLocalVote] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showGameSettings, setShowGameSettings] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [avatarColor, setAvatarColorState] = useState(getAvatarColor);
  const [currentNickname, setCurrentNickname] = useState(nickname);
  const prevRevealedRef = useRef(false);
  const countdownRef = useRef<number | null>(null);

  // Reset localVote when a new round starts
  useEffect(() => {
    if (state) {
      if (prevRevealedRef.current && !state.revealed) {
        setLocalVote(null);
        setCountdown(null);
      }
      prevRevealedRef.current = state.revealed;
    }
  }, [state?.revealed]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (settings.showCountdown) {
      setCountdown(3);
      let n = 3;
      const tick = () => {
        n--;
        if (n > 0) {
          setCountdown(n);
          countdownRef.current = window.setTimeout(tick, 1000);
        } else {
          setCountdown(null);
          send({ type: "reveal" });
        }
      };
      countdownRef.current = window.setTimeout(tick, 1000);
    } else {
      send({ type: "reveal" });
    }
  }

  function handleAvatarColorChange(color: string) {
    setAvatarColor(color);
    setAvatarColorState(color);
  }

  function handleNicknameChange(name: string) {
    setCurrentNickname(name);
    localStorage.setItem(`pp:${roomId}:nickname`, name);
    send({ type: "update_nickname", nickname: name });
  }

  function handleGameSettingsSave(
    roomPatch: { name?: string; deck_type?: string },
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

  if (!state || !myPlayerId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a2332]">
        <div className="text-slate-400">Connecting…</div>
      </div>
    );
  }

  const me = state.players.find((p) => p.id === myPlayerId);
  const isFacilitator = state.facilitator_id === myPlayerId;
  const currentIssue = state.issues.find((i) => i.id === state.current_issue_id);
  const activePlayers = state.players.filter((p) => !p.is_spectator);
  const everyoneVoted =
    activePlayers.length > 0 &&
    activePlayers.every((p) => state.voted_player_ids.includes(p.id));
  const onlyMe = state.players.filter((p) => p.connected).length <= 1;
  const facilitator = state.players.find((p) => p.id === state.facilitator_id);

  return (
    <div className="min-h-screen flex flex-col bg-[#1a2332] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[#2a3a52] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-base shrink-0">
            🃏
          </div>
          <button
            onClick={() => setShowGameSettings(true)}
            className="font-semibold text-white hover:text-blue-300 transition-colors"
          >
            {state.name}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-amber-500"}`} />

          {/* Profile avatar — click to open profile menu */}
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu((o) => !o)}
              className="flex items-center gap-1.5 bg-[#243447] rounded-full px-3 py-1.5 hover:bg-[#2a3a52] transition-colors"
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: avatarColor }}
              >
                {(me?.nickname ?? currentNickname ?? "?")[0].toUpperCase()}
              </div>
              <span className="text-sm text-slate-300">{me?.nickname ?? currentNickname}</span>
            </button>
            {showProfileMenu && (
              <ProfileMenu
                nickname={me?.nickname ?? currentNickname}
                avatarColor={avatarColor}
                theme={theme}
                onNicknameChange={handleNicknameChange}
                onAvatarColorChange={handleAvatarColorChange}
                onThemeChange={setTheme}
                onClose={() => setShowProfileMenu(false)}
              />
            )}
          </div>

          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 border border-blue-500 text-blue-400 px-4 py-1.5 rounded-lg hover:bg-blue-500/10 text-sm font-medium transition-colors"
          >
            👥 Invite players
          </button>

          <button
            onClick={() => setSidebarOpen((o) => !o)}
            title="Toggle issues sidebar"
            className={`p-2 rounded-lg border transition-colors ${
              sidebarOpen
                ? "border-blue-500 text-blue-400 bg-blue-500/10"
                : "border-[#3a4f6a] text-slate-400 hover:bg-[#2a3a52]"
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
        <main className="flex-1 flex flex-col items-center p-6 gap-5 overflow-y-auto">
          {onlyMe && (
            <p className="text-slate-400 text-sm">
              Feeling lonely? 🤙{" "}
              <button onClick={() => setShowInvite(true)} className="text-blue-400 hover:underline">
                Invite players
              </button>
            </p>
          )}

          <ActionBox
            state={state}
            stats={stats}
            isFacilitator={isFacilitator}
            everyoneVoted={everyoneVoted}
            countdown={countdown}
            showAverage={settings.showAverage}
            onReveal={triggerReveal}
            onReset={() => send({ type: "reset" })}
          />

          {/* Player cards */}
          <div className="flex flex-wrap justify-center gap-8">
            {state.players.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                voted={state.voted_player_ids.includes(player.id)}
                revealed={state.revealed}
                cardValue={state.revealed ? state.votes[player.id] : null}
                isFacilitator={player.id === state.facilitator_id}
                avatarColor={player.id === myPlayerId ? avatarColor : undefined}
              />
            ))}
          </div>

          {/* Bottom: card picker or set estimate */}
          <div className="mt-auto w-full pt-4">
            {!state.revealed && !me?.is_spectator && countdown === null && (
              <div className="text-center">
                <p className="text-slate-400 text-sm mb-3">Choose your card 👇</p>
                <div className="flex justify-center gap-2 flex-wrap">
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
            {state.revealed && isFacilitator && currentIssue && (
              <div className="text-center">
                <p className="text-slate-400 text-sm mb-3">Set final estimate for this issue:</p>
                <div className="flex justify-center gap-2 flex-wrap">
                  {state.deck.map((v) => (
                    <button
                      key={v}
                      onClick={() =>
                        send({ type: "set_estimate", issue_id: currentIssue.id, estimate: v })
                      }
                      className={`w-12 h-16 rounded-xl border-2 font-bold text-base transition-all ${
                        currentIssue.final_estimate === v
                          ? "bg-blue-600 border-blue-400 text-white"
                          : "bg-[#243447] border-[#3a4f6a] text-slate-300 hover:border-blue-500"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>

        {sidebarOpen && (
          <aside className="w-80 border-l border-[#2a3a52] overflow-y-auto shrink-0">
            <IssueSidebar
              state={state}
              isFacilitator={isFacilitator}
              myPlayerId={myPlayerId}
              send={send}
              onClose={() => setSidebarOpen(false)}
            />
          </aside>
        )}
      </div>

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

function ActionBox({
  state,
  stats,
  isFacilitator,
  everyoneVoted,
  countdown,
  showAverage,
  onReveal,
  onReset,
}: {
  state: RoomState;
  stats: Stats | null;
  isFacilitator: boolean;
  everyoneVoted: boolean;
  countdown: number | null;
  showAverage: boolean;
  onReveal: () => void;
  onReset: () => void;
}) {
  // Countdown display
  if (countdown !== null) {
    return (
      <div className="bg-[#243447] rounded-2xl px-8 py-8 w-full max-w-2xl flex flex-col items-center gap-2">
        <div className="text-slate-400 text-sm">Revealing in…</div>
        <div
          key={countdown}
          className="text-8xl font-bold text-white animate-ping-once"
          style={{ animation: "countdownPop 0.3s ease-out" }}
        >
          {countdown}
        </div>
      </div>
    );
  }

  if (state.revealed) {
    return (
      <div className="bg-[#243447] rounded-2xl px-8 py-6 w-full max-w-2xl flex flex-wrap justify-center items-center gap-8">
        {stats && (
          <>
            {showAverage && (
              <div className="text-center">
                <div className="text-xs text-slate-400 mb-1">Average</div>
                <div className="text-4xl font-bold">{stats.average ?? "—"}</div>
              </div>
            )}
            {showAverage && <div className="w-px h-12 bg-[#3a4f6a]" />}
            <div className="text-center">
              <div className="text-xs text-slate-400 mb-1">Agreement</div>
              <div className="text-4xl">{stats.consensus ? "😎" : "🤔"}</div>
            </div>
            <div className="w-px h-12 bg-[#3a4f6a]" />
            <div className="text-center">
              <div className="text-xs text-slate-400 mb-1">Votes</div>
              <div className="text-4xl font-bold">{stats.total_votes}</div>
            </div>
          </>
        )}
        {isFacilitator && (
          <button
            onClick={onReset}
            className="bg-[#2a3a52] hover:bg-[#354d6a] border border-[#4a6a8a] text-slate-200 px-6 py-2.5 rounded-xl font-semibold transition-colors"
          >
            Start new voting
          </button>
        )}
      </div>
    );
  }

  if (everyoneVoted) {
    return (
      <div className="bg-[#243447] rounded-2xl px-8 py-8 w-full max-w-2xl flex flex-col items-center gap-3">
        <div className="text-7xl font-bold text-[#2a3a52]">
          {state.voted_player_ids.length}
        </div>
        <p className="text-slate-400">
          All voted!{" "}
          {isFacilitator && (
            <button onClick={onReveal} className="text-blue-400 hover:underline font-medium">
              Reveal cards
            </button>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#243447] rounded-2xl px-8 py-8 w-full max-w-2xl flex items-center justify-center min-h-[100px]">
      {isFacilitator ? (
        <button
          onClick={onReveal}
          disabled={state.voted_player_ids.length === 0}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-8 py-3 rounded-xl font-semibold text-lg transition-colors"
        >
          Reveal cards
        </button>
      ) : (
        <p className="text-slate-300 text-lg font-medium">Pick your cards!</p>
      )}
    </div>
  );
}

function PlayerCard({
  player,
  voted,
  revealed,
  cardValue,
  isFacilitator,
  avatarColor,
}: {
  player: Player;
  voted: boolean;
  revealed: boolean;
  cardValue: string | null;
  isFacilitator: boolean;
  avatarColor?: string;
}) {
  const bgColor = avatarColor || (isFacilitator ? "#3b82f6" : "#3a4f6a");

  return (
    <div className={`flex flex-col items-center gap-2 ${!player.connected ? "opacity-40" : ""}`}>
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
        style={{ backgroundColor: bgColor }}
      >
        {player.nickname[0]?.toUpperCase() ?? "?"}
      </div>
      <div
        className={`w-16 h-24 rounded-xl border-2 flex items-center justify-center font-bold text-xl transition-all ${
          !voted
            ? "bg-[#243447] border-[#3a4f6a]"
            : revealed
            ? "bg-[#243447] border-blue-400 text-white"
            : "border-blue-400"
        }`}
        style={
          voted && !revealed
            ? {
                background:
                  "repeating-linear-gradient(45deg, #2563eb, #2563eb 8px, #1d4ed8 8px, #1d4ed8 16px)",
              }
            : {}
        }
      >
        {revealed && cardValue && cardValue !== "hidden" ? cardValue : null}
      </div>
      <span className="text-sm text-slate-300 max-w-[72px] truncate text-center">
        {player.nickname}
      </span>
      {!player.connected && <span className="text-xs text-slate-500">offline</span>}
    </div>
  );
}

function RoomErrorScreen({ error }: { error: string }) {
  const navigate = useNavigate();
  const isNotFound = error === "Room not found";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a2332] p-4">
      <div className="bg-[#243447] rounded-2xl shadow-xl p-10 w-full max-w-md text-center">
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
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          Create a new game
        </button>
      </div>
    </div>
  );
}

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
      className={`w-14 h-20 rounded-xl border-2 font-bold text-lg transition-all ${
        selected
          ? "bg-blue-600 border-blue-400 text-white -translate-y-3 shadow-lg shadow-blue-900/50"
          : "bg-[#243447] border-[#3a4f6a] text-slate-300 hover:border-blue-500 hover:-translate-y-1"
      }`}
    >
      {value}
    </button>
  );
}

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
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#243447] rounded-2xl p-8 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Invite players</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">
            ✕
          </button>
        </div>

        <label className="text-xs text-slate-400 mb-1 block">Game's url</label>
        <input
          readOnly
          value={url}
          className="w-full bg-[#1a2332] border border-[#4a6a8a] rounded-lg px-3 py-2.5 text-sm text-slate-300 mb-4 focus:outline-none"
          onFocus={(e) => e.target.select()}
        />

        <button
          onClick={copy}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors mb-3"
        >
          {copied ? "✓ Copied!" : "Copy invitation link"}
        </button>

        <button
          onClick={() => setShowQR((v) => !v)}
          className="w-full border border-[#3a4f6a] text-slate-300 hover:bg-[#2a3a52] py-2.5 rounded-xl text-sm transition-colors"
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
