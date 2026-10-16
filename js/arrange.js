'use strict';
L.arr = (() => {
  const { $, esc, clamp, pad } = L;
  const root = $('#arr'), inner = $('#arr-inner'), rows = $('#arr-rows'), ruler = $('#ruler');
  const HW = 236, TH = 68, RH = 34;
  const SHADES = ['#d8d3c7', '#b9b3a5', '#cdc2a8', '#a09a8d'];
  let clipboard = null;

  const snap = (b, ev) => (ev && ev.shiftKey) || !L.view.snap ? b : Math.round(b / L.view.snap) * L.view.snap;
  const total = () => Math.max(128, Math.ceil((L.projectEnd() + 64) / 4) * 4);
  const kind = t => t.type === 'synth' ? 'Synth / ' + t.inst.preset : t.type === 'drums' ? 'Drums / ' + (t.inst.preset || 'Standard') : 'Audio';

  function render() {
    const p = L.project, ppb = L.view.ppb, tot = total();
    root.style.setProperty('--ppb', ppb + 'px');
    root.style.setProperty('--bl', ppb < 10 ? 'transparent' : 'var(--ink-3)');
    inner.style.width = HW + tot * ppb + 'px';

    let step = 1; while (step * 4 * ppb < 46) step *= 2;
    let h = '';
    for (let b = 0; b < tot / 4; b += step) h += `<span style="left:${b * 4 * ppb}px">${b + 1}</span>`;
    h += `<div id="loop" class="${p.loop.on ? 'on' : ''}" style="left:${p.loop.start * ppb}px;width:${(p.loop.end - p.loop.start) * ppb}px"></div>`;
    ruler.innerHTML = h;

    rows.innerHTML = p.tracks.map((t, i) => `
      <div class="trow${t.id === L.sel.track ? ' sel' : ''}" data-track="${t.id}">
        <div class="thead">
          <div class="t-no">${pad(i + 1, 2)}</div>
          <div class="t-main"><div class="t-name">${esc(t.name)}</div><div class="t-kind">${kind(t)}</div></div>
          <div class="t-btns"><button data-act="mute" class="${t.mute ? 'on' : ''}" title="Mute">M</button><button data-act="solo" class="solo${t.solo ? ' on' : ''}" title="Solo">S</button><button data-act="del" class="t-del" title="Delete track (Ctrl+Z brings it back)" aria-label="Delete track">${L.icon('trash')}</button></div>
          <input class="t-vol" type="range" min="0" max="1" step="0.005" value="${t.vol}" title="Volume">
          <div class="t-meter" data-meter="${t.id}" data-dir="x"><i></i></div>
        </div>
        <div class="lane">${t.clips.map(c => `<div class="clip${c.id === L.sel.clip ? ' sel' : ''}" data-clip="${c.id}" style="left:${c.start * ppb}px;width:${Math.max(4, c.len * ppb - 1)}px;--c:${SHADES[i % SHADES.length]}"><span>${esc(c.name)}</span><canvas></canvas><i class="c-l"></i><i class="c-r"></i></div>`).join('')}</div>
      </div>`).join('');
    drawClips();
    if (L.video) L.video.lane();
  }

  function drawClips() {
    const spb = L.spb();
    for (const el of rows.querySelectorAll('.clip')) {
      const r = L.clipById(el.dataset.clip), cv = el.querySelector('canvas'); if (!r) continue;
      const c = r.clip;
      cv.width = clamp(Math.round(c.len * L.view.ppb), 4, 2400); cv.height = 40;
      if (r.track.type === 'audio') { L.drawWave(cv, L.buffers.get(c.buf), c.offset, c.offset + c.len * spb, '#1c1b19'); continue; }
      const x = cv.getContext('2d'), ns = c.notes.filter(n => n.s < c.len);
      if (!ns.length) continue;
      const lo = Math.min(...ns.map(n => n.p)), hi = Math.max(...ns.map(n => n.p)), span = Math.max(6, hi - lo + 1), k = cv.width / c.len;
      x.fillStyle = '#1c1b19';
      for (const n of ns) x.fillRect(n.s * k, 2 + (hi - n.p) / span * 34, Math.max(2, Math.min(n.l, c.len - n.s) * k - 1), Math.max(2, 34 / span - 1));
    }
  }

  // ---------- clip operations ----------
  const cur = () => L.clipById(L.sel.clip);
  const cloneClip = c => ({ ...JSON.parse(JSON.stringify(c)), id: L.uid() });

  const ops = {
    del() { const r = cur(); if (!r) return; r.track.clips = r.track.clips.filter(c => c !== r.clip); L.sel.clip = null; L.commit(); },
    dup() { const r = cur(); if (!r) return; const c = cloneClip(r.clip); c.start += c.len; r.track.clips.push(c); L.sel.clip = c.id; L.commit(); },
    copy() { const r = cur(); if (r) { clipboard = { type: r.track.type, clip: JSON.stringify(r.clip) }; L.toast('Clip copied'); } },
    paste() {
      if (!clipboard) return;
      const t = L.trackById(L.sel.track);
      if (!t || t.type !== clipboard.type) return L.toast('Select a ' + clipboard.type + ' track to paste onto');
      const c = cloneClip(JSON.parse(clipboard.clip)); c.start = snap(L.pos);
      t.clips.push(c); L.sel.clip = c.id; L.commit();
    },
    split() {
      const r = cur(), at = L.pos; if (!r) return;
      const c = r.clip, cut = at - c.start;
      if (cut <= 0.01 || cut >= c.len - 0.01) return L.toast('Put the playhead inside the selected clip to split it');
      const right = cloneClip(c); right.start = at; right.len = c.len - cut; c.len = cut;
      if (r.track.type === 'audio') right.offset += cut * L.spb();
      else { right.notes = right.notes.filter(n => n.s >= cut).map(n => ({ ...n, s: n.s - cut })); c.notes = c.notes.filter(n => n.s < cut); }
      r.track.clips.push(right); L.commit();
    },
  };

  // ---------- lanes ----------
  rows.addEventListener('pointerdown', e => {
    const row = e.target.closest('.trow'); if (!row) return;
    const p = L.project, t = L.trackById(row.dataset.track), ppb = L.view.ppb;
    if (e.target.closest('.thead')) { if (!e.target.closest('button,input')) L.select(t.id, null); return; }
    L.focus = 'arr';
    const lane = row.querySelector('.lane'), bx = (e.clientX - lane.getBoundingClientRect().left) / ppb;
    const cel = e.target.closest('.clip');
    if (!cel) {
      if (L.dbl('lane' + t.id) && t.type !== 'audio') {
        const c = { id: L.uid(), name: t.type === 'drums' ? 'Pattern' : 'Clip', start: Math.floor(bx / 4) * 4, len: 4, notes: [] };
        t.clips.push(c); L.sel.track = t.id; L.sel.clip = c.id; L.sel.notes.clear(); L.commit(); L.showTab('editor');
      } else L.select(t.id, null);
      return;
    }
    if (e.button !== 0) return;
    let c = t.clips.find(x => x.id === cel.dataset.clip);
    if (L.dbl('clip' + c.id)) { L.select(t.id, c.id); L.showTab('editor'); return; }
    const mode = e.target.classList.contains('c-r') ? 'r' : e.target.classList.contains('c-l') ? 'l' : 'm';
    let copied = false;
    if (mode === 'm' && (e.ctrlKey || e.metaKey)) { c = cloneClip(c); t.clips.push(c); copied = true; L.sel.clip = null; }
    L.select(t.id, c.id);
    if (copied) render();
    const el = rows.querySelector(`[data-clip="${c.id}"]`);
    const audio = t.type === 'audio', spb = L.spb(), s0 = c.start, len0 = c.len, off0 = c.offset, notes0 = c.notes;
    const ti0 = p.tracks.indexOf(t), minLen = L.view.snap || 0.25;
    const maxLen = audio && L.buffers.get(c.buf) ? (L.buffers.get(c.buf).duration - c.offset) / spb : Infinity;
    let home = t, moved = copied;
    L.drag(e, (dx, dy, ev) => {
      const db = dx / ppb; moved = true;
      if (mode === 'm') {
        c.start = Math.max(0, snap(s0 + db, ev));
        const dest = p.tracks[clamp(ti0 + Math.round(dy / TH), 0, p.tracks.length - 1)];
        if (dest !== home && dest.type === t.type) {
          home.clips = home.clips.filter(x => x !== c); dest.clips.push(c); home = dest;
          rows.querySelector(`[data-track="${dest.id}"] .lane`).append(el);
        }
        el.style.left = c.start * ppb + 'px';
      } else if (mode === 'r') {
        c.len = clamp(snap(s0 + len0 + db, ev) - s0, minLen, maxLen);
        el.style.width = c.len * ppb - 1 + 'px';
      } else {
        const lo = audio ? Math.max(0, s0 - off0 / spb) : 0;
        c.start = clamp(snap(s0 + db, ev), lo, s0 + len0 - minLen); c.len = len0 - (c.start - s0);
        if (audio) c.offset = off0 + (c.start - s0) * spb;
        el.style.left = c.start * ppb + 'px'; el.style.width = c.len * ppb - 1 + 'px';
      }
    }, () => {
      if (!moved) return;
      if (mode === 'l' && !audio) { const d = c.start - s0; c.notes = notes0.map(n => ({ ...n, s: n.s - d })).filter(n => n.s >= 0); }
      L.sel.track = home.id; L.commit();
    });
  });

  rows.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const t = L.trackById(b.closest('.trow').dataset.track);
    if (b.dataset.act === 'del') delTrack(t); else { t[b.dataset.act] = !t[b.dataset.act]; L.commit(); }
  });
  rows.addEventListener('input', e => {
    if (!e.target.classList.contains('t-vol')) return;
    const t = L.trackById(e.target.closest('.trow').dataset.track);
    t.vol = +e.target.value; L.engine.sync(t);
  });
  rows.addEventListener('change', e => { if (e.target.classList.contains('t-vol')) L.commit(); });

  // ---------- ruler: top strip sets the loop, the rest seeks ----------
  ruler.addEventListener('pointerdown', e => {
    const rect = ruler.getBoundingClientRect(), ppb = L.view.ppb, beat = ev => Math.max(0, (ev.clientX - rect.left) / ppb);
    if (e.clientY - rect.top < 13) {
      const lp = L.project.loop, a = snap(beat(e), e), loopEl = $('#loop');
      let did = false;
      L.drag(e, (dx, dy, ev) => {
        const b = snap(beat(ev), ev); did = true;
        lp.start = Math.min(a, b); lp.end = Math.max(a, b, lp.start + (L.view.snap || 0.25)); lp.on = true;
        loopEl.className = 'on'; loopEl.style.left = lp.start * ppb + 'px'; loopEl.style.width = (lp.end - lp.start) * ppb + 'px';
      }, () => { if (!did) lp.on = !lp.on; L.commit(); });
      return;
    }
    L.engine.seek(snap(beat(e), e));
    L.drag(e, (dx, dy, ev) => L.engine.seek(snap(beat(ev), ev)));
  });

  // ---------- zoom ----------
  function zoom(f, cx) {
    const rect = root.getBoundingClientRect(), x = (cx ?? rect.left + HW + 200) - rect.left - HW;
    const beat = (root.scrollLeft + x) / L.view.ppb;
    L.view.ppb = clamp(L.view.ppb * f, 5, 160);
    render();
    root.scrollLeft = beat * L.view.ppb - x;
  }
  root.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault(); zoom(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX);
  }, { passive: false });
  $('#z-in').onclick = () => zoom(1.3);
  $('#z-out').onclick = () => zoom(1 / 1.3);
  $('#snap').onchange = e => { L.view.snap = +e.target.value; };

  // ---------- tracks, import ----------
  function addTrack(type) {
    const n = L.project.tracks.filter(t => t.type === type).length;
    const t = L.newTrack(type); if (n) t.name += ' ' + (n + 1);
    L.project.tracks.push(t); L.sel.track = t.id; L.sel.clip = null; L.commit();
    return t;
  }
  function delTrack(t) {
    const ts = L.project.tracks, i = ts.indexOf(t); if (i < 0) return;
    ts.splice(i, 1);
    if (L.sel.track === t.id) { L.sel.track = (ts[i] || ts[i - 1] || {}).id || null; L.sel.clip = null; }
    L.commit(); L.toast('Deleted ' + t.name + '. Ctrl+Z to undo');
  }
  async function importFiles(files, track, beat) {
    for (const f of files) {
      if (!f.type.startsWith('audio/') && !/\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(f.name)) continue;
      try {
        L.toast('Reading ' + f.name + '…', 0);
        const buf = await L.engine.decode(await f.arrayBuffer());
        const t = track && track.type === 'audio' ? track : (track = addTrack('audio'));
        const c = { id: L.uid(), name: f.name.replace(/\.[^.]+$/, ''), start: beat, len: buf.duration / L.spb(), buf: L.addBuffer(buf), offset: 0, gain: 1 };
        t.clips.push(c); L.sel.track = t.id; L.sel.clip = c.id; beat += c.len;
        L.toast('');
      } catch (err) { L.toast('Could not read ' + f.name, 5000); }
    }
    L.commit();
  }
  $('#arr-add').addEventListener('click', e => {
    const a = e.target.dataset.add; if (!a) return;
    if (a === 'import') $('#f-audio').click(); else if (a === 'video') $('#f-video').click(); else addTrack(a);
  });
  $('#f-audio').onchange = e => { importFiles([...e.target.files], L.trackById(L.sel.track), snap(L.pos)); e.target.value = ''; };
  root.addEventListener('dragover', e => { e.preventDefault(); });
  root.addEventListener('drop', e => {
    e.preventDefault();
    const row = e.target.closest('.trow'), rect = root.getBoundingClientRect();
    const beat = Math.max(0, snap((e.clientX - rect.left - HW + root.scrollLeft) / L.view.ppb));
    const files = [...e.dataTransfer.files], vid = files.find(f => f.type.startsWith('video/'));
    if (vid) L.video.add(vid);
    importFiles(files.filter(f => f !== vid), row && L.trackById(row.dataset.track), beat);
  });

  // ---------- per-frame ----------
  const ph = $('#playhead'), rb = $('#recblock');
  function tick(pos) {
    const ppb = L.view.ppb, x = HW + pos * ppb;
    ph.style.transform = `translateX(${x}px)`;
    if (L.engine.playing) {
      const vx = x - root.scrollLeft;
      if (vx > root.clientWidth - 40 || vx < HW) root.scrollLeft = Math.max(0, x - HW - 80);
    }
    rb.hidden = !L.engine.recording;
    if (L.engine.recording) {
      const i = L.project.tracks.findIndex(t => t.id === L.sel.track), s = L.engine.recStart;
      rb.style.cssText = `left:${HW + s * ppb}px;top:${RH + $('#vid-row').offsetHeight + i * TH + 4}px;width:${Math.max(2, (pos - s) * ppb)}px;height:${TH - 9}px`;
    }
  }

  return { render, tick, addTrack, delTrack, ...ops };
})();
