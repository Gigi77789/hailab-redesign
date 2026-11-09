# NEU HAI website

Static site for the Human-Centered AI Lab at Northeastern, built with [Astro](https://astro.build). Every page is rendered to plain HTML at build time; a small script adds the light and dark switch, the home page chart and research areas, the photo wall, and the publication search.

## Site editor (for lab members)

`/admin/` is an editing page for people who don't want to touch files: lab members, papers (with research areas and a teaser image), and news. It is published with the site (`<site>/admin/`); members sign in there and their saves change the site. `<site>/admin/?demo` is a demo with no sign-in: every feature works, but saves stay in the browser and vanish on reload. `demo: true` in `src/data/editor.yaml` makes the published editor demo-only.

How it works:

- Each person signs in with their own GitHub token (classic token, `public_repo` scope; the sign-in page links to a pre-filled form). They need write access to the repository: add them as a collaborator, or, once the repository moves to the `neuhai` organization, to a team there.
- Every save reads the newest data file from GitHub, applies that one change, and writes it back as one commit (with any uploaded picture), so two people editing at once don't overwrite each other. Every change is in the repository history and can be reverted.
- The push starts `.github/workflows/deploy.yml`, which rebuilds and republishes the site a minute or two later. A save that leaves a data file the build rejects is not published, and the workflow run shows why.
- The editor only talks to GitHub, never to the web host. When the site moves to its permanent address, change the last step of `deploy.yml` to upload there, and `site` in `src/data/editor.yaml`.
- `src/data/editor.yaml` holds the repository, branch, and public address. The research areas papers can be tagged with come from `src/data/categories.yaml`.
- Images uploaded through the editor are shrunk in the browser (portraits cropped square to 640px, teasers to 1200px wide) and saved as `public/assets/team/<name>-<hash>.jpg` or `public/assets/papers/<title>-<hash>.jpg`. Papers edited there get `topics_manual` / `preview_manual`, so the weekly update keeps their areas and image.

Try it without touching GitHub: `npm run build && python3 tools/admin_server.py` serves the site with the editor in local test mode at http://127.0.0.1:8790/admin/; saves change the files in this folder (only the editor's data files and images under `public/assets/`) and rebuild the site. `python3 tools/admin_server.py DIR PORT` does the same for a copy.

The editor writes `team.yaml` and `news.yaml` in one fixed layout (`src/lib/editor-files.ts`) and `papers.bib` exactly as the Python tools do (`src/lib/papers-io.ts`), so a save changes only the lines it edits.

## Edit content

Every update is a change to one file in `src/data/`, by hand or through the editor. Within a year, papers appear in their order in `papers.bib`; newer years come first. The build checks these files and stops with a message naming the file and entry if something is missing or misspelled.

| To change | Edit |
| --- | --- |
| Papers | `src/data/papers.bib` (BibTeX, newest first; field notes at the top of the file) |
| News | `src/data/news.yaml` (newest first; the home page shows all of it in its Latest news box) |
| People, roles, photos, short intros | `src/data/team.yaml` (`group`: faculty, phd, ra, visiting, alumni; photos go in `public/assets/team/`, square, about 640px; `bio` is one short sentence). Everyone listed is bolded in author lists; faculty, PhD students, and research assistants appear on the home page. |
| Links on author names (Publications) | lab members: `url` in `team.yaml` (and `aliases` for other names they publish under); collaborators: `src/data/authors.yaml` |
| Research areas on the home page | `src/data/research.yaml` (each area shows its 4 newest papers automatically) |
| Lab culture photo wall | `src/data/culture.yaml` (photos go in `public/assets/culture/`) |
| Lab norms on the Join us page | `src/data/norms.yaml` (change `version` so people agree again) |
| Grants | `src/data/grants.yaml` (funded only; pending proposals and amounts stay off the site) |
| Category names and colours | `src/data/categories.yaml` (colours in `src/styles/site.css`) |
| Page text (lab statement, Join us, headings) | `src/pages/*.astro` |

## Publications

`src/data/papers.bib` is ordinary BibTeX, so an entry pasted from ACM, ACL Anthology, dblp or Google Scholar works once it has `abbr` (the short venue in the pill, e.g. `CHI 2026`) and `topics`. `python3 tools/retag.py` fills in topics for entries without them.

Each paper has a main category and at most one more in `topics` (`health, hac`). The main one colours its dot on the home page and puts it under that area; the Publications page shows both and its filters find a paper by either.
Categories: `health` (AI for Healthcare), `education` (AI for Learning), `hac` (Human-Agent Collaboration: people working and talking with LLM agents, chatbots, and voice assistants), `collab` (Human-AI Collaboration: people working with AI, including data science work and the human-human collaboration studies it grew from), `algo` (LLMs and AI Agents: building and training language models and agents, including agents that simulate real users), and `community` (Community Engagement: workshops, panels, and SIGs the lab organized). A paper that fits none of them goes to `collab` (`algo` at an ML venue).
Categories are assigned automatically from the title, abstract, and venue: an application area named in the title is the main one, then a subject (human-agent work, collaboration), then models and agents. After changing the rules in `tools/pubtools.py`, run `python3 tools/retag.py`. Set `topics_manual = {true}` on a paper to keep categories you set by hand.

The scripts in `tools/` keep the list current (they need Python 3 and `pip install pyyaml`):

- **New papers.** `python3 tools/find_papers.py` looks up Dakuo, the research scientists, and the PhD students on OpenAlex, by the `orcid` or `openalex` id in `team.yaml`, and adds papers by Dakuo or by at least two of them that `papers.bib` doesn't list. `--dry-run` only lists them; `--suggest-ids` finds OpenAlex ids for members who have none. A rejected paper goes in `tools/ignored_papers.txt` so it isn't proposed again.
- **Acceptances you know about.** `python3 tools/accept.py "NeurIPS 2026" lu2026firefly "SpanUQ"` marks papers (by BibTeX key or title start) as accepted, with `--venue "full venue name"`; `--openalex W...` first adds a paper that isn't listed yet. The preprint details stay in `preprint_venue` and `preprint_year`.
- **New CV.** `python3 tools/import_cv.py path/to/CV.docx` merges the CV's journal, conference, abstract, and book entries. Venues and years come from the CV; matching papers keep their full author names, links, and abstracts; new papers get full author names from OpenAlex. Add `--dry-run` to preview.
- **Preprints that get accepted.** `python3 tools/update_venues.py` looks up every "Preprint" on OpenAlex and, when a published version exists, swaps in the conference or journal name and year.
- **Venue links.** `python3 tools/venue_links.py` finds each published paper's official page (ACM DL, ACL Anthology, IEEE, OpenReview) on Crossref and OpenAlex and makes it the `url`. Set `url` and `url_manual = {true}` by hand for any it can't find.
- **Figures.** `python3 tools/fetch_figures.py` gives papers without a figure the teaser or first figure from their arXiv version. `python3 tools/pdf_figures.py` then looks at the first page of each remaining paper's open PDF and cuts out the graphic above the "Figure 1" caption (needs `pip install pymupdf`); check the new images in `public/assets/papers/`, then run it with `--apply`. Set `preview_manual = {true}` on a paper to keep a figure you picked.

Three GitHub workflows run the site: `deploy.yml` rebuilds and republishes it whenever `main` changes; `update-venues.yml` runs the preprint, venue link, and figure scripts every Monday, commits what changed, and republishes; `find-papers.yml` runs `find_papers.py` every Monday and opens a pull request with the papers it found, for someone to check before merging. Opening that pull request needs "Allow GitHub Actions to create and approve pull requests" (Settings > Actions > General).

## Addresses

Each page is a folder (`dist/people/index.html`) and is linked without `.html`, as `/people`. Links inside the site go through `url()` in `src/lib/data.ts`, which adds the sub-path the site is served under. The old addresses (`people.html`, `publications.html`, ...) are small files in `public/` that forward to the new ones, keeping `?query` and `#section`.

## Preview locally

```bash
npm install
npm run dev        # http://localhost:4321, reloads on every change
npm run build      # the finished site in dist/
npm run preview    # serve dist/ at http://localhost:4321 in the background; npx astro preview stop ends it
```

## Deploy

**Draft for review.** `sh tools/deploy.sh` builds a copy with a "Draft redesign" banner and a noindex tag under `/<repo name>/`, then force-pushes it to this repo's `gh-pages` branch, which GitHub Pages serves. Design versions already there (`v1/`, `v2/`, ...) are kept. `deploy.yml` runs it on every change to `main`.

**Going live.** Run `npm run build` and copy the contents of `dist/` to the repo that serves hailab.io (or any static host). Set `SITE_BASE=/path/` when building for a host that serves the site under a sub-path.
