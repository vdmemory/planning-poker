import { useCallback, useRef, useState } from "react";

/**
 * Issue #51 — animation manager for reactions thrown AT a specific player's
 * card (distinct from `useReactionAnimations`, which drives the self-only
 * overlay + rising floater from issue #32).
 *
 * On each `thrown_reaction` broadcast, looks up the sender's and target's
 * card DOM nodes (tagged `data-player-id` on `PlayerCard`) to capture their
 * on-screen rects *once*, at throw time — `ThrowFloater` then animates
 * between those two fixed points via a CSS transform transition, so it
 * doesn't need to re-measure or track scrolling/resizing mid-flight.
 */

// Total lifetime of a flight element: travel time (~650ms, see ThrowFloater)
// + a pause sitting on the target card + a short fade-out.
const FLIGHT_LIFETIME_MS = 1500;

export interface ThrowFlight {
  id: string;
  value: string;
  fromRect: DOMRect;
  toRect: DOMRect;
  // Small per-throw random offset so multiple reactions landing on the same
  // card don't stack in the exact same spot. Purely decorative — each
  // client picks its own, no need to sync it over the wire.
  landOffsetX: number;
  landOffsetY: number;
}

interface IncomingThrow {
  from_player_id?: string;
  target_player_id?: string;
  value?: string;
}

function cardRect(playerId: string): DOMRect | null {
  const el = document.querySelector(`[data-player-id="${playerId}"]`);
  return el ? el.getBoundingClientRect() : null;
}

export function useThrowReactions() {
  const [flights, setFlights] = useState<ThrowFlight[]>([]);
  const nextIdRef = useRef(0);

  const handle = useCallback((raw: object) => {
    const msg = raw as IncomingThrow;
    if (!msg.target_player_id || !msg.value) return;

    const toRect = cardRect(msg.target_player_id);
    if (!toRect) return; // target's card isn't rendered on this client — nothing to animate onto

    // Fall back to a fixed point near the bottom of the viewport if the
    // thrower's own card can't be found (e.g. they disconnected mid-flight).
    const fromRect = (msg.from_player_id && cardRect(msg.from_player_id)) || new DOMRect(
      window.innerWidth / 2 - 20, window.innerHeight - 40, 40, 40
    );

    nextIdRef.current += 1;
    const id = `throw-${nextIdRef.current}`;
    setFlights((prev) => [
      ...prev,
      {
        id,
        value: msg.value!,
        fromRect,
        toRect,
        landOffsetX: (Math.random() - 0.5) * 30,
        landOffsetY: (Math.random() - 0.5) * 24,
      },
    ]);

    window.setTimeout(() => {
      setFlights((prev) => prev.filter((f) => f.id !== id));
    }, FLIGHT_LIFETIME_MS);
  }, []);

  return { flights, handleThrowReactionMessage: handle };
}
