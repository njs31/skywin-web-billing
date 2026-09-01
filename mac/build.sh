#!/bin/bash
#
# Build Skywin Labels.app with the Command Line Tools alone — no Xcode, no
# project file. libusb comes from Homebrew and is reached through a bridging
# header, which is why this is a plain swiftc invocation rather than a package.
#
# Usage: ./build.sh [--install]
set -euo pipefail

cd "$(dirname "$0")"
APP="build/Skywin Labels.app"
BREW_PREFIX="$(brew --prefix 2>/dev/null || echo /opt/homebrew)"

if [ ! -f "$BREW_PREFIX/include/libusb-1.0/libusb.h" ]; then
  echo "libusb is missing. Install it with:  brew install libusb" >&2
  exit 1
fi

# Pick an SDK whose SwiftUI still exposes @State as a property wrapper.
#
# In the macOS 27 SDK, @State/@Binding became macros, and expanding them needs
# the SwiftUIMacros plugin — which ships only with Xcode. The Command Line
# Tools carry ObservationMacros and SwiftMacros but not that one, so a build
# against the 27 SDK fails with "plugin for module 'SwiftUIMacros' not found".
# Building against 26.5 is not a downgrade: the binary runs on macOS 27 fine.
SDK=""
for candidate in MacOSX26.5.sdk MacOSX26.sdk; do
  if [ -d "/Library/Developer/CommandLineTools/SDKs/$candidate" ]; then
    SDK="/Library/Developer/CommandLineTools/SDKs/$candidate"
    break
  fi
done
if [ -z "$SDK" ]; then
  SDK="$(xcrun --show-sdk-path)"
  echo "warning: no macOS 26 SDK found; trying $SDK (needs Xcode for SwiftUI macros)" >&2
fi

rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc \
  -O \
  -swift-version 5 \
  -sdk "$SDK" \
  -import-objc-header Bridging/libusb-bridge.h \
  -I "$BREW_PREFIX/include" \
  -L "$BREW_PREFIX/lib" \
  -lusb-1.0 \
  -o "$APP/Contents/MacOS/SkywinLabels" \
  Sources/*.swift

cp Resources/Info.plist "$APP/Contents/Info.plist"

# Ad-hoc signature. A locally built app is not quarantined, so this is enough
# for it to launch; it is not a Developer ID signature and will not pass
# notarisation if you ever distribute it.
codesign --force --sign - "$APP" >/dev/null

echo "Built: $APP"

if [ "${1:-}" = "--install" ]; then
  DEST="$HOME/Applications"
  mkdir -p "$DEST"
  rm -rf "$DEST/Skywin Labels.app"
  cp -R "$APP" "$DEST/"
  echo "Installed: $DEST/Skywin Labels.app"
fi
