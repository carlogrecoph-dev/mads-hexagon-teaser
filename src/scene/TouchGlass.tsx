import { worldToGlassUv } from "@/engine/hands";
import { clamp, lerp } from "@/engine/math";
import { runtime } from "./runtime";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function stamp(
  ctx: CanvasRenderingContext2D,
  u: number,
  v: number,
  radius: number,
  alpha: number,
  r: number,
  g: number,
  b: number,
) {
  if (u < -0.04 || u > 1.04 || v < -0.04 || v > 1.04 || alpha < 0.004) return;
  const x = u * ctx.canvas.width;
  const y = v * ctx.canvas.height;
  const rx = radius * ctx.canvas.width;
  const ry = radius * ctx.canvas.height * 1.15;
  const grd = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  const a0 = alpha;
  grd.addColorStop(0, `rgba(${r},${g},${b},${a0.toFixed(3)})`);
  grd.addColorStop(0.35, `rgba(${r},${g},${b},${(a0 * 0.35).toFixed(3)})`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function TouchGlass({ width, height }: { width: number; height: number }) {
  const canvas = useMemo(() => {
    if (typeof document === "undefined") return null as HTMLCanvasElement | null;
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 288;
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
  const last = useRef({ lu: 0.5, lv: 0.5, ru: 0.5, rv: 0.5, armed: false });

  useFrame((_, dt) => {
    if (!canvas || !texture) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const fade = 1 - Math.exp(-3.8 * clamp(dt, 1 / 120, 0.05));
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(0,0,0,${fade.toFixed(3)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const s = runtime.lastState;
    if (!s) {
      texture.needsUpdate = true;
      return;
    }
    const glance = s.interaction.glance ?? 0;
    const press = clamp(1 - glance * 1.15, 0, 1) * 0.55;
    if (press < 0.04) {
      texture.needsUpdate = true;
      return;
    }
    const c = runtime.avgColor;
    const r = Math.round(lerp(210, 255 * c.r, 0.55));
    const g = Math.round(lerp(200, 255 * c.g, 0.55));
    const b = Math.round(lerp(210, 255 * c.b, 0.55));
    const spread = clamp(s.interaction.spread, 0, 1);
    const L = worldToGlassUv(s.hands.left.x, s.hands.left.z);
    const R = worldToGlassUv(s.hands.right.x, s.hands.right.z);
    const prev = last.current;
    ctx.globalCompositeOperation = "lighter";

    const drawPath = (u0: number, v0: number, u1: number, v1: number, rad: number, a: number) => {
      const dist = Math.hypot(u1 - u0, v1 - v0);
      const n = prev.armed ? Math.min(7, 1 + Math.floor(dist * 28)) : 1;
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / n;
        stamp(ctx, lerp(u0, u1, t), lerp(v0, v1, t), rad * (0.7 + 0.3 * t), a * (0.35 + 0.65 * t), r, g, b);
      }
    };

    const palmR = lerp(0.055, 0.09, spread);
    const fingerR = lerp(0.022, 0.036, spread);
    const palmA = 0.1 * press * lerp(1.15, 0.75, spread);
    const trailA = 0.045 * press;

    if (prev.armed) {
      drawPath(prev.lu, prev.lv, L.u, L.v, fingerR, trailA);
      drawPath(prev.ru, prev.rv, R.u, R.v, fingerR, trailA);
    }
    stamp(ctx, L.u, L.v, palmR, palmA, r, g, b);
    stamp(ctx, R.u, R.v, palmR, palmA, r, g, b);

    const dx = R.u - L.u;
    const dy = R.v - L.v;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const fOff = lerp(0.018, 0.034, spread);
    stamp(ctx, L.u + px * fOff, L.v + py * fOff, fingerR, palmA * 0.55, r, g, b);
    stamp(ctx, R.u + px * fOff, R.v + py * fOff, fingerR, palmA * 0.55, r, g, b);
    if (spread > 0.45) {
      stamp(ctx, L.u - px * fOff * 0.7, L.v - py * fOff * 0.7, fingerR * 0.85, palmA * 0.35, r, g, b);
      stamp(ctx, R.u - px * fOff * 0.7, R.v - py * fOff * 0.7, fingerR * 0.85, palmA * 0.35, r, g, b);
    }

    prev.lu = L.u;
    prev.lv = L.v;
    prev.ru = R.u;
    prev.rv = R.v;
    prev.armed = true;
    texture.needsUpdate = true;
  });

  if (!texture) return null;
  return (
    <mesh position={[0, 0, 0.0014]} renderOrder={3}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
        opacity={0.85}
      />
    </mesh>
  );
}