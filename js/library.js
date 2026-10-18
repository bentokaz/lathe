'use strict';
// Sound library: built-in synth presets, drum kits, and the 128 General MIDI instruments
// streamed on demand from the MusyngKite soundfont, falling back to FluidR3 GM (needs a connection the first time each is used).
L.lib = (() => {
  const { $, esc } = L;
  const host = $('#sounds');
  const HOST = 'https://gleitz.github.io/midi-js-soundfonts/', FONTS = ['MusyngKite/', 'FluidR3_GM/'], BASE = HOST + FONTS[0];

  const GM = [
    ['Piano', 'acoustic_grand_piano bright_acoustic_piano electric_grand_piano honkytonk_piano electric_piano_1 electric_piano_2 harpsichord clavinet'],
    ['Mallets and bells', 'celesta glockenspiel music_box vibraphone marimba xylophone tubular_bells dulcimer'],
    ['Organ', 'drawbar_organ percussive_organ rock_organ church_organ reed_organ accordion harmonica tango_accordion'],
    ['Guitar', 'acoustic_guitar_nylon acoustic_guitar_steel electric_guitar_jazz electric_guitar_clean electric_guitar_muted overdriven_guitar distortion_guitar guitar_harmonics'],
    ['Bass', 'acoustic_bass electric_bass_finger electric_bass_pick fretless_bass slap_bass_1 slap_bass_2 synth_bass_1 synth_bass_2'],
    ['Solo strings', 'violin viola cello contrabass tremolo_strings pizzicato_strings orchestral_harp timpani'],
    ['Ensemble and choir', 'string_ensemble_1 string_ensemble_2 synth_strings_1 synth_strings_2 choir_aahs voice_oohs synth_choir orchestra_hit'],
    ['Brass', 'trumpet trombone tuba muted_trumpet french_horn brass_section synth_brass_1 synth_brass_2'],
    ['Reeds', 'soprano_sax alto_sax tenor_sax baritone_sax oboe english_horn bassoon clarinet'],
    ['Flutes and pipes', 'piccolo flute recorder pan_flute blown_bottle shakuhachi whistle ocarina'],
    ['Sampled leads', 'lead_1_square lead_2_sawtooth lead_3_calliope lead_4_chiff lead_5_charang lead_6_voice lead_7_fifths lead_8_bass__lead'],
    ['Sampled pads', 'pad_1_new_age pad_2_warm pad_3_polysynth pad_4_choir pad_5_bowed pad_6_metallic pad_7_halo pad_8_sweep'],
    ['Textures', 'fx_1_rain fx_2_soundtrack fx_3_crystal fx_4_atmosphere fx_5_brightness fx_6_goblins fx_7_echoes fx_8_scifi'],
    ['World', 'sitar banjo shamisen koto kalimba bagpipe fiddle shanai'],
    ['Tuned percussion', 'tinkle_bell agogo steel_drums woodblock taiko_drum melodic_tom synth_drum reverse_cymbal'],
    ['Sound effects', 'guitar_fret_noise breath_noise seashore bird_tweet telephone_ring helicopter applause gunshot'],
  ];
  const KITS = [['Standard', 0, 1], ['Deep 808', -5, 1.7], ['Tight', 3, 0.6], ['Low and slow', -9, 1.3], ['Bright', 6, 0.85], ['Gated', 0, 0.42], ['Roomy', -2, 1.45], ['Bedroom machine', 2, 0.55]];
  // Ready-made sounds: a library instrument plus the effects that make it what it is.
  // Plucked-string models: bright = pick vs finger, decay = ring time (s), pos = where along the string,
  // body = main wooden-body resonance (Hz, 0 for solid electric), tone = final low-pass, strum = gap between strings (s).
  const PLUCKS = [
    ['Nylon guitar', { bright: 0.32, decay: 4.2, pos: 0.18, body: 190, tone: 5200 }, 0.022, 0.2],
    ['Steel-string acoustic', { bright: 0.72, decay: 5.5, pos: 0.12, body: 170, tone: 9500 }, 0.018, 0.2],
    ['Twelve-string jangle', { bright: 0.85, decay: 4.8, pos: 0.1, body: 220, tone: 11000 }, 0.012, 0.2],
    ['Clean electric', { bright: 0.55, decay: 7, pos: 0.16, body: 0, tone: 6500 }, 0.015, 0.15],
    ['Jazz guitar', { bright: 0.28, decay: 4.5, pos: 0.22, body: 0, tone: 2600 }, 0.014, 0.12],
    ['Ukulele', { bright: 0.55, decay: 1.9, pos: 0.2, body: 430, tone: 7500, hp: 140 }, 0.02, 0.12],
    ['Banjo', { bright: 0.9, decay: 1.4, pos: 0.08, body: 650, tone: 9000, hp: 120 }, 0.014, 0.1],
    ['Harp', { bright: 0.35, decay: 6.5, pos: 0.5, body: 0, tone: 6000 }, 0.03, 0.6],
    ['Plucked bass', { bright: 0.3, decay: 4, pos: 0.2, body: 0, tone: 2400, hp: 35 }, 0, 0.1],
  ];
  const COMBOS = [
    ['Dream guitar', 'pluck:Clean electric', { r: 0.9 }, { chorus: { rate: 0.6, depth: 0.6, mix: 0.55 }, delay: { time: 0.75, fb: 0.45, mix: 0.3 }, reverb: { size: 4, mix: 0.4 } }],
    ['Jangle guitar', 'pluck:Twelve-string jangle', {}, { chorus: { rate: 1.2, depth: 0.35, mix: 0.3 }, eq: { low: -3, mid: 0, high: 4.5 }, reverb: { size: 1.2, mix: 0.14 } }],
    ['Shoegaze wall', 'gm:overdriven_guitar', { r: 1.2 }, { chorus: { rate: 0.4, depth: 0.8, mix: 0.6 }, eq: { low: 2, mid: -2, high: -3 }, reverb: { size: 5, mix: 0.5 } }],
    ['Tape keys', 'gm:electric_piano_1', {}, { chorus: { rate: 0.35, depth: 0.85, mix: 0.5 }, eq: { low: 1, mid: 0, high: -7 }, reverb: { size: 1.4, mix: 0.16 } }],
    ['Dream pad', 'synth:Pad', { cut: 1900, a: 0.8, r: 2.2 }, { chorus: { rate: 0.5, depth: 0.7, mix: 0.5 }, reverb: { size: 5, mix: 0.45 } }],
    ['Hazy voices', 'gm:voice_oohs', { r: 1.1 }, { chorus: { rate: 0.45, depth: 0.6, mix: 0.45 }, eq: { low: -2, mid: 0, high: -4 }, reverb: { size: 4.5, mix: 0.45 } }],
    ['Glass bells', 'gm:celesta', { r: 0.8 }, { delay: { time: 0.75, fb: 0.4, mix: 0.28 }, reverb: { size: 3, mix: 0.35 } }],
    ['Mellow lead', 'synth:Whistle', {}, { chorus: { rate: 0.7, depth: 0.4, mix: 0.35 }, delay: { time: 0.5, fb: 0.3, mix: 0.2 }, reverb: { size: 2.2, mix: 0.25 } }],
    ['Bedroom bass', 'gm:electric_bass_finger', {}, { eq: { low: 2, mid: 0, high: -6 }, comp: { thr: -20, ratio: 4 } }],
  ];
  const nice = n => { const s = n.replace(/^(lead|pad|fx)_\d_/, '').replace(/_+/g, ' '); return s[0].toUpperCase() + s.slice(1); };

  const ALL = [
    { name: 'Guitars, ukulele and plucked strings', items: PLUCKS.map(([label, pluck, strum, r]) => ({ kind: 'pluck', label, pluck, strum, r })) },
    { name: 'Built-in synth', items: Object.keys(L.PRESETS).map(k => ({ kind: 'synth', label: k })) },
    { name: 'Indie and dream pop', items: COMBOS.map(([label, base, inst, fx]) => ({ kind: 'combo', label, base, inst, fx })) },
    { name: 'Drum kits', items: KITS.map(([label, tune, decay]) => ({ kind: 'kit', label, tune, decay })) },
    ...GM.map(([name, list]) => ({ name, items: list.split(' ').map(n => ({ kind: 'gm', name: n, label: nice(n) })) })),
  ];
  const TOTAL = ALL.reduce((n, c) => n + c.items.length, 0);

  // ---------- sample loading ----------
  const sets = new Map(); // name -> { ready, bufs: Map(pitch -> AudioBuffer), meta: Map(pitch -> prep result), keys, norm, promise }

  // Cleans one decoded note in place and reports how to play it:
  //  lead  seconds of encoder silence to skip, so notes speak on time
  //  loop  [start, end] seconds for notes that are still sounding when the recording stops, so they can be held;
  //        the loop is a whole number of pitch periods long and crossfaded, so it does not click or bump
  //  loud  RMS of the first 0.6 s, used to bring every instrument to the same level
  function prep(b, p) {
    const sr = b.sampleRate, n = b.length, d0 = b.getChannelData(0);
    let pk = 0;
    for (let i = 0; i < n; i++) { const v = Math.abs(d0[i]); if (v > pk) pk = v; }
    if (!pk) return null;
    let lead = 0;
    while (lead < n && Math.abs(d0[lead]) < pk * 0.02) lead++;
    lead = Math.max(0, lead - Math.floor(sr * 0.002));
    const rms = (a, z) => { a = Math.floor(a); z = Math.min(n, Math.floor(z)); let s = 0; for (let i = a; i < z; i++) s += d0[i] * d0[i]; return Math.sqrt(s / Math.max(1, z - a)); };
    const mid = rms(n * 0.4, n * 0.5), end = rms(n * 0.88, n * 0.98);
    let loop = null;
    if (end > mid * 0.5 && end > pk * 0.08) {
      const per = sr / (440 * 2 ** ((p - 69) / 12)), a = Math.floor(n * 0.35), z = a + Math.round(Math.round(n * 0.55 / per) * per);
      const X = Math.min(Math.floor(sr * 0.2), a - lead - 1);
      if (X > 64 && z < n) {
        for (let ch = 0; ch < b.numberOfChannels; ch++) {
          const d = b.getChannelData(ch);
          // how alike the two ends are decides the fade shape, so the level stays even through the join
          let xy = 0, xx = 0, yy = 0;
          for (let i = 0; i < X; i++) { const x = d[z - X + i], y = d[a - X + i]; xy += x * y; xx += x * x; yy += y * y; }
          const corr = L.clamp(xy / (Math.sqrt(xx * yy) || 1), 0, 1);
          for (let i = 0; i < X; i++) {
            const th = i / X * Math.PI / 2, w1 = Math.cos(th), w2 = Math.sin(th), k = 1 / Math.sqrt(1 + 2 * w1 * w2 * corr);
            d[z - X + i] = (d[z - X + i] * w1 + d[a - X + i] * w2) * k;
          }
        }
        loop = [a / sr, z / sr];
      }
    }
    if (!loop) {
      const F = Math.min(n, Math.floor(sr * 0.04));
      for (let ch = 0; ch < b.numberOfChannels; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < F; i++) d[n - 1 - i] *= i / F; }
    }
    return { lead: lead / sr, loop, loud: rms(lead, lead + sr * 0.6) };
  }
  const PC = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;

  function load(name) {
    let s = sets.get(name);
    if (s) return s.promise;
    s = { ready: false, bufs: new Map(), meta: new Map(), keys: [], norm: 1 };
    sets.set(name, s);
    s.promise = (async () => {
      try {
        let res = null;
        for (const font of FONTS) { try { res = await fetch(HOST + font + name + '-mp3.js'); if (res.ok) break; } catch { res = null; } }
        if (!res || !res.ok) throw new Error('unreachable');
        const txt = await res.text(), re = /"([A-G]b?)(\d)":\s*"data:audio\/mp3;base64,([^"]+)"/g, jobs = [];
        let m;
        while ((m = re.exec(txt))) {
          const p = 12 * (+m[2] + 1) + PC[m[1]];
          if (p % 3) continue; // every third note is enough; neighbours are repitched
          jobs.push(L.engine.decode(unb64(m[3])).then(b => { const meta = prep(b, p); if (meta) { s.bufs.set(p, b); s.meta.set(p, meta); } }, () => {}));
        }
        await Promise.all(jobs);
        if (!s.bufs.size) throw new Error('no samples');
        s.keys = [...s.bufs.keys()].sort((a, b) => a - b);
        const louds = [...s.meta.values()].map(m => m.loud).sort((a, b) => a - b);
        s.norm = L.clamp(0.05 / (louds[louds.length >> 1] || 0.05), 0.25, 6);
        s.ready = true;
        render();
        return true;
      } catch (err) {
        sets.delete(name);
        L.toast('Could not load ' + nice(name) + ' (it needs an internet connection)', 6000);
        return false;
      }
    })();
    return s.promise;
  }
  function sample(name, pitch) {
    const s = sets.get(name);
    if (!s || !s.ready) { load(name); return null; }
    let base = s.keys[0];
    for (const k of s.keys) if (Math.abs(k - pitch) < Math.abs(base - pitch)) base = k;
    return { buf: s.bufs.get(base), base, norm: s.norm, ...s.meta.get(base) };
  }
  const used = p => [...new Set(p.tracks.map(t => t.inst && t.inst.sf).filter(Boolean))];
  const ensure = p => used(p).forEach(load);
  const ready = p => Promise.all(used(p).map(load));

  // ---------- browser panel ----------
  let cat = 0, query = '';
  const current = () => { const t = L.trackById(L.sel.track); return t && t.inst ? t.inst : null; };
  const isCur = (it, I) => I && (it.kind === 'combo' || it.kind === 'pluck' ? I.preset === it.label : it.kind === 'gm' ? I.sf === it.name : !I.sf && I.preset === it.label && (it.kind === 'kit') === (I.tune !== undefined));

  // with a style in use, its instruments are offered first
  const cats = () => { const g = L.guide && L.guide.items(); return g ? [{ name: 'Suggested for this style', items: g }, ...ALL] : ALL; };
  function render() {
    if (!host.querySelector('.lib-side')) {
      host.innerHTML = `<div class="lib-side"><input class="lib-q" type="search" placeholder="Search ${TOTAL} sounds" spellcheck="false"><nav></nav></div><div class="lib-main"><div class="lib-head"></div><div class="lib-list"></div></div>`;
      host.querySelector('.lib-q').oninput = e => { query = e.target.value.trim().toLowerCase(); render(); };
    }
    const t = L.trackById(L.sel.track), I = current();
    const CATS = cats(); cat = Math.min(cat, CATS.length - 1);
    host.querySelector('nav').innerHTML = CATS.map((c, i) => `<button data-cat="${i}" class="${!query && i === cat ? 'on' : ''}">${c.name}<small>${c.items.length}</small></button>`).join('');
    const items = query ? CATS.flatMap(c => c.items.filter(it => (it.label + ' ' + c.name).toLowerCase().includes(query))) : CATS[cat].items;
    const head = query ? `${items.length} match${items.length === 1 ? '' : 'es'}` : CATS[cat].name;
    const note = !t ? 'Picking a sound makes a new track.' : t.type === 'audio' ? 'Audio track selected: picking a sound makes a new track.' : `Picking a sound puts it on <b>${esc(t.name)}</b> (a ${t.type === 'drums' ? 'drum' : 'synth'} track; the other kind makes a new track).`;
    host.querySelector('.lib-head').innerHTML = `<h2>${head}</h2><p>${note}${CATS[cat].items[0].kind === 'gm' || query ? ' Sampled instruments download on first use and come with a touch of reverb.' : ''}</p>`;
    host.querySelector('.lib-list').innerHTML = items.length ? items.map(it => {
      const s = it.kind === 'gm' && sets.get(it.name), tag = it.kind === 'gm' ? (s ? (s.ready ? 'loaded' : 'loading') : 'sampled') : it.kind === 'kit' ? 'kit' : it.kind === 'pluck' ? 'modelled' : it.kind === 'combo' ? 'with effects' : 'synth';
      return `<button class="${isCur(it, I) ? 'cur' : ''}" data-k="${it.kind}" data-l="${esc(it.label)}"${it.name ? ` data-n="${it.name}"` : ''}><span>${esc(it.label)}</span><small>${tag}</small></button>`;
    }).join('') : '<p class="lib-none">Nothing by that name.</p>';
  }

  const byKey = key => { const [kind, name] = key.split(':'); return ALL.flatMap(c => c.items).find(it => it.kind === kind && (kind === 'gm' ? it.name : it.label) === name) || null; };
  // Puts a library sound on a track.
  function apply(t, it) {
    if (it.kind === 'kit') t.inst = { preset: it.label, tune: it.tune, decay: it.decay };
    else if (it.kind === 'synth') t.inst = { preset: it.label, ...L.PRESETS[it.label] };
    else if (it.kind === 'combo') {
      apply(t, byKey(it.base));
      Object.assign(t.inst, it.inst, { preset: it.label });
      for (const [k, v] of Object.entries(it.fx)) Object.assign(t.fx[k], v, { on: true });
    }
    else if (it.kind === 'pluck') { t.inst = { preset: it.label, pluck: { ...it.pluck }, strum: it.strum, r: it.r, gain: 1 }; if (!t.fx.reverb.on) Object.assign(t.fx.reverb, { on: true, size: 1.4, mix: 0.12 }); }
    else { t.inst = { preset: it.label, sf: it.name, gain: 1, r: 0.3, strum: /guitar|banjo|shamisen|koto|sitar|harp/.test(it.name) ? 0.016 : 0 }; if (!t.fx.reverb.on) Object.assign(t.fx.reverb, { on: true, size: 1.6, mix: 0.14 }); }
  }
  function pick(it) {
    const want = it.kind === 'kit' ? 'drums' : 'synth';
    let t = L.trackById(L.sel.track);
    if (!t || t.type !== want) t = L.arr.addTrack(want);
    const old = t.inst.preset;
    apply(t, it);
    if (/^(Synth|Drums)( \d+)?$/.test(t.name) || t.name === old) t.name = it.label;
    L.commit();
    const sf = t.inst.sf;
    if (!sf) return L.engine.blip(t.id, it.kind === 'kit' ? 36 : 60);
    const s = sets.get(sf);
    if (s && s.ready) return L.engine.blip(t.id, 60);
    L.toast('Loading ' + it.label + '…', 0);
    load(sf).then(ok => { if (ok) { L.toast(it.label + ' ready', 1500); if (L.sel.track === t.id) L.engine.blip(t.id, 60); } });
    render();
  }

  host.addEventListener('click', e => {
    const c = e.target.closest('[data-cat]'), b = e.target.closest('[data-k]');
    if (c) { cat = +c.dataset.cat; query = ''; host.querySelector('.lib-q').value = ''; render(); }
    else if (b) pick(ALL.flatMap(x => x.items).find(it => it.kind === b.dataset.k && it.label === b.dataset.l && (it.name || '') === (b.dataset.n || '')));
  });

  return { render, sample, ensure, ready, load, byKey, apply, TOTAL, names: () => GM.flatMap(g => g[1].split(' ')), base: BASE };
})();
