import { $, el, load, fmt, ownerDot, fail } from "./app.js";

const snapshot = $("#snapshot");

try {
  const [meta, standings, stats] = await Promise.all([
    load("meta.json"),
    load("standings.json"),
    load("stats.json"),
  ]);

  const upcoming = meta.years.upcoming;
  const last = meta.years.latest_completed;
  const lastSeason = meta.seasons.find((s) => s.year === last) || {};

  $("#heroSeason").textContent = upcoming ? `${upcoming} season` : "League home";
  $("#heroBlurb").textContent = `${meta.years.stats.length} completed seasons of drafts, standings, keepers and grudges — ${
    meta.teams.length
  } franchises, one spreadsheet, finally readable on a phone.`;

  /* ---- snapshot cards ---- */
  const career = stats.career || [];
  const mostWins = [...career].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0))[0];
  const mostPoints = [...career].sort((a, b) => (b.points_for ?? 0) - (a.points_for ?? 0))[0];
  const titles = [...(standings.universal?.titles || [])].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];

  snapshot.replaceChildren(
    el(
      "div",
      { class: "grid grid-4" },
      statCard(`${last} champion`, lastSeason.champion || "—", "🏆", "badge-gold"),
      statCard(`${last} Moules`, lastSeason.moules || "—", "🥴", "badge-clay"),
      statCard("Most career wins", mostWins ? `${mostWins.owner}` : "—", null, null, mostWins ? `${mostWins.wins}-${mostWins.losses}` : ""),
      statCard(
        "Most career points",
        mostPoints ? mostPoints.owner : "—",
        null,
        null,
        mostPoints ? fmt.num(mostPoints.points_for, 0) : ""
      )
    ),
    titles
      ? el(
          "p",
          { class: "notice", style: "margin-top:12px" },
          `League leader on the universal points table: ${titles.owner} (${titles.points} pts — ${titles.championships} title${
            titles.championships === 1 ? "" : "s"
          }, ${titles.playoffs} playoff appearances).`
        )
      : null
  );

  /* ---- champions timeline ---- */
  const champs = [...meta.seasons].filter((s) => s.champion).sort((a, b) => b.year - a.year);
  $("#champions").replaceChildren(
    el(
      "div",
      { class: "timeline" },
      ...champs.map((s) =>
        el(
          "a",
          { class: "tl-row", href: `standings.html?year=${s.year}`, style: "text-decoration:none;color:inherit" },
          el("span", { class: "yr" }, s.year),
          el(
            "span",
            { class: "who" },
            ownerDot(s.champion),
            el("b", {}, s.champion),
            s.runner_up
              ? el("span", { style: "color:var(--text-faint);font-size:.82rem;margin-left:8px" }, `def. ${s.runner_up}`)
              : null
          )
        )
      )
    )
  );

  /* ---- record books ---- */
  const blocks = standings.universal?.records || [];
  $("#records").replaceChildren(
    ...blocks.map((block) =>
      el(
        "div",
        { class: "card" },
        el("p", { class: "eyebrow" }, block.title),
        el(
          "div",
          {},
          ...block.entries.map((entry) =>
            el(
              "div",
              { class: "tl-row", style: "grid-template-columns:1fr auto" },
              el(
                "span",
                { class: "who" },
                el("b", {}, entry.category),
                el(
                  "span",
                  { style: "display:block;font-size:.78rem;color:var(--text-faint)" },
                  [entry.owner, entry.year].filter(Boolean).join(" · ")
                )
              ),
              el("span", { class: "stat" }, el("span", { class: "value", style: "font-size:1.05rem" }, entry.value ?? "—"))
            )
          )
        )
      )
    ),
    ...(standings.universal?.beer_mile?.length
      ? [
          el(
            "div",
            { class: "card" },
            el("p", { class: "eyebrow" }, "Beer mile"),
            el(
              "div",
              {},
              ...standings.universal.beer_mile.map((row) =>
                el(
                  "div",
                  { class: "tl-row", style: "grid-template-columns:1fr auto" },
                  el("span", { class: "who" }, ownerDot(row.owner), el("b", {}, row.owner)),
                  el("span", { class: "num", style: "font-weight:700" }, row.time)
                )
              )
            )
          ),
        ]
      : [])
  );
} catch (err) {
  fail(snapshot, err);
}

function statCard(label, value, icon, badgeClass, sub) {
  return el(
    "div",
    { class: "card stat" },
    el("span", { class: "label" }, label),
    el("span", { class: "value", style: "font-size:1.15rem" }, `${icon ? icon + " " : ""}${value}`),
    sub ? el("span", { class: "sub num" }, sub) : null
  );
}
