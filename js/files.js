'use strict';
// File formats beyond WAV and the project file: MP3 export, MIDI export and import, and song links.
L.files = (() => {
  const { $ } = L, E = L.engine;
  const PPQ = 480;
  const fileName = () => L.project.name.replace(/[^\w\- ]+/g, '').trim() || 'project';

  // ---------- shared helpers ----------
  // Every note a clip plays, in beats from the start of the song, with repeats of looped clips written out.
  function notesOf(c) {
    const cl = c.loop || c.len, out = [];
    for (let s = 0; s < c.len - 1e-9; s += cl) for (const n of c.notes) {
      if (n.s >= cl || s + n.s >= c.len) continue;
      out.push({ p: n.p, s: c.start + s + n.s, l: Math.min(n.l, cl - n.s, c.len - s - n.s), v: n.v });
    }
    return out;
  }
  const loadScript = src => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('could not download the encoder (needs a connection)'));
    document.head.append(s);
  });
  const b64url = ab => { const u = new Uint8Array(ab); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

  // ---------- MP3 ----------
  async function exportMp3() {
    try {
      L.toast('Rendering…', 0);
      const buf = await E.renderBuffer();
      L.toast('Encoding MP3…', 0);
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js');
      const enc = new window.lamejs.Mp3Encoder(2, buf.sampleRate, 192), out = [], B = 1152;
      const l = buf.getChannelData(0), r = buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0);
      const i16 = (src, i) => { const a = new Int16Array(Math.min(B, src.length - i)); for (let k = 0; k < a.length; k++) { const v = Math.max(-1, Math.min(1, src[i + k])); a[k] = v < 0 ? v * 0x8000 : v * 0x7fff; } return a; };
      for (let i = 0; i < l.length; i += B) {
        const m = enc.encodeBuffer(i16(l, i), i16(r, i));
        if (m.length) out.push(new Int8Array(m));
        if (i % (B * 400) === 0) { L.toast(`Encoding MP3… ${Math.round(i / l.length * 100)}%`, 0); await new Promise(z => setTimeout(z)); }
      }
      out.push(new Int8Array(enc.flush()));
      L.download(new Blob(out, { type: 'audio/mpeg' }), fileName() + '.mp3');
      L.toast('Exported ' + fileName() + '.mp3');
    } catch (err) { L.toast('MP3 export failed: ' + err.message, 7000); }
  }

  // ---------- MIDI out ----------
  const DRUM_OUT = [36, 38, 39, 42, 46, 45, 37, 49]; // kick, snare, clap, hat, open hat, tom, rim, crash
  const PLUCK_PROG = { 'Nylon guitar': 24, 'Steel-string acoustic': 25, 'Twelve-string jangle': 25, 'Clean electric': 27, 'Jazz guitar': 26, Ukulele: 24, Banjo: 105, Harp: 46, 'Plucked bass': 33 };
  const SYNTH_PROG = { Keys: 4, Bass: 38, Lead: 81, Pad: 89, Pluck: 45, Organ: 16, Sub: 38, Glass: 98, Strings: 50, Brass: 62, Bell: 14, Acid: 87, Reese: 38, Chip: 80, Whistle: 78, Stab: 81 };
  function program(t) {
    const I = t.inst || {};
    if (I.sf) return Math.max(0, L.lib.names().indexOf(I.sf));
    if (I.pluck) return PLUCK_PROG[I.preset] ?? 24;
    return SYNTH_PROG[I.preset] ?? 0;
  }
  const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const vlq = n => { const b = [n & 0x7f]; while ((n >>>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
  const text = (type, s) => { const b = [...new TextEncoder().encode(s)].slice(0, 120); return [0xff, type, ...vlq(b.length), ...b]; };
  function chunk(events) {
    events.sort((a, z) => a.t - z.t || a.o - z.o);
    const out = []; let last = 0;
    for (const e of events) { out.push(...vlq(e.t - last), ...e.d); last = e.t; }
    out.push(0, 0xff, 0x2f, 0);
    return [0x4d, 0x54, 0x72, 0x6b, ...u32(out.length), ...out];
  }
  function exportMidi() {
    const p = L.project, tracks = p.tracks.filter(t => t.type !== 'audio' && t.clips.length);
    if (!tracks.length) return L.toast('There are no notes to export');
    const tick = b => Math.round(b * PPQ), us = Math.round(60e6 / p.bpm);
    const head = chunk([{ t: 0, o: 0, d: text(3, p.name) }, { t: 0, o: 0, d: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255] }, { t: 0, o: 0, d: [0xff, 0x58, 4, 4, 2, 24, 8] }]);
    const CH = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]; // channel 10 (index 9) is for drums
    let chan = 0;
    const body = tracks.map(t => {
      const drums = t.type === 'drums', ch = drums ? 9 : CH[chan++ % CH.length];
      const ev = [{ t: 0, o: 0, d: text(3, t.name) }];
      if (!drums) ev.push({ t: 0, o: 0, d: [0xc0 | ch, program(t)] });
      for (const c of t.clips) for (const n of notesOf(c)) {
        const key = drums ? DRUM_OUT[((n.p - 36) % 8 + 8) % 8] : n.p, vel = Math.max(1, Math.min(127, Math.round(n.v * 127)));
        ev.push({ t: tick(n.s), o: 1, d: [0x90 | ch, key, vel] }, { t: Math.max(tick(n.s) + 1, tick(n.s + n.l)), o: 0, d: [0x80 | ch, key, 0] });
      }
      return chunk(ev);
    });
    const hdr = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 1 + body.length, PPQ >> 8, PPQ & 255];
    L.download(new Blob([new Uint8Array([...hdr, ...head, ...body.flat()])], { type: 'audio/midi' }), fileName() + '.mid');
    L.toast(`Exported ${fileName()}.mid (${tracks.length} track${tracks.length > 1 ? 's' : ''}; audio tracks are not part of MIDI)`, 6000);
  }

  // ---------- MIDI in ----------
  const DRUM_IN = { 35: 0, 36: 0, 37: 6, 38: 1, 40: 1, 39: 2, 42: 3, 44: 3, 46: 4, 41: 5, 43: 5, 45: 5, 47: 5, 48: 5, 50: 5, 49: 7, 51: 7, 52: 7, 55: 7, 57: 7, 59: 7 };
  function parseMidi(ab) {
    const d = new Uint8Array(ab); let p = 0;
    const str = n => String.fromCharCode(...d.subarray(p, p + n));
    const rd = n => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + d[p++]; return v; };
    const vl = () => { let v = 0, b; do { b = d[p++]; v = v * 128 + (b & 0x7f); } while (b & 0x80); return v; };
    if (str(4) !== 'MThd') throw new Error('not a MIDI file');
    p = 4; const hl = rd(4), start = p; rd(2); const ntr = rd(2), div = rd(2); p = start + hl;
    if (div & 0x8000) throw new Error('this MIDI file uses a timing format that is not supported');
    let tempo = null; const groups = new Map();
    for (let ti = 0; ti < ntr && p < d.length; ti++) {
      const id = str(4); p += 4; const len = rd(4), end = p + len;
      if (id !== 'MTrk') { p = end; continue; }
      let t = 0, run = 0, name = '';
      const prog = {}, open = {};
      while (p < end) {
        t += vl();
        let st = d[p];
        if (st & 0x80) p++; else st = run;
        const type = st & 0xf0, ch = st & 15;
        if (st === 0xff) {
          const mt = d[p++], ml = vl();
          if (mt === 0x51 && tempo === null) tempo = 60e6 / ((d[p] << 16) | (d[p + 1] << 8) | d[p + 2]);
          if (mt === 0x03) name = new TextDecoder().decode(d.subarray(p, p + ml));
          p += ml; continue;
        }
        if (st === 0xf0 || st === 0xf7) { p += vl(); continue; }
        run = st;
        if (type === 0xc0 || type === 0xd0) { if (type === 0xc0) prog[ch] = d[p]; p += 1; continue; }
        const a = d[p], b = d[p + 1]; p += 2;
        if (type !== 0x90 && type !== 0x80) continue;
        const key = ch + ':' + a;
        if (type === 0x90 && b) (open[key] ||= []).push({ t, v: b });
        else if (open[key] && open[key].length) {
          const on = open[key].shift(), gk = ti + ':' + ch;
          if (!groups.has(gk)) groups.set(gk, { ch, name, prog: prog[ch] ?? 0, notes: [] });
          const g = groups.get(gk); g.prog = prog[ch] ?? g.prog; if (name) g.name = name;
          g.notes.push({ p: a, s: on.t / div, l: Math.max(0.05, (t - on.t) / div), v: on.v / 127 });
        }
      }
      p = end;
    }
    return { tempo, parts: [...groups.values()].filter(g => g.notes.length) };
  }
  async function importMidi(f) {
    try {
      const { tempo, parts } = parseMidi(await f.arrayBuffer());
      if (!parts.length) throw new Error('no notes in it');
      const p = L.project, empty = !p.tracks.some(t => t.clips.length), at = Math.floor(L.pos / 4) * 4, names = L.lib.names();
      if (empty && tempo) { E.reanchor(); p.bpm = Math.round(tempo); }
      let first = null;
      for (const g of parts) {
        const drums = g.ch === 9, t = L.newTrack(drums ? 'drums' : 'synth', g.name || (drums ? 'Drums' : undefined));
        if (!drums) { const it = L.lib.byKey('gm:' + names[g.prog]); if (it) { L.lib.apply(t, it); if (!g.name) t.name = it.label; } }
        const notes = drums ? g.notes.filter(n => n.p in DRUM_IN).map(n => ({ ...n, p: 36 + DRUM_IN[n.p], l: 0.25 })) : g.notes;
        if (!notes.length) continue;
        const len = Math.max(4, Math.ceil(Math.max(...notes.map(n => n.s + n.l)) / 4) * 4);
        t.clips.push({ id: L.uid(), name: f.name.replace(/\.midi?$/i, ''), start: at, len, notes });
        p.tracks.push(t); first ||= t;
      }
      if (first) { L.sel.track = first.id; L.sel.clip = null; }
      L.commit();
      L.toast(`Imported ${parts.length} part${parts.length > 1 ? 's' : ''} from ${f.name}${empty && tempo ? `, tempo ${Math.round(tempo)} BPM` : tempo && Math.round(tempo) !== p.bpm ? ` (it was written at ${Math.round(tempo)} BPM)` : ''}`, 6000);
    } catch (err) { L.toast('Could not read that MIDI file: ' + err.message, 7000); }
  }

  // ---------- song links ----------
  // The whole song (without recorded audio or video) is compressed into the part of the link after #,
  // which never leaves the browser; whoever opens it gets their own copy to change.
  async function shareLink() {
    const p = JSON.parse(JSON.stringify(L.project));
    const dropped = p.tracks.filter(t => t.type === 'audio' && t.clips.length).length;
    p.tracks = p.tracks.filter(t => !(t.type === 'audio' && t.clips.length));
    delete p.video;
    const packed = await new Response(new Blob([JSON.stringify(p)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    const url = location.origin + location.pathname + '#song=' + b64url(packed);
    const note = dropped ? ` Recorded audio is not included (${dropped} track${dropped > 1 ? 's' : ''} left out); use File, Save for those.` : '';
    try { await navigator.clipboard.writeText(url); L.toast(`Link copied. Anyone who opens it gets their own copy of "${L.project.name}" to play and change.${note}`, 9000); }
    catch { prompt('Copy this link:', url); }
  }
  async function openFromLink() {
    const m = location.hash.match(/^#song=([\w-]+)/);
    if (!m) return null;
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const json = await new Response(new Blob([unb64url(m[1])]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      const p = JSON.parse(json);
      if (!Array.isArray(p.tracks)) throw new Error('bad song');
      return p;
    } catch { L.toast('That song link is damaged or incomplete', 7000); return null; }
  }

  $('#b-mp3').onclick = exportMp3;
  $('#b-midi').onclick = exportMidi;
  $('#b-share').onclick = shareLink;
  return { exportMp3, exportMidi, importMidi, parseMidi, shareLink, openFromLink, notesOf };
})();
