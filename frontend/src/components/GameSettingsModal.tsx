import { useState } from "react";
import type { RoomState, GameSettings } from "../types";

interface Props {
  state: RoomState;
  settings: GameSettings;
  isFacilitator: boolean;
  facilitatorName: string;
  onSave: (roomPatch: { name?: string; deck_type?: string }, settingsPatch: Partial<GameSettings>) => void;
  onClose: () => void;
}

export function GameSettingsModal({ state, settings, isFacilitator, facilitatorName, onSave, onClose }: Props) {
  const [name, setName] = useState(state.name);
  const [deckType, setDeckType] = useState(state.deck_type);
  const [localSettings, setLocalSettings] = useState<GameSettings>({ ...settings });

  function toggle(key: keyof GameSettings) {
    setLocalSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function save() {
    const roomPatch: { name?: string; deck_type?: string } = {};
    if (name.trim() !== state.name) roomPatch.name = name.trim();
    if (deckType !== state.deck_type) roomPatch.deck_type = deckType;
    onSave(roomPatch, localSettings);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#243447] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a4f6a]">
          <h2 className="text-lg font-semibold text-white">Game settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="px-6 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Facilitator */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Game facilitator</label>
            <div className="flex items-center gap-2 bg-[#1a2332] rounded-lg px-3 py-2.5">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold text-white">
                {facilitatorName[0]?.toUpperCase() ?? "?"}
              </div>
              <span className="text-sm text-slate-300">{facilitatorName}</span>
            </div>
          </div>

          {/* Game name */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Game's name</label>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-[#1a2332] border border-[#4a6a8a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isFacilitator}
              />
            </div>
          </div>

          {/* Voting system */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Voting system</label>
            <select
              className="w-full bg-[#1a2332] border border-[#4a6a8a] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none disabled:opacity-60"
              value={deckType}
              onChange={(e) => setDeckType(e.target.value as "fibonacci" | "tshirt")}
              disabled={!isFacilitator}
            >
              <option value="fibonacci">Fibonacci ( 0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, ?, ☕ )</option>
              <option value="tshirt">T-shirt ( XS, S, M, L, XL, XXL, ? )</option>
            </select>
          </div>

          <div className="border-t border-[#3a4f6a]" />

          {/* Who can reveal */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Who can reveal cards</label>
            <select
              className="w-full bg-[#1a2332] border border-[#4a6a8a] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none"
              value={localSettings.whoCanReveal}
              onChange={(e) => setLocalSettings((p) => ({ ...p, whoCanReveal: e.target.value as "facilitator" | "everyone" }))}
            >
              <option value="facilitator">Facilitator only</option>
              <option value="everyone">Everyone</option>
            </select>
          </div>

          {/* Who can manage issues */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Who can manage issues</label>
            <select
              className="w-full bg-[#1a2332] border border-[#4a6a8a] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none"
              value={localSettings.whoCanManageIssues}
              onChange={(e) => setLocalSettings((p) => ({ ...p, whoCanManageIssues: e.target.value as "facilitator" | "everyone" }))}
            >
              <option value="facilitator">Facilitator only</option>
              <option value="everyone">Everyone</option>
            </select>
          </div>

          <div className="border-t border-[#3a4f6a]" />

          {/* Toggles */}
          <ToggleRow
            label="Auto-reveal cards"
            description="Show cards automatically after everyone voted."
            checked={localSettings.autoReveal}
            onChange={() => toggle("autoReveal")}
          />
          <ToggleRow
            label="Enable fun features"
            description="Allow players throw projectiles to each other in this game."
            checked={localSettings.funFeatures}
            onChange={() => toggle("funFeatures")}
          />
          <ToggleRow
            label="Show average in the results"
            description="Include the average value in the results of the voting."
            checked={localSettings.showAverage}
            onChange={() => toggle("showAverage")}
          />
          <ToggleRow
            label="Show countdown animation"
            description="A countdown is shown when revealing cards to ensure last-second votes are recorded."
            checked={localSettings.showCountdown}
            onChange={() => toggle("showCountdown")}
          />
        </div>

        <div className="px-6 py-4 border-t border-[#3a4f6a]">
          <button
            onClick={save}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm text-white font-medium">{label}</div>
        <div className="text-xs text-slate-400 mt-0.5">{description}</div>
      </div>
      <button
        onClick={onChange}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors mt-0.5 ${
          checked ? "bg-blue-600" : "bg-[#3a4f6a]"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
