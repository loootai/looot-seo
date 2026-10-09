"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, CircleAlert, Plus } from "lucide-react";
import { addKeywords, updateKeywords } from "@/app/actions";
import { PaidButton } from "@/components/quote/QuoteProvider";
import { Region } from "@/components/shell/PageHead";
import { useToast } from "@/components/shell/toast";
import { DomainIcon, EmptyState, SectionHead } from "@/components/tables/parts";
import { Button } from "@/components/ui/button";
import { Skeleton, Tag } from "@/components/ui/controls";
import { Select } from "@/components/ui/input";
import type { SnapshotRef } from "@/lib/data/store";
import { formatMoney } from "@/lib/money";
import { matchesDomain } from "@/lib/seo/position";
import type { Keyword, OrganicRow, Project, SerpSnapshot } from "@/lib/types";
import { cn, formatDay, formatExact, formatRelative, pathOf } from "@/lib/utils";
import type { ForcedState } from "@/lib/view/state";

interface Props {
  project: Project;
  keyword: Keyword;
  competitors: { domain: string; slot: number }[];
  refs: SnapshotRef[];
  snapshot: SerpSnapshot | null;
  compare: { id: string; fetched_at: string; organic: OrganicRow[]; questions: string[] } | null;
  state: ForcedState;
  now: string;
  priceFetch: number | null;
  aioExtra: number;
}

type Tab = "results" | "aio" | "questions" | "related";

/** Stages a phrase for Research. The list lives in this browser only. */
export function stageForResearch(projectId: string, phrase: string): number {
  try {
    const key = `seo-staged:${projectId}`;
    const list = new Set<string>(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]);
    list.add(phrase);
    localStorage.setItem(key, JSON.stringify([...list].slice(-40)));
    return list.size;
  } catch {
    return 0;
  }
}

