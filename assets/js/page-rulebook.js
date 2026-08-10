import { $, $$, el, load, fail } from "./app.js?v=10723445";

const rules = $("#rules");

try {
  const book = await load("rulebook.json");
  const sections = book.sections || [];

  $("#toc").replaceChildren(
    el("p", { class: "eyebrow" }, "Contents"),
    ...sections.map((s) =>
      el("a", { href: `#s${s.number.replace(/\./g, "-")}`, class: s.level > 1 ? "sub" : "" }, `${s.number} ${s.title}`)
    )
  );

  rules.replaceChildren(
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
