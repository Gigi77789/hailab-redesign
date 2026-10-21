/* NEU HAI — shared behaviour and page renderers. Data lives in /data/*.js. */
(function () {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const TOPICS = { health: "Health", education: "Learning", agents: "LLM agents", data: "Data work", collab: "Collaboration" };
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

  /* ---------- pronunciation ---------- */
  const say = $(".say");
  if (say) {
    if (!("speechSynthesis" in window)) {
      say.hidden = true;
    } else {
      say.addEventListener("click", () => {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance("new, high");
        u.lang = "en-US";
        u.rate = 0.8;
        const word = $(".entry-word");
        u.onstart = () => {
          say.setAttribute("data-speaking", "");
          if (word) { word.classList.remove("speaking"); void word.offsetWidth; word.classList.add("speaking"); }
        };
        u.onend = u.onerror = () => { say.removeAttribute("data-speaking"); word && word.classList.remove("speaking"); };
        speechSynthesis.speak(u);
      });
    }
  }

  /* ---------- helpers ---------- */
  const norm = (n) => n.toLowerCase().replace(/\(.*?\)|[‘’'"“”]\w+[‘’'"“”]/g, " ").replace(/[^a-z\s-]/g, "").replace(/\s+/g, " ").trim();
  const MEMBERS = new Set((window.HAI_MEMBERS || []).map(norm));
  const isMember = (name) => MEMBERS.has(norm(name));

  const PUBS = window.HAI_PUBS || [];
  const findPub = (prefix) => {
    const p = prefix.toLowerCase();
    return PUBS.find((x) => x.t.toLowerCase().startsWith(p));
  };

  const primaryLink = (p) => {
    const l = p.links || {};
    return l.arXiv || l.PDF || l.Web || l.Project || "https://scholar.google.com/scholar?q=" + encodeURIComponent('"' + p.t + '"');
  };

  const fmtMonth = (d) => {
    const [y, m] = d.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  const tagHTML = (p) => `<span class="tag${PEER_FREE.has(p.tag) ? "" : " peer"}">${esc(p.tag)}</span>`;

  const authorsHTML = (a) =>
    a.map((n) => (isMember(n) ? `<span class="me">${esc(n)}</span>` : esc(n))).join(", ");

  function pubHTML(p, i) {
    const links = Object.entries(p.links || {})
      .map(([k, u]) => `<a href="${esc(u)}">${esc(k)}</a>`)
      .join("");
    const venue = p.v && p.v !== p.tag && p.v.length > 12 ? `<span class="pub-venue">${esc(p.v)}</span>` : "";
    const award = p.award ? `<span class="award">Paper award</span>` : "";
    const abs = p.abs
      ? `<details><summary>Abstract</summary><p>${esc(p.abs)}</p></details>`
      : "";
    return `<li class="pub">
      <h3 class="pub-title"><a href="${esc(primaryLink(p))}">${esc(p.t)}</a></h3>
      <p class="pub-authors">${authorsHTML(p.a)}</p>
      <div class="pub-meta">${tagHTML(p)}${venue}${award}${links ? `<span class="pub-links">${links}</span>` : ""}</div>
      ${abs}
    </li>`;
  }

  function faceHTML(m) {
    const initials = m.name.replace(/\(.*?\)|‘.*?’/g, "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
    const photo = m.photo
      ? `<img src="${esc(m.photo)}" alt="" loading="lazy" width="320" height="320">`
      : `<span class="face-initials" aria-hidden="true">${esc(initials)}</span>`;
    const inner = `<span class="face-photo">${photo}</span><span class="face-name">${esc(m.name)}</span><span class="face-role">${esc(m.role)}</span>`;
    return `<li>${m.url ? `<a class="face" href="${esc(m.url)}">${inner}</a>` : `<div class="face">${inner}</div>`}</li>`;
  }

  /* ---------- the paper field (home hero) ---------- */
  // Stack order doubles as the colour-safety order: adjacent hues were validated for colour-blind separation.
  const STACK = ["health", "agents", "education", "data", "other"];
  const AREA_NAMES = { health: "AI for health care", agents: "LLM agents", education: "AI for learning", data: "Data work", other: "Other topics" };
  const primaryTopic = (p) => ["health", "education", "agents", "data"].find((t) => p.topics.includes(t)) || "other";
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function countTo(el, to, ms = 500) {
    const from = +el.textContent || 0;
    if (REDUCED || from === to) { el.textContent = to; return; }
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function renderField() {
    const host = $("#field-plot");
    const fig = $("#field");
    const tip = $("#tip");
    const cap = $("#field-cap");
    if (!host || !PUBS.length) return;

    const ys = PUBS.map((p) => p.y);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);
    const cols = years.map((y) => PUBS.map((p, i) => ({ p, i, t: primaryTopic(p) }))
      .filter((d) => d.p.y === y)
      .sort((a, b) => STACK.indexOf(a.t) - STACK.indexOf(b.t)));

    const PER_ROW = 2, PITCH = 17, R = 6.5, GAP = 8;
    const colW = PER_ROW * PITCH, step = colW + GAP;
    const rows = Math.max(...cols.map((c) => Math.ceil(c.length / PER_ROW)));
    const W = years.length * step - GAP, H = rows * PITCH, LABEL = 30;

    // every dot keeps its own state so the loop below can animate position and size
    const dots = [];
    let marks = "", labels = "";
    cols.forEach((col, ci) => {
      col.forEach((d, j) => {
        const row = Math.floor(j / PER_ROW), k = j % PER_ROW;
        const tx = ci * step + k * PITCH + PITCH / 2;
        const ty = H - row * PITCH - PITCH / 2;
        const sx = Math.random() * (W + 120) - 60;
        const sy = Math.random() * (H + 80) - H * 0.9;
        dots.push({ ...d, tx, ty, x: REDUCED ? tx : sx, y: REDUCED ? ty : sy, cx: tx, cy: ty, sx, sy, r: R, delay: ci * 85 + row * 30 + Math.random() * 120, phase: Math.random() * 6.28 });
        marks += `<a href="${esc(primaryLink(d.p))}" tabindex="-1"><g class="d k-${d.t}" data-n="${dots.length - 1}" transform="translate(${tx} ${ty})"><circle class="hit" r="${PITCH / 2 + 0.5}"/><circle class="dot" r="${R}"/></g></a>`;
      });
      const y = years[ci];
      if (y % 5 === 0 || ci === 0 || ci === years.length - 1) {
        labels += `<text class="yr" x="${ci * step + colW / 2}" y="${H + 24}" text-anchor="middle">${y}</text>`;
      }
    });
    host.innerHTML = `<svg viewBox="-8 -8 ${W + 16} ${H + LABEL + 8}" aria-hidden="true">
      <defs>
        <filter id="glow" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <linearGradient id="scan-grad" x1="0" x2="1"><stop offset="0" stop-color="#67e0ff" stop-opacity="0"/><stop offset="1" stop-color="#67e0ff" stop-opacity=".16"/></linearGradient>
      </defs>
      <g class="scanner" opacity="0"><rect class="scan" x="-60" y="-8" width="60" height="${H + 12}"/><line class="scan-line" x1="0" x2="0" y1="-8" y2="${H + 4}"/></g>
      <line class="base" x1="-8" x2="${W + 8}" y1="${H + 4}" y2="${H + 4}"/>
      <g class="dots" filter="url(#glow)">${marks}</g>${labels}
      <line class="ret ret-x" x1="0" x2="0" y1="-8" y2="${H + 4}"/><line class="ret ret-y" x1="-8" x2="${W + 8}" y1="0" y2="0"/>
    </svg>`;
    const svg = host.querySelector("svg");
    const scanner = svg.querySelector(".scanner");
    const retX = svg.querySelector(".ret-x"), retY = svg.querySelector(".ret-y");
    const aim = $("#aim");
    const groups = [...svg.querySelectorAll(".d")];
    const circles = groups.map((g) => g.querySelector(".dot"));

    // legend counts
    const counts = {};
    dots.forEach((d) => (counts[d.t] = (counts[d.t] || 0) + 1));
    document.querySelectorAll("#legend .fk").forEach((b) => b.insertAdjacentHTML("beforeend", ` <span class="n">${counts[b.dataset.topic] || 0}</span>`));

    // caption with a live count
    const setCaption = (topic) => {
      const n = topic ? counts[topic] : PUBS.length;
      cap.innerHTML = topic
        ? `<b class="cnt">${+(cap.querySelector(".cnt")?.textContent || 0)}</b> papers on ${esc(AREA_NAMES[topic].replace(/^Data/, "data"))}. <a href="publications.html#${topic}">See the list</a>`
        : `<b class="cnt">${+(cap.querySelector(".cnt")?.textContent || 0)}</b> papers since ${y0}, one dot each. Point at a dot to read it.`;
      countTo(cap.querySelector(".cnt"), n);
    };
    setCaption("");

    // animation loop: assembly on load, then a cursor lens and focus changes
    let pointer = null, focus = "", hoverN = -1, t0 = performance.now(), running = false, onScreen = true;
    const LENS = 46, SCAN_START = 2600, SCAN_EVERY = 7000, SCAN_SWEEP = 4200;
    const ease = (k) => 1 - Math.pow(1 - k, 4);
    function frame(now) {
      let busy = false;
      const t = now - t0;
      // a scan line sweeps the field every few seconds and lights the dots it crosses
      let scanX = null;
      if (!REDUCED && t > SCAN_START) {
        const k = ((t - SCAN_START) % SCAN_EVERY) / SCAN_SWEEP;
        if (k <= 1) scanX = -30 + (W + 60) * k;
        scanner.setAttribute("opacity", scanX === null ? 0 : 1);
        if (scanX !== null) scanner.setAttribute("transform", `translate(${scanX.toFixed(1)} 0)`);
      }
      for (let n = 0; n < dots.length; n++) {
        const d = dots[n];
        // position
        if (d.x !== d.tx || d.y !== d.ty) {
          const k = Math.max(0, Math.min(1, (t - d.delay) / 900));
          if (k <= 0) {
            d.cx = d.sx + Math.sin(t / 600 + d.phase) * 4;
            d.cy = d.sy + Math.cos(t / 700 + d.phase) * 4;
          } else {
            const e = ease(k);
            d.cx = d.sx + (d.tx - d.sx) * e;
            d.cy = d.sy + (d.ty - d.sy) * e;
          }
          if (k >= 1) { d.x = d.tx; d.y = d.ty; d.cx = d.tx; d.cy = d.ty; } else busy = true;
          groups[n].setAttribute("transform", `translate(${d.cx.toFixed(1)} ${d.cy.toFixed(1)})`);
        }
        // size: dim when another area is in focus, swell near the cursor
        let target = focus && d.t !== focus ? R * 0.7 : R;
        if (pointer && d.x === d.tx) {
          const dist = Math.hypot(d.tx - pointer.x, d.ty - pointer.y);
          if (dist < LENS) target *= 1 + 0.6 * Math.pow(1 - dist / LENS, 2);
        }
        if (scanX !== null && Math.abs(d.tx - scanX) < 9) d.boost = 1;
        if (d.boost) { target *= 1 + 0.45 * d.boost; d.boost = d.boost > 0.02 ? d.boost * 0.93 : 0; busy = true; }
        if (n === hoverN) target = Math.max(target, R * 1.45);
        const nr = d.r + (target - d.r) * 0.28;
        if (Math.abs(nr - target) > 0.02) busy = true;
        d.r = Math.abs(nr - target) > 0.02 ? nr : target;
        circles[n].setAttribute("r", d.r.toFixed(2));
      }
      if ((busy || (!REDUCED && onScreen)) && !document.hidden) requestAnimationFrame(frame); else running = false;
    }
    const kick = () => { if (!running) { running = true; requestAnimationFrame(frame); } };
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; if (onScreen) kick(); }).observe(svg);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });
    if (document.hidden) dots.forEach((d) => { d.x = d.tx; d.y = d.ty; });
    kick();

    // tooltip
    let pinned = null, lastPointer = "mouse";
    const showTip = (n, pin) => {
      const d = dots[n], p = d.p;
      tip.innerHTML = `<div class="tip-meta"><span class="key k-${d.t}"></span>${esc(AREA_NAMES[d.t])}<span class="tag">${esc(p.tag)}</span></div>
        <a class="tip-title" href="${esc(primaryLink(p))}" tabindex="${pin ? 0 : -1}">${esc(p.t)}</a>`;
      const fr = fig.getBoundingClientRect(), dr = circles[n].getBoundingClientRect();
      const w = tip.offsetWidth, h = tip.offsetHeight;
      let x = dr.left - fr.left + dr.width / 2 - w / 2;
      x = Math.max(0, Math.min(x, fr.width - w));
      let y = dr.top - fr.top - h - 14;
      const top = fig.closest(".entry").getBoundingClientRect().top;
      if (fr.top + y < top + 8) y = dr.bottom - fr.top + 14;
      tip.style.left = x + "px";
      tip.style.top = y + "px";
      tip.classList.add("show");
      tip.classList.toggle("pin", !!pin);
    };
    const hideTip = () => { tip.classList.remove("show", "pin"); pinned = null; hoverN = -1; kick(); };

    const toSvg = (e) => {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      return pt.matrixTransform(svg.getScreenCTM().inverse());
    };
    svg.addEventListener("pointermove", (e) => {
      lastPointer = e.pointerType;
      if (e.pointerType !== "mouse" || pinned) return;
      pointer = toSvg(e);
      const ci = Math.max(0, Math.min(years.length - 1, Math.floor((pointer.x + GAP / 2) / step)));
      retX.setAttribute("x1", pointer.x); retX.setAttribute("x2", pointer.x);
      retY.setAttribute("y1", pointer.y); retY.setAttribute("y2", pointer.y);
      fig.classList.add("aim");
      if (aim) aim.innerHTML = `Target <b>${years[ci]}</b> <span class="sep">/</span> <b>${cols[ci].length}</b> papers`;
      const g = e.target.closest(".d");
      const n = g ? +g.dataset.n : -1;
      if (n !== hoverN) { hoverN = n; n >= 0 ? showTip(n, false) : tip.classList.remove("show"); }
      kick();
    });
    svg.addEventListener("pointerleave", () => {
      pointer = null; fig.classList.remove("aim");
      if (aim) aim.textContent = "Point at the field";
      if (!pinned) hideTip();
      kick();
    });
    svg.addEventListener("pointerdown", (e) => { lastPointer = e.pointerType; });
    svg.addEventListener("click", (e) => {
      const g = e.target.closest(".d");
      if (!g || lastPointer === "mouse") return; // on a mouse the dot is a real link
      e.preventDefault();
      pinned = +g.dataset.n; hoverN = pinned; showTip(pinned, true); kick();
    });
    document.addEventListener("click", (e) => { if (pinned !== null && !e.target.closest("#field")) hideTip(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });

    // area keys: hover previews, click locks
    const legend = $("#legend");
    let locked = "";
    const applyFocus = (t) => {
      focus = t;
      if (t) fig.dataset.focus = t; else delete fig.dataset.focus;
      legend.querySelectorAll(".fk").forEach((b) => b.classList.toggle("on", b.dataset.topic === t));
      setCaption(t);
      kick();
    };
    legend.addEventListener("pointerover", (e) => { const b = e.target.closest(".fk"); if (b && !locked) applyFocus(b.dataset.topic); });
    legend.addEventListener("pointerleave", () => { if (!locked) applyFocus(""); });
    legend.addEventListener("click", (e) => {
      const b = e.target.closest(".fk");
      if (!b) return;
      locked = locked === b.dataset.topic ? "" : b.dataset.topic;
      legend.querySelectorAll(".fk").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.topic === locked)));
      applyFocus(locked);
    });
  }

  /* ---------- definition: words light up as you read down ---------- */
  function litWords(root) {
    if (!root || REDUCED) return;
    const words = [];
    const walk = (node) => {
      [...node.childNodes].forEach((c) => {
        if (c.nodeType === 3) {
          const frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const s = document.createElement("span");
            s.className = "w";
            s.textContent = part;
            words.push(s);
            frag.appendChild(s);
          });
          c.replaceWith(frag);
        } else if (c.nodeType === 1) walk(c);
      });
    };
    root.querySelectorAll("li").forEach(walk);
    root.classList.add("lit-ready");
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = root.getBoundingClientRect(), vh = innerHeight;
      const k = Math.max(0, Math.min(1, (vh * 0.9 - r.top) / (r.height + vh * 0.35)));
      const lit = Math.round(k * words.length);
      words.forEach((w, i) => {
        const on = i < lit;
        if (on && !w.classList.contains("lit")) { w.classList.add("flash"); setTimeout(() => w.classList.remove("flash"), 380); }
        w.classList.toggle("lit", on);
      });
    };
    addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    addEventListener("resize", update);
    update();
  }

  /* ---------- research explorer ---------- */
  function renderExplorer(host) {
    const areas = window.HAI_AREAS || [];
    if (!host || !areas.length) return;
    host.innerHTML = `<div class="ex-list" role="tablist" aria-label="Research areas">${areas.map((a, i) => {
      const n = PUBS.filter((p) => primaryTopic(p) === a.topic).length;
      return `<button class="ex-item k-${a.topic}" role="tab" id="ex-t-${a.id}" aria-controls="ex-p-${a.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">
        <span class="ex-name"><span class="key"></span>${esc(a.name)}</span>
        <span class="ex-meta">${n} papers</span>
        <span class="ex-short">${esc(a.short)}</span>
        <span class="ex-bar" aria-hidden="true"><i></i></span>
      </button>`;
    }).join("")}</div>
    <div class="ex-stage">${areas.map((a, i) => {
      const papers = a.papers.slice(0, 3).map(findPub).filter(Boolean)
        .map((p) => `<li><a href="${esc(primaryLink(p))}">${esc(p.t.split(":")[0])}</a>${tagHTML(p)}</li>`).join("");
      return `<div class="ex-panel" role="tabpanel" id="ex-p-${a.id}" aria-labelledby="ex-t-${a.id}"${i ? " hidden" : ""}>
        <figure class="hud"><div class="screen"><img src="${esc(a.figure.src)}" alt="${esc(a.figure.alt)}" loading="lazy"></div><figcaption class="readout">Fig. ${i + 1} <span class="sep">/</span> ${esc(a.figure.caption)}</figcaption></figure>
        <ul class="paper-mini">${papers}</ul>
        <a class="more" href="research.html#${a.id}">Read more about ${esc(a.name)}</a>
      </div>`;
    }).join("")}</div>`;

    const tabs = [...host.querySelectorAll(".ex-item")];
    const panels = [...host.querySelectorAll(".ex-panel")];
    let cur = 0, auto = !REDUCED, start = performance.now(), visible = false;
    const DWELL = 6000;
    const select = (i, focusTab) => {
      cur = (i + tabs.length) % tabs.length;
      tabs.forEach((t, j) => { t.setAttribute("aria-selected", String(j === cur)); t.tabIndex = j === cur ? 0 : -1; t.style.setProperty("--p", "0%"); });
      panels.forEach((p, j) => (p.hidden = j !== cur));
      if (focusTab) tabs[cur].focus();
      start = performance.now();
    };
    const stop = () => { auto = false; tabs.forEach((t) => t.style.setProperty("--p", "100%")); };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => { stop(); select(i); });
      t.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); stop(); select(cur + 1, true); }
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); stop(); select(cur - 1, true); }
      });
    });
    host.addEventListener("pointerenter", () => { if (auto) start = performance.now() - 0; host.dataset.hover = "1"; });
    host.addEventListener("pointerleave", () => { delete host.dataset.hover; start = performance.now(); });
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start = performance.now(); }, { threshold: 0.4 }).observe(host);
    const loop = (now) => {
      if (!auto) return;
      if (visible && !host.dataset.hover) {
        const k = (now - start) / DWELL;
        tabs[cur].style.setProperty("--p", Math.min(100, k * 100) + "%");
        if (k >= 1) select(cur + 1);
      } else if (host.dataset.hover) start = now - (parseFloat(tabs[cur].style.getPropertyValue("--p")) || 0) / 100 * DWELL;
      requestAnimationFrame(loop);
    };
    if (auto) requestAnimationFrame(loop); else stop();
  }

  /* ---------- reveal a group once it scrolls into view ---------- */
  function revealOnView(el) {
    if (!el || REDUCED || !("IntersectionObserver" in window)) return;
    [...el.children].forEach((c, i) => c.style.setProperty("--i", i));
    el.classList.add("reveal");
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { el.classList.add("in"); io.disconnect(); } }, { threshold: 0.2 });
    io.observe(el);
  }

  /* ---------- decode: letters scramble, then lock in ---------- */
  const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%*+=<>/";
  function splitChars(el) {
    if (el.querySelector(".ch")) return [...el.querySelectorAll(".ch")];
    const text = el.textContent;
    el.setAttribute("aria-label", text);
    el.innerHTML = `<span aria-hidden="true">${[...text].map((c, i) => (c === " " ? " " : `<span class="ch" style="--i:${i}">${esc(c)}</span>`)).join("")}</span>`;
    return [...el.querySelectorAll(".ch")];
  }
  function decode(el, { stagger = 45, base = 250 } = {}) {
    if (!el || REDUCED || el.dataset.decoding) return;
    const chars = splitChars(el);
    el.dataset.decoding = "1";
    // lock each glyph's width so the line does not jitter while it scrambles
    chars.forEach((c) => { c.dataset.final = c.dataset.final || c.textContent; c.style.width = c.getBoundingClientRect().width + "px"; });
    const t0 = performance.now();
    const done = chars.map((_, i) => base + i * stagger + Math.random() * 180);
    const tick = (now) => {
      let left = 0;
      chars.forEach((c, i) => {
        if (now - t0 >= done[i]) {
          if (c.classList.contains("scr")) { c.textContent = c.dataset.final; c.classList.remove("scr"); }
        } else {
          left++;
          if (Math.random() < 0.5) { c.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0]; c.classList.add("scr"); }
        }
      });
      if (left) setTimeout(() => requestAnimationFrame(tick), 40);
      else { chars.forEach((c) => (c.style.width = "")); delete el.dataset.decoding; }
    };
    requestAnimationFrame(tick);
  }
  const fontsReady = (document.fonts && document.fonts.ready) || Promise.resolve();
  function decodeOnView(els) {
    if (REDUCED || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { decode(e.target, { stagger: 22, base: 80 }); io.unobserve(e.target); } }), { threshold: 0.6 });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- starfield behind the hero ---------- */
  function starfield(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const host = canvas.parentElement;
    let w = 0, h = 0, stars = [], px = 0, py = 0, tx = 0, ty = 0, live = true;
    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = host.clientWidth; h = host.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(260, Math.round((w * h) / 7000));
      stars = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, z: 0.2 + Math.random() * 0.8, p: Math.random() * 6.28, c: Math.random() < 0.18 }));
    };
    const draw = (now) => {
      ctx.clearRect(0, 0, w, h);
      px += (tx - px) * 0.05; py += (ty - py) * 0.05;
      for (const s of stars) {
        if (!REDUCED) { s.x -= s.z * 0.06; if (s.x < -4) s.x = w + 4; }
        const a = 0.25 + 0.75 * s.z * (REDUCED ? 1 : 0.65 + 0.35 * Math.sin(now / 900 + s.p));
        ctx.fillStyle = s.c ? `rgba(103,224,255,${a})` : `rgba(220,232,255,${a})`;
        ctx.beginPath();
        ctx.arc(s.x + px * s.z * 18, s.y + py * s.z * 12, s.z * 1.25, 0, 6.283);
        ctx.fill();
      }
      if (!REDUCED && live && !document.hidden) requestAnimationFrame(draw);
    };
    size();
    addEventListener("resize", size);
    host.addEventListener("pointermove", (e) => { const r = host.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width - 0.5; ty = (e.clientY - r.top) / r.height - 0.5; });
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { const was = live; live = es[0].isIntersecting; if (live && !was) requestAnimationFrame(draw); }).observe(host);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && live) requestAnimationFrame(draw); });
    requestAnimationFrame(draw);
  }

  /* ---------- sticky header shadow ---------- */
  const header = $(".site-header");
  if (header) {
    const onScroll = () => header.classList.toggle("scrolled", scrollY > 8);
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- pages ---------- */
  const page = ($("[data-page]") || document.body).dataset.page;

  if (page === "home") {
    const latest = $("#latest");
    if (latest) {
      latest.innerHTML = (window.HAI_NEWS || []).slice(0, 3)
        .map((n) => `<li><time datetime="${n.date}">${fmtMonth(n.date)}</time>${n.html}</li>`).join("");
    }

    const word = $(".entry-word");
    if (word) {
      fontsReady.then(() => decode(word, { stagger: 70, base: 200 }));
      word.addEventListener("pointerenter", () => decode(word, { stagger: 35, base: 60 }));
    }
    starfield($("#stars"));
    const clock = $("#clock");
    if (clock) {
      const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
      const tickClock = () => (clock.textContent = fmt.format(new Date()));
      tickClock();
      setInterval(tickClock, 1000);
    }
    const team = window.HAI_TEAM || [];
    const readouts = {
      areas: `${(window.HAI_AREAS || []).length} areas <span class="sep">/</span> <b>${PUBS.filter((p) => primaryTopic(p) !== "other").length}</b> papers mapped`,
      recent: `Latest <b>5</b> of ${PUBS.length}`,
      people: `<b>${team.filter((m) => m.group === "core").length + 1}</b> current <span class="sep">/</span> ${team.filter((m) => m.group === "visiting").length} visiting <span class="sep">/</span> ${team.filter((m) => m.group === "alumni").length} alumni`,
    };
    document.querySelectorAll("[data-readout]").forEach((el) => (el.innerHTML = readouts[el.dataset.readout] || ""));
    const fieldN = $("#field-n");
    if (fieldN) fieldN.textContent = PUBS.length;
    renderField();
    litWords($("#senses"));
    renderExplorer($("#explorer"));

    const sel = $("#selected");
    if (sel) {
      const picks = ["Can LLM Agents Simulate Multi-Turn", "RECOVER", "Through the Lens of Human-Human", "CardioAI", "Characterizing LLM-Empowered"];
      sel.innerHTML = picks.map(findPub).filter(Boolean).map((p) => `<li>
        ${tagHTML(p)}
        <div>
          <h3 class="pub-title"><a href="${esc(primaryLink(p))}">${esc(p.t)}</a></h3>
          <p class="pub-authors" style="margin:0">${authorsHTML(p.a)}</p>
        </div></li>`).join("");
    }

    const faces = $("#faces");
    if (faces) {
      const pi = window.HAI_PI;
      const people = [{ name: pi.name, role: "Lab director", photo: pi.photo, url: pi.url }]
        .concat((window.HAI_TEAM || []).filter((m) => m.group === "core"));
      faces.innerHTML = people.map(faceHTML).join("");
      revealOnView(faces);
    }
  }

  fontsReady.then(() => {
    decodeOnView([...document.querySelectorAll(".section-head h2, .join-band h2")]);
    const h1 = $(".page-head h1");
    if (h1) decode(h1, { stagger: 40, base: 120 });
  });

  if (page === "people") {
    const pi = window.HAI_PI;
    $("#pi").innerHTML = `
      <div class="pi-photo"><img src="${esc(pi.photo)}" alt="Portrait of ${esc(pi.name)}" width="270" height="270"></div>
      <div>
        <h2>${esc(pi.name)}</h2>
        <p class="pi-title">${esc(pi.title)}, Khoury College of Computer Sciences and College of Arts, Media and Design</p>
        <div class="pi-bio">${pi.bio.map((b) => `<p>${esc(b)}</p>`).join("")}</div>
        <p class="pi-links"><a href="${esc(pi.url)}">Personal website</a><a href="mailto:${esc(pi.email)}">${esc(pi.email)}</a></p>
      </div>`;
    const team = window.HAI_TEAM || [];
    $("#core").innerHTML = team.filter((m) => m.group === "core").map(faceHTML).join("");
    $("#visiting").innerHTML = team.filter((m) => m.group === "visiting").map(faceHTML).join("");
    $("#alumni").innerHTML = team.filter((m) => m.group === "alumni").map((m) =>
      `<li>${m.url ? `<a class="n" href="${esc(m.url)}">${esc(m.name)}</a>` : `<span class="n">${esc(m.name)}</span>`}<span class="r">${esc(m.role)}</span></li>`).join("");
  }

  if (page === "research") {
    $("#research-areas").innerHTML = (window.HAI_AREAS || []).map((a) => {
      const papers = a.papers.map(findPub).filter(Boolean)
        .map((p) => `<li><a href="${esc(primaryLink(p))}">${esc(p.t)}</a>${tagHTML(p)}</li>`).join("");
      return `<section class="area-full k-${a.topic}" id="${a.id}" aria-labelledby="${a.id}-h">
        <div class="prose">
          <h2 id="${a.id}-h">${esc(a.name)}</h2>
          ${a.body.map((b) => `<p>${esc(b)}</p>`).join("")}
          <h3>Selected papers</h3>
          <ul class="paper-mini">${papers}</ul>
          <p style="margin-top:14px;font-size:var(--fs-sm);font-weight:500"><a href="publications.html#${a.topic}">See all ${PUBS.filter((p) => p.topics.includes(a.topic)).length} related papers</a></p>
        </div>
        <figure><div class="frame"><img src="${esc(a.figure.src)}" alt="${esc(a.figure.alt)}" loading="lazy"></div><figcaption>${esc(a.figure.caption)}</figcaption></figure>
      </section>`;
    }).join("");
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
    filters.innerHTML = chips.map(([k, label]) => `<button type="button" class="chip${k && k !== "collab" ? " k-" + k : ""}" data-topic="${k}" aria-pressed="false">${k && k !== "collab" ? '<span class="key"></span>' : ""}${label}</button>`).join("")
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
        ? years.map((y, i) => `<section class="year-block" aria-labelledby="y${y}">
            <h2 class="year-label" id="y${y}">${y}</h2>
            <ol class="pub-list">${list.filter((p) => p.y === y).map(pubHTML).join("")}</ol>
          </section>`).join("")
        : `<p class="empty">No papers match these filters. <button type="button" id="reset">Show all papers</button></p>`;

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
})();
