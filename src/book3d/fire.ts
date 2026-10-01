import * as THREE from "three";
import { asset } from "../content/asset";
import { emberTexture } from "./shelfTextures";

/**
 * The fireplace: a firebox, logs, three layers of animated flame, a few rising sparks, and a flickering warm light.
 * Everything is procedural; the flame is a noise shader, so it never repeats and needs no video.
 * It is the room's main light, and the thing that makes the shelf feel lived in.
 */
const flameVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const flameFrag = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform float uSeed;
uniform float uIntensity;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
  return v;
}
void main() {
  float x = (vUv.x - 0.5) * 2.0;
  float y = vUv.y;
  // Turbulence climbing the flame, at two scales, so it licks and crackles.
  float n1 = fbm(vec2(x * 1.7 + uSeed, y * 2.3 - uTime * 1.7));
  float n2 = fbm(vec2(x * 3.4 - uSeed, y * 3.8 - uTime * 3.1));
  float sway = (n1 - 0.5) * 0.75 * y;
  float width = mix(0.9, 0.06, pow(y, 0.85));
  float shape = 1.0 - smoothstep(width * 0.5, width, abs(x + sway));
  float body = shape * (1.0 - y * 0.92);
  float flick = smoothstep(0.22, 1.0, n1 * 1.2 + n2 * 0.4 - y * 0.85 + 0.28);
  float a = clamp(body * flick * 1.7, 0.0, 1.0);
  float heat = clamp(a * 1.5 - y * 0.3, 0.0, 1.0);
  vec3 col = mix(vec3(0.85, 0.14, 0.02), vec3(1.0, 0.52, 0.09), heat);
  col = mix(col, vec3(1.0, 0.9, 0.62), pow(heat, 3.0));
  gl_FragColor = vec4(col * uIntensity, a);
}`;

/**
 * A real flame photograph (on black, so it can simply be added to the scene), warped by moving noise so the tongues
 * sway and lick. Several copies, mirrored and cropped differently, make one fire that never visibly repeats.
 */
const photoFrag = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uMap;
uniform float uTime;
uniform float uSeed;
uniform float uIntensity;
uniform float uFlip;
uniform float uZoom;
uniform vec2 uOff;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 uv = vUv;
  // Fade each plane at its own sides and top (not its base, which sits behind the logs), whatever part of the photo it shows.
  float e = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x) * smoothstep(1.0, 0.8, vUv.y);
  float t = uTime;
  // Noise climbs the flame; the warp grows with height, so the base stays put and the tips lick.
  float n1 = noise(vec2(uv.x * 3.0 + uSeed, uv.y * 2.4 - t * 0.85));
  float n2 = noise(vec2(uv.x * 7.0 - uSeed, uv.y * 5.5 - t * 1.9));
  float up = 0.18 + uv.y;
  uv += vec2((n1 - 0.5) * 0.08 + (n2 - 0.5) * 0.032, (n2 - 0.5) * 0.04) * up;
  uv.y *= 0.95 + 0.03 * sin(t * 2.7 + uSeed);
  uv = uv * uZoom + uOff;
  uv.x = mix(uv.x, 1.0 - uv.x, uFlip);
  vec3 col = texture2D(uMap, uv).rgb;
  gl_FragColor = vec4(col * e * uIntensity, 1.0);
  #include <colorspace_fragment>
}`;

export interface Fire {
  group: THREE.Group;
  /** Advance the flame. `lit` 0..1 scales the whole fire (it dims as a book is taken down). */
  update(t: number, dt: number, lit: number): void;
  dispose(): void;
}

