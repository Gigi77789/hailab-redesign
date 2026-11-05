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

  const fmtMonth = (d) => {
    const [y, m] = d.split("-").map(Number);
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
    legend.querySelectorAll(".fk").forEach((b) => b.insertAdjacentHTML("beforeend", ` <span class="n">${counts[b.dataset.topic] || 0}</span>`));

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
        marks += `<a href="${esc(primaryLink(d.p))}" tabindex="-1"><g class="d k-${d.t}" data-n="${dots.length - 1}" transform="translate(${x} ${y})"><circle class="hit" r="${PITCH / 2}"/><circle class="dot" r="${R}"/></g></a>`;
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
  function renderExplorer(host) {
    const areas = window.HAI_AREAS || [];
    if (!host || !areas.length) return;
    host.innerHTML = `<div class="ex-list" role="tablist" aria-label="Research areas">${areas.map((a, i) =>
      `<button class="ex-item k-${a.topic}" role="tab" id="ex-t-${a.id}" aria-controls="ex-p-${a.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">
        <span class="ex-name">${esc(a.name)}</span>
        <span class="ex-short">${esc(a.short)}</span>
      </button>`).join("")}</div>
    <div class="ex-stage">${areas.map((a, i) => {
      const latest = PUBS.filter((p) => primaryTopic(p) === a.topic).slice(0, 4);
      return `<div class="ex-panel" role="tabpanel" id="ex-p-${a.id}" aria-labelledby="ex-t-${a.id}"${i ? " hidden" : ""}>
        <div class="ex-feature"></div>
        <ol class="ex-papers" aria-label="Newest papers in ${esc(a.name)}">${latest.map((p, j) => {
          const links = Object.entries(p.links || {}).map(([k, u]) => `<a href="${esc(u)}">${esc(k)}</a>`).join("")
            || `<a href="${esc(primaryLink(p))}">Find the paper</a>`;
          return `<li${j === 0 ? ' class="on"' : ""}><button type="button" class="ex-paper" data-i="${PUBS.indexOf(p)}" aria-pressed="${j === 0}">
            <span class="ex-paper-title">${esc(p.t)}</span>
            <span class="ex-paper-meta">${tagHTML(p)}${/\d{4}/.test(p.tag) ? "" : p.y}</span>
          </button><p class="pub-links ex-row-links">${links}</p></li>`;
        }).join("")}</ol>
        <a class="more" href="publications.html#${a.topic}">All papers in ${esc(a.name)}</a>
      </div>`;
    }).join("")}</div>`;

    // the selected paper shows its figure (when it has one) and, in its row, its links
    const feature = (panel, p) => {
      panel.querySelector(".ex-feature").innerHTML = p.img
        ? `<figure><a class="screen" href="${esc(primaryLink(p))}"><img src="${esc(p.img)}" alt="Figure from “${esc(p.t)}”" loading="lazy"></a></figure>`
        : "";
      panel.querySelectorAll(".ex-paper").forEach((b) => {
        const on = +b.dataset.i === PUBS.indexOf(p);
        b.setAttribute("aria-pressed", String(on));
        b.parentElement.classList.toggle("on", on);
      });
    };
    host.querySelectorAll(".ex-panel").forEach((panel) => {
      const first = panel.querySelector(".ex-paper");
      if (first) feature(panel, PUBS[+first.dataset.i]);
      panel.addEventListener("click", (e) => {
        const b = e.target.closest(".ex-paper");
        if (b) feature(panel, PUBS[+b.dataset.i]);
      });
    });

    const tabs = [...host.querySelectorAll(".ex-item")];
    const panels = [...host.querySelectorAll(".ex-panel")];
    let cur = 0;
    const select = (i, focusTab) => {
      cur = (i + tabs.length) % tabs.length;
      tabs.forEach((t, j) => { t.setAttribute("aria-selected", String(j === cur)); t.tabIndex = j === cur ? 0 : -1; });
      panels.forEach((p, j) => (p.hidden = j !== cur));
      if (focusTab) tabs[cur].focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(i));
      t.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); select(cur + 1, true); }
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); select(cur - 1, true); }
      });
    });
  }

  /* ---------- grants ---------- */
  const GRANTS = window.HAI_GRANTS || [];
  // home: the number of grants and their award numbers, grouped by sponsor; no titles or amounts
  function grantSummaryHTML() {
    const by = new Map();
    GRANTS.forEach((g) => {
      const k = g.sponsor.split(" / ")[0];
      if (!by.has(k)) by.set(k, []);
      if (g.award) by.get(k).push(g.award);
    });
    const withIds = [...by].filter(([, ids]) => ids.length).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    const others = [...by].filter(([, ids]) => !ids.length).map(([k]) => k);
    return `<p class="grant-lead">Our research is supported by ${GRANTS.length} funded grants.</p>
      <dl class="grant-ids">${withIds.map(([k, ids]) => `<div><dt>${esc(k)}</dt><dd>${ids.map(esc).join(", ")}</dd></div>`).join("")}${others.length ? `<div><dt>Other sponsors</dt><dd>${others.map(esc).join(", ")}</dd></div>` : ""}</dl>`;
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
    const gs = $("#grant-summary");
    if (gs) gs.innerHTML = grantSummaryHTML();

    const faces = $("#faces");
    if (faces) {
      const pi = window.HAI_PI;
      const people = [{ name: pi.name, role: "Lab director", photo: pi.photo, url: pi.url }]
        .concat((window.HAI_TEAM || []).filter((m) => m.group === "core"));
      faces.innerHTML = people.map(faceHTML).join("");
    }
  }

  if (page === "culture") {
    const C = window.HAI_CULTURE || { activities: [], photos: [] };
    $("#activities").innerHTML = C.activities.map(([name, when, text]) => `<div><dt>${esc(name)}<span class="cal-when">${esc(when)}</span></dt><dd>${esc(text)}</dd></div>`).join("");
    $("#gallery").innerHTML = C.photos.length
      ? C.photos.map((ph) => `<figure><img src="${esc(ph.src)}" alt="${esc(ph.caption)}" loading="lazy"><figcaption>${ph.date ? `<time datetime="${esc(ph.date)}">${fmtMonth(ph.date)}</time>` : ""}${esc(ph.caption)}</figcaption></figure>`).join("")
      : `<div class="gallery-empty"><p>Photos from lab meetings, conference trips, and celebrations will appear here soon.</p></div>`;
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
      $("#agree-version").textContent = `(version ${N.version}) `;
      $("#norms-credit").innerHTML = `Everyone in the lab works by these norms. Inspired by ${esc(N.inspiredBy.by)}’s <a href="${esc(N.inspiredBy.url)}">${esc(N.inspiredBy.text)}</a>.`;
      body.innerHTML = `
        <ol class="norm-list">${N.norms.map((n) => `<li>${n}</li>`).join("")}</ol>
        <h3 class="norms-sub">Calendar events <span>(remote participation is fine)</span></h3>
        <dl class="cal">${N.calendar.map(([name, when, text]) => `<div><dt>${esc(name)}<span class="cal-when">${esc(when)}</span></dt><dd>${esc(text)}</dd></div>`).join("")}</dl>
        <h3 class="norms-sub">Getting started</h3>
        <p class="norms-note">If you are a visiting or rotating PhD student, master’s student, or undergraduate, make sure you do all of these. We will approve your membership on these lists if you agree with the NEU-HAI group norms listed on this page.</p>
        <ol class="start-list">${N.gettingStarted.map((n) => `<li>${n}</li>`).join("")}</ol>`;
    }

    // the application link stays locked until the norms are accepted; the choice is remembered per browser
    const box = $("#agree"), btn = $("#apply-btn"), hint = $("#agree-hint");
    const KEY = "hai-norms-agreed";
    const setAgreed = (on) => {
      btn.setAttribute("aria-disabled", String(!on));
      btn.tabIndex = on ? 0 : -1;
      hint.textContent = on ? "Thanks. The form opens in a new tab." : "Check the box to unlock the application form.";
      $("#agree-box").classList.toggle("ok", on);
    };
    let saved = "";
    try { saved = localStorage.getItem(KEY) || ""; } catch (_) { /* storage blocked */ }
    if (N && saved === N.version) box.checked = true;
    setAgreed(box.checked);
    box.addEventListener("change", () => {
      setAgreed(box.checked);
      try { box.checked ? localStorage.setItem(KEY, N.version) : localStorage.removeItem(KEY); } catch (_) { /* storage blocked */ }
    });
    btn.addEventListener("click", (e) => {
      if (btn.getAttribute("aria-disabled") === "true") {
        e.preventDefault();
        hint.textContent = "Please read the norms above and check the box first.";
        $("#agree-box").classList.remove("nudge"); void btn.offsetWidth; $("#agree-box").classList.add("nudge");
        box.focus();
      }
    });
    btn.target = "_blank";
    btn.rel = "noopener";
  }

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
    $("#core").innerHTML = team.filter((m) => m.group === "core").map(personHTML).join("");
    $("#visiting").innerHTML = team.filter((m) => m.group === "visiting").map(personHTML).join("");
    $("#alumni").innerHTML = team.filter((m) => m.group === "alumni").map((m) =>
      `<li>${m.url ? `<a class="n" href="${esc(m.url)}">${esc(m.name)}</a>` : `<span class="n">${esc(m.name)}</span>`}<span class="r">${esc(m.role)}</span></li>`).join("");
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
})();
