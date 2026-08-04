#!/usr/bin/env python3
"""
Write a generated keeper table into the workbook's (empty) "<year> Eligible Keepers" tab.

Writes a COPY of the workbook and patches exactly one worksheet part inside the .xlsx
zip, leaving every other part byte-for-byte identical. That matters: the master workbook
carries ~350 live formulas and a dozen embedded screenshots, and a normal openpyxl
round-trip would drop the cached formula values the site build reads.

The target tab must be empty — this refuses to overwrite a sheet that already has cells.

Usage:  python3 scripts/write_keeper_tab.py [--year 2026] [--out PATH]
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import shutil
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from build_data import OwnerRegistry  # noqa: E402

HEADERS = [
    "Player",
    "Team #",
    "Current Owner",
    "Year Signed",
    "Rookie?",
    "Contract Years Remaining",
    "Acq?",
    "Keeper Round Cost",
]


def col_letter(index):
    """1 -> A"""
    out = ""
    while index:
        index, rem = divmod(index - 1, 26)
        out = chr(65 + rem) + out
    return out


def esc(text):
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def cell_xml(ref, value):
    """Numbers as numbers, everything else as an inline string (no shared-string table)."""
    if value is None or value == "":
        return ""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f'<c r="{ref}"><v>{value}</v></c>'
    return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{esc(value)}</t></is></c>'


def build_sheet_data(rows, start_row=2, start_col=2):
    """rows: list of lists. Returns the <sheetData> block and the dimension ref."""
    out = []
    for r_offset, row in enumerate(rows):
        r = start_row + r_offset
        cells = "".join(
            cell_xml(f"{col_letter(start_col + c_offset)}{r}", value) for c_offset, value in enumerate(row)
        )
        if cells:
            out.append(f'<row r="{r}">{cells}</row>')
    last_row = start_row + len(rows) - 1
    last_col = col_letter(start_col + max((len(r) for r in rows), default=1) - 1)
    dimension = f"{col_letter(start_col)}{start_row}:{last_col}{last_row}"
    return "<sheetData>" + "".join(out) + "</sheetData>", dimension


def main():
    ap = argparse.ArgumentParser(description="Inject a keeper table into an empty workbook tab.")
    ap.add_argument("--year", type=int, help="keeper season (default: from the generated file)")
    ap.add_argument("--workbook", help="source workbook (default: newest .xlsx here)")
    ap.add_argument("--out", help="output workbook path")
    ap.add_argument("--force", action="store_true", help="overwrite the tab even if it has cells")
    args = ap.parse_args()

    workbook = args.workbook or sorted(
        p
        for p in glob.glob(os.path.join(ROOT, "*.xlsx")) + glob.glob(os.path.join(ROOT, "source", "*.xlsx"))
        if not os.path.basename(p).startswith("~$")
    )[-1]

    year = args.year
    if not year:
        hits = sorted(glob.glob(os.path.join(ROOT, "source", "eligible-keepers-*.json")))
        if not hits:
            sys.exit("No generated keeper table found. Run scripts/build_keepers.py first.")
        year = int(re.search(r"(\d{4})", os.path.basename(hits[-1])).group(1))

    with open(os.path.join(ROOT, "source", f"eligible-keepers-{year}.json"), encoding="utf-8") as fh:
        data = json.load(fh)

    # The site publishes first names only; the workbook is private, so put the full
    # names back for the Excel copy.
    reg = OwnerRegistry()
    full_names = {display: full for full, display in reg.full_to_display.items()}

    rows = [["Possible Keepers"], HEADERS]
    for player in data["players"]:
        rows.append(
            [
                player["player"],
                player["team"],
                full_names.get(player["owner"], player["owner"]),
                player["year_signed"] or "",
                "Yes" if player["rookie"] else "",
                player["contract_years_remaining"],
                player["acquired"],
                player["cost_label"],
            ]
        )
    # "Possible Keepers" is a lone title row above the header, as on the earlier tabs.
    rows[0] = rows[0] + [""] * (len(HEADERS) - 1)

    out_path = args.out or os.path.join(
        ROOT, os.path.basename(workbook).replace(".xlsx", f"-with-{year}-keepers.xlsx")
    )

    with zipfile.ZipFile(workbook) as zin:
        workbook_xml = zin.read("xl/workbook.xml").decode("utf-8")
        rels_xml = zin.read("xl/_rels/workbook.xml.rels").decode("utf-8")

        target_name = None
        for m in re.finditer(r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', workbook_xml):
            if re.fullmatch(rf"{year}\s*(?:eligible\s*)?keepers", m.group(1).strip(), re.I):
                rel = re.search(rf'Id="{m.group(2)}"[^>]*Target="([^"]+)"', rels_xml)
                target_name = "xl/" + rel.group(1).lstrip("/")
                sheet_label = m.group(1)
                break
        if not target_name:
            sys.exit(f"No '{year} Eligible Keepers' tab in {os.path.basename(workbook)}.")

        sheet_xml = zin.read(target_name).decode("utf-8")
        if "<sheetData/>" not in sheet_xml and not args.force:
            sys.exit(
                f"'{sheet_label}' already has cells — refusing to overwrite. "
                "Pass --force if that is really what you want."
            )

        sheet_data, dimension = build_sheet_data(rows)
        patched = sheet_xml.replace("<sheetData/>", sheet_data, 1)
        if "<sheetData/>" in sheet_xml:
            patched = re.sub(r'<dimension ref="[^"]*"/>', f'<dimension ref="{dimension}"/>', patched, count=1)
        else:
            patched = re.sub(r"<sheetData>.*?</sheetData>", sheet_data, patched, count=1, flags=re.S)

        with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                payload = zin.read(item.filename)
                if item.filename == target_name:
                    payload = patched.encode("utf-8")
                zout.writestr(item, payload)

    print(f"source : {os.path.relpath(workbook, ROOT)}")
    print(f"tab    : {sheet_label} ({len(data['players'])} players, {dimension})")
    print(f"wrote  : {os.path.relpath(out_path, ROOT)}")
    print("\nThe original workbook is untouched. Open the copy, check the tab, then rename it")
    print("over the original. The roster screenshots are still anchored on top of the cells —")
    print("delete them once you've confirmed the table.")


if __name__ == "__main__":
    main()
