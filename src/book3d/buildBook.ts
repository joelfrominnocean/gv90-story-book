import * as THREE from "three";
import { PAGE_H, PAGE_W, SEGMENTS, TH_COVER } from "./constants";
import { Stack, curlFor, leafProfile, smooth, type BookRig } from "./rig";
import { HOLE_RATIOS, HOLE_X, SLIP, spineSlipSize, type BookTextures } from "./textures";

export interface BookParts {
  group: THREE.Group;
  stack: Stack;
  /** 0..1: how strongly the contact shadow under the book shows (it fades when the book is on a shelf). */
  shadowScale: number;
  /** Pose every part from the rig's current state. `content[c]` (0..1) fades page c's print on its leaf. */
  apply(rig: BookRig, content: number[]): void;
  /** 0..1: how much of the spine is still the picture of it (see BuildOptions.spineCrop). 0 when there is none. */
  setSpineCrop(opacity: number): void;
  dispose(): void;
}

export interface BuildOptions {
  n: number;
  accent: string;
  /** Page count this book has when unlocked: sets its thickness, so shelf and reading model match. */
  thickFor: number;
  /** False builds the closed book only (for the shelf). */
  leaves?: boolean;
  /** False skips what you only see from the cover side (cover label, lamp lines). */
  coverDetail?: boolean;
  castShadow?: boolean;
  /** A crop of the library picture at this book's spine. It covers the spine, unlit, until `setSpineCrop` fades it out. */
  spineCrop?: THREE.Texture | null;
}

const std = (map: THREE.Texture, side: THREE.Side = THREE.FrontSide) =>
  new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, side });

/**
 * A leaf is a two-sided strip hinged at the spine. Front and back are separate meshes that share one
 * position buffer (the back has its own UVs, flipped, so the verso reads the right way round once turned).
 */
