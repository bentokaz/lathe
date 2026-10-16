'use strict';
// On-screen keyboard (or drum pads) for the selected track. Plays through the engine, so it records like any other input.
L.kb = (() => {
  const { $, esc, clamp } = L, E = L.engine, P = L.perf;
  const host = $('#keys');
  const LETTER = {}; // semitone -> typing key label
  Object.values(L.KEYMAP).forEach(([semi, label]) => { LETTER[semi] = label; });
  const WHITE = [0, 2, 4, 5, 7, 9, 11], NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const RATES = [[1, '1/4'], [0.5, '1/8'], [1 / 3, '1/8 triplet'], [0.25, '1/16'], [0.125, '1/32']];
  const opts = (key, list) => `<select data-s="${key}">${list.map(([v, s]) => `<option value="${v}"${String(P.S[key]) === String(v) ? ' selected' : ''}>${s}</option>`).join('')}</select>`;

  function render() {
    const t = L.trackById(L.sel.track), oct = L.view.oct;
    // with a style in use: notes of its scale are marked, the home note stands out, the rest are dimmed
    const gs = L.guide ? L.guide.scale() : null, sug = L.guide ? L.guide.degs() : [];
    const mark = p => !gs ? '' : p % 12 === gs.key ? ' rt' : gs.pcs.has(p % 12) ? ' in' : ' out';
    const bar = `<div class="ed-bar kb-bar">
        <button class="kb-rec${E.recording ? ' on' : ''}" data-a="rec" title="Record what you play onto this track (R)">${L.icon('rec')}<span>${E.recording ? 'Stop' : 'Record'}</span></button>
        <span class="lbl">Track</span><b class="kb-track">${t ? esc(t.name) : 'none'}</b>
        ${t && t.type === 'synth' ? `<span class="lbl">Octave</span><span class="stepper"><button data-a="oct-" title="Octave down (Z)">−</button><b>C${oct}</b><button data-a="oct+" title="Octave up (X)">+</button></span>` : ''}
        <span class="lbl">Velocity</span><input class="kb-vel" type="range" min="0.1" max="1" step="0.01" value="${L.view.vel}">
        <span class="ed-hint">${gs ? `Marked keys fit ${gs.name}; red is the home note` : 'Click or drag across the keys, or use the letters printed on them'}</span>
      </div>`;
    let body;
    if (!t || t.type === 'audio') {
      body = `<div class="ed-empty"><h2>No instrument here</h2><p>${t ? 'This is an audio track. It records the microphone when you press Record.' : 'Select a synth or drum track.'} Pick a synth or drum track to get a keyboard.</p></div>`;
    } else if (t.type === 'drums') {
      const keys = Object.values(L.KEYMAP).sort((a, b) => a[0] - b[0]);
      body = `<div class="kb-pads">${L.DRUMS.map((d, i) => `<button class="pad" data-p="${36 + i}"><b>${d}</b><small>${keys[i][1]}</small></button>`).join('')}</div>`;
    } else {
      const arp = P.S.arp !== 'Off';
      const chords = `<div class="ch-row">
          <div class="ch-set">
            <label><span>One key plays</span>${opts('chord', [['Off', 'A single note'], ...Object.keys(L.CHORDS).map(k => [k, k + ' chord'])])}</label>
            <label><span>Arpeggio</span>${opts('arp', [['Off', 'Off'], ['Up', 'Up'], ['Down', 'Down'], ['Up-down', 'Up and down'], ['Random', 'Random']])}</label>
            <label class="${arp ? '' : 'dis'}"><span>Speed</span>${opts('rate', RATES)}</label>
            <label class="${arp ? '' : 'dis'}"><span>Range</span>${opts('range', [[1, '1 octave'], [2, '2 octaves']])}</label>
          </div>
          <div class="ch-pads">
            <label><span>Chords in</span>${opts('key', NOTES.map((n, i) => [i, n]))}${opts('scale', Object.keys(P.SCALES).map(k => [k, k.toLowerCase()]))}</label>
            ${P.degrees().map((d, i) => `<button class="cpad${sug.includes(i) ? ' sug' : ''}" data-pad="${i}" title="Press ${i + 1} on your keyboard"><b>${d.name}</b><small>${d.roman}<i>${i + 1}</i></small></button>`).join('')}
          </div>
        </div>`;
      const lo = 12 * oct, octs = 4, nW = octs * 7 + 1; // one octave below the typing octave, three above, plus a top C
      let wh = '', bl = '', w = 0;
      for (let p = lo; p <= lo + octs * 12; p++) {
        const pc = p % 12, semi = p - 12 * (oct + 1), tag = LETTER[semi] !== undefined ? `<small>${LETTER[semi]}</small>` : '';
        if (WHITE.includes(pc)) { wh += `<div class="wk${mark(p)}" data-p="${p}">${tag}${pc === 0 ? `<i>C${p / 12 - 1}</i>` : ''}</div>`; w++; }
        else bl += `<div class="bk${mark(p)}" data-p="${p}" style="left:${w / nW * 100}%;width:${0.62 / nW * 100}%">${tag}</div>`;
      }
      body = `${chords}<div class="kb-piano">${wh}${bl}</div>`;
    }
    host.innerHTML = bar + body;
  }

  host.addEventListener('pointerdown', e => {
    const pad = e.target.closest('[data-pad]'), key = e.target.closest('[data-p]');
    const done = fn => { const up = () => { removeEventListener('pointerup', up); removeEventListener('pointercancel', up); fn(); }; addEventListener('pointerup', up); addEventListener('pointercancel', up); };
    if (pad) {
      e.preventDefault();
      pad.classList.add('dn'); P.pad('ptr', +pad.dataset.pad);
      return done(() => { pad.classList.remove('dn'); P.up('ptr'); });
    }
    if (!key) return;
    e.preventDefault();
    let cur = +key.dataset.p;
    P.down('ptr', [cur]);
    const mv = ev => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY), k = el && el.closest('#keys [data-p]'), p = k ? +k.dataset.p : null;
      if (p === cur) return;
      P.up('ptr'); cur = p;
      if (p !== null) P.down('ptr', [p]);
    };
    addEventListener('pointermove', mv);
    done(() => { removeEventListener('pointermove', mv); P.up('ptr'); });
  });
  host.addEventListener('click', e => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'rec') E.record();
    else { L.view.oct = clamp(L.view.oct + (a.dataset.a === 'oct+' ? 1 : -1), 1, 6); render(); }
  });
  host.addEventListener('input', e => { if (e.target.classList.contains('kb-vel')) L.view.vel = +e.target.value; });
  host.addEventListener('change', e => {
    const k = e.target.dataset.s; if (!k) return;
    P.S[k] = ['rate', 'range', 'key'].includes(k) ? +e.target.value : e.target.value;
    e.target.blur(); render();
  });

  L.on('note', ({ p, on }) => { const k = host.querySelector(`[data-p="${p}"]`); if (k) k.classList.toggle('dn', on); });
  L.on('transport', render);

  return { render };
})();
