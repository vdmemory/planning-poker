import { Suspense, lazy, useEffect, useState } from "react";
import { REACTION_EMOJI_LOTTIE } from "./ReactionsPanel";
import { getCachedLottie, preloadLottie } from "./reaction-lottie-cache";

// Lazy-load lottie-react so the ~85 KB gz of lottie-web doesn't sit in the
// main bundle. `ReactionsPanel` warms this chunk on mount (issue #43) so by
// the time the user actually clicks an emoji the chunk is usually already
// in memory — Suspense here is the safety net for cold starts.
const Lottie = lazy(() => import("lottie-react"));

/**
 * Issue #32 — Google Meet-style rising reaction animation in the lower-left
 * of the screen. The icon + nickname pill rise from the bottom edge while
 * fading out, then the parent removes the floater from its list.
 *
 * Lane allocation lives in `useReactionAnimations` — by the time we render
 * the floater here, the `xLane` is fixed for its whole lifetime.
 *
 * Animated emojis render a Lottie animation from
 * `public/reactions-lottie/<codepoint>.json` (Google Noto Animated Emoji,
 * Apache 2.0). Lottie has a real alpha channel — no white square on the
 * dark theme. Text glyph stays as the fallback if a peer sends an emoji
 * we don't have an asset for. Time-value chips never use an animation.
 *
 * Issue #43 follow-up: the Lottie JSON is preloaded by `ReactionsPanel`
 * at room-mount time (`reaction-lottie-cache.ts`), so the synchronous
 * `getCachedLottie` read below usually hits. The effect is the fallback:
 * if preload hasn't finished or failed (e.g. brand-new emoji on a peer
 * client running an older asset set), we trigger a live fetch on the
 * floater's own mount.
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
 * Inner component that owns the Lottie render. The cache lookup is
 * synchronous so on the happy path (panel preload finished) the animation
 * is in the first paint. The effect is the fallback for cache miss.
 */
function LottieEmoji({ url }: { url: string }) {
  const [data, setData] = useState<unknown>(() => getCachedLottie(url) ?? null);

  useEffect(() => {
    if (data) return;
    let cancelled = false;
    preloadLottie(url)
      .then((json) => { if (!cancelled) setData(json); })
      .catch(() => { /* Floater still renders the nickname pill — better
                        than rendering nothing. */ });
    return () => { cancelled = true; };
  }, [url, data]);

  // Reserve the box size even before the JSON loads, so the floater's
  // overall position doesn't jump once the animation arrives.
  return (
    <div
      data-testid="reaction-floater-lottie"
      data-lottie-url={url}
      style={{ width: LOTTIE_SIZE_PX, height: LOTTIE_SIZE_PX }}
    >
      {data ? (
        <Suspense fallback={null}>
          <Lottie
            animationData={data}
            loop
            autoplay
            style={{ width: LOTTIE_SIZE_PX, height: LOTTIE_SIZE_PX }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
