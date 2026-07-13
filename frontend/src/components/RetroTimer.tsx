import { useEffect, useState } from "react";

const PRESETS_SECONDS = [180, 300, 600]; // 3 / 5 / 10 minutes

interface Props {
  timerRunning: boolean;
  timerEndsAt: string | null;
  timerRemainingSeconds: number | null;
  isFacilitator: boolean;
  onStart: (seconds: number) => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
}

function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, "0")}`;
}

export function RetroTimer({
  timerRunning,
  timerEndsAt,
  timerRemainingSeconds,
  isFacilitator,
  onStart,
  onPause,
  onResume,
  onReset,
}: Props) {
  const [showPresets, setShowPresets] = useState(false);
  const [liveSeconds, setLiveSeconds] = useState<number>(0);

  useEffect(() => {
    if (!timerRunning || !timerEndsAt) return;
    const endsAtMs = new Date(timerEndsAt).getTime();
    const tick = () => setLiveSeconds(Math.max(0, (endsAtMs - Date.now()) / 1000));
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [timerRunning, timerEndsAt]);

  const isIdle = !timerRunning && timerRemainingSeconds === null;

  if (isIdle) {
    if (!isFacilitator) return null;
    return (
      <div className="relative">
        <button
          data-testid="retro-timer-start"
          onClick={() => setShowPresets((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-[var(--c-panel2)] hover:bg-[var(--c-border)] px-3 py-1.5 rounded-full transition-colors"
        >
          ⏱ Start timer
        </button>
        {showPresets && (
          <div className="absolute top-full mt-1 left-0 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl p-1.5 z-20 flex gap-1">
            {PRESETS_SECONDS.map((s) => (
              <button
                key={s}
                data-testid="retro-timer-preset"
                onClick={() => { onStart(s); setShowPresets(false); }}
                className="px-2.5 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-[var(--c-panel2)] transition-colors whitespace-nowrap"
              >
                {Math.round(s / 60)} min
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const display = timerRunning ? liveSeconds : (timerRemainingSeconds ?? 0);

  return (
    <div className="flex items-center gap-1.5">
      <span
        data-testid="retro-timer-display"
        className={`text-sm font-mono font-semibold px-2.5 py-1 rounded-lg ${
          display <= 30 ? "text-red-400 bg-red-500/10" : "text-white bg-[var(--c-panel2)]"
        }`}
      >
        {formatMMSS(display)}
      </span>
      {isFacilitator && (
        <>
          {timerRunning ? (
            <button data-testid="retro-timer-pause" onClick={onPause} title="Pause"
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[var(--c-panel2)] transition-colors">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1" width="3" height="10"/><rect x="7" y="1" width="3" height="10"/></svg>
            </button>
          ) : (
            <button data-testid="retro-timer-resume" onClick={onResume} title="Resume"
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[var(--c-panel2)] transition-colors">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 1l9 5-9 5V1z"/></svg>
            </button>
          )}
          <button data-testid="retro-timer-reset" onClick={onReset} title="Reset"
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[var(--c-panel2)] transition-colors">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M13 2v3.5H9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
