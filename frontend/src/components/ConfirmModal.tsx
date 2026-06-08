import { useEffect } from "react";

/**
 * Issue #4 — reusable confirmation modal that replaces native browser
 * `confirm()` everywhere we need to ask "are you sure?".
 *
 * The same component is wired into:
 *   - delete one issue
 *   - delete all issues
 *   - close room (facilitator)
 *   - kick player (facilitator)
 *
 * Behaviour:
 *   - Renders a backdrop + centred card with title, optional message, and
 *     Cancel + Confirm buttons.
 *   - Confirm button is destructive by default (red); pass `variant="primary"`
 *     for a regular blue button when the action isn't destructive.
 *   - Backdrop click and ESC cancel. Confirm button auto-focuses (so Enter
 *     submits without an extra tab) — but the action is still 2 clicks/keys
 *     deep from the trigger, never one. That keeps `Enter` from firing
 *     accidentally on focused-but-distant elements.
 *   - `data-testid="confirm-modal"` on the dialog so e2e can target either
 *     the modal as a whole or its two action buttons individually.
 */

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  message?: string;
  icon?: string;                                // emoji shown above the title
  confirmLabel?: string;                        // default "Confirm"
  cancelLabel?: string;                         // default "Cancel"
  variant?: "danger" | "primary";               // default "danger"
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  icon = "⚠️",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  // Close on ESC. Only attaches the listener while the modal is open so it
  // doesn't accidentally shadow other shortcuts (drawing-mode Esc handler).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmClasses =
    variant === "primary"
      ? "bg-blue-500 hover:bg-blue-400 text-white"
      : "bg-red-600 hover:bg-red-700 text-white";

  return (
    <div
      data-testid="confirm-modal-backdrop"
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        data-testid="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="bg-[var(--c-panel)] rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {icon && <div className="text-4xl mb-4">{icon}</div>}
        <h2 id="confirm-modal-title" className="text-lg font-bold text-white mb-2">
          {title}
        </h2>
        {message && <p className="text-slate-400 text-sm mb-6">{message}</p>}
        <div className={`flex gap-3 ${message ? "" : "mt-2"}`}>
          <button
            data-testid="confirm-modal-cancel"
            type="button"
            onClick={onCancel}
            className="flex-1 border border-[var(--c-border)] text-slate-300 hover:bg-[var(--c-panel2)] py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            data-testid="confirm-modal-confirm"
            type="button"
            autoFocus
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${confirmClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
