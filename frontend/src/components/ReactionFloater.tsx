/**
 * Issue #32 — Google Meet-style rising reaction animation in the lower-left
 * of the screen. The icon + nickname pill rise from the bottom edge while
 * fading out, then the parent removes the floater from its list.
 *
 * Lane allocation lives in `useReactionFloaters` — by the time we render the
 * floater here, the `xLane` is fixed for its whole lifetime.
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

export function ReactionFloater({ kind, value, nickname, color, xLane }: Props) {
  const left = LANE_LEFT_OFFSET_PX + xLane * LANE_WIDTH_PX;
  return (
    <div
      data-testid="reaction-floater"
      data-reaction-value={value}
      className="fixed pointer-events-none z-30 select-none reactions-float-up"
      style={{
        left: `${left}px`,
        bottom: "0px",
      }}
    >
      <div className="flex flex-col items-center gap-1">
        <div className={kind === "emoji" ? "text-5xl leading-none" : "text-2xl font-bold text-white bg-slate-800/80 rounded-xl px-3 py-1 leading-none"}>
          {value}
        </div>
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
