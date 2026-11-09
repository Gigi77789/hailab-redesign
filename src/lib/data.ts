// Loads and checks everything in src/data/ at build time. A mistake in a data file (a missing field,
// a topic that doesn't exist, a featured paper that isn't in papers.bib) stops the build with a message
// naming the file and the entry, instead of quietly leaving a hole on the page.
import { parse as parseYaml } from "yaml";
import { z } from "astro/zod";
import { parse as parseBib } from "./bib";
import bibText from "../data/papers.bib?raw";
import categoriesText from "../data/categories.yaml?raw";
import teamText from "../data/team.yaml?raw";
import newsText from "../data/news.yaml?raw";
import grantsText from "../data/grants.yaml?raw";
import normsText from "../data/norms.yaml?raw";
import researchText from "../data/research.yaml?raw";
import cultureText from "../data/culture.yaml?raw";

function load<T extends z.ZodType>(file: string, text: string, schema: T): z.infer<T> {
  const r = schema.safeParse(parseYaml(text));
  if (!r.success) {
    const issues = r.error.issues.map((i) => `  ${i.path.join(".") || "(top)"}: ${i.message}`).join("\n");
    throw new Error(`src/data/${file} is not valid:\n${issues}`);
  }
  return r.data;
}

/* ---------- categories ---------- */
export const CATEGORIES = load("categories.yaml", categoriesText, z.array(z.object({ key: z.string(), name: z.string() })));
const CAT_KEYS = CATEGORIES.map((c) => c.key);
export const TOPIC_NAMES: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.name]));
const topic = z.string().refine((t) => CAT_KEYS.includes(t), { message: `must be one of ${CAT_KEYS.join(", ")} (categories.yaml)` });

/* ---------- people ---------- */
const person = z.object({
  name: z.string(),
  role: z.string(),
  url: z.string().optional(),
  photo: z.string().optional(),
  bio: z.string().optional(),
  orcid: z.string().optional(),
  openalex: z.string().optional(),
});
const team = load("team.yaml", teamText, z.object({
  director: z.object({
    name: z.string(), title: z.string(), role: z.string(), short: z.string(), photo: z.string(), url: z.string(), email: z.string(),
    orcid: z.string().optional(), openalex: z.string().optional(), bio: z.array(z.string()),
  }),
  members: z.array(person.extend({ group: z.enum(["faculty", "phd", "ra", "visiting", "alumni"]) })),
}));
export const DIRECTOR = team.director;
export const MEMBERS = team.members;

