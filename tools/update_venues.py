"""Promotes preprints to their published venue.

For every paper in data/pubs.js tagged "Preprint", look the title up on OpenAlex. When a
peer-reviewed version with the same title exists, the paper's venue, short tag and year are
replaced with the published ones and the preprint details move under `pre`, so the site shows
"CHI 2026" instead of "Preprint" without anyone editing the data by hand.

    python3 tools/update_venues.py            # write changes
    python3 tools/update_venues.py --dry-run  # only report

.github/workflows/update-venues.yml runs it every Monday and commits what it finds.
Venues OpenAlex doesn't index (OpenReview conferences such as ICLR) still come from the CV:
re-run tools/import_cv.py when the CV changes.
"""
import sys
import time

from pubtools import classify, load_pubs, openalex, save_pubs, venue_tag


def main():
    dry = "--dry-run" in sys.argv
    head, pubs = load_pubs()
    promoted = 0
    for p in pubs:
        if p.get("tag") != "Preprint":
            continue
        hit = openalex(p["t"])
        time.sleep(0.3)
        pub = hit and hit["published"]
        if not pub:
            continue
        year = hit["year"] or p["y"]
        tag = venue_tag(pub["venue"], year)
        if tag == "Peer-reviewed":  # a venue we don't have a short name for: leave it for a person to check
            print(f"  ? {p['t'][:70]}  ->  {pub['venue']} (no short tag, skipped)")
            continue
        print(f"  + {p['t'][:70]}  ->  {tag}")
        promoted += 1
        if dry:
            continue
        p["pre"] = {"v": p.get("v", ""), "tag": "Preprint", "y": p.get("y")}
        p.update({"v": pub["venue"], "tag": tag, "y": year, "kind": "workshop" if "Workshop" in tag else "conference"})
        if pub.get("url"):
            p.setdefault("links", {})["Paper"] = pub["url"]
        if hit.get("arxiv"):
            p["links"].setdefault("arXiv", hit["arxiv"])
        if not p.get("topicsManual"):
            p["topics"] = classify(p)
    if promoted and not dry:
        pubs.sort(key=lambda x: -x["y"])
        save_pubs(head, pubs)
    print(f"{promoted} preprint(s) {'would be ' if dry else ''}promoted to a published venue")


if __name__ == "__main__":
    main()
