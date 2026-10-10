"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import { BookOpen, ChevronsUpDown, CircleDollarSign, FolderKanban, Keyboard, LayoutDashboard, Link2, ListOrdered, LogOut, Menu as MenuIcon, Moon, PanelLeftClose, PanelLeftOpen, Plus, ScanSearch, Search, Settings, SlidersHorizontal, Sun, Swords, Telescope } from "lucide-react";
import { signOut } from "@/app/actions";
import { ProjectSettingsSheet } from "@/components/shell/ProjectSettings";
import { useQuote } from "@/components/quote/QuoteProvider";
import { DomainIcon } from "@/components/tables/parts";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/controls";
import { Dialog, DialogContent, Drawer, DrawerContent, DrawerTrigger, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger, Tip } from "@/components/ui/overlays";
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

/** The frame around every signed-in screen: sidebar (drawer below 1024px), top bar, command palette and keyboard shortcuts. */
export function AppShell({ projects, demo, hasToken, balanceMicros, email, children }: ShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ projectId?: string }>();
  const quote = useQuote();
  const current = projects.find((p) => p.id === params.projectId) ?? null;
  const base = current ? `/p/${current.id}` : null;
  const [palette, setPalette] = React.useState(false);
  const [help, setHelp] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);
  const [switcher, setSwitcher] = React.useState(false);
  const [switcherM, setSwitcherM] = React.useState(false);
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
      setDrawer(false);
      setSwitcher(false);
      setSwitcherM(false);
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

  const sideText = "text-[var(--sidebar-muted)] hover:bg-white/5 hover:text-[var(--sidebar-fg)]";
  const ring = "focus-visible:outline-[#7fe0b8]";
  const closeDrawer = () => setDrawer(false);

  const navLink = (href: string, label: string, Icon: typeof Search, active: boolean, hint?: string) => (
    <Tip key={href} label={hint ? <span className="flex items-center gap-2">{label}<span className="flex gap-0.5"><Kbd>g</Kbd><Kbd>{hint}</Kbd></span></span> : label} side="right">
      <Link href={href} onClick={closeDrawer} aria-current={active ? "page" : undefined} className={cn("rail-pad relative flex h-10 items-center gap-2.5 rounded-ctl px-2.5 text-[13px] transition-colors duration-100 lg:h-9", ring, active ? "bg-[var(--sidebar-active)] font-medium text-[var(--sidebar-fg)]" : sideText)}>
        {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[#12a06a]" aria-hidden /> : null}
        <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
        <span className="rail-text truncate">{label}</span>
      </Link>
    </Tip>
  );

  const sideButton = "rail-pad flex h-10 w-full items-center gap-2.5 rounded-ctl px-2.5 text-left text-[13px] transition-colors duration-100 lg:h-9";

  /** The sidebar content. It is drawn twice: in the fixed sidebar from 1024px and in the drawer below that. */
  const sidebarBody = (inDrawer: boolean) => {
    const open = inDrawer ? switcherM : switcher;
    const setOpen = inDrawer ? setSwitcherM : setSwitcher;
    const suffix = inDrawer ? "-drawer" : "";
    return (
      <>
        <div className="rail-pad flex h-14 shrink-0 items-center gap-2 px-4 lg:h-12">
          <Link href="/" onClick={closeDrawer} className={cn("flex min-h-10 min-w-0 items-center gap-2 rounded-ctl", ring)} aria-label="looot-seo, all projects">
            <Image src="/brand/looot-mark-white.svg" alt="" width={26} height={26} priority unoptimized className="shrink-0" />
            <span className="rail-text truncate text-[15px] font-semibold tracking-[-0.01em]">looot-seo</span>
          </Link>
        </div>

        <div className="rail-pad px-2 pb-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button type="button" role="combobox" aria-expanded={open} aria-controls={`project-switcher${suffix}`} aria-label="Switch project" className={cn("rail-pad flex h-11 w-full items-center gap-2.5 rounded-ctl bg-white/5 px-2 text-left transition-colors duration-100 hover:bg-white/10", ring)}>
                {current ? <DomainIcon domain={current.domain} size={20} /> : <FolderKanban className="size-4 shrink-0 text-[var(--sidebar-muted)]" strokeWidth={1.5} aria-hidden />}
                <span className="rail-text min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium leading-4">{current?.name ?? "All projects"}</span>
                  <span className="num block truncate text-[11px] leading-4 text-[var(--sidebar-muted)]">{current?.domain ?? `${projects.length} in this workspace`}</span>
                </span>
                <ChevronsUpDown className="rail-text size-3.5 shrink-0 text-[var(--sidebar-muted)]" strokeWidth={1.5} aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent id={`project-switcher${suffix}`} className="w-72 p-0" side="bottom">
              <Command label="Projects">
                <div className="flex items-center gap-2 border-b border-rule px-3">
                  <Search className="size-3.5 text-muted" strokeWidth={1.5} aria-hidden />
                  <Command.Input placeholder="Find a project…" className="h-10 w-full bg-transparent text-[13px] outline-none placeholder:text-muted" />
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
                  <Command.Item value="all projects" onSelect={() => go("/")} className="flex h-10 cursor-pointer items-center gap-2 rounded-[4px] px-2 data-[selected=true]:bg-hover">
                    <FolderKanban className="size-3.5 text-muted" strokeWidth={1.5} aria-hidden /> All projects
                  </Command.Item>
                  <Command.Item value="new project" onSelect={() => go("/?new=1")} className="flex h-10 cursor-pointer items-center gap-2 rounded-[4px] px-2 data-[selected=true]:bg-hover">
                    <Plus className="size-3.5 text-muted" strokeWidth={1.5} aria-hidden /> New project
                  </Command.Item>
                  {current ? (
                    <Command.Item value="project settings" onSelect={() => (setOpen(false), setDrawer(false), setSettingsFor(current))} className="flex h-10 cursor-pointer items-center gap-2 rounded-[4px] px-2 data-[selected=true]:bg-hover">
                      <SlidersHorizontal className="size-3.5 text-muted" strokeWidth={1.5} aria-hidden /> Settings for {current.name}
                    </Command.Item>
                  ) : null}
                </Command.List>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2" aria-label={inDrawer ? "Screens, menu" : "Screens"}>
          {base ? NAV.map((n) => navLink(base + n.seg, n.label, n.Icon, isActive(n.seg), n.key)) : [navLink("/", "Projects", FolderKanban, pathname === "/"), navLink("/costs", "Costs", CircleDollarSign, pathname.startsWith("/costs"))]}
        </nav>

        <div className="space-y-0.5 border-t border-white/10 p-2">
          <div className="rail-text mb-1 rounded-ctl bg-white/5 p-2.5" role="group" aria-label={demo ? "Spend, demo data" : "looot balance"}>
            <p className="text-[11px] text-[var(--sidebar-muted)]">{demo ? "Spend" : "looot balance"}</p>
            {demo ? (
              <>
                <p className="num mt-0.5 text-[13px] font-medium">{formatMoney(0)}</p>
                <p className="mt-1 text-[11px] leading-4 text-[var(--sidebar-muted)]">Sample data, nothing charged.</p>
              </>
            ) : balanceMicros !== null ? (
              <Link href={base ? `${base}/costs` : "/costs"} onClick={closeDrawer} className={cn("num mt-0.5 block rounded-ctl text-[13px] font-medium hover:underline", ring)} title="looot balance. Opens Costs.">
                {formatMoney(balanceMicros)}
              </Link>
            ) : (
              <Link href="/settings#looot" onClick={closeDrawer} className={cn("mt-0.5 block rounded-ctl text-[12px] text-[var(--sidebar-muted)] hover:text-[var(--sidebar-fg)]", ring)}>
                {hasToken ? "Balance unavailable" : "No looot token"}
              </Link>
            )}
          </div>
          {demo ? (
            <span className="rail-text mb-1 inline-flex h-6 items-center rounded-full border border-warn/60 bg-warn/10 px-2 text-[11px] font-medium text-[#f0c36a]" title="This workspace runs on seeded data. Nothing is charged and no request is sent.">
              Demo data
            </span>
          ) : null}
          {navLink("/settings", "Settings", Settings, pathname.startsWith("/settings"))}
          <a href="https://docs.looot.ai" target="_blank" rel="noreferrer noopener" className={cn(sideButton, ring, sideText)}>
            <BookOpen className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="rail-text">Docs</span>
          </a>
          <a href="https://github.com/loootai/looot-seo" target="_blank" rel="noreferrer noopener" className={cn(sideButton, ring, sideText)}>
            <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            <span className="rail-text">GitHub</span>
          </a>
          <button type="button" onClick={toggleTheme} className={cn(sideButton, ring, sideText)} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
            {dark ? <Sun className="size-4 shrink-0" strokeWidth={1.5} aria-hidden /> : <Moon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />}
            <span className="rail-text">{dark ? "Light theme" : "Dark theme"}</span>
          </button>
          {inDrawer ? null : (
            <button type="button" onClick={toggleRail} className={cn(sideButton, ring, sideText)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>
              {collapsed ? <PanelLeftOpen className="size-4 shrink-0" strokeWidth={1.5} aria-hidden /> : <PanelLeftClose className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />}
              <span className="rail-text">Collapse</span>
            </button>
          )}
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className={cn(sideButton, ring, "h-11 text-[12px] hover:bg-white/5")} aria-label="Account menu">
                <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-[10px] font-semibold uppercase text-[var(--sidebar-fg)]">{(email ?? "?").charAt(0)}</span>
                <span className="rail-text min-w-0 flex-1 truncate text-[var(--sidebar-muted)]">{email ?? "Signed in"}</span>
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
        </div>
      </>
    );
  };

  return (
    <div className="min-h-[100dvh]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-ctl focus:bg-brand focus:px-3 focus:py-1.5 focus:text-brand-fg">
        Skip to content
      </a>

      <aside className="rail fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-[var(--sidebar)] text-[var(--sidebar-fg)] lg:flex" aria-label="Sidebar">
        {sidebarBody(false)}
      </aside>

      <div className="with-rail">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-rule bg-bg/95 px-3 backdrop-blur-sm sm:px-4 lg:h-12 lg:gap-3 lg:px-6">
          <Drawer open={drawer} onOpenChange={setDrawer}>
            <DrawerTrigger asChild>
              <button type="button" aria-label="Open menu" className="grid size-10 shrink-0 place-items-center rounded-ctl text-ink hover:bg-hover lg:hidden">
                <MenuIcon className="size-5" strokeWidth={1.5} aria-hidden />
              </button>
            </DrawerTrigger>
            <DrawerContent title="looot-seo menu" description={current ? current.name : "All projects"}>
              {sidebarBody(true)}
            </DrawerContent>
          </Drawer>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
            <Link href="/" className={cn("hidden h-10 shrink-0 items-center hover:text-ink sm:inline-flex lg:h-auto", current || crumb ? "text-muted" : "font-medium")}>
              Projects
            </Link>
            {current ? (
              <>
                <span className="hidden text-muted/60 sm:inline" aria-hidden>/</span>
                <Link href={`/p/${current.id}`} className={cn("inline-flex h-10 items-center truncate hover:text-ink lg:h-auto", crumb === "Overview" ? "font-medium" : "text-muted")}>
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
              <span className="inline-flex h-6 items-center rounded-full border border-warn/60 px-2 text-[11px] font-medium text-warn lg:hidden" title="This workspace runs on seeded data. Nothing is charged and no request is sent.">
                Demo
              </span>
            ) : null}
            {current ? (
              <button type="button" onClick={() => quote.open({ projectId: current.id, action: "check_rankings" })} aria-label="Check rankings, shows the price first" className="inline-flex size-10 items-center justify-center gap-1.5 rounded-ctl bg-brand text-[13px] font-medium text-brand-fg transition-colors duration-100 hover:bg-brand-hover sm:w-auto sm:px-3 lg:h-7">
                <ListOrdered className="size-4" strokeWidth={1.5} aria-hidden />
                <span className="hidden sm:inline">Check rankings</span>
              </button>
            ) : null}
            <button type="button" onClick={() => setPalette(true)} className="inline-flex size-10 items-center justify-center gap-1.5 rounded-ctl border border-rule-strong bg-surface text-[12px] text-muted transition-colors duration-100 hover:bg-hover hover:text-ink sm:w-auto sm:px-2 lg:h-7" aria-label="Open the command palette">
              <Search className="size-3.5" strokeWidth={1.5} aria-hidden />
              <span className="hidden xl:inline">Search and run</span>
              <span className="num hidden sm:inline">⌘K</span>
            </button>
          </div>
        </header>
        <main id="main" className="pb-10">
          {children}
        </main>
      </div>


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
