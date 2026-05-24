#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "==> Installing build dependencies..."
pip install pyinstaller

echo "==> Building PiVision.app..."
pyinstaller --noconfirm PiVision.spec

echo "==> Creating PiVision-mac.dmg..."
hdiutil create \
  -volname "PiVision Processor" \
  -srcfolder dist/PiVision.app \
  -ov -format UDZO \
  PiVision-mac.dmg

echo ""
echo "Done! PiVision-mac.dmg is ready."
echo "Upload it to GitHub Releases as: PiVision-mac.dmg"
