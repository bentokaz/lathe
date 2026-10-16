'use strict';
// Styles: pick a kind of music and Lathe sets the key and tempo, adds fitting instruments,
// marks the notes and chords that belong, and can write a starter chord pattern.
L.guide = (() => {
  const { $, esc } = L, E = L.engine, P = L.perf;
  const host = $('#guide');
  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // inst: 'gm:<name>' | 'kit:<name>' | 'synth:<preset>' with a role. prog: scale degrees (0 = the home chord), one bar each.
  const S = (id, genre, name, blurb, key, scale, bpm, inst, prog, sev) => ({ id, genre, name, blurb, key, scale, bpm, sev: !!sev, inst: inst.map(s => { const [k, role] = s.split('|'); return { k, role }; }), prog });
  const STYLES = [
    S('dream', 'Indie', 'Dream pop', 'Slow, washed out and bright. Hold big chords on the pad, pick their notes one at a time on the guitar (Keys tab: Arpeggio up, 1/8), keep the tune to a few long notes and leave the reverb high.', 4, 'Major', 84,
      ['combo:Dream pad|Chords', 'combo:Bedroom bass|Bass', 'combo:Hazy voices|Melody', 'combo:Dream guitar|Melody', 'combo:Glass bells|Colour', 'kit:Roomy|Drums'], [[0, 3, 0, 3], [5, 3, 0, 4]], true),
    S('bedroom', 'Indie', 'Bedroom pop', 'Recorded on a laptop at 2 am. Wobbly keys play two soft chords a bar, the bass stays simple, the drum machine stays small. Write a tune you could hum, and do not polish it.', 0, 'Major', 96,
      ['combo:Tape keys|Chords', 'combo:Bedroom bass|Bass', 'combo:Mellow lead|Melody', 'combo:Dream guitar|Colour', 'combo:Hazy voices|Colour', 'kit:Bedroom machine|Drums'], [[3, 2, 1, 0], [0, 5, 3, 4]], true),
    S('indie', 'Indie', 'Indie pop', 'Bright and bouncy. Strum the guitar on every eighth note, let the bass follow the chord root, keep the drums straight, and put a catchy bell or lead line on top.', 7, 'Major', 124,
      ['combo:Jangle guitar|Chords', 'gm:electric_bass_pick|Bass', 'combo:Glass bells|Melody', 'combo:Mellow lead|Melody', 'combo:Dream pad|Colour', 'kit:Standard|Drums'], [[0, 4, 5, 3], [0, 3, 5, 4]]),
    S('shoegaze', 'Indie', 'Shoegaze haze', 'A wall of fuzzy guitar with voices buried inside it. Let chords ring across the whole bar and keep everything a little too loud and a little blurred.', 2, 'Major', 92,
      ['combo:Shoegaze wall|Chords', 'combo:Bedroom bass|Bass', 'combo:Hazy voices|Melody', 'combo:Dream guitar|Colour', 'kit:Roomy|Drums'], [[0, 3, 5, 3], [0, 2, 3, 3]]),

    S('bossa', 'Elevator and lobby', 'Lobby bossa', 'Hotel lobby at 3 pm. Play the chords short and off the beat, bass on the root then the fifth, rim clicks instead of a snare, and a vibraphone tune that never hurries.', 5, 'Major', 126,
      ['gm:electric_piano_1|Chords', 'gm:acoustic_bass|Bass', 'gm:vibraphone|Melody', 'gm:acoustic_guitar_nylon|Colour', 'gm:glockenspiel|Colour', 'kit:Tight|Drums'], [[1, 4, 0, 5], [0, 5, 1, 4]], true),
    S('hold', 'Elevator and lobby', 'Please hold', 'Your call is important to us. Smooth electric piano, a sliding bass and a soft sax line that repeats just often enough to notice.', 3, 'Major', 92,
      ['gm:electric_piano_2|Chords', 'gm:fretless_bass|Bass', 'gm:soprano_sax|Melody', 'gm:pad_2_warm|Colour', 'gm:celesta|Colour', 'kit:Low and slow|Drums'], [[0, 3, 2, 5], [1, 4, 0, 0]], true),
    S('store', 'Elevator and lobby', 'Department store', 'Second floor, homewares. Organ chords, a flute tune and a polite little beat. End each phrase with a run of bells for full effect.', 0, 'Major', 108,
      ['gm:drawbar_organ|Chords', 'gm:acoustic_bass|Bass', 'gm:flute|Melody', 'gm:string_ensemble_1|Colour', 'gm:glockenspiel|Colour', 'kit:Standard|Drums'], [[0, 5, 1, 4], [3, 4, 2, 5]], true),
    S('weather', 'Elevator and lobby', 'Local forecast', 'Five-day outlook. Jazz guitar noodling up and down the scale over a warm pad. For the proper cheese, move everything up one key for the last part.', 7, 'Major', 100,
      ['gm:electric_piano_1|Chords', 'gm:electric_bass_finger|Bass', 'gm:electric_guitar_jazz|Melody', 'gm:pad_2_warm|Colour', 'gm:vibraphone|Colour', 'kit:Tight|Drums'], [[1, 4, 0, 5], [0, 2, 3, 4]], true),

    S('garage', 'Rock', 'Garage rock', 'Loud, simple, fast. Three chords on a crunchy guitar, bass on the root in eighth notes, snare on beats two and four.', 9, 'Mixolydian', 148,
      ['gm:overdriven_guitar|Chords', 'gm:electric_bass_pick|Bass', 'gm:distortion_guitar|Melody', 'gm:rock_organ|Colour', 'kit:Standard|Drums'], [[0, 3, 4, 3], [0, 6, 3, 0]]),
    S('ballad', 'Rock', 'Power ballad', 'Starts with piano, ends with everything. Slow chords, a guitar tune that holds its long notes, big drums.', 7, 'Major', 72,
      ['gm:acoustic_grand_piano|Chords', 'gm:electric_bass_finger|Bass', 'gm:distortion_guitar|Melody', 'gm:string_ensemble_1|Colour', 'kit:Roomy|Drums'], [[0, 4, 5, 3], [5, 3, 0, 4]]),
    S('boombap', 'Hip-hop and electronic', 'Boom bap', 'Dusty keys looped over a heavy kick and snare. Two or four bars repeated; the groove matters more than the notes.', 2, 'Minor', 90,
      ['gm:electric_piano_1|Chords', 'synth:Sub|Bass', 'gm:vibraphone|Melody', 'gm:string_ensemble_2|Colour', 'kit:Low and slow|Drums'], [[0, 3, 0, 4], [0, 5, 3, 4]], true),
    S('trap', 'Hip-hop and electronic', 'Trap', 'Dark bells over a long sub bass. Leave gaps in the tune and let the hi-hats do the busy work.', 1, 'Minor', 140,
      ['gm:pad_2_warm|Chords', 'synth:Sub|Bass', 'gm:music_box|Melody', 'gm:choir_aahs|Colour', 'kit:Deep 808|Drums'], [[0, 5, 0, 4], [0, 3, 5, 4]]),
    S('club', 'Hip-hop and electronic', 'House', 'Kick on every beat, chord stabs between the beats, a bass line that bounces. Build it up by adding one part at a time.', 9, 'Minor', 124,
      ['synth:Stab|Chords', 'gm:synth_bass_1|Bass', 'synth:Pluck|Melody', 'gm:pad_3_polysynth|Colour', 'kit:Gated|Drums'], [[0, 5, 2, 6], [0, 3, 5, 4]], true),
    S('trio', 'Jazz and soul', 'Late-night trio', 'Piano, upright bass and brushes. Walk the bass through the chord notes and play the tune a little behind the beat.', 10, 'Major', 110,
      ['gm:acoustic_grand_piano|Chords', 'gm:acoustic_bass|Bass', 'gm:muted_trumpet|Melody', 'gm:vibraphone|Colour', 'kit:Tight|Drums'], [[1, 4, 0, 5], [0, 5, 1, 4]], true),
    S('soul', 'Jazz and soul', 'Slow jam', 'Warm electric piano, a bass that slides and a tune full of small bends. Keep the drums soft and late.', 5, 'Dorian', 76,
      ['gm:electric_piano_2|Chords', 'gm:electric_bass_finger|Bass', 'gm:alto_sax|Melody', 'combo:Hazy voices|Colour', 'kit:Low and slow|Drums'], [[0, 3, 0, 3], [0, 6, 3, 4]], true),

    S('melancholy', 'Orchestra', 'Melancholy orchestra', 'Slow strings and a lonely piano. Hold chords for a whole bar and leave space between melody notes.', 2, 'Minor', 66,
      ['gm:string_ensemble_1|Chords', 'gm:cello|Bass', 'gm:acoustic_grand_piano|Melody', 'gm:orchestral_harp|Colour', 'gm:french_horn|Melody'], [[0, 5, 2, 6], [0, 3, 5, 4]]),
    S('heroic', 'Orchestra', 'Heroic adventure', 'Bright brass over driving strings. Melodies that leap upward sound brave.', 2, 'Major', 124,
      ['gm:string_ensemble_1|Chords', 'gm:contrabass|Bass', 'gm:trumpet|Melody', 'gm:brass_section|Colour', 'gm:timpani|Colour'], [[0, 4, 5, 3], [0, 3, 4, 4]]),
    S('mystery', 'Orchestra', 'Midnight mystery', 'Shivering strings and plucked footsteps. Short, quiet notes with gaps do the work.', 9, 'Harmonic minor', 84,
      ['gm:tremolo_strings|Chords', 'gm:contrabass|Bass', 'gm:pizzicato_strings|Melody', 'gm:celesta|Melody', 'gm:clarinet|Colour'], [[0, 3, 4, 0], [0, 5, 3, 4]]),
    S('tender', 'Orchestra', 'Tender morning', 'Warm piano with strings underneath and a flute on top. Gentle and hopeful.', 5, 'Major', 76,
      ['gm:acoustic_grand_piano|Chords', 'gm:cello|Bass', 'gm:flute|Melody', 'gm:string_ensemble_2|Colour', 'gm:orchestral_harp|Colour'], [[0, 5, 3, 4], [0, 2, 3, 4]]),
    S('battle', 'Orchestra', 'Storm the gates', 'Fast, heavy and low. Repeat short notes on the strings and hit the drums on beat one.', 4, 'Minor', 150,
      ['gm:string_ensemble_1|Chords', 'gm:contrabass|Bass', 'gm:brass_section|Melody', 'gm:timpani|Colour', 'gm:taiko_drum|Colour'], [[0, 5, 6, 0], [0, 6, 5, 4]]),

    S('dunes', 'Game', 'Sand dunes', 'Desert level. The second note of this scale sits right next to the home note; sliding between them gives the sound.', 4, 'Phrygian dominant', 98,
      ['gm:string_ensemble_1|Chords', 'gm:acoustic_bass|Bass', 'gm:sitar|Melody', 'gm:shanai|Melody', 'gm:kalimba|Colour', 'gm:taiko_drum|Colour'], [[0, 1, 0, 6], [0, 3, 1, 0]]),
    S('chip', 'Game', '8-bit overworld', 'Square waves and a bouncing bass. Keep melodies quick and catchy, arpeggios everywhere.', 0, 'Major', 140,
      ['gm:lead_2_sawtooth|Chords', 'gm:synth_bass_1|Bass', 'gm:lead_1_square|Melody', 'synth:Chip|Melody', 'kit:Tight|Drums'], [[0, 4, 5, 3], [0, 3, 4, 0]]),
    S('forest', 'Game', 'Forest village', 'Friendly and a bit folky. A flute tune over strummed guitar.', 7, 'Mixolydian', 104,
      ['gm:acoustic_guitar_nylon|Chords', 'gm:acoustic_bass|Bass', 'gm:flute|Melody', 'gm:ocarina|Melody', 'gm:orchestral_harp|Colour'], [[0, 6, 3, 0], [0, 3, 6, 3]]),
    S('ice', 'Game', 'Ice cavern', 'Glassy bells over a cold pad. High, slow, lots of echo.', 9, 'Dorian', 78,
      ['gm:pad_7_halo|Chords', 'gm:fretless_bass|Bass', 'gm:celesta|Melody', 'gm:music_box|Melody', 'gm:glockenspiel|Colour'], [[0, 3, 0, 6], [0, 2, 3, 6]]),
    S('boss', 'Game', 'Final boss', 'Loud guitar, organ and no rest. Keep the bass hammering the home note.', 0, 'Harmonic minor', 164,
      ['gm:distortion_guitar|Chords', 'gm:electric_bass_pick|Bass', 'gm:synth_brass_1|Melody', 'gm:rock_organ|Colour', 'kit:Standard|Drums'], [[0, 5, 4, 0], [0, 3, 4, 4]]),
    S('water', 'Game', 'Underwater ruins', 'Floating and unhurried. Let two chords rock back and forth.', 5, 'Lydian', 72,
      ['gm:pad_2_warm|Chords', 'gm:fretless_bass|Bass', 'gm:vibraphone|Melody', 'gm:orchestral_harp|Colour'], [[0, 1, 0, 1], [0, 4, 1, 0]]),

    S('chase', 'Film', 'Night chase', 'A pulsing synth bass that never stops, with stabs on top.', 6, 'Minor', 132,
      ['gm:pad_3_polysynth|Chords', 'gm:synth_bass_2|Bass', 'gm:lead_2_sawtooth|Melody', 'gm:string_ensemble_1|Colour', 'kit:Tight|Drums'], [[0, 5, 3, 4], [0, 6, 5, 6]]),
    S('wonder', 'Film', 'Wide open wonder', 'The raised fourth note of this scale is the "looking up at the sky" sound. Land on it.', 0, 'Lydian', 88,
      ['gm:string_ensemble_1|Chords', 'gm:contrabass|Bass', 'gm:french_horn|Melody', 'gm:acoustic_grand_piano|Melody', 'gm:celesta|Colour'], [[0, 1, 0, 4], [0, 1, 5, 4]]),
    S('room', 'Film', 'Empty room', 'Just a piano and a little air. Fewer notes than you think you need.', 9, 'Minor', 60,
      ['gm:acoustic_grand_piano|Chords', 'gm:cello|Bass', 'gm:pad_2_warm|Colour'], [[0, 5, 2, 6], [5, 6, 0, 0]]),
    S('house', 'Film', 'Something in the house', 'Dread. Two chords a semitone apart, a music box, and long silences.', 0, 'Phrygian', 70,
      ['gm:tremolo_strings|Chords', 'gm:contrabass|Bass', 'gm:music_box|Melody', 'gm:choir_aahs|Colour', 'gm:timpani|Colour'], [[0, 1, 0, 1], [0, 6, 1, 0]]),

    S('lofi', 'Chill and pop', 'Rainy window lo-fi', 'Soft electric piano and a lazy beat. Play a little late and a little quiet.', 2, 'Dorian', 78,
      ['gm:electric_piano_1|Chords', 'gm:acoustic_bass|Bass', 'gm:vibraphone|Melody', 'gm:electric_guitar_jazz|Colour', 'kit:Low and slow|Drums'], [[0, 3, 0, 3], [0, 6, 3, 0]]),
    S('pop', 'Chill and pop', 'Sunny pop', 'The four chords behind a thousand songs. Sing something over them.', 7, 'Major', 112,
      ['gm:acoustic_guitar_steel|Chords', 'gm:electric_bass_finger|Bass', 'gm:acoustic_grand_piano|Melody', 'gm:string_ensemble_2|Colour', 'kit:Standard|Drums'], [[0, 4, 5, 3], [5, 3, 0, 4]]),
    S('neon', 'Chill and pop', 'Neon drive', 'Eighties night drive: big pad, steady bass, saw lead.', 9, 'Minor', 104,
      ['gm:pad_3_polysynth|Chords', 'gm:synth_bass_1|Bass', 'gm:lead_2_sawtooth|Melody', 'gm:synth_brass_1|Colour', 'kit:Gated|Drums'], [[0, 5, 2, 6], [5, 6, 0, 0]]),
    S('folk', 'Chill and pop', 'Campfire folk', 'Strummed guitar, a harmonica tune and three easy chords.', 0, 'Major', 92,
      ['gm:acoustic_guitar_steel|Chords', 'gm:acoustic_bass|Bass', 'gm:harmonica|Melody', 'gm:banjo|Colour', 'gm:fiddle|Colour'], [[0, 3, 4, 0], [0, 5, 3, 4]]),
  ];
  const GENRES = [...new Set(STYLES.map(s => s.genre))];
  const byId = id => STYLES.find(s => s.id === id) || null;
  const active = () => byId(L.project.guide);
  let view = null, applied;

  // ---------- what the rest of the app asks ----------
  const scale = () => { const s = active(); return s ? { key: s.key, pcs: new Set(P.SCALES[s.scale].map(x => (x + s.key) % 12)), name: NOTE[s.key] + ' ' + s.scale.toLowerCase() } : null; };
  const degs = () => { const s = active(); return s ? [...new Set(s.prog.flat())] : []; };
  const sig = () => L.project.guide || '';
  const items = () => { const s = active(); return s ? s.inst.map(i => L.lib.byKey(i.k)).filter(Boolean) : null; };

  // ---------- tracks ----------
  const has = k => {
    const it = L.lib.byKey(k); if (!it) return null;
    return L.project.tracks.find(t => t.inst && (it.kind === 'combo' ? t.inst.preset === it.label : it.kind === 'gm' ? t.inst.sf === it.name : it.kind === 'kit' ? t.type === 'drums' && t.inst.preset === it.label : t.type === 'synth' && !t.inst.sf && t.inst.preset === it.label)) || null;
  };
  function addInst(k) {
    let t = has(k); if (t) return t;
    const it = L.lib.byKey(k);
    t = L.newTrack(it.kind === 'kit' ? 'drums' : 'synth', it.kind === 'kit' ? 'Drums' : it.label);
    L.lib.apply(t, it);
    L.project.tracks.push(t);
    return t;
  }

  function use(id) {
    const s = byId(id);
    E.reanchor();
    L.project.guide = id; L.project.bpm = s.bpm;
    s.inst.forEach(i => addInst(i.k));
    const mel = has((s.inst.find(i => i.role === 'Melody') || s.inst[0]).k);
    L.sel.track = mel.id; L.sel.clip = null;
    L.commit();
    L.toast(`${s.name}: ${NOTE[s.key]} ${s.scale.toLowerCase()}, ${s.bpm} BPM, ${s.inst.length} instruments ready`, 5000);
  }

  // Writes one progression as held chords (plus a root-note bass line and a plain beat where the style has them).
  function write(pi) {
    const s = active(); if (!s) return;
    const prog = s.prog[pi], sc = P.SCALES[s.scale], len = prog.length * 4;
    const chords = addInst(s.inst.find(i => i.role === 'Chords').k);
    // after whatever that track already has, and never before the playhead
    const start = Math.max(Math.floor(L.pos / 4) * 4, Math.ceil(Math.max(0, ...chords.clips.map(c => c.start + c.len)) / 4) * 4);
    const tone = (d, k) => s.key + sc[(d + k) % 7];
    const fold = (pc, lo) => lo + ((pc - lo) % 12 + 12) % 12;
    const names = P.chordsFor(s.key, s.scale, 4, s.sev);
    const clip = { id: L.uid(), name: prog.map(d => names[d].name).join(' '), start, len, notes: [] };
    prog.forEach((d, i) => (s.sev ? [0, 2, 4, 6] : [0, 2, 4]).forEach(k => clip.notes.push({ p: fold(tone(d, k), 53), s: i * 4, l: 3.9, v: 0.62 })));
    chords.clips.push(clip);
    const bassSpec = s.inst.find(i => i.role === 'Bass');
    if (bassSpec) addInst(bassSpec.k).clips.push({ id: L.uid(), name: 'Roots', start, len, notes: prog.flatMap((d, i) => [{ p: fold(tone(d, 0), 31), s: i * 4, l: 2.9, v: 0.8 }, { p: fold(tone(d, 0), 31), s: i * 4 + 3, l: 0.9, v: 0.65 }]) });
    const drumSpec = s.inst.find(i => i.role === 'Drums');
    if (drumSpec) {
      const notes = [];
      for (let b = 0; b < len; b += 4) {
        [0, 2].forEach(x => notes.push({ p: 36, s: b + x, l: 0.25, v: 0.95 }));
        [1, 3].forEach(x => notes.push({ p: 37, s: b + x, l: 0.25, v: 0.8 }));
        for (let x = 0; x < 4; x += 0.5) notes.push({ p: 39, s: b + x, l: 0.25, v: x % 1 ? 0.4 : 0.6 });
      }
      addInst(drumSpec.k).clips.push({ id: L.uid(), name: 'Beat', start, len, notes });
    }
    L.sel.clip = null;
    L.commit();
    L.toast(`Written at bar ${start / 4 + 1}. Now play a melody over it using the marked keys`, 5000);
  }

  // ---------- panel ----------
  const nav = (s, act) =>  GENRES.map(g => `<h4>${g}</h4>` + STYLES.filter(x => x.genre === g).map(x => `<button data-style="${x.id}" class="${x === s ? 'on' : ''}">${x.name}${x === act ? '<small>in use</small>' : ''}</button>`).join('')).join('');
  function render() {
    // keep the chord pads on the style's key
    if (applied !== sig()) { applied = sig(); const s = active(); P.S.sev = !!(s && s.sev); if (s) { P.S.key = s.key; P.S.scale = s.scale; } }
    const act = active();
    if (!byId(view)) view = act ? act.id : STYLES[0].id;
    const s = byId(view), on = act === s, sc = new Set(P.SCALES[s.scale].map(x => (x + s.key) % 12));
    const chords = P.chordsFor(s.key, s.scale, 4, s.sev);
    host.innerHTML = `
      <div class="lib-side g-side"><nav>${nav(s, act)}</nav></div>
      <div class="lib-main g-main">
        <div class="g-top">
          <div><h2>${s.name}</h2><p>${s.blurb}</p></div>
          ${on ? '<button data-g="off">Stop using</button>' : '<button data-g="use" class="g-use">Use this style</button>'}
        </div>
        <div class="g-cols">
          <section>
            <h3>Key and tempo</h3>
            <div class="g-big">${NOTE[s.key]} ${s.scale.toLowerCase()}</div>
            <div class="g-scale">${NOTE.map((n, i) => `<i class="${i === s.key ? 'rt' : sc.has(i) ? 'in' : ''}">${n}</i>`).join('')}</div>
            <p class="g-note">${s.bpm} BPM. ${on ? 'These notes are marked on the Keys tab and in the editor: stay on them and nothing sounds wrong. The home note is in red.' : 'Using the style sets the tempo, adds the instruments and marks these notes on the keyboard and in the editor.'}</p>
          </section>
          <section>
            <h3>Instruments</h3>
            ${s.inst.map(i => { const it = L.lib.byKey(i.k), t = has(i.k); return `<div class="g-inst"><b>${it ? esc(it.label) : i.k}</b><small>${i.role}</small>${t ? `<button data-g="go" data-k="${i.k}" title="Select this track">On track</button>` : `<button data-g="add" data-k="${i.k}">Add</button>`}</div>`; }).join('')}
          </section>
          <section>
            <h3>Chords that work</h3>
            ${s.prog.map((pr, pi) => `<div class="g-prog">${pr.map(d => `<button class="g-ch" data-deg="${d}"><b>${chords[d].name}</b><small>${chords[d].roman}</small></button>`).join('')}${on ? `<button data-g="write" data-pi="${pi}" title="Put these chords, a bass line${s.inst.some(i => i.role === 'Drums') ? ' and a beat' : ''} into the song">Write into song</button>` : ''}</div>`).join('')}
            <p class="g-note">Press a chord to hear it. ${on ? 'The same chords are highlighted on the pads in the Keys tab (number keys 1 to 7).' : ''}</p>
          </section>
        </div>
      </div>`;
  }

  host.addEventListener('click', e => {
    const st = e.target.closest('[data-style]'), g = e.target.closest('[data-g]');
    if (st) { view = st.dataset.style; return render(); }
    if (!g) return;
    const a = g.dataset.g;
    if (a === 'use') use(view);
    else if (a === 'off') { L.project.guide = null; L.commit(); }
    else if (a === 'write') write(+g.dataset.pi);
    else if (a === 'add') { const t = addInst(g.dataset.k); L.sel.track = t.id; L.sel.clip = null; L.commit(); }
    else if (a === 'go') L.select(has(g.dataset.k).id, null);
  });
  host.addEventListener('pointerdown', e => {
    const b = e.target.closest('.g-ch'); if (!b) return;
    const s = byId(view), ps = P.chordsFor(s.key, s.scale, 4, s.sev)[+b.dataset.deg].pitches;
    const chordTrack = has(s.inst.find(i => i.role === 'Chords').k), sel = L.trackById(L.sel.track);
    const tid = (chordTrack || (sel && sel.type === 'synth' ? sel : L.project.tracks.find(t => t.type === 'synth')) || {}).id;
    if (!tid) return L.toast('Add a synth track to hear chords');
    ps.forEach(p => E.noteOn(p, 0.7, tid));
    const up = () => { removeEventListener('pointerup', up); removeEventListener('pointercancel', up); ps.forEach(p => E.noteOff(p)); };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });

  return { render, scale, degs, sig, items, addInst, STYLES };
})();
