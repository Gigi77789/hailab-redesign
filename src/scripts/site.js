/* NEU HAI: page behaviour. The pages are rendered at build time (src/pages); this adds the light and dark
   switch, the home page chart and research areas, the motion, the photo wall, and the publication filters. */
(function () {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- nav ---------- */
  const toggle = $(".nav-toggle");
  const nav = $(".nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  /* ---------- light and dark ---------- */
  // src/layouts/Base.astro sets data-theme before paint; this button flips it and remembers the choice
  const root = document.documentElement;
  const themeBtn = $(".theme-toggle");
  const syncThemeBtn = () => themeBtn && themeBtn.setAttribute("aria-pressed", String(root.dataset.theme === "dark"));
  const setTheme = (t, save) => {
    root.classList.add("theming");
    root.dataset.theme = t;
    syncThemeBtn();
    setTimeout(() => root.classList.remove("theming"), 450);
    if (save) try { localStorage.setItem("hai-theme", t); } catch (_) { /* storage blocked */ }
  };
  if (!root.dataset.theme) root.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  syncThemeBtn();
  if (themeBtn) themeBtn.addEventListener("click", () => setTheme(root.dataset.theme === "dark" ? "light" : "dark", true));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    let saved = null;
    try { saved = localStorage.getItem("hai-theme"); } catch (_) { /* storage blocked */ }
    if (!saved) setTheme(e.matches ? "dark" : "light", false);
  });

  /* ---------- publication chart (home) ---------- */
  // #field-data: { cats: [{key, name}] in categories.yaml order, papers: [{t, y, tag, topics, href}] }.
  const FIELD = JSON.parse($("#field-data")?.textContent || '{"cats":[],"papers":[]}');
  const PUBS = FIELD.papers;
  const TOPICS = Object.fromEntries(FIELD.cats.map((c) => [c.key, c.name]));
  const primaryTopic = (p) => p.topics[0];
  const topicTag = (t) => `<span class="ptag k-${t}"><span class="key"></span>${esc(TOPICS[t] || t)}</span>`;
  // One dot per paper, stacked by year and coloured by main research area.
  // Stack order doubles as the colour-safety order: adjacent hues were validated for colour-blind separation.
  const STACK = FIELD.cats.map((c) => c.key);

  function renderField() {
    const host = $("#field-plot");
    const fig = $("#field");
    const tip = $("#tip");
    const legend = $("#legend");
    if (!host || !PUBS.length) return;

    const ys = PUBS.map((p) => p.y);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);
    const cols = years.map((y) => PUBS.filter((p) => p.y === y).map((p) => ({ p, t: primaryTopic(p) }))
      .sort((a, b) => STACK.indexOf(a.t) - STACK.indexOf(b.t)));

    // the legend counts dots, i.e. papers by main area
    const counts = {};
    PUBS.forEach((p) => { const t = primaryTopic(p); counts[t] = (counts[t] || 0) + 1; });

    const PER_ROW = 2, PITCH = 14, R = 5.5, GAP = 10, PAD = 4;
    let dots = [], focus = "", locked = "", hoverN = -1, pinned = null, lastPointer = "mouse";

    function applyFocus(t) {
      focus = t;
      if (t) fig.dataset.focus = t; else delete fig.dataset.focus;
      host.querySelectorAll(".d").forEach((g) => g.classList.toggle("on", !!t && dots[+g.dataset.n].t === t));
      legend.querySelectorAll(".fk").forEach((b) => b.classList.toggle("on", b.dataset.topic === t));
    }

    function draw() {
      const colW = PER_ROW * PITCH, step = colW + GAP;
      const rows = Math.max(...cols.map((c) => Math.ceil(c.length / PER_ROW)));
      const W = years.length * step - GAP, H = rows * PITCH;
      dots = [];
      let marks = "";
      cols.forEach((col, ci) => col.forEach((d, j) => {
        const x = ci * step + (j % PER_ROW) * PITCH + PITCH / 2;
        const y = H - Math.floor(j / PER_ROW) * PITCH - PITCH / 2;
        dots.push(d);
        marks += `<a href="${esc(d.p.href)}" tabindex="-1"><g class="d k-${d.t}" data-n="${dots.length - 1}" style="--d:${ci * 70 + Math.floor(j / PER_ROW) * 16}ms" transform="translate(${x} ${y})"><circle class="hit" r="${PITCH / 2}"/><circle class="dot" r="${R}"/></g></a>`;
      }));
      // year labels are HTML, so they keep their size when the chart scales down; narrow charts drop every other one
      const labels = years.map((y, ci) => {
        const left = ((ci * step + colW / 2 + PAD) / (W + 2 * PAD)) * 100;
        const minor = ci % 3 !== 0 && ci !== years.length - 1;
        return `<span${minor ? ' class="minor"' : ""} style="left:${left.toFixed(2)}%">${y}</span>`;
      }).join("");
      host.innerHTML = `<svg viewBox="${-PAD} ${-PAD} ${W + 2 * PAD} ${H + 2 * PAD}" aria-hidden="true">
        <g class="dots">${marks}</g><line class="base" x1="${-PAD}" x2="${W + PAD}" y1="${H + 2}" y2="${H + 2}"/>
      </svg><div class="field-years" aria-hidden="true">${labels}</div>`;
      applyFocus(focus);
      fit();
    }
    // drop every other year label when the columns get too narrow to fit "2026" side by side
    const fit = () => host.querySelector(".field-years")?.classList.toggle("sparse", host.clientWidth / years.length < 48);

    // tooltip
    const setHover = (n) => {
      if (n === hoverN) return;
      host.querySelector(".d.hover")?.classList.remove("hover");
      hoverN = n;
      if (n >= 0) host.querySelector(`.d[data-n="${n}"]`)?.classList.add("hover");
    };
    const showTip = (n, pin) => {
      const d = dots[n], p = d.p;
      tip.innerHTML = `<div class="tip-meta"><span class="tag">${esc(p.tag)}</span>${p.y}</div><div class="tip-tags">${topicTag(d.t)}</div>
        <a class="tip-title" href="${esc(p.href)}" tabindex="${pin ? 0 : -1}">${esc(p.t)}</a>`;
      const fr = fig.getBoundingClientRect(), dr = host.querySelector(`.d[data-n="${n}"] .dot`).getBoundingClientRect();
      const w = tip.offsetWidth, h = tip.offsetHeight;
      const x = Math.max(0, Math.min(dr.left - fr.left + dr.width / 2 - w / 2, fr.width - w));
      let y = dr.top - fr.top - h - 10;
      if (y < 0) y = dr.bottom - fr.top + 10; // no room above the dot: show it below
      tip.style.left = x + "px";
      tip.style.top = y + "px";
      tip.classList.add("show");
      tip.classList.toggle("pin", !!pin);
      setHover(n);
    };
    function hideTip() { tip.classList.remove("show", "pin"); pinned = null; setHover(-1); }

    host.addEventListener("pointermove", (e) => {
      lastPointer = e.pointerType;
      if (e.pointerType !== "mouse" || pinned !== null) return;
      const g = e.target.closest(".d");
      const n = g ? +g.dataset.n : -1;
      if (n === hoverN) return;
      if (n >= 0) showTip(n, false); else { tip.classList.remove("show"); setHover(-1); }
    });
    host.addEventListener("pointerleave", () => { if (pinned === null) hideTip(); });
    host.addEventListener("pointerdown", (e) => { lastPointer = e.pointerType; });
    host.addEventListener("click", (e) => {
      const g = e.target.closest(".d");
      if (!g || lastPointer === "mouse") return; // on a mouse the dot is a real link
      e.preventDefault();
      pinned = +g.dataset.n;
      showTip(pinned, true);
    });
    document.addEventListener("click", (e) => { if (pinned !== null && !e.target.closest("#field")) hideTip(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });

    // area keys: hover previews, click locks
    legend.addEventListener("pointerover", (e) => { const b = e.target.closest(".fk"); if (b && !locked) applyFocus(b.dataset.topic); });
    legend.addEventListener("pointerleave", () => { if (!locked) applyFocus(""); });
    legend.addEventListener("click", (e) => {
      const b = e.target.closest(".fk");
      if (!b) return;
      locked = locked === b.dataset.topic ? "" : b.dataset.topic;
      legend.querySelectorAll(".fk").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.topic === locked)));
      applyFocus(locked);
    });

    draw();
    addEventListener("resize", fit);

    // the home page with #collab (any category key) opens the chart with that category locked in focus
    const fromHash = location.hash.slice(1);
    if (TOPICS[fromHash]) legend.querySelector(`.fk[data-topic="${fromHash}"]`)?.click();
  }

  /* ---------- research areas (home) ---------- */
  // Left: the areas as tabs, with a glass marker that slides to the chosen one.
  // Right: the area's newest papers; the chosen paper opens its figure right above its title.
  function explorer(host) {
    if (!host) return;
    host.querySelectorAll(".ex-papers").forEach((list) => {
      list.addEventListener("click", (e) => {
        const b = e.target.closest(".ex-paper");
        if (!b) return;
        list.querySelectorAll(".ex-paper").forEach((x) => {
          const on = x === b;
          x.setAttribute("aria-expanded", String(on));
          x.parentElement.classList.toggle("on", on);
        });
      });
    });

    const tabs = [...host.querySelectorAll(".ex-item")];
    const panels = [...host.querySelectorAll(".ex-panel")];
    const ind = host.querySelector(".ex-ind");
    let cur = 0;
    const place = () => {
      const t = tabs[cur];
      ind.style.transform = `translateY(${t.offsetTop}px)`;
      ind.style.height = t.offsetHeight + "px";
      ind.className = `ex-ind ${[...tabs[cur].classList].find((c) => c.startsWith("k-"))}`;
    };
    const select = (i, focusTab) => {
      cur = (i + tabs.length) % tabs.length;
      tabs.forEach((t, j) => { t.setAttribute("aria-selected", String(j === cur)); t.tabIndex = j === cur ? 0 : -1; });
      panels.forEach((p, j) => (p.hidden = j !== cur));
      place();
      if (focusTab) tabs[cur].focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(i));
      t.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); select(cur + 1, true); }
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); select(cur - 1, true); }
      });
    });
    place();
    addEventListener("resize", place);
    if (document.fonts) document.fonts.ready.then(place);
  }

  /* ---------- version 1: future layer ---------- */
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // a thin line along the top shows how far down the page you are
  const line = $(".scroll-line");
  if (line) {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      line.style.setProperty("--p", max > 0 ? Math.min(1, scrollY / max) : 0);
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    onScroll();
  }

  // a slow network of points behind the statement, drawn toward the pointer
  function mesh(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d"), host = canvas.parentElement;
    let w = 0, h = 0, pts = [], pointer = null, live = true;
    const COLORS = ["109,92,232", "0,163,180"], DARK = ["150,132,255", "40,200,215"];
    const size = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      const box = canvas.getBoundingClientRect();
      w = box.width; h = box.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(90, Math.round((w * h) / 9000));
      pts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25, c: Math.random() < 0.5 ? 0 : 1, r: 1 + Math.random() * 1.6 }));
    };
    const LINK = 130;
    const draw = () => {
      const dark = root.dataset.theme === "dark";
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        if (!REDUCED) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < -20) p.x = w + 20; if (p.x > w + 20) p.x = -20;
          if (p.y < -20) p.y = h + 20; if (p.y > h + 20) p.y = -20;
          if (pointer) { const dx = pointer.x - p.x, dy = pointer.y - p.y, d = Math.hypot(dx, dy); if (d < 160) { p.x += dx * 0.004; p.y += dy * 0.004; } }
        }
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK) { ctx.strokeStyle = `rgba(${dark ? DARK[a.c] : COLORS[a.c]},${(1 - d / LINK) * (dark ? 0.3 : 0.22)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
      }
      for (const p of pts) { ctx.fillStyle = `rgba(${dark ? DARK[p.c] : COLORS[p.c]},${dark ? 0.7 : 0.55})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
      if (!REDUCED && live && !document.hidden) requestAnimationFrame(draw);
    };
    size();
    addEventListener("resize", () => { size(); if (REDUCED) draw(); });
    host.addEventListener("pointermove", (e) => { const r = canvas.getBoundingClientRect(); pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; });
    host.addEventListener("pointerleave", () => (pointer = null));
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { const was = live; live = es[0].isIntersecting; if (live && !was && !REDUCED) requestAnimationFrame(draw); }).observe(host);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && live && !REDUCED) requestAnimationFrame(draw); });
    requestAnimationFrame(draw);
  }

  // things arrive as they scroll into view; siblings follow one another
  function reveal() {
    const groups = [".block-head", ".page-head h1", ".page-head p", ".latest", ".ex-list", ".ex-stage", ".faces > li", ".join-band > *", ".subhead",
      ".people-grid > li", ".alumni > li", ".news-list > li", ".roles > li", ".year-block", ".print", ".pubs-tools", ".norms-head", ".apply-end"];
    const els = [...document.querySelectorAll(groups.join(","))];
    const field = $("#field");
    if (REDUCED || !("IntersectionObserver" in window)) { field && field.classList.add("in", "settled"); return; }
    els.forEach((el) => {
      const sib = [...el.parentElement.children].filter((c) => c.matches(groups.join(",")));
      el.style.setProperty("--i", Math.min(sib.indexOf(el), 8));
      if (!el.matches(".block-head")) el.classList.add("rv");
    });
    // check positions on scroll (works even where IntersectionObserver is throttled)
    let pending = els.slice(), fieldDone = !field, t = 0;
    const check = () => {
      t = 0;
      const edge = innerHeight * 0.94;
      pending = pending.filter((el) => { if (el.getBoundingClientRect().top < edge) { el.classList.add("in"); return false; } return true; });
      if (!fieldDone && field.getBoundingClientRect().top < innerHeight * 0.75) {
        fieldDone = true;
        field.classList.add("in");
        setTimeout(() => field.classList.add("settled"), 2400);
      }
      if (!pending.length && fieldDone) { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); }
    };
    const onScroll = () => { if (!t) t = setTimeout(check, 60); };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    check();
  }

  /* ---------- pages ---------- */
  const page = ($("[data-page]") || document.body).dataset.page;

  if (page === "home") {
    renderField();
    explorer($("#explorer"));
    mesh($("#mesh"));
  }

  if (page === "culture") {
    // a photo wall: polaroid-like prints, slightly tilted, that settle as they scroll in;
    // chips filter by kind, and a click opens the photo large
    const wall = $("#wall"), chips = $("#wall-filters");
    const photos = [...wall.querySelectorAll(".print-btn img")].map((im) => ({ src: im.getAttribute("src"), caption: im.alt }));
    chips.addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
      let n = 0;
      wall.querySelectorAll(".print").forEach((li) => {
        const show = !b.dataset.cat || li.dataset.cat === b.dataset.cat;
        li.hidden = !show;
        li.classList.remove("shuffle");
        if (show) { li.style.setProperty("--j", n++); void li.offsetWidth; li.classList.add("shuffle"); }
      });
    });

    // lightbox
    const box = $("#lightbox"), img = $("#lb-img"), cap = $("#lb-cap");
    let cur = 0;
    const visible = () => [...wall.querySelectorAll(".print:not([hidden]) .print-btn")].map((b) => +b.dataset.i);
    const show = (i) => { cur = i; const ph = photos[i]; img.src = ph.src; img.alt = ph.caption; cap.textContent = ph.caption; };
    const step = (d) => { const v = visible(); show(v[(v.indexOf(cur) + d + v.length) % v.length]); };
    wall.addEventListener("click", (e) => {
      const b = e.target.closest(".print-btn");
      if (!b || !box.showModal) return;
      show(+b.dataset.i);
      box.showModal();
    });
    $("#lb-prev").addEventListener("click", () => step(-1));
    $("#lb-next").addEventListener("click", () => step(1));
    $("#lb-close").addEventListener("click", () => box.close());
    box.addEventListener("click", (e) => { if (e.target === box) box.close(); });
    box.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1); });
  }

  /* ---------- copy buttons (mail links don't open everywhere) ---------- */
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".copy");
    if (!b) return;
    const done = () => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1600); };
    const text = b.dataset.copy;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => selectText(b.previousElementSibling));
    else selectText(b.previousElementSibling);
  });
  function selectText(el) {
    if (!el) return;
    const r = document.createRange();
    r.selectNodeContents(el);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  if (page === "people") {
    // a soft light follows the pointer across each card
    document.addEventListener("pointermove", (e) => {
      const c = e.target.closest && e.target.closest(".person");
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
      c.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
    }, { passive: true });
  }

  if (page === "publications") {
    // every paper is on the page; search and filters hide the ones that don't match
    const filters = $("#filters");
    const topics = new Set([...filters.querySelectorAll("[data-topic]")].map((b) => b.dataset.topic).filter(Boolean));
    const params = new URLSearchParams(location.search);
    const hashTopic = location.hash.slice(1);
    const state = { q: params.get("q") || "", topic: params.get("topic") || (topics.has(hashTopic) ? hashTopic : ""), peer: params.get("peer") === "1" };
    const input = $("#q");
    const status = $("#status");
    const items = [...document.querySelectorAll("#pubs .pub")];
    const blocks = [...document.querySelectorAll("#pubs .year-block")];
    const empty = $("#pubs > .pubs-empty");
    input.value = state.q;

    const sync = () => {
      filters.querySelectorAll("[data-topic]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.topic === state.topic)));
      filters.querySelector("[data-peer]").setAttribute("aria-pressed", String(state.peer));
      const p = new URLSearchParams();
      if (state.q) p.set("q", state.q);
      if (state.topic) p.set("topic", state.topic);
      if (state.peer) p.set("peer", "1");
      try { history.replaceState(null, "", p.toString() ? "?" + p : location.pathname); } catch (_) { /* some hosts refuse URL changes */ }
    };

    const render = () => {
      const q = state.q.trim().toLowerCase();
      let shown = 0;
      items.forEach((li) => {
        const on = (!state.topic || li.dataset.topics.split(" ").includes(state.topic)) &&
          (!state.peer || "peer" in li.dataset) &&
          (!q || li.dataset.q.includes(q));
        li.hidden = !on;
        shown += on;
      });
      blocks.forEach((b) => (b.hidden = !b.querySelector(".pub:not([hidden])")));
      empty.hidden = shown > 0;
      status.innerHTML = shown === items.length
        ? `<b>${items.length}</b> papers. Lab members’ names are in bold.`
        : `Showing <b>${shown}</b> of ${items.length} papers.`;
    };

    $("#reset").addEventListener("click", () => { state.q = ""; state.topic = ""; state.peer = false; input.value = ""; sync(); render(); });
    filters.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if ("peer" in b.dataset) state.peer = !state.peer;
      else state.topic = b.dataset.topic;
      sync(); render();
    });
    let t;
    input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { state.q = input.value; sync(); render(); }, 120); });

    sync(); render();
  }
  reveal();
})();
