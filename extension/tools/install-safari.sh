#!/usr/bin/env bash
# Builds AI Footprint for Safari and installs it on this Mac.
#
#   cd extension && bash tools/install-safari.sh
#
# Needs: macOS with Safari 17 or later, Xcode (free, Mac App Store), Node.js 20+.
# No Apple developer account is needed to run it on your own Mac; Safari just has
# to allow unsigned extensions (step 2 below, printed again at the end).
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="AI Footprint"
BUNDLE_ID="io.github.rishinkalra.aifootprint"
OUT="$HERE/dist/safari-app"

fail() { printf '\n\033[31m%s\033[0m\n' "$1" >&2; exit 1; }
step() { printf '\n\033[32m==>\033[0m %s\n' "$1"; }

[[ "$(uname)" == "Darwin" ]] || fail "Safari extensions can only be built on a Mac."
command -v node >/dev/null || fail "Node.js is missing. Install it from https://nodejs.org (version 20 or later)."
xcrun --find safari-web-extension-converter >/dev/null 2>&1 \
  || fail "Xcode is missing or not selected. Install Xcode from the Mac App Store, open it once, then run: sudo xcode-select -s /Applications/Xcode.app"

step "Building the Safari version of the extension"
(cd "$HERE" && node tools/build.js >/dev/null)

step "Converting it into a Safari app with Apple's converter"
rm -rf "$OUT"
xcrun safari-web-extension-converter "$HERE/dist/safari" \
  --project-location "$OUT" --app-name "$APP_NAME" --bundle-identifier "$BUNDLE_ID" \
  --macos-only --copy-resources --swift --no-open --no-prompt --force >/dev/null

PROJECT="$(find "$OUT" -name '*.xcodeproj' -maxdepth 3 | head -n 1)"
[[ -n "$PROJECT" ]] || fail "The converter did not create an Xcode project in $OUT."
SCHEME="$(xcodebuild -list -project "$PROJECT" 2>/dev/null | awk '/Schemes:/{getline; gsub(/^ +/, ""); print; exit}')"
[[ -n "$SCHEME" ]] || fail "Could not find the app's build scheme in $PROJECT."

step "Building the app (signed to run on this Mac only)"
xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
  -derivedDataPath "$OUT/build" CODE_SIGN_IDENTITY="-" CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM="" \
  build >"$OUT/build.log" 2>&1 || fail "The build failed. Details are in $OUT/build.log"

APP="$(find "$OUT/build/Build/Products/Release" -name '*.app' -maxdepth 1 | head -n 1)"
[[ -n "$APP" ]] || fail "The build finished but no app was found. Details are in $OUT/build.log"

step "Installing to ~/Applications and opening it, which registers the extension with Safari"
mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/$APP_NAME.app"
cp -R "$APP" "$HOME/Applications/$APP_NAME.app"
open "$HOME/Applications/$APP_NAME.app"

cat <<'DONE'

Done. Now turn it on in Safari (about a minute):

  1. Safari > Settings > Advanced: tick "Show features for web developers".
  2. Safari > Settings > Developer: tick "Allow unsigned extensions".
     Safari turns this off again each time it quits; just tick it again.
  3. Safari > Settings > Extensions: tick "AI Footprint".
  4. Click the AI Footprint icon next to the address bar, choose
     "Always Allow on These Websites" for the AI sites, or allow each site
     the first time you open it.
  5. Open ChatGPT, Claude or Gemini and chat. The badge appears after each reply.

DONE
