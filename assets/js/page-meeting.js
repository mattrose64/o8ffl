import { $, el, load, fmt, ownerDot, fail } from "./app.js?v=2dc3c95c";

const body = $("#meetingBody");

try {
  const [meta, meeting, waivers, book, archive] = await Promise.all([
    load("meta.json"),
    load("meeting.json"),
    load("waivers.json"),
    load("rulebook.json").catch(() => null),
    load("meetings.json").catch(() => null),
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

  /* ---- waiver carryover ---- */
  const carry = [...(meeting.waiver_budgets || [])].sort((a, b) => (b.budget ?? 0) - (a.budget ?? 0));
  const maxBudget = Math.max(...carry.map((c) => c.budget ?? 0), 1);
  const waiverCard = el(
    "div",
    { class: "card" },
    el("p", { class: "eyebrow" }, `${season} starting waiver budgets`),
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
        el(
          "span",
          { class: "num", style: "text-align:right;font-size:.85rem;font-weight:700" },
          fmt.money(row.budget)
        )
      )
    ),
    el(
      "p",
      { style: "font-size:.8rem;color:var(--text-faint);margin:8px 0 0" },
      waivers.note || `$100 plus what was left at the end of ${last}.`
    )
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
        `Set the draft date and venue — ${lastSeason.moules || "the Moules holder"} owes $50 of food and drink`,
        "Set the keeper deadline: one week before the draft",
        "Collect league fees — due on or before draft day, or the team auto-drafts",
        "Confirm the rule changes already voted in for this season (below)",
        "Take new proposals, then vote — a proposer or co-signer must be in the room",
        "Run the draft-slot selection in the order listed below",
        "Confirm starting waiver budgets",
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

  /* ---- decisions already on the books for this season ---- */
  const meetingsList = archive?.meetings || [];
  const shortYear = String(season).slice(2);
  const inEffect = [];
  const locked = [];
  for (const past of meetingsList) {
    for (const item of past.items) {
      const blob = `${item.text} ${item.outcome || ""}`;
      // "To be in effect 26/27 season" is how the minutes phrase a delayed change.
      if (new RegExp(`in effect[^.]*\\b(${shortYear}\\s*/|${season})`, "i").test(blob)) {
        inEffect.push({ ...item, year: past.year });
      }
      // A topic can't be revoted for two seasons after it was decided (2023 rule).
      if (item.outcome && /\d\s*-\s*\d/.test(item.outcome) && past.year >= season - 2) {
        locked.push({ ...item, year: past.year, until: past.year + 2 });
      }
    }
  }

  const decisionsCard =
    inEffect.length || locked.length
      ? el(
          "div",
          { class: "card" },
          el("p", { class: "eyebrow" }, `Already decided for ${season}`),
          inEffect.length
            ? el(
                "div",
                {},
                el("p", { style: "font-weight:700;margin:0 0 6px" }, "Takes effect this season"),
                el(
                  "ul",
                  { class: "checklist" },
                  ...inEffect.map((item) =>
                    el(
                      "li",
                      { title: item.outcome || "" },
                      el(
                        "span",
                        {},
                        item.text.replace(/[.\s]+$/, ""),
                        el("span", { class: "minute-outcome" }, `voted ${item.year}`),
                        item.outcome
                          ? el(
                              "span",
                              { style: "display:block;font-size:.8rem;color:var(--text-faint);margin-top:2px" },
                              item.outcome.length > 150 ? `${item.outcome.slice(0, 150)}…` : item.outcome
                            )
                          : null
                      )
                    )
                  )
                )
              )
            : null,
          locked.length
            ? el(
                "details",
                { style: "margin-top:10px" },
                el(
                  "summary",
                  { style: "cursor:pointer;font-weight:700" },
                  `${locked.length} topic${locked.length === 1 ? "" : "s"} locked from a revote`
                ),
                el(
                  "ul",
                  { class: "checklist", style: "margin-top:8px" },
                  ...locked.map((item) =>
                    el(
                      "li",
                      { title: item.outcome || "" },
                      el("span", {}, item.text.replace(/[.\s]+$/, ""), el("span", { class: "minute-outcome" }, `until ${item.until}`))
                    )
                  )
                ),
                el(
                  "p",
                  { style: "font-size:.8rem;color:var(--text-faint);margin:8px 0 0" },
                  "Once voted, an item can't be revoted for two seasons (2023 meeting)."
                )
              )
            : null
        )
      : null;

  /* ---- past meetings ---- */
  const meetings = archive?.meetings || [];
  const archiveCard = meetings.length
    ? el(
        "div",
        { class: "section" },
        el("div", { class: "section-head" }, el("h2", {}, "Past meetings"),
          el("span", { style: "font-size:.85rem;color:var(--text-dim)" }, `${meetings[meetings.length - 1].year}–${meetings[0].year}`)),
        ...meetings.map((m, i) =>
          el(
            "details",
            { class: "keeper-team", open: i === 0 || undefined },
            el(
              "summary",
              {},
              el("span", { style: "font-weight:800" }, m.year),
              el("span", { style: "color:var(--text-dim);font-weight:500" }, [m.date, m.place].filter(Boolean).join(" · ")),
              m.has_minutes ? el("span", { class: "badge badge-green" }, "with minutes") : el("span", { class: "badge badge-plain" }, "agenda")
            ),
            el("div", { class: "keeper-body", style: "padding:14px 16px" }, outline(m.items))
          )
        )
      )
    : null;

  body.replaceChildren(
    // Run the meeting top to bottom: what to do, what's already settled, then the
    // numbers you need in the room, then the archive to answer "what did we decide?".
    el("div", { class: "grid grid-2" }, agendaCard, decisionsCard),
    el("div", { class: "grid grid-2" }, orderCard, waiverCard),
    archiveCard,
    el("div", { class: "grid grid-2" }, standingsCard, rulesCard)
  );

/** Render a meeting's flat level/text list back into nested lists. */
function outline(items) {
  const root = el("div", { class: "minutes" });
  const stack = [root];
  let lastLevel = -1;
  for (const item of items) {
    const level = Math.min(item.level, 3);
    while (level > lastLevel) {
      const list = el("ul", { class: "rb-list" });
      (stack[stack.length - 1].lastElementChild?.tagName === "LI"
        ? stack[stack.length - 1].lastElementChild
        : stack[stack.length - 1]
      ).append(list);
      stack.push(list);
      lastLevel++;
    }
    while (level < lastLevel) {
      stack.pop();
      lastLevel--;
    }
    stack[stack.length - 1].append(
      el(
        "li",
        { class: item.level === 0 ? "minute-head" : "" },
        item.text,
        item.outcome ? el("span", { class: "minute-outcome" }, item.outcome) : null
      )
    );
  }
  return root;
}
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
