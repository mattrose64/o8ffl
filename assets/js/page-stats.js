import { $, $$, el, load, fmt, param, setParam, sortable, ownerDot, fail } from "./app.js";

const careerView = $("#careerView");
const seasonView = $("#seasonView");

try {
  const [meta, stats] = await Promise.all([load("meta.json"), load("stats.json")]);

  /* ---- career ---- */
  const career = (stats.career || []).map((c) => ({
    ...c,
    games: (c.wins ?? 0) + (c.losses ?? 0),
    ppg: c.points_for && c.wins != null ? +(c.points_for / ((c.wins ?? 0) + (c.losses ?? 0))).toFixed(2) : null,
  }));

  const careerTable = el(
    "table",
    {},
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("th", { class: "sticky-col" }, "Owner"),
        el("th", { class: "num", "data-sort": "wins" }, "W"),
        el("th", { class: "num", "data-sort": "losses", "data-dir": "asc" }, "L"),
        el("th", { class: "num", "data-sort": "win_pct" }, "Win %"),
        el("th", { class: "num", "data-sort": "points_for" }, "Points for"),
        el("th", { class: "num", "data-sort": "points_against" }, "Points against"),
        el("th", { class: "num", "data-sort": "plus_minus" }, "+/−"),
        el("th", { class: "num", "data-sort": "ppg" }, "Pts/game"),
        el("th", { class: "num", "data-sort": "acquires" }, "Adds"),
        el("th", { class: "num", "data-sort": "trades" }, "Trades")
      )
    ),
    el("tbody", {})
  );
  const careerBody = careerTable.querySelector("tbody");

  const paintCareer = (rows) => {
    const maxPF = Math.max(...rows.map((r) => r.points_for ?? 0));
    careerBody.replaceChildren(
      ...rows.map((r) =>
        el(
          "tr",
          {},
          el("td", { class: "sticky-col" }, ownerDot(r.owner), r.owner),
          el("td", { class: "num" }, fmt.num(r.wins)),
          el("td", { class: "num" }, fmt.num(r.losses)),
          el("td", { class: "num" }, fmt.pct(r.win_pct)),
          el(
            "td",
            { class: "num" },
            el(
              "div",
              { style: "display:flex;align-items:center;gap:8px;justify-content:flex-end" },
              el("span", {}, fmt.num(r.points_for, 0)),
              el(
                "span",
                { class: "bar-track", style: "width:52px;flex:0 0 auto" },
                el("span", { class: "bar-fill", style: `width:${((r.points_for ?? 0) / maxPF) * 100}%;display:block` })
              )
            )
          ),
          el("td", { class: "num" }, fmt.num(r.points_against, 0)),
          el(
            "td",
            {
              class: "num",
              style: `color:${r.plus_minus > 0 ? "var(--accent)" : r.plus_minus < 0 ? "var(--clay)" : "inherit"}`,
            },
            fmt.signed(r.plus_minus, 1)
          ),
          el("td", { class: "num" }, fmt.num(r.ppg, 1)),
          el("td", { class: "num" }, fmt.num(r.acquires)),
          el("td", { class: "num" }, fmt.num(r.trades))
        )
      )
    );
  };

  const leaders = [
    ["Most wins", [...career].sort((a, b) => b.wins - a.wins)[0], (r) => `${r.wins}-${r.losses}`],
    ["Most points", [...career].sort((a, b) => b.points_for - a.points_for)[0], (r) => fmt.num(r.points_for, 0)],
    [
      "Best differential",
      [...career].sort((a, b) => b.plus_minus - a.plus_minus)[0],
      (r) => fmt.signed(r.plus_minus, 1),
    ],
    ["Most active", [...career].sort((a, b) => b.acquires - a.acquires)[0], (r) => `${r.acquires} adds`],
  ];

  careerView.replaceChildren(
    el(
      "div",
      { class: "grid grid-4", style: "margin-bottom:14px" },
      ...leaders
        .filter(([, row]) => row)
        .map(([label, row, fn]) =>
          el(
            "div",
            { class: "card stat" },
            el("span", { class: "label" }, label),
            el("span", { class: "value", style: "font-size:1.05rem" }, row.owner),
            el("span", { class: "sub num" }, fn(row))
          )
        )
    ),
    el("div", { class: "table-wrap" }, careerTable)
  );
  sortable(careerTable, career, paintCareer, { key: "wins", dir: "desc" });

  /* ---- by season ---- */
  const years = [...meta.years.stats].sort((a, b) => b - a);
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

  function pick(y) {
    year = y;
    setParam("year", y);
    $$("#yearPills .pill").forEach((p) => p.classList.toggle("active", Number(p.dataset.year) === y));
    renderSeason(y);
  }

  function renderSeason(y) {
    const rows = (stats.seasons[String(y)] || []).map((r) => ({
      ...r,
      diff: r.points_for != null && r.points_against != null ? +(r.points_for - r.points_against).toFixed(2) : null,
      ppg: r.points_for && r.wins != null ? +(r.points_for / ((r.wins ?? 0) + (r.losses ?? 0))).toFixed(2) : null,
    }));

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
          el("th", { class: "num", "data-sort": "wins" }, "W"),
          el("th", { class: "num", "data-sort": "losses", "data-dir": "asc" }, "L"),
          el("th", { class: "num", "data-sort": "points_for" }, "PF"),
          el("th", { class: "num", "data-sort": "points_against" }, "PA"),
          el("th", { class: "num", "data-sort": "diff" }, "+/−"),
          el("th", { class: "num", "data-sort": "ppg" }, "Pts/game"),
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
            el("td", { class: "sticky-col" }, ownerDot(r.owner), r.owner),
            el("td", { class: "num" }, fmt.num(r.wins)),
            el("td", { class: "num" }, fmt.num(r.losses)),
            el("td", { class: "num" }, fmt.num(r.points_for, 2)),
            el("td", { class: "num" }, fmt.num(r.points_against, 2)),
            el(
              "td",
              { class: "num", style: `color:${r.diff > 0 ? "var(--accent)" : r.diff < 0 ? "var(--clay)" : "inherit"}` },
              fmt.signed(r.diff, 2)
            ),
            el("td", { class: "num" }, fmt.num(r.ppg, 1)),
            el("td", { class: "num" }, fmt.num(r.acquires)),
            el("td", { class: "num" }, fmt.num(r.trades))
          )
        )
      );

    seasonView.replaceChildren(el("div", { class: "table-wrap" }, table));
    sortable(table, rows, paint, { key: "wins", dir: "desc" });
  }

  renderSeason(year);

  const tabCareer = $("#tabCareer");
  const tabSeason = $("#tabSeason");
  const show = (isCareer) => {
    tabCareer.classList.toggle("active", isCareer);
    tabSeason.classList.toggle("active", !isCareer);
    $("#careerPanel").hidden = !isCareer;
    $("#seasonPanel").hidden = isCareer;
    setParam("tab", isCareer ? null : "season");
  };
  tabCareer.addEventListener("click", () => show(true));
  tabSeason.addEventListener("click", () => show(false));
  if (param("tab") === "season") show(false);
} catch (err) {
  fail(careerView, err);
}
