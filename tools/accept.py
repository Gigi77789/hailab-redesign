"""Marks papers as accepted at a venue, before the published version is indexed anywhere.

    python3 tools/accept.py "NeurIPS 2026" lu2026firefly
    python3 tools/accept.py "NeurIPS 2026" --venue "Conference on Neural Information Processing Systems (NeurIPS 2026)" \\
        lu2026firefly "SpanUQ" --openalex W7154182845

Papers are named by BibTeX key or by the start of their title. --openalex adds a paper that papers.bib
doesn't list yet (filled from that OpenAlex work the way tools/find_papers.py fills it) and marks it too.
Each paper gets the short tag (abbr), the venue (--venue, or the tag), the tag's year and kind, and its
preprint details move to preprint_venue / preprint_year, the same change tools/update_venues.py makes once
OpenAlex lists the published version. tools/venue_links.py finds the official page later.
"""
import argparse
import re
import sys

from find_papers import API, to_paper
from pubtools import CONTACT, classify, get_json, load_pubs, norm, save_pubs


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("tag", help='the short venue shown in the pill, e.g. "NeurIPS 2026"')
    ap.add_argument("papers", nargs="*", help="BibTeX keys or title prefixes")
    ap.add_argument("--venue", help="the full venue name (default: the tag)")
    ap.add_argument("--openalex", action="append", default=[], help="an OpenAlex work id to add first (repeatable)")
    args = ap.parse_intermixed_args()
    year = re.search(r"\b(19|20)\d{2}\b", args.tag)
    if not year:
        sys.exit(f'the tag needs a year, e.g. "NeurIPS 2026" (got "{args.tag}")')

    head, pubs = load_pubs()
    targets = []
    for wid in args.openalex:
        w = get_json(f"{API}/works/{wid}?mailto={CONTACT}")
        if not w:
            sys.exit(f"OpenAlex has no work {wid}")
        p = to_paper(w)
        pubs.insert(0, p)
        targets.append(p)
    for name in args.papers:
        hits = [p for p in pubs if p.get("key") == name] or [p for p in pubs if norm(p["t"]).startswith(norm(name))]
        if len(hits) != 1:
            sys.exit(f'"{name}" matches {len(hits)} papers; use the BibTeX key')
        targets.append(hits[0])

    for p in targets:
        if p["tag"] == "Preprint" and "pre" not in p:
            p["pre"] = {"v": p.get("v", ""), "tag": "Preprint", "y": p["y"]}
        p.update({"tag": args.tag, "v": args.venue or args.tag, "y": int(year.group(0)),
                  "kind": "workshop" if "Workshop" in args.tag else "conference"})
        if not p.get("topicsManual"):
            p["topics"] = classify(p)
        print(f"  {args.tag}: {p['t'][:80]}")
    pubs.sort(key=lambda q: -q["y"])  # stable: keeps the order within a year
    save_pubs(head, pubs)


if __name__ == "__main__":
    main()
