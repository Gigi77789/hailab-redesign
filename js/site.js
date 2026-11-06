/* NEU HAI — shared behaviour and page renderers. Data lives in /data/*.js. */
(function () {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Research categories, in chart stack order (adjacent colours validated for colour-blind separation).
  // A paper's first topic is its main one (its dot colour on the home page); the Publications page
  // shows and filters by all of them.
  const CATS = [
    ["health", "AI for Healthcare"],
    ["algo", "LLMs and AI Agents"],
    ["education", "AI for Learning"],
    ["hac", "Human-Agent Collaboration"],
    ["collab", "Human-AI Collaboration"],
    ["community", "Community Engagement"],
  ];
  const TOPICS = Object.fromEntries(CATS);
  const PEER_FREE = new Set(["Preprint"]);

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
  // tools/pages.py sets data-theme before paint; this button flips it and remembers the choice
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

  /* ---------- helpers ---------- */
  const norm = (n) => n.toLowerCase().replace(/\(.*?\)|[‘’'"“”]\w+[‘’'"“”]/g, " ").replace(/[^a-z\s-]/g, "").replace(/\s+/g, " ").trim();
  const MEMBERS = new Set((window.HAI_MEMBERS || []).map(norm));
  const isMember = (name) => MEMBERS.has(norm(name));

  const PUBS = window.HAI_PUBS || [];
  const primaryTopic = (p) => (p.topics && p.topics[0]) || "collab";

  const primaryLink = (p) => {
    const l = p.links || {};
    return p.venueUrl || l.Paper || l.arXiv || l.PDF || l.Web || l.Project || "https://scholar.google.com/scholar?q=" + encodeURIComponent('"' + p.t + '"');
  };

  // "2026-01" shows as "Jan 2026"; a date with only a year ("2026") shows as the year
  const fmtMonth = (d) => {
    const [y, m] = d.split("-").map(Number);
    if (!m) return String(y);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  const tagHTML = (p) => `<span class="tag">${esc(p.tag)}</span>`;

  const authorsHTML = (a) =>
    a.map((n) => (isMember(n) ? `<span class="me">${esc(n)}</span>` : esc(n))).join(", ");

  const topicTag = (t) => `<span class="ptag k-${t}"><span class="key"></span>${esc(TOPICS[t] || t)}</span>`;

  function pubHTML(p) {
    const links = Object.entries(p.links || {})
      .map(([k, u]) => `<a href="${esc(u)}">${esc(k)}</a>`)
      .join("");
    const venue = p.v && p.v !== p.tag && p.v.length > 12 ? `<span class="pub-venue">${esc(p.v)}</span>` : "";
    const award = p.award ? `<span class="award">${esc(p.award)}</span>` : "";
    const pre = p.pre ? `<span class="pub-pre">Earlier as a preprint</span>` : "";
    const abs = p.abs
      ? `<details><summary>Abstract</summary><p>${esc(p.abs)}</p></details>`
      : "";
    const thumb = p.img ? `<a class="pub-thumb" href="${esc(primaryLink(p))}" tabindex="-1" aria-hidden="true"><img src="${esc(p.img)}" alt="" loading="lazy"></a>` : `<span class="pub-thumb empty" aria-hidden="true"></span>`;
    return `<li class="pub${p.img ? " has-img" : ""}">${thumb}<div class="pub-body">
      <h3 class="pub-title"><a href="${esc(primaryLink(p))}">${esc(p.t)}</a></h3>
      <p class="pub-authors">${authorsHTML(p.a)}</p>
      <div class="pub-meta">${tagHTML(p)}${venue}${award}${pre}${links ? `<span class="pub-links">${links}</span>` : ""}</div>
      <div class="pub-tags" aria-label="Topics">${(p.topics || []).map(topicTag).join("")}</div>
      ${abs}
    </div></li>`;
  }

  function faceHTML(m) {
    const initials = m.name.replace(/\(.*?\)|‘.*?’/g, "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
    const photo = m.photo
      ? `<img src="${esc(m.photo)}" alt="" loading="lazy" width="320" height="320">`
      : `<span class="face-initials" aria-hidden="true">${esc(initials)}</span>`;
    const inner = `<span class="face-photo">${photo}</span><span class="face-name">${esc(m.name)}</span><span class="face-role">${esc(m.role)}</span>`;
    return `<li>${m.url ? `<a class="face" href="${esc(m.url)}">${inner}</a>` : `<div class="face">${inner}</div>`}</li>`;
  }

  // People page: photo, name, role, and a sentence or two about the person
  function personHTML(m) {
    const initials = m.name.replace(/\(.*?\)|‘.*?’/g, "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
    const photo = m.photo ? `<img src="${esc(m.photo)}" alt="" loading="lazy" width="320" height="320">` : `<span class="face-initials" aria-hidden="true">${esc(initials)}</span>`;
    const name = m.url ? `<a href="${esc(m.url)}">${esc(m.name)}</a>` : esc(m.name);
    return `<li class="person"><span class="face-photo">${photo}</span><h3>${name}</h3><span class="face-role">${esc(m.role)}</span>${m.bio ? `<p class="person-bio">${esc(m.bio)}</p>` : ""}</li>`;
  }

  /* ---------- publication chart (home) ---------- */
  // One dot per paper, stacked by year and coloured by main research area.
  // Stack order doubles as the colour-safety order: adjacent hues were validated for colour-blind separation.
  const STACK = CATS.map(([k]) => k);

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
        marks += `<a href="${esc(primaryLink(d.p))}" tabindex="-1"><g class="d k-${d.t}" data-n="${dots.length - 1}" style="--d:${ci * 70 + Math.floor(j / PER_ROW) * 16}ms" transform="translate(${x} ${y})"><circle class="hit" r="${PITCH / 2}"/><circle class="dot" r="${R}"/></g></a>`;
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
        <a class="tip-title" href="${esc(primaryLink(p))}" tabindex="${pin ? 0 : -1}">${esc(p.t)}</a>`;
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

    // index.html#collab (any category key) opens the chart with that category locked in focus
    const fromHash = location.hash.slice(1);
    if (TOPICS[fromHash]) legend.querySelector(`.fk[data-topic="${fromHash}"]`)?.click();
  }

  /* ---------- research areas (home) ---------- */
  // Left: the areas as tabs, with a glass marker that slides to the chosen one.
  // Right: the area's newest papers; the chosen paper opens its figure right above its title.
  const shortAuthors = (a) => (a.length > 6 ? a.slice(0, 6).join(", ") + ", et al." : a.join(", "));

  function renderExplorer(host) {
    const areas = window.HAI_AREAS || [];
    if (!host || !areas.length) return;
    host.innerHTML = `<div class="ex-list" role="tablist" aria-label="Research areas"><span class="ex-ind k-${areas[0].topic}" aria-hidden="true"></span>${areas.map((a, i) =>
      `<button class="ex-item k-${a.topic}" role="tab" id="ex-t-${a.id}" aria-controls="ex-p-${a.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">
        <span class="ex-no" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
        <span class="ex-text"><span class="ex-name">${esc(a.name)}</span><span class="ex-short">${esc(a.short)}</span></span>
      </button>`).join("")}</div>
    <div class="ex-stage">${areas.map((a, i) => {
      const latest = PUBS.filter((p) => primaryTopic(p) === a.topic).slice(0, 4);
      return `<div class="ex-panel" role="tabpanel" id="ex-p-${a.id}" aria-labelledby="ex-t-${a.id}"${i ? " hidden" : ""}>
        <ol class="ex-papers" aria-label="Newest papers in ${esc(a.name)}">${latest.map((p, j) => {
          const links = Object.entries(p.links || {}).map(([k, u]) => `<a href="${esc(u)}">${esc(k)}</a>`).join("")
            || `<a href="${esc(primaryLink(p))}">Find the paper</a>`;
          const fig = p.img ? `<a class="screen" href="${esc(primaryLink(p))}" tabindex="-1"><img src="${esc(p.img)}" alt="Figure from “${esc(p.t)}”" loading="lazy"></a>` : "";
          return `<li${j === 0 ? ' class="on"' : ""}>
            <div class="ex-open ex-fig"><div>${fig}</div></div>
            <button type="button" class="ex-paper" aria-expanded="${j === 0}">
              <span class="ex-paper-title">${esc(p.t)}</span>
              <span class="ex-paper-meta">${tagHTML(p)}${/\d{4}/.test(p.tag) ? "" : " " + p.y}</span>
              <span class="ex-authors">${esc(shortAuthors(p.a))}</span>
            </button>
            <div class="ex-open"><div><p class="pub-links ex-row-links">${links}</p></div></div>
          </li>`;
        }).join("")}</ol>
        <a class="more" href="publications.html#${a.topic}">All papers in ${esc(a.name)}</a>
      </div>`;
    }).join("")}</div>`;

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
      ind.className = `ex-ind k-${areas[cur].topic}`;
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
    const latest = $("#latest");
    if (latest) {
      latest.innerHTML = (window.HAI_NEWS || [])
        .map((n) => `<li><time datetime="${n.date}">${fmtMonth(n.date)}</time>${n.html}</li>`).join("");
    }
    renderField();
    renderExplorer($("#explorer"));
    mesh($("#mesh"));

    const faces = $("#faces");
    if (faces) {
      const pi = window.HAI_PI;
      const people = [{ name: pi.name, role: "Lab director", photo: pi.photo, url: pi.url }]
        .concat((window.HAI_TEAM || []).filter((m) => m.group === "core"));
      faces.innerHTML = people.map(faceHTML).join("");
    }
  }

  if (page === "culture") {
    // a photo wall: polaroid-like prints, slightly tilted, that settle as they scroll in;
    // chips filter by kind, and a click opens the photo large
    const C = window.HAI_CULTURE || { kinds: [], photos: [] };
    const wall = $("#wall"), chips = $("#wall-filters");
    const TILT = [-2.2, 1.4, -0.8, 2, -1.6, 0.9, 1.8, -1.2];
    wall.innerHTML = C.photos.map((ph, i) => `<li class="print" data-cat="${esc(ph.cat)}" style="--r:${TILT[i % TILT.length]}deg;--k:${i % 3}">
        <button type="button" class="print-btn" data-i="${i}" aria-label="Open photo: ${esc(ph.caption)}">
          <img src="${esc(ph.src)}" alt="${esc(ph.caption)}" width="${ph.w}" height="${ph.h}" loading="lazy">
        </button>
        <p class="print-cap">${esc(ph.caption)}</p>
      </li>`).join("");
    chips.innerHTML = [["", "All"], ...C.kinds].map(([k, label]) =>
      `<button type="button" class="chip" data-cat="${k}" aria-pressed="${k === ""}">${esc(label)}</button>`).join("");
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
    const show = (i) => { cur = i; const ph = C.photos[i]; img.src = ph.src; img.alt = ph.caption; cap.textContent = ph.caption; };
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

  if (page === "join") {
    const N = window.HAI_NORMS;
    const body = $("#norms-body");
    if (N && body) {
      $("#norms-version").textContent = `Version of ${N.version}`;
      $("#norms-credit").innerHTML = `Everyone in the lab works by these norms. Inspired by ${esc(N.inspiredBy.by)}’s <a href="${esc(N.inspiredBy.url)}">${esc(N.inspiredBy.text)}</a>.`;
      body.innerHTML = `
        <ol class="norm-list">${N.norms.map((n) => `<li>${n}</li>`).join("")}</ol>
        <h3 class="norms-sub">Calendar events <span>(remote participation is fine)</span></h3>
        <dl class="cal">${N.calendar.map(([name, when, text]) => `<div><dt>${esc(name)}<span class="cal-when">${esc(when)}</span></dt><dd>${esc(text)}</dd></div>`).join("")}</dl>
        <h3 class="norms-sub">Getting started</h3>
        <p class="norms-note">If you are a visiting or rotating PhD student, master’s student, or undergraduate, make sure you do all of these. We will approve your membership on these lists if you agree with the NEU-HAI group norms listed on this page.</p>
        <ol class="start-list">${N.gettingStarted.map((n) => `<li>${n}</li>`).join("")}</ol>`;
    }

  }

  if (page === "people") {
    const pi = window.HAI_PI;
    const team = window.HAI_TEAM || [];
    const core = team.filter((m) => m.group === "core");
    const faculty = [{ name: pi.name, role: pi.role, photo: pi.photo, url: pi.url, bio: pi.short }].concat(core.filter((m) => /scientist/i.test(m.role)));
    $("#faculty").innerHTML = faculty.map(personHTML).join("");
    $("#phd").innerHTML = core.filter((m) => /phd/i.test(m.role)).map(personHTML).join("");
    $("#visiting").innerHTML = team.filter((m) => m.group === "visiting").map(personHTML).join("");
    $("#alumni").innerHTML = team.filter((m) => m.group === "alumni").map((m) =>
      `<li>${m.url ? `<a class="n" href="${esc(m.url)}">${esc(m.name)}</a>` : `<span class="n">${esc(m.name)}</span>`}<span class="r">${esc(m.role)}</span></li>`).join("");

    // a soft light follows the pointer across each card
    document.addEventListener("pointermove", (e) => {
      const c = e.target.closest && e.target.closest(".person");
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
      c.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
    }, { passive: true });
  }

  if (page === "news") {
    $("#news").innerHTML = (window.HAI_NEWS || [])
      .map((n) => `<li><time datetime="${n.date}">${fmtMonth(n.date)}</time><div>${n.html}</div></li>`).join("");
  }

  if (page === "publications") {
    const params = new URLSearchParams(location.search);
    const hashTopic = location.hash.slice(1);
    const state = { q: params.get("q") || "", topic: params.get("topic") || (hashTopic in TOPICS ? hashTopic : ""), peer: params.get("peer") === "1" };
    const input = $("#q");
    const filters = $("#filters");
    const out = $("#pubs");
    const status = $("#status");
    input.value = state.q;

    const chips = [["", "All topics"], ...Object.entries(TOPICS)];
    filters.innerHTML = chips.map(([k, label]) => `<button type="button" class="chip${k ? " k-" + k : ""}" data-topic="${k}" aria-pressed="false">${k ? '<span class="key"></span>' : ""}${label}</button>`).join("")
      + `<button type="button" class="chip" data-peer aria-pressed="false">Peer-reviewed only</button>`;

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
      const list = PUBS.filter((p) =>
        (!state.topic || p.topics.includes(state.topic)) &&
        (!state.peer || !PEER_FREE.has(p.tag)) &&
        (!q || (p.t + " " + p.a.join(" ") + " " + p.v + " " + p.tag).toLowerCase().includes(q)));

      const years = [...new Set(list.map((p) => p.y))].sort((a, b) => b - a);
      out.innerHTML = list.length
        ? years.map((y) => `<section class="year-block" aria-labelledby="y${y}">
            <h2 class="year-label" id="y${y}">${y}</h2>
            <ol class="pub-list">${list.filter((p) => p.y === y).map(pubHTML).join("")}</ol>
          </section>`).join("")
        : `<p class="pubs-empty">No papers match these filters. <button type="button" id="reset">Show all papers</button></p>`;

      const total = PUBS.length;
      status.innerHTML = list.length === total
        ? `<b>${total}</b> papers. Lab members’ names are in bold.`
        : `Showing <b>${list.length}</b> of ${total} papers.`;

      const reset = $("#reset");
      if (reset) reset.addEventListener("click", () => { state.q = ""; state.topic = ""; state.peer = false; input.value = ""; sync(); render(); });
    };

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
