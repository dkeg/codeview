#!/usr/bin/env bash
# Build CodeView.app + DMGs for arm64 and x86_64.
#
#   ./scripts/build-mac.sh                     unsigned local build
#   ./scripts/build-mac.sh --sign              sign with Developer ID (hardened runtime)
#   ./scripts/build-mac.sh --sign --notarize   sign, notarize and staple
#
# Notarization credentials: NOTARY_PROFILE (a `xcrun notarytool store-credentials`
# profile, default "codeview"), or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID.
set -euo pipefail
cd "$(dirname "$0")/.."

SIGN=0; NOTARIZE=0; ARCHES="arm64 amd64"
for a in "$@"; do
  case "$a" in
    --sign) SIGN=1 ;;
    --notarize) NOTARIZE=1; SIGN=1 ;;
    --arch=*) ARCHES="${a#--arch=}" ;;
    *) echo "unknown option $a" >&2; exit 1 ;;
  esac
done

VERSION=$(sed -n 's/^  "version": "\(.*\)",$/\1/p' package.json)
IDENTITY=${CODESIGN_IDENTITY:-"Developer ID Application: Drew Craig (Y8W7627T7W)"}
TEAM_ID=${APPLE_TEAM_ID:-Y8W7627T7W}
OUT=dist
echo "▸ CodeView $VERSION ($ARCHES)"

[ -d node_modules/codemirror ] || npm ci
mkdir -p "$OUT"

notarize() {
  if [ -n "${APPLE_ID:-}" ]; then
    xcrun notarytool submit "$1" --apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$TEAM_ID" --wait
  else
    xcrun notarytool submit "$1" --keychain-profile "${NOTARY_PROFILE:-codeview}" --wait
  fi
}

for GOARCH in $ARCHES; do
  suffix=$([ "$GOARCH" = arm64 ] && echo "-arm64" || echo "")
  stage="$OUT/stage-$GOARCH"
  app="$stage/CodeView.app"
  rm -rf "$stage"; mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"

  echo "▸ go build ($GOARCH)"
  CGO_ENABLED=1 GOOS=darwin GOARCH=$GOARCH MACOSX_DEPLOYMENT_TARGET=13.0 \
    CGO_CFLAGS="-mmacosx-version-min=13.0" CGO_LDFLAGS="-mmacosx-version-min=13.0" \
    go build -tags production -trimpath -buildvcs=false \
      -ldflags "-s -w -X main.version=$VERSION" -o "$app/Contents/MacOS/CodeView" .

  sed "s/__VERSION__/$VERSION/g" build/darwin/Info.plist > "$app/Contents/Info.plist"
  cp assets/icon-dark.icns "$app/Contents/Resources/icon.icns"

  if [ $SIGN = 1 ]; then
    echo "▸ codesign ($GOARCH)"
    codesign --force --options runtime --timestamp \
      --entitlements build/darwin/entitlements.plist --sign "$IDENTITY" "$app"
    codesign --verify --strict --verbose=2 "$app"
  fi

  dmg="$OUT/CodeView-$VERSION$suffix.dmg"
  rm -f "$dmg"
  ln -s /Applications "$stage/Applications"
  hdiutil create -quiet -volname "CodeView $VERSION" -srcfolder "$stage" -ov -format UDZO "$dmg"
  [ $SIGN = 1 ] && codesign --force --timestamp --sign "$IDENTITY" "$dmg"

  if [ $NOTARIZE = 1 ]; then
    echo "▸ notarize ($GOARCH)"
    notarize "$dmg"
    xcrun stapler staple "$dmg"
  fi
  echo "✓ $dmg  $(shasum -a 256 "$dmg" | cut -d' ' -f1)"
done
