import { useState, useEffect, useRef } from "react";
import type { Theme } from "../hooks/useTheme";
import type { Accent } from "../hooks/useAccent";
import { AccentPicker } from "./AccentPicker";

const AVATAR_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
];

interface Props {
  nickname: string;
  avatarColor: string;
  theme: Theme;
  // Issue #42 — accent palette, independent of theme.
  accent: Accent;
  isSpectator: boolean;
  isFacilitator: boolean;
  onNicknameChange: (name: string) => void;
  onAvatarColorChange: (color: string) => void;
  onThemeChange: (t: Theme) => void;
  onAccentChange: (a: Accent) => void;
  onSpectatorToggle: () => void;
  onLeaveRoom: () => void;
  onClose: () => void;
}

export function ProfileMenu({
  nickname,
  avatarColor,
  theme,
  accent,
  isSpectator,
  isFacilitator,
  onNicknameChange,
  onAvatarColorChange,
  onThemeChange,
  onAccentChange,
  onSpectatorToggle,
  onLeaveRoom,
  onClose,
}: Props) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(nickname);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  function confirmName() {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== nickname) onNicknameChange(trimmed);
    setEditingName(false);
  }

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-2 w-72 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-2xl shadow-2xl z-50 overflow-hidden"
    >
      {/* Avatar + Name */}
      <div className="px-5 py-5 flex flex-col items-center gap-3 border-b border-[var(--c-border)]">
        <div className="relative">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white"
            style={{ backgroundColor: avatarColor }}
          >
            {nickname[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1 bg-[var(--c-bg)] rounded-full px-1.5 py-1 border border-[var(--c-border)]">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onAvatarColorChange(c)}
                className="w-4 h-4 rounded-full transition-transform hover:scale-125"
                style={{
                  backgroundColor: c,
                  outline: avatarColor === c ? "2px solid white" : "none",
                  outlineOffset: "1px",
                }}
              />
            ))}
          </div>
        </div>

        <div className="mt-3 text-center">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                className="bg-[var(--c-bg)] border border-[var(--c-border-hi)] rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-accent"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmName();
                  if (e.key === "Escape") setEditingName(false);
                }}
              />
              <button onClick={confirmName} className="text-accent text-sm font-medium hover:text-accent-hover">
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="flex items-center gap-1.5 text-white font-semibold text-base hover:text-accent transition-colors"
            >
              {nickname}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="text-slate-400">
                <path d="M11.5 1.5a1.5 1.5 0 0 1 1 2.56L4.56 12H2v-2.56L9.94 1.56a1.5 1.5 0 0 1 1.56-.06z" />
              </svg>
            </button>
          )}
          <div className="text-xs text-slate-400 mt-0.5">
            {isFacilitator ? "Facilitator" : isSpectator ? "Spectator" : "Player"}
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div className="px-5 py-4 border-b border-[var(--c-border)]">
        <div className="text-xs text-slate-400 font-medium mb-2 uppercase tracking-wide">Appearance</div>
        <div className="space-y-1 mb-3">
          {(["system", "light", "dark"] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => onThemeChange(t)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                theme === t ? "bg-[var(--c-panel2)] text-white" : "text-slate-300 hover:bg-[var(--c-panel2)]/50"
              }`}
            >
              <span className="text-base">{t === "system" ? "⚙️" : t === "light" ? "☀️" : "🌙"}</span>
              <span className="capitalize flex-1 text-left">{t}</span>
              {theme === t && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="text-accent">
                  <path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                </svg>
              )}
            </button>
          ))}
        </div>

        {/* Issue #42 — accent palette row, sits under the theme rows so the
            user sees mode (light/dark/system) and accent (colour) as two
            sibling controls in the Appearance group. */}
        <div className="pt-2 pb-1">
          <div className="text-[11px] text-slate-400 mb-2">Accent colour</div>
          <AccentPicker value={accent} onChange={onAccentChange} />
        </div>

        {/* Spectator toggle */}
        {!isFacilitator && (
          <div className="flex items-center justify-between px-1 py-1 mt-2">
            <div>
              <div className="text-sm text-white font-medium">Spectator mode</div>
              <div className="text-xs text-slate-400">Watch without voting</div>
            </div>
            <button
              onClick={onSpectatorToggle}
              className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${
                isSpectator ? "bg-accent" : "bg-[var(--c-border)]"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  isSpectator ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        )}
      </div>

      {/* Leave room */}
      <div className="px-5 py-3">
        <button
          onClick={() => { onClose(); onLeaveRoom(); }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {isFacilitator ? "Close room for everyone" : "Leave room"}
        </button>
      </div>
    </div>
  );
}
