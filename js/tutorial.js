'use strict';
// Guided tutorial: each step points at a control and advances when the action is actually done.
L.tour = (() => {
  const { $, clamp, pad } = L, E = L.engine;
  let played = 0;
  const noteOn = E.noteOn;
  E.noteOn = (...a) => { played++; return noteOn(...a); };

  const selTrack = () => L.trackById(L.sel.track);
  const clipCount = () => L.project.tracks.reduce((n, t) => n + t.clips.length, 0);
  const fxCount = () => L.project.tracks.reduce((n, t) => n + Object.values(t.fx).filter(f => f.on).length, 0);
  const openClip = () => { const r = L.clipById(L.sel.clip); return r && r.track.type !== 'audio' ? r.clip : null; };

  let pads = 0;
  const padFn = L.perf.pad;
  L.perf.pad = (...a) => { pads++; return padFn(...a); };
  // how many places in the open clip have three or more notes starting together
  const stacks = () => { const c = openClip(); if (!c) return 0; const n = {}; c.notes.forEach(x => { const k = x.s.toFixed(3); n[k] = (n[k] || 0) + 1; }); return Object.values(n).filter(v => v >= 3).length; };

  // target: selector to outline. clip: scroll container to crop the outline to. enter(): runs when the step opens.
  // base(): snapshot on entry. done(base): finished? skipIf(): step does not apply right now.
  const STEPS = [
    { title: 'Hear the demo', target: '#b-play',
      body: 'Press <kbd>Space</kbd> or the play button. The coloured line is the playhead; it sweeps across the timeline as the song plays.',
      done: () => E.playing },
    { title: 'Pause and rewind', target: '#b-home',
      body: 'Press <kbd>Space</kbd> again to pause, then <kbd>Enter</kbd> to send the playhead back to the start.',
      done: () => !E.playing && L.pos === (L.project.loop.on ? L.project.loop.start : 0) },

    { title: 'Pick a kind of music', target: '#guide .g-top', enter: () => L.showTab('guide'),
      body: 'This is the <b>Styles</b> tab. The list on the left starts with the most popular kinds of music; the play button next to each one lets you hear an example first. Choose one and press <b>Use this style</b>. It sets the key and tempo and adds the right instruments as new tracks.',
      base: () => L.project.guide, done: b => !!L.project.guide && (L.project.guide !== b || !b) },
    { title: 'Let it write a backing', target: '#guide .g-prog', enter: () => L.showTab('guide'),
      body: 'Each style lists chords that work together. Press a chord to hear it, then press <b>Write backing</b>: chords, bass and drums in this style land on the timeline, played a new way every time. Not keen? <b>New variation</b> swaps it for another take.',
      base: clipCount, done: b => clipCount() > b, skipIf: () => !L.project.guide },
    { title: 'Play along on the marked keys', target: '.kb-piano', enter: () => L.showTab('keys'),
      body: 'The <b>Keys</b> tab is a keyboard for the highlighted track. Keys with a dot belong to the style; the bigger coloured ones are the home note. Click them, or type <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <kbd>F</kbd> (white) and <kbd>W</kbd> <kbd>E</kbd> <kbd>T</kbd> (black). <kbd>Z</kbd> and <kbd>X</kbd> change octave. Play four notes.',
      base: () => played, done: b => played >= b + 4, skipIf: () => selTrack()?.type !== 'synth' },
    { title: 'Whole chords from one press', target: '.ch-pads', enter: () => L.showTab('keys'),
      body: 'These seven pads are the chords of the key; the underlined ones are the style\'s own. Click two of them, or press number keys <kbd>1</kbd> to <kbd>7</kbd>. To the left, <b>One key plays</b> turns every key into a chord and <b>Arpeggio</b> ripples whatever you hold.',
      base: () => pads, done: b => pads >= b + 2, skipIf: () => selTrack()?.type !== 'synth' },
    { title: 'Change the sound', target: '#sounds .lib-list', enter: () => L.showTab('sounds'),
      body: 'The <b>Sounds</b> tab holds 150 instruments; with a style in use its suggestions come first. Pick any one. Sampled instruments download the first time. The panel on the right then shows that sound\'s controls.',
      base: () => selTrack()?.inst?.preset, done: b => selTrack()?.type === 'synth' && selTrack().inst.preset !== b,
      skipIf: () => selTrack()?.type !== 'synth' },

    { title: 'Make a clip', target: '.trow.sel', clip: '#arr', enter: () => L.showTab('editor'),
      body: 'Notes live inside clips. <b>Double-click</b> an empty part of the highlighted track\'s lane to create a one-bar clip. It opens in the editor below.',
      base: clipCount, done: b => clipCount() > b && !!openClip() },
    { title: 'Draw some notes', target: '.ed-grid', clip: '.ed-scroll',
      body: 'Click in the grid to place a note; drag it to move, drag either end to stretch, right-click to erase. With a style in use, the lighter rows are the notes that fit. Place four notes.',
      done: () => (openClip()?.notes.length || 0) >= 4 },
    { title: 'Turn a note into a chord', target: '.ed-grid', clip: '.ed-scroll',
      body: 'Rest the pointer on any note for half a second. A strip of chord names appears above it: hover one to preview, click to stack that chord on the note.',
      base: stacks, done: b => stacks() > b, skipIf: () => !openClip() || selTrack()?.type !== 'synth' },
    { title: 'Loop a section', target: '#ruler', clip: '#arr',
      body: 'Drag along the <b>thin strip at the very top</b> of the bar ruler to mark a loop, over your new clip for instance. Clicking lower down, on the bar numbers, moves the playhead instead.',
      base: () => JSON.stringify(L.project.loop), done: b => L.project.loop.on && JSON.stringify(L.project.loop) !== b },
    { title: 'Open the mixer', target: '[data-tab="mixer"]',
      body: 'Press play to hear the loop go round. Then switch the bottom panel to the <b>Mixer</b> using the tab on its left edge.',
      done: () => !$('#mixer').hidden },
    { title: 'Switch on an effect', target: '.strip.sel', clip: '#mixer',
      body: 'Every strip has a fader, pan, mute (speaker) and solo (headphones); filled in means on. The six small buttons are effects: <b>eq</b>, <b>di</b>stortion, <b>co</b>mpressor, <b>ch</b>orus, <b>de</b>lay, <b>re</b>verb. Turn one on. Its settings appear in the right-hand panel.',
      base: fxCount, done: b => fxCount() !== b },

    { title: 'Draw a change over time', target: '.trow.sel .sw-auto', clip: '#arr',
      body: 'Press the line button on the highlighted track. Pick what to change under the track name (<b>Volume</b>, <b>Pan</b>, <b>Filter</b>, <b>Reverb</b> or <b>Echo</b>), then click in the lane to add points and drag them: a filter that opens over four bars is a classic build-up.',
      base: () => JSON.stringify(L.project.tracks.map(t => t.auto || {})), done: b => JSON.stringify(L.project.tracks.map(t => t.auto || {})) !== b && L.project.tracks.some(t => t.auto && Object.values(t.auto).some(p => p.length)) },
    { title: 'Score a video (optional)', target: '#m-file',
      body: 'Open <b>File</b> and choose <b>Add video to score</b> (or drop a video file on the timeline) and the film appears top right with a thumbnail strip above the tracks. It follows the playhead, the flag button drops markers on moments you want to hit, and <b>File, Export</b> saves it with your music. No video to hand? Press <b>Skip</b>.',
      done: () => !!L.project.video },
    { title: 'That is the whole loop', target: '#m-file',
      body: 'Pick a style, write clips, arrange, mix, then <b>File, Export</b> (audio, MIDI or video). Every change saves by itself; <b>File, My songs</b> lists your songs (and keeps them online if you sign in), and <b>File, Save project file</b> writes a file you can keep. <b>R</b> records what you play. The gear menu lists every shortcut and replays this tutorial.',
      last: true },
  ];

  const card = document.createElement('aside'), ring = document.createElement('div');
  card.id = 'tour'; ring.id = 'tour-ring'; card.hidden = ring.hidden = true;
  document.body.append(ring, card);
  let i = -1, base, timer = 0, advancing = 0;

  function show() {
    const s = STEPS[i];
    card.innerHTML = `<div class="tr-no">${pad(i + 1, 2)}<small>/ ${STEPS.length}</small></div>
      <h2>${s.title}</h2><p>${s.body}</p>
      <div class="tr-foot"><span class="tr-state"></span>
        ${i ? '<button data-t="back">Back</button>' : ''}
        ${s.last ? '<button data-t="end" class="strong">Finish</button>' : '<button data-t="skip">Skip</button><button data-t="end">End tutorial</button>'}
      </div>`;
    if (s.enter) s.enter();
    base = s.base ? s.base() : null;
    place();
  }

  function place() {
    const s = STEPS[i], el = $(s.target);
    let r = el && el.getBoundingClientRect();
    if (r && s.clip && $(s.clip)) {
      const c = $(s.clip).getBoundingClientRect();
      const l = Math.max(r.left, c.left), t = Math.max(r.top, c.top);
      r = { left: l, top: t, width: Math.min(r.right, c.right) - l, height: Math.min(r.bottom, c.bottom) - t };
    }
    const ok = r && r.width > 0 && r.height > 0;
    ring.hidden = !ok;
    const W = card.offsetWidth, H = card.offsetHeight, m = 12, vw = innerWidth, vh = innerHeight;
    let x = vw - W - m, y = vh - H - m;
    if (ok) {
      ring.style.cssText = `left:${r.left - 3}px;top:${r.top - 3}px;width:${r.width + 6}px;height:${r.height + 6}px`;
      const R = r.left + r.width, B = r.top + r.height;
      if (B + m + H <= vh) { x = r.left; y = B + m; }
      else if (r.top - m - H >= 0) { x = r.left; y = r.top - m - H; }
      else if (R + m + W <= vw) { x = R + m; y = r.top; }
      else if (r.left - m - W >= 0) { x = r.left - m - W; y = r.top; }
    }
    card.style.left = clamp(x, m, vw - W - m) + 'px';
    card.style.top = clamp(y, m, vh - H - m) + 'px';
  }

  function go(n) {
    clearTimeout(advancing); advancing = 0;
    i = n;
    while (STEPS[i] && STEPS[i].skipIf && STEPS[i].skipIf()) i++;
    if (i >= STEPS.length) return end();
    show();
  }

  function poll() {
    const s = STEPS[i]; if (!s) return;
    place();
    if (advancing || !s.done || !s.done(base)) return;
    card.querySelector('.tr-state').textContent = 'Done';
    card.classList.add('ok');
    advancing = setTimeout(() => { card.classList.remove('ok'); go(i + 1); }, 900);
  }

  function start() {
    if ($('#help').open) $('#help').close();
    card.hidden = false; L.showTab('editor');
    go(0);
    clearInterval(timer); timer = setInterval(poll, 150);
  }
  function end() {
    clearInterval(timer); clearTimeout(advancing); advancing = 0; i = -1;
    card.hidden = ring.hidden = true; card.classList.remove('ok');
    try { localStorage.setItem('lathe.toured', '1'); } catch { /* storage blocked */ }
  }

  card.addEventListener('click', e => {
    const t = e.target.dataset.t;
    if (t === 'end') end(); else if (t === 'skip') go(i + 1); else if (t === 'back') go(i - 1);
  });
  $('#b-tour').onclick = start;

  return { start, end };
})();
