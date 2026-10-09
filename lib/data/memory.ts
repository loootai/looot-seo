import type { DataStore, KeywordPatch, NewProject, NewRun, RunItemPatch, RunPatch, SnapshotRef } from "@/lib/data/store";
import { findPosition } from "@/lib/seo/position";
import type { BacklinkSnapshot, CallItem, ChartNote, Competitor, CompetitorOverlap, DomainOverview, Keyword, KeywordMetric, Project, Quote, RankCheck, ResearchRun, Run, RunItem, SerpSnapshot, SnapshotLite, UserDefaults } from "@/lib/types";
import { normalisePhrase } from "@/lib/utils";

/** Snapshots that are computed on demand instead of held in memory, such as the seeded demo history. */
export interface VirtualSnapshots {
  lite(projectId: string): SnapshotLite[];
  refs(keywordId: string): SnapshotRef[];
  get(id: string): SerpSnapshot | null;
}

/** Items of seeded runs, built when a run row is expanded. */
export type ItemFactory = (run: Run) => RunItem[];

const clone = <T>(v: T): T => structuredClone(v);

/** In-memory DataStore. The demo uses it with seeded data; tests use it empty with a mocked looot client. */
export class MemoryStore implements DataStore {
  projects: Project[] = [];
  keywords: Keyword[] = [];
  metrics: KeywordMetric[] = [];
  rankChecks: RankCheck[] = [];
  snapshots: SerpSnapshot[] = [];
  competitors: Competitor[] = [];
  overlaps: CompetitorOverlap[] = [];
  domainOverviews: DomainOverview[] = [];
  backlinks: BacklinkSnapshot[] = [];
  research: ResearchRun[] = [];
  notes: ChartNote[] = [];
  quotes: Quote[] = [];
  runs: Run[] = [];
  runItems = new Map<string, RunItem[]>();
  itemFactories = new Map<string, ItemFactory>();
  virtual: VirtualSnapshots | null = null;
  defaults: UserDefaults = { depth: 30, country: "US", language: "en", serp_operation: "serper-search" };
  email: string | null = "owner@example.com";
  #seq = 0;

  constructor(private readonly fixedNow: string | null = null) {}

  id(prefix: string): string {
    this.#seq += 1;
    return `${prefix}_${Date.now().toString(36)}${this.#seq.toString(36)}`;
  }
  now(): string {
    return this.fixedNow ?? new Date().toISOString();
  }
  async userEmail() {
    return this.email;
  }
  async getDefaults() {
    return { ...this.defaults };
  }
  async setDefaults(d: UserDefaults) {
    this.defaults = { ...d };
  }
  async deleteAllData() {
    this.projects = [];
    this.keywords = [];
    this.metrics = [];
    this.rankChecks = [];
    this.snapshots = [];
    this.competitors = [];
    this.overlaps = [];
    this.domainOverviews = [];
    this.backlinks = [];
    this.research = [];
    this.notes = [];
    this.quotes = [];
    this.runs = [];
    this.runItems.clear();
    this.virtual = null;
  }

  async listProjects() {
    return clone(this.projects);
  }
  async getProject(id: string) {
    return clone(this.projects.find((p) => p.id === id) ?? null);
  }
  async createProject(p: NewProject) {
    if (this.projects.some((x) => x.domain === p.domain && x.country === p.country && x.language === p.language)) throw new Error("A project for this domain and market already exists.");
    const row: Project = { ...p, id: this.id("prj"), created_at: this.now() };
    this.projects.push(row);
    return clone(row);
  }
  async updateProject(id: string, patch: Partial<NewProject>) {
    const p = this.projects.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
  }
  async deleteProject(id: string) {
    const kw = new Set(this.keywords.filter((k) => k.project_id === id).map((k) => k.id));
    this.projects = this.projects.filter((p) => p.id !== id);
    this.keywords = this.keywords.filter((k) => k.project_id !== id);
    this.metrics = this.metrics.filter((k) => k.project_id !== id);
    this.rankChecks = this.rankChecks.filter((k) => !kw.has(k.keyword_id));
    this.snapshots = this.snapshots.filter((k) => k.project_id !== id);
    this.competitors = this.competitors.filter((k) => k.project_id !== id);
    this.overlaps = this.overlaps.filter((k) => k.project_id !== id);
    this.backlinks = this.backlinks.filter((k) => k.project_id !== id);
    this.research = this.research.filter((k) => k.project_id !== id);
    this.runs = this.runs.filter((k) => k.project_id !== id);
  }

