import { HEX, monitorAngle } from "@/engine/config";
import { drawMadsLogo } from "@/engine/logo";
import { computeBlit } from "@/engine/math";
import { runtime } from "./runtime";
import { TouchGlass } from "./TouchGlass";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const BEZEL = "#14141a";
const BEZEL_EDGE = "#2a2a32";

function useSharedScreenTexture() {
  const canvas = useMemo(() => {
    if (typeof document === "undefined") return null as HTMLCanvasElement | null;
    const c = document.createElement("canvas");
    c.width = 1280;
    c.height = 720;
    return c;
  }, []);
  const texture = useMemo(() => {
    if (!canvas) return null;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  }, [canvas]);

  const lastKey = useRef("");
  const artTint = useRef("");
  const redraw = () => {
    if (!canvas || !texture) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#08080a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = runtime.artworkImage;
    const vp = runtime.lastState?.viewport ?? { cx: 0.5, cy: 0.5, zoom: 1 };
    if (img) {
      const w = runtime.artworkSize.w;
      const h = runtime.artworkSize.h;
      const blit = computeBlit(w, h, canvas.width, canvas.height, vp);
      try {
        ctx.drawImage(img, blit.sx, blit.sy, blit.sw, blit.sh, blit.dx, blit.dy, blit.dw, blit.dh);
      } catch {
        /* source rect edge cases */
      }
      const tintKey = `${w}x${h}:${img instanceof HTMLImageElement ? img.src : "bmp"}`;
      if (artTint.current !== tintKey) {
        artTint.current = tintKey;
        const s = document.createElement("canvas");
        s.width = 24;
        s.height = 24;
        const sctx = s.getContext("2d");
        if (sctx) {
          try {
            sctx.drawImage(img as CanvasImageSource, 0, 0, 24, 24);
            const data = sctx.getImageData(0, 0, 24, 24).data;
            let r = 0,
              g = 0,
              b = 0,
              n = 0;
            for (let i = 0; i < data.length; i += 4) {
              r += data[i] ?? 0;
              g += data[i + 1] ?? 0;
              b += data[i + 2] ?? 0;
              n++;
            }
            if (n) {
              runtime.avgColor = {
                r: Math.max(0.08, Math.min(0.85, r / n / 255)),
                g: Math.max(0.06, Math.min(0.85, g / n / 255)),
                b: Math.max(0.05, Math.min(0.85, b / n / 255)),
              };
            }
          } catch {
            /* tainted */
          }
        }
      }
    } else {
      drawMadsLogo(ctx, canvas.width, canvas.height);
      artTint.current = "";
      runtime.avgColor = { r: 0.55, g: 0.22, b: 0.36 };
    }
    texture.needsUpdate = true;
    lastKey.current = `${vp.cx.toFixed(3)}:${vp.cy.toFixed(3)}:${vp.zoom.toFixed(3)}:${img ? 1 : 0}`;
  };

  useLayoutEffect(() => {
    runtime.redrawArtwork = redraw;
    redraw();
    return () => {
      if (runtime.redrawArtwork === redraw) runtime.redrawArtwork = () => {};
    };
  });

  useFrame(() => {
    const vp = runtime.lastState?.viewport;
    const img = runtime.artworkImage ? 1 : 0;
    const key = vp
      ? `${vp.cx.toFixed(3)}:${vp.cy.toFixed(3)}:${vp.zoom.toFixed(3)}:${img}`
      : `idle:${img}`;
    if (key !== lastKey.current) redraw();
  });

  return texture;
}

function MonitorBezel({
  width,
  height,
  depth,
}: {
  width: number;
  height: number;
  depth: number;
}) {
  const bw = width + HEX.bezel * 2;
  const bh = height + HEX.bezel * 2;
  return (
    <group>
      <mesh position={[0, 0, -depth / 2]} castShadow>
        <boxGeometry args={[bw, bh, depth]} />
        <meshStandardMaterial color={BEZEL} metalness={0.12} roughness={0.72} envMapIntensity={0.08} />
      </mesh>
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[bw + 0.004, bh + 0.004]} />
        <meshBasicMaterial color={BEZEL_EDGE} />
      </mesh>
    </group>
  );
}

function ScreenPanel({
  width,
  height,
  texture,
}: {
  width: number;
  height: number;
  texture: THREE.Texture;
}) {
  const mat = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      map: texture,
      toneMapped: false,
    });
  }, [texture]);
  return (
    <mesh position={[0, 0, 0.004]} material={mat}>
      <planeGeometry args={[width, height]} />
    </mesh>
  );
}

