"""Merges the publication list from Dakuo's CV (.docx) into data/pubs.js.

    python3 tools/import_cv.py path/to/CV.docx            # merge and write
    python3 tools/import_cv.py path/to/CV.docx --dry-run  # report only

The CV is the source of truth for peer-reviewed venues and years. For every CV entry
([C..] conference, [J..] journal, [W..] abstract or workshop, [B..] book) we:
  * match it to an existing paper by title, keeping that paper's full author names,
    links and abstract, and taking venue, short tag and year from the CV;
  * or add it as a new paper, filling full author names and links from OpenAlex
    when a lookup finds the same title.
Papers on the site that the CV does not list (mostly preprints) are kept.
Topics are recomputed for every paper unless the paper sets "topicsManual": true.
"""
import re
import sys
import time
import zipfile
from html import unescape

from pubtools import classify, load_pubs, norm, openalex, ratio, save_pubs, venue_tag
KINDS = {"C": "conference", "J": "journal", "W": "abstract", "B": "book"}

# ---------- helpers ----------
# ---------- CV parsing ----------
def cv_entries(path):
    z = zipfile.ZipFile(path)
    xml = z.read("word/document.xml").decode("utf8")
    paras = []
    for p in re.findall(r"<w:p\b[^>]*>.*?</w:p>", xml, re.S):
        t = unescape("".join(re.findall(r"<w:t(?:\s[^>]*)?>(.*?)</w:t>", p, re.S))).strip()
        if t:
            paras.append(t)
    start = next(i for i, t in enumerate(paras) if t.upper() == "PUBLICATIONS")
    end = next(i for i, t in enumerate(paras) if t.upper().startswith("PATENTS"))
    for t in paras[start:end]:
        m = re.match(r"\[([BCJW])(\d+)\]\s*(.*)", t)
        if m:
            yield m.group(1), int(m.group(2)), m.group(3)

def parse_authors(s):
    s = re.sub(r"\*|\bet al\.?|\.\.\.|…", " ", s)
    s = re.sub(r"\s(&|and)\s", ", ", s)
    parts = [x.strip(" .") for x in s.split(",") if x.strip(" .")]
    out, i = [], 0
    initials = re.compile(r"^([A-Z][a-z]?\.?\s?-?)+$")
    while i < len(parts):
        last = parts[i]
        if i + 1 < len(parts) and (initials.match(parts[i + 1]) or re.match(r"^[A-Z][a-z]+\.?$", parts[i + 1]) and len(parts[i + 1]) <= 5):
            first = re.sub(r"\s+", " ", parts[i + 1].replace(".", ". ")).strip()
            first = re.sub(r"([A-Z])(?=\s|$)", r"\1.", first).replace("..", ".")
            out.append(f"{first} {last}")
            i += 2
        else:
            out.append(last)
            i += 1
    return out

SPLIT = re.compile(r"(?<=[.?!])[\"”]?\s+(?=In |Proceedings|Proc\.|ACM |Findings|Transactions|International|Journal|IEEE|Computers|IConference|Computer Vision|Extended|Special|Trends|\d{4} |[A-Z]{2,}[’'\s])")

def parse_entry(kind, body):
    body = body.replace("\xa0", " ")  # Word puts non-breaking spaces before venue names
    m = re.search(r"\((\d{4})(?:,\s*[A-Za-z]+)?\)\.?\s*|(?<=[.,])\s(\d{4})\.\s+|\s(\d{4})\.\s+", body)
    if not m:
        return None
    year = int(next(g for g in m.groups() if g))
    authors, rest = body[: m.start()], body[m.end():]
    award = "Best Paper Award" if "Best Paper Award" in rest else ("Best Paper Honorable Mention" if "Honorable Mention" in rest else "")
    rest = re.sub(r"Best Paper (Award|Honorable Mention)\.?\s*\d+%\.?", "", rest).strip()
    if kind == "B":  # the book entry is "Chinese title. English title. Publisher."
        parts = [x.strip() for x in rest.split(". ") if x.strip()]
        return {"y": year, "t": f"{parts[1]} ({parts[0]})" if len(parts) > 2 else rest, "a": parse_authors(authors),
                "v": parts[-1].strip(" ."), "award": "", "_rest": rest}
    sm = SPLIT.search(rest)
    title, venue = (rest[: sm.start()], rest[sm.end():]) if sm else (rest, "")
    title = title.strip(" .\"“”")
    venue = re.sub(r"\s*\(pp?\.[^)]*\)|,?\s*pages?\s[\d–-]+.*$|,\s*\d+\(\w+\),.*$", "", venue).strip(" .")
    return {"y": year, "t": title, "a": parse_authors(authors), "v": venue or rest, "award": award, "_rest": rest}