  async listKeywords(projectId: string) {
    return clone(this.keywords.filter((k) => k.project_id === projectId && !k.archived_at));
  }
  async addKeywords(projectId: string, phrases: string[], tags: string[]) {
    const have = new Set(this.keywords.filter((k) => k.project_id === projectId && !k.archived_at).map((k) => k.phrase_norm));
    let added = 0;
    let skipped = 0;
    for (const raw of phrases) {
      const norm = normalisePhrase(raw);
      if (!norm || have.has(norm)) {
        skipped += 1;
        continue;
      }
      have.add(norm);
      added += 1;
      this.keywords.push({ id: this.id("kw"), project_id: projectId, phrase: norm, phrase_norm: norm, target_url: null, tags: [...tags], track_ai_overview: false, engine: "google", archived_at: null, created_at: this.now() });
    }
    return { added, skipped };
  }
  async updateKeywords(ids: string[], patch: KeywordPatch) {
    for (const k of this.keywords) if (ids.includes(k.id)) Object.assign(k, clone(patch));
  }
  async removeKeywords(ids: string[]) {
    for (const k of this.keywords) if (ids.includes(k.id)) k.archived_at = this.now();
  }

  async listMetrics(projectId: string) {
    return clone(this.metrics.filter((m) => m.project_id === projectId));
  }
  async upsertMetrics(projectId: string, rows: Omit<KeywordMetric, "project_id">[]) {
    for (const r of rows) {
      const cur = this.metrics.find((m) => m.project_id === projectId && m.phrase_norm === r.phrase_norm && m.country === r.country && m.language === r.language);
      if (!cur) this.metrics.push({ ...r, project_id: projectId });
      else for (const [k, v] of Object.entries(r)) if (v !== null && v !== undefined) (cur as unknown as Record<string, unknown>)[k] = v;
    }
  }

  async listRankChecks(projectId: string) {
    return clone(this.rankChecks.filter((c) => c.project_id === projectId).sort((a, b) => a.checked_at.localeCompare(b.checked_at)));
  }
  async insertRankCheck(row: Omit<RankCheck, "id">, replaceSameDay = false) {
    if (replaceSameDay) this.rankChecks = this.rankChecks.filter((c) => !(c.keyword_id === row.keyword_id && c.checked_at.slice(0, 10) === row.checked_at.slice(0, 10)));
    this.rankChecks.push({ ...clone(row), id: this.id("rc") });
  }

  async listSnapshotsLite(projectId: string) {
    const own = this.snapshots.filter((s) => s.project_id === projectId && s.parse_ok).map((s) => ({ id: s.id, keyword_id: s.keyword_id, fetched_at: s.fetched_at, hosts: s.organic.map((o) => ({ position: o.position, host: o.host })) }));
    return [...(this.virtual?.lite(projectId) ?? []), ...own];
  }
  async listKeywordSnapshots(keywordId: string) {
    const kw = this.keywords.find((k) => k.id === keywordId);
    const p = this.projects.find((x) => x.id === kw?.project_id);
    const own = this.snapshots.filter((s) => s.keyword_id === keywordId).map((s) => ({ id: s.id, fetched_at: s.fetched_at, position: p ? findPosition(s.organic, p.domain, p.include_subdomains).position : null }));
    return [...(this.virtual?.refs(keywordId) ?? []), ...own].sort((a, b) => b.fetched_at.localeCompare(a.fetched_at));
  }
  async getSnapshot(id: string) {
    return clone(this.snapshots.find((s) => s.id === id) ?? this.virtual?.get(id) ?? null);
  }
  async insertSnapshot(row: Omit<SerpSnapshot, "id">) {
    const id = this.id("snap");
    this.snapshots.push({ ...clone(row), id });
    return id;
  }

  async listCompetitors(projectId: string) {
    return clone(this.competitors.filter((c) => c.project_id === projectId).sort((a, b) => a.color_slot - b.color_slot));
  }
  async addCompetitor(projectId: string, domain: string) {
    const list = this.competitors.filter((c) => c.project_id === projectId);
    if (list.some((c) => c.domain === domain)) throw new Error("That competitor is already in this project.");
    if (list.length >= 8) throw new Error("A project can have at most 8 competitors.");
    const used = new Set(list.map((c) => c.color_slot));
    let slot = 2;
    while (used.has(slot) && slot < 8) slot += 1;
    const row: Competitor = { id: this.id("cmp"), project_id: projectId, domain, label: null, color_slot: slot, created_at: this.now() };
    this.competitors.push(row);
    return clone(row);
  }
  async removeCompetitor(id: string) {
    this.competitors = this.competitors.filter((c) => c.id !== id);
    this.overlaps = this.overlaps.filter((o) => o.competitor_id !== id);
  }
  async listOverlaps(projectId: string) {
    return clone(this.overlaps.filter((o) => o.project_id === projectId).sort((a, b) => b.fetched_at.localeCompare(a.fetched_at)));
  }
  async insertOverlap(row: Omit<CompetitorOverlap, "id">) {
    this.overlaps.push({ ...clone(row), id: this.id("ov") });
  }

