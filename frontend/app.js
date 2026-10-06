import { createHologram } from "./holo.js";

// ---- API location -----------------------------------------------------------
// Served by FastAPI on :8000 -> same origin. Opened from Live Server / file:// ->
// talk to the local backend. Override with ?api=http://host:port
const params = new URLSearchParams(location.search);
const API = (params.get("api") ||
  (location.protocol === "file:" || location.port !== "8000" ? "http://127.0.0.1:8000" : "")).replace(/\/$/, "");
const MAX_BYTES = 20 * 1024 * 1024;
const RING_C = 2 * Math.PI * 34;

const $ = id => document.getElementById(id);
const el = {
  status: $("status"), statusText: $("status-text"),
  file: $("file-input"), navCount: $("nav-count"),
  holo: $("holo"), holoCap: $("holo-cap"),
  tScore: $("t-score"), tTime: $("t-time"), tLimit: $("t-limit"),
  wave: $("wave"), spec: $("spec"), timeline: $("timeline"), profile: $("profile"), peak: $("peak"),
  clock: $("clock"), play: $("btn-play"), audio: $("audio"),
  devPump: $("dev-pump"), devState: $("dev-pump-state"), devWave: $("dev-pump-wave"),
  identity: $("identity"), idFile: $("id-file"), pill: $("pill"), note: $("id-note"),
  ringScore: document.querySelector("#ring-score .ring-fg"), ringScoreV: $("ring-score-v"), ringTick: $("ring-tick"),
  ringMargin: document.querySelector("#ring-margin .ring-fg"), ringMarginV: $("ring-margin-v"),
  ringAuc: document.querySelector("#ring-auc .ring-fg"), ringAucV: $("ring-auc-v"),
  logList: $("log-list"), tally: $("tally"), bars: $("bars"), toast: $("toast"),
};
const consoleView = $("view-console");

const state = { clips: [], current: null, threshold: null, online: false, seq: 0, busy: false, view: "console" };
const fmt = (v, d = 3) => (v == null || Number.isNaN(v) ? "--" : Number(v).toFixed(d));
const pct = v => `${Math.max(0, Math.min(1, v)) * 100}%`;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const holo = createHologram($("holo-canvas"));

// ---- Views ------------------------------------------------------------------
document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));
function showView(name) {
  state.view = name;
  document.querySelectorAll(".nav-item").forEach(b =>
    b.dataset.view === name ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  document.querySelectorAll(".view").forEach(v => (v.hidden = v.dataset.view !== name));
  if (name === "model") requestAnimationFrame(() =>
    el.bars.querySelectorAll(".bar").forEach((b, i) => setTimeout(() => (b.querySelector(".bar-fill").style.width = b.dataset.w), 80 + i * 90)));
  else el.bars.querySelectorAll(".bar-fill").forEach(f => (f.style.width = 0));
  if (name === "console") requestAnimationFrame(redrawAll);
}

// ---- Toast ------------------------------------------------------------------
let toastTimer;
function toast(html, ms = 7000) {
  el.toast.innerHTML = html;
  el.toast.hidden = false;
  el.toast.style.animation = "none"; void el.toast.offsetWidth; el.toast.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.toast.hidden = true), ms);
}

