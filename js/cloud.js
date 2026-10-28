'use strict';
// My songs: every song kept in this browser, plus (when accounts are set up in config.js) songs saved to an
// account, so they open on any computer. Signing in only asks for an email address and a password.
// The open song saves to the account a moment after each change; recorded audio goes up once per recording.
L.cloud = (() => {
  const { $, esc } = L, E = L.engine;
  const C = L.CLOUD || {}, enabled = !!(C.url && C.key);
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
  let sb = null, user = null, timer = 0, busy = false, dirty = false, failed = false, msg = '', mode = 'in';

  const savedEl = $('#saved');
  function status(local) {
    let t;
    if (local === 'pending' || (user && (busy || dirty) && !failed)) t = 'Saving…';
    else if (user && failed) t = 'Saved here only';
    else if (user) t = 'Saved online';
    else t = 'Saved';
    savedEl.textContent = t;
    savedEl.classList.toggle('busy', t === 'Saving…');
    savedEl.title = user ? (failed ? 'Your account cannot be reached; the song is saved in this browser and goes online when it can' : 'Saved to the account of ' + user.email) : 'Every change is saved in this browser (File, My songs)';
  }
  L.on('savestate', st => {
    status(st);
    if (st === 'local' && user) { dirty = true; clearTimeout(timer); timer = setTimeout(sync, 2500); }
  });

  // ---------- account ----------
  const client = async () => {
    if (!sb) { const m = await import(LIB); sb = m.createClient(C.url, C.key, { auth: { persistSession: true, autoRefreshToken: true } }); }
    return sb;
  };
  async function start() {
    if (!enabled) return;
    try {
      const c = await client();
      c.auth.onAuthStateChange((ev, session) => {
        const was = user && user.id;
        user = session ? session.user : null;
        status();
        renderAcct();
        if (user && user.id !== was) { dirty = true; sync(); }
      });
      const { data } = await c.auth.getSession();
      user = data.session ? data.session.user : null;
      status();
    } catch { failed = true; status(); }
  }

  const wavBlob = b => new Blob([L.wav(b)], { type: 'audio/wav' });
  const upKey = () => 'lathe.up.' + user.id;
  const uploaded = () => { try { return new Set(JSON.parse(localStorage.getItem(upKey())) || []); } catch { return new Set(); } };

  // Saves the open song to the account.
  async function sync() {
    clearTimeout(timer);
    if (!user || busy || !dirty) return;
    // like the list in this browser, an empty song is not worth keeping yet
    if (!L.project.tracks.some(t => t.clips.length) && !L.project.video) { dirty = false; return status(); }
    busy = true; dirty = false; status();
    try {
      const c = await client(), p = L.project;
      // recorded audio first, so the song never points at audio that is not there yet
      const up = uploaded();
      for (const id of L.usedBuffers(p)) {
        if (up.has(id) || !L.buffers.get(id)) continue;
        const { error } = await c.storage.from('audio').upload(`${user.id}/${id}.wav`, wavBlob(L.buffers.get(id)), { contentType: 'audio/wav', upsert: false });
        if (error && !/exist|duplicate/i.test(error.message)) throw error;
        up.add(id);
        try { localStorage.setItem(upKey(), JSON.stringify([...up])); } catch { /* storage full */ }
      }
      const data = JSON.parse(JSON.stringify(p)); delete data.video;
      let { error } = await c.from('songs').upsert({ id: p.id, name: p.name, data, updated_at: new Date().toISOString() });
      // someone else's song with the same id (opened from their project file): save this as a new song
      if (error && (error.code === '42501' || /row-level security/i.test(error.message))) {
        p.id = L.songId(); L.commit();
        ({ error } = await c.from('songs').upsert({ id: p.id, name: p.name, data: { ...data, id: p.id }, updated_at: new Date().toISOString() }));
      }
      if (error) throw error;
      failed = false;
    } catch (err) {
      failed = true; dirty = true;
      clearTimeout(timer); timer = setTimeout(sync, 30000);
    }
    busy = false; status();
    if (dirty && !failed) sync();
  }

  async function cloudList() {
    if (!user) return [];
    const { data, error } = await (await client()).from('songs').select('id,name,updated_at').order('updated_at', { ascending: false });
    if (error) throw error;
    return data.map(r => ({ id: r.id, name: r.name, at: Date.parse(r.updated_at) }));
  }
  async function cloudGet(id) {
    const c = await client();
    const { data, error } = await c.from('songs').select('data').eq('id', id).single();
    if (error) throw error;
    const p = data.data;
    for (const b of L.usedBuffers(p)) {
      if (L.buffers.has(b)) continue;
      const r = await c.storage.from('audio').download(`${user.id}/${b}.wav`);
      if (r.data) L.addBuffer(await E.decode(await r.data.arrayBuffer()), b);
    }
    return p;
  }

  // ---------- My songs dialog ----------
  const dlg = document.createElement('dialog');
  dlg.id = 'songs';
  document.body.append(dlg);
  let rows = [], note = '';
  const when = t => { const d = new Date(t), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }); };

  function renderAcct() {
    const box = dlg.querySelector('.sg-acct'); if (!box) return;
    if (!enabled) {
      box.innerHTML = `<p>Songs are kept in this browser. To open them on another computer, use <b>File, Save project file</b> and take the file with you.</p>`;
    } else if (user) {
      box.innerHTML = `<p>Signed in as <b>${esc(user.email)}</b>. The open song saves to your account as you work.</p>
        <div class="sg-btns"><button data-a="out">Sign out</button><button data-a="outclear" title="For shared computers: removes songs that are safely in your account from this browser">Sign out and clear this browser</button></div>`;
    } else {
      box.innerHTML = `<p>${mode === 'up' ? 'Make an account to keep songs online and open them on any computer. Only your email address is stored.' : 'Sign in to keep songs online and open them on any computer.'}</p>
        <form class="sg-form"><input type="email" name="email" placeholder="Email address" autocomplete="email" required><input type="password" name="pw" placeholder="Password (6 or more characters)" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}" minlength="6" required>
        <button class="strong">${mode === 'up' ? 'Create account' : 'Sign in'}</button></form>
        <p class="sg-msg">${esc(msg)}</p>
        <button class="sg-switch" data-a="mode">${mode === 'up' ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>`;
    }
  }
  async function refresh() {
    let local = [], online = [];
    try { local = await L.songs.list(); } catch { /* no IndexedDB */ }
    try { online = await cloudList(); note = ''; } catch { note = user ? 'Could not reach your account just now; showing songs in this browser.' : ''; }
    const map = new Map();
    for (const r of local) map.set(r.id, { id: r.id, name: r.name, at: r.at, here: true });
    for (const r of online) { const m = map.get(r.id); if (m) { m.cloud = true; m.at = Math.max(m.at, r.at); } else map.set(r.id, { ...r, cloud: true }); }
    rows = [...map.values()].sort((a, b) => b.at - a.at);
    draw();
  }
  function draw() {
    const cur = L.project.id;
    dlg.innerHTML = `<div class="sg-head"><h2>My songs</h2><button class="ib" data-a="close" title="Close" aria-label="Close">×</button></div>
      <div class="sg-acct"></div>
      <div class="sg-tools"><button data-a="new">${L.icon('plus')}New song</button><button data-a="file">${L.icon('open')}Open a project file…</button></div>
      ${note ? `<p class="sg-msg">${note}</p>` : ''}
      <div class="sg-list">${rows.length ? rows.map(r => `
        <div class="sg-row${r.id === cur ? ' cur' : ''}" data-id="${esc(r.id)}">
          <button class="sg-name" data-a="open" title="${r.id === cur ? 'This song is open' : 'Open'}"><b>${esc(r.name || 'Untitled')}</b><small>${r.id === cur ? 'Open now' : when(r.at)}</small></button>
          <span class="sg-where">${r.cloud && r.here ? 'Browser + account' : r.cloud ? 'Account' : 'This browser'}</span>
          ${user && !r.cloud && r.id === cur ? '' : user && !r.cloud ? '<button data-a="upload" title="Save this song to your account">' + L.icon('cloud') + '</button>' : ''}
          <button data-a="rename" class="ib" title="Rename" aria-label="Rename">${L.icon('pen')}</button>
          <button data-a="del" class="ib" title="${r.id === cur ? 'Open another song first to delete this one' : 'Delete'}" aria-label="Delete"${r.id === cur ? ' disabled' : ''}>${L.icon('trash')}</button>
        </div>`).join('') : '<p class="sg-none">No songs yet.</p>'}</div>`;
    renderAcct();
  }

  async function openSong(id) {
    if (id === L.project.id) return dlg.close();
    try {
      L.toast('Opening…', 0);
      let p = null;
      try { p = await L.songs.get(id); } catch { /* not in this browser */ }
      if (!p) p = await cloudGet(id);
      else { const missing = [...L.usedBuffers(p)].filter(b => !L.buffers.has(b)); if (missing.length) await L.loadBuffers(new Set(missing)); }
      E.stop();
      await L.video.restore(p);
      L.setProject(p);
      dlg.close();
      L.toast('Opened ' + p.name);
    } catch (err) { L.toast('Could not open that song: ' + (err.message || err), 6000); }
  }
  // starts a fresh song; the one open now is already kept in the list
  async function newSong(empty) {
    E.stop();
    const p = L.newProject();
    if (empty) p.tracks = [];
    await L.video.restore(p);
    L.setProject(p);
  }

  dlg.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, email = f.email.value.trim(), password = f.pw.value;
    msg = mode === 'up' ? 'Creating your account…' : 'Signing in…'; renderAcct();
    try {
      const c = await client();
      const { data, error } = mode === 'up' ? await c.auth.signUp({ email, password }) : await c.auth.signInWithPassword({ email, password });
      if (error) throw error;
      msg = mode === 'up' && !data.session ? 'Nearly there: open the email we just sent and press its link, then sign in here.' : '';
      if (data.session) { mode = 'in'; refresh(); }
      else renderAcct();
    } catch (err) {
      msg = /invalid login/i.test(err.message) ? 'That email and password do not match. Check them, or create an account.' : /already registered/i.test(err.message) ? 'There is already an account with that email; sign in instead.' : 'Could not do that: ' + err.message;
      renderAcct();
    }
  });
  dlg.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a, id = b.closest('[data-id]')?.dataset.id, row = rows.find(r => r.id === id);
    if (a === 'close') dlg.close();
    else if (a === 'mode') { mode = mode === 'up' ? 'in' : 'up'; msg = ''; renderAcct(); }
    else if (a === 'new') { await newSong(); dlg.close(); L.toast('New song started. Your other songs are in File, My songs'); }
    else if (a === 'file') { dlg.close(); $('#f-open').click(); }
    else if (a === 'open') openSong(id);
    else if (a === 'out' || a === 'outclear') {
      if (a === 'outclear') {
        if (!await L.ask('Remove the songs that are saved in your account from this browser, then sign out? They stay in your account.', 'Sign out and clear')) return;
        await sync();
        for (const r of rows) if (r.cloud) await L.songs.del(r.id).catch(() => {});
        await newSong();
      }
      await (await client()).auth.signOut();
      user = null; refresh(); status();
    } else if (a === 'upload') {
      const p = await L.songs.get(id);
      const { error } = await (await client()).from('songs').upsert({ id, name: p.name, data: p, updated_at: new Date().toISOString() });
      L.toast(error ? 'Could not save it to your account: ' + error.message : `"${p.name}" saved to your account`, 5000);
      refresh();
    } else if (a === 'rename') {
      const name = await L.askText('New name', row.name, 'Rename'); if (!name) return;
      if (id === L.project.id) { L.project.name = name; L.commit(); }
      else {
        if (row.here) { const p = await L.songs.get(id); p.name = name; await L.idbPut('songs', id, { id, name, at: Date.now(), json: JSON.stringify(p) }); }
        if (row.cloud) { const c = await client(), { data } = await c.from('songs').select('data').eq('id', id).single(); if (data) await c.from('songs').update({ name, data: { ...data.data, name } }).eq('id', id); }
      }
      refresh();
    } else if (a === 'del') {
      if (!await L.ask(`Delete "${esc(row.name)}"${row.cloud ? ' from this browser and your account' : ''}? This cannot be undone.`, 'Delete', 'Keep it')) return;
      if (row.here) await L.songs.del(id).catch(() => {});
      if (row.cloud) await (await client()).from('songs').delete().eq('id', id);
      refresh();
    }
  });

  function open() { refresh(); dlg.showModal(); }
  $('#b-songs').onclick = open;
  $('#b-acct').onclick = open;
  $('#b-new').onclick = async () => { await newSong(); L.toast('New song started. The last one is kept in File, My songs', 5000); };

  // leaving with a change not yet written down: let the browser ask
  addEventListener('beforeunload', e => { if (L.savePending() || (user && (dirty || busy))) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && user && dirty) sync(); });

  status();
  start();
  return { open, newSong, enabled, user: () => user };
})();
