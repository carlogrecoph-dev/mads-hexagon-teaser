# Third-party runtime dependencies

Open-source only. No paid APIs, SaaS animation, or vendor-locked codecs.

## Application engine (added for this product)

| Package | License | Role |
| --- | --- | --- |
| `three` | MIT | 3D renderer, cameras, materials |
| `@react-three/fiber` | MIT | React renderer for Three.js |
| `@react-three/drei` | MIT | helpers (unused-heavy; available) |
| `@react-three/postprocessing` | MIT | optional post stack |
| `postprocessing` | MIT | EffectComposer implementation |
| `@pixiv/three-vrm` | MIT | optional VRM humanoid loader |
| `dexie` | Apache-2.0 | IndexedDB artwork library |
| `mediabunny` | MPL-2.0 | WebCodecs muxing to MP4 |
| `motion` | MIT | UI motion (available) |
| `@types/three` | MIT | TypeScript types |

Mediabunny is MPL-2.0, which the project brief explicitly allows. Video encode uses browser WebCodecs (AVC) when present. FFmpeg.wasm is **not** bundled.

## Platform / template (preinstalled)

React, React DOM, TanStack Start / Router / Query / Table, Tailwind CSS, Radix UI, lucide-react, zustand, zod, sonner, class-variance-authority, clsx, tailwind-merge, and the Grok App Builder PWA injector are part of the host template. Licenses are MIT / Apache-2.0 as published by each project.

Auth (`better-auth`) and Postgres (`kysely`, `pg`, `@electric-sql/pglite`) remain in the template but are **not used** by this app. Artwork and jobs live in IndexedDB.