// ---- Backend status + model card ---------------------------------------------
async function checkHealth() {
  el.status.dataset.state = "checking";
  el.statusText.textContent = "Connecting";
  try {
    const r = await fetch(`${API}/health`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const h = await r.json();
    setOnline(true, h.device);
    loadModelInfo();
  } catch {
    setOnline(false);
  }
}
function setOnline(on, device) {
  state.online = on;
  el.status.dataset.state = on ? "online" : "offline";
  el.statusText.textContent = on ? `API online${device ? `, ${device.toUpperCase()}` : ""}` : "API offline, retry";
}

const ARCH = {
  supervised_combo: "Two autoencoders + classifier vote",
  conv_ae_v2: "Autoencoder v2 alone",
  conv_ae_v1: "Autoencoder v1 alone",
  ensemble: "Averaged autoencoders",
};

async function loadModelInfo() {
  try {
    const r = await fetch(`${API}/model-info`);
    if (!r.ok) return;
    const m = await r.json();
    setThreshold(m.threshold);
    $("k-auc").textContent = fmt(m.auc_roc);
    $("k-p").textContent = fmt(m.precision);
    $("k-r").textContent = fmt(m.recall);
    $("k-f1").textContent = fmt(m.f1);
    if (m.confusion_matrix) {
      const [[tn, fp], [fn, tp]] = m.confusion_matrix;
      $("mx-tn").textContent = tn; $("mx-fp").textContent = fp;
      $("mx-fn").textContent = fn; $("mx-tp").textContent = tp;
      $("model-sub").textContent = `Measured on ${tn + fp + fn + tp} pump clips the model never saw during training.`;
    }
    if (m.auc_roc != null) {
      el.ringAuc.style.strokeDashoffset = RING_C * (1 - m.auc_roc);
      el.ringAucV.textContent = fmt(m.auc_roc, 2);
    }
    if (m.combiner) $("vote-desc").textContent = "Logistic regression, random forest and gradient boosting vote, weighted by validation AUC";
    renderBars(m.comparison || []);
  } catch { /* placeholders stay */ }
}

function renderBars(rows) {
  el.bars.innerHTML = "";
  [...rows].sort((a, b) => b.auc_mean - a.auc_mean).forEach(r => {
    const li = document.createElement("li");
    li.className = `bar${r.is_winner ? " is-winner" : ""}`;
    li.innerHTML = `
      <span>${ARCH[r.architecture] || r.architecture}${r.is_winner ? "<em>In use</em>" : ""}</span>
      <span class="bar-track"><span class="bar-fill"></span>
        <span class="bar-err" style="left:${pct(r.auc_mean - r.auc_std)};width:${pct(2 * r.auc_std)}"></span></span>
      <span class="bar-v">${fmt(r.auc_mean, 2)}</span>`;
    li.dataset.w = pct(r.auc_mean);
    el.bars.appendChild(li);
  });
  if (state.view === "model") showView("model");
}

function setThreshold(t) {
  if (t == null) return;
  state.threshold = t;
  el.tLimit.textContent = fmt(t);
  el.ringTick.style.transform = `rotate(${t * 360}deg)`;
  el.ringTick.classList.add("on");
}

// ---- Intake -------------------------------------------------------------------
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function addFiles(list) {
  const files = [...list];
  if (!files.length) return;
  const skipped = [];
  let firstGood = null;
  for (const file of files) {
    const clip = { id: ++state.seq, file, name: file.name, status: "queued", result: null, error: null, view: null };
    if (!/\.wav$/i.test(file.name)) { clip.status = "error"; clip.error = "Not a .wav file."; skipped.push(file); }
    else if (file.size > MAX_BYTES) { clip.status = "error"; clip.error = "Larger than 20 MB."; skipped.push(file); }
    state.clips.push(clip);
    renderLogRow(clip, true);
    if (clip.status !== "error") { prepareView(clip); firstGood ??= clip; }
  }
  if (skipped.length) toast(`${skipped.length === 1 ? `<b>${escapeHtml(skipped[0].name)}</b> was` : `${skipped.length} files were`} skipped. Only .wav files up to 20 MB can be checked.`);
  if (firstGood) { if (state.view !== "console") showView("console"); select(firstGood); }
  renderTally();
  pump();
}

async function prepareView(clip) {
  try {
    const d = await DSP.decode(clip.file);
    const mel = DSP.logMel(d.mono);
    clip.view = { mono: d.mono, duration: d.duration, channels: d.channels, mel, rms: DSP.frameRms(d.mono), profile: DSP.bandProfile(mel) };
  } catch {
    clip.view = { failed: true };
  }
  if (state.current === clip) drawClip(clip);
}

// One request at a time, oldest first.
async function pump() {
  if (state.busy) return;
  const next = state.clips.find(c => c.status === "queued");
  if (!next) return;
  state.busy = true;
  next.status = "running";
  renderLogRow(next);
  if (state.current === next) showResult(next);

  const form = new FormData();
  // Some browsers leave the type empty for .wav; pin it so the API's content-type check passes.
  form.append("audio", next.file.type ? next.file : new File([next.file], next.name, { type: "audio/wav" }), next.name);
  const t0 = performance.now();
  try {
    const r = await fetch(`${API}/predict`, { method: "POST", body: form });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.detail || `The API answered with status ${r.status}.`);
    next.result = { ...body, roundtrip_ms: performance.now() - t0 };
    next.status = body.prediction === "anomalous" ? "anomalous" : "normal";
    if (state.threshold == null) setThreshold(body.threshold);
    if (!state.online) checkHealth();
  } catch (err) {
    next.status = "error";
    if (err instanceof TypeError) {
      next.error = "offline";
      setOnline(false);
      toast(`Could not reach the API at <code>${API || location.origin}</code>. Start it from the project folder with <code>uvicorn main:app</code>, then select the clip in History to retry.`, 10000);
    } else next.error = err.message;
  }
  renderLogRow(next);
  renderTally();
  if (state.current === next) showResult(next, true);
  state.busy = false;
  pump();
}

