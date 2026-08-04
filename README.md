# Original 8 Fantasy Football League — league site

A static site for the O8FFL: draft history, standings, stats, keepers, waiver dollars,
the by-laws and a pre-draft meeting brief. No build step, no framework — plain HTML, CSS
and ES modules reading JSON that a Python script generates from the league workbook.

## Updating the site each year

1. Drop the new master workbook and by-laws in this folder (or in `source/`). Keep the
   sheet naming conventions the workbook already uses:
   - `2026 Draft` for a draft board
   - `2025` for that season's roster/draft-detail sheet
   - new year columns on `Standings History`, `Stats`, `Waiver Wire Dollars`
2. Regenerate the data:

```bash
python3 scripts/build_data.py
```

3. Check the site locally:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. (Opening the `.html` files directly from Finder will
not work — the pages fetch JSON, which browsers block on `file://`.)

4. Commit and push. GitHub Pages redeploys automatically.

```bash
git add -A && git commit -m "Update league data" && git push
```

### Building next year's keeper tab

When the season ends, the workbook gets a new empty `<year> Eligible Keepers` tab with the
final-roster screenshots pasted in. To turn that into a table:

1. Transcribe the rosters into `source/final-rosters-<last year>.json` (same shape as the
   2025 file — slot, player, NFL team, position, ESPN's ACQ column).
2. Generate the table:

```bash
python3 scripts/build_keepers.py
```

That cross-references last year's draft board, the final rosters and the previous keeper
tab, applies by-laws 6.1, and writes three things:

| Output | Use |
| --- | --- |
| `source/eligible-keepers-<year>.json` | read straight by the site build |
| `build/<year>-eligible-keepers.csv` | paste into the workbook tab |
| `build/<year>-keeper-review.md` | the handful of calls worth checking |

3. Optionally have the tab written into the workbook for you:

```bash
python3 scripts/write_keeper_tab.py
```

This writes a *copy* (`…-with-<year>-keepers.xlsx`) and patches only that one worksheet
inside the file, so the workbook's live formulas, cached values and embedded screenshots
all survive. Check the copy, then rename it over the original.

**What to trust.** The keeper round cost is rule-derived and reliable: last year's round
minus one, a 6th for a free-agent pickup, and a traded player carries his original cost.
Contract years remaining involves one inference — the workbook never records who was
actually kept, so the script reconstructs it by finding the players taken at exactly their
keeper cost (allowing for stacking). The review file lists what it concluded.

### Draft prep rankings

The draft-prep page needs ESPN's preseason ranking. It is the only part of the pipeline
that touches the network, so it is a separate step and the result is cached:

```bash
python3 scripts/fetch_rankings.py --year 2026
```

That writes `source/espn-rankings-<year>.json`; the site build joins it to the keeper table
to produce `data/draftprep.json`. Re-run it whenever you want fresher rankings — ESPN moves
them through the summer.

ESPN publishes standard, PPR and superflex ranks in this feed but no half-PPR list, so the
site uses PPR (the standard rank is stored alongside if you ever want to blend the two).
Their rank numbers also have holes in them — nothing is ranked 37-68 for 2026, while ADP
runs straight through the gap — so the column shows the position in their ordered list and
keeps the raw value in the JSON.

Value on that page is `(keeper round x 10) - ranking`. A second-round keeper is charged 20,
so a top-five player kept for a 2nd scores +15. Higher is better.

### Adding a season before it's in the workbook

Results usually land on ESPN before they're typed into the workbook. Files in `source/`
fill that gap and are merged by the build:

- `source/season-<year>.json` — final standings, regular-season order, W/L/T, points,
  transactions and waiver budgets
- `source/final-rosters-<year>.json` — end-of-season rosters
- `source/eligible-keepers-<year>.json` — generated keeper table

The workbook always wins. The moment a year appears in Standings History / Stats / Waiver
Wire Dollars, the overlay for that year is ignored, so nothing has to be deleted. Career
totals and the universal points table are extended by the overlay rather than recomputed,
so the hand-kept historical numbers stay exactly as the commissioner has them.

### Changing the CSS or JS

```bash
python3 scripts/stamp_assets.py
```

Adds a content hash to every asset URL so browsers pick up a push immediately instead of
serving a stale bundle. Not needed for data-only changes.

### The script is year-agnostic

`build_data.py` discovers seasons from the sheet names, so a new `2026 Draft` tab appears
on the site without touching any code. It prints what it found and, at the end, any owner
spelling it could not resolve — if a new owner joins the league, add them to
`OWNER_ALIASES` near the top of the script.

Dependencies: `python3 -m pip install --user -r requirements.txt`

## Layout

```
index.html …  meeting.html   one page per section
assets/css/site.css          design system (both themes)
assets/js/app.js             shared runtime: data loading, tables, player sheet
assets/js/page-*.js          one module per page
assets/rulebook/             images extracted from the by-laws
data/*.json                  generated — do not edit by hand
data/drafts/<year>.json      one draft board per season
data/rosters/<year>.json     one roster/draft-detail set per season
scripts/build_data.py        the whole pipeline
```

### Privacy

The published site is public, so the build script scrubs two things on the way out. The
source `.xlsx` and `.docx` are never modified, and they are gitignored so they stay on
your machine.

- **Surnames.** Every league member is shown by first name only. Former owners who share
  a first name with a current one keep a last initial (`Jon F.`, `Ryan A.`) so old seasons
  stay unambiguous. This applies to free text too — record books, draft-board notes,
  fantasy team names and the by-laws.
- **Email addresses.** Addresses in the by-laws are replaced with a placeholder. Run
  `python3 scripts/build_data.py --keep-emails` if you ever want them published.

NFL player names are untouched, so "Emmanuel Sanders" and "Melvin Gordon" still read
normally.

### Data files

| File | What's in it |
| --- | --- |
| `meta.json` | league info, franchises, which years exist, per-season champions |
| `standings.json` | season finishes + the all-time universal table and record books |
| `stats.json` | career and per-season W/L, points, adds, trades |
| `keepers.json` | current keeper options with cost, contract years and acquisition |
| `players.json` | every player's draft history (year, round, owner, kept?) |
| `waivers.json` | waiver budgets by team and season |
| `meeting.json` | derived pre-draft brief: draft-slot order, keeper counts, carryover |
| `draftprep.json` | ESPN rankings joined to keeper costs, owners and value |
| `rulebook.json` | the by-laws as structured sections of HTML |

### Notes on the data

- Franchises are tracked by team number, so seasons played by a previous owner
  (Dan Gordon, Jon Foster, Ryan Aberdale, Tyler Moules) still line up with the current
  owner's history.
- Draft boards are authoritative for the round a player went in. Roster sheets number an
  owner's picks sequentially, which drifts from the true round when picks are traded, so
  they are only used to fill gaps and to supply keeper flags.
- 2014 and 2015 have no draft-board tab; their boards are reconstructed from the roster
  sheets and labelled as such on the page.

## Coming later: live draft board

The per-season `data/drafts/<year>.json` file is a self-contained document with the draft
order and one entry per pick, which is exactly what a draft-day page needs: point a live
board at the same file (regenerated or edited during the draft) and it renders with the
existing board component.
