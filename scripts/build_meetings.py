#!/usr/bin/env python3
"""
Turn the owners' meeting agendas and minutes into data/meetings.json.

Reads every file in source/meetings/ — .docx uses Word's own list levels, .pdf is
recovered from the indentation that pdftotext -layout preserves — and produces a nested
outline per year, with vote outcomes tagged so the site can style them.

Names are run through the same redactor as everything else, so no league member's surname
reaches the published site.

Usage:  python3 scripts/build_meetings.py
"""

from __future__ import annotations

import glob
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from build_data import OwnerRegistry  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# A line that records how the room voted, rather than the item being discussed.
VOTE_RE = re.compile(
    r"(vote[d]?\b|approved|not approved|denied|winner\b|\b\d+\s*-\s*\d+\b|status quo)", re.I
)
# Surnames the minutes drop on their own, which the shared redactor deliberately leaves
# alone because they are ambiguous or collide with ordinary words. In this context they are
# unmistakably people, so they get handled here. "Moules" stays — the league renamed the
# last-place trophy after a former owner, and it is a trophy name now.
# People who are not league members but get named in the minutes — prospective owners
# who were put forward for an open seat. Same rule applies: first names only.
NON_MEMBERS = [
    (re.compile(r"\bMark\s+Triscuit\s+Gambon\b"), "Mark T."),
    (re.compile(r"\bTJ\s+Kane\b"), "TJ"),
]

BARE_SURNAMES = [
    (re.compile(r"\bDooley'?s?\b"), "Chris/Brian"),   # two Dooleys — can't tell which
    (re.compile(r"\bRose'?s?\b"), "Matt"),
    (re.compile(r"\bShea'?s\b"), "Connor's"),
    (re.compile(r"\bCronin'?s?\b"), "Shawn"),
]

# Corrections applied on the way out. The source documents are never modified; each entry
# records what it fixes and why.
TEXT_FIXES = [
    # 2025 minutes: the vote replaced the kicker slot with a flex, not another kicker.
    # By-laws 4.1 states it plainly: "kickers will be removed and an additional flex spot
    # will be added".
    (
        re.compile(r"removing kickers in favou?r of an additional kicker", re.I),
        "removing kickers in favor of an additional flex",
    ),
]

# "Player positions" reads as though roster construction as a whole is settled. The vote
# was specifically about kickers, and roster construction stays open — so the item is
# retitled wherever its outcome is actually about kickers. Earlier meetings that genuinely
# ranged across 2QB, extra flex and defensive players keep their original heading.
def retitle(text, outcome):
    if re.fullmatch(r"player positions\.?", (text or "").strip(), re.I) and re.search(
        r"kicker", outcome or "", re.I
    ):
        return "Kicker removal"
    return text


# Boilerplate from the PDF exports.
NOISE = re.compile(r"^(svb confidential|page \d+|original 8 fantasy football)", re.I)

NUMBERING = [
    (re.compile(r"^(\d+)\.\)\s*"), 0),        # 1.)  top level
    (re.compile(r"^([ivx]+)\.\s+"), 2),       # i.   third level
    (re.compile(r"^([a-h])\.\s+"), 2),        # a.   third level
    (re.compile(r"^(\d+)\.\s+"), 1),          # 1.   second level
    (re.compile(r"^[•\-•]\s*"), 1),
]


def clean(text):
    text = re.sub(r"\s+", " ", (text or "").replace("\xa0", " ")).strip()
    return text


def strip_number(text):
    for pattern, level in NUMBERING:
        m = pattern.match(text)
        if m:
            return pattern.sub("", text, count=1).strip(), level
    return text, None


