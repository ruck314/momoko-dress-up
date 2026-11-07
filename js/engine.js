/* engine.js – game loop, state machine, camera and persistence. */
(function () {
  'use strict';
  window.Game = window.Game || {};
  var PAL = Game.PAL;
  var E = Game.entities;

  /* Logical playfield. On touch devices the canvas is widened past this
     and the control strips live in the margins; render() translates once
     so all game code keeps using 0..800 / 0..480. */
  var W = 800, H = 480;
  var CANVAS_W = W, CANVAS_H = H;
  var GAME_X = 0, GAME_Y = 0;

  /* Bump alongside CACHE_NAME in sw.js and tag the matching git release. */
  Game.VERSION = 'v1.6.1';

  /* Post-processing switches, all on by default. A slow device (or a
     test) can turn any of them off without touching the scene code. */
  Game.FX = Game.FX || { bloom: true, grade: true, vignette: true, frost: true, dof: true };

  var canvas, ctx;

  /* ---- Persistence ----
     Every game on ruck314.github.io shares one localStorage origin, so
     every key goes through KEY() with this game's own prefix. */
  var NS = 'momoko-dressup-';
  function KEY(n) { return NS + n; }

  var State = {
    TITLE: 'title',
    INTRO: 'intro',
    PLAYING: 'playing',
    PAUSED: 'paused',
    WARDROBE: 'wardrobe',
    RUNWAY: 'runway',
  };
  var state = State.TITLE;
  var prevState = null;

  var camera = { x: 0 };
  var player = null;
  var particles = [];
  var t = 0;
  var PLAYER_SCALE = 1.6;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function freshState() {
    Game.look = clone(Game.DEFAULT_LOOK);
    Game.progress = { mathSkill: 0, kanjiSkill: 0, stars: 0, solved: 0, missed: 0, shows: 0, wins: 0 };
    Game.flags = { introSeen: false };
    Game.settings = Game.settings || { lang: 'en', muted: false, kanaInput: 'keyboard' };
  }

  function save() {
    try {
      localStorage.setItem(KEY('look'), JSON.stringify(Game.look));
      localStorage.setItem(KEY('progress'), JSON.stringify(Game.progress));
      localStorage.setItem(KEY('flags'), JSON.stringify(Game.flags));
      localStorage.setItem(KEY('settings'), JSON.stringify({ lang: Game.i18n.getLang(), muted: Game.audio.isMuted(), kanaInput: Game.settings && Game.settings.kanaInput }));
    } catch (e) { /* storage full or disabled */ }
  }

  function readJSON(name) {
    try {
      var raw = localStorage.getItem(KEY(name));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function mergeInto(target, src) {
    if (!src) return target;
    for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    return target;
  }

  function load() {
    freshState();
    var look = readJSON('look');
    if (look) {
      /* only keep known fields with known values, so an old save can't
         name a variant that no longer exists */
      for (var i = 0; i < Game.STATIONS.length; i++) {
        var st = Game.STATIONS[i];
        if (st.field && st.variants.indexOf(look[st.field]) >= 0) Game.look[st.field] = look[st.field];
        if (st.colorField && typeof look[st.colorField] === 'string') Game.look[st.colorField] = look[st.colorField];
      }
    }
    mergeInto(Game.progress, readJSON('progress'));
    mergeInto(Game.flags, readJSON('flags'));
    var settings = readJSON('settings');
    if (settings) {
      Game.settings = settings;
      Game.i18n.setLang(settings.lang || 'en');
    }
  }

  function resetSave() {
    var lang = Game.i18n.getLang();
    var muted = Game.audio.isMuted();
    var kanaInput = Game.settings && Game.settings.kanaInput;
    try {
      ['look', 'progress', 'flags'].forEach(function (n) { localStorage.removeItem(KEY(n)); });
    } catch (e) { /* ignore */ }
    freshState();
    unlockedStation = null;
    Game.settings.lang = lang;
    Game.settings.muted = muted;
    Game.settings.kanaInput = kanaInput;
    Game.i18n.setLang(lang);
    save();
  }

  /* ---- Canvas layout ---- */
  function computeCanvasLayout() {
    var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!isTouch) {
      CANVAS_W = W; CANVAS_H = H; GAME_X = 0; GAME_Y = 0;
      Game.TOUCH_LEFT_W = 0; Game.TOUCH_RIGHT_W = 0; Game.GAME_Y = 0;
      return;
    }
    var leftW = 260, rightW = 200;
    var aspect = window.innerWidth / Math.max(1, window.innerHeight);
    var targetAspect = (W + leftW + rightW) / H;
    if (aspect > targetAspect) {
      var extra = Math.floor((aspect * H - (W + leftW + rightW)) / 2);
      leftW += extra; rightW += extra;
      CANVAS_H = H; GAME_Y = 0;
    } else {
      CANVAS_H = Math.min(H * 2, Math.round((W + leftW + rightW) / Math.max(0.5, aspect)));
      GAME_Y = Math.floor((CANVAS_H - H) / 2);
    }
    CANVAS_W = W + leftW + rightW;
    GAME_X = leftW;
    Game.TOUCH_LEFT_W = leftW;
    Game.TOUCH_RIGHT_W = rightW;
    Game.GAME_Y = GAME_Y;
  }

  function resizeBackingStore() {
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    var scale = Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H);
    canvas.style.width = Math.floor(CANVAS_W * scale) + 'px';
    canvas.style.height = Math.floor(CANVAS_H * scale) + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  function onResize() {
    computeCanvasLayout();
    resizeBackingStore();
    Game.input.refreshLayout();
  }

  /* ---- Interactables ---- */
  function interactables() {
    var S = Game.STUDIO;
    var list = [];
    for (var i = 0; i < Game.STATIONS.length; i++) {
      var st = Game.STATIONS[i];
      list.push({ id: 'station:' + st.id, x: st.x, r: 64, label: Game.i18n.t(st.labelKey), promptY: S.groundY - 266 });
    }
    list.push({ id: 'runway', x: S.runwayDoor.x, r: 70, label: Game.i18n.t('promptRunway'), promptY: S.groundY - 266 });
    return list;
  }

  function nearest() {
    var list = interactables();
    var best = null, bestD = Infinity;
    for (var i = 0; i < list.length; i++) {
      var d = Math.abs(player.x - list[i].x);
      if (d <= list[i].r && d < bestD) { best = list[i]; bestD = d; }
    }
    return best;
  }

  /* ---- State transitions ---- */
  function startGame() {
    if (!Game.flags.introSeen) state = State.INTRO;
    else enterPlaying();
  }

  function enterPlaying() {
    state = State.PLAYING;
    if (Game.audio.currentMusic() !== 'studio') Game.audio.startMusic('studio');
  }

  /* One puzzle buys the way into a station; inside it she can change
     as much as she likes. The pass holds until she enters a different
     station, so stepping out and straight back in asks nothing. */
  var unlockedStation = null;

  function stationById(id) {
    for (var i = 0; i < Game.STATIONS.length; i++) if (Game.STATIONS[i].id === id) return Game.STATIONS[i];
    return null;
  }

  function enterWardrobe(id) {
    Game.ui.openWardrobe(id);
    state = State.WARDROBE;
    Game.audio.play('select');
  }

  function openStation(id) {
    if (unlockedStation === id) { enterWardrobe(id); return; }
    var st = stationById(id);
    if (!st) return;
    Game.audio.play('select');
    Game.gate.open({
      mode: 'studio',
      icon: function (c, cx, cy, s) {
        E.drawLookTile(c, cx, cy, 72 * (s || 1), Game.look, st.id, { round: true });
      },
      onResolve: function (res) {
        if (!res.ok) return;
        unlockedStation = id;
        enterWardrobe(id);
      },
    });
  }

  function enterRunway() {
    Game.runway.start();
    state = State.RUNWAY;
    Game.audio.stopMusic();
    Game.audio.play('select');
  }

  function exitRunway() {
    state = State.PLAYING;
    Game.audio.startMusic('studio');
    save();
  }

  /* ---- Update ---- */
  function update() {
    t++;
    Game.input.update();
    var keys = Game.input.keys;
    var jp = Game.input.justPressed;

    if (Game.gate.isOpen()) {
      Game.gate.update();
      return;
    }

    switch (state) {
      case State.TITLE:
      case State.INTRO:
      case State.WARDROBE:
        if (state === State.WARDROBE && jp.pause) { Game.audio.play('select'); state = State.PLAYING; save(); }
        break;
      case State.PLAYING:
        updatePlaying(keys, jp);
        break;
      case State.PAUSED:
        if (jp.pause) { state = prevState || State.PLAYING; }
        break;
      case State.RUNWAY:
        Game.runway.update(keys, jp);
        break;
    }
    for (var p = particles.length - 1; p >= 0; p--) {
      particles[p].update();
      if (particles[p].life <= 0) particles.splice(p, 1);
    }
  }

  function updatePlaying(keys, jp) {
    if (jp.pause) { prevState = state; state = State.PAUSED; return; }

    player.update(keys, 60, Game.STUDIO.width - 60);
    /* the camera eases after her and looks a little ahead of her feet */
    var want = Math.max(0, Math.min(Game.STUDIO.width - W, player.x - W / 2 + player.facing * 36));
    camera.x += (want - camera.x) * 0.1;
    if (Math.abs(want - camera.x) < 0.3) camera.x = want;

    if (jp.action) {
      var target = nearest();
      if (!target) return;
      if (target.id === 'runway') { enterRunway(); return; }
      if (target.id.indexOf('station:') === 0) { openStation(target.id.slice(8)); return; }
    }
  }

  /* ---- Render ---- */
  function drawClipped(fn) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    fn();
    ctx.restore();
  }

  var renderedState = null;
  /* a soft cream wash on every scene change, fading over a third of a
     second, so screens dissolve into each other instead of cutting */
  var sceneFade = 0;
  function render() {
    ctx.save();
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    var bezel = GAME_X > 0 || GAME_Y > 0;
    var fullBleed = bezel && (
      state === State.TITLE || state === State.INTRO ||
      state === State.WARDROBE || state === State.RUNWAY);
    /* the station puzzle opens over the studio: widen the view so its
       scrim and its keyboard-mode card can use the whole canvas */
    var dimAll = bezel && (state === State.PAUSED || (state === State.PLAYING && Game.gate.isOpen()));
    if (bezel && !fullBleed) {
      Game.input.drawTouchStrip(ctx, showTouchButtons());
    }

    ctx.translate(GAME_X, GAME_Y);
    if (fullBleed || dimAll) {
      Game.ui.setView(-GAME_X, -GAME_Y, CANVAS_W, CANVAS_H);
    } else {
      Game.ui.setView(0, 0, W, H);
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
    }
    Game.ui.beginFrame();
    if (state !== renderedState) {
      Game.ui.dropStaleToast();
      if (renderedState !== null && state !== State.PAUSED && renderedState !== State.PAUSED) sceneFade = 1;
      renderedState = state;
    }

    switch (state) {
      case State.TITLE: Game.ui.drawTitleScreen(ctx); break;
      case State.INTRO: Game.ui.drawIntroScreen(ctx); break;
      case State.PLAYING: if (dimAll) drawClipped(function () { drawWorld(ctx); }); else drawWorld(ctx); break;
      case State.PAUSED: drawClipped(function () { drawWorld(ctx); }); Game.ui.drawPauseMenu(ctx); break;
      case State.WARDROBE: Game.ui.drawWardrobe(ctx); break;
      case State.RUNWAY: Game.runway.draw(ctx); break;
    }
    if (state !== State.PAUSED) {
      if (Game.FX.bloom) drawBloom(ctx, dpr, state === State.RUNWAY ? 0.3 : 0.16);
      if (Game.FX.grade) drawGrade(ctx, state === State.RUNWAY);
      if (Game.FX.vignette) drawVignette(ctx, state === State.PLAYING || state === State.RUNWAY ? 0.5 : 0.34);
    }
    if (Game.gate.isOpen()) Game.gate.draw(ctx);
    if (sceneFade > 0) {
      var V = Game.ui.VIEW;
      ctx.fillStyle = 'rgba(255, 246, 236, ' + (sceneFade * sceneFade * 0.95) + ')';
      ctx.fillRect(V.x, V.y, V.w, V.h);
      sceneFade = Math.max(0, sceneFade - 0.06);
    }

    ctx.restore();
    Game.ui.endFrame();
    updateChrome();
  }

  /* Soft bloom: the finished frame, shrunk to a quarter, blurred and
     screened back over itself at low alpha. Highlights and the lights
     bleed a little into their surroundings, which is most of what makes
     a frame read as lit rather than coloured in. Skipped where canvas
     filters are missing, since the fallback would just be a blur-free
     brighten. */
  var bloomCanvas = null, bloomCtx = null;
  function drawBloom(c, dpr, alpha) {
    if (!Game.studio.HAS_FILTER) return;
    var bw = Math.ceil(CANVAS_W / 6), bh = Math.ceil(CANVAS_H / 6);
    if (!bloomCanvas) { bloomCanvas = document.createElement('canvas'); bloomCtx = bloomCanvas.getContext('2d'); }
    if (bloomCanvas.width !== bw || bloomCanvas.height !== bh) { bloomCanvas.width = bw; bloomCanvas.height = bh; }
    bloomCtx.clearRect(0, 0, bw, bh);
    /* knock the mid-tones down on the way in so only the lights, the
       whites and the sparkles bleed; the shadows stay shadows */
    bloomCtx.filter = 'brightness(0.8) contrast(2) saturate(1.2)';
    bloomCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, bw, bh);
    bloomCtx.filter = 'none';
    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalCompositeOperation = 'screen';
    c.globalAlpha = alpha;
    c.filter = 'blur(5px)';
    c.drawImage(bloomCanvas, 0, 0, bw, bh, -8, -8, CANVAS_W + 16, CANVAS_H + 16);
    c.restore();
  }

  /* Colour grade: warm light from above, cool shadow pooling at the
     floor, and a touch of overlay contrast so the frame stops looking
     coloured-in. Two gradient fills and nothing else. */
  function drawGrade(c, stage) {
    var V = Game.ui.VIEW;
    c.save();
    /* one soft-light pass: light stops lift, dark stops deepen, so the
       same gradient does the split-toning and the contrast */
    c.globalCompositeOperation = 'soft-light';
    var g = c.createLinearGradient(0, V.y, 0, V.y + V.h);
    if (stage) {
      g.addColorStop(0, 'rgba(255, 150, 210, 0.6)');
      g.addColorStop(0.5, 'rgba(170, 80, 190, 0.3)');
      g.addColorStop(1, 'rgba(20, 6, 40, 0.85)');
    } else {
      /* the cove sinks into plum, the lit band of the room stays warm,
         and the floor at the camera's feet falls off into shadow */
      g.addColorStop(0, 'rgba(60, 20, 90, 0.75)');
      g.addColorStop(0.2, 'rgba(255, 214, 160, 0.22)');
      g.addColorStop(0.5, 'rgba(255, 220, 225, 0.1)');
      g.addColorStop(0.78, 'rgba(90, 30, 120, 0.5)');
      g.addColorStop(1, 'rgba(30, 8, 60, 0.9)');
    }
    c.fillStyle = g;
    c.fillRect(V.x, V.y, V.w, V.h);
    /* and a nudge of saturation: the blend keeps the frame's hue and
       light and borrows only the richness of a pure magenta */
    c.globalCompositeOperation = 'saturation';
    c.globalAlpha = stage ? 0.1 : 0.22;
    c.fillStyle = '#ff00a0';
    c.fillRect(V.x, V.y, V.w, V.h);
    c.restore();
  }

  /* Cinematic edge falloff over whatever was just drawn, so the eye is
     pulled to the middle of the screen. One gradient fill per frame. */
  function drawVignette(c, strength) {
    var V = Game.ui.VIEW;
    var cx = V.x + V.w / 2, cy = V.y + V.h / 2;
    var r = Math.max(V.w, V.h) * 0.76;
    var g = c.createRadialGradient(cx, cy, r * 0.42, cx, cy, r);
    g.addColorStop(0, 'rgba(43, 21, 48, 0)');
    g.addColorStop(0.6, 'rgba(43, 21, 48, ' + (strength * 0.45) + ')');
    g.addColorStop(1, 'rgba(43, 21, 48, ' + strength + ')');
    c.fillStyle = g;
    c.fillRect(V.x, V.y, V.w, V.h);
  }

  var linkEl = null, lastLinkShown = null, lastCursor = null;
  function updateChrome() {
    if (!linkEl) linkEl = document.getElementById('game-center-link');
    var show = state === State.TITLE || state === State.PAUSED;
    if (linkEl && show !== lastLinkShown) {
      linkEl.classList.toggle('hidden', !show);
      lastLinkShown = show;
    }
    var cursor = Game.ui.isHot() ? 'pointer' : 'default';
    if (cursor !== lastCursor) { canvas.style.cursor = cursor; lastCursor = cursor; }
  }

  function showTouchButtons() {
    return state === State.PLAYING || state === State.PAUSED;
  }

  /* Everything standing on the floor, in world space (caller has
     translated by -camX). Drawn twice a frame: once mirrored into the
     reflection band, once for real. */
  function drawWorldObjects(c, camX, target) {
    var S = Game.STUDIO;
    var i;
    for (i = 0; i < S.decor.length; i++) {
      var d = S.decor[i];
      if (d.x < camX - 200 || d.x > camX + W + 200) continue;
      Game.studio.drawDecor(c, d, S.groundY, t);
    }
    for (i = 0; i < Game.STATIONS.length; i++) {
      var st = Game.STATIONS[i];
      if (st.x < camX - 220 || st.x > camX + W + 220) continue;
      Game.studio.drawStation(c, st, S.groundY, t, target && target.id === 'station:' + st.id);
    }
    if (S.runwayDoor.x > camX - 200 && S.runwayDoor.x < camX + W + 200) {
      Game.studio.drawRunwayDoor(c, S.runwayDoor.x, S.groundY, t, target && target.id === 'runway');
    }
  }

  function drawWorld(c) {
    var S = Game.STUDIO;
    var camX = camera.x;
    var target = nearest();

    Game.studio.drawBackdrop(c, camX, t, S.groundY);

    /* the polished floor: booths, props and Momoko mirrored under their feet */
    Game.studio.drawReflectionBand(c, S.groundY, camX, function (g) {
      drawWorldObjects(g, camX, target);
      E.drawCharacter(g, player.x, player.y, Game.look, player.frame, player.facing, PLAYER_SCALE, false, 0, { noShadow: true, t: t });
    }, 0.44);

    c.save();
    c.translate(-camX, 0);
    if (camX < 500) Game.studio.drawStudioSign(c, 170, S.groundY);
    drawWorldObjects(c, camX, target);
    player.draw(c, Game.look, PLAYER_SCALE, t);
    for (var p = 0; p < particles.length; p++) particles[p].draw(c);
    c.restore();
    drawAmbientSparkles(c, camX);
    Game.studio.drawForeground(c, camX, t);

    if (target && state === State.PLAYING) {
      Game.ui.drawPrompt(c, target.x - camX, target.promptY, target.label);
    }
    if (state !== State.PAUSED) Game.ui.drawHud(c);
    Game.ui.drawToast(c);
  }

  /* Slow glitter drifting through the studio air, deterministic so it
     costs nothing and never pops. */
  var SPARKLES = (function () {
    var rnd = E.seeded(4242), out = [];
    for (var i = 0; i < 26; i++) out.push({ x: rnd() * 1600, y: 40 + rnd() * 300, ph: rnd() * 6.28, sp: 0.2 + rnd() * 0.3, r: 1.5 + rnd() * 2 });
    return out;
  })();
  function drawAmbientSparkles(c, camX) {
    c.save();
    c.fillStyle = '#ffffff';
    for (var i = 0; i < SPARKLES.length; i++) {
      var sp = SPARKLES[i];
      var x = ((sp.x - camX * 0.6 + t * sp.sp) % 1600 + 1600) % 1600 - 400;
      if (x < -10 || x > W + 10) continue;
      var y = sp.y + Math.sin(t / 50 + sp.ph) * 8;
      var tw = Math.sin(t / 9 + sp.ph);
      if (tw <= 0.2) continue;
      c.globalAlpha = (tw - 0.2) * 0.9;
      E.star(c, x, y, sp.r * tw + 1);
    }
    c.restore();
  }

  /* ---- Clicks ---- */
  function onPointerDown(e) {
    Game.audio.init();
    Game.audio.resume();
    var pos = Game.input.getClickPos(e);
    var mx = pos.x, my = pos.y;
    var action;

    if (Game.gate.isOpen()) { Game.gate.click(mx, my); return; }

    switch (state) {
      case State.TITLE:
        action = Game.ui.handleTitleClick(mx, my);
        if (action === 'play') { Game.audio.play('select'); startGame(); }
        else if (action === 'lang') { toggleLang(); }
        else if (action === 'sound') { toggleSound(); }
        else if (action === 'reset') { resetSave(); Game.audio.play('select'); }
        else if (action === 'select') Game.audio.play('select');
        break;

      case State.INTRO:
        action = Game.ui.handleIntroClick(mx, my);
        if (action === 'continue') {
          Game.audio.play('select');
          Game.flags.introSeen = true;
          save();
          enterPlaying();
        }
        break;

      case State.PAUSED:
        action = Game.ui.handlePauseClick(mx, my);
        if (action === 'resume') { Game.audio.play('select'); state = prevState || State.PLAYING; }
        else if (action === 'lang') toggleLang();
        else if (action === 'sound') toggleSound();
        else if (action === 'quit') { Game.audio.play('select'); save(); state = State.TITLE; Game.audio.startMusic('title'); }
        break;

      case State.WARDROBE:
        action = Game.ui.handleWardrobeClick(mx, my);
        if (action === 'done') { Game.audio.play('select'); save(); state = State.PLAYING; }
        break;

      case State.RUNWAY:
        action = Game.runway.click(mx, my);
        if (action === 'exit') exitRunway();
        break;
    }
  }

  function toggleLang() {
    Game.i18n.toggle();
    Game.audio.play('select');
    E.clearSpriteCache();
    save();
  }

  function toggleSound() {
    var muted = Game.audio.toggleMute();
    if (!muted) {
      Game.audio.play('select');
      if (state === State.TITLE) Game.audio.startMusic('title');
      else if (state === State.RUNWAY) Game.audio.startMusic('runway');
      else Game.audio.startMusic('studio');
    }
    save();
  }

  function onVisibilityChange() {
    if (document.hidden) Game.input.releaseAll();
  }

  /* ---- Boot ---- */
  var FIXED_DT = 1000 / 60;
  var lastTime = 0;
  var accumulator = 0;

  /* Adaptive quality: the frame interval is the one honest measure of
     cost on a GPU-backed canvas, so after the first seconds settle, a
     device that cannot hold the frame rate loses the post effects in
     two steps rather than stuttering through the show. */
  var frameEma = 16.7, frameCount = 0, fxLevel = 2;
  function watchFrameRate(delta) {
    frameCount++;
    if (frameCount < 120 || delta > 90) return;
    frameEma += (delta - frameEma) * 0.04;
    if (frameCount % 240 !== 0 || frameEma < 28) return;
    if (fxLevel === 2) { Game.FX.grade = false; Game.FX.bloom = false; fxLevel = 1; }
    else if (fxLevel === 1) { Game.FX.dof = false; Game.FX.frost = false; fxLevel = 0; }
  }

  function gameLoop(timestamp) {
    var delta = timestamp - lastTime;
    lastTime = timestamp;
    if (delta > 100) delta = 100;
    watchFrameRate(delta);
    accumulator += delta;
    while (accumulator >= FIXED_DT) {
      update();
      accumulator -= FIXED_DT;
    }
    render();
    requestAnimationFrame(gameLoop);
  }

  function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    load();
    computeCanvasLayout();
    resizeBackingStore();

    Game.input.init(canvas);
    Game.audio.init();
    Game.audio.setMuted(!!(Game.settings && Game.settings.muted));

    player = new E.Player(Game.STUDIO.playerStart.x, Game.STUDIO.playerStart.y);

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', function () { setTimeout(onResize, 120); });
    document.addEventListener('visibilitychange', onVisibilityChange);

    var lastTouchTap = -1e9;
    canvas.addEventListener('touchend', function (e) {
      lastTouchTap = performance.now();
      onPointerDown(e);
    });
    canvas.addEventListener('click', function (e) {
      if (performance.now() - lastTouchTap < 700) return;
      onPointerDown(e);
    });

    Game.audio.startMusic('title');
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  window.Game.engine = {
    init: init,
    save: save,
    getState: function () { return state; },
    getPlayer: function () { return player; },
    getCameraX: function () { return camera.x; },
    /* debug / test hooks */
    _setState: function (s) { state = s; },
    _teleport: function (x) { player.x = x; camera.x = Math.max(0, Math.min(Game.STUDIO.width - W, x - W / 2)); },
    _openStation: openStation,
    _enterWardrobe: enterWardrobe,
    _enterRunway: enterRunway,
    _forceRender: render,
    _step: function (n) { for (var i = 0; i < (n || 1); i++) update(); },
    State: State,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
