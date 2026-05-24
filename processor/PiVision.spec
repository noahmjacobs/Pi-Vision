import sys
import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

datas = []
datas += collect_data_files('customtkinter')
datas += collect_data_files('ultralytics')
datas += [('icon.icns', '.'), ('icon.ico', '.')]

hidden = []
hidden += collect_submodules('customtkinter')
hidden += ['PIL._tkinter_finder', 'pkg_resources.py2_warn']

a = Analysis(
    ['app.py'],
    pathex=[os.path.dirname(os.path.abspath(SPEC))],
    binaries=[],
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['notebook', 'scipy', 'pandas'],
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
