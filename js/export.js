'use strict';
// Export dialog: song audio in many formats, MIDI, and the scored video, all rendered faster than real time.
// Containers and codecs come from Mediabunny (loaded on first use); encoding uses the browser's WebCodecs.
L.exporter = (() => {
  const { $, esc } = L, E = L.engine;
  const MB_URL = 'https://cdn.jsdelivr.net/npm/mediabunny@1/+esm';
  let mb = null;
  const lib = async () => mb || (mb = await import(MB_URL));
  const fileName = () => L.project.name.replace(/[^\w\- ]+/g, '').trim() || 'project';

  // id: [label, extension, how]
  const AUDIO = [
    ['wav16', 'WAV, 16-bit', 'wav', 'pcm-s16'],
    ['wav24', 'WAV, 24-bit', 'wav', 'pcm-s24'],
    ['wav32', 'WAV, 32-bit float', 'wav', 'pcm-f32'],
    ['aiff', 'AIFF, 16-bit', 'aiff', 'aiff'],
    ['mp3-320', 'MP3, 320 kbps', 'mp3', 'mp3:320'],
    ['mp3-192', 'MP3, 192 kbps', 'mp3', 'mp3:192'],
    ['mp3-128', 'MP3, 128 kbps (smaller)', 'mp3', 'mp3:128'],
    ['m4a', 'AAC in M4A (Apple, phones)', 'm4a', 'aac'],
    ['aac', 'AAC, raw .aac', 'aac', 'aac'],
    ['ogg', 'Opus in OGG', 'ogg', 'opus'],
    ['webma', 'Opus in WebM', 'webm', 'opus'],
  ];
  const VIDEO = [['mp4', 'MP4 (plays everywhere)'], ['mov', 'MOV (QuickTime, editors)'], ['webm', 'WebM (web)'], ['mkv', 'MKV (Matroska)']];
  let kind = 'audio', audioFmt = 'wav16', videoFmt = 'mp4', range = 'song', busy = false, cancelled = false;

  // ---------- writers ----------
  function aiff(buf) {
    const ch = buf.numberOfChannels, n = buf.length, bytes = n * ch * 2, out = new DataView(new ArrayBuffer(54 + bytes));
    const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'FORM'); out.setUint32(4, 46 + bytes); str(8, 'AIFF');
    str(12, 'COMM'); out.setUint32(16, 18); out.setUint16(20, ch); out.setUint32(22, n); out.setUint16(26, 16);
    // sample rate as an 80-bit extended float
    let e = 16383 + 31, m = buf.sampleRate; while (m < 0x80000000) { m *= 2; e--; }
    out.setUint16(28, e); out.setUint32(30, m >>> 0); out.setUint32(34, 0);
    str(38, 'SSND'); out.setUint32(42, 8 + bytes); out.setUint32(46, 0); out.setUint32(50, 0);
    const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 54;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff); o += 2; }
    return out.buffer;
  }
  async function mp3(buf, kbps, progress) {
    await new Promise((res, rej) => {
      if (window.lamejs) return res();
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js'; s.onload = res; s.onerror = () => rej(new Error('could not download the MP3 encoder (needs a connection)'));
      document.head.append(s);
    });
    const enc = new window.lamejs.Mp3Encoder(2, buf.sampleRate, kbps), out = [], B = 1152;
    const l = buf.getChannelData(0), r = buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0);
    const i16 = (src, i) => { const a = new Int16Array(Math.min(B, src.length - i)); for (let k = 0; k < a.length; k++) { const v = Math.max(-1, Math.min(1, src[i + k])); a[k] = v < 0 ? v * 0x8000 : v * 0x7fff; } return a; };
    for (let i = 0; i < l.length; i += B) {
      const m = enc.encodeBuffer(i16(l, i), i16(r, i));
      if (m.length) out.push(new Int8Array(m));
      if (i % (B * 300) === 0) { progress(i / l.length); await new Promise(z => setTimeout(z)); if (cancelled) throw new Error('cancelled'); }
    }
    out.push(new Int8Array(enc.flush()));
    return new Blob(out, { type: 'audio/mpeg' });
  }
  // Any container + codec Mediabunny can write, from an AudioBuffer.
  async function encoded(buf, ext, codec) {
    const M = await lib();
    if (!(await M.canEncodeAudio(codec))) throw new Error(`this browser cannot encode ${codec.toUpperCase()}; pick another format`);
    const format = { wav: () => new M.WavOutputFormat(), m4a: () => new M.Mp4OutputFormat({ fastStart: 'in-memory' }), aac: () => new M.AdtsOutputFormat(), ogg: () => new M.OggOutputFormat(), webm: () => new M.WebMOutputFormat() }[ext]();
    const output = new M.Output({ format, target: new M.BufferTarget() });
    const src = new M.AudioBufferSource({ codec, bitrate: 192e3 });
    output.addAudioTrack(src);
    await output.start();
    await src.add(buf); src.close();
    await output.finalize();
    return new Blob([output.target.buffer], { type: format.mimeType || 'application/octet-stream' });
  }

  async function exportAudio(progress) {
    const [, , ext, how] = AUDIO.find(a => a[0] === audioFmt), p = L.project, spb = L.spb();
    const loop = range === 'loop' && p.loop.on;
    const opts = loop ? { from: p.loop.start * spb, dur: (p.loop.end - p.loop.start) * spb } : {};
    if (how === 'opus') opts.sampleRate = 48000; // the Opus encoder only takes 48 kHz
    progress(0, 'Rendering the mix…');
    const buf = await E.renderBuffer(opts);
    progress(0.5, 'Encoding…');
    let blob;
    if (how === 'aiff') blob = new Blob([aiff(buf)], { type: 'audio/aiff' });
    else if (how.startsWith('mp3')) blob = await mp3(buf, +how.split(':')[1], f => progress(0.5 + f / 2, 'Encoding MP3…'));
    else if (how === 'pcm-s16') blob = new Blob([L.wav(buf)], { type: 'audio/wav' });
    else blob = await encoded(buf, ext, how);
    return [blob, `${fileName()}${loop ? ' (loop)' : ''}.${ext}`];
  }

  // ---------- video: copy the picture as-is when the container allows it, otherwise re-encode; add the new mix ----------
  async function exportVideo(progress) {
    const v = L.video, m = L.project.video, file = v && v.file();
    if (!m || !file) throw new Error('add a video first (File, Add video to score)');
    const M = await lib();
    progress(0, 'Reading the video…');
    const input = new M.Input({ source: new M.BlobSource(file), formats: M.ALL_FORMATS });
    const vt = await input.getPrimaryVideoTrack();
    if (!vt) throw new Error('no picture found in that file');
    const dur = (await input.computeDuration()) || m.dur;
    const format = { mp4: () => new M.Mp4OutputFormat({ fastStart: 'in-memory' }), mov: () => new M.MovOutputFormat({ fastStart: 'in-memory' }), webm: () => new M.WebMOutputFormat(), mkv: () => new M.MkvOutputFormat() }[videoFmt]();

    // MP4 and MOV are promised to play everywhere, so only H.264/H.265 pictures are copied into them; others are re-encoded to H.264
    const apple = videoFmt === 'mp4' || videoFmt === 'mov', vcodecs = format.getSupportedVideoCodecs();
    const copy = apple ? ['avc', 'hevc'].includes(vt.codec) : vcodecs.includes(vt.codec);
    let vcodec = vt.codec;
    if (!copy) { vcodec = null; for (const c of apple ? ['avc', ...vcodecs] : vcodecs) if (vcodecs.includes(c) && await M.canEncodeVideo(c)) { vcodec = c; break; } }
    if (!vcodec) throw new Error('this browser cannot encode video for that format; try MP4 or WebM');
    let acodec = null;
    for (const c of format.getSupportedAudioCodecs().filter(c => ['aac', 'opus'].includes(c))) if (await M.canEncodeAudio(c)) { acodec = c; break; }
    if (!acodec) throw new Error('this browser cannot encode audio for that format');

    // the film's own sound goes into the mix at its Film sound level
    progress(0.02, 'Mixing the music…');
    let film = null;
    try { film = { buffer: await E.decode(await file.arrayBuffer()), gain: m.vol }; } catch {
      try {
        const at = await input.getPrimaryAudioTrack();
        if (at) {
          const parts = []; for await (const { buffer } of new M.AudioBufferSink(at).buffers()) parts.push(buffer);
          if (parts.length) {
            const len = parts.reduce((n, b) => n + b.length, 0), all = new AudioBuffer({ length: len, numberOfChannels: parts[0].numberOfChannels, sampleRate: parts[0].sampleRate });
            let o = 0; for (const b of parts) { for (let c = 0; c < all.numberOfChannels; c++) all.copyToChannel(b.getChannelData(Math.min(c, b.numberOfChannels - 1)), c, o); o += b.length; }
            film = { buffer: all, gain: m.vol };
          }
        }
      } catch { /* no usable film sound */ }
    }
    const mix = await E.renderBuffer({ from: m.offset, dur, sampleRate: acodec === 'opus' ? 48000 : 44100, film, allowEmpty: true });

    const output = new M.Output({ format, target: new M.BufferTarget() });
    const px = vt.displayWidth * vt.displayHeight;
    const vsrc = copy ? new M.EncodedVideoPacketSource(vcodec) : new M.VideoSampleSource({ codec: vcodec, bitrate: Math.max(2e6, Math.min(16e6, px * 4)) });
    const asrc = new M.AudioBufferSource({ codec: acodec, bitrate: 192e3 });
    output.addVideoTrack(vsrc, { rotation: vt.rotation });
    output.addAudioTrack(asrc);
    await output.start();
    const say = copy ? 'Copying the picture…' : 'Re-encoding the picture for this format…';
    const pumpVideo = async () => {
      if (copy) {
        const cfg = await vt.getDecoderConfig();
        let first = true;
        for await (const pkt of new M.EncodedPacketSink(vt).packets()) {
          if (cancelled) throw new Error('cancelled');
          await vsrc.add(pkt, first ? { decoderConfig: cfg } : undefined); first = false;
          progress(0.1 + 0.85 * Math.min(1, pkt.timestamp / dur), say);
        }
      } else {
        for await (const s of new M.VideoSampleSink(vt).samples()) {
          if (cancelled) { s.close(); throw new Error('cancelled'); }
          await vsrc.add(s); progress(0.1 + 0.85 * Math.min(1, s.timestamp / dur), say); s.close();
        }
      }
      vsrc.close();
    };
    await Promise.all([pumpVideo(), (async () => { await asrc.add(mix); asrc.close(); })()]);
    progress(0.97, 'Finishing the file…');
    await output.finalize();
    return [new Blob([output.target.buffer], { type: format.mimeType }), `${fileName()}.${videoFmt}`];
  }

  // ---------- dialog ----------
  const dlg = document.createElement('dialog');
  dlg.id = 'exp';
  document.body.append(dlg);
  function draw() {
    const p = L.project, hasVideo = L.video && L.video.has(), midiable = p.tracks.some(t => t.type !== 'audio' && t.clips.length);
    if (kind === 'video' && !hasVideo) kind = 'audio';
    const opt = (list, cur) => list.map(([v, s]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(s)}</option>`).join('');
    dlg.innerHTML = `<h2>Export</h2>
      <div class="fb-kinds">
        <button type="button" data-kind="audio" class="${kind === 'audio' ? 'on' : ''}">Song audio</button>
        <button type="button" data-kind="midi" class="${kind === 'midi' ? 'on' : ''}"${midiable ? '' : ' disabled'}>MIDI notes</button>
        <button type="button" data-kind="video" class="${kind === 'video' ? 'on' : ''}"${hasVideo ? '' : ' disabled title="Add a video first (File, Add video to score)"'}>Video with music</button>
      </div>
      ${kind === 'audio' ? `
        <label class="prm sel2 ex-row"><span>Format</span><select data-x="audioFmt">${opt(AUDIO.map(a => [a[0], a[1]]), audioFmt)}</select></label>
        <label class="prm sel2 ex-row"><span>What</span><select data-x="range">${opt([['song', 'The whole song'], ...(p.loop.on ? [['loop', `The loop (bars ${p.loop.start / 4 + 1} to ${p.loop.end / 4 + 1})`]] : [])], range)}</select></label>
        <p class="fb-how">Rendered straight to a file, much faster than playing the song. WAV and AIFF are full quality for editing; MP3, AAC and Opus are small files for sharing.</p>`
      : kind === 'midi' ? `<p class="fb-how">Saves the notes of every synth and drum track as a standard MIDI file, with instruments and tempo, for other music programs. Recorded audio is not part of MIDI.</p>`
      : `<label class="prm sel2 ex-row"><span>Format</span><select data-x="videoFmt">${opt(VIDEO, videoFmt)}</select></label>
        <p class="fb-how">The film's picture is copied as it is whenever the format allows, so it keeps its quality and the export takes seconds; otherwise it is re-encoded. The sound is your mix plus the film's own sound at its Film sound level.</p>`}
      <p class="ex-status"></p>
      <div class="fb-foot"><button type="button" data-a="close">${busy ? 'Stop' : 'Cancel'}</button><button type="button" data-a="go" class="strong"${busy ? ' disabled' : ''}>Export</button></div>`;
  }
  const status = (f, msg) => { const s = dlg.querySelector('.ex-status'); if (s) s.innerHTML = `<i style="--f:${Math.round(f * 100)}%"></i>${esc(msg)} ${Math.round(f * 100)}%`; };
  async function run() {
    busy = true; cancelled = false; draw();
    try {
      let blob, name;
      if (kind === 'midi') { L.files.exportMidi(); busy = false; dlg.close(); return; }
      [blob, name] = await (kind === 'video' ? exportVideo(status) : exportAudio(status));
      L.download(blob, name);
      busy = false; dlg.close();
      L.toast(`Exported ${name} (${(blob.size / 1048576).toFixed(1)} MB)`, 6000);
    } catch (err) {
      busy = false; draw();
      const fallback = kind === 'video' && err.message !== 'cancelled' && !/add a video/.test(err.message);
      dlg.querySelector('.ex-status').textContent = err.message === 'cancelled' ? 'Stopped.' : 'Export failed: ' + err.message + (fallback ? '. You can still record it by playing it through once:' : '');
      if (fallback) { const b = document.createElement('button'); b.textContent = 'Record in real time'; b.onclick = () => { dlg.close(); L.video.exportVideo(); }; dlg.querySelector('.ex-status').append(' ', b); }
    }
  }
  dlg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.kind && !busy) { kind = b.dataset.kind; draw(); }
    else if (b.dataset.a === 'close') { if (busy) cancelled = true; else dlg.close(); }
    else if (b.dataset.a === 'go' && !busy) run();
  });
  dlg.addEventListener('change', e => { const k = e.target.dataset.x; if (k) { if (k === 'audioFmt') audioFmt = e.target.value; if (k === 'videoFmt') videoFmt = e.target.value; if (k === 'range') range = e.target.value; } });
  dlg.addEventListener('cancel', e => { if (busy) { e.preventDefault(); cancelled = true; } });

  function open(k) { if (k) kind = k; draw(); dlg.showModal(); }
  $('#b-export').onclick = () => open();
  return { open, lib };
})();
