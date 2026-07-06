import { useEffect, useState } from "react";
import type { ThrowFlight } from "../hooks/useThrowReactions";

/**
 * Issue #51 — animates a thrown emoji flying from the sender's card to the
 * target's card, then landing with a little bounce before fading out.
 *
 * Positioning uses the FLIP technique: render at the start point first, then
 * on the next frame apply a `transform: translate(dx, dy)` with a CSS
 * transition so the browser animates the move — no per-frame JS, no new
 * animation library, just two states and a transition.
 */
const TRAVEL_MS = 650;
const FADE_START_MS = 1100;

export function ThrowFloater({ value, fromRect, toRect, landOffsetX, landOffsetY }: ThrowFlight) {
  const [flying, setFlying] = useState(false);
  const [landed, setLanded] = useState(false);
  const [fading, setFading] = useState(false);

  const fromX = fromRect.left + fromRect.width / 2;
  const fromY = fromRect.top + fromRect.height / 2;
  const toX = toRect.left + toRect.width / 2 + landOffsetX;
  const toY = toRect.top + toRect.height / 2 + landOffsetY;
  const dx = toX - fromX;
  const dy = toY - fromY;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setFlying(true));
    const landTimer = window.setTimeout(() => setLanded(true), TRAVEL_MS);
    const fadeTimer = window.setTimeout(() => setFading(true), FADE_START_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(landTimer);
      clearTimeout(fadeTimer);
    };
  }, []);

  return (
    <div
      data-testid="throw-floater"
      data-reaction-value={value}
      className="fixed z-40 pointer-events-none select-none"
      style={{
        left: fromX,
        top: fromY,
        opacity: fading ? 0 : 1,
        transition: `transform ${TRAVEL_MS}ms cubic-bezier(0.22, 0.9, 0.36, 1), opacity 350ms ease-in`,
        transform: flying
          ? `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(${flying ? 18 : 0}deg)`
          : "translate(-50%, -50%)",
      }}
    >
      <span
        className={`inline-block text-4xl leading-none ${landed ? "throw-reaction-land" : ""}`}
        style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}
      >
        {value}
      </span>
    </div>
  );
}
