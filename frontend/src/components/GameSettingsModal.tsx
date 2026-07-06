import React, { useState, useRef, useEffect } from "react";
import type { RoomState, GameSettings, DeckType } from "../types";
import { DeckPicker } from "./DeckPicker";

interface Props {
  state: RoomState;
  settings: GameSettings;
  isFacilitator: boolean;
  facilitatorName: string;
  onSave: (
    roomPatch: {
      name?: string;
      deck_type?: string;
      card_back?: string;
      who_can_reveal?: string;
      who_can_manage_issues?: string;
      close_on_facilitator_leave?: boolean;
      fun_features_enabled?: boolean;
    },
    settingsPatch: Partial<GameSettings>,
  ) => void;
  onClose: () => void;
}

export function GameSettingsModal({ state, settings, isFacilitator, facilitatorName, onSave, onClose }: Props) {
  const [name, setName] = useState(state.name);
  const [deckType, setDeckType] = useState(state.deck_type);
  const [cardBack, setCardBack] = useState(state.card_back ?? "blue_stripes");
  const [whoCanReveal, setWhoCanReveal] = useState(state.who_can_reveal ?? "facilitator");
  const [whoCanManageIssues, setWhoCanManageIssues] = useState(state.who_can_manage_issues ?? "facilitator");
  // Issue #19 — opt-in: when the facilitator leaves, close the room for
  // everyone instead of handing the role to the next player. Facilitator-
  // only; default false so existing rooms keep handoff behaviour.
  const [closeOnFacilitatorLeave, setCloseOnFacilitatorLeave] = useState(
    state.close_on_facilitator_leave ?? false,
  );
  // Issue #51 — room-wide opt-in for the "throw a reaction at another
  // player" hover panel on PlayerCard. Unlike autoReveal (a local per-client
  // preference in `settings`), this is a room policy broadcast to everyone,
  // so it lives on `state`/roomPatch like the toggle above.
  const [funFeaturesEnabled, setFunFeaturesEnabled] = useState(
    state.fun_features_enabled ?? false,
  );
  const [localSettings, setLocalSettings] = useState<GameSettings>({ ...settings });

  function toggle(key: keyof GameSettings) {
    setLocalSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function save() {
    const roomPatch: {
      name?: string;
      deck_type?: string;
      card_back?: string;
      who_can_reveal?: string;
      who_can_manage_issues?: string;
      close_on_facilitator_leave?: boolean;
      fun_features_enabled?: boolean;
    } = {};
    if (name.trim() !== state.name) roomPatch.name = name.trim();
    if (deckType !== state.deck_type) roomPatch.deck_type = deckType;
    if (cardBack !== state.card_back) roomPatch.card_back = cardBack;
    if (whoCanReveal !== state.who_can_reveal) roomPatch.who_can_reveal = whoCanReveal;
    if (whoCanManageIssues !== state.who_can_manage_issues) roomPatch.who_can_manage_issues = whoCanManageIssues;
    if (closeOnFacilitatorLeave !== state.close_on_facilitator_leave) {
      roomPatch.close_on_facilitator_leave = closeOnFacilitatorLeave;
    }
    if (funFeaturesEnabled !== state.fun_features_enabled) {
      roomPatch.fun_features_enabled = funFeaturesEnabled;
    }
    onSave(roomPatch, localSettings);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--c-panel)] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden
                   flex flex-col max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — fixed, doesn't scroll with the body */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--c-border)] shrink-0">
          <h2 className="text-lg font-semibold text-white">Game settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Issue #23 — the modal itself is capped at 90dvh (dvh accounts for
            mobile browser chrome / the iOS keyboard, unlike vh) and laid out
            as a column so only this body scrolls; header and save button
            stay pinned instead of getting pushed off-screen on short
            viewports. min-h-0 lets a flex child actually shrink to scroll. */}
        <div className="px-6 py-4 space-y-5 overflow-y-auto min-h-0 flex-1">
          {/* Facilitator */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Game facilitator</label>
            <div className="flex items-center gap-2 bg-[var(--c-bg)] rounded-lg px-3 py-2.5">
              <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center text-xs font-bold text-accent-fg">
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
                className="flex-1 bg-[var(--c-bg)] border border-[var(--c-border-hi)] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isFacilitator}
              />
            </div>
          </div>

          {/* Voting system — facilitator only */}
          {isFacilitator && (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Voting system</label>
              <DeckPicker value={deckType} onChange={setDeckType} />
            </div>
          )}

          <div className="border-t border-[var(--c-border)]" />

          {/* Who can reveal */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Who can reveal cards</label>
            <CustomSelect
              value={whoCanReveal}
              onChange={(v) => setWhoCanReveal(v as "facilitator" | "everyone")}
              options={[
                { value: "facilitator", label: "Facilitator only" },
                { value: "everyone", label: "Everyone" },
              ]}
              disabled={!isFacilitator}
            />
          </div>

          {/* Who can manage issues */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Who can manage issues</label>
            <CustomSelect
              value={whoCanManageIssues}
              onChange={(v) => setWhoCanManageIssues(v as "facilitator" | "everyone")}
              options={[
                { value: "facilitator", label: "Facilitator only" },
                { value: "everyone", label: "Everyone" },
              ]}
              disabled={!isFacilitator}
            />
          </div>

          {/* Issue #19 — facilitator-only opt-in: when the facilitator
              leaves, close the room for everyone (instead of handing the
              role off to the next player). */}
          {isFacilitator && (
            <div data-testid="close-on-facilitator-leave-row">
              <ToggleRow
                label="Close room when facilitator leaves"
                description="End the session for everyone if the facilitator disconnects, instead of passing the role to the next player."
                checked={closeOnFacilitatorLeave}
                onChange={() => setCloseOnFacilitatorLeave((v) => !v)}
              />
            </div>
          )}

          <div className="border-t border-[var(--c-border)]" />

          {/* Card back style — facilitator only */}
          {isFacilitator && (
            <div>
              <label className="text-xs text-slate-400 block mb-2">Card back style</label>
              <CardBackPicker value={cardBack} onChange={setCardBack} />
            </div>
          )}

          <div className="border-t border-[var(--c-border)]" />

          {/* Toggles */}
          <ToggleRow
            label="Auto-reveal cards"
            description="Show cards automatically after everyone voted."
            checked={localSettings.autoReveal}
            onChange={() => toggle("autoReveal")}
          />
          {/* Issue #51 — facilitator-only room policy (not a local pref,
              see the state comment above), so it's disabled for everyone
              else the same way who_can_reveal/who_can_manage_issues are. */}
          <div data-testid="fun-features-enabled-row">
            <ToggleRow
              label="Enable fun reactions"
              description="Let players throw emoji at each other's cards — hover (or tap on mobile) a player's card to fling one."
              checked={funFeaturesEnabled}
              onChange={() => isFacilitator && setFunFeaturesEnabled((v) => !v)}
              disabled={!isFacilitator}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[var(--c-border)] shrink-0">
          <button
            onClick={save}
            className="w-full bg-accent hover:bg-accent-hover text-accent-fg font-semibold py-3 rounded-xl transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomSelect({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`w-full flex items-center justify-between bg-[var(--c-bg)] border rounded-lg px-3 py-2.5 text-sm text-white transition-colors text-left ${
          open ? "border-accent" : "border-[var(--c-border-hi)]"
        } ${disabled ? "opacity-60 cursor-not-allowed" : "hover:border-[var(--c-border-hi)] cursor-pointer"}`}
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="currentColor"
          className={`shrink-0 ml-2 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50 overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors hover:bg-[var(--c-panel2)] ${
                opt.value === value ? "text-accent" : "text-slate-200"
              }`}
            >
              <span>{opt.label}</span>
              {opt.value === value && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="text-accent shrink-0">
                  <path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const CARD_BACKS: { id: string; label: string; style: React.CSSProperties }[] = [
  {
    id: "blue_stripes",
    label: "Blue",
    style: {
      background: "repeating-linear-gradient(45deg, #2563eb, #2563eb 8px, #1d4ed8 8px, #1d4ed8 16px)",
    },
  },
  {
    id: "purple_stripes",
    label: "Purple",
    style: {
      background: "repeating-linear-gradient(45deg, #7c3aed, #7c3aed 8px, #6d28d9 8px, #6d28d9 16px)",
    },
  },
  {
    id: "red_stripes",
    label: "Red",
    style: {
      background: "repeating-linear-gradient(45deg, #dc2626, #dc2626 8px, #b91c1c 8px, #b91c1c 16px)",
    },
  },
  {
    id: "green_stripes",
    label: "Green",
    style: {
      background: "repeating-linear-gradient(45deg, #16a34a, #16a34a 8px, #15803d 8px, #15803d 16px)",
    },
  },
  {
    id: "dots",
    label: "Dots",
    style: {
      background: "#1e3a5f",
      backgroundImage: "radial-gradient(circle, #3b82f6 1.5px, transparent 1.5px)",
      backgroundSize: "10px 10px",
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    style: {
      background: "linear-gradient(135deg, #f97316, #ec4899, #8b5cf6)",
    },
  },
];

function CardBackPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {CARD_BACKS.map((back) => {
        const selected = back.id === value;
        return (
          <button
            key={back.id}
            type="button"
            onClick={() => onChange(back.id)}
            className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all ${
              selected
                ? "border-accent bg-accent-soft"
                : "border-[var(--c-border)] hover:border-[var(--c-border-hi)]"
            }`}
          >
            <div
              className="w-10 h-14 rounded-lg shadow-md"
              style={back.style}
            />
            <span className={`text-xs font-medium ${selected ? "text-accent" : "text-slate-400"}`}>
              {back.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${disabled ? "opacity-60" : ""}`}>
      <div>
        <div className="text-sm text-white font-medium">{label}</div>
        <div className="text-xs text-slate-400 mt-0.5">{description}</div>
      </div>
      <button
        onClick={onChange}
        disabled={disabled}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors mt-0.5 ${
          checked ? "bg-accent" : "bg-[var(--c-border)]"
        } ${disabled ? "cursor-not-allowed" : ""}`}
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
