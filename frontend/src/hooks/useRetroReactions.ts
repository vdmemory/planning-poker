import { useCallback, useEffect, useRef, useState } from "react";
import { REACTION_FLOATER_MS } from "../components/ReactionsPanel";

/**
 * Issue #68 — animation manager for Retro Board's header self-reactions.
 * Trimmed clone of `useReactionAnimations` (Planning Poker, issue #32):
 * only the rising-floater queue, no on-card overlay — Retro Board has no
 * "player card" to anchor an overlay to, so floaters are the only UI.
 */

const LANE_COUNT = 5;

export interface RetroFloater {
  id: string;
  value: string;
  nickname: string;
  color: string;
  xLane: number;
  expiresAt: number;
}

interface IncomingReaction {
  from_participant_id: string;
  from_nickname?: string;
  avatar_color?: string;
  value: string;
}

export function useRetroReactions() {
  const [floaters, setFloaters] = useState<RetroFloater[]>([]);
  const laneExpiryRef = useRef<number[]>(Array(LANE_COUNT).fill(0));
  const nextIdRef = useRef(0);

  const pickLane = useCallback((now: number): number => {
    const expiries = laneExpiryRef.current;
    for (let i = 0; i < LANE_COUNT; i++) {
      if (expiries[i] <= now) return i;
    }
    let oldest = 0;
    for (let i = 1; i < LANE_COUNT; i++) {
      if (expiries[i] < expiries[oldest]) oldest = i;
    }
    return oldest;
  }, []);

  const handleReactionMessage = useCallback((raw: object) => {
    const msg = raw as IncomingReaction;
    if (!msg || !msg.from_participant_id || !msg.value) return;
    const now = Date.now();
    const lane = pickLane(now);
    const expiresAt = now + REACTION_FLOATER_MS;
    laneExpiryRef.current[lane] = expiresAt;
    nextIdRef.current += 1;
    setFloaters((prev) => [
      ...prev,
      {
        id: `${msg.from_participant_id}-${nextIdRef.current}`,
        value: msg.value,
        nickname: msg.from_nickname ?? "",
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

  return { floaters, handleReactionMessage };
}
