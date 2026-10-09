import { IS_DEMO } from "@/lib/env";

export type ForcedState = "empty" | "loading" | "error" | null;

/** Demo only: ?state=empty, loading or error shows that state of a screen so it can be reviewed. Ignored otherwise. */
export function forcedState(searchParams: Record<string, string | string[] | undefined>): ForcedState {
  if (!IS_DEMO) return null;
  const s = searchParams.state;
  return s === "empty" || s === "loading" || s === "error" ? s : null;
}
