import "server-only";
import type { DataStore } from "@/lib/data/store";
import { SupabaseStore } from "@/lib/data/supabase";
import { demoStore } from "@/lib/demo/store";
import { IS_DEMO } from "@/lib/env";
import { serverSupabase } from "@/lib/supabase/server";

/** The data layer for this request: the seeded in-memory store in demo mode, Supabase as the signed-in user otherwise. */
export async function getStore(): Promise<DataStore> {
  if (IS_DEMO) return demoStore();
  return new SupabaseStore(await serverSupabase());
}

export type { DataStore } from "@/lib/data/store";
