import { useEffect, useRef, useState, useCallback } from "react";
import type { RoomState, Stats } from "../types";

interface UseRoomSocketArgs {
  roomId: string;
  playerId: string | null;
  nickname: string;
  onDrawMessage?: (msg: object) => void;
  // Issue #32 — fired on every server-side `reaction` broadcast (includes the
  // sender's own click, so their on-card overlay + rising floater both appear).
  // Held in a ref so changing the handler doesn't tear down the WS.
  onReactionMessage?: (msg: object) => void;
  // Issue #51 — fired on every `thrown_reaction` broadcast (a reaction aimed
  // at a specific player's card, distinct from the self-reaction above).
  onThrowReactionMessage?: (msg: object) => void;
}

interface UseRoomSocketResult {
  state: RoomState | null;
  stats: Stats | null;
  myPlayerId: string | null;
  connected: boolean;
  send: (msg: object) => void;
  error: string | null;
  countdown: number | null;
  // Set when the room timer expired, the URL points at a stale/missing
  // room, (issue #19) the facilitator closed/left a room configured with
  // `close_on_facilitator_leave`, OR (issue #37) the facilitator kicked
  // this specific player. UI shows a "no longer active" overlay tuned to
  // each reason and does NOT reconnect.
  //
  // Historical note: a `roomClosed` boolean used to live here that
  // navigated home on `kicked` / `room_closed`. Both flows now route
  // through `roomInactive` so the user always sees a "why" overlay
  // first — issues #19 (closed) and #37 (kicked) collapsed both consumers
  // into this single union.
  roomInactive: "expired" | "not_found" | "closed" | "kicked" | null;
}

export function useRoomSocket({
  roomId,
  playerId,
  nickname,
  onDrawMessage,
  onReactionMessage,
  onThrowReactionMessage,
}: UseRoomSocketArgs): UseRoomSocketResult {
  const [state, setState] = useState<RoomState | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(playerId);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [roomInactive, setRoomInactive] = useState<"expired" | "not_found" | "closed" | "kicked" | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onDrawMessageRef = useRef(onDrawMessage);
  useEffect(() => { onDrawMessageRef.current = onDrawMessage; });
  const onReactionMessageRef = useRef(onReactionMessage);
  useEffect(() => { onReactionMessageRef.current = onReactionMessage; });
  const onThrowReactionMessageRef = useRef(onThrowReactionMessage);
  useEffect(() => { onThrowReactionMessageRef.current = onThrowReactionMessage; });
  const reconnectTimeoutRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(true);
  const myPlayerIdRef = useRef<string | null>(playerId);

  const connect = useCallback(() => {
    const apiBase = import.meta.env.VITE_API_URL || "";
    let wsHost: string;
    let wsProto: string;
    if (apiBase) {
      const apiUrl = new URL(apiBase);
      wsHost = apiUrl.host;
      wsProto = apiUrl.protocol === "https:" ? "wss" : "ws";
    } else {
      wsHost = window.location.host;
      wsProto = window.location.protocol === "https:" ? "wss" : "ws";
    }
    const params = new URLSearchParams({
      player_id: myPlayerIdRef.current || "",
      nickname,
    });
    const url = `${wsProto}://${wsHost}/ws/${roomId}?${params}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "joined") {
        myPlayerIdRef.current = msg.player_id;
        setMyPlayerId(msg.player_id);
        localStorage.setItem(`pp:${roomId}:player_id`, msg.player_id);
      } else if (msg.type === "room_state") {
        setState(msg.state);
        if (msg.stats) setStats(msg.stats);
        if (!msg.state.revealed) setStats(null);
      } else if (msg.type === "countdown") {
        // Start client-side countdown display
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        const total = msg.seconds as number;
        setCountdown(total);
        let remaining = total;
        countdownTimerRef.current = window.setInterval(() => {
          remaining -= 1;
          if (remaining > 0) {
            setCountdown(remaining);
          } else {
            clearInterval(countdownTimerRef.current!);
            countdownTimerRef.current = null;
            setCountdown(null);
          }
        }, 1000);
      } else if (msg.type === "kicked") {
        // Issue #37 — kicked players land on a dedicated overlay
        // ("You were removed from this room") instead of silently bouncing
        // home. Disabling reconnect here is critical: in production
        // Cloudflare strips the 4003 close code to 1005, so without the
        // typed `kicked` data frame the hook would auto-reconnect and the
        // server's auto-join would happily re-add the player as a brand-new
        // entry — defeating the kick.
        shouldReconnectRef.current = false;
        setRoomInactive("kicked");
      } else if (msg.type === "room_closed") {
        // Issue #19 — facilitator closed the room (explicit "close room" OR
        // creator-left auto-close). Show the inactive overlay so the user
        // learns *why* they were dropped instead of bouncing home silently.
        shouldReconnectRef.current = false;
        setRoomInactive("closed");
      } else if (msg.type === "room_expired") {
        // Server-side timer ran out while we were connected.
        shouldReconnectRef.current = false;
        setRoomInactive("expired");
      } else if (msg.type === "room_inactive") {
        // Sent by the server right after WS accept when the room is missing
        // ("not_found") or already past expires_at ("expired"). We rely on
        // this typed message because Render's Cloudflare proxy strips custom
        // close codes (4004/4005 arrive in the browser as 1005); without a
        // recognisable signal the hook would loop on auto-reconnect. See the
        // ws_endpoint comment in backend/app/main.py for the full story.
        shouldReconnectRef.current = false;
        const reason = (msg as { reason?: string }).reason;
        setRoomInactive(reason === "expired" ? "expired" : "not_found");
      } else if (msg.type === "draw_stroke" || msg.type === "draw_cursor" || msg.type === "draw_clear") {
        onDrawMessageRef.current?.(msg);
      } else if (msg.type === "reaction") {
        onReactionMessageRef.current?.(msg);
      } else if (msg.type === "thrown_reaction") {
        onThrowReactionMessageRef.current?.(msg);
      } else if (msg.type === "error") {
        setError(msg.message);
      }
    };

    ws.onclose = (event) => {
      setConnected(false);
      wsRef.current = null;
      if (event.code === 4004) {
        // Room never existed (or was already removed by cleanup).
        shouldReconnectRef.current = false;
        setRoomInactive("not_found");
        return;
      }
      if (event.code === 4005) {
        // Room timer expired but room not yet removed from the store.
        shouldReconnectRef.current = false;
        setRoomInactive("expired");
        return;
      }
      if (event.code === 4001) {
        setError("Nickname required");
        return;
      }
      if (event.code === 4003) {
        // Kicked by facilitator — issue #37 shows the "You were removed"
        // overlay. The typed `kicked` data frame above usually fires
        // first; this branch is a belt-and-braces fallback for the
        // (local) TestClient case where the message handler hasn't run
        // by the time the socket closes.
        shouldReconnectRef.current = false;
        setRoomInactive("kicked");
        return;
      }
      if (shouldReconnectRef.current) {
        reconnectTimeoutRef.current = window.setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => {};
  }, [roomId, nickname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { state, stats, myPlayerId, connected, send, error, countdown, roomInactive };
}
