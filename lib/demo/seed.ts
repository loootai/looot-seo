import type { Depth } from "@/lib/types";

/** Seed of the demo generator. With the fixed anchor date it makes every demo load identical. */
export const DEMO_SEED = 20261008;
export const DEMO_ANCHOR_DAY = "2026-10-08";
export const DEMO_OWNER_EMAIL = "demo@example.com";

/** [position now, position 30 days ago, position 90 days ago]. 0 means outside the checked depth. */
export type Track = [number, number, number];

export interface SeedKeyword {
  phrase: string;
  volume: number;
  difficulty: number;
  track: Track;
  aio?: "cited" | "present";
  answerBox?: "owned" | "present";
  paaOwned?: boolean;
  knowledge?: boolean;
  cannibalised?: boolean;
  tags?: string[];
}

export interface SeedProject {
  id: string;
  name: string;
  domain: string;
  country: string;
  language: string;
  location_name: string;
  depth: Depth;
  created_at: string;
  competitors: string[];
  /** Days between checks, oldest first. The first check is on firstCheck. */
  firstCheck: string | null;
  intervals: number[];
  keywords: SeedKeyword[];
  fillers: string[];
}

export const NEUTRAL_DOMAINS = ["reddit.com", "youtube.com", "wikipedia.org"];

const KESTREL_GIVEN: SeedKeyword[] = [
  { phrase: "single origin coffee subscription", volume: 2900, difficulty: 41, track: [4, 9, 15], aio: "cited", tags: ["subscription"] },
  { phrase: "best coffee beans for espresso", volume: 14800, difficulty: 63, track: [12, 18, 26], aio: "present", tags: ["beans"] },
  { phrase: "ethiopian yirgacheffe coffee", volume: 6600, difficulty: 38, track: [3, 3, 6], answerBox: "owned", tags: ["beans", "origin"] },
  { phrase: "light roast vs dark roast caffeine", volume: 8100, difficulty: 29, track: [7, 11, 14], paaOwned: true, tags: ["journal"] },
  { phrase: "coffee subscription gift", volume: 5400, difficulty: 47, track: [9, 6, 8], tags: ["subscription"] },
  { phrase: "how to grind coffee for pour over", volume: 3600, difficulty: 22, track: [2, 5, 9], tags: ["journal", "brewing"] },
  { phrase: "decaf swiss water process beans", volume: 1300, difficulty: 19, track: [1, 2, 4], tags: ["beans"] },
  { phrase: "kestrel coffee", volume: 880, difficulty: 4, track: [1, 1, 1], knowledge: true, tags: ["brand"] },
  { phrase: "whole bean coffee delivery", volume: 4400, difficulty: 52, track: [21, 27, 0], tags: ["subscription"] },
  { phrase: "cold brew coffee ratio", volume: 22200, difficulty: 34, track: [0, 28, 22], tags: ["journal", "brewing"] },
  { phrase: "best coffee for french press", volume: 9900, difficulty: 44, track: [16, 15, 19], cannibalised: true, tags: ["beans", "brewing"] },
  { phrase: "fair trade organic coffee beans", volume: 2400, difficulty: 36, track: [6, 8, 12], tags: ["beans"] },
];

/** Position tracks for the 30 generated Kestrel keywords, in the order the generator makes them. */
export const KESTREL_TRACKS: Track[] = [
  [2, 3, 5], [3, 4, 7], [3, 5, 11], [1, 1, 3],
  [4, 6, 8], [5, 5, 9], [5, 8, 13], [6, 7, 10], [6, 10, 16], [7, 8, 10], [8, 8, 10], [8, 12, 17], [9, 11, 14], [10, 13, 18], [10, 9, 9],
  [14, 17, 21], [17, 19, 24], [19, 24, 29], [21, 22, 26], [23, 28, 0], [24, 25, 27], [25, 30, 0], [26, 24, 22], [27, 29, 0], [28, 0, 0], [29, 27, 25],
  [0, 0, 0], [0, 0, 0], [0, 29, 0], [0, 0, 0],
];

