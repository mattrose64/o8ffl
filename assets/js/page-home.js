import { $, el, load, fmt, ownerDot, fail } from "./app.js?v=d09c04f1";

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
  const leader = [...(standings.universal?.titles || [])].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];

  snapshot.replaceChildren(
    el(
      "div",
      { class: "grid grid-4" },
      // The season just gone, champion and Moules together in one box.
      el(
        "div",
        { class: "card stat" },
        el("span", { class: "label" }, `${last} season`),
        el("span", { class: "value", style: "font-size:1.05rem" }, `🏆 ${lastSeason.champion || "—"}`),
        el("span", { class: "sub" }, `🥴 ${lastSeason.moules || "—"} took the Moules`)
      ),
      leader
        ? el(
            "a",
            { class: "card stat", href: "standings.html?tab=alltime", style: "text-decoration:none;color:inherit" },
            el("span", { class: "label" }, "Universal points leader"),
            el("span", { class: "value", style: "font-size:1.05rem" }, leader.owner),
            el(
              "span",
              { class: "sub num" },
              `${leader.points} pts · ${leader.championships} title${leader.championships === 1 ? "" : "s"} · ${
                leader.playoffs
              } playoff berths`
            )
          )
        : null,
      mostWins
        ? el(
            "div",
            { class: "card stat" },
            el("span", { class: "label" }, "Most career wins"),
            el("span", { class: "value", style: "font-size:1.05rem" }, mostWins.owner),
            el("span", { class: "sub num" }, `${mostWins.wins}-${mostWins.losses}${mostWins.ties ? `-${mostWins.ties}` : ""}`)
          )
        : null,
      mostPoints
        ? el(
            "div",
            { class: "card stat" },
            el("span", { class: "label" }, "Most career points"),
            el("span", { class: "value", style: "font-size:1.05rem" }, mostPoints.owner),
            el("span", { class: "sub num" }, fmt.num(mostPoints.points_for, 0))
          )
        : null
    )
  );

  /* ---- champions timeline ---- */
  const champs = [...meta.seasons].filter((s) => s.champion).sort((a, b) => b.year - a.year);
  $("#champions").replaceChildren(
    el(
      "div",
      { class: "timeline" },
      ...champs.map((season) => {
        // Match the season's stat line by franchise, not by name: seasons played by a
        // previous owner (2015's champion, say) are filed under the current owner there.
        const championTeam = (standings.seasons[String(season.year)]?.playoff || []).find(
          (p) => p.place === 1
        )?.team;
        const rows = stats.seasons[String(season.year)] || [];
        const line = rows.find((r) => r.team === championTeam) || rows.find((r) => r.owner === season.champion);
        return el(
          "a",
          {
            class: "tl-row",
            href: `standings.html?year=${season.year}`,
            style: "text-decoration:none;color:inherit;grid-template-columns:52px 1fr auto",
          },
          el("span", { class: "yr" }, season.year),
          el(
            "span",
            { class: "who" },
            ownerDot(season.champion),
            el("b", {}, season.champion),
            season.runner_up
              ? el("span", { style: "color:var(--text-faint);font-size:.82rem;margin-left:8px" }, `def. ${season.runner_up}`)
              : null
          ),
          line
            ? el(
                "span",
                { class: "num", style: "font-size:.8rem;color:var(--text-faint);white-space:nowrap" },
                `${line.wins}-${line.losses}${line.ties ? `-${line.ties}` : ""} · ${fmt.num(line.points_for, 0)} pts`
              )
            : null
        );
      })
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
