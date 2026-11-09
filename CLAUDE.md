# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Static website for the NEU HAI (Human-Centered AI) Lab at Northeastern, built with Astro: pages are rendered to plain HTML at build time from data files, plus one browser script for motion and interactivity. Python 3 scripts in `tools/` maintain the publication list. `README.md` is the maintainer guide for content edits; read it before changing data or tooling. There are no tests or linters: `npx astro build` validating every data file is the check.

## Commands

```bash
npm run dev                              # dev server, http://localhost:4321
npx astro build                          # build to dist/; fails on any invalid data file
DRAFT=1 SITE_BASE=/hailab-redesign/ npx astro build   # the review copy: banner, noindex, sub-path
sh tools/deploy.sh                       # build the review copy and force-push it to gh-pages
python3 tools/retag.py                   # recompute paper categories (offline; a no-op run must leave papers.bib unchanged)
python3 tools/find_papers.py --dry-run   # new papers by Dakuo and core members on OpenAlex
python3 tools/accept.py "NeurIPS 2026" KEY... [--venue ...] [--openalex W...]   # mark known acceptances
python3 tools/update_venues.py --dry-run # preprints that now have a published version
python3 tools/venue_links.py             # official venue links (Crossref/OpenAlex/OpenReview)
python3 tools/fetch_figures.py           # figures from arXiv HTML into public/assets/papers/
python3 tools/import_cv.py CV.docx --dry-run
```

Python tools need `pyyaml` and make rate-limited network calls (OpenAlex, Crossref, arXiv), so they are slow.

## Architecture

**Data (`src/data/`).** Papers are BibTeX (`papers.bib`); everything else is YAML (`team`, `news`, `grants`, `norms`, `research`, `featured`, `categories`). `src/lib/data.ts` imports each file with `?raw`, parses it, validates it with zod, and exports typed constants (`PAPERS`, `MEMBERS`, `GRANTS`...) plus helpers (`isMember`, `url`). Validation errors name the file and entry; add a check there rather than letting a page render a hole. `featured.yaml` refers to papers by BibTeX key.

**BibTeX is read in two places that must agree:** `tools/bib.py` (read and write, used by every Python tool) and `src/lib/bib.ts` (read, used by the build). Both decode LaTeX accents and escapes to Unicode; `VERBATIM` fields (urls, arxiv, preview paths) are never decoded or escaped. The writer escapes `& % # _ $ { } ~` and runs of `-` so a load and save round trip is lossless; after touching either file, check that `python3 tools/retag.py` leaves `papers.bib` byte-identical.

**Paper fields.** In Python, `tools/pubtools.py` `load_pubs()`/`save_pubs()` map BibTeX entries to dicts with short keys (`y t a v tag kind topics abs venueUrl links img pre ...`, documented at the top of that file) and back; unknown BibTeX fields ride along in `extra` and are written back unchanged. The site-specific BibTeX fields (`abbr`, `topics`, `preview`, `*_manual`, `preprint_*`) are documented in the header that `save_pubs()` writes at the top of `papers.bib`. Publisher link labels ("ACM DL", "ACL Anthology") are derived from the `url` in `data.ts`, not stored.

**Categories.** `categories.yaml` is the single list of keys, display names and chart order; the CSS colours `--t-<key>` in `src/styles/site.css` follow that order, and `tools/pubtools.py` (`RULES`, `classify`) holds the rules that assign them.

**Pages and script.** `src/layouts/Base.astro` is the shared frame; `src/pages/*.astro` render everything server-side using `src/components/`. `src/scripts/site.js` runs per page based on `data-page` on `<main>`: the home chart reads paper data from the inline `#field-data` JSON; the explorer, publication filters and norms agreement work on the rendered markup through `data-*` attributes. Asset paths in data (`assets/...`) live under `public/` and must go through `url()` so the `SITE_BASE` sub-path applies.

**Whitespace.** Astro 7 defaults to JSX whitespace rules; `astro.config.mjs` sets `compressHTML: true` so whitespace between inline elements survives as in plain HTML. Inside `{...}` expressions whitespace is still trimmed: write `{" "}` where a space must render (e.g. `{k}{" "}<b>{n}</b>`).

**Automation.** `.github/workflows/update-venues.yml` (weekly) runs `update_venues.py`, `venue_links.py`, `fetch_figures.py`, builds, commits `papers.bib` and `public/assets/papers`, and runs `deploy.sh`. `.github/workflows/find-papers.yml` (weekly) runs `find_papers.py` and opens or updates a pull request on the `find-papers` branch; rejected papers go in `tools/ignored_papers.txt`.

## Conventions

- `src/data/papers.bib` is site data that Claude and the scripts may edit, unlike `.bib` files elsewhere.
- Design is a single dark theme defined by CSS custom properties at the top of `src/styles/site.css`; there is no light mode.
- Grants list funded awards only, no pending proposals or dollar amounts. `norms.yaml` deliberately omits internal links (Slack, Notion, Calendly); keep them off the public site.
