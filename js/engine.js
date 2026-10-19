'use strict';
L.engine = (() => {
  let E_autoAt;
  const { clamp } = L;

  // ---------- graph (works for live and offline contexts) ----------
  function noiseBuffer(c) {
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function impulse(g, size) {
    const key = size.toFixed(1);
    if (g.ir[key]) return g.ir[key];
    const c = g.ctx, n = Math.floor(c.sampleRate * size), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
    }
    return g.ir[key] = b;
  }
  function distCurve(amt) {
    const k = amt * 60, n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / (n - 1) - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    return c;
  }

  function makeGraph(c, proj) {
    const g = { ctx: c, tracks: new Map(), noise: noiseBuffer(c), ir: {}, live: new Set() };
    g.master = c.createGain();
    g.limiter = c.createDynamicsCompressor();
    Object.assign(g.limiter.threshold, { value: -2 }); g.limiter.knee.value = 0;
    g.limiter.ratio.value = 20; g.limiter.attack.value = 0.002; g.limiter.release.value = 0.12;
    g.an = c.createAnalyser(); g.an.fftSize = 512;
    g.master.connect(g.limiter).connect(g.an).connect(c.destination);
    proj.tracks.forEach(t => addTrack(g, t));
    syncAll(g, proj);
    return g;
  }

  function addTrack(g, t) {
    const c = g.ctx, bq = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; };
    const n = {
      in: c.createGain(), lo: bq('lowshelf', 180), mid: bq('peaking', 1100, 0.8), hi: bq('highshelf', 4500),
      shaper: c.createWaveShaper(), comp: c.createDynamicsCompressor(),
      dIn: c.createGain(), delay: c.createDelay(4), dFb: c.createGain(), dWet: c.createGain(), dOut: c.createGain(),
      rIn: c.createGain(), conv: c.createConvolver(), rWet: c.createGain(), rOut: c.createGain(),
      cIn: c.createGain(), cDel: c.createDelay(0.1), cLfo: c.createOscillator(), cDepth: c.createGain(), cWet: c.createGain(), cOut: c.createGain(),
      pan: c.createStereoPanner(), vol: c.createGain(), auto: c.createGain(), an: c.createAnalyser(),
    };
    n.an.fftSize = 512; n.shaper.oversample = '2x';
    n.lo.connect(n.mid).connect(n.hi);
    n.dIn.connect(n.dOut); n.dIn.connect(n.delay); n.delay.connect(n.dFb).connect(n.delay); n.delay.connect(n.dWet).connect(n.dOut);
    n.rIn.connect(n.rOut); n.rIn.connect(n.conv).connect(n.rWet).connect(n.rOut);
    // chorus: a short delay whose length is swept by a slow oscillator, mixed with the dry signal
    n.cIn.connect(n.cOut); n.cIn.connect(n.cDel).connect(n.cWet).connect(n.cOut);
    n.cLfo.connect(n.cDepth).connect(n.cDel.delayTime); n.cDel.delayTime.value = 0.018; n.cLfo.start();
    n.pan.connect(n.vol); n.vol.connect(n.auto); n.auto.connect(n.an); n.auto.connect(g.master);
    g.tracks.set(t.id, n);
  }

  // Applies track settings to its nodes. rewire rebuilds the insert chain (needed when an effect is toggled).
  function syncTrack(g, proj, t, rewire) {
    const n = g.tracks.get(t.id); if (!n) return;
    const f = t.fx, now = g.ctx.currentTime;
    if (rewire) {
      [n.in, n.hi, n.shaper, n.comp, n.cOut, n.dOut, n.rOut].forEach(x => x.disconnect());
      let cur = n.in;
      if (f.eq.on) { cur.connect(n.lo); cur = n.hi; }
      if (f.dist.on) { cur.connect(n.shaper); cur = n.shaper; }
      if (f.comp.on) { cur.connect(n.comp); cur = n.comp; }
      if (f.chorus.on) { cur.connect(n.cIn); cur = n.cOut; }
      if (f.delay.on) { cur.connect(n.dIn); cur = n.dOut; }
      if (f.reverb.on) { cur.connect(n.rIn); cur = n.rOut; }
      cur.connect(n.pan);
    }
    n.lo.gain.value = f.eq.low; n.mid.gain.value = f.eq.mid; n.hi.gain.value = f.eq.high;
    if (n._amt !== f.dist.amt) { n.shaper.curve = distCurve(f.dist.amt); n._amt = f.dist.amt; }
    n.comp.threshold.value = f.comp.thr; n.comp.ratio.value = f.comp.ratio;
    n.delay.delayTime.setTargetAtTime(clamp(f.delay.time * 60 / proj.bpm, 0.01, 4), now, 0.03);
    n.cLfo.frequency.value = f.chorus.rate; n.cDepth.gain.value = f.chorus.depth * 0.006; n.cWet.gain.value = f.chorus.mix;
    n.dFb.gain.value = f.delay.fb; n.dWet.gain.value = f.delay.mix;
    if (f.reverb.on && n._size !== f.reverb.size) { n.conv.buffer = impulse(g, f.reverb.size); n._size = f.reverb.size; }
    n.rWet.gain.value = f.reverb.mix * 1.6;
    n.pan.pan.setTargetAtTime(t.pan, now, 0.02);
    const solo = proj.tracks.some(x => x.solo), silent = t.mute || (solo && !t.solo);
    n.vol.gain.setTargetAtTime(silent ? 0 : L.gain(t.vol), now, 0.015);
  }
  function syncAll(g, proj, rewire = true) {
    proj.tracks.forEach(t => syncTrack(g, proj, t, rewire));
    g.master.gain.setTargetAtTime(L.gain(proj.master.vol), g.ctx.currentTime, 0.015);
  }

  // ---------- voices ----------
  function synthVoice(g, dest, I, pitch, vel, t) {
    const c = g.ctx, f = 440 * 2 ** ((pitch - 69) / 12), amp = c.createGain(), flt = c.createBiquadFilter();
    const mk = (type, freq, det, lvl) => {
      const o = c.createOscillator(), og = c.createGain();
      o.type = type; o.frequency.value = freq; o.detune.value = det; og.gain.value = lvl;
      o.connect(og).connect(flt); o.start(t);
      return o;
    };
    const oscs = [mk(I.o1, f, 0, 1 - I.mix)];
    if (I.mix > 0.01) oscs.push(mk(I.o2, f * 2 ** I.o2oct, I.o2det, I.mix));
    const peak = Math.min(18000, I.cut * 2 ** (I.env * 5)), lvl = vel * 0.2;
    flt.type = 'lowpass'; flt.Q.value = I.res;
    flt.frequency.setValueAtTime(peak, t);
    flt.frequency.setTargetAtTime(I.cut + (peak - I.cut) * I.s, t + I.a, I.d / 3);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(lvl, t + I.a);
    amp.gain.setTargetAtTime(lvl * I.s, t + I.a, I.d / 3);
    flt.connect(amp).connect(dest);
    const v = {
      release(tr, live) {
        const p = amp.gain;
        if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(tr);
        else if (live) { p.cancelScheduledValues(tr); p.setValueAtTime(p.value, tr); }
        else tr = Math.max(tr, t + I.a + 0.005);
        p.setTargetAtTime(0, tr, I.r / 4);
        oscs.forEach(o => o.stop(tr + I.r * 1.6 + 0.05));
      },
      kill() {
        const now = c.currentTime;
        amp.gain.cancelScheduledValues(now); amp.gain.setTargetAtTime(0, now, 0.008);
        oscs.forEach(o => { try { o.stop(now + 0.06); } catch { /* already stopped */ } });
      },
    };
    oscs[0].onended = () => g.live.delete(v);
    g.live.add(v);
    return v;
  }

  // Sampled instrument voice: nearest decoded note, repitched.
  function sampVoice(g, dest, I, pitch, vel, t) {
    const hit = L.lib.sample(I.sf, pitch, I.font);
    if (!hit) return { release() {}, kill() {} };
    const c = g.ctx, s = c.createBufferSource(), tone = c.createBiquadFilter(), amp = c.createGain(), r = I.r ?? 0.3;
    s.buffer = hit.buf; s.playbackRate.value = 2 ** ((pitch - hit.base) / 12);
    if (hit.loop) { s.loop = true; s.loopStart = hit.loop[0]; s.loopEnd = hit.loop[1]; }
    // softer notes are also duller, as on a real instrument
    tone.type = 'lowpass'; tone.Q.value = 0; tone.frequency.value = 700 + vel * vel * 17000;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(vel * hit.norm * (I.gain ?? 1), t + 0.004);
    s.connect(tone).connect(amp).connect(dest); s.start(t, hit.lead);
    const v = {
      release(tr) { tr = Math.max(tr, t + 0.01); amp.gain.setTargetAtTime(0, tr, r / 4); s.stop(tr + r * 1.6 + 0.05); },
      kill() { try { s.stop(); } catch { /* not started */ } },
    };
    s.onended = () => g.live.delete(v);
    g.live.add(v);
    return v;
  }
  // Plucked string (Karplus-Strong): a short burst of noise circulates through a delay one period long,
  // losing a little top end each pass, which is how a real string's tone darkens as it rings.
  const plucks = new Map();
  let pluckRR = 0;
  function pluckBuffer(c, P, pitch, vb, rr) {
    const key = [c.sampleRate, P.bright, P.decay, P.pos, pitch, vb, rr].join('|');
    if (plucks.has(key)) return plucks.get(key);
    const sr = c.sampleRate, f = 440 * 2 ** ((pitch - 69) / 12), len = Math.floor(sr * Math.min(8, P.decay * 1.3 + 0.2));
    const b = c.createBuffer(1, len, sr), y = b.getChannelData(0);
    const D = sr / f - 0.5, di = Math.floor(D), fr = D - di, N = Math.max(2, Math.round(sr / f));
    const g = Math.pow(10, -3 / (P.decay * f)); // loss per pass: 60 dB down after P.decay seconds
    // the pluck: noise, softened by a low-pass (finger or pick), notched by where along the string it is plucked
    const alpha = Math.min(0.98, Math.max(0.04, 0.08 + 0.85 * P.bright * (0.55 + 0.25 * vb))), raw = new Float32Array(N), exc = new Float32Array(N);
    let lp = 0, mean = 0;
    for (let i = 0; i < N; i++) { lp += alpha * (Math.random() * 2 - 1 - lp); raw[i] = lp; }
    const at = Math.max(1, Math.round(N * P.pos));
    for (let i = 0; i < N; i++) { exc[i] = raw[i] - (i >= at ? raw[i - at] : 0); mean += exc[i] / N; }
    let prev = 0, peak = 0;
    for (let n = 0; n < len; n++) {
      const i0 = n - di, d0 = i0 >= 0 ? y[i0] : 0, d1 = i0 - 1 >= 0 ? y[i0 - 1] : 0;
      const del = d0 + (d1 - d0) * fr;
      y[n] = (n < N ? exc[n] - mean : 0) + g * 0.5 * (del + prev);
      prev = del;
      const a = Math.abs(y[n]); if (a > peak) peak = a;
    }
    const k = peak ? 0.4 / peak : 0, fade = Math.floor(sr * 0.05);
    for (let n = 0; n < len; n++) y[n] *= k * (n > len - fade ? (len - n) / fade : 1);
    if (plucks.size > 600) plucks.delete(plucks.keys().next().value);
    plucks.set(key, b);
    return b;
  }
  function pluckVoice(g, dest, I, pitch, vel, t) {
    const c = g.ctx, P = I.pluck, r = I.r ?? 0.15;
    const s = c.createBufferSource(), hp = c.createBiquadFilter(), body = c.createBiquadFilter(), tone = c.createBiquadFilter(), amp = c.createGain();
    s.buffer = pluckBuffer(c, P, pitch, vel < 0.45 ? 0 : vel < 0.8 ? 1 : 2, pluckRR++ % 2);
    hp.type = 'highpass'; hp.frequency.value = P.hp || 70;
    body.type = 'peaking'; body.frequency.value = P.body || 200; body.Q.value = 1.3; body.gain.value = P.body ? 5 : 0;
    tone.type = 'lowpass'; tone.frequency.value = P.tone || 8000; tone.Q.value = 0.5;
    amp.gain.setValueAtTime(vel * (I.gain ?? 1), t);
    s.connect(hp).connect(body).connect(tone).connect(amp).connect(dest); s.start(t);
    const v = {
      release(tr) { tr = Math.max(tr, t + 0.02); amp.gain.setTargetAtTime(0, tr, r / 4); s.stop(tr + r * 1.6 + 0.05); },
      kill() { try { s.stop(); } catch { /* not started */ } },
    };
    s.onended = () => g.live.delete(v);
    g.live.add(v);
    return v;
  }
  const voice = (g, dest, I, pitch, vel, t) => (I.sf ? sampVoice : I.pluck ? pluckVoice : synthVoice)(g, dest, I, pitch, vel, t);

  // A looped clip plays its first `loop` beats over and over until its length runs out.
  const content = c => c.loop || c.len;
  const segments = c => {
    if (!c.loop) return [c];
    const out = [];
    for (let r = 0; r * c.loop < c.len - 1e-9; r++) out.push({ ...c, start: c.start + r * c.loop, len: Math.min(c.loop, c.len - r * c.loop) });
    return out;
  };
  // Chords on strummed instruments: each string a few milliseconds after the last, low to high
  // (on the off-beat eighth notes, high to low, like an up-strum).
  function strumOffsets(c, st) {
    const m = new Map(), groups = {};
    c.notes.forEach(n => (groups[n.s.toFixed(3)] ||= []).push(n));
    for (const arr of Object.values(groups)) {
      if (arr.length < 2) continue;
      arr.sort((x, y) => x.p - y.p);
      const up = Math.round(arr[0].s * 2) % 2 === 1;
      arr.forEach((n, i) => m.set(n, (up ? arr.length - 1 - i : i) * st));
    }
    return m;
  }

  function drumHit(g, dest, I, lane, vel, t) {
    const c = g.ctx, d = I.decay, tune = 2 ** (I.tune / 12), out = c.createGain();
    out.gain.value = vel; out.connect(dest);
    const env = (peak, dec) => {
      const a = c.createGain();
      a.gain.setValueAtTime(peak, t); a.gain.exponentialRampToValueAtTime(0.001, t + dec);
      a.connect(out); return a;
    };
    const osc = (type, f0, f1, ft, dec, peak) => {
      const o = c.createOscillator();
      o.type = type; o.frequency.setValueAtTime(f0 * tune, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1 * tune, t + ft);
      o.connect(env(peak, dec)); o.start(t); o.stop(t + dec + 0.02);
    };
    const noise = (ftype, freq, dec, peak, q) => {
      const s = c.createBufferSource(), fl = c.createBiquadFilter();
      s.buffer = g.noise; s.loop = true; fl.type = ftype; fl.frequency.value = freq * (ftype === 'bandpass' ? tune : 1);
      if (q) fl.Q.value = q;
      const e = env(peak, dec);
      s.connect(fl).connect(e); s.start(t, Math.random()); s.stop(t + dec + 0.05);
      return e;
    };
    switch (lane) {
      case 0: osc('sine', 165, 42, 0.11, 0.5 * d, 1); osc('triangle', 900, 90, 0.02, 0.03, 0.3); break;
      case 1: osc('triangle', 225, 150, 0.06, 0.12 * d, 0.5); noise('bandpass', 2300, 0.2 * d, 0.75, 0.6); break;
      case 2: {
        const e = noise('bandpass', 1300, 0.036 + 0.2 * d, 0.8, 1.2).gain;
        e.cancelScheduledValues(t);
        [0, 0.012, 0.024].forEach(o => { e.setValueAtTime(0.8, t + o); e.exponentialRampToValueAtTime(0.15, t + o + 0.01); });
        e.setValueAtTime(0.8, t + 0.036); e.exponentialRampToValueAtTime(0.001, t + 0.036 + 0.2 * d);
        break;
      }
      case 3: noise('highpass', 7500, 0.05 * d, 0.45); break;
      case 4: noise('highpass', 7000, 0.35 * d, 0.4); break;
      case 5: osc('sine', 150, 85, 0.15, 0.35 * d, 0.8); break;
      case 6: osc('square', 1650, 0, 0, 0.025, 0.3); osc('triangle', 480, 0, 0, 0.03, 0.4); break;
      default: noise('highpass', 5000, 1.2 * d, 0.35); noise('bandpass', 9000, 0.6 * d, 0.2, 0.5);
    }
  }
  const lane = p => ((p - 36) % 8 + 8) % 8;

  function startAudio(g, proj, n, c, from, b2t, limit) {
    const buf = L.buffers.get(c.buf); if (!buf) return;
    const spb = 60 / proj.bpm, off = c.offset + (from - c.start) * spb;
    const dur = (Math.min(c.start + c.len, limit) - from) * spb;
    if (dur <= 0 || off >= buf.duration) return;
    const s = g.ctx.createBufferSource(), gn = g.ctx.createGain();
    s.buffer = buf; gn.gain.value = c.gain ?? 1;
    s.connect(gn).connect(n.in);
    s.start(b2t(from), off, dur);
    const v = { kill() { try { s.stop(); } catch { /* not started */ } } };
    s.onended = () => g.live.delete(v);
    g.live.add(v);
  }

  // Schedules everything that starts in beats [a, b).
  function scheduleRange(g, proj, a, b, b2t, limit) {
    const spb = 60 / proj.bpm;
    for (const t of proj.tracks) {
      const n = g.tracks.get(t.id); if (!n) continue;
      for (const c of t.clips) {
        if (c.start >= b || c.start + c.len <= a) continue;
        if (t.type === 'audio') { for (const sg of segments(c)) if (sg.start >= a && sg.start < b) startAudio(g, proj, n, sg, sg.start, b2t, limit); continue; }
        const cl = content(c), st = t.type === 'synth' && t.inst.strum ? strumOffsets(c, t.inst.strum) : null;
        for (let r = 0; r * cl < c.len - 1e-9; r++) {
          const base = c.start + r * cl;
          if (base >= b) break;
          if (base + cl <= a) continue;
          for (const nt of c.notes) {
            const rel = r * cl + nt.s, s = c.start + rel;
            if (nt.s >= cl || rel >= c.len || s < a || s >= b) continue;
            const time = b2t(s) + (st && st.get(nt) || 0);
            if (t.type === 'drums') drumHit(g, n.in, t.inst, lane(nt.p), nt.v, time);
            else voice(g, n.in, t.inst, nt.p, nt.v, time).release(b2t(s) + Math.min(nt.l, cl - nt.s, c.len - rel) * spb);
          }
        }
      }
    }
  }
  // Volume automation: points [beat, level 0..1] joined by straight lines; level 1 leaves the fader as it is.
  const autoGain = v => v * v;
  function autoAt(pts, beat) {
    if (!pts || !pts.length) return 1;
    if (beat <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (beat <= pts[i][0]) {
      const [b0, v0] = pts[i - 1], [b1, v1] = pts[i];
      return b1 === b0 ? v1 : v0 + (v1 - v0) * (beat - b0) / (b1 - b0);
    }
    return pts[pts.length - 1][1];
  }
  function scheduleAuto(g, proj, from, b2t, limit) {
    const t0 = b2t(from);
    for (const t of proj.tracks) {
      const n = g.tracks.get(t.id); if (!n) continue;
      const pts = t.auto && t.auto.vol, prm = n.auto.gain;
      prm.cancelScheduledValues(t0);
      prm.setValueAtTime(autoGain(autoAt(pts, from)), t0);
      if (pts) for (const [b, v] of pts) if (b > from && b < limit) prm.linearRampToValueAtTime(autoGain(v), b2t(b));
    }
  }
  function autoHold(g, proj, beat) {
    for (const t of proj.tracks) { const n = g.tracks.get(t.id); if (n) { n.auto.gain.cancelScheduledValues(0); n.auto.gain.value = autoGain(autoAt(t.auto && t.auto.vol, beat)); } }
  }
  E_autoAt = autoAt;

  function startSpanning(g, proj, beat, b2t, limit) {
    for (const t of proj.tracks) if (t.type === 'audio') for (const c of t.clips) for (const sg of segments(c))
      if (sg.start < beat && sg.start + sg.len > beat) startAudio(g, proj, g.tracks.get(t.id), sg, beat, b2t, limit);
  }

  // ---------- live transport ----------
  let ctx = null, G = null, timer = 0, anchors = [], sched = 0, rec = null;
  const held = new Map(), meterBuf = new Float32Array(512);
  const E = { playing: false, recording: false, metronome: false, recStart: 0 };

  function ensure() {
    if (!ctx) { ctx = new AudioContext({ latencyHint: 'interactive' }); G = makeGraph(ctx, L.project); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  E.ensure = ensure;
  E.graph = () => { ensure(); return G; };

  E.reconcile = () => {
    if (!G) return;
    const p = L.project, ids = new Set(p.tracks.map(t => t.id));
    for (const [id, n] of G.tracks) if (!ids.has(id)) { n.vol.disconnect(); n.auto.disconnect(); G.tracks.delete(id); }
    p.tracks.forEach(t => { if (!G.tracks.has(t.id)) addTrack(G, t); });
    syncAll(G, p);
  };
  L.on('change', () => L.lib && L.lib.ensure(L.project));
  // while stopped, the automation level under the playhead applies
  L.on('change', () => { if (G && !E.playing) autoHold(G, L.project, L.pos); });
  E.sync = t => { if (G) { t ? syncTrack(G, L.project, t, false) : syncAll(G, L.project, false); } };

  E.currentBeat = () => {
    if (!E.playing) return L.pos;
    const now = ctx.currentTime;
    while (anchors.length > 1 && anchors[1].time <= now) anchors.shift();
    const A = anchors[0];
    return A.beat + Math.max(0, now - A.time) * L.project.bpm / 60;
  };

  function click(time, strong) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = strong ? 1760 : 1175;
    g.gain.setValueAtTime(0.25, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    o.connect(g).connect(ctx.destination); o.start(time); o.stop(time + 0.05);
  }

  function tick() {
    const p = L.project, spb = 60 / p.bpm, horizon = ctx.currentTime + 0.15, lp = p.loop;
    const looping = lp.on && lp.end - lp.start >= 0.25;
    let A = anchors[anchors.length - 1];
    const b2t = b => A.time + (b - A.beat) * spb;
    const run = (a, b) => {
      const limit = looping && a < lp.end ? lp.end : Infinity;
      scheduleRange(G, p, a, b, b2t, limit);
      if (E.metronome) for (let k = Math.ceil(a - 1e-9); k < b; k++) click(b2t(k), k % 4 === 0);
    };
    let end = A.beat + (horizon - A.time) / spb;
    while (looping && sched < lp.end && end >= lp.end) {
      run(sched, lp.end);
      A = { time: b2t(lp.end), beat: lp.start };
      anchors.push(A); sched = lp.start;
      startSpanning(G, p, lp.start, b2t, lp.end);
      scheduleAuto(G, p, lp.start, b2t, lp.end);
      end = A.beat + (horizon - A.time) / spb;
    }
    if (end > sched) { run(sched, end); sched = end; }
  }

  E.play = () => {
    ensure();
    if (E.playing) return;
    const A = { time: ctx.currentTime + 0.08, beat: L.pos }, p = L.project, spb = 60 / p.bpm;
    anchors = [A]; sched = L.pos; E.playing = true;
    startSpanning(G, p, L.pos, b => A.time + (b - A.beat) * spb, p.loop.on && L.pos < p.loop.end ? p.loop.end : Infinity);
    scheduleAuto(G, p, L.pos, b => A.time + (b - A.beat) * spb, p.loop.on && L.pos < p.loop.end ? p.loop.end : Infinity);
    timer = setInterval(tick, 25); tick();
    L.emit('transport');
  };
  E.stop = () => {
    if (!E.playing) return;
    clearInterval(timer);
    L.pos = E.currentBeat(); E.playing = false;
    for (const v of [...G.live]) v.kill();
    G.live.clear(); held.clear();
    autoHold(G, L.project, L.pos);
    if (E.recording) finishRec();
    L.emit('transport');
  };
  E.toggle = () => E.playing ? E.stop() : E.play();
  E.seek = b => {
    const was = E.playing && !E.recording;
    if (E.playing) E.stop();
    L.pos = Math.max(0, b);
    if (was) E.play();
  };
  // Call before changing tempo so the playhead does not jump.
  E.reanchor = () => { if (E.playing) anchors = [{ time: ctx.currentTime, beat: E.currentBeat() }]; };

  // ---------- live input ----------
  E.noteOn = (pitch, vel = L.view.vel, trackId = L.sel.track, at) => {
    const t = L.trackById(trackId); if (!t || t.type === 'audio') return;
    ensure();
    const n = G.tracks.get(t.id); if (!n) return;
    if (t.type === 'drums') { pitch = 36 + lane(pitch); drumHit(G, n.in, t.inst, pitch - 36, vel, ctx.currentTime); }
    else { if (held.has(pitch)) return; held.set(pitch, voice(G, n.in, t.inst, pitch, vel, ctx.currentTime)); }
    L.emit('note', { p: pitch, on: true });
    if (rec && rec.midi && rec.track === t.id) {
      const nt = { p: pitch, s: at ?? E.currentBeat(), l: 0.25, v: vel };
      rec.notes.push(nt); rec.open.set(pitch, nt);
    }
  };
  E.noteOff = (pitch, at) => {
    L.emit('note', { p: pitch, on: false });
    const v = held.get(pitch);
    if (v) { v.release(ctx.currentTime, true); held.delete(pitch); }
    const nt = rec && rec.open.get(pitch);
    if (nt) { nt.l = Math.max(0.05, (at ?? E.currentBeat()) - nt.s); rec.open.delete(pitch); }
  };
  E.blip = (trackId, pitch) => { E.noteOn(pitch, 0.8, trackId); setTimeout(() => E.noteOff(pitch), 180); };

  // ---------- recording ----------
  E.record = async () => {
    if (E.recording) return E.stop();
    const t = L.trackById(L.sel.track);
    if (!t) return L.toast('Select a track to record onto');
    ensure();
    if (E.playing) E.stop();
    const r = { track: t.id, start: L.pos, midi: t.type !== 'audio', notes: [], open: new Map() };
    if (!r.midi) {
      try {
        r.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        r.chunks = []; r.mr = new MediaRecorder(r.stream);
        r.mr.ondataavailable = e => r.chunks.push(e.data);
        r.mr.start();
      } catch (err) { return L.toast('Microphone unavailable: ' + err.message, 6000); }
    } else L.toast('Recording notes: play the keyboard (A W S E D F …) or a MIDI device');
    rec = r; E.recording = true; E.recStart = r.start;
    E.play();
  };
  function finishRec() {
    const r = rec; rec = null; E.recording = false;
    const t = L.trackById(r.track); if (!t) return;
    if (r.midi) {
      if (!r.notes.length) return L.toast('Nothing played, nothing recorded');
      const start = Math.floor(Math.min(r.start, ...r.notes.map(n => n.s)) / 4) * 4;
      const last = Math.max(...r.notes.map(n => n.s + n.l));
      const clip = { id: L.uid(), name: 'Take', start, len: Math.max(4, Math.ceil((last - start) / 4) * 4), notes: r.notes.map(n => ({ p: n.p, s: n.s - start, l: n.l, v: n.v })) };
      t.clips.push(clip); L.sel.clip = clip.id; L.commit();
      return;
    }
    r.mr.onstop = async () => {
      r.stream.getTracks().forEach(x => x.stop());
      try {
        const buf = await ctx.decodeAudioData(await new Blob(r.chunks).arrayBuffer());
        const lat = Math.min(0.3, (ctx.outputLatency || 0) + (ctx.baseLatency || 0));
        const clip = { id: L.uid(), name: 'Recording', start: r.start, len: Math.max(0.25, (buf.duration - lat) / L.spb()), buf: L.addBuffer(buf), offset: lat, gain: 1 };
        t.clips.push(clip); L.sel.clip = clip.id; L.commit();
      } catch (err) { L.toast('Could not read the recording: ' + err.message, 6000); }
    };
    r.mr.stop();
  }

  // ---------- meters ----------
  const peak = an => { an.getFloatTimeDomainData(meterBuf); let m = 0; for (let i = 0; i < 512; i++) { const v = Math.abs(meterBuf[i]); if (v > m) m = v; } return m; };
  E.levels = () => {
    if (!G) return null;
    const out = new Map([['master', peak(G.an)]]);
    for (const [id, n] of G.tracks) out.set(id, peak(n.an));
    return out;
  };

  // ---------- files ----------
  E.decode = ab => { ensure(); return ctx.decodeAudioData(ab); };
  E.renderBuffer = async () => {
    const p = L.project, spb = 60 / p.bpm, end = L.projectEnd();
    if (!end) throw new Error('The project is empty');
    await L.lib.ready(p);
    const oc = new OfflineAudioContext(2, Math.ceil((end * spb + 2.55) * 44100), 44100);
    const g = makeGraph(oc, p);
    // a short lead-in: the output limiter needs a moment to settle, or the very first note comes out quiet
    scheduleRange(g, p, 0, end + 1e-6, b => 0.05 + b * spb, Infinity);
    scheduleAuto(g, p, 0, b => 0.05 + b * spb, Infinity);
    return oc.startRendering();
  };
  E.render = async () => new Blob([L.wav(await E.renderBuffer())], { type: 'audio/wav' });
  E.autoAt = (pts, beat) => E_autoAt(pts, beat);

  L.on('change', E.reconcile);
  return E;
})();
