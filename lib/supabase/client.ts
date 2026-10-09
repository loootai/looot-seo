import { createBrowserClient } from "@supabase/ssr";

/** Supabase client for the browser. Uses the public anon key; row level security does the rest. */
export function browserSupabase() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string);
}
