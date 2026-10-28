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
# Every paper gets exactly one category, so the categories don't overlap:
#   health = AI for Healthcare, education = AI for Learning, agents = LLM Agents & AI Algorithms,
#   data = Data Science, community = Community Engagement (workshops, panels, SIGs the lab organized),
#   other = everything that fits none of them (shown in gray).
CATEGORIES = ["community", "health", "education", "agents", "data", "other"]
AREAS = ["health", "education", "data", "agents"]  # tie-break order
RULES = {
    "health": r"clinic|patient|medical|health|cancer|sepsis|cardio|\bicu\b|intensive care|surg|wound|mental(?! model)|concussion|\behr\b|nurs|hospital|caregiver|symptom|well-being|wellbeing|physician|doctor|depress|covid|postoperative|telehealth|disease|prosocial|parkinson|older adult|serious illness|emergency|tracking data|motor impairment",
    "education": r"child|story|storytelling|fairy ?tale|educat|teacher|student|classroom|reading|\bkids?\b|parent|literacy|learner|\bcourses?\b|academic work|question generation|foreign language|narrative comprehension|school",
    "agents": r"\bagents?\b|agentic|simulat|persona|role-play|role-playing|usability|shopping|customer|tool-call|tool-us|a/b testing|harness|voice assistant|conversational (?:agent|assistant)|chatbot|voice user interface|\\bvuis?\\b|cooking",
    "data": r"automl|auto-?ai|autods|data scien|notebook|annotat|active learning|\blabels?\b|dataset|data work|feature engineering|data-debugging|relational data|visualiz|forecast|code documentation|code summarization|data drift|analytics|data extraction|database|machine learning model|\\bml model|ai developers?|data scien\\w*|automated machine learning",
    "algo": r"fine-?tun|reinforcement|benchmark|transformer|neural|\bgraph\b|adversarial|optimi[sz]|admm|extraction|detection|summarization|in-context|distillation|diffusion|classification|anomaly|prediction|language models?\b|\bllms?\b|retrieval|reasoning|embedding|generation|\brl\b|deep learning|machine learning|\\bgnn\\b|graph neural",
    "collab": r"collaborat|human-ai|human-agent|teaming|co-creat|conversational|chatbot|voice|trust|explanation|human-in-the-loop|writing|\bteams?\b|cooperat|partner|group|organizational|enterprise|social|community|misinformation|privacy|disclosure|dark pattern|oversight|second opinion|decision making|decision-making|perspective|perception|interview|design|user|stakeholder",
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
]

def _scores(p):
    title, abstract = p["t"].lower(), p.get("abs", "").lower()
    return {k: 3 * len(re.findall(r, title)) + min(len(re.findall(r, abstract)), 4) for k, r in RULES.items()}

def classify(p):
    if any(norm(p["t"]).startswith(norm(c)) for c in COMMUNITY):
        return ["community"]
    sc = _scores(p)
    venue = p.get("tag", "") + " " + p.get("v", "")
    ml, hci = bool(re.search(ML_VENUES, venue)), bool(re.search(HCI_VENUES, p.get("tag", "")))
    # method words ("LLM", "prediction") count toward LLM Agents & AI Algorithms only outside HCI venues
    agents = sc["agents"] + (0 if hci and not ml else sc["algo"]) + (2 if ml else 0)
    # an application area named in the title (or a health venue) wins: a sepsis model at KDD is healthcare work
    title_hits = {k: len(re.findall(RULES[k], p["t"].lower())) for k in ("health", "education")}
    if re.search(HEALTH_VENUES, venue):
        title_hits["health"] += 1
    domain = [k for k in ("health", "education") if title_hits[k]]
    if domain:
        return [max(domain, key=lambda k: (title_hits[k], k == "health"))]
    cand = {"health": sc["health"], "education": sc["education"], "agents": agents, "data": sc["data"]}
    best = max(AREAS, key=lambda k: (cand[k], -AREAS.index(k)))
    if cand[best] >= 2 or (cand[best] > 0 and not p.get("abs")):
        return [best]
    return ["other"]

def norm(t):
    return re.sub(r"[^a-z0-9]+", " ", unescape(t).lower().replace("’", "'")).strip()

def ratio(a, b):
    return difflib.SequenceMatcher(None, a, b).ratio()

def get_json(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "neuhai-site/1.0 (+https://hailab.io)"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            wait = int(e.headers.get("Retry-After") or 0) or 10 * (i + 1)
            if e.code != 429 or i == tries - 1:
                print(f"    lookup failed: {e}", file=sys.stderr)
                return None
            time.sleep(min(wait, 60))
        except Exception as e:
            if i == tries - 1:
                print(f"    lookup failed: {e}", file=sys.stderr)
                return None
            time.sleep(5)

VENUE_RULES = [  # (pattern on venue text, tag stem, include year)
    (r"Extended Abstracts|CHI EA", "CHI EA", True), (r"Special Interest", "CHI SIG", True),
    (r"Findings of the Association for Computational Linguistics: (ACL|EMNLP|NAACL)", None, True),
    (r"CHI Conference|CHI[’']|\bCHI\b|Human Factors in Computing", "CHI", True),
    (r"CSCW|Computer Supported Cooperative|Computer-Supported Cooperative", "CSCW", True),
    (r"Proceedings of the ACM on Human-Computer Interaction", "CSCW", True),
    (r"Interactive, Mobile, Wearable", "IMWUT", True), (r"Intelligent User Interfaces|IUI[’']", "IUI", True),
    (r"Designing Interactive Systems|DIS[’']", "DIS", True), (r"Transactions of the Association for Computational Linguistics", "TACL", True),
    (r"Annual Meeting of the Association for Computational Linguistics|\bACL[’' ]", "ACL", True),
    (r"Empirical Methods in Natural Language|EMNLP", "EMNLP", True), (r"North American Chapter|NAACL", "NAACL", True),
    (r"PAKDD", "PAKDD Workshop", True), (r"ICLR", "ICLR", True), (r"KDD|Knowledge Discovery and Data Mining", "KDD", True), (r"AAAI", "AAAI", True),
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
