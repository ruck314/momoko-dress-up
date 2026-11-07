/* mathgate.js – the puzzle every wardrobe change (and the runway pose)
   has to pass.
 *
 * In English the puzzle is multiplication: the times tables from 1 to 9.
 * In Japanese it is a kanji reading from the grade 1-2 list in kanji.js,
 * typed in hiragana, either on the device's own keyboard (a real text
 * field floats over the answer box) or on a 50-sound keypad.
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
    else if (tries === 1) d = 0.3;
    else if (tries === 2) d = 0.1;
    else d = -0.1;
    p[k] = Math.max(0, Math.min(4, p[k] + d));
    if (ok) { p.solved++; p.stars += (tries === 1 ? 2 : 1); }
    else p.missed++;
  }

  /* ================================================================
     Multiplication (the kuku, 1x1 .. 9x9)
     ================================================================ */
  /* Difficulty ladder, pitched at the start of 2nd grade and climbing
     to the end of it:
       0  the 1, 2 and 5 times tables, up to x5
       1  the 2-5 times tables, up to x9
       2  2-7 times 2-9
       3  3-9 times 3-9
       4  the hard corner: 6-9 times 6-9 */
  function makeMult(level) {
    var a, b;
    switch (level) {
      case 0: a = pick([1, 2, 5]); b = range(1, 5); break;
      case 1: a = range(2, 5); b = range(1, 9); break;
      case 2: a = range(2, 7); b = range(2, 9); break;
      case 3: a = range(3, 9); b = range(3, 9); break;
      default: a = range(6, 9); b = range(6, 9); break;
    }
    if (Math.random() < 0.5) { var tmp = a; a = b; b = tmp; }
    return { kind: 'math', text: a + ' × ' + b, answers: [String(a * b)], answer: String(a * b) };
  }

  function makeMath(level) { return makeMult(level); }

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

  /* The grade-1 kanji every child has down cold by the start of 2nd
     grade: numbers, days of the week, and the simplest pictographs. */
  var EASY_G1 = '一二三四五六七八九十百千日月火水木金土山川田人口目耳手足大小上下中子女男犬花草空雨';
  function easyG1() {
    var out = [];
    for (var i = 0; i < Game.KANJI.length; i++) if (Game.KANJI[i].g === 1 && EASY_G1.indexOf(Game.KANJI[i].k) >= 0) out.push(Game.KANJI[i]);
    return out;
  }

  /* Ladder:  0 easy grade-1 kanji, any reading
              1 all grade-1 kanji, any reading
              2 grade-1 words, and grade-2 kanji with any reading
              3 grade-2 words with okurigana
              4 grade-2 compounds (on-yomi) */
  function makeKanji(level) {
    var g1 = kanjiByGrade(1), g2 = kanjiByGrade(2), e1 = easyG1();
    var p = null, r = Math.random();
    for (var attempt = 0; attempt < 20 && !p; attempt++) {
      switch (level) {
        case 0: p = bareProblem(pick(e1)); break;
        case 1: p = r < 0.7 ? bareProblem(pick(g1)) : wordProblem(pick(e1), false); break;
        case 2: p = r < 0.5 ? wordProblem(pick(g1)) : bareProblem(pick(g2)); break;
        case 3: p = r < 0.6 ? wordProblem(pick(g2), false) : bareProblem(pick(g2)); break;
        default: p = r < 0.6 ? wordProblem(pick(g2), true) : wordProblem(pick(g2), false); break;
      }
    }
    return p || bareProblem(pick(e1));
  }

  function makeProblem() {
    var lvl = currentLevel();
    return isKanjiMode() ? makeKanji(lvl) : makeMath(lvl);
  }

  /* ================================================================
     Kana keypad: the 50-sound table plus ゛ ゜ small ー
     Listed あ-row first; kanaRect() lays the columns out right-to-left
     so あ sits in the top-right corner and ん bottom-left, exactly like
     a printed gojuon chart.
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
    cya: 'ちゃ', cyu: 'ちゅ', cyo: 'ちょ', chya: 'ちゃ', chyu: 'ちゅ', chyo: 'ちょ',
    jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ', zya: 'じゃ', zyu: 'じゅ', zyo: 'じょ',
    dya: 'ぢゃ', dyu: 'ぢゅ', dyo: 'ぢょ', she: 'しぇ', che: 'ちぇ', je: 'じぇ',
    fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ', wi: 'うぃ', we: 'うぇ', vu: 'ゔ',
    xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ', xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', xtu: 'っ', xtsu: 'っ', xwa: 'ゎ',
    la: 'ぁ', li: 'ぃ', lu: 'ぅ', le: 'ぇ', lo: 'ぉ', lya: 'ゃ', lyu: 'ゅ', lyo: 'ょ', ltu: 'っ', ltsu: 'っ', lwa: 'ゎ',
    '-': 'ー',
  };
  var roman = '';
  function isConsonant(ch) { return 'bcdfghjklmpqrstvwxyz'.indexOf(ch) >= 0; }
  function isPrefix(str) {
    for (var k in ROMAJI) if (k.indexOf(str) === 0) return true;
    return false;
  }
  /* One letter into a romaji buffer. st = { buf, out }: kana that
     resolved is appended to out, letters still waiting stay in buf.
     The n rules follow the macOS and Google IMEs: nn is ん the moment
     the second n lands (so おんな is typed onnna or on'na), n before
     any consonant but y is ん, and n' is ん. */
  function romajiStep(st, ch) {
    if (ch === "'") {
      if (st.buf === 'n') { st.out += 'ん'; st.buf = ''; }
      return;
    }
    st.buf += ch;
    /* doubled consonant = っ (kk -> っk), but not n; tch is っch */
    if (st.buf.length >= 2 && ((st.buf[0] === st.buf[1] && isConsonant(st.buf[0]) && st.buf[0] !== 'n') || st.buf.indexOf('tc') === 0)) {
      st.out += 'っ';
      st.buf = st.buf.slice(1);
    }
    /* n before a consonant (other than y) = ん */
    if (st.buf[0] === 'n' && st.buf.length >= 2 && 'aiueoyn'.indexOf(st.buf[1]) < 0) {
      st.out += 'ん';
      st.buf = st.buf.slice(1);
    }
    /* nn = ん, done */
    if (st.buf === 'nn') {
      st.out += 'ん';
      st.buf = '';
      return;
    }
    if (ROMAJI[st.buf]) {
      st.out += ROMAJI[st.buf];
      st.buf = '';
      return;
    }
    /* still a prefix of something? keep waiting; otherwise drop the junk */
    if (!isPrefix(st.buf)) {
      st.buf = st.buf.slice(-1);
      if (!isPrefix(st.buf)) st.buf = '';
    }
  }
  function romajiFlush(st) {
    if (st.buf === 'n') st.out += 'ん';
    st.buf = '';
  }
  function feedRomaji(ch) {
    var st = { buf: roman, out: '' };
    romajiStep(st, ch);
    gate.input += st.out;
    roman = st.buf;
  }
  function flushRomaji() {
    var st = { buf: roman, out: '' };
    romajiFlush(st);
    gate.input += st.out;
    roman = '';
  }

  /* ================================================================
     Keyboard mode: a real <input> floats over the answer box so the
     device's own Japanese keyboard (flick, kana or romaji) does the
     typing. Only hiragana may land in it: katakana is folded to
     hiragana, latin letters go through the romaji table, and when the
     IME commits a kanji candidate the answer snaps back to the kana
     that were showing just before the conversion.
     ================================================================ */
  function kanaMode() {
    var m = Game.settings && Game.settings.kanaInput;
    return m === 'keypad' ? 'keypad' : 'keyboard';
  }
  function setKanaMode(m) {
    if (!Game.settings) Game.settings = {};
    Game.settings.kanaInput = m;
    if (Game.engine && Game.engine.save) Game.engine.save();
  }
  function usesField() { return gate.open && gate.problem && gate.problem.kind === 'kanji' && kanaMode() === 'keyboard'; }

  function isKanaChar(code) { return (code >= 0x3041 && code <= 0x3096) || code === 0x30fc || code === 0x309d || code === 0x309e; }
  function isAllKana(str) {
    for (var i = 0; i < str.length; i++) if (!isKanaChar(str.charCodeAt(i))) return false;
    return true;
  }
  /* Fold any typed text to hiragana. Latin letters run through the
     romaji table; with final=false an unfinished syllable is kept as
     letters at the end so the typist can finish it. */
  function toHiragana(str, final) {
    var out = '', st = { buf: '', out: '' };
    function flushLatin() {
      if (final) romajiFlush(st);
      out += st.out + (final ? '' : st.buf);
      st.out = ''; st.buf = '';
    }
    for (var i = 0; i < str.length; i++) {
      var ch = str[i], code = str.charCodeAt(i);
      if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) { romajiStep(st, ch.toLowerCase()); continue; }
      if ((code >= 0xff21 && code <= 0xff3a) || (code >= 0xff41 && code <= 0xff5a)) { romajiStep(st, String.fromCharCode((code - 0xff21) % 32 + 97)); continue; }
      if (ch === "'" || ch === '\u2019' || ch === '\uff07') { romajiStep(st, "'"); continue; }
      flushLatin();
      if (isKanaChar(code)) out += ch;
      else if (code >= 0x30a1 && code <= 0x30f6) out += String.fromCharCode(code - 0x60);   /* katakana -> hiragana */
      else if (ch === '-' || ch === '－' || ch === '―' || ch === '−') out += 'ー';
    }
    flushLatin();
    return out.slice(0, 10);
  }

  var field = null, fieldShown = false, composing = false, compBase = '', lastKana = '';
  function ensureField() {
    if (field) return field;
    field = document.createElement('input');
    field.type = 'text';
    field.id = 'kana-field';
    field.setAttribute('lang', 'ja');
    field.setAttribute('autocomplete', 'off');
    field.setAttribute('autocorrect', 'off');
    field.setAttribute('autocapitalize', 'none');
    field.setAttribute('spellcheck', 'false');
    field.setAttribute('enterkeyhint', 'done');
    field.setAttribute('maxlength', '14');
    field.setAttribute('aria-label', 'hiragana');
    field.style.cssText = 'position:fixed;left:0;top:0;display:none;z-index:50;box-sizing:border-box;' +
      'margin:0;padding:0 10px;border:2px solid #4a2a40;border-radius:10px;background:#ffffff;color:#4a2a40;' +
      'font-family:"M PLUS Rounded 1c",sans-serif;font-weight:700;text-align:center;outline:none;' +
      '-webkit-appearance:none;appearance:none;box-shadow:0 3px 0 rgba(74,42,64,0.28);caret-color:#e2559a;' +
      '-webkit-user-select:text;user-select:text;touch-action:manipulation;';
    field.addEventListener('compositionstart', function () {
      composing = true;
      compBase = field.value;
      lastKana = '';
    });
    field.addEventListener('compositionupdate', function (e) {
      var d = e.data || '', k = toHiragana(d, false);
      if (d && k.length === d.length && isAllKana(k)) lastKana = k;
    });
    field.addEventListener('compositionend', function (e) {
      composing = false;
      var d = e.data || '';
      /* a kanji candidate was picked: keep the reading, not the kanji */
      if (d && toHiragana(d, false).length !== d.length && lastKana) field.value = compBase + lastKana;
      sanitizeField();
    });
    field.addEventListener('input', function (e) {
      if (composing || (e && e.isComposing)) return;
      sanitizeField();
    });
    field.addEventListener('keydown', function (e) {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') { e.preventDefault(); if (gate.phase === 'ask') submit(); else if (gate.phaseTimer > 0) gate.phaseTimer = 1; }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    document.body.appendChild(field);
    return field;
  }
  function sanitizeField() {
    if (!field) return;
    var clean = toHiragana(field.value, false);
    if (clean !== field.value) field.value = clean;
    gate.input = toHiragana(clean, false);
  }
  function showField(focus) {
    var f = ensureField();
    f.value = gate.input;
    /* the runway opens the gate from the game loop, not from a tap, so
       iOS will not raise its keyboard until she touches the box herself */
    f.placeholder = Game.i18n.t('inputTapHere');
    fieldShown = true;
    f.style.display = 'block';
    placeField();
    if (focus) { try { f.focus({ preventScroll: true }); } catch (err) { f.focus(); } }
  }
  function hideField() {
    if (!field) return;
    fieldShown = false;
    composing = false;
    field.style.display = 'none';
    if (document.activeElement === field) field.blur();
  }
  /* Pin the field over the answer box, whatever the canvas scale. */
  function placeField() {
    if (!field || !fieldShown) return;
    var canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    var s = rect.width / (canvas.width / dpr);
    var gx = Game.TOUCH_LEFT_W || 0, gy = Game.GAME_Y || 0;
    var r = kbLayout().answer;
    /* Only touch the style when something moved: Safari may abort an
       IME composition when the focused field's geometry is rewritten. */
    setStyle('left', Math.round(rect.left + (gx + r.x) * s) + 'px');
    setStyle('top', Math.round(rect.top + (gy + r.y) * s) + 'px');
    setStyle('width', Math.round(r.w * s) + 'px');
    setStyle('height', Math.round(r.h * s) + 'px');
    setStyle('fontSize', Math.max(16, Math.round(28 * s)) + 'px');
    setStyle('borderRadius', Math.round(10 * s) + 'px');
    setStyle('borderWidth', Math.max(1, Math.round(2 * s)) + 'px');
  }
  function setStyle(prop, val) {
    if (field.style[prop] !== val) field.style[prop] = val;
  }
  /* The helper keys beside the field: they edit the field's own value
     (resolving any half-typed romaji first) and hand focus straight
     back so the device keyboard stays up. */
  /* If the device IME still holds uncommitted (marked) text, a blur
     makes it commit, so the value we read and rewrite is the whole
     answer and the IME cannot re-insert its composition afterwards. */
  function settleComposition(f) {
    if (!composing) return;
    try { f.blur(); } catch (err) { /* ignore */ }
    composing = false;
  }
  function fieldEdit(op) {
    if (gate.phase !== 'ask') return;
    var f = ensureField();
    settleComposition(f);
    var v = toHiragana(f.value, true);
    if (op === 'back') v = v.slice(0, -1);
    else if (op === 'n') v += 'ん';
    else if (op === 'long') v += 'ー';
    else v = applyModifier(v, op);
    composing = false;
    f.value = v;
    sanitizeField();
    Game.audio.play('tap');
    try { f.focus({ preventScroll: true }); } catch (err) { f.focus(); }
  }
  function commitField() {
    if (!field || !fieldShown) return;
    settleComposition(field);
    gate.input = toHiragana(field.value, true);
    field.value = gate.input;
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
    if (usesField()) showField(true); else hideField();
  }

  function close(result) {
    gate.open = false;
    hideField();
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
    if (usesField()) commitField(); else flushRomaji();
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
      hideField();
      return;
    }
    if (gate.tries >= gate.maxTries) {
      Game.audio.play('fail');
      recordResult(false, gate.tries);
      gate.phase = 'fail';
      gate.phaseTimer = 150;
      hideField();
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
    if (usesField()) {
      /* the field lost focus (a click on the canvas): route the key into
         it and hand focus back, so typing never silently goes nowhere */
      var f = ensureField();
      var fk = /^Key([A-Z])$/.exec(code);
      if (gate.phase === 'ask') {
        if (code === 'Backspace') f.value = f.value.slice(0, -1);
        else if (fk) f.value += fk[1].toLowerCase();
        else if (code === 'Quote') f.value += "'";
        else if (code === 'Minus') f.value += 'ー';
        sanitizeField();
      }
      try { f.focus({ preventScroll: true }); } catch (err) { f.focus(); }
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
    if (code === 'Quote') { if (gate.phase === 'ask') feedRomaji("'"); return true; }
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
        if (gate.phase === 'wrongFlash') { gate.phase = 'ask'; gate.input = ''; roman = ''; if (field && fieldShown) field.value = ''; }
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
    modeSwitch: { x: 36, y: 318, w: 236, h: 34 },
    cancel: { x: 36, y: 398, w: 110, h: 36 },
  };
  /* Keyboard mode: a short card pinned to the top of the *canvas* (on a
     tablet the game window sits well below the canvas top), so the
     device's on-screen keyboard, which takes the lower half of the
     screen, never covers the kanji. Beside the text field sit the kana
     the device IME makes awkward: ん, the small forms, ゛ ゜ and ー. */
  var KB_HELP = ['n', 'small', 'daku', 'handaku', 'long', 'back'];
  var KB_HELP_LABELS = ['ん', '小', '゛', '゜', 'ー', '⌫'];
  function kbLayout() {
    var top = (Game.ui && Game.ui.VIEW ? Game.ui.VIEW.y : 0) + 12;
    var L = {
      kb: true,
      panel: { x: 90, y: top, w: 620, h: 206 },
      card: { x: 106, y: top + 58, w: 176, h: 100 },
      answer: { x: 298, y: top + 58, w: 296, h: 54 },
      ok: { x: 604, y: top + 58, w: 92, h: 54 },
      cancel: { x: 604, y: top + 122, w: 92, h: 38 },
      modeSwitch: { x: 106, y: top + 166, w: 176, h: 28 },
      hintY: top + 186,
      help: [],
    };
    for (var i = 0; i < KB_HELP.length; i++) L.help.push({ x: 298 + i * 50, y: top + 120, w: 44, h: 42 });
    return L;
  }
  function kanjiLayout() { return kanaMode() === 'keyboard' ? kbLayout() : KANJI; }

  function mathKeyRect(i) {
    /* 1 2 3 / 4 5 6 / 7 8 9 / ⌫ 0 ✓ */
    var col = i % 3, row = Math.floor(i / 3);
    var P = MATH.pad;
    return { x: P.x + col * (P.keyW + P.gap), y: P.y + row * (P.keyH + P.gap), w: P.keyW, h: P.keyH };
  }
  var MATH_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];

  function kanaRect(col, row) {
    var G = KANJI.grid;
    var vis = KANA_COLS.length - 1 - col;   /* right-to-left */
    return { x: G.x + vis * (G.cell + G.gap), y: G.y + row * (G.cell + G.gap), w: G.cell, h: G.cell };
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
    var L = isMath ? MATH : kanjiLayout();
    var P = L.panel;
    var sx = gate.shake > 0 ? Math.sin(gate.shake * 1.8) * gate.shake * 0.7 : 0;
    c.translate(sx, 0);
    if (fieldShown) placeField();

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

    if (isMath) drawMath(c); else if (L.kb) drawKanjiKeyboard(c, L); else drawKanji(c);

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
    if (gate.problem.kind === 'kanji') by = kanaMode() === 'keyboard' ? P.y + P.h - 20 : P.y + P.h - 30;
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
    drawModeSwitch(c, KANJI.modeSwitch);
  }

  /* Two-way switch between the device keyboard and the kana keypad. */
  function drawModeSwitch(c, r) {
    var U = Game.ui, E = Game.entities, PAL = Game.PAL, T = Game.i18n.t;
    var mode = kanaMode();
    E.fillRound(c, r.x, r.y, r.w, r.h, r.h / 2, 'rgba(74,42,64,0.1)');
    var half = r.w / 2;
    var opts = [['keyboard', T('inputKeyboard')], ['keypad', T('inputKeypad')]];
    for (var i = 0; i < 2; i++) {
      var on = opts[i][0] === mode;
      var bx = r.x + i * half;
      var hot = !on && U.pointerOver(c, bx, r.y, half, r.h);
      if (on) {
        c.save();
        c.fillStyle = 'rgba(74,42,64,0.25)';
        E.roundRect(c, bx + 2, r.y + 4, half - 4, r.h - 4, r.h / 2 - 2); c.fill();
        c.restore();
        E.fillRound(c, bx + 2, r.y + 2, half - 4, r.h - 4, r.h / 2 - 2, PAL.sun);
        c.fillStyle = 'rgba(255,255,255,0.4)';
        E.roundRect(c, bx + 6, r.y + 4, half - 12, (r.h - 4) * 0.42, r.h / 2 - 4); c.fill();
      } else if (hot) {
        E.fillRound(c, bx + 2, r.y + 2, half - 4, r.h - 4, r.h / 2 - 2, 'rgba(255,255,255,0.5)');
      }
      c.fillStyle = on ? PAL.ink : 'rgba(74,42,64,0.7)';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      U.fitFont(c, opts[i][1], half - 14, 13, 'bold', 9);
      c.fillText(opts[i][1], bx + half / 2, r.y + r.h / 2 + 1);
    }
  }

  function drawKanjiKeyboard(c, L) {
    var U = Game.ui, PAL = Game.PAL, T = Game.i18n.t, E = Game.entities;
    var K = L.card;
    /* the word, big, on a soft card */
    E.fillRound(c, K.x, K.y, K.w, K.h, 14, '#fff');
    if (gate.icon) { E.fillEllipse(c, K.x + K.w - 2, K.y + 2, 28, 28, '#ffffff'); gate.icon(c, K.x + K.w - 2, K.y + 2, 0.66); }
    c.fillStyle = PAL.ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    var txt = gate.problem.text;
    U.fitFont(c, txt, K.w - 24, txt.length <= 1 ? 72 : txt.length <= 3 ? 50 : 38, 'bold', 22);
    c.fillText(txt, K.x + K.w / 2, K.y + K.h / 2 + 2);
    /* the answer box is the real text field; only paint it ourselves
       while the field is hidden (result flashes) */
    var A = L.answer;
    if (fieldShown) {
      c.fillStyle = 'rgba(74,42,64,0.28)';
      E.roundRect(c, A.x, A.y + 3, A.w, A.h, 10); c.fill();
    } else {
      answerBox(c, A, gate.input, false);
      E.roundRect(c, A.x, A.y, A.w, A.h, 10); E.ink(c, 2);
    }
    for (var i = 0; i < L.help.length; i++) {
      var op = KB_HELP[i];
      keyButton(c, L.help[i], KB_HELP_LABELS[i], op === 'back' ? 'back' : op === 'n' || op === 'long' ? 'num' : 'mod');
    }
    if (gate.phase !== 'wrongFlash') {   /* the "try again" banner takes this line */
      c.font = '11px ' + U.FONT;
      c.fillStyle = 'rgba(74,42,64,0.6)';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(T('inputKeyboardHint'), A.x + 2, L.hintY);
    }
    keyButton(c, L.ok, 'OK', 'ok');
    drawModeSwitch(c, L.modeSwitch);
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
    var L = isMath ? MATH : kanjiLayout();
    if (gate.mode === 'studio' && U.hit(L.cancel, mx, my)) { cancel(); return true; }
    var i;
    if (!isMath && U.hit(L.modeSwitch, mx, my)) {
      var want = mx < L.modeSwitch.x + L.modeSwitch.w / 2 ? 'keyboard' : 'keypad';
      if (want !== kanaMode()) {
        Game.audio.play('select');
        if (want === 'keypad') { commitField(); hideField(); }
        setKanaMode(want);
        if (want === 'keyboard') { roman = ''; showField(true); }
      }
      return true;
    }
    if (!isMath && L.kb) {
      if (U.hit(L.ok, mx, my)) submit();
      for (i = 0; i < L.help.length; i++) if (U.hit(L.help[i], mx, my)) { fieldEdit(KB_HELP[i]); break; }
      return true;
    }
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
    kanaMode: kanaMode,
    setKanaMode: setKanaMode,
    toHiragana: toHiragana,
    _state: gate,
    _field: function () { return field; },
  };
})();
