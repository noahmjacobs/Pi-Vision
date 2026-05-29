import sys
import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

datas = []
datas += collect_data_files('customtkinter')
datas += collect_data_files('ultralytics')
datas += [('icon.icns', '.'), ('icon.ico', '.'), ('logo.png', '.')]

# Bundle YOLO model weights so users never need to download them on first run
import urllib.request, os
_model_cache = os.path.join(os.path.expanduser('~'), '.cache', 'ultralytics', 'assets')
_model_path  = os.path.join(_model_cache, 'yolov8m.pt')
if not os.path.exists(_model_path):
    os.makedirs(_model_cache, exist_ok=True)
    print('Downloading yolov8m.pt for bundling...')
    urllib.request.urlretrieve(
        'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8m.pt',
        _model_path,
    )
datas += [(_model_path, '.')]

# Bundle ByteTrack config so the tracker works in the frozen app
_tracker_path = os.path.join(os.path.dirname(os.path.abspath(SPEC)), 'bytetrack.yaml')
if os.path.exists(_tracker_path):
    datas += [(_tracker_path, '.')]

# Bundle seatbelt model if present in processor/ directory
_seatbelt_path = os.path.join(os.path.dirname(os.path.abspath(SPEC)), 'seatbelt1.pt')
if os.path.exists(_seatbelt_path):
    print('Found seatbelt1.pt — bundling into app...')
    datas += [(_seatbelt_path, '.')]
else:
    print('seatbelt1.pt not found — seatbelt detection will run in stub mode')

hidden = []
hidden += collect_submodules('customtkinter')
hidden += collect_submodules('ultralytics')   # ensures ByteTrack tracker modules are bundled
hidden += ['PIL._tkinter_finder', 'pkg_resources.py2_warn']
# lap is used by ByteTrack for linear assignment (ultralytics.trackers.utils.matching)
hidden += ['lap']
# scipy is imported unconditionally at the top of ultralytics/trackers/utils/matching.py
# so it MUST be included even though lap handles the actual work
hidden += ['scipy', 'scipy.spatial', 'scipy.spatial.distance', 'scipy.optimize']

a = Analysis(
    ['app.py', 'process_seatbelt.py'],
    pathex=[os.path.dirname(os.path.abspath(SPEC))],
    binaries=[],
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['notebook', 'pandas'],   # scipy removed — ByteTrack needs it at import time
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='PiVision',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon='icon.ico',
    argv_emulation=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='PiVision',
)

if sys.platform == 'darwin':
    app = BUNDLE(
        coll,
        name='PiVision.app',
        icon='icon.icns',
        bundle_identifier='com.pivision.processor',
        info_plist={
            'NSHighResolutionCapable': True,
            'CFBundleShortVersionString': '1.0.0',
        },
    )
