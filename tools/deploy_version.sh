#!/bin/sh
# Publishes this design version as a review copy (banner + noindex) in its own folder of the gh-pages
# branch, e.g. https://gigi77789.github.io/hailab-redesign/v1/, leaving the main draft and other versions alone.
# Usage, from the repo root of a version worktree:  sh tools/deploy_version.sh v1
set -eu
NAME=${1:?usage: sh tools/deploy_version.sh v1}
case "$NAME" in v[0-9]*) ;; *) echo "version name must look like v1, v2, ..." >&2; exit 1 ;; esac
ROOT=$(cd "$(dirname "$0")/.." && pwd)
REMOTE=$(git -C "$ROOT" remote get-url origin)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# In GitHub Actions the checkout's auth header lives in the source repo's config; reuse it here.
AUTH=$(git -C "$ROOT" config --get http.https://github.com/.extraheader || true)
git ${AUTH:+-c http.https://github.com/.extraheader="$AUTH"} clone -q --depth 1 --branch gh-pages "$REMOTE" "$WORK"
rm -rf "$WORK/$NAME"
mkdir -p "$WORK/$NAME"
python3 "$ROOT/tools/pages.py" --draft "$WORK/$NAME" >/dev/null
# the site editor (admin/) is published too; while admin/config.js says demo: true it saves nothing
cp -R "$ROOT/css" "$ROOT/js" "$ROOT/data" "$ROOT/assets" "$ROOT/admin" "$WORK/$NAME/"

cd "$WORK"
git add -A
NAME_=$(git -C "$ROOT" config user.name || echo "github-actions[bot]")
MAIL_=$(git -C "$ROOT" config user.email || echo "41898282+github-actions[bot]@users.noreply.github.com")
git -c user.name="$NAME_" -c user.email="$MAIL_" commit -qm "Deploy $NAME from $(git -C "$ROOT" rev-parse --short HEAD)"
[ -n "$AUTH" ] && git config http.https://github.com/.extraheader "$AUTH"
# another deploy may have landed since the clone; replay this one on top of it
git push -q origin gh-pages || { git pull -q --rebase origin gh-pages && git push -q origin gh-pages; }
echo "Pushed $NAME to gh-pages on $REMOTE"
