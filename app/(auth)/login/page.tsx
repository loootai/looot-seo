import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "./LoginForm";
import { Change, Position, Sparkline } from "@/components/tables/parts";
import { Tag } from "@/components/ui/controls";
import { buildDemoStore } from "@/lib/demo/store";
import { hasSupabaseEnv } from "@/lib/env";
import { formatPercent } from "@/lib/seo/visibility";
import { formatInt } from "@/lib/utils";
import { keywordRows, loadBundle, projectStats } from "@/lib/view/project";

export const metadata: Metadata = { title: "Sign in" };

/** The right-hand panel: the rankings table drawn from the seeded demo project, so it is a real component and not a picture. */
async function Preview() {
  const b = await loadBundle(buildDemoStore(), "kestrel");
  if (!b) return null;
  const s = projectStats(b);
  const rows = keywordRows(b).filter((r) => r.volume !== null).sort((x, y) => (x.position ?? 999) - (y.position ?? 999)).slice(0, 13);
  return (
    <div className="w-full max-w-[640px] overflow-hidden rounded-overlay border border-rule bg-surface shadow-[var(--shadow)]" aria-hidden>
      <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
        <p className="text-[13px] font-semibold">Kestrel Coffee Roasters <span className="num ml-1.5 text-[12px] font-normal text-muted">kestrelcoffee.co · US · en</span></p>
        <Tag tone="warn">Demo data</Tag>
      </div>
      <dl className="hairline-grid grid grid-cols-4 border-b border-rule">
        {[["Estimated visibility", formatPercent(s.visibility)], ["Average position", s.avgPosition?.toFixed(1) ?? "–"], ["Top 10", String(s.top10)], ["Next check", "$0.172"]].map(([k, v]) => (
          <div key={k} className="px-4 py-2.5">
            <dt className="caption">{k}</dt>
            <dd className="num text-[18px] font-medium leading-6">{v}</dd>
          </div>
        ))}
      </dl>
      <table className="tbl">
        <colgroup>
          <col />
          <col style={{ width: 64 }} />
          <col style={{ width: 70 }} />
          <col style={{ width: 84 }} />
          <col style={{ width: 80 }} />
        </colgroup>
        <thead>
          <tr>
            <th>Keyword</th>
            <th className="r">Pos.</th>
            <th className="r">Change</th>
            <th>30 days</th>
            <th className="r">Volume</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.phrase}</td>
              <td className="r"><Position value={r.position} depth={r.depth} /></td>
              <td className="r"><Change kind={r.changeKind} change={r.change} /></td>
              <td><Sparkline values={r.spark} invert max={r.depth} label="" /></td>
              <td className="num r text-muted">{formatInt(r.volume)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-[100dvh] lg:grid-cols-12">
      <div className="flex flex-col px-6 py-8 sm:px-10 lg:col-span-5 lg:px-14">
        <div className="flex items-center gap-2">
          <Image src="/brand/looot-wordmark-2048.png" alt="looot" width={2048} height={717} priority className="-ml-3 h-10 w-auto dark:brightness-0 dark:invert" />
          <span className="-ml-1 rounded-[4px] border border-rule-strong px-1.5 py-0.5 text-[12px] font-medium leading-none text-muted">seo</span>
        </div>
        <div className="flex flex-1 flex-col justify-center py-10">
          <div className="w-full max-w-[360px]">
            <LoginForm configured={hasSupabaseEnv()} linkError={sp.error === "link"} />
          </div>
        </div>
        <p className="caption">
          Powered by <a className="text-accent-text hover:underline" href="https://looot.ai" target="_blank" rel="noreferrer noopener">looot</a>. Self-hosted, MIT licence.
        </p>
      </div>
      <div className="hidden flex-col justify-center gap-6 border-l border-rule bg-bg px-10 py-10 lg:col-span-7 lg:flex xl:px-16">
        <div className="max-w-[640px]">
          <h2 className="text-[20px] font-semibold leading-7 tracking-[-0.01em]">Where you rank, who is ahead, and what it costs to check again.</h2>
          <p className="mt-1.5 max-w-[56ch] text-muted">Every refresh shows its price first and stops at the cap you confirm. A rank check of 42 keywords to the top 30 is $0.126, or $0.172 with AI Overview on for 10 of them.</p>
        </div>
        <Preview />
      </div>
    </main>
  );
}
