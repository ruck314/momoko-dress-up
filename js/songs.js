/* songs.js – the music, as Game.music song objects (format: music.js).
   title:  a sparkly invitation into the studio (D major).
   studio: a light, bouncy loop for dressing up and the puzzles (F major);
           soft mallets and flute, nothing that pulls at her attention.
   strut, disco, waltz, funky, sakura: the five runway shows, one picked
           at random per show (see RUNWAY_TRACKS in audio.js). */
(function () {
  'use strict';
  window.Game = window.Game || {};

  /* ---- title: D major, 100 bpm, A B (16 bars, ~38 s) ---- */
  var title = {
    bpm: 100, swing: 0.1, level: 1,
    reverb: { size: 2.6 }, delay: { beats: 0.75, feedback: 0.3 },
    tracks: {
      lead:  { inst: 'flute', vol: 0.62, pan: 0.1, rev: 0.35, dly: 0.2 },
      harp:  { inst: 'pluck', vol: 0.3, auto: 'arp', pattern: 'updown', rate: 0.5, octave: 4, range: 2, pan: -0.25, rev: 0.4 },
      spark: { inst: 'bell', vol: 0.22, auto: 'arp', pattern: 'up', rate: 1, octave: 5, pan: 0.3, rev: 0.5, dly: 0.3 },
      pad:   { inst: 'choir', vol: 0.5, auto: 'pad', octave: 4, rev: 0.5 },
      bass:  { inst: 'bass', vol: 0.5, auto: 'bass', style: 'root5', rhythm: 'x.......x.......', octave: 2 },
      drums: { vol: 0.45, rev: 0.15 }
    },
    grooves: {
      soft: { shaker: 'o.x.o.x.o.x.o.x.', tri: 'x...............................' },
      lift: { kick: 'x.......x.......', snap: '....x.......x...', shaker: 'o.x.o.x.o.x.o.x.', tri: 'x...............................' }
    },
    sections: {
      A: {
        chords: 'Dmaj7:4 Bm7:4 Gmaj7:4 A7sus4:2 A7:2 Dmaj7:4 F#m7:2 B7:2 Em7:4 Gm6:2 A7:2',
        lead: 'F#5:1 A5:1 D6:1.5 C#6:0.5 | B5:2 A5:1 F#5:1 | D6:1.5 B5:0.5 G5:1 A5:1 | E5:1 D5:1 C#5:2 | ' +
              'F#5:1 A5:1 D6:1.5 E6:0.5 | C#6:1 A5:1 B5:1 D#6:1 | E6:2 D6:1 B5:1 | D6:1 Bb5:1 A5:2',
        spark: false, drums: 'soft'
      },
      B: {
        chords: 'Gmaj7:4 A/G:4 F#m7:4 Bm7:4 Em9:4 A7:4 Bbmaj7:2 C:2 A7sus4:2 A7:2',
        lead: 'B5:1.5 A5:0.5 B5:1 D6:1 | C#6:2 r:1 A5:1 | A5:1.5 F#5:0.5 A5:1 C#6:1 | B5:2 D6:1 C#6:1 | ' +
              'G5:1 B5:1 E6:1.5 D6:0.5 | C#6:1 E6:1 C#6:1 A5:1 | D6:1 F6:1 E6:1 C6:1 | D6:2 C#6:2',
        drums: 'lift', fill: { snap: '....x.......x...', tom: '........x.x.x.x.' }
      }
    },
    form: 'A B'
  };

  /* ---- studio: F major, 108 bpm, A B A2 C (32 bars, ~71 s) ----
     Marimba asks, flute answers; in A2 they swap. B and C let a
     kalimba arpeggio carry the bounce under a longer flute line. */
  var stA = 'A5:0.5 C6:0.5 r:0.5 A5:0.5 F5:1 r:1 | F5:0.5 A5:0.5 r:0.5 F5:0.5 D5:1 r:1 | ' +
            'Bb5:0.5 D6:0.5 r:0.5 Bb5:0.5 G5:1 A5:0.5 Bb5:0.5 | C6:1.5 Bb5:0.5 G5:1 r:1 | ' +
            'C6:0.5 E6:0.5 r:0.5 C6:0.5 A5:1 r:1 | A5:0.5 C6:0.5 r:0.5 A5:0.5 F#5:1 r:1 | ' +
            'Bb5:1 A5:0.5 G5:0.5 F5:1 G5:1 | A5:1 F5:1 E5:1 G5:1';
  var stAnswer = 'r:3 C6:0.5 A5:0.5 | r:3 C6:0.5 A5:0.5 | r:4 | r:3 E5:0.5 G5:0.5 | ' +
                 'r:3 E6:0.5 C6:0.5 | r:3 D6:0.5 C6:0.5 | r:4 | r:4';
  var studio = {
    bpm: 108, swing: 0.14, level: 1,
    reverb: { size: 2 }, delay: { beats: 0.75, feedback: 0.25 },
    tracks: {
      mar:   { inst: 'marimba', vol: 0.62, pan: -0.1, rev: 0.25 },
      flute: { inst: 'flute', vol: 0.5, pan: 0.15, rev: 0.35, dly: 0.15 },
      keys:  { inst: 'epiano', vol: 0.3, auto: 'stab', rhythm: '..x...x...x...x.', octave: 4, pan: 0.2, rev: 0.2 },
      arp:   { inst: 'kalimba', vol: 0.3, auto: 'arp', pattern: 'broken', rate: 0.5, octave: 5, pan: -0.25, rev: 0.3 },
      pad:   { inst: 'pad', vol: 0.32, auto: 'pad', octave: 4, cutoff: 1000, rev: 0.4 },
      bass:  { inst: 'bass', vol: 0.52, auto: 'bass', style: 'root5', rhythm: 'x.....x.x.......', octave: 2 },
      drums: { vol: 0.38, rev: 0.08 }
    },
    grooves: {
      bounce: { kick: 'x.......x.......', rim: '....x.......x...', shaker: 'o.x.o.x.o.x.o.x.' },
      light:  { rim: '....x.......x...', shaker: 'o.x.o.x.o.x.o.x.', tri: 'x...............................' }
    },
    sections: {
      A: {
        chords: 'Fmaj7:4 Dm7:4 Gm7:4 C7:4 Am7:4 D7:4 Gm7:2 C7sus4:2 Fadd9:2 C7:2',
        mar: stA, flute: stAnswer, arp: false, drums: 'bounce'
      },
      B: {
        chords: 'Bbmaj7:4 C/Bb:4 Am7:4 Dm7:4 Gm9:4 Bbm6:4 Am7:2 D7:2 Gm7:2 C7:2',
        flute: 'D6:1.5 C6:0.5 Bb5:1 A5:1 | C6:2 G5:1 E5:1 | E5:1 A5:1 C6:1 E6:1 | D6:3 r:1 | ' +
               'Bb5:1.5 A5:0.5 G5:1 F5:1 | Db6:2 Bb5:1 G5:1 | C6:1 A5:1 F#5:1 A5:1 | Bb5:1 G5:1 E5:1 G5:1',
        drums: 'bounce', fill: { rim: '....x.......x.x.', block: '..........x.x...' }
      },
      A2: {
        chords: 'Fmaj7:4 Dm7:4 Gm7:4 C7:4 Am7:4 D7:4 Gm7:2 C7sus4:2 Fadd9:2 C7:2',
        flute: stA, mar: stAnswer, arp: false, drums: 'bounce'
      },
      C: {
        chords: 'Dm7:4 Bbmaj7:4 Fmaj7:4 C:4 Dm7:4 Bbmaj7:4 Gm7:4 C7sus4:2 C7:2',
        mar: 'A5:1 F5:0.5 A5:0.5 D6:2 | D6:1 C6:0.5 Bb5:0.5 F5:2 | E5:1 F5:0.5 A5:0.5 C6:2 | G5:1 E5:0.5 G5:0.5 C6:2 | ' +
             'A5:1 F5:0.5 A5:0.5 D6:1 F6:1 | D6:1.5 C6:0.5 Bb5:1 A5:1 | G5:1 Bb5:1 D6:1 F6:1 | G5:1 F5:1 E5:1 G5:1',
        keys: false, drums: 'light', fill: { shaker: 'o.x.o.x.xxxxxxxx' }
      }
    },
    form: 'A B A2 C'
  };

  /* ---- runway: strut, A minor, 120 bpm, I A B A (28 bars, 56 s) ---- */
  var strutA = 'E5:0.5 E5:0.5 r:0.5 G5:0.5 A5:1 r:1 | r:0.5 A5:0.5 G5:0.5 E5:0.5 C5:1 r:1 | ' +
               'E5:0.5 E5:0.5 r:0.5 G5:0.5 C6:1 r:1 | B5:0.5 A5:0.5 G5:0.5 D5:0.5 r:2 | ' +
               'E5:0.5 E5:0.5 r:0.5 G5:0.5 A5:1 C6:1 | A5:1 G5:0.5 E5:0.5 F5:1 r:1 | ' +
               'F5:0.5 A5:0.5 r:0.5 F5:0.5 D5:1 C5:1 | B4:1 A4:1 G#4:1 B4:1';
  var strut = {
    bpm: 120, level: 1,
    reverb: { size: 1.8 }, delay: { beats: 0.75, feedback: 0.28 },
    tracks: {
      lead:  { inst: 'lead', vol: 0.5, cutoff: 2400, vib: 8, pan: 0.05, rev: 0.2, dly: 0.18 },
      brass: { inst: 'brass', vol: 0.34, bright: 4, auto: 'stab', rhythm: 'x.........x.....', octave: 4, pan: -0.15, rev: 0.2 },
      arp:   { inst: 'pluck', vol: 0.26, auto: 'arp', pattern: 'up', rate: 0.25, octave: 4, range: 2, gate: 0.6, decay: 0.18, pan: 0.25, dly: 0.2 },
      pad:   { inst: 'strings', vol: 0.36, auto: 'pad', octave: 4, rev: 0.35 },
      bass:  { inst: 'bass', vol: 0.55, auto: 'bass', style: 'root', rhythm: 'x.x.x.x.x.x.x.x.', gate: 0.7, octave: 2 },
      drums: { vol: 0.5, rev: 0.06 }
    },
    grooves: {
      four: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'o.x.o.x.o.x.o.x.' },
      intro: { kick: 'x...x...x...x...', hat: '..x...x...x...x.', crash: 'x...............................................................' }
    },
    sections: {
      I: { chords: 'Am7:4 Fmaj7:4 C:4 G:4', drums: 'intro', brass: false, fill: { clap: '....x...x.x.xxxx' } },
      A: { chords: 'Am7:4 Fmaj7:4 C:4 G:4 Am7:4 Fmaj7:4 Dm7:4 E7sus4:2 E7:2', lead: strutA, drums: 'four' },
      B: {
        chords: 'Dm7:4 G7:4 Cmaj7:4 Fmaj7:4 Bm7b5:4 E7:4 Am7:2 G:2 Fmaj7:2 E7:2',
        lead: 'A5:1.5 F5:0.5 A5:1 C6:1 | B5:2 G5:1 D6:1 | C6:1.5 B5:0.5 G5:1 E5:1 | A5:3 r:1 | ' +
              'D6:1.5 C6:0.5 B5:1 A5:1 | G#5:2 B5:1 D6:1 | C6:1 A5:1 B5:1 G5:1 | A5:1 F5:1 E5:1 G#5:1',
        drums: 'four', fill: { clap: '....x.......x.xx', tom: '..........x.x...' }
      }
    },
    form: 'I A B A'
  };

  /* ---- runway: disco, E minor, 118 bpm, I A B A B (36 bars, ~73 s) ---- */
  var discoA = 'B5:1 r:0.5 B5:0.5 D6:0.5 B5:0.5 G5:1 | A5:1 r:0.5 G5:0.5 B5:0.5 A5:0.5 G5:1 | ' +
               'B5:1 r:0.5 B5:0.5 D6:0.5 B5:0.5 E6:1 | C#6:1.5 B5:0.5 A5:2 | ' +
               'G5:1 B5:1 E6:1.5 D6:0.5 | D6:1 A5:1 F#5:2 | F#5:1 A5:1 D6:1.5 C#6:0.5 | B5:2 A5:1 F#5:1';
  var discoB = 'E5:1 G5:1 B5:1.5 A5:0.5 | A5:1.5 F#5:0.5 A5:1 D6:1 | D6:2 B5:1 A5:1 | B5:3 r:1 | ' +
               'C6:1 E6:1 C6:1 A5:1 | A5:1.5 C6:0.5 D6:1 C6:1 | B5:1 D6:1 E6:1 B5:1 | E5:1 F#5:1 D#5:2';
  var disco = {
    bpm: 118, level: 1,
    reverb: { size: 2 }, delay: { beats: 0.5, feedback: 0.25 },
    tracks: {
      str:   { inst: 'strings', vol: 0.75, pan: 0.1, rev: 0.35, dly: 0.12, cutoff: 4200 },
      horn:  { inst: 'brass', vol: 0.42, bright: 4, pan: -0.05, rev: 0.25 },
      pad:   { inst: 'strings', vol: 0.3, auto: 'pad', octave: 4, rev: 0.4, cutoff: 2200 },
      keys:  { inst: 'epiano', vol: 0.32, auto: 'stab', rhythm: '..x...x...x...x.', gate: 0.5, octave: 4, pan: -0.25 },
      gtr:   { inst: 'pluck', vol: 0.2, auto: 'stab', rhythm: 'x.x.x.x.x.x.x.x.', gate: 0.35, decay: 0.08, octave: 4, voices: 3, pan: 0.3 },
      bass:  { inst: 'bass', vol: 0.55, auto: 'bass', style: 'oct', rhythm: 'x.x.x.x.x.x.x.x.', gate: 0.75, octave: 2, tone: 4.5 },
      drums: { vol: 0.5, rev: 0.06 }
    },
    grooves: {
      disco: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'x.o.x.o.x.o.x.o.', ohat: '..x...x...x...x.' },
      intro: { kick: 'x...x...x...x...', ohat: '..x...x...x...x.', crash: 'x...............................................................' }
    },
    sections: {
      I: { chords: 'Em7:4 A9:4 Em7:4 B7:4', drums: 'intro', keys: false, fill: { clap: '....x...x...xxxx' } },
      A: { chords: 'Em7:4 A9:4 Em7:4 A9:4 Cmaj7:4 D:4 Bm7:4 B7:4', str: discoA, drums: 'disco' },
      B: {
        chords: 'Cmaj7:4 D:4 Bm7:4 Em7:4 Am7:4 D7:4 Gmaj7:2 Cmaj7:2 B7sus4:2 B7:2',
        horn: discoB, drums: 'disco', fill: { clap: '....x.......x.xx', tom: '........x.x.x...' }
      }
    },
    form: 'I A B A B'
  };

  /* ---- runway: waltz, Bb major 3/4, 126 bpm, A A2 B C (32 bars, ~46 s) ---- */
  var waltz = {
    bpm: 126, beatsPerBar: 3, level: 1,
    reverb: { size: 2.8 }, delay: { beats: 1.5, feedback: 0.2 },
    tracks: {
      vln:   { inst: 'strings', vol: 0.8, pan: 0.1, rev: 0.45, attack: 0.08 },
      pno:   { inst: 'piano', vol: 0.46, auto: 'stab', rhythm: '....x...x...', gate: 0.8, octave: 4, strum: 0.012, pan: -0.15, rev: 0.3 },
      harp:  { inst: 'pluck', vol: 0.24, auto: 'arp', pattern: 'up', rate: 0.5, octave: 4, range: 2, pan: -0.3, rev: 0.5 },
      pad:   { inst: 'pad', vol: 0.26, auto: 'pad', octave: 4, cutoff: 900, rev: 0.5 },
      bass:  { inst: 'upright', vol: 0.7, auto: 'bass', rhythm: 'x...........', octave: 2 },
      drums: { vol: 0.35, rev: 0.3 }
    },
    grooves: {
      w:  { tri: 'x.......................................................................................' },
      w2: { tri: 'x.......................', brush: '....x...x...' }
    },
    sections: {
      A: {
        chords: 'Bbmaj7:3 Gm7:3 Cm7:3 F7:3 Dm7:3 G7:3 Cm7:3 F7:3',
        vln: 'D5:2 F5:1 | Bb5:2 A5:1 | G5:1.5 F5:0.5 Eb5:1 | F5:3 | A5:2 C6:1 | B5:1.5 A5:0.5 G5:1 | G5:1 Bb5:1 Eb6:1 | C6:1.5 Bb5:0.5 A5:1',
        harp: false, drums: 'w'
      },
      A2: {
        chords: 'Bbmaj7:3 Gm7:3 Cm7:3 F7:3 Bb7:3 Ebmaj7:3 Ebm6:3 Bbmaj7:3',
        vln: 'D5:2 F5:1 | Bb5:2 A5:1 | G5:1.5 F5:0.5 Eb5:1 | A5:3 | Ab5:2 F5:1 | G5:2 Bb5:1 | Gb5:1.5 F5:0.5 Eb5:1 | D5:3',
        harp: false, drums: 'w'
      },
      B: {
        chords: 'Gm7:3 D7:3 Gm7:3 G7:3 Cm7:3 F7:3 Bbmaj7:3 Bb7:3',
        vln: 'D5:1 G5:1 Bb5:1 | A5:2 F#5:1 | G5:1 Bb5:1 D6:1 | D6:2 B5:1 | C6:1.5 Bb5:0.5 G5:1 | A5:1.5 G5:0.5 F5:1 | D5:2 F5:1 | Ab5:3',
        drums: 'w2'
      },
      C: {
        chords: 'Ebmaj7:3 Dm7:3 Cm7:3 F7:3 Gm7:3 C7:3 Cm7:3 F7:3',
        vln: 'G5:2 Bb5:1 | A5:2 F5:1 | Eb5:1 G5:1 C6:1 | C6:2 A5:1 | Bb5:1.5 A5:0.5 G5:1 | G5:1 Bb5:1 E6:1 | Eb6:2 C6:1 | Eb5:1 C5:1 A4:1',
        drums: 'w2'
      }
    },
    form: 'A A2 B C'
  };

  /* ---- runway: funky, A dorian, 104 bpm, I A B A (28 bars, ~65 s) ----
     The synth bass plays one riff shape on every chord: root, octave
     pop, seventh, fifth below and the seventh leading back. */
  var NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  function nm(m) { return NOTE[m % 12] + (Math.floor(m / 12) - 1); }
  function riff(root, sev, five, half) {
    var r = Game.music.midi(root);
    var map = { R: r, O: r + 12, S: r + sev, F: r + (five || -5), T: r + sev - 12 };
    var tm = half ? 'R:0.75 R:0.25 r:0.5 O:0.5' : 'R:0.75 R:0.25 r:0.5 O:0.25 S:0.25 r:0.5 F:0.5 T:0.5 R:0.5';
    return tm.replace(/[ROSFT](?=:)/g, function (k) { return nm(map[k]); });
  }
  function riffs(list) { return list.map(function (a) { return riff.apply(null, a) + ' |'; }).join(' '); }
  var funkVamp = riffs([['A2', 10], ['D3', 10], ['A2', 10], ['D3', 10]]);
  var funky = {
    bpm: 104, swing: 0.08, level: 1,
    reverb: { size: 1.6 }, delay: { beats: 0.75, feedback: 0.22 },
    tracks: {
      lead:  { inst: 'lead', vol: 0.48, cutoff: 2000, vib: 6, pan: 0.1, rev: 0.2, dly: 0.15 },
      keys:  { inst: 'epiano', vol: 0.42, auto: 'stab', rhythm: '..x...x..x....x.', gate: 0.45, octave: 4, pan: -0.2, rev: 0.15 },
      pad:   { inst: 'organ', vol: 0.18, auto: 'pad', octave: 4, rev: 0.2 },
      sb:    { inst: 'synthbass', vol: 0.62, q: 5 },
      drums: { vol: 0.52, rev: 0.05 }
    },
    grooves: {
      funk:  { kick: 'x.....x...x..x..', clap: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo', ohat: '..............x.' },
      intro: { kick: 'x.....x...x..x..', hat: 'xoxoxoxoxoxoxoxo' }
    },
    sections: {
      I: { chords: 'Am7:4 D9:4 Am7:4 D9:4', sb: funkVamp, drums: 'intro', pad: false, fill: { clap: '....x.......x.xx' } },
      A: {
        chords: 'Am7:4 D9:4 Am7:4 D9:4 Fmaj7:4 E7:4 Am7:4 Bm7b5:2 E7:2',
        sb: funkVamp + ' ' + riffs([['F2', 11], ['E2', 10], ['A2', 10], ['B2', 10, -6, true], ['E2', 10, -5, true]]),
        lead: 'r:1 E5:0.5 G5:0.5 A5:0.5 r:0.5 G5:0.25 A5:0.75 | r:0.5 C6:0.5 A5:0.5 F#5:0.5 r:1 E5:0.5 D5:0.5 | ' +
              'r:1 E5:0.5 G5:0.5 A5:0.5 C6:0.5 r:0.5 A5:0.5 | F#5:1.5 E5:0.5 D5:1 r:1 | ' +
              'r:0.5 A5:0.5 C6:0.5 E6:0.5 r:0.5 C6:0.5 A5:1 | G#5:1 B5:0.5 D6:0.5 r:1 B5:0.5 G#5:0.5 | ' +
              'A5:1.5 G5:0.5 E5:1 r:1 | F5:0.5 D5:0.5 r:0.5 B4:0.5 G#4:1 B4:1',
        drums: 'funk'
      },
      B: {
        chords: 'Dm7:4 G7:4 Cmaj7:4 Fmaj7:4 Bm7b5:4 E7:4 Am7:4 E7:4',
        sb: riffs([['D3', 10], ['G2', 10], ['C3', 11], ['F2', 11], ['B2', 10, -6], ['E2', 10], ['A2', 10], ['E2', 10]]),
        lead: 'F5:1 A5:1 C6:1.5 A5:0.5 | B5:2 r:1 G5:0.5 A5:0.5 | C6:1.5 B5:0.5 G5:1 E5:1 | A5:3 r:1 | ' +
              'D6:1 B5:1 A5:1 F5:1 | B5:2 G#5:1 E5:1 | C6:1 B5:0.5 A5:0.5 G5:1 E5:1 | G#5:1 B5:1 D6:1 B5:1',
        drums: 'funk', fill: { clap: '....x.......x.xx', tom: '..........x..x..' }
      }
    },
    form: 'I A B A'
  };

  /* ---- runway: sakura, G major (yo pentatonic melody), 96 bpm,
     I A B A B (36 bars, 90 s) ---- */
  var sakA = 'E5:1 G5:0.5 A5:0.5 B5:2 | A5:1.5 G5:0.5 A5:2 | D6:1 B5:1 A5:1.5 G5:0.5 | G5:2 E5:2 | ' +
             'E5:1 G5:0.5 A5:0.5 E6:2 | D6:1 B5:1 D6:1 E6:1 | E6:1.5 D6:0.5 B5:1 G5:1 | A5:1 G5:1 A5:2';
  var sakB = 'A5:1 C6:1 E6:2 | D6:1.5 E6:0.5 D6:1 A5:1 | B5:2 D6:1 B5:1 | G5:1.5 A5:0.5 G5:1 E5:1 | ' +
             'A5:1 C6:1 E6:1.5 D6:0.5 | D6:2 B5:1 A5:1 | G5:1 E5:1 A5:1 D6:1 | D6:1 B5:1 G5:2';
  var sakura = {
    bpm: 96, level: 1,
    reverb: { size: 2.6 }, delay: { beats: 0.75, feedback: 0.3 },
    tracks: {
      lead:  { inst: 'flute', vol: 0.62, pan: 0.1, rev: 0.4, dly: 0.2 },
      kal:   { inst: 'kalimba', vol: 0.36, auto: 'arp', pattern: 'broken', rate: 0.5, octave: 4, range: 2, pan: -0.25, rev: 0.3 },
      bell:  { inst: 'bell', vol: 0.2, auto: 'arp', pattern: 'updown', rate: 1, octave: 5, pan: 0.3, rev: 0.5, dly: 0.25 },
      pad:   { inst: 'choir', vol: 0.42, auto: 'pad', octave: 4, rev: 0.5 },
      bass:  { inst: 'bass', vol: 0.5, auto: 'bass', style: 'root5', rhythm: 'x.....x.x.......', octave: 2 },
      drums: { vol: 0.42, rev: 0.12 }
    },
    grooves: {
      pop:   { kick: 'x.......x.......', snap: '....x.......x...', shaker: '..x...x...x...x.' },
      intro: { shaker: '..x...x...x...x.', tri: 'x...............................................................' }
    },
    sections: {
      I: { chords: 'Gadd9:4 Cmaj7:4 Gadd9:4 Cmaj7:2 D:2', drums: 'intro', bell: false, bass: false },
      A: { chords: 'Cmaj7:4 D:4 Bm7:4 Em7:4 Am7:4 Bm7:4 Cmaj7:4 D7sus4:2 D7:2', lead: sakA, bell: false, drums: 'pop' },
      B: {
        chords: 'Am7:4 D:4 Gmaj7:4 Em7:4 Am7:4 Bm7:4 Cmaj7:2 D:2 G:4',
        lead: sakB, drums: 'pop', fill: { tom: '........x...x.x.', snap: '....x.......x...' }
      }
    },
    form: 'I A B A B'
  };

  Game.songs = { title: title, studio: studio, strut: strut, disco: disco, waltz: waltz, funky: funky, sakura: sakura };
})();
