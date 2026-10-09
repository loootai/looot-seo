/** True when the app runs on seeded data with no Supabase project and no looot token. */
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

/** True when both public Supabase settings are present. */
export function hasSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
