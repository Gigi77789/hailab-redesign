// Reads and writes the site's data files (data/*.js) the same way the admin page does.
// Each file is: comment lines, then one or more `window.HAI_X = <JSON>;` statements.
// Pure JSON after the `=` keeps the files easy to edit by hand and safe for programs to rewrite.
"use strict";
const vm = require("vm");

// any data/*.js (even hand-written object literals) -> { head, vars: {HAI_X: value} }
function load(text) {
  const i = text.search(/^window\.HAI_/m);
  const head = i > 0 ? text.slice(0, i) : "";
  const sandbox = { window: {} };
  vm.runInNewContext(text, sandbox);
  return { head, vars: sandbox.window };
}

// pubs.js keeps one value per line (as tools/pubtools.py writes it); the small files are indented
function dump({ head, vars }, flat) {
  return head + Object.entries(vars).map(([k, v]) => {
    const json = flat ? JSON.stringify(v, null, 1).replace(/^ +/gm, "") : JSON.stringify(v, null, 2);
    return `window.${k} = ${json};\n`;
  }).join("");
}

module.exports = { load, dump };

if (require.main === module) {
  // node tools/datafile.js data/team.js ...  -> rewrites each file in the JSON form
  const fs = require("fs");
  for (const f of process.argv.slice(2)) {
    const d = load(fs.readFileSync(f, "utf8"));
    fs.writeFileSync(f, dump(d, /pubs\.js$/.test(f)));
    console.log("rewrote", f, Object.keys(d.vars).join(", "));
  }
}
