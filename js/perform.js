'use strict';
// Performance layer between the inputs (on-screen keys, typing keyboard, MIDI) and the engine:
// turns one key into a chord and held notes into an arpeggio. Everything it plays is recorded like normal notes.
L.perf = (() => {
  const E = L.engine;
  const S = { chord: 'Off', arp: 'Off', rate: 0.5, range: 1, key: 0, scale: 'Major', sev: false };
  const SCALES = {
    Major: [0, 2, 4, 5, 7, 9, 11], Minor: [0, 2, 3, 5, 7, 8, 10], Dorian: [0, 2, 3, 5, 7, 9, 10], Phrygian: [0, 1, 3, 5, 7, 8, 10],
    Lydian: [0, 2, 4, 6, 7, 9, 11], Mixolydian: [0, 2, 4, 5, 7, 9, 10], 'Harmonic minor': [0, 2, 3, 5, 7, 8, 11], 'Phrygian dominant': [0, 1, 4, 5, 7, 8, 10],
  };
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const held = new Map(); // input id -> { raw: pitches sounding } or { arp: pitches feeding the arpeggio, vel }
  let timer = 0, idx = 0, next = null;

  const isSynth = () => L.trackById(L.sel.track)?.type === 'synth';
  const expand = p => (L.CHORDS[S.chord] || [0]).map(i => p + i).filter(x => x <= 120);

  function down(id, pitches, vel = L.view.vel) {
    if (held.has(id)) return;
    const ps = !isSynth() || pitches.length > 1 ? pitches : expand(pitches[0]);
    if (S.arp === 'Off' || !isSynth()) {
      const st = isSynth() && ps.length > 1 ? L.trackById(L.sel.track).inst.strum || 0 : 0, h = { raw: ps, timers: [] };
      held.set(id, h);
      [...ps].sort((x, y) => x - y).forEach((p, i) => { if (i && st) h.timers.push(setTimeout(() => E.noteOn(p, vel), i * st * 1000)); else E.noteOn(p, vel); });
      return;
    }
    held.set(id, { arp: ps, vel });
    if (!timer) start();
  }
  function up(id) {
    const h = held.get(id); if (!h) return;
    held.delete(id);
    if (h.timers) h.timers.forEach(clearTimeout);
    if (h.raw) h.raw.forEach(p => E.noteOff(p));
  }

  // ---------- arpeggiator ----------
  function pool() {
    let ps = [...new Set([...held.values()].filter(h => h.arp).flatMap(h => h.arp))].sort((a, b) => a - b);
    if (S.range === 2) ps = ps.concat(ps.map(p => p + 12));
    return ps;
  }
  const grid = b => Math.ceil(b / S.rate - 1e-6) * S.rate;
  function start() {
    idx = 0; next = null;
    let wait = 0;
    if (E.playing) { const b = E.currentBeat(); next = grid(b); wait = (next - b) * L.spb() * 1000; }
    timer = setTimeout(step, wait);
  }
  function step() {
    const ps = pool(), n = ps.length;
    if (!n) { timer = 0; return; }
    let p;
    if (S.arp === 'Up') p = ps[idx % n];
    else if (S.arp === 'Down') p = ps[n - 1 - idx % n];
    else if (S.arp === 'Up-down') { const cyc = Math.max(1, 2 * n - 2), k = idx % cyc; p = ps[k < n ? k : cyc - k]; }
    else p = ps[Math.floor(Math.random() * n)];
    idx++;
    const ms = S.rate * L.spb() * 1000, vel = Math.max(...[...held.values()].filter(h => h.arp).map(h => h.vel));
    // while the transport runs, steps sit exactly on the grid (and are recorded there)
    if (E.playing) { const b = E.currentBeat(); if (next === null || next - b > S.rate * 1.5 || next < b - S.rate) next = grid(b); } else next = null;
    const at = next ?? undefined;
    E.noteOn(p, vel, undefined, at);
    setTimeout(() => E.noteOff(p, at === undefined ? undefined : at + S.rate * 0.8), ms * 0.8);
    let wait = ms;
    if (next !== null) { next += S.rate; wait = Math.max(5, (next - E.currentBeat()) * L.spb() * 1000); }
    timer = setTimeout(step, wait);
  }

  // ---------- the seven chords of the chosen key ----------
  // The seven triads of a key, built by stacking every other scale note.
  function chordsFor(key, scaleName, oct, sev) {
    const sc = SCALES[scaleName];
    return sc.map((_, i) => {
      const iv = [0, 2, 4].map(k => sc[(i + k) % 7] + (i + k >= 7 ? 12 : 0));
      const third = iv[1] - iv[0], fifth = iv[2] - iv[0], dim = third === 3 && fifth === 6, aug = third === 4 && fifth === 8, minor = third === 3;
      const root = L.pitchName(60 + key + iv[0]).replace(/-?\d+$/, '');
      let suffix = dim ? '°' : aug ? '+' : minor ? 'm' : '';
      if (sev) {
        // add the note a third above the fifth: the soft, jazzy seventh chords
        const top = sc[(i + 6) % 7] + (i + 6 >= 7 ? 12 : 0); iv.push(top);
        const s7 = top - iv[0];
        suffix = dim ? (s7 === 10 ? 'm7b5' : '°7') : aug ? '+7' : minor ? (s7 === 11 ? 'mM7' : 'm7') : s7 === 11 ? 'maj7' : '7';
      }
      const pitches = iv.map(x => 12 * (oct + 1) + key + x);
      return { pitches, name: root + suffix, roman: (minor ? ROMAN[i].toLowerCase() : ROMAN[i]) + (dim ? '°' : aug ? '+' : '') };
    });
  }
  const degrees = () => chordsFor(S.key, S.scale, L.view.oct, S.sev);
  const pad = (id, i) => { const d = degrees()[i]; if (d && isSynth()) down(id, d.pitches); };

  return { S, down, up, pad, degrees, chordsFor, SCALES };
})();
