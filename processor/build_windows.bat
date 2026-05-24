@echo off
cd /d "%~dp0"

echo =^> Installing build dependencies...
pip install pyinstaller

echo =^> Building PiVision.exe...
pyinstaller --noconfirm PiVision.spec

echo =^> Copying output...
copy "dist\PiVision\PiVision.exe" "PiVision-windows.exe"

echo.
echo Done! PiVision-windows.exe is ready.
echo Upload it to GitHub Releases as: PiVision-windows.exe
