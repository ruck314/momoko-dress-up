/* studio.js – the fashion studio scenery and the runway hall.
 *
 * Everything here is a pure function of (camX, t) so the studio looks the
 * same every visit. The backdrop fills Game.ui.VIEW so it runs under the
 * tablet bezel on menu screens; world objects (booths, plants, the door)
 * are drawn in world space by callers that have translated by -camX.
 */
(function () {
  'use strict';
  window.Game = window.Game || {};
  var PAL = Game.PAL;
  var E = Game.entities;
  var W = 800, H = 480;

  function view() { return Game.ui ? Game.ui.VIEW : { x: 0, y: 0, w: W, h: H }; }
  function T(k) { return Game.i18n.t(k); }
  function fitText(c, text, maxW, basePx, weight) {
    var px = basePx;
    do {
      c.font = (weight || 'bold') + ' ' + px + 'px "M PLUS Rounded 1c", sans-serif';
      px--;
    } while (px > 7 && c.measureText(text).width > maxW);
  }

  /* ================================================================
     Backdrop: wall, windows, bunting, lights, floor
     ================================================================ */
  var BUNTING_COLS = [PAL.pink, PAL.sun, PAL.mint, PAL.lavender, PAL.sky, PAL.coral];

  /* Wallpaper tile: tiny hearts and dots on the pink, painted once. */
  function wallpaperTile() {
    return E.getCachedSprite('wallpaper', 120, 120, function (g) {
      var rnd = E.seeded(12);
      g.globalAlpha = 0.18;
      for (var i = 0; i < 6; i++) {
        var x = 10 + (i % 3) * 40 + (Math.floor(i / 3) % 2) * 20, y = 14 + Math.floor(i / 3) * 60;
        if (i % 2 === 0) E.heart(g, x, y, 5, '#ffffff', false);
        else E.fillEllipse(g, x, y, 3.2, 3.2, '#ffffff', false);
      }
      g.globalAlpha = 0.1;
      for (var k = 0; k < 8; k++) E.fillEllipse(g, rnd() * 120, rnd() * 120, 1.4, 1.4, '#e2559a', false);
    });
  }

  function drawWall(c, camX, groundY) {
    var V = view();
    var g = c.createLinearGradient(0, V.y, 0, groundY);
    g.addColorStop(0, '#fff3f8');
    g.addColorStop(0.55, PAL.wall);
    g.addColorStop(1, PAL.wallB);
    c.fillStyle = g;
    c.fillRect(V.x, V.y, V.w, groundY - V.y);
    /* wallpaper pattern, parallax at 0.5 */
    var tile = wallpaperTile();
    var off = -((camX * 0.5) % 120);
    for (var x = V.x + off - 120; x < V.x + V.w; x += 120) {
      for (var y = V.y; y < groundY - 110; y += 120) {
        c.drawImage(tile, x, y, 120, Math.min(120, groundY - 110 - y));
      }
    }
    /* picture rail */
    E.fillRound(c, V.x, groundY - 240, V.w, 8, 0, '#ffffff', false);
    c.fillStyle = 'rgba(74,42,64,0.12)';
    c.fillRect(V.x, groundY - 232, V.w, 3);
    /* wainscot: cream panelling along the lower wall */
    var wg = c.createLinearGradient(0, groundY - 110, 0, groundY);
    wg.addColorStop(0, '#fff7f1');
    wg.addColorStop(1, '#f6e2ea');
    c.fillStyle = wg;
    c.fillRect(V.x, groundY - 110, V.w, 102);
    c.fillStyle = '#ffffff';
    c.fillRect(V.x, groundY - 114, V.w, 6);
    c.fillStyle = 'rgba(74,42,64,0.1)';
    c.fillRect(V.x, groundY - 108, V.w, 2);
    /* panel frames, scrolling with the world */
    var poff = -(camX % 160);
    c.strokeStyle = 'rgba(226, 85, 154, 0.22)';
    c.lineWidth = 2;
    for (var px = V.x + poff - 160; px < V.x + V.w + 160; px += 160) {
      E.roundRect(c, px + 14, groundY - 96, 132, 70, 6);
      c.stroke();
    }
    /* skirting */
    c.fillStyle = PAL.floorDark;
    c.fillRect(V.x, groundY - 8, V.w, 8);
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillRect(V.x, groundY - 8, V.w, 2);
  }

  /* A small crystal chandelier for every other ceiling light. */
  function drawChandelier(c, x, y, t) {
    var tw = 0.8 + Math.sin(t / 17 + x) * 0.2;
    c.strokeStyle = PAL.ink; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y - 60); c.lineTo(x, y - 22); c.stroke();
    var g = c.createRadialGradient(x, y, 6, x, y, 86);
    g.addColorStop(0, 'rgba(255, 240, 190, ' + (0.6 * tw) + ')');
    g.addColorStop(0.4, 'rgba(255, 236, 170, ' + (0.22 * tw) + ')');
    g.addColorStop(1, 'rgba(255, 240, 190, 0)');
    c.fillStyle = g;
    c.fillRect(x - 86, y - 86, 172, 172);
    /* arms and candles */
    E.fillEllipse(c, x, y - 2, 30, 8, PAL.gold);
    for (var i = -2; i <= 2; i++) {
      var cx = x + i * 13;
      E.fillRound(c, cx - 2.5, y - 16, 5, 14, 2, '#fff6ec');
      E.fillEllipse(c, cx, y - 19, 3, 4.5, '#ffe28a', false);
      E.fillEllipse(c, cx, y - 20, 1.4, 2.2, '#ffffff', false);
    }
    /* crystal drops */
    for (var k = -3; k <= 3; k++) {
      var dx = x + k * 9, dy = y + 8 + (k % 2 === 0 ? 6 : 0);
      E.fillPath(c, [[dx, dy - 3], [dx + 3, dy + 2], [dx, dy + 8], [dx - 3, dy + 2]], 'rgba(255,255,255,0.85)', true, false);
      c.strokeStyle = 'rgba(74,42,64,0.35)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(dx, dy - 3); c.lineTo(dx + 3, dy + 2); c.lineTo(dx, dy + 8); c.lineTo(dx - 3, dy + 2); c.closePath(); c.stroke();
    }
    E.fillEllipse(c, x, y - 22, 5, 5, PAL.gold);
    /* a glint hopping between the crystals */
    var gi = Math.floor(t / 16 + x / 50) % 7 - 3;
    c.save();
    c.globalAlpha = 0.6 + Math.sin(t / 4) * 0.3;
    c.fillStyle = '#ffffff';
    E.star(c, x + gi * 9, y + 10 + (gi % 2 === 0 ? 6 : 0), 4);
    c.restore();
  }

  /* Framed portrait of a model on the wall between windows. */
  var PORTRAIT_LOOKS = null;
  function portraitLook(n) {
    if (!PORTRAIT_LOOKS) {
      PORTRAIT_LOOKS = [];
      var rnd = E.seeded(777);
      for (var i = 0; i < 8; i++) PORTRAIT_LOOKS.push(E.randomLook(rnd));
    }
    return PORTRAIT_LOOKS[((n % 8) + 8) % 8];
  }
  function drawPortrait(c, x, y, n) {
    E.fillEllipse(c, x, y, 34, 42, PAL.gold);
    E.fillEllipse(c, x, y, 29, 37, '#ffffff', false);
    E.drawLookTile(c, x, y, 70, portraitLook(n), 'hair', { round: true, bgTop: '#fff5fa', bgBot: '#ffd9ea' });
    c.beginPath(); c.ellipse(x, y, 29, 37, 0, 0, Math.PI * 2); E.ink(c, 1.5);
    /* little bow on top of the frame */
    E.fillEllipse(c, x - 6, y - 46, 5, 3.5, PAL.pinkDeep);
    E.fillEllipse(c, x + 6, y - 46, 5, 3.5, PAL.pinkDeep);
    E.fillEllipse(c, x, y - 46, 2.2, 2.2, PAL.sun, false);
  }

  function drawWindow(c, x, y) {
    var w = 92, h = 118;
    E.fillRound(c, x - w / 2 - 6, y - 6, w + 12, h + 12, 12, '#ffffff');
    c.save();
    E.roundRect(c, x - w / 2, y, w, h, 8);
    c.clip();
    var sky = c.createLinearGradient(0, y, 0, y + h);
    sky.addColorStop(0, '#9fd9ff');
    sky.addColorStop(1, '#e4f3ff');
    c.fillStyle = sky;
    c.fillRect(x - w / 2, y, w, h);
    E.fillEllipse(c, x - 20, y + 34, 16, 9, '#ffffff', false);
    E.fillEllipse(c, x - 8, y + 28, 12, 8, '#ffffff', false);
    E.fillEllipse(c, x + 26, y + 70, 14, 8, '#ffffff', false);
    E.fillEllipse(c, x + 30, y - 2, 22, 22, PAL.sun, false);
    c.restore();
    E.roundRect(c, x - w / 2, y, w, h, 8);
    E.ink(c, 2);
    c.strokeStyle = PAL.ink; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + h); c.moveTo(x - w / 2, y + h / 2); c.lineTo(x + w / 2, y + h / 2); c.stroke();
    /* curtains */
    E.fillRound(c, x - w / 2 - 10, y - 10, 18, h + 20, 6, PAL.pink);
    E.fillRound(c, x + w / 2 - 8, y - 10, 18, h + 20, 6, PAL.pink);
    E.fillRound(c, x - w / 2 - 12, y + h * 0.55, 22, 6, 3, PAL.sun);
    E.fillRound(c, x + w / 2 - 10, y + h * 0.55, 22, 6, 3, PAL.sun);
  }

  function drawBunting(c, camX, t) {
    var V = view();
    var span = 150, y0 = V.y + 26;
    var start = Math.floor((camX * 0.8 + V.x) / span) * span - span;
    c.lineWidth = 2;
    for (var sx = start; sx < camX * 0.8 + V.x + V.w + span; sx += span) {
      var x0 = sx - camX * 0.8, x1 = x0 + span;
      c.strokeStyle = 'rgba(74,42,64,0.6)';
      c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2, y0 + 34, x1, y0); c.stroke();
      for (var k = 0; k < 6; k++) {
        var u = (k + 0.5) / 6;
        var bx = x0 + u * span;
        var by = y0 + 34 * 4 * u * (1 - u) * 0.5 + Math.sin(t / 30 + k) * 1.2;
        var col = BUNTING_COLS[(Math.round(sx / span) * 6 + k) % BUNTING_COLS.length];
        E.fillPath(c, [[bx - 9, by], [bx + 9, by], [bx, by + 18]], col);
      }
    }
  }

  function drawLights(c, camX, t, menu) {
    var V = view();
    var span = 190;
    var start = Math.floor((camX + V.x) / span) * span - span;
    for (var wx = start; wx < camX + V.x + V.w + span; wx += span) {
      var x = wx - camX + 95, y = V.y + 62;
      var k = Math.round(wx / span);
      if (k % 2 === 0) { drawChandelier(c, x, y + 14, t); continue; }
      /* a framed portrait hangs under every plain bulb */
      if (!menu) drawPortrait(c, x, V.y + 154, k);
      var tw = 0.75 + Math.sin(t / 20 + wx) * 0.25;
      c.strokeStyle = PAL.ink; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, V.y - 4); c.lineTo(x, y - 14); c.stroke();
      var g = c.createRadialGradient(x, y, 4, x, y, 44);
      g.addColorStop(0, 'rgba(255, 240, 180, ' + (0.55 * tw) + ')');
      g.addColorStop(1, 'rgba(255, 240, 180, 0)');
      c.fillStyle = g;
      c.fillRect(x - 44, y - 44, 88, 88);
      E.fillEllipse(c, x, y, 11, 11, '#fff3b0');
      E.fillEllipse(c, x - 3, y - 4, 3, 2, '#ffffff', false);
      E.fillRound(c, x - 6, y - 17, 12, 7, 3, PAL.gold);
    }
  }

  function drawFloor(c, camX, groundY) {
    var V = view();
    var bottom = V.y + V.h;
    var g = c.createLinearGradient(0, groundY, 0, bottom);
    g.addColorStop(0, PAL.floor);
    g.addColorStop(1, PAL.floorDark);
    c.fillStyle = g;
    c.fillRect(V.x, groundY, V.w, bottom - groundY);
    /* plank lines running into the distance */
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 1.5;
    for (var y = groundY + 14; y < bottom; y += 22) {
      c.beginPath(); c.moveTo(V.x, y); c.lineTo(V.x + V.w, y); c.stroke();
    }
    c.strokeStyle = 'rgba(74,42,64,0.14)';
    var off = -(camX % 120);
    for (var x = V.x + off - 120; x < V.x + V.w + 120; x += 120) {
      c.beginPath(); c.moveTo(x, groundY); c.lineTo(x + 30, bottom); c.stroke();
    }
    c.restore();
    /* runner carpet down the middle of the hall, with a woven edge */
    c.fillStyle = 'rgba(226, 85, 154, 0.38)';
    c.fillRect(V.x, groundY + 10, V.w, 40);
    c.fillStyle = 'rgba(255, 210, 74, 0.55)';
    c.fillRect(V.x, groundY + 10, V.w, 3);
    c.fillRect(V.x, groundY + 47, V.w, 3);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    var coff = -(camX % 40);
    for (var cx = V.x + coff - 40; cx < V.x + V.w + 40; cx += 40) c.fillRect(cx, groundY + 14, 3, 32);
    /* a sheen across the polished boards */
    var sheen = c.createLinearGradient(0, groundY, 0, groundY + 50);
    sheen.addColorStop(0, 'rgba(255,255,255,0.28)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sheen;
    c.fillRect(V.x, groundY, V.w, 50);
  }

  function drawBackdrop(c, camX, t, groundY, winShift, menu) {
    var V = view();
    drawWall(c, camX, groundY);
    /* windows between the stations, parallax 0.85. winShift nudges the
       whole row so menu screens can keep a window out from under text. */
    var span = Game.STUDIO.stationGap * 2;
    var off = 60 + (winShift || 0);
    var start = Math.floor((camX * 0.85 + V.x - off) / span) * span - span;
    for (var wx = start; wx < camX * 0.85 + V.x + V.w + span; wx += span) {
      drawWindow(c, wx - camX * 0.85 + off, groundY - 226);
    }
    drawLightShafts(c, camX, groundY, winShift);
    drawLights(c, camX, t, menu);
    drawBunting(c, camX, t);
    drawFloor(c, camX, groundY);
    drawFloorShadow(c, groundY);
  }

  /* Sunlight slanting in through every window and pooling on the floor. */
  function drawLightShafts(c, camX, groundY, winShift) {
    var V = view();
    var span = Game.STUDIO.stationGap * 2;
    var off = 60 + (winShift || 0);
    var start = Math.floor((camX * 0.85 + V.x - off) / span) * span - span;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (var wx = start; wx < camX * 0.85 + V.x + V.w + span; wx += span) {
      var x = wx - camX * 0.85 + off, y = groundY - 226;
      var g = c.createLinearGradient(x, y, x - 90, groundY + 40);
      g.addColorStop(0, 'rgba(255, 246, 214, 0.26)');
      g.addColorStop(0.6, 'rgba(255, 246, 214, 0.08)');
      g.addColorStop(1, 'rgba(255, 246, 214, 0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x - 46, y); c.lineTo(x + 46, y);
      c.lineTo(x - 40, groundY + 40); c.lineTo(x - 190, groundY + 40);
      c.closePath(); c.fill();
    }
    c.restore();
  }

  /* Ambient occlusion where the wall meets the floor. */
  function drawFloorShadow(c, groundY) {
    var V = view();
    var g = c.createLinearGradient(0, groundY - 2, 0, groundY + 22);
    g.addColorStop(0, 'rgba(74, 42, 64, 0.22)');
    g.addColorStop(1, 'rgba(74, 42, 64, 0)');
    c.fillStyle = g;
    c.fillRect(V.x, groundY - 2, V.w, 24);
  }

  /* ================================================================
     Booths
     ================================================================ */
  function sampleLook(st) {
    var look = JSON.parse(JSON.stringify(Game.DEFAULT_LOOK));
    look.mannequin = true;
    switch (st.id) {
      case 'skin': look.mannequin = false; look.skin = Game.SKIN_COLORS[2]; look.showFace = true; break;
      case 'hair': look.showHair = true; look.hairStyle = 'longWavy'; look.hair = st.hue; break;
      case 'eyes': look.mannequin = false; look.eyeStyle = 'sparkle'; look.eyeColor = Game.EYE_COLORS[1]; break;
      case 'nose': look.mannequin = false; look.noseStyle = 'freckles'; break;
      case 'ears': look.mannequin = false; look.earStyle = 'cat'; look.earColor = st.hue; break;
      case 'mouth': look.mannequin = false; look.mouthStyle = 'grin'; look.lipColor = Game.LIP_COLORS[1]; break;
      case 'dress': look.dress = 'ballgown'; look.dressColor = st.hue; break;
      case 'pants': look.pants = 'overalls'; look.pantsColor = st.hue; break;
      case 'jacket': look.jacket = 'hoodie'; look.jacketColor = st.hue; break;
      case 'shoes': look.shoes = 'rainBoots'; look.shoeColor = st.hue; break;
      case 'hat': look.showHat = true; look.hat = 'partyHat'; look.hatColor = st.hue; break;
      case 'bag': look.bag = 'tote'; look.bagColor = st.hue; break;
      case 'extra': look.accessory = 'wings'; look.accColor = st.hue; break;
    }
    return look;
  }
  var sampleCache = {};
  function stationSample(st) {
    if (!sampleCache[st.id]) sampleCache[st.id] = sampleLook(st);
    return sampleCache[st.id];
  }

  function drawAwning(c, x, y, w, col, t) {
    var sway = Math.sin(t / 40) * 1.2;
    var n = 6, seg = w / n;
    for (var i = 0; i < n; i++) {
      var ax = x - w / 2 + i * seg;
      E.fillPath(c, [[ax, y], [ax + seg, y], [ax + seg - 2 + sway, y + 22], [ax + 2 + sway, y + 22]],
        i % 2 === 0 ? col : PAL.cream);
    }
    c.beginPath();
    for (var k = 0; k < n; k++) {
      var sx = x - w / 2 + k * seg + sway;
      c.moveTo(sx, y + 22);
      c.arc(sx + seg / 2, y + 22, seg / 2, Math.PI, 0, true);
    }
    c.fillStyle = col;
    c.fill();
    E.ink(c, 2);
    E.fillRound(c, x - w / 2 - 4, y - 5, w + 8, 8, 4, E.shade(col, -18));
  }

  function drawBoothProps(c, st, x, groundY) {
    /* a vase of flowers, a little bell, and a stack of hat boxes */
    E.fillRound(c, x + 40, groundY - 92, 16, 22, 4, '#ffffff');
    E.fillRound(c, x + 42, groundY - 92, 12, 4, 2, st.hue, false);
    c.strokeStyle = '#3e9b5a'; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x + 48, groundY - 92); c.lineTo(x + 44, groundY - 108); c.moveTo(x + 48, groundY - 92); c.lineTo(x + 52, groundY - 110); c.moveTo(x + 48, groundY - 92); c.lineTo(x + 48, groundY - 112); c.stroke();
    E.fillEllipse(c, x + 44, groundY - 110, 4, 4, PAL.pink, false);
    E.fillEllipse(c, x + 52, groundY - 112, 4, 4, PAL.sun, false);
    E.fillEllipse(c, x + 48, groundY - 114, 4, 4, PAL.lavender, false);
    E.fillEllipse(c, x + 44, groundY - 110, 1.4, 1.4, PAL.sun, false);
    E.fillEllipse(c, x + 52, groundY - 112, 1.4, 1.4, PAL.coral, false);
    E.fillEllipse(c, x + 48, groundY - 114, 1.4, 1.4, '#ffffff', false);
    /* bell */
    E.fillEllipse(c, x + 66, groundY - 74, 4, 4, PAL.gold);
    E.fillRound(c, x + 60, groundY - 80, 12, 8, 2, PAL.gold);
    /* hat boxes */
    E.fillRound(c, x - 66, groundY - 86, 30, 16, 4, E.shade(st.hue, 30));
    E.fillRound(c, x - 62, groundY - 100, 26, 14, 4, E.shade(st.hue, 55));
    E.fillRound(c, x - 54, groundY - 101, 4, 30, 1.5, PAL.pinkDeep, false);
    E.fillEllipse(c, x - 52, groundY - 104, 3, 2.4, PAL.pinkDeep, false);
    E.fillEllipse(c, x - 48, groundY - 104, 3, 2.4, PAL.pinkDeep, false);
  }

  function drawStation(c, st, groundY, t, near) {
    var x = st.x;
    var bob = Math.sin(t / 18 + st.x) * 2;
    E.softShadow(c, x, groundY + 2, 110, 10, 0.2);

    /* back board with a lit side */
    E.fillRound(c, x - 78, groundY - 196, 156, 152, 10, '#ffffff');
    c.save();
    E.roundRect(c, x - 74, groundY - 192, 148, 144, 8);
    c.clip();
    var g = c.createLinearGradient(x - 74, 0, x + 74, 0);
    g.addColorStop(0, E.shade(st.hue, 75));
    g.addColorStop(0.5, E.shade(st.hue, 55));
    g.addColorStop(1, E.shade(st.hue, 38));
    c.fillStyle = g;
    c.fillRect(x - 74, groundY - 192, 148, 144);
    var rnd = E.seeded(st.x);
    for (var d = 0; d < 14; d++) {
      E.fillEllipse(c, x - 70 + rnd() * 140, groundY - 188 + rnd() * 136, 2 + rnd() * 2, 2 + rnd() * 2, 'rgba(255,255,255,0.7)', false);
    }
    /* a shelf with little bottles */
    E.fillRound(c, x - 70, groundY - 74, 140, 5, 2, E.shade(st.hue, -10), false);
    c.restore();
    /* the awning's shadow falls across the top of the board */
    c.save();
    E.roundRect(c, x - 74, groundY - 192, 148, 144, 8); c.clip();
    var ag = c.createLinearGradient(0, groundY - 192, 0, groundY - 158);
    ag.addColorStop(0, 'rgba(74, 42, 64, 0.26)');
    ag.addColorStop(1, 'rgba(74, 42, 64, 0)');
    c.fillStyle = ag;
    c.fillRect(x - 74, groundY - 192, 148, 36);
    c.restore();
    E.roundRect(c, x - 74, groundY - 192, 148, 144, 8);
    E.ink(c, 2);

    /* the display: a round mirror showing what this station changes */
    var mr = 44;
    var my = groundY - 128 + bob;
    E.softShadow(c, x + 4, my + 8, mr + 6, mr + 6, 0.12);
    E.fillEllipse(c, x, my, mr + 6, mr + 6, PAL.gold);
    E.fillEllipse(c, x, my, mr + 2, mr + 2, '#ffffff', false);
    var sample = stationSample(st);
    E.drawLookTile(c, x, my, mr * 2, sample, st.id, { round: true, t: t });
    c.beginPath(); c.arc(x, my, mr, 0, Math.PI * 2); E.ink(c, 2);
    c.save(); c.globalAlpha = 0.45; E.fillEllipse(c, x - 16, my - 22, 9, 4, '#ffffff', false); c.restore();
    /* gem studs round the frame */
    for (var gs = 0; gs < 8; gs++) {
      var ga = gs * Math.PI / 4 + Math.PI / 8;
      E.fillEllipse(c, x + Math.cos(ga) * (mr + 3), my + Math.sin(ga) * (mr + 3), 2.2, 2.2, gs % 2 ? PAL.pink : '#ffffff', false);
    }

    /* counter: striped front, shaded end, wooden top */
    E.fillRound(c, x - 72, groundY - 62, 144, 62, 6, st.hue);
    c.save();
    E.roundRect(c, x - 72, groundY - 62, 144, 62, 6); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (var sx = x - 66; sx < x + 72; sx += 24) c.fillRect(sx, groundY - 62, 10, 62);
    var cg = c.createLinearGradient(x - 72, 0, x + 72, 0);
    cg.addColorStop(0, 'rgba(255,255,255,0.18)');
    cg.addColorStop(0.7, 'rgba(0,0,0,0)');
    cg.addColorStop(1, 'rgba(74,42,64,0.18)');
    c.fillStyle = cg;
    c.fillRect(x - 72, groundY - 62, 144, 62);
    c.restore();
    E.roundRect(c, x - 72, groundY - 62, 144, 62, 6); E.ink(c, 2);
    /* the counter top's shadow on the striped front */
    c.save();
    E.roundRect(c, x - 72, groundY - 62, 144, 62, 6); c.clip();
    var sg = c.createLinearGradient(0, groundY - 58, 0, groundY - 40);
    sg.addColorStop(0, 'rgba(74, 42, 64, 0.28)');
    sg.addColorStop(1, 'rgba(74, 42, 64, 0)');
    c.fillStyle = sg;
    c.fillRect(x - 72, groundY - 58, 144, 20);
    c.restore();
    E.fillRound(c, x - 80, groundY - 70, 160, 14, 5, PAL.wood);
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(x - 78, groundY - 68, 156, 3);
    c.fillStyle = 'rgba(74,42,64,0.15)'; c.fillRect(x - 78, groundY - 59, 156, 2);
    drawBoothProps(c, st, x, groundY);

    drawAwning(c, x, groundY - 212, 176, st.hue, t);
    /* fairy lights under the awning */
    for (var fl = 0; fl < 7; fl++) {
      var lx = x - 72 + fl * 24, on = ((fl + Math.floor(t / 12)) % 3) === 0;
      E.fillEllipse(c, lx, groundY - 186 + Math.sin(fl * 1.3) * 2, 2.6, 2.6, on ? '#fff6c8' : PAL.sun, false);
    }

    /* sign */
    var label = T(st.labelKey);
    c.save(); c.globalAlpha = 0.2; E.fillRound(c, x - 70, groundY - 232, 140, 26, 8, PAL.ink, false); c.restore();
    E.fillRound(c, x - 70, groundY - 236, 140, 26, 8, PAL.cream);
    c.fillStyle = PAL.ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, label, 126, 14);
    c.fillText(label, x, groundY - 223);

    if (near) {
      c.save();
      c.globalAlpha = 0.5 + Math.sin(t / 6) * 0.3;
      c.fillStyle = '#ffffff';
      for (var s2 = 0; s2 < 5; s2++) {
        var a = t / 40 + s2 * 1.26;
        E.star(c, x + Math.cos(a) * 70, groundY - 128 + Math.sin(a) * 60, 3 + Math.sin(t / 7 + s2) * 1.5);
      }
      c.restore();
    }
  }

  /* ---- Decor between the booths ---- */
  var DECOR_LOOKS = null;
  function decorLook(n) {
    if (!DECOR_LOOKS) {
      DECOR_LOOKS = [];
      var rnd = E.seeded(2024);
      for (var i = 0; i < 16; i++) {
        var lk = E.randomLook(rnd);
        lk.mannequin = true; lk.showHat = true; lk.showHair = false;
        DECOR_LOOKS.push(lk);
      }
    }
    return DECOR_LOOKS[n % DECOR_LOOKS.length];
  }

  function drawPlant(c, x, groundY) {
    E.softShadow(c, x, groundY + 2, 22, 5, 0.18);
    E.fillRound(c, x - 14, groundY - 30, 28, 30, 5, PAL.coral);
    E.fillRound(c, x - 16, groundY - 34, 32, 8, 3, E.shade(PAL.coral, -15));
    c.strokeStyle = '#3e9b5a'; c.lineWidth = 3; c.lineCap = 'round';
    for (var i = -2; i <= 2; i++) {
      c.beginPath(); c.moveTo(x, groundY - 32); c.quadraticCurveTo(x + i * 14, groundY - 60, x + i * 20, groundY - 84 + Math.abs(i) * 10); c.stroke();
      E.fillEllipse(c, x + i * 20, groundY - 84 + Math.abs(i) * 10, 7, 11, '#5cc27a');
    }
    E.fillEllipse(c, x + 10, groundY - 70, 3, 3, PAL.pink, false);
  }
  function drawPoster(c, x, groundY, n) {
    var y = groundY - 200, w = 70, h = 92;
    E.fillRound(c, x - w / 2 - 5, y - 5, w + 10, h + 10, 6, PAL.gold);
    E.fillRound(c, x - w / 2, y, w, h, 3, '#ffffff', false);
    var look = decorLook(n + 3);
    E.drawLookTile(c, x, y + h / 2, 66, look, 'dress', { round: false, bgTop: '#fff5fa', bgBot: '#ffd9ea' });
    c.fillStyle = PAL.pinkDeep;
    E.star(c, x - 26, y + 10, 5);
    E.star(c, x + 26, y + 80, 4);
  }
  function drawMannequinStand(c, x, groundY, n, t) {
    E.softShadow(c, x, groundY + 2, 26, 6, 0.18);
    E.fillEllipse(c, x, groundY - 2, 20, 6, PAL.woodDark);
    E.fillRound(c, x - 3, groundY - 26, 6, 24, 2, PAL.woodDark);
    E.drawCharacter(c, x, groundY - 22, decorLook(n), 0, n % 2 ? -1 : 1, 1.15, false, 0, { noShadow: true, t: t });
  }
  function drawLamp(c, x, groundY, t) {
    E.softShadow(c, x, groundY + 2, 20, 5, 0.18);
    E.fillEllipse(c, x, groundY - 2, 16, 5, PAL.woodDark);
    E.fillRound(c, x - 2.5, groundY - 150, 5, 148, 2, PAL.gold);
    var tw = 0.8 + Math.sin(t / 15) * 0.2;
    var g = c.createRadialGradient(x, groundY - 160, 5, x, groundY - 160, 60);
    g.addColorStop(0, 'rgba(255,240,180,' + 0.45 * tw + ')');
    g.addColorStop(1, 'rgba(255,240,180,0)');
    c.fillStyle = g; c.fillRect(x - 60, groundY - 220, 120, 120);
    E.fillPath(c, [[x - 26, groundY - 150], [x + 26, groundY - 150], [x + 16, groundY - 186], [x - 16, groundY - 186]], PAL.lavender);
    E.fillRound(c, x - 28, groundY - 152, 56, 5, 2, PAL.gold, false);
  }
  function drawMirror(c, x, groundY) {
    E.softShadow(c, x, groundY + 2, 26, 6, 0.18);
    E.fillEllipse(c, x, groundY - 2, 22, 6, PAL.woodDark);
    E.fillRound(c, x - 3, groundY - 30, 6, 28, 2, PAL.gold);
    E.fillEllipse(c, x, groundY - 110, 36, 84, PAL.gold);
    c.save();
    c.beginPath(); c.ellipse(x, groundY - 110, 30, 78, 0, 0, Math.PI * 2); c.clip();
    var g = c.createLinearGradient(x - 30, groundY - 188, x + 30, groundY - 32);
    g.addColorStop(0, '#eaf7ff'); g.addColorStop(0.5, '#c9e6f5'); g.addColorStop(1, '#eaf7ff');
    c.fillStyle = g; c.fillRect(x - 40, groundY - 200, 80, 180);
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(x - 20, groundY - 60); c.lineTo(x + 14, groundY - 160); c.stroke();
    c.restore();
    c.beginPath(); c.ellipse(x, groundY - 110, 30, 78, 0, 0, Math.PI * 2); E.ink(c, 2);
    for (var i = 0; i < 6; i++) {
      var a = i * Math.PI / 3;
      E.fillEllipse(c, x + Math.cos(a) * 34, groundY - 110 + Math.sin(a) * 82, 3, 3, PAL.pink, false);
    }
  }

  function drawDecor(c, d, groundY, t) {
    switch (d.type) {
      case 'plant': drawPlant(c, d.x, groundY); break;
      case 'poster': drawPoster(c, d.x, groundY, d.n || 0); break;
      case 'mannequin': drawMannequinStand(c, d.x, groundY, d.n || 0, t); break;
      case 'lamp': drawLamp(c, d.x, groundY, t); break;
      case 'mirror': drawMirror(c, d.x, groundY); break;
    }
  }

  /* ---- The studio name over the entrance ---- */
  function drawStudioSign(c, x, groundY) {
    var label = T('studioSign');
    E.fillRound(c, x - 110, groundY - 300, 220, 44, 12, PAL.pinkDeep);
    E.fillRound(c, x - 104, groundY - 294, 208, 14, 6, 'rgba(255,255,255,0.3)', false);
    c.fillStyle = PAL.cream;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, label, 196, 20);
    c.fillText(label, x, groundY - 278);
    c.fillStyle = PAL.sun;
    E.star(c, x - 96, groundY - 278, 7);
    E.star(c, x + 96, groundY - 278, 7);
  }

  /* ---- The sparkly door to the runway ---- */
  function drawRunwayDoor(c, x, groundY, t, near) {
    /* red carpet spilling out */
    E.fillPath(c, [[x - 46, groundY - 2], [x + 46, groundY - 2], [x + 70, groundY + 60], [x - 70, groundY + 60]], PAL.pinkDeep, true, false);
    /* door frame */
    c.beginPath();
    c.moveTo(x - 56, groundY);
    c.lineTo(x - 56, groundY - 150);
    c.arc(x, groundY - 150, 56, Math.PI, 0);
    c.lineTo(x + 56, groundY);
    c.closePath();
    c.fillStyle = PAL.gold; c.fill(); E.ink(c, 2.5);
    c.beginPath();
    c.moveTo(x - 44, groundY);
    c.lineTo(x - 44, groundY - 150);
    c.arc(x, groundY - 150, 44, Math.PI, 0);
    c.lineTo(x + 44, groundY);
    c.closePath();
    var g = c.createLinearGradient(0, groundY - 194, 0, groundY);
    g.addColorStop(0, '#2a1440');
    g.addColorStop(1, '#6a2a7a');
    c.fillStyle = g; c.fill();
    /* curtains either side inside the arch */
    c.save();
    c.beginPath();
    c.moveTo(x - 44, groundY); c.lineTo(x - 44, groundY - 150); c.arc(x, groundY - 150, 44, Math.PI, 0); c.lineTo(x + 44, groundY); c.closePath();
    c.clip();
    for (var side = -1; side <= 1; side += 2) {
      var cx = x + side * 34;
      E.fillRound(c, cx - 14, groundY - 200, 28, 210, 8, PAL.coral);
      c.strokeStyle = E.shade(PAL.coral, -20); c.lineWidth = 2;
      for (var k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(cx + k * 7, groundY - 190); c.lineTo(cx + k * 7, groundY - 30); c.stroke(); }
      E.fillRound(c, cx - 16, groundY - 90, 32, 8, 4, PAL.sun);
    }
    /* a glimpse of spotlights beyond */
    c.globalAlpha = 0.5;
    var sp = c.createRadialGradient(x, groundY - 110, 2, x, groundY - 110, 40);
    sp.addColorStop(0, '#ffffff'); sp.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sp; c.fillRect(x - 40, groundY - 150, 80, 80);
    c.restore();
    /* marquee bulbs round the arch */
    for (var i = 0; i <= 12; i++) {
      var a = Math.PI + (i / 12) * Math.PI;
      var bx = x + Math.cos(a) * 50, by = groundY - 150 + Math.sin(a) * 50;
      var on = ((i + Math.floor(t / 10)) % 3) === 0;
      E.fillEllipse(c, bx, by, 4, 4, on ? '#fff6c8' : PAL.sun, false);
      if (on) { c.save(); c.globalAlpha = 0.4; E.fillEllipse(c, bx, by, 8, 8, '#fff6c8', false); c.restore(); }
    }
    for (var j = 0; j < 4; j++) {
      var yy = groundY - 130 + j * 36;
      var on2 = ((j + Math.floor(t / 10)) % 2) === 0;
      E.fillEllipse(c, x - 50, yy, 4, 4, on2 ? '#fff6c8' : PAL.sun, false);
      E.fillEllipse(c, x + 50, yy, 4, 4, on2 ? PAL.sun : '#fff6c8', false);
    }
    /* velvet rope posts either side of the carpet */
    for (var ps = -1; ps <= 1; ps += 2) {
      var px = x + ps * 82;
      E.fillEllipse(c, px, groundY + 4, 12, 4, PAL.woodDark);
      E.fillRound(c, px - 2.5, groundY - 46, 5, 50, 2, PAL.gold);
      E.fillEllipse(c, px, groundY - 48, 5, 5, PAL.gold);
    }
    c.strokeStyle = PAL.pinkDeep; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - 82, groundY - 44); c.quadraticCurveTo(x - 60, groundY - 20, x - 50, groundY - 24); c.stroke();
    c.beginPath(); c.moveTo(x + 82, groundY - 44); c.quadraticCurveTo(x + 60, groundY - 20, x + 50, groundY - 24); c.stroke();
    E.softShadow(c, x, groundY + 2, 70, 7, 0.18);
    /* sign */
    var label = T('runwayDoorSign');
    E.fillRound(c, x - 64, groundY - 236, 128, 30, 10, PAL.pinkDeep);
    c.fillStyle = PAL.cream;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    fitText(c, label, 110, 17);
    c.fillText(label, x, groundY - 221);
    if (near) {
      c.save();
      c.globalAlpha = 0.6 + Math.sin(t / 6) * 0.3;
      c.fillStyle = '#ffffff';
      for (var s = 0; s < 6; s++) {
        var aa = t / 35 + s * 1.05;
        E.star(c, x + Math.cos(aa) * 80, groundY - 110 + Math.sin(aa) * 90, 3 + Math.sin(t / 7 + s) * 1.5);
      }
      c.restore();
    }
  }

  /* ================================================================
     The runway hall
     ================================================================ */
  var RUNWAY = {
    feetY: 318,          /* where the models' feet land on the catwalk */
    stageTop: 300,       /* the top edge of the catwalk slab */
    stageBottom: 360,
    enterX: -40,
    poseX: 560,
    exitX: 860,
    audienceY: 392,
  };

  var AUDIENCE = (function () {
    var rnd = E.seeded(99);
    var rows = [];
    var cols = [PAL.pink, PAL.lavender, PAL.mint, PAL.sky, PAL.sun, PAL.coral, '#ffffff', '#ffd9a8'];
    var poses = ['none', 'arms', 'phone', 'stick', 'none', 'wave', 'stick', 'none'];
    for (var r = 0; r < 3; r++) {
      for (var i = 0; i < 16; i++) {
        rows.push({
          x: -20 + i * 54 + (r % 2) * 27 + rnd() * 10,
          y: RUNWAY.audienceY + r * 30 + rnd() * 6,
          r: 13 + r * 2 + rnd() * 3,
          col: cols[Math.floor(rnd() * cols.length)],
          pose: poses[Math.floor(rnd() * poses.length)],
          hairStyle: ['short', 'bun', 'pony', 'long'][Math.floor(rnd() * 4)],
          ph: rnd() * 6.28,
          skin: Game.SKIN_COLORS[Math.floor(rnd() * Game.SKIN_COLORS.length)],
          hair: Game.HAIR_COLORS[Math.floor(rnd() * Game.HAIR_COLORS.length)],
          row: r,
          flashAt: Math.floor(rnd() * 200),
        });
      }
    }
    return rows;
  })();

  var BALLOONS = (function () {
    var out = [], rnd = E.seeded(5);
    var cols = [PAL.pink, PAL.sun, PAL.mint, PAL.lavender, PAL.sky, PAL.coral];
    for (var side = 0; side < 2; side++) {
      for (var i = 0; i < 4; i++) {
        out.push({ x: (side ? 760 : 40) + (rnd() - 0.5) * 36, y: 150 + rnd() * 60, r: 12 + rnd() * 5,
                   col: cols[Math.floor(rnd() * cols.length)], ph: rnd() * 6.28, side: side });
      }
    }
    return out;
  })();

  function drawSpectator(c, p, t, ex) {
    var bob = Math.max(0, Math.sin(t / (9 - p.row) + p.ph)) * (3 + ex * 7);
    var px = p.x, py = p.y - bob;
    var dim = p.row === 0 ? 0 : p.row === 1 ? -18 : -34;
    var skin = E.shade(p.skin, dim), hair = E.shade(p.hair, dim), shirt = E.shade(p.col, dim);
    /* arms up / waving behind the body */
    if (p.pose === 'arms' || p.pose === 'wave') {
      var sway = Math.sin(t / 8 + p.ph) * 0.25;
      for (var sd = -1; sd <= 1; sd += 2) {
        if (p.pose === 'wave' && sd < 0) continue;
        c.save();
        c.translate(px + sd * p.r * 1.1, py + p.r * 0.9);
        c.rotate(sd * (0.5 + sway));
        E.fillRound(c, -3.5, -p.r * 2.2, 7, p.r * 2.2, 3.5, skin, false);
        E.fillEllipse(c, 0, -p.r * 2.2, 5, 5, skin, false);
        c.restore();
      }
    }
    /* shoulders */
    E.fillRound(c, px - p.r * 1.3, py + p.r * 0.5, p.r * 2.6, p.r * 2.2, p.r, shirt, false);
    /* long hair behind the head */
    if (p.hairStyle === 'long') E.fillRound(c, px - p.r - 2, py - p.r * 0.6, p.r * 2 + 4, p.r * 1.9, p.r * 0.6, hair, false);
    /* head */
    E.fillEllipse(c, px, py - p.r * 0.2, p.r, p.r, skin, false);
    c.beginPath(); c.arc(px, py - p.r * 0.4, p.r + 1, Math.PI, Math.PI * 2); c.closePath();
    c.fillStyle = hair; c.fill();
    if (p.hairStyle === 'bun') E.fillEllipse(c, px, py - p.r * 1.45, p.r * 0.45, p.r * 0.45, hair, false);
    if (p.hairStyle === 'pony') E.fillEllipse(c, px + p.r * 0.9, py - p.r * 0.6, p.r * 0.35, p.r * 0.8, hair, false);
    /* glow stick or phone held up */
    if (p.pose === 'stick' && p.row < 2) {
      var sa = Math.sin(t / 10 + p.ph) * 0.5;
      c.save();
      c.translate(px + p.r * 1.3, py + p.r * 0.6);
      c.rotate(sa);
      E.fillRound(c, -2.5, -34, 5, 36, 2.5, p.col, false);
      c.save(); c.globalAlpha = 0.35; E.fillRound(c, -5, -36, 10, 40, 5, p.col, false); c.restore();
      c.restore();
    } else if (p.pose === 'phone' && p.row < 2) {
      var phx = px + p.r * 1.2, phy = py - p.r * 0.9;
      E.fillRound(c, phx - 4, phy - 7, 8, 14, 2, '#3a2a40', false);
      E.fillRound(c, phx - 3, phy - 6, 6, 11, 1, '#9fd9ff', false);
      if (((t + p.flashAt) % 160) < 4) {
        c.save(); c.globalAlpha = 0.9; c.fillStyle = '#ffffff'; E.star(c, phx, phy - 9, 9); c.restore();
      }
    }
  }

  function drawBalloons(c, t) {
    for (var i = 0; i < BALLOONS.length; i++) {
      var b = BALLOONS[i];
      var by = b.y + Math.sin(t / 40 + b.ph) * 6, bx = b.x + Math.sin(t / 55 + b.ph) * 3;
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(bx, by + b.r); c.quadraticCurveTo(bx + 6, by + b.r + 40, bx - 2, RUNWAY.stageTop); c.stroke();
      E.fillEllipse(c, bx, by, b.r, b.r * 1.15, b.col);
      E.fillEllipse(c, bx - b.r * 0.35, by - b.r * 0.4, b.r * 0.3, b.r * 0.42, 'rgba(255,255,255,0.55)', false);
      E.fillPath(c, [[bx - 3, by + b.r * 1.15], [bx + 3, by + b.r * 1.15], [bx, by + b.r * 1.15 + 4]], E.shade(b.col, -15), true, false);
    }
  }

  function drawStage(c, t, excitement) {
    var V = view();
    /* dark hall */
    var g = c.createLinearGradient(0, V.y, 0, V.y + V.h);
    g.addColorStop(0, '#1d0f2e');
    g.addColorStop(0.6, '#3a1a52');
    g.addColorStop(1, '#1a0c26');
    c.fillStyle = g;
    c.fillRect(V.x, V.y, V.w, V.h);

    /* sweeping spotlights */
    c.save();
    c.globalCompositeOperation = 'lighter';
    var beams = [[120, '255,143,192', 0], [400, '159,217,255', 2.1], [680, '255,210,74', 4.2]];
    for (var b = 0; b < beams.length; b++) {
      var bx = beams[b][0];
      var ang = Math.sin(t / 60 + beams[b][2]) * 0.5;
      c.save();
      c.translate(bx, V.y - 10);
      c.rotate(ang);
      var bg = c.createLinearGradient(0, 0, 0, 440);
      bg.addColorStop(0, 'rgba(' + beams[b][1] + ',0.34)');
      bg.addColorStop(0.5, 'rgba(' + beams[b][1] + ',0.12)');
      bg.addColorStop(1, 'rgba(' + beams[b][1] + ',0)');
      c.fillStyle = bg;
      c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.lineTo(120, 440); c.lineTo(-120, 440); c.closePath(); c.fill();
      /* a hot core down the middle of the beam */
      var core = c.createLinearGradient(0, 0, 0, 440);
      core.addColorStop(0, 'rgba(255,255,255,0.18)');
      core.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = core;
      c.beginPath(); c.moveTo(-4, 0); c.lineTo(4, 0); c.lineTo(40, 440); c.lineTo(-40, 440); c.closePath(); c.fill();
      c.restore();
    }
    c.restore();

    /* back curtain with glitter letters */
    var curtainTop = V.y, curtainBot = 240;
    c.fillStyle = '#7a2060';
    c.fillRect(V.x, curtainTop, V.w, curtainBot - curtainTop);
    c.save();
    for (var x = V.x; x < V.x + V.w; x += 26) {
      var cg = c.createLinearGradient(x, 0, x + 26, 0);
      cg.addColorStop(0, 'rgba(0,0,0,0.25)');
      cg.addColorStop(0.5, 'rgba(255,255,255,0.08)');
      cg.addColorStop(1, 'rgba(0,0,0,0.25)');
      c.fillStyle = cg;
      c.fillRect(x, curtainTop, 26, curtainBot - curtainTop);
    }
    c.restore();
    /* a soft pool of light where the models pose */
    var pool = c.createRadialGradient(RUNWAY.poseX, 200, 10, RUNWAY.poseX, 200, 170);
    pool.addColorStop(0, 'rgba(255, 230, 250, 0.28)');
    pool.addColorStop(1, 'rgba(255, 230, 250, 0)');
    c.fillStyle = pool;
    c.fillRect(RUNWAY.poseX - 170, 30, 340, 340);
    E.fillRound(c, V.x, curtainBot - 8, V.w, 10, 0, PAL.gold, false);
    /* big glittery name */
    c.save();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 40px "M PLUS Rounded 1c", sans-serif';
    var title = T('title2');
    fitText(c, title, 520, 40);
    c.lineJoin = 'round';
    c.strokeStyle = PAL.pinkDeep; c.lineWidth = 8;
    c.strokeText(title, W / 2, 120);
    c.fillStyle = PAL.sun;
    c.fillText(title, W / 2, 120);
    for (var s = 0; s < 10; s++) {
      var tw = Math.sin(t / 8 + s * 1.7);
      if (tw <= 0) continue;
      c.globalAlpha = tw;
      c.fillStyle = '#ffffff';
      E.star(c, 140 + s * 58, 96 + ((s * 37) % 50), 2 + tw * 3);
    }
    c.restore();
    /* twinkle lights strung along the curtain */
    for (var i = 0; i < 30; i++) {
      var lx = V.x + (i + 0.5) * (V.w / 30);
      var on = ((i + Math.floor(t / 9)) % 3) === 0;
      E.fillEllipse(c, lx, 48 + Math.sin(i * 0.8) * 6, 3, 3, on ? '#fff6c8' : 'rgba(255,246,200,0.35)', false);
    }
    /* side drapes with gold tie-backs */
    for (var side = -1; side <= 1; side += 2) {
      var dx = side < 0 ? V.x : V.x + V.w - 54;
      var dg = c.createLinearGradient(dx, 0, dx + 54, 0);
      dg.addColorStop(0, side < 0 ? '#b03a7a' : '#7a2060');
      dg.addColorStop(1, side < 0 ? '#7a2060' : '#b03a7a');
      c.fillStyle = dg;
      c.fillRect(dx, V.y, 54, RUNWAY.stageTop - V.y);
      c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 2;
      for (var k = 1; k < 4; k++) { c.beginPath(); c.moveTo(dx + k * 13, V.y); c.lineTo(dx + k * 13, RUNWAY.stageTop); c.stroke(); }
      E.fillRound(c, dx - 4, 190, 62, 12, 6, PAL.gold);
    }
    drawBalloons(c, t);

    /* catwalk slab */
    var ST = RUNWAY.stageTop, SB = RUNWAY.stageBottom;
    c.fillStyle = '#f1dcea';
    c.fillRect(V.x, ST, V.w, SB - ST);
    var runner = c.createLinearGradient(0, ST, 0, SB);
    runner.addColorStop(0, PAL.pinkDeep);
    runner.addColorStop(1, '#b23a7a');
    c.fillStyle = runner;
    c.fillRect(V.x, ST + 8, V.w, SB - ST - 16);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(V.x, ST + 8, V.w, 3);
    /* glossy sheen on the runway */
    var sheen = c.createLinearGradient(0, ST + 8, 0, SB - 8);
    sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0.02)');
    sheen.addColorStop(1, 'rgba(255,255,255,0.1)');
    c.fillStyle = sheen;
    c.fillRect(V.x, ST + 8, V.w, SB - ST - 16);
    c.fillStyle = '#c9a8c0';
    c.fillRect(V.x, SB, V.w, 10);
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(V.x, SB + 10, V.w, 6);
    /* the pose spot: a bright pool on the catwalk where she stops */
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.save();
    c.translate(RUNWAY.poseX, ST + 30);
    c.scale(1, 0.3);
    var ps = c.createRadialGradient(0, 0, 4, 0, 0, 130);
    ps.addColorStop(0, 'rgba(255, 246, 220, 0.42)');
    ps.addColorStop(0.6, 'rgba(255, 246, 220, 0.12)');
    ps.addColorStop(1, 'rgba(255, 246, 220, 0)');
    c.fillStyle = ps;
    c.fillRect(-130, -130, 260, 260);
    c.restore();
    /* stage haze */
    var hz = c.createLinearGradient(0, ST - 90, 0, ST + 10);
    hz.addColorStop(0, 'rgba(255, 200, 240, 0)');
    hz.addColorStop(1, 'rgba(255, 200, 240, 0.14)');
    c.fillStyle = hz;
    c.fillRect(V.x, ST - 90, V.w, 100);
    c.restore();
    /* footlights */
    for (var f = 0; f < 20; f++) {
      var fx = V.x + (f + 0.5) * (V.w / 20);
      var fon = ((f + Math.floor(t / 7)) % 4) === 0;
      E.fillEllipse(c, fx, SB + 6, 4, 3, fon ? '#fff6c8' : PAL.sun, false);
      if (fon) { c.save(); c.globalAlpha = 0.35; E.fillEllipse(c, fx, SB + 4, 10, 7, '#fff6c8', false); c.restore(); }
    }

    /* audience in the foreground, bouncing with excitement */
    var ex = excitement || 0;
    /* the crowd repeats every 864px so it fills the tablet bezel too */
    for (var rep = Math.floor(V.x / 864) - 1; rep * 864 < V.x + V.w + 60; rep++) {
      if (rep * 864 + 900 < V.x) continue;
      c.save();
      c.translate(rep * 864, 0);
      for (var a = 0; a < AUDIENCE.length; a++) drawSpectator(c, AUDIENCE[a], t, ex);
      c.restore();
    }
    var fade = c.createLinearGradient(0, RUNWAY.audienceY + 40, 0, V.y + V.h);
    fade.addColorStop(0, 'rgba(26,12,38,0)');
    fade.addColorStop(1, 'rgba(26,12,38,0.7)');
    c.fillStyle = fade;
    c.fillRect(V.x, RUNWAY.audienceY + 40, V.w, V.y + V.h - RUNWAY.audienceY - 40);
  }

  /* Camera flashes from the crowd: white bursts that fade in a few frames. */
  function drawFlash(c, x, y, life) {
    var a = Math.max(0, life / 10);
    c.save();
    c.globalAlpha = a;
    var g = c.createRadialGradient(x, y, 2, x, y, 40);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(x - 40, y - 40, 80, 80);
    c.fillStyle = '#ffffff';
    E.star(c, x, y, 10 * a + 2);
    c.restore();
  }

  window.Game.studio = {
    drawBackdrop: drawBackdrop,
    drawWall: drawWall,
    drawFloor: drawFloor,
    drawStation: drawStation,
    drawDecor: drawDecor,
    drawStudioSign: drawStudioSign,
    drawRunwayDoor: drawRunwayDoor,
    drawStage: drawStage,
    drawFlash: drawFlash,
    drawBalloons: drawBalloons,
    stationSample: stationSample,
    RUNWAY: RUNWAY,
  };
})();
