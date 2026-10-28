"""Generates the site's HTML pages from one shared header/footer.
Run from the repo root:  python3 tools/pages.py
Edit page bodies below; edit people, papers, news and research areas in data/*.js, then run this
script again: every page stamps its CSS, JS and data files with a content hash, so browsers load the new version.

`python3 tools/pages.py --preview DIR` writes a review copy to DIR instead: every page carries a
"draft redesign" note, and index.html is written as a page fragment for hosts that add their own
<html>/<head>/<body> skeleton (Claude artifacts).

`python3 tools/pages.py --draft DIR` writes full pages with the same note plus a noindex tag,
for a public review copy (GitHub Pages). tools/deploy.sh uses it."""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PREVIEW = None   # output dir for a review copy
FRAGMENT = False # index.html without a document skeleton (artifact hosts add their own)
for flag in ("--preview", "--draft"):
    if flag in sys.argv:
        PREVIEW = pathlib.Path(sys.argv[sys.argv.index(flag) + 1]).resolve()
        FRAGMENT = flag == "--preview"

def v(path):
    """Asset URL with a content stamp, so browsers fetch the new file whenever it changes."""
    import hashlib
    f = ROOT / path
    return f"{path}?v={hashlib.md5(f.read_bytes()).hexdigest()[:8]}" if f.exists() else path

NAV = [("people.html", "People"), ("publications.html", "Publications"), ("grants.html", "Grants"), ("news.html", "News"), ("join.html", "Join us")]

def head_tags(full, desc):
    robots = '\n<meta name="robots" content="noindex, nofollow">' if PREVIEW else ""
    return f"""<title>{full}</title>{robots}
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="{desc}">
<meta property="og:title" content="{full}">
<meta property="og:description" content="{desc}">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Michroma&display=swap">
<link rel="stylesheet" href="{v('css/site.css')}">"""

def header(current):
    cur = ' aria-current="page"'
    links = "\n      ".join(
        f'<a href="{h}"{cur if h == current else ""}>{t}</a>' for h, t in NAV)
    note = ""
    if PREVIEW:
        note = """
<div class="draft-note"><div class="wrap">Draft redesign for review. The lab’s current site is <a href="https://hailab.io/">hailab.io</a>.</div></div>"""
    return f"""<a class="skip" href="#main">Skip to content</a>{note}
<header class="site-header night">
  <div class="wrap">
    <a class="lockup" href="index.html" aria-label="NEU HAI home">
      <span class="lockup-mark">NEU HAI</span>
      <span class="lockup-name">Human-Centered AI Lab<br>Northeastern University</span>
    </a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav">Menu</button>
    <nav class="nav" id="nav" aria-label="Main">
      {links}
    </nav>
  </div>
</header>"""

FOOTER = """<footer class="site-footer">
  <div class="wrap">
    <div>
      <span class="lockup-mark">NEU HAI</span>
      <address>Human-Centered AI Lab<br>Khoury College of Computer Sciences and College of Arts, Media and Design<br>Northeastern University, Boston, Massachusetts</address>
    </div>
    <nav class="foot-links" aria-label="Elsewhere">
      <a href="mailto:d.wang@northeastern.edu">d.wang@northeastern.edu</a>
      <a href="https://github.com/neuhai">GitHub</a>
      <a href="https://twitter.com/dakuowang">X</a>
      <a href="https://www.northeastern.edu/">Northeastern</a>
    </nav>
  </div>
</footer>"""

def page(file, title, desc, slug, main, scripts=("team", "pubs", "members", "news", "research", "grants")):
    full = "NEU HAI" if title is None else f"{title} | NEU HAI"
    s = "\n".join(f'<script src="{v(f"data/{n}.js")}"></script>' for n in scripts)
    body = f"""{header(file)}
<main id="main" data-page="{slug}">
{main.strip()}
</main>
{FOOTER}
{s}
<script src="{v('js/site.js')}"></script>"""
    if FRAGMENT and file == "index.html":
        html = f"{head_tags(full, desc)}\n{body}\n"
    else:
        html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{head_tags(full, desc)}
