import * as THREE from "three";
import { buildBook, type BookParts } from "./buildBook";
import { PAGE_H, PAGE_W } from "./constants";
import { buildFire, type Fire } from "./fire";
import { BookRig, bookThickness, smooth } from "./rig";
import { bandTexture, fillerSpineTexture, haloTexture, hanjiLightTexture, timberTexture } from "./shelfTextures";
import { createBookTextures, type BookTextures } from "./textures";

/**
 * The library: a big built-in bookcase wall in dark timber, a fireplace set into it, rows of dim background books,
 * and our six books glowing among them so you know which to pick. The fire is the room's warm light; a cool
 * two-line lamp under the upper shelf is its counterpoint. Procedural throughout.
 * World units match the book model (a page is 1 wide); books are scaled down to sit on the shelf.
 */
export const SHELF = {
  bookH: 0.8,
  boardT: 0.055,
  depth: 0.66,
  /** y of the top surface of the boards. Our six stand on `row`, the mantel above the fireplace. */
  row: 0.42,
  upper: 1.38,
  hearth: -0.42,
  gap: 0.016,
  /** z of the front of the books (spines), a little behind the front edge of the boards. */
  front: -0.03,
  highlightOut: 0.07,
  fire: { width: 0.78, height: 0.72 },
};
export const BOOK_SCALE = SHELF.bookH / PAGE_H;
/** The room sits this far behind the reading stage, so the curtain that hides it can sit between them. */
export const SHELF_Z = -0.5;

export interface ShelfBookSpec {
  n: number;
  title: string;
  accent: string;
  /** Page count when unlocked: sets the thickness of the book. */
  pageCount: number;
  locked: boolean;
  /** Two lines for the paper band on a sealed book, e.g. ["8", "Oct"]. */
  band: [string, string] | null;
  /** The newest unlocked book: drawn a little proud of the rest, with the lamp on the board in front. */
  highlight: boolean;
}

export interface Slot {
  /** Model origin of the book when standing in its slot (left edge, mid-height, front). */
  x: number;
  y: number;
  z: number;
  /** World thickness of the book. */
  w: number;
}

export interface ShelfParts {
  group: THREE.Group;
  slots: Slot[];
  /** Hide one book (it is being read: the full model stands in for it) or restore it. */
  setHidden(i: number | null): void;
  /** Animate the fire and the glows. `dark` 0 = lit library, 1 = dimmed away (a book is down). */
  update(t: number, dt: number, dark: number): void;
  labelsReady: Promise<void>;
  dispose(): void;
}

function buildJar(): THREE.Mesh {
  // A moon jar: wide, round belly, narrow foot, short neck. Two hand-joined halves, so never quite symmetrical.
  const profile: [number, number][] = [
    [0.0, 0.0], [0.046, 0.0], [0.052, 0.008], [0.048, 0.016], [0.074, 0.03], [0.106, 0.07], [0.126, 0.125],
    [0.131, 0.178], [0.12, 0.236], [0.094, 0.286], [0.066, 0.318], [0.06, 0.336], [0.067, 0.35], [0.07, 0.357], [0.063, 0.359],
  ];
  const pts = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(72);
  const geo = new THREE.LatheGeometry(pts, 96);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const th = Math.atan2(z, x);
    // A hair of asymmetry: a slight oval, a faint seam bulge, a small lean.
    const k = 1 + 0.02 * Math.sin(2 * th + 0.8) + 0.012 * Math.sin(3 * th) * Math.min(1, y / 0.2);
    pos.setXYZ(i, x * k + y * 0.03, y * (1 + 0.012 * Math.sin(th)), z * k);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xf1e9d8, roughness: 0.34, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.28 });
  const jar = new THREE.Mesh(geo, mat);
  jar.castShadow = true;
  jar.receiveShadow = true;
  jar.scale.setScalar(1.05);
  return jar;
}

/** Rows of background books: muted, dim, varied. They make the wall feel full and make our six stand out by contrast. */
function buildFillers(skip: (x: number, row: "row" | "upper") => boolean): { mesh: THREE.InstancedMesh; dispose(): void } {
  const palette = ["#4a2a22", "#3a3226", "#2a3a34", "#34303c", "#5a4630", "#25282c", "#503a2c", "#3c2c24", "#6a5a46", "#2c3a40", "#46303a"];
  const rows: { top: number; key: "row" | "upper" }[] = [
    { top: SHELF.row, key: "row" },
    { top: SHELF.upper, key: "upper" },
  ];
  type Item = { x: number; w: number; h: number; d: number; top: number; lean: number; color: THREE.Color };
  const items: Item[] = [];
  let seed = 11;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (const row of rows) {
    let x = -2.0;
    while (x < 2.0) {
      const w = 0.034 + rnd() * 0.05;
      const h = 0.5 + rnd() * 0.26;
      if (!skip(x + w / 2, row.key)) {
        const c = new THREE.Color(palette[Math.floor(rnd() * palette.length)]!);
        c.multiplyScalar(0.45 + rnd() * 0.4);
        const lean = rnd() < 0.07 ? (rnd() - 0.5) * 0.18 : 0;
        items.push({ x: x + w / 2, w, h, d: 0.44 + rnd() * 0.04, top: row.top, lean, color: c });
      }
      x += w + 0.002 + (rnd() < 0.05 ? rnd() * 0.05 : 0);
    }
  }
  const tex = fillerSpineTexture();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  items.forEach((it, i) => {
    e.set(0, 0, it.lean);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(it.x, it.top + it.h / 2, SHELF.front - it.d / 2 - 0.02), q, new THREE.Vector3(it.w, it.h, it.d));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, it.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return {
    mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
      tex.dispose();
      mesh.dispose();
    },
  };
}

