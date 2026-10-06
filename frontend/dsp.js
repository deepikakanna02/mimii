/*
 * Display-only signal processing.
 * The anomaly decision is made entirely by the backend (common/scoring.py).
 * This file only draws a picture of the clip using the same mel settings as
 * artifacts/manifest.json so the user sees roughly what the model sees.
 */
const DSP = (() => {
  const CFG = { sr: 16000, nFft: 2048, hop: 512, nMels: 128, fmin: 0, fmax: 8000, topDb: 80, frames: 313, seconds: 10 };

  async function decode(file) {
    const bytes = await file.arrayBuffer();
    // An offline context at 16 kHz makes the browser resample to the model's rate.
    const ctx = new OfflineAudioContext(1, 1, CFG.sr);
    const buf = await ctx.decodeAudioData(bytes);
    const n = buf.length, ch = buf.numberOfChannels;
    const mono = new Float32Array(n);
    for (let c = 0; c < ch; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) mono[i] += d[i] / ch;
    }
    return { mono, duration: buf.duration, channels: ch, sampleRate: buf.sampleRate };
  }

  // Slaney mel scale (librosa default, htk=False)
  const F_SP = 200 / 3, MIN_LOG_HZ = 1000, MIN_LOG_MEL = MIN_LOG_HZ / F_SP, LOGSTEP = Math.log(6.4) / 27;
  const hzToMel = f => (f < MIN_LOG_HZ ? f / F_SP : MIN_LOG_MEL + Math.log(f / MIN_LOG_HZ) / LOGSTEP);
  const melToHz = m => (m < MIN_LOG_MEL ? F_SP * m : MIN_LOG_HZ * Math.exp(LOGSTEP * (m - MIN_LOG_MEL)));

  let filterBank = null;
  function melFilters() {
    if (filterBank) return filterBank;
    const nBins = CFG.nFft / 2 + 1;
    const fftFreqs = Array.from({ length: nBins }, (_, i) => (i * CFG.sr) / CFG.nFft);
    const mMin = hzToMel(CFG.fmin), mMax = hzToMel(CFG.fmax);
    const pts = Array.from({ length: CFG.nMels + 2 }, (_, i) => melToHz(mMin + ((mMax - mMin) * i) / (CFG.nMels + 1)));
    filterBank = [];
    for (let m = 0; m < CFG.nMels; m++) {
      const lo = pts[m], c = pts[m + 1], hi = pts[m + 2];
      const enorm = 2 / (hi - lo);
      const w = [];
      for (let k = 0; k < nBins; k++) {
        const f = fftFreqs[k];
        const v = Math.max(0, Math.min((f - lo) / (c - lo), (hi - f) / (hi - c)));
        if (v > 0) w.push([k, v * enorm]);
      }
      filterBank.push(w);
    }
    return filterBank;
  }

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }

  function logMel(mono) {
    const target = CFG.sr * CFG.seconds;
    const y = new Float32Array(target);
    y.set(mono.subarray(0, Math.min(target, mono.length)));
    const pad = CFG.nFft / 2, N = CFG.nFft, bins = N / 2 + 1;
    const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    const fb = melFilters();
    const out = new Float32Array(CFG.nMels * CFG.frames);
    const re = new Float64Array(N), im = new Float64Array(N), pow = new Float64Array(bins);
    let max = -Infinity;
    for (let t = 0; t < CFG.frames; t++) {
      const start = t * CFG.hop - pad;
      for (let i = 0; i < N; i++) {
        const idx = start + i;
        re[i] = idx >= 0 && idx < target ? y[idx] * win[i] : 0;
        im[i] = 0;
      }
      fft(re, im);
      for (let k = 0; k < bins; k++) pow[k] = re[k] * re[k] + im[k] * im[k];
      for (let m = 0; m < CFG.nMels; m++) {
        let s = 0;
        for (const [k, w] of fb[m]) s += pow[k] * w;
        const db = 10 * Math.log10(Math.max(s, 1e-10));
        out[m * CFG.frames + t] = db;
        if (db > max) max = db;
      }
    }
    const floor = max - CFG.topDb;
    for (let i = 0; i < out.length; i++) out[i] = (Math.max(out[i], floor) - floor) / CFG.topDb; // 0..1
    return out;
  }

  // Peak envelope per column for the waveform trace.
  function envelope(mono, columns) {
    const target = Math.min(mono.length, CFG.sr * CFG.seconds);
    const step = target / columns, mins = new Float32Array(columns), maxs = new Float32Array(columns);
    let peak = 1e-6;
    for (let c = 0; c < columns; c++) {
      let lo = 0, hi = 0;
      const a = Math.floor(c * step), b = Math.floor((c + 1) * step);
      for (let i = a; i < b; i++) { const v = mono[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      mins[c] = lo; maxs[c] = hi; peak = Math.max(peak, -lo, hi);
    }
    return { mins, maxs, peak };
  }

  // RMS loudness per model frame (same hop as the spectrogram), 0..1
  function frameRms(mono) {
    const out = new Float32Array(CFG.frames);
    let peak = 1e-9;
    for (let t = 0; t < CFG.frames; t++) {
      const a = t * CFG.hop, b = Math.min(mono.length, a + CFG.hop);
      let s = 0;
      for (let i = a; i < b; i++) s += mono[i] * mono[i];
      out[t] = b > a ? Math.sqrt(s / (b - a)) : 0;
      if (out[t] > peak) peak = out[t];
    }
    for (let t = 0; t < CFG.frames; t++) out[t] /= peak;
    return out;
  }

  // Average level per mel band over the clip, 0..1
  function bandProfile(mel) {
    const out = new Float32Array(CFG.nMels);
    for (let m = 0; m < CFG.nMels; m++) {
      let s = 0;
      for (let t = 0; t < CFG.frames; t++) s += mel[m * CFG.frames + t];
      out[m] = s / CFG.frames;
    }
    return out;
  }

  // Centre frequency of a mel band in Hz
  function bandHz(m) {
    const mMin = hzToMel(CFG.fmin), mMax = hzToMel(CFG.fmax);
    return melToHz(mMin + ((mMax - mMin) * (m + 1)) / (CFG.nMels + 1));
  }

  return { CFG, decode, logMel, envelope, frameRms, bandProfile, bandHz };
})();
