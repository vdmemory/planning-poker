import { useEffect, useRef, useCallback } from "react";

export const DRAW_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
];

interface Point { x: number; y: number; }

interface PlayerState {
  nickname: string;
  color: string;
  completedStrokes: { color: string; points: Point[] }[];
  currentPoints: Point[];
  cursorX: number;
  cursorY: number;
  lastUpdate: number;
}

interface Props {
  myPlayerId: string;
  myNickname: string;
  isActive: boolean;
  activeColor: string;
  send: (msg: object) => void;
  onRegister: (handler: (msg: object) => void) => void;
}

export function DrawingCanvas({ myPlayerId, myNickname, isActive, activeColor, send, onRegister }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playersRef = useRef<Map<string, PlayerState>>(new Map());
  const dirtyRef = useRef(true);
  const isMouseDownRef = useRef(false);
  const lastCursorSendRef = useRef(0);
  const lastStrokeSendRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });

  const getOrCreate = useCallback((playerId: string, nickname: string, color: string): PlayerState => {
    if (!playersRef.current.has(playerId)) {
      playersRef.current.set(playerId, {
        nickname, color,
        completedStrokes: [], currentPoints: [],
        cursorX: 0, cursorY: 0,
        lastUpdate: Date.now(),
      });
    }
    return playersRef.current.get(playerId)!;
  }, []);

  const handleMessage = useCallback((raw: object) => {
    const msg = raw as any;
    const { type, player_id, nickname = "", color = "#3b82f6" } = msg;
    if (player_id === myPlayerId) return;

    if (type === "draw_clear") {
      playersRef.current.delete(player_id);
      dirtyRef.current = true;
      return;
    }

    const player = getOrCreate(player_id, nickname, color);
    player.lastUpdate = Date.now();

    if (type === "draw_stroke") {
      player.nickname = nickname || player.nickname;
      player.color = color;
      if (msg.done) {
        if ((msg.points as Point[])?.length > 1) {
          player.completedStrokes.push({ color, points: msg.points });
        }
        player.currentPoints = [];
      } else {
        player.currentPoints = msg.points ?? [];
        const pts = msg.points as Point[];
        if (pts?.length > 0) {
          player.cursorX = pts[pts.length - 1].x;
          player.cursorY = pts[pts.length - 1].y;
        }
      }
    } else if (type === "draw_cursor") {
      player.nickname = nickname || player.nickname;
      player.color = color;
      player.cursorX = msg.x;
      player.cursorY = msg.y;
    }

    dirtyRef.current = true;
  }, [myPlayerId, getOrCreate]);

  useEffect(() => {
    onRegister(handleMessage);
  }, [onRegister, handleMessage]);

  // Render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width;
    const h = canvas.height;

    function drawPath(points: Point[], color: string) {
      if (points.length < 2) return;
      ctx!.save();
      ctx!.strokeStyle = color;
      ctx!.lineWidth = 3;
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";
      ctx!.globalAlpha = 0.85;
      ctx!.beginPath();
      ctx!.moveTo(points[0].x * w, points[0].y * h);
      for (let i = 1; i < points.length; i++) {
        ctx!.lineTo(points[i].x * w, points[i].y * h);
      }
      ctx!.stroke();
      ctx!.restore();
    }

    function drawCursorLabel(x: number, y: number, name: string, color: string) {
      const cx = x * w + 12;
      const cy = y * h - 18;
      ctx!.save();
      ctx!.font = "bold 11px system-ui, sans-serif";
      const tw = ctx!.measureText(name).width;
      const pad = 5;
      ctx!.fillStyle = color;
      ctx!.globalAlpha = 0.92;
      ctx!.beginPath();
      ctx!.roundRect(cx, cy, tw + pad * 2, 16, 4);
      ctx!.fill();
      ctx!.globalAlpha = 1;
      ctx!.fillStyle = "#ffffff";
      ctx!.fillText(name, cx + pad, cy + 11);
      ctx!.restore();
    }

    const now = Date.now();

    // Draw other players
    for (const [pid, player] of playersRef.current) {
      if (pid === myPlayerId) continue;
      for (const s of player.completedStrokes) drawPath(s.points, s.color);
      if (player.currentPoints.length > 1) drawPath(player.currentPoints, player.color);
      if (now - player.lastUpdate < 3000 && (player.completedStrokes.length > 0 || player.currentPoints.length > 0)) {
        drawCursorLabel(player.cursorX, player.cursorY, player.nickname, player.color);
      }
    }

    // Draw my own strokes
    const me = playersRef.current.get(myPlayerId);
    if (me) {
      for (const s of me.completedStrokes) drawPath(s.points, s.color);
      if (me.currentPoints.length > 1) drawPath(me.currentPoints, me.color);
    }
  }, [myPlayerId]);

  useEffect(() => {
    const loop = () => {
      if (dirtyRef.current) { render(); dirtyRef.current = false; }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [render]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      dirtyRef.current = true;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Exit drawing: clear my strokes + notify others
  const isActiveRef = useRef(isActive);
  useEffect(() => {
    const was = isActiveRef.current;
    isActiveRef.current = isActive;
    if (was && !isActive) {
      playersRef.current.delete(myPlayerId);
      dirtyRef.current = true;
      sendRef.current({ type: "draw_clear" });
    }
    if (!was && isActive) {
      getOrCreate(myPlayerId, myNickname, activeColor);
    }
  }, [isActive, myPlayerId, myNickname, activeColor, getOrCreate]);

  const norm = (e: React.MouseEvent) => ({
    x: e.clientX / window.innerWidth,
    y: e.clientY / window.innerHeight,
  });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isActive) return;
    e.preventDefault();
    isMouseDownRef.current = true;
    const pt = norm(e);
    const me = getOrCreate(myPlayerId, myNickname, activeColor);
    me.color = activeColor;
    me.currentPoints = [pt];
    dirtyRef.current = true;
  }, [isActive, myPlayerId, myNickname, activeColor, getOrCreate]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isActive) return;
    const pt = norm(e);
    const now = Date.now();

    if (isMouseDownRef.current) {
      const me = playersRef.current.get(myPlayerId);
      if (me) {
        me.currentPoints.push(pt);
        me.cursorX = pt.x;
        me.cursorY = pt.y;
        me.lastUpdate = now;
        dirtyRef.current = true;
      }
      if (now - lastStrokeSendRef.current > 33) {
        const pts = playersRef.current.get(myPlayerId)?.currentPoints ?? [];
        if (pts.length > 0) {
          sendRef.current({ type: "draw_stroke", color: activeColor, points: [...pts], done: false });
          lastStrokeSendRef.current = now;
        }
      }
    }

    if (now - lastCursorSendRef.current > 50) {
      sendRef.current({ type: "draw_cursor", x: pt.x, y: pt.y, color: activeColor });
      lastCursorSendRef.current = now;
    }
  }, [isActive, myPlayerId, activeColor]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!isActive || !isMouseDownRef.current) return;
    isMouseDownRef.current = false;
    const pt = norm(e);
    const me = playersRef.current.get(myPlayerId);
    if (me) {
      me.currentPoints.push(pt);
      if (me.currentPoints.length > 1) {
        const stroke = { color: me.color, points: [...me.currentPoints] };
        me.completedStrokes.push(stroke);
        sendRef.current({ type: "draw_stroke", color: activeColor, points: stroke.points, done: true });
      }
      me.currentPoints = [];
      dirtyRef.current = true;
    }
  }, [isActive, myPlayerId, activeColor]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-40"
      style={{ pointerEvents: isActive ? "auto" : "none", cursor: "none" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}