export function buildShelf(specs: ShelfBookSpec[]): ShelfParts {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => (disposables.push(x), x);

  /* ---- the bookcase wall ---- */
  const wallTex = track(timberTexture(true, 3, [13, 9, 6]));
  wallTex.repeat.set(3, 3);
  const wall = new THREE.Mesh(track(new THREE.PlaneGeometry(7, 8)), track(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 })));
  wall.position.set(0, 0.5, -SHELF.depth);
  wall.receiveShadow = true;
  group.add(wall);

  const boardTex = track(timberTexture(false, 8, [20, 13, 8]));
  boardTex.repeat.set(4, 1);
  const boardMat = track(new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.75 }));
  [SHELF.row, SHELF.upper, SHELF.upper + 0.96].forEach((top) => {
    const b = new THREE.Mesh(track(new THREE.BoxGeometry(7, SHELF.boardT, SHELF.depth)), boardMat);
    b.position.set(0, top - SHELF.boardT / 2, -SHELF.depth / 2);
    b.castShadow = true;
    b.receiveShadow = true;
    group.add(b);
  });

  /* ---- the fireplace, set into the wall under our shelf ---- */
  const fire: Fire = buildFire({ width: SHELF.fire.width, height: SHELF.fire.height, floorY: SHELF.hearth, z: -0.0 });
  group.add(fire.group);

  /* ---- the moon jar, on the upper shelf ---- */
  const jar = buildJar();
  track(jar.geometry);
  track(jar.material as THREE.Material);
  jar.position.set(0.3, SHELF.upper, -0.3);
  group.add(jar);

  /* ---- our six ---- */
  const s = BOOK_SCALE;
  const widths = specs.map((b) => bookThickness(b.pageCount) * s);
  const total = widths.reduce((a, w) => a + w, 0) + SHELF.gap * (specs.length - 1);
  let cursor = -total / 2;
  const slots: Slot[] = specs.map((b, i) => {
    const slot: Slot = { x: cursor, y: SHELF.row + SHELF.bookH / 2, z: SHELF.front + (b.highlight ? SHELF.highlightOut : 0), w: widths[i]! };
    cursor += widths[i]! + SHELF.gap;
    return slot;
  });

  // Background books everywhere else on the two rows (leaving room for ours and for the jar).
  const ourFrom = slots[0]!.x - 0.03;
  const ourTo = slots[slots.length - 1]!.x + slots[slots.length - 1]!.w + 0.03;
  const fillers = buildFillers((x, row) => (row === "row" ? x > ourFrom && x < ourTo : x > 0.1 && x < 0.52));
  group.add(fillers.mesh);

  const wraps: THREE.Group[] = [];
  const bands: (THREE.Mesh | null)[] = [];
  const halos: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; base: number }[] = [];
  const labelPromises: Promise<void>[] = [];
  const ownedTex: BookTextures[] = [];
  const parts: BookParts[] = [];
  const haloTex = track(haloTexture());

  specs.forEach((b, i) => {
    const slot = slots[i]!;
    const tex = createBookTextures({ pageCount: b.pageCount, coverTitle: b.title, mode: "ink", accent: b.accent, lite: true, thickness: bookThickness(b.pageCount) });
    ownedTex.push(tex);
    labelPromises.push(tex.drawLabels());
    const book = buildBook(tex, { n: b.pageCount, accent: b.accent, thickFor: b.pageCount, leaves: false, coverDetail: false, castShadow: true });
    book.shadowScale = 0;
    const rig = new BookRig(b.pageCount);
    rig.snap(-1);
    book.apply(rig, []);
    parts.push(book);

    const wrap = new THREE.Group();
    wrap.add(book.group);
    wrap.scale.setScalar(s);
    wrap.rotation.y = Math.PI / 2; // spine toward the room
    wrap.position.set(slot.x, slot.y, slot.z);
    group.add(wrap);
    wraps.push(wrap);

    // The glow that says "pick me": a soft halo on the wall behind the book, in its accent colour.
    const hmat = track(new THREE.MeshBasicMaterial({ map: haloTex, color: new THREE.Color(b.accent).multiplyScalar(1.5).lerp(new THREE.Color(1.0, 0.72, 0.4), 0.35), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 }));
    const halo = new THREE.Mesh(track(new THREE.PlaneGeometry(slot.w + 0.44, SHELF.bookH + 0.2)), hmat);
    halo.position.set(slot.x + slot.w / 2, slot.y + 0.02, -SHELF.depth + 0.045);
    group.add(halo);
    halos.push({ mesh: halo, mat: hmat, base: b.highlight ? 1.55 : b.locked ? 0.8 : 1.2 });

    // A sealed book wears a plain paper band with its date.
    if (b.locked && b.band) {
      const faceTex = track(bandTexture(b.band, b.accent));
      const paper = track(new THREE.MeshStandardMaterial({ color: 0xe8e1d0, roughness: 1 }));
      const face = track(new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.95, transparent: true }));
      const band = new THREE.Mesh(track(new THREE.BoxGeometry(slot.w + 0.01, 0.2, s * PAGE_W + 0.008)), [paper, paper, paper, paper, face, paper]);
      band.position.set(slot.x + slot.w / 2, slot.y + 0.07, slot.z - (s * PAGE_W) / 2 + 0.004);
      band.castShadow = true;
      group.add(band);
      bands.push(band);
    } else bands.push(null);

    // The two-line lamp marks where to begin: two thin lines on the board in front of the newest book.
    if (b.highlight) {
      const lampMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(b.accent).multiplyScalar(1.4).add(new THREE.Color(0.3, 0.3, 0.3)), toneMapped: false }));
      const g = track(new THREE.BoxGeometry(slot.w + 0.08, 0.003, 0.004));
      [0.05, 0.065].forEach((dz) => {
        const line = new THREE.Mesh(g, lampMat);
        line.position.set(slot.x + slot.w / 2, SHELF.row + 0.0016, slot.z + dz);
        group.add(line);
      });
    }
  });

  /* ---- shelf light: the cool two-line lamp under the upper board, above our books ---- */
  const lampMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.15, 1.1), toneMapped: false, transparent: true }));
  const lampGeo = track(new THREE.BoxGeometry(Math.max(0.9, total + 0.2), 0.004, 0.006));
  const under = SHELF.upper - SHELF.boardT - 0.004;
  [-0.045, -0.062].forEach((dz) => {
    const l = new THREE.Mesh(lampGeo, lampMat);
    l.position.set(0, under, dz);
    group.add(l);
  });
  void hanjiLightTexture;

  let hidden: number | null = null;
  const setHidden = (hide: number | null) => {
    hidden = hide;
    wraps.forEach((w, i) => (w.visible = i !== hide));
    bands.forEach((b, i) => b && (b.visible = i !== hide));
  };

  group.position.z = SHELF_Z;
  // Draw the whole room before the curtain, so the curtain can cover transparent parts of it too.
  group.traverse((o) => {
    o.renderOrder = -5;
  });

  return {
    group,
    // Slots are reported in world coordinates (the group above is shifted back).
    slots: slots.map((sl) => ({ ...sl, z: sl.z + SHELF_Z })),
    setHidden,
    update(t, dt, dark) {
      const lit = 1 - smooth(dark);
      fire.update(t, dt, lit);
      lampMat.opacity = lit;
      halos.forEach((h, i) => {
        // A slow breath, offset per book: enough to read as a glow, not a flash.
        const breath = 0.86 + 0.14 * Math.sin(t * 1.5 + i * 1.1);
        h.mat.opacity = i === hidden ? 0 : h.base * breath * lit;
      });
    },
    labelsReady: Promise.all(labelPromises).then(() => undefined),
    dispose() {
      fire.dispose();
      fillers.dispose();
      parts.forEach((p) => p.dispose());
      ownedTex.forEach((t) => t.dispose());
      disposables.forEach((d) => d.dispose());
    },
  };
}

/**
 * The library wall is a picture (see src/wall), so there is no 3D room to build: only where each of our six stands,
 * in the same world coordinates, so the real book can be lifted out of the exact place the picture shows it.
 * Nothing stands proud on the wall plate (the page draws the glow), so `highlight` is ignored here.
 */
export function wallShelf(specs: ShelfBookSpec[]): ShelfParts {
  const s = BOOK_SCALE;
  const widths = specs.map((b) => bookThickness(b.pageCount) * s);
  const total = widths.reduce((a, w) => a + w, 0) + SHELF.gap * (specs.length - 1);
  let cursor = -total / 2;
  const slots: Slot[] = specs.map((_, i) => {
    const slot: Slot = { x: cursor, y: SHELF.row + SHELF.bookH / 2, z: SHELF.front + SHELF_Z, w: widths[i]! };
    cursor += widths[i]! + SHELF.gap;
    return slot;
  });
  return { group: new THREE.Group(), slots, setHidden() {}, update() {}, labelsReady: Promise.resolve(), dispose() {} };
}
