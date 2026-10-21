'use strict';
L.ed = (() => {
  const { $, esc, clamp } = L;
  const host = $('#editor');
  const KW = 72, P_HI = 108, P_LO = 24;
  let curId = null, lastLen = 0.5, clipboard = [], gsig = '';
  const sig = () => L.guide ? L.guide.sig() : '';

  const ctx = () => L.clipById(L.sel.clip);
  const geom = t => t.type === 'drums'
    ? { rh: 30, rows: 8, dir: 1, row: p => p - 36, pitch: r => 36 + r }
    : { rh: 16, rows: P_HI - P_LO + 1, dir: -1, row: p => P_HI - p, pitch: r => P_HI - r };
  const sn = () => L.view.esnap;
  const q = v => sn() ? Math.round(v / sn()) * sn() : v;
  const cl = c => c.loop || c.len; // the part of the clip you edit; a looped clip repeats it

  function render() {
    const r = ctx();
    if (!r) {
      curId = null;
      host.innerHTML = `<div class="ed-empty"><h2>Nothing open</h2><p>Double-click an empty stretch of a synth or drum lane to start a clip, or double-click a clip to open it here. Audio clips show their waveform and gain.</p></div>`;
      return;
    }
    if (r.track.type === 'audio') { curId = null; return renderAudio(r); }
    if (curId !== r.clip.id || gsig !== sig() || !host.querySelector('.ed-scroll')) { build(r); curId = r.clip.id; }
    update();
  }

  // ---------- audio clip view ----------
  function renderAudio({ clip: c }) {
    const buf = L.buffers.get(c.buf), spb = L.spb();
    host.innerHTML = `<div class="ed-bar">
        <span class="lbl">Clip</span><input class="ed-name" value="${esc(c.name)}" spellcheck="false">
        <span class="lbl">Gain</span><input class="ed-gain" type="range" min="0" max="2" step="0.01" value="${c.gain ?? 1}"><output>${L.db(c.gain ?? 1)} dB</output>
        <button class="ib" data-a="split" title="Split at the playhead (Ctrl+E)" aria-label="Split">${L.icon('cut')}</button><button class="ib" data-a="dup" title="Duplicate clip (Ctrl+D)" aria-label="Duplicate">${L.icon('dup')}</button><button class="ib" data-a="del" title="Delete clip (Delete)" aria-label="Delete">${L.icon('trash')}</button>
        <span class="ed-hint">${buf ? `${(cl(c) * spb).toFixed(2)} s${c.loop ? ', repeating' : ''} of ${buf.duration.toFixed(2)} s / ${buf.sampleRate} Hz / ${buf.numberOfChannels} ch` : 'Audio data missing'}</span>
      </div><div class="ed-wave"><canvas></canvas></div>`;
    const cv = host.querySelector('canvas'), box = cv.parentElement;
    cv.width = Math.max(200, box.clientWidth); cv.height = Math.max(60, box.clientHeight);
    L.drawWave(cv, buf, c.offset, c.offset + cl(c) * spb, getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#d8d3c7');
    host.querySelector('.ed-name').onchange = e => { c.name = e.target.value || 'Clip'; L.commit(); };
    const gain = host.querySelector('.ed-gain');
    gain.oninput = () => { c.gain = +gain.value; gain.nextElementSibling.textContent = L.db(c.gain) + ' dB'; };
    gain.onchange = () => L.commit();
    host.querySelector('.ed-bar').onclick = e => { const b = e.target.closest('[data-a]'); if (b) L.arr[b.dataset.a](); };
  }

  // ---------- piano roll ----------
  function build({ track: t, clip: c }) {
    const g = geom(t), drums = t.type === 'drums';
    const gs = !drums && L.guide ? L.guide.scale() : null;
    gsig = sig();
    let keys = '';
    for (let r = 0; r < g.rows; r++) {
      const p = g.pitch(r);
      keys += drums ? `<div class="key drum" data-p="${p}">${L.DRUMS[r]}</div>`
        : `<div class="key${L.isBlack(p) ? ' blk' : ''}${p % 12 === 0 ? ' c' : ''}${gs ? (p % 12 === gs.key ? ' rt' : gs.pcs.has(p % 12) ? ' in' : '') : ''}" data-p="${p}">${p % 12 === 0 ? L.pitchName(p) : ''}</div>`;
    }
    const opt = (v, s) => `<option value="${v}"${v === sn() ? ' selected' : ''}>${s}</option>`;
    host.innerHTML = `<div class="ed-bar">
        <span class="lbl">Clip</span><input class="ed-name" spellcheck="false">
        <span class="lbl">Length</span><span class="stepper"><button data-a="len-">−</button><b class="ed-len"></b><button data-a="len+">+</button></span>
        <button data-a="unroll" hidden title="Turn the repeats into real notes you can change one by one"></button>
        <span class="lbl">Grid</span><select class="ed-snap">${opt(1, '1/4')}${opt(0.5, '1/8')}${opt(0.25, '1/16')}${opt(0.125, '1/32')}${opt(1 / 3, '1/8 T')}${opt(0, 'Off')}</select>
        <button data-a="quant" title="Q">Quantize</button>
        ${drums ? '' : `<span class="lbl">Click draws</span><select class="ed-chord"><option value="Off">A single note</option>${Object.keys(L.CHORDS).map(k => `<option${k === L.view.stamp ? ' selected' : ''}>${k}</option>`).join('')}</select><button data-a="arp" title="Turn the selected notes into an arpeggio at the grid speed">Arpeggiate</button>`}
        ${drums ? '' : '<button data-a="oct-">Oct −</button><button data-a="oct+">Oct +</button>'}
        <span class="ed-hint">Hover a note to make it a chord, drag either end to resize, right-click erases, Shift-drag selects</span>
      </div>
      <div class="ed-scroll"><div class="ed-inner">
        <div class="ed-rul"><div class="ed-corner">${drums ? 'Kit' : 'Keys'}</div><div class="ed-rule"></div></div>
        <div class="ed-body"><div class="ed-keys">${keys}</div><div class="ed-grid"><div class="ed-out"></div><div class="ed-notes"></div><div class="ed-ph"></div><div class="ed-mq" hidden></div><div class="ed-ghost"></div><div class="ed-pop" hidden></div></div></div>
        <div class="ed-vel"><div class="ed-vlab">Velocity</div><div class="ed-varea"></div></div>
      </div></div>`;

    // row shading
    const grid = host.querySelector('.ed-grid'), stops = [];
    const per = drums ? 2 : 12;
    for (let i = 0; i < per; i++) {
      // rows repeat every octave from C downward; with a style in use they are shaded by scale instead of by key colour
      const pc = (12 - i) % 12, dark = drums ? i % 2 : [2, 4, 6, 9, 11].includes(i);
      const col = gs && !drums ? (pc === gs.key ? 'color-mix(in srgb, var(--sig) 24%, var(--ink-2))' : gs.pcs.has(pc) ? 'var(--ink-3)' : 'color-mix(in srgb, var(--ink) 75%, black)') : dark ? 'var(--ink)' : 'var(--ink-2)';
      const line = !drums && i === 0 ? 'var(--ink-4)' : 'var(--ink)';
      stops.push(`${col} ${i * g.rh}px ${(i + 1) * g.rh - 1}px`, `${line} ${(i + 1) * g.rh - 1}px ${(i + 1) * g.rh}px`);
    }
    grid.style.setProperty('--rows', `linear-gradient(to bottom, ${stops.join(',')})`);
    grid.style.setProperty('--rp', per * g.rh + 'px');
    grid.style.height = g.rows * g.rh + 'px';

    const sc = host.querySelector('.ed-scroll');
    if (!drums) {
      const ps = c.notes.map(n => n.p), mid = ps.length ? (Math.min(...ps) + Math.max(...ps)) / 2 : 62;
      sc.scrollTop = g.row(mid) * g.rh - sc.clientHeight / 2 + 40;
    }
    wire(sc, grid);
  }

  function update() {
    const r = ctx(); if (!r || r.track.type === 'audio') return;
    const { track: t, clip: c } = r, g = geom(t), e = L.view.eppb, S = L.sel.notes;
    const gb = cl(c) + 2;
    const inner = host.querySelector('.ed-inner'), grid = host.querySelector('.ed-grid');
    inner.style.width = KW + gb * e + 'px';
    grid.style.setProperty('--eppb', e + 'px');
    grid.style.setProperty('--sn', (sn() || 1) * e + 'px');
    const nm = host.querySelector('.ed-name'); if (document.activeElement !== nm) nm.value = c.name;
    host.querySelector('.ed-len').textContent = +(cl(c) / 4).toFixed(2) + (cl(c) === 4 ? ' bar' : ' bars');
    host.querySelector('.ed-out').style.left = cl(c) * e + 'px';
    const ul = host.querySelector('[data-a="unroll"]');
    ul.hidden = !c.loop;
    if (c.loop) ul.textContent = `Repeats x${+(c.len / c.loop).toFixed(2)}: make editable`;

    let rl = '';
    for (let b = 0; b < gb; b++) if (b % 4 === 0 || e >= 44) rl += `<span class="${b % 4 ? 'sub' : ''}" style="left:${b * e}px">${Math.floor(b / 4) + 1}${b % 4 ? '.' + (b % 4 + 1) : ''}</span>`;
    host.querySelector('.ed-rule').innerHTML = rl;

    host.querySelector('.ed-notes').innerHTML = c.notes.map((n, i) => {
      const row = g.row(n.p); if (row < 0 || row >= g.rows) return '';
      return `<div class="note${S.has(n) ? ' sel' : ''}" data-i="${i}" style="left:${n.s * e}px;top:${row * g.rh}px;width:${Math.max(4, n.l * e - 1)}px;height:${g.rh - 1}px;--v:${0.4 + 0.6 * n.v}"><i class="n-l"></i><i></i></div>`;
    }).join('');
    host.querySelector('.ed-varea').innerHTML = c.notes.map(n => `<i class="${S.has(n) ? 'sel' : ''}" style="left:${n.s * e}px;height:${n.v * 100}%"></i>`).join('');
  }

  function wire(sc, grid) {
    host.querySelector('.ed-name').onchange = e => { const r = ctx(); r.clip.name = e.target.value || 'Clip'; L.commit(); };
    host.querySelector('.ed-snap').onchange = e => { L.view.esnap = +e.target.value; update(); };
    const chordSel = host.querySelector('.ed-chord');
    if (chordSel) chordSel.onchange = e => { L.view.stamp = e.target.value; e.target.blur(); };
    host.querySelector('.ed-bar').onclick = e => { const a = e.target.dataset.a; if (a) act(a); };

    sc.addEventListener('wheel', e => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const x = e.clientX - sc.getBoundingClientRect().left - KW, beat = (sc.scrollLeft + x) / L.view.eppb;
      L.view.eppb = clamp(L.view.eppb * (e.deltaY < 0 ? 1.18 : 1 / 1.18), 16, 320);
      update(); sc.scrollLeft = beat * L.view.eppb - x;
    }, { passive: false });

    host.querySelector('.ed-keys').addEventListener('pointerdown', e => {
      const p = +e.target.dataset.p; if (!p) return;
      L.engine.noteOn(p); L.drag(e, () => {}, () => L.engine.noteOff(p));
    });
    host.querySelector('.ed-rule').addEventListener('pointerdown', e => {
      const r = ctx(), rect = e.currentTarget.getBoundingClientRect();
      const go = ev => L.engine.seek(r.clip.start + Math.max(0, q((ev.clientX - rect.left) / L.view.eppb)));
      go(e); L.drag(e, (dx, dy, ev) => go(ev));
    });

    grid.addEventListener('contextmenu', e => e.preventDefault());
    // Rest the pointer on a note and a chord picker appears; choosing one stacks that chord on the note
    // (or on every selected note, if the hovered one is part of the selection).
    const pop = host.querySelector('.ed-pop'), ghost = host.querySelector('.ed-ghost');
    const SHORT = { Major: 'Maj', Minor: 'Min', '7th': '7', 'Major 7th': 'Maj7', 'Minor 7th': 'Min7', Sus2: 'Sus2', Sus4: 'Sus4', Diminished: 'Dim', Augmented: 'Aug', Power: '5th' };
    let hov = null, showT = 0, hideT = 0;
    const hide = () => { clearTimeout(showT); pop.hidden = true; ghost.innerHTML = ''; hov = null; };
    const targets = () => !hov ? [] : L.sel.notes.has(hov) ? [...L.sel.notes] : [hov];
    const tones = name => targets().flatMap(b => L.CHORDS[name].slice(1).map(iv => ({ ...b, p: b.p + iv })).filter(x => x.p <= P_HI));
    grid.addEventListener('pointerover', e => {
      const r = ctx(); if (!r || r.track.type !== 'synth') return;
      if (e.target.closest('.ed-pop')) { clearTimeout(hideT); return; }
      const nel = e.target.closest('.note'); if (!nel || e.buttons) return;
      clearTimeout(hideT); clearTimeout(showT);
      const n = r.clip.notes[+nel.dataset.i];
      if (n === hov && !pop.hidden) return;
      showT = setTimeout(() => {
        const g = geom(r.track), row = g.row(n.p);
        hov = n; ghost.innerHTML = '';
        pop.innerHTML = '<span>Chord</span>' + Object.keys(L.CHORDS).map(k => `<button data-ch="${k}" title="${k}">${SHORT[k]}</button>`).join('');
        pop.hidden = false;
        pop.style.left = n.s * L.view.eppb + 'px';
        pop.style.top = (row < 2 ? (row + 1) * g.rh + 1 : row * g.rh - 25) + 'px';
      }, 450);
    });
    grid.addEventListener('pointerout', e => {
      if (!e.target.closest('.note, .ed-pop')) return;
      clearTimeout(showT); clearTimeout(hideT);
      hideT = setTimeout(hide, 320);
    });
    pop.addEventListener('pointerover', e => {
      const b = e.target.closest('[data-ch]'), r = ctx(); if (!b || !r) return;
      const g = geom(r.track), eppb = L.view.eppb;
      ghost.innerHTML = tones(b.dataset.ch).map(x => `<div class="note ghost" style="left:${x.s * eppb}px;top:${g.row(x.p) * g.rh}px;width:${Math.max(4, x.l * eppb - 1)}px;height:${g.rh - 1}px"></div>`).join('');
    });
    pop.addEventListener('pointerout', e => { if (e.target.closest('[data-ch]')) ghost.innerHTML = ''; });
    pop.addEventListener('click', e => {
      const b = e.target.closest('[data-ch]'), r = ctx(); if (!b || !r) return;
      const c = r.clip, base = targets();
      const add = tones(b.dataset.ch).filter(x => !c.notes.some(n => n.p === x.p && Math.abs(n.s - x.s) < 1e-6));
      c.notes.push(...add);
      L.sel.notes.clear(); [...base, ...add].forEach(n => L.sel.notes.add(n));
      [base[0], ...add.filter(x => x.s === base[0].s)].forEach(n => L.engine.blip(r.track.id, n.p));
      hide(); L.commit();
    });

    grid.addEventListener('pointerdown', e => {
      if (e.target.closest('.ed-pop')) return;
      hide();
      L.focus = 'ed';
      const r = ctx(); if (!r) return;
      const { clip: c, track: t } = r, g = geom(t), eppb = L.view.eppb, S = L.sel.notes;
      const rect = grid.getBoundingClientRect(), bx = (e.clientX - rect.left) / eppb, row = Math.floor((e.clientY - rect.top) / g.rh);
      const nel = e.target.closest('.note');
      if (e.button === 2) { if (nel) { c.notes.splice(+nel.dataset.i, 1); S.clear(); L.commit(); } return; }
      if (e.button !== 0) return;
      let mode = 'm', n, moved = false;
      if (nel) {
        n = c.notes[+nel.dataset.i];
        if (e.shiftKey) { S.has(n) ? S.delete(n) : S.add(n); update(); return; }
        if (!S.has(n)) { S.clear(); S.add(n); }
        if (e.target.tagName === 'I') mode = e.target.classList.contains('n-l') ? 'l' : 'r';
      } else if (e.shiftKey) return marquee(e, c, g, rect);
      else {
        if (bx >= cl(c) || row < 0 || row >= g.rows) { S.clear(); update(); return; }
        n = { p: g.pitch(row), s: sn() ? Math.floor(bx / sn() + 1e-6) * sn() : bx, l: t.type === 'drums' ? (sn() || 0.25) : lastLen, v: 0.8 };
        c.notes.push(n); S.clear(); S.add(n); moved = true;
        if (t.type === 'synth') (L.CHORDS[L.view.stamp] || []).slice(1).forEach(iv => {
          if (n.p + iv > P_HI) return;
          const x = { ...n, p: n.p + iv }; c.notes.push(x); S.add(x); L.engine.blip(t.id, x.p);
        });
      }
      L.engine.blip(t.id, n.p);
      const orig = [...S].map(x => ({ x, s: x.s, p: x.p, l: x.l }));
      const minS = Math.min(...orig.map(o => o.s)), ps = orig.map(o => o.p), loP = g.pitch(g.dir < 0 ? g.rows - 1 : 0), hiP = g.pitch(g.dir < 0 ? 0 : g.rows - 1);
      let lastP = n.p;
      update();
      L.drag(e, (dx, dy, ev) => {
        const db = ev.shiftKey ? dx / eppb : q(dx / eppb);
        if (mode === 'm') {
          const dB = Math.max(-minS, db), dP = clamp(g.dir * Math.round(dy / g.rh), loP - Math.min(...ps), hiP - Math.max(...ps));
          if (dB || dP) moved = true;
          orig.forEach(o => { o.x.s = o.s + dB; o.x.p = o.p + dP; });
          if (n.p !== lastP) { lastP = n.p; L.engine.blip(t.id, n.p); }
        } else if (mode === 'l') {
          // left edge: the end of each note stays put
          const min = sn() || 0.0625, d = L.clamp(db, -minS, Math.min(...orig.map(o => o.l)) - Math.min(min, ...orig.map(o => o.l)));
          if (d) moved = true;
          orig.forEach(o => { o.x.s = o.s + d; o.x.l = o.l - d; });
          lastLen = n.l;
        } else {
          if (db) moved = true;
          orig.forEach(o => { o.x.l = Math.max(sn() || 0.0625, o.l + db); });
          lastLen = n.l;
        }
        update();
      }, () => { if (moved) L.commit(); });
    });

    host.querySelector('.ed-varea').addEventListener('pointerdown', e => {
      L.focus = 'ed';
      const r = ctx(), c = r.clip, S = L.sel.notes, rect = e.currentTarget.getBoundingClientRect();
      let ch = false;
      const set = ev => {
        const x = (ev.clientX - rect.left) / L.view.eppb, v = clamp(1 - (ev.clientY - rect.top) / rect.height, 0.05, 1);
        const near = c.notes.filter(n => Math.abs(n.s - x) * L.view.eppb < 7), pick = near.filter(n => S.has(n));
        (pick.length ? pick : near).forEach(n => { n.v = v; ch = true; });
        if (near.length) update();
      };
      set(e); L.drag(e, (dx, dy, ev) => set(ev), () => { if (ch) L.commit(); });
    });
  }

  function marquee(e, c, g, rect) {
    const mq = host.querySelector('.ed-mq'), x0 = e.clientX - rect.left, y0 = e.clientY - rect.top, eppb = L.view.eppb, S = L.sel.notes;
    mq.hidden = false;
    const box = (dx, dy) => ({ l: Math.min(x0, x0 + dx), t: Math.min(y0, y0 + dy), w: Math.abs(dx), h: Math.abs(dy) });
    const draw = b => { mq.style.cssText = `left:${b.l}px;top:${b.t}px;width:${b.w}px;height:${b.h}px`; };
    draw(box(0, 0));
    L.drag(e, (dx, dy) => draw(box(dx, dy)), (dx, dy) => {
      const b = box(dx, dy); mq.hidden = true; S.clear();
      for (const n of c.notes) {
        const nx = n.s * eppb, ny = g.row(n.p) * g.rh;
        if (nx < b.l + b.w && nx + n.l * eppb > b.l && ny < b.t + b.h && ny + g.rh > b.t) S.add(n);
      }
      update();
    });
  }

  // ---------- commands ----------
  function act(a) {
    const r = ctx(); if (!r || r.track.type === 'audio') return;
    const c = r.clip, S = L.sel.notes, pool = S.size ? [...S] : c.notes;
    if (a === 'unroll') { L.arr.unroll(r.track, c); S.clear(); }
    else if (a === 'len+') { if (c.loop) { c.loop += 4; c.len = Math.max(c.len, c.loop); } else c.len += 4; }
    else if (a === 'len-') { if (cl(c) <= 4) return; if (c.loop) c.loop -= 4; else c.len -= 4; }
    else if (a === 'arp') {
      // spread the selected chord(s) into single notes stepping through their pitches, over the same stretch of time
      if (S.size < 2) return L.toast('Select two or more notes (Shift-drag a box round a chord), then Arpeggiate');
      const sel = [...S], step = sn() || 0.25, a0 = Math.min(...sel.map(n => n.s)), z = Math.max(...sel.map(n => n.s + n.l));
      const mode = L.perf.S.arp === 'Off' ? 'Up' : L.perf.S.arp, out = [];
      for (let s = a0, i = 0; s < z - 1e-6; s += step, i++) {
        // only the notes sounding at this moment take part, so a chord progression arpeggiates chord by chord
        const ps = [...new Set(sel.filter(n => n.s <= s + 1e-6 && n.s + n.l > s + 1e-6).map(n => n.p))].sort((x, y) => x - y), k = ps.length;
        if (!k) { i = -1; continue; }
        const cyc = Math.max(1, 2 * k - 2), j = i % cyc;
        const p = mode === 'Down' ? ps[k - 1 - i % k] : mode === 'Up-down' ? ps[j < k ? j : cyc - j] : mode === 'Random' ? ps[Math.floor(Math.random() * k)] : ps[i % k];
        out.push({ p, s, l: step, v: sel[0].v });
      }
      c.notes = c.notes.filter(n => !S.has(n)).concat(out);
      S.clear(); out.forEach(n => S.add(n));
    }
    else if (a === 'quant') { if (!sn()) return; pool.forEach(n => { n.s = Math.max(0, q(n.s)); }); }
    else if (a === 'oct+' || a === 'oct-') {
      const d = a === 'oct+' ? 12 : -12;
      if (pool.some(n => n.p + d > P_HI || n.p + d < P_LO)) return;
      pool.forEach(n => { n.p += d; });
    }
    L.commit();
  }

  function del() {
    const r = ctx(), S = L.sel.notes; if (!r || !S.size) return;
    r.clip.notes = r.clip.notes.filter(n => !S.has(n)); S.clear(); L.commit();
  }

  // Returns true when the key was handled.
  function key(e, k) {
    const r = ctx(); if (!r || r.track.type === 'audio') return false;
    const c = r.clip, S = L.sel.notes, g = geom(r.track), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'a') { c.notes.forEach(n => S.add(n)); update(); return true; }
    if (mod && k === 'c') { clipboard = [...S].map(n => ({ ...n })); return true; }
    if (mod && (k === 'v' || k === 'd')) {
      const src = k === 'd' ? [...S].map(n => ({ ...n })) : clipboard.map(n => ({ ...n }));
      if (!src.length) return true;
      const a = Math.min(...src.map(n => n.s)), b = Math.max(...src.map(n => n.s + n.l));
      const inside = L.pos >= c.start && L.pos < c.start + c.len;
      const at = k === 'd' ? Math.max(b, a + (sn() || 0.25)) : inside ? q(L.pos - c.start) : a;
      S.clear();
      src.forEach(n => { n.s += at - a; if (n.s < cl(c)) { c.notes.push(n); S.add(n); } });
      L.commit(); return true;
    }
    if (k === 'q' && !mod) { act('quant'); return true; }
    if (k.startsWith('arrow') && S.size) {
      const sel = [...S], step = sn() || 0.25;
      if (k === 'arrowup' || k === 'arrowdown') {
        const d = (k === 'arrowup' ? 1 : -1) * (e.shiftKey && r.track.type === 'synth' ? 12 : 1) * (r.track.type === 'drums' ? -1 : 1);
        if (sel.some(n => { const row = g.row(n.p + d); return row < 0 || row >= g.rows; })) return true;
        sel.forEach(n => { n.p += d; });
        L.engine.blip(r.track.id, sel[0].p);
      } else {
        const d = k === 'arrowright' ? step : -step;
        if (sel.some(n => n.s + d < 0)) return true;
        sel.forEach(n => { n.s += d; });
      }
      L.commit(); return true;
    }
    return false;
  }

  function tick(pos) {
    const ph = host.querySelector('.ed-ph'), r = ph && ctx(); if (!r) return;
    // inside a looped clip the playhead wraps round the repeated part
    let x = pos - r.clip.start;
    if (r.clip.loop && x >= 0 && x < r.clip.len) x %= r.clip.loop;
    ph.style.display = x >= 0 && x <= cl(r.clip) + 2 ? '' : 'none';
    ph.style.transform = `translateX(${x * L.view.eppb}px)`;
  }

  return { render, tick, key, del };
})();
