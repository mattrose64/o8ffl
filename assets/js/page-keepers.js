import { $, el, load, fmt, param, setParam, openPlayer, ownerDot, ownerHue, fail } from "./app.js?v=2e0d27af";

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
  const cheapest = rows.filter((r) => r.eligible && r.cost_round).sort((a, b) => b.cost_round - a.cost_round)[0];

  $("#keeperSummary").replaceChildren(
    el(
      "div",
      { class: "grid grid-4" },
      card("Players tracked", String(rows.length), `${owners.length} teams`),
      card("Keepable", String(rows.filter((r) => r.eligible).length), "have a listed round cost"),
      card("Contracts expiring", String(expiring.length), "must return to the pool"),
      card(
        "Latest-round keeper",
        cheapest ? cheapest.player : "—",
        cheapest ? `${cheapest.owner} keeps him for a round ${cheapest.cost_round}` : ""
      )
    ),
    el(
      "p",
      { class: "notice", style: "margin-top:12px" },
      `Keeper limit is 4 per team${
        keeperYear ? ` for ${keeperYear}` : ""
      }. Cost is the round pick you surrender — one round earlier than where he went last year, or a 6th for a free-agent pickup. For whether that price is worth paying, see the draft prep board.`
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
        el(
          "span",
          { class: `badge ${eligible === items.length ? "badge-green" : "badge-gold"}`, style: "margin-left:4px" },
          eligible === items.length ? `all ${eligible} keepable` : `${eligible} of ${items.length} keepable`
        )
      ),
      el("div", { class: "keeper-body" }, ...items.map(playerRow))
    );
  }

  function playerRow(row) {
    return el(
      "div",
      {
        class: "kp",
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
            [row.position, row.nfl_team].filter(Boolean).join(" ") || null,
            row.acquired,
            row.contract_years_remaining !== null
              ? row.contract_years_remaining === 0
                ? "contract up"
                : `${row.contract_years_remaining} more year${row.contract_years_remaining === 1 ? "" : "s"}`
              : null,
            row.year_signed ? `on the roster since ${row.year_signed}` : null,
            row.recent ? `went R${row.recent.round} in ${row.recent.year}` : "never drafted",
            row.history.length > 1 ? `${row.history.length} drafts, earliest R${row.best}` : null,
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
        !row.eligible ? el("span", { class: "badge badge-clay" }, row.cost_label || "Not keepable") : null
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
