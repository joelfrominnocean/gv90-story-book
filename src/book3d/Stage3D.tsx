import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Insets } from "../book/layout";
import { buildBook, type BookParts } from "./buildBook";
import { FOV } from "./constants";
import { BookRig, bookThickness, cameraPose, closedPose, ease, lerp, lerpPose, libraryPose, smooth, type Pose } from "./rig";
import { BOOK_SCALE, buildShelf, type ShelfBookSpec } from "./shelf";
import { createBookTextures, type BookTextures, type DrawPage } from "./textures";

export interface SelectedBook {
  /** Chapter number, which is also its place on the shelf. */
  n: number;
  /** What to print on each page leaf. The length is the page count. */
  pages: DrawPage[];
  /** Page count when unlocked, so a sealed one-page book is as thick as it will be once opened. */
  pageCount: number;
  mode: "paper" | "ink";
  accent: string;
  title: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StageProps {
  books: ShelfBookSpec[];
  /** The book that has been taken down (or is being taken down), or null in the library. */
  selected: SelectedBook | null;
  /** -1 = closed on the cover; p = reading page p. */
  view: number;
  insets: Insets;
  /** True while the live HTML page is on top of the leaf the reader is on; the leaf then shows blank paper. */
  htmlShown: boolean;
  /** Where each book's spine is on screen (CSS px in the canvas), for the invisible buttons over the shelf. */
  onRects: (rects: Rect[]) => void;
  /** Fired when a move has finished: book taken down and printed, a page turned, or the book back on its shelf. */
  onSettled: () => void;
  /** Fired once, when the shelf is drawn and the first frame is up. */
  onReady: () => void;
}

const HALF_FOV = Math.tan(((FOV / 2) * Math.PI) / 180);
const TAKE_DOWN_MS = 1250;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function place(cam: THREE.PerspectiveCamera, p: Pose): void {
  const dist = p.visH / (2 * HALF_FOV);
  const sp = Math.sin(p.polar);
  cam.position.set(p.tx + dist * sp * Math.sin(p.az), p.ty - dist * sp * Math.cos(p.az), p.tz + dist * Math.cos(p.polar));
  cam.up.set(0, 1, 0);
  cam.lookAt(p.tx, p.ty, p.tz);
}

interface Active {
  n: number;
  tex: BookTextures;
  parts: BookParts;
  rig: BookRig;
  pagesDrawn: boolean;
}

function Scene({ books, selected, view, insets, htmlShown, onRects, onSettled, onReady }: StageProps) {
  const { invalidate, size } = useThree();
  const shelf = useMemo(() => buildShelf(books), [books]);
  const wrap = useMemo(() => new THREE.Group(), []);
  const curtainMat = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x0d0c0a, transparent: true, opacity: 0, depthWrite: false }), []);

  const active = useRef<Active | null>(null);
  const stage = useRef({ v: 0, from: 0, to: 0, start: 0, active: false });
  const settled = useRef(true);
  const content = useRef<number[]>([]);
  const shown = useRef({ view, htmlShown });
  const prevView = useRef(view);
  const readyFired = useRef(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const dispose = useRef(false);

  const amb = useRef<THREE.AmbientLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const lamp = useRef<THREE.PointLight>(null);

  useEffect(
    () => () => {
      active.current?.parts.dispose();
      active.current?.tex.dispose();
      active.current = null;
      shelf.dispose();
    },
    [shelf],
  );

  // First frame: once the shelf's labels are drawn.
  useEffect(() => {
    let alive = true;
    void shelf.labelsReady.then(() => {
      if (!alive) return;
      invalidate();
      if (!readyFired.current) {
        readyFired.current = true;
        requestAnimationFrame(() => requestAnimationFrame(onReady));
      }
    });
    return () => {
      alive = false;
    };
  }, [shelf, invalidate, onReady]);

  // Where the spines are on screen, for the buttons over them.
  useEffect(() => {
    const cam = new THREE.PerspectiveCamera(FOV, size.width / size.height, 0.05, 40);
    place(cam, libraryPose(size.width / size.height));
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const v = new THREE.Vector3();
    onRects(
      shelf.slots.map((s) => {
        const xs: number[] = [];
        const ys: number[] = [];
        for (const x of [s.x, s.x + s.w])
          for (const y of [s.y - 0.4, s.y + 0.4]) {
            v.set(x, y, s.z).project(cam);
            xs.push((v.x * 0.5 + 0.5) * size.width);
            ys.push((-v.y * 0.5 + 0.5) * size.height);
          }
        const x0 = Math.min(...xs);
        const y0 = Math.min(...ys);
        return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
      }),
    );
  }, [shelf, size.width, size.height, onRects]);

  // Take a book down, or put it back.
  useEffect(() => {
    const now = performance.now();
    const a = active.current;
    if (selected) {
      if (!a || a.n !== selected.n) {
        if (a) {
          a.parts.dispose();
          a.tex.dispose();
          wrap.remove(a.parts.group);
        }
        const n = selected.pages.length;
        const tex = createBookTextures({ pageCount: n, coverTitle: selected.title, mode: selected.mode, accent: selected.accent, thickness: bookThickness(selected.pageCount) });
        const parts = buildBook(tex, { n, accent: selected.accent, thickFor: selected.pageCount, leaves: true, coverDetail: true, castShadow: false });
        const rig = new BookRig(n);
        rig.snap(-1);
        wrap.add(parts.group);
        content.current = Array.from({ length: n }, () => 1);
        active.current = { n: selected.n, tex, parts, rig, pagesDrawn: false };
        shelf.setHidden(selected.n);
      }
      stage.current = { v: stage.current.v, from: stage.current.v, to: 1, start: now, active: true };
    } else if (a) {
      stage.current = { v: stage.current.v, from: stage.current.v, to: 0, start: now, active: true };
    }
    settled.current = false;
    invalidate();
  }, [selected?.n, shelf, wrap, invalidate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Print the pages whenever the book or the viewport changes.
  useEffect(() => {
    const a = active.current;
    if (!selected || !a || a.n !== selected.n) return;
    let alive = true;
    const t = window.setTimeout(() => {
      void a.tex.drawPages(selected.pages, { vw: size.width, vh: size.height, insets }).then(() => {
        if (!alive) return;
        a.pagesDrawn = true;
        invalidate();
      });
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [selected, selected?.pages, size.width, size.height, insets, invalidate]);

  useEffect(() => {
    shown.current = { view, htmlShown };
    invalidate();
  }, [view, htmlShown, invalidate]);

  useEffect(() => {
    if (prevView.current === view) return;
    prevView.current = view;
    active.current?.rig.setView(view, performance.now());
    settled.current = false;
    invalidate();
  }, [view, invalidate]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, unknown>;
      w.__book = {
        get rig() {
          return active.current?.rig;
        },
        get stage() {
          return stage.current;
        },
        shelf,
        wrap,
        invalidate,
        force: undefined,
      };
    }
  }, [shelf, wrap, invalidate]);

  useFrame((state, delta) => {
    const now = performance.now();
    const dt = Math.min(delta, 0.05);
    const st = stage.current;
    if (st.active) {
      const t = (now - st.start) / TAKE_DOWN_MS;
      if (t >= 1) {
        st.v = st.to;
        st.active = false;
      } else st.v = st.from + (st.to - st.from) * ease(Math.max(0, t));
    }
    let busy = st.active;
    const uu = st.v;
    const aspect = size.width / size.height;
    const a = active.current;
    let pose: Pose = libraryPose(aspect);

    if (a) {
      busy = a.rig.update(now, dt) || busy;
      // Fade each leaf's print: gone while the live page sits on it, back as soon as it lifts.
      const k = 1 - Math.exp(-dt / 0.1);
      const forced = import.meta.env.DEV ? ((window as unknown as { __book?: { force?: number } }).__book?.force ?? null) : null;
      content.current.forEach((o, c) => {
        const target = forced !== null ? forced : shown.current.htmlShown && shown.current.view === c ? 0 : 1;
        const next = Math.abs(target - o) < 0.004 ? target : o + (target - o) * k;
        if (next !== target) busy = true;
        content.current[c] = next;
      });
      a.parts.shadowScale = smooth(uu);
      a.parts.apply(a.rig, content.current);

      // Lift the book off its shelf, turn it to face you, and bring it forward.
      const slot = shelf.slots[a.n]!;
      const s1 = smooth(clamp01(uu / 0.3));
      const m = smooth(clamp01((uu - 0.18) / 0.82));
      wrap.position.set(lerp(slot.x, 0, m), lerp(slot.y, 0, m), lerp(slot.z + 0.4 * s1, 0, m));
      wrap.rotation.y = (1 - m) * (Math.PI / 2);
      wrap.scale.setScalar(lerp(BOOK_SCALE, 1, m));

      const reading = Math.min(a.rig.n - 1, Math.max(0, shown.current.view));
      const bookPose = cameraPose(a.rig.leaves[0]!.p, a.rig.pull, aspect, a.parts.stack.zRight(reading));
      pose = lerpPose(libraryPose(aspect), bookPose, smooth(uu));
    } else if (uu > 0) pose = lerpPose(libraryPose(aspect), closedPose(aspect), smooth(uu));

    place(state.camera as THREE.PerspectiveCamera, pose);

    // The room dims as the book comes down, so it stands alone in its own light.
    const lib = 1 - smooth(uu);
    curtainMat.opacity = smooth(clamp01((uu - 0.12) / 0.55));
    // The fire never stops while the library is up: it is the room's light. It rests while a book is down.
    if (lib > 0.01) {
      shelf.update(now / 1000, dt, uu);
      busy = true;
    }
    if (amb.current) amb.current.intensity = lerp(1.35, 0.22, lib);
    if (key.current) {
      // A cool, dim light from out of frame (a hanji screen) against the fire's warmth.
      key.current.intensity = lerp(2.45, 0.55, lib);
      key.current.position.set(lerp(-1.6, -2.3, lib), lerp(2.2, 2.8, lib), lerp(4, 3.4, lib));
      key.current.color.setRGB(lerp(1, 0.78, lib), lerp(1, 0.86, lib), 1);
      key.current.castShadow = lib > 0.02;
    }
    if (fill.current) fill.current.intensity = lerp(0.45, 0.1, lib);
    if (lamp.current) lamp.current.intensity = 0.7 * lib;

    // Settled: the book is down and printed, a page has turned, or the book is back on its shelf.
    if (!settled.current && !st.active) {
      const target = selectedRef.current ? 1 : 0;
      if (target === 1) {
        if (a && a.rig.settled && a.pagesDrawn) {
          settled.current = true;
          onSettled();
        }
      } else if (Math.abs(uu) < 0.001) {
        dispose.current = true;
        settled.current = true;
        onSettled();
      }
    }
    if (dispose.current && active.current && !selectedRef.current && uu < 0.001) {
      dispose.current = false;
      wrap.remove(active.current.parts.group);
      active.current.parts.dispose();
      active.current.tex.dispose();
      active.current = null;
      shelf.setHidden(null);
      busy = true;
    }
    if (busy) invalidate();
  });

  return (
    <>
      <ambientLight ref={amb} intensity={0.5} />
      <directionalLight
        ref={key}
        position={[-2.3, 2.6, 3.4]}
        intensity={1.55}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={2.6}
        shadow-camera-bottom={-1.6}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
      <directionalLight ref={fill} position={[2.4, -1.6, 2]} intensity={0.22} />
      <pointLight ref={lamp} position={[0, 1.26, -0.6]} color="#cfeee6" intensity={0.7} distance={2.4} decay={1.4} />
      <primitive object={shelf.group} />
      <primitive object={wrap} />
      <mesh position={[0, 0, -0.002]} renderOrder={-1}>
        <planeGeometry args={[60, 60]} />
        <primitive object={curtainMat} attach="material" />
      </mesh>
    </>
  );
}

export default function Stage3D(props: StageProps) {
  return (
    <Canvas
      frameloop="demand"
      flat
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: FOV, near: 0.05, far: 40, position: [0, 0.6, 6] }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
