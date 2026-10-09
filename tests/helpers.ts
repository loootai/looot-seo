import { readFileSync } from "node:fs";
import path from "node:path";
import { MemoryStore } from "@/lib/data/memory";
import type { LoootRun, LoootRunner } from "@/lib/looot/client";
import { fallbackPrice } from "@/lib/looot/catalog";
import type { CallItem } from "@/lib/types";

export const fixture = (name: string): unknown => JSON.parse(readFileSync(path.resolve(import.meta.dirname, "fixtures", `${name}.json`), "utf8"));

export interface Call {
  endpointId: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
}

/** A looot runner that records every call and answers from `answer`. By default each call completes at its catalog price. */
export function mockRunner(answer?: (call: Call, n: number) => Partial<LoootRun> | Promise<Partial<LoootRun>>): LoootRunner & { calls: Call[]; polls: string[] } {
  const calls: Call[] = [];
  const polls: string[] = [];
  return {
    calls,
    polls,
    async run(endpointId, input, idempotencyKey) {
      const call = { endpointId, input, idempotencyKey };
      calls.push(call);
      const a = (await answer?.(call, calls.length)) ?? {};
      return { runId: `run_${calls.length}`, status: "completed", result: fixture("serper-search"), actualCost: fallbackPrice(endpointId) / 1_000_000, ...a };
    },
    async getRun(runId) {
      polls.push(runId);
      return { runId, status: "completed", actualCost: 0.001, result: fixture("serper-search") };
    },
  };
}

/** `n` one-page rank check items at $0.001 each. */
export function serpItems(n: number): CallItem[] {
  return Array.from({ length: n }, (_, i) => ({ itemKey: `kw:k${i + 1}:p1`, lineKey: "rank", group: `kw:k${i + 1}`, operationId: "serper-search", input: { q: `keyword ${i + 1}`, gl: "us", hl: "en", page: 1 }, unitPriceMicros: 1000 }));
}

/** A store with one project at depth 10 and `count` keywords. */
export async function seededStore(count = 3, depth: 10 | 20 | 30 | 50 = 10) {
  const store = new MemoryStore();
  const project = await store.createProject({ name: "Kestrel", domain: "kestrelcoffee.co", country: "US", language: "en", location_name: "United States", depth, include_subdomains: false, serp_operation: "serper-search" });
  await store.addKeywords(project.id, Array.from({ length: count }, (_, i) => `keyword ${i + 1}`), []);
  return { store, project, keywords: await store.listKeywords(project.id) };
}

/** Collects scheduled work so a test can wait for the run to end. */
export function scheduler() {
  const jobs: Promise<void>[] = [];
  return { schedule: (work: () => Promise<void>) => void jobs.push(work()), done: () => Promise.all(jobs) };
}