</head>
<body>
{body}
</body>
</html>
"""
    out = (PREVIEW or ROOT) / file
    out.write_text(html)
    print("wrote", out)

SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
SPEAKER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>'

page("index.html", None,
 "NEU HAI is the Human-Centered AI Lab at Northeastern University. We design, build, and evaluate AI systems with the people who use them, in health care, education, and on the web.",
 "home", f"""
<section class="entry night" aria-labelledby="word">
  <canvas class="stars" id="stars" aria-hidden="true"></canvas>
  <div class="wrap">
    <div class="status readout" aria-label="Lab location">
      <span><span class="blip"></span>Northeastern University, Boston</span>
      <span>42.3398° N <span class="sep">/</span> 71.0892° W</span>
      <span>Khoury College <span class="sep">+</span> CAMD</span>
      <span>Local time <b id="clock">--:--:--</b></span>
    </div>
    <h1 class="entry-word" id="word" aria-label="NEU HAI"><span aria-hidden="true"><span class="wd"><span class="ch" style="--i:0">N</span><span class="ch" style="--i:1">E</span><span class="ch" style="--i:2">U</span></span> <span class="wd"><span class="ch" style="--i:3">H</span><span class="ch" style="--i:4">A</span><span class="ch" style="--i:5">I</span></span></span></h1>
    <div class="entry-lede">
      <div class="entry-pron">
        <span class="ipa" aria-label="pronounced new-high">/nuː haɪ/</span>
        <span class="respell">“new-hi”</span>
        <button class="say" type="button" aria-label="Play pronunciation">{SPEAKER_ICON}Listen</button>
      </div>
      <p class="thesis">Human-centered AI, designed and tested with the people who use it.</p>
      <div class="actions">
        <a class="btn on-night" href="#research-h">See our research</a>
        <a class="btn ghost" href="join.html">Join the lab</a>
      </div>
    </div>
    <figure class="field hud" id="field">
      <div class="field-top readout">
        <span>Publication field</span>
        <span id="aim" aria-hidden="true">Point at the field</span>
      </div>
      <div class="field-keys" id="legend" role="group" aria-label="Highlight a research area">
        <button type="button" class="fk k-health" data-topic="health" aria-pressed="false"><span class="key"></span>AI for Healthcare</button>
        <button type="button" class="fk k-agents" data-topic="agents" aria-pressed="false"><span class="key"></span>LLM Agents</button>
        <button type="button" class="fk k-education" data-topic="education" aria-pressed="false"><span class="key"></span>AI for Learning</button>
        <button type="button" class="fk k-data" data-topic="data" aria-pressed="false"><span class="key"></span>Data Science</button>
        <button type="button" class="fk k-collab" data-topic="collab" aria-pressed="false"><span class="key"></span>Human-AI Collaboration</button>
        <button type="button" class="fk k-algo" data-topic="algo" aria-pressed="false"><span class="key"></span>AI Algorithms</button>
        <button type="button" class="fk k-community" data-topic="community" aria-pressed="false"><span class="key"></span>Community Engagement</button>
        <button type="button" class="fk k-other" data-topic="other" aria-pressed="false"><span class="key"></span>Other</button>
      </div>
      <div id="field-plot" role="img" aria-label="Dot chart of the lab’s publications by year, one dot per paper, colored by research area."></div>
      <figcaption id="field-cap" aria-live="polite">One dot per paper. Point at a dot to read it.</figcaption>
      <div class="tip" id="tip" role="status"></div>
    </figure>
  </div>
</section>

<section class="section define" aria-labelledby="define-h">
  <div class="wrap define-grid">
    <div>
      <h2 class="define-h" id="define-h"><span class="hw">NEU HAI</span> <span class="pos">noun, /nuː haɪ/</span></h2>
      <ol class="senses" id="senses">
        <li>The Human-Centered Artificial Intelligence Lab at Northeastern University, led by <a href="people.html">Prof. Dakuo Wang</a> and based in the Khoury College of Computer Sciences and the College of Arts, Media and Design.</li>
        <li>A way of building AI with the people who will use it: study how clinicians, teachers, families, and everyday users work, design systems around that work, and test them where it happens.</li>
      </ol>
    </div>
    <aside class="latest" aria-labelledby="latest-h">
      <h2 id="latest-h">Latest news</h2>
      <ol id="latest"></ol>
      <a class="more" href="news.html">All news</a>
    </aside>
  </div>
