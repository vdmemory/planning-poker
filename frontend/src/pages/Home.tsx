import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DeckType } from "../types";

export default function Home() {
  const navigate = useNavigate();
  const [gameName, setGameName] = useState("");
  const [deckType, setDeckType] = useState<DeckType>("fibonacci");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createRoom() {
    if (!gameName.trim()) {
      setError("Enter a game name");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const apiBase = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${apiBase}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: gameName,
          deck_type: deckType,
          facilitator_nickname: gameName,
        }),
      });
      if (!res.ok) throw new Error("Failed to create room");
      const data = await res.json();
      localStorage.setItem(`pp:${data.room_id}:player_id`, data.player_id);
      // Nickname is set in the room join modal — don't store it yet
      navigate(`/room/${data.room_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--c-bg)]">
      <header className="flex items-center gap-3 px-6 py-4">
        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-lg">🚀</div>
        <span className="font-bold text-white text-lg">Create game</span>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-4">
          <div className="relative">
            <label className="absolute -top-2 left-3 bg-[var(--c-bg)] px-1 text-xs text-slate-400">
              Game's name
            </label>
            <input
              className="w-full bg-transparent border border-[var(--c-border-hi)] rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createRoom()}
              placeholder="Sprint 42 Planning"
              autoFocus
            />
          </div>

          <div className="relative">
            <label className="absolute -top-2 left-3 bg-[var(--c-bg)] px-1 text-xs text-slate-400">
              Voting system
            </label>
            <select
              className="w-full bg-[var(--c-bg)] border border-[var(--c-border-hi)] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 appearance-none"
              value={deckType}
              onChange={(e) => setDeckType(e.target.value as DeckType)}
            >
              <option value="fibonacci">Fibonacci ( 0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, ?, ☕ )</option>
              <option value="tshirt">T-shirt ( XS, S, M, L, XL, XXL, ? )</option>
            </select>
          </div>

          {error && <div className="text-red-400 text-sm">{error}</div>}

          <button
            onClick={createRoom}
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-lg transition-colors"
          >
            {loading ? "Creating…" : "Create game"}
          </button>
        </div>
      </div>
    </div>
  );
}
