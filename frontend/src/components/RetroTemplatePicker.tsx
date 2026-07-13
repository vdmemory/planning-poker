import type { RetroTemplate } from "../types";

export const RETRO_TEMPLATE_OPTIONS: { value: RetroTemplate; name: string; columns: { title: string; color: string }[] }[] = [
  {
    value: "mad_sad_glad",
    name: "Mad / Sad / Glad",
    columns: [
      { title: "Mad", color: "#ef4444" },
      { title: "Sad", color: "#eab308" },
      { title: "Glad", color: "#22c55e" },
    ],
  },
  {
    value: "start_stop_continue",
    name: "Start / Stop / Continue",
    columns: [
      { title: "Start", color: "#22c55e" },
      { title: "Stop", color: "#ef4444" },
      { title: "Continue", color: "#3b82f6" },
    ],
  },
  {
    value: "four_ls",
    name: "4Ls",
    columns: [
      { title: "Liked", color: "#22c55e" },
      { title: "Learned", color: "#3b82f6" },
      { title: "Lacked", color: "#ef4444" },
      { title: "Longed for", color: "#8b5cf6" },
    ],
  },
];

interface Props {
  value: RetroTemplate;
  onChange: (v: RetroTemplate) => void;
  disabled?: boolean;
}

export function RetroTemplatePicker({ value, onChange, disabled = false }: Props) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {RETRO_TEMPLATE_OPTIONS.map((tpl) => {
        const selected = tpl.value === value;
        return (
          <button
            key={tpl.value}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(tpl.value)}
            className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-all ${
              disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
            } ${
              selected
                ? "border-accent bg-accent-soft"
                : "border-[var(--c-border)] hover:border-[var(--c-border-hi)] bg-[var(--c-panel2)]"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium mb-2 ${selected ? "text-accent" : "text-slate-300"}`}>
                  {tpl.name}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {tpl.columns.map((col) => (
                    <span
                      key={col.title}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--c-border)] bg-[var(--c-panel)] px-2 py-1 text-xs font-medium text-slate-300"
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                      {col.title}
                    </span>
                  ))}
                </div>
              </div>

              {selected && (
                <svg width="18" height="18" viewBox="0 0 18 18" className="text-accent shrink-0" fill="none">
                  <circle cx="9" cy="9" r="8.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M5 9l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