def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    dry = "--dry-run" in sys.argv
    head, pubs = load_pubs()
    by_norm = [(norm(p["t"]), p) for p in pubs]

    added, merged, claimed = [], 0, set()
    for letter, num, text in cv_entries(sys.argv[1]):
        e = parse_entry(letter, text)
        if not e:
            print(f"  skipped [{letter}{num}]: no year found")
            continue
        rest_n, head_n = norm(e["_rest"]), norm(e["t"].split(":")[0])
        best, score = None, 0
        for tn, p in by_norm:
            if id(p) in claimed:  # each site paper takes at most one CV entry
                continue
            if rest_n.startswith(tn):
                s = 1.0
            elif len(head_n) > 25 and norm(p["t"].split(":")[0]) == head_n:
                s = 0.95  # same main title, subtitle reworded
            else:
                s = max(ratio(tn, rest_n[: len(tn)]), ratio(tn, norm(e["t"])))
            if s > score:
                best, score = p, s
        cv_id = f"{letter}{num}"
        tag = venue_tag(e["v"] + " " + e["_rest"], e["y"])
        if best and score >= 0.85:
            claimed.add(id(best))
            title_n = norm(best["t"])
            venue = e["_rest"][len(best["t"]):] if rest_n.startswith(title_n) else e["v"]
            venue = re.sub(r"^[\s.?!\"”]+", "", venue)
            venue = re.sub(r"\s*\(pp?\.[^)]*\)|,?\s*pages?\s[\d–-]+.*$|,\s*\d+\(\w+\),.*$", "", venue).strip(" .")
            if best.get("tag") == "Preprint" and "pre" not in best:
                best["pre"] = {"v": best.get("v", ""), "tag": "Preprint", "y": best.get("y")}
            best.update({"y": e["y"], "v": venue or best.get("v", ""), "tag": tag, "kind": KINDS[letter], "cv": cv_id})
            if e["award"]:
                best["award"] = e["award"]
            merged += 1
        else:
            p = {"y": e["y"], "t": e["t"], "a": e["a"], "v": e["v"], "tag": tag, "links": {}, "award": e["award"],
                 "topics": [], "abs": "", "kind": KINDS[letter], "cv": cv_id}
            hit = openalex(e["t"])
            time.sleep(0.3)
            if hit:
                if hit["a"]:
                    p["a"] = hit["a"]
                if hit["published"] and hit["published"]["url"]:
                    p["links"]["Paper"] = hit["published"]["url"]
                if hit["arxiv"]:
                    p["links"]["arXiv"] = hit["arxiv"]
            pubs.append(p)
            by_norm.append((norm(p["t"]), p))
            near = f"  ~ {best['t'][:50]} ({score:.2f})" if best and score > 0.7 else ""
            added.append(f"[{cv_id}] {tag:<18} {p['t'][:70]}{'  (OpenAlex)' if hit else ''}{near}")

    for p in pubs:
        p.setdefault("kind", "preprint" if p.get("tag") == "Preprint" else "conference")
        if not p.get("topicsManual"):
            p["topics"] = classify(p)
        if p.get("award") in ("award", "honorable"):
            p["award"] = "Best Paper Award" if p["award"] == "award" else "Best Paper Honorable Mention"

    cv_num = lambda p: int(p.get("cv", "X0")[1:] or 0)
    pubs.sort(key=lambda p: (-p["y"], 0 if p.get("cv") else 1, -cv_num(p)))
    print(f"{merged} CV entries matched existing papers, {len(added)} added, {len(pubs)} papers in total")
    for line in added:
        print("  +", line)
    if not dry:
        save_pubs(head, pubs)

if __name__ == "__main__":
    main()
