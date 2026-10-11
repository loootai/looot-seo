"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getStore } from "@/lib/data";
import { IS_DEMO } from "@/lib/env";
import { MAX_BUDGET_MICROS } from "@/lib/looot/budget";
import { SERP_OPERATIONS } from "@/lib/looot/catalog";
import { toMicros } from "@/lib/money";
import { DEPTHS, locationNameFor } from "@/lib/markets";
import { serverSupabase } from "@/lib/supabase/server";
import type { Depth, UserDefaults } from "@/lib/types";
import { isValidDomain, normaliseDomain, parseKeywordLines } from "@/lib/utils";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({ ok: false, error: e instanceof Error && e.message ? e.message : fallback });
const done = () => revalidatePath("/", "layout");

export interface ProjectInput {
  domain: string;
  name: string;
  country: string;
  language: string;
  depth: number;
  includeSubdomains: boolean;
  keywords?: string;
  serpOperation?: string;
}

function checkProject(input: ProjectInput): { ok: false; error: string } | null {
  if (!isValidDomain(normaliseDomain(input.domain))) return { ok: false, error: "Enter a domain such as example.com." };
  if (!(DEPTHS as readonly number[]).includes(input.depth)) return { ok: false, error: "Depth must be 10, 20, 30 or 50." };
  if (!/^[A-Za-z]{2}$/.test(input.country) || !/^[a-z]{2}$/.test(input.language)) return { ok: false, error: "Pick a country and a language." };
  return null;
}

/** Creates a project and its first keywords. Spends nothing. */
export async function createProject(input: ProjectInput): Promise<ActionResult<{ id: string }>> {
  const bad = checkProject(input);
  if (bad) return bad;
  try {
    const store = await getStore();
    const domain = normaliseDomain(input.domain);
    const defaults = await store.getDefaults();
    const project = await store.createProject({ name: input.name.trim() || domain, domain, country: input.country.toUpperCase(), language: input.language, location_name: locationNameFor(input.country), depth: input.depth as Depth, include_subdomains: input.includeSubdomains, serp_operation: defaults.serp_operation });
    const phrases = parseKeywordLines(input.keywords ?? "");
    if (phrases.length) await store.addKeywords(project.id, phrases, []);
    done();
    return { ok: true, id: project.id };
  } catch (e) {
    return fail(e, "The project could not be created.");
  }
}

/** Updates a project's settings. */
export async function updateProject(id: string, input: ProjectInput): Promise<ActionResult> {
  const bad = checkProject(input);
  if (bad) return bad;
  try {
    const store = await getStore();
    const serp = (SERP_OPERATIONS as readonly string[]).includes(input.serpOperation ?? "") ? (input.serpOperation as string) : undefined;
    await store.updateProject(id, { name: input.name.trim() || normaliseDomain(input.domain), domain: normaliseDomain(input.domain), country: input.country.toUpperCase(), language: input.language, location_name: locationNameFor(input.country), depth: input.depth as Depth, include_subdomains: input.includeSubdomains, ...(serp ? { serp_operation: serp } : {}) });
    done();
    return { ok: true };
  } catch (e) {
    return fail(e, "The project could not be saved.");
  }
}

/** Deletes a project and every row under it. */
export async function deleteProject(id: string): Promise<ActionResult> {
  try {
    await (await getStore()).deleteProject(id);
    done();
    return { ok: true };
  } catch (e) {
    return fail(e, "The project could not be deleted.");
  }
}

/** Adds keywords to a project, skipping ones already tracked. Free: it only adds rows. */
export async function addKeywords(projectId: string, text: string, tags: string[]): Promise<ActionResult<{ added: number; skipped: number }>> {
  try {
    const phrases = parseKeywordLines(text);
    if (phrases.length === 0) return { ok: false, error: "Add at least one keyword, one per line." };
    if (phrases.length > 500) return { ok: false, error: "Add at most 500 keywords at a time." };
    const res = await (await getStore()).addKeywords(projectId, phrases, tags.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8));
    done();
    return { ok: true, ...res };
  } catch (e) {
    return fail(e, "The keywords could not be added.");
  }
}

