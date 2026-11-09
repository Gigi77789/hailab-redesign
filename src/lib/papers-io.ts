// Reads and writes src/data/papers.bib for the site editor, entry for entry the way tools/pubtools.py
// (load_pubs / save_pubs) and tools/bib.py (dump) do, so a save from the editor and a run of the Python
// tools produce the same file. Keep the three in step; the editor works on the same short-key records.
import { parse } from "./bib";

export type Pub = {
  key?: string; y: number; t: string; a: string[]; v: string; tag: string; kind: string; award: string;
  topics: string[]; abs: string; venueUrl?: string; links: Record<string, string>;
  img?: string; imgFrom?: string; imgSrcUrl?: string; cv?: string; src?: string;
  imgManual?: boolean; topicsManual?: boolean; venueManual?: boolean;
  pre?: { v: string; tag: string; y: number; t?: string };
  extra?: Record<string, string>;
};

const VERBATIM = new Set(["url", "doi", "arxiv", "pdf", "website", "code", "video", "dataset", "slides", "preview", "preview_source", "openalex"]);
const KIND_TYPE: Record<string, string> = {
  conference: "inproceedings", workshop: "inproceedings", abstract: "inproceedings", journal: "article", book: "book", preprint: "misc",
};
const TYPE_KIND: Record<string, string> = {
  inproceedings: "conference", conference: "conference", incollection: "conference", article: "journal", book: "book",
  misc: "preprint", unpublished: "preprint", techreport: "preprint",
};
const VENUE_FIELD: Record<string, string> = { article: "journal", misc: "howpublished", book: "publisher" };
export const LINK_FIELDS: Record<string, string> = {
  arXiv: "arxiv", PDF: "pdf", Project: "website", Code: "code", Video: "video", Dataset: "dataset", Slides: "slides",
};
const FLAGS: Record<string, string> = { imgManual: "preview_manual", topicsManual: "topics_manual", venueManual: "url_manual" };
const KNOWN = new Set(["title", "author", "year", "booktitle", "journal", "howpublished", "publisher", "abbr", "award", "url", "kind",
  "topics", "abstract", "preview", "preview_from", "preview_source", "cv", "source",
  "preprint_venue", "preprint_year", "preprint_title", ...Object.values(LINK_FIELDS), ...Object.values(FLAGS)]);

const flipName = (n: string) => {
  if (!n.includes(",")) return n.trim();
  const [last, first] = n.split(/,(.*)/s).map((x) => (x || "").trim());
  return `${first} ${last}`.trim();
};

function fromEntry(type: string, key: string, f: Record<string, string>): Pub {
  const year = f.year || "";
  if (!/^\d+$/.test(year)) throw new Error(`papers.bib: @${type}{${key}: year must be a number, got "${year}"`);
  const p: Pub = {
    key, y: Number(year), t: f.title || "",
    a: (f.author || "").split(/\s+and\s+/).filter((x) => x.trim()).map(flipName),
    v: f.booktitle || f.journal || f.howpublished || f.publisher || "",
    kind: f.kind || TYPE_KIND[type] || "conference", tag: "", award: "", topics: [], abs: "", links: {},
  };
  p.tag = f.abbr || (p.kind === "preprint" ? "Preprint" : p.v);
  p.award = f.award || "";
  p.topics = (f.topics || "").split(",").map((t) => t.trim()).filter(Boolean);
  p.abs = f.abstract || "";
  if (f.url) p.venueUrl = f.url;
  for (const [label, field] of Object.entries(LINK_FIELDS)) {
    if (f[field]) p.links[label] = field === "arxiv" && !f[field].includes("/") ? `https://arxiv.org/abs/${f[field]}` : f[field];
  }
  for (const [k, field] of [["img", "preview"], ["imgFrom", "preview_from"], ["imgSrcUrl", "preview_source"], ["cv", "cv"], ["src", "source"]] as const) {
    if (f[field]) (p as Record<string, unknown>)[k] = f[field];
  }
  for (const [k, field] of Object.entries(FLAGS)) if ((f[field] || "").toLowerCase() === "true") (p as Record<string, unknown>)[k] = true;
  if (f.preprint_venue || f.preprint_year) {
    p.pre = { v: f.preprint_venue || "", tag: "Preprint", y: Number(f.preprint_year || p.y) };
    if (f.preprint_title) p.pre.t = f.preprint_title;
  }
  const extra = Object.fromEntries(Object.entries(f).filter(([k]) => !KNOWN.has(k)));
  if (Object.keys(extra).length) p.extra = extra;
  return p;
}

