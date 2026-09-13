import * as THREE from "three";

/**
 * Hair and dress, built as geometry instead of shipping a second model.
 *
 * The bundled VRoid base arrives with a bare "hair back" cap and a school-ish
 * top. On a black set the first reads as bald and the second reads as nothing
 * at all. Both are replaced here: an anime wig with real locks that catch the
 * neon, and an evening dress with an actual neckline — the body mesh under it
 * is a complete figure, so the neckline shows skin rather than a hole.
 *
 * Everything is measured off the skeleton it is attached to, so it fits any
 * VRM of roughly human proportions rather than one set of magic numbers.
 */

export interface WigOptions {
  /** Radius of the skull, model units. */
  head: number;
  /** Base colour of the hair. */
  color?: THREE.ColorRepresentation;
  /** Colour of the highlight locks. */
  shine?: THREE.ColorRepresentation;
}

function hairMaterial(color: THREE.ColorRepresentation, shine: THREE.ColorRepresentation) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.26,
    metalness: 0.05,
    sheen: 0.9,
    sheenColor: new THREE.Color(shine),
    sheenRoughness: 0.35,
    clearcoat: 0.7,
    clearcoatRoughness: 0.18,
    envMapIntensity: 0.35,
    side: THREE.DoubleSide,
  });
}

/**
 * One lock of hair: a flat, tapering ribbon that follows a curve and ends in a
 * point. Anime hair is not tubes of spaghetti — it is wide, thin, slightly
 * twisted blades, and the silhouette is the whole effect.
 */
