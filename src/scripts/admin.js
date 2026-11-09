/* NEU HAI site editor.
   Lab members edit the roster, papers, and news here. Every save:
     1. reads the newest copy of the data file from the repository,
     2. applies just this one change to it (so two people editing at once don't erase each other),
     3. writes it back as a single commit, with any uploaded image in the same commit.
   The repository's deploy workflow then republishes the site. Nothing here depends on where the site is hosted.

   Three ways to save:
     - GitHub: the normal mode. The member signs in with their own GitHub token.
     - Local: when the page is served by tools/admin_server.py, saves go to files on that computer (for testing).
     - Demo: admin/?demo, or demo: true in src/data/editor.yaml. Saves stay in this browser tab and nothing is written anywhere.
   People and news are YAML (src/data/team.yaml, news.yaml); papers are BibTeX (src/data/papers.bib), read and written
   exactly as tools/pubtools.py does (src/lib/papers-io.ts). */
import { parse as parseYaml } from "yaml";
import { LINK_FIELDS } from "../lib/papers-io";
import { FILES, readFile, writeFile } from "../lib/editor-files";
import editorText from "../data/editor.yaml?raw";
import categoriesText from "../data/categories.yaml?raw";

(function () {
  "use strict";
  const CFG = parseYaml(editorText);
  CFG.areas = parseYaml(categoriesText).map((c) => [c.key, c.name]);
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SITE = "../"; // the editor is /admin/, one level below the site's own files
  // where the published site serves each file (src/pages/data/[file].ts), for the demo
  const PUBLISHED = { [FILES.team]: "data/team.yaml", [FILES.news]: "data/news.yaml", [FILES.pubs]: "data/papers.bib" };
  const AREAS = Object.fromEntries(CFG.areas);
  // the groups in team.yaml, with the role a new person in that group starts with
  const SECTIONS = [
    ["faculty", "Faculty and research scientists", "Research Scientist"],
    ["phd", "PhD students", "PhD student"],
    ["ra", "Research assistants", "Research assistant"],
    ["visiting", "Visiting students", "Visiting student"],
    ["alumni", "Alumni", "PhD student"],
  ];
  const KINDS = ["conference", "journal", "workshop", "abstract", "preprint", "book"];
  const AWARDS = ["", "Best Paper Award", "Best Paper Honorable Mention"];

  /* ---------- data files: src/lib/editor-files.ts reads and writes them ---------- */
  const parseData = (path, text) => readFile(path, text);
  const dumpData = (path, doc) => writeFile(path, doc);

  /* ---------- storage ---------- */
  const b64ToUtf8 = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

  class Conflict extends Error {}

  class GitHubStore {
    constructor(token) { this.token = token; this.base = `https://api.github.com/repos/${CFG.owner}/${CFG.repo}`; this.label = `GitHub · ${CFG.owner}/${CFG.repo} (${CFG.branch})`; }
    async api(url, opts = {}) {
      const r = await fetch(url.startsWith("http") ? url : this.base + url, {
        ...opts, cache: "no-store",
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${this.token}`, "X-GitHub-Api-Version": "2022-11-28", ...(opts.body ? { "Content-Type": "application/json" } : {}) },
      });
      if (r.status === 422 && /refs/.test(url)) throw new Conflict("The site changed while saving.");
      if (!r.ok) {
        let msg = "";
        try { msg = (await r.json()).message; } catch (_) { /* no body */ }
        if (r.status === 401) msg = "GitHub didn’t accept this token. It may have expired.";
        if (r.status === 403 || r.status === 404) msg = msg || "This token can’t reach the repository.";
        throw new Error(msg || `GitHub error ${r.status}`);
      }
      return r.status === 204 ? null : r.json();
    }
    async whoami() {
      const [user, repo] = await Promise.all([this.api("https://api.github.com/user"), this.api("")]);
      if (!repo.permissions || !repo.permissions.push) throw new Error(`${user.login} can read the repository but not change it. Ask the site maintainer to add you as a collaborator.`);
      return user.name || user.login;
    }
    async read(path) {
      const ref = await this.api(`/git/ref/heads/${CFG.branch}`);
      const f = await this.api(`/contents/${path}?ref=${ref.object.sha}`);
      if (f.content && f.encoding === "base64") return b64ToUtf8(f.content);
      const blob = await this.api(`/git/blobs/${f.sha}`); // files over 1 MB
      return b64ToUtf8(blob.content);
    }
    // files: [{ path, text } | { path, base64 } | { path, remove: true }]
    async commit(files, message) {
      const ref = await this.api(`/git/ref/heads/${CFG.branch}`);
      const head = await this.api(`/git/commits/${ref.object.sha}`);
      const tree = [];
      for (const f of files) {
        if (f.remove) { tree.push({ path: f.path, mode: "100644", type: "blob", sha: null }); continue; }
        const blob = await this.api("/git/blobs", { method: "POST", body: JSON.stringify(f.base64 ? { content: f.base64, encoding: "base64" } : { content: f.text, encoding: "utf-8" }) });
        tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
      }
      const t = await this.api("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
      const c = await this.api("/git/commits", { method: "POST", body: JSON.stringify({ message, tree: t.sha, parents: [head.sha] }) });
      await this.api(`/git/refs/heads/${CFG.branch}`, { method: "PATCH", body: JSON.stringify({ sha: c.sha, force: false }) });
    }
  }

  class LocalStore {
    constructor() { this.label = "Local test mode: saves change files on this computer"; }
    async whoami() { return "Local tester"; }
    async read(path) {
      const r = await fetch(`/__admin/file?path=${encodeURIComponent(path)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(await r.text());
      return r.text();
    }
    async commit(files, message) {
      const r = await fetch("/__admin/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files, message }) });
      if (!r.ok) throw new Error(await r.text());
    }
  }

  // demo: reads the published data files, keeps every change in memory, writes nothing
  const demoImages = {};
  class DemoStore {
    constructor() { this.label = "Demo: changes are not saved"; this.files = {}; }
    async whoami() { return "Guest"; }
    async read(path) {
      if (path in this.files) return this.files[path];
      const r = await fetch(SITE + PUBLISHED[path], { cache: "no-store" });
      if (!r.ok) throw new Error(`Couldn’t load ${path}`);
      return r.text();
    }
    async commit(files) {
      for (const f of files) {
        if (f.remove) delete demoImages[f.path];
        else if (f.base64) demoImages[f.path] = "data:image/jpeg;base64," + f.base64;
        else this.files[f.path] = f.text;
      }
    }
  }

  let store = null, userName = "";
  const state = { pi: null, team: [], pubs: [], news: [] };

  async function loadAll() {
    const [team, pubs, news] = await Promise.all([store.read(FILES.team), store.read(FILES.pubs), store.read(FILES.news)]);
    const t = parseData(FILES.team, team).data.team;
    state.pi = t.director; state.team = t.members;
    state.pubs = parseData(FILES.pubs, pubs).data.pubs;
    state.news = parseData(FILES.news, news).data.news;
  }

  // one save = fresh read + one change + one commit; retried when someone else saved in between
  async function save({ edits, extra = [], message }) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const files = [];
      for (const [path, mutate] of edits) {
        const doc = parseData(path, await store.read(path));
        mutate(doc.data);
        files.push({ path, text: dumpData(path, doc) });
      }
      try {
        await store.commit(files.concat(extra), `${message}\n\nSaved with the site editor by ${userName}.`);
        await loadAll();
        return;
      } catch (e) {
        if (!(e instanceof Conflict) || attempt === 2) throw e;
      }
    }
  }

  /* ---------- small helpers ---------- */
  let toastTimer = 0;
  function toast(msg, bad) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("bad", !!bad);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), bad ? 7000 : 4500);
  }
  const savedMsg = () => (store instanceof DemoStore ? "Saved in this demo only. The real website did not change, and a reload resets everything."
    : store instanceof LocalStore ? "Saved to the files on this computer." : "Saved. The public site updates in a minute or two.");
  const slug = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(.*?\)|[‘’'"“”]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";
  const shortHash = async (b64) => {
    const buf = await crypto.subtle.digest("SHA-1", Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    return [...new Uint8Array(buf)].slice(0, 3).map((x) => x.toString(16).padStart(2, "0")).join("");
  };
  const initials = (n) => n.replace(/\(.*?\)|‘.*?’/g, "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
  const imgSrc = (p) => (!p ? "" : demoImages["public/" + p] || (/^(blob:|data:|https?:)/.test(p) ? p : SITE + p));

  // shrink an uploaded picture in the browser; square crops the middle (portraits)
  async function shrinkImage(file, { max, square }) {
    if (!/^image\//.test(file.type)) throw new Error("Please choose an image file (JPEG or PNG).");
    const bmp = await createImageBitmap(file);
    let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
    if (square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2.6; sw = sh = s; }
    const scale = Math.min(1, max / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, sx, Math.max(0, sy), sw, sh, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/jpeg", 0.85);
    return { base64: url.split(",")[1], preview: url };
  }

  /* ---------- the edit sheet ---------- */
  const sheet = $("#sheet");
  let onSave = null, onDelete = null;
  function openSheet(title, bodyHTML, { save, del, saveLabel = "Save" }) {
    $("#sheet-title").textContent = title;
    $("#sheet-body").innerHTML = bodyHTML;
    $("#sheet-save").textContent = saveLabel;
    $("#sheet-delete").hidden = !del;
    onSave = save; onDelete = del;
    sheet.showModal();
    const first = $("#sheet-body input, #sheet-body textarea, #sheet-body select");
    if (first) first.focus();
  }
  const closeSheet = () => sheet.close();
  $("#sheet-x").addEventListener("click", closeSheet);
  $("#sheet-cancel").addEventListener("click", closeSheet);
  $("#sheet-delete").addEventListener("click", () => onDelete && onDelete());
  $("#sheet-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!onSave) return;
    const btn = $("#sheet-save");
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "Saving…";
    try {
      const ok = await onSave();
      if (ok !== false) { closeSheet(); toast(savedMsg()); render(); }
    } catch (err) {
      toast(err.message || String(err), true);
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  });
  async function runDelete(fn) {
    try { await fn(); closeSheet(); toast(savedMsg()); render(); }
    catch (err) { toast(err.message || String(err), true); }
  }
  // inline "are you sure" inside the sheet; choices: [[label, fn, danger?]]
  function confirmInSheet(text, choices) {
    const box = document.createElement("div");
    box.className = "confirm-box";
    box.innerHTML = `<p style="margin:0">${esc(text)}</p><div class="acts">${choices.map(([l, , d], i) => `<button type="button" class="btn small ${d ? "ghost danger" : "ghost"}" data-i="${i}">${esc(l)}</button>`).join("")}<button type="button" class="btn small ghost" data-i="x">Keep it</button></div>`;
    const body = $("#sheet-body");
    body.querySelector(".confirm-box")?.remove();
    body.prepend(box);
    body.scrollTop = 0;
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.i === "x") return box.remove();
      runDelete(choices[+b.dataset.i][1]);
    });
  }
  const val = (id) => ($("#" + id)?.value ?? "").trim();
  function need(id, msg) {
    const el = $("#" + id);
    const ok = !!el.value.trim();
    el.closest(".field")?.classList.toggle("invalid", !ok);
    if (!ok) { el.focus(); throw new Error(msg); }
  }
  function counter(id, limit) {
    const el = $("#" + id), out = $("#" + id + "-count");
    const upd = () => { out.textContent = `${el.value.length} / ${limit} characters`; out.classList.toggle("over", el.value.length > limit); };
    el.addEventListener("input", upd); upd();
  }
  // an image picker that keeps the shrunk picture until Save
  function imageField(id, current, opts) {
    const st = { upload: null, removed: false };
    const wrap = $("#" + id);
    const draw = () => {
      const src = st.upload ? st.upload.preview : st.removed ? "" : imgSrc(current);
      wrap.querySelector(".slot").innerHTML = src ? `<img class="preview${opts.square ? " square" : ""}" src="${esc(src)}" alt="">` : `<div class="preview${opts.square ? " square" : ""} none">No image</div>`;
      wrap.querySelector(".rm").hidden = !src;
    };
    wrap.querySelector("input[type=file]").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { st.upload = await shrinkImage(f, opts); st.removed = false; draw(); } catch (err) { toast(err.message, true); }
      e.target.value = "";
    });
    wrap.querySelector(".rm").addEventListener("click", () => { st.upload = null; st.removed = true; draw(); });
    draw();
    return st;
  }
  const imageFieldHTML = (id, label, help) => `<div class="field"><span>${label}</span><div class="image-field" id="${id}"><div class="slot"></div>
      <div class="actions"><label class="btn ghost small">Choose image…<input type="file" accept="image/*" hidden></label><button type="button" class="btn ghost small danger rm">Remove image</button></div></div>${help ? `<p class="help">${help}</p>` : ""}</div>`;
  // turns an image picker's state into commit files and the path to store
  // when a person or paper is deleted, an image the editor uploaded for it goes too
  const repoPath = (p) => "public/" + p; // data says assets/team/x.jpg; the file is public/assets/team/x.jpg
  const dropImage = (p, dir) => (new RegExp(`^${dir}/[a-z0-9-]+-[0-9a-f]{6}\\.jpg$`).test(p || "") ? [{ path: repoPath(p), remove: true }] : []);
  async function imageChange(st, current, dir, name) {
    const extra = [];
    let path = current || "";
    const ours = (p) => new RegExp(`^${dir}/[a-z0-9-]+-[0-9a-f]{6}\\.jpg$`).test(p || ""); // pictures the editor made earlier
    if (st.upload) {
      path = `${dir}/${slug(name)}-${await shortHash(st.upload.base64)}.jpg`;
      extra.push({ path: repoPath(path), base64: st.upload.base64 });
      if (ours(current) && current !== path) extra.push({ path: repoPath(current), remove: true });
    } else if (st.removed) {
      path = "";
      if (ours(current)) extra.push({ path: repoPath(current), remove: true });
    }
    return { path, extra, changed: !!(st.upload || st.removed) };
  }

  /* ---------- lab members ---------- */
  function memberCard(m, key) {
    const pic = m.photo ? `<img class="avatar" src="${esc(imgSrc(m.photo))}" alt="">` : `<span class="avatar">${esc(initials(m.name))}</span>`;
    return `<li><button type="button" class="card" data-member="${esc(key)}">${pic}<span><b>${esc(m.name)}</b><small>${esc(m.role || "")}</small></span></button></li>`;
  }
  function renderMembers() {
    const p = $("#panel-members");
    const groups = SECTIONS.map(([k, label]) => {
      const list = state.team.map((m, i) => [m, i]).filter(([m]) => m.group === k);
      const pi = k === "faculty" ? memberCard({ name: state.pi.name, role: state.pi.role, photo: state.pi.photo }, "pi") : "";
      return `<section class="group"><h2>${esc(label)}</h2><ul class="cards">${pi}${list.map(([m, i]) => memberCard(m, String(i))).join("") || (pi ? "" : "<li class='hint'>Nobody yet.</li>")}</ul></section>`;
    }).join("");
    p.innerHTML = `<div class="toolbar"><p class="hint">Click a person to edit them. New people appear at the end of their group.</p><button type="button" class="btn" id="add-member">Add a member</button></div>${groups}`;
    $("#add-member").addEventListener("click", () => editMember(null));
    p.querySelectorAll("[data-member]").forEach((b) => b.addEventListener("click", () => editMember(b.dataset.member)));
  }

  function editMember(key) {
    const isPI = key === "pi";
    const orig = isPI ? { name: state.pi.name, role: state.pi.role, url: state.pi.url, photo: state.pi.photo, bio: state.pi.short } : key == null ? null : state.team[+key];
    const m = orig || { group: "phd", name: "", role: "PhD student", url: "", photo: "", bio: "" };
    const sectionSel = isPI ? "" : `<label class="field"><span>Group</span><select id="m-section">${SECTIONS.map(([k, l]) => `<option value="${k}"${m.group === k ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
    openSheet(orig ? `Edit ${orig.name}` : "Add a lab member", `
      <div class="two">
        <label class="field"><span>Name</span><input type="text" id="m-name" value="${esc(m.name)}" placeholder="First Last"></label>
        ${sectionSel || `<label class="field"><span>Group</span><input type="text" value="Lab director" disabled></label>`}
      </div>
      <div class="two">
        <label class="field"><span>Role</span><input type="text" id="m-role" value="${esc(m.role)}" list="role-list"><datalist id="role-list"><option>Research Scientist<option>Associate Research Scientist<option>Postdoctoral researcher<option>PhD student<option>First-year PhD student<option>Research assistant<option>Visiting student<option>Visiting scholar</datalist>
          <p class="help">For alumni, where they are now also works, e.g. “Now Assistant Professor at …”.</p></label>
        <label class="field"><span>Personal webpage <i>(optional)</i></span><input type="url" id="m-url" value="${esc(m.url)}" placeholder="https://"></label>
      </div>
      ${imageFieldHTML("m-photo", "Photo <i>(optional)</i>", "A clear head-and-shoulders photo. It is cropped to a square around the face and resized for you.")}
      <label class="field"><span>Short bio <i>(optional)</i></span><textarea id="m-bio" rows="3" placeholder="One sentence about your research, background, or a fun fact.">${esc(m.bio || "")}</textarea><span class="count" id="m-bio-count"></span><p class="help">About 100 characters fits in three lines on the Lab members page.</p></label>
    `, {
      save: async () => {
        need("m-name", "Please enter a name.");
        need("m-role", "Please enter a role.");
        const url = val("m-url");
        if (url && !/^https?:\/\//.test(url)) throw new Error("The webpage should start with https://");
        const img = await imageChange(photo, m.photo, "assets/team", val("m-name"));
        const next = { name: val("m-name"), role: val("m-role"), url, photo: img.path, bio: val("m-bio") };
        if (isPI) {
          await save({
            edits: [[FILES.team, (v) => Object.assign(v.team.director, { name: next.name, role: next.role, url: next.url, photo: next.photo, short: next.bio })]],
            extra: img.extra, message: `Update ${next.name}`,
          });
          return;
        }
        next.group = $("#m-section").value;
        // empty fields are left out of team.yaml
        const entry = Object.fromEntries(Object.entries({ name: next.name, group: next.group, role: next.role, url: next.url, photo: next.photo, bio: next.bio }).filter(([, x]) => x));
        const edits = [[FILES.team, (v) => {
          const list = v.team.members;
          if (orig) {
            const i = list.findIndex((x) => x.name === orig.name);
            if (i < 0) throw new Error(`${orig.name} is no longer in the roster. Reload the page.`);
            // fields the form edits are replaced (so clearing one removes it); the rest (orcid, openalex) are kept
            const kept = Object.fromEntries(Object.entries(list[i]).filter(([k]) => !["url", "photo", "bio"].includes(k)));
            if (list[i].group === entry.group) list[i] = { ...kept, ...entry };
            else { list.splice(i, 1); insertMember(list, { ...kept, ...entry }); }
          } else {
            if (list.some((x) => x.name.toLowerCase() === entry.name.toLowerCase())) throw new Error(`${entry.name} is already in the roster.`);
            insertMember(list, entry);
          }
        }]];
        await save({ edits, extra: img.extra, message: orig ? `Update ${entry.name}` : `Add ${entry.name} to ${SECTIONS.find(([k]) => k === entry.group)[1]}` });
      },
      del: isPI || !orig ? null : () => confirmInSheet(`Remove ${orig.name}?`, [
        ...(orig.group === "alumni" ? [] : [["Move to alumni", () => save({ edits: [[FILES.team, (v) => { const list = v.team.members; const i = list.findIndex((x) => x.name === orig.name); const [x] = list.splice(i, 1); insertMember(list, { ...x, group: "alumni" }); }]], message: `Move ${orig.name} to alumni` })]]),
        ["Delete from the site", () => save({ edits: [[FILES.team, (v) => { const list = v.team.members; const i = list.findIndex((x) => x.name === orig.name); if (i >= 0) list.splice(i, 1); }]],
          extra: dropImage(orig.photo, "assets/team"), message: `Remove ${orig.name}` }), true],
      ]),
    });
    const photo = imageField("m-photo", m.photo, { max: 640, square: true });
    counter("m-bio", 100);
    $("#m-section")?.addEventListener("change", (e) => {
      const def = SECTIONS.find(([k]) => k === e.target.value)[2];
      if (!orig && !$("#m-role").dataset.touched) $("#m-role").value = def;
    });
    $("#m-role").addEventListener("input", (e) => (e.target.dataset.touched = "1"));
  }
  // new and moved people go after the last person in their group
  function insertMember(list, m) {
    let at = -1;
    list.forEach((x, i) => { if (x.group === m.group) at = i; });
    if (at < 0) {
      const order = SECTIONS.map(([k]) => k);
      list.forEach((x, i) => { if (order.indexOf(x.group) < order.indexOf(m.group)) at = i; });
    }
    list.splice(at + 1, 0, m);
  }

  /* ---------- publications ---------- */
  let pubQuery = "", pubShown = 40;
  function renderPapers() {
    const p = $("#panel-papers");
    const q = pubQuery.toLowerCase();
    const list = state.pubs.map((x, i) => [x, i]).filter(([x]) => !q || (x.t + " " + x.a.join(" ") + " " + x.tag).toLowerCase().includes(q));
    p.innerHTML = `<div class="toolbar"><input class="search" id="pub-q" type="search" placeholder="Search ${state.pubs.length} papers by title, author, or venue" value="${esc(pubQuery)}"><button type="button" class="btn" id="add-paper">Add a paper</button></div>
      <ul class="rows">${list.slice(0, pubShown).map(([x, i]) => `<li class="row">
        ${x.img ? `<img class="thumb" src="${esc(imgSrc(x.img))}" alt="" loading="lazy">` : `<span class="thumb none">No image</span>`}
        <div><div class="row-title">${esc(x.t)}</div><div class="row-meta"><span>${esc(x.tag)}</span><span>${x.y}</span>${(x.topics || []).map((t) => `<span style="--k:var(--t-${t})"><span class="dot"></span>${esc(AREAS[t] || t)}</span>`).join("")}</div></div>
        <button type="button" class="btn ghost small" data-pub="${i}">Edit</button></li>`).join("")}
        ${list.length > pubShown ? `<li class="more-row"><button type="button" class="linkish" id="pub-more">Show more (${list.length - pubShown} left)</button></li>` : ""}
        ${list.length ? "" : `<li class="more-row">No paper matches “${esc(pubQuery)}”.</li>`}</ul>`;
    const box = $("#pub-q");
    box.addEventListener("input", () => { pubQuery = box.value; pubShown = 40; renderPapers(); const b = $("#pub-q"); b.focus(); b.setSelectionRange(b.value.length, b.value.length); });
    $("#add-paper").addEventListener("click", () => editPaper(null));
    $("#pub-more")?.addEventListener("click", () => { pubShown += 60; renderPapers(); });
    p.querySelectorAll("[data-pub]").forEach((b) => b.addEventListener("click", () => editPaper(+b.dataset.pub)));
  }

  function editPaper(idx) {
    const orig = idx == null ? null : state.pubs[idx];
    const x = orig || { y: new Date().getFullYear(), t: "", a: [], v: "", tag: "", links: {}, award: "", topics: [], abs: "", kind: "conference", venueUrl: "", img: "" };
    const tags = [...new Set(state.pubs.map((p) => p.tag))].sort();
    let topics = [...(x.topics || [])];
    openSheet(orig ? "Edit paper" : "Add a paper", `
      <label class="field"><span>Title</span><textarea id="p-title" rows="2">${esc(x.t)}</textarea></label>
      <label class="field"><span>Authors</span><textarea id="p-authors" rows="3" placeholder="One per line, or separated by commas">${esc(x.a.join(", "))}</textarea><p class="help">Lab members’ names are shown in bold automatically.</p></label>
      <div class="two">
        <label class="field"><span>Venue, short</span><input type="text" id="p-tag" value="${esc(x.tag)}" list="tag-list" placeholder="e.g. CHI 2026"><datalist id="tag-list">${tags.map((t) => `<option value="${esc(t)}">`).join("")}</datalist></label>
        <label class="field"><span>Year</span><input type="number" id="p-year" value="${x.y}" min="1990" max="2100"></label>
      </div>
      <label class="field"><span>Venue, full name <i>(optional)</i></span><input type="text" id="p-venue" value="${esc(x.v)}" placeholder="e.g. Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems"></label>
      <div class="two">
        <label class="field"><span>Type</span><select id="p-kind">${KINDS.map((k) => `<option${x.kind === k ? " selected" : ""}>${k}</option>`).join("")}</select></label>
        <label class="field"><span>Award</span><select id="p-award">${AWARDS.map((a) => `<option value="${esc(a)}"${x.award === a ? " selected" : ""}>${a || "None"}</option>`).join("")}</select></label>
      </div>
      <div class="field"><span>Research areas</span><div class="areas" id="p-areas">${CFG.areas.map(([k, l]) => `<button type="button" class="area" data-area="${k}" style="--k:var(--t-${k})" aria-pressed="false"><span class="dot"></span>${esc(l)}<span class="badge"></span></button>`).join("")}</div>
        <p class="help">Pick one or two. The first one you pick is the main area: it colours the paper’s dot on the home page and lists it under that area.</p></div>
      <label class="field"><span>Paper link <i>(optional)</i></span><input type="url" id="p-url" value="${esc(x.venueUrl || "")}" placeholder="https://doi.org/…"><p class="help">Where the title links to: the DOI or publisher page. Leave empty to use the first link below.</p></label>
      <div class="field"><span>More links <i>(optional)</i></span><div class="links" id="p-links"></div><button type="button" class="btn ghost small" id="p-add-link" style="justify-self:start">Add a link</button></div>
      ${imageFieldHTML("p-img", "Teaser image <i>(optional)</i>", "The paper’s teaser or Figure 1. It is resized for you; wide images look best.")}
      <label class="field"><span>Abstract <i>(optional)</i></span><textarea id="p-abs" rows="5">${esc(x.abs || "")}</textarea></label>
    `, {
      save: async () => {
        need("p-title", "Please enter the title.");
        need("p-authors", "Please enter the authors.");
        need("p-tag", "Please enter the venue, e.g. CHI 2026, or Preprint.");
        const y = +val("p-year");
        if (!(y > 1990 && y < 2100)) throw new Error("Please enter the year.");
        if (!topics.length) throw new Error("Please pick at least one research area.");
        const links = {};
        for (const row of $("#p-links").querySelectorAll(".link-row")) {
          const l = row.querySelector("select").value, u = row.querySelector("input").value.trim();
          if (!u) continue;
          if (!/^https?:\/\//.test(u)) throw new Error("Each link needs an address starting with https://");
          links[l] = u;
        }
        const url = val("p-url");
        if (url && !/^https?:\/\//.test(url)) throw new Error("The paper link should start with https://");
        const title = val("p-title").replace(/\s+/g, " ");
        const img = await imageChange(pic, x.img, "assets/papers", title.split(":")[0]);
        const fields = {
          y, t: title, a: val("p-authors").split(/\n|,(?![^()]*\))/).map((s) => s.trim()).filter(Boolean),
          v: val("p-venue"), tag: val("p-tag"), links, award: $("#p-award").value, topics: topics.slice(0, 2), abs: val("p-abs"), kind: $("#p-kind").value,
        };
        if (url) fields.venueUrl = url;
        const topicsChanged = !orig || topics.join() !== (orig.topics || []).join();
        await save({
          edits: [[FILES.pubs, (v) => {
            const list = v.pubs;
            let p;
            if (orig) {
              const i = list.findIndex((q) => q.t === orig.t && q.y === orig.y);
              if (i < 0) throw new Error("This paper was changed by someone else. Reload the page and try again.");
              [p] = list.splice(i, 1);
              Object.assign(p, fields);
              if (!url) delete p.venueUrl;
            } else {
              if (list.some((q) => q.t.toLowerCase() === title.toLowerCase())) throw new Error("A paper with this title is already on the site.");
              p = { ...fields, src: "admin" };
            }
            if (topicsChanged) p.topicsManual = true; // the weekly auto-tagging keeps these areas
            if (img.changed) { p.img = img.path; p.imgManual = true; delete p.imgFrom; delete p.imgSrcUrl; } // and keeps this image
            if (!p.img) delete p.img;
            // newest first: a paper goes to the top of its year
            const at = list.findIndex((q) => q.y <= p.y);
            list.splice(at < 0 ? list.length : at, 0, p);
          }]],
          extra: img.extra, message: `${orig ? "Update" : "Add"} paper: ${title.slice(0, 70)}`,
        });
      },
      del: orig ? () => confirmInSheet(`Delete “${orig.t}” from the site?`, [["Delete paper", () => save({
        edits: [[FILES.pubs, (v) => { const i = v.pubs.findIndex((q) => q.t === orig.t && q.y === orig.y); if (i >= 0) v.pubs.splice(i, 1); }]],
        extra: dropImage(orig.img, "assets/papers"), message: `Remove paper: ${orig.t.slice(0, 70)}`,
      }), true]]) : null,
    });
    const pic = imageField("p-img", x.img, { max: 1200 });
    const drawAreas = () => $("#p-areas").querySelectorAll(".area").forEach((b) => {
      const i = topics.indexOf(b.dataset.area);
      b.setAttribute("aria-pressed", String(i >= 0));
      b.querySelector(".badge").textContent = i === 0 ? "Main" : i === 1 ? "Second" : "";
    });
    $("#p-areas").addEventListener("click", (e) => {
      const b = e.target.closest(".area");
      if (!b) return;
      const k = b.dataset.area;
      if (topics.includes(k)) topics = topics.filter((t) => t !== k);
      else if (topics.length < 2) topics.push(k);
      else toast("A paper can have at most two areas. Unselect one first.", true);
      drawAreas();
    });
    drawAreas();
    const addLink = (l = "", u = "") => {
      const row = document.createElement("div");
      row.className = "link-row";
      // the kinds of link papers.bib has a field for; the publisher page goes in "Paper link" above
      row.innerHTML = `<select aria-label="Kind of link">${Object.keys(LINK_FIELDS).map((k) => `<option${k === l ? " selected" : ""}>${k}</option>`).join("")}</select><input type="url" placeholder="https://" value="${esc(u)}"><button type="button" class="btn ghost small danger" aria-label="Remove link">×</button>`;
      row.querySelector("button").addEventListener("click", () => row.remove());
      $("#p-links").append(row);
    };
    Object.entries(x.links || {}).forEach(([l, u]) => addLink(l, u));
    if (!orig) addLink("arXiv", "");
    $("#p-add-link").addEventListener("click", () => addLink());
  }

  /* ---------- news ---------- */
  // news text is stored as HTML; here it is edited as plain text with [link text](https://…) links
  const htmlToText = (h) => h.replace(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_, u, t) => `[${t}](${u})`).replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const textToHtml = (t) => esc(t.trim()).replace(/&#39;/g, "’")
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g, (_, label, u) => `<a href="${u.replace(/"/g, "%22")}">${label}</a>`);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtDate = (d) => { const [y, m] = d.split("-"); return m ? `${MONTHS[+m - 1]} ${y}` : y; };
  const dateKey = (d) => (d.length === 4 ? d + "-00" : d);

  function renderNews() {
    const p = $("#panel-news");
    p.innerHTML = `<div class="toolbar"><p class="hint">Newest first. The home page shows all of these in its Latest news box.</p><button type="button" class="btn" id="add-news">Add news</button></div>
      <ul class="rows">${state.news.map((n, i) => `<li class="row news"><time>${esc(fmtDate(n.date))}</time><div class="row-text">${n.html}</div><button type="button" class="btn ghost small" data-news="${i}">Edit</button></li>`).join("")}</ul>`;
    $("#add-news").addEventListener("click", () => editNews(null));
    p.querySelectorAll("[data-news]").forEach((b) => b.addEventListener("click", () => editNews(+b.dataset.news)));
    p.querySelectorAll(".row-text a").forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
  }

  function editNews(idx) {
    const orig = idx == null ? null : state.news[idx];
    const now = new Date();
    const [y, m] = orig ? orig.date.split("-") : [String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0")];
    const years = []; for (let k = now.getFullYear() + 1; k >= 2015; k--) years.push(k);
    openSheet(orig ? "Edit news" : "Add news", `
      <div class="two">
        <label class="field"><span>Month</span><select id="n-month"><option value="">Year only</option>${MONTHS.map((mm, i) => `<option value="${String(i + 1).padStart(2, "0")}"${m === String(i + 1).padStart(2, "0") ? " selected" : ""}>${mm}</option>`).join("")}</select></label>
        <label class="field"><span>Year</span><select id="n-year">${years.map((k) => `<option${String(k) === y ? " selected" : ""}>${k}</option>`).join("")}</select></label>
      </div>
      <label class="field"><span>Text</span><textarea id="n-text" rows="5" placeholder="Two papers accepted to CHI 2027: [Paper title](https://arxiv.org/abs/…) and …">${esc(orig ? htmlToText(orig.html) : "")}</textarea>
        <p class="help">To add a link, write <code>[the words to click](https://the-address)</code>. Keep it to one or two sentences.</p></label>
      <div class="field"><span>Preview</span><div class="news-preview" id="n-preview"></div></div>
    `, {
      save: async () => {
        need("n-text", "Please write the news.");
        const date = $("#n-month").value ? `${$("#n-year").value}-${$("#n-month").value}` : $("#n-year").value;
        const item = { date, html: textToHtml(val("n-text")) };
        await save({
          edits: [[FILES.news, (v) => {
            const list = v.news;
            if (orig) {
              const i = list.findIndex((n) => n.date === orig.date && n.html === orig.html);
              if (i < 0) throw new Error("This news item was changed by someone else. Reload the page and try again.");
              list.splice(i, 1);
            }
            // newest first: new items go to the top of their month
            const at = list.findIndex((n) => dateKey(n.date) <= dateKey(date));
            list.splice(at < 0 ? list.length : at, 0, item);
          }]],
          message: `${orig ? "Update" : "Add"} news (${fmtDate(date)}): ${htmlToText(item.html).slice(0, 60)}`,
        });
      },
      del: orig ? () => confirmInSheet("Delete this news item?", [["Delete news", () => save({
        edits: [[FILES.news, (v) => { const i = v.news.findIndex((n) => n.date === orig.date && n.html === orig.html); if (i >= 0) v.news.splice(i, 1); }]],
        message: `Remove news (${fmtDate(orig.date)})`,
      }), true]]) : null,
    });
    const prev = () => { $("#n-preview").innerHTML = textToHtml($("#n-text").value) || "<span style='color:var(--ink-2)'>Nothing yet.</span>"; };
    $("#n-text").addEventListener("input", prev);
    prev();
  }

  /* ---------- page ---------- */
  let tab = "members";
  function render() {
    renderMembers(); renderPapers(); renderNews();
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === tab)));
    ["members", "papers", "news"].forEach((k) => ($("#panel-" + k).hidden = k !== tab));
  }
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => { tab = t.dataset.tab; render(); try { sessionStorage.setItem("hai-admin-tab", tab); } catch (_) { /* storage blocked */ } }));
  try { tab = sessionStorage.getItem("hai-admin-tab") || tab; } catch (_) { /* storage blocked */ }

  function showWho() {
    const local = store instanceof LocalStore, demo = store instanceof DemoStore;
    $("#who").innerHTML = `<span class="mode${local || demo ? " local" : ""}">${esc(store.label)}</span><span>${esc(userName)}</span>
      <a href="${local ? "../" : esc(CFG.site)}" target="_blank" rel="noopener">View site</a>${local || demo ? "" : `<button type="button" class="linkish" id="signout">Sign out</button>`}`;
    $("#signout")?.addEventListener("click", () => {
      try { localStorage.removeItem("hai-admin-token"); sessionStorage.removeItem("hai-admin-token"); } catch (_) { /* storage blocked */ }
      location.reload();
    });
  }

  async function start(s) {
    $("#loading").hidden = false;
    store = s;
    userName = await store.whoami();
    await loadAll();
    $("#signin").hidden = true;
    $("#loading").hidden = true;
    $("#editor").hidden = false;
    showWho();
    render();
  }

  function showSignin(err) {
    $("#loading").hidden = true;
    $("#signin").hidden = false;
    $("#repo-name").textContent = `${CFG.owner}/${CFG.repo}`;
    $("#token-link").href = "https://github.com/settings/tokens/new?scopes=public_repo&description=" + encodeURIComponent("NEU HAI site editor");
    if (err) $("#signin-err").textContent = err;
  }
  $("#signin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = $("#token").value.trim();
    $("#signin-err").textContent = "";
    try {
      await start(new GitHubStore(token));
      try { ($("#remember").checked ? localStorage : sessionStorage).setItem("hai-admin-token", token); } catch (_) { /* storage blocked */ }
    } catch (err) { showSignin(err.message); }
  });

  (async function boot() {
    // served by tools/admin_server.py? then save to local files
    try {
      const r = await fetch("/__admin/ping", { cache: "no-store" });
      if (r.ok && (await r.json()).ok) return await start(new LocalStore());
    } catch (_) { /* not the local server */ }
    if (CFG.demo !== false || /[?&]demo\b/.test(location.search)) return await start(new DemoStore()); // admin/?demo: try it without signing in
    let token = null;
    try { token = localStorage.getItem("hai-admin-token") || sessionStorage.getItem("hai-admin-token"); } catch (_) { /* storage blocked */ }
    if (!token) return showSignin();
    try { await start(new GitHubStore(token)); } catch (err) { showSignin(err.message); }
  })().catch((err) => { $("#loading").textContent = err.message; });
})();
