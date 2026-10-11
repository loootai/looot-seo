import "server-only";
import { NextResponse } from "next/server";
import { cache } from "react";
import { accessFor, hasAllowList, type AccessState } from "@/lib/auth/allowList";
import { rateLimit } from "@/lib/auth/rateLimit";
import { serverSupabase } from "@/lib/supabase/server";

export type Access = { state: AccessState | "signed_out" | "demo"; userId: string | null; email: string | null };

/** Thrown by getStore() when the caller may not read or write data. */
export class AccessError extends Error {
  constructor(public readonly access: Access) {
    super(access.state === "setup" ? "Set LOOOT_SEO_ALLOWED_EMAILS or LOOOT_SEO_ALLOWED_DOMAINS first." : access.state === "denied" ? "Not authorised for this workspace." : "Sign in first.");
  }
}

/** Who is calling and whether the allow-list lets them in. Demo mode is always open. */
export const currentAccess = cache(async (): Promise<Access> => {
  if (process.env.NEXT_PUBLIC_DEMO === "1") return { state: "demo", userId: null, email: null };
  const setup = !hasAllowList();
  let user: { id: string; email?: string | null; email_confirmed_at?: string | null } | null = null;
  try {
    user = (await (await serverSupabase()).auth.getUser()).data.user;
  } catch {
    user = null;
  }
  if (!user) return { state: setup ? "setup" : "signed_out", userId: null, email: null };
  return { state: accessFor(user.email, Boolean(user.email_confirmed_at)), userId: user.id, email: user.email ?? null };
});

/** True when the caller may use data, settings and spending. */
export const isOpen = (a: Access) => a.state === "allowed" || a.state === "demo";

/** The JSON error for a caller who is not let in, or null when they are. */
export function denial(a: Access): NextResponse | null {
  if (isOpen(a)) return null;
  if (a.state === "signed_out") return NextResponse.json({ error: { code: "signed_out", message: "Sign in first." } }, { status: 401 });
  if (a.state === "setup") return NextResponse.json({ error: { code: "setup_required", message: "Set LOOOT_SEO_ALLOWED_EMAILS or LOOOT_SEO_ALLOWED_DOMAINS on the server." } }, { status: 503 });
  return NextResponse.json({ error: { code: "not_authorised", message: "Not authorised for this workspace." } }, { status: 403 });
}

/** Route handler check: returns the error response to send, or null plus the caller to continue. */
export async function guardApi(): Promise<{ response: NextResponse; access: Access } | { response: null; access: Access }> {
  const access = await currentAccess();
  const response = denial(access);
  return response ? { response, access } : { response: null, access };
}

/** Per-user limit for routes that spend or call looot. Returns a 429 response when the user is over it. */
export function limitUser(access: Access, bucket: string, limit: number, windowMs = 60_000): NextResponse | null {
  const wait = rateLimit(`${bucket}:${access.userId ?? "demo"}`, limit, windowMs);
  if (!wait) return null;
  return NextResponse.json({ error: { code: "rate_limited", message: `Too many requests. Try again in ${wait} seconds.` } }, { status: 429, headers: { "Retry-After": String(wait) } });
}
