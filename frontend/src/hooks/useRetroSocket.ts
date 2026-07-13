import { useEffect, useRef, useState, useCallback } from "react";
import type { RetroBoardState } from "../types";

interface UseRetroSocketArgs {
  boardId: string;
  participantId: string | null;
  nickname: string;
}

interface UseRetroSocketResult {
  state: RetroBoardState | null;
  myParticipantId: string | null;
  connected: boolean;
  send: (msg: object) => void;
  error: string | null;
  // Mirrors useRoomSocket's `roomInactive` — see that hook for the full
  // rationale (Cloudflare strips custom WS close codes in prod, so a typed
  // data message is the only reliable "why" signal).
  boardInactive: "expired" | "not_found" | "closed" | "kicked" | null;
}

export function useRetroSocket({ boardId, participantId, nickname }: UseRetroSocketArgs): UseRetroSocketResult {
  const [state, setState] = useState<RetroBoardState | null>(null);
  const [myParticipantId, setMyParticipantId] = useState<string | null>(participantId);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boardInactive, setBoardInactive] = useState<"expired" | "not_found" | "closed" | "kicked" | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(true);
  const myParticipantIdRef = useRef<string | null>(participantId);

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
      participant_id: myParticipantIdRef.current || "",
      nickname,
    });
    const url = `${wsProto}://${wsHost}/ws/retro/${boardId}?${params}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "joined") {
        myParticipantIdRef.current = msg.participant_id;
        setMyParticipantId(msg.participant_id);
        localStorage.setItem(`retro:${boardId}:participant_id`, msg.participant_id);
      } else if (msg.type === "board_state") {
        setState(msg.state);
      } else if (msg.type === "kicked") {
        shouldReconnectRef.current = false;
        setBoardInactive("kicked");
      } else if (msg.type === "board_closed") {
        shouldReconnectRef.current = false;
        setBoardInactive("closed");
      } else if (msg.type === "board_expired") {
        shouldReconnectRef.current = false;
        setBoardInactive("expired");
      } else if (msg.type === "board_inactive") {
        shouldReconnectRef.current = false;
        const reason = (msg as { reason?: string }).reason;
        setBoardInactive(reason === "expired" ? "expired" : "not_found");
      } else if (msg.type === "error") {
        setError(msg.message);
      }
    };

    ws.onclose = (event) => {
      setConnected(false);
      wsRef.current = null;
      if (event.code === 4004) {
        shouldReconnectRef.current = false;
        setBoardInactive("not_found");
        return;
      }
      if (event.code === 4005) {
        shouldReconnectRef.current = false;
        setBoardInactive("expired");
        return;
      }
      if (event.code === 4001) {
        setError("Nickname required");
        return;
      }
      if (event.code === 4003) {
        shouldReconnectRef.current = false;
        setBoardInactive("kicked");
        return;
      }
      if (shouldReconnectRef.current) {
        reconnectTimeoutRef.current = window.setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => {};
  }, [boardId, nickname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { state, myParticipantId, connected, send, error, boardInactive };
}
