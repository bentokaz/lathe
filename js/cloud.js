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
    // a song made together saves sooner, so recorded audio reaches the others quickly
    if (st === 'local' && user) { dirty = true; clearTimeout(timer); timer = setTimeout(sync, L.project && L.project.live ? 900 : 2500); }
    // someone else's change: they save it themselves, so this is only a safety copy
    else if (st === 'quiet' && user && !dirty) { dirty = true; clearTimeout(timer); timer = setTimeout(sync, 15000); }
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
        if ((user && user.id) !== was) L.emit('auth', user);
      });
      const { data } = await c.auth.getSession();
      user = data.session ? data.session.user : null;
      status();
    } catch { failed = true; status(); }
    L.emit('auth', user);
  }
  const ready = start();

  const wavBlob = b => new Blob([L.wav(b)], { type: 'audio/wav' });
  const upKey = () => 'lathe.up.' + user.id;
  const uploaded = () => { try { return new Set(JSON.parse(localStorage.getItem(upKey())) || []); } catch { return new Set(); } };
  const markUp = id => { const up = uploaded(); up.add(id); try { localStorage.setItem(upKey(), JSON.stringify([...up])); } catch { /* storage full */ } };

  // Recorded audio and video live in the folder of whoever recorded or added them. For a song made together
  // that can be anyone in it, so look in the likely folders first and then in everyone's.
  const folks = new Map();
  async function people(songId, fresh) {
    const k = folks.get(songId);
    if (k && !fresh && Date.now() - k.at < 30000) return k.ids;
    const c = await client(), ids = [];
    try {
      const { data: s } = await c.from('songs').select('owner').eq('id', songId).maybeSingle();
      if (s) ids.push(s.owner);
      const { data: m } = await c.from('song_members').select('user_id').eq('song_id', songId);
      for (const r of m || []) ids.push(r.user_id);
    } catch { /* tables from before working together */ }
    folks.set(songId, { at: Date.now(), ids });
    return ids;
  }
  async function fetchFile(file, songId, first = []) {
    if (!user) return null;
    const c = await client(), tried = new Set();
    for (const who of [...first, user.id, ...(songId ? await people(songId) : [])]) {
      if (!who || tried.has(who)) continue;
      tried.add(who);
      try { const r = await c.storage.from('audio').download(`${who}/${file}`); if (r.data) return r.data; } catch { /* not there */ }
    }
    return null;
  }
  // Fills in recorded audio the song needs: from this browser if it is here, otherwise from the account.
  async function getAudio(p, first) {
    let missing = [...L.usedBuffers(p)].filter(b => !L.buffers.has(b));
    if (!missing.length) return true;
    await L.loadBuffers(new Set(missing));
    missing = missing.filter(b => !L.buffers.has(b));
    for (const b of missing) {
      const blob = await fetchFile(b + '.wav', p.id, first);
      if (!blob) continue;
      L.addBuffer(await E.decode(await blob.arrayBuffer()), b);
      if (user) markUp(b); // it is already in someone's folder: no need for a second copy
    }
    return missing.every(b => L.buffers.has(b));
  }

  // Saves the open song to the account.
  async function sync() {
    clearTimeout(timer);
    if (!user || busy || !dirty || !L.project) return;
    // like the list in this browser, an empty song is not worth keeping yet
    if (!L.project.tracks.some(t => t.clips.length) && !L.project.video && !L.project.live) { dirty = false; return status(); }
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
      if (p.video && !p.video.key) p.video.key = L.uid();
      const data = JSON.parse(JSON.stringify(p));
      let { error } = await c.from('songs').upsert({ id: p.id, name: p.name, data, updated_at: new Date().toISOString() });
      // someone else's song with the same id (opened from their project file, or a song you were taken out of):
      // save this as a new song
      if (error && (error.code === '42501' || /row-level security/i.test(error.message))) {
        if (p.live) { delete p.live; L.toast('You are no longer in this shared song, so your copy is now a song of your own', 8000); }
        p.id = L.songId(); L.commit(); L.emit('auth', user);
        ({ error } = await c.from('songs').upsert({ id: p.id, name: p.name, data: { ...data, id: p.id }, updated_at: new Date().toISOString() }));
      }
      if (error) throw error;
      await upVideo(c, p, up);
      failed = false;
    } catch (err) {
      failed = true; dirty = true;
      clearTimeout(timer); timer = setTimeout(sync, 30000);
    }
    busy = false; status();
    if (dirty && !failed) sync();
  }

  // The song's video goes up once (after the song itself, which is quick). The free plan takes files up to 50 MB,
  // so a bigger video is shrunk into a smaller copy for the account; this browser keeps the original.
  // Videos share the per-person folders of the audio bucket.
  const MAXV = 48e6, tooBig = new Set();
  async function upVideo(c, p, up) {
    const v = p.video, f = L.video.file();
    if (!v || !f || !v.key) return;
    const k = 'video-' + v.key;
    if (up.has(k) || tooBig.has(k)) return;
    let blob = f;
    if (f.size > MAXV) {
      L.toast('Making a smaller copy of the video to keep in your account…', 0);
      try { blob = await shrink(f, v.dur); } catch { blob = null; }
      L.toast('');
    }
    let error = !blob || blob.size > 50e6 ? { message: 'too large' } : (await c.storage.from('audio').upload(`${user.id}/${k}`, blob, { contentType: blob.type || 'video/mp4', upsert: false })).error;
    if (error && /exist|duplicate/i.test(error.message)) error = null;
    if (error && /large|size|exceed|413/i.test(error.message + (error.statusCode || ''))) {
      tooBig.add(k);
      return L.toast('This video is too long to keep in your account, so it stays in this browser only. The music is saved online as normal', 8000);
    }
    if (error) throw error;
    up.add(k);
    try { localStorage.setItem(upKey(), JSON.stringify([...up])); } catch { /* storage full */ }
  }
  async function shrink(f, dur) {
    const M = await L.exporter.lib();
    const input = new M.Input({ source: new M.BlobSource(f), formats: M.ALL_FORMATS });
    const output = new M.Output({ format: new M.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new M.BufferTarget() });
    const vt = await input.getPrimaryVideoTrack(), wide = vt && vt.displayWidth > 1280;
    const bitrate = Math.max(250e3, Math.floor(MAXV * 8 * 0.85 / Math.max(1, dur)) - 128e3);
    const conv = await M.Conversion.init({ input, output, video: { codec: 'avc', bitrate, forceTranscode: true, ...(wide ? { width: 1280 } : {}) }, audio: { codec: 'aac', bitrate: 96e3 } });
    if (!conv.isValid) throw new Error('cannot convert');
    conv.onProgress = pr => L.toast(`Making a smaller copy of the video to keep in your account… ${Math.round(pr * 100)}%`, 0);
    await conv.execute();
    return new Blob([output.target.buffer], { type: 'video/mp4' });
  }
  const fetchVideo = (key, songId) => fetchFile('video-' + key, songId || (L.project && L.project.id));

  async function cloudList() {
    if (!user) return [];
    const c = await client();
    let { data, error } = await c.from('songs').select('id,name,updated_at,owner,share_code,owner_name').order('updated_at', { ascending: false });
    if (error) ({ data, error } = await c.from('songs').select('id,name,updated_at,owner').order('updated_at', { ascending: false }));
    if (error) throw error;
    return data.map(r => ({ id: r.id, name: r.name, at: Date.parse(r.updated_at), theirs: r.owner !== user.id ? r.owner_name || 'someone' : null, shared: !!r.share_code }));
  }
  async function cloudGet(id) {
    const c = await client();
    const { data, error } = await c.from('songs').select('data,updated_at').eq('id', id).single();
    if (error) throw error;
    data.data.id = id;
    return { p: data.data, at: Date.parse(data.updated_at) };
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
    for (const r of online) { const m = map.get(r.id); if (m) { Object.assign(m, { cloud: true, theirs: r.theirs, shared: r.shared }); m.at = Math.max(m.at, r.at); } else map.set(r.id, { ...r, cloud: true }); }
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
          <span class="sg-where">${r.theirs ? 'Shared by ' + esc(r.theirs) : r.shared ? 'Shared' : r.cloud && r.here ? 'Browser + account' : r.cloud ? 'Account' : 'This browser'}</span>
          ${user && !r.cloud && r.id === cur ? '' : user && !r.cloud ? '<button data-a="upload" title="Save this song to your account">' + L.icon('cloud') + '</button>' : ''}
          <button data-a="rename" class="ib" title="Rename" aria-label="Rename">${L.icon('pen')}</button>
          <button data-a="del" class="ib" title="${r.id === cur ? 'Open another song first to ' + (r.theirs ? 'leave' : 'delete') + ' this one' : r.theirs ? 'Leave this shared song' : 'Delete'}" aria-label="${r.theirs ? 'Leave' : 'Delete'}"${r.id === cur ? ' disabled' : ''}>${L.icon('trash')}</button>
        </div>`).join('') : '<p class="sg-none">No songs yet.</p>'}</div>`;
    renderAcct();
  }

  // Opens a song: the copy in this browser, unless the account has a newer one (someone else worked on it).
  async function openSong(id, force) {
    if (id === L.project.id && !force) return dlg.close();
    try {
      L.toast('Opening…', 0);
      let p = null, at = 0, online = null;
      try { const r = await L.idbGet('songs', id); if (r) { p = JSON.parse(r.json); at = r.at; } } catch { /* not in this browser */ }
      if (user) try { online = await cloudGet(id); } catch (err) { if (!p) throw err; }
      if (online && (!p || online.at > at)) p = online.p;
      if (!p) throw new Error('it is not in this browser or your account');
      if (!await getAudio(p) && user) L.toast('Some recorded audio for this song could not be found yet', 6000);
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
      if (row.theirs) {
        if (!await L.ask(`Leave "${esc(row.name)}"? It goes from your list, and you need a new invite to get back in.`, 'Leave', 'Stay')) return;
        await (await client()).from('song_members').delete().eq('song_id', id).eq('user_id', user.id);
        await L.songs.del(id).catch(() => {});
        return refresh();
      }
      if (!await L.ask(`Delete "${esc(row.name)}"${row.cloud ? ' from this browser and your account' : ''}?${row.shared ? ' Everyone you shared it with loses it too.' : ''} This cannot be undone.`, 'Delete', 'Keep it')) return;
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

  // saves the open song to the account now, even if it is still empty (to share it)
  async function saveNow() {
    if (!user) return false;
    while (busy) await new Promise(r => setTimeout(r, 200));
    clearTimeout(timer); dirty = true; busy = true; status();
    try {
      const c = await client(), p = L.project;
      const { error } = await c.from('songs').upsert({ id: p.id, name: p.name, data: JSON.parse(JSON.stringify(p)), updated_at: new Date().toISOString() });
      if (error) throw error;
      busy = false; dirty = true; await sync();
      return !failed;
    } catch { busy = false; failed = true; status(); return false; }
  }

  status();
  return { open, newSong, openSong, people, fetchVideo, getAudio, client, saveNow, ready, enabled, user: () => user, msg: m => { msg = m; mode = 'in'; } };
})();
