/* audio.js – Web Audio API sound effects, and the music player.
   Core graph and the playNote/noise primitives are shared with the other
   Momoko games; the songs are in songs.js, played by music.js. New here:
   the puzzle cues (correct / wrong / fail), the happy and sad runway
   stings, applause, and the five runway shows. */
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

      player = Game.music.createPlayer(ctx, musicGain);
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

  /* Happy sting for a model who passed: a giggly major arpeggio on
     marimba, a bell on top. */
  function happy() {
    if (!ctx) return;
    var M = Game.music, t = ctx.currentTime;
    var notes = ['C5', 'E5', 'G5', 'C6', 'G5', 'C6'];
    for (var i = 0; i < notes.length; i++) {
      M.voice(ctx, sfxGain, 'marimba', notes[i], t + i * 0.08, 0.14, 0.45, { decay: 0.2 });
      M.voice(ctx, sfxGain, 'bell', notes[i], t + i * 0.08, 0.14, 0.15);
    }
    M.voice(ctx, sfxGain, 'bell', 'E6', t + 0.5, 0.4, 0.4);
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

  /* The winner's fanfare: the same rising call on brass with a bell on
     top, landing on a full C chord with a cymbal. */
  function fanfare() {
    if (!ctx) return;
    var M = Game.music, t = ctx.currentTime;
    var notes = ['C5', 'D5', 'E5', 'G5', 'E5', 'G5', 'C6'];
    var dur = [0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.5];
    var time = t;
    for (var i = 0; i < notes.length; i++) {
      M.voice(ctx, sfxGain, 'brass', notes[i], time, dur[i] * 0.85, 0.55);
      M.voice(ctx, sfxGain, 'bell', notes[i], time, dur[i], 0.25);
      time += dur[i];
    }
    var last = time - 0.5;
    var chord = ['C4', 'E4', 'G4'];
    for (var k = 0; k < chord.length; k++) M.voice(ctx, sfxGain, 'brass', chord[k], last, 0.5, 0.4);
    M.voice(ctx, sfxGain, 'bass', 'C3', last, 0.5, 0.45);
    M.drum(ctx, sfxGain, 'crash', last, 0.35);
    M.drum(ctx, sfxGain, 'tri', last, 0.5);
  }

  function sparkle() {
    if (!ctx) return;
    var t = ctx.currentTime;
    for (var i = 0; i < 4; i++) {
      playNote(880 + i * 220, 'sine', 0.12, 0.12, sfxGain, t + i * 0.05);
    }
  }

  /* ---- Music ----
     The songs live in songs.js and play through the shared sequencer in
     music.js (look-ahead scheduled, so the beat never drifts). */
  var player = null;

  /* Five catwalk tunes; startMusic('runway') picks one at random each
     show, never the same one twice running. */
  var RUNWAY_TRACKS = ['strut', 'disco', 'waltz', 'funky', 'sakura'];
  var lastRunwayTrack = -1;

  function startMusic(type, trackIdx) {
    if (!ctx || muted || !player) { stopMusic(); return; }
    if (type === currentMusic && (type !== 'runway' || typeof trackIdx !== 'number' || trackIdx === lastRunwayTrack)) return;
    var name = type, song;
    if (type === 'runway') {
      var idx = (typeof trackIdx === 'number') ? trackIdx : Math.floor(Math.random() * RUNWAY_TRACKS.length);
      if (typeof trackIdx !== 'number' && idx === lastRunwayTrack) idx = (idx + 1 + Math.floor(Math.random() * (RUNWAY_TRACKS.length - 1))) % RUNWAY_TRACKS.length;
      lastRunwayTrack = idx;
      song = Game.songs[RUNWAY_TRACKS[idx]];
      name = 'runway:' + RUNWAY_TRACKS[idx];
    } else {
      song = Game.songs[type === 'title' ? 'title' : 'studio'];
    }
    player.play(song, { name: name });
    currentMusic = type;
  }

  function stopMusic() {
    if (player) player.stop(0.4);
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
