// Wireframe holograms of the four MIMII machine types (pump, fan, valve, slide rail),
// wrapped in a particle shell and the 8-microphone ring used for the recordings.
// Purely presentational: nothing here affects scoring.
import * as THREE from "three";

const PALETTES = {
  idle:      ["#3fe3e0", "#8f7bff"],
  listening: ["#7ff7ff", "#6f8dff"],
  normal:    ["#36e3ad", "#4aa8ff"],
  anomalous: ["#ffb14a", "#ff3d6e"],
  error:     ["#8a93ad", "#5b6480"],
  preview:   ["#5fd8ff", "#a07bff"],
};
for (const k in PALETTES) PALETTES[k] = PALETTES[k].map(c => new THREE.Color(c));

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Line builder: collects segments, then becomes a LineSegments with vertex colours
// ---------------------------------------------------------------------------
class Lines {
  constructor() { this.p = []; }
  seg(a, b) { this.p.push(a.x, a.y, a.z, b.x, b.y, b.z); return this; }
  poly(pts, closed = false) {
    for (let i = 0; i < pts.length - 1; i++) this.seg(pts[i], pts[i + 1]);
    if (closed) this.seg(pts[pts.length - 1], pts[0]);
    return this;
  }
  // circle around the X axis
  ringX(x, r, n = 40, cy = 0, cz = 0) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; pts.push(V(x, cy + r * Math.cos(a), cz + r * Math.sin(a))); }
    return this.poly(pts, true);
  }
  // circle around the Y axis (horizontal)
  ringY(y, r, n = 32, cx = 0, cz = 0) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; pts.push(V(cx + r * Math.cos(a), y, cz + r * Math.sin(a))); }
    return this.poly(pts, true);
  }
  cylX(x0, x1, r, rings, ribs, cy = 0, cz = 0) {
    for (let i = 0; rings > 0 && i <= rings; i++) this.ringX(x0 + ((x1 - x0) * i) / rings, r, 40, cy, cz);
    for (let k = 0; k < ribs; k++) {
      const a = (k / ribs) * TAU, y = cy + r * Math.cos(a), z = cz + r * Math.sin(a);
      this.seg(V(x0, y, z), V(x1, y, z));
    }
    return this;
  }
  cylY(y0, y1, r, rings, ribs, cx = 0, cz = 0) {
    for (let i = 0; rings > 0 && i <= rings; i++) this.ringY(y0 + ((y1 - y0) * i) / rings, r, 32, cx, cz);
    for (let k = 0; k < ribs; k++) {
      const a = (k / ribs) * TAU, x = cx + r * Math.cos(a), z = cz + r * Math.sin(a);
      this.seg(V(x, y0, z), V(x, y1, z));
    }
    return this;
  }
  box(x0, x1, y0, y1, z0, z1) {
    const c = [V(x0, y0, z0), V(x1, y0, z0), V(x1, y1, z0), V(x0, y1, z0), V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1)];
    [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => this.seg(c[a], c[b]));
    return this;
  }
  flangeX(x, rIn, rOut, bolts = 8, dir = 1) {
    this.ringX(x, rIn).ringX(x, rOut).ringX(x + 0.06 * dir, rOut);
    for (let k = 0; k < bolts; k++) {
      const a = (k / bolts) * TAU, rb = (rIn + rOut) / 2 + 0.02;
      this.ringX(x + 0.065 * dir, 0.024, 10, rb * Math.cos(a), rb * Math.sin(a));
    }
    return this;
  }
  flangeY(y, rIn, rOut, bolts = 8, cx = 0, cz = 0) {
    this.ringY(y, rIn, 28, cx, cz).ringY(y, rOut, 32, cx, cz).ringY(y + 0.06, rOut, 32, cx, cz);
    for (let k = 0; k < bolts; k++) {
      const a = (k / bolts) * TAU, rb = (rIn + rOut) / 2 + 0.02;
      this.ringY(y + 0.065, 0.024, 8, cx + rb * Math.cos(a), cz + rb * Math.sin(a));
    }
    return this;
  }
  helixX(x0, x1, r, pitch, steps = 16) {
    const turns = (x1 - x0) / pitch, n = Math.round(turns * steps), pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n, a = t * turns * TAU; pts.push(V(x0 + (x1 - x0) * t, r * Math.cos(a), r * Math.sin(a))); }
    return this.poly(pts);
  }
}

