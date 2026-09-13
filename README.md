# M.A.D.S. Hexagon Teaser Engine

Cinematic teaser generator for artworks inside a reconstructed M.A.D.S. Hexagon installation: six 75" outer displays, a central 50–55" touchscreen, three camera families, gesture-coupled zoom, and batch 1080×1920 export.

**Live app:** [carlogrecoph-dev.github.io/mads-hexagon-teaser](https://carlogrecoph-dev.github.io/mads-hexagon-teaser/)

Artwork never leaves the browser. Library and renders persist in IndexedDB.

## What it does

1. Upload JPG / PNG / WebP (or start from the bundled sample gallery).
2. Local saliency analysis proposes 2–5 focus points (faces, contrast, texture). You can lock, delete, or add your own.
3. A seeded choreography engine builds a teaser that visits **Top**, **Right GoPro**, and **Left GoPro**.
4. Hands and artwork share one interaction state: spread zooms in, pinch returns, pan is inverted so the undiscovered side is revealed.
5. Export a deterministic MP4 (WebCodecs + Mediabunny). Same artwork + same seed = the same film.

## Deploy (Aruba / any static host)

The `docs/` folder is a complete static site. Upload its contents into a web folder (for example `hexagon-aruba/`) and open `index.html`. Relative paths (`./`) work in a subdirectory.

```
npm install
npm run build:aruba
# then copy dist-aruba/ plus public/{models,samples,textures,brand,manifest,icons}
```

## Develop

```
npm install
npm run dev
```

```
npm test
npm run typecheck
```

Primary output: 1080×1920, 24–30 fps, ~40 seconds per artwork.
