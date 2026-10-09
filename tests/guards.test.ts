import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(path.join(root, dir))) {
    const rel = path.join(dir, name);
    if (statSync(path.join(root, rel)).isDirectory()) files(rel, out);
    else if (/\.(ts|tsx|css|sql|mjs)$/.test(name)) out.push(rel);
  }
  return out;
}
const source = ["app", "components", "lib"].flatMap((d) => files(d));
const read = (f: string) => readFileSync(path.join(root, f), "utf8");

describe("repo rules", () => {
  it("calls looot runs only from lib/looot", () => {
    expect(source.filter((f) => read(f).includes("v1/runs") && !f.startsWith("lib/looot/"))).toEqual([]);
  });

  it("reads LOOOT_TOKEN from the environment in lib/looot/server.ts only, behind server-only", () => {
    expect(source.filter((f) => /process\.env\.LOOOT_TOKEN/.test(read(f)))).toEqual(["lib/looot/server.ts"]);
    expect(read("lib/looot/server.ts").startsWith('import "server-only";')).toBe(true);
    expect(source.filter((f) => /NEXT_PUBLIC_[A-Z_]*(TOKEN|SECRET|SERVICE)/.test(read(f)))).toEqual([]);
  });

  it("has no service-role key anywhere", () => {
    expect([...source, ...files("supabase")].filter((f) => /service_role|SERVICE_ROLE/.test(read(f)))).toEqual([]);
  });

  it("every paid button goes through the quote dialog: only it posts to /api/runs", () => {
    expect(source.filter((f) => /["'`]\/api\/runs["'`]/.test(read(f)))).toEqual(["components/quote/QuoteProvider.tsx"]);
  });

  it("has no placeholder text and no emoji", () => {
    const bad = /lorem|\bAcme\b|John Doe|[\u{1F300}-\u{1FAFF}]/iu;
    expect(source.filter((f) => bad.test(read(f)))).toEqual([]);
  });

  it("enables and forces row level security on every table of the migration", () => {
    const sql = read("supabase/migrations/0001_init.sql");
    const tables = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/g)].map((m) => m[1]);
    expect(tables).toHaveLength(14);
    for (const t of tables) {
      expect(sql, t).toMatch(new RegExp(`alter table public\\.${t} enable row level security`));
      expect(sql, t).toMatch(new RegExp(`alter table public\\.${t} force row level security`));
    }
    expect(sql).toMatch(/actual_cost_micros <= max_cost_micros/);
    expect(sql).toMatch(/max_cost_micros <= quoted_micros/);
  });
});
