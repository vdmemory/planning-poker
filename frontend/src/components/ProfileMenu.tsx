import { useState, useEffect, useRef } from "react";
import type { Theme } from "../hooks/useTheme";

const AVATAR_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
];

interface Props {
  nickname: string;
  avatarColor: string;
  theme: Theme;
  onNicknameChange: (name: string) => void;
  onAvatarColorChange: (color: string) => void;
  onThemeChange: (t: Theme) => void;
  onClose: () => void;
}

export function ProfileMenu({
  nickname,
  avatarColor,
  theme,
  onNicknameChange,
  onAvatarColorChange,
  onThemeChange,
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
    if (trimmed && trimmed !== nickname) {
      onNicknameChange(trimmed);
    }
    setEditingName(false);
  }

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-2 w-72 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-2xl shadow-2xl z-50 overflow-hidden"
    >
      {/* Avatar + Name */}
      <div className="px-5 py-5 flex flex-col items-center gap-3 border-b border-[var(--c-border)]">
        {/* Avatar */}
        <div className="relative">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white"
            style={{ backgroundColor: avatarColor }}
          >
            {nickname[0]?.toUpperCase() ?? "?"}
          </div>
          {/* Color picker */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1 bg-[var(--c-bg)] rounded-full px-1.5 py-1 border border-[var(--c-border)]">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onAvatarColorChange(c)}
                className="w-4 h-4 rounded-full transition-transform hover:scale-125"
                style={{
                  backgroundColor: c,
                  outline: avatarColor === c ? `2px solid white` : "none",
                  outlineOffset: "1px",
                }}
              />
            ))}
          </div>
        </div>

        {/* Name */}
        <div className="mt-3 text-center">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                className="bg-[var(--c-bg)] border border-[var(--c-border-hi)] rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmName();
                  if (e.key === "Escape") setEditingName(false);
                }}
              />
              <button onClick={confirmName} className="text-blue-400 text-sm font-medium hover:text-blue-300">
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="flex items-center gap-1.5 text-white font-semibold text-base hover:text-blue-300 transition-colors"
            >
              {nickname}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="text-slate-400">
                <path d="M11.5 1.5a1.5 1.5 0 0 1 1 2.56L4.56 12H2v-2.56L9.94 1.56a1.5 1.5 0 0 1 1.56-.06z" />
              </svg>
            </button>
          )}
          <div className="text-xs text-slate-400 mt-0.5">Guest user</div>
        </div>
      </div>

      {/* Theme */}
      <div className="px-5 py-4">
        <div className="text-xs text-slate-400 font-medium mb-2 uppercase tracking-wide">Appearance</div>
        <div className="space-y-1">
          {(["system", "light", "dark"] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => onThemeChange(t)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                theme === t
                  ? "bg-[var(--c-panel2)] text-white"
                  : "text-slate-300 hover:bg-[var(--c-panel2)]/50"
              }`}
            >
              <span className="text-base">{t === "system" ? "⚙️" : t === "light" ? "☀️" : "🌙"}</span>
              <span className="capitalize flex-1 text-left">{t}</span>
              {theme === t && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="text-blue-400">
                  <path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
