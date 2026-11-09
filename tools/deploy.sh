#!/bin/sh
# Publishes the draft review copy (banner + noindex) to the gh-pages branch of this repo's origin,
# served by GitHub Pages under /<repo name>/. Design versions already on gh-pages (v1/, v2/, ...) are kept.
# Usage, from the repo root:  sh tools/deploy.sh
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
REMOTE=$(git -C "$ROOT" remote get-url origin)
REPO=$(basename "$REMOTE" .git)
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

cd "$ROOT"
[ -d node_modules ] || npm ci
# build inside the repo (Astro moves files into place, which fails across disks), then copy out
DRAFT=1 SITE_BASE="/$REPO/" npx astro build
cp -R dist/. "$OUT/"
touch "$OUT/.nojekyll"

# In GitHub Actions the checkout's auth header lives in the source repo's config; reuse it here.
AUTH=$(git -C "$ROOT" config --get http.https://github.com/.extraheader || true)

# keep the design versions (v1/, v2/, ...) published next to the draft
PREV=$(mktemp -d)
if git ${AUTH:+-c http.https://github.com/.extraheader="$AUTH"} clone -q --depth 1 --branch gh-pages "$REMOTE" "$PREV" 2>/dev/null; then
  # no trailing slash on the source: macOS cp would copy the folder's contents instead of the folder
  for d in "$PREV"/v[0-9]*/; do [ -d "$d" ] && cp -R "${d%/}" "$OUT/"; done
fi
rm -rf "$PREV"
printf 'User-agent: *\nDisallow: /\n' > "$OUT/robots.txt"

cd "$OUT"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$ROOT" config user.name)" -c user.email="$(git -C "$ROOT" config user.email)" \
  commit -qm "Deploy draft from $(git -C "$ROOT" rev-parse --short HEAD)"
[ -n "$AUTH" ] && git config http.https://github.com/.extraheader "$AUTH"
git push -qf "$REMOTE" gh-pages
echo "Pushed draft to gh-pages on $REMOTE"
