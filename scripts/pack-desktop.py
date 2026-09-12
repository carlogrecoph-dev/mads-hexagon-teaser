#!/usr/bin/env python3
"""Build a double-click desktop zip: Mac .app + Windows bat + local web server."""
from __future__ import annotations

import os
import shutil
import struct
import zipfile
from pathlib import Path

ROOT = Path("/workspace")
STATIC = ROOT / ".vercel" / "output" / "static"
PUBLIC = ROOT / "public"
OUT = ROOT / "artifacts" / "MADS-Hexagon-desktop.zip"
STAGE = ROOT / "artifacts" / "_desktop_stage"

APP = "MADS Hexagon.app"
PORT = 8765


def png_to_icns(png: bytes) -> bytes:
    inner = b"ic09" + struct.pack(">I", 8 + len(png)) + png
    return b"icns" + struct.pack(">I", 8 + len(inner)) + inner


def write(path: Path, text: str, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    os.chmod(path, mode)


def copy_web(dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    src = STATIC if STATIC.exists() else PUBLIC
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src, dest, dirs_exist_ok=True)
    assets_dir = dest / "assets"
    css_files = sorted(assets_dir.glob("styles-*.css")) if assets_dir.exists() else []
    js_files = sorted(assets_dir.glob("index-*.js")) if assets_dir.exists() else []
    css = f"/assets/{css_files[0].name}" if css_files else ""
    js_list = ",".join(f'"{p.name}"' for p in js_files)
    index = f"""<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>M.A.D.S. Hexagon</title>
  <link rel="icon" href="/favicon.svg"/>
  <link rel="stylesheet" href="{css}"/>
  <style>
    html,body,#app{{margin:0;height:100%;background:#070708;color:#f4efe6;font-family:system-ui,sans-serif}}
  </style>
</head>
<body>
  <div id="app">Carico Hexagon…</div>
  <script type="module">
    const files = [{js_list}];
    for (const name of files) {{
      const s = document.createElement("script");
      s.type = "module";
      s.src = "/assets/" + name;
      document.body.appendChild(s);
    }}
  </script>
</body>
</html>
"""
    (dest / "index.html").write_text(index, encoding="utf-8")


MAC_LAUNCH = f"""#!/bin/bash
DIR="$(cd "$(dirname "$0")/../Resources/web" && pwd)"
PORT={PORT}
cd "$DIR"
if command -v python3 >/dev/null 2>&1; then
  PY=python3
else
  PY=python
fi
"$PY" -m http.server "$PORT" --bind 127.0.0.1 >/tmp/mads-hexagon.log 2>&1 &
PID=$!
sleep 0.5
open "http://127.0.0.1:$PORT/"
wait $PID
"""

WIN_BAT = f"""@echo off
set PORT={PORT}
cd /d "%~dp0web"
start "" "http://127.0.0.1:%PORT%/"
python -m http.server %PORT% --bind 127.0.0.1
if errorlevel 1 py -3 -m http.server %PORT% --bind 127.0.0.1
pause
"""

README = """M.A.D.S. HEXAGON — app per il computer
=====================================

MAC
1. Estrai questo zip.
2. Tasto DESTRO su "MADS Hexagon.app" → Apri → Apri
   (la prima volta il Mac chiede conferma perché non è firmata).
3. Trascina l'icona sul Desktop. Da ora basta il doppio clic.

WINDOWS
1. Estrai lo zip.
2. Doppio clic su "Avvia Hexagon.bat".
3. Tasto destro sul .bat → Invia a → Desktop.

Si apre nel browser in locale, senza internet dopo il primo avvio
(le opere che carichi restano sul computer).
"""

PLIST = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>M.A.D.S. Hexagon</string>
  <key>CFBundleDisplayName</key><string>M.A.D.S. Hexagon</string>
  <key>CFBundleIdentifier</key><string>art.mads.hexagon</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>Hexagon</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
"""


def main() -> None:
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)
    app = STAGE / APP
    write(app / "Contents" / "Info.plist", PLIST)
    write(app / "Contents" / "PkgInfo", "APPL????")
    write(app / "Contents" / "MacOS" / "Hexagon", MAC_LAUNCH, 0o755)
    png = (PUBLIC / "icon-512.png").read_bytes()
    icns = png_to_icns(png)
    icns_path = app / "Contents" / "Resources" / "AppIcon.icns"
    icns_path.parent.mkdir(parents=True, exist_ok=True)
    icns_path.write_bytes(icns)
    copy_web(app / "Contents" / "Resources" / "web")
    # Windows: same web next to bat
    shutil.copytree(app / "Contents" / "Resources" / "web", STAGE / "web")
    write(STAGE / "Avvia Hexagon.bat", WIN_BAT)
    write(STAGE / "LEGGIMI.txt", README)
    shutil.copy2(PUBLIC / "icon-512.png", STAGE / "icona.png")
    # also a .command for Mac users who skip the .app
    write(STAGE / "Avvia Hexagon.command", MAC_LAUNCH.replace("../Resources/web", "web"), 0o755)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()
    with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for path in STAGE.rglob("*"):
            if path.is_file():
                rel = path.relative_to(STAGE).as_posix()
                info = zipfile.ZipInfo(rel)
                mode = 0o100755 if path.suffix in {".command"} or path.name == "Hexagon" else 0o100644
                info.external_attr = mode << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, path.read_bytes())
    public_copy = PUBLIC / "MADS-Hexagon-desktop.zip"
    shutil.copy2(OUT, public_copy)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
    print(f"copied {public_copy}")


if __name__ == "__main__":
    main()
