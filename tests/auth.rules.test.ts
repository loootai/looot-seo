import { afterEach, describe, expect, it, vi } from "vitest";
import { accessFor, safeNextPath } from "@/lib/auth/allowList";
import { rateLimit, resetRateLimits } from "@/lib/auth/rateLimit";
import { startRun, createQuote, type QuoteResponse } from "@/lib/looot/service";
import { fallbackPrices } from "@/lib/looot/catalog";
import { mockRunner, seededStore } from "./helpers";

afterEach(() => {
  vi.unstubAllEnvs();
  resetRateLimits();
});

describe("allow-list rule", () => {
  const env = (e: string, d = "") => ({ LOOOT_SEO_ALLOWED_EMAILS: e, LOOOT_SEO_ALLOWED_DOMAINS: d }) as unknown as NodeJS.ProcessEnv;
  it("asks for setup when nothing is set", () => expect(accessFor("a@b.co", true, env(""))).toBe("setup")); // leak-scan:allow
  it("matches an email exactly, ignoring case and spaces", () => {
    expect(accessFor("Owner@Example.com", true, env(" owner@example.com , x@y.co"))).toBe("allowed"); // leak-scan:allow
    expect(accessFor("owner2@example.com", true, env("owner@example.com"))).toBe("denied");
    expect(accessFor("owner@example.com.evil.test", true, env("owner@example.com"))).toBe("denied"); // leak-scan:allow
  });
  it("matches a domain exactly, not a subdomain or a suffix", () => {
    expect(accessFor("a@corp.io", true, env("", "corp.io"))).toBe("allowed"); // leak-scan:allow
    expect(accessFor("a@sub.corp.io", true, env("", "corp.io"))).toBe("denied"); // leak-scan:allow
    expect(accessFor("a@evilcorp.io", true, env("", "corp.io"))).toBe("denied"); // leak-scan:allow
  });
  it("never allows an unconfirmed address", () => expect(accessFor("a@corp.io", false, env("a@corp.io"))).toBe("denied")); // leak-scan:allow
});

describe("open redirect", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNextPath("/costs?x=1")).toBe("/costs?x=1");
    expect(safeNextPath(null)).toBe("/");
  });
  it.each(["//evil.test", "https://evil.test", "/\\evil.test", "javascript:alert(1)", "evil.test", "/\n//evil.test", "/\t/evil.test"])("rejects %s", (v) => expect(safeNextPath(v)).toBe("/"));
});

describe("rate limit", () => {
  it("allows the limit, then refuses with a wait time, then frees up", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("u", 3, 60_000, 1000 + i)).toBe(0);
    expect(rateLimit("u", 3, 60_000, 1010)).toBeGreaterThan(0);
    expect(rateLimit("other", 3, 60_000, 1010)).toBe(0);
    expect(rateLimit("u", 3, 60_000, 62_000)).toBe(0);
  });
});

describe("spend cap", () => {
  const quoted = async () => {
    const s = await seededStore(3, 10);
    const q = (await createQuote(s.store, { projectId: s.project.id, action: "check_rankings" }, { price: fallbackPrices, simulated: false })).body as QuoteResponse;
    return { ...s, quote: q };
  };
  it("never takes a cap above the quote from the caller", async () => {
    const { store, quote } = await quoted();
    const r = await startRun(store, { quoteId: quote.quoteId, maxCostMicros: 10 ** 12, idempotencyKey: "key-huge-cap" }, { client: mockRunner(), simulated: false, schedule: () => undefined });
    expect(r.status).toBe(422);
  });
  it("refuses a run above the server ceiling, whatever the caller asks", async () => {
    const { store, quote } = await quoted();
    const r = await startRun(store, { quoteId: quote.quoteId, maxCostMicros: quote.total, idempotencyKey: "key-ceiling" }, { client: mockRunner(), simulated: false, schedule: () => undefined, maxRunMicros: 1000 } as never);
    expect(r.status).toBe(422);
    expect((r.body as { error: { code: string } }).error.code).toBe("cap_above_limit");
  });
  it("replays the same run for the same idempotency key", async () => {
    const { store, quote } = await quoted();
    const deps = { client: mockRunner(), simulated: false, schedule: () => undefined };
    const a = await startRun(store, { quoteId: quote.quoteId, maxCostMicros: quote.total, idempotencyKey: "key-stable-1" }, deps);
    const b = await startRun(store, { quoteId: quote.quoteId, maxCostMicros: quote.total, idempotencyKey: "key-stable-1" }, deps);
    expect(b.status).toBe(200);
    expect((b.body as { runId: string }).runId).toBe((a.body as { runId: string }).runId);
  });
});
