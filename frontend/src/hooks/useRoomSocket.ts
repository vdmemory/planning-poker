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
}

/**
 * Подключение к комнате через WebSocket.
 * - Если playerId известен (создатель комнаты или сохранён в localStorage) — реконнект.
 * - Если нет — авто-join по nickname.
 * - Auto-reconnect с backoff при разрыве.
 */
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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(true);

  const connect = useCallback(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const params = new URLSearchParams({
      player_id: myPlayerId || "",
      nickname,
    });
    const url = `${proto}://${window.location.host}/ws/${roomId}?${params}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "joined") {
        setMyPlayerId(msg.player_id);
        // Сохраняем для реконнекта после рефреша
        localStorage.setItem(`pp:${roomId}:player_id`, msg.player_id);
      } else if (msg.type === "room_state") {
        setState(msg.state);
        if (msg.stats) setStats(msg.stats);
        if (!msg.state.revealed) setStats(null);
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

    ws.onerror = () => {
      // onclose тоже отработает — там и реконнект
    };
  }, [roomId, myPlayerId, nickname]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { state, stats, myPlayerId, connected, send, error };
}