export function SerpViewer({ project, keyword, competitors, refs, snapshot, compare, state, now, priceFetch, aioExtra }: Props) {
  const router = useRouter();
  const toast = useToast();
  const base = `/p/${project.id}/serp/${keyword.id}`;
  const [tab, setTab] = React.useState<Tab>("results");
  const idx = snapshot ? refs.findIndex((r) => r.id === snapshot.id) : -1;
  const go = React.useCallback(
    (s: string | undefined, c?: string | null) => {
      if (!s) return;
      const q = new URLSearchParams({ s });
      if (c) q.set("c", c);
      router.push(`${base}?${q.toString()}`, { scroll: false });
    },
    [router, base],
  );
  const older = idx >= 0 ? refs[idx + 1]?.id : undefined;
  const newer = idx > 0 ? refs[idx - 1]?.id : undefined;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      if (e.key === "[" && older) go(older, compare?.id);
      if (e.key === "]" && newer) go(newer, compare?.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [older, newer, go, compare?.id]);

  const fetchButton = <PaidButton label="Fetch fresh snapshot" priceMicros={priceFetch} request={{ projectId: project.id, action: "fetch_snapshot", scope: { keywordId: keyword.id } }} shortcut />;
  const refLabel = (r: SnapshotRef) => `${formatDay(r.fetched_at, true)} · ${r.position === null ? "not ranked" : `position ${r.position}`}`;
  const own = (host: string) => matchesDomain(host, project.domain, project.include_subdomains);
  const rival = (host: string) => competitors.find((c) => matchesDomain(host, c.domain, true));

  const otherByUrl = new Map((compare?.organic ?? []).map((o) => [o.url, o.position]));
  const dropped = compare && snapshot ? compare.organic.filter((o) => !snapshot.organic.some((x) => x.url === o.url)) : [];
  const oldQuestions = new Set(compare?.questions ?? []);
  const addQuestion = async (q: string) => {
    const res = await addKeywords(project.id, q.replace(/\?$/, ""), []);
    if (!res.ok) return toast.push(res.error, "error");
    toast.demoEdit();
    toast.push(res.added ? "Added as a tracked keyword. It is priced into the next check." : "That keyword is already tracked.");
    router.refresh();
  };

  const header = (
    <div className="px-4 pb-4 pt-5 md:px-6">
      <Link href={`/p/${project.id}/serp`} className="caption inline-flex items-center gap-1 hover:text-ink">
        <ArrowLeft className="size-3" strokeWidth={1.5} aria-hidden /> All keywords
      </Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="page-title">{keyword.phrase}</h1>
          <p className="num mt-0.5 text-[12px] text-muted">
            Google · {project.country} · {project.language} · desktop{keyword.track_ai_overview ? " · AI Overview checked" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {refs.length > 0 && snapshot ? (
            <>
              <div className="flex items-center">
                <Button size="icon" aria-label="Older snapshot" title="Older snapshot, shortcut [" disabled={!older} onClick={() => go(older, compare?.id)} className="rounded-r-none">
                  <ChevronLeft strokeWidth={1.5} />
                </Button>
                <Select aria-label="Snapshot" value={snapshot.id} onChange={(e) => go(e.target.value, compare?.id)} className="num -mx-px w-56 rounded-none text-[12px]">
                  {refs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {refLabel(r)}
                    </option>
                  ))}
                </Select>
                <Button size="icon" aria-label="Newer snapshot" title="Newer snapshot, shortcut ]" disabled={!newer} onClick={() => go(newer, compare?.id)} className="rounded-l-none">
                  <ChevronRight strokeWidth={1.5} />
                </Button>
              </div>
              <Select aria-label="Compare with" value={compare?.id ?? ""} onChange={(e) => go(snapshot.id, e.target.value || null)} className="num w-56 text-[12px]">
                <option value="">Compare with…</option>
                {refs.filter((r) => r.id !== snapshot.id).map((r) => (
                  <option key={r.id} value={r.id}>
                    {refLabel(r)}
                  </option>
                ))}
              </Select>
            </>
          ) : null}
          {fetchButton}
        </div>
      </div>
    </div>
  );

  if (state === "loading")
    return (
      <>
        {header}
        <div className="grid border-t border-rule bg-surface lg:grid-cols-12" role="status" aria-label="Loading snapshot">
          <div className="space-y-5 px-4 py-5 md:px-6 lg:col-span-7 lg:border-r lg:border-rule">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5" style={{ width: `${50 + ((i * 11) % 35)}%` }} />
                <Skeleton className="w-1/3" />
                <Skeleton className="w-11/12" />
              </div>
            ))}
          </div>
          <div className="space-y-8 px-4 py-5 md:px-6 lg:col-span-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="w-full" />
                <Skeleton className="w-5/6" />
                <Skeleton className="w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </>
    );

  if (!snapshot)
    return (
      <>
        {header}
        <Region>
          <EmptyState title="This keyword has never been checked" actions={fetchButton}>
            <p>A snapshot stores the result list, the AI Overview when you ask for it, People also ask and related searches. One page of results costs <span className="num text-ink">{formatMoney(priceFetch)}</span>.</p>
          </EmptyState>
        </Region>
      </>
    );

  const footer = (
    <div className="border-t border-rule bg-surface px-4 py-3 md:px-6">
      <p className="num text-[12px] leading-5 text-muted">
        {snapshot.operation_id} · run {snapshot.looot_run_id ?? "–"} · cost {formatMoney(snapshot.cost_micros)} · fetched <span title={formatExact(snapshot.fetched_at)}>{formatExact(snapshot.fetched_at)}</span> ({formatRelative(snapshot.fetched_at, now)})
      </p>
      <details className="mt-1.5">
        <summary className="inline-flex text-[12px] text-accent-text hover:underline">Raw JSON</summary>
        <pre className="num mt-2 max-h-80 overflow-auto rounded-ctl border border-rule bg-bg p-3 text-[11px] leading-4">{snapshot.raw ? JSON.stringify(snapshot.raw, null, 2) : "The raw body was larger than 512 KB, so only the normalised parts were stored."}</pre>
      </details>
    </div>
  );

  if (!snapshot.parse_ok)
    return (
      <>
        {header}
        <Region>
          <div role="alert" className="flex max-w-2xl items-start gap-3 px-4 py-8 md:px-6">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.5} aria-hidden />
            <div>
              <p className="font-medium">The provider returned a shape this version cannot read</p>
              <p className="mt-1 text-muted">
                looot charged <span className="num text-ink">{formatMoney(snapshot.cost_micros)}</span> for this call, because the provider answered. The body is kept below as raw JSON. Pick another snapshot, or open an issue with the raw body so the adapter can be fixed.
              </p>
            </div>
          </div>
        </Region>
        {footer}
      </>
    );

  const results = (
    <div>
      {snapshot.answer_box || snapshot.knowledge ? (
        <div className="space-y-2 border-b border-rule px-4 py-3 md:px-6">
          {[["Answer box", snapshot.answer_box] as const, ["Knowledge panel", snapshot.knowledge] as const].map(([label, box]) =>
            box ? (
              <div key={label} className={cn("rounded-ctl border px-3 py-2", own(box.host) ? "border-accent/50" : "border-rule")}>
                <p className="label flex items-center gap-2">
                  {label}
                  {own(box.host) ? <Tag tone="accent">You</Tag> : null}
                  <span className="num font-normal">{box.host}</span>
                </p>
                <p className="mt-1 font-medium">{box.title}</p>
                <p className="mt-0.5 line-clamp-2 text-muted">{box.snippet}</p>
              </div>
            ) : null,
          )}
        </div>
      ) : null}
      {compare ? <p className="caption border-b border-rule px-4 py-1.5 md:px-6">Movement is measured against {formatDay(compare.fetched_at, true)}. A plus means the result moved up.</p> : null}
      <ol>
        {snapshot.organic.map((o) => {
          const mine = own(o.host);
          const comp = mine ? undefined : rival(o.host);
          const before = otherByUrl.get(o.url);
          const move = !compare ? null : before === undefined ? "new" : before - o.position;
          return (
            <li key={`${o.position}-${o.url}`} className={cn("flex gap-3 border-b border-rule py-2.5 pl-4 pr-4 md:pl-6 md:pr-6", mine && "bg-selected/60 shadow-[inset_2px_0_0_var(--accent)]", comp && "shadow-[inset_2px_0_0_var(--text)]")}>
              <span className="num w-6 shrink-0 pt-0.5 text-right text-muted">{o.position}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <DomainIcon domain={o.host} size={14} />
                  <span className="num min-w-0 truncate text-[12px] text-muted">
                    {o.host}
                    <span className="opacity-70">{pathOf(o.url)}</span>
                  </span>
                  {mine ? <Tag tone="accent">You</Tag> : null}
                  {comp ? <Tag tone="ink">{comp.domain}</Tag> : null}
                </p>
                <p className="mt-0.5 truncate text-[14px] font-medium leading-5">{o.title}</p>
                <p className="mt-0.5 line-clamp-2 text-muted">{o.snippet}</p>
              </div>
              {move !== null ? (
                <span className={cn("num w-9 shrink-0 pt-0.5 text-right text-[12px] font-medium", move === "new" ? "text-accent-text" : move > 0 ? "text-accent-text" : move < 0 ? "text-neg" : "text-muted")}>{move === "new" ? "new" : move === 0 ? "=" : move > 0 ? `+${move}` : move}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {dropped.length > 0 ? (
        <div className="px-4 py-3 md:px-6">
          <p className="label">Dropped since {formatDay(compare?.fetched_at ?? "", true)}</p>
          <ul className="mt-1 space-y-1 opacity-60">
            {dropped.slice(0, 12).map((o) => (
              <li key={o.url} className="flex gap-3 text-[12px]">
                <span className="num w-6 text-right text-muted">{o.position}</span>
                <span className="num truncate">{o.host}{pathOf(o.url)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  const aio = (
    <section className="px-4 py-4 md:px-6" aria-label="AI Overview">
      <SectionHead title="AI Overview" />
      {snapshot.ai_overview ? (
        <>
          <p className="mt-2 rounded-ctl border border-rule bg-bg px-3 py-2.5 leading-5">{snapshot.ai_overview.text}</p>
          <p className="label mt-3">Sources</p>
          <ol className="mt-1 space-y-1">
            {snapshot.ai_overview.sources.map((s, i) => (
              <li key={`${s.url}-${i}`} className="flex items-center gap-2 text-[12px]">
                <span className="num w-4 text-right text-muted">{i + 1}</span>
                <DomainIcon domain={s.host} size={14} />
                <span className={cn("num truncate", own(s.host) && "font-medium text-accent-text")}>{s.host}</span>
                {own(s.host) ? <Tag tone="accent">cites you</Tag> : null}
              </li>
            ))}
          </ol>
        </>
      ) : snapshot.aio_checked ? (
        <p className="mt-2 text-muted">No AI Overview on this snapshot.</p>
      ) : (
        <div className="mt-2">
          <p className="text-muted">AI Overview not checked for this keyword.</p>
          <Button
            size="sm"
            className="mt-2"
            disabled={keyword.track_ai_overview}
            onClick={async () => {
              const res = await updateKeywords([keyword.id], { track_ai_overview: true });
              if (!res.ok) return toast.push(res.error, "error");
              toast.demoEdit();
              toast.push(`AI Overview on. Adds ${formatMoney(aioExtra)} to each check of this keyword.`);
              router.refresh();
            }}
          >
            {keyword.track_ai_overview ? "On from the next check" : <>Turn on · <span className="num">+{formatMoney(aioExtra)}</span> per check</>}
          </Button>
        </div>
      )}
    </section>
  );

  const questions = (
    <section className="px-4 py-4 md:px-6" aria-label="People also ask">
      <SectionHead title="People also ask" />
      {snapshot.people_also_ask.length === 0 ? (
        <p className="mt-2 text-muted">No questions on this snapshot.</p>
      ) : (
        <ul className="mt-1.5">
          {snapshot.people_also_ask.map((q) => (
            <li key={q.question} className="border-t border-rule first:border-t-0">
              <details className="group">
                <summary className="flex min-h-9 items-center gap-2 py-1.5 marker:content-none [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-3.5 shrink-0 text-muted transition-transform duration-100 group-open:rotate-90" strokeWidth={1.5} aria-hidden />
                  <span className="min-w-0 flex-1">{q.question}</span>
                  {compare && !oldQuestions.has(q.question) ? <Tag tone="accent">new</Tag> : null}
                  {own(q.host) ? <Tag tone="accent">You</Tag> : null}
                </summary>
                <div className="pb-2.5 pl-[22px]">
                  <p className="text-muted">{q.snippet}</p>
                  <p className="mt-1.5 flex items-center justify-between gap-3">
                    <span className="num truncate text-[12px] text-muted">{q.host}</span>
                    <Button size="sm" variant="ghost" onClick={() => void addQuestion(q.question)}>
                      <Plus strokeWidth={1.5} /> Add as keyword
                    </Button>
                  </p>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const related = (
    <section className="px-4 py-4 md:px-6" aria-label="Related searches">
      <SectionHead title="Related searches" hint="click to stage for Research" />
      {snapshot.related.length === 0 ? (
        <p className="mt-2 text-muted">No related searches on this snapshot.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {snapshot.related.map((r) => (
            <button key={r} type="button" className="inline-flex h-7 items-center gap-1 rounded-ctl border border-rule-strong px-2 text-[12px] transition-colors duration-100 hover:bg-hover" onClick={() => toast.push(`"${r}" staged. ${stageForResearch(project.id, r)} staged for Research.`)}>
              <Plus className="size-3 text-muted" strokeWidth={1.5} aria-hidden />
              {r}
            </button>
          ))}
        </div>
      )}
      <Link href={`/p/${project.id}/research`} className="mt-3 inline-block text-[12px] text-accent-text hover:underline">
        Open Research
      </Link>
    </section>
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: "results", label: `Results ${snapshot.organic.length}` },
    { key: "aio", label: "AI Overview" },
    { key: "questions", label: `Questions ${snapshot.people_also_ask.length}` },
    { key: "related", label: "Related" },
  ];

  return (
    <>
      {header}
      <div className="sticky top-12 z-10 flex gap-5 overflow-x-auto border-y border-rule bg-surface px-4 lg:hidden" role="tablist" aria-label="Snapshot sections">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cn("-mb-px h-10 shrink-0 border-b-2 border-transparent text-[13px] font-medium text-muted", tab === t.key && "border-brand text-ink dark:border-accent")}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid bg-surface lg:grid-cols-12 lg:border-t lg:border-rule">
        <div className={cn("min-w-0 lg:col-span-7 lg:block lg:border-r lg:border-rule", tab !== "results" && "hidden")}>{results}</div>
        <div className="min-w-0 lg:col-span-5 lg:divide-y lg:divide-rule">
          <div className={cn("lg:block", tab !== "aio" && "hidden")}>{aio}</div>
          <div className={cn("lg:block", tab !== "questions" && "hidden")}>{questions}</div>
          <div className={cn("lg:block", tab !== "related" && "hidden")}>{related}</div>
        </div>
      </div>
      {footer}
    </>
  );
}