export function buildFire(opts: { width: number; height: number; floorY: number; z: number }): Fire {
  const { width, height, floorY, z } = opts;
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => (disposables.push(x), x);

  // Firebox: deep, sooty, warmest at the bottom.
  const [c, ctx] = (() => {
    const cv = document.createElement("canvas");
    cv.width = 128;
    cv.height = 256;
    return [cv, cv.getContext("2d")!] as const;
  })();
  const g = ctx.createLinearGradient(0, 256, 0, 0);
  g.addColorStop(0, "#3a1a0a");
  g.addColorStop(0.35, "#160a05");
  g.addColorStop(1, "#070403");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 256);
  const boxTex = track(new THREE.CanvasTexture(c));
  boxTex.colorSpace = THREE.SRGBColorSpace;
  const back = new THREE.Mesh(track(new THREE.PlaneGeometry(width, height)), track(new THREE.MeshBasicMaterial({ map: boxTex })));
  back.position.set(0, floorY + height / 2, z - 0.28);
  group.add(back);

  // Side walls of the firebox, so the opening reads as a recess.
  const sideMat = track(new THREE.MeshStandardMaterial({ color: 0x120a06, roughness: 1 }));
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(track(new THREE.BoxGeometry(0.04, height, 0.3)), sideMat);
    side.position.set(sx * (width / 2 + 0.02), floorY + height / 2, z - 0.14);
    group.add(side);
  }
  // Hearth slab, projecting a little into the room.
  const hearth = new THREE.Mesh(track(new THREE.BoxGeometry(width + 0.5, 0.1, 0.62)), track(new THREE.MeshBasicMaterial({ color: 0x1b1612 })));
  hearth.position.set(0, floorY - 0.05, z - 0.0);
  group.add(hearth);

  // Logs.
  // Charred and unlit: the fire's light would blow these out this close, so the embers and flame carry the glow.
  const logMat = track(new THREE.MeshBasicMaterial({ color: 0x1f110a }));
  const logGeo = track(new THREE.CylinderGeometry(0.05, 0.045, 0.5, 12));
  const mkLog = (x: number, y: number, zz: number, rz: number, ry: number) => {
    const m = new THREE.Mesh(logGeo, logMat);
    m.rotation.set(0, ry, rz);
    m.position.set(x, floorY + y, z + zz);
    group.add(m);
  };
  mkLog(-0.02, 0.05, -0.14, Math.PI / 2, 0.15);
  mkLog(0.05, 0.12, -0.18, Math.PI / 2, -0.35);
  mkLog(-0.1, 0.1, -0.08, Math.PI / 2 + 0.1, 0.5);

  // Flames: three overlapping layers, each with its own noise seed.
  const flames: { mat: THREE.ShaderMaterial; seed: number }[] = [];
  const layers: [number, number, number, number, number][] = [
    // width, height, x, z offset, seed
    [0.4, 0.56, -0.04, -0.12, 1.3],
    [0.3, 0.46, 0.07, -0.06, 4.1],
    [0.22, 0.36, -0.12, -0.02, 7.7],
  ];
  layers.forEach(([w, h, x, zz, seed]) => {
    const mat = track(
      new THREE.ShaderMaterial({
        vertexShader: flameVert,
        fragmentShader: flameFrag,
        uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uIntensity: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    const m = new THREE.Mesh(track(new THREE.PlaneGeometry(w, h)), mat);
    m.position.set(x, floorY + 0.08 + h / 2, z + zz);
    group.add(m);
    flames.push({ mat, seed });
  });

  // The photographic flame. Until it has loaded, the procedural flame above carries the fire alone.
  const photo = { mix: 0, loaded: false };
  const photoMats: { mat: THREE.ShaderMaterial; weight: number; phase: number }[] = [];
  // If the file is absent (it is not in the public repo), the procedural flame simply carries on alone.
  // The photo is not in the public repo, so there it is not even requested.
  const photoTex = __HAS_FIRE_TEXTURE__
    ? new THREE.TextureLoader().load(
        asset("/assets/fire/flame.webp"),
        () => {
          photo.loaded = true;
        },
        undefined,
        () => undefined,
      )
    : null;
  if (photoTex) {
    photoTex.colorSpace = THREE.SRGBColorSpace;
    photoTex.wrapS = photoTex.wrapT = THREE.ClampToEdgeWrapping;
    track(photoTex);
  }
  const photoLayers: { size: number; x: number; zz: number; seed: number; flip: number; zoom: number; off: [number, number]; weight: number }[] = [
    { size: 0.7, x: -0.02, zz: -0.1, seed: 1.3, flip: 0, zoom: 1, off: [0, 0], weight: 1.0 },
    { size: 0.56, x: 0.07, zz: -0.05, seed: 4.1, flip: 1, zoom: 1, off: [0, 0], weight: 0.62 },
    { size: 0.42, x: -0.11, zz: -0.01, seed: 7.7, flip: 0, zoom: 0.62, off: [0.04, 0], weight: 0.5 },
  ];
  if (photoTex) photoLayers.forEach((l, i) => {
    const mat = track(
      new THREE.ShaderMaterial({
        vertexShader: flameVert,
        fragmentShader: photoFrag,
        uniforms: {
          uMap: { value: photoTex },
          uTime: { value: 0 },
          uSeed: { value: l.seed },
          uIntensity: { value: 0 },
          uFlip: { value: l.flip },
          uZoom: { value: l.zoom },
          uOff: { value: new THREE.Vector2(l.off[0], l.off[1]) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    const m = new THREE.Mesh(track(new THREE.PlaneGeometry(l.size, l.size)), mat);
    // The photo's base is cut straight, so it sits just below the hearth, hidden behind it and the logs.
    m.position.set(l.x, floorY - 0.04 + l.size / 2, z + l.zz);
    group.add(m);
    photoMats.push({ mat, weight: l.weight, phase: i * 0.61 });
  });

  // Embers glowing under the logs.
  const emberTex = track(emberTexture());
  const emberMat = track(new THREE.MeshBasicMaterial({ map: emberTex, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const ember = new THREE.Mesh(track(new THREE.PlaneGeometry(0.62, 0.12)), emberMat);
  ember.position.set(0, floorY + 0.045, z - 0.03);
  group.add(ember);

  // Sparks rising off the fire.
  const N = 30;
  const sparkPos = new Float32Array(N * 3);
  const sparkCol = new Float32Array(N * 3);
  const sparkAge = new Float32Array(N);
  const sparkVel = new Float32Array(N * 3);
  const seedSpark = (i: number, age: number) => {
    sparkAge[i] = age;
    sparkPos[i * 3] = (Math.random() - 0.5) * 0.3;
    sparkPos[i * 3 + 1] = floorY + 0.15 + Math.random() * 0.1;
    sparkPos[i * 3 + 2] = z - 0.1 + Math.random() * 0.08;
    sparkVel[i * 3] = (Math.random() - 0.5) * 0.06;
    sparkVel[i * 3 + 1] = 0.18 + Math.random() * 0.22;
    sparkVel[i * 3 + 2] = 0;
  };
  for (let i = 0; i < N; i++) seedSpark(i, Math.random());
  const sparkGeo = track(new THREE.BufferGeometry());
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkCol, 3));
  const sparkMat = track(
    new THREE.PointsMaterial({ size: 0.014, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, toneMapped: false }),
  );
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  group.add(sparks);

  // The fire is the room's light: warm, from low and in front of the firebox, flickering.
  const light = new THREE.PointLight(0xff8a3a, 2.2, 3.4, 1.5);
  light.position.set(0, floorY + 0.3, z + 0.35);
  group.add(light);

  let burst = 0;
  return {
    group,
    update(t, dt, lit) {
      // Crackle: a slow breath, a faster flutter, and the odd sudden pop.
      if (Math.random() < dt * 2.2) burst = Math.min(1, burst + 0.5 + Math.random() * 0.5);
      burst *= Math.exp(-dt * 7);
      const flicker = 0.8 + 0.12 * Math.sin(t * 7.3) * Math.sin(t * 2.9 + 1.2) + 0.08 * Math.sin(t * 17.1 + 0.4) + 0.18 * burst;
      // Fade the photographic flame in once it has loaded; the procedural flame recedes to a shimmer behind it.
      photo.mix += ((photo.loaded ? 1 : 0) - photo.mix) * Math.min(1, dt * 1.6);
      const procWeight = 1 - 0.72 * photo.mix;
      flames.forEach((f, i) => {
        f.mat.uniforms.uTime!.value = t + i * 0.37;
        f.mat.uniforms.uIntensity!.value = (0.85 + 0.35 * flicker) * lit * procWeight;
      });
      photoMats.forEach((p) => {
        p.mat.uniforms.uTime!.value = t + p.phase * 3;
        p.mat.uniforms.uIntensity!.value = p.weight * (0.78 + 0.3 * flicker) * lit * photo.mix;
      });
      light.intensity = 2.2 * flicker * lit;
      emberMat.opacity = (0.45 + 0.3 * flicker) * lit;
      logMat.color.setRGB(0.012 + 0.012 * flicker, 0.006 + 0.004 * flicker, 0.0035).multiplyScalar(lit);
      for (let i = 0; i < N; i++) {
        sparkAge[i]! > 1 ? seedSpark(i, 0) : null;
        sparkAge[i] = sparkAge[i]! + dt * (0.35 + (i % 5) * 0.08);
        sparkPos[i * 3] = sparkPos[i * 3]! + sparkVel[i * 3]! * dt + Math.sin(t * 3 + i) * 0.0009;
        sparkPos[i * 3 + 1] = sparkPos[i * 3 + 1]! + sparkVel[i * 3 + 1]! * dt;
        const fade = Math.max(0, 1 - sparkAge[i]!) * Math.min(1, sparkAge[i]! * 6) * lit;
        sparkCol[i * 3] = 1.0 * fade;
        sparkCol[i * 3 + 1] = 0.62 * fade;
        sparkCol[i * 3 + 2] = 0.22 * fade;
      }
      (sparkGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      (sparkGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}