// names compared without nicknames: “Bingsheng ‘Arthur’ Yao” and “Jiayi (Elise) Su” match “Bingsheng Yao” and “Jiayi Su”
const normName = (n: string) =>
  n.toLowerCase().replace(/\(.*?\)|[‘’'"“”]\w+[‘’'"“”]/g, " ").replace(/[^a-z\s-]/g, "").replace(/\s+/g, " ").trim();
const LAB = new Set([DIRECTOR.name, ...MEMBERS.map((m) => m.name)].map(normName));
export const isMember = (name: string) => LAB.has(normName(name));

/* ---------- papers ---------- */
export type Link = { label: string; url: string };
export type Paper = {
  key: string; year: number; title: string; authors: string[]; venue: string; tag: string; kind: string;
  award: string; topics: string[]; abstract: string; img?: string; links: Link[]; href: string; peer: boolean; preprint: boolean;
};

// the publisher's name for an official link, shown as the link's label
const PUBLISHERS: [RegExp, string][] = [
  [/10\.1145\/|dl\.acm\.org/, "ACM DL"], [/10\.18653\/|aclanthology\.org/, "ACL Anthology"], [/10\.1109\/|ieeexplore/, "IEEE Xplore"],
  [/10\.1007\/|springer/, "Springer"], [/openreview\.net/, "OpenReview"], [/10\.1609\/|aaai\.org/, "AAAI"], [/10\.24963\/|ijcai\.org/, "IJCAI"],
  [/10\.2196\//, "JMIR"], [/10\.1016\//, "ScienceDirect"], [/10\.1038\//, "Nature"], [/10\.1162\//, "MIT Press"], [/10\.3389\//, "Frontiers"],
  [/10\.1002\//, "Wiley"], [/10\.1177\//, "SAGE"], [/10\.1561\//, "Now Publishers"], [/10\.9776\//, "IDEALS"],
];
const publisher = (url: string) => PUBLISHERS.find(([re]) => re.test(url.toLowerCase()))?.[1] ?? "Paper";

const TYPE_KIND: Record<string, string> = {
  inproceedings: "conference", conference: "conference", incollection: "conference", article: "journal", book: "book",
  misc: "preprint", unpublished: "preprint", techreport: "preprint",
};

const paperFields = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  year: z.string().regex(/^\d{4}$/, "must be a four-digit year"),
  abbr: z.string().min(1, "is the short venue shown in the pill, e.g. CHI 2026"),
  topics: z.string().transform((s) => s.split(",").map((t) => t.trim()).filter(Boolean)).pipe(z.array(topic).min(1).max(2)),
}).passthrough();

function toPaper(e: ReturnType<typeof parseBib>[number]): Paper {
  const r = paperFields.safeParse(e.fields);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join(".") || "entry"} ${i.message}`).join("; ");
    const hint = r.error.issues.some((i) => i.path[0] === "topics" || i.path[0] === "abbr")
      ? " (python3 tools/retag.py fills in topics; abbr is the short venue)" : "";
    throw new Error(`src/data/papers.bib line ${e.line}, @${e.type}{${e.key}: ${issues}${hint}`);
  }
  const f = e.fields;
  const links: Link[] = [];
  if (f.url) links.push({ label: publisher(f.url), url: f.url });
  if (f.arxiv) links.push({ label: "arXiv", url: f.arxiv.includes("/") ? f.arxiv : `https://arxiv.org/abs/${f.arxiv}` });
  if (f.pdf) links.push({ label: "PDF", url: f.pdf });
  if (f.website) links.push({ label: "Project", url: f.website });
  if (f.code) links.push({ label: "Code", url: f.code });
  if (f.video) links.push({ label: "Video", url: f.video });
  if (f.dataset) links.push({ label: "Dataset", url: f.dataset });
  if (f.slides) links.push({ label: "Slides", url: f.slides });
  const title = r.data.title;
  const tag = r.data.abbr;
  return {
    key: e.key,
    year: Number(r.data.year),
    title,
    authors: r.data.author.split(/\s+and\s+/).map((a) => (a.includes(",") ? a.split(",").reverse().join(" ") : a).trim()),
    venue: f.booktitle || f.journal || f.howpublished || f.publisher || "",
    tag,
    kind: f.kind || TYPE_KIND[e.type] || "conference",
    award: f.award || "",
    topics: r.data.topics,
    abstract: f.abstract || "",
    img: f.preview || undefined,
    links,
    href: links[0]?.url ?? `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${title}"`)}`,
    peer: tag !== "Preprint",
    preprint: Boolean(f.preprint_venue || f.preprint_year),
  };
}

const entries = parseBib(bibText);
const seen = new Set<string>();
for (const e of entries) {
  if (seen.has(e.key)) throw new Error(`src/data/papers.bib line ${e.line}: the key ${e.key} is used twice`);
  seen.add(e.key);
}
/** Every paper, newest first (papers.bib order within a year). */
export const PAPERS: Paper[] = entries.map(toPaper).sort((a, b) => b.year - a.year);
export const mainTopic = (p: Paper) => p.topics[0];

/* ---------- home page ---------- */
export const AREAS = load("research.yaml", researchText, z.array(z.object({ topic, summary: z.string() })))
  .map((a) => ({ ...a, name: TOPIC_NAMES[a.topic] }));

/* ---------- lab culture ---------- */
const culture = load("culture.yaml", cultureText, z.object({
  kinds: z.array(z.object({ key: z.string(), name: z.string() })),
  photos: z.array(z.object({ src: z.string(), w: z.number(), h: z.number(), cat: z.string(), caption: z.string() })),
}));
for (const ph of culture.photos) {
  if (!culture.kinds.some((k) => k.key === ph.cat)) throw new Error(`src/data/culture.yaml: ${ph.src} has cat "${ph.cat}", which is not in kinds`);
}
export const CULTURE = culture;

/* ---------- news, grants, norms ---------- */
export const NEWS = load("news.yaml", newsText, z.array(z.object({
  date: z.string().regex(/^\d{4}(-\d{2})?$/, "must be YYYY-MM, or YYYY when the month isn't known"),
  html: z.string(),
})));

export const GRANTS = load("grants.yaml", grantsText, z.array(z.object({
  title: z.string(), sponsor: z.string(), award: z.string().optional(), role: z.string(), years: z.string(),
  topic, lead: z.string().optional(), internal: z.boolean().optional(),
})));

export const NORMS = load("norms.yaml", normsText, z.object({
  version: z.string(),
  inspiredBy: z.object({ text: z.string(), by: z.string(), url: z.string() }),
  norms: z.array(z.string()),
  calendar: z.array(z.object({ name: z.string(), when: z.string(), text: z.string() })),
  gettingStarted: z.array(z.string()),
}));

/* ---------- formatting ---------- */
/** "2026-04" -> "Apr 2026"; a bare year stays as it is. */
export const fmtMonth = (d: string) => {
  const [y, m] = d.split("-").map(Number);
  return m ? new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : String(y);
};

/** A path inside the site, with the base path the site is served under (e.g. /hailab-redesign/ on GitHub Pages). */
export const url = (path: string) => import.meta.env.BASE_URL.replace(/\/?$/, "/") + path.replace(/^\//, "");
