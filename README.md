# Lathe

A music studio (DAW) that runs in the browser: write, record, mix and score to video. Nothing to install and no build step.

**Open it:** https://bentokaz.github.io/lathe/

Made by bentokaz as a school project.

![The Lathe timeline with the demo song, a filter automation line and the piano roll](docs/readme-main.png)

## What it does

- **Timeline** with synth, drum and audio tracks. Snap to bars, beats, 1/8 down to 1/64, triplets, or nothing, and zoom in far enough to place things by the millisecond. Clips can be moved, trimmed, split, copied and looped by dragging their corner. Select several with Shift-click, by dragging a box across empty space, or with Ctrl+A, then move, copy or delete them together. Tracks can be duplicated.
- **Piano roll** with chord stamping, hover-a-note-to-make-a-chord, arpeggiate, quantize, humanize (small random nudges to timing and loudness, so parts sound played) and velocity.
- **On-screen keyboard** with chord pads and an arpeggiator. The computer keyboard and MIDI keyboards play it too.
- **More than 200 sounds**: modelled guitars and ukulele, built-in synths, real choirs recorded on Mellotron tape, recorded drum kits (with cowbell) and drum machines, a hard distorted kit, and the 128 General MIDI instruments, which download the first time they are used.
- **Sound effects, loops and fills**: risers, a reverse cymbal, impacts, sub drops, a downlifter, whooshes and vinyl crackle, made to fit the song's tempo, plus drum loops (rock, house, boom bap, trap, breakbeat, bossa nova and more) and fills. One click puts them at the playhead; build-ups end there, so they lead into the drop.
- **Find any sound effect**: searches Freesound and Wikimedia Commons (through [Openverse](https://openverse.org)) and the [BBC Sound Effects](https://sound-effects.bbcrewind.co.uk) archive from inside the Sounds tab. Hear a sound with one click and add it with another (or drag it onto a track). Each sound shows its licence, a "No credit needed" switch shows only sounds that are free for anything, and **Credits for this song** lists who to credit. Openverse allows 200 searches a day per network, so searches are remembered for a week; BBC sounds are for personal, school and research use.
- **Styles** for 36 kinds of music, most popular first. A style sets the key, tempo and instruments and marks the notes and chords that fit. The play button gives an 8-bar preview, and **Write backing** writes chords, bass and drums that come out differently every time. **New variation** gives another take; the melody is up to you.
- **Mixer** with EQ, distortion (warm, hard clip, fuzz or bitcrush), muffle, compressor, sidechain, chorus, delay and reverb on every track, plus mute and solo. Sidechain turns a track down each time the kick (or any track you pick) plays.
- **Automation** for volume, pan, muffle, pitch bend, reverb and echo, drawn as a line on each track. A MIDI keyboard's pitch wheel bends the selected track too.
- **Recording** of notes from the keyboard, or audio from a microphone.
- **Import**:
  - audio: WAV, AIFF, MP3, AAC/M4A, FLAC, OGG and Opus;
  - MIDI;
  - video: MP4, MOV, WebM, MKV and more;
  - Lathe project files.
- **Export**:
  - audio: WAV, AIFF, MP3, AAC and Opus;
  - MIDI;
  - the video with your music: MP4, MOV, WebM or MKV.

  Exports render faster than real time.
- **Video scoring**: add a film and Lathe finds the cuts between shots by itself; clips, the playhead and the loop snap to them (and to your own markers) as you drag. Drop markers on the moments to hit, watch it full screen with the music, and export the film with the music.
- **My songs**: every song is kept in the browser, with an optional account to open them anywhere (videos included). A share link gives a friend their own copy.
- **Feedback** from the button in the top bar, without signing in to anything.
- **Tutorial**: 16 steps (gear menu, or the start screen).
- **14 colour themes** (gear menu).

![The Styles tab](docs/readme-styles.png)

## How to use it

1. Open the site. The start screen offers a blank song, a style, the tutorial or the demo song.
2. Press **Space** to play and pause. Double-click an empty part of a track to make a clip, then draw notes in the editor below.
3. Pick sounds in the **Sounds** tab, and a kind of music in the **Styles** tab.
4. Balance the tracks in the **Mixer**.
5. **File, Export** saves the song as audio, MIDI or video.

The gear menu lists every keyboard shortcut.

## Run it on your own computer

Start the small server and open http://localhost:5173:

```
node serve.js
```

On Windows, `Start Lathe.bat` does both.

## Switching on accounts (optional)

Without accounts, Lathe keeps songs in the browser, and **File, Save project file** makes a file you can carry. Accounts let you sign in on any computer and find your songs there. They use [Supabase](https://supabase.com), which has a free plan.

1. Make a free Supabase account and a **New project**. Any name works; pick the region closest to you.
2. Open **SQL Editor**, paste the script below, and press **Run**. It creates the song table and the audio storage, and sets rules so each person can only see and change their own songs.
3. Under **Authentication, Sign In / Providers, Email**, turn **Confirm email** off. Classmates can then sign in straight away. The free plan only sends a few emails an hour, which runs out quickly with a whole class signing up.
4. In **Project Settings**, find the **Project URL** and the **anon public** key (newer projects call it the **publishable** key; never use the secret or service_role key), and copy both into [`js/config.js`](js/config.js). This key is designed to be public.
5. Commit and push. Sign-in then appears under the person button and **File, My songs**.

```sql
create table public.songs (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default 'Untitled',
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.songs enable row level security;
create policy "Own songs only" on public.songs for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

insert into storage.buckets (id, name, public) values ('audio', 'audio', false) on conflict do nothing;
create policy "Own audio only" on storage.objects for all to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

-- Feedback: anyone can send it, only the project owner reads it (Table Editor, feedback)
create table public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('bug', 'idea', 'other')),
  message text not null check (char_length(message) between 1 and 5000),
  contact text check (char_length(contact) <= 200),
  details text check (char_length(details) <= 4000)
);
alter table public.feedback enable row level security;
create policy "Anyone can send feedback" on public.feedback for insert to anon, authenticated with check (true);
grant insert on public.feedback to anon, authenticated;
```

An account stores only an email address, a password (handled by Supabase, never seen by Lathe) and the songs.

A song's video goes into the account too. The free plan takes files up to 50 MB, so a bigger video is shrunk to a smaller copy for the account; the computer it was added on keeps the original. Feedback sent from the app appears in **Table Editor, feedback**.

## Credits

**Sampled instruments.** These are the General MIDI soundfonts from [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) by Benjamin Gleitzman:

| Set | Soundfont | Licence |
| --- | --- | --- |
| A | MusyngKite | CC BY-SA 3.0 |
| B | FatBoy | CC BY-SA 3.0 |
| C | FluidR3 GM | CC BY 3.0 |

The recorded choirs are Mellotron and Chamberlin tapes from the [Mellotron archive](https://archive.org/details/mellotron-archive-cd-rom-nki-wav.-7z), streamed from [smpldsnds/archiveorg-mellotron](https://github.com/smpldsnds/archiveorg-mellotron). The recorded drum kits (Standard, Tight, Low and slow, Bright, Roomy, and all but the kick of Hard and distorted) use the GM kit from the [Hydrogen](https://github.com/hydrogen-music/hydrogen) drum machine (GPL), streamed from [smpldsnds/hydrogen-drum-samples](https://github.com/smpldsnds/hydrogen-drum-samples). The guitars, ukulele, synths, drum machines and sound effects are generated in the browser, so they use no recordings.

**Libraries:**

- [Mediabunny](https://mediabunny.dev) (MPL 2.0) for video and audio files;
- [lamejs](https://github.com/zhuker/lamejs) (LGPL 3.0) for MP3;
- [supabase-js](https://github.com/supabase/supabase-js) (MIT) for accounts.

The same list is in the app under the gear menu, **About and credits**.
