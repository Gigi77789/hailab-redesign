"""Links every published paper to its official version (ACM DL, ACL Anthology, IEEE, OpenReview...).

    python3 tools/venue_links.py            # papers without a venue link yet
    python3 tools/venue_links.py --refresh  # check every published paper again

For each paper not tagged "Preprint" it searches Crossref, then OpenAlex, for the same title in the
same year (within one year), ignoring preprint servers. The match becomes `venueUrl`, which the
site uses for the paper's title link and lists first among its links, labelled by publisher.
ICLR papers are looked up on OpenReview. Papers it can't confirm keep their current links and
are listed at the end, so a person can add them by hand ("venueUrl": "...").
"""
import re
import sys
import time
import urllib.parse

from pubtools import CONTACT, get_json, load_pubs, norm, ratio, save_pubs

PREPRINT_DOI = re.compile(r"^10\.(48550|21203|31234|36227|1101|5281|6084|32920|2139/ssrn|31219|20944)/|/preprints?\.", re.I)
PUBLISHED_TYPES = {"proceedings-article", "journal-article", "book-chapter", "book", "monograph", "edited-book"}


def label_for(url):
    u = url.lower()
    if "10.1145/" in u or "dl.acm.org" in u:
        return "ACM DL"
    if "10.18653/" in u or "aclanthology.org" in u:
        return "ACL Anthology"
    if "10.1109/" in u or "ieeexplore" in u:
        return "IEEE Xplore"
    if "10.1007/" in u or "springer" in u:
        return "Springer"
    if "openreview.net" in u:
        return "OpenReview"
    if "10.1609/" in u or "aaai.org" in u:
        return "AAAI"
    if "10.24963/" in u or "ijcai.org" in u:
        return "IJCAI"
    if "10.2196/" in u:
        return "JMIR"
    if "10.1016/" in u:
        return "ScienceDirect"
    if "10.1038/" in u:
        return "Nature"
    if "10.1162/" in u:
        return "MIT Press"
    if "10.3389/" in u:
        return "Frontiers"
    if "10.1002/" in u:
        return "Wiley"
    if "10.1177/" in u:
        return "SAGE"
    if "10.1561/" in u:
        return "Now Publishers"
    if "10.9776/" in u:
        return "IDEALS"
    return "DOI"


def same_title(a, b):
    a, b = norm(a), norm(b)
    return a == b or ratio(a, b) >= 0.9 or (len(a.split(":")[0]) > 25 and a.split(" ")[:6] == b.split(" ")[:6] and ratio(a, b) >= 0.8)


def crossref(p):
    q = urllib.parse.quote(p["t"][:300])
    data = get_json(f"https://api.crossref.org/works?query.bibliographic={q}&rows=6&select=DOI,title,subtitle,type,issued,container-title&mailto={CONTACT}")
    for it in ((data or {}).get("message") or {}).get("items") or []:
        doi = it.get("DOI", "")
        if not doi or PREPRINT_DOI.search(doi) or it.get("type") not in PUBLISHED_TYPES:
            continue
        title = (it.get("title") or [""])[0]
        subtitle = (it.get("subtitle") or [""])[0]
        full = f"{title}: {subtitle}" if subtitle else title
        # ACM stores "DocuViz" as the title and the rest as the subtitle
        main = norm(p["t"].split(":")[0].split("?")[0])
        if not (same_title(p["t"], full) or (norm(title) == main and len(main) >= 4)):
            continue
        year = ((it.get("issued") or {}).get("date-parts") or [[None]])[0][0]
        if year and abs(year - p["y"]) > 1:
            continue
        return f"https://doi.org/{doi}"
    return None


def openalex_link(p):
    q = urllib.parse.quote(re.sub(r"[^\w\s-]", " ", p["t"])[:250])
    data = get_json(f"https://api.openalex.org/works?search={q}&per-page=6&mailto={CONTACT}")
    for w in (data or {}).get("results") or []:
        if not same_title(p["t"], w.get("display_name") or ""):
            continue
        doi = (w.get("doi") or "").replace("https://doi.org/", "")
        if doi and not PREPRINT_DOI.search(doi) and w.get("type") != "preprint":
            return f"https://doi.org/{doi}"
        for loc in w.get("locations") or []:
            url = loc.get("landing_page_url") or ""
            src = ((loc.get("source") or {}).get("display_name") or "")
            if url and not re.search(r"arxiv|rxiv|ssrn|zenodo|figshare|semanticscholar|europepmc|pubmed|ncbi|researchgate", url + src, re.I) \
                    and re.search(r"aclanthology|dl\.acm|ieeexplore|openreview|ojs\.aaai|ijcai|springer|sciencedirect|nature\.com|jmir", url, re.I):
                return url
    return None


def openreview(p):
    m = re.search(r"ICLR (\d{4})", p.get("tag", ""))
    if not m:
        return None
    q = urllib.parse.quote(p["t"])
    data = get_json(f"https://api2.openreview.net/notes/search?term={q}&group=ICLR.cc/{m.group(1)}/Conference&limit=5")
    for n in (data or {}).get("notes") or []:
        title = ((n.get("content") or {}).get("title") or {}).get("value", "")
        if same_title(p["t"], title) and n.get("forum"):
            return f"https://openreview.net/forum?id={n['forum']}"
    return None


def main():
    refresh = "--refresh" in sys.argv
    head, pubs = load_pubs()
    missing = []
    found = 0
    for p in pubs:
        if p.get("tag") == "Preprint" or (p.get("venueUrl") and not refresh) or p.get("venueManual"):
            continue
        url = openreview(p) or crossref(p) or openalex_link(p)
        time.sleep(0.25)
        if not url:
            missing.append(p)
            continue
        found += 1
        p["venueUrl"] = url
        # venue link first, then the rest; drop an older "Paper" link that points to the same place
        rest = {k: v for k, v in (p.get("links") or {}).items() if v != url and k != "Paper"}
        p["links"] = {label_for(url): url, **rest}
    save_pubs(head, pubs)
    print(f"{found} published paper(s) linked to their venue")
    if missing:
        print(f"{len(missing)} published paper(s) without a confirmed venue link:")
        for p in missing:
            print(f"  - {p['tag']:<20} {p['t'][:80]}")


if __name__ == "__main__":
    main()
