// Minimal BibTeX reader for src/data/papers.bib: the same rules as tools/bib.py (keep the two in step).
// Values come back as plain Unicode text; LaTeX accents and escapes are decoded.

export type BibEntry = { type: string; key: string; fields: Record<string, string>; line: number };

// fields whose values are taken verbatim (no LaTeX decoding)
const VERBATIM = new Set(["url", "doi", "arxiv", "pdf", "website", "code", "video", "dataset", "slides", "preview", "preview_source", "openalex"]);

const ACCENTS: Record<string, string> = {
  '"': "̈", "'": "́", "`": "̀", "^": "̂", "~": "̃", "=": "̄", ".": "̇",
  c: "̧", v: "̌", u: "̆", H: "̋", k: "̨", r: "̊",
};
const LETTERS: Record<string, string> = {
  o: "ø", O: "Ø", ss: "ß", aa: "å", AA: "Å", ae: "æ", AE: "Æ", oe: "œ", OE: "Œ", l: "ł", L: "Ł", i: "ı",
};

export function decode(s: string): string {
  s = s.replace(/\\(["'`^~=.])\s*\{?\s*(\\?[A-Za-z])\s*\}?/g, (_, a, ch) => ch.replace("\\", "") + ACCENTS[a]);
  s = s.replace(/\\([cvuHkr])\s*\{\s*([A-Za-z])\s*\}/g, (_, a, ch) => ch + ACCENTS[a]);
  s = s.replace(/\\(ss|aa|AA|ae|AE|oe|OE|o|O|l|L|i)\b\s*/g, (_, l) => LETTERS[l]);
  s = s.replaceAll("\\{", "\ue000").replaceAll("\\}", "\ue001"); // escaped braces survive the brace stripping below
  s = s.replace(/\\textasciitilde(\{\}|\s)?/g, "\ue002"); // a literal tilde (a bare ~ is a non-breaking space)
  s = s.replace(/\\([&%#_$])/g, "$1");
  s = s.replaceAll("---", "\u2014").replaceAll("--", "\u2013").replaceAll("~", "\u00a0");
  s = s.replace(/[{}]/g, "").replaceAll("\ue000", "{").replaceAll("\ue001", "}").replaceAll("\ue002", "~");
  return s.replace(/\s+/g, " ").trim().normalize("NFC");
}

function value(text: string, i: number): [string, number] {
  const open = text[i];
  if (open === "{" || open === '"') {
    let depth = 0;
    for (let j = open === "{" ? i : i + 1; j < text.length; j++) {
      const c = text[j];
      if (c === "\\") { j++; continue; }
      if (c === "{") depth++;
      if (c === "}") depth--;
      if ((open === "{" && depth === 0) || (open === '"' && c === '"' && depth === 0)) return [text.slice(i + 1, j), j + 1];
    }
    throw new Error(`papers.bib line ${lineAt(text, i)}: unclosed ${open === "{" ? "brace" : "quote"}`);
  }
  const m = /[\w.-]+/y;
  m.lastIndex = i;
  const r = m.exec(text);
  if (!r) throw new Error(`papers.bib line ${lineAt(text, i)}: expected a value`);
  return [r[0], m.lastIndex];
}

const lineAt = (text: string, i: number) => text.slice(0, i).split("\n").length;

export function parse(text: string): BibEntry[] {
  const out: BibEntry[] = [];
  const start = /@(\w+)\s*\{\s*([^,\s]*)\s*,?/g;
  const field = /\s*(\w[\w-]*)\s*=\s*/y;
  const sep = /\s*,?/y;
  const close = /\s*\}/y;
  let m: RegExpExecArray | null;
  while ((m = start.exec(text))) {
    const type = m[1].toLowerCase();
    if (type === "comment" || type === "string" || type === "preamble") {
      start.lastIndex = value(text, text.indexOf("{", m.index))[1];
      continue;
    }
    const fields: Record<string, string> = {};
    let i = start.lastIndex;
    for (;;) {
      field.lastIndex = i;
      const f = field.exec(text);
      if (!f) break;
      const [raw, next] = value(text, field.lastIndex);
      const name = f[1].toLowerCase();
      fields[name] = VERBATIM.has(name) ? raw.trim() : decode(raw);
      sep.lastIndex = next;
      sep.exec(text);
      i = sep.lastIndex;
    }
    close.lastIndex = i;
    if (!close.exec(text)) {
      throw new Error(`papers.bib line ${lineAt(text, i)}: expected a field or the closing brace of @${type}{${m[2]}`);
    }
    out.push({ type, key: m[2], fields, line: lineAt(text, m.index) });
    start.lastIndex = close.lastIndex;
  }
  return out;
}
