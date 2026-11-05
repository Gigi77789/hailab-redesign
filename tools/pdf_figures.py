"""Finds a figure for papers that still have none, from the first page of the paper's PDF.

    python3 tools/pdf_figures.py               # check papers without a figure, write results to tools/pdf_figures.json
    python3 tools/pdf_figures.py --apply       # copy the results from that file into data/pubs.js

For each paper it looks for an open PDF (arXiv, ACL Anthology, OpenReview, a "PDF" link, or the
open-access copy OpenAlex knows about), opens page 1, and finds the caption that starts with
"Figure 1" or "Fig. 1": the teaser on ACM papers, the first figure elsewhere. The graphics just
above that caption are cut out and saved as assets/papers/<id>.jpg. Papers whose first page has
no Figure 1 keep showing no image. Needs PyMuPDF (pip install pymupdf).
"""
import hashlib
import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

import fitz  # PyMuPDF

from pubtools import CONTACT, ROOT, get_json, load_pubs, norm, ratio, save_pubs

OUT = ROOT / "assets" / "papers"
RESULTS = ROOT / "tools" / "pdf_figures.json"
UA = {"User-Agent": f"Mozilla/5.0 (compatible; neuhai-site/1.0; +https://hailab.io; {CONTACT})"}
CAPTION = re.compile(r"^\s*(figure|fig\.?)\s*1\s*[:.|]", re.I)


def pdf_candidates(p):
    links = p.get("links") or {}
    urls = []
    m = re.search(r"(\d{4}\.\d{4,5})", links.get("arXiv", ""))
    if m:
        urls.append(f"https://arxiv.org/pdf/{m.group(1)}")
    for u in [p.get("venueUrl", "")] + list(links.values()):
        if "aclanthology.org" in u:
            urls.append(u.rstrip("/") + ".pdf")
        m = re.search(r"openreview\.net/forum\?id=([\w-]+)", u)
        if m:
            urls.append(f"https://openreview.net/pdf?id={m.group(1)}")
    if links.get("PDF"):
        urls.append(links["PDF"])
    doi = re.search(r"doi\.org/(10\.\S+)", p.get("venueUrl", "") + " " + " ".join(links.values()))
    works = []
    if doi:
        works.append(get_json(f"https://api.openalex.org/works/https://doi.org/{doi.group(1)}?mailto={CONTACT}") or {})
    # every version OpenAlex knows under the same title (preprints often carry the open PDF)
    q = urllib.parse.quote(re.sub(r"[^\w\s-]", " ", p["t"])[:250])
    for w in (get_json(f"https://api.openalex.org/works?search={q}&per-page=5&mailto={CONTACT}") or {}).get("results") or []:
        r = ratio(norm(w.get("display_name") or ""), norm(p["t"]))
        first = ((w.get("authorships") or [{}])[0].get("author") or {}).get("display_name", "")
        same_author = bool(p.get("a")) and first.split()[-1:] == p["a"][0].split()[-1:]
        if r >= 0.9 or (r >= 0.7 and same_author):  # a preprint's title often differs a little
            works.append(w)
    for w in works:
        for loc in [w.get("best_oa_location") or {}] + (w.get("locations") or []):
            if loc.get("pdf_url"):
                urls.append(loc["pdf_url"])
            m = re.search(r"arxiv\.org/abs/(\d{4}\.\d{4,5})", loc.get("landing_page_url") or "")
            if m:
                urls.append(f"https://arxiv.org/pdf/{m.group(1)}")
    seen = []
    for u in urls:
        if u and u not in seen:
            seen.append(u)
    return seen


def fetch_pdf(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
            data = r.read()
        return data if data[:5] == b"%PDF-" else None
    except Exception:
        return None


def figure_one(doc):
    """The page-1 region of the graphics right above the "Figure 1" caption, or None."""
    page = doc[0]
    cap = None
    for b in page.get_text("blocks"):
        if CAPTION.match(b[4] or ""):
            cap = fitz.Rect(b[:4])
            break
    if cap is None:
        return None
    rects = [page.get_image_bbox(img) for img in page.get_images(full=True)]
    rects += [d["rect"] for d in page.get_drawings()]
    rects = [r for r in rects if r.is_valid and not r.is_empty and r.y1 <= cap.y0 + 4 and r.width > 2 and r.height > 2
             and r.width < page.rect.width * 0.98]
    if not rects:
        return None
    # grow a region upward from the graphics closest to the caption
    near = [r for r in rects if cap.y0 - r.y1 < 40]
    if not near:
        return None
    box = fitz.Rect(near[0])
    for r in near[1:]:
        box |= r
    grown = True
    while grown:
        grown = False
        for r in rects:
            if not box.contains(r) and fitz.Rect(box.x0 - 14, box.y0 - 14, box.x1 + 14, box.y1 + 14).intersects(r):
                box |= r
                grown = True
    # include text inside the figure (axis labels, callouts), stop at the caption
    box = fitz.Rect(box.x0 - 4, box.y0 - 4, box.x1 + 4, min(box.y1 + 4, cap.y0)) & page.rect
    if box.width < page.rect.width * 0.28 or box.height < 60 or box.height > page.rect.height * 0.8:
        return None
    return box


def main():
    head, pubs = load_pubs()
    if "--apply" in sys.argv:
        found = json.loads(RESULTS.read_text())
        n = 0
        for p in pubs:
            r = found.get(p["t"])
            if r and not p.get("img") and not p.get("imgManual"):
                p["img"], p["imgFrom"], p["imgSrcUrl"] = r["img"], "pdf-figure1", r["pdf"]
                n += 1
        save_pubs(head, pubs)
        print(f"{n} figure(s) added to data/pubs.js")
        return

    OUT.mkdir(parents=True, exist_ok=True)
    found, tried = {}, 0
    for p in pubs:
        if p.get("img") or p.get("imgManual") or p.get("kind") == "book":
            continue
        tried += 1
        urls = pdf_candidates(p)
        got = None
        for u in urls:
            data = fetch_pdf(u)
            time.sleep(1.5)
            if not data:
                continue
            try:
                doc = fitz.open(stream=data, filetype="pdf")
                box = figure_one(doc)
            except Exception:
                continue
            if not box:
                print(f"  - no Figure 1 on page 1   {p['t'][:70]}")
                got = "none"
                break
            m = re.search(r"(\d{4}\.\d{4,5})", (p.get("links") or {}).get("arXiv", ""))
            name = m.group(1) if m else "p" + hashlib.md5(p["t"].encode()).hexdigest()[:10]
            png = OUT / f"{name}.raw.png"
            doc[0].get_pixmap(clip=box, dpi=200).save(png)
            dest = OUT / f"{name}.jpg"
            subprocess.run(["sips", "-Z", "1000", "-s", "format", "jpeg", "-s", "formatOptions", "82", str(png), "--out", str(dest)], capture_output=True)
            png.unlink(missing_ok=True)
            found[p["t"]] = {"img": f"assets/papers/{dest.name}", "pdf": u}
            print(f"  + figure 1                {p['t'][:70]}")
            got = "ok"
            break
        if got is None:
            print(f"  - no open PDF ({len(urls)} tried)   {p['t'][:70]}")
        RESULTS.write_text(json.dumps(found, indent=1, ensure_ascii=False))
    print(f"{len(found)} of {tried} paper(s) got a figure; review assets/papers, then run with --apply")


if __name__ == "__main__":
    main()
