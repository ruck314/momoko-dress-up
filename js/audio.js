/* audio.js – Web Audio API sound effects and bouncy music.
   Core graph and the playNote/noise primitives are shared with the other
   Momoko games. New here: the puzzle cues (correct / wrong / fail), the
   happy and sad runway stings, applause, and the catwalk beat. */
(function () {
  'use strict';
  window.Game = window.Game || {};

  var ctx = null;
  var masterGain = null;
  var musicGain = null;
  var sfxGain = null;
  var currentMusic = null;
  var muted = false;
  var initialized = false;

  function init() {
    if (initialized) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.5;
      masterGain.connect(ctx.destination);

      musicGain = ctx.createGain();
      musicGain.gain.value = 0.3;
      musicGain.connect(masterGain);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.6;
      sfxGain.connect(masterGain);

      initialized = true;
    } catch (e) { /* Web Audio not available */ }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  /* ---- primitives ---- */
  function playNote(freq, type, duration, gain, dest, startTime) {
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain || 0.3, startTime || ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, (startTime || ctx.currentTime) + duration);
    osc.connect(g);
    g.connect(dest || sfxGain);
    osc.start(startTime || ctx.currentTime);
    osc.stop((startTime || ctx.currentTime) + duration);
  }

  /* A note that glides from f0 to f1 -- the "wah" in the sad sting. */
  function slideNote(f0, f1, type, duration, gain, startTime) {
    if (!ctx) return;
    var t0 = startTime || ctx.currentTime;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(f1, t0 + duration);
    g.gain.setValueAtTime(gain || 0.25, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g);
    g.connect(sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration);
  }

  function noise(duration, dest, startTime, gain) {
    if (!ctx) return;
    var bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    var g = ctx.createGain();
    g.gain.setValueAtTime(gain || 0.15, startTime || ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, (startTime || ctx.currentTime) + duration);
    src.connect(g);
    g.connect(dest || sfxGain);
    src.start(startTime || ctx.currentTime);
  }

  /* ---- SFX ---- */
  function menuSelect() {
    if (!ctx) return;
    playNote(620, 'square', 0.06, 0.14, sfxGain);
  }

  /* A soft two-note "nope" for taps that do nothing. */
  function deny() {
    if (!ctx) return;
    var t = ctx.currentTime;
    playNote(200, 'square', 0.08, 0.18, sfxGain, t);
    playNote(150, 'square', 0.12, 0.18, sfxGain, t + 0.08);
  }

  /* Keypad tap. */
  function tap() {
    if (!ctx) return;
    playNote(880, 'sine', 0.05, 0.12, sfxGain);
  }

  /* Right answer: a quick rising sparkle. */
  function correct() {
    if (!ctx) return;
    var t = ctx.currentTime;
    var notes = [659, 784, 988, 1319];
    for (var i = 0; i < notes.length; i++) {
      playNote(notes[i], 'triangle', 0.16, 0.24, sfxGain, t + i * 0.07);
      playNote(notes[i] * 2, 'sine', 0.12, 0.08, sfxGain, t + i * 0.07);
    }
  }

  /* Wrong answer: a gentle downward boing, nothing scary. */
  function wrong() {
    if (!ctx) return;
    var t = ctx.currentTime;
    slideNote(420, 260, 'triangle', 0.22, 0.22, t);
    playNote(180, 'sine', 0.2, 0.12, sfxGain, t + 0.05);
  }

  /* Out of tries: the classic sad trombone, softened. */
  function fail() {
    if (!ctx) return;
    var t = ctx.currentTime;
    slideNote(330, 311, 'triangle', 0.3, 0.2, t);
    slideNote(311, 294, 'triangle', 0.3, 0.2, t + 0.32);
    slideNote(294, 220, 'triangle', 0.7, 0.2, t + 0.64);
  }

  /* An item goes on: a pop and a shimmer. */
  function wear() {
    if (!ctx) return;
    var t = ctx.currentTime;
    noise(0.03, sfxGain, t, 0.3);
    playNote(523, 'triangle', 0.08, 0.2, sfxGain, t);
    playNote(784, 'triangle', 0.1, 0.18, sfxGain, t + 0.06);
    for (var i = 0; i < 3; i++) playNote(1568 + i * 200, 'sine', 0.1, 0.07, sfxGain, t + 0.14 + i * 0.04);
  }

  /* Camera flash at the end of the runway. */
  function camera() {
    if (!ctx) return;
    var t = ctx.currentTime;
    noise(0.04, sfxGain, t, 0.35);
    playNote(2200, 'square', 0.03, 0.1, sfxGain, t);
    playNote(1400, 'sine', 0.08, 0.1, sfxGain, t + 0.03);
  }

  /* Happy sting for a model who passed: a giggly major arpeggio. */
  function happy() {
    if (!ctx) return;
    var t = ctx.currentTime;
    var notes = [523, 659, 784, 1047, 784, 1047];
    for (var i = 0; i < notes.length; i++) {
      playNote(notes[i], 'triangle', 0.14, 0.22, sfxGain, t + i * 0.08);
    }
    playNote(1319, 'sine', 0.4, 0.14, sfxGain, t + 0.5);
  }

  /* Sad sting for a model who missed: three droopy notes. */
  function sad() {
    if (!ctx) return;
    var t = ctx.currentTime;
    playNote(392, 'triangle', 0.22, 0.2, sfxGain, t);
    playNote(349, 'triangle', 0.22, 0.2, sfxGain, t + 0.24);
    slideNote(330, 262, 'triangle', 0.6, 0.2, t + 0.48);
  }

  /* Crowd applause: a cloud of little noise bursts. */
  function applause() {
    if (!ctx) return;
    var t = ctx.currentTime;
    for (var i = 0; i < 26; i++) {
      noise(0.03 + Math.random() * 0.03, sfxGain, t + i * 0.055 + Math.random() * 0.03, 0.12 + Math.random() * 0.1);
    }
  }

  function fanfare() {
    if (!ctx) return;
    var t = ctx.currentTime;
    var notes = [523, 587, 659, 784, 659, 784, 1047];
    var dur = [0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.5];
    var time = t;
    for (var i = 0; i < notes.length; i++) {
      playNote(notes[i], 'triangle', dur[i], 0.28, sfxGain, time);
      playNote(notes[i] * 0.5, 'sine', dur[i], 0.14, sfxGain, time);
      time += dur[i];
    }
  }

  function sparkle() {
    if (!ctx) return;
    var t = ctx.currentTime;
    for (var i = 0; i < 4; i++) {
      playNote(880 + i * 220, 'sine', 0.12, 0.12, sfxGain, t + i * 0.05);
    }
  }

  /* ---- Music ---- */
  var musicInterval = null;

  /* Studio BGM – a bright, bouncy pop tune in C that loops without a seam. */
  var studioPattern = [
    [523, 'triangle'], [659, 'triangle'], [784, 'triangle'], [659, 'triangle'],
    [698, 'triangle'], [880, 'triangle'], [784, 'triangle'], [659, 'triangle'],
    [587, 'triangle'], [698, 'triangle'], [880, 'triangle'], [698, 'triangle'],
    [784, 'triangle'], [659, 'triangle'], [587, 'triangle'], [523, 'triangle'],
    [659, 'triangle'], [784, 'triangle'], [1047, 'triangle'], [784, 'triangle'],
    [880, 'triangle'], [784, 'triangle'], [698, 'triangle'], [659, 'triangle'],
    [587, 'triangle'], [659, 'triangle'], [698, 'triangle'], [587, 'triangle'],
    [523, 'triangle'], [587, 'triangle'], [659, 'triangle'], [523, 'triangle'],
  ];
  var studioBass = [
    131, 131, 196, 196, 175, 175, 131, 131,
    147, 147, 220, 220, 196, 196, 131, 131,
    165, 165, 196, 196, 175, 175, 147, 147,
    147, 147, 175, 175, 131, 131, 196, 131,
  ];

  /* Title – the same tune, lighter and a touch slower. */
  var titlePattern = studioPattern.map(function (n) { return [n[0], 'sine']; });
  var titleBass = studioBass;

  /* ---- Runway soundtracks ----
     Five different catwalk tunes; startMusic('runway') picks one at
     random each show. Each is { pattern, bass, tempo, lead, type, kick }.
     A 0 in a pattern is a rest. */
  var RUNWAY_TRACKS = [
    /* 1. Strut – four-on-the-floor in A minor with a bright hook. */
    {
      name: 'strut', tempo: 126, lead: 0.07, type: 'square', kick: true,
      pattern: [880, 0, 1047, 880, 988, 0, 784, 0, 880, 0, 1175, 1047, 988, 880, 784, 0,
                698, 0, 880, 698, 784, 0, 988, 0, 1047, 988, 880, 784, 880, 0, 0, 0],
      bass: [110, 110, 110, 110, 131, 131, 131, 131, 110, 110, 110, 110, 98, 98, 98, 98,
             87, 87, 87, 87, 98, 98, 98, 98, 131, 131, 131, 131, 110, 110, 110, 110],
    },
    /* 2. Disco – C major, octave-bouncing bass, syncopated triangle lead. */
    {
      name: 'disco', tempo: 118, lead: 0.12, type: 'triangle', kick: true,
      pattern: [1047, 0, 1047, 1175, 1319, 0, 1175, 1047, 988, 0, 988, 1047, 1175, 0, 0, 0,
                880, 0, 880, 1047, 1319, 0, 1175, 1047, 1175, 0, 1319, 0, 1568, 0, 0, 0],
      bass: [131, 262, 131, 262, 131, 262, 131, 262, 175, 349, 175, 349, 175, 349, 175, 349,
             110, 220, 110, 220, 110, 220, 110, 220, 196, 392, 196, 392, 196, 392, 196, 392],
    },
    /* 3. Sparkle Waltz – a quick one-two-three in G, sine lead. */
    {
      name: 'waltz', tempo: 168, lead: 0.13, type: 'sine', kick: false,
      pattern: [784, 988, 1175, 1568, 1175, 988, 880, 1047, 1319, 1760, 1319, 1047,
                988, 1175, 1480, 1976, 1480, 1175, 1175, 988, 880, 784, 0, 0],
      bass: [98, 196, 196, 98, 196, 196, 110, 220, 220, 110, 220, 220,
             123, 247, 247, 123, 247, 247, 147, 294, 294, 98, 196, 196],
    },
    /* 4. Funky – E minor pentatonic, sawtooth stabs over a slap bass. */
    {
      name: 'funky', tempo: 104, lead: 0.06, type: 'sawtooth', kick: true,
      pattern: [659, 0, 784, 659, 0, 880, 0, 659, 988, 0, 880, 784, 0, 659, 0, 0,
                587, 0, 659, 0, 784, 880, 0, 784, 659, 0, 587, 0, 659, 0, 0, 0],
      bass: [82, 0, 82, 165, 0, 82, 123, 0, 82, 0, 82, 165, 0, 110, 123, 0,
             73, 0, 73, 147, 0, 73, 110, 0, 82, 0, 82, 165, 0, 98, 82, 0],
    },
    /* 5. Sakura Pop – bright J-pop in D major pentatonic. */
    {
      name: 'sakura', tempo: 132, lead: 0.12, type: 'triangle', kick: true,
      pattern: [1175, 1319, 1480, 1760, 1480, 1319, 1175, 0, 988, 1175, 1319, 1175, 988, 880, 0, 0,
                1175, 1319, 1480, 1760, 1976, 1760, 1480, 1319, 1480, 1319, 1175, 988, 1175, 0, 0, 0],
      bass: [147, 147, 220, 220, 123, 123, 185, 185, 110, 110, 165, 165, 98, 98, 147, 147,
             147, 147, 220, 220, 123, 123, 185, 185, 110, 110, 165, 165, 147, 147, 147, 147],
    },
  ];
  var lastRunwayTrack = -1;

  function startMusic(type, trackIdx) {
    stopMusic();
    if (!ctx || muted) return;
    var pattern, bass, tempo, lead, kick = false, leadType = null;
    if (type === 'title') {
      pattern = titlePattern; bass = titleBass; tempo = 112; lead = 0.14;
    } else if (type === 'runway') {
      /* A different tune every show: never the same one twice running. */
      var idx = (typeof trackIdx === 'number') ? trackIdx : Math.floor(Math.random() * RUNWAY_TRACKS.length);
      if (typeof trackIdx !== 'number' && idx === lastRunwayTrack) idx = (idx + 1 + Math.floor(Math.random() * (RUNWAY_TRACKS.length - 1))) % RUNWAY_TRACKS.length;
      lastRunwayTrack = idx;
      var tr = RUNWAY_TRACKS[idx];
      pattern = tr.pattern; bass = tr.bass; tempo = tr.tempo; lead = tr.lead; kick = tr.kick; leadType = tr.type;
    } else {
      pattern = studioPattern; bass = studioBass; tempo = 124; lead = 0.13;
    }
    var beatDur = 60 / tempo;
    var noteIdx = 0;

    function scheduleNotes() {
      if (!ctx || muted) return;
      var t = ctx.currentTime;
      for (var i = 0; i < 4; i++) {
        var idx2 = (noteIdx + i) % pattern.length;
        var note = pattern[idx2];
        var freq = leadType ? note : note[0];
        var ntype = leadType || note[1];
        var bNote = bass[idx2 % bass.length];
        var when = t + i * beatDur;
        if (freq > 0) playNote(freq, ntype, beatDur * 0.8, lead, musicGain, when);
        if (bNote > 0) playNote(bNote, kick ? 'triangle' : 'sine', beatDur * 0.9, kick ? 0.16 : 0.11, musicGain, when);
        if (kick) {
          /* kick on every beat, hat on the off-beat */
          slideNote(150, 50, 'sine', 0.12, 0.3, when);
          noise(0.025, musicGain, when + beatDur / 2, 0.08);
        }
      }
      noteIdx = (noteIdx + 4) % pattern.length;
    }

    scheduleNotes();
    musicInterval = setInterval(scheduleNotes, beatDur * 4 * 1000);
    currentMusic = type;
  }

  function stopMusic() {
    if (musicInterval) {
      clearInterval(musicInterval);
      musicInterval = null;
    }
    currentMusic = null;
  }

  function toggleMute() {
    muted = !muted;
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.5;
    if (muted) stopMusic();
    return muted;
  }

  function setMuted(m) {
    muted = !!m;
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.5;
    if (muted) stopMusic();
  }

  window.Game.audio = {
    init: init,
    resume: resume,
    play: function (name) {
      if (muted || !ctx) return;
      resume();
      switch (name) {
        case 'select': menuSelect(); break;
        case 'deny': deny(); break;
        case 'tap': tap(); break;
        case 'correct': correct(); break;
        case 'wrong': wrong(); break;
        case 'fail': fail(); break;
        case 'wear': wear(); break;
        case 'camera': camera(); break;
        case 'happy': happy(); break;
        case 'sad': sad(); break;
        case 'applause': applause(); break;
        case 'fanfare': fanfare(); break;
        case 'sparkle': sparkle(); break;
      }
    },
    now: function () { return ctx ? ctx.currentTime : 0; },
    startMusic: function (type, trackIdx) { resume(); startMusic(type, trackIdx); },
    runwayTrackCount: function () { return RUNWAY_TRACKS.length; },
    lastRunwayTrack: function () { return lastRunwayTrack; },
    stopMusic: stopMusic,
    toggleMute: toggleMute,
    setMuted: setMuted,
    isMuted: function () { return muted; },
    currentMusic: function () { return currentMusic; },
  };
})();
