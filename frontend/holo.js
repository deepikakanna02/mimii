// Wireframe "hologram" of a centrifugal pump: motor, coupling, volute casing,
// suction and discharge flanges, base frame, a particle shell and the 8-mic
// sensor ring used in MIMII recordings. Purely presentational.
import * as THREE from "three";

const PALETTES = {
  idle:      [new THREE.Color("#3fe3e0"), new THREE.Color("#9a6cff")],
  listening: [new THREE.Color("#6ff6ff"), new THREE.Color("#7d8bff")],
  normal:    [new THREE.Color("#36e3ad"), new THREE.Color("#4aa8ff")],
  anomalous: [new THREE.Color("#ffb14a"), new THREE.Color("#ff3d6e")],
  error:     [new THREE.Color("#8a93ad"), new THREE.Color("#5b6480")],
};

export function createHologram(canvas) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null; // no WebGL: the page still works without the hologram
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0.9, 6.9);
  camera.lookAt(0, 0, 0);

  const world = new THREE.Group();
  world.rotation.x = 0.16;
  scene.add(world);
  const pump = new THREE.Group();
  world.add(pump);

  // ---------- line builder ----------
  const pos = [];
  const seg = (a, b) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // circle around the X axis at x, radius r, offset (cy, cz)
  function ringX(x, r, n = 40, cy = 0, cz = 0) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
      seg(V(x, cy + r * Math.cos(a), cz + r * Math.sin(a)), V(x, cy + r * Math.cos(b), cz + r * Math.sin(b)));
    }
  }
  // circle around the Y axis (horizontal ring) at height y
  function ringY(y, r, n = 32, cx = 0, cz = 0) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
      seg(V(cx + r * Math.cos(a), y, cz + r * Math.sin(a)), V(cx + r * Math.cos(b), y, cz + r * Math.sin(b)));
    }
  }
  function cylX(x0, x1, r, rings, ribs, cy = 0, cz = 0) {
    for (let i = 0; i <= rings; i++) ringX(x0 + ((x1 - x0) * i) / rings, r, 40, cy, cz);
    for (let k = 0; k < ribs; k++) {
      const a = (k / ribs) * Math.PI * 2;
      seg(V(x0, cy + r * Math.cos(a), cz + r * Math.sin(a)), V(x1, cy + r * Math.cos(a), cz + r * Math.sin(a)));
    }
  }
  function box(x0, x1, y0, y1, z0, z1) {
    const c = [V(x0, y0, z0), V(x1, y0, z0), V(x1, y1, z0), V(x0, y1, z0), V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1)];
    [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => seg(c[a], c[b]));
  }
  function flangeX(x, rIn, rOut, bolts = 8) {
    ringX(x, rIn); ringX(x, rOut); ringX(x + 0.06, rOut);
    for (let k = 0; k < bolts; k++) {
      const a = (k / bolts) * Math.PI * 2, rb = (rIn + rOut) / 2 + 0.02;
      ringX(x + 0.065, 0.025, 10, rb * Math.cos(a), rb * Math.sin(a));
    }
  }

  // Motor with cooling fins
  const mx0 = -2.05, mx1 = -0.35, mr = 0.64;
  for (let i = 0; i <= 14; i++) ringX(mx0 + ((mx1 - mx0) * i) / 14, mr + (i % 2 ? 0.035 : 0), 44);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    seg(V(mx0, mr * Math.cos(a), mr * Math.sin(a)), V(mx1, mr * Math.cos(a), mr * Math.sin(a)));
  }
  // fan cowl at the back
  ringX(mx0 - 0.18, 0.56); ringX(mx0 - 0.28, 0.4); ringX(mx0 - 0.3, 0.16);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    seg(V(mx0, mr * Math.cos(a), mr * Math.sin(a)), V(mx0 - 0.18, 0.56 * Math.cos(a), 0.56 * Math.sin(a)));
    seg(V(mx0 - 0.28, 0.4 * Math.cos(a), 0.4 * Math.sin(a)), V(mx0 - 0.3, 0.16 * Math.cos(a), 0.16 * Math.sin(a)));
  }
  // terminal box
  box(-1.55, -0.95, mr - 0.02, mr + 0.34, -0.24, 0.24);
  box(-1.45, -1.05, mr + 0.34, mr + 0.38, -0.18, 0.18);
  // shaft, coupling guard, bearing bracket
  cylX(mx1, -0.05, 0.12, 2, 6);
  cylX(-0.05, 0.22, 0.24, 3, 10);
  for (let i = 0; i <= 4; i++) ringX(0.22 + i * 0.1, 0.24 + i * 0.06, 36);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    seg(V(0.22, 0.24 * Math.cos(a), 0.24 * Math.sin(a)), V(0.62, 0.48 * Math.cos(a), 0.48 * Math.sin(a)));
  }

  // Volute: spiral tube in the YZ plane around the shaft, centred at x = vx
  const vx = 0.95, turns = 30;
  const volR = t => 0.52 + 0.24 * t, volr = t => 0.2 + 0.1 * t;
  const sections = [];
  for (let i = 0; i <= turns; i++) {
    const t = i / turns, th = -Math.PI / 2 + t * Math.PI * 2 * 0.92;
    const R = volR(t), r = volr(t), pts = [];
    for (let j = 0; j < 14; j++) {
      const ph = (j / 14) * Math.PI * 2;
      const rad = R + r * Math.cos(ph);
      pts.push(V(vx + r * Math.sin(ph), rad * Math.cos(th), rad * Math.sin(th)));
    }
    sections.push(pts);
    for (let j = 0; j < 14; j++) seg(pts[j], pts[(j + 1) % 14]);
  }
  for (let i = 0; i < turns; i++) for (let j = 0; j < 14; j += 2) seg(sections[i][j], sections[i + 1][j]);
  // casing faces + impeller eye
  ringX(vx - 0.2, 0.62); ringX(vx + 0.2, 0.62); ringX(vx + 0.24, 0.36);
  for (let k = 0; k < 7; k++) { // impeller vanes visible through the eye
    const a = (k / 7) * Math.PI * 2;
    const p = [];
    for (let s = 0; s <= 6; s++) {
      const rr = 0.08 + s * 0.045, aa = a + s * 0.18;
      p.push(V(vx + 0.2, rr * Math.cos(aa), rr * Math.sin(aa)));
    }
    for (let s = 0; s < p.length - 1; s++) seg(p[s], p[s + 1]);
  }
  // suction pipe + flange along +X
  cylX(vx + 0.24, 1.75, 0.22, 4, 12);
  flangeX(1.75, 0.22, 0.38);
  // discharge pipe going up from the end of the spiral
  const dz = 0.62, dx = vx;
  for (let i = 0; i <= 5; i++) ringY(0.55 + i * 0.16, 0.19, 28, dx, dz);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    seg(V(dx + 0.19 * Math.cos(a), 0.55, dz + 0.19 * Math.sin(a)), V(dx + 0.19 * Math.cos(a), 1.35, dz + 0.19 * Math.sin(a)));
  }
  ringY(1.35, 0.34, 32, dx, dz); ringY(1.41, 0.34, 32, dx, dz); ringY(1.41, 0.19, 24, dx, dz);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ringY(1.42, 0.025, 8, dx + 0.27 * Math.cos(a), dz + 0.27 * Math.sin(a));
  }
  // base frame and feet
  box(-2.3, 1.95, -1.02, -0.9, -0.72, 0.72);
  box(-2.2, 1.85, -0.9, -0.86, -0.62, 0.62);
  [[-1.8, -0.75], [-0.75, -0.75], [0.6, -0.7], [1.3, -0.82]].forEach(([x, top]) => {
    box(x - 0.14, x + 0.14, -0.86, top, -0.5, -0.36);
    box(x - 0.14, x + 0.14, -0.86, top, 0.36, 0.5);
  });
  // anchor bolts
  [-2.1, -0.2, 1.7].forEach(x => { ringY(-0.9, 0.05, 10, x, 0.6); ringY(-0.9, 0.05, 10, x, -0.6); });

  const geo = new THREE.BufferGeometry();
  const posArr = new Float32Array(pos);
  geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
  geo.translate(0.1, 0.05, 0);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const n = posArr.length / 3;
  const tMix = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = posArr[i * 3], y = posArr[i * 3 + 1];
    tMix[i] = Math.min(1, Math.max(0, ((x - bb.min.x) / (bb.max.x - bb.min.x)) * 0.8 + ((y - bb.min.y) / (bb.max.y - bb.min.y)) * 0.35));
  }
  const colArr = new Float32Array(n * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(geo, lineMat);
  pump.add(lines);
  // faint duplicate for a cheap glow
  const glow = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(1.012);
  pump.add(glow);
  pump.scale.setScalar(0.92);

  // ---------- particle shell ----------
  const P = 2600, pPos = new Float32Array(P * 3), pSeed = new Float32Array(P);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < P; i++) {
    const y = 1 - (i / (P - 1)) * 2, rr = Math.sqrt(1 - y * y), th = golden * i;
    const R = 2.35 + (Math.random() - 0.5) * 0.14;
    pPos.set([Math.cos(th) * rr * R, y * R * 0.92, Math.sin(th) * rr * R], i * 3);
    pSeed[i] = Math.random();
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const pCol = new Float32Array(P * 3);
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.028, vertexColors: true, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  const shell = new THREE.Points(pGeo, pMat);
  world.add(shell);

  // ---------- sensor ring: 8 microphones ----------
  const sensorRing = new THREE.Group();
  const ringPts = [];
  for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; ringPts.push(V(Math.cos(a) * 2.75, 0, Math.sin(a) * 2.75)); }
  const ringLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts),
    new THREE.LineBasicMaterial({ color: 0x7d8bff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending }));
  sensorRing.add(ringLine);
  const nodes = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * 2.75, 0, Math.sin(a) * 2.75);
    const c = [];
    for (let k = 0; k <= 20; k++) { const b = (k / 20) * Math.PI * 2; c.push(V(Math.cos(b) * 0.09, Math.sin(b) * 0.09, 0)); }
    const loop = new THREE.Line(new THREE.BufferGeometry().setFromPoints(c),
      new THREE.LineBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }));
    loop.lookAt(0, 0, 0);
    const dot = new THREE.Points(new THREE.BufferGeometry().setFromPoints([V(0, 0, 0)]),
      new THREE.PointsMaterial({ size: 0.12, color: 0x9fe8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(loop, dot);
    sensorRing.add(g);
    nodes.push({ g, loop, dot });
  }
  sensorRing.rotation.set(0.22, 0, 0.12);
  world.add(sensorRing);

  // a second, tilted orbit for depth
  const orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts.map(p => p.clone().multiplyScalar(1.08))),
    new THREE.LineBasicMaterial({ color: 0x3fe3e0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending }));
  orbit.rotation.set(1.2, 0.3, 0.4);
  world.add(orbit);

  // ---------- scan ring (while the model is working) ----------
  const scanPts = [];
  for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; scanPts.push(V(0, Math.cos(a) * 1.2, Math.sin(a) * 1.2)); }
  const scan = new THREE.Line(new THREE.BufferGeometry().setFromPoints(scanPts),
    new THREE.LineBasicMaterial({ color: 0xbaffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }));
  pump.add(scan);

  // ---------- state ----------
  let mode = "idle", level = 0, levelSmooth = 0, activeMic = -1;
  const cur = [PALETTES.idle[0].clone(), PALETTES.idle[1].clone()];
  let colorDirty = true;
  function paint() {
    const a = cur[0], b = cur[1];
    for (let i = 0; i < n; i++) {
      const t = tMix[i];
      colArr[i * 3] = a.r + (b.r - a.r) * t; colArr[i * 3 + 1] = a.g + (b.g - a.g) * t; colArr[i * 3 + 2] = a.b + (b.b - a.b) * t;
    }
    geo.attributes.color.needsUpdate = true;
    for (let i = 0; i < P; i++) {
      const t = pSeed[i], k = 0.55 + 0.45 * t;
      pCol[i * 3] = (a.r + (b.r - a.r) * t) * k; pCol[i * 3 + 1] = (a.g + (b.g - a.g) * t) * k; pCol[i * 3 + 2] = (a.b + (b.b - a.b) * t) * k;
    }
    pGeo.attributes.color.needsUpdate = true;
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

  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;

    // colour easing towards the state palette
    const target = PALETTES[mode] || PALETTES.idle;
    for (let k = 0; k < 2; k++) {
      const c = cur[k], g = target[k];
      if (Math.abs(c.r - g.r) + Math.abs(c.g - g.g) + Math.abs(c.b - g.b) > 0.004) { c.lerp(g, Math.min(1, dt * 4)); colorDirty = true; }
    }
    if (colorDirty) { paint(); colorDirty = false; }

    if (!dragging) { yaw += yawVel; yawVel += ((reduce ? 0 : 0.0016) - yawVel) * 0.02; }
    world.rotation.y = yaw;
    world.rotation.x = 0.16 + pitch;

    levelSmooth += (level - levelSmooth) * 0.25;
    const shake = reduce ? 0 : levelSmooth * (mode === "anomalous" ? 0.05 : 0.025);
    pump.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    const breathe = 1 + Math.sin(t * 1.3) * 0.008 + levelSmooth * 0.06;
    shell.scale.setScalar(breathe);
    shell.rotation.y = -t * 0.03;
    pMat.size = 0.026 + levelSmooth * 0.02;
    lineMat.opacity = mode === "anomalous" ? 0.75 + 0.25 * Math.sin(t * 6) : 0.9;

    sensorRing.rotation.y = t * 0.05;
    orbit.rotation.z = 0.4 + t * 0.04;
    nodes.forEach((nd, i) => {
      const on = activeMic === -2 || i === activeMic;
      const s = on ? 1.6 + levelSmooth * 1.4 : 1;
      nd.g.scale.setScalar(s);
      nd.dot.material.opacity = on ? 1 : 0.55;
    });

    if (mode === "listening") {
      const p = (t * 0.7) % 1;
      scan.position.x = -2.2 + p * 4.3;
      scan.material.opacity = Math.sin(p * Math.PI) * 0.9;
      scan.scale.setScalar(0.9 + 0.25 * Math.sin(p * Math.PI));
    } else scan.material.opacity *= 0.9;

    renderer.render(scene, camera);
  }
  frame();

  return {
    setState(s) { mode = PALETTES[s] ? s : "idle"; },
    setLevel(v) { level = Math.max(0, Math.min(1, v)); },
    setActiveMic(i) { activeMic = i; }, // -1 none, -2 all, 0..7 one channel
  };
}
