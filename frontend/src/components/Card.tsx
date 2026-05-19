interface Props {
  value: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function Card({ value, selected, disabled, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-16 h-24 rounded-xl border-2 font-bold text-xl
        transition-all
        ${selected
          ? "bg-blue-600 text-white border-blue-700 -translate-y-2 shadow-lg"
          : "bg-white text-slate-800 border-slate-300 hover:border-blue-500 hover:-translate-y-1"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      {value}
    </button>
  );
}
