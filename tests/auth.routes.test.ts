import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeClient, owner, setEnv, state, stranger } from "./auth.helpers";

vi.mock("@/lib/supabase/server", () => ({ serverSupabase: async () => fakeClient() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => fakeClient() }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));

const root = path.resolve(import.meta.dirname, "..");

/** Every route.ts under app/api, with the methods it exports. Built from the files, so a new route is covered without editing this test. */
function routeMap() {
  const out: { file: string; url: string; methods: string[] }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(path.join(root, dir))) {
      const rel = path.join(dir, name);
      if (statSync(path.join(root, rel)).isDirectory()) walk(rel);
      else if (name === "route.ts") {
        const src = readFileSync(path.join(root, rel), "utf8");
        const methods = [...src.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
        out.push({ file: rel, url: "/" + path.dirname(rel).replace(/^app\//, "").replace(/\[[^\]]+\]/g, "x"), methods });
      }
    }
  };
  walk("app/api");
  return out;
}

const routes = routeMap();
const call = async (file: string, method: string, url: string) => {
  const mod = (await import(/* @vite-ignore */ path.join(root, file))) as Record<string, (r: Request, c: unknown) => Promise<Response>>;
  const req = new Request(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });
  try {
    return await mod[method](req, { params: Promise.resolve({ id: "x" }) });
  } catch (e) {
    return e as Error;
  }
};
const statusOf = (r: Response | Error) => (r instanceof Response ? r.status : 0);

beforeEach(() => {
  vi.resetModules();
  state.user = null;
});
afterEach(() => vi.unstubAllEnvs());

describe("route map", () => {
  it("finds the api routes", () => {
    expect(routes.length).toBeGreaterThanOrEqual(4);
    expect(routes.every((r) => r.methods.length > 0)).toBe(true);
  });

  for (const { file, url, methods } of routes) {
    for (const method of methods) {
      describe(`${method} ${url}`, () => {
        it("is closed when not signed in (401)", async () => {
          setEnv({ emails: "owner@example.com" });
          expect(statusOf(await call(file, method, url))).toBe(401);
        });
        it("is closed for a signed-in user who is not on the list (403)", async () => {
          setEnv({ emails: "owner@example.com" });
          state.user = stranger;
          expect(statusOf(await call(file, method, url))).toBe(403);
        });
        it("is closed for an address that is not confirmed (403)", async () => {
          setEnv({ emails: "owner@example.com" });
          state.user = { ...owner, email_confirmed_at: null };
          expect(statusOf(await call(file, method, url))).toBe(403);
        });
        it("is closed with 503 when no allow-list is set, even for a signed-in user", async () => {
          setEnv(null);
          state.user = owner;
          expect(statusOf(await call(file, method, url))).toBe(503);
        });
        it("is open for a user on the list", async () => {
          setEnv({ emails: "OWNER@example.com" });
          state.user = owner;
          expect([401, 403, 503]).not.toContain(statusOf(await call(file, method, url)));
        });
        it("is open for a user on an allowed domain", async () => {
          setEnv({ domains: "example.com" });
          state.user = owner;
          expect([401, 403, 503]).not.toContain(statusOf(await call(file, method, url)));
        });
      });
    }
  }

  it("has no cron or webhook route without a secret check", () => {
    const bad = routes.filter((r) => /cron|webhook/i.test(r.file) && !/timingSafeEqual/.test(readFileSync(path.join(root, r.file), "utf8")));
    expect(bad).toEqual([]);
  });
});

describe("server actions", () => {
  const args: Record<string, unknown[]> = {
    createProject: [{ domain: "example.com", name: "n", country: "US", language: "en", depth: 10, includeSubdomains: false }],
    updateProject: ["p", { domain: "example.com", name: "n", country: "US", language: "en", depth: 10, includeSubdomains: false }],
    deleteProject: ["p"],
    addKeywords: ["p", "one", []],
    updateKeywords: [["k"], { tags: [] }],
    removeKeywords: [["k"]],
    addCompetitors: ["p", ["rival.com"]],
    removeCompetitor: ["c"],
    addChartNote: ["p", "2026-01-01", "note"],
    saveDefaults: [{ depth: 10, serp_operation: "serper-search" }],
  saveBudgets: [5, 50],
    deleteMyData: ["delete my data"],
  };
  const exported = [...readFileSync(path.join(root, "app/actions.ts"), "utf8").matchAll(/export async function (\w+)/g)].map((m) => m[1]).filter((n) => n !== "signOut");

  it("has a case for every exported action", () => {
    expect(Object.keys(args).sort()).toEqual([...exported].sort());
  });

  const refused = (r: unknown) => typeof r === "object" && r !== null && (r as { ok: boolean }).ok === false && /not authorised|sign in|LOOOT_SEO_ALLOWED/i.test((r as { error: string }).error);
  for (const name of Object.keys(args)) {
    it(`${name} refuses a signed-out user, a stranger and a missing allow-list`, async () => {
      const actions = (await import("@/app/actions")) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
      setEnv({ emails: "owner@example.com" });
      expect(refused(await actions[name](...args[name]))).toBe(true);
      state.user = stranger;
      expect(refused(await actions[name](...args[name]))).toBe(true);
      setEnv(null);
      state.user = owner;
      expect(refused(await actions[name](...args[name]))).toBe(true);
    });
  }
});

describe("proxy", () => {
  const run = async (p: string, accept = "text/html") => {
    const { proxy } = await import("@/proxy");
    const { NextRequest } = await import("next/server");
    return proxy(new NextRequest(`http://localhost${p}`, { headers: { accept } }));
  };
  const where = (r: Response) => new URL(r.headers.get("location") ?? "http://x/none").pathname;

  it("sends a signed-out visitor to /login", async () => {
    setEnv({ emails: "owner@example.com" });
    expect(where(await run("/"))).toBe("/login");
  });
  it("sends a stranger to /not-authorised", async () => {
    setEnv({ emails: "owner@example.com" });
    state.user = stranger;
    expect(where(await run("/costs"))).toBe("/not-authorised");
  });
  it("sends everyone to /setup when no allow-list is set", async () => {
    setEnv(null);
    state.user = owner;
    expect(where(await run("/"))).toBe("/setup");
    state.user = null;
    expect(where(await run("/"))).toBe("/setup");
  });
  it("lets the owner through", async () => {
    setEnv({ emails: "owner@example.com" });
    state.user = owner;
    expect((await run("/")).status).toBe(200);
  });
  it("keeps login, setup, not-authorised and the auth callback reachable", async () => {
    setEnv({ emails: "owner@example.com" });
    for (const p of ["/login", "/setup", "/not-authorised", "/auth/callback"]) expect((await run(p)).status).toBe(200);
  });
  it("demo mode is open on every route", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO", "1");
    for (const p of ["/", "/costs", "/settings", "/api/balance"]) expect((await run(p)).status).toBe(200);
  });
});
