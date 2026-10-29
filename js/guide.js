'use strict';
// Styles: pick a kind of music and Lathe sets the key and tempo, adds fitting instruments,
// marks the notes and chords that belong, plays a short preview, and can write a backing (chords, bass, drums)
// that is generated fresh each time, so two songs in the same style do not share one.
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
      ['gm:electric_piano_1|Chords', 'gm:acoustic_bass|Bass', 'gm:vibraphone|Melody', 'pluck:Nylon guitar|Colour', 'gm:glockenspiel|Colour', 'kit:Tight|Drums'], [[1, 4, 0, 5], [0, 5, 1, 4]], true),
    S('hold', 'Elevator and lobby', 'Please hold', 'Your call is important to us. Smooth electric piano, a sliding bass and a soft sax line that repeats just often enough to notice.', 3, 'Major', 92,
      ['gm:electric_piano_2|Chords', 'gm:fretless_bass|Bass', 'gm:soprano_sax|Melody', 'gm:pad_2_warm|Colour', 'gm:celesta|Colour', 'kit:Low and slow|Drums'], [[0, 3, 2, 5], [1, 4, 0, 0]], true),
    S('store', 'Elevator and lobby', 'Department store', 'Second floor, homewares. Organ chords, a flute tune and a polite little beat. End each phrase with a run of bells for full effect.', 0, 'Major', 108,
      ['gm:drawbar_organ|Chords', 'gm:acoustic_bass|Bass', 'gm:flute|Melody', 'gm:string_ensemble_1|Colour', 'gm:glockenspiel|Colour', 'kit:Standard|Drums'], [[0, 5, 1, 4], [3, 4, 2, 5]], true),
    S('weather', 'Elevator and lobby', 'Local forecast', 'Five-day outlook. Jazz guitar noodling up and down the scale over a warm pad. For the proper cheese, move everything up one key for the last part.', 7, 'Major', 100,
      ['gm:electric_piano_1|Chords', 'gm:electric_bass_finger|Bass', 'pluck:Jazz guitar|Melody', 'gm:pad_2_warm|Colour', 'gm:vibraphone|Colour', 'kit:Tight|Drums'], [[1, 4, 0, 5], [0, 2, 3, 4]], true),

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
      ['pluck:Nylon guitar|Chords', 'gm:acoustic_bass|Bass', 'gm:flute|Melody', 'gm:ocarina|Melody', 'gm:orchestral_harp|Colour'], [[0, 6, 3, 0], [0, 3, 6, 3]]),
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
      ['gm:electric_piano_1|Chords', 'gm:acoustic_bass|Bass', 'gm:vibraphone|Melody', 'pluck:Jazz guitar|Colour', 'kit:Low and slow|Drums'], [[0, 3, 0, 3], [0, 6, 3, 0]]),
    S('pop', 'Chill and pop', 'Sunny pop', 'The four chords behind a thousand songs. Sing something over them.', 7, 'Major', 112,
      ['pluck:Steel-string acoustic|Chords', 'gm:electric_bass_finger|Bass', 'gm:acoustic_grand_piano|Melody', 'gm:string_ensemble_2|Colour', 'kit:Standard|Drums'], [[0, 4, 5, 3], [5, 3, 0, 4]]),
    S('neon', 'Chill and pop', 'Neon drive', 'Eighties night drive: big pad, steady bass, saw lead.', 9, 'Minor', 104,
      ['gm:pad_3_polysynth|Chords', 'gm:synth_bass_1|Bass', 'gm:lead_2_sawtooth|Melody', 'gm:synth_brass_1|Colour', 'kit:Gated|Drums'], [[0, 5, 2, 6], [5, 6, 0, 0]]),
    S('uke', 'Chill and pop', 'Ukulele sunshine', 'Strum the ukulele on every eighth note (down on the beat, up in between), keep the bass simple and whistle the tune. Four chords and a smile.', 0, 'Major', 112,
      ['pluck:Ukulele|Chords', 'gm:acoustic_bass|Bass', 'gm:whistle|Melody', 'gm:glockenspiel|Colour', 'kit:Bedroom machine|Drums'], [[0, 4, 5, 3], [0, 5, 3, 4]]),
    S('folk', 'Chill and pop', 'Campfire folk', 'Strummed guitar, a harmonica tune and three easy chords.', 0, 'Major', 92,
      ['pluck:Steel-string acoustic|Chords', 'gm:acoustic_bass|Bass', 'gm:harmonica|Melody', 'gm:banjo|Colour', 'gm:fiddle|Colour'], [[0, 3, 4, 0], [0, 5, 3, 4]]),
  ];
  // Hand-ranked by how widely each kind of music is listened to; Lathe has no play counts to go on.
  const RANK = 'pop trap lofi club boombap indie bedroom garage ballad neon dream uke folk soul chip heroic melancholy chase shoegaze trio tender battle wonder forest boss mystery room ice dunes water house bossa hold store weather'.split(' ');
  STYLES.sort((a, b) => RANK.indexOf(a.id) - RANK.indexOf(b.id));
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
    return L.project.tracks.find(t => t.inst && (it.kind === 'combo' || it.kind === 'pluck' ? t.inst.preset === it.label : it.kind === 'gm' ? t.inst.sf === it.name : it.kind === 'kit' ? t.type === 'drums' && t.inst.preset === it.label : t.type === 'synth' && !t.inst.sf && t.inst.preset === it.label)) || null;
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

  // ---------- backing generator ----------
  // A style's feel names a drum groove, ways to play the chords and the bass, and how much swing.
  // A random seed chooses among them and varies the details bar by bar.
  const rng = seed => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const newSeed = () => Math.random() * 2 ** 32 >>> 0;
  const any = (R, a) => a[Math.floor(R() * a.length)];

  // 16 steps a bar per drum: x always, o sometimes, g a soft ghost note sometimes. [pitch, level, pattern choices]
  const GROOVES = {
    back: [[36, 0.95, ['x.......x.......', 'x......xx.......', 'x.....x.x.......', 'x.......x.o..o..', 'x..o....x.x.....']], [37, 0.85, ['....x.......x...', '....x.......x..g', '....x..g....x...']], [39, 0.5, ['x.x.x.x.x.x.x.x.', 'xxxxxxxxxxxxxxxx', 'x.x.x.x.x.x.x.xo']]],
    four: [[36, 1, ['x...x...x...x...']], [38, 0.8, ['....x.......x...', '....x.......x..o']], [39, 0.45, ['..x...x...x...x.', 'x.xxx.xxx.xxx.xx', 'xxxxxxxxxxxxxxxx']], [40, 0.4, ['..x...x...x...x.', '..............x.', '................']]],
    half: [[36, 0.95, ['x.........o.....', 'x.....o...x.....', 'x.......o.......']], [37, 0.85, ['........x.......', '........x......g']], [39, 0.45, ['x...x...x...x...', 'x.x.x.x.x.x.x.x.']]],
    boombap: [[36, 1, ['x.....x...x..o..', 'x..o..x.....x...', 'x.x...o...x.....', 'x......x..x.....']], [37, 0.9, ['....x.......x...', '....x..g....x...']], [39, 0.5, ['x.x.x.x.x.x.x.x.', 'x.x.x.x.x.xxx.x.']]],
    trap: [[36, 1, ['x......x..x.....', 'x.....x.o.x.....', 'x.......x..x..o.']], [38, 0.9, ['........x.......']], [39, 0.45, ['x.x.x.x.x.x.x.x.', 'xxxxxxxxxxxxxxxx', 'x.x.xxx.x.x.xxxx']]],
    bossa: [[36, 0.8, ['x..x..x.x..x..x.', 'x.....x.x.....x.']], [42, 0.6, ['x..x..x...x..x..', '..x..x..x..x..x.']], [39, 0.3, ['xxxxxxxxxxxxxxxx', 'x.x.x.x.x.x.x.x.']]],
    swing: [[36, 0.55, ['x.......o.......', 'x...............']], [42, 0.45, ['....x.......x...']], [37, 0.3, ['......g.......g.', '..g.......g.....']], [39, 0.5, ['x...x.x.x...x.x.', 'x...x.x.x.x.x.x.']]],
  };
  // chord playing, per bar: [beat, length, level, which chord note (all of them when left out)]
  const COMP = {
    hold: () => [[0, 3.9, 1]],
    halves: () => [[0, 1.9, 1], [2, 1.9, 0.85]],
    pulse: () => [0, 1, 2, 3].map(b => [b, 0.85, b ? 0.8 : 1]),
    eighths: () => [...Array(8)].map((_, i) => [i / 2, 0.45, i % 2 ? 0.7 : 0.95]),
    offbeat: () => [0.5, 1.5, 2.5, 3.5].map(b => [b, 0.4, 0.85]),
    stab: v => [[0, 1.5, 3], [0.5, 1.5, 2.75], [0, 0.75, 2, 2.75], [0, 2.5], [0.75, 2.75]][Math.floor(v * 5)].map(b => [b, 0.4, 0.9]),
    bossa: v => [[0, 1.5, 2.5], [0, 0.75, 2, 3.5], [0.5, 1.5, 3]][Math.floor(v * 3)].map(b => [b, 0.6, 0.85]),
    arp: v => [[0, 1, 2, 1, 0, 1, 2, 3], [0, 1, 2, 3, 2, 1, 0, 1], [0, 2, 1, 3, 0, 2, 1, 3], [3, 2, 1, 0, 3, 2, 1, 0]][Math.floor(v * 4)].map((k, i) => [i / 2, 0.9, i % 2 ? 0.7 : 0.85, k]),
  };
  // bass, per bar: [beat, length, level, r root | 3 third | 5 fifth | 8 octave | n leading into the next chord]
  const BASS = {
    hold: () => [[0, 3.8, 0.85, 'r']],
    roots: () => [[0, 2.9, 0.85, 'r'], [3, 0.9, 0.7, 'r']],
    eighths: () => [...Array(8)].map((_, i) => [i / 2, 0.42, i % 2 ? 0.7 : 0.85, 'r']),
    rootfifth: () => [[0, 1.4, 0.85, 'r'], [1.5, 0.45, 0.6, 'r'], [2, 1.9, 0.8, '5']],
    octave: () => [...Array(8)].map((_, i) => [i / 2, 0.4, i % 2 ? 0.7 : 0.9, i % 2 ? '8' : 'r']),
    offbass: () => [0.5, 1.5, 2.5, 3.5].map(b => [b, 0.4, 0.85, 'r']),
    synco: v => [[[0, 0.7], [0.75, 0.5], [2.5, 0.9], [3.5, 0.4]], [[0, 1.4], [1.5, 0.4], [2.75, 1]], [[0, 0.5], [0.75, 0.6], [1.5, 0.4], [3, 0.9]]][Math.floor(v * 3)].map(([b, l], i) => [b, l, i ? 0.7 : 0.9, i === 3 ? 'n' : 'r']),
    walk: () => [[0, 0.9, 0.85, 'r'], [1, 0.9, 0.7, '3'], [2, 0.9, 0.75, '5'], [3, 0.9, 0.7, 'n']],
    trap: v => [[[0, 1.4], [1.75, 0.5], [2.5, 1.4]], [[0, 2.5], [2.75, 1]], [[0, 0.7], [0.75, 0.7], [2, 1.9]]][Math.floor(v * 3)].map(([b, l]) => [b, l, 0.9, 'r']),
  };
  const BAND = { dr: 'back', ch: ['hold', 'halves'], bs: ['roots'] }, STILL = { ch: ['hold', 'arp', 'halves'], bs: ['hold', 'roots'] };
  const FEEL = {
    dream: { dr: 'half', ch: ['hold', 'arp'], bs: ['hold', 'roots'] }, bedroom: { dr: 'boombap', ch: ['halves', 'stab'], bs: ['roots', 'synco'], sw: 0.15 },
    indie: { dr: 'back', ch: ['eighths', 'pulse'], bs: ['eighths', 'roots'] }, shoegaze: { dr: 'half', ch: ['hold', 'eighths'], bs: ['eighths', 'hold'] },
    bossa: { dr: 'bossa', ch: ['bossa', 'offbeat'], bs: ['rootfifth'] }, hold: { dr: 'bossa', ch: ['halves', 'offbeat'], bs: ['rootfifth', 'walk'] },
    store: { dr: 'back', ch: ['offbeat', 'pulse'], bs: ['rootfifth'] }, weather: { dr: 'swing', ch: ['stab', 'halves'], bs: ['walk', 'rootfifth'], sw: 0.25 },
    garage: { dr: 'back', ch: ['eighths', 'pulse'], bs: ['eighths'] }, ballad: { dr: 'half', ch: ['hold', 'arp', 'halves'], bs: ['hold', 'roots'] },
    boombap: { dr: 'boombap', ch: ['stab', 'hold'], bs: ['synco', 'roots'], sw: 0.25 }, trap: { dr: 'trap', ch: ['hold', 'arp'], bs: ['trap'] },
    club: { dr: 'four', ch: ['offbeat', 'stab'], bs: ['octave', 'offbass'] }, trio: { dr: 'swing', ch: ['stab', 'halves'], bs: ['walk'], sw: 0.33 },
    soul: { dr: 'half', ch: ['hold', 'halves'], bs: ['synco', 'roots'], sw: 0.2 }, heroic: { ch: ['eighths', 'pulse'], bs: ['eighths', 'roots'] },
    battle: { ch: ['eighths'], bs: ['eighths'] }, dunes: { ch: ['hold', 'arp'], bs: ['roots'] }, chip: { dr: 'back', ch: ['arp', 'eighths'], bs: ['octave', 'eighths'] },
    forest: { ch: ['eighths', 'pulse'], bs: ['rootfifth'] }, boss: { dr: 'back', ch: ['eighths'], bs: ['eighths'] }, chase: { dr: 'four', ch: ['stab', 'hold'], bs: ['eighths', 'octave'] },
    lofi: { dr: 'boombap', ch: ['hold', 'halves'], bs: ['synco', 'roots'], sw: 0.3 }, pop: { dr: 'back', ch: ['eighths', 'pulse', 'halves'], bs: ['roots', 'eighths'] },
    neon: { dr: 'back', ch: ['hold', 'pulse'], bs: ['eighths', 'octave'] }, uke: { dr: 'back', ch: ['eighths'], bs: ['rootfifth', 'roots'] }, folk: { ch: ['eighths', 'pulse'], bs: ['rootfifth'] },
  };
  const feelOf = s => FEEL[s.id] || (s.inst.some(i => i.role === 'Drums') ? BAND : STILL);
  const vel = v => Math.round(L.clamp(v, 0.1, 1) * 100) / 100;

  // Chords, bass and drums for a progression (one scale degree per bar).
  function backing(s, prog, seed) {
    const R = rng(seed), F = feelOf(s), sc = P.SCALES[s.scale], sw = F.sw || 0, bars = prog.length;
    const tone = (d, k) => s.key + sc[(d + k) % 7];
    const fold = (pc, lo) => lo + ((pc - lo) % 12 + 12) % 12;
    const swing = b => b + (Math.abs(b % 1 - 0.5) < 1e-6 ? sw * 0.5 : 0);
    // this take's choices: how the chords and bass are played, where the chords sit, how loose it is
    const comp = any(R, F.ch), cv = R(), bass = any(R, F.bs), bv = R(), low = 52 + Math.floor(R() * 6), hum = 0.06 + R() * 0.06;
    const chords = [], bline = [], drums = [];
    prog.forEach((d, bar) => {
      const ps = (s.sev ? [0, 2, 4, 6] : [0, 2, 4]).map(k => fold(tone(d, k), low)).sort((a, b) => a - b);
      ps.push(ps[0] + 12);
      for (const [b, l, v, k] of COMP[comp](cv)) {
        const notes = k === undefined ? ps.slice(0, -1) : [ps[k % ps.length]];
        notes.forEach(p => chords.push({ p, s: bar * 4 + swing(b), l, v: vel(0.62 * v + (R() - 0.5) * hum) }));
      }
      const root = fold(tone(d, 0), 31), next = fold(tone(prog[(bar + 1) % bars], 0), 31);
      const iv = { r: root, 3: fold(tone(d, 2), root), 5: fold(tone(d, 4), root), 8: root + 12, n: next + (R() < 0.5 ? -1 : 1) };
      for (const [b, l, v, k] of BASS[bass](bv)) bline.push({ p: iv[k], s: bar * 4 + swing(b), l, v: vel(0.8 * v + (R() - 0.5) * hum) });
    });
    const G = F.dr && GROOVES[F.dr];
    if (G) {
      const mine = G.map(x => any(R, x[2])), busy = 0.25 + R() * 0.4;
      for (let bar = 0; bar < bars; bar++) {
        const fill = bars >= 4 && bar % 4 === 3 && R() < 0.75;
        G.forEach(([p, v, pats], li) => {
          const pat = R() < 0.15 ? any(R, pats) : mine[li]; // now and then a bar borrows another pattern
          for (let i = 0; i < 16; i++) {
            const c = pat[i];
            if (c === '.' || (fill && i >= 12 && p !== 36) || (c === 'o' && R() > busy) || (c === 'g' && R() > 0.6)) continue;
            drums.push({ p, s: bar * 4 + swing(i / 4), l: 0.25, v: vel(v * (c === 'g' ? 0.35 : i % 4 ? 0.8 : 1) + (R() - 0.5) * 0.1) });
          }
        });
        if (fill) { const tom = R() < 0.4, dense = R() < 0.5; for (let i = 12; i < 16; i++) if (dense || i % 2 === 0) drums.push({ p: tom ? 41 : 37, s: bar * 4 + i / 4, l: 0.25, v: vel(0.45 + (i - 12) * 0.13) }); }
        if (bar % 8 === 0 && R() < 0.5) drums.push({ p: 43, s: bar * 4, l: 0.5, v: 0.6 });
      }
    }
    return { chords, bass: bline, drums };
  }

  // A tune for previews only: chord notes on the strong beats, steps along the scale in between.
  function tune(s, prog, seed) {
    const R = rng(seed), sc = P.SCALES[s.scale], out = [];
    const RHY = [[[0, 1], [1, 0.5], [1.5, 0.5], [2, 2]], [[0, 1.5], [1.5, 0.5], [2, 1], [3, 1]], [[0, 0.5], [0.5, 0.5], [1, 1], [2.5, 1.5]], [[0, 3]], [[0, 1], [2, 1], [3, 0.5], [3.5, 0.5]]];
    const motif = [any(R, RHY), any(R, RHY)];
    let step = 7 + Math.floor(R() * 3); // position on the scale, counted from the key note an octave below middle
    const pitch = i => s.key + 60 + 12 * Math.floor(i / 7) - 12 + sc[((i % 7) + 7) % 7];
    prog.forEach((d, bar) => {
      for (const [b, l] of motif[bar % 2]) {
        if (b % 2 === 0) {
          const want = [0, 2, 4].map(k => (d + k) % 7);
          let best = step, bd = 99;
          for (let i = step - 4; i <= step + 4; i++) if (want.includes(((i % 7) + 7) % 7) && Math.abs(i - step) < bd) { best = i; bd = Math.abs(i - step); }
          step = best;
        } else step += R() < 0.5 ? -1 : 1;
        step = L.clamp(step, 7, 16);
        out.push({ p: pitch(step), s: bar * 4 + b, l: l * 0.92, v: vel(0.7 + R() * 0.15) });
      }
    });
    return out;
  }

  // Writes one progression's backing at the playhead (after whatever the chord track already has).
  // Its seed is kept so New variation can swap it for a different take in the same place.
  function write(pi, seed = newSeed(), at = null) {
    const s = active(); if (!s) return;
    const prog = s.prog[pi], len = prog.length * 4, b = backing(s, prog, seed), id = L.uid();
    const chords = addInst(s.inst.find(i => i.role === 'Chords').k);
    const start = at ?? Math.max(Math.floor(L.pos / 4) * 4, Math.ceil(Math.max(0, ...chords.clips.map(c => c.start + c.len)) / 4) * 4);
    const names = P.chordsFor(s.key, s.scale, 4, s.sev);
    chords.clips.push({ id: L.uid(), gen: id, name: prog.map(d => names[d].name).join(' '), start, len, notes: b.chords });
    const bassSpec = s.inst.find(i => i.role === 'Bass');
    if (bassSpec) addInst(bassSpec.k).clips.push({ id: L.uid(), gen: id, name: 'Bass', start, len, notes: b.bass });
    const drumSpec = s.inst.find(i => i.role === 'Drums');
    if (drumSpec && b.drums.length) addInst(drumSpec.k).clips.push({ id: L.uid(), gen: id, name: 'Beat', start, len, notes: b.drums });
    L.project.gen = { id, pi, seed, start, style: s.id };
    L.sel.clip = null;
    L.commit();
    L.toast(at === null ? `Backing written at bar ${start / 4 + 1}. Not quite right? Press New variation. Then play a tune over it on the marked keys` : 'New variation written', 6000);
  }
  // Swaps the backing written last for a fresh take in the same place.
  function reroll() {
    const g = L.project.gen; if (!g) return;
    L.project.tracks.forEach(t => { t.clips = t.clips.filter(c => c.gen !== g.id); });
    write(g.pi, newSeed(), g.start);
  }

  // ---------- previews ----------
  // Eight bars (both progressions) with a made-up tune, played on a throwaway project.
  let playing = null, loading = false;
  function demo(s) {
    const prog = [...s.prog[0], ...s.prog[1]], seed = newSeed(), b = backing(s, prog, seed);
    const proj = { bpm: s.bpm, master: { vol: 0.8 }, loop: { on: false, start: 0, end: 0 }, tracks: [] };
    const add = (role, notes, vol) => {
      const spec = s.inst.find(i => i.role === role), it = spec && L.lib.byKey(spec.k);
      if (!it || !notes.length) return;
      const t = L.newTrack(it.kind === 'kit' ? 'drums' : 'synth');
      L.lib.apply(t, it); t.vol = vol;
      t.clips.push({ id: L.uid(), start: 0, len: prog.length * 4, notes });
      proj.tracks.push(t);
    };
    add('Chords', b.chords, 0.62); add('Bass', b.bass, 0.74); add('Drums', b.drums, 0.7); add('Melody', tune(s, prog, seed ^ 0x5bd1e995), 0.74);
    return proj;
  }
  function preview(id) {
    const again = playing === id;
    E.stopPreview();
    if (again) return;
    const s = byId(id);
    playing = id; loading = true; render();
    L.toast(`Preview of ${s.name}: a made-up example; nothing is added to your song. The first play of a style downloads its instruments, which can take a few seconds`, 6000);
    E.preview(demo(s), () => { playing = null; loading = false; render(); }, () => { loading = false; render(); });
  }

  // ---------- panel ----------
  const pvBtn = x => `<button class="g-pv${playing === x.id ? ' on' : ''}" data-pv="${x.id}" title="${playing === x.id ? 'Stop the preview' : 'Hear what ' + x.name + ' sounds like'}" aria-label="Preview ${x.name}">${L.icon(playing === x.id ? 'stop' : 'play')}</button>`;
  const row = (x, s, act) => `<div class="g-row"><button data-style="${x.id}" class="${x === s ? 'on' : ''}">${x.name}${x === act ? '<small>in use</small>' : ''}</button>${pvBtn(x)}</div>`;
  const nav = (s, act) => '<h4>Most popular</h4>' + STYLES.slice(0, 8).map(x => row(x, s, act)).join('') + GENRES.map(g => `<h4>${g}</h4>` + STYLES.filter(x => x.genre === g).map(x => row(x, s, act)).join('')).join('');
  function render() {
    // keep the chord pads on the style's key
    if (applied !== sig()) { applied = sig(); const s = active(); P.S.sev = !!(s && s.sev); if (s) { P.S.key = s.key; P.S.scale = s.scale; } }
    const act = active();
    if (!byId(view)) view = act ? act.id : STYLES[0].id;
    const s = byId(view), on = act === s, sc = new Set(P.SCALES[s.scale].map(x => (x + s.key) % 12));
    const chords = P.chordsFor(s.key, s.scale, 4, s.sev);
    // rebuilding the panel would jump the lists back to the top
    const keep = ['.g-side nav', '.g-main'].map(q => { const el = host.querySelector(q); return el ? el.scrollTop : 0; });
    keep.push(host.scrollTop);
    host.innerHTML = `
      <div class="lib-side g-side"><nav>${nav(s, act)}</nav></div>
      <div class="lib-main g-main">
        <div class="g-top">
          <div><h2>${s.name}</h2><p>${s.blurb}</p></div>
          <div class="g-acts"><button class="g-hear${playing === s.id ? ' on' : ''}" data-pv="${s.id}">${L.icon(playing === s.id ? 'stop' : 'play')}${playing === s.id ? (loading ? 'Loading…' : 'Stop') : 'Hear it'}</button>${on ? '<button data-g="off">Stop using</button>' : '<button data-g="use" class="g-use">Use this style</button>'}</div>
        </div>
        <div class="g-cols">
          <section>
            <h3>Key and tempo</h3>
            <div class="g-big">${NOTE[s.key]} ${s.scale.toLowerCase()}</div>
            <div class="g-scale">${NOTE.map((n, i) => `<i class="${i === s.key ? 'rt' : sc.has(i) ? 'in' : ''}">${n}</i>`).join('')}</div>
            <p class="g-note">${s.bpm} BPM. ${on ? 'These notes are marked on the Keys tab and in the editor: stay on them and nothing sounds wrong. The home note is the one in the accent colour.' : 'Using the style sets the tempo, adds the instruments and marks these notes on the keyboard and in the editor.'}</p>
          </section>
          <section>
            <h3>Instruments</h3>
            ${s.inst.map(i => { const it = L.lib.byKey(i.k), t = has(i.k); return `<div class="g-inst"><b>${it ? esc(it.label) : i.k}</b><small>${i.role}</small>${t ? `<button data-g="go" data-k="${i.k}" title="Select this track">On track</button>` : `<button data-g="add" data-k="${i.k}">Add</button>`}</div>`; }).join('')}
          </section>
          <section>
            <h3>Chords that work</h3>
            ${s.prog.map((pr, pi) => `<div class="g-prog">${pr.map(d => `<button class="g-ch" data-deg="${d}"><b>${chords[d].name}</b><small>${chords[d].roman}</small></button>`).join('')}${on ? `<button data-g="write" data-pi="${pi}" title="Put these chords, a bass line${s.inst.some(i => i.role === 'Drums') ? ' and a beat' : ''} into the song, played a new way each time">Write backing</button>` : ''}</div>`).join('')}
            ${on && L.project.gen && L.project.gen.style === s.id && L.project.tracks.some(t => t.clips.some(c => c.gen === L.project.gen.id)) ? `<button class="g-reroll" data-g="reroll" title="Replace the backing written last (bar ${L.project.gen.start / 4 + 1}) with a different one">${L.icon('dice')}New variation</button>` : ''}
            <p class="g-note">Press a chord to hear it. ${on ? 'Write backing adds chords, bass' + (s.inst.some(i => i.role === 'Drums') ? ' and drums' : '') + ' in this style, played differently every time; the tune is yours to write. The same chords are on the pads in the Keys tab (number keys 1 to 7).' : ''}</p>
          </section>
        </div>
      </div>`;
    ['.g-side nav', '.g-main'].forEach((q, i) => { host.querySelector(q).scrollTop = keep[i]; });
    host.scrollTop = keep[2];
  }

  host.addEventListener('click', e => {
    const st = e.target.closest('[data-style]'), g = e.target.closest('[data-g]'), pv = e.target.closest('[data-pv]');
    if (pv) return preview(pv.dataset.pv);
    if (st) { view = st.dataset.style; return render(); }
    if (!g) return;
    const a = g.dataset.g;
    if (a === 'use') use(view);
    else if (a === 'off') { L.project.guide = null; L.commit(); }
    else if (a === 'write') write(+g.dataset.pi);
    else if (a === 'reroll') reroll();
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
