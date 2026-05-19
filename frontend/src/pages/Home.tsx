import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DeckType } from "../types";

export default function Home() {
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState("Sprint 42 Planning");
  const [nickname, setNickname] = useState("");
  const [deckType, setDeckType] = useState<DeckType>("fibonacci");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createRoom() {
    if (!nickname.trim() || !roomName.trim()) {
      setError("Fill in both fields");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: roomName,
          deck_type: deckType,
          facilitator_nickname: nickname,
        }),
      });
      if (!res.ok) throw new Error("Failed to create room");
      const data = await res.json();
      localStorage.setItem(`pp:${data.room_id}:player_id`, data.player_id);
      localStorage.setItem(`pp:${data.room_id}:nickname`, nickname);
      navigate(`/room/${data.room_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold mb-2">Planning Poker</h1>
        <p className="text-slate-500 mb-6">Create a new estimation session</p>

        <label className="block text-sm font-medium mb-1">Your nickname</label>
        <input
          className="w-full border rounded-lg px-3 py-2 mb-4"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Alice"
        />

        <label className="block text-sm font-medium mb-1">Room name</label>
        <input
          className="w-full border rounded-lg px-3 py-2 mb-4"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
        />

        <label className="block text-sm font-medium mb-1">Deck</label>
        <select
          className="w-full border rounded-lg px-3 py-2 mb-6"
          value={deckType}
          onChange={(e) => setDeckType(e.target.value as DeckType)}
        >
          <option value="fibonacci">Fibonacci (0, 1, 2, 3, 5, 8, 13, 21…)</option>
          <option value="tshirt">T-shirt (XS, S, M, L, XL, XXL)</option>
        </select>

        {error && <div className="text-red-600 text-sm mb-3">{error}</div>}

        <button
          onClick={createRoom}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg"
        >
          {loading ? "Creating…" : "Start new game"}
        </button>
      </div>
    </div>
  );
}
