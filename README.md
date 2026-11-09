# NEU HAI website

Static site for the Human-Centered AI Lab at Northeastern, built with [Astro](https://astro.build). Every page is rendered to plain HTML at build time; a small script adds the animations, the home page chart, and the publication search.

## Edit content

Almost every update is a change to one file in `src/data/`. The build checks these files and stops with a message naming the file and entry if something is missing or misspelled.

| To change | Edit |
| --- | --- |
| Papers | `src/data/papers.bib` (BibTeX, newest first; field notes at the top of the file) |
| News | `src/data/news.yaml` (newest first) |
| People, roles, photos | `src/data/team.yaml` (photos go in `public/assets/team/`, square-ish, about 640px). Everyone listed is bolded in author lists. |
| Research areas on the home page | `src/data/research.yaml` (each area shows its newest papers automatically) |
| "Recent papers" on the home page | `src/data/featured.yaml` (BibTeX keys) |
| Grants | `src/data/grants.yaml` (funded only; pending proposals and amounts stay off the site) |
| Lab norms on the Join us page | `src/data/norms.yaml` (change `version` so people agree again) |
| Category names and colours | `src/data/categories.yaml` (colours in `src/styles/site.css`) |
| Page text (hero, Join us, headings) | `src/pages/*.astro` |

## Publications

`src/data/papers.bib` is ordinary BibTeX, so an entry pasted from ACM, ACL Anthology, dblp or Google Scholar works once it has `abbr` (the short venue in the pill, e.g. `CHI 2026`) and `topics`. `python3 tools/retag.py` fills in topics for entries without them.

Each paper has a main category and at most one more in `topics` (`health, agents`). The main one colours its dot on the home page and puts it under that area; the Publications page shows both and its filters find a paper by either.
Categories: `health` (AI for Healthcare), `education` (AI for Learning), `agents` (LLM Agents for Human Simulation: agents that stand in for real customers, users, and judges), `data` (Data Science), `collab` (Human-AI Collaboration, including people using chatbots and voice assistants and the human-human collaboration studies it grew from), `algo` (AI Algorithms: models and training methods, including for agents and tool use), and `community` (Community Engagement: workshops, panels, and SIGs the lab organized). A paper that fits none of them goes to `collab` (`algo` at an ML venue).
Categories are assigned automatically from the title, abstract, and venue: an application area named in the title is the main one, then a subject (human simulation, data science, collaboration), then algorithms. After changing the rules in `tools/pubtools.py`, run `python3 tools/retag.py`. Set `topics_manual = {true}` on a paper to keep categories you set by hand.

The scripts in `tools/` keep the list current (they need Python 3 and `pip install pyyaml`):

- **New papers.** `python3 tools/find_papers.py` looks up Dakuo and the core members (research scientists and PhD students) on OpenAlex, by the `orcid` or `openalex` id in `team.yaml`, and adds papers by Dakuo or by at least two of them that `papers.bib` doesn't list. Visiting members and alumni are not searched. `--dry-run` only lists them; `--suggest-ids` finds OpenAlex ids for members who have none. A rejected paper goes in `tools/ignored_papers.txt` so it isn't proposed again.
- **New CV.** `python3 tools/import_cv.py path/to/CV.docx` merges the CV's journal, conference, abstract, and book entries. Venues and years come from the CV; matching papers keep their full author names, links, and abstracts; new papers get full author names from OpenAlex. Add `--dry-run` to preview.
- **Preprints that get accepted.** `python3 tools/update_venues.py` looks up every "Preprint" on OpenAlex and, when a published version exists, swaps in the conference or journal name and year (the preprint details stay in `preprint_venue` and `preprint_year`).
- **Venue links.** `python3 tools/venue_links.py` finds each published paper's official page (ACM DL, ACL Anthology, IEEE, OpenReview) on Crossref and OpenAlex and makes it the `url`. Set `url` and `url_manual = {true}` by hand for any it can't find.
- **Figures.** `python3 tools/fetch_figures.py` gives papers without a figure the teaser or first figure from their arXiv version. Set `preview_manual = {true}` on a paper to keep a figure you picked.

Two GitHub workflows run every Monday: `update-venues.yml` runs the last three scripts, commits what changed, and redeploys the review copy; `find-papers.yml` runs `find_papers.py` and opens a pull request with the papers it found, for someone to check before merging. Opening that pull request needs "Allow GitHub Actions to create and approve pull requests" (Settings > Actions > General).

## Preview locally

```bash
npm install
npm run dev        # http://localhost:4321, reloads on every change
npm run build      # the finished site in dist/
npm run preview    # serve dist/ at http://localhost:4321 in the background; npx astro preview stop ends it
```

## Deploy

**Draft for review.** `sh tools/deploy.sh` builds a copy with a "Draft redesign" banner and a noindex tag under `/<repo name>/`, then force-pushes it to this repo's `gh-pages` branch, which GitHub Pages serves. Design versions already there (`v1/`, `v2/`, ...) are kept.

**Going live.** Run `npm run build` and copy the contents of `dist/` to the repo that serves hailab.io (or any static host). Set `SITE_BASE=/path/` when building for a host that serves the site under a sub-path.
