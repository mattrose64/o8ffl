import { $, el, load, fmt, ownerDot, fail } from "./app.js?v=0a01fa05";

const body = $("#meetingBody");

try {
  const [meta, meeting, waivers, book] = await Promise.all([
    load("meta.json"),
    load("meeting.json"),
    load("waivers.json"),
    load("rulebook.json").catch(() => null),
  ]);

  const season = meeting.season;
  const last = meeting.last_completed;
  const lastSeason = meta.seasons.find((s) => s.year === last) || {};

  $("#meetingHero").replaceChildren(
    el(
      "div",
      { class: "grid grid-4" },
      card("Season", String(season ?? "—"), `following ${last}`),
      card("Champion to beat", lastSeason.champion || "—", `${last} title`),
      card("Holds the Moules", lastSeason.moules || "—", "buys $50 of food & drink"),
      card("Keeper limit", "4 per team", "due 1 week before the draft")
    )
  );

  /* ---- draft order selection ---- */
  const orderCard = el(
    "div",
    { class: "card" },
    el("p", { class: "eyebrow" }, "Draft-slot selection order · by-laws 4.2"),
    el(
      "p",
      { style: "font-size:.87rem;color:var(--text-dim)" },
      `Order in which owners choose their ${season} draft position, derived from the ${last} final standings.`
    ),
    el(
      "div",
      { class: "timeline" },
      ...meeting.draft_order_selection.map((row) =>
        el(
          "div",
          { class: "tl-row", style: "grid-template-columns:34px 1fr auto" },
          el("span", { class: "yr" }, row.choice),
          el(
            "span",
            { class: "who" },
            ownerDot(row.owner),
            el("b", {}, row.owner),
            el("span", { style: "display:block;font-size:.76rem;color:var(--text-faint)" }, row.label)
          ),
          el("span", { class: "badge badge-plain" }, `${fmt.ord(row.place)} in ${last}`)
        )
      )
    )
  );

  /* ---- final standings ---- */
  const standingsCard = el(
    "div",
    { class: "card" },
    el("p", { class: "eyebrow" }, `${last} final standings`),
    el(
      "div",
      { class: "timeline" },
      ...meeting.final_standings.map((row) =>
        el(
          "div",
          { class: "tl-row", style: "grid-template-columns:34px 1fr auto" },
          el("span", { class: "yr" }, row.place),
          el("span", { class: "who" }, ownerDot(row.owner), el("b", {}, row.owner)),
          row.place === 1
            ? el("span", { class: "badge badge-gold" }, "Champion")
            : row.place === 10
            ? el("span", { class: "badge badge-clay" }, "Moules")
            : row.place <= 6
            ? el("span", { class: "badge badge-green" }, "Playoffs")
            : null
        )
      )
    )
  );

  /* ---- keeper snapshot ---- */
  const keeperCard = el(
    "div",
    { class: "card" },
    el("p", { class: "eyebrow" }, "Keeper snapshot by team"),
    el(
      "div",
      { class: "table-wrap", style: "box-shadow:none;border:0" },
      el(
        "table",
        {},
        el(
          "thead",
          {},
          el(
            "tr",
            {},
            el("th", {}, "Owner"),
            el("th", { class: "num" }, "Keepable"),
            el("th", { class: "num" }, "Expiring"),
            el("th", {}, "Cheapest options")
          )
        ),
        el(
          "tbody",
          {},
          ...meeting.keeper_counts.map((row) =>
            el(
              "tr",
              {},
              el("td", {}, ownerDot(row.owner), row.owner),
              el("td", { class: "num" }, row.eligible),
              el(
                "td",
                { class: "num", style: row.expiring ? "color:var(--clay);font-weight:700" : "" },
                row.expiring || "—"
              ),
              el(
                "td",
                { style: "white-space:normal" },
                row.cheapest.length
                  ? row.cheapest.map((p) => `${p.player} (R${p.cost_round})`).join(", ")
                  : "—"
              )
            )
          )
        )
      )
    ),
    el(
      "p",
      { style: "font-size:.83rem;color:var(--text-faint);margin:8px 0 0" },
      "“Cheapest” means the latest round cost — the players you give up least to keep. ",
      el("a", { href: "keepers.html", style: "color:var(--accent)" }, "Full keeper board →")
    )
  );

  /* ---- waiver carryover ---- */
  const carry = [...meeting.waiver_carryover].sort((a, b) => (b.budget ?? 0) - (a.budget ?? 0));
  const maxBudget = Math.max(...carry.map((c) => c.budget ?? 0), 1);
  const waiverCard = el(
    "div",
    { class: "card" },
    el("p", { class: "eyebrow" }, `Waiver dollars carried out of ${last}`),
    ...carry.map((row) =>
      el(
        "div",
        { style: "display:grid;grid-template-columns:104px 1fr 52px;gap:10px;align-items:center;padding:5px 0" },
        el("span", { style: "font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" }, ownerDot(row.owner), row.owner),
        el(
          "span",
          { class: "bar-track" },
          el("span", { class: "bar-fill", style: `width:${((row.budget ?? 0) / maxBudget) * 100}%;display:block` })
        ),
        el("span", { class: "num", style: "text-align:right;font-size:.85rem;font-weight:700" }, fmt.money(row.budget))
      )
    ),
    waivers.note ? el("p", { style: "font-size:.8rem;color:var(--text-faint);margin:8px 0 0" }, waivers.note) : null
  );

  /* ---- agenda ---- */
  const agendaCard = el(
    "div",
    { class: "card" },
    el("p", { class: "eyebrow" }, "Agenda"),
    el(
      "ul",
      { class: "checklist" },
      ...[
        "Collect league fees — due on or before draft day, or the team auto-drafts",
        "Confirm the draft date, venue and food/drink from the Moules holder",
        "Submit keepers — commissioner needs them one week before the draft",
        "Run the draft-slot selection in the order listed above",
        "Review any rule changes and vote on the living constitution",
        "Confirm waiver budgets and rollover for the new season",
        "Note the 2026 change: kickers out, extra flex in",
      ].map((item) => el("li", {}, item))
    )
  );

  /* ---- rule excerpts pulled straight from the by-laws ---- */
  const wanted = ["6.1", "6.2", "6.3", "4.2", "2.1", "2.3"];
  const excerpts = (book?.sections || []).filter((s) => wanted.includes(s.number));
  const rulesCard = excerpts.length
    ? el(
        "div",
        { class: "card" },
        el("p", { class: "eyebrow" }, "Rules that always come up"),
        ...excerpts.map((s) =>
          el(
            "details",
            { style: "border-bottom:1px solid var(--line);padding:8px 0" },
            el(
              "summary",
              { style: "cursor:pointer;font-weight:650" },
              el("span", { class: "rb-num", style: "margin-right:8px" }, s.number),
              s.title
            ),
            el("div", { class: "rb-body", style: "margin-top:8px", html: s.html })
          )
        ),
        el("p", { style: "margin:10px 0 0" }, el("a", { href: "rulebook.html", style: "color:var(--accent)" }, "Read the full rulebook →"))
      )
    : null;

  body.replaceChildren(
    el("div", { class: "grid grid-2" }, orderCard, standingsCard),
    el("div", { class: "section" }, keeperCard),
    el("div", { class: "grid grid-2" }, waiverCard, agendaCard),
    rulesCard ? el("div", { class: "section" }, rulesCard) : null
  );
} catch (err) {
  fail(body, err);
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
