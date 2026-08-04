#!/usr/bin/env python3
"""
Pull ESPN's preseason draft rankings for a season into source/espn-rankings-<year>.json.

This is the only part of the pipeline that touches the network, so it is deliberately a
separate step: run it when you want fresh rankings, and every other build stays offline
and reproducible off the cached file.

ESPN publishes STANDARD, PPR and SUPERFLEX ranks — there is no half-PPR list in this feed,
so both STANDARD and PPR are stored and the site uses PPR.

Usage:  python3 scripts/fetch_rankings.py [--year 2026] [--limit 400]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

API = (
    "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{year}"
    "/segments/0/leaguedefaults/3?view=kona_player_info"
)

PRO_TEAMS = {
    0: "FA", 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN",
    8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA",
    16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT",
    24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL",
    34: "HOU",
}

POSITIONS = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST"}


def main():
    ap = argparse.ArgumentParser(description="Cache ESPN draft rankings for a season.")
    ap.add_argument("--year", type=int, default=2026)
    ap.add_argument("--limit", type=int, default=400, help="how many ranked players to keep")
    args = ap.parse_args()

    request = urllib.request.Request(
        API.format(year=args.year),
        headers={
            "User-Agent": "Mozilla/5.0 (o8ffl-league-site)",
            "x-fantasy-filter": json.dumps(
                {
                    "players": {
                        "limit": args.limit,
                        "sortDraftRanks": {"sortPriority": 1, "sortAsc": True, "value": "PPR"},
                    }
                }
            ),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.load(response)
    except Exception as err:  # pragma: no cover - network
        sys.exit(f"Could not reach ESPN: {err}")

    players = []
    for row in payload.get("players", []):
        player = row.get("player") or {}
        ranks = player.get("draftRanksByRankType") or {}
        ppr = (ranks.get("PPR") or {}).get("rank")
        if not ppr:
            continue
        ownership = player.get("ownership") or {}
        players.append(
            {
                "rank": ppr,
                "rank_standard": (ranks.get("STANDARD") or {}).get("rank"),
                "player": player.get("fullName"),
                "nfl_team": PRO_TEAMS.get(player.get("proTeamId"), ""),
                "position": POSITIONS.get(player.get("defaultPositionId"), ""),
                "adp": round(ownership["averageDraftPosition"], 1)
                if ownership.get("averageDraftPosition")
                else None,
                "auction": round(ownership["auctionValueAverage"], 1)
                if ownership.get("auctionValueAverage")
                else None,
                "percent_owned": round(ownership["percentOwned"], 1) if ownership.get("percentOwned") else None,
            }
        )

    players.sort(key=lambda p: p["rank"])
    out_path = os.path.join(ROOT, "source", f"espn-rankings-{args.year}.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(
            {
                "year": args.year,
                "source": "ESPN fantasy API, PPR draft ranks (no half-PPR list is published)",
                "players": players,
            },
            fh,
            ensure_ascii=False,
            indent=1,
        )

    print(f"{len(players)} ranked players -> {os.path.relpath(out_path, ROOT)}")
    for row in players[:5]:
        print(f"  {row['rank']:>3}. {row['player']:<24} {row['position']:<5} {row['nfl_team']}")


if __name__ == "__main__":
    main()