// ---------------------------------------------------------------------------
// Machines. Each returns { root: Group, parts: [Lines], update(t, dt, level) }
// Coordinates roughly span x -2.4..2.4, y -1.1..1.6
// ---------------------------------------------------------------------------
function buildPump() {
  const L = new Lines();
  const mx0 = -2.05, mx1 = -0.35, mr = 0.64;
  for (let i = 0; i <= 14; i++) L.ringX(mx0 + ((mx1 - mx0) * i) / 14, mr + (i % 2 ? 0.035 : 0), 44);
  for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; L.seg(V(mx0, mr * Math.cos(a), mr * Math.sin(a)), V(mx1, mr * Math.cos(a), mr * Math.sin(a))); }
  L.ringX(mx0 - 0.18, 0.56).ringX(mx0 - 0.28, 0.4).ringX(mx0 - 0.3, 0.16);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU, c = Math.cos(a), s = Math.sin(a);
    L.seg(V(mx0, mr * c, mr * s), V(mx0 - 0.18, 0.56 * c, 0.56 * s)).seg(V(mx0 - 0.28, 0.4 * c, 0.4 * s), V(mx0 - 0.3, 0.16 * c, 0.16 * s));
  }
  L.box(-1.55, -0.95, mr - 0.02, mr + 0.34, -0.24, 0.24).box(-1.45, -1.05, mr + 0.34, mr + 0.38, -0.18, 0.18);
  L.cylX(mx1, -0.05, 0.12, 2, 6).cylX(-0.05, 0.22, 0.24, 3, 10);
  for (let i = 0; i <= 4; i++) L.ringX(0.22 + i * 0.1, 0.24 + i * 0.06, 36);
  for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; L.seg(V(0.22, 0.24 * Math.cos(a), 0.24 * Math.sin(a)), V(0.62, 0.48 * Math.cos(a), 0.48 * Math.sin(a))); }
  // volute spiral casing
  const vx = 0.95, turns = 30, sections = [];
  for (let i = 0; i <= turns; i++) {
    const t = i / turns, th = -Math.PI / 2 + t * TAU * 0.92, R = 0.52 + 0.24 * t, r = 0.2 + 0.1 * t, pts = [];
    for (let j = 0; j < 14; j++) { const ph = (j / 14) * TAU, rad = R + r * Math.cos(ph); pts.push(V(vx + r * Math.sin(ph), rad * Math.cos(th), rad * Math.sin(th))); }
    sections.push(pts); L.poly(pts, true);
  }
  for (let i = 0; i < turns; i++) for (let j = 0; j < 14; j += 2) L.seg(sections[i][j], sections[i + 1][j]);
  L.ringX(vx - 0.2, 0.62).ringX(vx + 0.2, 0.62).ringX(vx + 0.24, 0.36);
  L.cylX(vx + 0.24, 1.75, 0.22, 4, 12).flangeX(1.75, 0.22, 0.38);
  const dz = 0.62;
  L.cylY(0.55, 1.35, 0.19, 5, 10, vx, dz).flangeY(1.35, 0.19, 0.34, 8, vx, dz);
  // base
  L.box(-2.3, 1.95, -1.02, -0.9, -0.72, 0.72).box(-2.2, 1.85, -0.9, -0.86, -0.62, 0.62);
  [[-1.8, -0.75], [-0.75, -0.75], [0.6, -0.7], [1.3, -0.82]].forEach(([x, top]) => { L.box(x - 0.14, x + 0.14, -0.86, top, -0.5, -0.36).box(x - 0.14, x + 0.14, -0.86, top, 0.36, 0.5); });
  [-2.1, -0.2, 1.7].forEach(x => { L.ringY(-0.9, 0.05, 10, x, 0.6).ringY(-0.9, 0.05, 10, x, -0.6); });

  // impeller vanes spin inside the eye
  const I = new Lines();
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU, p = [];
    for (let s = 0; s <= 6; s++) { const rr = 0.06 + s * 0.045, aa = a + s * 0.2; p.push(V(0, rr * Math.cos(aa), rr * Math.sin(aa))); }
    I.poly(p);
  }
  I.ringX(0, 0.05, 12);
  return {
    parts: [{ lines: L }, { lines: I, at: [vx + 0.21, 0, 0], spin: "x", name: "impeller" }],
    scale: 0.92, offset: [0.1, 0.05, 0],
    update(t, dt, level, nodes) { nodes.impeller.rotation.x += dt * (2 + level * 14); },
  };
}

