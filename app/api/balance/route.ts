import { NextResponse } from "next/server";
import { guardApi } from "@/lib/auth/guard";
import { IS_DEMO } from "@/lib/env";
import { hasLoootToken, readBalance } from "@/lib/looot/server";

export const dynamic = "force-dynamic";

/** Says whether a looot token is set and, if so, the balance. Free: it calls Balance only. The token is never returned. */
export async function GET() {
  const gate = await guardApi();
  if (gate.response) return gate.response;
  if (IS_DEMO) return NextResponse.json({ demo: true, hasToken: false, balanceMicros: null });
  const balance = hasLoootToken() ? await readBalance() : null;
  return NextResponse.json({ demo: false, hasToken: hasLoootToken(), balanceMicros: balance?.availableMicros ?? null, reservedMicros: balance?.reservedMicros ?? null, reachable: !hasLoootToken() || balance !== null });
}
