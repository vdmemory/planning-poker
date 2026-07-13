import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RetroTemplate } from "../types";
import { RetroTemplatePicker } from "../components/RetroTemplatePicker";

export default function RetroNewPage() {
  const navigate = useNavigate();
  const [boardName, setBoardName] = useState("");
  const [template, setTemplate] = useState<RetroTemplate>("mad_sad_glad");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createBoard() {
    if (!boardName.trim()) {
      setError("Enter a board name");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const apiBase = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${apiBase}/api/retro-boards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: boardName,
          template,
          facilitator_nickname: boardName,
        }),
      });
      if (!res.ok) throw new Error("Failed to create board");
      const data = await res.json();
      localStorage.setItem(`retro:${data.board_id}:participant_id`, data.participant_id);
      navigate(`/retro/${data.board_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--c-bg)]">
      <header className="flex items-center gap-3 px-6 py-4">
        <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center text-lg">📝</div>
        <span className="font-bold text-white text-lg">Create retro board</span>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-5">
          <div className="relative">
            <label className="absolute -top-2 left-3 bg-[var(--c-bg)] px-1 text-xs text-slate-400">
              Board's name
            </label>
            <input
              className="w-full bg-transparent border border-[var(--c-border-hi)] rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-accent"
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createBoard()}
              placeholder="Sprint 42 Retro"
              autoFocus
            />
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-2">Template</p>
            <RetroTemplatePicker value={template} onChange={setTemplate} />
          </div>

          {error && <div className="text-red-400 text-sm">{error}</div>}

          <button
            onClick={createBoard}
            disabled={loading}
            className="w-full bg-accent hover:bg-accent disabled:opacity-50 text-accent-fg font-semibold py-3 rounded-xl text-lg transition-colors"
          >
            {loading ? "Creating…" : "Create board"}
          </button>
        </div>
      </div>
    </div>
  );
}
