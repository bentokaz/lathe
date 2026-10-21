'use strict';
// Video scoring: one video sits above the tracks, follows the playhead frame for frame,
// and can be exported together with the music.
L.video = (() => {
  const { $, esc, clamp } = L, E = L.engine;
  const mon = $('#monitor'), row = $('#vid-row');
  let file = null, el = null, url = '', node = null, gain = null, thumbs = [], thumbStep = 1, token = 0, exporting = false, lastPos = -1;

  const meta = () => L.project.video || null;
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // ---------- element ----------
  function detach() {
    token++;
    if (el) { el.pause(); el.remove(); }
    if (node) { node.disconnect(); gain.disconnect(); }
    if (url) URL.revokeObjectURL(url);
    el = node = gain = null; url = ''; thumbs = [];
  }
  function attach() {
    detach();
    url = URL.createObjectURL(file);
    el = document.createElement('video');
    el.src = url; el.playsInline = true; el.preload = 'auto';
    // film sound goes through the mixer's master, so it is metered and ends up in the video export
    try { const G = E.graph(); node = G.ctx.createMediaElementSource(el); gain = G.ctx.createGain(); node.connect(gain).connect(G.master); } catch { node = gain = null; }
    const my = token;
    el.addEventListener('loadedmetadata', () => {
      if (my !== token) return;
      const m = meta();
      if (m && Math.abs(m.dur - el.duration) > 0.05) { m.dur = el.duration; L.arr.render(); }
      render(); makeThumbs(my);
    });
    render();
  }

  async function makeThumbs(my) {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.src = url;
    await new Promise(r => { v.onloadeddata = r; v.onerror = r; });
    if (my !== token || !v.videoWidth) return;
    const n = clamp(Math.ceil(v.duration / 2), 4, 60), h = 46, w = Math.round(h * v.videoWidth / v.videoHeight);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    thumbStep = v.duration / n; thumbs = [];
    for (let k = 0; k < n; k++) {
      await new Promise(r => { const t = setTimeout(r, 1500); v.onseeked = () => { clearTimeout(t); r(); }; v.currentTime = Math.min(v.duration - 0.05, k * thumbStep + 0.05); });
      if (my !== token) return;
      x.drawImage(v, 0, 0, w, h);
      thumbs.push(cv.toDataURL('image/jpeg', 0.6));
      if (k % 5 === 4 || k === n - 1) lane();
    }
  }

  // ---------- adding, removing, restoring ----------
  async function add(f) {
    if (!f) return;
    file = f;
    L.idbPut('vid', 'cur', { blob: f, name: f.name }).catch(() => {});
    attach();
    const my = token;
    await new Promise(r => { if (el.readyState >= 1) r(); else { el.addEventListener('loadedmetadata', r, { once: true }); el.addEventListener('error', r, { once: true }); } });
    if (my !== token) return;
    if (!el.duration || !isFinite(el.duration)) {
      detach(); file = null; render();
      // the browser cannot play it directly (MKV, some MOV/MPEG-TS): convert it to MP4 once and use that
      if (!f.converted) {
        try {
          L.toast('Converting ' + f.name + ' so the browser can play it…', 0);
          const M = await L.exporter.lib();
          const input = new M.Input({ source: new M.BlobSource(f), formats: M.ALL_FORMATS });
          const output = new M.Output({ format: new M.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new M.BufferTarget() });
          const conv = await M.Conversion.init({ input, output });
          conv.onProgress = pr => L.toast(`Converting ${f.name}… ${Math.round(pr * 100)}%`, 0);
          await conv.execute();
          const mp4 = new File([output.target.buffer], f.name.replace(/\.[^.]+$/, '') + '.mp4', { type: 'video/mp4' });
          mp4.converted = true;
          return add(mp4);
        } catch (err) { return L.toast('This browser cannot play or convert that video file (' + err.message + ')', 8000); }
      }
      return L.toast('This browser cannot play that video file', 6000);
    }
    const old = meta();
    L.project.video = { name: f.name, dur: el.duration, offset: old ? old.offset : 0, vol: old ? old.vol : 0.7, markers: old && old.name === f.name ? old.markers : [] };
    L.commit();
    L.toast(`${f.name} added (${fmt(el.duration)}). Press play: the picture follows the playhead`, 5000);
  }
  function remove() {
    delete L.project.video; file = null;
    L.idbDel('vid', 'cur').catch(() => {});
    L.commit();
  }
  // Called at start-up: picks the stored file back up if the project still refers to it.
  async function restore(p) {
    if (!p.video) return;
    try { const rec = await L.idbGet('vid', 'cur'); if (rec && rec.name === p.video.name) file = rec.blob; } catch { /* no stored video */ }
  }
  function sync() {
    const m = meta();
    if (m && !el && file) attach();
    else if (!m && el) detach();
    if (m && gain) gain.gain.value = m.vol; else if (m && el) el.volume = clamp(m.vol, 0, 1);
    render();
  }

  // ---------- monitor (above the track panel) ----------
  function render() {
    const m = meta();
    mon.hidden = !m;
    if (!m) return;
    if (!mon.firstChild) {
      mon.innerHTML = `<div class="mon-v"></div>
        <div class="mon-bar"><b></b><button class="ib" data-v="mark" title="Drop a marker at the playhead, to line music up with a moment" aria-label="Add marker">${L.icon('flag')}</button><button class="ib" data-v="del" title="Remove the video" aria-label="Remove video">${L.icon('trash')}</button></div>
        <label class="prm"><span>Film sound</span><input type="range" data-v="vol" min="0" max="1.5" step="0.01"><output></output></label>
        <label class="prm"><span>Starts at</span><input type="number" data-v="offset" step="0.1"><output>sec</output></label>
        <button class="mon-miss" data-v="find" hidden>Find the video file again</button>`;
    }
    const box = mon.querySelector('.mon-v');
    if (el && el.parentElement !== box) box.replaceChildren(el);
    if (!el) box.replaceChildren();
    mon.querySelector('.mon-bar b').textContent = m.name;
    mon.querySelector('.mon-miss').hidden = !!el;
    const vol = mon.querySelector('[data-v="vol"]'), off = mon.querySelector('[data-v="offset"]');
    if (document.activeElement !== vol) vol.value = m.vol;
    vol.nextElementSibling.textContent = Math.round(m.vol * 100) + '%';
    if (document.activeElement !== off) off.value = +m.offset.toFixed(2);
  }
  mon.addEventListener('input', e => {
    const m = meta(); if (!m || e.target.dataset.v !== 'vol') return;
    m.vol = +e.target.value; e.target.nextElementSibling.textContent = Math.round(m.vol * 100) + '%';
    if (gain) gain.gain.value = m.vol; else if (el) el.volume = clamp(m.vol, 0, 1);
  });
  mon.addEventListener('change', e => {
    const m = meta(), k = e.target.dataset.v; if (!m) return;
    if (k === 'offset') m.offset = +e.target.value || 0;
    if (k === 'vol' || k === 'offset') L.commit();
  });
  mon.addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'), m = meta(); if (!b || !m) return;
    if (b.dataset.v === 'del') remove();
    else if (b.dataset.v === 'find') $('#f-video').click();
    else if (b.dataset.v === 'mark') {
      const t = L.pos * L.spb() - m.offset;
      if (t < 0 || t > m.dur) return L.toast('Move the playhead onto the video first');
      m.markers.push({ t, name: 'Hit ' + (m.markers.length + 1) });
      m.markers.sort((a, z) => a.t - z.t);
      L.commit();
    }
  });

  // ---------- lane in the timeline ----------
  function lane() {
    const m = meta();
    row.hidden = !m;
    if (!m) return;
    const ppb = L.view.ppb, spb = L.spb(), k = ppb / spb;
    row.innerHTML = `<div class="thead vhead"><div class="t-no">${L.icon('film')}</div><div class="t-main"><div class="t-name">${esc(m.name)}</div><div class="t-kind">Video / ${fmt(m.dur)}${m.markers.length ? ' / ' + m.markers.length + ' marker' + (m.markers.length > 1 ? 's' : '') : ''}</div></div></div>
      <div class="lane vlane"><div class="vclip" style="left:${m.offset * k}px;width:${m.dur * k}px" title="Drag to move the video in time">
        ${thumbs.map((src, i) => `<img src="${src}" style="left:${i * thumbStep * k}px" draggable="false" alt="">`).join('')}
        ${m.markers.map((mk, i) => `<i class="mk" data-mk="${i}" style="left:${mk.t * k}px" title="${esc(mk.name)}: click to jump, double-click to rename, right-click to remove"><b>${esc(mk.name)}</b></i>`).join('')}
      </div></div>`;
  }
  row.addEventListener('contextmenu', e => { if (e.target.closest('.mk')) e.preventDefault(); });
  row.addEventListener('pointerdown', e => {
    const m = meta(), mk = e.target.closest('.mk'), clip = e.target.closest('.vclip'); if (!m) return;
    if (mk) {
      const i = +mk.dataset.mk;
      if (e.button === 2) { m.markers.splice(i, 1); return L.commit(); }
      if (L.dbl('mk' + i)) { const n = prompt('Marker name', m.markers[i].name); if (n) { m.markers[i].name = n.slice(0, 24); L.commit(); } return; }
      return E.seek((m.markers[i].t + m.offset) / L.spb());
    }
    if (!clip || e.button !== 0) return;
    const o0 = m.offset, k = L.view.ppb / L.spb(), snap = L.view.snap * L.spb();
    let moved = false;
    L.drag(e, (dx, dy, ev) => {
      let o = o0 + dx / k;
      if (snap && !ev.shiftKey) o = Math.round(o / snap) * snap;
      m.offset = o; moved = true; clip.style.left = o * k + 'px';
    }, () => { if (moved) L.commit(); });
  });

  // ---------- per frame: keep the picture on the playhead ----------
  function tick(pos) {
    const m = meta(); if (!m || !el || !el.duration) return;
    const want = pos * L.spb() - m.offset, inside = want >= 0 && want < el.duration - 0.02;
    if (E.playing && inside) {
      // sound starts a moment after Play is pressed; wait until the playhead is really moving so the picture does not run ahead
      if (el.paused) { if (pos !== lastPos) { el.currentTime = want; el.play().catch(() => {}); } }
      else if (Math.abs(el.currentTime - want) > 0.18) el.currentTime = want;
    } else {
      if (!el.paused) el.pause();
      if (inside && !el.seeking && Math.abs(el.currentTime - want) > 0.04) el.currentTime = want;
    }
    el.style.opacity = inside ? 1 : 0.12;
    lastPos = pos;
  }

  // ---------- export: plays the film once and records picture + mix ----------
  async function exportVideo() {
    const m = meta();
    if (!m || !el) return L.toast('Add a video first (File, Add video)');
    if (exporting) return;
    const cap = el.captureStream || el.mozCaptureStream;
    if (!cap || !window.MediaRecorder) return L.toast('This browser cannot record video. Export the WAV and join it to the film in a video editor', 7000);
    exporting = true;
    const G = E.graph(), dest = G.ctx.createMediaStreamDestination(), loopWas = L.project.loop.on;
    try {
      await L.lib.ready(L.project);
      E.stop(); L.project.loop.on = false;
      const spb = L.spb(), from = Math.max(0, m.offset) / spb, to = (m.offset + m.dur) / spb;
      E.seek(from);
      await new Promise(r => setTimeout(r, 400)); // let the picture settle on the first frame
      G.an.connect(dest);
      const stream = new MediaStream([...cap.call(el).getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
      const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 }), chunks = [];
      mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise(r => { mr.onstop = r; });
      mr.start(500); E.play();
      await new Promise(r => {
        const iv = setInterval(() => {
          const b = E.currentBeat();
          L.toast(`Recording the film with your music: ${Math.round(clamp((b - from) / (to - from), 0, 1) * 100)}% (Space stops early)`, 0);
          if (!E.playing || b >= to) { clearInterval(iv); r(); }
        }, 200);
      });
      E.stop(); mr.stop(); await done;
      const name = (L.project.name.replace(/[^\w\- ]+/g, '').trim() || 'project') + (mime.includes('mp4') ? '.mp4' : '.webm');
      L.download(new Blob(chunks, { type: mime.split(';')[0] }), name);
      L.toast('Exported ' + name);
    } catch (err) { L.toast('Video export failed: ' + err.message, 7000); }
    finally { try { G.an.disconnect(dest); } catch { /* never connected */ } L.project.loop.on = loopWas; exporting = false; }
  }

  $('#b-video').onclick = () => $('#f-video').click();
  $('#f-video').onchange = e => { const f = e.target.files[0]; e.target.value = ''; add(f); };
  L.on('change', sync);

  return { add, restore, lane, tick, exportVideo, has: () => !!meta(), file: () => file };
})();
