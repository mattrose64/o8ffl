import { $, el, load, fmt, param, setParam, openPlayer, ownerDot, ownerHue, fail } from "./app.js?v=0a01fa05";

const view = $("#keeperView");

try {
  const [meta, keepersDoc, playersDoc] = await Promise.all([
    load("meta.json"),
    load("keepers.json"),
    load("players.json"),
  ]);

  const players = playersDoc.players || {};
  const keeperYear = keepersDoc.year || meta.years.keepers || meta.years.upcoming;
  const lastDraft = meta.years.latest_completed;

  // Decorate each keeper row with what the league has actually paid for that player.
  const rows = (keepersDoc.players || []).map((k) => {
    const history = (players[k.player_key]?.history || []).filter((h) => h.round);
    const recent = history.filter((h) => h.year <= lastDraft).sort((a, b) => b.year - a.year)[0] || null;
    const best = history.length ? Math.min(...history.map((h) => h.round)) : null;
    // Cost is last year's round minus one by rule, so comparing the two says nothing.
    // What's worth surfacing is a player who costs far later than he has ever gone —
    // usually a free-agent pickup (flat 6th) who used to be an early pick.
    const value = k.cost_round && best ? k.cost_round - best : null;
    return { ...k, history, recent, best, value, kept: history.filter((h) => h.keeper).length };
  });

  const state = {
    owner: param("owner") || "",
    query: param("q") || "",
    sort: param("sort") || "cost",
    onlyEligible: param("eligible") === "1",
  };

  const owners = [...new Set(rows.map((r) => r.owner).filter(Boolean))].sort();
  const ownerFilter = $("#ownerFilter");
  ownerFilter.replaceChildren(
    el("option", { value: "" }, "All teams"),
    ...owners.map((o) => el("option", { value: o }, o))
  );
  ownerFilter.value = owners.includes(state.owner) ? state.owner : "";
  ownerFilter.addEventListener("change", () => {
    state.owner = ownerFilter.value;
    setParam("owner", state.owner);
    render();
  });

  const search = $("#search");
  search.value = state.query;
  search.addEventListener("input", () => {
    state.query = search.value.trim();
    setParam("q", state.query);
    render();
  });

  const sortBy = $("#sortBy");
  sortBy.value = state.sort;
  sortBy.addEventListener("change", () => {
    state.sort = sortBy.value;
    setParam("sort", state.sort);
    render();
  });

  const eligibleBox = $("#onlyEligible");
  eligibleBox.checked = state.onlyEligible;
  eligibleBox.addEventListener("change", () => {
    state.onlyEligible = eligibleBox.checked;
    setParam("eligible", state.onlyEligible ? "1" : null);
    render();
  });

  const expiring = rows.filter((r) => r.contract_years_remaining === 0);
  const steals = rows
    .filter((r) => r.eligible && r.value !== null && r.value >= 3)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  $("#keeperSummary").replaceChildren(
    el(
      "div",
      { class: "grid grid-4" },
      card("Players tracked", String(rows.length), `${owners.length} teams`),
      card("Keepable", String(rows.filter((r) => r.eligible).length), "have a listed round cost"),
      card("Contracts expiring", String(expiring.length), "must return to the pool"),
      card(
        "Biggest bargain",
        steals[0] ? steals[0].player : "—",
        steals[0] ? `costs R${steals[0].cost_round}, has gone as early as R${steals[0].best}` : ""
      )
    ),
    el(
      "p",
      { class: "notice", style: "margin-top:12px" },
      `Keeper limit is 4 per team${
        keeperYear ? ` for ${keeperYear}` : ""
      }. Cost is the round pick you surrender — one round earlier than where he went last year, or a 6th for a free-agent pickup. Green means he costs later than he has ever been drafted.`
    )
  );

  function render() {
    const q = state.query.toLowerCase();
    let list = rows.filter((r) => {
      if (state.owner && r.owner !== state.owner) return false;
      if (state.onlyEligible && !r.eligible) return false;
      if (q && !(r.player || "").toLowerCase().includes(q)) return false;
      return true;
    });

    const sorters = {
      cost: (a, b) => (a.cost_round ?? 99) - (b.cost_round ?? 99) || a.player.localeCompare(b.player),
      "cost-desc": (a, b) => (b.cost_round ?? -1) - (a.cost_round ?? -1) || a.player.localeCompare(b.player),
      name: (a, b) => a.player.localeCompare(b.player),
      contract: (a, b) =>
        (a.contract_years_remaining ?? 9) - (b.contract_years_remaining ?? 9) || a.player.localeCompare(b.player),
    };
    list = [...list].sort(sorters[state.sort] || sorters.cost);

    if (!list.length) {
      view.replaceChildren(el("div", { class: "empty-state" }, "No players match those filters."));
      return;
    }

    const groups = new Map();
    for (const row of list) {
      if (!groups.has(row.owner)) groups.set(row.owner, []);
      groups.get(row.owner).push(row);
    }

    view.replaceChildren(
      ...[...groups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([owner, items]) => teamBlock(owner, items, groups.size === 1 || !!state.query))
    );
  }

  function teamBlock(owner, items, open) {
    const eligible = items.filter((i) => i.eligible).length;
    return el(
      "details",
      { class: "keeper-team", open: open || undefined },
      el(
        "summary",
        {},
        ownerDot(owner),
        el("span", {}, owner),
        el(
          "span",
          { class: "badge badge-plain", style: `margin-left:6px;border-color:hsl(${ownerHue(owner)} 50% 45% / .5)` },
          `${items.length} players`
        ),
        eligible < items.length
          ? el("span", { class: "badge badge-green", style: "margin-left:4px" }, `${eligible} keepable`)
          : null
      ),
      el("div", { class: "keeper-body" }, ...items.map(playerRow))
    );
  }

  function playerRow(row) {
    const tier = row.value === null ? "" : row.value >= 3 ? " tier-value" : row.value <= -1 ? " tier-elite" : "";
    return el(
      "div",
      {
        class: `kp${tier}`,
        onclick: () => openPlayer(row.player, { position: row.position }),
        role: "button",
        tabindex: "0",
        onkeydown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPlayer(row.player, { position: row.position });
          }
        },
      },
      el(
        "span",
        { class: "cost" },
        row.cost_round ? String(row.cost_round) : "—",
        el("small", {}, row.cost_round ? "RND" : "POOL")
      ),
      el(
        "span",
        { class: "name" },
        row.player,
        el(
          "span",
          {},
          [
            row.acquired,
            row.year_signed ? `signed ${row.year_signed}` : null,
            row.contract_years_remaining !== null
              ? `${row.contract_years_remaining} yr${row.contract_years_remaining === 1 ? "" : "s"} left`
              : null,
            row.recent ? `last drafted R${row.recent.round} in ${row.recent.year}` : "never drafted",
            row.best && row.recent && row.best !== row.recent.round ? `best R${row.best}` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        )
      ),
      el(
        "span",
        { class: "tags" },
        row.rookie ? el("span", { class: "badge badge-plain" }, "Rookie") : null,
        row.kept
          ? el(
              "span",
              { class: "badge badge-gold", title: `Kept as a keeper in ${row.kept} season(s), by any owner` },
              `Kept ×${row.kept}`
            )
          : null,
        row.value !== null && row.value >= 3
          ? el("span", { class: "badge badge-green", title: `Costs R${row.cost_round}; has gone as early as R${row.best}` }, `bargain +${row.value}`)
          : null,
        !row.eligible ? el("span", { class: "badge badge-clay" }, row.cost_label || "Not keepable") : null,
        historySpark(row.history)
      )
    );
  }

  function historySpark(history) {
    if (!history.length) return null;
    const recent = history.slice(-6);
    return el(
      "span",
      { class: "spark", title: recent.map((h) => `${h.year}: R${h.round}`).join(" · ") },
      ...recent.map((h) =>
        el("i", {
          style: `height:${Math.max(3, 22 - (h.round - 1) * 1.15)}px;background:${
            h.keeper ? "var(--gold)" : "var(--line-strong)"
          }`,
        })
      )
    );
  }

  render();
} catch (err) {
  fail(view, err);
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
