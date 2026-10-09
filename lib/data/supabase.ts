import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataStore, KeywordPatch, NewProject, NewRun, RunItemPatch, RunPatch, SnapshotRef } from "@/lib/data/store";
import { findPosition } from "@/lib/seo/position";
import type { BacklinkSnapshot, CallItem, ChartNote, Competitor, CompetitorOverlap, DomainOverview, Keyword, KeywordMetric, OrganicRow, Project, Quote, RankCheck, ResearchRun, Run, RunItem, SerpSnapshot, SnapshotLite, UserDefaults } from "@/lib/types";
import { normalisePhrase } from "@/lib/utils";

const DEFAULTS: UserDefaults = { depth: 30, country: "US", language: "en", serp_operation: "serper-search" };

/** Error from Postgres with its code kept, so callers can tell a unique violation from the rest. */
export class DataError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new DataError(res.error.message, res.error.code);
  return res.data as T;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** DataStore on Supabase. Every query runs with the signed-in user's session, so row level security scopes it. */
export class SupabaseStore implements DataStore {
  constructor(private readonly db: SupabaseClient) {}

  now(): string {
    return new Date().toISOString();
  }
  async userEmail() {
    return (await this.db.auth.getUser()).data.user?.email ?? null;
  }
  async getDefaults(): Promise<UserDefaults> {
    const meta = (await this.db.auth.getUser()).data.user?.user_metadata as { seo_defaults?: Partial<UserDefaults> } | undefined;
    return { ...DEFAULTS, ...(meta?.seo_defaults ?? {}) };
  }
  async setDefaults(d: UserDefaults) {
    const { error } = await this.db.auth.updateUser({ data: { seo_defaults: d } });
    if (error) throw new DataError(error.message);
  }
  async deleteAllData() {
    // Every other table hangs off projects with on delete cascade.
    must(await this.db.from("projects").delete().not("id", "is", null).select("id"));
  }

  async listProjects() {
    return must(await this.db.from("projects").select("*").order("created_at")) as Project[];
  }
  async getProject(id: string) {
    return (must(await this.db.from("projects").select("*").eq("id", id).maybeSingle()) as Project | null) ?? null;
  }
  async createProject(p: NewProject) {
    return must(await this.db.from("projects").insert(p).select("*").single()) as Project;
  }
  async updateProject(id: string, patch: Partial<NewProject>) {
    must(await this.db.from("projects").update(patch).eq("id", id).select("id"));
  }
  async deleteProject(id: string) {
    must(await this.db.from("projects").delete().eq("id", id).select("id"));
  }

  async listKeywords(projectId: string) {
    return must(await this.db.from("keywords").select("*").eq("project_id", projectId).is("archived_at", null).order("created_at")) as Keyword[];
  }
  async addKeywords(projectId: string, phrases: string[], tags: string[]) {
    const existing = must(await this.db.from("keywords").select("id, phrase_norm, archived_at").eq("project_id", projectId)) as { id: string; phrase_norm: string; archived_at: string | null }[];
    const byNorm = new Map(existing.map((k) => [k.phrase_norm, k]));
    const fresh: { project_id: string; phrase: string; phrase_norm: string; tags: string[] }[] = [];
    const revive: string[] = [];
    let skipped = 0;
    const seen = new Set<string>();
    for (const raw of phrases) {
      const norm = normalisePhrase(raw);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      const cur = byNorm.get(norm);
      if (!cur) fresh.push({ project_id: projectId, phrase: norm, phrase_norm: norm, tags });
      else if (cur.archived_at) revive.push(cur.id);
      else skipped += 1;
    }
    if (fresh.length) must(await this.db.from("keywords").insert(fresh).select("id"));
    if (revive.length) must(await this.db.from("keywords").update({ archived_at: null }).in("id", revive).select("id"));
    return { added: fresh.length + revive.length, skipped };
  }
  async updateKeywords(ids: string[], patch: KeywordPatch) {
    if (ids.length) must(await this.db.from("keywords").update(patch).in("id", ids).select("id"));
  }
  async removeKeywords(ids: string[]) {
    if (ids.length) must(await this.db.from("keywords").update({ archived_at: this.now() }).in("id", ids).select("id"));
  }

