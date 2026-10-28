"""Shared helpers for the publication scripts: loading and saving data/pubs.js, title matching,
short venue tags, topic tags, and OpenAlex lookups (free, no API key)."""
import difflib
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html import unescape

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUBS = ROOT / "data" / "pubs.js"
PREFIX = "window.HAI_PUBS = "
CONTACT = "b.yao@northeastern.edu"  # OpenAlex asks API users for a contact address


def load_pubs():
    head, body = PUBS.read_text().split(PREFIX, 1)
    return head, json.loads(body.strip().rstrip(";"))


def save_pubs(head, pubs):
    PUBS.write_text(head + PREFIX + json.dumps(pubs, ensure_ascii=False, indent=0) + ";\n")
    # pages carry a content stamp for each data file; rebuild them so browsers pick up the new data
    import subprocess
    subprocess.run([sys.executable, str(ROOT / "tools" / "pages.py")], capture_output=True)


# ---------- topics ----------
# Every paper gets a main category (topics[0]: its dot colour on the home page and the area that lists it)
# and, when the title clearly names a second one, one more (topics[1]); the Publications page shows and
# filters by both. More than two would mean the categories are too vague to tell papers apart.
#   health = AI for Healthcare, education = AI for Learning, agents = LLM Agents, data = Data Science,
#   collab = Human-AI Collaboration (incl. the human-human collaboration studies it grew from),
#   algo = AI Algorithms (models and training methods),
#   community = Community Engagement (workshops, panels, SIGs the lab organized),
#   other = everything that fits none of them (shown in gray).
CATEGORIES = ["community", "health", "education", "agents", "data", "collab", "algo", "other"]
AREAS = ["health", "education", "data", "agents", "collab", "algo"]  # tie-break order
DOMAINS = ("health", "education")  # application areas: only count when the title (or venue) names them
SUBJECTS = ("data", "agents", "collab")  # what a paper studies, as opposed to the algorithms it uses
RULES = {
    "health": r"clinic|patient|medical|health|cancer|sepsis|cardio|\bicu\b|intensive care|surg|wound|mental(?! model)|concussion|\behr\b|nurs|hospital|caregiver|symptom|well-being|wellbeing|physician|doctor|depress|covid|postoperative|telehealth|disease|prosocial|parkinson|older adult|serious illness|emergency|tracking data|motor impairment",
    "education": r"child|story|storytelling|fairy ?tale|educat|teacher|student|classroom|reading|\bkids?\b|parent|literacy|learner|\bcourses?\b|academic work|question generation|foreign language|narrative comprehension|school",
    "agents": r"\bagents?\b|agentic|simulat|\bperson(?:a|as|ae)\b|companion|role-play|role-playing|usability|shopping|customer|tool-call|tool-us|a/b testing|harness|voice assistant|conversational (?:agent|assistant)|chatbot|voice user interface|\bvuis?\b|cooking",
    "data": r"automl|auto-?ai|autods|data scien|notebook|annotat|active learning|\blabels?\b|dataset|data work|feature engineering|data-debugging|relational data|visualiz|forecast|code documentation|code summarization|data drift|analytics|data extraction|database|machine learning model|\bml model|ai developers?|automated machine learning",
    "algo": r"fine-?tun|reinforcement|benchmark|transformer|neural|\bgraph\b|adversarial|perturbation|\battack|optimi[sz]|admm|extraction|detection|summarization|in-context|distillation|diffusion|classification|anomaly|prediction|language models?\b|\bllms?\b|retrieval|reasoning|embedding|generation|\brl\b|deep learning|machine learning|\bgnn\b|graph neural",
    "collab": r"collaborat|human-ai|human-agent|human-robot|teaming|teammate|co-creat|cooperat|trust|explainab|human-in-the-loop|writ\w* together|\bteams?\b|group chat|partner|organizational|enterprise|decision making|decision-making|ai-assisted|second opinion|oversight|shared mental model|mixed-initiative|human.computer integration|answerer",
}
HEALTH_VENUES = r"ACM HEALTH|JMIR|Medical Internet|JBHI|Biomedical and Health|npj Digit|Medical Systems|Health Inform|JAMIA|medRxiv"
ML_VENUES = r"\b(ACL|EMNLP|NAACL|TACL|ICLR|ICML|NeurIPS|KDD|AAAI|ECCV|CVPR|ICDE|IJCAI|PAKDD|COLING)\b"
HCI_VENUES = r"\b(CHI|CSCW|IUI|DIS|TOCHI|IMWUT|PACM HCI|IJHCS|iConference|RO-MAN|PacificVis|UIST|ASIS&T|UbiComp)\b"
COMMUNITY = [
    "from human-human collaboration to human-agent collaboration: a vision",
    "human-centered privacy research in the age of large language models",
    "shai 2023",
    "designing ai to work with or for people",
    "from human-human collaboration to human-ai collaboration: designing ai systems",
    "chinese chi 2020 workshop",
    "conversational agents: acting on the wave",
    "hci in china",
    "towards a diverse, inclusive, accessible and equitable aaai international conference",
]

