'use strict';
L.arr = (() => {
  const { $, esc, clamp, pad } = L;
  const root = $('#arr'), inner = $('#arr-inner'), rows = $('#arr-rows'), ruler = $('#ruler');
  const HW = 236, TH = 68, RH = 34;
  let clipboard = null;

  // the grid, but cuts and markers in the video pull harder when one is close (Shift ignores both)
  const snap = (b, ev) => {
    if (ev && ev.shiftKey) return b;
    const m = L.video && L.video.magnet(b);
    return m !== null && m !== undefined ? m : !L.view.snap ? b : Math.round(b / L.view.snap) * L.view.snap;
  };
  // a clip being moved sticks to a cut by its start or by its end
  const snapSpan = (s, len, ev) => {
    if (ev && ev.shiftKey) return s;
    const a = L.video && L.video.magnet(s), z = L.video && L.video.magnet(s + len);
    return a != null ? a : z != null ? z - len : snap(s, ev);
  };
  const total = () => Math.max(128, Math.ceil((L.projectEnd() + 64) / 4) * 4);
  const kind = t => t.type === 'synth' ? 'Synth / ' + t.inst.preset : t.type === 'drums' ? 'Drums / ' + (t.inst.preset || 'Standard') : 'Audio';

  function render() {
    const p = L.project, ppb = L.view.ppb, tot = total();
    root.style.setProperty('--ppb', ppb + 'px');
    root.style.setProperty('--bl', ppb < 10 ? 'transparent' : 'var(--ink-3)');
    // lines for the snap grid when it is finer than a beat and there is room to see them
    const sub = L.view.snap && L.view.snap < 1 ? L.view.snap * ppb : 0;
    root.style.setProperty('--sub', (sub >= 6 ? sub : ppb) + 'px');
    root.style.setProperty('--sl', sub >= 6 ? 'rgba(216, 211, 199, .07)' : 'transparent');
    inner.style.width = HW + tot * ppb + 'px';

    let step = 1; while (step * 4 * ppb < 46) step *= 2;
    let h = '';
    for (let b = 0; b < tot / 4; b += step) h += `<span style="left:${b * 4 * ppb}px">${b + 1}</span>`;
    h += `<div id="loop" class="${p.loop.on ? 'on' : ''}" style="left:${p.loop.start * ppb}px;width:${(p.loop.end - p.loop.start) * ppb}px"></div>`;
    ruler.innerHTML = h;

    const picked = new Set(L.selClips().map(r => r.clip.id));
    rows.innerHTML = p.tracks.map((t, i) => `
      <div class="trow${t.id === L.sel.track ? ' sel' : ''}" data-track="${t.id}">
        <div class="thead">
          <div class="t-no">${pad(i + 1, 2)}</div>
          <div class="t-main"><div class="t-name">${esc(t.name)}</div>${t.showAuto ? autoPick(t) : `<div class="t-kind">${kind(t)}</div>`}</div>
          <div class="t-btns">${switches(t)}<button data-act="showAuto" class="sw-auto${t.showAuto ? ' on' : ''}" title="Automation: draw how volume, pan, filter, reverb or echo change over time" aria-label="Automation" aria-pressed="${!!t.showAuto}">${L.icon('auto')}</button><button data-act="dup" title="Duplicate track: a copy with the same sound, effects and clips" aria-label="Duplicate track">${L.icon('dup')}</button><button data-act="del" class="t-del" title="Delete track (Ctrl+Z brings it back)" aria-label="Delete track">${L.icon('trash')}</button></div>
          <input class="t-vol" type="range" min="0" max="1" step="0.005" value="${t.vol}" title="Volume">
          <div class="t-meter" data-meter="${t.id}" data-dir="x"><i></i></div>
        </div>
        <div class="lane">${t.clips.map(c => `<div class="clip${picked.has(c.id) ? ' sel' : ''}${c.loop ? ' looped' : ''}" data-clip="${c.id}" style="left:${c.start * ppb}px;width:${Math.max(4, c.len * ppb - 1)}px;--c:var(--clip-${i % 4 + 1});--rep:${(c.loop || c.len) * ppb}px"><span>${esc(c.name)}</span><canvas></canvas><i class="c-l"></i><i class="c-r" title="Drag to change the length (adds empty space)"></i><i class="c-loop" title="Drag to repeat this clip">${L.icon('loop')}</i></div>`).join('')}${t.showAuto ? `<svg class="auto" width="${tot * ppb}" height="${TH - 1}">${autoSvg(t, tot * ppb)}</svg>` : ''}</div>
      </div>`).join('');
    drawClips();
    if (L.video) L.video.lane();
  }

  // Mute and solo, shared with the mixer strips: icons that fill in when switched on.
  L.switches = t => `<button data-act="mute" class="sw-mute${t.mute ? ' on' : ''}" title="Mute: silence this track" aria-label="Mute" aria-pressed="${t.mute}">${L.icon('mute')}</button><button data-act="solo" class="solo sw-solo${t.solo ? ' on' : ''}" title="Solo: hear only this track (and other soloed ones)" aria-label="Solo" aria-pressed="${t.solo}">${L.icon('solo')}</button>`;
  const switches = L.switches;

  // ---------- automation overlay ----------
  const AP = 7; // padding inside the lane, px
  const ay = v => AP + (1 - v) * (TH - 1 - 2 * AP);
  const AUTO = L.engine.AUTO, akey = t => AUTO[t.autoK] ? t.autoK : 'vol';
  const autoPick = t => `<select class="t-apar" title="Which setting the line controls" aria-label="Automation setting">${Object.entries(AUTO).map(([k, a]) => `<option value="${k}"${k === akey(t) ? ' selected' : ''}>${a.name}${t.auto && t.auto[k] && t.auto[k].length ? ' •' : ''}</option>`).join('')}</select>`;
  function autoSvg(t, w) {
    const k = akey(t), A = AUTO[k], pts = (t.auto && t.auto[k]) || [], ppb = L.view.ppb;
    if (!pts.length) { const y = ay(A.def(t)); return `<line x1="0" x2="${w}" y1="${y}" y2="${y}" class="a-flat"/><text x="8" y="${y > TH / 2 ? y - 8 : y + 16}">${A.name}: click to add a point; drag points, right-click to remove</text>`; }
    const xy = pts.map(([b, v]) => [b * ppb, ay(v)]);
    const line = [[0, xy[0][1]], ...xy, [w, xy[xy.length - 1][1]]].map(p => p.join(',')).join(' ');
    return `<polyline points="${line}"/>${xy.map(([x, y], i) => `<circle data-i="${i}" cx="${x}" cy="${y}" r="4.5"><title>${A.fmt(pts[i][1])}</title></circle>`).join('')}`;
  }
  function autoDown(e, t, svg) {
    L.focus = 'arr';
    const ppb = L.view.ppb, rect = svg.getBoundingClientRect(), k = akey(t), A = AUTO[k];
    const toB = x => Math.max(0, (x - rect.left) / ppb), toV = y => clamp(1 - (y - rect.top - AP) / (TH - 1 - 2 * AP), 0, 1);
    t.auto ||= {};
    const pts = t.auto[k] ||= [];
    // reverb and echo lanes only do something with the effect switched on
    if (A.fx && !t.fx[A.fx].on && e.button === 0) { t.fx[A.fx].on = true; L.toast(`${A.fx === 'reverb' ? 'Reverb' : 'Delay'} switched on for this track so the line has something to control`); }
    let i = e.target.dataset.i !== undefined ? +e.target.dataset.i : -1;
    if (e.button === 2) { if (i >= 0) { pts.splice(i, 1); L.commit(); } return; }
    if (e.button !== 0) return;
    if (i < 0) {
      const pt = [snap(toB(e.clientX), e), toV(e.clientY)];
      pts.push(pt); pts.sort((a, z) => a[0] - z[0]); i = pts.indexOf(pt);
      svg.innerHTML = autoSvg(t, +svg.getAttribute('width'));
    }
    const pt = pts[i];
    L.drag(e, (dx, dy, ev) => {
      const lo = i > 0 ? pts[i - 1][0] : 0, hi = i < pts.length - 1 ? pts[i + 1][0] : Infinity;
      pt[0] = clamp(snap(toB(ev.clientX), ev), lo, hi); pt[1] = toV(ev.clientY);
      svg.innerHTML = autoSvg(t, +svg.getAttribute('width'));
      L.toast(`${A.name}: ${A.fmt(pt[1])} at bar ${(pt[0] / 4 + 1).toFixed(2)}`, 1200);
    }, () => L.commit());
  }

  function drawClips() { for (const el of rows.querySelectorAll('.clip')) drawClip(el); }
  // A looped clip shows its content once per repeat.
  function drawClip(el) {
    const r = L.clipById(el.dataset.clip), cv = el.querySelector('canvas'); if (!r) return;
    const c = r.clip, cl = c.loop || c.len, spb = L.spb();
    cv.width = clamp(Math.round(c.len * L.view.ppb), 4, 2400); cv.height = 40;
    const k = cv.width / c.len, x = cv.getContext('2d');
    if (r.track.type === 'audio') {
      const one = document.createElement('canvas');
      one.width = Math.max(1, Math.round(cl * k)); one.height = 40;
      L.drawWave(one, L.buffers.get(c.buf), c.offset, c.offset + cl * spb, '#1c1b19');
      for (let s = 0; s < c.len; s += cl) x.drawImage(one, Math.round(s * k), 0);
      return;
    }
    const ns = c.notes.filter(n => n.s < cl);
    if (!ns.length) return;
    const lo = Math.min(...ns.map(n => n.p)), hi = Math.max(...ns.map(n => n.p)), span = Math.max(6, hi - lo + 1);
    x.fillStyle = '#1c1b19';
    for (let s = 0; s < c.len - 1e-9; s += cl) for (const n of ns) {
      if (s + n.s >= c.len) continue;
      x.fillRect((s + n.s) * k, 2 + (hi - n.p) / span * 34, Math.max(2, Math.min(n.l, cl - n.s, c.len - s - n.s) * k - 1), Math.max(2, 34 / span - 1));
    }
  }
  const setRep = (el, c) => el.style.setProperty('--rep', (c.loop || c.len) * L.view.ppb + 'px');

  // Turns a looped clip back into plain material: MIDI repeats become real notes; audio repeats become separate clips.
  function unroll(t, c) {
    if (!c.loop) return;
    const cl = c.loop;
    if (t.type !== 'audio') {
      const notes = [];
      for (let s = 0; s < c.len - 1e-9; s += cl) for (const n of c.notes) if (n.s < cl && s + n.s < c.len) notes.push({ ...n, s: s + n.s, l: Math.min(n.l, cl - n.s) });
      c.notes = notes;
    } else {
      for (let s = cl; s < c.len - 1e-9; s += cl) { const k = cloneClip(c); delete k.loop; k.start = c.start + s; k.len = Math.min(cl, c.len - s); t.clips.push(k); }
      c.len = Math.min(cl, c.len);
    }
    delete c.loop;
  }

  // ---------- clip operations ----------
  const cur = () => L.clipById(L.sel.clip);
  const cloneClip = c => ({ ...JSON.parse(JSON.stringify(c)), id: L.uid() });

  const span = rs => [Math.min(...rs.map(r => r.clip.start)), Math.max(...rs.map(r => r.clip.start + r.clip.len))];
  const ops = {
    del() {
      const rs = L.selClips(); if (!rs.length) return;
      rs.forEach(r => { r.track.clips = r.track.clips.filter(c => c !== r.clip); });
      L.sel.clip = null; L.commit();
      if (rs.length > 1) L.toast(`Deleted ${rs.length} clips. Ctrl+Z to undo`);
    },
    // copies go straight after the selection, each on its own track
    dup() {
      const rs = L.selClips(); if (!rs.length) return;
      const [a, b] = span(rs), shift = rs.length > 1 ? Math.ceil((b - a) / 4) * 4 || 4 : rs[0].clip.len;
      const ids = rs.map(r => { const c = cloneClip(r.clip); delete c.gen; c.start += shift; r.track.clips.push(c); return c.id; });
      L.selectClips(ids); L.commit();
    },
    copy() {
      const rs = L.selClips(); if (!rs.length) return;
      clipboard = rs.map(r => ({ tid: r.track.id, type: r.track.type, clip: JSON.stringify(r.clip) }));
      L.toast(rs.length > 1 ? rs.length + ' clips copied' : 'Clip copied');
    },
    // one clip goes onto the selected track; several go back onto the tracks they came from, starting at the playhead
    paste() {
      if (!clipboard) return;
      if (clipboard.length === 1) {
        const [it] = clipboard, t = L.trackById(L.sel.track);
        if (!t || t.type !== it.type) return L.toast('Select a ' + it.type + ' track to paste onto');
        const c = cloneClip(JSON.parse(it.clip)); delete c.gen; c.start = snap(L.pos);
        t.clips.push(c); L.selectClips([c.id]); return L.commit();
      }
      const items = clipboard.map(it => ({ t: L.trackById(it.tid), c: cloneClip(JSON.parse(it.clip)) })).filter(x => x.t);
      if (!items.length) return L.toast('The tracks those clips came from are gone');
      const from = Math.min(...items.map(x => x.c.start)), at = snap(L.pos);
      items.forEach(({ t, c }) => { delete c.gen; c.start += at - from; t.clips.push(c); });
      L.selectClips(items.map(x => x.c.id)); L.commit();
    },
    all() { const ids = L.project.tracks.flatMap(t => t.clips.map(c => c.id)); if (ids.length) { L.selectClips(ids); render(); } },
    split() {
      let r = cur(); const at = L.pos; if (!r) return;
      if (r.clip.loop) {
        unroll(r.track, r.clip);
        const hit = r.track.clips.find(x => x.start <= at && x.start + x.len > at);
        if (hit) r = { track: r.track, clip: hit };
      }
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
    if (e.target.closest('.thead')) { if (!e.target.closest('button,input,select')) L.select(t.id, null); return; }
    const asvg = e.target.closest('svg.auto');
    if (asvg) return autoDown(e, t, asvg);
    L.focus = 'arr';
    const lane = row.querySelector('.lane'), bx = (e.clientX - lane.getBoundingClientRect().left) / ppb;
    const cel = e.target.closest('.clip');
    if (!cel) {
      if (L.dbl('lane' + t.id) && t.type !== 'audio') {
        const c = { id: L.uid(), name: t.type === 'drums' ? 'Pattern' : 'Clip', start: Math.floor(bx / 4) * 4, len: 4, notes: [] };
        t.clips.push(c); L.sel.track = t.id; L.sel.clip = c.id; L.sel.notes.clear(); L.commit(); L.showTab('editor');
        return;
      }
      if (e.button !== 0) return;
      // drag across empty space to select every clip the box touches (Shift adds to what is selected)
      const before = e.shiftKey ? L.selClips().map(r => r.clip.id) : [];
      if (!e.shiftKey) L.select(t.id, null);
      let box = null;
      const x0 = e.clientX, y0 = e.clientY;
      L.drag(e, (dx, dy) => {
        if (!box) { if (Math.abs(dx) + Math.abs(dy) < 5) return; box = document.createElement('div'); box.className = 'selbox'; document.body.append(box); }
        const l = Math.min(x0, x0 + dx), tp = Math.min(y0, y0 + dy), w = Math.abs(dx), h = Math.abs(dy);
        Object.assign(box.style, { left: l + 'px', top: tp + 'px', width: w + 'px', height: h + 'px' });
        rows.querySelectorAll('.clip').forEach(el => { const r = el.getBoundingClientRect(); el.classList.toggle('sel', before.includes(el.dataset.clip) || (r.right > l && r.left < l + w && r.bottom > tp && r.top < tp + h)); });
      }, () => {
        if (!box) return;
        box.remove();
        const ids = [...rows.querySelectorAll('.clip.sel')].map(el => el.dataset.clip);
        if (ids.length) L.selectClips(ids); else render();
      });
      return;
    }
    if (e.button !== 0) return;
    let c = t.clips.find(x => x.id === cel.dataset.clip);
    if (L.dbl('clip' + c.id)) { L.select(t.id, c.id); L.showTab('editor'); return; }
    // Shift-click adds a clip to the selection or takes it out
    if (e.shiftKey && !e.target.closest('.c-loop,.c-r,.c-l')) {
      const ids = L.selClips().map(r => r.clip.id);
      if (ids.includes(c.id)) { L.selectClips(ids.filter(id => id !== c.id)); render(); return; }
      L.selectClips([c.id, ...ids]); render();
    }
    // dragging one of several selected clips moves them all
    if (L.selClips().length > 1 && L.selClips().some(r => r.clip === c) && !e.target.closest('.c-loop,.c-r,.c-l')) return dragGroup(e, c);
    const mode = e.target.closest('.c-loop') ? 'loop' : e.target.classList.contains('c-r') ? 'r' : e.target.classList.contains('c-l') ? 'l' : 'm';
    if (mode === 'l' && c.loop) { unroll(t, c); render(); }
    let copied = false;
    if (mode === 'm' && (e.ctrlKey || e.metaKey)) { c = cloneClip(c); t.clips.push(c); copied = true; L.sel.clip = null; }
    L.select(t.id, c.id);
    if (copied) render();
    const el = rows.querySelector(`[data-clip="${c.id}"]`);
    const audio = t.type === 'audio', spb = L.spb(), s0 = c.start, len0 = c.len, off0 = c.offset, notes0 = c.notes;
    const ti0 = p.tracks.indexOf(t), minLen = L.view.snap || 0.25;
    // an audio clip cannot run past the end of its recording unless it is repeating
    const maxLen = audio && !c.loop && L.buffers.get(c.buf) ? (L.buffers.get(c.buf).duration - c.offset) / spb : Infinity;
    if (mode === 'loop' && !c.loop) c.loop = len0;
    let home = t, moved = copied;
    L.drag(e, (dx, dy, ev) => {
      const db = dx / ppb; moved = true;
      if (mode === 'm') {
        c.start = Math.max(0, snapSpan(s0 + db, len0, ev));
        const dest = p.tracks[clamp(ti0 + Math.round(dy / TH), 0, p.tracks.length - 1)];
        if (dest !== home && dest.type === t.type) {
          home.clips = home.clips.filter(x => x !== c); dest.clips.push(c); home = dest;
          rows.querySelector(`[data-track="${dest.id}"] .lane`).append(el);
        }
        el.style.left = c.start * ppb + 'px';
      } else if (mode === 'r' || mode === 'loop') {
        // right edge: longer clip, notes stay where they are (empty space, or more repeats if the clip loops)
        c.len = clamp(snap(s0 + len0 + db, ev) - s0, minLen, maxLen);
        el.style.width = c.len * ppb - 1 + 'px';
        el.classList.toggle('looped', !!c.loop && c.len > c.loop + 1e-9);
        setRep(el, c); drawClip(el);
      } else {
        const lo = audio ? Math.max(0, s0 - off0 / spb) : 0;
        c.start = clamp(snap(s0 + db, ev), lo, s0 + len0 - minLen); c.len = len0 - (c.start - s0);
        if (audio) c.offset = off0 + (c.start - s0) * spb;
        if (!audio) { const d = c.start - s0; c.notes = notes0.map(n => ({ ...n, s: n.s - d })).filter(n => n.s >= 0); }
        el.style.left = c.start * ppb + 'px'; el.style.width = c.len * ppb - 1 + 'px';
        setRep(el, c); drawClip(el);
      }
    }, () => {
      if (!moved) return;
      // pulled back inside one repeat: it is a plain clip again
      if (c.loop && c.len <= c.loop + 1e-9) delete c.loop;
      L.sel.track = home.id; L.commit();
    });
  });

  // moves (or with Ctrl, copies) every selected clip together, along the timeline only
  function dragGroup(e, c) {
    const ppb = L.view.ppb, copy = e.ctrlKey || e.metaKey;
    let rs = L.selClips();
    if (copy) rs = rs.map(r => { const k = cloneClip(r.clip); delete k.gen; r.track.clips.push(k); return { track: r.track, clip: k, was: r.clip }; });
    const main = copy ? rs.find(r => r.was === c).clip : c;
    L.selectClips(rs.map(r => r.clip.id), main.id);
    render();
    const s0 = rs.map(r => r.clip.start), lo = Math.min(...s0), els = rs.map(r => rows.querySelector(`[data-clip="${r.clip.id}"]`));
    let moved = copy;
    L.drag(e, (dx, dy, ev) => {
      moved = true;
      const hi = Math.max(...rs.map((r, i) => s0[i] + r.clip.len));
      const d = Math.max(-lo, snapSpan(lo + dx / ppb, hi - lo, ev) - lo);
      rs.forEach((r, i) => { r.clip.start = s0[i] + d; if (els[i]) els[i].style.left = r.clip.start * ppb + 'px'; });
    }, () => {
      if (moved) L.commit();
      else if (!e.shiftKey) L.select(L.clipById(c.id).track.id, c.id); // a plain click picks just this clip
    });
  }

  rows.addEventListener('contextmenu', e => { if (e.target.closest('svg.auto')) e.preventDefault(); });
  rows.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const t = L.trackById(b.closest('.trow').dataset.track);
    if (b.dataset.act === 'del') delTrack(t); else if (b.dataset.act === 'dup') dupTrack(t); else { t[b.dataset.act] = !t[b.dataset.act]; L.commit(); }
  });
  rows.addEventListener('input', e => {
    if (!e.target.classList.contains('t-vol')) return;
    const t = L.trackById(e.target.closest('.trow').dataset.track);
    t.vol = +e.target.value; L.engine.sync(t);
  });
  rows.addEventListener('change', e => {
    if (e.target.classList.contains('t-vol')) L.commit();
    else if (e.target.classList.contains('t-apar')) { L.trackById(e.target.closest('.trow').dataset.track).autoK = e.target.value; L.commit(); }
  });

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
    L.view.ppb = clamp(L.view.ppb * f, 5, 1200);
    render();
    root.scrollLeft = beat * L.view.ppb - x;
  }
  root.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault(); zoom(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX);
  }, { passive: false });
  $('#z-in').onclick = () => zoom(1.3);
  $('#z-out').onclick = () => zoom(1 / 1.3);
  $('#snap').onchange = e => { L.view.snap = +e.target.value; render(); };

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
  // A copy right below the original, with the same sound, effects, automation and clips.
  function dupTrack(t) {
    const ts = L.project.tracks, c = JSON.parse(JSON.stringify(t));
    c.id = L.uid(); c.name += ' copy'; c.mute = c.solo = false;
    c.clips.forEach(x => { x.id = L.uid(); delete x.gen; }); // a copy is not part of the backing New variation swaps
    ts.splice(ts.indexOf(t) + 1, 0, c); L.sel.track = c.id; L.sel.clip = null;
    L.commit(); L.toast('Duplicated ' + t.name);
    return c;
  }
  async function importFiles(files, track, beat) {
    for (const f of files) {
      if (/\.(json|lathe)$/i.test(f.name) || f.type === 'application/json') { await L.openProjectFile(f); return; }
      if (/\.midi?$/i.test(f.name) || /midi/.test(f.type)) { await L.files.importMidi(f); continue; }
      if (f.type.startsWith('video/') && !/\.webm$/i.test(f.name) || /\.(mp4|mov|m4v|mkv|ogv|avi|wmv|ts|mts|m2ts|3gp)$/i.test(f.name)) { L.video.add(f); continue; }
      if (!f.type.startsWith('audio/') && !/\.(wav|wave|mp3|ogg|oga|opus|flac|m4a|aac|weba|webm|aif|aiff|aifc|caf|mp2|ac3|amr|wma)$/i.test(f.name)) continue;
      try {
        L.toast('Reading ' + f.name + '…', 0);
        const buf = await L.files.decodeAudioFile(f);
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
    const sound = e.dataTransfer.getData('application/x-lathe-sound');
    if (sound) return L.sfxSearch.insert(JSON.parse(sound), row && L.trackById(row.dataset.track), beat);
    importFiles([...e.dataTransfer.files], row && L.trackById(row.dataset.track), beat);
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

  return { render, tick, addTrack, delTrack, dupTrack, all: ops.all, unroll, ...ops };
})();
