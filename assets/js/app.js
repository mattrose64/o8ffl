/* ==========================================================================
   O8FFL — shared runtime
   Small helpers shared by every page: data loading + cache, DOM building,
   theme, nav, table sorting, and the player detail sheet.
   ========================================================================== */

export const DATA = "data";

const cache = new Map();

/** Fetch (and memoise) a JSON file from the data directory. */
export async function load(path) {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(`${DATA}/${path}`, { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(`${path}: ${r.status}`);
        return r.json();
      })
    );
  }
  return cache.get(path);
}

/* ---------- tiny DOM helpers ---------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const fmt = {
  num: (v, digits = 0) =>
    v === null || v === undefined || Number.isNaN(v)
      ? "—"
      : Number(v).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  pct: (v) => (v === null || v === undefined ? "—" : `${(Number(v) * 100).toFixed(1)}%`),
  signed: (v, digits = 1) =>
    v === null || v === undefined ? "—" : `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(digits)}`,
  ord: (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  },
  money: (v) => (v === null || v === undefined ? "—" : `$${Number(v).toLocaleString()}`),
  first: (name) => String(name ?? "").split(" ")[0],
};

/** Stable colour per owner so the same person reads the same across the site. */
const OWNER_HUES = {};
export function ownerHue(name) {
  if (!name) return 145;
  if (!(name in OWNER_HUES)) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    OWNER_HUES[name] = h;
  }
  return OWNER_HUES[name];
}
export function ownerDot(name) {
  return el("i", { class: "owner-dot", style: `background:hsl(${ownerHue(name)} 62% 52%)` });
}

/* ---------- chrome ---------- */
const NAV = [
  ["index.html", "Home"],
  ["draft.html", "Draft History"],
  ["standings.html", "Standings"],
  ["stats.html", "Stats"],
  ["keepers.html", "Keepers"],
  ["draftprep.html", "Draft Prep"],
  ["waivers.html", "Waiver $"],
  ["rulebook.html", "Rulebook"],
  ["meeting.html", "Meeting"],
];

function initChrome() {
  const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const nav = $("#nav");
  if (nav) {
    nav.append(
      ...NAV.map(([href, label]) =>
        el("a", { href, "aria-current": href === page ? "page" : null }, label)
      )
    );
  }
  const toggle = $("#navToggle");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", (e) => {
      if (e.target.tagName === "A") nav.classList.remove("open");
    });
  }

  const root = document.documentElement;
  const stored = localStorage.getItem("o8ffl-theme");
  if (stored) root.dataset.theme = stored;
  const themeBtn = $("#themeToggle");
  if (themeBtn) {
    const paint = () => {
      const isLight = root.dataset.theme === "light";
      themeBtn.textContent = isLight ? "☀" : "☾";
      themeBtn.setAttribute("aria-label", isLight ? "Switch to dark theme" : "Switch to light theme");
    };
    paint();
    themeBtn.addEventListener("click", () => {
      const next = root.dataset.theme === "light" ? "dark" : "light";
      root.dataset.theme = next;
      localStorage.setItem("o8ffl-theme", next);
      paint();
    });
  }

  const year = $("#footYear");
  if (year) year.textContent = new Date().getFullYear();
}

/** Stamp "data generated <date>" into the footer. */
async function stampFooter() {
  const target = $("#footStamp");
  if (!target) return;
  try {
    const meta = await load("meta.json");
    const when = new Date(meta.generated);
    target.textContent = `Data refreshed ${when.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })} from ${meta.sources.workbook}`;
  } catch {
    /* footer stamp is decorative */
  }
}

/* ---------- URL state ---------- */
export function param(name, fallback = null) {
  return new URLSearchParams(location.search).get(name) ?? fallback;
}
export function setParam(name, value) {
  const url = new URL(location.href);
  if (value === null || value === undefined || value === "") url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  history.replaceState(null, "", url);
}

/* ---------- sortable tables ---------- */
/**
 * Wire click-to-sort onto a table built with <th data-sort="key"> headers.
 * `render(rows)` must repaint tbody.
 */
export function sortable(table, rows, render, initial = null) {
  const state = { key: initial?.key ?? null, dir: initial?.dir ?? "desc" };
  let data = rows;

  const apply = () => {
    const sorted = [...data];
    if (state.key) {
      sorted.sort((a, b) => {
        const av = a[state.key];
        const bv = b[state.key];
        if (av === bv) return 0;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        return state.dir === "asc" ? cmp : -cmp;
      });
    }
    $$("th[data-sort]", table).forEach((th) => {
      th.classList.toggle("asc", th.dataset.sort === state.key && state.dir === "asc");
      th.classList.toggle("desc", th.dataset.sort === state.key && state.dir === "desc");
    });
    render(sorted);
  };

  $$("th[data-sort]", table).forEach((th) => {
    th.classList.add("sortable");
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.key === key) state.dir = state.dir === "asc" ? "desc" : "asc";
      else {
        state.key = key;
        state.dir = th.dataset.dir || "desc";
      }
      apply();
    });
  });

  apply();

  // Listeners are attached once; feed a filtered set back in with setRows and the
  // current sort is preserved.
  apply.setRows = (next) => {
    data = next;
    apply();
  };
  return apply;
}

