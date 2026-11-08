# NEU HAI website

Static site for the Human-Centered AI Lab at Northeastern. No build step, no framework: plain HTML, one stylesheet, one script.

## Site editor (for lab members)

`admin/` is a small editing page for people who don't want to touch files: lab members, papers (with
research areas and a teaser image), and news. It lives at `<site>/admin/`, for version 1
https://gigi77789.github.io/hailab-redesign/v1/admin/.

How it works:

- Each person signs in with their own GitHub token (classic token, `public_repo` scope; the sign-in page links
  to a pre-filled form). They need write access to the repository: add them as a collaborator, or, once the
  repository moves to the `neuhai` organization, to a team there.
- Every save reads the newest data file from GitHub, applies that one change, and writes it back as one commit
  (with any uploaded picture), so two people editing at once don't overwrite each other. Every change is in the
  repository history and can be reverted.
- The push starts `.github/workflows/deploy-v1.yml`, which republishes the site a minute or two later.
- The editor only talks to GitHub, never to the web host. When the site moves to its permanent address,
  change the deploy step in the workflow to upload there, and `site` in `admin/config.js`.
- `admin/config.js` holds the repository, branch, public address, and the research areas papers can be tagged with.
- Images uploaded through the editor are shrunk in the browser (portraits cropped square to 640px,
  teasers to 1200px wide) and saved as `assets/team/<name>-<hash>.jpg` or `assets/papers/<title>-<hash>.jpg`.
  Papers edited there get `topicsManual`/`imgManual`, so the weekly update keeps their areas and image.

Try it without touching GitHub: `python3 tools/admin_server.py` serves the site with the editor in local test
mode at http://127.0.0.1:8790/admin/; saves change the files in this folder (only `data/*.js` and images under
`assets/`) and rebuild the pages. `python3 tools/admin_server.py DIR PORT` does the same for a copy.

The data files are comment lines followed by `window.HAI_X = <JSON>;`, so both the editor and the Python tools
can rewrite them. `node tools/datafile.js data/x.js` turns a hand-edited file back into that form.

## Edit content

Most updates only touch a file in `data/`. After editing one by hand, run `python3 tools/pages.py`: it stamps each page's CSS, JS, and data links with a content hash so browsers load the new version instead of a cached copy. (The scripts in `tools/` do this themselves.)

| To change | Edit |
| --- | --- |
| News | `data/news.js` (newest first) |
| People, roles, photos, short intros | `data/team.js` (`section`: faculty, phd, visiting, alumni; photos go in `assets/team/`, square, about 640px; `bio` is one short sentence) |
| Papers | `data/pubs.js` (newest first; `tag` is the short venue shown in the pill) |
| Lab members bolded in author lists | `data/members.js` |
| Research areas on the home page | `data/research.js` (each area shows its 4 newest papers automatically) |
| Grants (count and award numbers on the home page) | `data/grants.js` (funded only; pending proposals, amounts, and PI roles stay off the site) |
| Lab culture photo wall | `data/culture.js` (photos go in `assets/culture/`) |
| Lab norms on the Join us page | `data/norms.js` (bump `version` so people agree again) |

## Publications

Each paper has a main category and at most one more in `topics` (`["health", "agents"]`). The main one colours its dot on the home page and puts it under that area; the Publications page shows both and its filters find a paper by either.
Categories: `health` (AI for Healthcare), `education` (AI for Learning), `hac` (Human-Agent Collaboration: people working and talking with LLM agents, chatbots, and voice assistants), `collab` (Human-AI Collaboration: people working with AI, including data science work and the human-human collaboration studies it grew from), `algo` (LLMs and AI Agents: building and training language models and agents, including agents that simulate real users), and `community` (Community Engagement: workshops, panels, and SIGs the lab organized). A paper that fits none of them goes to `collab` (`algo` at an ML venue), so there is no Other.
Categories are assigned automatically from the title, abstract, and venue: an application area named in the title is the main one, then a subject (human simulation, data science, collaboration), then algorithms. After changing the rules in `tools/pubtools.py`, run `python3 tools/retag.py`. Set `"topicsManual": true` on a paper to keep categories you set by hand.

- **New CV.** `python3 tools/import_cv.py path/to/CV.docx` merges the CV's journal, conference, abstract, and book entries into `data/pubs.js`. Venues and years come from the CV; matching papers keep their full author names, links, and abstracts; new papers get full author names from OpenAlex. Add `--dry-run` to preview.
- **Venue links.** `python3 tools/venue_links.py` finds each published paper's official page (ACM DL, ACL Anthology, IEEE, OpenReview) on Crossref and OpenAlex and makes it the title link. Set `"venueUrl"` by hand for any it can't find.
- **Figures.** `python3 tools/fetch_figures.py` gives papers without a figure the teaser or first figure from their arXiv version. `python3 tools/pdf_figures.py` then looks at the first page of each remaining paper’s open PDF and cuts out the graphic above the “Figure 1” caption; check the new images in `assets/papers/`, then run it with `--apply`. Papers with neither show no image. Set `"imgManual": true` on a paper to keep a figure you picked.
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
