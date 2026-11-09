// @ts-check
import { defineConfig } from "astro/config";

// SITE_BASE: the path the site is served under, e.g. /hailab-redesign/ for the GitHub Pages draft (default /).
// DRAFT=1 adds the "Draft redesign" note and a noindex tag (tools/deploy.sh sets both).
export default defineConfig({
  base: process.env.SITE_BASE || "/",
  build: { format: "file" },
  // lossless: keeps the whitespace between inline elements that the page layout relies on
  compressHTML: true,
});
