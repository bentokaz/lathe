'use strict';
L.panels = (() => {
  const { $, esc, pad } = L;
  const insp = $('#insp'), mixer = $('#mixer');

  const pct = v => Math.round(v * 100) + '%';
  const sec = v => v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s';
  const hz = v => v < 1000 ? Math.round(v) + ' Hz' : (v / 1000).toFixed(1) + ' kHz';
  const dB = v => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB';
  const WAVES = ['sine', 'triangle', 'sawtooth', 'square'];

  // [path, label, min, max, step, format, log?]
  const SYNTH = [
    ['inst.mix', 'Osc blend', 0, 1, 0.01, pct],
    ['inst.o2oct', 'Osc 2 octave', -2, 2, 1, v => (v > 0 ? '+' : '') + v],
    ['inst.o2det', 'Osc 2 detune', 0, 50, 1, v => v + ' ct'],
    ['inst.cut', 'Cutoff', 80, 16000, 0, hz, true],
    ['inst.res', 'Resonance', 0.1, 18, 0.1, v => v.toFixed(1)],
    ['inst.env', 'Filter env', 0, 1, 0.01, pct],
    ['inst.a', 'Attack', 0.001, 2, 0, sec, true],
    ['inst.d', 'Decay', 0.02, 3, 0, sec, true],
    ['inst.s', 'Sustain', 0, 1, 0.01, pct],
    ['inst.r', 'Release', 0.02, 4, 0, sec, true],
  ];
  const SAMPLED = [['inst.gain', 'Level', 0, 2, 0.01, pct], SYNTH[9]];
  const KIT = [
    ['inst.tune', 'Tune', -12, 12, 1, v => (v > 0 ? '+' : '') + v + ' st'],
    ['inst.decay', 'Decay', 0.4, 2.5, 0.01, v => 'x' + v.toFixed(2)],
  ];
  const FX = [
    ['eq', 'Equaliser', [['fx.eq.low', 'Low', -15, 15, 0.5, dB], ['fx.eq.mid', 'Mid', -15, 15, 0.5, dB], ['fx.eq.high', 'High', -15, 15, 0.5, dB]]],
    ['dist', 'Drive', [['fx.dist.amt', 'Amount', 0, 1, 0.01, pct]]],
    ['chorus', 'Chorus', [['fx.chorus.rate', 'Speed', 0.1, 5, 0.05, v => v.toFixed(2) + ' Hz'], ['fx.chorus.depth', 'Depth', 0, 1, 0.01, pct], ['fx.chorus.mix', 'Mix', 0, 1, 0.01, pct]]],
    ['comp', 'Compressor', [['fx.comp.thr', 'Threshold', -50, 0, 1, v => v + ' dB'], ['fx.comp.ratio', 'Ratio', 1, 20, 0.5, v => v + ':1']]],
    ['delay', 'Delay', [['fx.delay.time', 'Time', 0.125, 2, 0.125, v => v + ' beat'], ['fx.delay.fb', 'Feedback', 0, 0.9, 0.01, pct], ['fx.delay.mix', 'Mix', 0, 1, 0.01, pct]]],
    ['reverb', 'Reverb', [['fx.reverb.size', 'Size', 0.3, 6, 0.1, v => v.toFixed(1) + ' s'], ['fx.reverb.mix', 'Mix', 0, 1, 0.01, pct]]],
  ];
  const DEFS = Object.fromEntries([...SYNTH, SAMPLED[0], ...KIT, ...FX.flatMap(f => f[2])].map(d => [d[0], d]));

  const get = (t, path) => path.split('.').reduce((o, k) => o[k], t);
  const set = (t, path, v) => { const ks = path.split('.'), last = ks.pop(); ks.reduce((o, k) => o[k], t)[last] = v; };
  const toPos = (d, v) => d[6] ? Math.round(1000 * Math.log(v / d[2]) / Math.log(d[3] / d[2])) : v;
  const fromPos = (d, x) => d[6] ? d[2] * (d[3] / d[2]) ** (x / 1000) : x;

  const row = (t, d) => {
    const v = get(t, d[0]);
    return `<label class="prm"><span>${d[1]}</span><input type="range" data-p="${d[0]}" ${d[6] ? 'min="0" max="1000" step="1"' : `min="${d[2]}" max="${d[3]}" step="${d[4]}"`} value="${toPos(d, v)}"><output>${d[5](v)}</output></label>`;
  };
  const sel = (key, val, opts) => `<select data-s="${key}">${opts.map(o => `<option${o === val ? ' selected' : ''}>${o}</option>`).join('')}</select>`;

  function renderInsp() {
    const t = L.trackById(L.sel.track);
    if (!t) { insp.innerHTML = '<div class="i-empty">No track selected</div>'; return; }
    const i = L.project.tracks.indexOf(t);
    let inst;
    const sound = `<div class="prm sel2"><span>Sound</span><button class="i-sound" data-a="browse" title="Open the sound library"><b>${esc(t.inst ? t.inst.preset || 'Standard' : '')}</b>${L.icon('browse')}</button></div>`;
    if (t.type === 'synth' && t.inst.sf) {
      inst = `${sound}<p class="i-note">Sampled instrument. Bowed, blown and held sounds sustain for as long as the note; plucked and struck ones ring out naturally.</p>${SAMPLED.map(d => row(t, d)).join('')}`;
    } else if (t.type === 'synth') {
      inst = `${sound}
        <div class="prm sel2"><span>Osc 1</span>${sel('o1', t.inst.o1, WAVES)}</div>
        <div class="prm sel2"><span>Osc 2</span>${sel('o2', t.inst.o2, WAVES)}</div>
        ${SYNTH.map(d => row(t, d)).join('')}`;
    } else if (t.type === 'drums') {
      inst = `${sound}<p class="i-note">Eight synthesised voices: ${L.DRUMS.join(', ').toLowerCase()}.</p>${KIT.map(d => row(t, d)).join('')}`;
    } else inst = '<p class="i-note">Records from the microphone when this track is selected and you press record. Drop audio files on its lane to import them.</p>';

    insp.innerHTML = `
      <div class="i-head"><span class="i-no">${pad(i + 1, 2)}</span><input class="i-name" value="${esc(t.name)}" spellcheck="false" aria-label="Track name"></div>
      <div class="i-acts"><button class="ib" data-a="up" title="Move track up" aria-label="Move track up">${L.icon('up')}</button><button class="ib" data-a="down" title="Move track down" aria-label="Move track down">${L.icon('down')}</button><button class="ib" data-a="dup" title="Duplicate track" aria-label="Duplicate track">${L.icon('dup')}</button><button class="ib" data-a="del" title="Delete track" aria-label="Delete track">${L.icon('trash')}</button></div>
      <section><h3>${t.type === 'synth' ? (t.inst.sf ? 'Instrument' : 'Synth') : t.type === 'drums' ? 'Drum kit' : 'Input'}</h3>${inst}</section>
      <section><h3>Effects <small>${FX.filter(f => t.fx[f[0]].on).length} of ${FX.length} on</small></h3>
        ${FX.map(([k, name, defs]) => `<div class="fx${t.fx[k].on ? ' on' : ''}"><button class="fx-t" data-fx="${k}"><b></b>${name}</button>${t.fx[k].on ? defs.map(d => row(t, d)).join('') : ''}</div>`).join('')}
      </section>`;
  }

  insp.addEventListener('input', e => {
    const p = e.target.dataset.p; if (!p) return;
    const t = L.trackById(L.sel.track), d = DEFS[p], v = fromPos(d, +e.target.value);
    set(t, p, v); e.target.nextElementSibling.textContent = d[5](v);
    L.engine.sync(t);
  });
  insp.addEventListener('change', e => {
    const t = L.trackById(L.sel.track), el = e.target;
    if (el.classList.contains('i-name')) t.name = el.value || 'Track';
    else if (el.dataset.s === 'preset') { if (L.PRESETS[el.value]) t.inst = { preset: el.value, ...L.PRESETS[el.value] }; }
    else if (el.dataset.s) t.inst[el.dataset.s] = el.value;
    else if (!el.dataset.p) return;
    L.commit();
  });
  insp.addEventListener('click', e => {
    const t = L.trackById(L.sel.track), ts = L.project.tracks, i = ts.indexOf(t);
    const fx = e.target.closest('[data-fx]');
    if (fx) { t.fx[fx.dataset.fx].on = !t.fx[fx.dataset.fx].on; return L.commit(); }
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'browse') return L.showTab('sounds');
    if (a === 'up' && i > 0) [ts[i - 1], ts[i]] = [ts[i], ts[i - 1]];
    else if (a === 'down' && i < ts.length - 1) [ts[i + 1], ts[i]] = [ts[i], ts[i + 1]];
    else if (a === 'dup') {
      const c = JSON.parse(JSON.stringify(t)); c.id = L.uid(); c.name += ' copy'; c.clips.forEach(x => { x.id = L.uid(); });
      ts.splice(i + 1, 0, c); L.sel.track = c.id; L.sel.clip = null;
    } else if (a === 'del') return L.arr.delTrack(t);
    else return;
    L.commit();
  });

  // ---------- mixer ----------
  function renderMixer() {
    const p = L.project;
    mixer.innerHTML = p.tracks.map((t, i) => `
      <div class="strip${t.id === L.sel.track ? ' sel' : ''}" data-track="${t.id}">
        <div class="s-top"><span class="s-no">${pad(i + 1, 2)}</span><span class="s-name">${esc(t.name)}</span></div>
        <div class="s-fx">${FX.map(([k]) => `<button data-fx="${k}" class="${t.fx[k].on ? 'on' : ''}" title="${k}">${k.slice(0, 2)}</button>`).join('')}</div>
        <label class="s-pan"><span>Pan</span><input type="range" data-k="pan" min="-1" max="1" step="0.02" value="${t.pan}"></label>
        <div class="s-fad"><div class="vmeter" data-meter="${t.id}"><i></i></div><input class="fader" type="range" data-k="vol" min="0" max="1" step="0.005" value="${t.vol}"></div>
        <output>${L.db(L.gain(t.vol))}</output>
        <div class="s-ms"><button data-act="mute" class="${t.mute ? 'on' : ''}">M</button><button data-act="solo" class="solo${t.solo ? ' on' : ''}">S</button></div>
      </div>`).join('') + `
      <div class="strip master" data-track="master">
        <div class="s-top"><span class="s-name">Master</span></div>
        <div class="s-big"><output>${L.db(L.gain(p.master.vol))}</output><small>dB</small></div>
        <p>Limiter on the output keeps peaks under 0 dB.</p>
        <div class="s-fad"><div class="vmeter" data-meter="master"><i></i></div><input class="fader" type="range" data-k="vol" min="0" max="1" step="0.005" value="${p.master.vol}"></div>
      </div>`;
  }
  const stripTrack = el => { const id = el.closest('.strip').dataset.track; return id === 'master' ? null : L.trackById(id); };
  mixer.addEventListener('input', e => {
    const k = e.target.dataset.k; if (!k) return;
    const t = stripTrack(e.target), obj = t || L.project.master;
    obj[k] = +e.target.value;
    if (k === 'vol') e.target.closest('.strip').querySelector('output').textContent = L.db(L.gain(obj.vol));
    L.engine.sync(t);
  });
  mixer.addEventListener('change', e => { if (e.target.dataset.k) L.commit(); });
  mixer.addEventListener('dblclick', e => { if (e.target.dataset.k === 'pan') { stripTrack(e.target).pan = 0; L.commit(); } });
  mixer.addEventListener('click', e => {
    const strip = e.target.closest('.strip'); if (!strip) return;
    const t = stripTrack(e.target); if (!t) return;
    const b = e.target.closest('button');
    if (b && b.dataset.fx) { t.fx[b.dataset.fx].on = !t.fx[b.dataset.fx].on; L.commit(); }
    else if (b && b.dataset.act) { t[b.dataset.act] = !t[b.dataset.act]; L.commit(); }
    else if (e.target.tagName !== 'INPUT') L.select(t.id, null);
  });

  return { render() { renderInsp(); renderMixer(); } };
})();
