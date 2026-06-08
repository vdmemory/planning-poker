import { useCallback, useEffect, useRef, useState } from "react";
import { REACTION_FLOATER_MS, REACTION_OVERLAY_MS } from "../components/ReactionsPanel";

/**
 * Issue #32 — animation manager for incoming reactions.
 *
 * Drives two pieces of UI:
 *   - on-card overlay per player (most recent reaction within REACTION_OVERLAY_MS)
 *   - floaters: a list of rising icons in the lower-left, each with an
 *     assigned X-lane. Lane allocation tries first-free, falls back to
 *     overwriting the oldest occupant — so multiple reactions never stack
 *     on the same X column.
 */

const LANE_COUNT = 5;

export interface CardReaction {
  kind: "emoji" | "number";
  value: string;
  // Wall-clock when shown; allows the overlay to auto-dismiss after
  // REACTION_OVERLAY_MS without a per-player timer.
  shownAt: number;
}

export interface Floater {
  id: string;
  kind: "emoji" | "number";
  value: string;
  nickname: string;
  color: string;
  xLane: number;
  expiresAt: number;
}

interface IncomingReaction {
  player_id: string;
  nickname?: string;
  avatar_color?: string;
  kind: "emoji" | "number";
  value: string;
}

export function useReactionAnimations() {
  const [cardReactions, setCardReactions] = useState<Record<string, CardReaction>>({});
  const [floaters, setFloaters] = useState<Floater[]>([]);
  // Map of lane -> wall-clock when the floater currently using it expires.
  // Used to pick the next lane: first one whose expiry is in the past.
  const laneExpiryRef = useRef<number[]>(Array(LANE_COUNT).fill(0));
  const nextIdRef = useRef(0);

  const pickLane = useCallback((now: number): number => {
    const expiries = laneExpiryRef.current;
    // First-free lane.
    for (let i = 0; i < LANE_COUNT; i++) {
      if (expiries[i] <= now) return i;
    }
    // All lanes busy — overwrite the one that frees up soonest.
    let oldest = 0;
    for (let i = 1; i < LANE_COUNT; i++) {
      if (expiries[i] < expiries[oldest]) oldest = i;
    }
    return oldest;
  }, []);

  const handle = useCallback((raw: object) => {
    const msg = raw as IncomingReaction;
    if (!msg || !msg.player_id || !msg.value) return;
    const now = Date.now();

    // 1. Card overlay: latest reaction wins, will auto-dismiss via the effect
    //    below once the timer runs out.
    setCardReactions((prev) => ({
      ...prev,
      [msg.player_id]: { kind: msg.kind, value: msg.value, shownAt: now },
    }));

    // 2. Floater: assign a lane and queue.
    const lane = pickLane(now);
    const expiresAt = now + REACTION_FLOATER_MS;
    laneExpiryRef.current[lane] = expiresAt;
    nextIdRef.current += 1;
    setFloaters((prev) => [
      ...prev,
      {
        id: `${msg.player_id}-${nextIdRef.current}`,
        kind: msg.kind,
        value: msg.value,
        nickname: msg.nickname ?? "",
        color: msg.avatar_color ?? "#3b82f6",
        xLane: lane,
        expiresAt,
      },
    ]);
  }, [pickLane]);

  // Auto-dismiss floaters when they pass their expiry.
  useEffect(() => {
    if (floaters.length === 0) return;
    const soonest = Math.min(...floaters.map((f) => f.expiresAt));
    const ms = Math.max(0, soonest - Date.now());
    const t = window.setTimeout(() => {
      const now = Date.now();
      setFloaters((prev) => prev.filter((f) => f.expiresAt > now));
    }, ms + 20);
    return () => window.clearTimeout(t);
  }, [floaters]);

  // Auto-dismiss card overlays.
  useEffect(() => {
    const keys = Object.keys(cardReactions);
    if (keys.length === 0) return;
    const soonest = Math.min(...keys.map((k) => cardReactions[k].shownAt + REACTION_OVERLAY_MS));
    const ms = Math.max(0, soonest - Date.now());
    const t = window.setTimeout(() => {
      const now = Date.now();
      setCardReactions((prev) => {
        const next: Record<string, CardReaction> = {};
        for (const [pid, r] of Object.entries(prev)) {
          if (r.shownAt + REACTION_OVERLAY_MS > now) next[pid] = r;
        }
        return next;
      });
    }, ms + 20);
    return () => window.clearTimeout(t);
  }, [cardReactions]);

  return { cardReactions, floaters, handleReactionMessage: handle };
}
