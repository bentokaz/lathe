'use strict';
(() => {
  const { uid } = L;

  L.PRESETS = {
    Keys:  { o1: 'triangle', o2: 'sine', o2oct: 1, o2det: 0, mix: 0.25, cut: 3000, res: 1, env: 0.3, a: 0.005, d: 0.5, s: 0.3, r: 0.4 },
    Bass:  { o1: 'sawtooth', o2: 'square', o2oct: -1, o2det: 0, mix: 0.5, cut: 420, res: 6, env: 0.55, a: 0.003, d: 0.2, s: 0.5, r: 0.12 },
    Lead:  { o1: 'sawtooth', o2: 'sawtooth', o2oct: 0, o2det: 12, mix: 0.5, cut: 2800, res: 3, env: 0.4, a: 0.01, d: 0.2, s: 0.8, r: 0.2 },
    Pad:   { o1: 'sawtooth', o2: 'sawtooth', o2oct: 0, o2det: 14, mix: 0.5, cut: 1100, res: 1, env: 0.2, a: 0.6, d: 0.8, s: 0.8, r: 1.4 },
    Pluck: { o1: 'square', o2: 'sawtooth', o2oct: 0, o2det: 6, mix: 0.4, cut: 700, res: 4, env: 0.8, a: 0.002, d: 0.18, s: 0, r: 0.2 },
    Organ: { o1: 'sine', o2: 'sine', o2oct: 1, o2det: 0, mix: 0.45, cut: 6000, res: 0.5, env: 0, a: 0.01, d: 0.1, s: 1, r: 0.08 },
    Sub:   { o1: 'sine', o2: 'triangle', o2oct: 0, o2det: 0, mix: 0.2, cut: 900, res: 0.5, env: 0.1, a: 0.004, d: 0.3, s: 0.9, r: 0.15 },
    Strings: { o1: 'sawtooth', o2: 'sawtooth', o2oct: 0, o2det: 9, mix: 0.5, cut: 2400, res: 0.6, env: 0.1, a: 0.25, d: 0.6, s: 0.85, r: 0.6 },
    Brass: { o1: 'sawtooth', o2: 'square', o2oct: 0, o2det: 4, mix: 0.3, cut: 900, res: 2, env: 0.5, a: 0.04, d: 0.25, s: 0.7, r: 0.18 },
    Bell:  { o1: 'sine', o2: 'sine', o2oct: 2, o2det: 31, mix: 0.4, cut: 9000, res: 0.5, env: 0, a: 0.001, d: 1.6, s: 0, r: 1.6 },
    Acid:  { o1: 'sawtooth', o2: 'square', o2oct: 0, o2det: 0, mix: 0.1, cut: 300, res: 15, env: 0.75, a: 0.002, d: 0.16, s: 0.1, r: 0.08 },
    Reese: { o1: 'sawtooth', o2: 'sawtooth', o2oct: 0, o2det: 28, mix: 0.5, cut: 600, res: 3, env: 0.15, a: 0.01, d: 0.4, s: 0.9, r: 0.2 },
    Chip:  { o1: 'square', o2: 'square', o2oct: 1, o2det: 0, mix: 0.2, cut: 12000, res: 0.5, env: 0, a: 0.001, d: 0.08, s: 0.7, r: 0.04 },
    Whistle: { o1: 'sine', o2: 'triangle', o2oct: 0, o2det: 3, mix: 0.15, cut: 5000, res: 0.5, env: 0, a: 0.06, d: 0.2, s: 0.9, r: 0.2 },
    Stab:  { o1: 'sawtooth', o2: 'sawtooth', o2oct: 1, o2det: 18, mix: 0.45, cut: 1500, res: 5, env: 0.6, a: 0.002, d: 0.22, s: 0.15, r: 0.25 },
    Glass: { o1: 'triangle', o2: 'sine', o2oct: 2, o2det: 5, mix: 0.3, cut: 5000, res: 2, env: 0.3, a: 0.002, d: 1.2, s: 0.1, r: 1.2 },
  };

  const fx = () => ({
    eq: { on: false, low: 0, mid: 0, high: 0 },
    dist: { on: false, amt: 0.3 },
    comp: { on: false, thr: -18, ratio: 4 },
    chorus: { on: false, rate: 0.8, depth: 0.5, mix: 0.5 },
    delay: { on: false, time: 0.75, fb: 0.35, mix: 0.25 },
    reverb: { on: false, size: 2, mix: 0.25 },
  });

  L.newTrack = (type, name, preset = 'Keys') => ({
    id: uid(), type, name: name || { synth: 'Synth', drums: 'Drums', audio: 'Audio' }[type],
    vol: 0.8, pan: 0, mute: false, solo: false,
    inst: type === 'synth' ? { preset, ...L.PRESETS[preset] } : type === 'drums' ? { preset: 'Standard', tune: 0, decay: 1 } : null,
    fx: fx(), clips: [],
  });

  // Songs are known by a long random id, which is also their key in this browser's song list and in an account.
  L.songId = () => (crypto.randomUUID ? crypto.randomUUID() : uid() + uid() + uid());
  L.newProject = () => ({
    id: L.songId(), name: 'Untitled', bpm: 120, loop: { on: false, start: 0, end: 16 }, master: { vol: 0.8 },
    tracks: [L.newTrack('drums'), L.newTrack('synth')],
  });

  L.demoProject = () => {
    const p = L.newProject();
    p.name = 'First cut'; p.bpm = 96; p.loop = { on: false, start: 0, end: 32 };
    const N = (pch, s, l, v = 0.8) => ({ p: pch, s, l, v });
    const clip = (name, start, len, notes) => ({ id: uid(), name, start, len, notes });

    const dr = L.newTrack('drums');
    const beat = [];
    for (let b = 0; b < 2; b++) {
      const o = b * 4;
      [0, 1.75, 2.5].forEach(s => beat.push(N(36, o + s, 0.25, 0.95)));
      [1, 3].forEach(s => beat.push(N(37, o + s, 0.25, 0.85)));
      for (let s = 0; s < 4; s += 0.5) if (!(b === 1 && s === 3.5)) beat.push(N(39, o + s, 0.25, s % 1 ? 0.45 : 0.7));
    }
    beat.push(N(40, 7.5, 0.5, 0.6), N(38, 7, 0.25, 0.5));
    for (let i = 0; i < 4; i++) dr.clips.push(clip('Beat', i * 8, 8, beat.map(n => ({ ...n }))));
    dr.vol = 0.78;

    const roots = [33, 29, 36, 31];
    const bs = L.newTrack('synth', 'Bass', 'Bass');
    const bn = [];
    roots.forEach((r, i) => [[0, 0.75], [1.5, 0.5], [2.5, 0.5], [3.25, 0.5]].forEach(([s, l], j) => bn.push(N(r + (j === 3 ? 12 : 0), i * 4 + s, l, j ? 0.7 : 0.9))));
    for (let i = 0; i < 2; i++) bs.clips.push(clip('Bassline', i * 16, 16, bn.map(n => ({ ...n }))));

    const pd = L.newTrack('synth', 'Chords', 'Pad');
    const ch = [];
    [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]].forEach((c, i) => c.forEach(pc => ch.push(N(pc, i * 4, 3.75, 0.6))));
    for (let i = 0; i < 2; i++) pd.clips.push(clip('Am F C G', i * 16, 16, ch.map(n => ({ ...n }))));
    pd.vol = 0.66; pd.fx.reverb.on = true; pd.fx.reverb.mix = 0.3;

    const ld = L.newTrack('synth', 'Pluck', 'Pluck');
    const m = [[69, 0, .5], [72, .75, .5], [76, 1.5, .75], [74, 2.5, .5], [72, 3, .75],
      [69, 4, .75], [72, 5, .5], [77, 5.5, .75], [76, 6.5, 1],
      [79, 8, .5], [76, 8.75, .5], [72, 9.5, .75], [74, 10.5, .5], [76, 11, .75],
      [74, 12, 1.5], [71, 14, .75], [67, 15, .75]];
    ld.clips.push(clip('Hook', 16, 16, m.map(([pc, s, l]) => N(pc, s, l, 0.8))));
    ld.vol = 0.7; ld.fx.delay.on = true; ld.fx.reverb.on = true; ld.fx.reverb.mix = 0.2;

    p.tracks = [dr, bs, pd, ld];
    return p;
  };

  // ---- selection, view ----
  L.project = null;
  L.buffers = new Map();
  L.sel = { track: null, clip: null, notes: new Set() };
  L.view = { ppb: 28, snap: 1, eppb: 72, esnap: 0.25, oct: 4, vel: 0.8, stamp: 'Off' };
  L.pos = 0;
  L.focus = 'arr';

  L.trackById = id => L.project.tracks.find(t => t.id === id);
  L.clipById = id => {
    if (!id) return null;
    for (const track of L.project.tracks) { const clip = track.clips.find(c => c.id === id); if (clip) return { track, clip }; }
    return null;
  };
  L.projectEnd = () => Math.max(0, ...L.project.tracks.flatMap(t => t.clips.map(c => c.start + c.len)));
  L.spb = () => 60 / L.project.bpm;

  L.select = (track, clip = null) => {
    if (L.sel.track === track && L.sel.clip === clip) return;
    L.sel.track = track; L.sel.clip = clip; L.sel.notes.clear();
    L.emit('sel');
  };

  const fixSel = () => {
    if (!L.trackById(L.sel.track)) L.sel.track = L.project.tracks[0]?.id || null;
    if (!L.clipById(L.sel.clip)) L.sel.clip = null;
  };

  // ---- history: whole-project snapshots ----
  // Every change is saved in this browser: the open song in localStorage (read first on start-up),
  // and every song in IndexedDB, so starting a new one never loses the last.
  let hist = [], hi = -1, saveT = 0;
  const persist = () => {
    clearTimeout(saveT);
    L.emit('savestate', 'pending');
    saveT = setTimeout(async () => {
      saveT = 0;
      const json = hist[hi], p = L.project;
      try { localStorage.setItem('lathe.project', json); } catch { /* storage full or blocked */ }
      // a song joins the list once it has something in it, so empty starts do not pile up
      if (p.tracks.some(t => t.clips.length) || p.video) try { await L.idbPut('songs', p.id, { id: p.id, name: p.name, at: Date.now(), json }); } catch { /* no IndexedDB */ }
      L.emit('savestate', 'local');
    }, 400);
  };
  L.savePending = () => !!saveT;
  L.commit = () => {
    hist.length = hi + 1;
    hist.push(JSON.stringify(L.project));
    if (hist.length > 120) hist.shift();
    hi = hist.length - 1;
    fixSel(); persist(); L.emit('change');
  };
  const travel = d => {
    if (hi + d < 0 || hi + d >= hist.length) return;
    hi += d;
    L.project = JSON.parse(hist[hi]);
    L.sel.notes.clear(); fixSel(); persist(); L.emit('change');
  };
  L.undo = () => travel(-1);
  L.redo = () => travel(1);
  // fills in settings that projects saved by an older version do not have
  const upgrade = p => {
    const d = fx();
    p.tracks.forEach(t => { for (const k in d) if (!t.fx[k]) t.fx[k] = d[k]; });
    p.id ||= L.songId(); p.master ||= { vol: 0.8 }; p.loop ||= { on: false, start: 0, end: 16 };
    return p;
  };
  L.setProject = p => {
    upgrade(p);
    L.project = p; hist = [JSON.stringify(p)]; hi = 0;
    L.sel.track = null; L.sel.clip = null; L.sel.notes.clear(); L.pos = 0;
    fixSel(); persist(); L.emit('load'); L.emit('change');
  };

  // ---- songs kept in this browser ----
  L.songs = {
    list: () => L.idbAll('songs').then(a => a.sort((x, y) => y.at - x.at)).catch(() => []),
    get: id => L.idbGet('songs', id).then(r => r ? JSON.parse(r.json) : null),
    del: id => L.idbDel('songs', id),
  };

  // ---- audio buffer store (IndexedDB) ----
  const idb = () => new Promise((res, rej) => {
    const r = indexedDB.open('lathe', 3);
    r.onupgradeneeded = () => ['buf', 'vid', 'songs'].forEach(s => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const idbReq = (store, mode, fn) => idb().then(db => new Promise((res, rej) => { const q = fn(db.transaction(store, mode).objectStore(store)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }));
  L.idbPut = (store, key, val) => idbReq(store, 'readwrite', s => s.put(val, key));
  L.idbGet = (store, key) => idbReq(store, 'readonly', s => s.get(key));
  L.idbDel = (store, key) => idbReq(store, 'readwrite', s => s.delete(key));
  L.idbAll = store => idbReq(store, 'readonly', s => s.getAll());
  L.addBuffer = (buf, id = uid()) => {
    L.buffers.set(id, buf);
    idb().then(db => {
      const ch = [];
      for (let i = 0; i < buf.numberOfChannels; i++) ch.push(buf.getChannelData(i).slice());
      db.transaction('buf', 'readwrite').objectStore('buf').put({ sr: buf.sampleRate, ch }, id);
    }).catch(() => {});
    return id;
  };
  // Loads the stored buffers in `used`, and drops any that no song in this browser refers to any more.
  L.loadBuffers = async used => {
    try {
      const keep = new Set(used);
      for (const r of await L.songs.list()) { try { L.usedBuffers(JSON.parse(r.json)).forEach(id => keep.add(id)); } catch { /* damaged entry */ } }
      const db = await idb();
      await new Promise(res => {
        const req = db.transaction('buf', 'readwrite').objectStore('buf').openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) return res();
          if (!keep.has(cur.key)) cur.delete();
          else if (used.has(cur.key)) {
            const v = cur.value;
            const b = new AudioBuffer({ length: v.ch[0].length, numberOfChannels: v.ch.length, sampleRate: v.sr });
            v.ch.forEach((d, i) => b.copyToChannel(d, i));
            L.buffers.set(cur.key, b);
          }
          cur.continue();
        };
        req.onerror = () => res();
      });
    } catch { /* no IndexedDB: audio clips will be silent after reload */ }
  };
  L.usedBuffers = p => new Set(p.tracks.flatMap(t => t.clips.map(c => c.buf).filter(Boolean)));
})();
