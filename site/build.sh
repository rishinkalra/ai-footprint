#!/usr/bin/env bash
# Assembles the project website into site/_site.
# The page reuses the extension's own number code, fonts, brand files and
# screenshots, so it is copied here instead of duplicated in the repo.
# To publish: site/publish.sh (builds, then pushes site/_site to gh-pages).
# Local preview:
#   site/build.sh && npx -y serve site/_site
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/site/_site"

rm -rf "$out"
mkdir -p "$out/assets/fonts" "$out/assets/brand" "$out/assets/img" "$out/assets/js/footprint/locales"

cp "$root/site/index.html" "$root/site/site.css" "$root/site/site.js" "$out/"

cp "$root"/extension/fonts/*.woff2 "$out/assets/fonts/"
cp "$root"/brand/{mark.svg,mark-on-dark.svg,icon.svg,social-preview.png} "$out/assets/brand/"
cp "$root"/extension/store/listing/screenshot-{1-badge,2-popup,3-tips,4-private,5-share}.png "$out/assets/img/"
cp "$root"/docs/images/dashboard-{light,dark}.png "$out/assets/img/"

src="$root/extension/src"
cp "$src"/{i18n,format,regions-data,regions,compare}.js "$out/assets/js/footprint/"
cp "$src/locales/en.js" "$out/assets/js/footprint/locales/"

touch "$out/.nojekyll"
echo "Built $out"