// ---- Selection ------------------------------------------------------------------
function select(clip) {
  if (state.current === clip) return;
  state.current = clip;
  el.audio.pause();
  if (el.audio.dataset.url) URL.revokeObjectURL(el.audio.dataset.url);
  const url = URL.createObjectURL(clip.file);
  el.audio.src = url; el.audio.dataset.url = url;
  el.logList.querySelectorAll(".log-row").forEach(b => b.setAttribute("aria-current", String(+b.dataset.id === clip.id)));
  el.idFile.textContent = clip.name;
  el.idFile.title = clip.name;
  showResult(clip);
  drawClip(clip);
}

// ---- Drawing ------------------------------------------------------------------------
function sizeCanvas(c) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return { w, h, dpr, ctx: c.getContext("2d") };
}
const ready = () => !!(state.current?.view && !state.current.view.failed);

function drawClip(clip) {
  const ok = !!(clip.view && !clip.view.failed);
  document.body.classList.toggle("has-clip", ok);
  el.holo.classList.toggle("has-clip", ok);
  el.play.disabled = !ok;
  setPlayhead(0);
  if (!ok) {
    [el.wave, el.timeline, el.profile, el.devWave].forEach(c => { const { ctx, w, h } = sizeCanvas(c); ctx.clearRect(0, 0, w, h); });
    el.spec.classList.remove("is-ready");
    el.peak.textContent = "Average over the clip";
    if (clip.view?.failed) el.note.textContent = "This browser could not decode the file for preview. The model can still score it.";
    return;
  }
  const v = clip.view;
  el.holoCap.textContent = v.channels > 1 ? `Sensor array, ${v.channels} channels mixed to mono` : "Single microphone";
  drawSpec(v.mel);
  redrawAll();
  let pk = 0;
  for (let m = 1; m < v.profile.length; m++) if (v.profile[m] > v.profile[pk]) pk = m;
  const hz = DSP.bandHz(pk);
  el.peak.textContent = `Strongest band near ${hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`}`;
}

function redrawAll() {
  if (!ready() || state.view !== "console") return;
  const p = progress();
  drawWave(p); drawTimeline(p); drawProfile(); drawDevWave();
}

let envCache = { key: "", env: null };
function drawWave(p) {
  const v = state.current.view;
  const { w, h, dpr, ctx } = sizeCanvas(el.wave);
  const bar = Math.max(2, Math.round(2.2 * dpr)), gap = Math.max(1, Math.round(1.6 * dpr));
  const cols = Math.floor(w / (bar + gap));
  const key = `${state.current.id}:${cols}`;
  if (envCache.key !== key) envCache = { key, env: DSP.envelope(v.mono, cols) };
  const { mins, maxs, peak } = envCache.env;
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, "#ff4fa3"); g.addColorStop(0.55, "#c45cff"); g.addColorStop(1, "#8a6cff");
  const mid = h / 2, scale = (h / 2 - 2 * dpr) / peak, split = p * cols;
  ctx.fillStyle = g;
  ctx.shadowColor = "rgba(255, 79, 163, 0.6)"; ctx.shadowBlur = 8 * dpr;
  for (let i = 0; i < cols; i++) {
    const amp = Math.max(Math.abs(maxs[i]), Math.abs(mins[i])) * scale;
    ctx.globalAlpha = i < split ? 1 : 0.42;
    ctx.fillRect(i * (bar + gap), mid - amp, bar, Math.max(dpr, amp * 2));
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

// magma-like: deep violet -> magenta -> orange -> pale yellow
const STOPS = [[11, 10, 29], [45, 17, 96], [114, 31, 129], [183, 55, 121], [241, 96, 93], [254, 175, 119], [252, 253, 191]];
const LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * (STOPS.length - 1), k = Math.min(STOPS.length - 2, Math.floor(x)), f = x - k;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = STOPS[k][c] + (STOPS[k + 1][c] - STOPS[k][c]) * f;
  }
  return lut;
})();
function drawSpec(mel) {
  const { frames, nMels } = DSP.CFG;
  el.spec.width = frames; el.spec.height = nMels;
  const ctx = el.spec.getContext("2d");
  const img = ctx.createImageData(frames, nMels);
  for (let m = 0; m < nMels; m++) {
    const row = nMels - 1 - m;
    for (let t = 0; t < frames; t++) {
      const v = Math.round(Math.pow(mel[m * frames + t], 1.6) * 255) * 3, o = (row * frames + t) * 4;
      img.data[o] = LUT[v]; img.data[o + 1] = LUT[v + 1]; img.data[o + 2] = LUT[v + 2]; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  el.spec.classList.remove("is-ready"); void el.spec.offsetWidth; el.spec.classList.add("is-ready");
}

function axisLabels(ctx, w, h, dpr, ticks) {
  ctx.fillStyle = "rgba(138, 147, 173, 0.9)";
  ctx.font = `${10 * dpr}px Manrope, sans-serif`;
  ctx.textBaseline = "bottom";
  ticks.forEach(([x, label], i) => {
    ctx.textAlign = i === 0 ? "left" : i === ticks.length - 1 ? "right" : "center";
    ctx.fillText(label, x, h);
  });
}

function drawTimeline(p) {
  const { rms } = state.current.view;
  const { w, h, dpr, ctx } = sizeCanvas(el.timeline);
  const bar = Math.max(2, Math.round(2 * dpr)), gap = Math.max(1, Math.round(2 * dpr));
  const cols = Math.floor(w / (bar + gap));
  ctx.clearRect(0, 0, w, h);
  const base = h - 14 * dpr;
  for (let i = 0; i < cols; i++) {
    const a = Math.floor((i / cols) * rms.length), b = Math.max(a + 1, Math.floor(((i + 1) / cols) * rms.length));
    let s = 0; for (let k = a; k < b; k++) s = Math.max(s, rms[k]);
    const bh = Math.max(2 * dpr, s * (base - 2 * dpr));
    ctx.fillStyle = i / cols < p ? "#3fe3e0" : "rgba(63, 227, 224, 0.32)";
    ctx.fillRect(i * (bar + gap), base - bh, bar, bh);
  }
  axisLabels(ctx, w, h, dpr, [0, 2.5, 5, 7.5, 10].map(s => [(s / 10) * w, s === 10 ? "10 s" : String(s)]));
}

function drawProfile() {
  const { profile } = state.current.view;
  const { w, h, dpr, ctx } = sizeCanvas(el.profile);
  const n = profile.length, gap = 1 * dpr, bw = (w - gap * (n - 1)) / n;
  ctx.clearRect(0, 0, w, h);
  let lo = Infinity, hi = -Infinity;
  for (const v of profile) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const base = h - 14 * dpr;
  for (let m = 0; m < n; m++) {
    const k = (profile[m] - lo) / (hi - lo || 1);
    const bh = Math.max(dpr, Math.pow(k, 1.5) * (base - 2 * dpr));
    ctx.fillStyle = `rgba(${Math.round(120 + 80 * k)}, ${Math.round(90 + 20 * k)}, 255, ${0.35 + 0.65 * k})`;
    ctx.fillRect(m * (bw + gap), base - bh, bw, bh);
  }
  // mel axis is non-linear: put each label where that frequency actually falls
  const bandX = hz => { let m = 0; while (m < n - 1 && DSP.bandHz(m) < hz) m++; return m * (bw + gap); };
  axisLabels(ctx, w, h, dpr, [[0, "0"], [bandX(500), "500"], [bandX(1000), "1k"], [bandX(2000), "2k"], [bandX(4000), "4k"], [w, "8 kHz"]]);
}

function drawDevWave() {
  const clip = state.current;
  const { w, h, dpr, ctx } = sizeCanvas(el.devWave);
  ctx.clearRect(0, 0, w, h);
  if (!ready()) return;
  const cols = Math.floor(w / (3 * dpr)), env = DSP.envelope(clip.view.mono, cols);
  ctx.fillStyle = clip.status === "anomalous" ? "#ff9a3d" : clip.status === "normal" ? "#36e3ad" : "#3fe3e0";
  for (let i = 0; i < cols; i++) {
    const a = (Math.max(Math.abs(env.maxs[i]), Math.abs(env.mins[i])) / env.peak) * (h / 2 - dpr);
    ctx.fillRect(i * 3 * dpr, h / 2 - a, 1.6 * dpr, Math.max(dpr, a * 2));
  }
}

// ---- Result display ------------------------------------------------------------------
let countRaf;
function showResult(clip, fresh = false) {
  const s = clip.status;
  const vstate = { queued: "listening", running: "listening", normal: "normal", anomalous: "anomalous", error: "error" }[s] || "idle";
  el.identity.dataset.state = vstate;
  consoleView.classList.toggle("is-listening", vstate === "listening");
  holo?.setState(vstate);

  const label = { listening: s === "queued" ? "Queued" : "Analysing", normal: "Healthy", anomalous: "Anomaly alert", error: "Not checked" }[vstate];
  if (el.pill.textContent !== label) {
    el.pill.textContent = label;
    el.pill.classList.remove("pop"); void el.pill.offsetWidth; el.pill.classList.add("pop");
  }
  el.devPump.className = `dev is-active is-${vstate}`;
  el.devState.textContent = { listening: "Analysing", normal: "Healthy", anomalous: "Anomaly alert", error: "Check failed" }[vstate];
  drawDevWave();

  cancelAnimationFrame(countRaf);
  if (clip.result) {
    const { anomaly_score: score, threshold, inference_ms } = clip.result;
    setThreshold(threshold);
    const margin = score - threshold;
    const room = margin >= 0 ? 1 - threshold : threshold;
    el.ringScore.style.strokeDashoffset = RING_C * (1 - score);
    el.ringMargin.style.strokeDashoffset = RING_C * (1 - Math.min(1, Math.abs(margin) / room));
    el.ringMarginV.textContent = `${margin >= 0 ? "+" : "−"}${fmt(Math.abs(margin), 2)}`;
    setTile(el.tTime, `${Math.round(inference_ms ?? clip.result.roundtrip_ms)}ms`, fresh);
    countTo(score, fresh && !reduceMotion);
    el.note.textContent = s === "anomalous"
      ? `Scored ${fmt(margin)} above the threshold. This sound does not match the healthy pumps the model learned from. Listen back and compare it with a recording from a pump you know is healthy.`
      : `Scored ${fmt(-margin)} below the threshold. This sound matches the healthy pumps the model learned from.`;
  } else {
    el.ringScore.style.strokeDashoffset = RING_C;
    el.ringMargin.style.strokeDashoffset = RING_C;
    el.ringScoreV.textContent = "--"; el.ringMarginV.textContent = "--";
    el.tScore.textContent = "--"; el.tTime.textContent = "--";
    el.note.textContent = s === "error"
      ? (clip.error === "offline" ? "The API could not be reached. Start the backend, then select this clip in History to retry." : `${clip.error} Pick a 10 second .wav pump recording.`)
      : s === "queued" ? "Waiting for the clips ahead of it to finish."
      : "Running both autoencoders and the classifier vote on this clip.";
  }
}

function setTile(node, text, flash) {
  node.textContent = text;
  if (flash) { node.classList.remove("flash"); void node.offsetWidth; node.classList.add("flash"); }
}

function countTo(target, animate) {
  const write = v => { el.ringScoreV.textContent = fmt(v, 2); el.tScore.textContent = fmt(v); };
  if (!animate) { write(target); return; }
  el.tScore.classList.remove("flash"); void el.tScore.offsetWidth; el.tScore.classList.add("flash");
  const start = performance.now(), dur = 1000;
  const step = now => {
    const k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 3);
    write(target * e);
    if (k < 1) countRaf = requestAnimationFrame(step);
  };
  countRaf = requestAnimationFrame(step);
}

// ---- History --------------------------------------------------------------------------
const TAGS = { queued: "Queued", running: "Analysing", normal: "Healthy", anomalous: "Anomaly", error: "Failed" };
function renderLogRow(clip, isNew = false) {
  let li = el.logList.querySelector(`li[data-id="${clip.id}"]`);
  if (!li) {
    li = document.createElement("li");
    li.dataset.id = clip.id;
    li.innerHTML = `<button class="log-row${isNew ? " enter" : ""}" type="button" data-id="${clip.id}">
        <span class="log-n">${clip.id}</span><span class="log-name"></span>
        <span class="mini"><span class="mini-zone"></span><span class="mini-dot"></span></span>
        <span class="log-score"></span><span class="tag"></span></button>`;
    const name = li.querySelector(".log-name");
    name.textContent = clip.name; name.title = clip.name;
    li.querySelector("button").addEventListener("click", () => {
      if (clip.status === "error" && clip.error === "offline") {
        clip.status = "queued"; clip.error = null; renderLogRow(clip); pump();
      }
      showView("console");
      if (state.current === clip) showResult(clip); else select(clip);
    });
    el.logList.prepend(li);
  }
  const btn = li.querySelector("button");
  btn.classList.toggle("is-normal", clip.status === "normal");
  btn.classList.toggle("is-anomalous", clip.status === "anomalous");
  btn.setAttribute("aria-current", String(state.current === clip));
  const tag = li.querySelector(".tag");
  tag.className = `tag tag-${clip.status}`;
  tag.textContent = clip.status === "error" && clip.error === "offline" ? "Retry" : TAGS[clip.status];
  btn.setAttribute("aria-label", `${clip.name}, ${tag.textContent}${clip.result ? `, score ${fmt(clip.result.anomaly_score)}` : ""}`);
  li.querySelector(".log-score").textContent = clip.result ? fmt(clip.result.anomaly_score) : "";
  const t = clip.result?.threshold ?? state.threshold;
  li.querySelector(".mini-zone").style.left = t != null ? pct(t) : "50%";
  const dot = li.querySelector(".mini-dot");
  dot.style.opacity = clip.result ? 1 : 0;
  if (clip.result) requestAnimationFrame(() => (dot.style.left = pct(clip.result.anomaly_score)));
}

function renderTally() {
  const done = state.clips.filter(c => c.result), bad = done.filter(c => c.status === "anomalous").length;
  el.navCount.hidden = !state.clips.length;
  el.navCount.textContent = state.clips.length;
  el.tally.textContent = done.length
    ? `${done.length} checked, ${bad} flagged as anomalies. Select one to open it in the console.`
    : "Recordings you check appear here. Select one to open it in the console.";
}

// ---- Playback --------------------------------------------------------------------------
const span = () => Math.min(10, el.audio.duration || 10);
const progress = () => Math.min(1, (el.audio.currentTime || 0) / span());
const slider = document.querySelector("[data-seek][role=slider]");
function setPlayhead(p) {
  document.querySelectorAll("[data-ph]").forEach(ph => {
    const inset = ph.previousElementSibling?.classList.contains("wave") ? 10 : 0;
    ph.style.left = `calc(${inset}px + ${p} * (100% - ${inset * 2}px))`;
  });
  const secs = p * span();
  el.clock.textContent = `${Math.floor(secs / 60)}:${(secs % 60).toFixed(1).padStart(4, "0")}`;
  slider.setAttribute("aria-valuenow", secs.toFixed(1));
  slider.setAttribute("aria-valuetext", `${secs.toFixed(1)} seconds`);
}

let raf;
function tick() {
  const p = progress();
  setPlayhead(p);
  drawWave(p); drawTimeline(p);
  const v = state.current?.view;
  if (v?.rms) holo?.setLevel(v.rms[Math.min(v.rms.length - 1, Math.floor(p * v.rms.length))]);
  if (!el.audio.paused) raf = requestAnimationFrame(tick);
}
el.play.addEventListener("click", () => (el.audio.paused ? el.audio.play() : el.audio.pause()));
el.audio.addEventListener("play", () => {
  el.play.classList.add("is-playing"); el.play.setAttribute("aria-label", "Pause");
  holo?.setActiveMic(-2); tick();
});
el.audio.addEventListener("pause", () => {
  el.play.classList.remove("is-playing"); el.play.setAttribute("aria-label", "Play recording");
  holo?.setActiveMic(-1); holo?.setLevel(0); cancelAnimationFrame(raf);
});
el.audio.addEventListener("timeupdate", () => { if (el.audio.currentTime >= span()) el.audio.pause(); });

function seekTo(p) {
  if (!ready()) return;
  p = Math.max(0, Math.min(1, p));
  if (el.audio.src) el.audio.currentTime = p * span();
  setPlayhead(p); drawWave(p); drawTimeline(p);
}
document.querySelectorAll("[data-seek]").forEach(zone => {
  let scrubbing = false;
  const at = e => { const r = zone.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
  zone.addEventListener("pointerdown", e => { scrubbing = true; zone.setPointerCapture(e.pointerId); seekTo(at(e)); });
  zone.addEventListener("pointermove", e => scrubbing && seekTo(at(e)));
  zone.addEventListener("pointerup", () => (scrubbing = false));
  zone.addEventListener("keydown", e => {
    const map = { ArrowRight: 0.05, ArrowLeft: -0.05 };
    if (e.key in map) { seekTo(progress() + map[e.key]); e.preventDefault(); }
    if (e.key === "Home") { seekTo(0); e.preventDefault(); }
  });
});
document.addEventListener("keydown", e => {
  if (e.code !== "Space" || el.play.disabled || state.view !== "console") return;
  if (e.target.closest("button, input, a")) return;
  e.preventDefault(); el.play.click();
});

// ---- File input + drag and drop ---------------------------------------------------------
el.file.addEventListener("change", () => { addFiles(el.file.files); el.file.value = ""; });
let dragDepth = 0;
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes("Files");
window.addEventListener("dragenter", e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; document.body.classList.add("is-dragging"); });
window.addEventListener("dragover", e => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("is-dragging"); } });
window.addEventListener("drop", e => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; document.body.classList.remove("is-dragging");
  addFiles(e.dataTransfer.files);
});

el.status.addEventListener("click", checkHealth);
let rz;
window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(redrawAll, 120); });
document.fonts?.ready.then(redrawAll);

checkHealth();
