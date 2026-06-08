import { useEffect, useRef, useCallback } from "react";

export const DRAW_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
];

// Issue #3 — strokes auto-fade (Slack-style). For LIFETIME ms each completed
// stroke is fully visible; over the last FADE_OUT_MS it linearly fades; then
// it's removed from the in-memory arrays so the canvas stays clean. Cursors
// and in-progress (not-yet-`done`) strokes are NOT affected — only completed
// drawings.
const STROKE_LIFETIME_MS = 5000;
const STROKE_FADE_OUT_MS = 1000;

interface Point { x: number; y: number; }

interface Stroke {
  color: string;
  points: Point[];
  // Wall-clock ms (Date.now) when the stroke was completed locally / received
  // from the network. Drives the fade-out animation.
  startedAt: number;
}

interface PlayerState {
  nickname: string;
  color: string;
  completedStrokes: Stroke[];
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
          player.completedStrokes.push({ color, points: msg.points, startedAt: Date.now() });
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

    function drawPath(points: Point[], color: string, alpha = 0.85) {
      if (points.length < 2 || alpha <= 0) return;
      ctx!.save();
      ctx!.strokeStyle = color;
      ctx!.lineWidth = 3;
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";
      ctx!.globalAlpha = alpha;
      ctx!.beginPath();
      ctx!.moveTo(points[0].x * w, points[0].y * h);
      for (let i = 1; i < points.length; i++) {
        ctx!.lineTo(points[i].x * w, points[i].y * h);
      }
      ctx!.stroke();
      ctx!.restore();
    }

    // Issue #3 — alpha as a function of stroke age:
    //   [0, LIFETIME - FADE_OUT)        → full 0.85
    //   [LIFETIME - FADE_OUT, LIFETIME) → linearly fading from 0.85 to 0
    //   >= LIFETIME                     → 0 (will also be filtered out below)
    function strokeAlpha(stroke: Stroke, nowMs: number): number {
      const age = nowMs - stroke.startedAt;
      if (age >= STROKE_LIFETIME_MS) return 0;
      const remaining = STROKE_LIFETIME_MS - age;
      if (remaining >= STROKE_FADE_OUT_MS) return 0.85;
      return 0.85 * (remaining / STROKE_FADE_OUT_MS);
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
    let totalStrokes = 0;

    // Draw all players (others + me). For each, drop strokes that have aged
    // past STROKE_LIFETIME_MS, and draw the survivors with age-based alpha.
    for (const [pid, player] of playersRef.current) {
      // Drop strokes that finished fading. Mutating the same array is safe —
      // playersRef is a ref, not React state.
      if (player.completedStrokes.length > 0) {
        player.completedStrokes = player.completedStrokes.filter(
          (s) => now - s.startedAt < STROKE_LIFETIME_MS
        );
      }
      totalStrokes += player.completedStrokes.length;

      const isMe = pid === myPlayerId;
      for (const s of player.completedStrokes) {
        drawPath(s.points, s.color, strokeAlpha(s, now));
      }
      // In-progress strokes (still being drawn) don't fade — they're live.
      if (player.currentPoints.length > 1) {
        drawPath(player.currentPoints, player.color);
      }
      // Cursor label: only for others, only briefly after their last update.
      if (
        !isMe &&
        now - player.lastUpdate < 3000 &&
        (player.completedStrokes.length > 0 || player.currentPoints.length > 0)
      ) {
        drawCursorLabel(player.cursorX, player.cursorY, player.nickname, player.color);
      }
    }

    // Expose the live stroke count on the canvas DOM node so e2e tests can
    // observe the fade-out deterministically without poking the canvas
    // pixels. Updated every render frame; in production this attribute is
    // ignored.
    if (canvas.getAttribute("data-stroke-count") !== String(totalStrokes)) {
      canvas.setAttribute("data-stroke-count", String(totalStrokes));
    }
  }, [myPlayerId]);

  useEffect(() => {
    const loop = () => {
      // Render every frame while there are any completed strokes (so the
      // fade animation looks smooth). Otherwise honour the dirty flag.
      const hasStrokes = Array.from(playersRef.current.values()).some(
        (p) => p.completedStrokes.length > 0
      );
      if (dirtyRef.current || hasStrokes) {
        render();
        dirtyRef.current = false;
      }
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
        const stroke: Stroke = { color: me.color, points: [...me.currentPoints], startedAt: Date.now() };
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
      data-testid="drawing-canvas"
      data-stroke-count="0"
      className="fixed inset-0 z-40"
      style={{ pointerEvents: isActive ? "auto" : "none", cursor: "none" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}
