"""Recomputes every paper's categories after the rules in pubtools.py change.

    python3 tools/retag.py

Papers with "topicsManual": true keep the categories set by hand.
"""
from pubtools import classify, load_pubs, save_pubs

head, pubs = load_pubs()
for p in pubs:
    if not p.get("topicsManual"):
        p["topics"] = classify(p)
save_pubs(head, pubs)
print(f"{len(pubs)} papers retagged")
