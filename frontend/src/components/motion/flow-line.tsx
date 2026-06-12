/**
 * FlowLine — 破線が流れる装飾ライン（マーチングドット）。
 * viewBox を引き伸ばして任意の幅/長さに使え、回転は className（rotate-*）で。
 * stroke は currentColor なので text-* で色を、opacity-* で濃さを指定する。
 * 動き（流れ）は globals.css の `.flow-dash`（reduced-motion で停止）。aria-hidden。
 */
export function FlowLine({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 2"
      preserveAspectRatio="none"
      className={`pointer-events-none ${className}`}
    >
      <line
        x1="0"
        y1="1"
        x2="100"
        y2="1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2 5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="flow-dash"
      />
    </svg>
  );
}