function makeLeaf(front: THREE.Material, overlay: THREE.Material, back: THREE.Material) {
  const cols = SEGMENTS + 1;
  const pos = new THREE.BufferAttribute(new Float32Array(cols * 2 * 3), 3);
  const normal = new THREE.BufferAttribute(new Float32Array(cols * 2 * 3), 3);
  const uvF = new Float32Array(cols * 2 * 2);
  const uvB = new Float32Array(cols * 2 * 2);
  const index: number[] = [];
  for (let i = 0; i < cols; i++) {
    const u = i / SEGMENTS;
    // Vertex 2i = top edge, 2i+1 = bottom edge.
    uvF.set([u, 1, u, 0], i * 4);
    uvB.set([1 - u, 1, 1 - u, 0], i * 4);
    if (i < SEGMENTS) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const gf = new THREE.BufferGeometry();
  gf.setAttribute("position", pos);
  gf.setAttribute("normal", normal);
  gf.setAttribute("uv", new THREE.BufferAttribute(uvF, 2));
  gf.setIndex(index);
  const gb = new THREE.BufferGeometry();
  gb.setAttribute("position", pos);
  gb.setAttribute("normal", normal);
  gb.setAttribute("uv", new THREE.BufferAttribute(uvB, 2));
  gb.setIndex(index);
  const f = new THREE.Mesh(gf, front);
  // The printed page sits over the blank one and fades, so the live HTML page can take its place without doubling up.
  const o = new THREE.Mesh(gf, overlay);
  const b = new THREE.Mesh(gb, back);
  f.frustumCulled = o.frustumCulled = b.frustumCulled = false;
  const xs = new Float32Array(cols);
  const zs = new Float32Array(cols);
  return { f, o, b, gf, gb, pos, xs, zs };
}

/**
 * The book in its own coordinates: the right page is x in [0, PAGE_W], the spine runs along Y at x = 0, and
 * pages stack in +Z. The same model is the book on the shelf and the book you read.
 */
export function buildBook(tex: BookTextures, opts: BuildOptions): BookParts {
  const { n, accent, thickFor, leaves: withLeaves = true, coverDetail = true, castShadow = false, spineCrop = null } = opts;
  const stack = new Stack(n, thickFor);
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => (disposables.push(x), x);
  const solid = (m: THREE.Mesh): THREE.Mesh => {
    m.castShadow = castShadow;
    return m;
  };

  // Soft contact shadow; it widens as the book opens.
  const shadowMat = track(new THREE.MeshBasicMaterial({ map: tex.shadow, transparent: true, depthWrite: false, opacity: 0.9 }));
  const shadow = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 1)), shadowMat);
  shadow.position.z = 0.0005;
  group.add(shadow);

  // Back board, under the right stack.
  const edgeInk = track(new THREE.MeshStandardMaterial({ color: 0x14120f, roughness: 1 }));
  const boardGeo = track(new THREE.BoxGeometry(PAGE_W, PAGE_H, TH_COVER));
  const board = solid(new THREE.Mesh(boardGeo, [edgeInk, edgeInk, edgeInk, edgeInk, track(std(tex.insideCover)), edgeInk]));
  board.position.set(PAGE_W / 2, 0, TH_COVER / 2);
  group.add(board);

  // Stacked fore-edges. Folded leaves show as fine layered lines on the edge of each block.
  const makeBlock = (cx: number) => {
    const edgeTex = tex.edge.clone();
    edgeTex.wrapS = edgeTex.wrapT = THREE.RepeatWrapping;
    edgeTex.needsUpdate = true;
    const side = track(new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 1 }));
    const top = track(std(tex.paperPlain));
    const geo = track(new THREE.BoxGeometry(1, 1, 1));
    geo.translate(0, 0, 0.5);
    const mesh = solid(new THREE.Mesh(geo, [side, side, side, side, top, top]));
    mesh.position.set(cx, 0, TH_COVER);
    mesh.scale.set(PAGE_W, PAGE_H, 0.001);
    group.add(mesh);
    track(edgeTex);
    return { mesh, edgeTex, lastCount: -1 };
  };
  const right = makeBlock(PAGE_W / 2);
  const left = makeBlock(-PAGE_W / 2);

  // Page leaves. Leaf k holds page k-1.
  const leaves = withLeaves
    ? Array.from({ length: n }, (_, c) => {
        const front = track(std(tex.blank));
        const overlay = track(
          new THREE.MeshStandardMaterial({
            map: tex.pages[c]!,
            roughness: 0.95,
            metalness: 0,
            transparent: true,
            depthWrite: false,
          }),
        );
        const back = track(std(tex.verso, THREE.BackSide));
        const leaf = makeLeaf(front, overlay, back);
        // The print floats a hair above the blank page. (A polygon offset would do this too, but it pulls edge-on
        // leaves forward through the spine cloth.)
        leaf.o.position.z = 0.0006;
        track(leaf.gf);
        track(leaf.gb);
        group.add(leaf.f, leaf.o, leaf.b);
        return leaf;
      })
    : [];

  // Cover: a stiff wrapper board hinged at the spine.
  const pivot = new THREE.Group();
  const coverGeo = track(new THREE.BoxGeometry(PAGE_W, PAGE_H, TH_COVER));
  coverGeo.translate(PAGE_W / 2, 0, 0);
  const cover = solid(new THREE.Mesh(coverGeo, [edgeInk, edgeInk, edgeInk, edgeInk, track(std(tex.cover)), track(std(tex.insideCover))]));
  pivot.add(cover);
  const zTop = TH_COVER / 2;

  let glowMat: THREE.MeshBasicMaterial | null = null;
  if (coverDetail) {
    // Title slip, glued near the spine as on the reference.
    const slip = new THREE.Mesh(track(new THREE.PlaneGeometry(SLIP.w, SLIP.h)), track(std(tex.slip)));
    slip.position.set(0.2 * PAGE_W, 0.02 * PAGE_H, zTop + 0.0009);
    pivot.add(slip);

    // The two-line lamp, tinted with the chapter's accent: two emissive lines with a soft glow.
    const lampColor = new THREE.Color(accent).multiplyScalar(1.5).add(new THREE.Color(0.35, 0.35, 0.35));
    const lampMat = track(new THREE.MeshBasicMaterial({ map: tex.lamp, transparent: true, color: lampColor, toneMapped: false, depthWrite: false }));
    glowMat = track(
      new THREE.MeshBasicMaterial({ map: tex.glow, transparent: true, color: new THREE.Color(accent), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    const lampGeo = track(new THREE.PlaneGeometry(0.4 * PAGE_W, 0.0042));
    const lampX = 0.6 * PAGE_W;
    const lampY = -0.27 * PAGE_H;
    [0.0055, -0.0055].forEach((dy) => {
      const line = new THREE.Mesh(lampGeo, lampMat);
      line.position.set(lampX, lampY + dy, zTop + 0.0012);
      pivot.add(line);
    });
    const glow = new THREE.Mesh(track(new THREE.PlaneGeometry(0.62 * PAGE_W, 0.085)), glowMat);
    glow.position.set(lampX, lampY, zTop + 0.0011);
    pivot.add(glow);
  }

  // Five-hole stitching: the thread runs from each hole over the spine edge, as on a stab-bound book.
  const threadMat = track(new THREE.MeshStandardMaterial({ color: 0xcfc9b8, roughness: 0.9 }));
  const total = stack.total;
  for (const ratio of HOLE_RATIOS) {
    const y = (0.5 - ratio) * PAGE_H;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(HOLE_X * PAGE_W, y, zTop - 0.001),
      new THREE.Vector3(HOLE_X * PAGE_W, y, zTop + 0.0035),
      new THREE.Vector3(0.022, y, zTop + 0.0045),
      new THREE.Vector3(-0.002, y, zTop + 0.0018),
      new THREE.Vector3(-0.0075, y, zTop - 0.006),
      new THREE.Vector3(-0.0075, y, -zTop - total + TH_COVER + 0.004),
    ]);
    pivot.add(new THREE.Mesh(track(new THREE.TubeGeometry(curve, 24, 0.0042, 6)), threadMat));
  }
  group.add(pivot);

  // The wrapper folds round the spine: dark cloth, with the stitching showing over it. One-sided, so from the
  // open side (reading) it is invisible and only the shelf sees it.
  const cloth = new THREE.Mesh(
    track(new THREE.PlaneGeometry(total, PAGE_H)),
    track(new THREE.MeshStandardMaterial({ color: new THREE.Color(0x1b1915).lerp(new THREE.Color(accent), 0.14), roughness: 1 })),
  );
  cloth.rotation.y = -Math.PI / 2;
  cloth.position.set(-0.0033, 0, total / 2);
  cloth.castShadow = castShadow;
  group.add(cloth);

  // The title on the spine edge, pasted over the middle threads: this is what you read on the shelf.
  const sp = spineSlipSize(total);
  const spineMat = track(std(tex.spine));
  if (!withLeaves) {
    // On the shelf the label glows a little: these are the books you can pick.
    spineMat.emissive = new THREE.Color(0xfff0d8);
    spineMat.emissiveMap = tex.spine;
    spineMat.emissiveIntensity = 0.42;
  }
  const spineSlip = new THREE.Mesh(track(new THREE.PlaneGeometry(sp.w, sp.h)), spineMat);
  spineSlip.rotation.y = -Math.PI / 2; // faces -X, out of the spine
  spineSlip.position.set(-0.0135, 0, total / 2);
  group.add(spineSlip);

  // The picture's own spine over all of it, unlit, so the swap from picture to book cannot be seen.
  let cropMat: THREE.MeshBasicMaterial | null = null;
  if (spineCrop) {
    cropMat = track(new THREE.MeshBasicMaterial({ map: spineCrop, transparent: true, opacity: 1, depthWrite: false }));
    track(spineCrop);
    const crop = new THREE.Mesh(track(new THREE.PlaneGeometry(total, PAGE_H)), cropMat);
    crop.rotation.y = -Math.PI / 2;
    crop.position.set(-0.0155, 0, total / 2);
    group.add(crop);
  }

  const parts: BookParts = {
    group,
    stack,
    shadowScale: 1,
    apply(rig, content) {
      // Cover.
      const pc = rig.leaves[0]!.p;
      pivot.position.set(0, 0, stack.coverMidClosed + (stack.coverMidOpen - stack.coverMidClosed) * smooth(pc));
      pivot.rotation.y = -Math.PI * pc;

      // Leaves at rest on either side decide how tall each block is; those in flight are drawn as sheets.
      let nRight = 0;
      let nLeft = 0;
      for (let c = 0; c < n; c++) {
        const p = rig.leaves[c + 1]!.p;
        if (p <= 0.001) nRight++;
        if (p >= 0.999) nLeft++;
      }
      leaves.forEach((leaf, c) => {
        const p = rig.leaves[c + 1]!.p;
        leafProfile(Math.PI * p, curlFor(p), SEGMENTS, leaf.xs, leaf.zs);
        const zh = stack.zRight(c) + (stack.zLeft(c) - stack.zRight(c)) * smooth(p);
        const arr = leaf.pos.array as Float32Array;
        for (let i = 0; i <= SEGMENTS; i++) {
          const x = leaf.xs[i]!;
          const z = zh + leaf.zs[i]!;
          arr.set([x, PAGE_H / 2, z, x, -PAGE_H / 2, z], i * 6);
        }
        leaf.pos.needsUpdate = true;
        leaf.gf.computeVertexNormals();
        (leaf.gb.getAttribute("normal") as THREE.BufferAttribute).needsUpdate = true;
        const resting = p <= 0.001 || p >= 0.999;
        leaf.f.renderOrder = leaf.b.renderOrder = resting ? 0 : 1;
        const o = content[c] ?? 1;
        leaf.o.visible = o > 0.004;
        (leaf.o.material as THREE.MeshStandardMaterial).opacity = o;
        leaf.o.renderOrder = resting ? 2 : 3;
      });

      right.mesh.scale.z = Math.max(0.0001, nRight * stack.th - 0.0008);
      left.mesh.scale.z = Math.max(0.0001, nLeft * stack.th - 0.0008);
      right.mesh.visible = nRight > 0;
      left.mesh.visible = nLeft > 0;
      if (right.lastCount !== nRight) {
        right.edgeTex.repeat.set(1, Math.max(1, Math.ceil(nRight * 1.5)));
        right.lastCount = nRight;
      }
      if (left.lastCount !== nLeft) {
        left.edgeTex.repeat.set(1, Math.max(1, Math.ceil(nLeft * 1.5)));
        left.lastCount = nLeft;
      }

      // Shadow widens as the book opens.
      const open = smooth(pc);
      shadow.position.x = PAGE_W / 2 - (PAGE_W / 2) * open;
      shadow.scale.set(PAGE_W * (1.3 + open * 1.12), PAGE_H * 1.2, 1);
      shadowMat.opacity = 0.9 * parts.shadowScale;
      // The lamp only glows while the cover is up.
      if (glowMat) glowMat.opacity = 0.9 * (1 - smooth(Math.min(1, pc * 2.2)));
    },
    setSpineCrop(opacity) {
      if (!cropMat) return;
      cropMat.opacity = opacity;
      cropMat.visible = opacity > 0.003;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
  return parts;
}