function buildFan() {
  const L = new Lines();
  // duct housing
  const R = 1.12;
  L.cylX(-0.55, 0.55, R, 2, 14);
  L.ringX(-0.55, R + 0.14).ringX(0.55, R + 0.14);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU, c = Math.cos(a), s = Math.sin(a);
    L.seg(V(-0.55, R * c, R * s), V(-0.55, (R + 0.14) * c, (R + 0.14) * s)).seg(V(0.55, R * c, R * s), V(0.55, (R + 0.14) * c, (R + 0.14) * s));
  }
  // inlet bell mouth
  const bell = [];
  for (let i = 0; i <= 3; i++) {
    const t = i / 3, x = -0.55 - 0.42 * Math.sin((t * Math.PI) / 2), r = R + 0.38 * (1 - Math.cos((t * Math.PI) / 2));
    L.ringX(x, r, 48); bell.push([x, r]);
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    L.poly(bell.map(([x, r]) => V(x, r * Math.cos(a), r * Math.sin(a))));
  }
  // rear guard grille
  [0.5, 1.0].forEach(r => L.ringX(0.62, r, 40));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; L.seg(V(0.62, 0.12 * Math.cos(a), 0.12 * Math.sin(a)), V(0.62, R * Math.cos(a), R * Math.sin(a))); }
  // motor, struts
  L.cylX(0.05, 0.95, 0.3, 6, 12).ringX(1.02, 0.22).ringX(1.06, 0.1);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    L.seg(V(0.35, 0.3 * c, 0.3 * s), V(0.35, R * c, R * s)).seg(V(0.45, 0.3 * c, 0.3 * s), V(0.45, R * c, R * s));
  }
  // terminal box on motor
  L.box(0.35, 0.7, 0.3, 0.48, -0.14, 0.14);
  // stand
  L.box(-0.9, 0.9, -1.62, -1.5, -0.8, 0.8);
  [-0.4, 0.4].forEach(x => {
    L.seg(V(x, -1.5, -0.7), V(x, -R * 0.82, -R * 0.55)).seg(V(x, -1.5, 0.7), V(x, -R * 0.82, R * 0.55));
    L.seg(V(x, -1.5, -0.7), V(x, -1.5, 0.7));
  });
  L.box(-0.5, 0.5, -R - 0.05, -R + 0.06, -0.45, 0.45);

  // rotor: hub, nose cone and twisted blades
  const B = new Lines();
  B.ringX(-0.08, 0.28, 32).ringX(0.12, 0.28, 32);
  [[-0.2, 0.24], [-0.3, 0.17], [-0.36, 0.08]].forEach(([x, r]) => B.ringX(x, r, 24));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; B.poly([V(0.12, 0.28 * Math.cos(a), 0.28 * Math.sin(a)), V(-0.08, 0.28 * Math.cos(a), 0.28 * Math.sin(a)), V(-0.36, 0.08 * Math.cos(a), 0.08 * Math.sin(a))]); }
  const blades = 7;
  for (let b = 0; b < blades; b++) {
    const a0 = (b / blades) * TAU, le = [], te = [], steps = 7;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps, r = 0.29 + (1.04 - 0.29) * u, twist = 0.55 - 0.35 * u, chord = 0.42 - 0.12 * u;
      le.push(V(-twist * 0.35, r * Math.cos(a0 + chord), r * Math.sin(a0 + chord)));
      te.push(V(twist * 0.3, r * Math.cos(a0 - chord * 0.4), r * Math.sin(a0 - chord * 0.4)));
    }
    B.poly(le).poly(te).seg(le[0], te[0]).seg(le[steps], te[steps]);
    for (let s = 1; s < steps; s++) B.seg(le[s], te[s]);
  }
  return {
    parts: [{ lines: L }, { lines: B, at: [-0.15, 0, 0], name: "rotor" }],
    scale: 0.95, offset: [0, 0.12, 0], yaw: 1.05,
    update(t, dt, level, nodes) { nodes.rotor.rotation.x += dt * (1.6 + level * 18); },
  };
}

