import { $, $$, el, load, fail } from "./app.js?v=661bbeb4";

const rules = $("#rules");

try {
  const [book, archive] = await Promise.all([load("rulebook.json"), load("meetings.json").catch(() => null)]);
  const sections = book.sections || [];

  // The by-laws carry a year in their title; anything voted at a later meeting amends
  // this document without being in it. Surface those so nobody quotes a stale rule.
  const bookYear = Number((book.source || "").match(/(20\d{2})/)?.[1]) || null;
  const amendments = (archive?.meetings || [])
    .filter((m) => bookYear && m.year > bookYear)
    .flatMap((m) => m.items.filter((i) => i.outcome).map((i) => ({ ...i, year: m.year })))
    .sort((a, b) => b.year - a.year);

  $("#toc").replaceChildren(
    el("p", { class: "eyebrow" }, "Contents"),
    ...sections.map((s) =>
      el("a", { href: `#s${s.number.replace(/\./g, "-")}`, class: s.level > 1 ? "sub" : "" }, `${s.number} ${s.title}`)
    )
  );

  rules.replaceChildren(
    amendments.length
      ? el(
          "details",
          { class: "card", style: "margin-bottom:18px" },
          el(
            "summary",
            { style: "cursor:pointer;font-weight:700" },
            `${amendments.length} decision${amendments.length === 1 ? "" : "s"} since this document was written`,
            el("span", { class: "minute-outcome" }, `${bookYear} by-laws`)
          ),
          el(
            "p",
            { style: "font-size:.87rem;color:var(--text-dim);margin:10px 0 6px" },
            "Voted at owners' meetings after these by-laws were drafted, so they override anything below. ",
            el("a", { href: "meeting.html", style: "color:var(--accent)" }, "See the meeting record →")
          ),
          el(
            "ul",
            { class: "checklist" },
            ...amendments.map((item) =>
              el(
                "li",
                {},
                el(
                  "span",
                  {},
                  el(
                    "span",
                    { style: "font-weight:650" },
                    item.text.replace(/[.\s]+$/, ""),
                    el("span", { class: "minute-outcome" }, item.year)
                  ),
                  el("span", { style: "display:block;color:var(--text-dim);margin-top:3px" }, item.outcome)
                )
              )
            )
          )
        )
      : null,
    book.intro_html ? el("div", { class: "rb-body", html: book.intro_html }) : null,
    ...sections.map((s) =>
      el(
        "section",
        { class: "rb-section", id: `s${s.number.replace(/\./g, "-")}` },
        el(s.level > 1 ? "h3" : "h2", {}, el("span", { class: "rb-num" }, s.number), el("span", {}, s.title)),
        el("div", { class: "rb-body", html: s.html })
      )
    )
  );

  /* ---- search: filter sections and highlight hits ---- */
  const search = $("#search");
  const bodies = $$(".rb-section");
  const originals = new Map(bodies.map((node) => [node, node.querySelector(".rb-body").innerHTML]));

  search.addEventListener("input", () => {
    const q = search.value.trim();
    const needle = q.toLowerCase();
    let hits = 0;
    bodies.forEach((node) => {
      const body = node.querySelector(".rb-body");
      body.innerHTML = originals.get(node);
      if (!q) {
        node.hidden = false;
        return;
      }
      const text = (node.textContent || "").toLowerCase();
      const match = text.includes(needle);
      node.hidden = !match;
      if (match) {
        hits++;
        highlight(body, needle);
      }
    });
    let banner = $("#searchBanner");
    if (q && !banner) {
      banner = el("p", { id: "searchBanner", class: "notice", style: "margin-bottom:14px" });
      rules.prepend(banner);
    }
    if (banner) {
      banner.hidden = !q;
      banner.textContent = `${hits} section${hits === 1 ? "" : "s"} mention “${q}”.`;
    }
  });

  /* ---- highlight active section in the contents list ---- */
  const links = $$("#toc a");
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = entry.target.id;
        links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${id}`));
      }
    },
    { rootMargin: "-80px 0px -70% 0px" }
  );
  bodies.forEach((node) => observer.observe(node));
} catch (err) {
  fail(rules, err);
}

/** Wrap matches of `needle` in <mark>, walking text nodes so markup survives. */
function highlight(root, needle) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets = [];
  while (walker.nextNode()) {
    if (walker.currentNode.nodeValue.toLowerCase().includes(needle)) targets.push(walker.currentNode);
  }
  for (const node of targets) {
    const frag = document.createDocumentFragment();
    let rest = node.nodeValue;
    let idx;
    while ((idx = rest.toLowerCase().indexOf(needle)) !== -1) {
      frag.append(rest.slice(0, idx));
      frag.append(el("mark", {}, rest.slice(idx, idx + needle.length)));
      rest = rest.slice(idx + needle.length);
    }
    frag.append(rest);
    node.replaceWith(frag);
  }
}
