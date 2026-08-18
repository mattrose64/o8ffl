import { $, el, load, fmt, ownerDot, fail } from "./app.js?v=bd49d9d9";

const tableHost = $("#waiverTable");

try {
  const waivers = await load("waivers.json");
  const years = waivers.years || [];
  const latest = years[years.length - 1];
  const derived = new Set(waivers.derived_years || []);
  const remainingYears = Object.keys(waivers.remaining || {}).map(Number).sort();
  const lastRemaining = remainingYears[remainingYears.length - 1];

  const rows = (waivers.teams || []).map((t) => ({
    ...t,
    latest: t.budgets[String(latest)] ?? null,
    avg:
      years.length && Object.keys(t.budgets).length
        ? +(
            Object.values(t.budgets).reduce((a, b) => a + b, 0) / Object.values(t.budgets).length
          ).toFixed(1)
        : null,
  }));

  const ranked = [...rows].sort((a, b) => (b.latest ?? 0) - (a.latest ?? 0));
  const leagueTotal = waivers.totals?.[String(latest)];

  $("#waiverSummary").replaceChildren(
    el(
      "div",
      { class: "grid grid-4" },
      card(`Biggest ${latest} budget`, ranked[0]?.owner ?? "—", fmt.money(ranked[0]?.latest)),
      card(`Smallest ${latest} budget`, ranked[ranked.length - 1]?.owner ?? "—", fmt.money(ranked[ranked.length - 1]?.latest)),
      card(
        lastRemaining ? `Spent it all in ${lastRemaining}` : `League total, ${latest}`,
        lastRemaining ? spentOut(waivers, lastRemaining, rows) : fmt.money(leagueTotal),
        lastRemaining ? "finished the season at $0" : `${rows.length} teams`
      ),
      card("Seasons tracked", String(years.length), years.length ? `${years[0]}–${latest}` : "")
    ),
    el(
      "p",
      { class: "notice", style: "margin-top:12px" },
      `Every column is what an owner starts that season with: $100 plus whatever was left over${
        waivers.cap ? `, capped at $${waivers.cap}` : ""
      }.` + (derived.size ? ` ${[...derived].join(", ")} is rolled forward from what each team had left at the end of the season before.` : "")
    )
  );

  /* ---- table: teams × seasons ---- */
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
        ...years.map((y) => el("th", { class: "num" }, derived.has(y) ? `${y}*` : String(y)))
      )
    ),
    el(
      "tbody",
      {},
      ...ranked.map((t) =>
        el(
          "tr",
          {},
          el("td", { class: "sticky-col" }, ownerDot(t.owner), t.owner),
          ...years.map((y) => {
            const v = t.budgets[String(y)];
            const intensity = v == null ? 0 : Math.max(0, Math.min(1, (v - 100) / 100));
            return el(
              "td",
              {
                class: "num",
                style: intensity
                  ? `background:color-mix(in srgb, var(--accent) ${Math.round(intensity * 34)}%, transparent)`
                  : "",
              },
              v == null ? "—" : fmt.money(v)
            );
          })
        )
      ),
      waivers.totals && Object.keys(waivers.totals).length
        ? el(
            "tr",
            { style: "font-weight:700" },
            el("td", { class: "sticky-col" }, "League total"),
            ...years.map((y) => el("td", { class: "num" }, fmt.money(waivers.totals[String(y)])))
          )
        : null
    )
  );
  tableHost.replaceChildren(el("div", { class: "table-wrap" }, table));

  /* ---- latest-season bars ---- */
  const max = Math.max(...ranked.map((r) => r.latest ?? 0), 1);
  $("#waiverChart").replaceChildren(
    el("h2", {}, `${latest} starting budgets`),
    el(
      "div",
      { class: "card" },
      ...ranked.map((t) =>
        el(
          "div",
          { style: "display:grid;grid-template-columns:110px 1fr 56px;gap:10px;align-items:center;padding:6px 0" },
          el("span", { style: "font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" }, ownerDot(t.owner), t.owner),
          el(
            "span",
            { class: "bar-track" },
            el("span", { class: "bar-fill", style: `width:${((t.latest ?? 0) / max) * 100}%;display:block` })
          ),
          el("span", { class: "num", style: "text-align:right;font-size:.85rem;font-weight:700" }, fmt.money(t.latest))
        )
      )
    )
  );
} catch (err) {
  fail(tableHost, err);
}

function spentOut(waivers, year, rows) {
  const remaining = waivers.remaining[String(year)] || {};
  const broke = rows.filter((t) => remaining[String(t.team)] === 0).map((t) => t.owner);
  return broke.length ? broke.join(", ") : "nobody";
}

function card(label, value, sub) {
  return el(
    "div",
    { class: "card stat" },
    el("span", { class: "label" }, label),
    el("span", { class: "value", style: "font-size:1.05rem" }, value),
    sub ? el("span", { class: "sub num" }, sub) : null
  );
}
