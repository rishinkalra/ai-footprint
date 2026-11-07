#!/usr/bin/env bash
# Builds the website and publishes it to the gh-pages branch, which GitHub Pages
# serves at https://rishinkalra.github.io/ai-footprint/. Run from a clean main:
#   site/publish.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
"$root/site/build.sh"

remote="$(git -C "$root" remote get-url origin)"
rev="$(git -C "$root" rev-parse --short HEAD)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cp -R "$root/site/_site/." "$tmp/"
cd "$tmp"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$root" config user.name)" -c user.email="$(git -C "$root" config user.email)" \
  commit -q -m "Publish website from $rev"
git push -q -f "$remote" gh-pages
echo "Published $rev to gh-pages"