def parse_docx(path):
    import docx

    doc = docx.Document(path)
    nodes = []
    meta = {}
    for para in doc.paragraphs:
        text = clean(para.text)
        if not text or NOISE.match(text):
            continue

        if m := re.match(r"Notice of the (\d{4}) Annual Meeting", text, re.I):
            meta["year"] = int(m.group(1))
            continue
        if m := re.match(r"Date:\s*(.*?)(?:\s+Place:\s*(.+))?$", text, re.I):
            if m.group(1).strip():
                meta["date"] = m.group(1).strip()
            if m.group(2):
                meta["place"] = m.group(2).strip()
            continue
        if m := re.match(r"Place:\s*(.+)", text, re.I):
            meta["place"] = m.group(1).strip()
            continue

        pr = para._p.pPr
        level = None
        if pr is not None and pr.numPr is not None and pr.numPr.ilvl is not None:
            level = int(pr.numPr.ilvl.val)
        if level is None:
            # A bare paragraph under a list item records how that item was voted on.
            if nodes and text.startswith("-"):
                nodes[-1].setdefault("outcome", text.lstrip("- ").strip())
                continue
            level = 0
        nodes.append({"level": level, "text": text})
    return meta, nodes


def parse_pdf(path):
    try:
        raw = subprocess.run(
            ["pdftotext", "-layout", path, "-"], capture_output=True, text=True, check=True
        ).stdout
    except (OSError, subprocess.CalledProcessError) as err:
        print(f"  ! could not read {os.path.basename(path)}: {err}")
        return {}, []

    meta = {}
    nodes = []
    in_body = False
    for line in raw.splitlines():
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip())
        text = clean(line)
        if NOISE.match(text):
            continue

        if m := re.match(r"Notice of the (\d{4}) Annual Meeting", text, re.I):
            meta["year"] = int(m.group(1))
            in_body = True
            continue
        if not in_body:
            continue  # the cover page lists every owner; skip it
        if m := re.match(r"Date:\s*(.*?)(?:\s+Place:\s*(.+))?$", text, re.I):
            if m.group(1).strip():
                meta["date"] = m.group(1).strip()
            if m.group(2):
                meta["place"] = m.group(2).strip()
            continue
        if m := re.match(r"Place:\s*(.+)", text, re.I):
            meta["place"] = m.group(1).strip()
            continue

        stripped, level = strip_number(text)
        if level is None:
            # No numbering: a wrapped continuation of the line above.
            if nodes:
                nodes[-1]["text"] = f"{nodes[-1]['text']} {text}".strip()
                continue
            level = 0
        else:
            # Indentation disambiguates "1." at the second vs third level.
            if level == 1 and indent >= 16:
                level = 2
        nodes.append({"level": level, "text": stripped})
    return meta, nodes


OUTCOME_START = re.compile(
    r"^(vote[d]?\b|approved\b|not approved\b|denied\b|no change\b|status quo\b|winner\b)", re.I
)


def split_outcome(text):
    """
    Items and their outcomes are written on one line: "Auction Draft-Voted 6-4 against."
    Pull the outcome out so the site can style it.

    Some lines carry two votes ("League fees: Remove anniversary fee- Voted 10-0 +
    Increase the fee to $200 - Voted 10-0"), and some carry a hyphen long before the vote
    ("Additional Proposal - Extension of the revote... -Voted 10-0"). Splitting where the
    outcome actually begins handles both; anything else falls back to the loose scan.
    """
    for idx, ch in enumerate(text):
        if ch in "-–" and idx > 0:
            between_digits = text[idx - 1].isdigit() and idx + 1 < len(text) and text[idx + 1].isdigit()
            head, tail = text[:idx].strip(" -–"), text[idx + 1 :].strip()
            if not between_digits and head and OUTCOME_START.match(tail):
                return head, tail

    for sep in ("–", "-"):
        idx = text.rfind(sep)
        while idx > 0:
            # Never split inside a vote tally: "Voted 10-0" is one number, not a boundary.
            between_digits = text[idx - 1].isdigit() and idx + 1 < len(text) and text[idx + 1].isdigit()
            if not between_digits:
                head, tail = text[:idx].strip(" -–"), text[idx + 1 :].strip()
                if tail and VOTE_RE.search(tail) and len(tail) < 700 and head:
                    return head, tail
            idx = text.rfind(sep, 0, idx)
    return text, None


