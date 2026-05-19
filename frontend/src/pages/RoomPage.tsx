import { useState } from "react";
import { useParams } from "react-router-dom";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { Card } from "../components/Card";
import { PlayerList } from "../components/PlayerList";
import { StatsPanel } from "../components/StatsPanel";
import { IssueSidebar } from "../components/IssueSidebar";

export default function RoomPage() {
  const { roomId = "" } = useParams();
  const storedPlayerId = localStorage.getItem(`pp:${roomId}:player_id`);
  const storedNick = localStorage.getItem(`pp:${roomId}:nickname`);
  const [nickname, setNickname] = useState(storedNick || "");
  const [joined, setJoined] = useState(!!storedPlayerId || !!storedNick);

  if (!joined) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <h2 className="text-xl font-bold mb-4">Join the game</h2>
          <input
            className="w-full border rounded-lg px-3 py-2 mb-4"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Your nickname"
            autoFocus
          />
          <button
            disabled={!nickname.trim()}
            onClick={() => {
              localStorage.setItem(`pp:${roomId}:nickname`, nickname);
              setJoined(true);
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium"
          >
            Join
          </button>
        </div>
      </div>
    );
  }

  return <Room roomId={roomId} nickname={nickname} storedPlayerId={storedPlayerId} />;
}

function Room({
  roomId,
  nickname,
  storedPlayerId,
}: {
  roomId: string;
  nickname: string;
  storedPlayerId: string | null;
}) {
  const { state, stats, myPlayerId, connected, send, error } = useRoomSocket({
    roomId,
    playerId: storedPlayerId,
    nickname,
  });

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (!state || !myPlayerId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Connecting…
      </div>
    );
  }

  const me = state.players.find((p) => p.id === myPlayerId);
  const isFacilitator = state.facilitator_id === myPlayerId;
  const myVote = state.votes[myPlayerId];
  const currentIssue = state.issues.find((i) => i.id === state.current_issue_id);

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{state.name}</h1>
            <p className="text-sm text-slate-500">
              {me?.nickname} {isFacilitator && "(host)"} ·{" "}
              <span className={connected ? "text-green-600" : "text-amber-600"}>
                {connected ? "connected" : "reconnecting…"}
              </span>
            </p>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
            }}
            className="bg-white border hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium"
          >
            📋 Copy invite link
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
          {/* Main */}
          <div className="space-y-4">
            {/* Current issue */}
            <div className="bg-white rounded-xl shadow p-5">
              <div className="text-xs uppercase text-slate-500 mb-1">Currently estimating</div>
              <div className="text-xl font-semibold">
                {currentIssue?.title || "No issue selected"}
              </div>
            </div>

            {/* Cards or Stats */}
            {state.revealed && stats ? (
              <>
                <StatsPanel stats={stats} />
                {isFacilitator && currentIssue && (
                  <SetEstimateBar
                    deck={state.deck}
                    onSet={(v) =>
                      send({
                        type: "set_estimate",
                        issue_id: currentIssue.id,
                        estimate: v,
                      })
                    }
                  />
                )}
              </>
            ) : (
              <div className="bg-white rounded-xl shadow p-5">
                <div className="text-sm text-slate-600 mb-3">
                  {me?.is_spectator
                    ? "You're spectating"
                    : "Pick a card"}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {state.deck.map((value) => (
                    <Card
                      key={value}
                      value={value}
                      selected={myVote === value}
                      disabled={me?.is_spectator || state.revealed}
                      onClick={() => send({ type: "vote", card: value })}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Facilitator controls */}
            {isFacilitator && (
              <div className="flex gap-2">
                {!state.revealed ? (
                  <button
                    onClick={() => send({ type: "reveal" })}
                    disabled={state.voted_player_ids.length === 0}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium px-5 py-2 rounded-lg"
                  >
                    Reveal cards
                  </button>
                ) : (
                  <button
                    onClick={() => send({ type: "reset" })}
                    className="bg-slate-700 hover:bg-slate-800 text-white font-medium px-5 py-2 rounded-lg"
                  >
                    New round
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <PlayerList state={state} />
            <IssueSidebar state={state} isFacilitator={isFacilitator} send={send} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SetEstimateBar({
  deck,
  onSet,
}: {
  deck: string[];
  onSet: (v: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <div className="text-sm text-slate-600 mb-2">Set final estimate for this issue:</div>
      <div className="flex gap-1.5 flex-wrap">
        {deck.map((v) => (
          <button
            key={v}
            onClick={() => onSet(v)}
            className="px-3 py-1.5 border rounded-lg hover:bg-blue-50 hover:border-blue-400 text-sm font-medium"
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
