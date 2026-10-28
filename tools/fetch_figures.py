"""Gives papers a figure: the teaser image of the paper's arXiv version, or Figure 1 when it has no teaser.

    python3 tools/fetch_figures.py            # papers that have no figure yet
    python3 tools/fetch_figures.py --refresh  # look again for every paper without a hand-picked figure

For each paper it finds the arXiv id (from its arXiv link, or by asking OpenAlex), opens the
paper's HTML rendering on arxiv.org (ar5iv for older papers), takes the teaser figure (the
image under the title in ACM papers) or else the first figure, and saves it under assets/papers/. Papers with no arXiv version or no figure stay without one,
and the site simply shows no image for them.
Hand-picked figures (set "imgManual": true on the paper) are never replaced.
arXiv asks automated clients to wait about 3 seconds between requests, so this is slow.
"""
import pathlib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from pubtools import ROOT, load_pubs, openalex, save_pubs

OUT = ROOT / "assets" / "papers"
UA = {"User-Agent": "neuhai-site/1.0 (lab website figure fetcher; contact b.yao@northeastern.edu)"}
PAUSE = 3.2
RECENT = time.localtime().tm_year - 1  # papers from last year on may still gain an arXiv version


def fetch(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
            return r.geturl(), r.read()
    except urllib.error.HTTPError as e:
        return None, e.code
    except Exception:
        return None, None


def arxiv_id(p):
    url = (p.get("links") or {}).get("arXiv", "")
    m = re.search(r"(\d{4}\.\d{4,5})", url)
    return m.group(1) if m else None


def pick_figure(page_url, html):
    """(image url, "teaser" | "figure1") for the paper's teaser figure, else its first figure."""
    html = html.decode("utf8", "ignore")
    figs = re.findall(r'<figure([^>]*class="[^"]*ltx_figure[^"]*"[^>]*)>(.*?)</figure>', html, re.S)
    teasers = [f for f in figs if "ltx_teaserfigure" in f[0]]
    for kind, group in (("teaser", teasers), ("figure1", figs)):
        for _, body in group:
            # a figure made of several panels: take the largest panel
            imgs = []
            for tag in re.findall(r"<img[^>]+>", body):
                src = re.search(r'src="([^"]+)"', tag)
                if not src or src.group(1).startswith("data:"):
                    continue
                w = re.search(r'width="(\d+)"', tag)
                h = re.search(r'height="(\d+)"', tag)
                imgs.append((int(w.group(1)) * int(h.group(1)) if w and h else 0, src.group(1)))
            if imgs:
                return urllib.parse.urljoin(page_url, max(imgs)[1]), kind
    return None, None


def main():
    refresh = "--refresh" in sys.argv
    head, pubs = load_pubs()
    OUT.mkdir(parents=True, exist_ok=True)
    found = 0
    for p in pubs:
        if p.get("imgManual") or (p.get("img") and not refresh):
            continue
        aid = arxiv_id(p)
        if not aid and p["y"] >= RECENT:
            hit = openalex(p["t"])
            time.sleep(0.3)
            m = hit and re.search(r"(\d{4}\.\d{4,5})", hit.get("arxiv") or "")
            if m:
                aid = m.group(1)
                p.setdefault("links", {})["arXiv"] = f"https://arxiv.org/abs/{aid}"
        if not aid:
            continue
        img_url, kind = None, None
        for base in (f"https://arxiv.org/html/{aid}", f"https://ar5iv.labs.arxiv.org/html/{aid}"):
            final, body = fetch(base)
            time.sleep(PAUSE)
            if isinstance(body, bytes):
                img_url, kind = pick_figure(final or base, body)
                if img_url:
                    break
        if not img_url:
            print(f"  - no figure  {p['t'][:70]}")
            continue
        if p.get("imgSrcUrl") == img_url and p.get("img"):
            continue  # same image as last time
        _, data = fetch(img_url)
        time.sleep(PAUSE)
        if not isinstance(data, bytes) or len(data) < 2000:
            print(f"  - image failed  {p['t'][:70]}")
            continue
        ext = pathlib.Path(urllib.parse.urlparse(img_url).path).suffix.lower() or ".png"
        raw = OUT / f"{aid}.raw{ext}"
        raw.write_bytes(data)
        dest = OUT / f"{aid}.jpg"
        # shrink to at most 1000px as a JPEG; sips ships with macOS, elsewhere keep the original file
        ok = sys.platform == "darwin" and subprocess.run(
            ["sips", "-Z", "1000", "-s", "format", "jpeg", "-s", "formatOptions", "82", str(raw), "--out", str(dest)],
            capture_output=True).returncode == 0
        if ok:
            raw.unlink()
        else:
            dest = OUT / f"{aid}{ext}"
            raw.replace(dest)
        old = p.get("img")
        p["img"], p["imgFrom"], p["imgSrcUrl"] = f"assets/papers/{dest.name}", kind, img_url
        if old and old != p["img"] and old.startswith("assets/papers/") and not any(q.get("img") == old for q in pubs if q is not p):
            (ROOT / old).unlink(missing_ok=True)
        found += 1
        print(f"  + {kind:<8} {p['t'][:70]}")
        save_pubs(head, pubs)  # save as we go: a long run can be stopped and resumed
    save_pubs(head, pubs)
    print(f"{found} figure(s) added")


if __name__ == "__main__":
    main()
