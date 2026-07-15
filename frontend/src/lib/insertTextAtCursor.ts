import type { RefObject } from "react";

/**
 * Issue #66 — inserts `value` (an emoji, typically) at the current cursor
 * position of a textarea instead of always appending to the end. Shared by
 * the add-card composer and the card edit form since both need identical
 * behavior. Falls back to appending if the ref isn't mounted yet.
 */
export function insertTextAtCursor(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  currentText: string,
  value: string,
  setText: (text: string) => void
): void {
  const el = textareaRef.current;
  if (!el) {
    setText(currentText + value);
    return;
  }
  const start = el.selectionStart ?? currentText.length;
  const end = el.selectionEnd ?? currentText.length;
  const next = currentText.slice(0, start) + value + currentText.slice(end);
  setText(next);
  requestAnimationFrame(() => {
    el.focus();
    const pos = start + value.length;
    el.setSelectionRange(pos, pos);
  });
}
