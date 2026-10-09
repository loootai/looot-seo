"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createProject, deleteProject, updateProject } from "@/app/actions";
import { useToast } from "@/components/shell/toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/overlays";
import { CATALOG, fallbackPrice, OP, pagesForDepth, SERP_OPERATIONS } from "@/lib/looot/catalog";
import { COUNTRIES, DEPTHS, LANGUAGES } from "@/lib/markets";
import { formatMoney } from "@/lib/money";
import type { Project, UserDefaults } from "@/lib/types";
import { cn, isValidDomain, normaliseDomain, parseKeywordLines } from "@/lib/utils";

interface FormState {
  domain: string;
  name: string;
  nameTouched: boolean;
  country: string;
  language: string;
  depth: number;
  includeSubdomains: boolean;
  keywords: string;
  serpOperation: string;
}

/** The fields of a project. With no project it creates one and takes first keywords; with a project it edits it. */
export function ProjectForm({ project, defaults, onDone }: { project?: Project | null; defaults?: UserDefaults; onDone: (id?: string) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [s, setS] = React.useState<FormState>({
    domain: project?.domain ?? "",
    name: project?.name ?? "",
    nameTouched: Boolean(project),
    country: project?.country ?? defaults?.country ?? "US",
    language: project?.language ?? defaults?.language ?? "en",
    depth: project?.depth ?? defaults?.depth ?? 30,
    includeSubdomains: project?.include_subdomains ?? false,
    keywords: "",
    serpOperation: project?.serp_operation ?? defaults?.serp_operation ?? OP.serper,
  });
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState("");
  const host = normaliseDomain(s.domain);
  const hostOk = isValidDomain(host);
  const unit = fallbackPrice(s.serpOperation);
  const count = parseKeywordLines(s.keywords).length;
  const pages = pagesForDepth(s.depth);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setS((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostOk) return setError("Enter a domain such as example.com.");
    setPending(true);
    setError(null);
    const input = { domain: s.domain, name: s.name, country: s.country, language: s.language, depth: s.depth, includeSubdomains: s.includeSubdomains, keywords: s.keywords, serpOperation: s.serpOperation };
    const res = project ? await updateProject(project.id, input) : await createProject(input);
    setPending(false);
    if (!res.ok) return setError(res.error);
    toast.demoEdit();
    onDone((res as { id?: string }).id);
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <Field label="Domain" htmlFor="pf-domain" hint={s.domain ? (hostOk ? <>Tracked as <span className="num text-ink">{host}</span></> : "That does not look like a domain yet.") : "A URL works too. It is cleaned to the bare host."}>
          <Input id="pf-domain" name="domain" autoComplete="off" spellCheck={false} placeholder="example.com…" value={s.domain} required onChange={(e) => setS((p) => ({ ...p, domain: e.target.value, name: p.nameTouched ? p.name : normaliseDomain(e.target.value) }))} />
        </Field>
        <Field label="Name" htmlFor="pf-name">
          <Input id="pf-name" name="name" autoComplete="off" value={s.name} onChange={(e) => setS((p) => ({ ...p, name: e.target.value, nameTouched: true }))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country" htmlFor="pf-country">
            <Select id="pf-country" name="country" value={s.country} onChange={(e) => set("country", e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Language" htmlFor="pf-language">
            <Select id="pf-language" name="language" value={s.language} onChange={(e) => set("language", e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} ({l.code})
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <fieldset>
          <legend className="label text-ink">Depth</legend>
          <p className="caption mt-0.5">How many results each check reads. Google returns about 10 per call, so depth sets the cost per keyword.</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {DEPTHS.map((d) => (
              <label key={d} className={cn("flex cursor-pointer flex-col rounded-ctl border px-2.5 py-1.5 transition-colors duration-100", s.depth === d ? "border-brand bg-selected dark:border-accent" : "border-rule-strong hover:bg-hover")}>
                <input type="radio" name="depth" value={d} checked={s.depth === d} onChange={() => set("depth", d)} className="sr-only" />
                <span className="text-[13px] font-medium">Top {d}</span>
                <span className="num caption">{formatMoney(pagesForDepth(d) * unit)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="label block text-ink">Include subdomains</span>
            <span className="caption block">Count blog.{hostOk ? host : "example.com"} as this site.</span>
          </span>
          <Switch checked={s.includeSubdomains} onCheckedChange={(v) => set("includeSubdomains", v)} aria-label="Include subdomains" />
        </label>
        {project ? (
          <Field label="SERP provider" htmlFor="pf-serp" hint="Both return Google results. The price is per call of 10 results.">
            <Select id="pf-serp" name="serp" value={s.serpOperation} onChange={(e) => set("serpOperation", e.target.value)}>
              {SERP_OPERATIONS.map((op) => (
                <option key={op} value={op}>
                  {op} · {formatMoney(fallbackPrice(op))}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="First keywords" htmlFor="pf-keywords" hint={<span className="num">{count === 0 ? "Optional. One per line. You can add them later." : `First check: ${count} ${count === 1 ? "keyword" : "keywords"} x ${pages} ${pages === 1 ? "page" : "pages"} x ${formatMoney(unit)} = ${formatMoney(count * pages * unit)}`}</span>}>
            <Textarea id="pf-keywords" name="keywords" rows={6} spellCheck={false} placeholder={"single origin coffee subscription\nbest coffee beans for espresso…"} value={s.keywords} onChange={(e) => set("keywords", e.target.value)} />
          </Field>
        )}
        {project ? (
          <div className="border-t border-rule pt-4">
            <p className="label text-ink">Delete this project</p>
            <p className="caption mt-0.5">Removes its keywords, history, snapshots and runs. This cannot be undone. Type the domain to confirm.</p>
            <div className="mt-2 flex gap-2">
              <Input aria-label={`Type ${project.domain} to confirm`} autoComplete="off" spellCheck={false} placeholder={project.domain} value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} className="num" />
              <Button
                variant="danger"
                disabled={confirmDelete !== project.domain || pending}
                onClick={async () => {
                  setPending(true);
                  const res = await deleteProject(project.id);
                  setPending(false);
                  if (!res.ok) return setError(res.error);
                  toast.demoEdit();
                  onDone();
                  router.push("/");
                  router.refresh();
                }}
              >
                Delete project
              </Button>
            </div>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-[12px] text-neg">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-rule px-5 py-3">
        <p className="caption">{project ? "Changes apply to the next check." : "Creating a project spends nothing."}</p>
        <Button type="submit" variant="primary" disabled={pending} className="min-w-28">
          {pending ? <Loader2 className="animate-spin" aria-label="Saving" /> : project ? "Save changes" : "Create project"}
        </Button>
      </div>
    </form>
  );
}

/** Per-project settings, opened from the project switcher. */
export function ProjectSettingsSheet({ project, onClose }: { project: Project | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(project)} onOpenChange={(o) => !o && onClose()}>
      {project ? (
        <SheetContent title="Project settings" description={project.domain}>
          <ProjectForm key={project.id} project={project} onDone={onClose} />
        </SheetContent>
      ) : null}
    </Sheet>
  );
}

/** Price table rows for the pinned operations, used by Costs and Settings. */
export const PRICE_ROWS = CATALOG;
