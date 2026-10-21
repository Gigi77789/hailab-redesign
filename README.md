# NEU HAI website

Static site for the Human-Centered AI Lab at Northeastern. No build step, no framework: plain HTML, one stylesheet, one script.

## Edit content

Most updates only touch a file in `data/`. Reload the page to see them.

| To change | Edit |
| --- | --- |
| News | `data/news.js` (newest first) |
| People, roles, photos | `data/team.js` (photos go in `assets/team/`, square-ish, about 640px) |
| Papers | `data/pubs.js` (newest first; `tag` is the short venue shown in the pill) |
| Lab members bolded in author lists | `data/members.js` |
| Research areas and their featured papers | `data/research.js` |

Page text (hero, Join us, section headings) lives in `tools/pages.py`. After editing it, regenerate the HTML:

```bash
python3 tools/pages.py
```

## Preview locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

## Deploy

**Draft for review.** `sh tools/deploy.sh` builds a copy with a "Draft redesign" banner and a noindex tag, then force-pushes it to this repo's `gh-pages` branch, which GitHub Pages serves.

**Going live.** Copy the folder's contents into the repo that serves hailab.io (or any static host). `tools/` and this README don't need to be served.