function toEntry(p: Pub): [string, Record<string, string>] {
  const kind = p.kind || "conference";
  const btype = KIND_TYPE[kind] || "inproceedings";
  const f: Record<string, string> = { title: p.t, author: p.a.join(" and ") };
  if (p.v) f[VENUE_FIELD[btype] || "booktitle"] = p.v;
  f.year = String(p.y);
  f.abbr = p.tag;
  if (TYPE_KIND[btype] !== kind) f.kind = kind;
  if (p.award) f.award = p.award;
  if (p.topics.length) f.topics = p.topics.join(", ");
  if (p.venueUrl) f.url = p.venueUrl;
  for (const [label, field] of Object.entries(LINK_FIELDS)) {
    const u = p.links[label];
    if (!u) continue;
    const m = field === "arxiv" ? u.match(/^https?:\/\/arxiv\.org\/abs\/(\d{4}\.\d{4,5})(v\d+)?$/) : null;
    f[field] = m ? m[1] : u;
  }
  for (const [k, field] of [["img", "preview"], ["imgFrom", "preview_from"], ["imgSrcUrl", "preview_source"]] as const) {
    if (p[k]) f[field] = p[k] as string;
  }
  for (const [k, field] of Object.entries(FLAGS)) if ((p as Record<string, unknown>)[k]) f[field] = "true";
  for (const [k, field] of [["cv", "cv"], ["src", "source"]] as const) if (p[k]) f[field] = p[k] as string;
  if (p.pre) {
    f.preprint_venue = p.pre.v || "";
    f.preprint_year = String(p.pre.y || p.y);
    if (p.pre.t) f.preprint_title = p.pre.t;
  }
  Object.assign(f, p.extra || {});
  if (p.abs) f.abstract = p.abs;
  return [btype, f];
}

/** lastnameYEARword, as tools/pubtools.py makes them: wang2026multi */
function newKey(p: Pub, taken: Set<string>) {
  const ascii = (s: string) => s.normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase();
  const last = ascii((p.a[0] || "anon").split(/\s+/).pop() || "").replace(/[^a-z]/g, "") || "anon";
  const stop = new Set(["a", "an", "the", "on", "of", "in", "for", "to", "and", "with"]);
  const words = (ascii(p.t).match(/[a-z0-9]+/g) || []).filter((w) => !stop.has(w));
  const base = `${last}${p.y}${words[0] || ""}`;
  let key = base, n = 1;
  while (taken.has(key)) { n++; key = base + String.fromCharCode(96 + n); }
  return key;
}

const encode = (s: string) =>
  s.replace(/([&%#_${}])/g, "\\$1").replaceAll("~", "\\textasciitilde{}").replace(/-(?=-)/g, "-{}");

/** papers.bib text -> [header comment, records] */
export function readPubs(text: string): { head: string; pubs: Pub[] } {
  const at = text.search(/^@/m);
  return { head: at > 0 ? text.slice(0, at) : "", pubs: parse(text).map((e) => fromEntry(e.type, e.key, e.fields)) };
}

/** records -> papers.bib text, byte for byte what save_pubs writes */
export function writePubs(head: string, pubs: Pub[]): string {
  const taken = new Set<string>();
  const parts = head ? [head.trimEnd() + "\n"] : [];
  for (const p of pubs) {
    if (!p.key || taken.has(p.key)) p.key = newKey(p, taken);
    taken.add(p.key);
    const [btype, fields] = toEntry(p);
    const width = Math.max(...Object.keys(fields).map((k) => k.length));
    const lines = [`@${btype}{${p.key},`];
    for (const [k, v] of Object.entries(fields)) lines.push(`  ${k.padEnd(width)} = {${VERBATIM.has(k) ? v : encode(v)}},`);
    lines.push("}");
    parts.push(lines.join("\n") + "\n");
  }
  return parts.join("\n");
}