</section>

<section class="section tint" aria-labelledby="research-h">
  <div class="wrap">
    <div class="section-head">
      <div><span class="readout" data-readout="areas"></span><h2 id="research-h">What we work on</h2></div>
      <a class="more" href="publications.html">All publications</a>
    </div>
    <div class="explorer" id="explorer"></div>
  </div>
</section>

<section class="section" aria-labelledby="sel-h">
  <div class="wrap">
    <div class="section-head">
      <div><span class="readout" data-readout="recent"></span><h2 id="sel-h">Recent papers</h2></div>
      <a class="more" href="publications.html">All publications</a>
    </div>
    <ol class="selected" id="selected"></ol>
  </div>
</section>

<section class="section tint" aria-labelledby="grants-h">
  <div class="wrap">
    <div class="section-head">
      <div><span class="readout" data-readout="grants"></span><h2 id="grants-h">Grants</h2></div>
      <a class="more" href="grants.html">All grants</a>
    </div>
    <ul class="grant-list compact" id="home-grants"></ul>
  </div>
</section>

<section class="section night" aria-labelledby="people-h">
  <div class="wrap">
    <div class="section-head">
      <div><span class="readout" data-readout="people"></span><h2 id="people-h">People</h2></div>
      <a class="more" href="people.html">Visitors and alumni</a>
    </div>
    <ul class="faces home" id="faces"></ul>
  </div>
</section>

<section class="section violet" aria-labelledby="join-h">
  <div class="wrap join-band">
    <div>
      <span class="readout"><span class="blip violet"></span>Status <span class="sep">/</span> recruiting</span>
      <h2 id="join-h">Work with us</h2>
      <p>We take PhD students, postdocs, visiting scholars, and research interns who want to build AI for health care, education, or agents, and test it with real people.</p>
    </div>
    <div class="actions">
      <a class="btn light" href="join.html#norms">Read the lab norms and apply</a>
    </div>
  </div>
</section>
""")

page("people.html", "People",
 "The people of NEU HAI, Northeastern University's Human-Centered AI Lab: faculty, research scientists, PhD students, visitors, and alumni.",
 "people", """
<section class="page-head night">
  <div class="wrap"><h1>People</h1></div>
</section>
<section class="section" style="padding-top:0" aria-label="Lab director">
  <div class="wrap pi" id="pi"></div>
</section>
<section class="section tint">
  <div class="wrap">
    <div class="group">
      <h2 class="subhead">Research scientists and PhD students</h2>
      <ul class="faces" id="core"></ul>
    </div>
    <div class="group">
      <h2 class="subhead">Research assistants and visiting students</h2>
      <ul class="faces small" id="visiting"></ul>
    </div>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <h2 class="subhead">Alumni</h2>
    <ul class="alumni" id="alumni"></ul>
  </div>
</section>
""")

page("publications.html", "Publications",
 "Publications from NEU HAI, the Human-Centered AI Lab at Northeastern University, in HCI, NLP, and health informatics.",
 "publications", f"""
<section class="page-head night">
  <div class="wrap">
    <h1>Publications</h1>
    <p>Papers from the lab and its collaborators in HCI, natural language processing, and health informatics.</p>
  </div>
</section>
<section class="wrap" style="padding-bottom:96px">
  <div class="pubs-tools">
    <label class="search">
      <span class="visually-hidden">Search publications</span>
      {SEARCH_ICON}
      <input id="q" type="search" placeholder="Search titles, authors, venues" autocomplete="off">
    </label>
    <div class="filters" id="filters" role="group" aria-label="Filter by topic"></div>
  </div>
  <p class="pubs-status" id="status" aria-live="polite"></p>
  <div id="pubs"></div>
</section>
""", scripts=("pubs", "members"))

page("grants.html", "Grants",
 "Grants that fund NEU HAI's research, from NIH, NSF, Microsoft Research, and Northeastern University.",
 "grants", """
<section class="page-head night">
  <div class="wrap">
    <h1>Grants</h1>
    <p>Our work is funded by federal, industry, and university grants. These are the projects they support.</p>
    <p class="readout" id="grant-sum" style="margin-top:22px"></p>
  </div>
