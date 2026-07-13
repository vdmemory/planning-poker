import { useCallback, useEffect, useState } from "react";

/**
 * Issue #62 Phase 2 — animation manager for `card_reaction` broadcasts.
 * Simplified sibling of `useReactionAnimations` (issue #32): only the
 * on-card overlay pop, no rising floaters — there's no single "sender's
 * screen corner" that makes sense when the reaction targets a card instead
 * of a person.
 */

const OVERLAY_MS = 3000;

export interface CardReactionOverlay {
  value: string;
  shownAt: number;
}

interface IncomingCardReaction {
  card_id?: string;
  value?: string;
}

export function useRetroCardReactions() {
  const [overlays, setOverlays] = useState<Record<string, CardReactionOverlay>>({});

  const handle = useCallback((raw: object) => {
    const msg = raw as IncomingCardReaction;
    if (!msg.card_id || !msg.value) return;
    setOverlays((prev) => ({
      ...prev,
      [msg.card_id!]: { value: msg.value!, shownAt: Date.now() },
    }));
  }, []);

  useEffect(() => {
    const keys = Object.keys(overlays);
    if (keys.length === 0) return;
    const soonest = Math.min(...keys.map((k) => overlays[k].shownAt + OVERLAY_MS));
    const ms = Math.max(0, soonest - Date.now());
    const t = window.setTimeout(() => {
      const now = Date.now();
      setOverlays((prev) => {
        const next: Record<string, CardReactionOverlay> = {};
        for (const [cardId, r] of Object.entries(prev)) {
          if (r.shownAt + OVERLAY_MS > now) next[cardId] = r;
        }
        return next;
      });
    }, ms + 20);
    return () => window.clearTimeout(t);
  }, [overlays]);

  return { cardReactionOverlays: overlays, handleCardReactionMessage: handle };
}
