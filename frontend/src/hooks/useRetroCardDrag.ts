import { useCallback, useRef, useState } from "react";

/**
 * Issue #62 Phase 2 — drag-to-merge grouping via the Pointer Events API
 * (not native HTML5 drag-and-drop, which doesn't fire on touch devices).
 * Started from a small grip handle on each card via `setPointerCapture`, so
 * the same handle keeps receiving move/up events regardless of where the
 * pointer physically travels — no document-level listeners needed.
 *
 * Cross-column drops, and drops onto a card already in the same stack (its
 * own head, or a sibling child), are rejected client-side (silently — no
 * highlight, no WS message) rather than round-tripping to the server and
 * surfacing a full-page error: `RetroService.group_cards` also rejects
 * these, but that error path is meant for genuine bugs, not routine
 * mis-drops — and a stack's head sits directly above its children, so
 * dropping back onto one of them is an easy, everyday accident.
 */
interface DragStart {
  cardId: string;
  columnId: string;
}

// Resolves a card's stack head straight from the DOM (`data-group-id`,
// written by RetroCardItem from `card.group_id`) rather than threading
// board state through this hook — cheap, and always reflects whatever just
// rendered, including updates that land mid-drag.
function resolveHeadFromDom(cardId: string): string | null {
  const el = document.querySelector(`[data-testid='retro-card'][data-card-id='${cardId}']`);
  if (!el) return null;
  return el.getAttribute("data-group-id") || cardId;
}

export function useRetroCardDrag(onGroup: (sourceCardId: string, targetCardId: string) => void) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const startRef = useRef<DragStart | null>(null);

  const startDrag = useCallback((cardId: string, columnId: string) => {
    startRef.current = { cardId, columnId };
    setDraggingId(cardId);
  }, []);

  const moveDrag = useCallback((clientX: number, clientY: number) => {
    const start = startRef.current;
    if (!start) return;
    const el = document.elementFromPoint(clientX, clientY);
    const cardEl = el?.closest("[data-testid='retro-card']") as HTMLElement | null;
    const targetId = cardEl?.getAttribute("data-card-id") ?? null;
    const columnEl = el?.closest("[data-column-id]") as HTMLElement | null;
    const targetColumnId = columnEl?.getAttribute("data-column-id") ?? null;
    const sameStack = !!targetId && resolveHeadFromDom(start.cardId) === resolveHeadFromDom(targetId);
    const valid = !!targetId && targetId !== start.cardId && targetColumnId === start.columnId && !sameStack;
    setOverId(valid ? targetId : null);
  }, []);

  const endDrag = useCallback(() => {
    const start = startRef.current;
    const targetId = overId;
    startRef.current = null;
    setDraggingId(null);
    setOverId(null);
    if (start && targetId) onGroup(start.cardId, targetId);
  }, [overId, onGroup]);

  return { draggingId, overId, startDrag, moveDrag, endDrag };
}