</section>
<section class="wrap" style="padding-bottom:96px">
  <h2 class="subhead">External grants</h2>
  <ul class="grant-list" id="grants-ext"></ul>
  <h2 class="subhead" style="margin-top:64px">Internal and partner grants</h2>
  <ul class="grant-list" id="grants-int"></ul>
</section>
""", scripts=("grants",))

page("news.html", "News",
 "News from NEU HAI: accepted papers, talks, visitors, and grants.",
 "news", """
<section class="page-head night">
  <div class="wrap"><h1>News</h1></div>
</section>
<section class="wrap" style="padding-bottom:96px">
  <ol class="news-list" id="news"></ol>
</section>
""", scripts=("news",))

page("join.html", "Join us",
 "Join NEU HAI: read the lab norms, then apply as a PhD student, postdoc, visiting scholar, research scientist, or research intern.",
 "join", """
<section class="page-head night">
  <div class="wrap">
    <h1>Join us</h1>
    <p>We work on educational AI, health care AI, and LLM agents, often on NSF, NIH, and industry-sponsored projects. Everyone in the lab works by a shared set of norms, so we ask you to read them before you apply.</p>
    <ol class="steps" aria-label="How to apply">
      <li><a href="#norms"><span class="readout">Step 1</span>Read the lab norms</a></li>
      <li><a href="#agree-box"><span class="readout">Step 2</span>Agree to follow them</a></li>
      <li><a href="#agree-box"><span class="readout">Step 3</span>Apply through the form</a></li>
    </ol>
  </div>
</section>

<section class="wrap norms" id="norms" aria-labelledby="norms-h">
  <div class="norms-head">
    <span class="readout" id="norms-version">Lab norms</span>
    <h2 id="norms-h">NEU-HAI lab norms</h2>
    <p id="norms-credit"></p>
  </div>
  <div class="norms-body" id="norms-body"></div>

  <div class="agree hud" id="agree-box" aria-labelledby="agree-h">
    <h2 class="visually-hidden" id="agree-h">Agree and apply</h2>
    <label class="agree-check" for="agree">
      <input type="checkbox" id="agree">
      <span>I have read the NEU-HAI lab norms <span id="agree-version"></span>and agree to follow them.</span>
    </label>
    <div class="agree-actions">
      <a class="btn primary" id="apply-btn" href="https://forms.gle/3Qk8DM2HKJmiBVP76" aria-disabled="true">Apply through the form</a>
      <p class="agree-hint" id="agree-hint" aria-live="polite">Check the box to unlock the application form.</p>
    </div>
  </div>
</section>

<section class="wrap" style="padding-bottom:96px">
  <h2 class="subhead" style="margin-top:72px">Who we take, and when</h2>
  <ul class="roles">
    <li>
      <h2>PhD students</h2>
      <div>
        <p>Apply through <a href="https://www.khoury.northeastern.edu/apply/">Northeastern’s official application</a>. We contact candidates for Zoom interviews around February and March.</p>
        <p class="when">You don’t need to fill in the form unless you have more to tell us.</p>
      </div>
    </li>
    <li>
      <h2>Postdocs, visiting scholars, and research scientists</h2>
      <div>
        <p>If you hold a doctoral degree and work on educational AI, health care AI, or LLM agents, you can join our sponsored projects. You’ll also mentor students and write proposals, which prepares you for a faculty career.</p>
        <p class="when">Apply through the form any time.</p>
      </div>
    </li>
    <li>
      <h2>Summer research interns</h2>
      <div>
        <p>We look for students who can lead a summer project on their own. We contact candidates for Zoom interviews before May.</p>
        <p class="when">Apply through the form by April 1.</p>
      </div>
    </li>
    <li>
      <h2>Spring and fall research interns</h2>
      <div>
        <p>We contact candidates within a month of the deadline.</p>
        <p class="when">Apply through the form by December 1 for spring, or August 1 for fall.</p>
      </div>
    </li>
  </ul>
  <div class="note contact">
    <p>Questions about joining? Email Bingsheng Yao at <a href="mailto:b.yao@northeastern.edu">b.yao@northeastern.edu</a> <button type="button" class="copy" data-copy="b.yao@northeastern.edu">Copy</button></p>
    <p>The form sends us an email automatically, so there’s no need to email separately.</p>
  </div>
</section>
""", scripts=("norms",))