def _hits(p):
    title, abstract = p["t"].lower(), p.get("abs", "").lower()
    return ({k: len(re.findall(r, title)) for k, r in RULES.items()},
            {k: min(len(re.findall(r, abstract)), 4) for k, r in RULES.items()})

def classify(p):
    """[main] or [main, second]; see the note above CATEGORIES."""
    t, a = _hits(p)
    venue = p.get("tag", "") + " " + p.get("v", "")
    ml, hci = bool(re.search(ML_VENUES, venue)), bool(re.search(HCI_VENUES, p.get("tag", "")))
    if re.search(HEALTH_VENUES, venue):
        t["health"] += 1
    if hci and not ml:  # at HCI venues "LLM" or "prediction" describes the system, not an algorithms contribution
        t["algo"] = a["algo"] = 0
    for k in DOMAINS:
        a[k] = 0  # "students" or "patients" in an abstract are often just the study's participants
    # papers at ML venues are algorithms work unless their title says otherwise
    score = {k: 3 * t[k] + a[k] + (2 if k == "algo" and ml else 0) for k in AREAS}
    if any(norm(p["t"]).startswith(norm(c)) for c in COMMUNITY):
        main = "community"
    elif any(t[k] for k in DOMAINS):
        # an application area named in the title wins: a sepsis model at KDD is healthcare work
        main = max(DOMAINS, key=lambda k: (t[k], k == "health"))
    elif any(t[k] for k in SUBJECTS):
        # so does a subject named in the title: an RL method for shopping agents is agents work, algorithms second
        main = max((k for k in SUBJECTS if t[k]), key=lambda k: (score[k], -AREAS.index(k)))
    else:
        main = max(AREAS, key=lambda k: (score[k], -AREAS.index(k)))
        if not (score[main] >= 2 or (score[main] > 0 and not p.get("abs"))):
            return ["other"]
    # a second category only when the title names it, or the abstract keeps coming back to it;
    # one "LLM" in the title of an HCI paper doesn't make it algorithms work
    second = [k for k in AREAS if k != main and (t[k] or a[k] >= 4) and (k != "algo" or ml or t[k] >= 2 or a[k] >= 4)]
    if not second:
        return [main]
    return [main, max(second, key=lambda k: (3 * t[k] + a[k], -AREAS.index(k)))]

def norm(t):
    return re.sub(r"[^a-z0-9]+", " ", unescape(t).lower().replace("’", "'")).strip()

def ratio(a, b):
    return difflib.SequenceMatcher(None, a, b).ratio()

_exhausted = set()  # hosts that said their quota is used up for today; skip them for the rest of the run


def get_json(url, tries=4):
    host = urllib.parse.urlparse(url).netloc
    if host in _exhausted:
        return None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "neuhai-site/1.0 (+https://hailab.io)"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            wait = int(e.headers.get("Retry-After") or 0) or 10 * (i + 1)
            if e.code == 429 and (wait > 60 or e.headers.get("X-RateLimit-Remaining") == "0"):
                # OpenAlex allows about 100 searches a day without an API key; waiting won't help today
                print(f"    {host} quota used up for today, skipping further lookups there", file=sys.stderr)
                _exhausted.add(host)
                return None
            if e.code != 429 or i == tries - 1:
                print(f"    lookup failed: {e}", file=sys.stderr)
                return None
            time.sleep(wait)
        except Exception as e:
            if i == tries - 1:
                print(f"    lookup failed: {e}", file=sys.stderr)
                return None
            time.sleep(5)

