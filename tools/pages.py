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

NAV = [("index.html", "Home"), ("people.html", "Lab members"), ("publications.html", "Publications"), ("culture.html", "Lab culture"), ("news.html", "News"), ("join.html", "Join us")]

def head_tags(full, desc):
    robots = '\n<meta name="robots" content="noindex, nofollow">' if PREVIEW else ""
    # the theme is set before the page paints: the visitor's saved choice, else their system setting
    theme = '<script>(function(){var t;try{t=localStorage.getItem("hai-theme")}catch(e){}if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t})()</script>'
    return f"""<title>{full}</title>{robots}
{theme}
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="{desc}">
<meta property="og:title" content="{full}">
<meta property="og:description" content="{desc}">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap">
<link rel="stylesheet" href="{v('css/site.css')}">"""

def header(current):
    cur = ' aria-current="page"'
    links = "\n      ".join(
        f'<a href="{h}"{cur if h == current else ""}>{t}</a>' for h, t in NAV)
    note = ""
    if PREVIEW:
        note = """
<div class="draft-note"><div class="wrap">Draft redesign for review. The lab’s current site is <a href="https://hailab.io/">hailab.io</a>.</div></div>"""
    return f"""<a class="skip" href="#main">Skip to content</a><div class="scroll-line" aria-hidden="true"></div>{note}
<header class="site-header">
  <div class="wrap">
    <a class="lockup" href="index.html" aria-label="NEU HAI home">
      <span class="lockup-mark">NEU HAI</span>
      <span class="lockup-name">Human-Centered AI Lab<br>Northeastern University</span>
    </a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav">Menu</button>
    <nav class="nav" id="nav" aria-label="Main">
      {links}
    </nav>
    <button class="theme-toggle" type="button" aria-label="Dark mode" aria-pressed="false" title="Dark mode"><svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/></svg><svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg></button>
  </div>
</header>"""

FOOTER = """<footer class="site-footer">
  <div class="wrap">
    <div>
      <span class="lockup-mark">NEU HAI</span>
      <address>Human-Centered AI Lab<br>Northeastern University, Boston, Massachusetts</address>
    </div>
    <nav class="foot-links" aria-label="Elsewhere">
      <a href="mailto:d.wang@northeastern.edu">d.wang@northeastern.edu</a>
      <a href="https://github.com/neuhai">GitHub</a>
      <a href="https://twitter.com/dakuowang">X</a>
      <a href="https://www.northeastern.edu/">Northeastern</a>
    </nav>
  </div>
</footer>"""

def page(file, title, desc, slug, main, scripts=("team", "pubs", "members", "news", "research")):
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

page("index.html", None,
 "NEU HAI is the Human-Centered AI Lab at Northeastern University, led by Prof. Dakuo Wang. We study how people and AI work together, and design AI systems that collaborate with people in health care, education, and data science.",
 "home", f"""
<h1 class="visually-hidden">NEU HAI, the Human-Centered AI Lab at Northeastern University</h1>
<section class="intro" aria-label="About the lab">
  <canvas class="mesh" id="mesh" aria-hidden="true"></canvas>
  <div class="wrap">
    <p class="intro-lead"><span class="l1">Designing AI systems and interactions</span> <span class="l2">that work effectively for and with people.</span></p>
  </div>
</section>

<section class="overview" aria-label="Publications and news">
  <div class="wrap overview-grid">
    <div>
      <div class="block-head">
        <h2 id="pubs-h">Publications</h2>
        <a class="more" href="publications.html">All publications</a>
      </div>
      <figure class="field" id="field" aria-labelledby="pubs-h">
        <div class="field-keys" id="legend" role="group" aria-label="Highlight a research area">
          <button type="button" class="fk k-health" data-topic="health" aria-pressed="false"><span class="key"></span>AI for Healthcare</button>
          <button type="button" class="fk k-algo" data-topic="algo" aria-pressed="false"><span class="key"></span>LLMs and AI Agents</button>
          <button type="button" class="fk k-education" data-topic="education" aria-pressed="false"><span class="key"></span>AI for Learning</button>
          <button type="button" class="fk k-hac" data-topic="hac" aria-pressed="false"><span class="key"></span>Human-Agent Collaboration</button>
          <button type="button" class="fk k-collab" data-topic="collab" aria-pressed="false"><span class="key"></span>Human-AI Collaboration</button>
          <button type="button" class="fk k-community" data-topic="community" aria-pressed="false"><span class="key"></span>Community Engagement</button>
        </div>
        <div class="field-plot" id="field-plot" role="img" aria-label="Dot chart of the lab’s publications by year, one dot per paper, colored by main research area."></div>
        <div class="tip" id="tip" role="status"></div>
      </figure>
    </div>
    <aside class="latest" aria-labelledby="latest-h">
      <div class="block-head">
        <h2 id="latest-h">Latest news</h2>
        <a class="more" href="news.html">All news</a>
      </div>
      <ol class="news-scroll" id="latest" tabindex="0" aria-label="All news, newest first"></ol>
    </aside>
  </div>
</section>

<section class="section band" aria-labelledby="research-h">
  <div class="wrap">
    <div class="block-head"><h2 id="research-h">Research areas</h2></div>
    <div class="explorer" id="explorer"></div>
  </div>
</section>


<section class="section" aria-labelledby="people-h">
  <div class="wrap">
    <div class="block-head">
      <h2 id="people-h">Lab members</h2>
      <a class="more" href="people.html">Visitors and alumni</a>
    </div>
    <ul class="faces home" id="faces"></ul>
  </div>
</section>

<section class="section join" aria-labelledby="join-h">
  <div class="wrap join-band">
    <div>
      <h2 id="join-h">Work with us</h2>
      <p>We take PhD students, postdocs, visiting scholars, and research interns who want to build AI for health care, education, or agents, and test it with real people.</p>
    </div>
    <a class="btn" href="join.html">Join us</a>
  </div>
</section>
""")

