import { Suspense, lazy, useEffect, useState } from "react";
import { REACTION_EMOJI_LOTTIE } from "./ReactionsPanel";

// Lazy-load lottie-react so the ~85 KB gz of lottie-web only ships when
// the room actually fires a reaction. Initial Home + Room paint stays
// lean — Lottie loads in the background after the first click.
const Lottie = lazy(() => import("lottie-react"));

/**
 * Issue #32 — Google Meet-style rising reaction animation in the lower-left
 * of the screen. The icon + nickname pill rise from the bottom edge while
 * fading out, then the parent removes the floater from its list.
 *
 * Lane allocation lives in `useReactionAnimations` — by the time we render
 * the floater here, the `xLane` is fixed for its whole lifetime.
 *
 * Follow-up to the initial MP4 implementation: emoji floaters render a
 * Lottie animation from `public/reactions-lottie/` (Google Noto Animated
 * Emoji, Apache 2.0). Lottie has a real alpha channel — no more white
 * square on the dark theme. Text glyph stays as the fallback if a peer
 * sends an emoji we don't have an asset for. Time-value chips never use
 * an animation — they're rendered as a labelled pill.
 *
 * JSON fetching: we hit the public URL on mount, but the browser caches it
 * after the first request so subsequent floaters of the same emoji render
 * instantly. The blob is in the ~30–140 KB range per emoji and they sit on
 * the same origin, so this is fast in practice.
 */
interface Props {
  kind: "emoji" | "number";
  value: string;
  nickname: string;
  color: string;
  xLane: number;     // 0..LANE_COUNT-1, the column the floater rises in
}

const LANE_WIDTH_PX = 72;
const LANE_LEFT_OFFSET_PX = 24;
const LOTTIE_SIZE_PX = 72;

// Module-level cache so the same emoji isn't re-fetched and re-parsed for
// every floater. Keyed by URL → parsed Lottie animation data.
const lottieCache: Record<string, object> = {};

export function ReactionFloater({ kind, value, nickname, color, xLane }: Props) {
  const left = LANE_LEFT_OFFSET_PX + xLane * LANE_WIDTH_PX;
  const lottieUrl = kind === "emoji" ? REACTION_EMOJI_LOTTIE[value] : undefined;

  return (
    <div
      data-testid="reaction-floater"
      data-reaction-value={value}
      data-reaction-kind={kind}
      className="fixed pointer-events-none z-30 select-none reactions-float-up"
      style={{
        left: `${left}px`,
        bottom: "0px",
      }}
    >
      <div className="flex flex-col items-center gap-1">
        {lottieUrl ? (
          <LottieEmoji url={lottieUrl} />
        ) : (
          <div className={kind === "emoji" ? "text-5xl leading-none" : "text-2xl font-bold text-white bg-slate-800/80 rounded-xl px-3 py-1 leading-none"}>
            {value}
          </div>
        )}
        <div
          className="text-xs font-semibold text-white px-2 py-0.5 rounded-full shadow"
          style={{ backgroundColor: color }}
        >
          {nickname}
        </div>
      </div>
    </div>
  );
}

/**
 * Inner component that owns the Lottie fetch + render. Split out so the
 * outer floater stays simple and the cached-fetch logic is co-located with
 * its only consumer.
 */
function LottieEmoji({ url }: { url: string }) {
  const [data, setData] = useState<object | null>(() => lottieCache[url] ?? null);

  useEffect(() => {
    if (lottieCache[url]) {
      setData(lottieCache[url]);
      return;
    }
    let cancelled = false;
    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        lottieCache[url] = json;
        if (!cancelled) setData(json);
      })
      .catch(() => { /* If the fetch fails, the parent floater is still
                        visible with the nickname pill — better than nothing. */ });
    return () => { cancelled = true; };
  }, [url]);

  // Reserve the box size even before the JSON loads, so the floater's
  // overall position doesn't jump once the animation arrives.
  return (
    <div
      data-testid="reaction-floater-lottie"
      data-lottie-url={url}
      style={{ width: LOTTIE_SIZE_PX, height: LOTTIE_SIZE_PX }}
    >
      {data && (
        <Suspense fallback={null}>
          <Lottie
            animationData={data}
            loop
            autoplay
            style={{ width: LOTTIE_SIZE_PX, height: LOTTIE_SIZE_PX }}
          />
        </Suspense>
      )}
    </div>
  );
}
