"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import { BarChart3, ChevronsUpDown, CircleDollarSign, Ellipsis, FolderKanban, Keyboard, LayoutDashboard, Link2, ListOrdered, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Plus, ScanSearch, Search, Settings, SlidersHorizontal, Sun, Swords, Telescope } from "lucide-react";
import { signOut } from "@/app/actions";
import { ProjectSettingsSheet } from "@/components/shell/ProjectSettings";
import { useQuote } from "@/components/quote/QuoteProvider";
import { DomainIcon } from "@/components/tables/parts";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/controls";
import { Dialog, DialogContent, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger, Sheet, SheetContent, Tip } from "@/components/ui/overlays";
import { formatMoney } from "@/lib/money";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { key: "o", seg: "", label: "Overview", Icon: LayoutDashboard },
  { key: "r", seg: "/rankings", label: "Rankings", Icon: ListOrdered },
  { key: "k", seg: "/research", label: "Research", Icon: Telescope },
  { key: "s", seg: "/serp", label: "SERP", Icon: ScanSearch },
  { key: "c", seg: "/competitors", label: "Competitors", Icon: Swords },
  { key: "b", seg: "/backlinks", label: "Backlinks", Icon: Link2 },
  { key: "$", seg: "/costs", label: "Costs", Icon: CircleDollarSign },
] as const;

const SHORTCUTS: { keys: string[]; what: string }[] = [
  { keys: ["⌘", "K"], what: "Open the command palette" },
  { keys: ["g", "o"], what: "Go to Overview" },
  { keys: ["g", "r"], what: "Go to Rankings" },
  { keys: ["g", "k"], what: "Go to Research (keywords)" },
  { keys: ["g", "s"], what: "Go to SERP" },
  { keys: ["g", "c"], what: "Go to Competitors" },
  { keys: ["g", "b"], what: "Go to Backlinks" },
  { keys: ["g", "$"], what: "Go to Costs" },
  { keys: ["g", "p"], what: "Go to Projects" },
  { keys: ["j"], what: "Move down a row" },
  { keys: ["k"], what: "Move up a row" },
  { keys: ["Enter"], what: "Open the focused row" },
  { keys: ["x"], what: "Select the focused row" },
  { keys: ["/"], what: "Focus the filter" },
  { keys: ["Esc"], what: "Clear the filter, close a panel" },
  { keys: ["r"], what: "Open the quote for this screen's main refresh" },
  { keys: ["["], what: "SERP viewer: older snapshot" },
  { keys: ["]"], what: "SERP viewer: newer snapshot" },
  { keys: ["?"], what: "Show this list" },
];

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
}

export interface ShellProps {
  projects: Project[];
  demo: boolean;
  hasToken: boolean;
  balanceMicros: number | null;
  email: string | null;
  children: React.ReactNode;
}

