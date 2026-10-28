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
  // name, panel colour, well colour, accent, dark panels?
  const THEMES = [
    ['paper', 'Paper', '#d8d3c7', '#1c1b19', '#e4572e'], ['slate', 'Slate', '#ced3d7', '#161a1e', '#e3a326'], ['cassette', 'Cassette', '#dccaa8', '#231a10', '#cf4a2a'],
    ['sky', 'Sky', '#cfe0f2', '#0d1b2e', '#ff5a36'], ['mint', 'Mint', '#d3eadb', '#0c2117', '#ff4f6e'], ['blush', 'Blush', '#f4d6dd', '#2a0f17', '#0e9384'],
    ['lilac', 'Lilac', '#e1d5f2', '#170d2a', '#ff8c1a'], ['butter', 'Butter', '#f3e3a1', '#221b06', '#d7262d'],
    ['night', 'Night', '#262523', '#121211', '#e4572e', 1], ['crimson', 'Crimson', '#5c1722', '#1a0609', '#ffb52e', 1], ['plum', 'Plum', '#3d2357', '#12081d', '#3ee0b8', 1],
    ['ocean', 'Ocean', '#123b5e', '#06121f', '#ffc933', 1], ['forest', 'Forest', '#1f4430', '#07130b', '#ff8f2b', 1], ['neon', 'Neon', '#2a1046', '#0c0516', '#ff3d9a', 1],
  ];
  $('#themes').innerHTML = THEMES.map(([id, name, a, b, c]) => `<button data-theme-pick="${id}" title="${name}" style="--ta:${a};--tb:${b};--tc:${c}"><i></i><span>${name}</span></button>`).join('');
  // The tab icon is the Lathe mark (five bars of a sound wave, the middle one in the accent) in the theme's colours.
  const mark = (panel, well, accent) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="5" fill="${well}"/><g fill="${panel}"><rect x="4.5" y="12" width="3.4" height="8"/><rect x="9.8" y="7.5" width="3.4" height="17"/><rect x="20.8" y="9.5" width="3.4" height="13"/><rect x="26.1" y="13.5" width="1.9" height="5"/></g><rect x="15.3" y="4" width="3.4" height="24" fill="${accent}"/></svg>`;
  const setTheme = name => {
    const th = THEMES.find(t => t[0] === name) || THEMES[0];
    name = th[0];
    $('link[rel=icon]').href = 'data:image/svg+xml,' + encodeURIComponent(th[5] ? mark('#efe9dd', th[2], th[4]) : mark(th[2], th[3], th[4]));
    $('meta[name=theme-color]').content = th[5] ? th[2] : th[3];
    document.documentElement.dataset.theme = name;
    if (th[5]) document.documentElement.dataset.dark = ''; else delete document.documentElement.dataset.dark;
    $$('[data-theme-pick]').forEach(b => b.classList.toggle('cur', b.dataset.themePick === name));
    try { localStorage.setItem('lathe.theme', name); } catch { /* storage blocked */ }
  };
  let savedTheme = 'paper';
  try { savedTheme = localStorage.getItem('lathe.theme') || 'paper'; } catch { /* storage blocked */ }
  setTheme(savedTheme);
  document.addEventListener('click', e => { const b = e.target.closest('[data-theme-pick]'); if (b) { setTheme(b.dataset.themePick); L.arr.render(); } });

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
  L.openProjectFile = async f => {
    try {
      const d = JSON.parse(await f.text());
      if (!d.project || !Array.isArray(d.project.tracks)) throw new Error('not a Lathe project');
      E.stop();
      for (const [id, s] of Object.entries(d.audio || {})) L.addBuffer(await E.decode(unb64(s)), id);
      L.setProject(d.project);
      L.toast('Opened ' + f.name);
    } catch (err) { L.toast('Could not open that file: ' + err.message, 6000); }
  };
  $('#f-open').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) L.openProjectFile(f); };
  $('#b-about').onclick = () => $('#about').showModal();

  // ---------- sounds still downloading ----------
  L.on('loading', n => {
    const el = $('#busy');
    el.hidden = !n;
    el.querySelector('span').textContent = n === 1 ? 'Loading 1 instrument' : `Loading ${n} instruments`;
  });

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

  // ---------- start screen ----------
  // Shown on opening: carry on with the last song, start a new one (blank, or from a style), learn with the tutorial,
  // or pick from recent songs. The song that was open stays in My songs whatever is chosen.
  const start = $('#start');
  async function startScreen(first) {
    const p = L.project, has = !first && p.tracks.some(t => t.clips.length);
    let recent = [];
    try { recent = (await L.songs.list()).filter(r => r.id !== p.id).slice(0, 5); } catch { /* no IndexedDB */ }
    start.querySelector('.st-go').innerHTML = `
      ${has ? `<button data-st="continue" class="st-main"><small>Carry on with</small><b>${L.esc(p.name)}</b></button>` : ''}
      <button data-st="blank"${has ? '' : ' class="st-main"'}><b>New blank song</b><small>An empty drum track and synth track to start from</small></button>
      <button data-st="style"><b>Start from a style</b><small>Pick a kind of music; it sets the key, tempo and instruments, and can write a backing</small></button>
      <button data-st="tour"${first ? ' class="st-hi"' : ''}><b>Learn with the tutorial</b><small>Sixteen short steps on the demo song, about five minutes</small></button>
      <button data-st="demo"><b>Open the demo song</b><small>A finished four-track example to take apart</small></button>`;
    start.querySelector('.st-recent').innerHTML = `<h3>Recent songs</h3>${recent.length ? recent.map(r => `<button data-open="${L.esc(r.id)}"><b>${L.esc(r.name)}</b><small>${new Date(r.at).toLocaleDateString([], { day: 'numeric', month: 'short' })}</small></button>`).join('') : '<p>Songs you make are kept here, in this browser.</p>'}
      <button data-st="songs" class="st-all">${L.icon('open')}All my songs${L.cloud.enabled ? ' and account' : ''}…</button><button data-st="file" class="st-all">${L.icon('open')}Open a project file…</button>`;
    start.showModal();
  }
  start.addEventListener('click', async e => {
    const b = e.target.closest('[data-st],[data-open]'); if (!b) return;
    const a = b.dataset.st;
    if (b.dataset.open) { start.close(); const p = await L.songs.get(b.dataset.open); if (p) { await L.loadBuffers(L.usedBuffers(p)); await L.video.restore(p); L.setProject(p); } return; }
    start.close();
    if (a === 'blank') await L.cloud.newSong();
    else if (a === 'style') { await L.cloud.newSong(true); L.showTab('guide'); L.toast('Choose a style on the left; press play on any of them to hear it first', 6000); }
    else if (a === 'demo' || a === 'tour') { const p = L.demoProject(); await L.video.restore(p); L.setProject(p); if (a === 'tour') L.tour.start(); }
    else if (a === 'songs') L.cloud.open();
    else if (a === 'file') $('#f-open').click();
  });
  start.addEventListener('close', () => { try { localStorage.setItem('lathe.started', '1'); } catch { /* storage blocked */ } });

  // A phone, or a browser without Web Audio, gets a plain explanation instead of a broken screen.
  function fits() {
    const msg = $('#small');
    if (!window.AudioContext || !window.OfflineAudioContext || !window.indexedDB) {
      msg.querySelector('p').innerHTML = 'This browser cannot run Lathe: it is missing the sound features Lathe is built on. Open it in a recent <b>Chrome</b>, <b>Edge</b>, <b>Firefox</b> or <b>Safari</b> on a computer or Chromebook.';
      msg.querySelector('button').hidden = true;
      msg.showModal(); return false;
    }
    // the screen size, not the window: a window opened small or in the background should not trigger this
    if (Math.min(screen.width, screen.height) < 500) { msg.showModal(); return new Promise(res => msg.addEventListener('close', () => res(true), { once: true })); }
    return true;
  }

  // ---------- boot ----------
  (async () => {
    let p = null;
    try { p = JSON.parse(localStorage.getItem('lathe.project')); } catch { /* corrupt autosave */ }
    // first visit: an empty song waits behind the start screen, which offers the demo and the tutorial
    if (!p || !Array.isArray(p.tracks)) p = L.newProject();
    if (!await fits()) return;
    const shared = await L.files.openFromLink();
    if (shared && await L.ask(`Open the shared song <b>${L.esc(shared.name)}</b>? You get your own copy to play and change. The song you had open stays in File, My songs.`, 'Open it', 'Not now')) p = shared;
    await L.loadBuffers(L.usedBuffers(p));
    await L.video.restore(p);
    $('#snap').value = L.view.snap;
    L.setProject(p);
    requestAnimationFrame(frame);
    let started = false;
    try { started = !!localStorage.getItem('lathe.started') || !!localStorage.getItem('lathe.toured'); } catch { /* storage blocked */ }
    if (p !== shared) startScreen(!started);
  })();
})();
