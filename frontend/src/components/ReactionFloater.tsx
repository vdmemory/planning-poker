import { REACTION_EMOJI_VIDEO } from "./ReactionsPanel";

/**
 * Issue #32 — Google Meet-style rising reaction animation in the lower-left
 * of the screen. The icon + nickname pill rise from the bottom edge while
 * fading out, then the parent removes the floater from its list.
 *
 * Lane allocation lives in `useReactionAnimations` — by the time we render
 * the floater here, the `xLane` is fixed for its whole lifetime.
 *
 * Issue #32 follow-up: emoji floaters render an animated MP4 from
 * `public/reactions/` when one is available for the emoji's codepoint. The
 * text glyph stays as the fallback if a mapping is missing (e.g. a peer on
 * an older client sends an emoji we don't have an asset for). Time-value
 * chips never use a video — they're rendered as a labelled pill.
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
const VIDEO_SIZE_PX = 64;

export function ReactionFloater({ kind, value, nickname, color, xLane }: Props) {
  const left = LANE_LEFT_OFFSET_PX + xLane * LANE_WIDTH_PX;
  const videoSrc = kind === "emoji" ? REACTION_EMOJI_VIDEO[value] : undefined;

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
        {videoSrc ? (
          // Animated MP4 — autoplay+muted is required for autoplay without a
          // user gesture; playsInline keeps it from going full-screen on
          // iOS. `loop` matters here because REACTION_FLOATER_MS (3.5s) is
          // longer than the source clips (~1-2s).
          <video
            data-testid="reaction-floater-video"
            src={videoSrc}
            width={VIDEO_SIZE_PX}
            height={VIDEO_SIZE_PX}
            autoPlay
            muted
            loop
            playsInline
            // `preload=auto` so the first reaction doesn't lag while the
            // file streams in — these clips are ~15-25 KB each, cheap.
            preload="auto"
            className="leading-none"
            style={{ width: VIDEO_SIZE_PX, height: VIDEO_SIZE_PX }}
          />
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
