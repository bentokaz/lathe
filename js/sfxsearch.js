'use strict';
// Sound effect search: looks through free sound libraries from inside Lathe, so nobody has to go hunting on
// download sites. Results can be heard straight away and put in the song with one click (or dragged onto a track).
//  Openverse  openly licensed sounds, mostly from Freesound and Wikimedia Commons (no key needed;
//             a limit of 20 searches a minute and 200 a day per network, so results are kept for a week)
//  BBC        the BBC Sound Effects archive, free for personal, school and research use (RemArc licence)
L.sfxSearch = (() => {
  const { esc } = L;
  const OV = 'https://api.openverse.org/v1/audio/', BBC = 'https://sound-effects-api.bbcrewind.co.uk/api/sfx/search';
  const BBC_MEDIA = id => `https://sound-effects-media.bbcrewind.co.uk/mp3/${id}.mp3`;
  const PAGE = 20, WEEK = 7 * 864e5;
  const LIC = {
    cc0: ['No rules', 'Free for anything, no credit needed (CC0)'],
    pdm: ['No rules', 'Public domain: free for anything, no credit needed'],
    by: ['Credit', 'Free for anything if you credit the maker (CC BY)'],
    'by-sa': ['Credit', 'Credit the maker, and share what you make under the same licence (CC BY-SA)'],
    'by-nc': ['Credit, not for sale', 'Credit the maker, and do not sell what you make with it (CC BY-NC)'],
    'by-nc-sa': ['Credit, not for sale', 'Credit the maker, do not sell, share alike (CC BY-NC-SA)'],
    bbc: ['School use', 'BBC RemArc licence: free for personal, school and research use. Credit the BBC; not for anything sold or monetised'],
  };
  const CHIPS = ['whoosh', 'impact', 'explosion', 'footsteps', 'door', 'glass break', 'crowd cheering', 'applause', 'laugh', 'rain', 'thunder', 'wind', 'ocean waves', 'fire', 'birds', 'forest', 'city traffic', 'car', 'train', 'airplane', 'phone ring', 'alarm', 'clock ticking', 'heartbeat', 'typing', 'camera shutter', 'notification', 'magic', 'laser', 'sci-fi', 'cartoon', 'pop', 'click', 'swoosh', 'dog', 'cat', 'horse', 'school bell', 'water splash', 'scream'];

  const st = { q: '', src: 'all', free: false, items: [], ov: { page: 0, more: false }, bbc: { from: 0, more: false }, busy: false, msg: '', playing: null };
  let root = null, audio = null;

  // ---------- fetching (cached in this browser for a week) ----------
  function cached(key, fn) {
    const k = 'lathe.sx.' + key;
    try { const c = JSON.parse(localStorage.getItem(k) || 'null'); if (c && Date.now() - c.t < WEEK) return Promise.resolve(c.v); } catch { /* ignore */ }
    return fn().then(v => {
      try {
        localStorage.setItem(k, JSON.stringify({ t: Date.now(), v }));
        // keep the cache small: drop the oldest when there are many
        const ks = Object.keys(localStorage).filter(x => x.startsWith('lathe.sx.'));
        if (ks.length > 80) ks.map(x => [x, (JSON.parse(localStorage.getItem(x)) || {}).t || 0]).sort((a, b) => a[1] - b[1]).slice(0, 20).forEach(([x]) => localStorage.removeItem(x));
      } catch { /* storage full */ }
      return v;
    });
  }
  const sec = ms => ms / 1000;
  function openverse(q, page, free) {
    const lic = free ? 'cc0,pdm' : 'cc0,pdm,by,by-sa,by-nc,by-nc-sa'; // no "no-derivatives" sounds: putting them in a song changes them
    const u = `${OV}?q=${encodeURIComponent(q)}&source=freesound,wikimedia_audio&license=${lic}&page_size=${PAGE}&page=${page}`;
    return cached(`ov|${q}|${page}|${free}`, async () => {
      // it sometimes fails once and then answers, so give it two more tries
      let r;
      for (let i = 0; i < 3; i++) {
        try { r = await fetch(u, { signal: AbortSignal.timeout(12000) }); } catch { r = { status: 504 }; }
        if (r.status < 500) break;
        await new Promise(f => setTimeout(f, 500 + i * 700));
      }
      if (r.status === 429) throw new Error('busy');
      if (!r.ok) throw new Error('ov ' + r.status);
      const d = await r.json();
      return {
        more: page < (d.page_count || 0),
        items: d.results.filter(x => x.url && !x.mature).map(x => ({
          id: 'ov:' + x.id, title: x.title || 'Untitled', by: x.creator || '', lic: x.license, url: x.url,
          dur: sec(x.duration || 0), src: x.source === 'freesound' ? 'Freesound' : 'Wikimedia Commons', page: x.foreign_landing_url,
        })),
      };
    });
  }
  function bbc(q, from) {
    return cached(`bbc|${q}|${from}`, async () => {
      const r = await fetch(BBC, { signal: AbortSignal.timeout(15000), method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criteria: { query: q, size: PAGE, from } }) });
      if (!r.ok) throw new Error('bbc ' + r.status);
      const d = await r.json();
      return {
        more: from + PAGE < d.total,
        items: d.results.map(x => ({
          id: 'bbc:' + x.id, title: x.description || 'BBC sound', by: 'BBC', lic: 'bbc', url: BBC_MEDIA(x.id),
          dur: sec(x.duration || 0), src: 'BBC Sound Effects', page: `https://sound-effects.bbcrewind.co.uk/search?q=${x.id}`,
        })),
      };
    });
  }

  async function search(q, more) {
    q = q.trim(); if (!q) return;
    if (!more) { st.q = q; st.items = []; st.ov = { page: 0, more: true }; st.bbc = { from: 0, more: true }; st.msg = ''; }
    st.busy = true; draw();
    const useOv = st.src !== 'bbc' && st.ov.more, useBbc = st.src !== 'ov' && !st.free && st.bbc.more;
    const jobs = [
      useOv ? openverse(q, st.ov.page + 1, st.free).then(r => { st.ov = { page: st.ov.page + 1, more: r.more }; return r.items; }, e => { st.ov.more = false; st.msg = e.message === 'busy' ? 'The open library has had too many searches from this network today, so only BBC sounds are showing. Try again later.' : 'The open library did not answer.'; return []; }) : [],
      useBbc ? bbc(q, st.bbc.from).then(r => { st.bbc = { from: st.bbc.from + PAGE, more: r.more }; return r.items; }, () => { st.bbc.more = false; st.msg ||= 'The BBC library did not answer.'; return []; }) : [],
    ];
    // each library's results show as soon as they arrive; the two take turns, so both show near the top
    const base = st.items.slice(), got = [[], []], token = st.q;
    const merge = () => {
      if (token !== st.q) return; // a newer search started
      const [a, b] = got, mix = [];
      for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) mix.push(a[i]); if (b[i]) mix.push(b[i]); }
      const seen = new Set(base.map(x => x.id));
      st.items = base.concat(mix.filter(x => !seen.has(x.id) && seen.add(x.id)));
      draw();
    };
    jobs.forEach((j, i) => Promise.resolve(j).then(r => { got[i] = r; merge(); }));
    await Promise.all(jobs);
    if (token !== st.q) return;
    st.busy = false; draw();
  }

  // ---------- hearing and adding ----------
  function play(it) {
    if (audio) { audio.pause(); audio = null; }
    if (st.playing === it.id) { st.playing = null; return draw(); }
    st.playing = it.id; draw();
    audio = new Audio(it.url); audio.volume = 0.8;
    audio.onended = audio.onerror = () => { if (st.playing === it.id) { st.playing = null; draw(); } };
    audio.play().catch(() => { st.playing = null; draw(); });
  }
  const find = id => st.items.find(x => x.id === id);
  // Puts a sound in the song: on the given audio track, else an Effects track with room at that spot.
  async function insert(it, track, beat) {
    const p = L.project;
    L.toast('Adding ' + short(it.title) + '…', 0);
    try {
      const ab = await (await fetch(it.url)).arrayBuffer(), buf = await L.engine.decode(ab);
      const at = Math.max(0, beat ?? Math.round(L.pos * 4) / 4), len = buf.duration / L.spb();
      const free = t => !t.clips.some(c => c.start < at + len - 1e-6 && c.start + c.len > at + 1e-6);
      let t = track && track.type === 'audio' ? track : p.tracks.find(x => x.type === 'audio' && x.name === 'Effects' && free(x));
      if (!t) { t = L.arr.addTrack('audio'); t.name = 'Effects'; }
      const c = { id: L.uid(), name: short(it.title, 40), start: at, len, buf: L.addBuffer(buf), offset: 0, gain: 1,
        credit: { title: it.title, by: it.by, lic: it.lic, src: it.src, page: it.page } };
      t.clips.push(c); L.sel.track = t.id; L.sel.clip = c.id; L.commit();
      L.toast(`Added at bar ${Math.floor(at / 4) + 1}. Drag it to move it`, 2500);
      draw();
    } catch {
      L.toast('Could not add that sound. Try another one', 4000);
    }
  }
  const short = (s, n = 60) => s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
  const time = s => s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : s.toFixed(1) + ' s';

  // Every sound from these libraries in the song, for a credits list.
  function credits() {
    const out = [], seen = new Set();
    for (const t of L.project.tracks) for (const c of t.clips) if (c.credit && !seen.has(c.credit.page)) { seen.add(c.credit.page); out.push(c.credit); }
    return out;
  }
  const creditText = () => credits().map(c => `"${c.title}"${c.by && c.by !== 'BBC' ? ' by ' + c.by : ''}, ${c.src}${c.lic === 'bbc' ? ' (BBC copyright, RemArc licence)' : ', ' + (c.lic === 'cc0' || c.lic === 'pdm' ? 'public domain' : 'CC ' + c.lic.toUpperCase())}, ${c.page}`).join('\n');

  // ---------- drawing ----------
  function draw() {
    if (!root || root.hidden) return;
    const n = credits().length;
    if (!root.firstChild) {
      root.innerHTML = `<div class="lib-head"><h2>Find a sound effect</h2><p>Searches free sound libraries (Freesound, Wikimedia Commons and the BBC archive) right here. Press ▶ to hear one and <b>Add</b> to put it in the song at the playhead, or drag it onto a track.</p></div>
        <form class="sx-bar"><input class="sx-q" type="search" placeholder="What does it sound like? Try door slam, crowd, rain" spellcheck="false"><button>Search</button>
          <select class="sx-src" title="Where to search"><option value="all">All libraries</option><option value="ov">Freesound and Wikimedia</option><option value="bbc">BBC archive</option></select>
          <label class="sx-free" title="Only sounds with no rules at all: no credit needed and free for anything (leaves out the BBC)"><input type="checkbox"> No credit needed</label>
          <button type="button" class="sx-cred"></button></form>
        <div class="sx-chips">${CHIPS.map(c => `<button type="button" data-chip="${c}">${c}</button>`).join('')}</div>
        <div class="sx-out"></div>`;
      const f = root.querySelector('form');
      f.onsubmit = e => { e.preventDefault(); search(root.querySelector('.sx-q').value); };
      root.querySelector('.sx-src').onchange = e => { st.src = e.target.value; if (st.q) search(st.q); };
      root.querySelector('.sx-free input').onchange = e => { st.free = e.target.checked; if (st.q) search(st.q); };
      root.querySelector('.sx-cred').onclick = showCredits;
      root.querySelector('.sx-chips').onclick = e => { const c = e.target.dataset.chip; if (c) { root.querySelector('.sx-q').value = c; search(c); } };
      root.querySelector('.sx-out').addEventListener('click', e => {
        const b = e.target.closest('[data-do]'); if (!b) return;
        if (b.dataset.do === 'more') return search(st.q, true);
        const it = find(b.closest('[data-id]').dataset.id);
        if (b.dataset.do === 'play') play(it); else insert(it);
      });
      root.querySelector('.sx-out').addEventListener('dragstart', e => {
        const row = e.target.closest('[data-id]'); if (!row) return;
        e.dataTransfer.setData('application/x-lathe-sound', JSON.stringify(find(row.dataset.id)));
        e.dataTransfer.effectAllowed = 'copy';
      });
    }
    root.querySelector('.sx-q').value ||= st.q;
    root.querySelector('.sx-src').value = st.src;
    root.querySelector('.sx-free input').checked = st.free;
    const cb = root.querySelector('.sx-cred'); cb.hidden = !n; cb.textContent = `Credits for this song (${n})`;
    const used = new Set(L.project.tracks.flatMap(t => t.clips.map(c => c.credit && c.credit.page)).filter(Boolean));
    const rows = st.items.map(it => {
      const [tag, tip] = LIC[it.lic] || [it.lic, ''];
      return `<div class="sx-row${st.playing === it.id ? ' on' : ''}" data-id="${esc(it.id)}" draggable="true">
        <button class="sx-play" data-do="play" title="${st.playing === it.id ? 'Stop' : 'Hear it'}">${st.playing === it.id ? '■' : '▶'}</button>
        <div class="sx-t"><b title="${esc(it.title)}">${esc(short(it.title, 90))}</b><small>${esc(it.src)}${it.by && it.by !== 'BBC' ? ' · ' + esc(it.by) : ''} · ${time(it.dur)}</small></div>
        <span class="sx-lic" title="${esc(tip)}">${tag}</span>
        <button class="sx-add" data-do="add">${used.has(it.page) ? 'Add again' : 'Add'}</button></div>`;
    }).join('');
    const more = !st.busy && st.items.length && (st.ov.more && st.src !== 'bbc' || st.bbc.more && st.src !== 'ov' && !st.free);
    root.querySelector('.sx-out').innerHTML = (st.msg ? `<p class="sx-msg">${esc(st.msg)}</p>` : '') + rows
      + (st.busy ? '<p class="sx-msg">Searching…</p>' : !st.q ? '<p class="sx-msg">Type what you need, or pick one of the ideas above.</p>' : !st.items.length ? '<p class="sx-msg">Nothing found. Try a simpler word, like "door" instead of "creaky wooden door".</p>' : '')
      + (more ? '<button class="sx-more" data-do="more">More results</button>' : '');
  }
  function showCredits() {
    const txt = creditText(), d = document.createElement('dialog');
    d.className = 'sx-dlg';
    d.innerHTML = `<h3>Sound credits</h3><p>Sounds marked <b>Credit</b> need the maker named wherever you share the song, for example in a video description. BBC sounds are for school and personal use.</p><textarea readonly rows="8">${esc(txt)}</textarea><div><button data-a="copy">Copy</button><button data-a="close">Close</button></div>`;
    document.body.appendChild(d); d.showModal();
    d.onclick = e => { const a = e.target.dataset.a; if (a === 'copy') { navigator.clipboard.writeText(txt).then(() => L.toast('Credits copied', 1500)); } if (a === 'close' || e.target === d) d.close(); };
    d.onclose = () => d.remove();
  }
  function show(el) { root = el; draw(); }
  function stop() { if (audio) { audio.pause(); audio = null; } st.playing = null; }

  return { show, draw, stop, insert, search, credits, creditText };
})();
