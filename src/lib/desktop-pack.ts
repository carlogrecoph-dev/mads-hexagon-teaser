import { pngToIcns, zipStore } from "./zip-store";

function encode(text: string) {
  return new TextEncoder().encode(text);
}

export function buildDesktopZip(origin: string, png: Uint8Array) {
  const icns = png.byteLength > 32 ? pngToIcns(png) : encode("");
  const script = `#!/bin/bash
URL="${origin}"
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$URL" --new-window
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -na "Microsoft Edge" --args --app="$URL" --new-window
elif [ -d "/Applications/Chromium.app" ]; then
  open -na "Chromium" --args --app="$URL" --new-window
else
  open "$URL"
fi
`;
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
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
`;
  const webloc = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict><key>URL</key><string>${origin}</string></dict>
</plist>
`;
  const bat = `@echo off
start "" chrome --app="${origin}"
if errorlevel 1 start "" msedge --app="${origin}"
if errorlevel 1 start "" "${origin}"
`;
  const readme = `M.A.D.S. HEXAGON
MAC: tasto destro su "MADS Hexagon.app" → Apri. Poi trascinalo sul Desktop.
WINDOWS: doppio clic su "Avvia Hexagon.bat".
`;
  const files = [
    { name: "LEGGIMI.txt", data: encode(readme) },
    { name: "Avvia Hexagon.bat", data: encode(bat) },
    { name: "Hexagon.webloc", data: encode(webloc) },
    { name: "MADS Hexagon.app/Contents/PkgInfo", data: encode("APPL????") },
    { name: "MADS Hexagon.app/Contents/Info.plist", data: encode(plist) },
    { name: "MADS Hexagon.app/Contents/MacOS/Hexagon", data: encode(script), unixMode: 0o100755 },
  ];
  if (icns.byteLength > 32) {
    files.push({ name: "MADS Hexagon.app/Contents/Resources/AppIcon.icns", data: icns });
  }
  if (png.byteLength > 32) files.push({ name: "icona.png", data: new Uint8Array(png) });
  return zipStore(files);
}

export async function makeDesktopZipBlob() {
  const origin = window.location.origin;
  const pngBuf = await fetch("/icon-512.png")
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null);
  const png = pngBuf ? new Uint8Array(pngBuf) : encode("");
  return buildDesktopZip(origin, png);
}

export function openZipInNewTab(blob: Blob, filename: string) {
  const fileUrl = URL.createObjectURL(blob);
  const html = `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Scarica ${filename}</title>
  <style>
    html,body{margin:0;min-height:100vh;background:#0e0d0c;color:#f4efe6;font-family:system-ui,sans-serif;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center}
    a{background:#e11d8c;color:#fff;text-decoration:none;padding:18px 28px;border-radius:14px;font-weight:700;font-size:18px}
    p{max-width:28rem;line-height:1.45;color:#c8c2b8}
  </style>
</head>
<body>
  <p>Clicca il pulsante rosa. Si scarica lo zip con l'app da mettere sul desktop.</p>
  <a id="dl" href="${fileUrl}" download="${filename}">Scarica ${filename}</a>
</body>
</html>`;
  const page = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const w = window.open(page, "_blank", "noopener");
  if (!w) window.location.assign(fileUrl);
}

export async function publishZip(blob: Blob, name: string) {
  try {
    const res = await fetch(`/api/teasers?name=${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: blob,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}

export async function downloadDesktopApp() {
  const blob = await makeDesktopZipBlob();
  const href = await publishZip(blob, "MADS-Hexagon-desktop.zip");
  if (href) {
    const w = window.open(href, "_blank", "noopener");
    if (!w) window.location.assign(href);
    return href;
  }
  openZipInNewTab(blob, "MADS-Hexagon-desktop.zip");
  return URL.createObjectURL(blob);
}
