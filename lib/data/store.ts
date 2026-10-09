import type {
  BacklinkSnapshot,
  CallItem,
  ChartNote,
  Competitor,
  CompetitorOverlap,
  DomainOverview,
  Keyword,
  KeywordMetric,
  Project,
  Quote,
  RankCheck,
  ResearchRun,
  Run,
  RunItem,
  SerpSnapshot,
  SnapshotLite,
  UserDefaults,
} from "@/lib/types";

export type NewProject = Pick<Project, "name" | "domain" | "country" | "language" | "location_name" | "depth" | "include_subdomains" | "serp_operation">;
export type KeywordPatch = Partial<Pick<Keyword, "target_url" | "tags" | "track_ai_overview">>;
export type NewRun = Omit<Run, "id" | "started_at" | "finished_at" | "items_done" | "actual_cost_micros" | "status" | "over_cap_micros">;
export type RunPatch = Partial<Pick<Run, "status" | "items_done" | "actual_cost_micros" | "finished_at" | "over_cap_micros">>;
export type RunItemPatch = Partial<Omit<RunItem, "id" | "run_id" | "item_key">>;
export interface SnapshotRef {
  id: string;
  fetched_at: string;
  position: number | null;
}

/**
 * Everything the app reads and writes. Two implementations: Supabase (each call runs as the
 * signed-in user, so row level security applies) and the in-memory demo store.
 */
export interface DataStore {
  /** Current time as an ISO string. The demo store returns its fixed anchor date. */
  now(): string;
  userEmail(): Promise<string | null>;
  getDefaults(): Promise<UserDefaults>;
  setDefaults(d: UserDefaults): Promise<void>;
  deleteAllData(): Promise<void>;

  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(p: NewProject): Promise<Project>;
  updateProject(id: string, patch: Partial<NewProject>): Promise<void>;
  deleteProject(id: string): Promise<void>;

  listKeywords(projectId: string): Promise<Keyword[]>;
  addKeywords(projectId: string, phrases: string[], tags: string[]): Promise<{ added: number; skipped: number }>;
  updateKeywords(ids: string[], patch: KeywordPatch): Promise<void>;
  removeKeywords(ids: string[]): Promise<void>;

  listMetrics(projectId: string): Promise<KeywordMetric[]>;
  upsertMetrics(projectId: string, rows: Omit<KeywordMetric, "project_id">[], runId: string | null): Promise<void>;

  listRankChecks(projectId: string): Promise<RankCheck[]>;
  insertRankCheck(row: Omit<RankCheck, "id">, replaceSameDay?: boolean): Promise<void>;

  listSnapshotsLite(projectId: string): Promise<SnapshotLite[]>;
  listKeywordSnapshots(keywordId: string): Promise<SnapshotRef[]>;
  getSnapshot(id: string): Promise<SerpSnapshot | null>;
  insertSnapshot(row: Omit<SerpSnapshot, "id">): Promise<string>;

  listCompetitors(projectId: string): Promise<Competitor[]>;
  addCompetitor(projectId: string, domain: string): Promise<Competitor>;
  removeCompetitor(id: string): Promise<void>;
  listOverlaps(projectId: string): Promise<CompetitorOverlap[]>;
  insertOverlap(row: Omit<CompetitorOverlap, "id">): Promise<void>;

  listDomainOverviews(projectId: string): Promise<DomainOverview[]>;
  insertDomainOverview(row: Omit<DomainOverview, "id">, runId: string | null): Promise<void>;
  listBacklinkSnapshots(projectId: string): Promise<BacklinkSnapshot[]>;
  insertBacklinkSnapshot(row: Omit<BacklinkSnapshot, "id">): Promise<void>;

  listResearchRuns(projectId: string): Promise<ResearchRun[]>;
  insertResearchRun(row: Omit<ResearchRun, "id" | "created_at">): Promise<string>;

  listChartNotes(projectId: string): Promise<ChartNote[]>;
  addChartNote(projectId: string, notedOn: string, body: string): Promise<void>;

  insertQuote(q: Omit<Quote, "id" | "created_at" | "used_at">): Promise<Quote>;
  getQuote(id: string): Promise<Quote | null>;
  /** Marks a quote used. Returns false when it was already used, so a quote can start one run only. */
  markQuoteUsed(id: string): Promise<boolean>;

  getRunByKey(idempotencyKey: string): Promise<Run | null>;
  /** Inserts a run and its items. On a repeat of the same idempotency key it returns the first run and created = false. */
  insertRun(run: NewRun, items: CallItem[]): Promise<{ run: Run; created: boolean }>;
  getRun(id: string): Promise<Run | null>;
  updateRun(id: string, patch: RunPatch): Promise<void>;
  /** Runs, newest first. With no project id, runs of every project. */
  listRuns(projectId: string | null): Promise<Run[]>;
  listRunItems(runId: string): Promise<RunItem[]>;
  updateRunItem(runId: string, itemKey: string, patch: RunItemPatch): Promise<void>;
}
