// Settings for the site editor (admin/). Change these when the site moves.
// The editor never talks to the web host: it reads and writes the data files in the GitHub repository,
// and the repository's deploy workflow publishes the site to wherever it is hosted.
window.HAI_ADMIN = {
  owner: "Gigi77789",            // GitHub user or organization that owns the repository
  repo: "hailab-redesign",       // repository name
  branch: "v1-future",           // branch the site is built from
  site: "https://gigi77789.github.io/hailab-redesign/v1/", // public site, for the "View site" link

  // false: members sign in and their saves change the real site.
  // true: the published editor is a demo (no sign-in, saves stay in the browser and vanish on reload).
  // Either way, admin/?demo opens the demo.
  demo: false,

  // Research areas a paper can be tagged with, in the same order and wording as CATS in js/site.js.
  areas: [
    ["health", "AI for Healthcare"],
    ["algo", "LLMs and AI Agents"],
    ["education", "AI for Learning"],
    ["hac", "Human-Agent Collaboration"],
    ["collab", "Human-AI Collaboration"],
    ["community", "Community Engagement"]
  ]
};