page("people.html", "Lab members",
 "The members of NEU HAI, Northeastern University's Human-Centered AI Lab: faculty, research scientists, PhD students, visitors, and alumni.",
 "people", """
<section class="page-head">
  <div class="wrap"><h1>Lab members</h1></div>
</section>
<section class="wrap members">
  <div class="group">
    <h2 class="subhead">Faculty and research scientists</h2>
    <ul class="people-grid" id="faculty"></ul>
  </div>
  <div class="group">
    <h2 class="subhead">PhD students</h2>
    <ul class="people-grid" id="phd"></ul>
  </div>
  <div class="group">
    <h2 class="subhead">Research assistants and visiting students</h2>
    <ul class="people-grid" id="visiting"></ul>
  </div>
  <div class="group">
    <h2 class="subhead">Alumni</h2>
    <ul class="alumni" id="alumni"></ul>
  </div>
</section>
""")

page("publications.html", "Publications",
 "Publications from NEU HAI, the Human-Centered AI Lab at Northeastern University, in HCI, NLP, and health informatics.",
 "publications", f"""
<section class="page-head">
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

page("culture.html", "Lab culture",
 "Life at NEU HAI: lab meetings, reading groups, conference trips, and the people behind the papers.",
 "culture", """
<section class="page-head">
  <div class="wrap">
    <h1>Lab culture</h1>
    <p>Photos from our lab meetings, conference trips, and celebrations.</p>
  </div>
</section>
<section class="wrap" style="padding-bottom:96px" aria-labelledby="gallery-h">
  <h2 class="subhead" id="gallery-h">Gallery</h2>
  <div class="gallery" id="gallery"></div>
</section>
""", scripts=("culture",))

page("news.html", "News",
 "News from NEU HAI: accepted papers, talks, visitors, and grants.",
 "news", """
<section class="page-head">
  <div class="wrap"><h1>News</h1></div>
</section>
<section class="wrap" style="padding-bottom:96px">
  <ol class="news-list" id="news"></ol>
</section>
""", scripts=("news",))

page("join.html", "Join us",
 "Join NEU HAI: read the lab norms, then apply as a PhD student, postdoc, visiting scholar, research scientist, or research intern.",
 "join", """
<section class="page-head">
  <div class="wrap">
    <h1>Join us</h1>
    <p>Everyone in the lab works by a shared set of norms, so please read them before you apply. You’ll find the application form at the end of the norms.</p>
  </div>
</section>

<section class="wrap norms" id="norms" aria-labelledby="norms-h">
  <div class="norms-head">
    <h2 id="norms-h">NEU-HAI lab norms</h2>
    <p class="norms-version" id="norms-version"></p>
    <p id="norms-credit"></p>
  </div>
  <div class="norms-body" id="norms-body"></div>

  <div class="apply-end">
    <a class="btn" href="https://forms.gle/3Qk8DM2HKJmiBVP76" target="_blank" rel="noopener">Apply through the form</a>
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
    <p>Questions about joining? Read the <a href="https://www.bingshengyao.com/prospective/">frequently asked questions</a>.</p>
    <p>The form sends us an email automatically, so there’s no need to email separately.</p>
  </div>
</section>
""", scripts=("norms",))
