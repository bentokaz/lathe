'use strict';
(() => {
  const { $, $$, clamp, pad } = L, E = L.engine;

  // ---------- render wiring ----------
  const renderAll = () => {
    L.guide.render(); L.arr.render(); L.ed.render(); L.panels.render(); L.kb.render(); L.lib.render();
    const p = L.project;
    if (document.activeElement !== $('#pname')) $('#pname').value = p.name;
    if (document.activeElement !== $('#bpm')) $('#bpm').value = p.bpm;
    $('#b-loop').classList.toggle('on', p.loop.on);
    document.title = p.name + ' / Lathe';
  };
  L.on('change', renderAll);
  L.on('sel', renderAll);
  L.on('transport', () => {
    $('#b-play').classList.toggle('on', E.playing);
    $('#b-rec').classList.toggle('on', E.recording);
  });

  L.showTab = tab => {
    $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    ['editor', 'keys', 'guide', 'sounds', 'mixer'].forEach(id => { $('#' + id).hidden = tab !== id; });
    if (tab === 'editor') L.ed.render();
  };
  // dropdown menus: one open at a time, any other click closes them
  document.addEventListener('click', e => {
    const mb = e.target.closest('.menu > button');
    $$('.menu').forEach(m => m.classList.toggle('open', !!mb && m === mb.parentElement && !m.classList.contains('open')));
  });

  $('#tabs').onclick = e => { if (e.target.dataset.tab) L.showTab(e.target.dataset.tab); };

  $('#grip').addEventListener('pointerdown', e => {
    const h0 = $('#dock').offsetHeight;
    L.drag(e, (dx, dy) => { document.body.style.setProperty('--dock', clamp(h0 - dy, 120, innerHeight - 220) + 'px'); }, () => L.ed.render());
  });

  // ---------- transport ----------
  $('#b-play').onclick = () => E.toggle();
  $('#b-home').onclick = () => E.seek(L.project.loop.on ? L.project.loop.start : 0);
  $('#b-rec').onclick = () => E.record();
  const toggleLoop = () => { L.project.loop.on = !L.project.loop.on; L.commit(); };
  const toggleMetro = () => { E.metronome = !E.metronome; $('#b-metro').classList.toggle('on', E.metronome); };
  $('#b-loop').onclick = toggleLoop;
  $('#b-metro').onclick = toggleMetro;
  $('#bpm').onchange = e => {
    const v = clamp(Math.round(+e.target.value) || 120, 40, 240);
    e.target.value = v; E.reanchor(); L.project.bpm = v; L.commit();
  };
  $('#pname').onchange = e => { L.project.name = e.target.value.trim() || 'Untitled'; L.commit(); };
  $('#b-undo').onclick = L.undo;
  $('#b-redo').onclick = L.redo;
  $('#b-help').onclick = () => $('#help').showModal();

  // ---------- files ----------
  const b64 = ab => { const u = new Uint8Array(ab); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;
  const fileName = () => L.project.name.replace(/[^\w\- ]+/g, '').trim() || 'project';

  function save() {
    const audio = {};
    for (const id of L.usedBuffers(L.project)) { const b = L.buffers.get(id); if (b) audio[id] = b64(L.wav(b)); }
    L.download(new Blob([JSON.stringify({ lathe: 1, project: L.project, audio })], { type: 'application/json' }), fileName() + '.lathe.json');
    L.toast('Project file saved');
  }
  $('#b-save').onclick = save;
  $('#b-open').onclick = () => $('#f-open').click();
  $('#f-open').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d.project || !Array.isArray(d.project.tracks)) throw new Error('not a Lathe project');
      E.stop();
      for (const [id, s] of Object.entries(d.audio || {})) L.addBuffer(await E.decode(unb64(s)), id);
      L.setProject(d.project);
      L.toast('Opened ' + f.name);
    } catch (err) { L.toast('Could not open that file: ' + err.message, 6000); }
  };
  $('#b-new').onclick = () => {
    if (!confirm('Start a new project? The current one is replaced. Save it first if you want to keep it.')) return;
    E.stop(); L.setProject(L.newProject());
  };
  $('#b-export').onclick = async () => {
    try {
      L.toast('Rendering…', 0);
      L.download(await E.render(), fileName() + '.wav');
      L.toast('Exported ' + fileName() + '.wav');
    } catch (err) { L.toast('Export failed: ' + err.message, 6000); }
  };

  // ---------- keyboard ----------
  const KEYS = L.KEYMAP;
  const typing = e => { const t = e.target; return (t.tagName === 'INPUT' && t.type !== 'range') || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || !!document.querySelector('dialog[open]'); };

  addEventListener('keydown', e => {
    if (typing(e)) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); return; }
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey, ed = L.focus === 'ed';
    if (mod) {
      if (k === 'z') e.shiftKey ? L.redo() : L.undo();
      else if (k === 'y') L.redo();
      else if (k === 's') save();
      else if (k === 'e') L.arr.split();
      else if (ed && L.ed.key(e, k)) { /* handled by the editor */ }
      else if (!ed && k === 'd') L.arr.dup();
      else if (!ed && k === 'c') L.arr.copy();
      else if (!ed && k === 'v') L.arr.paste();
      else return;
      e.preventDefault(); return;
    }
    if (e.altKey) return;
    if (e.code === 'Space') { e.preventDefault(); E.toggle(); return; }
    if (k === 'enter' || k === 'home') { E.seek(L.project.loop.on ? L.project.loop.start : 0); return; }
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); ed && L.sel.notes.size ? L.ed.del() : L.arr.del(); return; }
    if (ed && (k.startsWith('arrow') || k === 'q') && L.ed.key(e, k)) { e.preventDefault(); return; }
    if (e.repeat) return;
    if (k === 'r') return void E.record();
    if (k === 'm') return toggleMetro();
    if (k === '/') return toggleLoop();
    if (k === 'z' || k === 'x') { L.view.oct = clamp(L.view.oct + (k === 'x' ? 1 : -1), 1, 6); L.toast('Keyboard octave ' + L.view.oct, 1200); L.kb.render(); return; }
    if (e.code in KEYS) {
      const t = L.trackById(L.sel.track);
      const p = t && t.type === 'drums' ? 36 + KEYS[e.code][0] % 8 : 12 * (L.view.oct + 1) + KEYS[e.code][0];
      L.perf.down(e.code, [p]);
    } else if (/^Digit[1-7]$/.test(e.code)) L.perf.pad(e.code, +e.code[5] - 1);
  });
  addEventListener('keyup', e => L.perf.up(e.code));
  // Keep Space for the transport rather than re-clicking whichever button was pressed last.
  document.addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.blur(); });

  if (navigator.requestMIDIAccess) navigator.requestMIDIAccess().then(m => {
    const hook = () => m.inputs.forEach(inp => {
      inp.onmidimessage = ({ data: [st, p, v] }) => {
        const c = st & 0xf0;
        if (c === 0x90 && v) L.perf.down('midi' + p, [p], v / 127); else if (c === 0x80 || c === 0x90) L.perf.up('midi' + p);
      };
    });
    hook(); m.onstatechange = hook;
  }).catch(() => {});

  // ---------- frame loop ----------
  const posEl = $('#pos'), timEl = $('#tim');
  function frame() {
    const pos = E.currentBeat(), s = pos * L.spb();
    posEl.textContent = `${pad(Math.floor(pos / 4) + 1, 3)}.${Math.floor(pos % 4) + 1}.${Math.floor(pos % 1 * 4) + 1}`;
    timEl.textContent = `${pad(Math.floor(s / 60), 2)}:${pad((s % 60).toFixed(1), 4)}`;
    L.arr.tick(pos); L.ed.tick(pos); L.video.tick(pos);
    const lv = E.levels();
    for (const el of $$('[data-meter]')) {
      const v = lv ? lv.get(el.dataset.meter) || 0 : 0;
      const k = Math.max(clamp((20 * Math.log10(v + 1e-6) + 54) / 54, 0, 1), (el._k || 0) - 0.035);
      if (k === el._k) continue;
      el._k = k;
      el.firstElementChild.style.transform = (el.dataset.dir === 'x' ? 'scaleX(' : 'scaleY(') + k + ')';
      el.classList.toggle('hot', v > 0.9);
    }
    requestAnimationFrame(frame);
  }

  // ---------- boot ----------
  (async () => {
    let p = null;
    try { p = JSON.parse(localStorage.getItem('lathe.project')); } catch { /* corrupt autosave */ }
    if (!p || !Array.isArray(p.tracks)) p = L.demoProject();
    await L.loadBuffers(L.usedBuffers(p));
    await L.video.restore(p);
    $('#snap').value = L.view.snap;
    L.setProject(p);
    requestAnimationFrame(frame);
  })();
})();
