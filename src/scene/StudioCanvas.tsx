import { ViewportDock } from "@/components/viewport-dock";
import { ExportHud } from "@/components/export-hud";
import { CAMERA_PRESETS } from "@/engine/config";
import { CAMERA_TITLE, segmentIt } from "@/lib/copy";
import { useStudio } from "@/store/studio";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ArLayer } from "./ArLayer";
import { Character } from "./Character";
import { Cinematic } from "./Cinematic";
import { Director } from "./Director";
import { Installation } from "./Installation";
import { Monitors } from "./Monitors";
import { runtime } from "./runtime";

function ArtworkBinder() {
  const activeId = useStudio((s) => s.activeId);
  const artworks = useStudio((s) => s.artworks);
  const art = artworks.find((a) => a.id === activeId);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (!art?.blob) {
      runtime.artworkImage = null;
      runtime.redrawArtwork();
      return;
    }
    const url = URL.createObjectURL(art.blob);
    urlRef.current = url;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      runtime.artworkImage = img;
      runtime.artworkSize = { w: img.naturalWidth || art.width, h: img.naturalHeight || art.height };
      runtime.redrawArtwork();
    };
    img.src = url;
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [art?.id, art?.blob, art?.width, art?.height]);

  return null;
}

function CameraFlash() {
  const cameraLock = useStudio((s) => s.cameraLock);
  const cameraFlash = useStudio((s) => s.cameraFlash);
  const lastState = useStudio((s) => s.lastState);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!cameraFlash) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 1300);
    return () => window.clearTimeout(t);
  }, [cameraFlash]);

  if (!visible) return null;
  const id = cameraLock === "auto" ? (lastState?.cameraId ?? "top") : cameraLock;
  const title = cameraLock === "auto" ? "Auto — ciclo camere" : CAMERA_TITLE[id];
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <p className="rounded-lg border border-border bg-background/85 px-4 py-2 font-display text-base font-semibold tracking-tight text-foreground backdrop-blur-sm">
        {title}
      </p>
    </div>
  );
}

function Viewfinder() {
  const lastState = useStudio((s) => s.lastState);
  const cameraLock = useStudio((s) => s.cameraLock);
  const arOverlay = useStudio((s) => s.arOverlay);
  const toyMode = useStudio((s) => s.toyMode);
  const art = useStudio((s) => s.artworks.find((a) => a.id === s.activeId));
  if (!arOverlay && !toyMode) return null;
  const cam = cameraLock === "auto" ? (lastState?.cameraId ?? "top") : cameraLock;
  const segment = lastState ? segmentIt(lastState.segmentLabel) : "";
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      <span className="absolute left-2.5 top-2.5 h-5 w-5 border-l-2 border-t-2 border-accent" />
      <span className="absolute right-2.5 top-2.5 h-5 w-5 border-r-2 border-t-2 border-accent" />
      <span className="absolute bottom-2.5 left-2.5 h-5 w-5 border-b-2 border-l-2 border-accent" />
      <span className="absolute bottom-2.5 right-2.5 h-5 w-5 border-b-2 border-r-2 border-accent" />

      <div className="absolute left-3 top-3 flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
        <span className="font-display text-[10px] font-semibold tracking-[0.22em] text-accent">
          {toyMode ? "GIOCO 3D" : "HEXAGON AR"}
        </span>
      </div>
      <span className="absolute right-3 top-3 max-w-[50%] text-right font-mono text-[10px] tracking-wide text-foreground/80">
        {art?.name ?? "Nessuna opera"}
      </span>

      <div className="absolute inset-x-0 bottom-3 flex items-end justify-between px-3">
        <div>
          <p className="font-display text-[11px] font-semibold tracking-[0.18em] text-foreground">M.A.D.S.</p>
          <p className="text-[9px] tracking-[0.2em] text-muted-foreground">ART GALLERY</p>
        </div>
        <div className="text-right">
          <p className="font-display text-[11px] font-medium text-foreground">
            {toyMode ? "Trascina per orbitare" : (CAMERA_TITLE[cam] ?? cam)}
          </p>
          <p className="font-mono text-[9px] text-muted-foreground">
            {toyMode ? "pinch per zoom" : segment || "1.62 m apotema"}
          </p>
        </div>
      </div>
    </div>
  );
}

export function StudioCanvas() {
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 overflow-hidden bg-[#1c1a18]">
          <Canvas
            className="h-full w-full"
            shadows
            dpr={[1, 1.5]}
            gl={{
              antialias: true,
              preserveDrawingBuffer: true,
              alpha: false,
              powerPreference: "high-performance",
            }}
            camera={{ fov: 50, near: 0.08, far: 40, position: [0, 4.5, -0.4] }}
            onCreated={({ gl, camera }) => {
              gl.setClearColor("#1c1a18", 1);
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 0.72;
              gl.outputColorSpace = THREE.SRGBColorSpace;
              gl.domElement.style.touchAction = "none";
              const pose = CAMERA_PRESETS.top;
              camera.position.set(pose.position.x, pose.position.y, pose.position.z);
              camera.up.set(0, 1, 0);
              camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
              const persp = camera as THREE.PerspectiveCamera;
              persp.fov = pose.fov;
              persp.updateProjectionMatrix();
            }}
          >
            <Suspense fallback={null}>
              <ArtworkBinder />
              <Installation />
              <Monitors />
              <Character />
              <ArLayer />
              <Cinematic />
              <Director />
            </Suspense>
          </Canvas>
          <Viewfinder />
          <CameraFlash />
          <ExportHud />
        </div>
      </div>
      <ViewportDock />
    </div>
  );
}