  async listDomainOverviews(projectId: string) {
    return clone(this.domainOverviews.filter((o) => o.project_id === projectId).sort((a, b) => b.fetched_at.localeCompare(a.fetched_at)));
  }
  async insertDomainOverview(row: Omit<DomainOverview, "id">) {
    this.domainOverviews.push({ ...clone(row), id: this.id("do") });
  }
  async listBacklinkSnapshots(projectId: string) {
    return clone(this.backlinks.filter((o) => o.project_id === projectId).sort((a, b) => b.fetched_at.localeCompare(a.fetched_at)));
  }
  async insertBacklinkSnapshot(row: Omit<BacklinkSnapshot, "id">) {
    this.backlinks.push({ ...clone(row), id: this.id("bl") });
  }

  async listResearchRuns(projectId: string) {
    return clone(this.research.filter((o) => o.project_id === projectId).sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }
  async insertResearchRun(row: Omit<ResearchRun, "id" | "created_at">) {
    const id = this.id("rs");
    this.research.push({ ...clone(row), id, created_at: this.now() });
    return id;
  }

  async listChartNotes(projectId: string) {
    return clone(this.notes.filter((n) => n.project_id === projectId).sort((a, b) => a.noted_on.localeCompare(b.noted_on)));
  }
  async addChartNote(projectId: string, notedOn: string, body: string) {
    this.notes.push({ id: this.id("note"), project_id: projectId, noted_on: notedOn, body: body.slice(0, 140) });
  }

  async insertQuote(q: Omit<Quote, "id" | "created_at" | "used_at">) {
    const row: Quote = { ...clone(q), id: this.id("qt"), created_at: new Date().toISOString(), used_at: null };
    this.quotes.push(row);
    return clone(row);
  }
  async getQuote(id: string) {
    return clone(this.quotes.find((q) => q.id === id) ?? null);
  }
  async markQuoteUsed(id: string) {
    const q = this.quotes.find((x) => x.id === id);
    if (!q || q.used_at) return false;
    q.used_at = new Date().toISOString();
    return true;
  }

  async getRunByKey(key: string) {
    return clone(this.runs.find((r) => r.idempotency_key === key) ?? null);
  }
  async insertRun(run: NewRun, items: CallItem[]) {
    const dup = this.runs.find((r) => r.idempotency_key === run.idempotency_key);
    if (dup) return { run: clone(dup), created: false };
    if (run.max_cost_micros > run.quoted_micros) throw new Error("max_cost_micros cannot be above quoted_micros");
    const row: Run = { ...run, id: this.id("run"), status: "running", items_done: 0, actual_cost_micros: 0, over_cap_micros: 0, started_at: new Date().toISOString(), finished_at: null };
    this.runs.push(row);
    this.runItems.set(
      row.id,
      items.map((it) => ({ id: this.id("it"), run_id: row.id, item_key: it.itemKey, operation_id: it.operationId, input: it.input, status: "pending", looot_run_id: null, unit_price_micros: it.unitPriceMicros, actual_cost_micros: 0, error_code: null, error_message: null, finished_at: null, parse_ok: true, result: null })),
    );
    return { run: clone(row), created: true };
  }
  async getRun(id: string) {
    return clone(this.runs.find((r) => r.id === id) ?? null);
  }
  async updateRun(id: string, patch: RunPatch) {
    const r = this.runs.find((x) => x.id === id);
    if (!r) return;
    const next = { ...r, ...patch };
    if (next.actual_cost_micros > next.max_cost_micros) throw new Error("actual_cost_micros cannot be above max_cost_micros");
    // A cancelled run keeps that status while its last calls drain.
    if (r.status === "cancelled" && patch.status === undefined) next.status = "cancelled";
    Object.assign(r, next);
  }
  async listRuns(projectId: string | null) {
    return clone(this.runs.filter((r) => !projectId || r.project_id === projectId).sort((a, b) => b.started_at.localeCompare(a.started_at)));
  }
  async listRunItems(runId: string) {
    const have = this.runItems.get(runId);
    if (have) return clone(have);
    const run = this.runs.find((r) => r.id === runId);
    const factory = this.itemFactories.get(runId);
    return run && factory ? factory(run) : [];
  }
  async updateRunItem(runId: string, itemKey: string, patch: RunItemPatch) {
    const it = this.runItems.get(runId)?.find((i) => i.item_key === itemKey);
    if (it) Object.assign(it, patch);
  }
}
