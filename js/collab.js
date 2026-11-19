'use strict';
// Working together: the owner of a song makes an invite link, and anyone who opens it and signs in joins the song.
// Everyone with the song open is on a live channel for it: each change goes to the others as a patch (see state.js),
// and who is here, and which track and clip they have picked, goes with it.
// When two people change the same thing at the same moment, everyone ends up with the same one of the two:
// each part of the song remembers the latest change to it (a counter, then who made it, to break ties).
L.collab = (() => {
  const { $, esc } = L, C = L.cloud;
  const tab = L.uid() + L.uid(); // this window: the same person can have the song open twice
  let ch = null, live = null, up = false, clock = 0, stamps = new Map(), peers = new Map(), waiting = [], held = false, asked = 0;

  const me = () => C.user();
  const nameOf = u => (u && u.email || 'someone').split('@')[0];
  const COLORS = ['#d9480f', '#1971c2', '#0c8a5f', '#9c36b5', '#c08000', '#c2255c', '#0b7285', '#5c7c00'];
  const colorOf = id => COLORS[[...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];
  const newer = (a, b) => !b || a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);

  // every part a patch touches, by name
  function parts(d) {
    const out = [];
    for (const k in d.m || {}) out.push(['m', k, 'm.' + k]);
    for (const k in d.t || {}) out.push(['t', k, 't.' + k]);
    for (const k in d.c || {}) out.push(['c', k, 'c.' + k]);
    if (d.o) out.push(['o', null, 'o']);
    return out;
  }
  // keeps the parts of d that are newer than what is here (or, with take, that nobody has a stamp for)
  function pick(d, st, take) {
    const out = { m: {}, t: {}, c: {} };
    let n = 0;
    for (const [kind, k, key] of parts(d)) {
      const mine = stamps.get(key), theirs = st(key);
      if (theirs ? !newer(theirs, mine) : (mine || !take)) continue;
      if (theirs) stamps.set(key, theirs);
      if (kind === 'o') out.o = d.o; else out[kind][k] = d[kind][k];
      n++;
    }
    return n ? out : null;
  }

  // ---------- the channel ----------
  async function check() {
    const want = me() && L.project && L.project.live || null;
    if (want === live) return render();
    leave();
    if (!want) return render();
    live = want;
    const c = await C.client();
    if (live !== want) return;
    const chan = ch = c.channel('lathe-' + want, { config: { broadcast: { self: false }, presence: { key: tab } } });
    chan.on('broadcast', { event: 'op' }, ({ payload }) => allowed(payload.uid).then(y => y && later(() => got(payload))))
      .on('broadcast', { event: 'hello' }, ({ payload }) => allowed(payload.uid).then(y => y && hello(payload)))
      .on('broadcast', { event: 'state' }, ({ payload }) => allowed(payload.uid).then(y => y && later(() => merge(payload))))
      .on('broadcast', { event: 'out' }, ({ payload }) => allowed(payload.uid).then(y => y && out(payload)))
      .on('presence', { event: 'sync' }, () => {
        if (chan !== ch) return;
        peers = new Map();
        for (const [k, v] of Object.entries(chan.presenceState())) if (k !== tab && v[0]) peers.set(k, v[0]);
        render();
      })
      .subscribe(async st => {
        if (chan !== ch) return;
        up = st === 'SUBSCRIBED';
        render();
        if (!up) return;
        // ask whoever is here for the song as they have it: changes not saved to the account yet, and
        // anything missed while the connection was down
        asked = Date.now();
        await chan.track(info());
        chan.send({ type: 'broadcast', event: 'hello', payload: { by: tab, uid: me().id } });
      });
  }
  function leave() {
    if (ch) { const c = ch; ch = null; c.unsubscribe(); C.client().then(s => s.removeChannel(c)).catch(() => {}); }
    live = null; up = false; peers = new Map(); inSong = new Set(); inSongAt = 0; stamps = new Map(); clock = 0; waiting = [];
    render();
  }
  // Only people in the song (by the account's list) are listened to: someone taken out of it may still be
  // connected until their next save tells them, and their changes should not reach anyone.
  let inSong = new Set(), inSongAt = 0, pend = null;
  async function allowed(uid) {
    if (inSong.has(uid)) return true;
    // look the list up again (at most every 3 seconds): they may have only just joined
    pend ||= (async () => {
      const wait = 3000 - (Date.now() - inSongAt);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      inSongAt = Date.now();
      try { inSong = new Set(await C.people(L.project.id, true)); } catch { /* offline: keep the list */ }
      pend = null; render();
    })();
    await pend;
    return inSong.has(uid);
  }
  // the owner took someone out of the song (or everyone, when sharing stops)
  function out(m) {
    if (m.who === '*' || m.who === me().id) {
      if (m.who === '*' && m.uid === me().id) return;
      const p = L.project;
      L.songs.del(p.id).catch(() => {});
      delete p.live; p.id = L.songId(); L.commit(); check();
      return L.toast('The owner ' + (m.who === '*' ? 'stopped sharing this song' : 'took you out of this song') + '. Your copy is now a song of your own, in File, My songs', 8000);
    }
    inSong.delete(m.who); render();
  }
  const send = (event, payload) => ch && ch.send({ type: 'broadcast', event, payload }).catch(() => {});

  // a change made here (or an undo): stamp its parts and pass it on
  L.on('patch', d => {
    if (!ch) return;
    clock++;
    const st = [clock, tab];
    for (const [, , key] of parts(d)) stamps.set(key, st);
    send('op', { by: tab, uid: me().id, clk: clock, d });
  });
  function got(m) {
    clock = Math.max(clock, m.clk);
    const d = pick(m.d, () => [m.clk, m.by]);
    if (d) { L.applyRemote(d); fetchMissing(m.uid); }
  }
  // someone arrived (or came back): tell them the song as it is here, with the stamps
  function hello(m) {
    if (!L.project) return;
    send('state', { by: tab, uid: me().id, clk: clock, st: [...stamps], p: { ...L.project, live: undefined } });
  }
  // the song as someone else has it: take every part of theirs that is newer. Just after arriving, also take
  // the parts nobody has changed while here (this browser may have an older copy than theirs)
  function merge(m) {
    if (!L.project || !m.p || m.p.id !== L.project.id) return;
    clock = Math.max(clock, m.clk);
    const P = L.patch, d = P.diff(P.snap(L.project), P.snap({ ...m.p, tracks: m.p.tracks || [] }));
    if (!d) return;
    const theirs = new Map(m.st || []);
    const fresh = pick(d[0], key => theirs.get(key), Date.now() - asked < 6000);
    if (fresh) { L.applyRemote(fresh); fetchMissing(m.uid); }
  }

  // Changes from others wait while a mouse button is down or a box is being typed in here, so they never pull
  // a clip out from under a drag or wipe half-typed text.
  const typing = () => { const a = document.activeElement; return a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !/range|checkbox|radio|button|color/.test(a.type))); };
  function later(fn) { if (held || typing()) waiting.push(fn); else fn(); }
  function flush() {
    if (held || typing() || !waiting.length) return;
    const w = waiting; waiting = [];
    w.forEach(fn => fn());
  }
  addEventListener('pointerdown', () => { held = true; }, true);
  const release = () => { held = false; setTimeout(flush, 0); };
  addEventListener('pointerup', release, true);
  addEventListener('pointercancel', release, true);
  addEventListener('blur', release);
  document.addEventListener('focusout', () => setTimeout(flush, 0));

  // recorded audio or a video someone else added: fetch it from their account folder (it may still be uploading)
  let fetching = false, triedVideo = null;
  async function fetchMissing(uid, tries = 0) {
    if (fetching) return;
    fetching = true;
    let ok = true;
    try {
      const p = L.project;
      ok = await C.getAudio(p, [uid]);
      if (p.video && !L.video.file() && triedVideo !== p.video.key + tries) {
        triedVideo = p.video.key + tries;
        await L.video.restore(p);
        ok = ok && !!L.video.file();
      }
      if (p === L.project) L.emit('change');
    } catch { ok = false; }
    fetching = false;
    if (!ok && tries < 12 && live) setTimeout(() => fetchMissing(uid, tries + 1), 5000);
  }

  // ---------- who is here ----------
  const info = () => ({ uid: me() && me().id, name: nameOf(me()), track: L.sel.track, clip: L.sel.clip });
  let infoT = 0, lastInfo = '';
  const share = () => {
    clearTimeout(infoT);
    infoT = setTimeout(() => {
      const i = info(), j = JSON.stringify(i);
      if (ch && up && j !== lastInfo) { lastInfo = j; ch.track(i).catch(() => {}); }
    }, 120);
  };
  L.on('sel', share);
  L.on('change', share);

  const peopleEl = document.createElement('div');
  peopleEl.id = 'people';
  $('#b-fb').before(peopleEl);
  const btn = document.createElement('button');
  btn.id = 'b-together'; btn.className = 'fb-btn';
  btn.textContent = 'Share';
  btn.title = 'Work on this song with other people at the same time';
  $('#b-fb').before(btn);
  const style = document.createElement('style');
  document.head.append(style);

  // one chip per person (two windows of the same person count once), and their pick marked in the timeline
  function render() {
    const seen = new Map();
    for (const v of peers.values()) if (v.uid && v.uid !== (me() && me().id) && !seen.has(v.uid) && (!inSongAt || inSong.has(v.uid))) seen.set(v.uid, v);
    const list = [...seen.values()];
    const where = v => { const t = v.track && L.project && L.trackById(v.track); return t ? ', on ' + t.name : ''; };
    peopleEl.innerHTML = !live ? '' : (up ? '' : '<span class="pp-off" title="Trying to reach the others; your changes are kept and sent when it reconnects">offline</span>')
      + list.map(v => `<span class="pp" style="--pc:${colorOf(v.uid)}" title="${esc(v.name)} is here${esc(where(v))}">${esc(v.name.slice(0, 2))}</span>`).join('');
    btn.classList.toggle('on', !!live);
    btn.textContent = live ? (list.length ? `Together (${list.length + 1})` : 'Shared') : 'Share';
    style.textContent = list.map(v => {
      const c = colorOf(v.uid), n = JSON.stringify(v.name.slice(0, 12));
      return (v.track ? `.trow[data-track="${CSS.escape(v.track)}"] .thead { box-shadow: inset -4px 0 0 ${c}; }` : '')
        + (v.clip ? `.clip[data-clip="${CSS.escape(v.clip)}"] { outline: 2px solid ${c}; outline-offset: 1px; z-index: 2; }
          .clip[data-clip="${CSS.escape(v.clip)}"]::after { content: ${n}; position: absolute; right: 0; bottom: 0; font: 9px/13px var(--m); padding: 0 4px; background: ${c}; color: #fff; pointer-events: none; }` : '');
    }).join('\n');
  }

  // ---------- the Share dialog ----------
  const dlg = document.createElement('dialog');
  dlg.id = 'together';
  document.body.append(dlg);
  let row = null, members = [], note = '';
  const code = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
  const linkOf = r => location.origin + location.pathname + '?join=' + encodeURIComponent(L.project.id) + '.' + r.share_code;

  async function load() {
    row = null; members = [];
    if (!me()) return;
    const c = await C.client();
    const { data } = await c.from('songs').select('owner,share_code,owner_name').eq('id', L.project.id).maybeSingle();
    row = data;
    if (row && row.share_code) {
      const { data: m } = await c.from('song_members').select('user_id,email').eq('song_id', L.project.id).order('joined_at');
      members = m || [];
    }
  }
  function draw() {
    const p = L.project, mine = !row || row.owner === me()?.id, on = !!(row && row.share_code && p.live);
    let body;
    if (!C.enabled) body = `<p>Working together needs accounts, which are not switched on for this copy of Lathe (README.md has the steps).</p>`;
    else if (!me()) body = `<p>To make a song with other people, sign in first. Everyone who joins needs an account too: it only takes an email address and a password.</p>
      <div class="sg-btns"><button class="strong" data-a="signin">Sign in or create an account</button></div>`;
    else if (!on && mine) body = `<p>Invite people to work on <b>${esc(p.name)}</b> with you. Anyone who opens the link and signs in can change the song, and everyone sees each other's changes as they happen.</p>
      <div class="sg-btns"><button class="strong" data-a="make">Make an invite link</button></div>`;
    else if (!on) body = `<p>This song is no longer shared with you.</p>`;
    else body = `${mine ? '' : `<p>Shared by <b>${esc(row.owner_name || 'its owner')}</b>.</p>`}
      <p>Send this link to the people you want in the song. They sign in, and the song opens for them with your changes appearing as you make them.</p>
      <div class="tg-link"><input readonly value="${esc(linkOf(row))}" aria-label="Invite link"><button class="strong" data-a="copy">Copy link</button></div>
      <h3>In this song</h3>
      <ul class="tg-ppl">
        <li><span class="pp" style="--pc:${colorOf(row.owner)}">${esc((row.owner_name || '?').slice(0, 2))}</span><b>${esc(row.owner_name || 'owner')}</b><small>${row.owner === me().id ? 'you, ' : ''}owner</small></li>
        ${members.map(m => `<li><span class="pp" style="--pc:${colorOf(m.user_id)}">${esc(nameOf(m).slice(0, 2))}</span><b>${esc(nameOf(m))}</b><small>${m.user_id === me().id ? 'you' : [...peers.values()].some(v => v.uid === m.user_id) ? 'here now' : ''}</small>${mine ? `<button class="ib" data-a="remove" data-u="${esc(m.user_id)}" title="Take ${esc(nameOf(m))} out of the song" aria-label="Remove">${L.icon('trash')}</button>` : ''}</li>`).join('')}
        ${members.length ? '' : '<li class="tg-none">Nobody has joined yet.</li>'}
      </ul>
      <p class="tg-small">Changes go to everyone straight away. Undo only takes back your own changes. If two people change the same clip at the same moment, the later change wins.</p>
      <div class="sg-btns">${mine ? '<button data-a="stop">Stop sharing</button>' : '<button data-a="leave">Leave this song</button>'}</div>`;
    dlg.innerHTML = `<div class="sg-head"><h2>Work together</h2><button class="ib" data-a="close" title="Close" aria-label="Close">×</button></div>
      <div class="sg-acct">${body}<p class="sg-msg">${esc(note)}</p></div>`;
  }
  async function open() {
    note = ''; draw(); dlg.showModal();
    try { await load(); } catch { note = 'Could not reach your account just now.'; }
    draw();
  }
  async function makeLink() {
    const p = L.project, u = me();
    note = 'Making the link…'; draw();
    p.live = code() + code();
    L.commit();
    if (!await C.saveNow()) { delete p.live; L.commit(); note = 'Could not save the song to your account just now. Check the connection and try again.'; return draw(); }
    const c = await C.client();
    const { error } = await c.from('songs').update({ share_code: code(), owner_name: nameOf(u) }).eq('id', p.id);
    if (error) { note = 'Could not make the link: ' + error.message; return draw(); }
    note = '';
    await load(); draw(); check();
  }
  dlg.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a, c = me() && await C.client();
    if (a === 'close') dlg.close();
    else if (a === 'signin') { dlg.close(); C.open(); }
    else if (a === 'make') makeLink();
    else if (a === 'copy') {
      const inp = dlg.querySelector('.tg-link input');
      try { await navigator.clipboard.writeText(inp.value); note = 'Link copied. Send it to the people you want in the song.'; } catch { inp.select(); note = 'Press Ctrl+C to copy the selected link.'; }
      draw();
    } else if (a === 'remove') {
      const m = members.find(x => x.user_id === b.dataset.u);
      if (!m || !await L.ask(`Take <b>${esc(nameOf(m))}</b> out of this song? They keep a copy of it as it is now, but no longer see your changes.`, 'Take out', 'Cancel')) return;
      await c.from('song_members').delete().eq('song_id', L.project.id).eq('user_id', m.user_id);
      inSong.delete(m.user_id);
      send('out', { by: tab, uid: me().id, who: m.user_id });
      await load(); draw();
    } else if (a === 'stop') {
      if (!await L.ask('Stop sharing this song? Everyone in it keeps a copy as it is now, and the invite link stops working.', 'Stop sharing', 'Keep sharing')) return;
      await c.from('songs').update({ share_code: null }).eq('id', L.project.id);
      await c.from('song_members').delete().eq('song_id', L.project.id);
      await send('out', { by: tab, uid: me().id, who: '*' });
      delete L.project.live; L.commit(); C.saveNow();
      check(); await load(); draw();
    } else if (a === 'leave') {
      if (!await L.ask('Leave this song? You keep a copy of it as it is now, as a song of your own.', 'Leave', 'Stay')) return;
      await c.from('song_members').delete().eq('song_id', L.project.id).eq('user_id', me().id);
      const p = L.project;
      await L.songs.del(p.id).catch(() => {});
      delete p.live; p.id = L.songId(); L.commit();
      dlg.close(); check();
      L.toast('You left the song. Your copy is now a song of your own, in File, My songs', 6000);
    }
  });
  btn.onclick = open;
  $('#b-together2').onclick = open;

  // ---------- joining from an invite link ----------
  const inv = new URLSearchParams(location.search).get('join');
  async function join() {
    const [id, key] = inv.split('.');
    history.replaceState(null, '', location.pathname + location.hash);
    const st = $('#start'); if (st.open) st.close();
    try {
      L.toast('Joining the song…', 0);
      const c = await C.client();
      const { data: name, error } = await c.rpc('join_song', { s: id, code: key });
      if (error) throw error;
      await C.openSong(id, true);
      L.toast(`You are in "${name}". Your changes show up for everyone in it, and theirs for you`, 7000);
    } catch (err) {
      L.toast(/no longer works/.test(err.message) ? 'That invite link no longer works. Ask for a new one' : 'Could not join the song: ' + err.message, 8000);
    }
  }
  if (inv && C.enabled) (async () => {
    await C.ready;
    while (!L.project) await new Promise(r => setTimeout(r, 100));
    if (me()) return join();
    const st = $('#start'); if (st.open) st.close();
    C.msg('You were invited to work on a song. Sign in, or create an account, and it opens.');
    C.open();
    const go = u => { if (u) { L.off && L.off('auth', go); if (!joined) { joined = true; document.querySelector('#songs').close(); join(); } } };
    let joined = false;
    L.on('auth', go);
  })();

  L.on('load', check);
  L.on('auth', () => { check(); if (dlg.open) open(); });
  return { open, check, peers: () => peers, live: () => live, connected: () => up };
})();
