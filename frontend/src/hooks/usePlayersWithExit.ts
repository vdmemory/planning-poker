import { useEffect, useRef, useState } from "react";
import type { Player } from "../types";

/**
 * Issue #5 — keeps a departed player's card mounted for one more render so
 * it can play a fade-out instead of vanishing the instant `room_state` drops
 * them. Returns only the "ghost" players currently fading out; the live
 * roster from `state.players` is rendered as usual by the caller.
 */
const EXIT_MS = 260;

export function usePlayersWithExit(players: Player[]): Player[] {
  const [leaving, setLeaving] = useState<Player[]>([]);
  const prevPlayersRef = useRef<Player[]>(players);

  useEffect(() => {
    const prevPlayers = prevPlayersRef.current;
    prevPlayersRef.current = players;

    const currentIds = new Set(players.map((p) => p.id));
    const justLeft = prevPlayers.filter((p) => !currentIds.has(p.id));
    if (justLeft.length === 0) return;

    setLeaving((prev) => [...prev, ...justLeft]);
    const leftIds = new Set(justLeft.map((p) => p.id));
    const timer = window.setTimeout(() => {
      setLeaving((prev) => prev.filter((p) => !leftIds.has(p.id)));
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [players]);

  const currentIds = new Set(players.map((p) => p.id));
  return leaving.filter((p) => !currentIds.has(p.id));
}