/** Changes tags, target URL or the AI Overview switch on one or more keywords. */
export async function updateKeywords(ids: string[], patch: { tags?: string[]; target_url?: string | null; track_ai_overview?: boolean }): Promise<ActionResult> {
  try {
    const clean: typeof patch = {};
    if (patch.tags) clean.tags = [...new Set(patch.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
    if (patch.target_url !== undefined) clean.target_url = patch.target_url?.trim() ? patch.target_url.trim() : null;
    if (patch.track_ai_overview !== undefined) clean.track_ai_overview = patch.track_ai_overview;
    await (await getStore()).updateKeywords(ids, clean);
    done();
    return { ok: true };
  } catch (e) {
    return fail(e, "The keyword could not be saved.");
  }
}

/** Stops tracking keywords. Their history stays in the database. */
export async function removeKeywords(ids: string[]): Promise<ActionResult> {
  try {
    await (await getStore()).removeKeywords(ids);
    done();
    return { ok: true };
  } catch (e) {
    return fail(e, "The keywords could not be removed.");
  }
}

/** Adds one or more competitor domains to a project, up to 8 in total. */
export async function addCompetitors(projectId: string, domains: string[]): Promise<ActionResult<{ added: number }>> {
  try {
    const store = await getStore();
    const project = await store.getProject(projectId);
    let added = 0;
    for (const raw of domains) {
      const domain = normaliseDomain(raw);
      if (!isValidDomain(domain)) return { ok: false, error: `"${raw}" is not a domain. Enter one such as example.com.` };
      if (domain === project?.domain) return { ok: false, error: "That is the project's own domain." };
      await store.addCompetitor(projectId, domain);
      added += 1;
    }
    done();
    return { ok: true, added };
  } catch (e) {
    return fail(e, "The competitor could not be added.");
  }
}

/** Removes a competitor and its stored overlap. */
export async function removeCompetitor(id: string): Promise<ActionResult> {
  try {
    await (await getStore()).removeCompetitor(id);
    done();
    return { ok: true };
  } catch (e) {
    return fail(e, "The competitor could not be removed.");
  }
}

/** Adds a dated note that shows as a marker on the distribution chart. */
export async function addChartNote(projectId: string, notedOn: string, body: string): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(notedOn)) return { ok: false, error: "Pick a date." };
  if (!body.trim() || body.length > 140) return { ok: false, error: "Write a note of 1 to 140 characters." };
  try {
    await (await getStore()).addChartNote(projectId, notedOn, body.trim());
    done();
    return { ok: true };
  } catch (e) {
    return fail(e, "The note could not be saved.");
  }
}

/** Saves the defaults new projects start with. */
export async function saveDefaults(d: UserDefaults): Promise<ActionResult> {
  if (!(DEPTHS as readonly number[]).includes(d.depth) || !(SERP_OPERATIONS as readonly string[]).includes(d.serp_operation)) return { ok: false, error: "Those defaults are not valid." };
  try {
    await (await getStore()).setDefaults(d);
    done();
    return { ok: true };
  } catch (e) {
    return fail(e, "The defaults could not be saved.");
  }
}

/**
 * Saves the daily and monthly budget, in dollars. This is the only place a budget changes: the run
 * route reads the stored values and ignores anything in the request body.
 */
export async function saveBudgets(dailyUsd: number, monthlyUsd: number): Promise<ActionResult> {
  const daily = toMicros(dailyUsd);
  const monthly = toMicros(monthlyUsd);
  if (![dailyUsd, monthlyUsd].every(Number.isFinite) || daily < 0 || monthly < 0 || daily > MAX_BUDGET_MICROS || monthly > MAX_BUDGET_MICROS) return { ok: false, error: "Enter amounts from 0 to 9999 dollars." };
  try {
    await (await getStore()).setBudgets(daily, monthly);
    done();
    return { ok: true };
  } catch (e) {
    return fail(e, "The budget could not be saved.");
  }
}

/** Removes every row the signed-in user owns. The typed confirmation is checked on the server too. */
export async function deleteMyData(confirmation: string): Promise<ActionResult> {
  if (confirmation !== "delete my data") return { ok: false, error: 'Type "delete my data" to confirm.' };
  try {
    await (await getStore()).deleteAllData();
    done();
    return { ok: true };
  } catch (e) {
    return fail(e, "Your data could not be deleted.");
  }
}

/** Ends the session and goes to the sign-in page. */
export async function signOut(): Promise<void> {
  if (!IS_DEMO) await (await serverSupabase()).auth.signOut();
  redirect(IS_DEMO ? "/" : "/login");
}
