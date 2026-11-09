"""Finds lab papers that papers.bib doesn't list yet, by looking up current lab members on OpenAlex.

    python3 tools/find_papers.py                  # add new papers to src/data/papers.bib
    python3 tools/find_papers.py --dry-run        # only list them
    python3 tools/find_papers.py --since 2024     # look further back (default: the last two years)
    python3 tools/find_papers.py --suggest-ids    # find OpenAlex author ids for members who have none

Who is searched: the director, the research scientists (faculty) and the PhD students in
src/data/team.yaml that have an `orcid` or an `openalex` author id (several ids separated by "|" when OpenAlex
split someone into more than one). Visiting members and alumni are not searched.
A work counts as a lab paper when Dakuo Wang is an author, or at least two of the searched members are.
Papers already in papers.bib (same title, same arXiv id, or the same OpenAlex work) are skipped, and so are the works
listed in tools/ignored_papers.txt: add a rejected paper's OpenAlex id there so it is not proposed again.

New papers get venue, short tag, links, abstract and topics the same way the other tools fill them,
plus `openalex = {W...}`. .github/workflows/find-papers.yml runs this weekly and opens a pull request
with what it found, so a person checks each paper before it goes on the site.
"""
import argparse
import datetime
import re
import sys
import time
import urllib.parse

import yaml

from pubtools import CONTACT, DATA, ROOT, classify, flip_name, get_json, load_pubs, norm, ratio, save_pubs, venue_tag

API = "https://api.openalex.org"
IGNORED = ROOT / "tools" / "ignored_papers.txt"
PREPRINT_SOURCE = re.compile(r"arxiv|rxiv|ssrn|research square|preprint|zenodo|openreview", re.I)
PREPRINT_DOI = re.compile(r"^10\.(48550|21203|31234|36227|1101|5281|6084|32920|2139/ssrn|31219|20944)/|/preprints?\.", re.I)
DIRECTOR = "dakuo wang"


def plain(name):
    """A name without its nickname, for matching: “Bingsheng ‘Arthur’ Yao” -> "bingsheng yao"."""
    return norm(re.sub(r"\(.*?\)|[‘’'\"“”]\w+[‘’'\"“”]", " ", name))


def people():
    """[(name, [openalex author ids])] for the director, faculty and PhD students, plus who was skipped."""
    team = yaml.safe_load((DATA / "team.yaml").read_text())
    current = [team["director"]] + [m for m in team["members"] if m["group"] in ("faculty", "phd")]
    out, skipped = [], []
    for m in current:
        ids = [x.strip().rsplit("/", 1)[-1] for x in str(m.get("openalex") or "").split("|") if x.strip()]
        if not ids and m.get("orcid"):
            data = get_json(f"{API}/authors?filter=orcid:{m['orcid']}&mailto={CONTACT}")
            ids = [a["id"].rsplit("/", 1)[-1] for a in (data or {}).get("results") or []]
        (out if ids else skipped).append((m["name"], ids))
    return out, [n for n, _ in skipped]


def works(ids, since):
    """All works by these OpenAlex authors published since `since` (a year)."""
    out, cursor = [], "*"
    fields = "id,display_name,publication_year,type,doi,authorships,primary_location,locations,abstract_inverted_index"
    while cursor:
        q = f"author.id:{'|'.join(ids)},from_publication_date:{since}-01-01"
        data = get_json(f"{API}/works?filter={q}&per-page=100&cursor={cursor}&select={fields}&mailto={CONTACT}")
        if not data:
            break
        out += data["results"]
        cursor = data["meta"].get("next_cursor") if data["results"] else None
        time.sleep(0.2)
    return out


def same_title(a, b):
    """Normalized titles of the same paper: nearly equal, or one is the other with a prefix or subtitle added."""
    return ratio(a, b) >= 0.9 or (min(len(a), len(b)) > 30 and (a in b or b in a))


def arxiv_id(w):
    """The arXiv id among a work's locations, or ""."""
    for loc in w.get("locations") or []:
        m = re.search(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})", loc.get("landing_page_url") or "")
        if m:
            return m.group(1)
    doi = re.search(r"10\.48550/arxiv\.(\d{4}\.\d{4,5})", w.get("doi") or "", re.I)
    return doi.group(1) if doi else ""


def abstract(w):
    inv = w.get("abstract_inverted_index") or {}
    pos = sorted((i, word) for word, idx in inv.items() for i in idx)
    return " ".join(word for _, word in pos)