function buildValve() {
  const L = new Lines();
  // pipe runs and flanges
  L.cylX(-2.1, -0.62, 0.26, 5, 12).cylX(0.62, 2.1, 0.26, 5, 12);
  L.flangeX(-2.1, 0.26, 0.42, 8, -1).flangeX(2.1, 0.26, 0.42, 8, 1);
  L.flangeX(-0.62, 0.26, 0.44, 8, -1).flangeX(0.62, 0.26, 0.44, 8, 1);
  L.flangeX(-1.0, 0.26, 0.44, 8, 1).flangeX(1.0, 0.26, 0.44, 8, -1);
  // globe body
  const prof = [];
  for (let i = 0; i <= 10; i++) { const x = -0.62 + 1.24 * (i / 10); prof.push([x, 0.28 + 0.3 * Math.sin((Math.PI * i) / 10)]); }
  prof.forEach(([x, r]) => L.ringX(x, r, 36));
  for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; L.poly(prof.map(([x, r]) => V(x, r * Math.cos(a), r * Math.sin(a)))); }
  // bonnet + yoke
  L.flangeY(0.5, 0.18, 0.36, 6).cylY(0.56, 0.98, 0.18, 4, 10);
  L.seg(V(-0.2, 0.98, 0), V(-0.2, 1.08, 0)).seg(V(0.2, 0.98, 0), V(0.2, 1.08, 0));
  // solenoid actuator housing
  L.box(-0.42, 0.42, 1.08, 1.86, -0.34, 0.34).box(-0.46, 0.46, 1.86, 1.93, -0.38, 0.38);
  // coil windings visible through the housing
  for (let i = 0; i <= 10; i++) L.ringY(1.16 + i * 0.062, 0.25, 28);
  L.cylY(1.16, 1.78, 0.25, 0, 8);
  // connector box and cable
  L.box(0.42, 0.66, 1.4, 1.66, -0.12, 0.12);
  const cable = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14; cable.push(V(0.66 + 0.9 * t, 1.53 - 1.1 * t * t, 0.15 * Math.sin(t * 3))); }
  L.poly(cable);
  // manual override knob and nameplate
  L.ringY(1.93, 0.12, 16).ringY(2.0, 0.12, 16).box(-0.3, 0.1, 1.3, 1.55, 0.34, 0.345);
  // pipe supports
  [-1.6, 1.6].forEach(x => {
    L.box(x - 0.12, x + 0.12, -1.0, -0.26, -0.08, 0.08).box(x - 0.35, x + 0.35, -1.08, -1.0, -0.3, 0.3);
    L.ringX(x, 0.3, 24);
  });

  // plunger: moves up when the solenoid energises
  const P = new Lines();
  P.cylY(0, 0.62, 0.07, 3, 6).ringY(0.62, 0.11, 12);
  P.cylY(-0.12, 0, 0.2, 1, 8); // valve disc
  return {
    parts: [{ lines: L }, { lines: P, at: [0, 0.45, 0], name: "plunger" }],
    scale: 0.9, offset: [0, -0.35, 0], yaw: -0.3,
    update(t, dt, level, nodes) {
      const cycle = (t * 0.55) % 1, open = cycle > 0.5 ? 1 : 0;
      const k = Math.min(1, dt * 22);
      nodes.plunger.userData.y = (nodes.plunger.userData.y ?? 0) + ((open ? 0.16 : 0) - (nodes.plunger.userData.y ?? 0)) * k;
      nodes.plunger.position.y = 0.45 + nodes.plunger.userData.y + (Math.random() - 0.5) * level * 0.02;
    },
  };
}

