// RequestArrow renders a "→" whose shaft is a dashed line of marching ants —
// the dashes scroll continuously toward the arrowhead to convey a pending,
// in-flight friend request. `dir` only tints it: "in" (incoming, accent) vs
// "out" (sent, muted). The animation pauses for reduced-motion users via the
// global rule in globals.css.
export function RequestArrow({ dir }: { dir: "in" | "out" }) {
  return (
    <svg
      className={`req-arrow req-arrow--${dir}`}
      width={56}
      height={16}
      viewBox="0 0 56 16"
      fill="none"
      aria-hidden="true"
    >
      <line
        className="req-arrow-shaft"
        x1={2}
        y1={8}
        x2={46}
        y2={8}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="6 5"
      />
      <polyline
        points="40,3 48,8 40,13"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
