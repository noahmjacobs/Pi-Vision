#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "==> Installing build dependencies..."
pip3 install pyinstaller

echo "==> Building PiVision.app..."
python3 -m PyInstaller --noconfirm PiVision.spec

echo "==> Creating PiVision-mac.dmg..."
rm -rf _dmg_stage
mkdir _dmg_stage
cp -r dist/PiVision.app _dmg_stage/PiVision.app
ln -sf /Applications _dmg_stage/Applications
hdiutil create \
  -volname "PiVision Processor" \
  -srcfolder _dmg_stage \
  -ov -format UDZO \
  PiVision-mac.dmg
rm -rf _dmg_stage

echo ""
echo "Done! PiVision-mac.dmg is ready."
echo "Upload it to GitHub Releases as: PiVision-mac.dmg"