VENUE_RULES = [  # (pattern on venue text, tag stem, include year)
    (r"TrustNLP|Trustworthy NLP", "TrustNLP Workshop", True), (r"Conversational User Interfaces", "CUI", True),
    (r"Extended Abstracts|CHI EA", "CHI EA", True), (r"Special Interest", "CHI SIG", True),
    (r"Findings of the Association for Computational Linguistics: (ACL|EMNLP|NAACL)", None, True),
    (r"CHI Conference|CHI[’']|\bCHI\b|Human Factors in Computing", "CHI", True),
    (r"CSCW|Computer Supported Cooperative|Computer-Supported Cooperative", "CSCW", True),
    (r"Proceedings of the ACM on Human-Computer Interaction", "CSCW", True),
    (r"Interactive, Mobile, Wearable", "IMWUT", True), (r"Intelligent User Interfaces|IUI[’']", "IUI", True),
    (r"Designing Interactive Systems|DIS[’']", "DIS", True), (r"Transactions of the Association for Computational Linguistics", "TACL", True),
    (r"Annual Meeting of the Association for Computational Linguistics|\bACL[’' ]", "ACL", True),
    (r"Empirical Methods in Natural Language|EMNLP", "EMNLP", True), (r"North American Chapter|NAACL", "NAACL", True),
    (r"PAKDD", "PAKDD Workshop", True), (r"ICLR", "ICLR", True), (r"KDD|Knowledge Discovery and Data Mining", "KDD", True), (r"AAAI Symposium|AAAI (Spring|Fall) Symposium", "AAAI Symposium", True), (r"AAAI", "AAAI", True),
    (r"ECCV|Computer Vision - ECCV", "ECCV", True), (r"PacificVis|Pacific Visualization", "PacificVis", True),
    (r"International Journal of Human-Computer Studies", "IJHCS", True), (r"Trans\. on Computer-Human Interaction|TOCHI", "TOCHI", True),
    (r"Journal of Medical Internet Research", "JMIR", True), (r"Journal of Medical Systems", "J. Med. Syst.", True),
    (r"Computers & Education", "Computers & Education", True), (r"Association for Information Science", "ASIS&T", True),
    (r"RO-MAN|Robot and Human Interactive", "RO-MAN", True), (r"IConference|iConference", "iConference", True),
    (r"ICDE|Data Engineering", "ICDE", True), (r"IJCAI", "IJCAI", True),
    (r"Transactions on Computing for Healthcare", "ACM HEALTH", True), (r"npj Digital Medicine", "npj Digit. Med.", True),
    (r"Journal of the American Medical Informatics|JAMIA", "JAMIA", True), (r"Scientific Reports", "Sci. Rep.", True),
    (r"\bUIST\b|User Interface Software and Technology", "UIST", True), (r"NeurIPS|Neural Information Processing", "NeurIPS", True),
    (r"\bICML\b|International Conference on Machine Learning", "ICML", True), (r"\bWWW\b|Web Conference", "WWW", True),
    (r"COLING|International Conference on Computational Linguistics", "COLING", True), (r"Ubiquitous Computing|UbiComp", "UbiComp", True),
    (r"Tsinghua University Press", "Book", False),
]

def venue_tag(venue, year):
    for pat, stem, with_year in VENUE_RULES:
        m = re.search(pat, venue, re.I)
        if not m:
            continue
        if stem is None:  # Findings of ACL / EMNLP / NAACL
            return f"{m.group(1)} {year} Findings"
        return f"{stem} {year}" if with_year else stem
    return "Peer-reviewed"


def flip_name(n):
    """'Wang, Tian' -> 'Tian Wang'."""
    if "," in n:
        last, first = [x.strip() for x in n.split(",", 1)]
        return f"{first} {last}".strip()
    return n.strip()


def openalex(title):
    """Best OpenAlex match for a title: full author names, the published venue (if any) and links."""
    q = urllib.parse.quote(re.sub(r"[^\w\s-]", " ", title)[:250])
    data = get_json(f"https://api.openalex.org/works?search={q}&per-page=5&mailto={CONTACT}")
    for w in (data or {}).get("results", []) or []:
        if ratio(norm(title), norm(w.get("display_name") or "")) < 0.9:
            continue
        published, arxiv = None, ""
        for loc in w.get("locations") or []:
            src = (loc.get("source") or {}).get("display_name") or ""
            url = loc.get("landing_page_url") or ""
            if re.search(r"arxiv", src + url, re.I):
                arxiv = arxiv or url
            elif src and loc.get("version") in ("publishedVersion", None) and not re.search(r"rxiv|ssrn|research square|preprint|zenodo|figshare|semantic scholar|europe pmc|pubmed", src, re.I):
                published = published or {"venue": src, "url": url}
        doi = w.get("doi") or ""
        if published and doi and "10.48550" not in doi:
            published["url"] = doi
        return {"a": [flip_name(a["author"]["display_name"]) for a in w.get("authorships") or []],
                "year": w.get("publication_year"), "published": published, "arxiv": arxiv}
    return None
