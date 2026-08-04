import { $, el, load, fmt, ownerDot, fail } from "./app.js?v=0a01fa05";

const tableHost = $("#waiverTable");

try {
  const waivers = await load("waivers.json");
  const years = waivers.years || [];
  const latest = years[years.length - 1];

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
      card(`Most left, ${latest}`, ranked[0]?.owner ?? "—", fmt.money(ranked[0]?.latest)),
      card(`Least left, ${latest}`, ranked[ranked.length - 1]?.owner ?? "—", fmt.money(ranked[ranked.length - 1]?.latest)),
      card(`League total, ${latest}`, fmt.money(leagueTotal), `${rows.length} teams`),
      card("Seasons tracked", String(years.length), years.length ? `${years[0]}–${latest}` : "")
    ),
    waivers.note ? el("p", { class: "notice", style: "margin-top:12px" }, waivers.note) : null
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
        ...years.map((y) => el("th", { class: "num" }, y))
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
    el("h2", {}, `${latest} ending budgets`),
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

function card(label, value, sub) {
  return el(
    "div",
    { class: "card stat" },
    el("span", { class: "label" }, label),
    el("span", { class: "value", style: "font-size:1.05rem" }, value),
    sub ? el("span", { class: "sub num" }, sub) : null
  );
}
