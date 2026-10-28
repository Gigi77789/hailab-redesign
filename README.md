# NEU HAI website

Static site for the Human-Centered AI Lab at Northeastern. No build step, no framework: plain HTML, one stylesheet, one script.

## Edit content

Most updates only touch a file in `data/`. After editing one by hand, run `python3 tools/pages.py`: it stamps each page's CSS, JS, and data links with a content hash so browsers load the new version instead of a cached copy. (The scripts in `tools/` do this themselves.)

| To change | Edit |
| --- | --- |
| News | `data/news.js` (newest first) |
| People, roles, photos | `data/team.js` (photos go in `assets/team/`, square-ish, about 640px) |
| Papers | `data/pubs.js` (newest first; `tag` is the short venue shown in the pill) |
| Lab members bolded in author lists | `data/members.js` |
| Research areas on the home page | `data/research.js` (each area shows its 4 newest papers automatically) |
| Grants | `data/grants.js` (funded only; pending proposals and amounts stay off the site) |
| Lab norms on the Join us page | `data/norms.js` (bump `version` so people agree again) |

## Publications

Each paper has a main category and at most one more in `topics` (`["health", "agents"]`). The main one colours its dot on the home page and puts it under that area; the Publications page shows both and its filters find a paper by either.
Categories: `health` (AI for Healthcare), `education` (AI for Learning), `agents` (LLM Agents), `data` (Data Science), `collab` (Human-AI Collaboration, including the human-human collaboration studies it grew from), `algo` (AI Algorithms: models and training methods), `community` (Community Engagement: workshops, panels, and SIGs the lab organized), and `other` (fits none of them; gray on the chart).
Categories are assigned automatically from the title, abstract, and venue: an application area named in the title is the main one, then a subject (agents, data science, collaboration), then algorithms. After changing the rules in `tools/pubtools.py`, run `python3 tools/retag.py`. Set `"topicsManual": true` on a paper to keep categories you set by hand.

- **New CV.** `python3 tools/import_cv.py path/to/CV.docx` merges the CV's journal, conference, abstract, and book entries into `data/pubs.js`. Venues and years come from the CV; matching papers keep their full author names, links, and abstracts; new papers get full author names from OpenAlex. Add `--dry-run` to preview.
- **Venue links.** `python3 tools/venue_links.py` finds each published paper's official page (ACM DL, ACL Anthology, IEEE, OpenReview) on Crossref and OpenAlex and makes it the title link. Set `"venueUrl"` by hand for any it can't find.
- **Figures.** `python3 tools/fetch_figures.py` gives papers without a figure the first figure from their arXiv version (papers with no arXiv figure show no image). Set `"imgManual": true` on a paper to keep a figure you picked.
- **Preprints that get accepted.** `python3 tools/update_venues.py` looks up every "Preprint" on OpenAlex and, when a published version exists, swaps in the conference or journal name and year (the preprint details stay under `pre`). `.github/workflows/update-venues.yml` runs it every Monday once the repo is on GitHub, commits any change, and redeploys.

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
