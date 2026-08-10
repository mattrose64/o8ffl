import { $, $$, el, load, fmt, param, setParam, sortable, ownerDot, ownerHue, fail } from "./app.js?v=8f44634b";

const seasonView = $("#seasonView");
const allTimeView = $("#allTimeView");

try {
  const [meta, standings, stats] = await Promise.all([
    load("meta.json"),
    load("standings.json"),
    load("stats.json"),
  ]);

  const years = [...meta.years.standings].sort((a, b) => b - a);
  let year = Number(param("year")) || years[0];
  if (!years.includes(year)) year = years[0];

  $("#yearPills").replaceChildren(
    ...years.map((y) =>
      el(
        "button",
        { class: `pill${y === year ? " active" : ""}`, type: "button", dataset: { year: y }, onclick: () => pick(y) },
        y
      )
    )
  );

  const tabSeason = $("#tabSeason");
  const tabAll = $("#tabAllTime");
  const showTab = (which) => {
    const isSeason = which === "season";
    tabSeason.classList.toggle("active", isSeason);
    tabAll.classList.toggle("active", !isSeason);
    $("#seasonPanel").hidden = !isSeason;
    $("#allTimePanel").hidden = isSeason;
    setParam("tab", isSeason ? "season" : null);
  };
  tabSeason.addEventListener("click", () => showTab("season"));
  tabAll.addEventListener("click", () => showTab("alltime"));
  // All-time is the default view; ?tab=season opens a single year.
  showTab(param("tab") === "season" ? "season" : "alltime");

  function pick(y) {
    year = y;
    setParam("year", y);
    $$("#yearPills .pill").forEach((p) => p.classList.toggle("active", Number(p.dataset.year) === y));
    renderSeason(y);
  }

  function renderSeason(y) {
    const season = standings.seasons[String(y)] || { regular: [], playoff: [] };
    const seasonStats = stats.seasons[String(y)] || [];
    const byOwner = new Map(seasonStats.map((s) => [s.owner, s]));
    const finalPlace = new Map(season.playoff.map((p) => [p.owner, p.place]));

    const rows = season.regular.map((entry) => {
      const s = byOwner.get(entry.owner) || {};
      return {
        place: entry.place,
        owner: entry.owner,
        team: entry.team,
        wins: s.wins ?? null,
        losses: s.losses ?? null,
        ties: s.ties ?? null,
        points_for: s.points_for ?? null,
        points_against: s.points_against ?? null,
        diff: s.points_for != null && s.points_against != null ? +(s.points_for - s.points_against).toFixed(2) : null,
        acquires: s.acquires ?? null,
        trades: s.trades ?? null,
        final: finalPlace.get(entry.owner) ?? null,
      };
    });

    const hasTies = rows.some((r) => r.ties);
    const table = el(
      "table",
      {},
      el(
        "thead",
        {},
        el(
          "tr",
          {},
          el("th", { "data-sort": "place", "data-dir": "asc", class: "sticky-col" }, "Reg."),
          el("th", {}, "Owner"),
          el("th", { "data-sort": "final", "data-dir": "asc" }, "Final"),
          el("th", { class: "num", "data-sort": "wins" }, "W"),
          el("th", { class: "num", "data-sort": "losses", "data-dir": "asc" }, "L"),
          hasTies ? el("th", { class: "num", "data-sort": "ties" }, "T") : null,
          el("th", { class: "num", "data-sort": "points_for" }, "PF"),
          el("th", { class: "num", "data-sort": "points_against" }, "PA"),
          el("th", { class: "num", "data-sort": "diff" }, "+/−"),
          el("th", { class: "num", "data-sort": "acquires" }, "Adds"),
          el("th", { class: "num", "data-sort": "trades" }, "Trades")
        )
      ),
      el("tbody", {})
    );

    const body = table.querySelector("tbody");
    const paint = (sorted) =>
      body.replaceChildren(
        ...sorted.map((r) =>
          el(
            "tr",
            {},
            el("td", { class: "rank sticky-col" }, r.place ?? "—"),
            el("td", {}, ownerDot(r.owner), r.owner),
            el("td", {}, placeBadge(r.final)),
            el("td", { class: "num" }, fmt.num(r.wins)),
            el("td", { class: "num" }, fmt.num(r.losses)),
            hasTies ? el("td", { class: "num" }, r.ties ? fmt.num(r.ties) : "—") : null,
            el("td", { class: "num" }, fmt.num(r.points_for, 2)),
            el("td", { class: "num" }, fmt.num(r.points_against, 2)),
            el(
              "td",
              { class: "num", style: `color:${r.diff > 0 ? "var(--accent)" : r.diff < 0 ? "var(--clay)" : "inherit"}` },
              fmt.signed(r.diff, 2)
            ),
            el("td", { class: "num" }, fmt.num(r.acquires)),
            el("td", { class: "num" }, fmt.num(r.trades))
          )
        )
      );

    const podium = season.playoff.filter((p) => p.place <= 3);
    const moules = season.playoff.find((p) => p.place === 10);

    seasonView.replaceChildren(
      el(
        "div",
        { class: "grid grid-4", style: "margin-bottom:14px" },
        ...podium.map((p) =>
          el(
            "div",
            { class: "card stat" },
            el("span", { class: "label" }, p.place === 1 ? "Champion" : p.place === 2 ? "Runner-up" : "Third"),
            el("span", { class: "value", style: "font-size:1.05rem" }, `${p.place === 1 ? "🏆 " : ""}${p.owner}`)
          )
        ),
        moules
          ? el(
              "div",
              { class: "card stat" },
              el("span", { class: "label" }, "The Moules"),
              el("span", { class: "value", style: "font-size:1.05rem;color:var(--clay)" }, moules.owner)
            )
          : null
      ),
      el("div", { class: "table-wrap" }, table)
    );

    sortable(table, rows, paint, { key: "place", dir: "asc" });
  }

  function renderAllTime() {
    const titles = standings.universal?.titles || [];
    const finishes = new Map((standings.universal?.finishes || []).map((f) => [f.team, f]));
    const career = new Map((stats.career || []).map((c) => [c.team, c]));

    const rows = titles.map((t) => {
      const f = finishes.get(t.team) || {};
      const c = career.get(t.team) || {};
      return {
        owner: t.owner,
        team: t.team,
        points: t.points,
        championships: t.championships,
        finalist: t.finalist,
        playoffs: t.playoffs,
        moules: t.moules,
        avg_combined: f.avg_combined ?? null,
        avg_regular: f.avg_regular ?? null,
        avg_playoff: f.avg_playoff ?? null,
        win_pct: c.win_pct ?? null,
      };
    });

    const table = el(
      "table",
      {},
      el(
        "thead",
        {},
        el(
          "tr",
          {},
          el("th", { class: "sticky-col" }, "Owner"),
          el("th", { class: "num", "data-sort": "team", "data-dir": "asc" }, "Team"),
          el("th", { class: "num", "data-sort": "points" }, "Pts"),
          el("th", { class: "num", "data-sort": "championships" }, "🏆"),
          el("th", { class: "num", "data-sort": "finalist" }, "Finals"),
          el("th", { class: "num", "data-sort": "playoffs" }, "Playoffs"),
          el("th", { class: "num", "data-sort": "moules", "data-dir": "asc" }, "Moules"),
          el("th", { class: "num", "data-sort": "win_pct" }, "Win %"),
          el("th", { class: "num", "data-sort": "avg_combined", "data-dir": "asc" }, "Avg finish"),
          el("th", { class: "num", "data-sort": "avg_regular", "data-dir": "asc" }, "Avg reg."),
          el("th", { class: "num", "data-sort": "avg_playoff", "data-dir": "asc" }, "Avg playoff")
        )
      ),
      el("tbody", {})
    );
    const body = table.querySelector("tbody");
    const paint = (sorted) =>
      body.replaceChildren(
        ...sorted.map((r, i) =>
          el(
            "tr",
            {},
            el("td", { class: "sticky-col" }, ownerDot(r.owner), r.owner),
            el("td", { class: "num", style: "color:var(--text-faint)" }, r.team),
            el("td", { class: "num", style: "font-weight:800" }, fmt.num(r.points)),
            el("td", { class: "num" }, r.championships ? el("span", { class: "badge badge-gold" }, r.championships) : "—"),
            el("td", { class: "num" }, fmt.num(r.finalist)),
            el("td", { class: "num" }, fmt.num(r.playoffs)),
            el("td", { class: "num" }, r.moules ? el("span", { class: "badge badge-clay" }, r.moules) : "—"),
            el("td", { class: "num" }, fmt.pct(r.win_pct)),
            el("td", { class: "num" }, fmt.num(r.avg_combined, 2)),
            el("td", { class: "num" }, fmt.num(r.avg_regular, 2)),
            el("td", { class: "num" }, fmt.num(r.avg_playoff, 2))
          )
        )
      );

    allTimeView.replaceChildren(
      el(
        "p",
        { class: "notice", style: "margin-bottom:14px" },
        "Universal points: championship = 3, finals appearance = 2, playoff berth = 1, the Moules = −1. " +
          "Team is the franchise number — records follow the franchise, so a season played by a previous " +
          "owner still counts toward the same line."
      ),
      el("div", { class: "table-wrap" }, table),
      el("div", { class: "section" }, el("h2", {}, "Finish grid"), gridView())
    );
    sortable(table, rows, paint, { key: "points", dir: "desc" });
  }

  function gridView() {
    const years = [...meta.years.standings].sort((a, b) => a - b);
    const owners = [...new Set(meta.teams.map((t) => t.owner))].sort();
    const lookup = new Map();
    for (const y of years) {
      for (const entry of standings.seasons[String(y)]?.playoff || []) {
        lookup.set(`${entry.team}:${y}`, entry.place);
      }
    }
    const table = el(
      "table",
      {},
      el(
        "thead",
        {},
        el("tr", {}, el("th", { class: "sticky-col" }, "Owner"), ...years.map((y) => el("th", { class: "num" }, y)))
      ),
      el(
        "tbody",
        {},
        ...meta.teams.map((team) =>
          el(
            "tr",
            {},
            el("td", { class: "sticky-col" }, ownerDot(team.owner), team.owner),
            ...years.map((y) => {
              const place = lookup.get(`${team.team}:${y}`);
              const tone =
                place === 1
                  ? "background:color-mix(in srgb,var(--gold) 30%,transparent);font-weight:800"
                  : place === 10
                  ? "background:color-mix(in srgb,var(--clay) 24%,transparent)"
                  : place && place <= 3
                  ? "background:color-mix(in srgb,var(--accent) 18%,transparent)"
                  : "";
              return el("td", { class: "num", style: tone }, place ?? "·");
            })
          )
        )
      )
    );
    return el("div", { class: "table-wrap" }, table);
  }

  function placeBadge(place) {
    if (!place) return "—";
    if (place === 1) return el("span", { class: "badge badge-gold" }, "🏆 1st");
    if (place === 2) return el("span", { class: "badge badge-green" }, "2nd");
    if (place === 10) return el("span", { class: "badge badge-clay" }, "Moules");
    return el("span", { class: "badge badge-plain" }, fmt.ord(place));
  }

  renderSeason(year);
  renderAllTime();
} catch (err) {
  fail(seasonView, err);
}