SECTION_ORDER = re.compile(r"^draft order selection", re.I)
SECTION_DETAILS = re.compile(r"^draft day details", re.I)
# "Matt Rose-1st", "Brian Dooley- 10th"
ORDER_LINE = re.compile(r"^(?P<who>.+?)\s*[-–]\s*(?P<slot>\d{1,2})(?:st|nd|rd|th)\b", re.I)


def extract_structure(items, reg):
    """
    Two sections are worth having as data rather than prose: the draft-slot selection and
    the draft-day logistics. Both are written the same way every year.
    """
    order, details, section = [], {}, None
    for item in items:
        if item["level"] == 0:
            section = (
                "order" if SECTION_ORDER.match(item["text"])
                else "details" if SECTION_DETAILS.match(item["text"])
                else None
            )
            continue
        if section == "order":
            m = ORDER_LINE.match(item["text"])
            if m:
                who = reg.resolve(m.group("who"), record=False)
                order.append(
                    {
                        "choice": len(order) + 1,
                        "slot": int(m.group("slot")),
                        "owner": who["display"] if who else m.group("who").strip(),
                        "team": who["team"] if who else None,
                    }
                )
        elif section == "details":
            text = item["text"]
            key = "draft" if re.match(r"time\s*/?\s*location", text, re.I) else (
                "keepers" if re.search(r"keeper", text, re.I) else None
            )
            if key:
                details[key] = re.sub(r"^[^-–]*[-–]\s*", "", text).strip()
    return order, details


def main():
    reg = OwnerRegistry()
    base = reg.build_redactor()

    def shorten(text):
        text = base(text)
        if text:
            for pattern, replacement in NON_MEMBERS + BARE_SURNAMES + TEXT_FIXES:
                text = pattern.sub(replacement, text)
        return text

    meetings = []
    paths = sorted(glob.glob(os.path.join(ROOT, "source", "meetings", "*")))
    for path in paths:
        ext = os.path.splitext(path)[1].lower()
        if ext == ".docx":
            meta, nodes = parse_docx(path)
        elif ext == ".pdf":
            meta, nodes = parse_pdf(path)
        else:
            continue

        year = meta.get("year")
        if not year:
            m = re.search(r"(\d{4})", os.path.basename(path))
            year = int(m.group(1)) if m else None
        if not year or not nodes:
            print(f"  ! skipped {os.path.basename(path)} (no year or no content)")
            continue

        items = []
        for node in nodes:
            text, outcome = split_outcome(node["text"])
            outcome = node.get("outcome") or outcome
            clean_outcome = shorten(outcome) if outcome else None
            items.append(
                {
                    "level": min(node["level"], 3),
                    "text": retitle(shorten(text), clean_outcome),
                    "outcome": clean_outcome,
                    "is_vote": bool(VOTE_RE.search(node["text"])),
                }
            )

        order, details = extract_structure(items, reg)
        meetings.append(
            {
                "year": year,
                "draft_order": order,
                "details": details,
                "date": shorten(meta.get("date")),
                "place": meta.get("place"),
                "source": os.path.basename(path),
                # A meeting has minutes if outcomes were recorded against its items —
                # the filename doesn't always say so.
                "has_minutes": any(i["outcome"] for i in items),
                "items": items,
            }
        )
        votes = sum(1 for i in items if i["outcome"])
        print(f"  {year}: {len(items):>3} items, {votes:>2} recorded outcomes  ({os.path.basename(path)})")

    meetings.sort(key=lambda m: m["year"], reverse=True)
    out_path = os.path.join(ROOT, "data", "meetings.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump({"meetings": meetings}, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"\nwrote data/meetings.json ({len(meetings)} meetings, {os.path.getsize(out_path)/1024:.1f} KB)")


if __name__ == "__main__":
    main()