/** Fixed word lists the generated Kestrel keywords are built from. */
export const KESTREL_WORDS = {
  origins: ["colombian", "guatemalan", "kenyan", "sumatra", "costa rican", "peruvian", "brazilian", "honduran"],
  products: ["coffee beans", "espresso beans", "whole bean coffee", "ground coffee", "coffee sampler"],
  methods: ["aeropress", "moka pot", "chemex", "v60", "cold brew", "french press"],
  howtos: ["how to store coffee beans", "how to make pour over coffee", "how long do coffee beans last", "how to dial in espresso", "how much coffee per cup"],
  modifiers: ["small batch", "freshly roasted", "medium roast", "low acid", "organic", "direct trade"],
};

export const VOLUME_STEPS = [170, 210, 260, 320, 390, 480, 590, 720, 880, 1000, 1300, 1600, 1900, 2400, 2900, 3600, 4400, 5400, 6600, 8100, 9900, 12100, 14800, 18100];

const FERNHILL: SeedKeyword[] = [
  { phrase: "physio leeds", volume: 3600, difficulty: 33, track: [8, 10, 12], tags: ["local"] },
  { phrase: "sports massage headingley", volume: 590, difficulty: 12, track: [2, 3, 4], tags: ["local", "massage"] },
  { phrase: "sciatica exercises", volume: 40500, difficulty: 55, track: [0, 0, 0], tags: ["advice"] },
  { phrase: "physiotherapist near me", volume: 49500, difficulty: 48, track: [17, 18, 0], tags: ["local"] },
  { phrase: "private physiotherapy leeds", volume: 880, difficulty: 27, track: [5, 6, 9], tags: ["local"] },
  { phrase: "sports injury clinic leeds", volume: 720, difficulty: 24, track: [4, 6, 7], tags: ["local"] },
  { phrase: "back pain physio leeds", volume: 320, difficulty: 14, track: [3, 4, 6], tags: ["local"] },
  { phrase: "deep tissue massage leeds", volume: 1900, difficulty: 31, track: [11, 13, 16], tags: ["massage"] },
  { phrase: "acl rehab exercises", volume: 6600, difficulty: 42, track: [19, 0, 0], tags: ["advice"] },
  { phrase: "runner's knee treatment", volume: 5400, difficulty: 39, track: [14, 17, 0], tags: ["advice"] },
  { phrase: "physio for shoulder pain", volume: 1300, difficulty: 30, track: [9, 12, 15], tags: ["advice"] },
  { phrase: "pregnancy physio leeds", volume: 210, difficulty: 9, track: [1, 2, 2], tags: ["local"] },
  { phrase: "tennis elbow exercises", volume: 18100, difficulty: 46, track: [0, 0, 0], tags: ["advice"] },
  { phrase: "sports massage leeds", volume: 2400, difficulty: 34, track: [7, 9, 13], tags: ["local", "massage"] },
  { phrase: "physio headingley", volume: 390, difficulty: 11, track: [1, 1, 3], tags: ["local"] },
  { phrase: "plantar fasciitis physio", volume: 2900, difficulty: 37, track: [13, 16, 18], tags: ["advice"] },
  { phrase: "fernhill physio", volume: 260, difficulty: 3, track: [1, 1, 1], knowledge: true, tags: ["brand"] },
  { phrase: "how long does physio take to work", volume: 1600, difficulty: 21, track: [6, 9, 0], tags: ["advice"] },
];

