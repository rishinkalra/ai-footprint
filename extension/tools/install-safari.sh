#!/usr/bin/env bash
# Builds AI Footprint for Safari and installs it on this Mac.
#
#   cd extension && bash tools/install-safari.sh
#
# Needs: macOS with Safari 17 or later, Xcode (free, Mac App Store), Node.js 20+.
#
# Signing: set TEAM to your Apple developer team ID (Xcode > Settings > Accounts)
# and the app is signed with it, so Safari shows the extension like any other:
#   TEAM=ABCDE12345 bash tools/install-safari.sh
# Without TEAM it is signed for this Mac only, and Safari needs "Allow unsigned
# extensions" turned on (Safari > Settings > Developer).
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="AI Footprint"
# The converter names the app <prefix>.<App-Name> and the extension <this>.Extension,
# so this must end in the app name for the two to nest (macOS requires it).
BUNDLE_ID="io.github.rishinkalra.AI-Footprint"
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

# Belt and braces: make sure the extension's bundle ID starts with the app's, in the
# project and in the generated Swift that refers to it.
python3 - "$PROJECT/project.pbxproj" "$OUT" <<'PY'
import os, re, sys
pbx, root = sys.argv[1], sys.argv[2]
text = open(pbx).read()
ids = sorted(set(re.findall(r'PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)"?;', text)))
ext = [i for i in ids if i.endswith('.Extension')]
app = [i for i in ids if not i.endswith('.Extension')]
if len(ext) == 1 and len(app) == 1 and not ext[0].startswith(app[0] + '.'):
    new = app[0] + '.Extension'
    for dirpath, _, files in os.walk(root):
        for f in files:
            if f.endswith(('.pbxproj', '.swift', '.plist', '.entitlements')):
                p = os.path.join(dirpath, f)
                s = open(p, encoding='utf-8', errors='ignore').read()
                if ext[0] in s:
                    open(p, 'w', encoding='utf-8').write(s.replace(ext[0], new))
    print('Extension bundle ID set to ' + new)
PY
SCHEME="$(xcodebuild -list -project "$PROJECT" 2>/dev/null | awk '/Schemes:/{getline; gsub(/^ +/, ""); print; exit}')"
[[ -n "$SCHEME" ]] || fail "Could not find the app's build scheme in $PROJECT."

TEAM="${TEAM:-}"
if [[ -n "$TEAM" ]]; then
  step "Building the app, signed with your Apple developer team $TEAM"
  SIGNING=(DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic -allowProvisioningUpdates -allowProvisioningDeviceRegistration)
else
  step "Building the app (signed to run on this Mac only)"
  SIGNING=(CODE_SIGN_IDENTITY="-" CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM="")
fi
xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
  -derivedDataPath "$OUT/build" "${SIGNING[@]}" \
  build >"$OUT/build.log" 2>&1 || fail "The build failed. Details are in $OUT/build.log"

APP="$(find "$OUT/build/Build/Products/Release" -name '*.app' -maxdepth 1 | head -n 1)"
[[ -n "$APP" ]] || fail "The build finished but no app was found. Details are in $OUT/build.log"

step "Installing to ~/Applications and opening it, which registers the extension with Safari"
mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/$APP_NAME.app"
cp -R "$APP" "$HOME/Applications/$APP_NAME.app"
codesign -dv "$HOME/Applications/$APP_NAME.app" 2>&1 | grep -E "Authority|TeamIdentifier|Signature" | head -3 || true
# Launched outside this shell's process tree, so a CI runner's cleanup doesn't close it.
RUNNER_TRACKING_ID="" open "$HOME/Applications/$APP_NAME.app"

cat <<'DONE'

Done. The AI Footprint window is open. Click "Quit and Open Safari Settings",
tick "AI Footprint" in the list, then allow it on your AI sites when Safari asks.
DONE
if [[ -z "$TEAM" ]]; then cat <<'DONE'
Because it isn't signed with a developer team, first turn on
Safari > Settings > Advanced > "Show features for web developers", then
Safari > Settings > Developer > "Allow unsigned extensions".

DONE
fi