  async listMetrics(projectId: string) {
    const rows = must(await this.db.from("keyword_metrics").select("*").eq("project_id", projectId)) as (KeywordMetric & { cpc: unknown; competition: unknown })[];
    return rows.map((r) => ({ ...r, cpc: num(r.cpc), competition: num(r.competition) }));
  }
  async upsertMetrics(projectId: string, rows: Omit<KeywordMetric, "project_id">[], runId: string | null) {
    if (rows.length === 0) return;
    const current = new Map((await this.listMetrics(projectId)).map((m) => [`${m.phrase_norm}|${m.country}|${m.language}`, m]));
    const merged = rows.map((r) => {
      const cur = current.get(`${r.phrase_norm}|${r.country}|${r.language}`);
      const pickValue = <K extends keyof typeof r>(k: K) => (r[k] ?? cur?.[k as keyof KeywordMetric] ?? null) as (typeof r)[K];
      return { project_id: projectId, phrase_norm: r.phrase_norm, country: r.country, language: r.language, volume: pickValue("volume"), cpc: pickValue("cpc"), competition: pickValue("competition"), difficulty: pickValue("difficulty"), intent: pickValue("intent"), monthly: pickValue("monthly"), fetched_at: r.fetched_at, run_id: runId };
    });
    for (let i = 0; i < merged.length; i += 500) must(await this.db.from("keyword_metrics").upsert(merged.slice(i, i + 500), { onConflict: "project_id,phrase_norm,country,language" }).select("id"));
  }

  async listRankChecks(projectId: string) {
    return must(await this.db.from("rank_checks").select("*").eq("project_id", projectId).order("checked_at").limit(20000)) as RankCheck[];
  }
  async insertRankCheck(row: Omit<RankCheck, "id">) {
    const { error_code: _unused, ...clean } = row;
    void _unused;
    must(await this.db.from("rank_checks").insert(clean).select("id"));
  }

  async listSnapshotsLite(projectId: string) {
    const rows = must(await this.db.from("serp_snapshots").select("id, keyword_id, fetched_at, organic").eq("project_id", projectId).eq("parse_ok", true).order("fetched_at", { ascending: false }).limit(3000)) as { id: string; keyword_id: string; fetched_at: string; organic: OrganicRow[] }[];
    return rows.map((r): SnapshotLite => ({ id: r.id, keyword_id: r.keyword_id, fetched_at: r.fetched_at, hosts: (r.organic ?? []).map((o) => ({ position: o.position, host: o.host })) }));
  }
  async listKeywordSnapshots(keywordId: string): Promise<SnapshotRef[]> {
    const rows = must(await this.db.from("serp_snapshots").select("id, fetched_at, organic, project_id").eq("keyword_id", keywordId).order("fetched_at", { ascending: false }).limit(200)) as { id: string; fetched_at: string; organic: OrganicRow[]; project_id: string }[];
    const project = rows[0] ? await this.getProject(rows[0].project_id) : null;
    return rows.map((r) => ({ id: r.id, fetched_at: r.fetched_at, position: project ? findPosition(r.organic ?? [], project.domain, project.include_subdomains).position : null }));
  }
  async getSnapshot(id: string) {
    const row = must(await this.db.from("serp_snapshots").select("*").eq("id", id).maybeSingle()) as (SerpSnapshot & { cost_micros: unknown }) | null;
    return row ? { ...row, cost_micros: Number(row.cost_micros ?? 0) } : null;
  }
  async insertSnapshot(row: Omit<SerpSnapshot, "id">) {
    return (must(await this.db.from("serp_snapshots").insert(row).select("id").single()) as { id: string }).id;
  }

  async listCompetitors(projectId: string) {
    return must(await this.db.from("competitors").select("*").eq("project_id", projectId).order("color_slot")) as Competitor[];
  }
  async addCompetitor(projectId: string, domain: string) {
    const list = await this.listCompetitors(projectId);
    if (list.some((c) => c.domain === domain)) throw new DataError("That competitor is already in this project.");
    if (list.length >= 8) throw new DataError("A project can have at most 8 competitors.");
    const used = new Set(list.map((c) => c.color_slot));
    let slot = 2;
    while (used.has(slot) && slot < 8) slot += 1;
    return must(await this.db.from("competitors").insert({ project_id: projectId, domain, color_slot: slot }).select("*").single()) as Competitor;
  }
  async removeCompetitor(id: string) {
    must(await this.db.from("competitors").delete().eq("id", id).select("id"));
  }
  async listOverlaps(projectId: string) {
    return must(await this.db.from("competitor_overlaps").select("*").eq("project_id", projectId).order("fetched_at", { ascending: false }).limit(40)) as CompetitorOverlap[];
  }
  async insertOverlap(row: Omit<CompetitorOverlap, "id">) {
    must(await this.db.from("competitor_overlaps").insert(row).select("id"));
  }

  async listDomainOverviews(projectId: string) {
    const rows = must(await this.db.from("domain_overviews").select("*").eq("project_id", projectId).order("fetched_at", { ascending: false }).limit(40)) as (DomainOverview & { est_traffic: unknown })[];
    return rows.map((r) => ({ ...r, est_traffic: num(r.est_traffic) }));
  }
  async insertDomainOverview(row: Omit<DomainOverview, "id">, runId: string | null) {
    must(await this.db.from("domain_overviews").insert({ ...row, run_id: runId }).select("id"));
  }
  async listBacklinkSnapshots(projectId: string) {
    const rows = must(await this.db.from("backlink_snapshots").select("*").eq("project_id", projectId).order("fetched_at", { ascending: false }).limit(60)) as (BacklinkSnapshot & { backlinks: unknown })[];
    return rows.map((r) => ({ ...r, backlinks: num(r.backlinks) }));
  }
  async insertBacklinkSnapshot(row: Omit<BacklinkSnapshot, "id">) {
    must(await this.db.from("backlink_snapshots").insert(row).select("id"));
  }