export const SEED_PROJECTS: SeedProject[] = [
  {
    id: "kestrel",
    name: "Kestrel Coffee Roasters",
    domain: "kestrelcoffee.co",
    country: "US",
    language: "en",
    location_name: "United States",
    depth: 30,
    created_at: "2026-07-09T09:12:00.000Z",
    competitors: ["roastwell.com", "northbeancoffee.com", "emberandoak.coffee", "dailygrindsupply.com"],
    firstCheck: "2026-07-10",
    // 16 intervals to 8 Sep (30 days before the anchor), 3 days to the 11 Sep drop, then 8 more to 8 Oct.
    intervals: [4, 4, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 3, 3, 4, 3, 3, 4, 3, 4, 3],
    keywords: KESTREL_GIVEN,
    fillers: [
      "thecoffeeledger.com", "homebaristaforum.net", "slowmorningmag.com", "beanjournal.co", "brewmethods.net", "firstcrackroasters.com", "tampandpour.com", "cuppingnotes.org",
      "morningritualcoffee.com", "hillsideroasting.co", "portafilterpost.com", "kettleandscale.com", "greenbeandepot.com", "roastersguildhub.org", "copperpotcoffee.com", "originatlas.coffee",
      "latitudecoffee.co", "thirdwavedigest.com", "grindsizeguide.com", "espressoarchive.net", "portlandfoodweekly.com", "mugshotreviews.com", "baristabench.io", "altitudebeans.com",
      "harborlightcoffee.com", "foldedfilter.com", "blackapronsupply.com", "crema-notes.com", "wakefieldroasters.com", "tastingwheel.org",
    ],
  },
  {
    id: "fernhill",
    name: "Fernhill Physio",
    domain: "fernhillphysio.co.uk",
    country: "GB",
    language: "en",
    location_name: "United Kingdom",
    depth: 20,
    created_at: "2026-09-01T08:30:00.000Z",
    competitors: ["rivergatephysio.co.uk", "bodyworksleeds.co.uk"],
    firstCheck: "2026-09-03",
    intervals: [7, 7, 7, 7, 7],
    keywords: FERNHILL,
    fillers: [
      "nhs.uk", "leedsphysiocollective.co.uk", "yorkshiresportsclinic.co.uk", "movewellnorth.co.uk", "kirkstallinjuryclinic.co.uk", "physiofinder.org.uk", "thebackroomleeds.co.uk", "aireboroughphysio.co.uk",
      "runnersrepair.co.uk", "otleyroadclinic.co.uk", "jointcarejournal.com", "rehabnotes.co.uk", "meanwoodmassage.co.uk", "treatwell.co.uk", "harrogatephysio.co.uk", "activeleedsclinic.co.uk",
      "kneeandhip.org.uk", "physiomatters.co.uk", "westparktherapy.co.uk", "recoverylab.uk",
    ],
  },
  {
    id: "loomwork",
    name: "Loomwork",
    domain: "loomwork.app",
    country: "US",
    language: "en",
    location_name: "United States",
    depth: 10,
    created_at: "2026-10-07T15:40:00.000Z",
    competitors: [],
    firstCheck: null,
    intervals: [],
    keywords: [],
    fillers: [],
  },
];

export const LOOMWORK_RESEARCH = {
  seeds: ["salon booking software", "appointment scheduling app"],
  bases: [
    "salon booking software", "appointment scheduling app", "salon scheduling software", "hair salon booking app", "spa booking system", "barber shop booking app", "nail salon software",
    "online booking system for salons", "salon management software", "salon pos system", "appointment reminder app", "client booking app", "beauty salon software", "massage booking software",
    "tattoo studio booking software", "salon appointment book", "online appointment scheduler", "booking app for hairdressers", "lash tech booking app", "salon software with payments",
  ],
  modifiers: ["", "best ", "free ", "cheap ", "simple ", "#for small business", "#pricing", "#reviews", "#for ipad", "#with online payments", "#comparison", "#alternatives"],
};

export const REFERRING_POOL = [
  "homebaristaforum.net", "slowmorningmag.com", "portlandfoodweekly.com", "thecoffeeledger.com", "beanjournal.co", "cuppingnotes.org", "thirdwavedigest.com", "brewmethods.net",
  "pnwmakersmarket.com", "smallbatchweekly.com", "giftguidejournal.com", "roastersguildhub.org", "mugshotreviews.com", "kitchencounterblog.com", "sundaytablemag.com", "fieldnotesfood.com",
  "cascadiaeats.org", "theslowpour.co", "localmakersindex.com", "wholesalecafeguide.com", "greenbeandepot.com", "tastingwheel.org", "originatlas.coffee", "espressoarchive.net",
];
export const REFERRING_WORDS = { a: ["north", "river", "alder", "cedar", "harbor", "willow", "summit", "copper", "linden", "marrow", "tide", "ember", "field", "quill", "hollow", "stone"], b: ["kitchen", "table", "pantry", "journal", "review", "weekly", "digest", "notes", "market", "guide", "post", "almanac"], tld: [".com", ".co", ".net", ".org", ".blog"] };
