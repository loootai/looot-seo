import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** Demo mode has no accounts, so every route is open and /login goes home. Otherwise the Supabase session decides. */
export async function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEMO === "1") {
    if (request.nextUrl.pathname.startsWith("/login")) {
      const to = request.nextUrl.clone();
      to.pathname = "/";
      to.search = "";
      return NextResponse.redirect(to);
    }
    return NextResponse.next();
  }
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:png|svg|ico|txt)$).*)"],
};