function buildSlider() {
  const L = new Lines();
  const x0 = -1.75, x1 = 1.9;
  // base plate with T-slots
  L.box(x0 - 0.15, x1 + 0.15, -0.82, -0.66, -0.66, 0.66);
  [-0.42, 0, 0.42].forEach(z => L.seg(V(x0 - 0.1, -0.66, z), V(x1 + 0.1, -0.66, z)));
  // end blocks
  L.box(x0 - 0.15, x0 + 0.12, -0.66, 0.18, -0.55, 0.55).box(x1 - 0.12, x1 + 0.15, -0.66, 0.18, -0.55, 0.55);
  // guide rods
  L.cylX(x0 + 0.12, x1 - 0.12, 0.07, 14, 6, -0.12, -0.38).cylX(x0 + 0.12, x1 - 0.12, 0.07, 14, 6, -0.12, 0.38);
  // motor at the left end, coupling
  L.cylX(-2.75, x0 - 0.15, 0.3, 7, 12).ringX(-2.82, 0.2).box(x0 - 0.15 - 0.02, x0 - 0.15, -0.35, 0.35, -0.35, 0.35);
  L.box(-2.55, -2.2, 0.3, 0.46, -0.13, 0.13);
  L.cylX(x0 + 0.12, x0 + 0.3, 0.1, 2, 6, -0.12, 0);
  // limit sensors
  [x0 + 0.5, x1 - 0.5].forEach(x => L.box(x - 0.05, x + 0.05, -0.66, -0.4, 0.58, 0.64));
  // cable carrier along the back
  for (let i = 0; i <= 16; i++) { const x = x0 + ((x1 - x0) * i) / 16; L.box(x - 0.08, x + 0.08, -0.62, -0.5, -0.66, -0.58); }

  // ball screw (spins)
  const S = new Lines();
  S.helixX(x0 + 0.3, x1 - 0.12, 0.085, 0.13, 14);
  S.seg(V(x0 + 0.3, 0, 0), V(x1 - 0.12, 0, 0));

  // carriage (travels)
  const C = new Lines();
  C.box(-0.42, 0.42, -0.3, 0.18, -0.56, 0.56).box(-0.48, 0.48, 0.18, 0.26, -0.62, 0.62);
  [-0.38, 0.38].forEach(z => { C.ringX(-0.42, 0.13, 20, -0.12, z).ringX(0.42, 0.13, 20, -0.12, z); });
  C.ringX(-0.42, 0.14, 20, -0.12, 0).ringX(0.42, 0.14, 20, -0.12, 0);
  // payload fixture on top
  C.box(-0.25, 0.25, 0.26, 0.6, -0.25, 0.25).cylY(0.6, 0.78, 0.12, 2, 8);
  return {
    parts: [{ lines: L }, { lines: S, at: [0, -0.12, 0], name: "screw" }, { lines: C, name: "carriage" }],
    scale: 0.98, offset: [0.4, 0.1, 0], yaw: 0.45,
    update(t, dt, level, nodes) {
      const phase = Math.sin(t * 0.9), x = phase * 1.0 + 0.1;
      const v = Math.cos(t * 0.9);
      nodes.carriage.position.x = x + (Math.random() - 0.5) * level * 0.02;
      nodes.screw.rotation.x += dt * v * 9;
    },
  };
}

const MACHINES = { pump: buildPump, fan: buildFan, valve: buildValve, slider: buildSlider };

