import { useState } from "react";
import type { RetroBoardState } from "../types";

// Retro Board's facilitator settings — mirrors Planning Poker's
// `GameSettingsModal` shell (fixed overlay, centered card capped at
// 90dvh so header/footer stay pinned while only the body scrolls) instead
// of the small anchored dropdown the board used before. Triggered by
// clicking the board name in the header (facilitator only), same trigger
// convention as GameSettingsModal being opened from the room name.
interface Props {
  state: RetroBoardState;
  isFacilitator: boolean;
  onSave: (patch: { name?: string; anonymous_mode?: boolean; max_votes_per_person?: number }) => void;
  onClose: () => void;
}

export function RetroSettingsModal({ state, isFacilitator, onSave, onClose }: Props) {
  const [name, setName] = useState(state.name);
  const [anonymousMode, setAnonymousMode] = useState(state.anonymous_mode);
  const [maxVotes, setMaxVotes] = useState(state.max_votes_per_person);

  function save() {
    const patch: { name?: string; anonymous_mode?: boolean; max_votes_per_person?: number } = {};
    if (name.trim() && name.trim() !== state.name) patch.name = name.trim();
    if (anonymousMode !== state.anonymous_mode) patch.anonymous_mode = anonymousMode;
    if (maxVotes !== state.max_votes_per_person) patch.max_votes_per_person = maxVotes;
    onSave(patch);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[var(--c-panel)] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--c-border)] shrink-0">
          <h2 className="text-lg font-semibold text-white">Board settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="px-6 py-4 space-y-5 overflow-y-auto min-h-0 flex-1">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Board's name</label>
            <input
              className="w-full bg-[var(--c-bg)] border border-[var(--c-border-hi)] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent disabled:opacity-60"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isFacilitator}
            />
          </div>

          <div className="border-t border-[var(--c-border)]" />

          <div className={`flex items-start justify-between gap-4 ${!isFacilitator ? "opacity-60" : ""}`}>
            <div>
              <div className="text-sm text-white font-medium">Anonymous cards</div>
              <div className="text-xs text-slate-400 mt-0.5">Hide who wrote each card</div>
            </div>
            <button
              data-testid="retro-anonymous-toggle"
              onClick={() => isFacilitator && setAnonymousMode((v) => !v)}
              disabled={!isFacilitator}
              className={`relative shrink-0 w-11 h-6 rounded-full transition-colors mt-0.5 ${
                anonymousMode ? "bg-accent" : "bg-[var(--c-border)]"
              } ${!isFacilitator ? "cursor-not-allowed" : ""}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  anonymousMode ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Votes per person</label>
            <input
              data-testid="retro-max-votes-input"
              type="number"
              min={1}
              value={maxVotes}
              disabled={!isFacilitator}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 1) setMaxVotes(v);
              }}
              className="w-full bg-[var(--c-bg)] border border-[var(--c-border-hi)] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent disabled:opacity-60"
            />
          </div>
        </div>

        {isFacilitator && (
          <div className="px-6 py-4 border-t border-[var(--c-border)] shrink-0">
            <button
              onClick={save}
              className="w-full bg-accent hover:bg-accent-hover text-accent-fg font-semibold py-3 rounded-xl transition-colors"
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
