# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Static website for the NEU HAI (Human-Centered AI) Lab at Northeastern, built with Astro: pages are rendered to plain HTML at build time from data files, plus one browser script for the light and dark switch, motion and interactivity, and a browser-based site editor (`/admin/`) that commits data changes to GitHub. Python 3 scripts in `tools/` maintain the publication list. `README.md` is the maintainer guide for content edits and the editor; read it before changing data or tooling. There are no tests or linters: `npx astro build` validating every data file is the check.

## Commands

```bash
npm run dev                              # dev server, http://localhost:4321
npx astro build                          # build to dist/; fails on any invalid data file
DRAFT=1 SITE_BASE=/hailab-redesign/ npx astro build   # the review copy: banner, noindex, sub-path
sh tools/deploy.sh                       # build the review copy and force-push it to gh-pages (keeps v1/, v2/...)
npm run build && python3 tools/admin_server.py   # site editor in local test mode, http://127.0.0.1:8790/admin/
python3 tools/retag.py                   # recompute paper categories (offline; a no-op run must leave papers.bib unchanged)
python3 tools/find_papers.py --dry-run   # new papers by Dakuo, research scientists and PhD students on OpenAlex
python3 tools/accept.py "NeurIPS 2026" KEY... [--venue ...] [--openalex W...]   # mark known acceptances
python3 tools/update_venues.py --dry-run # preprints that now have a published version
python3 tools/venue_links.py             # official venue links (Crossref/OpenAlex/OpenReview)
python3 tools/fetch_figures.py           # figures from arXiv HTML into public/assets/papers/
python3 tools/pdf_figures.py             # Figure 1 from open PDFs (needs pymupdf); review, then --apply
python3 tools/import_cv.py CV.docx --dry-run
```

Python tools need `pyyaml` and make rate-limited network calls (OpenAlex, Crossref, arXiv), so they are slow.

## Architecture

**Data (`src/data/`).** Papers are BibTeX (`papers.bib`); everything else is YAML (`team`, `news`, `grants`, `norms`, `research`, `culture`, `categories`, `editor`). `src/lib/data.ts` imports each file with `?raw`, parses it, validates it with zod, and exports typed constants (`PAPERS`, `MEMBERS`, `CULTURE`...) plus helpers (`isMember`, `url`). Validation errors name the file and entry; add a check there rather than letting a page render a hole. `src/pages/data/[file].ts` publishes `team.yaml`, `news.yaml` and `papers.bib` as they are, for the editor's demo mode.

**BibTeX is handled in three places that must agree:** `tools/bib.py` + `tools/pubtools.py` (`load_pubs`/`save_pubs`, used by every Python tool), `src/lib/bib.ts` (the reader the site build uses), and `src/lib/papers-io.ts` (the editor's reader and writer, a line-for-line copy of the Python mapping and writer). All of them work on the same short-key records (`y t a v tag kind topics abs venueUrl links img pre ...`, documented at the top of `pubtools.py`); unknown BibTeX fields ride along in `extra` and are written back unchanged. The writer escapes `& % # _ $ { } ~` and runs of `-` so a load and save round trip is lossless. After touching any of them, check that `python3 tools/retag.py` leaves `papers.bib` byte-identical and that `papers-io.ts` round-trips it byte-identically too. Supported link fields are `url` (publisher page) plus `arxiv pdf website code video dataset slides`; publisher labels ("ACM DL", "ACL Anthology") are derived from `url` in `data.ts`, not stored.

**People.** `team.yaml` has a `director` and `members` with `group`: faculty, phd, ra, visiting, alumni. Faculty, PhD students and research assistants are lab members (home page faces); visiting students are listed only on the Lab members page. Everyone in the file (and their `aliases`) is bolded in author lists (`isMember`, nicknames stripped); author names link to members' `url` and to collaborators' sites in `authors.yaml` (`authorUrl`). `find_papers.py` searches the director, faculty and PhD students only.

**Categories.** `categories.yaml` is the single list of keys, display names and chart order, read by the site, the editor and `pubtools.py`; the CSS colours `--t-<key>` in `src/styles/site.css` (light and dark) follow that order, and `pubtools.py` (`RULES`, `SIGNALS`, `classify`) holds the rules that assign them.

**Pages and script.** `src/layouts/Base.astro` is the shared frame; an inline script sets `data-theme` before paint. `src/pages/*.astro` render everything server-side using `src/components/`. `src/scripts/site.js` runs per page based on `data-page` on `<main>`: the home chart reads paper data from the inline `#field-data` JSON; the research areas, photo wall, lightbox and publication filters work on the rendered markup. Asset paths in data (`assets/...`) live under `public/` and must go through `url()` so the `SITE_BASE` sub-path applies. Pages build as folders (`build.format: "directory"`, `people/index.html`) and are linked without `.html` or a trailing slash: `url("people")`, `url("")` for home; `Base.astro` derives the current nav item from the path. `public/<page>.html` files forward the old `.html` addresses, keeping query and hash.

**Site editor.** `src/pages/admin.astro` + `src/scripts/admin.js` (bundled by Astro, so it imports `yaml`, `papers-io.ts` and the YAML config). It reads and writes `src/data/team.yaml`, `news.yaml`, `papers.bib` and images under `public/assets/` through the GitHub API (one commit per save, retried on conflicts), through `tools/admin_server.py` in local test mode, or in memory in demo mode. YAML is written in one fixed layout by `src/lib/editor-files.ts`; hand edits to those files are fine, and the editor's next save rewrites them in that layout. The editor lives at `/admin/`, so it reaches the site's files at `../`.

**Whitespace.** Astro 7 defaults to JSX whitespace rules; `astro.config.mjs` sets `compressHTML: true` so whitespace between inline elements survives as in plain HTML. Inside `{...}` expressions whitespace is still trimmed: write `{" "}` where a space must render.

**Automation.** `deploy.yml` rebuilds and runs `deploy.sh` on every push to `main` (editor saves, merged PRs). `update-venues.yml` (weekly) runs `update_venues.py`, `venue_links.py`, `fetch_figures.py`, builds, commits and deploys itself (its own pushes don't trigger `deploy.yml`). `find-papers.yml` (weekly) opens or updates a pull request on the `find-papers` branch; rejected papers go in `tools/ignored_papers.txt`.

## Conventions

- `src/data/papers.bib` is site data that Claude and the scripts may edit, unlike `.bib` files elsewhere.
- Grants list funded awards only, no pending proposals or dollar amounts. `norms.yaml` deliberately omits internal links (Slack, Notion, Calendly); keep them off the public site. Only add culture photos everyone in them is happy to have online.
