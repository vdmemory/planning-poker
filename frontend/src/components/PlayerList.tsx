import type { Player, RoomState } from "../types";

interface Props {
  state: RoomState;
}

export function PlayerList({ state }: Props) {
  const voted = new Set(state.voted_player_ids);

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h3 className="font-semibold mb-3">Players ({state.players.length})</h3>
      <ul className="space-y-2">
        {state.players.map((p) => (
          <PlayerRow
            key={p.id}
            player={p}
            voted={voted.has(p.id)}
            cardValue={state.revealed ? state.votes[p.id] : null}
            isFacilitator={p.id === state.facilitator_id}
          />
        ))}
      </ul>
    </div>
  );
}

interface RowProps {
  player: Player;
  voted: boolean;
  cardValue: string | null;
  isFacilitator: boolean;
}

function PlayerRow({ player, voted, cardValue, isFacilitator }: RowProps) {
  return (
    <li className="flex items-center justify-between text-sm">
      <span className={`flex items-center gap-2 ${!player.connected ? "opacity-50" : ""}`}>
        <span
          className={`w-2 h-2 rounded-full ${
            player.connected ? "bg-green-500" : "bg-slate-400"
          }`}
        />
        {player.nickname}
        {isFacilitator && (
          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 rounded">host</span>
        )}
        {player.is_spectator && (
          <span className="text-xs bg-slate-100 text-slate-600 px-1.5 rounded">spectator</span>
        )}
        {!player.connected && <span className="text-xs text-slate-400">(offline)</span>}
      </span>
      {!player.is_spectator && (
        cardValue && cardValue !== "hidden" ? (
          <span className="bg-accent text-accent-fg font-bold rounded-md px-2 py-0.5 text-xs">
            {cardValue}
          </span>
        ) : voted ? (
          <span className="text-green-600">✓</span>
        ) : (
          <span className="text-slate-300">…</span>
        )
      )}
    </li>
  );
}
