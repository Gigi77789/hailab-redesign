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

git clone -q --depth 1 --branch gh-pages "$REMOTE" "$WORK"
rm -rf "$WORK/$NAME"
mkdir -p "$WORK/$NAME"
python3 "$ROOT/tools/pages.py" --draft "$WORK/$NAME" >/dev/null
cp -R "$ROOT/css" "$ROOT/js" "$ROOT/data" "$ROOT/assets" "$WORK/$NAME/"

cd "$WORK"
git add -A
git -c user.name="$(git -C "$ROOT" config user.name)" -c user.email="$(git -C "$ROOT" config user.email)" \
  commit -qm "Deploy $NAME from $(git -C "$ROOT" rev-parse --short HEAD)"
git push -q origin gh-pages
echo "Pushed $NAME to gh-pages on $REMOTE"
