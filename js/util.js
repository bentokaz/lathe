'use strict';
const L = window.L = {};

L.$ = (s, r = document) => r.querySelector(s);
L.$$ = (s, r = document) => [...r.querySelectorAll(s)];
L.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
L.uid = () => Math.random().toString(36).slice(2, 9);
L.esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
L.pad = (n, w) => String(n).padStart(w, '0');

// Pointer drag helper: move(dx, dy, ev) while held, end(dx, dy, ev) on release.
L.drag = (e, move, end) => {
  const x0 = e.clientX, y0 = e.clientY;
  const mv = ev => move(ev.clientX - x0, ev.clientY - y0, ev);
  const up = ev => {
    removeEventListener('pointermove', mv);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
    if (end) end(ev.clientX - x0, ev.clientY - y0, ev);
  };
  addEventListener('pointermove', mv);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
};

// Double-click detection that survives the target element being re-rendered.
let dblKey = null, dblAt = 0;
L.dbl = key => {
  const now = performance.now(), hit = key === dblKey && now - dblAt < 350;
  dblKey = hit ? null : key; dblAt = now;
  return hit;
};

const NN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
L.pitchName = p => NN[p % 12] + (Math.floor(p / 12) - 1);
L.isBlack = p => [1, 3, 6, 8, 10].includes(p % 12);
L.CHORDS = { Major: [0, 4, 7], Minor: [0, 3, 7], '7th': [0, 4, 7, 10], 'Major 7th': [0, 4, 7, 11], 'Minor 7th': [0, 3, 7, 10], Sus2: [0, 2, 7], Sus4: [0, 5, 7], Diminished: [0, 3, 6], Augmented: [0, 4, 8], Power: [0, 7, 12] };
L.DRUMS = ['Kick', 'Snare', 'Clap', 'Hat', 'Open hat', 'Tom', 'Rim', 'Crash'];

const listeners = {};
L.on = (ev, fn) => (listeners[ev] ||= []).push(fn);
L.emit = (ev, a) => (listeners[ev] || []).forEach(f => f(a));

// Fader position (0..1) to linear gain; 0.8 is unity.
L.gain = v => (v * 1.25) ** 2;
L.db = g => g <= 0.0001 ? '-inf' : (20 * Math.log10(g)).toFixed(1);

L.toast = (msg, hold = 3500) => {
  const el = L.$('#status');
  el.textContent = msg;
  clearTimeout(L.toast.t);
  if (hold) L.toast.t = setTimeout(() => { el.textContent = ''; }, hold);
};