function Ambilight({ width, height }: { width: number; height: number }) {
  const mats = useRef<THREE.MeshStandardMaterial[]>([]);
  useFrame(() => {
    const c = runtime.avgColor;
    for (const m of mats.current) {
      m.emissive.setRGB(c.r * 0.5, c.g * 0.5, c.b * 0.5);
    }
  });
  const t = 0.0055;
  const d = 0.004;
  const bw = width + HEX.bezel * 2 + 0.003;
  const bh = height + HEX.bezel * 2 + 0.003;
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#151518",
        emissive: "#333",
        emissiveIntensity: 0.4,
        toneMapped: false,
        roughness: 0.45,
      }),
    [],
  );
  useLayoutEffect(() => {
    mats.current = [mat];
  }, [mat]);
  return (
    <group position={[0, 0, 0.01]}>
      <mesh position={[0, bh / 2, 0]} material={mat}>
        <boxGeometry args={[bw, t, d]} />
      </mesh>
      <mesh position={[0, -bh / 2, 0]} material={mat}>
        <boxGeometry args={[bw, t, d]} />
      </mesh>
      <mesh position={[-bw / 2, 0, 0]} material={mat}>
        <boxGeometry args={[t, bh, d]} />
      </mesh>
      <mesh position={[bw / 2, 0, 0]} material={mat}>
        <boxGeometry args={[t, bh, d]} />
      </mesh>
    </group>
  );
}

function LedWallFace({
  width,
  height,
  texture,
  z,
  yaw,
}: {
  width: number;
  height: number;
  texture: THREE.Texture;
  z: number;
  yaw: number;
}) {
  const mat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture } },
      transparent: true,
      depthWrite: true,
      side: THREE.FrontSide,
      toneMapped: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(map, vUv);
          float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
          float a = mix(0.12, 0.92, smoothstep(0.02, 0.42, lum));
          float gx = abs(fract(vUv.x * 168.0) - 0.5);
          float gy = abs(fract(vUv.y * 94.0) - 0.5);
          float mesh = 1.0 - smoothstep(0.44, 0.5, max(gx, gy)) * 0.22;
          gl_FragColor = vec4(c.rgb * 1.12 * mesh, a);
        }
      `,
    });
    return m;
  }, [texture]);
  return (
    <mesh position={[0, 0, z]} rotation={[0, yaw, 0]} material={mat}>
      <planeGeometry args={[width, height]} />
    </mesh>
  );
}

function SlimLedFrame({ width, height }: { width: number; height: number }) {
  const t = 0.016;
  const d = 0.032;
  const bw = width + t * 2;
  const bh = height + t * 2;
  const bar = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#12151c", metalness: 0.78, roughness: 0.32, envMapIntensity: 0.9 }),
    [],
  );
  return (
    <group>
      <mesh position={[0, bh / 2, 0]} material={bar}>
        <boxGeometry args={[bw, t, d]} />
      </mesh>
      <mesh position={[0, -bh / 2, 0]} material={bar}>
        <boxGeometry args={[bw, t, d]} />
      </mesh>
      <mesh position={[-bw / 2, 0, 0]} material={bar}>
        <boxGeometry args={[t, bh, d]} />
      </mesh>
      <mesh position={[bw / 2, 0, 0]} material={bar}>
        <boxGeometry args={[t, bh, d]} />
      </mesh>
    </group>
  );
}

function LedGlass({ width, height }: { width: number; height: number }) {
  return (
    <mesh>
      <boxGeometry args={[width * 0.998, height * 0.998, 0.014]} />
      <meshPhysicalMaterial
        color="#9aa8b4"
        metalness={0.05}
        roughness={0.06}
        transmission={0.78}
        thickness={0.02}
        transparent
        opacity={0.28}
        envMapIntensity={1.4}
        ior={1.45}
      />
    </mesh>
  );
}

function OuterMonitor({
  index,
  texture,
}: {
  index: number;
  texture: THREE.Texture;
}) {
  const angle = monitorAngle(index);
  const x = Math.sin(angle) * HEX.radius;
  const z = Math.cos(angle) * HEX.radius;
  const rotY = angle + Math.PI;
  const { width, height } = HEX.screen75;
  return (
    <group position={[x, HEX.outerCenterY, z]} rotation={[0, rotY, 0]}>
      <group rotation={[HEX.inwardTilt, 0, 0]}>
        <LedGlass width={width} height={height} />
        <LedWallFace width={width} height={height} texture={texture} z={0.008} yaw={0} />
        <LedWallFace width={width} height={height} texture={texture} z={-0.008} yaw={Math.PI} />
        <SlimLedFrame width={width} height={height} />
        <Ambilight width={width} height={height} />
      </group>
    </group>
  );
}

function TableMonitor({ texture }: { texture: THREE.Texture }) {
  const { width, height, depth } = HEX.screen55;
  return (
    <group position={[0, HEX.tableHeight, HEX.tableZ]} rotation={[-HEX.tableTilt, 0, 0]}>
      <group rotation={[-Math.PI / 2, 0, Math.PI]}>
        <MonitorBezel width={width} height={height} depth={depth} />
        <ScreenPanel width={width} height={height} texture={texture} />
        <TouchGlass width={width} height={height} />
        <Ambilight width={width} height={height} />
      </group>
      <mesh position={[0, -HEX.tableHeight / 2 + 0.02, 0.04]}>
        <boxGeometry args={[0.42, HEX.tableHeight - 0.08, 0.3]} />
        <meshStandardMaterial color="#1a1a20" metalness={0.4} roughness={0.48} />
      </mesh>
    </group>
  );
}

export function Monitors() {
  const texture = useSharedScreenTexture();
  if (!texture) return null;
  return (
    <group>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <OuterMonitor key={i} index={i} texture={texture} />
      ))}
      <TableMonitor texture={texture} />
    </group>
  );
}
