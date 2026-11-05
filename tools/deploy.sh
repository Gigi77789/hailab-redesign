#!/bin/sh
# Publishes the draft review copy (banner + noindex) to the gh-pages branch of this repo's origin.
# Design versions already on gh-pages (v1/, v2/, ...) are kept.
# Usage, from the repo root:  sh tools/deploy.sh
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
REMOTE=$(git -C "$ROOT" remote get-url origin)
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

python3 "$ROOT/tools/pages.py" --draft "$OUT" >/dev/null
cp -R "$ROOT/css" "$ROOT/js" "$ROOT/data" "$ROOT/assets" "$OUT/"
touch "$OUT/.nojekyll"

# In GitHub Actions the checkout's auth header lives in the source repo's config; reuse it here.
AUTH=$(git -C "$ROOT" config --get http.https://github.com/.extraheader || true)

# keep the design versions (v1/, v2/, ...) that tools/deploy_version.sh published next to the draft
PREV=$(mktemp -d)
if git ${AUTH:+-c http.https://github.com/.extraheader="$AUTH"} clone -q --depth 1 --branch gh-pages "$REMOTE" "$PREV" 2>/dev/null; then
  for d in "$PREV"/v[0-9]*/; do [ -d "$d" ] && cp -R "$d" "$OUT/"; done
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
