// Single chevron used by the sidebar collapse toggle. Points left by default
// (collapse); the button flips it horizontally via CSS when collapsed (expand).
export function ChevronIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      className="chevron-ico"
    >
      <polyline points="12 5 7 10 12 15" />
    </svg>
  );
}
