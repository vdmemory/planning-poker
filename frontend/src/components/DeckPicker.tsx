import type { DeckType } from "../types";

export const DECK_OPTIONS: { value: DeckType; name: string; cards: string[] }[] = [
  {
    value: "fibonacci",
    name: "Fibonacci",
    cards: ["0", "1", "2", "3", "5", "8", "13", "21", "34", "55", "89", "?", "☕"],
  },
  {
    value: "powers_of_2",
    name: "Powers of 2",
    cards: ["0", "1", "2", "4", "8", "16", "32", "64", "?", "☕"],
  },
  {
    value: "sequential",
    name: "Sequential",
    cards: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "?", "☕"],
  },
  {
    value: "tshirt",
    name: "T-Shirt",
    cards: ["XS", "S", "M", "L", "XL", "XXL", "?"],
  },
];

const PREVIEW_COUNT = 5;

interface Props {
  value: DeckType;
  onChange: (v: DeckType) => void;
  disabled?: boolean;
}

export function DeckPicker({ value, onChange, disabled = false }: Props) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {DECK_OPTIONS.map((deck) => {
        const selected = deck.value === value;
        const preview = deck.cards.slice(0, PREVIEW_COUNT);
        const rest = deck.cards.length - PREVIEW_COUNT;

        return (
          <button
            key={deck.value}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(deck.value)}
            className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-all ${
              disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
            } ${
              selected
                ? "border-accent bg-accent-soft"
                : "border-[var(--c-border)] hover:border-[var(--c-border-hi)] bg-[var(--c-panel2)]"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              {/* Deck name + cards preview */}
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium mb-2 ${selected ? "text-accent" : "text-slate-300"}`}>
                  {deck.name}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {preview.map((card) => (
                    <span
                      key={card}
                      className={`inline-flex items-center justify-center rounded-md border font-bold text-xs w-7 h-9 shrink-0 transition-colors ${
                        selected
                          ? "border-accent/50 bg-accent-soft text-accent"
                          : "border-[var(--c-border)] bg-[var(--c-panel)] text-slate-300"
                      }`}
                    >
                      {card}
                    </span>
                  ))}
                  {rest > 0 && (
                    <span className="text-xs text-slate-500 ml-0.5">+{rest}</span>
                  )}
                </div>
              </div>

              {/* Selected checkmark */}
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