  async listResearchRuns(projectId: string) {
    const rows = must(await this.db.from("research_runs").select("*, runs(actual_cost_micros)").eq("project_id", projectId).order("created_at", { ascending: false }).limit(30)) as (ResearchRun & { runs: { actual_cost_micros: unknown } | null })[];
    return rows.map(({ runs, ...r }) => ({ ...r, cost_micros: runs ? Number(runs.actual_cost_micros) : undefined }));
  }
  async insertResearchRun(row: Omit<ResearchRun, "id" | "created_at">) {
    const { cost_micros: _unused, ...clean } = row;
    void _unused;
    return (must(await this.db.from("research_runs").insert(clean).select("id").single()) as { id: string }).id;
  }

  async listChartNotes(projectId: string) {
    return must(await this.db.from("chart_notes").select("id, project_id, noted_on, body").eq("project_id", projectId).order("noted_on")) as ChartNote[];
  }
  async addChartNote(projectId: string, notedOn: string, body: string) {
    must(await this.db.from("chart_notes").insert({ project_id: projectId, noted_on: notedOn, body: body.slice(0, 140) }).select("id"));
  }

  async insertQuote(q: Omit<Quote, "id" | "created_at" | "used_at">) {
    return this.#quote(must(await this.db.from("quotes").insert(q).select("*").single()));
  }
  async getQuote(id: string) {
    const row = must(await this.db.from("quotes").select("*").eq("id", id).maybeSingle());
    return row ? this.#quote(row) : null;
  }
  #quote(row: unknown): Quote {
    const r = row as Quote & { total_micros: unknown };
    return { ...r, total_micros: Number(r.total_micros) };
  }
  async markQuoteUsed(id: string) {
    const rows = must(await this.db.from("quotes").update({ used_at: this.now() }).eq("id", id).is("used_at", null).select("id")) as { id: string }[];
    return rows.length === 1;
  }

  #run(row: unknown): Run {
    const r = row as Run & { quoted_micros: unknown; max_cost_micros: unknown; actual_cost_micros: unknown };
    return { ...r, quoted_micros: Number(r.quoted_micros), max_cost_micros: Number(r.max_cost_micros), actual_cost_micros: Number(r.actual_cost_micros), over_cap_micros: Number((r as { over_cap_micros?: unknown }).over_cap_micros ?? 0) };
  }
  async getRunByKey(key: string) {
    const row = must(await this.db.from("runs").select("*").eq("idempotency_key", key).maybeSingle());
    return row ? this.#run(row) : null;
  }
  async insertRun(run: NewRun, items: CallItem[]) {
    const res = await this.db.from("runs").insert(run).select("*").single();
    if (res.error) {
      // 23505 is a unique violation: another request with the same idempotency key got there first.
      if (res.error.code === "23505") {
        const first = await this.getRunByKey(run.idempotency_key);
        if (first) return { run: first, created: false };
      }
      throw new DataError(res.error.message, res.error.code);
    }
    const row = this.#run(res.data);
    const rows = items.map((it) => ({ run_id: row.id, item_key: it.itemKey, operation_id: it.operationId, input: it.input, unit_price_micros: it.unitPriceMicros }));
    for (let i = 0; i < rows.length; i += 500) must(await this.db.from("run_items").insert(rows.slice(i, i + 500)).select("id"));
    return { run: row, created: true };
  }
  async getRun(id: string) {
    const row = must(await this.db.from("runs").select("*").eq("id", id).maybeSingle());
    return row ? this.#run(row) : null;
  }
  async updateRun(id: string, patch: RunPatch) {
    must(await this.db.from("runs").update(patch).eq("id", id).select("id"));
  }
  async listRuns(projectId: string | null) {
    let q = this.db.from("runs").select("*").order("started_at", { ascending: false }).limit(500);
    if (projectId) q = q.eq("project_id", projectId);
    return (must(await q) as unknown[]).map((r) => this.#run(r));
  }
  async listRunItems(runId: string) {
    const rows = must(await this.db.from("run_items").select("*").eq("run_id", runId).order("item_key").limit(2000)) as (RunItem & { unit_price_micros: unknown; actual_cost_micros: unknown })[];
    return rows.map((r) => ({ ...r, unit_price_micros: Number(r.unit_price_micros), actual_cost_micros: Number(r.actual_cost_micros) }));
  }
  async updateRunItem(runId: string, itemKey: string, patch: RunItemPatch) {
    must(await this.db.from("run_items").update(patch).eq("run_id", runId).eq("item_key", itemKey).select("id"));
  }
}
