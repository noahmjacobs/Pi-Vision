#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "==> Installing build dependencies..."
pip3 install pyinstaller

echo "==> Building PiVision.app..."
python3 -m PyInstaller --noconfirm PiVision.spec

echo "==> Creating PiVision-mac.dmg..."
hdiutil create \
  -volname "PiVision Processor" \
  -srcfolder dist/PiVision.app \
  -ov -format UDZO \
  PiVision-mac.dmg

echo ""
echo "Done! PiVision-mac.dmg is ready."
echo "Upload it to GitHub Releases as: PiVision-mac.dmg"