L.drawWave = (cv, buf, t0, t1, col) => {
  const w = cv.width, h = cv.height, x = cv.getContext('2d');
  x.clearRect(0, 0, w, h);
  if (!buf) return;
  const d = buf.getChannelData(0), sr = buf.sampleRate, per = (t1 - t0) * sr / w;
  x.fillStyle = col;
  for (let px = 0; px < w; px++) {
    const a = Math.max(0, Math.floor(t0 * sr + px * per)), b = Math.min(d.length, Math.floor(a + per) + 1);
    const st = Math.max(1, Math.floor((b - a) / 48));
    let lo = 0, hi = 0;
    for (let i = a; i < b; i += st) { const v = d[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    const y0 = (1 - hi) * h / 2, y1 = (1 - lo) * h / 2;
    x.fillRect(px, y0, 1, Math.max(1, y1 - y0));
  }
};

L.wav = buf => {
  const ch = buf.numberOfChannels, n = buf.length, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVEfmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const v = L.clamp(data[c][i], -1, 1);
    out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
  }
  return out.buffer;
};

L.download = (blob, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

// Line icons, 16px grid.
const ICONS = {
  undo: '<path d="M6 3 2 7l4 4"/><path d="M2 7h7.5a3.5 3.5 0 0 1 0 7H7"/>',
  redo: '<path d="M10 3l4 4-4 4"/><path d="M14 7H6.5a3.5 3.5 0 0 0 0 7H9"/>',
  trash: '<path d="M2.5 4h11M6 4V2h4v2M4 4l.7 10h6.6L12 4M6.7 7v4.5M9.3 7v4.5"/>',
  up: '<path d="M8 14V3M3.5 7.5 8 3l4.5 4.5"/>',
  down: '<path d="M8 2v11M3.5 8.5 8 13l4.5-4.5"/>',
  dup: '<rect x="5.5" y="5.5" width="8" height="8"/><path d="M10.5 2.5h-8v8"/>',
  cut: '<circle cx="4" cy="4" r="2"/><circle cx="4" cy="12" r="2"/><path d="M5.7 5.2 14 12M5.7 10.8 14 4"/>',
  gear: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.2v2.3M8 12.5v2.3M1.2 8h2.3M12.5 8h2.3M3.2 3.2l1.6 1.6M11.2 11.2l1.6 1.6M3.2 12.8l1.6-1.6M11.2 4.8l1.6-1.6"/><circle cx="8" cy="8" r="4.6"/>',
  caret: '<path d="M4 6l4 4 4-4"/>',
  loop: '<path d="M2.5 9V7.5a3 3 0 0 1 3-3h7M10.5 2.5l2 2-2 2M13.5 7v1.5a3 3 0 0 1-3 3h-7M5.5 13.5l-2-2 2-2"/>',
  flag: '<path d="M4 14.5V2M4 2.8h8.5l-2.2 3 2.2 3H4"/>',
  film: '<rect x="1.5" y="3" width="13" height="10"/><path d="M4.5 3v10M11.5 3v10M1.5 6.3h3M1.5 9.7h3M11.5 6.3h3M11.5 9.7h3"/>',
  rec: '<circle cx="8" cy="8" r="4.5" fill="currentColor"/>',
  browse: '<path d="M2 3h5M2 8h12M2 13h12M10 1.5v3M12.5 3H9"/>',
  // switches: drawn in outline; inside a button that is on, the .fl parts fill in (see the stylesheet)
  mute: '<path class="fl" d="M1.5 5.8h3L8.5 2.5v11l-4-3.3h-3z"/><path d="M10.8 5.8l3.9 4.4M14.7 5.8l-3.9 4.4"/>',
  solo: '<path d="M2.5 10.5V8a5.5 5.5 0 0 1 11 0v2.5"/><path class="fl" d="M2 9.5h3.2v5H2zM10.8 9.5H14v5h-3.2z"/>',
  auto: '<path d="M1.5 13 5.5 6.5l4 3.5 5-7.5"/><rect class="fl" x="4" y="5" width="3" height="3"/><rect class="fl" x="8" y="8.5" width="3" height="3"/>',
  user: '<circle cx="8" cy="5" r="3"/><path d="M2 15c.5-3.5 3-5 6-5s5.5 1.5 6 5"/>',
  play: '<path class="fl" d="M4.5 2.5v11l9-5.5z"/>',
  stop: '<rect class="fl" x="3.5" y="3.5" width="9" height="9"/>',
  dice: '<rect x="2" y="2" width="12" height="12"/><rect class="fl" x="4.5" y="4.5" width="2" height="2"/><rect class="fl" x="9.5" y="9.5" width="2" height="2"/><rect class="fl" x="7" y="7" width="2" height="2"/>',
  plus: '<path d="M8 2.5v11M2.5 8h11"/>',
  open: '<path d="M1.5 3.5h5l1.5 2h6.5v8h-13z"/>',
  info: '<circle cx="8" cy="8" r="6.5"/><path d="M8 7v4.5M8 4.5v.5"/>',
  pen: '<path d="M2.5 13.5l.6-3L10.5 3l2.5 2.5-7.4 7.4zM9 4.5l2.5 2.5"/>',
  cloud: '<path d="M4.5 12.5h7.5a3 3 0 0 0 .3-6A4.3 4.3 0 0 0 4 6.2a3.2 3.2 0 0 0 .5 6.3z"/>',
};
L.icon = n => `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${ICONS[n]}</svg>`;

// In-app stand-ins for confirm() and prompt(), styled like the rest of Lathe.
// ask(html, ok) resolves true or false; askText(label, value) resolves the text, or null if cancelled.
function modal(html, value, focus) {
  return new Promise(res => {
    const d = document.createElement('dialog');
    d.className = 'ask';
    d.innerHTML = html;
    document.body.append(d);
    const done = v => { d.close(); d.remove(); res(v); };
    d.addEventListener('cancel', e => { e.preventDefault(); done(value('0')); });
    d.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) done(value(b.dataset.v)); });
    d.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); done(value('1')); } });
    d.showModal();
    focus(d);
  });
}
L.ask = (html, ok = 'OK', cancel = 'Cancel') => modal(
  `<p>${html}</p><div class="fb-foot"><button data-v="0">${cancel}</button><button data-v="1" class="strong">${ok}</button></div>`,
  v => v === '1', d => d.querySelector('.strong').focus());
L.askText = (label, value = '', ok = 'OK') => {
  let inp;
  return modal(
    `<label class="ask-l"><span>${label}</span><input type="text" spellcheck="false"></label><div class="fb-foot"><button data-v="0">Cancel</button><button data-v="1" class="strong">${ok}</button></div>`,
    v => v === '1' ? inp.value.trim() || null : null,
    d => { inp = d.querySelector('input'); inp.value = value; inp.select(); });
};

// Typing-keyboard layout: key code -> [semitone above the keyboard octave, label].
L.KEYMAP = { KeyA: [0, 'A'], KeyW: [1, 'W'], KeyS: [2, 'S'], KeyE: [3, 'E'], KeyD: [4, 'D'], KeyF: [5, 'F'], KeyT: [6, 'T'], KeyG: [7, 'G'], KeyY: [8, 'Y'], KeyH: [9, 'H'], KeyU: [10, 'U'], KeyJ: [11, 'J'], KeyK: [12, 'K'], KeyO: [13, 'O'], KeyL: [14, 'L'], KeyP: [15, 'P'], Semicolon: [16, ';'] };
