/* runway.js – the fashion show.
 *
 * Five models walk the catwalk one at a time: Momoko (in whatever she is
 * wearing) and four friends in random outfits, in a random order. Each
 * model reaches the end, poses for the cameras, and gets a puzzle. The
 * friends think theirs over in a bubble and pass or miss; Momoko's is the
 * real gate. The fewer tries she needs, the higher she places.
 */
(function () {
  'use strict';
  window.Game = window.Game || {};
  var PAL = Game.PAL;
  var E = Game.entities;
  var W = 800, H = 480;

  var t = 0;
  var show = null;
  var particles = [];
  var flashes = [];

  var MAX_TRIES = 4;        /* 1st-4th place by tries, 5th for a miss */
  var NPC_PASS_RATE = 0.65;

  function T(k) { return Game.i18n.t(k); }
  function RW() { return Game.studio.RUNWAY; }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function start() {
    var names = shuffle(Game.MODEL_NAMES.slice()).slice(0, 4);
    var models = [];
    for (var i = 0; i < names.length; i++) {
      models.push(new E.Model(RW().enterX, RW().feetY, E.randomLook(), names[i]));
    }
    var me = new E.Model(RW().enterX, RW().feetY, Game.look, 'momoko');
    me.isPlayer = true;
    models.push(me);
    shuffle(models);
    for (var k = 0; k < models.length; k++) {
      models[k].result = null;      /* { ok, tries } */
      models[k].problem = null;
      models[k].reaction = 0;
    }
    show = {
      models: models,
      idx: -1,
      phase: 'ready',
      timer: 0,
      place: 0,
      excitement: 0,
      gateOpened: false,
    };
    particles = [];
    flashes = [];
    t = 0;
  }

  function current() { return show && show.idx >= 0 && show.idx < show.models.length ? show.models[show.idx] : null; }

  function beginShow() {
    Game.audio.startMusic('runway');
    nextModel();
  }

  function nextModel() {
    show.idx++;
    if (show.idx >= show.models.length) {
      finish();
      return;
    }
    var m = current();
    m.x = RW().enterX;
    m.targetX = RW().poseX;
    m.pose = 'walk';
    show.phase = 'enter';
    show.timer = 0;
    show.gateOpened = false;
    Game.audio.play('applause');
  }

  function finish() {
    show.phase = 'results';
    show.timer = 0;
    /* places: Momoko's is set by her tries; friends who passed fill the
       higher remaining spots, friends who missed the lower ones. */
    var me = null, i;
    for (i = 0; i < show.models.length; i++) if (show.models[i].isPlayer) me = show.models[i];
    var myPlace = me.result && me.result.ok ? Math.min(5, me.result.tries) : 5;
    show.place = myPlace;
    var others = [];
    for (i = 0; i < show.models.length; i++) if (!show.models[i].isPlayer) others.push(show.models[i]);
    others.sort(function (a, b) { return (b.result.ok ? 1 : 0) - (a.result.ok ? 1 : 0); });
    var p = 1;
    for (i = 0; i < others.length; i++) {
      if (p === myPlace) p++;
      others[i].place = p++;
    }
    me.place = myPlace;
    show.ranking = show.models.slice().sort(function (a, b) { return a.place - b.place; });
    var prog = Game.gate.progress();
    prog.shows = (prog.shows || 0) + 1;
    if (myPlace === 1) prog.wins = (prog.wins || 0) + 1;
    Game.audio.stopMusic();
    Game.audio.play(myPlace === 1 ? 'fanfare' : 'applause');
    for (var k = 0; k < 80; k++) {
      particles.push(new E.Particle(Math.random() * W, -20 - Math.random() * 300, (Math.random() - 0.5) * 0.6, 1 + Math.random() * 1.2,
        400, [PAL.sun, PAL.pink, PAL.mint, PAL.lavender, PAL.sky, PAL.coral][k % 6], 3 + Math.random() * 3, 'confetti'));
    }
    if (Game.engine && Game.engine.save) Game.engine.save();
  }

  function react(m, ok) {
    m.result = m.result || { ok: ok, tries: ok ? 1 : MAX_TRIES };
    m.reaction = 120;
    m.pose = ok ? 'wave' : 'walk';
    show.phase = 'react';
    show.timer = 0;
    show.excitement = ok ? 1 : 0.2;
    Game.audio.play(ok ? 'happy' : 'sad');
    if (ok) {
      E.spawnBurst(particles, m.x, m.y - 50, 24, [PAL.sun, PAL.pink, '#ffffff', PAL.mint], 4, 'star');
      E.spawnBurst(particles, m.x, m.y - 60, 10, [PAL.pink, PAL.coral], 3, 'heart');
    }
  }

  function update(keys, jp) {
    if (!show) return null;
    t++;
    show.timer++;
    show.excitement *= 0.985;
    var m = current();
    var i;
    for (i = particles.length - 1; i >= 0; i--) {
      particles[i].update();
      if (particles[i].life <= 0 || particles[i].y > H + 30) particles.splice(i, 1);
    }
    for (i = flashes.length - 1; i >= 0; i--) {
      flashes[i].life--;
      if (flashes[i].life <= 0) flashes.splice(i, 1);
    }

    switch (show.phase) {
      case 'ready':
        if (jp.action) beginShow();
        break;
      case 'enter':
        if (m.update()) {
          m.pose = 'pose';
          show.phase = 'pose';
          show.timer = 0;
          Game.audio.play('camera');
        }
        break;
      case 'pose':
        if (show.timer % 9 === 0 && show.timer < 60) {
          flashes.push({ x: 80 + Math.random() * 640, y: 380 + Math.random() * 70, life: 10 });
          if (show.timer % 18 === 0) Game.audio.play('camera');
        }
        if (show.timer === 60) {
          if (m.isPlayer) {
            show.phase = 'gate';
            show.gateOpened = true;
            Game.gate.open({
              mode: 'runway',
              maxTries: MAX_TRIES,
              onResolve: function (res) {
                m.result = { ok: res.ok, tries: res.tries };
                react(m, res.ok);
              },
            });
          } else {
            m.problem = Game.gate.makeProblem();
            m.willPass = Math.random() < NPC_PASS_RATE;
            show.phase = 'think';
            show.timer = 0;
          }
        }
        break;
      case 'gate':
        /* waiting for the gate's callback */
        break;
      case 'think':
        if (show.timer === 110) {
          m.result = { ok: m.willPass, tries: m.willPass ? 1 + Math.floor(Math.random() * 3) : MAX_TRIES };
          react(m, m.willPass);
        }
        break;
      case 'react':
        if (m.reaction > 0) m.reaction--;
        if (show.timer >= 120) {
          m.pose = 'walk';
          m.targetX = RW().exitX;
          show.phase = 'exit';
          show.timer = 0;
        }
        break;
      case 'exit':
        if (m.update()) nextModel();
        break;
      case 'results':
        break;
    }
    return null;
  }

  /* ---- Drawing ---- */
  var READY_BTN = { x: 300, y: 372, w: 200, h: 48 };
  var AGAIN_BTN = { x: 420, y: 396, w: 170, h: 44 };
  var BACK_BTN = { x: 210, y: 396, w: 190, h: 44 };

  function modelName(m) { return T('model_' + m.name) + (m.isPlayer ? ' (' + T('runwayYou') + ')' : ''); }

  function drawBubble(c, m) {
    /* thought bubble over a friend's head while she works the puzzle */
    var x = m.x, y = m.y - 130 + Math.sin(t / 20) * 2;
    var text = m.problem ? m.problem.text : '';
    var isKanji = m.problem && m.problem.kind === 'kanji';
    c.save();
    c.font = 'bold ' + (isKanji ? 24 : 20) + 'px ' + Game.ui.FONT;
    var tw = c.measureText(text).width;
    var bw = Math.max(84, tw + 36), bh = 48;
    E.fillEllipse(c, x + 10, y + 36, 4, 4, '#ffffff');
    E.fillEllipse(c, x + 16, y + 26, 6, 6, '#ffffff');
    E.fillRound(c, x - bw / 2 + 12, y - bh / 2, bw, bh, 16, '#ffffff');
    c.fillStyle = PAL.ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    var dots = '';
    var n = Math.floor(show.timer / 15) % 4;
    for (var d = 0; d < n; d++) dots += '.';
    c.fillText(text + (isKanji ? '' : ' = ?'), x + 12, y - 2);
    c.font = 'bold 12px ' + Game.ui.FONT;
    c.fillStyle = 'rgba(74,42,64,0.6)';
    c.fillText(dots, x + 12, y + 14);
    c.restore();
  }

  function drawReaction(c, m) {
    var ok = m.result && m.result.ok;
    var x = m.x, y = m.y - 124;
    var pop = Math.min(1, (120 - m.reaction) / 10);
    c.save();
    c.translate(x, y);
    c.scale(pop, pop);
    if (ok) {
      E.fillEllipse(c, 0, 0, 30, 30, PAL.mint);
      c.strokeStyle = '#1f6f5a'; c.lineWidth = 6; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(-13, 1); c.lineTo(-4, 10); c.lineTo(14, -10); c.stroke();
      c.font = 'bold 15px ' + Game.ui.FONT;
      c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 4; c.strokeStyle = '#1f6f5a';
      c.strokeText(T('runwayPass'), 0, -44);
      c.fillText(T('runwayPass'), 0, -44);
    } else {
      /* a little rain cloud */
      E.fillEllipse(c, -10, -6, 14, 11, '#b9b0c4');
      E.fillEllipse(c, 8, -8, 16, 13, '#c9c2d2');
      E.fillEllipse(c, 0, 2, 26, 11, '#c9c2d2');
      c.strokeStyle = PAL.sky; c.lineWidth = 2.5; c.lineCap = 'round';
      for (var r = 0; r < 4; r++) {
        var ry = 14 + ((t * 2 + r * 9) % 24);
        c.beginPath(); c.moveTo(-15 + r * 10, ry); c.lineTo(-17 + r * 10, ry + 7); c.stroke();
      }
      c.font = 'bold 15px ' + Game.ui.FONT;
      c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 4; c.strokeStyle = PAL.purple;
      c.strokeText(T('runwayFail'), 0, -40);
      c.fillText(T('runwayFail'), 0, -40);
    }
    c.restore();
    /* the right answer, small, so the puzzle still teaches */
    if (m.problem && !m.isPlayer) {
      c.save();
      c.font = 'bold 13px ' + Game.ui.FONT;
      var ans = m.problem.text + (m.problem.kind === 'kanji' ? ' = ' : ' = ') + m.problem.answer;
      var bw = c.measureText(ans).width + 22;
      E.fillRound(c, x - bw / 2, y - 150, bw, 24, 12, ok ? PAL.mint : PAL.peach);
      c.fillStyle = PAL.ink; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(ans, x, y - 138);
      c.restore();
    }
  }

  var MODEL_SCALE = 1.75;
  function drawModel(c, m, i) {
    var drooping = show.phase === 'react' && m.result && !m.result.ok;
    var hop = (show.phase === 'react' && m.result && m.result.ok) ? Math.max(0, Math.sin(t / 6)) * 10 : 0;
    c.save();
    if (drooping) {
      c.translate(m.x, m.y);
      c.rotate(0.08 * m.facing);
      c.translate(-m.x, -m.y);
    }
    E.drawReflection(c, m.x, m.y, m.look, m.frame, m.facing, MODEL_SCALE, 0.24, RW().stageBottom - m.y - 9, 'rgba(184,62,128,1)', { pose: m.pose });
    E.drawCharacter(c, m.x, m.y, m.look, m.frame, m.facing, MODEL_SCALE, m.blink, hop, { pose: m.pose, t: t });
    c.restore();
  }

  function drawAnnouncer(c) {
    var m = current();
    if (!m) return;
    c.save();
    var name = modelName(m);
    c.font = 'bold 18px ' + Game.ui.FONT;
    var w = c.measureText(T('runwayNow') + ' ' + name).width + 90;
    var x = (W - w) / 2, y = 10;
    E.fillRound(c, x, y, w, 46, 23, 'rgba(255,246,236,0.95)');
    E.drawPortrait(c, x + 26, y + 23, 36, m.look);
    c.fillStyle = PAL.ink;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.font = '13px ' + Game.ui.FONT;
    c.fillText(T('runwayNow'), x + 52, y + 15);
    c.font = 'bold 18px ' + Game.ui.FONT;
    c.fillStyle = m.isPlayer ? PAL.pinkDeep : PAL.ink;
    c.fillText(name, x + 52, y + 33);
    c.restore();
    /* progress pips */
    for (var i = 0; i < show.models.length; i++) {
      var px = W / 2 - 40 + i * 20, py = 66;
      var done = i < show.idx, cur = i === show.idx;
      E.fillEllipse(c, px, py, cur ? 6 : 4.5, cur ? 6 : 4.5,
        done ? (show.models[i].result && show.models[i].result.ok ? PAL.mint : PAL.peach) : (cur ? PAL.sun : 'rgba(255,255,255,0.5)'), false);
    }
  }

  function drawReady(c) {
    var V = Game.ui.VIEW;
    c.fillStyle = 'rgba(43, 21, 48, 0.55)';
    c.fillRect(V.x, V.y, V.w, V.h);
    Game.ui.panel(c, 120, 60, 560, 380, 'rgba(255,248,243,0.97)');
    c.fillStyle = PAL.pink;
    E.roundRect(c, 128, 68, 544, 48, 10); c.fill();
    c.fillStyle = PAL.ink;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 26px ' + Game.ui.FONT;
    c.fillText(T('runwayTitle'), W / 2, 92);
    /* the five models lined up */
    for (var i = 0; i < show.models.length; i++) {
      var m = show.models[i];
      var x = 190 + i * 105;
      E.drawCharacter(c, x, 252, m.look, 0, 1, 1.35, false, Math.max(0, Math.sin(t / 10 + i)) * 5, { pose: m.isPlayer ? 'wave' : 'walk', t: t });
      c.font = 'bold 12px ' + Game.ui.FONT;
      c.fillStyle = m.isPlayer ? PAL.pinkDeep : PAL.ink;
      c.fillText(modelName(m), x, 272);
    }
    c.fillStyle = PAL.ink;
    c.font = '13px ' + Game.ui.FONT;
    Game.ui.multiline(c, T('runwayReady'), W / 2, 304, 18);
    Game.ui.button(c, READY_BTN, T('runwayStart'), { fill: PAL.sun, font: 18 });
  }

  function drawResults(c) {
    var V = Game.ui.VIEW;
    c.fillStyle = 'rgba(43, 21, 48, 0.5)';
    c.fillRect(V.x, V.y, V.w, V.h);
    Game.ui.panel(c, 110, 36, 580, 420, 'rgba(255,248,243,0.97)');
    c.fillStyle = PAL.sun;
    E.roundRect(c, 118, 44, 564, 46, 10); c.fill();
    c.fillStyle = PAL.ink;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 24px ' + Game.ui.FONT;
    c.fillText(T('runwayResults'), W / 2, 67);

    /* the big ribbon for Momoko */
    var place = show.place;
    var rib = place === 1 ? PAL.gold : place === 2 ? '#c9ced6' : place === 3 ? '#d99a6c' : PAL.lavender;
    E.fillEllipse(c, 200, 160, 48, 48, rib);
    E.fillEllipse(c, 200, 160, 36, 36, E.shade(rib, 25), false);
    E.fillPath(c, [[180, 196], [190, 240], [200, 226], [210, 240], [220, 196]], PAL.pinkDeep);
    c.fillStyle = PAL.ink;
    c.font = 'bold 28px ' + Game.ui.FONT;
    c.fillText(T('ordinal_' + place), 200, 162);
    c.font = 'bold 15px ' + Game.ui.FONT;
    c.fillText(T('runwayYourPlace'), 200, 262);
    c.font = 'bold 14px ' + Game.ui.FONT;
    c.fillStyle = PAL.pinkDeep;
    Game.ui.fitFont(c, T(place === 1 ? 'runwayWinner' : 'runwayGreat'), 220, 14, 'bold', 10);
    var msgLines = Game.ui.layoutLines(c, T(place === 1 ? 'runwayWinner' : 'runwayGreat'), 220);
    for (var l = 0; l < msgLines.length; l++) c.fillText(msgLines[l], 200, 286 + l * 16);
    E.drawCharacter(c, 200, 412, Game.look, 0, 1, 1.4, false, Math.max(0, Math.sin(t / 8)) * 8, { pose: place <= 3 ? 'wave' : 'walk', t: t });

    /* everyone's result */
    for (var i = 0; i < show.ranking.length; i++) {
      var m = show.ranking[i];
      var y = 112 + i * 54;
      var rowFill = m.isPlayer ? 'rgba(255, 210, 74, 0.35)' : 'rgba(255,255,255,0.7)';
      E.fillRound(c, 330, y, 340, 48, 12, rowFill);
      c.fillStyle = PAL.ink;
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.font = 'bold 16px ' + Game.ui.FONT;
      c.fillText(T('ordinal_' + m.place), 344, y + 24);
      E.drawPortrait(c, 410, y + 24, 38, m.look);
      c.font = 'bold 15px ' + Game.ui.FONT;
      c.fillStyle = m.isPlayer ? PAL.pinkDeep : PAL.ink;
      c.fillText(modelName(m), 440, y + 24);
      var ok = m.result && m.result.ok;
      E.fillEllipse(c, 640, y + 24, 14, 14, ok ? PAL.mint : PAL.peach);
      c.strokeStyle = ok ? '#1f6f5a' : '#a0433a'; c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath();
      if (ok) { c.moveTo(634, y + 24); c.lineTo(638, y + 29); c.lineTo(647, y + 18); }
      else { c.moveTo(635, y + 19); c.lineTo(645, y + 29); c.moveTo(645, y + 19); c.lineTo(635, y + 29); }
      c.stroke();
    }
    Game.ui.button(c, AGAIN_BTN, T('runwayAgain'), { fill: PAL.sun, font: 15 });
    Game.ui.button(c, BACK_BTN, T('runwayBack'), { font: 14 });
  }

  function draw(c) {
    if (!show) return;
    var m = current();
    var onStage = m && show.phase !== 'results' && show.phase !== 'ready';
    Game.studio.drawStage(c, t, show.excitement, onStage ? m.x : null);
    c.save();
    c.beginPath(); c.rect(0, 0, W, H); c.clip();
    if (m && show.phase !== 'results') drawModel(c, m);
    for (var f = 0; f < flashes.length; f++) Game.studio.drawFlash(c, flashes[f].x, flashes[f].y, flashes[f].life);
    for (var p = 0; p < particles.length; p++) particles[p].draw(c);
    if (m && show.phase === 'think') drawBubble(c, m);
    if (m && show.phase === 'react') drawReaction(c, m);
    c.restore();
    if (show.phase === 'ready') { drawReady(c); return; }
    if (show.phase === 'results') { drawResults(c); return; }
    drawAnnouncer(c);
  }

  /* returns 'exit' when she heads back to the studio */
  function click(mx, my) {
    if (!show) return null;
    if (show.phase === 'ready' && Game.ui.hit(READY_BTN, mx, my)) { Game.audio.play('select'); beginShow(); return null; }
    if (show.phase === 'results') {
      if (Game.ui.hit(AGAIN_BTN, mx, my)) { Game.audio.play('select'); start(); beginShow(); return null; }
      if (Game.ui.hit(BACK_BTN, mx, my)) { Game.audio.play('select'); show = null; return 'exit'; }
    }
    return null;
  }

  window.Game.runway = {
    start: start,
    update: update,
    draw: draw,
    click: click,
    isActive: function () { return !!show; },
    phase: function () { return show ? show.phase : null; },
    _show: function () { return show; },
    _skipToResults: function () { if (!show) return; for (var i = 0; i < show.models.length; i++) { if (!show.models[i].result) show.models[i].result = { ok: i % 2 === 0, tries: 1 + (i % 3) }; } show.idx = show.models.length; finish(); },
  };
})();
