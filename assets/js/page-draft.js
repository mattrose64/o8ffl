import { $, $$, el, load, param, setParam, openPlayer, ownerDot, ownerHue, fail } from "./app.js?v=bb7283a2";

const view = $("#draftView");
const state = { year: null, board: null, query: "", owner: "", mode: "board" };
let metaYears = {};

try {
  const meta = await load("meta.json");
  metaYears = meta.years;
  const years = [...meta.years.drafts].sort((a, b) => b - a);
  state.year = Number(param("year")) || years[0];
  if (!years.includes(state.year)) state.year = years[0];
  state.owner = param("owner") || "";
  state.query = param("q") || "";
  state.mode = param("view") === "list" ? "list" : "board";

  $("#yearPills").replaceChildren(
    ...years.map((year) =>
      el(
        "button",
        {
          class: `pill${year === state.year ? " active" : ""}`,
          type: "button",
          dataset: { year },
          onclick: () => selectYear(year),
        },
        year
      )
    )
  );

  const search = $("#search");
  search.value = state.query;
  search.addEventListener("input", () => {
    state.query = search.value.trim();
    setParam("q", state.query);
    render();
  });

  $("#ownerFilter").addEventListener("change", (e) => {
    state.owner = e.target.value;
    setParam("owner", state.owner);
    render();
  });

  $("#viewBoard").addEventListener("click", () => setMode("board"));
  $("#viewList").addEventListener("click", () => setMode("list"));
  setMode(state.mode);

  await selectYear(state.year, true);
} catch (err) {
  fail(view, err);
}

function setMode(mode) {
  state.mode = mode;
  setParam("view", mode === "list" ? "list" : null);
  $("#viewBoard").classList.toggle("active", mode === "board");
  $("#viewList").classList.toggle("active", mode === "list");
  render();
}

async function selectYear(year, initial = false) {
  state.year = year;
  setParam("year", year);
  $$("#yearPills .pill").forEach((p) => p.classList.toggle("active", Number(p.dataset.year) === year));
  view.replaceChildren(el("div", { class: "loading" }, "Loading draft…"));

  state.board = await load(`drafts/${year}.json`);

  const owners = state.board.order.map((o) => o.owner).filter(Boolean);
  const select = $("#ownerFilter");
  const keep = state.owner;
  select.replaceChildren(
    el("option", { value: "" }, "All owners"),
    ...[...new Set(owners)].sort().map((o) => el("option", { value: o }, o))
  );
  select.value = owners.includes(keep) ? keep : "";
  state.owner = select.value;

  $("#draftTitle").textContent = `${year} draft`;
  const picks = state.board.rounds.reduce((n, r) => n + r.picks.filter((p) => p.player).length, 0);
  const upcoming = year > (metaYears.latest_completed ?? 0);
  $("#draftSub").textContent = upcoming
    ? `This draft hasn't happened yet — ${picks} keeper placements and traded picks logged so far.`
    : `${state.board.rounds.length} rounds · ${picks} picks recorded · draft order runs left to right${
        state.board.source === "roster sheet" ? " (reconstructed from that season's roster sheet)" : ""
      }.`;

  $("#draftMeta").replaceChildren(
    el(
      "div",
      { class: "card card-tight" },
      el("p", { class: "eyebrow", style: "margin-bottom:8px" }, "Draft order"),
      el(
        "div",
        { style: "display:flex;flex-wrap:wrap;gap:6px" },
        ...state.board.order.map((o) =>
          el(
            "span",
            {
              class: "badge badge-plain",
              style: `border-color:hsl(${ownerHue(o.owner)} 50% 45% / .5)`,
            },
            `${o.slot}. ${o.owner}`
          )
        )
      )
    )
  );

  renderNotes();
  render();
  if (!initial) window.scrollTo({ top: 0, behavior: "smooth" });
}

function matches(pick) {
  if (!state.query) return null;
  const q = state.query.toLowerCase();
  return pick.player ? pick.player.toLowerCase().includes(q) : false;
}

function render() {
  if (!state.board) return;
  view.replaceChildren(state.mode === "board" ? renderBoard() : renderList());
}

