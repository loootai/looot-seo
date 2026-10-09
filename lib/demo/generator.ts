import { DEMO_SEED, KESTREL_TRACKS, KESTREL_WORDS, NEUTRAL_DOMAINS, VOLUME_STEPS, type SeedKeyword, type SeedProject, type Track } from "@/lib/demo/seed";
import type { AiOverview, FeatureBox, OrganicRow, PaaRow } from "@/lib/types";

/** Small seeded random number generator. Same seed, same sequence, on every machine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A generator seeded from the demo seed and any number of labels. */
export function rngFor(...parts: (string | number)[]): () => number {
  return mulberry32(fnv(parts.join("|")) ^ DEMO_SEED);
}

const pick = <T>(r: () => number, list: T[]): T => list[Math.floor(r() * list.length)] as T;
const between = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(For|Vs|To|Of|And|In|A|The|Do|Per)\b/g, (m) => m.toLowerCase()).replace(/^./, (m) => m.toUpperCase());
}

/** Picks the seeded volume assignment that lands the Kestrel stat strip on 18.6% estimated visibility. */
export const VOLUME_SALT = 380;

/** The 30 generated Kestrel keywords: templates over the fixed word lists, with seeded volumes and difficulties. */
export function generatedKestrelKeywords(salt: number = VOLUME_SALT): SeedKeyword[] {
  const r = rngFor("kestrel-keywords");
  const rv = rngFor("kestrel-volumes", salt);
  const w = KESTREL_WORDS;
  const phrases = new Set<string>();
  const templates = [
    () => `${pick(r, w.origins)} ${pick(r, w.products)}`,
    () => `best coffee for ${pick(r, w.methods)}`,
    () => `${pick(r, w.modifiers)} ${pick(r, w.products)}`,
    () => pick(r, w.howtos),
    () => `${pick(r, w.methods)} coffee ratio`,
    () => `${pick(r, w.modifiers)} coffee subscription`,
  ];
  let guard = 0;
  while (phrases.size < 30 && guard++ < 2000) {
    const p = (templates[phrases.size % templates.length] as () => string)();
    if (p !== "best coffee for french press" && p !== "cold brew coffee ratio") phrases.add(p);
  }
  const aioFlags: (SeedKeyword["aio"] | undefined)[] = ["cited", "present", "cited", "present", "present", "cited", "present", "present"];
  return [...phrases].map((phrase, i) => {
    const track = KESTREL_TRACKS[i] as Track;
    // The site ranks best where it has put the most work in, so better positions lean towards larger keywords.
    const now = track[0];
    const [lo, hi] = now === 0 ? [0, 8] : now <= 3 ? [14, 20] : now <= 10 ? [8, 17] : [0, 12];
    const volume = VOLUME_STEPS[between(rv, lo, hi)] as number;
    const tags = phrase.startsWith("how") || phrase.endsWith("ratio") ? ["journal", "brewing"] : phrase.includes("subscription") ? ["subscription"] : ["beans"];
    return {
      phrase,
      volume,
      difficulty: between(r, 8, 71),
      track,
      aio: aioFlags[i],
      answerBox: i === 4 || i === 9 || i === 15 || i === 21 ? "present" : i === 5 ? "owned" : undefined,
      paaOwned: i === 1 || i === 7,
      tags,
    };
  });
}

