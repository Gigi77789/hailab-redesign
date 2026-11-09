"""Minimal BibTeX reader and writer for src/data/papers.bib.

Reads what the tools write and what people paste from ACM, ACL Anthology, dblp or Google Scholar:
brace- or quote-delimited values, bare numbers, and LaTeX accents ({\\"u}, \\'e, \\c{c}, \\&, --).
Values come back as plain Unicode text. src/lib/bib.ts is the same reader for the site build;
keep the two in step.
"""
import re
import unicodedata

# fields whose values are taken verbatim (no LaTeX decoding or escaping)
VERBATIM = {"url", "doi", "arxiv", "pdf", "website", "code", "preview", "preview_source", "openalex"}

ACCENTS = {'"': "\u0308", "'": "\u0301", "`": "\u0300", "^": "\u0302", "~": "\u0303", "=": "\u0304", ".": "\u0307",
           "c": "\u0327", "v": "\u030c", "u": "\u0306", "H": "\u030b", "k": "\u0328", "r": "\u030a"}
LETTERS = {"o": "ø", "O": "Ø", "ss": "ß", "aa": "å", "AA": "Å", "ae": "æ", "AE": "Æ", "oe": "œ", "OE": "Œ", "l": "ł", "L": "Ł", "i": "ı"}


def decode(s):
    """LaTeX text to Unicode."""
    s = re.sub(r"\\([\"'`^~=.])\s*\{?\s*(\\?[A-Za-z])\s*\}?", lambda m: m.group(2).lstrip("\\") + ACCENTS[m.group(1)], s)
    s = re.sub(r"\\([cvuHkr])\s*\{\s*([A-Za-z])\s*\}", lambda m: m.group(2) + ACCENTS[m.group(1)], s)
    s = re.sub(r"\\(ss|aa|AA|ae|AE|oe|OE|o|O|l|L|i)\b\s*", lambda m: LETTERS[m.group(1)], s)
    s = s.replace("\\{", "\ue000").replace("\\}", "\ue001")  # escaped braces survive the brace stripping below
    s = re.sub(r"\\textasciitilde(\{\}|\s)?", "\ue002", s)  # a literal tilde (a bare ~ is a non-breaking space)
    s = re.sub(r"\\([&%#_$])", r"\1", s)
    s = s.replace("---", "\u2014").replace("--", "\u2013").replace("~", "\u00a0")
    s = s.replace("{", "").replace("}", "").replace("\ue000", "{").replace("\ue001", "}").replace("\ue002", "~")
    return unicodedata.normalize("NFC", re.sub(r"\s+", " ", s).strip())


def encode(s):
    """Unicode text to a BibTeX value (Unicode stays as is; only BibTeX's special characters are escaped)."""
    s = re.sub(r"([&%#_${}])", r"\\\1", str(s)).replace("~", "\\textasciitilde{}")
    return re.sub(r"-(?=-)", "-{}", s)  # keep a typed "--" from turning into a dash


def _value(text, i):
    """Parse one value starting at text[i]; returns (raw string, next index)."""
    if text[i] == "{":
        depth, j = 0, i
        while j < len(text):
            c = text[j]
            if c == "\\":
                j += 2
                continue
            depth += c == "{"
            depth -= c == "}"
            if depth == 0:
                return text[i + 1:j], j + 1
            j += 1
        raise ValueError(f"unclosed brace at offset {i}")
    if text[i] == '"':
        j, depth = i + 1, 0
        while j < len(text):
            c = text[j]
            if c == "\\":
                j += 2
                continue
            depth += c == "{"
            depth -= c == "}"
            if c == '"' and depth == 0:
                return text[i + 1:j], j + 1
            j += 1
        raise ValueError(f"unclosed quote at offset {i}")
    m = re.compile(r"[\w.-]+").match(text, i)
    return m.group(0), m.end()


def parse(text):
    """[(type, key, {field: value})] in file order; field names lower-cased, values decoded."""
    out, pos = [], 0
    start = re.compile(r"@(\w+)\s*\{\s*([^,\s]*)\s*,?")
    field = re.compile(r"\s*(\w[\w-]*)\s*=\s*")
    while (m := start.search(text, pos)):
        kind = m.group(1).lower()
        if kind in ("comment", "string", "preamble"):
            pos = _value(text, text.index("{", m.start()))[1]
            continue
        fields, i = {}, m.end()
        while (fm := field.match(text, i)):
            raw, i = _value(text, fm.end())
            name = fm.group(1).lower()
            fields[name] = raw.strip() if name in VERBATIM else decode(raw)
            i = re.compile(r"\s*,?").match(text, i).end()
        close = re.compile(r"\s*\}").match(text, i)
        if not close:
            line = text.count("\n", 0, i) + 1
            raise ValueError(f"papers.bib line {line}: expected a field or the closing brace of @{kind}{{{m.group(2)}")
        pos = close.end()
        out.append((kind, m.group(2), fields))
    return out


def dump(entries, header=""):
    """Writes entries as BibTeX: one field per line, a blank line between entries."""
    parts = [header.rstrip() + "\n"] if header else []
    for kind, key, fields in entries:
        lines = [f"@{kind}{{{key},"]
        width = max(len(k) for k in fields) if fields else 0
        for k, v in fields.items():
            v = str(v)
            lines.append(f"  {k.ljust(width)} = {{{v if k in VERBATIM else encode(v)}}},")
        lines.append("}")
        parts.append("\n".join(lines) + "\n")
    return "\n".join(parts)
