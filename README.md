# M.A.D.S. Hexagon Teaser Engine

Cinematic teaser generator for artworks inside a reconstructed M.A.D.S. Hexagon installation: six 75" outer displays, a central 50–55" touchscreen, three camera families, gesture-coupled zoom, and batch 1080×1920 export.

Artwork never leaves the browser. Library and renders persist in IndexedDB.

## What it does

1. Upload JPG / PNG / WebP (or start from the bundled sample gallery).
2. Local saliency analysis proposes 2–5 focus points (faces, contrast, texture). You can lock, delete, or add your own.
3. A seeded choreography engine builds a 10–15s teaser that visits **Top**, **Right GoPro**, and **Left GoPro** with drone-style transitions.
4. Hands and artwork share one interaction state: spread zooms in, pinch returns, pan is inverted so the undiscovered side is revealed.
5. Export a deterministic 30 fps MP4 (WebCodecs + Mediabunny). Same artwork + same seed = the same film.

## Movement

Presets: **Soft**, **Cinematic**, **Dynamic**. Independent sliders for camera, zoom, pan, hands, transition length and stabilization.

## Stack

React 19, TanStack Start, Three.js, React Three Fiber, Dexie, Mediabunny. Open-source only (MIT / Apache-2.0 / MPL-2.0). See `DEPENDENCIES_AND_LICENSES.md`.

## Develop

```
npm install
npm run dev
```

```
npm test
npm run typecheck
npm run build
```

Primary output: 1080×1920, 30 fps, 10–15 seconds per artwork.