/** Check dates of a project as YYYY-MM-DD, oldest first. */
export function checkDays(p: SeedProject): string[] {
  if (!p.firstCheck) return [];
  const days = [p.firstCheck];
  const d = new Date(`${p.firstCheck}T00:00:00Z`);
  for (const step of p.intervals) {
    d.setUTCDate(d.getUTCDate() + step);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/** Hour and minute of a check, so timestamps look like a person clicked the button. */
export function checkTime(day: string, i: number): string {
  const r = rngFor("check-time", day, i);
  return `${day}T${String(between(r, 7, 11)).padStart(2, "0")}:${String(between(r, 0, 59)).padStart(2, "0")}:00.000Z`;
}

const DIP_DAY = "2026-09-11";

/**
 * Position of a keyword on each check. The track fixes three points (first check, 30 days ago, now);
 * the rest is a straight line between them with one place of seeded noise. On Kestrel, journal pages
 * drop on 11 Sep and are most of the way back by the next check. 0 means outside the depth.
 */
export function positionSeries(p: SeedProject, kw: SeedKeyword, days: string[]): (number | null)[] {
  const n = days.length;
  const [now, mid, start] = kw.track;
  const off = p.depth + 6;
  const v = (x: number) => (x === 0 ? off : x);
  const midIdx = Math.max(0, days.findIndex((d) => d >= addDays(days[n - 1] as string, -30)));
  const r = rngFor("series", p.id, kw.phrase);
  const out: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    let x: number;
    if (i === 0) x = v(start);
    else if (i === n - 1) x = v(now);
    else if (i === midIdx) x = v(mid);
    else if (i < midIdx) x = v(start) + ((v(mid) - v(start)) * i) / Math.max(1, midIdx);
    else x = v(mid) + ((v(now) - v(mid)) * (i - midIdx)) / Math.max(1, n - 1 - midIdx);
    const anchor = i === 0 || i === n - 1 || i === midIdx;
    if (!anchor && x > 2) x += between(r, -1, 1);
    if (p.id === "kestrel" && !kw.knowledge) {
      const hit = (fnv(kw.phrase) % 10) / 10;
      const size = hit < 0.75 ? 3 + (fnv(kw.phrase + "d") % 7) : 0;
      if (days[i] === DIP_DAY) x += size;
      else if (i > 0 && days[i - 1] === DIP_DAY) x += Math.round(size / 3);
    }
    const pos = Math.max(1, Math.round(x));
    out.push(pos > p.depth ? null : pos);
  }
  return out;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Where a competitor sits for a keyword on a check, or null. Stable per keyword with a slow drift. */
export function competitorPosition(p: SeedProject, kw: SeedKeyword, domain: string, checkIdx: number): number | null {
  const base = rngFor("comp", p.id, kw.phrase, domain);
  const strength = 0.55 + (fnv(domain) % 30) / 100;
  if (base() > strength) return null;
  const home = between(base, 1, p.depth + 4);
  const drift = Math.round(Math.sin((checkIdx + (fnv(domain + kw.phrase) % 9)) / 3.1) * 2);
  const pos = Math.max(1, home + drift);
  return pos > p.depth ? null : pos;
}

type Kind = "howto" | "compare" | "brand" | "product";
function kindOf(phrase: string, kw?: SeedKeyword): Kind {
  if (kw?.knowledge) return "brand";
  if (/^how /.test(phrase) || /exercises|treatment|ratio$/.test(phrase)) return "howto";
  if (phrase.includes(" vs ")) return "compare";
  return "product";
}

/** Path of the project's own page for a keyword. Kestrel's guides lived under /blog until the 11 Sep move. */
export function ownPath(p: SeedProject, kw: SeedKeyword, day: string): string {
  const kind = kindOf(kw.phrase, kw);
  if (kind === "brand") return "/";
  const s = slug(kw.phrase.replace(/^best /, ""));
  if (p.id === "kestrel") {
    if (kind === "howto" || kind === "compare" || kw.cannibalised) return `${day < DIP_DAY ? "/blog" : "/journal"}/${s}`;
    return kw.phrase.includes("subscription") ? `/subscriptions/${s}` : `/coffee/${s}`;
  }
  return kind === "howto" ? `/advice/${s}` : `/${s}`;
}

const TITLE_TAILS: Record<Kind, string[]> = {
  product: ["Compared and Ranked", "What to Buy in 2026", "A Buyer's Guide", "Tested by Our Team", "Prices and Picks", "Shop the Range"],
  howto: ["A Step by Step Guide", "What Actually Works", "Common Mistakes to Avoid", "Explained Simply", "The Short Version"],
  compare: ["Which One Has More", "The Real Difference", "A Side by Side Look", "What the Numbers Say"],
  brand: ["Official Site", "About Us", "Reviews and Opening Hours"],
};
const SNIPPETS: Record<Kind, string[]> = {
  product: [
    "We compared {n} options on price, freshness and delivery time. Here is how each one did and who it suits.",
    "Updated for 2026. Our picks for {kw}, with notes on what changed since last year and what to skip.",
    "Looking for {kw}? Start with these {n} choices, then use the checklist at the end to narrow it down.",
    "{kw}: what to look for, what it should cost, and the questions worth asking before you order.",
  ],
  howto: [
    "A plain guide to {kw}. Covers the method in {n} steps, the tools you need and how to fix the usual problems.",
    "Most advice on {kw} skips the part that matters. This walk-through shows each step with timings.",
    "Everything we have learned about {kw} from {n} years of doing it daily, written for beginners.",
  ],
  compare: [
    "The short answer on {kw}, then the detail: how each is measured and why the common belief is off.",
    "We looked at {n} sources on {kw}. Here is what they agree on and where the numbers differ.",
  ],
  brand: ["{kw}. Find opening hours, contact details and what customers say.", "Learn more about {kw}, the team behind it and how to get in touch."],
};

function fill(t: string, kw: string, r: () => number): string {
  return t.replace("{kw}", titleCase(kw)).replace("{n}", String(between(r, 4, 12)));
}

function rowFor(host: string, path: string, phrase: string, kind: Kind, position: number): OrganicRow {
  // Seeded per site and keyword, so a page keeps its title and snippet from one check to the next.
  const r = rngFor("row", host, path, phrase);
  let title = `${titleCase(phrase)}: ${pick(r, TITLE_TAILS[kind])}`;
  if (host === "reddit.com") title = `${titleCase(phrase)}? Looking for honest recommendations : r/${kind === "product" ? "BuyItForLife" : "NoStupidQuestions"}`;
  else if (host === "youtube.com") title = `${titleCase(phrase)} (Full Walkthrough) - YouTube`;
  else if (host === "wikipedia.org") title = `${titleCase(phrase.split(" ").slice(0, 3).join(" "))} - Wikipedia`;
  return { position, title, url: `https://${host === "wikipedia.org" ? "en.wikipedia.org" : `www.${host}`}${path}`, host, snippet: fill(pick(r, SNIPPETS[kind]), phrase, r) };
}

export interface GeneratedSerp {
  organic: OrganicRow[];
  ai_overview: AiOverview | null;
  people_also_ask: PaaRow[];
  related: string[];
  answer_box: FeatureBox | null;
  knowledge: FeatureBox | null;
}

/**
 * One full result page for a keyword on a check: the project at its position, competitors at theirs,
 * made-up sites and three neutral ones in the remaining places. No two calls with the same arguments differ.
 */
export function generateSerp(p: SeedProject, kw: SeedKeyword, checkIdx: number, day: string, position: number | null): GeneratedSerp {
  const r = rngFor("serp", p.id, kw.phrase, checkIdx);
  const kind = kindOf(kw.phrase, kw);
  const s = slug(kw.phrase);
  const taken = new Map<number, { host: string; path: string }>();
  const place = (pos: number | null, host: string, path: string) => {
    if (pos === null) return;
    let at = pos;
    while (taken.has(at) && at <= p.depth) at += 1;
    if (at <= p.depth) taken.set(at, { host, path });
  };
  place(position, p.domain, ownPath(p, kw, day));
  if (kw.cannibalised && position !== null) place(position + 6, p.domain, `/coffee/${slug(kw.phrase.replace(/^best /, ""))}`);
  for (const c of p.competitors) place(competitorPosition(p, kw, c, checkIdx), c, `/${kind === "howto" ? "guides" : "shop"}/${s}`);
  const pool = [...p.fillers, ...NEUTRAL_DOMAINS];
  const stable = rngFor("fillers", p.id, kw.phrase);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(stable() * (i + 1));
    [pool[i], pool[j]] = [pool[j] as string, pool[i] as string];
  }
  // A small rotation per check, so the result list moves a little between snapshots.
  const shift = checkIdx % 3;
  let fi = 0;
  const organic: OrganicRow[] = [];
  for (let pos = 1; pos <= p.depth; pos++) {
    const t = taken.get(pos);
    if (t) organic.push(rowFor(t.host, t.path, kw.phrase, kind, pos));
    else {
      const host = pool[(fi + shift) % pool.length] as string;
      fi += 1;
      const path = host === "reddit.com" ? `/r/${kind === "product" ? "BuyItForLife" : "NoStupidQuestions"}/comments/${(fnv(s) % 900000) + 100000}/${s.replace(/-/g, "_")}/` : host === "youtube.com" ? `/watch?v=${(fnv(s + host) >>> 0).toString(36)}` : host === "wikipedia.org" ? `/wiki/${titleCase(kw.phrase.split(" ").slice(0, 3).join(" ")).replace(/ /g, "_")}` : `/${["blog", "guides", "articles", "learn"][fnv(host + s) % 4]}/${s}`;
      organic.push(rowFor(host, path, kw.phrase, kind, pos));
    }
  }

  const bare = kw.phrase.replace(/^best /, "").replace(/^how to /, "");
  const questions: Record<Kind, string[]> = {
    product: [`What is the best ${bare}?`, `How much does ${bare} cost?`, `Is ${bare} worth it?`, `Where is the best place to buy ${bare}?`, `What should I look for in ${bare}?`],
    howto: [`What is the easiest way to ${bare}?`, `What do beginners get wrong about ${bare}?`, `How long does it take to see results with ${bare}?`, `Do I need special equipment for ${bare}?`, `How often should you do ${bare}?`],
    compare: [`Which has more caffeine, light or dark roast?`, `Does roasting burn off caffeine?`, `Is dark roast stronger than light roast?`, `Which roast is easier on the stomach?`, `Does grind size change caffeine?`],
    brand: [`Is ${titleCase(bare)} any good?`, `Where is ${titleCase(bare)} based?`, `Who owns ${titleCase(bare)}?`, `Does ${titleCase(bare)} deliver?`, `What are the opening hours of ${titleCase(bare)}?`],
  };
  const qStart = (fnv(kw.phrase) + (checkIdx > 20 ? 1 : 0)) % 2;
  const people_also_ask: PaaRow[] = questions[kind].slice(qStart, qStart + 4).map((question, i) => {
    const owner = kw.paaOwned && i === 0 && position !== null ? organic.find((o) => o.host === p.domain) : organic[(i * 3 + 1) % organic.length];
    const src = owner ?? (organic[0] as OrganicRow);
    return { question, snippet: fill("In short: it depends on how you plan to use it. {kw} varies most by freshness and by who supplies it, so compare at least {n} options first.", bare, r), url: src.url, host: src.host };
  });

  const related = [`${bare} near me`, `best ${bare}`, `${bare} reviews`, `${bare} for beginners`, `cheap ${bare}`, `${bare} guide`].filter((x) => x !== kw.phrase).slice(0, 6);

  let ai_overview: AiOverview | null = null;
  if (kw.aio) {
    const sentences = [
      `${titleCase(kw.phrase)} comes down to three things: how fresh the product is, how it is sourced and how well it fits the way you plan to use it.`,
      `Most buyers do best starting with a small order, tasting it within two weeks of the roast date, and adjusting from there.`,
      `Prices vary widely, so compare the cost per 100 g instead of the bag price.`,
      `Independent reviews and specialist forums tend to be more reliable here than brand pages.`,
    ];
    const count = 2 + (fnv(kw.phrase) % 3);
    const srcRows = organic.filter((o) => o.host !== p.domain && !NEUTRAL_DOMAINS.includes(o.host)).slice(0, 2 + (fnv(kw.phrase + "s") % 3));
    const own = organic.find((o) => o.host === p.domain);
    const sources = [...(kw.aio === "cited" && own ? [own] : []), ...srcRows, organic.find((o) => o.host === "reddit.com") ?? (organic[1] as OrganicRow)].slice(0, 6);
    ai_overview = { text: sentences.slice(0, count).join(" "), sources: sources.map((o) => ({ title: o.title, url: o.url, host: o.host })) };
  }
  let answer_box: FeatureBox | null = null;
  if (kw.answerBox) {
    const src = kw.answerBox === "owned" && position !== null ? organic.find((o) => o.host === p.domain) : organic.find((o) => o.host !== p.domain);
    if (src) answer_box = { title: src.title, snippet: fill("{kw} is best judged by origin, roast date and processing method. Look for a roast date inside the last {n} days and a named farm or cooperative.", kw.phrase, r), url: src.url, host: src.host };
  }
  const knowledge: FeatureBox | null = kw.knowledge ? { title: p.name, snippet: p.id === "kestrel" ? "Specialty coffee roaster. Roasts to order and ships whole bean coffee across the United States." : "Physiotherapy and sports massage clinic in Headingley, Leeds.", url: `https://www.${p.domain}/`, host: p.domain } : null;
  return { organic, ai_overview, people_also_ask, related, answer_box, knowledge };
}

/** Twelve months of search volume around a yearly figure, with a mild seasonal curve. */
export function monthlyVolumes(phrase: string, volume: number, lastMonth: string): { month: string; volume: number }[] {
  const r = rngFor("monthly", phrase);
  const phase = r() * Math.PI * 2;
  const swing = 0.08 + r() * 0.22;
  const [y, m] = lastMonth.split("-").map(Number) as [number, number];
  const out: { month: string; volume: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const v = volume * (1 + swing * Math.sin(phase + (d.getUTCMonth() / 12) * Math.PI * 2) + (r() - 0.5) * 0.08);
    out.push({ month: d.toISOString().slice(0, 7), volume: Math.max(10, Math.round(v / 10) * 10) });
  }
  return out;
}

const INTENTS = ["informational", "commercial", "transactional", "navigational"];
/** Seeded keyword numbers for any phrase. Used for research results and for phrases the seed tables do not list. */
export function numbersFor(phrase: string, lastMonth: string) {
  const r = rngFor("numbers", phrase);
  const volume = VOLUME_STEPS[between(r, 0, VOLUME_STEPS.length - 1)] as number;
  const intent = /^how |what |why | vs |ratio$|exercises$/.test(phrase) ? "informational" : /best|review|comparison|alternatives/.test(phrase) ? "commercial" : /buy|pricing|cheap|free|delivery|subscription|near me|leeds/.test(phrase) ? "transactional" : (INTENTS[between(r, 0, 2)] as string);
  return { volume, cpc: Math.round((0.4 + r() * 5.2) * 100) / 100, competition: Math.round(r() * 1000) / 1000, difficulty: between(r, 6, 74), intent, monthly: monthlyVolumes(phrase, volume, lastMonth) };
}
