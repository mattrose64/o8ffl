import { $, el, load, fmt, param, setParam, sortable, openPlayer, ownerDot, fail } from "./app.js?v=705f2550";

const host = $("#prepTable");

try {
  const prep = await load("draftprep.json");
  const all = prep.players || [];

  const state = {
    query: param("q") || "",
    position: param("pos") || "",
    owner: param("owner") || "",
    top: Number(param("top")) || 200,
  };

  $("#prepTitle").textContent = `${prep.year} draft board`;
  $("#prepSub").textContent =
    `ESPN's preseason ranking, blended to half-point PPR to match league scoring, crossed with who ` +
    `owns each player and what he costs to keep. Value weights a keeper round at ten points — a ` +
    `2nd-round keeper is charged 20 — so a top-five player kept for a 2nd scores +15. Higher is better.`;

  /* ---- filter controls ---- */
  const positions = [...new Set(all.map((p) => p.position).filter(Boolean))].sort();
  const owners = [...new Set(all.map((p) => p.owner).filter(Boolean))].sort();

  const posFilter = $("#posFilter");
  posFilter.append(...positions.map((p) => el("option", { value: p }, p)));
  posFilter.value = state.position;
  posFilter.addEventListener("change", () => {
    state.position = posFilter.value;
    setParam("pos", state.position);
    apply();
  });

  const ownerFilter = $("#ownerFilter");
  ownerFilter.append(...owners.map((o) => el("option", { value: o }, o)));
  ownerFilter.value = state.owner;
  ownerFilter.addEventListener("change", () => {
    state.owner = ownerFilter.value;
    setParam("owner", state.owner);
    apply();
  });

  const topFilter = $("#topFilter");
  topFilter.value = String(state.top);
  topFilter.addEventListener("change", () => {
    state.top = Number(topFilter.value);
    setParam("top", state.top === 200 ? null : state.top);
    apply();
  });

  const search = $("#search");
  search.value = state.query;
  search.addEventListener("input", () => {
    state.query = search.value.trim();
    setParam("q", state.query);
    apply();
  });

  /* ---- summary ---- */
  const bestValue = [...all].filter((p) => p.value !== null).sort((a, b) => b.value - a.value)[0];
  const topAvailable = all.find((p) => !p.owner);
  $("#prepSummary").replaceChildren(
    el(
      "div",
      { class: "grid grid-4" },
      card("Players ranked", String(all.length), `${prep.matched_to_rosters} already rostered`),
      card("Available", String(all.filter((p) => !p.owner).length), "not on anyone's roster"),
      card(
        "Best keeper value",
        bestValue ? bestValue.player : "—",
        bestValue ? `#${bestValue.rank} for a round ${bestValue.cost_round} — ${fmt.signed(bestValue.value, 0)}` : ""
      ),
      card(
        "Top player available",
        topAvailable ? topAvailable.player : "—",
        topAvailable ? `ESPN #${topAvailable.rank} · ${topAvailable.position}` : ""
      )
    )
  );

  /* ---- table ---- */
  const table = el(
    "table",
    {},
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("th", { class: "num", "data-sort": "rank", "data-dir": "asc" }, "ESPN"),
        el("th", { class: "sticky-col" }, "Player"),
        el("th", {}, "NFL"),
        el("th", { "data-sort": "position", "data-dir": "asc" }, "Pos"),
        el("th", { "data-sort": "owner", "data-dir": "asc" }, "O8FFL owner"),
        el("th", { class: "num", "data-sort": "cost_round", "data-dir": "asc" }, "Keeper cost"),
        el("th", { class: "num", "data-sort": "years_remaining", "data-dir": "asc" }, "Yrs left"),
        el("th", { class: "num", "data-sort": "value" }, "Value")
      )
    ),
    el("tbody", {})
  );
  const body = table.querySelector("tbody");

  const paint = (rows) => {
    if (!rows.length) {
      body.replaceChildren(el("tr", {}, el("td", { colspan: "8" }, el("div", { class: "empty-state" }, "Nothing matches those filters."))));
      return;
    }
    body.replaceChildren(
      ...rows.map((r) =>
        el(
          "tr",
          { onclick: () => openPlayer(r.player, { position: r.position }), style: "cursor:pointer" },
          el("td", { class: "num rank" }, r.rank),
          el("td", { class: "sticky-col", style: "font-weight:650" }, r.player),
          el("td", { style: "color:var(--text-faint)" }, r.nfl_team || "—"),
          el("td", {}, el("span", { class: "badge badge-plain" }, r.position || "—")),
          el(
            "td",
            {},
            r.owner
              ? el("span", {}, ownerDot(r.owner), r.owner)
              : el("span", { class: "badge badge-green" }, "Available")
          ),
          el("td", { class: "num" }, keeperCost(r)),
          el("td", { class: "num" }, r.years_remaining === null || r.years_remaining === undefined ? "—" : r.years_remaining),
          el(
            "td",
            {
              class: "num",
              style:
                r.value === null
                  ? ""
                  : `font-weight:700;color:${r.value > 0 ? "var(--accent)" : r.value < -40 ? "var(--clay)" : "inherit"}`,
            },
            r.value === null ? "—" : fmt.signed(r.value, 0)
          )
        )
      )
    );
  };

  host.replaceChildren(
    el("p", { id: "prepShowing", class: "eyebrow", style: "margin-bottom:8px" }),
    el("div", { class: "table-wrap" }, table)
  );

  const sorter = sortable(table, all, paint, { key: "rank", dir: "asc" });

  function apply() {
    const q = state.query.toLowerCase();
    const rows = all.filter((p) => {
      if (p.rank > state.top) return false;
      if (state.position && p.position !== state.position) return false;
      if (state.owner === "__free" && p.owner) return false;
      if (state.owner === "__owned" && !p.owner) return false;
      if (state.owner && !state.owner.startsWith("__") && p.owner !== state.owner) return false;
      if (q && !(p.player || "").toLowerCase().includes(q)) return false;
      return true;
    });
    sorter.setRows(rows);
    $("#prepShowing").textContent = `${rows.length} of ${all.length} ranked players`;
  }

  apply();
} catch (err) {
  fail(host, err);
}

function keeperCost(row) {
  if (row.cost_round) {
    return el("span", { title: `Counts as ${row.cost_round * 10} against the ranking` }, `R${row.cost_round}`);
  }
  if (row.cost_label) return el("span", { class: "badge badge-clay" }, row.cost_label);
  return "—";
}

function card(label, value, sub) {
  return el(
    "div",
    { class: "card stat" },
    el("span", { class: "label" }, label),
    el("span", { class: "value", style: "font-size:1.05rem" }, value),
    sub ? el("span", { class: "sub" }, sub) : null
  );
}