function lock(
  material: THREE.Material,
  from: THREE.Vector3,
  bend: THREE.Vector3,
  to: THREE.Vector3,
  opts: { width: number; thickness?: number; taper?: number; twist?: number; segments?: number } = {
    width: 0.02,
  },
) {
  const width = opts.width;
  const thickness = opts.thickness ?? width * 0.34;
  const taper = opts.taper ?? 2.1;
  const twist = opts.twist ?? 0;
  const steps = opts.segments ?? 14;
  const ring = 7;

  const curve = new THREE.QuadraticBezierCurve3(from, bend, to);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const face = new THREE.Vector3();
  const point = new THREE.Vector3();
  const vertex = new THREE.Vector3();

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    curve.getPoint(t, point);
    curve.getTangent(t, tangent).normalize();
    side.crossVectors(up, tangent);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    side.normalize();
    face.crossVectors(tangent, side).normalize();

    // fat at the root, a point at the tip
    const shrink = Math.pow(1 - t, taper * 0.5) * 0.85 + 0.15 * (1 - t);
    const w = width * shrink;
    const th = thickness * shrink;
    const roll = twist * t;

    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * Math.PI * 2 + roll;
      const cx = Math.cos(a) * w;
      const cz = Math.sin(a) * th;
      vertex
        .copy(point)
        .addScaledVector(side, cx)
        .addScaledVector(face, cz);
      positions.push(vertex.x, vertex.y, vertex.z);
      vertex.set(0, 0, 0).addScaledVector(side, Math.cos(a)).addScaledVector(face, Math.sin(a)).normalize();
      normals.push(vertex.x, vertex.y, vertex.z);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j;
      const b = i * ring + ((j + 1) % ring);
      const c = (i + 1) * ring + j;
      const d = (i + 1) * ring + ((j + 1) % ring);
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  const mesh = new THREE.Mesh(geo, material);
  /**
   * Hair does not cast: a wig with shadows on turns the face into a black
   * hole every time a key light sits above her, which on this set it always
   * does.
   */
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // bone-parented geometry: let it draw wherever the skeleton takes it
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * The scalp: a dome whose lower edge is a hairline rather than a latitude.
 *
 * A plain sphere segment is a helmet — it comes down over the brow and the eyes
 * at the front exactly as far as it does at the nape, and the face disappears
 * behind it. Real hair starts high on the forehead and runs long down the back
 * of the neck, so the bottom edge is cut per azimuth: shallow towards +Z (the
 * face), deep behind.
 */
function scalp(radius: number) {
  const RINGS = 20;
  const RADIAL = 36;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const v = new THREE.Vector3();

  for (let i = 0; i <= RINGS; i++) {
    const u = i / RINGS;
    for (let j = 0; j <= RADIAL; j++) {
      const a = (j / RADIAL) * Math.PI * 2;
      // how much this meridian faces the front (+Z sits at a = 0)
      const front = Math.max(0, Math.cos(a));
      const limit = THREE.MathUtils.lerp(Math.PI * 0.66, Math.PI * 0.34, Math.pow(front, 0.75));
      const theta = u * limit;
      v.set(Math.sin(theta) * Math.sin(a), Math.cos(theta), Math.sin(theta) * Math.cos(a));
      normals.push(v.x, v.y, v.z);
      positions.push(v.x * radius, v.y * radius, v.z * radius);
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < RADIAL; j++) {
      const a = i * (RADIAL + 1) + j;
      const b = a + 1;
      const c = (i + 1) * (RADIAL + 1) + j;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return geo;
}

/**
 * A manga wig: shaped fringe over the forehead, long locks framing the face,
 * a heavy fall down the back, and one stubborn strand that will not lie down.
 */
export function mangaWig(opts: WigOptions) {
  const r = opts.head;
  const base = hairMaterial(opts.color ?? "#14121b", opts.shine ?? "#6d4a68");
  const gloss = hairMaterial(opts.shine ?? "#2b2036", "#8f6f96");

  const g = new THREE.Group();
  g.name = "mangaWig";
  /** The group is already placed at the measured centre of the skull. */
  const crown = new THREE.Group();
  crown.position.y = 0;
  g.add(crown);

  // the mass: a cap with a real hairline — high over the face, long at the nape
  const cap = new THREE.Mesh(scalp(r * 0.99), base);
  cap.scale.set(1.02, 1.03, 1.03);
  cap.position.set(0, r * 0.03, -r * 0.04);
  cap.castShadow = false;
  cap.receiveShadow = false;
  cap.frustumCulled = false;
  crown.add(cap);

  const V = (x: number, y: number, z: number) => new THREE.Vector3(x * r, y * r, z * r);


  /**
   * Manga hair is a few big shapes, not many small ones: wide blades that
   * overlap into one mass and only come to a point at the very tip.
   */
  /**
   * The fall down the back lives in its own group so the rig can let it hang:
   * hair obeys gravity, not the angle of the skull it grows from. Without that
   * it sticks out sideways like a wing every time she looks down.
   */
  /**
   * It pivots at the NAPE, where the hair actually leaves the head — not at
   * the centre of the skull.
   *
   * This is what the lump at the back of the head was. Swinging the whole mass
   * about the skull's centre lifts its roots off the neck every time she looks
   * down at the glass, and fourteen wide ribbons all lift at once and pile up
   * into a hump. Hanging it from the nape, where hair actually grows, the
   * roots stay put and only the length moves.
   */
  const pivot = new THREE.Vector3(0, -0.3 * r, -0.5 * r);
  const fall = new THREE.Group();
  fall.name = "hairFall";
  fall.position.copy(pivot);
  crown.add(fall);
  const strands = new THREE.Group();
  strands.position.copy(pivot).negate();
  fall.add(strands);

  /**
   * The fringe stops at the brow: hair frames a face, it does not hide it.
   * The skull centre is the origin here, so the brow sits at about y = 0 and
   * the eyes at about y = -0.2r — the tips must land above that, never on it.
   */
  const fringe = [-0.95, -0.62, -0.3, 0.02, 0.34, 0.66, 0.98];
  fringe.forEach((u, i) => {
    const outer = Math.abs(u);
    const long = 0.4 + (i % 2) * 0.06 + outer * 0.16;
    crown.add(
      lock(
        i === 2 ? gloss : base,
        V(u * 0.5, 0.6, 0.26),
        V(u * 0.74, 0.46, 0.8),
        V(u * (0.82 + outer * 0.3), 0.6 - long, 0.68 + outer * 0.06),
        { width: r * (0.4 - outer * 0.07), thickness: r * 0.11, taper: 1.15, twist: (Math.sign(u) || 1) * 0.08 },
      ),
    );
  });

  // long locks framing the face, down to the collarbone
  for (const side of [-1, 1]) {
    strands.add(
      lock(
        base,
        V(side * 0.95, 0.5, -0.06),
        V(side * 1.12, -0.9, 0.02),
        V(side * 1.0, -2.5, -0.14),
        { width: r * 0.5, thickness: r * 0.15, taper: 1.2, twist: side * 0.12 },
      ),
    );
    strands.add(
      lock(
        side > 0 ? gloss : base,
        V(side * 0.7, 0.62, -0.22),
        V(side * 1.05, -0.9, -0.1),
        V(side * 0.78, -2.1, -0.42),
        { width: r * 0.4, thickness: r * 0.12, taper: 1.2, twist: -side * 0.1 },
      ),
    );
    // thin temple braid that falls in front of the shoulder
    strands.add(
      lock(
        gloss,
        V(side * 0.55, 0.35, 0.28),
        V(side * 0.62, -0.6, 0.22),
        V(side * 0.48, -2.2, 0.08),
        { width: r * 0.12, thickness: r * 0.06, taper: 1.4, twist: side * 0.35, segments: 16 },
      ),
    );
  }

  const backRows = [
    { y: 0.5, z: -0.5, len: 2.3, width: 0.54, count: 5 },
    { y: 0.2, z: -0.78, len: 2.9, width: 0.5, count: 5 },
    { y: -0.15, z: -0.84, len: 3.4, width: 0.44, count: 4 },
  ];
  backRows.forEach((row, ri) => {
    for (let i = 0; i < row.count; i++) {
      const u = row.count === 1 ? 0 : (i / (row.count - 1)) * 2 - 1;
      const flare = 1 + Math.abs(u) * 0.3;
      strands.add(
        lock(
          (i + ri) % 4 === 1 ? gloss : base,
          V(u * 0.72, row.y, row.z * 0.6),
          V(u * 0.95, row.y - row.len * 0.5, row.z * 1.1),
          V(u * 1.05 * flare, row.y - row.len, row.z * 0.85 - 0.1 * flare),
          { width: r * row.width, thickness: r * 0.14, taper: 1.25, twist: (u || 1) * 0.08, segments: 18 },
        ),
      );
    }
  });

  // the one strand that refuses to behave
  crown.add(
    lock(
      base,
      V(-0.05, 0.86, 0.05),
      V(0.3, 1.45, 0.3),
      V(0.78, 1.3, 0.62),
      { width: r * 0.14, thickness: r * 0.05, taper: 2.2, twist: 0.8 },
    ),
  );

  return g;
}

/**
 * A skin of revolution around the body: rings of (height, radiusX, radiusZ)
 * from hem to neckline, with an optional dip carved out of the top edge at the
 * front. It is how both the bodice and the skirt are made.
 */
function sleeve(
  material: THREE.Material,
  opts: {
    profile: [number, number, number][];
    neck?: number;
    neckWidth?: number;
    segments?: number;
    /**
     * Cross-section exponent. 2 is a plain ellipse, which passes INSIDE a
     * female torso at the diagonals — the bust pokes through the cloth at
     * roughly 45 degrees. Above 2 the section is a rounded rectangle that
     * stays outside the body all the way round.
     */
    fullness?: number;
  },
) {
  const radial = opts.segments ?? 48;
  const fullness = opts.fullness ?? 2;
  const rows = opts.profile.length;
  const neck = opts.neck ?? 0;
  const neckWidth = opts.neckWidth ?? 1.0;

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const v = new THREE.Vector3();

  for (let i = 0; i < rows; i++) {
    const [y, rx, rz] = opts.profile[i]!;
    const top = i === rows - 1;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      /**
       * The character faces +Z, and this ring puts +Z at a = 0 — so the front
       * of the body is cos(a). (Measuring it from the side instead cuts the
       * neckline away over each breast and leaves a panel up the middle.)
       */
      const front = Math.max(0, Math.cos(a));
      const cut = top ? neck * Math.pow(front, 1 / Math.max(0.2, neckWidth)) : 0;
      const sa = Math.sin(a);
      const ca = Math.cos(a);
      const fill =
        fullness === 2
          ? 1
          : Math.pow(Math.pow(Math.abs(sa), fullness) + Math.pow(Math.abs(ca), fullness), -1 / fullness);
      v.set(sa * rx * fill, y - cut, ca * rz * fill);
      positions.push(v.x, v.y, v.z);
      v.set(sa / Math.max(1e-4, rx), 0.25, ca / Math.max(1e-4, rz)).normalize();
      normals.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + 1;
      const c = (i + 1) * (radial + 1) + j;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

export interface DressPiece {
  /** Rings bottom-to-top, in the local space of the bone it hangs from. */
  rings: [number, number, number][];
  /** How far the top edge dips at the front, for a neckline. */
  neck?: number;
  /** How wide that dip opens around the front. */
  neckWidth?: number;
  color?: THREE.ColorRepresentation;
  sheen?: THREE.ColorRepresentation;
  /** Half-width of the torso, for sizing the straps. */
  halfWidth?: number;
  /** Straps over the shoulders — front and back anchor heights. */
  straps?: { front: [number, number, number]; over: [number, number, number]; back: [number, number, number] };
}

function satin(color: THREE.ColorRepresentation, sheen: THREE.ColorRepresentation) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.32,
    metalness: 0.08,
    sheen: 1,
    sheenColor: new THREE.Color(sheen),
    sheenRoughness: 0.28,
    clearcoat: 0.4,
    clearcoatRoughness: 0.35,
    envMapIntensity: 0.3,
    side: THREE.DoubleSide,
  });
}

/** The bodice — plunging front, thin straps, fitted to the ribs. */
export function dressBodice(opts: DressPiece) {
  const mat = satin(opts.color ?? "#0d0d12", opts.sheen ?? "#e83a7a");
  const g = new THREE.Group();
  g.name = "dressBodice";
  g.add(
    sleeve(mat, {
      profile: opts.rings,
      neck: opts.neck ?? 0,
      neckWidth: opts.neckWidth ?? 0.55,
      fullness: 3,
    }),
  );
  const s = opts.straps;
  const w = opts.halfWidth ?? 0.09;
  if (s) {
    for (const side of [-1, 1]) {
      g.add(
        lock(
          mat,
          new THREE.Vector3(side * s.front[0], s.front[1], s.front[2]),
          new THREE.Vector3(side * s.over[0], s.over[1], s.over[2]),
          new THREE.Vector3(side * s.back[0], s.back[1], s.back[2]),
          { width: w * 0.1, thickness: w * 0.03, taper: 0.35, segments: 14 },
        ),
      );
    }
  }
  return g;
}

/** The skirt — hangs plumb from the hips, long, a little swing at the hem. */
export function dressSkirt(opts: DressPiece) {
  const mat = satin(opts.color ?? "#0d0d12", opts.sheen ?? "#e83a7a");
  const g = new THREE.Group();
  g.name = "dressSkirt";
  g.add(sleeve(mat, { profile: opts.rings, segments: 44, fullness: 2.5 }));
  return g;
}

/** Wide black belt at the waist, drops over the seat so the rear is covered. */
export function dressBelt(opts: DressPiece) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: opts.color ?? "#000000",
    roughness: 0.92,
    metalness: 0,
    sheen: 0,
    clearcoat: 0,
    envMapIntensity: 0,
    emissive: new THREE.Color("#000000"),
    side: THREE.DoubleSide,
  });
  const g = new THREE.Group();
  g.name = "dressBelt";
  g.add(sleeve(mat, { profile: opts.rings, segments: 40, fullness: 3 }));
  return g;
}
