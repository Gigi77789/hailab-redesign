#!/bin/sh
# Publishes the draft review copy (banner + noindex) to the gh-pages branch of this repo's origin.
# Usage, from the repo root:  sh tools/deploy.sh
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
REMOTE=$(git -C "$ROOT" remote get-url origin)
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

python3 "$ROOT/tools/pages.py" --draft "$OUT" >/dev/null
cp -R "$ROOT/css" "$ROOT/js" "$ROOT/data" "$ROOT/assets" "$OUT/"
touch "$OUT/.nojekyll"
printf 'User-agent: *\nDisallow: /\n' > "$OUT/robots.txt"

cd "$OUT"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$ROOT" config user.name)" -c user.email="$(git -C "$ROOT" config user.email)" \
  commit -qm "Deploy draft from $(git -C "$ROOT" rev-parse --short HEAD)"
git push -qf "$REMOTE" gh-pages
echo "Pushed draft to gh-pages on $REMOTE"
