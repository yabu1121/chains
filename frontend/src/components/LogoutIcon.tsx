// Door-with-arrow "sign out" glyph, same monoline language as the nav icons.
// Used by the mobile header and the collapsed-sidebar footer.
export function LogoutIcon() {
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
    >
      <path d="M8 4 H5 a1 1 0 0 0 -1 1 v10 a1 1 0 0 0 1 1 h3" />
      <polyline points="12 7 15 10 12 13" />
      <line x1="15" y1="10" x2="8" y2="10" />
    </svg>
  );
}