/** The frame around every signed-in screen: rail, top bar, phone tab bar, command palette and keyboard shortcuts. */
export function AppShell({ projects, demo, hasToken, balanceMicros, email, children }: ShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ projectId?: string }>();
  const quote = useQuote();
  const current = projects.find((p) => p.id === params.projectId) ?? null;
  const base = current ? `/p/${current.id}` : null;
  const [palette, setPalette] = React.useState(false);
  const [help, setHelp] = React.useState(false);
  const [more, setMore] = React.useState(false);
  const [switcher, setSwitcher] = React.useState(false);
  const [settingsFor, setSettingsFor] = React.useState<Project | null>(null);
  const [dark, setDark] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setCollapsed(document.documentElement.getAttribute("data-rail") === "collapsed");
  }, []);

  const toggleTheme = React.useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("seo-theme", next ? "dark" : "light");
    } catch {}
    setDark(next);
  }, []);
  const toggleRail = () => {
    const next = !collapsed;
    if (next) document.documentElement.setAttribute("data-rail", "collapsed");
    else document.documentElement.removeAttribute("data-rail");
    try {
      localStorage.setItem("seo-rail", next ? "collapsed" : "open");
    } catch {}
    setCollapsed(next);
  };

  const go = React.useCallback(
    (href: string) => {
      setPalette(false);
      setMore(false);
      setSwitcher(false);
      router.push(href);
    },
    [router],
  );

  // Global shortcuts. None fires while a field has focus.
  const gAt = React.useRef(0);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((o) => !o);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector("[role='dialog'][data-state='open']")) return;
      const now = Date.now();
      if (now - gAt.current < 1200) {
        gAt.current = 0;
        if (e.key === "p") return void (e.preventDefault(), router.push("/"));
        const item = NAV.find((n) => n.key === e.key);
        if (item && base) return void (e.preventDefault(), router.push(base + item.seg));
        if (e.key === "$" && !base) return void (e.preventDefault(), router.push("/costs"));
      }
      if (e.key === "g") gAt.current = now;
      else if (e.key === "?") (e.preventDefault(), setHelp(true));
      else if (e.key === "/") {
        const input = document.querySelector<HTMLInputElement>("[data-filter-input]");
        if (input) (e.preventDefault(), input.focus(), input.select());
      } else if (e.key === "r") window.dispatchEvent(new Event("seo:refresh"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, base]);

  const activeSeg = base && pathname.startsWith(base) ? pathname.slice(base.length) : null;
  const isActive = (seg: string) => activeSeg !== null && (seg === "" ? activeSeg === "" : activeSeg.startsWith(seg));
  const crumb = current ? (NAV.find((n) => n.seg !== "" && isActive(n.seg))?.label ?? "Overview") : pathname.startsWith("/costs") ? "Costs" : pathname.startsWith("/settings") ? "Settings" : null;

  const navLink = (href: string, label: string, Icon: typeof Search, active: boolean, hint?: string) => (
    <Tip key={href} label={hint ? <span className="flex items-center gap-2">{label}<span className="flex gap-0.5"><Kbd>g</Kbd><Kbd>{hint}</Kbd></span></span> : label} side="right">
      <Link href={href} aria-current={active ? "page" : undefined} className={cn("rail-pad flex h-8 items-center gap-2.5 rounded-ctl px-2.5 text-[13px] text-muted transition-colors duration-100 hover:bg-hover hover:text-ink", active && "bg-selected font-medium text-ink")}>
        <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
        <span className="rail-text truncate">{label}</span>
      </Link>
    </Tip>
  );

  return (
    <div className="min-h-[100dvh]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-ctl focus:bg-brand focus:px-3 focus:py-1.5 focus:text-brand-fg">
        Skip to content
      </a>

      <aside className="rail fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-rule bg-surface md:flex" aria-label="Main">
        <div className="rail-pad flex h-12 shrink-0 items-center gap-2 border-b border-rule px-3.5">
          <Link href="/" className="flex items-center gap-2" aria-label="looot seo, all projects">
            <Image src="/brand/looot-mark.svg" alt="" width={24} height={24} priority unoptimized />
            <span className="rail-text text-[15px] font-medium tracking-[-0.01em]">seo</span>
          </Link>
        </div>

        <div className="rail-pad border-b border-rule p-2">
          <Popover open={switcher} onOpenChange={setSwitcher}>
            <PopoverTrigger asChild>
              <button type="button" role="combobox" aria-expanded={switcher} aria-controls="project-switcher" aria-label="Switch project" className="rail-pad flex h-10 w-full items-center gap-2.5 rounded-ctl px-2 text-left transition-colors duration-100 hover:bg-hover">
                {current ? <DomainIcon domain={current.domain} size={20} /> : <FolderKanban className="size-4 shrink-0 text-muted" strokeWidth={1.5} aria-hidden />}
                <span className="rail-text min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium leading-4">{current?.name ?? "All projects"}</span>
                  <span className="num block truncate text-[11px] leading-4 text-muted">{current?.domain ?? `${projects.length} in this workspace`}</span>
                </span>
                <ChevronsUpDown className="rail-text size-3.5 shrink-0 text-muted" strokeWidth={1.5} aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent id="project-switcher" className="w-72 p-0" side="bottom">
              <Command label="Projects">
                <div className="flex items-center gap-2 border-b border-rule px-3">
                  <Search className="size-3.5 text-muted" strokeWidth={1.5} aria-hidden />
                  <Command.Input placeholder="Find a project…" className="h-9 w-full bg-transparent text-[13px] outline-none placeholder:text-muted" />
                </div>
                <Command.List className="max-h-72 overflow-y-auto p-1">
                  <Command.Empty className="px-3 py-4 text-muted">No project matches.</Command.Empty>
                  {projects.map((p) => (
                    <Command.Item key={p.id} value={`${p.name} ${p.domain}`} onSelect={() => go(`/p/${p.id}`)} className="flex h-10 cursor-pointer items-center gap-2.5 rounded-[4px] px-2 data-[selected=true]:bg-hover">
                      <DomainIcon domain={p.domain} size={18} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] leading-4">{p.name}</span>
                        <span className="num block truncate text-[11px] leading-4 text-muted">{p.domain}</span>
                      </span>
                      <span className="num caption">{p.country} · {p.language}</span>
                    </Command.Item>
                  ))}
                  <div className="-mx-1 my-1 h-px bg-rule" />
                  <Command.Item value="all projects" onSelect={() => go("/")} className="flex h-8 cursor-pointer items-center gap-2 rounded-[4px] px-2 data-[selected=true]:bg-hover">
                    <FolderKanban className="size-3.5 text-muted" strokeWidth={1.5} aria-hidden /> All projects
                  </Command.Item>
                  <Command.Item value="new project" onSelect={() => go("/?new=1")} className="flex h-8 cursor-pointer items-center gap-2 rounded-[4px] px-2 data-[selected=true]:bg-hover">
                    <Plus className="size-3.5 text-muted" strokeWidth={1.5} aria-hidden /> New project
                  </Command.Item>
                  {current ? (
                    <Command.Item value="project settings" onSelect={() => (setSwitcher(false), setSettingsFor(current))} className="flex h-8 cursor-pointer items-center gap-2 rounded-[4px] px-2 data-[selected=true]:bg-hover">
                      <SlidersHorizontal className="size-3.5 text-muted" strokeWidth={1.5} aria-hidden /> Settings for {current.name}
                    </Command.Item>
                  ) : null}
                </Command.List>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Screens">
          {base ? NAV.map((n) => navLink(base + n.seg, n.label, n.Icon, isActive(n.seg), n.key)) : [navLink("/", "Projects", FolderKanban, pathname === "/"), navLink("/costs", "Costs", CircleDollarSign, pathname.startsWith("/costs"))]}
        </nav>

        <div className="space-y-0.5 border-t border-rule p-2">
          {navLink("/settings", "Settings", Settings, pathname.startsWith("/settings"))}
          <button type="button" onClick={toggleTheme} className="rail-pad flex h-8 w-full items-center gap-2.5 rounded-ctl px-2.5 text-[13px] text-muted transition-colors duration-100 hover:bg-hover hover:text-ink" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
            {dark ? <Sun className="size-4 shrink-0" strokeWidth={1.5} aria-hidden /> : <Moon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />}
            <span className="rail-text">{dark ? "Light theme" : "Dark theme"}</span>
          </button>
          <button type="button" onClick={toggleRail} className="rail-pad flex h-8 w-full items-center gap-2.5 rounded-ctl px-2.5 text-[13px] text-muted transition-colors duration-100 hover:bg-hover hover:text-ink" aria-label={collapsed ? "Expand the side rail" : "Collapse the side rail"}>
            {collapsed ? <PanelLeftOpen className="size-4 shrink-0" strokeWidth={1.5} aria-hidden /> : <PanelLeftClose className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />}
            <span className="rail-text">Collapse</span>
          </button>
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className="rail-pad flex h-9 w-full items-center gap-2.5 rounded-ctl px-2.5 text-left text-[12px] transition-colors duration-100 hover:bg-hover" aria-label="Account menu">
                <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-full bg-selected text-[10px] font-semibold uppercase text-ink">{(email ?? "?").charAt(0)}</span>
                <span className="rail-text min-w-0 flex-1 truncate text-muted">{email ?? "Signed in"}</span>
              </button>
            </MenuTrigger>
            <MenuContent align="start" side="top">
              <MenuLabel>{demo ? "Demo workspace" : email}</MenuLabel>
              <MenuItem onSelect={() => router.push("/settings")}>
                <Settings strokeWidth={1.5} /> Settings
              </MenuItem>
              <MenuSeparator />
              <MenuItem disabled={demo} onSelect={() => void signOut()}>
                <LogOut strokeWidth={1.5} /> {demo ? "Sign out (not in demo)" : "Sign out"}
              </MenuItem>
            </MenuContent>
          </Menu>
          <a href="https://looot.ai" target="_blank" rel="noreferrer noopener" className="rail-text block px-2.5 pb-0.5 pt-1.5 text-[11px] text-muted hover:text-ink">
            Powered by looot
          </a>
        </div>
      </aside>

      <div className="with-rail">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-rule bg-bg/95 px-4 backdrop-blur-sm md:px-6">
          <Link href="/" className="flex items-center gap-1.5 md:hidden" aria-label="looot seo, all projects">
            <Image src="/brand/looot-mark.svg" alt="" width={22} height={22} unoptimized />
          </Link>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
            <Link href="/" className={cn("hidden shrink-0 hover:text-ink sm:inline", current || crumb ? "text-muted" : "font-medium")}>
              Projects
            </Link>
            {current ? (
              <>
                <span className="hidden text-muted/60 sm:inline" aria-hidden>/</span>
                <Link href={`/p/${current.id}`} className={cn("truncate hover:text-ink", crumb === "Overview" ? "font-medium" : "text-muted")}>
                  {current.name}
                </Link>
                {crumb && crumb !== "Overview" ? (
                  <>
                    <span className="text-muted/60" aria-hidden>/</span>
                    <span className="shrink-0 font-medium" aria-current="page">{crumb}</span>
                  </>
                ) : null}
              </>
            ) : crumb ? (
              <>
                <span className="hidden text-muted/60 sm:inline" aria-hidden>/</span>
                <span className="font-medium" aria-current="page">{crumb}</span>
              </>
            ) : null}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {demo ? (
              <span className="inline-flex h-6 items-center rounded-full border border-warn/60 px-2 text-[11px] font-medium text-warn" title="This workspace runs on seeded data. Nothing is charged and no request is sent.">
                Demo data
              </span>
            ) : null}
            {demo ? (
              <span className="hidden text-[12px] text-muted sm:inline">No token needed</span>
            ) : balanceMicros !== null ? (
              <Link href={base ? `${base}/costs` : "/costs"} className="num inline-flex h-7 items-center rounded-ctl border border-rule-strong bg-surface px-2 text-[12px] hover:bg-hover" title="looot balance. Opens Costs.">
                {formatMoney(balanceMicros)}
              </Link>
            ) : (
              <Link href="/settings#looot" className="hidden text-[12px] text-muted hover:text-ink sm:inline">
                {hasToken ? "Balance unavailable" : "No looot token"}
              </Link>
            )}
            <button type="button" onClick={() => setPalette(true)} className="inline-flex h-7 items-center gap-1.5 rounded-ctl border border-rule-strong bg-surface px-2 text-[12px] text-muted transition-colors duration-100 hover:bg-hover hover:text-ink" aria-label="Open the command palette">
              <Search className="size-3.5" strokeWidth={1.5} aria-hidden />
              <span className="hidden lg:inline">Search and run</span>
              <span className="num hidden sm:inline">⌘K</span>
            </button>
          </div>
        </header>
        <main id="main" className="pb-20 md:pb-10">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid h-14 grid-cols-5 border-t border-rule bg-surface pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Screens">
        {(base ? [NAV[0], NAV[1], NAV[2], NAV[4]] : []).map((n) => (
          <Link key={n.seg} href={(base as string) + n.seg} aria-current={isActive(n.seg) ? "page" : undefined} className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] text-muted", isActive(n.seg) && "font-medium text-ink")}>
            <n.Icon className="size-[18px]" strokeWidth={isActive(n.seg) ? 2 : 1.5} aria-hidden />
            {n.label}
          </Link>
        ))}
        {!base ? (
          <>
            <Link href="/" aria-current={pathname === "/" ? "page" : undefined} className={cn("col-span-2 flex flex-col items-center justify-center gap-0.5 text-[11px] text-muted", pathname === "/" && "font-medium text-ink")}>
              <FolderKanban className="size-[18px]" strokeWidth={1.5} aria-hidden /> Projects
            </Link>
            <Link href="/costs" aria-current={pathname.startsWith("/costs") ? "page" : undefined} className={cn("col-span-2 flex flex-col items-center justify-center gap-0.5 text-[11px] text-muted", pathname.startsWith("/costs") && "font-medium text-ink")}>
              <BarChart3 className="size-[18px]" strokeWidth={1.5} aria-hidden /> Costs
            </Link>
          </>
        ) : null}
        <button type="button" onClick={() => setMore(true)} className="flex flex-col items-center justify-center gap-0.5 text-[11px] text-muted" aria-haspopup="dialog">
          <Ellipsis className="size-[18px]" strokeWidth={1.5} aria-hidden /> More
        </button>
      </nav>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent title="More" description={current ? current.name : "All projects"}>
          <div className="space-y-0.5 overflow-y-auto p-2">
            {base
              ? NAV.map((n) => (
                  <button key={n.seg} type="button" onClick={() => go(base + n.seg)} className={cn("flex h-11 w-full items-center gap-3 rounded-ctl px-3 text-left text-[14px]", isActive(n.seg) && "bg-selected font-medium")}>
                    <n.Icon className="size-4 text-muted" strokeWidth={1.5} aria-hidden /> {n.label}
                  </button>
                ))
              : null}
            <div className="my-1 h-px bg-rule" />
            {projects.map((p) => (
              <button key={p.id} type="button" onClick={() => go(`/p/${p.id}`)} className="flex h-11 w-full items-center gap-3 rounded-ctl px-3 text-left text-[14px]">
                <DomainIcon domain={p.domain} size={18} /> <span className="truncate">{p.name}</span>
              </button>
            ))}
            <button type="button" onClick={() => go("/")} className="flex h-11 w-full items-center gap-3 rounded-ctl px-3 text-left text-[14px]">
              <FolderKanban className="size-4 text-muted" strokeWidth={1.5} aria-hidden /> All projects
            </button>
            <div className="my-1 h-px bg-rule" />
            {current ? (
              <button type="button" onClick={() => (setMore(false), setSettingsFor(current))} className="flex h-11 w-full items-center gap-3 rounded-ctl px-3 text-left text-[14px]">
                <SlidersHorizontal className="size-4 text-muted" strokeWidth={1.5} aria-hidden /> Project settings
              </button>
            ) : null}
            <button type="button" onClick={() => go("/settings")} className="flex h-11 w-full items-center gap-3 rounded-ctl px-3 text-left text-[14px]">
              <Settings className="size-4 text-muted" strokeWidth={1.5} aria-hidden /> Settings
            </button>
            <button type="button" onClick={toggleTheme} className="flex h-11 w-full items-center gap-3 rounded-ctl px-3 text-left text-[14px]">
              {dark ? <Sun className="size-4 text-muted" strokeWidth={1.5} aria-hidden /> : <Moon className="size-4 text-muted" strokeWidth={1.5} aria-hidden />} {dark ? "Light theme" : "Dark theme"}
            </button>
            <a href="https://looot.ai" target="_blank" rel="noreferrer noopener" className="block px-3 pt-3 text-[12px] text-muted">
              Powered by looot
            </a>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={palette} onOpenChange={setPalette}>
        <DialogContent title="Command palette" description="Go to a screen, switch project, or start a refresh." className="md:top-[18%] md:translate-y-0" hideClose>
          <Command label="Command palette" className="flex min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b border-rule px-4">
              <Search className="size-4 text-muted" strokeWidth={1.5} aria-hidden />
              <Command.Input autoFocus placeholder="Type a command or a project…" className="h-11 w-full bg-transparent text-[14px] outline-none placeholder:text-muted" />
            </div>
            <Command.List className="max-h-[50dvh] overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-muted">
              <Command.Empty className="px-3 py-6 text-muted">Nothing matches. Try a screen name or a domain.</Command.Empty>
              {current && base ? (
                <Command.Group heading={`In ${current.name}`}>
                  <PaletteItem onSelect={() => (setPalette(false), quote.open({ projectId: current.id, action: "check_rankings" }))} Icon={ListOrdered} label="Check rankings" hint="shows the price first" />
                  <PaletteItem onSelect={() => go(`${base}/rankings?add=1`)} Icon={Plus} label="Add keywords" />
                  {NAV.map((n) => (
                    <PaletteItem key={n.seg} onSelect={() => go(base + n.seg)} Icon={n.Icon} label={`Go to ${n.label}`} keys={["g", n.key]} />
                  ))}
                </Command.Group>
              ) : null}
              <Command.Group heading="Projects">
                {projects.map((p) => (
                  <Command.Item key={p.id} value={`switch ${p.name} ${p.domain}`} onSelect={() => go(`/p/${p.id}`)} className="flex h-9 cursor-pointer items-center gap-2.5 rounded-[4px] px-2 data-[selected=true]:bg-hover">
                    <DomainIcon domain={p.domain} size={16} />
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="num caption">{p.domain}</span>
                  </Command.Item>
                ))}
                <PaletteItem onSelect={() => go("/")} Icon={FolderKanban} label="All projects" keys={["g", "p"]} />
                <PaletteItem onSelect={() => go("/?new=1")} Icon={Plus} label="New project" />
              </Command.Group>
              <Command.Group heading="App">
                <PaletteItem onSelect={() => go("/costs")} Icon={CircleDollarSign} label="Costs across all projects" />
                <PaletteItem onSelect={() => go("/settings")} Icon={Settings} label="Settings" />
                <PaletteItem onSelect={() => (toggleTheme(), setPalette(false))} Icon={dark ? Sun : Moon} label={dark ? "Switch to light theme" : "Switch to dark theme"} />
                <PaletteItem onSelect={() => (setPalette(false), setHelp(true))} Icon={Keyboard} label="Keyboard shortcuts" keys={["?"]} />
              </Command.Group>
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent title="Keyboard shortcuts" description="None of these fire while you are typing in a field.">
          <ul className="grid gap-x-8 overflow-y-auto px-5 py-3 sm:grid-cols-2">
            {SHORTCUTS.map((s) => (
              <li key={s.what} className="flex h-8 items-center justify-between gap-3 border-b border-rule text-[12px]">
                <span className="truncate">{s.what}</span>
                <span className="flex shrink-0 gap-1">
                  {s.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end border-t border-rule px-5 py-3">
            <Button onClick={() => setHelp(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ProjectSettingsSheet project={settingsFor} onClose={() => setSettingsFor(null)} />
    </div>
  );
}

function PaletteItem({ onSelect, Icon, label, hint, keys }: { onSelect: () => void; Icon: typeof Search; label: string; hint?: string; keys?: readonly string[] }) {
  return (
    <Command.Item value={label} onSelect={onSelect} className="flex h-9 cursor-pointer items-center gap-2.5 rounded-[4px] px-2 data-[selected=true]:bg-hover">
      <Icon className="size-4 text-muted" strokeWidth={1.5} aria-hidden />
      <span className="flex-1 truncate">{label}</span>
      {hint ? <span className="caption">{hint}</span> : null}
      {keys ? (
        <span className="flex gap-0.5">
          {keys.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </span>
      ) : null}
    </Command.Item>
  );
}
