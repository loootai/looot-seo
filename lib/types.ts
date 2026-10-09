import type { Micros } from "@/lib/money";

export type Depth = 10 | 20 | 30 | 50;

export interface Project {
  id: string;
  name: string;
  domain: string;
  country: string;
  language: string;
  location_name: string;
  depth: Depth;
  include_subdomains: boolean;
  serp_operation: string;
  created_at: string;
}

export interface Keyword {
  id: string;
  project_id: string;
  phrase: string;
  phrase_norm: string;
  target_url: string | null;
  tags: string[];
  track_ai_overview: boolean;
  engine: string;
  archived_at: string | null;
  created_at: string;
}

export interface KeywordMetric {
  project_id: string;
  phrase_norm: string;
  country: string;
  language: string;
  volume: number | null;
  cpc: number | null;
  competition: number | null;
  difficulty: number | null;
  intent: string | null;
  monthly: { month: string; volume: number }[] | null;
  fetched_at: string;
}

export interface SerpFeatures {
  aio: { present: boolean; cited: boolean };
  paa: { present: boolean; owned: boolean };
  answer_box: { present: boolean; owned: boolean };
  knowledge: { present: boolean };
}

export interface RankCheck {
  id: string;
  project_id: string;
  keyword_id: string;
  run_id: string | null;
  checked_at: string;
  depth: number;
  position: number | null;
  url: string | null;
  other_urls: string[];
  is_cannibalised: boolean;
  features: SerpFeatures;
  snapshot_id: string | null;
  /** Provider error code when the last attempt for this keyword failed. Not stored; set by the view. */
  error_code?: string | null;
}

export interface OrganicRow {
  position: number;
  title: string;
  url: string;
  host: string;
  snippet: string;
}

export interface AiOverview {
  text: string;
  sources: { title: string; url: string; host: string }[];
}

export interface PaaRow {
  question: string;
  snippet: string;
  url: string;
  host: string;
}

export interface FeatureBox {
  title: string;
  snippet: string;
  url: string;
  host: string;
}

export interface SerpSnapshot {
  id: string;
  project_id: string;
  keyword_id: string;
  run_id: string | null;
  fetched_at: string;
  operation_id: string;
  organic: OrganicRow[];
  ai_overview: AiOverview | null;
  /** True when the snapshot came from a call that asks for the AI Overview. */
  aio_checked: boolean;
  people_also_ask: PaaRow[];
  related: string[];
  answer_box: FeatureBox | null;
  knowledge: FeatureBox | null;
  raw: unknown;
  parse_ok: boolean;
  cost_micros: Micros;
  looot_run_id: string | null;
}

/** The slim form of a snapshot used for share of voice and the competitor matrix. */
export interface SnapshotLite {
  id: string;
  keyword_id: string;
  fetched_at: string;
  hosts: { position: number; host: string }[];
}

export interface Competitor {
  id: string;
  project_id: string;
  domain: string;
  label: string | null;
  color_slot: number;
  created_at: string;
}

export interface OverlapRow {
  phrase: string;
  volume: number | null;
  our_position: number | null;
  their_position: number | null;
}

export interface CompetitorOverlap {
  id: string;
  project_id: string;
  competitor_id: string;
  run_id: string | null;
  fetched_at: string;
  both_count: number;
  rows: OverlapRow[];
}

export interface DomainOverview {
  id: string;
  project_id: string;
  domain: string;
  fetched_at: string;
  organic_keywords: number | null;
  est_traffic: number | null;
  distribution: Record<string, number> | null;
}

export interface ReferringDomain {
  domain: string;
  rank: number | null;
  backlinks: number | null;
  first_seen: string | null;
  dofollow_share: number | null;
}

export interface BacklinkSnapshot {
  id: string;
  project_id: string;
  domain: string;
  run_id: string | null;
  fetched_at: string;
  backlinks: number | null;
  referring_domains: number | null;
  domain_rank: number | null;
  spam_score: number | null;
  broken_backlinks: number | null;
  new_lost: { month: string; new: number; lost: number }[] | null;
  top_domains: ReferringDomain[] | null;
}

export interface ResearchResult {
  phrase: string;
  source: "ideas" | "related" | "autocomplete" | "pasted";
}

export interface ResearchRun {
  id: string;
  project_id: string;
  run_id: string | null;
  seeds: string[];
  sources: string[];
  country: string;
  language: string;
  results: ResearchResult[];
  created_at: string;
  cost_micros?: Micros;
}

export interface ChartNote {
  id: string;
  project_id: string;
  noted_on: string;
  body: string;
}

export type ActionKind =
  | "check_rankings"
  | "fetch_snapshot"
  | "research"
  | "keyword_metrics"
  | "suggest_competitors"
  | "competitor_overlap"
  | "backlinks"
  | "domain_overview"
  | "retry_failed";

export interface QuoteLine {
  key: string;
  label: string;
  detail?: string;
  operationId: string;
  calls: number;
  unitPriceMicros: Micros;
  subtotalMicros: Micros;
  optional: boolean;
  priceDate: string;
}

export interface CallItem {
  itemKey: string;
  lineKey: string;
  /** Items that belong to one stored result, such as the pages of one keyword. */
  group: string;
  operationId: string;
  input: Record<string, unknown>;
  unitPriceMicros: Micros;
  /** Set on a retry so looot sees the key of the first attempt and cannot charge twice. */
  idempotencyKey?: string;
  /** Extra price a line adds on top of another line for the same call (AI Overview add-on). */
  addOn?: { lineKey: string; micros: Micros };
}

export interface Quote {
  id: string;
  project_id: string;
  action: ActionKind;
  title: string;
  lines: QuoteLine[];
  items: CallItem[];
  scope: Record<string, unknown>;
  total_micros: Micros;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export type RunStatus = "running" | "completed" | "partial" | "failed" | "cancelled";
export type ItemStatus = "pending" | "completed" | "failed" | "skipped_budget" | "timed_out";

export interface Run {
  id: string;
  project_id: string;
  quote_id: string | null;
  action: ActionKind;
  idempotency_key: string;
  status: RunStatus;
  items_total: number;
  items_done: number;
  quoted_micros: Micros;
  max_cost_micros: Micros;
  actual_cost_micros: Micros;
  started_at: string;
  finished_at: string | null;
  simulated: boolean;
  /** Charges above the cap, in micros. Stays 0 unless a provider billed more than the price it quoted. */
  over_cap_micros: number;
}

export interface RunItem {
  id: string;
  run_id: string;
  item_key: string;
  operation_id: string;
  input: Record<string, unknown>;
  status: ItemStatus;
  looot_run_id: string | null;
  unit_price_micros: Micros;
  actual_cost_micros: Micros;
  error_code: string | null;
  error_message: string | null;
  finished_at: string | null;
  parse_ok: boolean;
  result: unknown;
}

export interface CompetitorSuggestion {
  domain: string;
  intersections: number | null;
  avg_position: number | null;
}

export interface Balance {
  availableMicros: Micros;
  reservedMicros: Micros;
  topUpUrl: string | null;
}

export interface UserDefaults {
  depth: Depth;
  country: string;
  language: string;
  serp_operation: string;
}
