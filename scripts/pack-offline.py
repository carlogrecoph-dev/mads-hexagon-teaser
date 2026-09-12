#!/usr/bin/env python3
"""Build the sendable offline ZIP (Mac double-click + PWA files)."""
from __future__ import annotations

import os
import shutil
import zipfile
from pathlib import Path

ROOT = Path("/workspace")
DIST = ROOT / "dist-aruba"
OUT = ROOT / "artifacts" / "Hexagon-offline.zip"

MAC = r"""#!/bin/bash
cd "$(dirname "$0")"
PORT=8765
echo "Hexagon si apre nel browser. Non chiudere questa finestra."
if command -v python3 >/dev/null 2>&1; then PY=python3; else PY=python; fi
"$PY" -m http.server "$PORT" --bind 127.0.0.1 &
PID=$!
sleep 0.5
open "http://127.0.0.1:$PORT/"
wait $PID
"""

WIN = r"""@echo off
cd /d "%~dp0"
echo Hexagon si apre nel browser. Non chiudere questa finestra.
start "" "http://127.0.0.1:8765/"
python -m http.server 8765 --bind 127.0.0.1
if errorlevel 1 py -3 -m http.server 8765 --bind 127.0.0.1
pause
"""

LEGGIMI = """M.A.D.S. HEXAGON — cartella per Aruba
====================================

1. Estrai questo zip. Ottieni la cartella  hexagon
2. Con FileZilla / File Manager Aruba apri  public_html
3. Carica TUTTA la cartella  hexagon  DENTRO public_html
   (non mescolare i file con il sito già esistente)

Deve risultare così:

  public_html/
    (il tuo sito attuale, non toccarlo)
    hexagon/
      index.html
      .htaccess
      assets/
      models/
      ...

4. Apri:  https://TUODOMINIO.it/hexagon/

PWA / telefono
Apri quel link sul cellulare → Condividi / menu Chrome → Aggiungi a Home.
Dopo la prima volta con internet, l’app resta offline.

Mac in locale (senza Aruba)
Doppio clic su Apri-Hexagon.command

Non cancellare models/female.vrm
"""


def write_sw(dest: Path) -> None:
    files = []
    for p in dest.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(dest).as_posix()
        if rel.startswith(".") or rel.endswith((".command", ".bat", ".txt", ".zip")):
            continue
        files.append(rel)
    files = sorted(set(files + ["index.html"]))
    listed = ",\n  ".join(f'"{f}"' for f in files)
    dest.joinpath("sw.js").write_text(
        f"""/* Hexagon offline */
const CACHE = "mads-hexagon-v2";
const FILES = [
  {listed}
];

const SCOPE = self.registration.scope;

self.addEventListener("install", (event) => {{
  event.waitUntil((async () => {{
    const cache = await caches.open(CACHE);
    await Promise.allSettled(FILES.map((f) => cache.add(new URL(f, SCOPE))));
    await self.skipWaiting();
  }})());
}});

self.addEventListener("activate", (event) => {{
  event.waitUntil((async () => {{
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  }})());
}});

self.addEventListener("fetch", (event) => {{
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {{
    if (url.hostname.includes("fonts.g") || url.hostname.includes("gstatic")) {{
      event.respondWith(cacheFirst(req));
    }}
    return;
  }}
  if (req.mode === "navigate") {{
    event.respondWith(networkFirst(req));
    return;
  }}
  event.respondWith(cacheFirst(req));
}});

async function cacheFirst(request) {{
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, {{ ignoreSearch: true }});
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}}

async function networkFirst(request) {{
  const cache = await caches.open(CACHE);
  try {{
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  }} catch {{
    const hit = await cache.match(request, {{ ignoreSearch: true }});
    if (hit) return hit;
    return (await cache.match(new URL("index.html", SCOPE))) || Response.error();
  }}
}}
""",
        encoding="utf-8",
    )


def main() -> None:
    if not DIST.exists():
        raise SystemExit("dist-aruba missing — run vite aruba build first")
    cmd = DIST / "Apri-Hexagon.command"
    cmd.write_text(MAC, encoding="utf-8")
    os.chmod(cmd, 0o755)
    (DIST / "Apri-Hexagon.bat").write_text(WIN, encoding="utf-8")
    (DIST / "LEGGIMI.txt").write_text(LEGGIMI, encoding="utf-8")
    shutil.copy2(DIST / "index.html", DIST / "404.html")
    write_sw(DIST)
    if OUT.exists():
        OUT.unlink()
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for path in DIST.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix.lower() == ".zip":
                continue
            rel = path.relative_to(DIST).as_posix()
            info = zipfile.ZipInfo("hexagon-aruba/" + rel)
            mode = 0o100755 if path.suffix == ".command" else 0o100644
            info.external_attr = mode << 16
            z.writestr(info, path.read_bytes())
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