function renderBoard() {
  const cols = state.board.order.filter((o) => !state.owner || o.owner === state.owner);
  if (!cols.length) return el("div", { class: "empty-state" }, "No picks for that owner this season.");

  const head = el(
    "tr",
    {},
    el("th", { class: "rnd" }, ""),
    ...cols.map((o) =>
      el(
        "th",
        { style: `border-bottom:2px solid hsl(${ownerHue(o.owner)} 55% 48%)` },
        el("span", { style: "display:block;font-size:.8rem;color:var(--text);letter-spacing:0" }, o.owner),
        el("span", { style: "font-size:.62rem" }, `Pick ${o.slot}`)
      )
    )
  );

  const rows = state.board.rounds.map((rnd) =>
    el(
      "tr",
      {},
      el("td", { class: "rnd" }, rnd.round),
      ...cols.map((col) => {
        const pick = rnd.picks.find((p) => p.slot === col.slot) || {};
        return el("td", {}, cellFor(pick, rnd.round));
      })
    )
  );

  return el(
    "div",
    { class: "table-wrap" },
    el("table", { class: "board" }, el("thead", {}, head), el("tbody", {}, ...rows))
  );
}

function cellFor(pick, round) {
  const hit = matches(pick);
  if (!pick.player) {
    return el(
      "span",
      { class: "pick empty" + (pick.traded_to ? " traded" : "") },
      pick.traded_to
        ? el("span", { class: "p-meta" }, `→ traded to ${pick.traded_to}`)
        : el("span", { class: "p-meta" }, "—")
    );
  }
  return el(
    "button",
    {
      type: "button",
      class: `pick${pick.keeper ? " keeper" : ""}${hit === true ? " hit" : ""}${hit === false ? " dim" : ""}`,
      onclick: () => openPlayer(pick.player, { position: pick.position, year: state.year }),
    },
    el("span", { class: "p-name" }, pick.player),
    el(
      "span",
      { class: "p-meta" },
      [pick.position, pick.nfl_team].filter(Boolean).join(" · "),
      pick.keeper ? (pick.position || pick.nfl_team ? " · KEPT" : "KEPT") : ""
    )
  );
}

function renderList() {
  const blocks = [];
  for (const rnd of state.board.rounds) {
    const picks = rnd.picks.filter(
      (p) => (p.player || p.traded_to) && (!state.owner || p.owner === state.owner) && matches(p) !== false
    );
    if (!picks.length) continue;
    blocks.push(
      el(
        "div",
        { class: "round-block" },
        el("h3", {}, `Round ${rnd.round}`),
        ...picks.map((pick) =>
          el(
            "div",
            {
              class: "pick-row",
              onclick: pick.player ? () => openPlayer(pick.player, { position: pick.position }) : null,
            },
            el("span", { class: "slot" }, pick.slot),
            el(
              "span",
              { class: "who" },
              el("b", {}, pick.player || `— traded to ${pick.traded_to} —`),
              el("span", {}, [pick.owner, pick.position, pick.nfl_team].filter(Boolean).join(" · "))
            ),
            pick.keeper ? el("span", { class: "badge badge-gold" }, "Keeper") : null
          )
        )
      )
    );
  }
  if (!blocks.length) return el("div", { class: "empty-state" }, "Nothing matches those filters.");
  return el("div", {}, ...blocks);
}

function renderNotes() {
  const notes = state.board.notes || [];
  const target = $("#draftNotes");
  if (!notes.length) return target.replaceChildren();
  target.replaceChildren(
    el(
      "div",
      { class: "card" },
      el("p", { class: "eyebrow" }, "Keeper & trade notes from the board"),
      ...notes.map((note) =>
        el(
          "div",
          { style: "margin-bottom:10px" },
          el("p", { class: "eyebrow", style: "color:var(--text-dim);margin-bottom:4px" }, note.label),
          el(
            "div",
            { style: "display:flex;flex-wrap:wrap;gap:6px" },
            ...note.entries.map((entry) =>
              el("span", { class: "badge badge-plain" }, ownerDot(entry.owner), `${entry.owner}: ${entry.text}`)
            )
          )
        )
      )
    )
  );
}
