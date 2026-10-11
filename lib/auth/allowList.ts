/** Who may use this workspace. Pure functions, so the proxy and the server checks share one rule. */

export type AccessState = "allowed" | "denied" | "setup";

/** Splits a comma separated env value into trimmed, lower-case, non-empty entries. */
export function parseList(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** True when the operator set at least one allowed email or domain. */
export function hasAllowList(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseList(env.LOOOT_SEO_ALLOWED_EMAILS).length + parseList(env.LOOOT_SEO_ALLOWED_DOMAINS).length > 0;
}

/**
 * The access rule. With no list set nobody is allowed and the app asks for setup.
 * An email matches exactly (case-insensitive) or by the exact domain after the @. An unconfirmed address never matches.
 */
export function accessFor(email: string | null | undefined, confirmed: boolean, env: NodeJS.ProcessEnv = process.env): AccessState {
  if (!hasAllowList(env)) return "setup";
  if (!email || !confirmed) return "denied";
  const e = email.trim().toLowerCase();
  if (parseList(env.LOOOT_SEO_ALLOWED_EMAILS).includes(e)) return "allowed";
  const at = e.lastIndexOf("@");
  if (at > 0 && parseList(env.LOOOT_SEO_ALLOWED_DOMAINS).includes(e.slice(at + 1))) return "allowed";
  return "denied";
}

/** A same-origin relative path from a user-supplied `next` value, or "/" when it is anything else. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || next.length > 512) return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return "/";
  try {
    const base = "http://local.invalid";
    return new URL(next, base).origin === base ? next : "/";
  } catch {
    return "/";
  }
}
