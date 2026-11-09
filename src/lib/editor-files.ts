// How the site editor (src/scripts/admin.js) reads and writes the files it edits. People and news are YAML,
// written in one fixed layout so that a save changes only the lines it edits; papers are BibTeX, written
// exactly as tools/pubtools.py writes them. Each YAML file keeps the comment lines at its top.
import { parse, stringify } from "yaml";
import { readPubs, writePubs, type Pub } from "./papers-io";

export const FILES = { team: "src/data/team.yaml", pubs: "src/data/papers.bib", news: "src/data/news.yaml" };
// the groups in team.yaml, in order, with the comment written above each
const GROUPS: [string, string][] = [
  ["faculty", "research scientists"], ["phd", "PhD students"], ["ra", "research assistants"],
  ["visiting", "visiting students"], ["alumni", "alumni"],
];

type Member = Record<string, unknown> & { group: string };
export type Doc = { head: string; data: { team?: { director: Record<string, unknown>; members: Member[] }; news?: Record<string, string>[]; pubs?: Pub[]; bibHead?: string } };

const commentHead = (text: string) => (text.match(/^(?:#[^\n]*\n|\s*\n)*/) || [""])[0];
const yamlOut = (value: unknown, indent = "") =>
  stringify(value, { lineWidth: 110, minContentWidth: 40 }).trimEnd().split("\n").map((l) => indent + l).join("\n");
const blankBetween = (text: string) => text.replace(/\n(\s*)- /g, "\n\n$1- ");

export function readFile(path: string, text: string): Doc {
  try {
    if (path === FILES.pubs) {
      const r = readPubs(text);
      return { head: "", data: { pubs: r.pubs, bibHead: r.head } };
    }
    const value = parse(text);
    return { head: commentHead(text), data: path === FILES.team ? { team: value } : { news: value } };
  } catch (e) {
    throw new Error(`Can’t read ${path}: ${(e as Error).message}`);
  }
}

export function writeFile(path: string, doc: Doc): string {
  const d = doc.data;
  if (path === FILES.pubs) return writePubs(d.bibHead || "", d.pubs || []);
  if (path === FILES.news) return doc.head + blankBetween(yamlOut(d.news)) + "\n";
  // team.yaml: the director, then the members group by group, each group under a comment
  const team = d.team!;
  const out = [yamlOut({ director: team.director }), "", "members:"];
  for (const [g, title] of GROUPS) {
    out.push(`  # ${title}`);
    for (const m of team.members.filter((x) => x.group === g)) out.push(yamlOut([m], "  "));
    out.push("");
  }
  return doc.head + out.join("\n").trimEnd() + "\n";
}
