import { vi } from "vitest";

export interface FakeUser {
  id: string;
  email: string;
  email_confirmed_at: string | null;
}

export const state: { user: FakeUser | null } = { user: null };

export const owner: FakeUser = { id: "u-owner", email: "owner@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };
export const stranger: FakeUser = { id: "u-stranger", email: "stranger@evil.test", email_confirmed_at: "2026-01-01T00:00:00Z" }; // leak-scan:allow

/** A Supabase client stand-in. Auth answers from `state`; any table access throws, so a request that gets past the gate fails loudly on its own. */
export function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: state.user } }), signOut: async () => ({}), exchangeCodeForSession: async () => ({ error: null }) },
    from: () => {
      throw new Error("db reached");
    },
  };
}

/** Sets the environment for one case. Pass null for no allow-list. */
export function setEnv(list: { emails?: string; domains?: string } | null) {
  vi.stubEnv("NEXT_PUBLIC_DEMO", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("LOOOT_TOKEN", "");
  vi.stubEnv("LOOOT_SEO_ALLOWED_EMAILS", list?.emails ?? "");
  vi.stubEnv("LOOOT_SEO_ALLOWED_DOMAINS", list?.domains ?? "");
}