def to_paper(w):
    """A papers.bib record for an OpenAlex work."""
    loc = w.get("primary_location") or {}
    venue = ((loc.get("source") or {}).get("display_name")) or ""
    arxiv = arxiv_id(w)
    doi = (w.get("doi") or "").replace("https://doi.org/", "")
    preprint = w.get("type") == "preprint" or not venue or bool(PREPRINT_SOURCE.search(venue)) or bool(PREPRINT_DOI.search(doi))
    year = w.get("publication_year")
    p = {"y": year, "t": w["display_name"], "a": [flip_name(a["author"]["display_name"]) for a in w.get("authorships") or [] if a["author"].get("display_name")],
         "v": "arXiv preprint" if preprint and arxiv else venue, "award": "", "abs": abstract(w), "links": {},
         "extra": {"openalex": w["id"].rsplit("/", 1)[-1]}}
    p["tag"] = "Preprint" if preprint else venue_tag(venue, year)
    p["kind"] = "preprint" if preprint else ("journal" if w.get("type") == "article" and "Proceedings" not in venue else "conference")
    if arxiv:
        p["links"]["arXiv"] = f"https://arxiv.org/abs/{arxiv}"
    if doi and not preprint:
        p["venueUrl"] = f"https://doi.org/{doi}"
    p["topics"] = classify(p)
    return p


def suggest_ids():
    """For members without ids: OpenAlex authors with that name whose works overlap papers.bib."""
    team = yaml.safe_load((DATA / "team.yaml").read_text())
    _, pubs = load_pubs()
    titles = [norm(p["t"]) for p in pubs]
    for m in [team["director"]] + team["members"]:
        if m.get("group", "faculty") not in ("faculty", "phd") or m.get("orcid") or m.get("openalex"):
            continue
        data = get_json(f"{API}/authors?search={urllib.parse.quote(plain(m['name']))}&per-page=10&mailto={CONTACT}")
        found = []
        for a in (data or {}).get("results") or []:
            aid = a["id"].rsplit("/", 1)[-1]
            ws = get_json(f"{API}/works?filter=author.id:{aid}&per-page=200&select=display_name&mailto={CONTACT}")
            overlap = sum(1 for w in (ws or {}).get("results") or [] if any(ratio(norm(w["display_name"] or ""), t) >= 0.9 for t in titles))
            if overlap >= 2:
                found.append(f"{aid} ({overlap} papers in papers.bib, {a.get('works_count')} works)")
            time.sleep(0.2)
        print(f"{m['name']}: {', '.join(found) or 'no match'}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--since", type=int, default=datetime.date.today().year - 1)
    ap.add_argument("--summary", help="also write a Markdown list of what was found to this file (for the pull request)")
    ap.add_argument("--suggest-ids", action="store_true")
    args = ap.parse_args()
    if args.suggest_ids:
        return suggest_ids()

    head, pubs = load_pubs()
    known = [norm(p["t"]) for p in pubs] + [norm(p["pre"]["t"]) for p in pubs if p.get("pre", {}).get("t")]
    known_ids = {(p.get("extra") or {}).get("openalex") for p in pubs}
    known_arxiv = {re.sub(r".*/", "", (p.get("links") or {}).get("arXiv", "")) for p in pubs} - {""}
    ignored = {l.split("#")[0].strip() for l in IGNORED.read_text().splitlines()} if IGNORED.exists() else set()

    members, skipped = people()
    if skipped:
        print(f"no orcid or openalex id in team.yaml, not searched: {', '.join(skipped)}")

    found = {}
    for name, ids in members:
        for w in works(ids, args.since):
            wid = w["id"].rsplit("/", 1)[-1]
            title = norm(w.get("display_name") or "")
            if not title or wid in ignored or wid in known_ids or arxiv_id(w) in known_arxiv or any(same_title(title, k) for k in known):
                continue
            authors = w.get("authorships") or []
            names = {plain(flip_name(a["author"].get("display_name") or "")) for a in authors}
            author_ids = {(a["author"].get("id") or "").rsplit("/", 1)[-1] for a in authors}
            # people, not ids: a member matched by id and by name still counts once
            lab = [n for n, ids in members if author_ids & set(ids) or plain(n) in names]
            if DIRECTOR not in names and len(lab) < 2:
                continue
            # an arXiv version and the published version are separate works: keep the published one
            prev = found.get(title)
            if prev is None or (prev.get("type") == "preprint" and w.get("type") != "preprint"):
                found[title] = w

    new = [to_paper(w) for w in found.values()]
    new.sort(key=lambda p: -p["y"])
    lines = [f"- **{p['t']}** ({p['tag']}, {p['y']}), {', '.join(p['a'][:6])}{' et al.' if len(p['a']) > 6 else ''}. "
             f"OpenAlex [{p['extra']['openalex']}](https://openalex.org/{p['extra']['openalex']})" for p in new]
    print(f"{len(new)} new paper(s) since {args.since}")
    for line in lines:
        print(" ", line)
    if args.summary:
        with open(args.summary, "w") as f:
            f.write("\n".join(lines) + "\n")
    if new and not args.dry_run:
        for p in new:  # newest first: each new paper goes at the top of its year
            i = next((i for i, q in enumerate(pubs) if q["y"] <= p["y"]), len(pubs))
            pubs.insert(i, p)
        save_pubs(head, pubs)


if __name__ == "__main__":
    sys.exit(main())
