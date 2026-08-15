/**
 * Defence-in-depth for user-supplied URLs rendered into an <a href>.
 *
 * A stored value like `javascript:alert(document.cookie)` becomes script
 * execution the moment a user clicks the link, so we never trust a raw URL in
 * an href. The backend should already constrain these, but the client must not
 * rely on that alone.
 *
 * Returns the URL only when it parses to an http(s) absolute URL; otherwise
 * returns undefined so callers can drop the href (or the link entirely).
 */
export function safeHttpUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  let parsed: URL;
  try {
    // Absolute URLs only — a relative string would resolve against the current
    // origin and is not a meaningful external profile link.
    parsed = new URL(raw);
  } catch {
    return undefined;
  }
  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    return parsed.href;
  }
  return undefined;
}
