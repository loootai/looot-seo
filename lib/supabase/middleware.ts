import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { accessFor, hasAllowList } from "@/lib/auth/allowList";

/** Refreshes the Supabase session cookie, sends signed-out visitors to /login, and closes everything to users who are not on the allow-list. */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;
  const open = path.startsWith("/login") || path.startsWith("/auth/") || path === "/setup" || path === "/not-authorised";
  const api = path.startsWith("/api/");
  const goTo = (to: string) => {
    const u = request.nextUrl.clone();
    u.pathname = to;
    u.search = "";
    return NextResponse.redirect(u);
  };
  // No allow-list means nobody is let in. The operator sees a setup page and every API answers 503.
  if (!open && !hasAllowList()) return api ? NextResponse.json({ error: { code: "setup_required", message: "Set LOOOT_SEO_ALLOWED_EMAILS or LOOOT_SEO_ALLOWED_DOMAINS on the server." } }, { status: 503 }) : goTo("/setup");
  if (!url || !key) {
    if (open) return response;
    // With no Supabase settings nobody can be signed in, so no API route answers.
    if (path.startsWith("/api/")) return NextResponse.json({ error: { code: "not_configured", message: "Supabase is not set up on this server." } }, { status: 503 });
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "?setup=1";
    return NextResponse.redirect(to);
  }
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  let user: unknown = null;
  try {
    user = (await supabase.auth.getUser()).data.user;
  } catch {
    user = null;
  }
  if (!user && !open) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: { code: "signed_out", message: "Sign in first." } }, { status: 401 });
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    return NextResponse.redirect(to);
  }
  if (user && !open) {
    const u = user as { email?: string | null; email_confirmed_at?: string | null };
    if (accessFor(u.email, Boolean(u.email_confirmed_at)) !== "allowed") return api ? NextResponse.json({ error: { code: "not_authorised", message: "Not authorised for this workspace." } }, { status: 403 }) : goTo("/not-authorised");
  }
  return response;
}
