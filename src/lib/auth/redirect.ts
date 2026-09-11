/**
 * Redirect validation.
 *
 * A `next` parameter is attacker-controllable: anyone can send a user a link
 * to our own sign-in page carrying `?next=https://evil.example`. Accepting it
 * unchecked turns our login into an open redirect, which is exactly the shape
 * phishing wants — a real domain in the address bar that bounces elsewhere
 * after a real sign-in.
 *
 * Only same-origin, absolute *paths* are allowed through.
 */
export function safeRedirect(
  next: string | null | undefined,
  fallback = "/auth/workspace",
): string {
  if (!next) return fallback;

  // Must be a path, not a URL. This rejects https://…, //evil.example
  // (protocol-relative), and anything with a scheme such as javascript:.
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;

  // Backslashes are treated as slashes by some browsers, so \\evil.example
  // would otherwise slip past the check above.
  if (next.includes("\\")) return fallback;

  return next;
}
