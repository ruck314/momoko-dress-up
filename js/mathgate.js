/* mathgate.js – the puzzle every wardrobe change (and the runway pose)
   has to pass.
 *
 * In English the puzzle is arithmetic: times tables 1-9 and three-digit
 * addition / subtraction with answers from 0 to 999. In Japanese it is a
 * kanji reading from the grade 1-2 list in kanji.js, typed in hiragana.
 *
 * Each puzzle type keeps its own skill level (0..4) in Game.progress.
 * First-try answers nudge it up, misses pull it down, so the questions
 * track what she can do without ever stalling the dress-up.
 *
 * The gate owns its own popup: the question, the answer box, the hearts
 * for tries left, and either a number pad or a kana keypad. Engine opens
 * it with open(); it reports back through the onResolve callback.
 */
(function () {
  'use strict';
  window.Game = window.Game || {};
  var W = 800, H = 480;

  /* ---- Progress (persisted by engine.js) ---- */
  function progress() {
    if (!Game.progress) Game.progress = {};
    var p = Game.progress;
    if (typeof p.mathSkill !== 'number') p.mathSkill = 0;
    if (typeof p.kanjiSkill !== 'number') p.kanjiSkill = 0;
    if (typeof p.stars !== 'number') p.stars = 0;
    if (typeof p.solved !== 'number') p.solved = 0;
    if (typeof p.missed !== 'number') p.missed = 0;
    return p;
  }

  function isKanjiMode() { return Game.i18n.getLang() === 'ja'; }
  function skillKey() { return isKanjiMode() ? 'kanjiSkill' : 'mathSkill'; }

  function rnd(n) { return Math.floor(Math.random() * n); }
  function range(a, b) { return a + rnd(b - a + 1); }
  function pick(arr) { return arr[rnd(arr.length)]; }

  /* The level a new question is pitched at: the skill rounded, with a
     one-in-four wobble a step either way so the same level never feels
     like a wall. */
  function currentLevel() {
    var s = progress()[skillKey()];
    var lvl = Math.round(s);
    var r = Math.random();
    if (r < 0.12) lvl--;
    else if (r < 0.24) lvl++;
    return Math.max(0, Math.min(4, lvl));
  }

  /* Skill update after a question. tries is 1-based; ok false = gave up. */
  function recordResult(ok, tries) {
    var p = progress();
    var k = skillKey();
    var d;
    if (!ok) d = -0.6;
    else if (tries === 1) d = 0.35;
    else if (tries === 2) d = 0.12;
    else d = -0.1;
    p[k] = Math.max(0, Math.min(4, p[k] + d));
    if (ok) { p.solved++; p.stars += (tries === 1 ? 2 : 1); }
    else p.missed++;
  }

  /* ================================================================
     Arithmetic
     ================================================================ */
  function digits(n) { return [Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10]; }
  function carries(a, b) {
    var da = digits(a), db = digits(b), c = 0, n = 0;
    for (var i = 2; i >= 0; i--) {
      var s = da[i] + db[i] + c;
      c = s >= 10 ? 1 : 0;
      n += c;
    }
    return n;
  }
  function borrows(a, b) {
    var da = digits(a), db = digits(b), br = 0, n = 0;
    for (var i = 2; i >= 0; i--) {
      var d = da[i] - db[i] - br;
      br = d < 0 ? 1 : 0;
      n += br;
    }
    return n;
  }

  function makeMult(level) {
    var a, b;
    switch (level) {
      case 0: a = range(1, 3); b = range(1, 5); break;
      case 1: a = range(2, 5); b = range(2, 6); break;
      case 2: a = range(2, 7); b = range(2, 9); break;
      case 3: a = range(3, 9); b = range(3, 9); break;
      default: a = range(6, 9); b = range(6, 9); break;
    }
    if (Math.random() < 0.5) { var tmp = a; a = b; b = tmp; }
    return { kind: 'math', text: a + ' × ' + b, answers: [String(a * b)], answer: String(a * b) };
  }

  /* Pull random pairs until the carry / borrow count matches the level. */
  function makeAdd(level) {
    var want = [0, 0, 1, 2, 2][level];
    var bDigits = level === 0 ? 2 : 3;
    var a = 0, b = 0;
    for (var i = 0; i < 300; i++) {
      a = range(100, 899);
      b = bDigits === 2 ? range(10, 99) : range(100, 899);
      if (a + b > 999) continue;
      var c = carries(a, b);
      if (level === 4 ? c >= 1 : c === want) break;
    }
    if (a + b > 999) { a = 123; b = 45; }
    return { kind: 'math', text: a + ' + ' + b, answers: [String(a + b)], answer: String(a + b) };
  }

  function makeSub(level) {
    var want = [0, 0, 1, 2, 2][level];
    var bDigits = level === 0 ? 2 : 3;
    var a = 0, b = 0;
    for (var i = 0; i < 300; i++) {
      a = range(100, 999);
      b = bDigits === 2 ? range(10, 99) : range(100, 899);
      if (b > a) continue;
      /* top level: borrowing across a zero, the trickiest second-grade case */
      if (level === 4 && digits(a)[1] !== 0 && Math.random() < 0.7) continue;
      var br = borrows(a, b);
      if (level === 4 ? br >= 1 : br === want) break;
    }
    if (b > a) { a = 456; b = 123; }
    return { kind: 'math', text: a + ' − ' + b, answers: [String(a - b)], answer: String(a - b) };
  }

  function makeMath(level) {
    var r = Math.random();
    if (r < 0.4) return makeMult(level);
    if (r < 0.7) return makeAdd(level);
    return makeSub(level);
  }

  /* ================================================================
     Kanji
     ================================================================ */
  function kanjiByGrade(g) {
    var out = [];
    for (var i = 0; i < Game.KANJI.length; i++) if (Game.KANJI[i].g === g) out.push(Game.KANJI[i]);
    return out;
  }
  function hasKana(s) { return /[ぁ-ゟ]/.test(s); }

  /* A bare kanji accepts every reading: on, kun stem, kun with okurigana,
     and any word that is just the kanji on its own. */
  function bareAnswers(k) {
    var set = {};
    var i;
    for (i = 0; i < k.on.length; i++) set[k.on[i]] = true;
    for (i = 0; i < k.kun.length; i++) {
      var parts = k.kun[i].split('.');
      set[parts[0]] = true;
      set[parts.join('')] = true;
    }
    for (i = 0; i < k.words.length; i++) {
      if (k.words[i].w === k.k) for (var r = 0; r < k.words[i].r.length; r++) set[k.words[i].r[r]] = true;
    }
    return Object.keys(set);
  }
  function bareProblem(k) {
    var ans = bareAnswers(k);
    /* The "model" answer shown after a miss: the first kun reading if
       there is one (that is what a 2nd grader learns first), else on. */
    var show = k.kun.length ? k.kun[0].replace('.', '') : k.on[0];
    return { kind: 'kanji', text: k.k, answers: ans, answer: show };
  }
  function wordProblem(k, wantCompound) {
    var cands = [];
    for (var i = 0; i < k.words.length; i++) {
      var w = k.words[i];
      if (w.w === k.k) continue;
      var compound = !hasKana(w.w);
      if (wantCompound === undefined || compound === wantCompound) cands.push(w);
    }
    if (!cands.length) return null;
    var w2 = pick(cands);
    return { kind: 'kanji', text: w2.w, answers: w2.r.slice(), answer: w2.r[0] };
  }

  function makeKanji(level) {
    var g1 = kanjiByGrade(1), g2 = kanjiByGrade(2);
    var p = null, r = Math.random();
    for (var attempt = 0; attempt < 20 && !p; attempt++) {
      switch (level) {
        case 0: p = bareProblem(pick(g1)); break;
        case 1: p = r < 0.5 ? bareProblem(pick(g1)) : wordProblem(pick(g1), false); break;
        case 2: p = r < 0.6 ? bareProblem(pick(g2)) : wordProblem(pick(g1)); break;
        case 3: p = r < 0.6 ? wordProblem(pick(g2), false) : bareProblem(pick(g2)); break;
        default: p = r < 0.6 ? wordProblem(pick(g2), true) : wordProblem(pick(g2), false); break;
      }
    }
    return p || bareProblem(pick(g1));
  }

  function makeProblem() {
    var lvl = currentLevel();
    return isKanjiMode() ? makeKanji(lvl) : makeMath(lvl);
  }

  /* ================================================================
     Kana keypad: the 50-sound table plus ゛ ゜ small ー
     ================================================================ */
  var KANA_COLS = [
    ['あ', 'い', 'う', 'え', 'お'], ['か', 'き', 'く', 'け', 'こ'], ['さ', 'し', 'す', 'せ', 'そ'],
    ['た', 'ち', 'つ', 'て', 'と'], ['な', 'に', 'ぬ', 'ね', 'の'], ['は', 'ひ', 'ふ', 'へ', 'ほ'],
    ['ま', 'み', 'む', 'め', 'も'], ['や', '', 'ゆ', '', 'よ'], ['ら', 'り', 'る', 'れ', 'ろ'],
    ['わ', '', 'を', '', 'ん'],
  ];
  var DAKU = { 'か': 'が', 'き': 'ぎ', 'く': 'ぐ', 'け': 'げ', 'こ': 'ご', 'さ': 'ざ', 'し': 'じ', 'す': 'ず', 'せ': 'ぜ', 'そ': 'ぞ',
    'た': 'だ', 'ち': 'ぢ', 'つ': 'づ', 'て': 'で', 'と': 'ど', 'は': 'ば', 'ひ': 'び', 'ふ': 'ぶ', 'へ': 'べ', 'ほ': 'ぼ',
    'ぱ': 'ば', 'ぴ': 'び', 'ぷ': 'ぶ', 'ぺ': 'べ', 'ぽ': 'ぼ' };
  var HANDAKU = { 'は': 'ぱ', 'ひ': 'ぴ', 'ふ': 'ぷ', 'へ': 'ぺ', 'ほ': 'ぽ', 'ば': 'ぱ', 'び': 'ぴ', 'ぶ': 'ぷ', 'べ': 'ぺ', 'ぼ': 'ぽ' };
  var SMALL = { 'あ': 'ぁ', 'い': 'ぃ', 'う': 'ぅ', 'え': 'ぇ', 'お': 'ぉ', 'や': 'ゃ', 'ゆ': 'ゅ', 'よ': 'ょ', 'つ': 'っ', 'わ': 'ゎ' };
  function invert(m) { var o = {}; for (var k in m) o[m[k]] = k; return o; }
  var UNDAKU = invert(DAKU), UNHANDAKU = invert(HANDAKU), UNSMALL = invert(SMALL);

  function applyModifier(text, mod) {
    if (!text) return text;
    var last = text.slice(-1), head = text.slice(0, -1), out;
    if (mod === 'daku') out = DAKU[last] || UNDAKU[last];
    else if (mod === 'handaku') out = HANDAKU[last] || UNHANDAKU[last];
    else out = SMALL[last] || UNSMALL[last];
    return out ? head + out : text;
  }

  /* Romaji typed on a real keyboard, for desktop play. Longest match
     first; an unmatched run just waits for the next letter. */
  var ROMAJI = {
    a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
    ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ', ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
    sa: 'さ', shi: 'し', si: 'し', su: 'す', se: 'せ', so: 'そ', za: 'ざ', ji: 'じ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
    ta: 'た', chi: 'ち', ti: 'ち', tsu: 'つ', tu: 'つ', te: 'て', to: 'と', da: 'だ', di: 'ぢ', du: 'づ', de: 'で', 'do': 'ど',
    na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
    ha: 'は', hi: 'ひ', fu: 'ふ', hu: 'ふ', he: 'へ', ho: 'ほ', ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
    pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
    ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も', ya: 'や', yu: 'ゆ', yo: 'よ',
    ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ', wa: 'わ', wo: 'を',
    kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ', gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
    sha: 'しゃ', shu: 'しゅ', sho: 'しょ', sya: 'しゃ', syu: 'しゅ', syo: 'しょ', ja: 'じゃ', ju: 'じゅ', jo: 'じょ',
    cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ',
    nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ', hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ', bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
    pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ', mya: 'みゃ', myu: 'みゅ', myo: 'みょ', rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
    xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ', xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', xtu: 'っ', xtsu: 'っ', ltu: 'っ',
    '-': 'ー',
  };
  var roman = '';
  function isConsonant(ch) { return 'bcdfghjklmpqrstvwxyz'.indexOf(ch) >= 0; }
  function isPrefix(str) {
    for (var k in ROMAJI) if (k.indexOf(str) === 0) return true;
    return false;
  }
  function feedRomaji(ch) {
    roman += ch;
    /* doubled consonant = っ (kk -> っk), but not n */
    if (roman.length >= 2 && roman[0] === roman[1] && isConsonant(roman[0]) && roman[0] !== 'n') {
      gate.input += 'っ';
      roman = roman.slice(1);
    }
    /* n before a consonant (other than y) = ん */
    if (roman[0] === 'n' && roman.length >= 2 && 'aiueoyn'.indexOf(roman[1]) < 0) {
      gate.input += 'ん';
      roman = roman.slice(1);
    }
    /* nn: ん, then the second n starts the next syllable if a vowel
       follows (onna -> おんな), otherwise it is spent (kannji -> かんじ) */
    if (roman.indexOf('nn') === 0) {
      if (roman.length < 3) return;             /* wait for the next letter */
      gate.input += 'ん';
      roman = ('aiueoy'.indexOf(roman[2]) >= 0) ? roman.slice(1) : roman.slice(2);
      if (!roman) return;
    }
    if (ROMAJI[roman]) {
      gate.input += ROMAJI[roman];
      roman = '';
      return;
    }
    /* still a prefix of something? keep waiting; otherwise drop the junk */
    if (!isPrefix(roman)) {
      roman = roman.slice(-1);
      if (!isPrefix(roman)) roman = '';
    }
  }
  function flushRomaji() {
    if (roman === 'n' || roman === 'nn') gate.input += 'ん';
    roman = '';
  }

  /* ================================================================
     Gate state
     ================================================================ */
  var gate = {
    open: false,
    mode: 'studio',         /* 'studio' (cancel allowed) or 'runway' */
    problem: null,
    input: '',
    tries: 0,
    maxTries: 3,
    phase: 'ask',           /* ask | right | wrongFlash | fail */
    phaseTimer: 0,
    shake: 0,
    onResolve: null,
    title: '',
    icon: null,             /* optional fn(c, cx, cy) painting what she picked */
    t: 0,
  };

  function open(opts) {
    opts = opts || {};
    progress();
    gate.open = true;
    gate.mode = opts.mode || 'studio';
    gate.maxTries = opts.maxTries || (gate.mode === 'runway' ? 4 : 3);
    gate.problem = makeProblem();
    gate.input = '';
    gate.tries = 0;
    gate.phase = 'ask';
    gate.phaseTimer = 0;
    gate.shake = 0;
    gate.onResolve = opts.onResolve || null;
    gate.title = opts.title || Game.i18n.t(gate.mode === 'runway' ? 'gateRunwayTitle' : 'gateTitle');
    gate.icon = opts.icon || null;
    roman = '';
    Game.input.setKeyCapture(onKey);
  }

  function close(result) {
    gate.open = false;
    Game.input.setKeyCapture(null);
    var cb = gate.onResolve;
    gate.onResolve = null;
    if (cb) cb(result);
  }

  function resolveNow() {
    if (gate.phase === 'right') close({ ok: true, tries: gate.tries });
    else close({ ok: false, tries: gate.tries });
  }

  function submit() {
    if (gate.phase !== 'ask') return;
    flushRomaji();
    var ans = gate.input.trim();
    if (!ans) { Game.audio.play('deny'); return; }
    gate.tries++;
    var ok = false;
    for (var i = 0; i < gate.problem.answers.length; i++) {
      if (gate.problem.answers[i] === ans) { ok = true; break; }
    }
    if (ok) {
      Game.audio.play('correct');
      recordResult(true, gate.tries);
      gate.phase = 'right';
      gate.phaseTimer = 55;
      return;
    }
    if (gate.tries >= gate.maxTries) {
      Game.audio.play('fail');
      recordResult(false, gate.tries);
      gate.phase = 'fail';
      gate.phaseTimer = 150;
      return;
    }
    Game.audio.play('wrong');
    gate.phase = 'wrongFlash';
    gate.phaseTimer = 40;
    gate.shake = 14;
  }

  function cancel() {
    if (gate.mode !== 'studio' || gate.phase !== 'ask') return;
    Game.audio.play('select');
    close({ ok: false, tries: gate.tries, cancelled: true });
  }

  function typeChar(ch) {
    if (gate.phase !== 'ask') return;
    var max = gate.problem.kind === 'math' ? 3 : 10;
    if (gate.input.length >= max) return;
    gate.input += ch;
    Game.audio.play('tap');
  }
  function backspace() {
    if (gate.phase !== 'ask') return;
    if (roman) { roman = ''; return; }
    gate.input = gate.input.slice(0, -1);
    Game.audio.play('tap');
  }

  /* Keyboard while the gate is open (input.js routes everything here). */
  function onKey(down, code) {
    if (!down || !code) return false;
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      if (gate.phase === 'ask') submit();
      else if (gate.phaseTimer > 0) gate.phaseTimer = 1;
      return true;
    }
    if (code === 'Backspace') { backspace(); return true; }
    if (gate.problem.kind === 'math') {
      var m = /^(Digit|Numpad)(\d)$/.exec(code);
      if (m) { typeChar(m[2]); return true; }
      return false;
    }
    var km = /^Key([A-Z])$/.exec(code);
    if (km) { if (gate.phase === 'ask') feedRomaji(km[1].toLowerCase()); return true; }
    if (code === 'Minus') { if (gate.phase === 'ask') gate.input += 'ー'; return true; }
    return false;
  }

  function update() {
    gate.t++;
    /* Escape / the pause button backs out of a studio puzzle */
    if (Game.input.justPressed.pause) cancel();
    if (gate.shake > 0) gate.shake--;
    if (gate.phaseTimer > 0) {
      gate.phaseTimer--;
      if (gate.phaseTimer === 0) {
        if (gate.phase === 'wrongFlash') { gate.phase = 'ask'; gate.input = ''; roman = ''; }
        else resolveNow();
      }
    }
  }

  /* ================================================================
     Layout
     ================================================================ */
  var MATH = {
    panel: { x: 150, y: 50, w: 500, h: 380 },
    pad: { x: 430, y: 150, keyW: 60, keyH: 48, gap: 8 },
    answer: { x: 190, y: 230, w: 210, h: 54 },
    cancel: { x: 190, y: 372, w: 110, h: 36 },
  };
  /* Kana keys are 44px logical (about 41pt on an iPad): finger-sized. */
  var KANJI = {
    panel: { x: 12, y: 24, w: 776, h: 432 },
    grid: { x: 292, y: 92, cell: 44, gap: 4 },
    mods: { y: 338, h: 46 },
    answer: { x: 36, y: 236, w: 236, h: 54 },
    cancel: { x: 36, y: 398, w: 110, h: 36 },
  };

  function mathKeyRect(i) {
    /* 1 2 3 / 4 5 6 / 7 8 9 / ⌫ 0 ✓ */
    var col = i % 3, row = Math.floor(i / 3);
    var P = MATH.pad;
    return { x: P.x + col * (P.keyW + P.gap), y: P.y + row * (P.keyH + P.gap), w: P.keyW, h: P.keyH };
  }
  var MATH_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];

  function kanaRect(col, row) {
    var G = KANJI.grid;
    return { x: G.x + col * (G.cell + G.gap), y: G.y + row * (G.cell + G.gap), w: G.cell, h: G.cell };
  }
  /* modifier row: ゛ ゜ 小 ー ⌫ OK */
  var KANA_MODS = ['daku', 'handaku', 'small', 'long', 'back', 'ok'];
  function modRect(i) {
    var G = KANJI.grid;
    var widths = [58, 58, 58, 58, 72, 142];
    var x = G.x;
    for (var k = 0; k < i; k++) x += widths[k] + 6;
    return { x: x, y: KANJI.mods.y, w: widths[i], h: KANJI.mods.h };
  }

  function triesLeft() { return gate.maxTries - gate.tries; }

  /* ================================================================
     Drawing
     ================================================================ */
  function draw(c) {
    if (!gate.open) return;
    var U = Game.ui, E = Game.entities, PAL = Game.PAL, T = Game.i18n.t;
    var V = U.VIEW;
    c.save();
    c.fillStyle = 'rgba(43, 21, 48, 0.62)';
    c.fillRect(V.x, V.y, V.w, V.h);

    var isMath = gate.problem.kind === 'math';
    var L = isMath ? MATH : KANJI;
    var P = L.panel;
    var sx = gate.shake > 0 ? Math.sin(gate.shake * 1.8) * gate.shake * 0.7 : 0;
    c.translate(sx, 0);

    /* card */
    c.fillStyle = 'rgba(43, 21, 48, 0.25)';
    E.roundRect(c, P.x, P.y + 6, P.w, P.h, 16);
    c.fill();
    U.panel(c, P.x, P.y, P.w, P.h, '#fff8f3');
    /* ribbon header */
    c.fillStyle = PAL.pink;
    E.roundRect(c, P.x + 8, P.y + 8, P.w - 16, 44, 10);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    E.roundRect(c, P.x + 12, P.y + 11, P.w - 24, 16, 6);
    c.fill();
    c.fillStyle = PAL.ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    U.fitFont(c, gate.title, P.w - 140, 20, 'bold', 12);
    c.fillText(gate.title, P.x + P.w / 2, P.y + 30);

    /* hearts = tries left, top-right of the card */
    for (var h = 0; h < gate.maxTries; h++) {
      var hx = P.x + P.w - 24 - h * 22, hy = P.y + 30;
      drawHeart(c, hx, hy, 8, h < triesLeft() ? PAL.coral : 'rgba(74,42,64,0.18)');
    }

    if (isMath) drawMath(c); else drawKanji(c);

    /* phase overlays */
    if (gate.phase === 'right') {
      flash(c, P, T('gateCorrect'), PAL.mint, '#1f6f5a');
    } else if (gate.phase === 'wrongFlash') {
      banner(c, P, T('gateWrong'), PAL.coral);
    } else if (gate.phase === 'fail') {
      flash(c, P, T('gateFail') + ' ' + gate.problem.answer, PAL.sun, PAL.ink, T('gateAbort'));
    }

    if (gate.mode === 'studio' && gate.phase === 'ask') {
      U.button(c, L.cancel, T('gateCancel'), { font: 13, fill: 'rgba(255,246,236,0.9)' });
    }
    c.restore();
  }

  function drawHeart(c, x, y, r, col) {
    c.save();
    c.translate(x, y);
    c.beginPath();
    c.moveTo(0, r * 0.9);
    c.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.7, -r * 1.1, 0, -r * 0.35);
    c.bezierCurveTo(r * 0.7, -r * 1.1, r * 1.4, -r * 0.1, 0, r * 0.9);
    c.closePath();
    c.fillStyle = col;
    c.fill();
    c.strokeStyle = Game.PAL.ink;
    c.lineWidth = 1.5;
    c.stroke();
    c.restore();
  }

  function flash(c, P, text, fill, textCol, sub) {
    var U = Game.ui, E = Game.entities;
    c.save();
    c.fillStyle = 'rgba(255,248,243,0.75)';
    E.roundRect(c, P.x + 4, P.y + 58, P.w - 8, P.h - 62, 12);
    c.fill();
    var bw = Math.min(P.w - 60, 440), bh = sub ? 110 : 80;
    var bx = P.x + (P.w - bw) / 2, by = P.y + (P.h - bh) / 2 + 10;
    var pulse = 1 + Math.sin(gate.t / 5) * 0.02;
    c.translate(bx + bw / 2, by + bh / 2);
    c.scale(pulse, pulse);
    c.translate(-(bx + bw / 2), -(by + bh / 2));
    E.fillRound(c, bx, by, bw, bh, 16, fill);
    c.fillStyle = textCol;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    U.fitFont(c, text, bw - 30, 28, 'bold', 14);
    c.fillText(text, bx + bw / 2, by + (sub ? 38 : bh / 2));
    if (sub) {
      c.font = 'bold 15px ' + U.FONT;
      c.fillText(sub, bx + bw / 2, by + 80);
    }
    c.restore();
  }

  function banner(c, P, text, fill) {
    var U = Game.ui, E = Game.entities;
    c.save();
    c.font = 'bold 16px ' + U.FONT;
    var bw = c.measureText(text).width + 40;
    var bx = P.x + (P.w - bw) / 2, by = P.y + P.h - 44;
    if (gate.problem.kind === 'kanji') by = P.y + P.h - 30;
    E.fillRound(c, bx, by - 14, bw, 30, 15, fill);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, bx + bw / 2, by + 1);
    c.restore();
  }

  function answerBox(c, r, text, caret) {
    var E = Game.entities, PAL = Game.PAL, U = Game.ui;
    E.fillRound(c, r.x, r.y, r.w, r.h, 10, '#ffffff');
    c.fillStyle = PAL.ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    var shown = text + (roman ? roman : '');
    U.fitFont(c, shown || ' ', r.w - 24, 30, 'bold', 14);
    c.fillText(shown, r.x + r.w / 2, r.y + r.h / 2 + 1);
    if (caret && (gate.t % 50) < 28 && gate.phase === 'ask') {
      var tw = c.measureText(shown).width;
      c.fillRect(r.x + r.w / 2 + tw / 2 + 3, r.y + 12, 2, r.h - 24);
    }
  }

  function keyButton(c, r, label, kind) {
    var U = Game.ui, PAL = Game.PAL;
    var fill = kind === 'ok' ? PAL.mint : kind === 'back' ? PAL.peach : kind === 'mod' ? PAL.lavender : '#ffffff';
    U.button(c, r, label, { font: kind === 'ok' ? 20 : 18, fill: fill, r: 10 });
  }

  function drawMath(c) {
    var U = Game.ui, PAL = Game.PAL, T = Game.i18n.t, E = Game.entities;
    var P = MATH.panel;
    /* what she picked, if any */
    if (gate.icon) {
      c.save();
      E.fillEllipse(c, 240, 130, 42, 42, '#ffffff');
      gate.icon(c, 240, 130);
      c.restore();
    }
    c.fillStyle = PAL.ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    U.fitFont(c, gate.problem.text + ' = ?', 240, 44, 'bold', 20);
    c.fillText(gate.problem.text + ' = ?', 295, gate.icon ? 196 : 150);
    c.font = '13px ' + U.FONT;
    c.fillStyle = 'rgba(74,42,64,0.7)';
    c.fillText(T('gateMathPrompt'), 295, gate.icon ? 222 : 190);
    answerBox(c, MATH.answer, gate.input, true);
    for (var i = 0; i < MATH_KEYS.length; i++) {
      var k = MATH_KEYS[i];
      keyButton(c, mathKeyRect(i), k === 'back' ? '⌫' : k === 'ok' ? 'OK' : k, k === 'back' || k === 'ok' ? k : 'num');
    }
  }

  function drawKanji(c) {
    var U = Game.ui, PAL = Game.PAL, T = Game.i18n.t, E = Game.entities;
    var P = KANJI.panel;
    if (gate.icon) {
      E.fillEllipse(c, 236, 104, 30, 30, '#ffffff');
      gate.icon(c, 236, 104, 0.7);
    }
    /* the word, big, on a soft card */
    E.fillRound(c, 36, 76, 236, 128, 14, '#fff');
    c.fillStyle = PAL.ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    var txt = gate.problem.text;
    U.fitFont(c, txt, 214, txt.length <= 1 ? 84 : txt.length <= 3 ? 60 : 44, 'bold', 24);
    c.fillText(txt, 154, 142);
    c.font = 'bold 13px ' + U.FONT;
    c.fillStyle = 'rgba(74,42,64,0.75)';
    c.fillText(T('gateKanjiPrompt'), 154, 220);
    answerBox(c, KANJI.answer, gate.input, true);

    /* kana grid */
    for (var col = 0; col < KANA_COLS.length; col++) {
      for (var row = 0; row < 5; row++) {
        var ch = KANA_COLS[col][row];
        if (!ch) continue;
        keyButton(c, kanaRect(col, row), ch, 'num');
      }
    }
    var labels = ['゛', '゜', '小', 'ー', '⌫', 'OK'];
    for (var m = 0; m < KANA_MODS.length; m++) {
      var kind = KANA_MODS[m] === 'ok' ? 'ok' : KANA_MODS[m] === 'back' ? 'back' : 'mod';
      keyButton(c, modRect(m), labels[m], kind);
    }
  }

  /* ================================================================
     Clicks
     ================================================================ */
  function click(mx, my) {
    if (!gate.open) return false;
    var U = Game.ui;
    var sx = gate.shake > 0 ? Math.sin(gate.shake * 1.8) * gate.shake * 0.7 : 0;
    mx -= sx;
    if (gate.phase !== 'ask') {
      /* a tap skips the result flash */
      if (gate.phase !== 'wrongFlash' && gate.phaseTimer > 0) gate.phaseTimer = 1;
      return true;
    }
    var isMath = gate.problem.kind === 'math';
    var L = isMath ? MATH : KANJI;
    if (gate.mode === 'studio' && U.hit(L.cancel, mx, my)) { cancel(); return true; }
    var i;
    if (isMath) {
      for (i = 0; i < MATH_KEYS.length; i++) {
        if (U.hit(mathKeyRect(i), mx, my)) {
          var k = MATH_KEYS[i];
          if (k === 'back') backspace();
          else if (k === 'ok') submit();
          else typeChar(k);
          return true;
        }
      }
    } else {
      for (var col = 0; col < KANA_COLS.length; col++) {
        for (var row = 0; row < 5; row++) {
          if (!KANA_COLS[col][row]) continue;
          if (U.hit(kanaRect(col, row), mx, my)) { typeChar(KANA_COLS[col][row]); return true; }
        }
      }
      for (i = 0; i < KANA_MODS.length; i++) {
        if (U.hit(modRect(i), mx, my)) {
          var mod = KANA_MODS[i];
          if (mod === 'back') backspace();
          else if (mod === 'ok') submit();
          else if (mod === 'long') typeChar('ー');
          else { gate.input = applyModifier(gate.input, mod); Game.audio.play('tap'); }
          return true;
        }
      }
    }
    return true;   /* swallow taps outside the keys while open */
  }

  window.Game.gate = {
    open: open,
    isOpen: function () { return gate.open; },
    update: update,
    draw: draw,
    click: click,
    cancel: cancel,
    /* exposed for the runway's pretend models and for tests */
    makeProblem: makeProblem,
    currentLevel: currentLevel,
    progress: progress,
    isKanjiMode: isKanjiMode,
    _state: gate,
  };
})();