// ---------------------------------------------------------------------------
export function createHologram(canvas) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch { return null; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0.9, 6.9);
  camera.lookAt(0, 0, 0);

  const world = new THREE.Group();
  world.rotation.x = 0.16;
  scene.add(world);
  const stage = new THREE.Group(); // holds the current machine, scaled during swaps
  world.add(stage);

  const painted = []; // { geo, tMix, col }
  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const glowMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });

  function toObject(lines) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(lines.p), n = pos.length / 3;
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const col = new Float32Array(n * 3), tMix = new Float32Array(n);
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const g = new THREE.Group();
    const a = new THREE.LineSegments(geo, lineMat), b = new THREE.LineSegments(geo, glowMat);
    b.scale.setScalar(1.012);
    g.add(a, b);
    return { g, geo, tMix, col, pos, n };
  }

  let machine = null, machineName = "", nodes = {};
  function mount(name) {
    stage.clear();
    painted.length = 0;
    nodes = {};
    const def = MACHINES[name]();
    const root = new THREE.Group();
    root.scale.setScalar(def.scale);
    root.position.set(...def.offset);
    def.parts.forEach(part => {
      const o = toObject(part.lines);
      if (part.at) o.g.position.set(...part.at);
      // colour gradient in machine space so moving parts match their surroundings
      const ox = part.at?.[0] || 0, oy = part.at?.[1] || 0;
      for (let i = 0; i < o.n; i++) {
        const x = o.pos[i * 3] + ox, y = o.pos[i * 3 + 1] + oy;
        o.tMix[i] = Math.min(1, Math.max(0, ((x + 2.8) / 5.6) * 0.85 + ((y + 1.2) / 3.2) * 0.3));
      }
      painted.push(o);
      root.add(o.g);
      if (part.name) nodes[part.name] = o.g;
    });
    stage.add(root);
    machine = def;
    machineName = name;
    colorDirty = true;
  }

  // ---------- particle shell ----------
  const P = 2600, pPos = new Float32Array(P * 3), pSeed = new Float32Array(P);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < P; i++) {
    const y = 1 - (i / (P - 1)) * 2, rr = Math.sqrt(1 - y * y), th = golden * i, R = 2.35 + (Math.random() - 0.5) * 0.14;
    pPos.set([Math.cos(th) * rr * R, y * R * 0.92, Math.sin(th) * rr * R], i * 3);
    pSeed[i] = Math.random();
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const pCol = new Float32Array(P * 3);
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.026, vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const shell = new THREE.Points(pGeo, pMat);
  world.add(shell);

  // ---------- 8-microphone ring ----------
  const sensorRing = new THREE.Group();
  const ringPts = [];
  for (let i = 0; i <= 96; i++) { const a = (i / 96) * TAU; ringPts.push(V(Math.cos(a) * 2.75, 0, Math.sin(a) * 2.75)); }
  sensorRing.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts),
    new THREE.LineBasicMaterial({ color: 0x7d8bff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending })));
  const mics = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU, g = new THREE.Group();
    g.position.set(Math.cos(a) * 2.75, 0, Math.sin(a) * 2.75);
    const c = [];
    for (let k = 0; k <= 20; k++) { const b = (k / 20) * TAU; c.push(V(Math.cos(b) * 0.09, Math.sin(b) * 0.09, 0)); }
    const loop = new THREE.Line(new THREE.BufferGeometry().setFromPoints(c),
      new THREE.LineBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }));
    loop.lookAt(0, 0, 0);
    const dot = new THREE.Points(new THREE.BufferGeometry().setFromPoints([V(0, 0, 0)]),
      new THREE.PointsMaterial({ size: 0.12, color: 0x9fe8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(loop, dot);
    sensorRing.add(g);
    mics.push({ g, dot });
  }
  sensorRing.rotation.set(0.22, 0, 0.12);
  world.add(sensorRing);

  // ---------- scan ring ----------
  const scanPts = [];
  for (let i = 0; i <= 64; i++) { const a = (i / 64) * TAU; scanPts.push(V(0, Math.cos(a) * 1.3, Math.sin(a) * 1.3)); }
  const scan = new THREE.Line(new THREE.BufferGeometry().setFromPoints(scanPts),
    new THREE.LineBasicMaterial({ color: 0xbaffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }));
  world.add(scan);

  // ---------- state ----------
  let mode = "idle", level = 0, levelSmooth = 0, micsOn = false;
  const cur = [PALETTES.idle[0].clone(), PALETTES.idle[1].clone()];
  let colorDirty = true;
  function paint() {
    const a = cur[0], b = cur[1];
    for (const o of painted) {
      for (let i = 0; i < o.n; i++) {
        const t = o.tMix[i];
        o.col[i * 3] = a.r + (b.r - a.r) * t; o.col[i * 3 + 1] = a.g + (b.g - a.g) * t; o.col[i * 3 + 2] = a.b + (b.b - a.b) * t;
      }
      o.geo.attributes.color.needsUpdate = true;
    }
    for (let i = 0; i < P; i++) {
      const t = pSeed[i], k = 0.5 + 0.5 * t;
      pCol[i * 3] = (a.r + (b.r - a.r) * t) * k; pCol[i * 3 + 1] = (a.g + (b.g - a.g) * t) * k; pCol[i * 3 + 2] = (a.b + (b.b - a.b) * t) * k;
    }
    pGeo.attributes.color.needsUpdate = true;
  }

  // ---------- machine swap animation ----------
  let swap = null; // { to, start }
  function setMachine(name) {
    if (!MACHINES[name] || name === machineName || swap?.to === name) return;
    if (!machine || reduce) { mount(name); return; }
    swap = { to: name, start: performance.now(), mounted: false };
  }

  // ---------- interaction ----------
  let yaw = -0.6, yawVel = reduce ? 0 : 0.0016, dragging = false, lastX = 0, pitch = 0;
  canvas.addEventListener("pointerdown", e => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", e => {
    if (!dragging) return;
    const dx = e.clientX - lastX; lastX = e.clientX;
    yaw += dx * 0.008; yawVel = dx * 0.0006;
    pitch = Math.max(-0.35, Math.min(0.35, pitch + e.movementY * 0.004));
  });
  const release = () => { dragging = false; };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w / h < 1.1 ? 8.2 : 6.9;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const clock = new THREE.Clock();
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);

  mount("pump");

  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;

    // swap: shrink into the core, rebuild, bloom back out
    if (swap) {
      const k = (performance.now() - swap.start) / 700;
      if (k < 0.4) stage.scale.setScalar(1 - easeIn(k / 0.4));
      else {
        if (!swap.mounted) { mount(swap.to); swap.mounted = true; }
        const u = Math.min(1, (k - 0.4) / 0.6);
        stage.scale.setScalar(Math.max(0.001, easeOutBack(u)));
        if (u >= 1) swap = null;
      }
      if (stage.scale.x < 0.001) stage.scale.setScalar(0.001);
    }

    const target = PALETTES[mode] || PALETTES.idle;
    for (let k = 0; k < 2; k++) {
      const c = cur[k], g = target[k];
      if (Math.abs(c.r - g.r) + Math.abs(c.g - g.g) + Math.abs(c.b - g.b) > 0.004) { c.lerp(g, Math.min(1, dt * 4)); colorDirty = true; }
    }
    if (colorDirty) { paint(); colorDirty = false; }

    if (!dragging) { yaw += yawVel; yawVel += ((reduce ? 0 : 0.0016) - yawVel) * 0.02; }
    world.rotation.y = yaw + (machine?.yaw || 0);
    world.rotation.x = 0.16 + pitch;

    levelSmooth += (level - levelSmooth) * 0.25;
    if (machine && !reduce) machine.update(t, dt, mode === "preview" ? 0.15 : levelSmooth, nodes);
    const shake = reduce ? 0 : levelSmooth * (mode === "anomalous" ? 0.05 : 0.022);
    stage.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    shell.scale.setScalar(1 + Math.sin(t * 1.3) * 0.008 + levelSmooth * 0.06);
    shell.rotation.y = -t * 0.03;
    pMat.size = 0.024 + levelSmooth * 0.02;
    lineMat.opacity = mode === "anomalous" ? 0.75 + 0.25 * Math.sin(t * 6) : 0.9;

    sensorRing.rotation.y = t * 0.05;
    mics.forEach(m => { m.g.scale.setScalar(micsOn ? 1.6 + levelSmooth * 1.4 : 1); m.dot.material.opacity = micsOn ? 1 : 0.5; });

    if (mode === "listening") {
      const p = (t * 0.7) % 1;
      scan.position.x = -2.2 + p * 4.4;
      scan.material.opacity = Math.sin(p * Math.PI) * 0.9;
      scan.scale.setScalar(0.9 + 0.25 * Math.sin(p * Math.PI));
    } else scan.material.opacity *= 0.9;

    renderer.render(scene, camera);
  }
  frame();

  return {
    setMachine,
    setState(s) { mode = PALETTES[s] ? s : "idle"; },
    setLevel(v) { level = Math.max(0, Math.min(1, v)); },
    setMics(on) { micsOn = on; },
  };
}

const easeIn = x => x * x * x;
const easeOutBack = x => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