/* ---------- player detail sheet ---------- */
let modal;
function ensureModal() {
  if (modal) return modal;
  modal = el(
    "div",
    { class: "modal", id: "playerModal", role: "dialog", "aria-modal": "true" },
    el("div", { class: "modal-backdrop", onclick: closeSheet }),
    el(
      "div",
      { class: "modal-panel" },
      el("button", { class: "modal-close", onclick: closeSheet, "aria-label": "Close" }, "✕"),
      el("div", { id: "playerBody" })
    )
  );
  document.body.append(modal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
  });
  return modal;
}

export function closeSheet() {
  if (modal) modal.classList.remove("open");
}

/**
 * Open the player sheet: name, draft history across seasons, keeper status.
 * `hint` may carry { year, owner, round, cost, contract } from the calling page.
 */
export async function openPlayer(name, hint = {}) {
  if (!name) return;
  ensureModal().classList.add("open");
  const body = $("#playerBody");
  body.replaceChildren(el("div", { class: "loading" }, "Loading…"));

  const [{ players }, keepersDoc] = await Promise.all([load("players.json"), load("keepers.json")]);
  const key = playerKey(name);
  const rec = players[key] || { name, history: [] };
  const keeper = (keepersDoc.players || []).find((k) => k.player_key === key);

  const history = [...(rec.history || [])].sort((a, b) => b.year - a.year);
  const rounds = history.filter((h) => h.round).map((h) => h.round);
  const best = rounds.length ? Math.min(...rounds) : null;

  body.replaceChildren(
    el("p", { class: "eyebrow" }, hint.position || keeper?.position || "Player"),
    el("h2", { style: "margin-bottom:10px" }, rec.name || name),
    el(
      "div",
      { class: "grid grid-4", style: "margin-bottom:16px" },
      stat("Times drafted", history.length || "—"),
      stat("Earliest round", best ? `R${best}` : "—"),
      stat("Kept", history.filter((h) => h.keeper).length || "—"),
      stat("Keeper cost", keeper ? keeper.cost_label ?? "—" : "—")
    ),
    keeper
      ? el(
          "div",
          { class: "notice", style: "margin-bottom:16px" },
          `${keeper.owner} · acquired via ${keeper.acquired || "—"}${
            keeper.year_signed ? ` · signed ${keeper.year_signed}` : ""
          } · ${keeper.contract_years_remaining ?? "—"} contract year${
            keeper.contract_years_remaining === 1 ? "" : "s"
          } left`
        )
      : null,
    el("p", { class: "eyebrow" }, "Draft history"),
    history.length
      ? el(
          "div",
          { class: "timeline" },
          ...history.map((h) =>
            el(
              "div",
              { class: "tl-row" },
              el("span", { class: "yr" }, h.year),
              el(
                "span",
                { class: "who" },
                ownerDot(h.owner),
                el("b", {}, h.owner || "—"),
                el(
                  "span",
                  { style: "margin-left:8px;color:var(--text-faint);font-size:.8rem" },
                  h.round ? `Round ${h.round}` : "—"
                ),
                h.keeper ? el("span", { class: "badge badge-gold", style: "margin-left:8px" }, "Keeper") : null
              )
            )
          )
        )
      : el("p", { style: "color:var(--text-faint)" }, "No draft history on record — likely a free-agent pickup.")
  );
}

function stat(label, value) {
  return el("div", { class: "stat" }, el("span", { class: "label" }, label), el("span", { class: "value" }, String(value)));
}

/** Mirror of the Python player_key() so lookups agree with the generated data. */
export function playerKey(name) {
  if (!name) return "";
  let text = String(name).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const dst = text.match(/^(.*?)\s*(D\/ST|DST|Defense)$/i);
  if (dst) {
    const words = dst[1].trim().split(" ");
    return norm(words[words.length - 1] || "") + "dst";
  }
  if (/\sD$/.test(text)) {
    const words = text.slice(0, -2).trim().split(" ");
    return norm(words[words.length - 1] || "") + "dst";
  }
  if (
    text.length > 2 &&
    text.endsWith("Q") &&
    (/[a-z]/i.test(text[text.length - 2]) || text[text.length - 2] === ".") &&
    text !== text.toUpperCase()
  )
    text = text.slice(0, -1);
  let key = norm(text);
  for (const suffix of ["iii", "iv", "ii", "jr", "sr", "v"]) {
    if (key.endsWith(suffix) && key.length > suffix.length + 3) return key.slice(0, -suffix.length);
  }
  return key;
}
const norm = (s) =>
  String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/* ---------- boot ---------- */
initChrome();
stampFooter();

/** Render an error state into a container instead of failing silently. */
export function fail(container, err) {
  console.error(err);
  container.replaceChildren(
    el(
      "div",
      { class: "empty-state" },
      el("p", {}, "Couldn't load the league data."),
      el(
        "p",
        { style: "font-size:.8rem" },
        "If you're opening these files directly, run a local server: python3 -m http.server 8000"
      )
    )
  );
}
