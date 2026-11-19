'use strict';
// Sound effects, made on the spot to fit the song's tempo, and ready-made drum loops and fills.
// Picking one in the Sounds tab puts it on the timeline at the playhead. Build-ups (risers, fills)
// end at the playhead, so they lead into that moment; everything else starts there.
L.sfx = (() => {
  const SR = 44100;

  // ---------- effects ----------
  // Each one draws into an offline context of `secs` seconds. `out` is the effect's output.
  const ramp = (p, a, b, t0, t1) => { p.setValueAtTime(a, t0); p.exponentialRampToValueAtTime(b, t1); };
  function noiseSrc(c, secs) {
    const b = c.createBuffer(2, Math.ceil(c.sampleRate * secs), c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = c.createBufferSource(); s.buffer = b; return s;
  }
  const filt = (c, type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; };
  function room(c, secs, mix, out) {
    const n = Math.floor(c.sampleRate * secs), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3; }
    const cv = c.createConvolver(), dry = c.createGain(), wet = c.createGain(), inp = c.createGain();
    cv.buffer = b; dry.gain.value = 1 - mix * 0.5; wet.gain.value = mix;
    inp.connect(dry).connect(out); inp.connect(cv).connect(wet).connect(out);
    return inp;
  }
  // a rise that speeds up at the end, then a quick cut
  const swell = (p, T, top = 1) => { p.setValueAtTime(0.0001, 0); p.exponentialRampToValueAtTime(top, T - 0.03); p.linearRampToValueAtTime(0, T); };

  const FX = {
    riser(c, out, T) {
      const n = noiseSrc(c, T), bp = filt(c, 'bandpass', 250, 1.2), air = filt(c, 'highpass', 2000), g = c.createGain(), ga = c.createGain();
      ramp(bp.frequency, 250, 9000, 0, T); ramp(air.frequency, 2000, 12000, 0, T);
      swell(g.gain, T); swell(ga.gain, T, 0.35);
      n.connect(bp).connect(g).connect(out); n.connect(air).connect(ga).connect(out); n.start(0);
    },
    synthRiser(c, out, T) {
      const lp = filt(c, 'lowpass', 400, 4), trem = c.createGain(), g = c.createGain(), lfo = c.createOscillator(), depth = c.createGain();
      ramp(lp.frequency, 400, 9000, 0, T);
      [-14, 0, 14].forEach(det => { const o = c.createOscillator(); o.type = 'sawtooth'; o.detune.value = det; ramp(o.frequency, 110, 880, 0, T); o.connect(lp); o.start(0); });
      // the wobble gets faster as it climbs
      trem.gain.value = 0.6; depth.gain.value = 0.4; ramp(lfo.frequency, 2, 18, 0, T);
      lfo.connect(depth).connect(trem.gain); lfo.start(0);
      swell(g.gain, T, 0.5);
      lp.connect(trem).connect(g).connect(room(c, 1.5, 0.3, out));
    },
    downlifter(c, out, T) {
      const n = noiseSrc(c, T), bp = filt(c, 'bandpass', 8000, 1), g = c.createGain(), o = c.createOscillator(), og = c.createGain();
      ramp(bp.frequency, 8000, 150, 0, T); ramp(g.gain, 1, 0.001, 0, T);
      ramp(o.frequency, 500, 50, 0, T); ramp(og.gain, 0.3, 0.001, 0, T * 0.8);
      const r = room(c, 2, 0.35, out);
      n.connect(bp).connect(g).connect(r); o.connect(og).connect(r); n.start(0); o.start(0);
    },
    impact(c, out, T) {
      const r = room(c, Math.min(3.5, T), 0.6, out);
      const o = c.createOscillator(), og = c.createGain(); ramp(o.frequency, 75, 32, 0, 1.4); ramp(og.gain, 1, 0.001, 0, Math.min(T, 2.6));
      const n = noiseSrc(c, 1), lp = filt(c, 'lowpass', 3000), ng = c.createGain(); ramp(lp.frequency, 3000, 200, 0, 0.6); ramp(ng.gain, 0.8, 0.001, 0, 0.7);
      o.connect(og).connect(r); n.connect(lp).connect(ng).connect(r); o.start(0); n.start(0);
    },
    subDrop(c, out, T) {
      const o = c.createOscillator(), g = c.createGain(), sh = c.createWaveShaper(), k = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; k[i] = Math.tanh(2 * x); }
      sh.curve = k; ramp(o.frequency, 130, 28, 0, T * 0.8); ramp(g.gain, 1, 0.001, 0.05, T);
      o.connect(sh).connect(g).connect(out); o.start(0);
    },
    reverseCymbal(c, out, T) {
      const n = noiseSrc(c, T), hp = filt(c, 'highpass', 3500), pk = filt(c, 'peaking', 8500, 1.5), g = c.createGain();
      pk.gain.value = 6;
      const curve = new Float32Array(256); for (let i = 0; i < 256; i++) curve[i] = (i / 255) ** 4;
      g.gain.setValueCurveAtTime(curve, 0, T - 0.01); g.gain.setValueAtTime(0, T - 0.005);
      n.connect(hp).connect(pk).connect(g).connect(out); n.start(0);
    },
    whoosh(c, out, T) {
      const n = noiseSrc(c, T), bp = filt(c, 'bandpass', 300, 3), g = c.createGain(), pan = c.createStereoPanner();
      ramp(bp.frequency, 300, 5000, 0, T * 0.6); ramp(bp.frequency, 5000, 400, T * 0.6, T);
      g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(1, T * 0.6); g.gain.linearRampToValueAtTime(0, T);
      pan.pan.setValueAtTime(-0.9, 0); pan.pan.linearRampToValueAtTime(0.9, T);
      n.connect(bp).connect(g).connect(pan).connect(out); n.start(0);
    },
    zap(c, out, T) {
      const o = c.createOscillator(), lp = filt(c, 'lowpass', 5000), g = c.createGain();
      o.type = 'square'; ramp(o.frequency, 1800, 70, 0, T * 0.8); ramp(g.gain, 0.5, 0.001, 0, T);
      o.connect(lp).connect(g).connect(room(c, 0.8, 0.25, out)); o.start(0);
    },
    vinyl(c, out, T) {
      const n = noiseSrc(c, T), bp = filt(c, 'bandpass', 3000, 0.6), hg = c.createGain(); hg.gain.value = 0.05;
      n.connect(bp).connect(hg).connect(out); n.start(0);
      // crackle: scattered single-sample clicks, a few loud pops
      const b = c.createBuffer(2, Math.ceil(c.sampleRate * T), c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch);
        for (let i = 0; i < T * 22; i++) { const at = Math.floor(Math.random() * d.length), a = (Math.random() < 0.08 ? 0.9 : 0.25) * Math.random(); d[at] = a * (Math.random() < 0.5 ? -1 : 1); if (at + 1 < d.length) d[at + 1] = -d[at] * 0.5; }
      }
      const s = c.createBufferSource(), lp = filt(c, 'lowpass', 6000); s.buffer = b;
      s.connect(lp).connect(out); s.start(0);
    },
  };
  // len: in bars (tempo-synced) or seconds; lead: ends at the playhead; peak: how loud it is made
  const EFFECTS = [
    { label: 'Riser, 2 bars', fx: 'riser', bars: 2, lead: true },
    { label: 'Riser, 4 bars', fx: 'riser', bars: 4, lead: true },
    { label: 'Synth riser', fx: 'synthRiser', bars: 2, lead: true },
    { label: 'Reverse cymbal', fx: 'reverseCymbal', bars: 1, lead: true },
    { label: 'Whoosh', fx: 'whoosh', bars: 0.5, lead: true },
    { label: 'Downlifter', fx: 'downlifter', bars: 2 },
    { label: 'Impact', fx: 'impact', secs: 3.5 },
    { label: 'Sub drop', fx: 'subDrop', secs: 2 },
    { label: 'Zap', fx: 'zap', secs: 0.5, peak: 0.6 },
    { label: 'Vinyl crackle, 4 bars', fx: 'vinyl', bars: 4, peak: 0.35 },
  ];

  async function render(it, bpm) {
    const secs = it.secs || it.bars * 4 * 60 / bpm;
    const oc = new OfflineAudioContext(2, Math.ceil(SR * secs), SR), out = oc.createGain();
    out.connect(oc.destination);
    FX[it.fx](oc, out, secs);
    const b = await oc.startRendering();
    let pk = 0;
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); }
    const k = pk ? (it.peak || 0.85) / pk : 1;
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] *= k; }
    return b;
  }

  // ---------- drum loops and fills ----------
  // One row per drum, one character per step (a 16th note unless `step` says otherwise):
  // X hard, x normal, o soft (a ghost note), . nothing.  K kick, S snare, C clap, H hat, O open hat, T tom, R rim, Y crash, B cowbell
  const LANE = { K: 0, S: 1, C: 2, H: 3, O: 4, T: 5, R: 6, Y: 7, B: 8 }, VEL = { X: 1, x: 0.75, o: 0.42 };
  const LOOPS = [
    { label: 'Rock beat', rows: { K: 'X.....x.X.x.....', S: '....X.......X...', H: 'x.x.x.x.x.x.x.x.' } },
    { label: 'Four on the floor', rows: { K: 'X...X...X...X...', C: '....x.......x...', H: '..x...x...x...x.', O: '..o...o...o...o.' } },
    { label: 'Disco', rows: { K: 'X...X...X...X...', S: '....X.......X...', H: 'x.x.x.x.x.x.x.x.', O: '..x...x...x...x.' } },
    { label: 'Boom bap', bars: 2, rows: { K: 'X......x..X.....X......x.x.X....', S: '....X.......X.......X.......X..o', H: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.' } },
    { label: 'Half-time', bars: 2, rows: { K: 'X.......x.x.....X.......x.....x.', S: '........X...............X.......', H: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.' } },
    { label: 'Trap hats', bars: 2, rows: { K: 'X.......X.x.....X......x..X.....', S: '........X...............X.......', H: 'x.x.x.x.xxxxx.x.x.x.x.x.x.xxx.x.' } },
    { label: 'Breakbeat', bars: 2, rows: { K: 'X.X.......X.....X.X.......X.x...', S: '....X..o.o..X..o....X..o.o..X..o', H: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.' } },
    { label: 'Funk', rows: { K: 'X..x..x...X..x..', S: '....X..o.o..X..o', H: 'xxxxxxxxxxxxxxxx' } },
    { label: 'Cowbell groove', rows: { K: 'X.....x...X.....', S: '....X.......X...', H: 'x.x.x.x.x.x.x.x.', B: 'X..x..X...X.x...' } },
    { label: 'Bossa nova', bars: 2, rows: { K: 'X..xX..xX..xX..x', R: 'x..x..x...x..x..x..x..x...x..x..', H: 'oxoxoxoxoxoxoxoxoxoxoxoxoxoxoxox' } },
    { label: 'Reggaeton', rows: { K: 'X...X...X...X...', S: '...x..x....x..x.', H: 'x.x.x.x.x.x.x.x.' } },
    { label: 'Shuffle', step: 1 / 3, rows: { K: 'X.....x.....', S: '...X.....X..', H: 'x.xx.xx.xx.x' } },
    { label: 'Crash on the one', bars: 0.25, rows: { K: 'X...', Y: 'X...' } },
    { label: 'Snare build-up, 2 bars', bars: 2, lead: true, rows: { S: 'o...o...x...x...x.x.x.x.xxxxXXXX', K: 'X...X...X...X...X...X...X...X...' } },
    { label: 'Snare build-up, 4 bars', bars: 4, lead: true, rows: { S: 'o.......o.......x...x...x...x...x.x.x.x.x.x.x.x.xxxxxxxxXXXXXXXX', K: 'X...X...X...X...X...X...X...X...X...X...X...X...X...X...X...X...' } },
    { label: 'Tom fill', lead: true, rows: { K: 'X...............', S: 'x.x.x.x.........', T: '........xxx.XXX.' } },
    { label: 'Snare roll fill', lead: true, rows: { K: 'X.......X.......', S: '........xxxxXXXX' } },
  ];
  function notes(it) {
    const step = it.step || 0.25, out = [];
    for (const [k, row] of Object.entries(it.rows)) [...row].forEach((ch, i) => { if (VEL[ch]) out.push({ p: 36 + LANE[k], s: +(i * step).toFixed(4), l: step, v: VEL[ch] }); });
    // build-ups get louder as they go
    if (it.lead) { const len = (it.bars || 1) * 4; out.forEach(n => { n.v = +Math.min(1, n.v * (0.6 + 0.4 * n.s / len)).toFixed(3); }); }
    return out;
  }

  // ---------- putting them in the song ----------
  const where = (it, len) => {
    const bar = Math.round(L.pos / 4) * 4;
    return it.lead ? Math.max(0, bar - len) : Math.floor(L.pos / 4) * 4;
  };
  const free = (t, a, z) => !t.clips.some(c => c.start < z - 1e-6 && c.start + c.len > a + 1e-6);
  const say = (it, at) => L.toast(`${it.label} added at bar ${at / 4 + 1}${it.lead ? ' (it ends at the playhead)' : ''}. Drag it to move it`, 3500);

  async function addEffect(it) {
    const E = L.engine, p = L.project, buf = await render(it, p.bpm), len = buf.duration / L.spb(), at = where(it, len);
    let t = p.tracks.find(x => x.type === 'audio' && x.name === 'Effects' && free(x, at, at + len));
    if (!t) { t = L.arr.addTrack('audio'); t.name = 'Effects'; }
    const c = { id: L.uid(), name: it.label, start: at, len, buf: L.addBuffer(buf), offset: 0, gain: 1 };
    t.clips.push(c); L.sel.track = t.id; L.sel.clip = c.id; L.commit();
    hear(buf); say(it, at);
  }
  function addLoop(it) {
    const p = L.project, len = (it.bars || 1) * 4, at = where(it, len);
    const sel = L.trackById(L.sel.track), base = sel && sel.type === 'drums' ? sel : p.tracks.find(x => x.type === 'drums');
    let t = base && free(base, at, at + len) ? base : p.tracks.find(x => x.type === 'drums' && free(x, at, at + len));
    if (!t) { t = L.arr.addTrack('drums'); if (base) { t.inst = { ...base.inst }; t.name = base.name + ' fills'; } }
    const c = { id: L.uid(), name: it.label, start: at, len, notes: notes(it) };
    t.clips.push(c); L.sel.track = t.id; L.sel.clip = c.id; L.sel.notes.clear(); L.commit();
    preview(it, t.inst); say(it, at);
  }
  // plays a buffer once, on its own, without touching the song
  function hear(buf) {
    const g = L.engine.graph(), s = g.ctx.createBufferSource(), v = g.ctx.createGain();
    s.buffer = buf; v.gain.value = 0.8; s.connect(v).connect(g.master); s.start();
  }
  function preview(it, inst) {
    const t = L.newTrack('drums'); t.inst = { ...inst };
    const len = (it.bars || 1) * 4, reps = len < 4 ? 1 : Math.max(1, Math.round(8 / len));
    t.clips.push({ id: L.uid(), start: 0, len: len * reps, loop: len, notes: notes(it) });
    L.engine.preview({ bpm: L.project.bpm, master: { vol: 0.8 }, loop: { on: false, start: 0, end: 0 }, tracks: [t] });
  }

  const items = () => [
    { name: 'Sound effects', items: EFFECTS.map(e => ({ kind: 'sfx', ...e })) },
    { name: 'Drum loops and fills', items: LOOPS.map(e => ({ kind: 'loop', ...e })) },
  ];
  return { items, pick: it => (it.kind === 'sfx' ? addEffect(it) : addLoop(it)), render, notes };
})();
