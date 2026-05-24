import { useEffect, useRef, useState, useCallback } from "react";
import type { RoomState, Stats } from "../types";

interface UseRoomSocketArgs {
  roomId: string;
  playerId: string | null;
  nickname: string;
}

interface UseRoomSocketResult {
  state: RoomState | null;
  stats: Stats | null;
  myPlayerId: string | null;
  connected: boolean;
  send: (msg: object) => void;
  error: string | null;
  countdown: number | null;
}

export function useRoomSocket({
  roomId,
  playerId,
  nickname,
}: UseRoomSocketArgs): UseRoomSocketResult {
  const [state, setState] = useState<RoomState | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(playerId);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
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
      } else if (msg.type === "error") {
        setError(msg.message);
      }
    };

    ws.onclose = (event) => {
      setConnected(false);
      wsRef.current = null;
      if (event.code === 4004) {
        setError("Room not found");
        return;
      }
      if (event.code === 4001) {
        setError("Nickname required");
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

  return { state, stats, myPlayerId, connected, send, error, countdown };
}
