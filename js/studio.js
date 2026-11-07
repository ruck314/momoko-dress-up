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

  /* Wallpaper tile: a damask lattice with a four-petal motif at every
     node and a tiny heart in every cell, painted once. */
  function wallpaperTile() {
    return E.getCachedSprite('wallpaper', 120, 120, function (g) {
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(0, 60); g.lineTo(60, 0); g.lineTo(120, 60); g.lineTo(60, 120); g.closePath();
      g.moveTo(0, 0); g.lineTo(0, 0);
      g.stroke();
      g.beginPath();
      g.moveTo(-60, 60); g.lineTo(0, 0); g.moveTo(0, 120); g.lineTo(-60, 60);
      g.moveTo(120, 0); g.lineTo(180, 60); g.lineTo(120, 120);
      g.stroke();
      var nodes = [[60, 0], [0, 60], [120, 60], [60, 120], [0, 0], [120, 0], [0, 120], [120, 120]];
      for (var i = 0; i < nodes.length; i++) {
        var nx = nodes[i][0], ny = nodes[i][1];
        g.globalAlpha = 0.26;
        for (var p = 0; p < 4; p++) {
          var a = p * Math.PI / 2;
          E.fillEllipse(g, nx + Math.cos(a) * 5, ny + Math.sin(a) * 5, 3.4, 2.2, '#ffffff', false);
        }
        g.globalAlpha = 0.3;
        E.fillEllipse(g, nx, ny, 1.6, 1.6, '#e2559a', false);
      }
      g.globalAlpha = 0.16;
      E.heart(g, 60, 60, 5.5, '#ffffff', false);
      g.globalAlpha = 0.12;
      E.fillEllipse(g, 30, 30, 1.6, 1.6, '#e2559a', false);
      E.fillEllipse(g, 90, 30, 1.6, 1.6, '#e2559a', false);
      E.fillEllipse(g, 30, 90, 1.6, 1.6, '#e2559a', false);
      E.fillEllipse(g, 90, 90, 1.6, 1.6, '#e2559a', false);
    });
  }

  /* Polished brass: a linear gradient that reads as metal because the
     highlight sits off-centre and the colour swings warm-dark-warm. */
  function metal(c, x0, y0, x1, y1, base) {
    var g = c.createLinearGradient(x0, y0, x1, y1);
    if (base === 'silver') {
      g.addColorStop(0, '#8c8fa0'); g.addColorStop(0.3, '#f4f6ff'); g.addColorStop(0.5, '#b9bdcc');
      g.addColorStop(0.72, '#ffffff'); g.addColorStop(1, '#7c8090');
    } else {
      g.addColorStop(0, '#9a6a14'); g.addColorStop(0.28, '#f8dd86'); g.addColorStop(0.5, '#c9931f');
      g.addColorStop(0.72, '#fff3b8'); g.addColorStop(1, '#8a5a12');
    }
    return g;
  }

  function drawWall(c, camX, groundY) {
    var V = view();
    /* the ceiling cove falls into dusk and the wall brightens toward
       eye level: light comes from the fixtures and the windows, not from
       everywhere at once */
    var g = c.createLinearGradient(0, V.y, 0, groundY);
    g.addColorStop(0, '#7a4477');
    g.addColorStop(0.16, '#a9749f');
    g.addColorStop(0.42, '#cf9fbf');
    g.addColorStop(0.72, '#e2bcd0');
    g.addColorStop(1, '#d1a4bd');
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
    /* crown moulding where the wall meets the ceiling */
    var cm = c.createLinearGradient(0, V.y, 0, V.y + 16);
    cm.addColorStop(0, '#fff6fb');
    cm.addColorStop(0.5, '#f4dbe8');
    cm.addColorStop(1, '#d9a9c4');
    c.fillStyle = cm;
    c.fillRect(V.x, V.y, V.w, 16);
    var cs = c.createLinearGradient(0, V.y + 16, 0, V.y + 40);
    cs.addColorStop(0, 'rgba(40,16,48,0.42)');
    cs.addColorStop(1, 'rgba(40,16,48,0)');
    c.fillStyle = cs;
    c.fillRect(V.x, V.y + 16, V.w, 30);
    /* picture rail, with the shadow it throws down the wall */
    var pr = c.createLinearGradient(0, groundY - 240, 0, groundY - 232);
    pr.addColorStop(0, '#ffffff'); pr.addColorStop(1, '#ead2de');
    c.fillStyle = pr;
    c.fillRect(V.x, groundY - 240, V.w, 8);
    var prs = c.createLinearGradient(0, groundY - 232, 0, groundY - 216);
    prs.addColorStop(0, 'rgba(74,42,64,0.2)');
    prs.addColorStop(1, 'rgba(74,42,64,0)');
    c.fillStyle = prs;
    c.fillRect(V.x, groundY - 232, V.w, 16);
    /* wainscot: cream panelling along the lower wall */
    var wg = c.createLinearGradient(0, groundY - 110, 0, groundY);
    wg.addColorStop(0, '#fff8f3');
    wg.addColorStop(0.7, '#f3dde6');
    wg.addColorStop(1, '#dfbccd');
    c.fillStyle = wg;
    c.fillRect(V.x, groundY - 110, V.w, 102);
    var cap = c.createLinearGradient(0, groundY - 116, 0, groundY - 108);
    cap.addColorStop(0, '#ffffff'); cap.addColorStop(1, '#f0d8e2');
    c.fillStyle = cap;
    c.fillRect(V.x, groundY - 116, V.w, 8);
    var caps = c.createLinearGradient(0, groundY - 108, 0, groundY - 96);
    caps.addColorStop(0, 'rgba(74,42,64,0.18)');
    caps.addColorStop(1, 'rgba(74,42,64,0)');
    c.fillStyle = caps;
    c.fillRect(V.x, groundY - 108, V.w, 12);
    /* panel frames, scrolling with the world: a bevel, lit top-left */
    var poff = -(camX % 160);
    c.lineWidth = 2;
    for (var px = V.x + poff - 160; px < V.x + V.w + 160; px += 160) {
      c.fillStyle = 'rgba(255,255,255,0.35)';
      E.roundRect(c, px + 14, groundY - 96, 132, 70, 6);
      c.fill();
      c.strokeStyle = 'rgba(74,42,64,0.14)';
      E.roundRect(c, px + 15, groundY - 95, 132, 70, 6);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.9)';
      E.roundRect(c, px + 13, groundY - 97, 132, 70, 6);
      c.stroke();
      c.strokeStyle = 'rgba(226, 85, 154, 0.18)';
      E.roundRect(c, px + 22, groundY - 88, 116, 54, 4);
      c.stroke();
    }
    /* skirting */
    var sk = c.createLinearGradient(0, groundY - 10, 0, groundY);
    sk.addColorStop(0, '#fff0f6'); sk.addColorStop(0.35, PAL.floorDark); sk.addColorStop(1, '#8e5676');
    c.fillStyle = sk;
    c.fillRect(V.x, groundY - 10, V.w, 10);
  }

  /* A small crystal chandelier for every other ceiling light. */
  function drawChandelier(c, x, y, t) {
    var V = view();
    var tw = 0.8 + Math.sin(t / 17 + x) * 0.2;
    /* ceiling rose and chain */
    E.fillEllipse(c, x, V.y + 14, 14, 4, metal(c, x - 14, 0, x + 14, 0), false);
    c.strokeStyle = '#6a4a20'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, V.y + 14); c.lineTo(x, y - 30); c.stroke();
    c.strokeStyle = 'rgba(255,230,160,0.5)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(x - 0.5, V.y + 14); c.lineTo(x - 0.5, y - 30); c.stroke();
    /* the big warm glow that lights the wall behind it */
    c.save();
    c.globalCompositeOperation = 'lighter';
    var g = c.createRadialGradient(x, y, 6, x, y, 120);
    g.addColorStop(0, 'rgba(255, 236, 180, ' + (0.55 * tw) + ')');
    g.addColorStop(0.3, 'rgba(255, 220, 150, ' + (0.22 * tw) + ')');
    g.addColorStop(1, 'rgba(255, 220, 150, 0)');
    c.fillStyle = g;
    c.fillRect(x - 120, y - 120, 240, 240);
    c.restore();
    /* two brass tiers with candles */
    var tiers = [[y + 6, 40, 4], [y - 14, 24, 3]];
    for (var ti = 0; ti < tiers.length; ti++) {
      var ty = tiers[ti][0], tr = tiers[ti][1], n = tiers[ti][2];
      c.beginPath(); c.ellipse(x, ty, tr, tr * 0.28, 0, 0, Math.PI * 2);
      c.fillStyle = metal(c, x - tr, 0, x + tr, 0); c.fill();
      c.strokeStyle = '#6a4a20'; c.lineWidth = 1.2; c.stroke();
      for (var i = -n; i <= n; i++) {
        var cx = x + (i / n) * tr * 0.92;
        var cy = ty - 2 + Math.abs(i / n) * 2;
        E.fillRound(c, cx - 2.2, cy - 15, 4.4, 15, 2, '#fff6ec', false);
        c.strokeStyle = 'rgba(74,42,64,0.4)'; c.lineWidth = 1;
        E.roundRect(c, cx - 2.2, cy - 15, 4.4, 15, 2); c.stroke();
        var fl = 1 + Math.sin(t / 5 + cx) * 0.18;
        E.fillEllipse(c, cx, cy - 19, 2.6 * fl, 4.6 * fl, '#ffcf5a', false);
        E.fillEllipse(c, cx, cy - 19.6, 1.3, 2.6, '#fffbe0', false);
      }
      /* crystal drops hung from the rim */
      for (var k = -n - 1; k <= n + 1; k++) {
        var dx = x + (k / (n + 1)) * tr, dy = ty + 7 + ((k & 1) ? 5 : 0);
        c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(dx, ty + 1); c.lineTo(dx, dy - 3); c.stroke();
        var dg = c.createLinearGradient(dx - 3, dy, dx + 3, dy);
        dg.addColorStop(0, '#d8f0ff'); dg.addColorStop(0.5, '#ffffff'); dg.addColorStop(1, '#ffd9ee');
        E.fillPath(c, [[dx, dy - 3], [dx + 3, dy + 2], [dx, dy + 9], [dx - 3, dy + 2]], dg, true, false);
        c.strokeStyle = 'rgba(74,42,64,0.4)'; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(dx, dy - 3); c.lineTo(dx + 3, dy + 2); c.lineTo(dx, dy + 9); c.lineTo(dx - 3, dy + 2); c.closePath(); c.stroke();
      }
    }
    E.fillEllipse(c, x, y - 30, 5, 5, metal(c, x - 5, 0, x + 5, 0), false);
    E.fillEllipse(c, x, y + 20, 4, 6, '#ffffff', false);
    /* glints hopping between the crystals */
    c.save();
    c.fillStyle = '#ffffff';
    for (var gl = 0; gl < 2; gl++) {
      var gi = Math.floor(t / 14 + x / 50 + gl * 3) % 9 - 4;
      c.globalAlpha = 0.5 + Math.sin(t / 4 + gl) * 0.4;
      E.star(c, x + gi * 9, y + 12 + ((gi & 1) ? 5 : 0), 4);
    }
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
    c.save(); c.globalAlpha = 0.14; c.fillStyle = PAL.ink; c.beginPath(); c.ellipse(x + 7, y + 8, 34, 42, 0, 0, Math.PI * 2); c.fill(); c.restore();
    E.fillEllipse(c, x, y, 34, 42, metal(c, x - 34, y - 42, x + 34, y + 42), false);
    c.fillStyle = PAL.gold; c.beginPath(); c.ellipse(x, y, 34, 42, 0, 0, Math.PI * 2); E.ink(c, 2);
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
    /* sun with a soft halo, clouds, and a garden rolling away below */
    var halo = c.createRadialGradient(x + 30, y - 2, 10, x + 30, y - 2, 60);
    halo.addColorStop(0, 'rgba(255, 240, 180, 0.6)');
    halo.addColorStop(1, 'rgba(255, 240, 180, 0)');
    c.fillStyle = halo; c.fillRect(x - w / 2, y, w, h);
    E.fillEllipse(c, x + 30, y - 2, 22, 22, PAL.sun, false);
    E.fillEllipse(c, x - 20, y + 34, 16, 9, '#ffffff', false);
    E.fillEllipse(c, x - 8, y + 28, 12, 8, '#ffffff', false);
    E.fillEllipse(c, x + 26, y + 60, 14, 8, '#ffffff', false);
    E.fillEllipse(c, x - 30, y + 102, 60, 22, '#b7e6c9', false);
    E.fillEllipse(c, x + 34, y + 108, 56, 22, '#9adbb5', false);
    E.fillEllipse(c, x + 2, y + 118, 70, 18, '#7fcf9e', false);
    /* a couple of lollipop trees on the near hill */
    E.fillRound(c, x - 23, y + 88, 3, 14, 1, '#8a5a3a', false);
    E.fillEllipse(c, x - 21.5, y + 84, 9, 9, '#5cb882', false);
    E.fillEllipse(c, x - 24, y + 81, 3.5, 2.5, 'rgba(255,255,255,0.4)', false);
    E.fillRound(c, x + 25, y + 94, 3, 12, 1, '#8a5a3a', false);
    E.fillEllipse(c, x + 26.5, y + 90, 7, 7, '#ff9ccd', false);
    /* glass: a glare band across the pane and a cooler lower corner */
    var gg = c.createLinearGradient(x - w / 2, y, x + w / 2, y + h);
    gg.addColorStop(0, 'rgba(255,255,255,0.4)'); gg.addColorStop(0.28, 'rgba(255,255,255,0.05)');
    gg.addColorStop(0.3, 'rgba(255,255,255,0)'); gg.addColorStop(0.55, 'rgba(255,255,255,0)');
    gg.addColorStop(0.62, 'rgba(255,255,255,0.18)'); gg.addColorStop(0.7, 'rgba(255,255,255,0)');
    gg.addColorStop(1, 'rgba(120,80,160,0.14)');
    c.fillStyle = gg; c.fillRect(x - w / 2, y, w, h);
    c.restore();
    /* frame: a bevelled sill and mullions */
    c.fillStyle = '#ffffff';
    E.roundRect(c, x - w / 2, y, w, h, 8);
    E.ink(c, 2);
    c.strokeStyle = '#ffffff'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + h); c.moveTo(x - w / 2, y + h / 2); c.lineTo(x + w / 2, y + h / 2); c.stroke();
    c.strokeStyle = PAL.ink; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + h); c.moveTo(x - w / 2, y + h / 2); c.lineTo(x + w / 2, y + h / 2); c.stroke();
    var sill = c.createLinearGradient(0, y + h + 4, 0, y + h + 14);
    sill.addColorStop(0, '#ffffff'); sill.addColorStop(1, '#e8cfe0');
    E.fillRound(c, x - w / 2 - 12, y + h + 4, w + 24, 10, 3, sill);
    c.fillStyle = 'rgba(74,42,64,0.16)'; c.fillRect(x - w / 2 - 10, y + h + 14, w + 20, 6);
    /* curtains: folded cloth with brass tie-backs */
    for (var cs = -1; cs <= 1; cs += 2) {
      var cx = cs < 0 ? x - w / 2 - 10 : x + w / 2 - 8;
      var cg = c.createLinearGradient(cx, 0, cx + 18, 0);
      cg.addColorStop(0, E.shade(PAL.pink, -14)); cg.addColorStop(0.4, E.shade(PAL.pink, 18)); cg.addColorStop(0.7, PAL.pink); cg.addColorStop(1, E.shade(PAL.pink, -18));
      E.fillRound(c, cx, y - 10, 18, h + 20, 6, cg, false);
      c.fillStyle = PAL.pink; E.roundRect(c, cx, y - 10, 18, h + 20, 6); E.ink(c, 2);
      E.fillRound(c, cx - 2, y + h * 0.55, 22, 6, 3, metal(c, 0, y + h * 0.55, 0, y + h * 0.55 + 6), false);
      c.fillStyle = PAL.gold; E.roundRect(c, cx - 2, y + h * 0.55, 22, 6, 3); E.ink(c, 1.5);
    }
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
      E.fillEllipse(c, x, V.y + 14, 9, 3, metal(c, x - 9, 0, x + 9, 0), false);
      c.strokeStyle = '#6a4a20'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(x, V.y + 14); c.lineTo(x, y - 26); c.stroke();
      c.save();
      c.globalCompositeOperation = 'lighter';
      var g = c.createRadialGradient(x, y, 4, x, y, 70);
      g.addColorStop(0, 'rgba(255, 236, 170, ' + (0.6 * tw) + ')');
      g.addColorStop(0.35, 'rgba(255, 224, 150, ' + (0.2 * tw) + ')');
      g.addColorStop(1, 'rgba(255, 224, 150, 0)');
      c.fillStyle = g;
      c.fillRect(x - 70, y - 70, 140, 140);
      c.restore();
      /* a little pleated shade over the bulb */
      var shg = c.createLinearGradient(x - 20, 0, x + 20, 0);
      shg.addColorStop(0, '#d98cb8'); shg.addColorStop(0.4, '#ffd3ea'); shg.addColorStop(1, '#c9789f');
      E.fillPath(c, [[x - 12, y - 26], [x + 12, y - 26], [x + 22, y - 4], [x - 22, y - 4]], shg);
      c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1;
      for (var pl = -2; pl <= 2; pl++) { c.beginPath(); c.moveTo(x + pl * 5, y - 25); c.lineTo(x + pl * 9, y - 5); c.stroke(); }
      E.fillRound(c, x - 23, y - 6, 46, 3, 1.5, metal(c, x - 23, 0, x + 23, 0), false);
      var bg = c.createRadialGradient(x - 3, y + 2, 1, x, y + 4, 11);
      bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.5, '#fff3b0'); bg.addColorStop(1, '#f6cf6a');
      E.fillEllipse(c, x, y + 4, 10, 10, bg);
    }
  }

  /* Polished marble tiles in one-point perspective. The baseline (where
     feet land) is the far edge; rows get taller and columns spread as
     they come toward the camera. The engine mirrors the booths into the
     band just below the baseline, so the tiles are kept quiet: two close
     pinks and thin pale grout. */
  var FLOOR_TILE = 96;          /* world units along the baseline */
  var FLOOR_HORIZON = 150;      /* vanishing line this far above the baseline */
  var FLOOR_DEPTH0 = 10;        /* baseline distance in tile depths */
  function floorRowY(groundY, k) {
    return groundY - FLOOR_HORIZON + FLOOR_HORIZON * FLOOR_DEPTH0 / (FLOOR_DEPTH0 - k);
  }
  function drawFloor(c, camX, groundY) {
    var V = view();
    var bottom = V.y + V.h;
    var vpX = V.x + V.w / 2;
    var g = c.createLinearGradient(0, groundY, 0, bottom);
    g.addColorStop(0, '#d9a8c2');
    g.addColorStop(0.5, '#b4799f');
    g.addColorStop(1, '#8a5278');
    c.fillStyle = g;
    c.fillRect(V.x, groundY, V.w, bottom - groundY);

    c.save();
    c.beginPath(); c.rect(V.x, groundY, V.w, bottom - groundY); c.clip();
    var j0 = Math.floor((camX - V.w) / FLOOR_TILE) - 1, j1 = Math.ceil((camX + V.w * 2) / FLOOR_TILE) + 1;
    var k = 0;
    while (true) {
      var yA = floorRowY(groundY, k), yB = floorRowY(groundY, k + 1);
      if (yA > bottom || k > FLOOR_DEPTH0 - 2) break;
      var scA = FLOOR_DEPTH0 / (FLOOR_DEPTH0 - k), scB = FLOOR_DEPTH0 / (FLOOR_DEPTH0 - k - 1);
      for (var j = j0; j <= j1; j++) {
        var sx0 = j * FLOOR_TILE - camX, sx1 = sx0 + FLOOR_TILE;
        var xA0 = vpX + (sx0 - vpX) * scA, xA1 = vpX + (sx1 - vpX) * scA;
        var xB0 = vpX + (sx0 - vpX) * scB, xB1 = vpX + (sx1 - vpX) * scB;
        if (Math.max(xA1, xB1) < V.x || Math.min(xA0, xB0) > V.x + V.w) continue;
        c.beginPath();
        c.moveTo(xA0, yA); c.lineTo(xA1, yA); c.lineTo(xB1, yB); c.lineTo(xB0, yB); c.closePath();
        c.fillStyle = ((j + k) & 1) ? 'rgba(255,255,255,0.15)' : 'rgba(60,16,70,0.16)';
        c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.24)';
        c.lineWidth = 1;
        c.stroke();
      }
      k++;
    }
    /* marble veining: a few soft pale streaks */
    c.globalAlpha = 0.16;
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    var voff = -(camX % 400);
    for (var vx = V.x + voff - 400; vx < V.x + V.w + 400; vx += 400) {
      c.beginPath();
      c.moveTo(vx, groundY + 6); c.quadraticCurveTo(vx + 160, groundY + 30, vx + 90, bottom);
      c.stroke();
    }
    c.restore();
    /* a sheen across the polish, strongest at the far edge */
    var sheen = c.createLinearGradient(0, groundY, 0, groundY + 60);
    sheen.addColorStop(0, 'rgba(255,255,255,0.3)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sheen;
    c.fillRect(V.x, groundY, V.w, 60);
  }

  /* Warm pools under every ceiling light, so the lights visibly light
     something. Same spacing as drawLights. */
  function drawLightPools(c, camX, groundY, t) {
    var V = view();
    var span = 190;
    var start = Math.floor((camX + V.x) / span) * span - span;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (var wx = start; wx < camX + V.x + V.w + span; wx += span) {
      var x = wx - camX + 95;
      var k = Math.round(wx / span);
      var tw = k % 2 === 0 ? 0.8 + Math.sin(t / 17 + x) * 0.2 : 0.75 + Math.sin(t / 20 + wx) * 0.25;
      var rx = k % 2 === 0 ? 150 : 100;
      c.save();
      c.translate(x, groundY + 26);
      c.scale(1, 0.26);
      var g = c.createRadialGradient(0, 0, 2, 0, 0, rx);
      g.addColorStop(0, 'rgba(255, 236, 190, ' + (0.38 * tw) + ')');
      g.addColorStop(0.5, 'rgba(255, 236, 190, ' + (0.14 * tw) + ')');
      g.addColorStop(1, 'rgba(255, 236, 190, 0)');
      c.fillStyle = g;
      c.fillRect(-rx, -rx, rx * 2, rx * 2);
      c.restore();
    }
    /* sunlight landing on the floor under each window */
    var wspan = Game.STUDIO.stationGap * 2, woff = 60;
    var wstart = Math.floor((camX * 0.85 + V.x - woff) / wspan) * wspan - wspan;
    for (var wx2 = wstart; wx2 < camX * 0.85 + V.x + V.w + wspan; wx2 += wspan) {
      var sx = wx2 - camX * 0.85 + woff - 110;
      c.save();
      c.translate(sx, groundY + 36);
      c.scale(1, 0.3);
      var sg = c.createRadialGradient(0, 0, 4, 0, 0, 120);
      sg.addColorStop(0, 'rgba(255, 250, 226, 0.4)');
      sg.addColorStop(0.5, 'rgba(255, 250, 226, 0.14)');
      sg.addColorStop(1, 'rgba(255, 250, 226, 0)');
      c.fillStyle = sg;
      c.fillRect(-120, -120, 240, 240);
      c.restore();
    }
    c.restore();
  }

  /* Dust turning slowly in the sunbeams: the cheapest volumetric light
     there is. Seeded, so it costs nothing to rebuild each frame. */
  var MOTES = (function () {
    var rnd = E.seeded(1313), out = [];
    for (var i = 0; i < 18; i++) out.push({ u: rnd(), v: rnd(), sp: 0.15 + rnd() * 0.25, ph: rnd() * 6.28, r: 0.8 + rnd() * 1.1 });
    return out;
  })();
  function drawMotes(c, camX, groundY, winShift, t) {
    var V = view();
    var span = Game.STUDIO.stationGap * 2;
    var off = 60 + (winShift || 0);
    var start = Math.floor((camX * 0.85 + V.x - off) / span) * span - span;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = '#fff8e6';
    for (var wx = start; wx < camX * 0.85 + V.x + V.w + span; wx += span) {
      var x = wx - camX * 0.85 + off, y = groundY - 226;
      for (var i = 0; i < MOTES.length; i++) {
        var m = MOTES[i];
        var v = ((m.v + t * m.sp / 600) % 1 + 1) % 1;
        var u = m.u + Math.sin(t / 90 + m.ph) * 0.08;
        /* the shaft runs from the sill down and left to the floor */
        var top = x - 46 + u * 92, bot = x - 190 + u * 150;
        var px = top + (bot - top) * v, py = y + (groundY + 30 - y) * v;
        c.globalAlpha = 0.35 + Math.sin(t / 7 + m.ph) * 0.25;
        c.beginPath(); c.arc(px, py, m.r, 0, Math.PI * 2); c.fill();
      }
    }
    c.restore();
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
    drawLightPools(c, camX, groundY, t);
    drawFloorShadow(c, groundY);
    drawMotes(c, camX, groundY, winShift, t);
  }

  /* ---- Reflections ----
     The engine paints the booths, props and Momoko mirrored into this
     offscreen band, fades it toward the camera and lays it on the floor.
     One band, reused every frame. */
  var reflCanvas = null, reflCtx = null, reflDpr = 0;
  var REFL_H = 76;
  function reflectionBand(drawFn, groundY, camX) {
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    if (!reflCanvas || reflDpr !== dpr) {
      reflCanvas = document.createElement('canvas');
      reflCanvas.width = Math.ceil(W * dpr);
      reflCanvas.height = Math.ceil(REFL_H * dpr);
      reflCtx = reflCanvas.getContext('2d');
      reflDpr = dpr;
    }
    var g = reflCtx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, REFL_H);
    g.save();
    /* world point (x, y) lands at band row groundY - y, flipped */
    g.translate(0, groundY);
    g.scale(1, -1);
    g.translate(-camX, 0);
    drawFn(g);
    g.restore();
    g.globalCompositeOperation = 'destination-out';
    var fade = g.createLinearGradient(0, 0, 0, REFL_H);
    fade.addColorStop(0, 'rgba(0,0,0,0.1)');
    fade.addColorStop(0.45, 'rgba(0,0,0,0.6)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fade;
    g.fillRect(0, 0, W, REFL_H);
    g.globalCompositeOperation = 'source-over';
    return reflCanvas;
  }
  function drawReflectionBand(c, groundY, camX, drawFn, alpha) {
    var cv = reflectionBand(drawFn, groundY, camX);
    c.save();
    c.globalAlpha = alpha || 0.3;
    c.drawImage(cv, 0, 0, cv.width, cv.height, 0, groundY, W, REFL_H);
    c.restore();
  }

  /* ---- Foreground ----
     Out-of-focus foliage and flower swags at the frame edges, scrolling
     faster than the room so the camera reads as sitting inside it.
     Pre-blurred once; browsers without canvas filters get a soft-alpha
     version instead. */
  var HAS_FILTER = (function () {
    try { var cv = document.createElement('canvas'); return 'filter' in cv.getContext('2d'); } catch (e) { return false; }
  })();
  function fgLeafSprite(flip) {
    /* a 60px margin either side so the splayed outer leaves and the
       blur never meet the sprite edge */
    return E.getCachedSprite('fgLeaf' + (flip ? 'L' : 'R'), 300, 96, function (g) {
      if (HAS_FILTER) g.filter = 'blur(2.4px)';
      g.save();
      if (flip) { g.translate(300, 0); g.scale(-1, 1); }
      var leaves = [[96, 100, -0.8, 46], [124, 100, -0.4, 58], [152, 100, 0.05, 64], [182, 100, 0.45, 54], [208, 100, 0.85, 42]];
      for (var i = 0; i < leaves.length; i++) {
        var L = leaves[i];
        g.save();
        g.translate(L[0], L[1]);
        g.rotate(L[2]);
        var grad = g.createLinearGradient(0, 0, 0, -L[3]);
        grad.addColorStop(0, '#3a7f62');
        grad.addColorStop(1, '#6cbd96');
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(-16, -L[3] * 0.45, 0, -L[3]);
        g.quadraticCurveTo(16, -L[3] * 0.45, 0, 0);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.3)';
        g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(0, -4); g.lineTo(0, -L[3] + 8); g.stroke();
        g.restore();
      }
      g.restore();
    });
  }
  function fgSwagSprite() {
    return E.getCachedSprite('fgSwag', 260, 70, function (g) {
      if (HAS_FILTER) g.filter = 'blur(2px)';
      g.strokeStyle = '#4e8a6a'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(130, 60, 260, 0); g.stroke();
      var rnd = E.seeded(31);
      var cols = ['#ff9ccd', '#ffffff', '#ffc2dc', '#ffd9a8', '#c79bff'];
      for (var i = 0; i < 11; i++) {
        var u = (i + 0.5) / 11;
        var x = u * 260, y = 60 * 4 * u * (1 - u) * 0.5 + 6;
        E.fillEllipse(g, x - 6, y + 4, 7, 4, '#5cb882', false);
        E.fillEllipse(g, x, y, 8 + rnd() * 4, 8 + rnd() * 3, cols[i % cols.length], false);
        E.fillEllipse(g, x - 2, y - 2, 3, 2.4, 'rgba(255,255,255,0.6)', false);
      }
    });
  }
  function drawForeground(c, camX, t) {
    var V = view();
    c.save();
    c.globalAlpha = HAS_FILTER ? 0.82 : 0.6;
    /* leaves along the bottom edge, every 700 world units, parallax 1.35 */
    var span = 700;
    var p = camX * 1.35;
    var start = Math.floor(p / span) * span - span;
    for (var sx = start; sx < p + W + span; sx += span) {
      var x = sx - p;
      var flip = Math.round(sx / span) % 2 === 0;
      var sway = Math.sin(t / 70 + sx) * 3;
      var spr = fgLeafSprite(flip);
      if (x + 300 > 0 && x < W) E.drawSprite(c, spr, x + sway, H - 72);
    }
    /* flower swags hanging from the top edge, parallax 1.2, offset so
       they never sit on the HUD corner */
    var span2 = 760, p2 = camX * 1.2;
    var start2 = Math.floor(p2 / span2) * span2 - span2;
    for (var sx2 = start2; sx2 < p2 + W + span2; sx2 += span2) {
      var x2 = sx2 - p2 + 300;
      if (x2 + 260 > 0 && x2 < W) E.drawSprite(c, fgSwagSprite(), x2, -8 + Math.sin(t / 90 + sx2) * 1.5);
    }
    c.restore();
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
      g.addColorStop(0, 'rgba(255, 246, 214, 0.42)');
      g.addColorStop(0.6, 'rgba(255, 246, 214, 0.12)');
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
    var g = c.createLinearGradient(0, groundY - 2, 0, groundY + 40);
    g.addColorStop(0, 'rgba(50, 20, 60, 0.42)');
    g.addColorStop(0.35, 'rgba(50, 20, 60, 0.14)');
    g.addColorStop(1, 'rgba(50, 20, 60, 0)');
    c.fillStyle = g;
    c.fillRect(V.x, groundY - 2, V.w, 42);
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
      var base = i % 2 === 0 ? col : PAL.cream;
      E.fillPath(c, [[ax, y], [ax + seg, y], [ax + seg - 2 + sway, y + 22], [ax + 2 + sway, y + 22]], base);
      /* each stripe is a bolt of cloth: lit on one side, shaded in the seam */
      c.save();
      c.beginPath(); c.moveTo(ax, y); c.lineTo(ax + seg, y); c.lineTo(ax + seg - 2 + sway, y + 22); c.lineTo(ax + 2 + sway, y + 22); c.closePath(); c.clip();
      var fg = c.createLinearGradient(ax, 0, ax + seg, 0);
      fg.addColorStop(0, 'rgba(74,42,64,0.22)');
      fg.addColorStop(0.35, 'rgba(255,255,255,0.22)');
      fg.addColorStop(0.7, 'rgba(255,255,255,0.02)');
      fg.addColorStop(1, 'rgba(74,42,64,0.18)');
      c.fillStyle = fg; c.fillRect(ax - 2, y, seg + 4, 24);
      var vg = c.createLinearGradient(0, y, 0, y + 22);
      vg.addColorStop(0, 'rgba(255,255,255,0.18)'); vg.addColorStop(1, 'rgba(74,42,64,0.12)');
      c.fillStyle = vg; c.fillRect(ax - 2, y, seg + 4, 24);
      c.restore();
    }
    c.beginPath();
    for (var k = 0; k < n; k++) {
      var sx = x - w / 2 + k * seg + sway;
      c.moveTo(sx, y + 22);
      c.arc(sx + seg / 2, y + 22, seg / 2, Math.PI, 0, true);
    }
    var sg = c.createLinearGradient(0, y + 22, 0, y + 22 + seg / 2);
    sg.addColorStop(0, E.shade(col, 10)); sg.addColorStop(1, E.shade(col, -22));
    c.fillStyle = sg;
    c.fill();
    c.fillStyle = col;
    E.ink(c, 2);
    /* the brass rail it hangs from */
    E.fillRound(c, x - w / 2 - 4, y - 5, w + 8, 8, 4, metal(c, 0, y - 5, 0, y + 3), false);
    c.fillStyle = PAL.gold; E.roundRect(c, x - w / 2 - 4, y - 5, w + 8, 8, 4); E.ink(c, 1.5);
    E.fillEllipse(c, x - w / 2 - 6, y - 1, 5, 5, metal(c, x - w / 2 - 11, 0, x - w / 2 - 1, 0));
    E.fillEllipse(c, x + w / 2 + 6, y - 1, 5, 5, metal(c, x + w / 2 + 1, 0, x + w / 2 + 11, 0));
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
    E.softShadow(c, x, groundY + 3, 118, 12, 0.36);

    /* the booth throws a soft shadow down and right onto the wall */
    c.save();
    c.fillStyle = 'rgba(50, 20, 60, 0.12)';
    E.roundRect(c, x - 78 + 24, groundY - 212 + 28, 170, 170, 16); c.fill();
    c.fillStyle = 'rgba(50, 20, 60, 0.16)';
    E.roundRect(c, x - 78 + 12, groundY - 212 + 14, 164, 166, 14); c.fill();
    c.fillStyle = 'rgba(50, 20, 60, 0.14)';
    E.roundRect(c, x - 92 + 10, groundY - 217 + 8, 184, 22, 6); c.fill();
    c.restore();

    /* back board with a lit side; the frame is lacquered cream, brighter
       along its top edge where the awning lights catch it */
    var frameG = c.createLinearGradient(0, groundY - 196, 0, groundY - 44);
    frameG.addColorStop(0, '#fffaf4'); frameG.addColorStop(0.5, '#f6e6e4'); frameG.addColorStop(1, '#e9d2d6');
    E.fillRound(c, x - 78, groundY - 196, 156, 152, 10, frameG, false);
    c.fillStyle = '#f6e6e4'; E.roundRect(c, x - 78, groundY - 196, 156, 152, 10); E.ink(c, 2);
    c.save();
    E.roundRect(c, x - 74, groundY - 192, 148, 144, 8);
    c.clip();
    var g = c.createLinearGradient(x - 74, 0, x + 74, 0);
    g.addColorStop(0, E.shade(st.hue, 75));
    g.addColorStop(0.5, E.shade(st.hue, 55));
    g.addColorStop(1, E.shade(st.hue, 38));
    c.fillStyle = g;
    c.fillRect(x - 74, groundY - 192, 148, 144);
    /* each booth gets its own wall print: stripes, dots or a lattice */
    var sidx = Math.round((st.x - Game.STUDIO.stationX0) / Game.STUDIO.stationGap);
    c.save();
    c.globalAlpha = 0.5;
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#ffffff';
    if (sidx % 3 === 0) {
      for (var sp = x - 70; sp < x + 74; sp += 18) c.fillRect(sp, groundY - 192, 7, 144);
    } else if (sidx % 3 === 1) {
      for (var py = groundY - 184; py < groundY - 50; py += 16) {
        for (var pxx = x - 66 + ((py / 16) & 1) * 8; pxx < x + 74; pxx += 16) {
          c.beginPath(); c.arc(pxx, py, 2.4, 0, Math.PI * 2); c.fill();
        }
      }
    } else {
      c.lineWidth = 1.4;
      c.beginPath();
      for (var lx = x - 120; lx < x + 120; lx += 22) {
        c.moveTo(lx, groundY - 192); c.lineTo(lx + 72, groundY - 48);
        c.moveTo(lx + 72, groundY - 192); c.lineTo(lx, groundY - 48);
      }
      c.stroke();
    }
    c.restore();
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
    /* inner shadow round the board so it sits inside its frame */
    c.save();
    E.roundRect(c, x - 74, groundY - 192, 148, 144, 8); c.clip();
    var ivl = c.createLinearGradient(x - 74, 0, x - 58, 0);
    ivl.addColorStop(0, 'rgba(74,42,64,0.16)'); ivl.addColorStop(1, 'rgba(74,42,64,0)');
    c.fillStyle = ivl; c.fillRect(x - 74, groundY - 192, 16, 144);
    var ivr = c.createLinearGradient(x + 74, 0, x + 54, 0);
    ivr.addColorStop(0, 'rgba(74,42,64,0.2)'); ivr.addColorStop(1, 'rgba(74,42,64,0)');
    c.fillStyle = ivr; c.fillRect(x + 54, groundY - 192, 20, 144);
    c.restore();
    E.roundRect(c, x - 74, groundY - 192, 148, 144, 8);
    c.fillStyle = '#ffffff';
    E.ink(c, 2);

    /* the display: a round mirror showing what this station changes */
    var mr = 44;
    var my = groundY - 128 + bob;
    E.softShadow(c, x + 6, my + 10, mr + 8, mr + 8, 0.16);
    E.fillEllipse(c, x, my, mr + 7, mr + 7, metal(c, x - mr - 7, my - mr - 7, x + mr + 7, my + mr + 7));
    c.fillStyle = PAL.gold;
    c.beginPath(); c.arc(x, my, mr + 7, 0, Math.PI * 2); E.ink(c, 2);
    E.fillEllipse(c, x, my, mr + 2, mr + 2, '#ffffff', false);
    var sample = stationSample(st);
    E.drawLookTile(c, x, my, mr * 2, sample, st.id, { round: true, t: t });
    /* glass: a curved glare across the top left and a shadow in the lower rim */
    c.save();
    c.beginPath(); c.arc(x, my, mr, 0, Math.PI * 2); c.clip();
    var gl = c.createLinearGradient(x - mr, my - mr, x + mr * 0.4, my + mr * 0.4);
    gl.addColorStop(0, 'rgba(255,255,255,0.5)'); gl.addColorStop(0.35, 'rgba(255,255,255,0.08)'); gl.addColorStop(0.36, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gl; c.fillRect(x - mr, my - mr, mr * 2, mr * 2);
    var rimS = c.createRadialGradient(x, my, mr * 0.7, x, my, mr);
    rimS.addColorStop(0, 'rgba(74,42,64,0)'); rimS.addColorStop(1, 'rgba(74,42,64,0.22)');
    c.fillStyle = rimS; c.fillRect(x - mr, my - mr, mr * 2, mr * 2);
    c.restore();
    c.beginPath(); c.arc(x, my, mr, 0, Math.PI * 2); c.fillStyle = PAL.gold; E.ink(c, 2);
    /* gem studs round the frame */
    for (var gs = 0; gs < 8; gs++) {
      var ga = gs * Math.PI / 4 + Math.PI / 8;
      var gx = x + Math.cos(ga) * (mr + 3.5), gy = my + Math.sin(ga) * (mr + 3.5);
      E.fillEllipse(c, gx, gy, 2.6, 2.6, gs % 2 ? PAL.pink : '#dff4ff', false);
      E.fillEllipse(c, gx - 0.7, gy - 0.8, 0.9, 0.9, '#ffffff', false);
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
    E.roundRect(c, x - 72, groundY - 62, 144, 62, 6); c.fillStyle = st.hue; E.ink(c, 2);
    /* the counter top's shadow on the striped front, and the floor's
       bounce darkening its foot */
    c.save();
    E.roundRect(c, x - 72, groundY - 62, 144, 62, 6); c.clip();
    var sg = c.createLinearGradient(0, groundY - 58, 0, groundY - 36);
    sg.addColorStop(0, 'rgba(74, 42, 64, 0.32)');
    sg.addColorStop(1, 'rgba(74, 42, 64, 0)');
    c.fillStyle = sg;
    c.fillRect(x - 72, groundY - 58, 144, 24);
    var fg2 = c.createLinearGradient(0, groundY - 14, 0, groundY);
    fg2.addColorStop(0, 'rgba(74, 42, 64, 0)');
    fg2.addColorStop(1, 'rgba(74, 42, 64, 0.24)');
    c.fillStyle = fg2;
    c.fillRect(x - 72, groundY - 14, 144, 14);
    c.restore();
    /* a wooden top with a lacquered edge */
    var wt = c.createLinearGradient(0, groundY - 70, 0, groundY - 56);
    wt.addColorStop(0, '#e2a874'); wt.addColorStop(0.45, PAL.wood); wt.addColorStop(1, PAL.woodDark);
    E.fillRound(c, x - 80, groundY - 70, 160, 14, 5, wt);
    c.fillStyle = PAL.wood; E.roundRect(c, x - 80, groundY - 70, 160, 14, 5); E.ink(c, 2);
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(x - 76, groundY - 68, 152, 2);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x - 76, groundY - 66, 152, 3);
    drawBoothProps(c, st, x, groundY);

    drawAwning(c, x, groundY - 212, 176, st.hue, t);
    /* fairy lights under the awning, each one lighting a little of the board */
    c.strokeStyle = 'rgba(74,42,64,0.35)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x - 74, groundY - 189); c.quadraticCurveTo(x, groundY - 181, x + 74, groundY - 189); c.stroke();
    for (var fl = 0; fl < 7; fl++) {
      var lx = x - 72 + fl * 24, on = ((fl + Math.floor(t / 12)) % 3) === 0;
      var ly = groundY - 188 + 6 * (1 - Math.pow((fl - 3) / 3, 2));
      if (on) {
        c.save(); c.globalCompositeOperation = 'lighter';
        var lg = c.createRadialGradient(lx, ly, 1, lx, ly, 12);
        lg.addColorStop(0, 'rgba(255,240,190,0.5)'); lg.addColorStop(1, 'rgba(255,240,190,0)');
        c.fillStyle = lg; c.fillRect(lx - 12, ly - 12, 24, 24);
        c.restore();
      }
      E.fillEllipse(c, lx, ly, 2.8, 2.8, on ? '#fff6c8' : PAL.sun, false);
    }

    /* sign */
    var label = T(st.labelKey);
    c.save(); c.globalAlpha = 0.22; E.fillRound(c, x - 70, groundY - 231, 140, 26, 8, PAL.ink, false); c.restore();
    var pg = c.createLinearGradient(0, groundY - 236, 0, groundY - 210);
    pg.addColorStop(0, '#ffffff'); pg.addColorStop(1, '#f6e4dc');
    E.fillRound(c, x - 70, groundY - 236, 140, 26, 8, pg, false);
    c.fillStyle = PAL.cream; E.roundRect(c, x - 70, groundY - 236, 140, 26, 8); E.ink(c, 2);
    E.fillRound(c, x - 66, groundY - 233, 132, 20, 6, 'rgba(255,255,255,0)', false);
    c.strokeStyle = 'rgba(242,182,50,0.8)'; c.lineWidth = 1.2; E.roundRect(c, x - 66, groundY - 232, 132, 18, 6); c.stroke();
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
    c.save(); c.globalAlpha = 0.14; c.fillStyle = PAL.ink; E.roundRect(c, x - w / 2 + 6, y + 8, w + 10, h + 10, 6); c.fill(); c.restore();
    E.fillRound(c, x - w / 2 - 5, y - 5, w + 10, h + 10, 6, metal(c, x - w / 2 - 5, y - 5, x + w / 2 + 5, y + h + 5), false);
    c.fillStyle = PAL.gold; E.roundRect(c, x - w / 2 - 5, y - 5, w + 10, h + 10, 6); E.ink(c, 2);
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
    E.fillRound(c, x - 2.5, groundY - 150, 5, 148, 2, metal(c, x - 2.5, 0, x + 2.5, 0), false);
    c.fillStyle = PAL.gold; E.roundRect(c, x - 2.5, groundY - 150, 5, 148, 2); E.ink(c, 2);
    var tw = 0.8 + Math.sin(t / 15) * 0.2;
    c.save();
    c.globalCompositeOperation = 'lighter';
    var g = c.createRadialGradient(x, groundY - 165, 5, x, groundY - 165, 90);
    g.addColorStop(0, 'rgba(255,236,170,' + 0.5 * tw + ')');
    g.addColorStop(0.4, 'rgba(255,224,150,' + 0.16 * tw + ')');
    g.addColorStop(1, 'rgba(255,224,150,0)');
    c.fillStyle = g; c.fillRect(x - 90, groundY - 255, 180, 180);
    /* the shade throws a cone of light down the stand to the floor */
    var cone = c.createLinearGradient(0, groundY - 150, 0, groundY + 10);
    cone.addColorStop(0, 'rgba(255,236,180,' + 0.22 * tw + ')');
    cone.addColorStop(1, 'rgba(255,236,180,0)');
    c.fillStyle = cone;
    c.beginPath(); c.moveTo(x - 24, groundY - 150); c.lineTo(x + 24, groundY - 150); c.lineTo(x + 70, groundY + 10); c.lineTo(x - 70, groundY + 10); c.closePath(); c.fill();
    c.restore();
    var lg = c.createLinearGradient(x - 26, 0, x + 26, 0);
    lg.addColorStop(0, E.shade(PAL.lavender, -18)); lg.addColorStop(0.35, E.shade(PAL.lavender, 24)); lg.addColorStop(1, E.shade(PAL.lavender, -22));
    E.fillPath(c, [[x - 26, groundY - 150], [x + 26, groundY - 150], [x + 16, groundY - 186], [x - 16, groundY - 186]], lg, true, false);
    c.fillStyle = PAL.lavender; c.beginPath(); c.moveTo(x - 26, groundY - 150); c.lineTo(x + 26, groundY - 150); c.lineTo(x + 16, groundY - 186); c.lineTo(x - 16, groundY - 186); c.closePath(); E.ink(c, 2);
    c.save(); c.globalAlpha = 0.5; c.fillStyle = '#fff6d0';
    c.beginPath(); c.moveTo(x - 20, groundY - 152); c.lineTo(x + 20, groundY - 152); c.lineTo(x + 14, groundY - 160); c.lineTo(x - 14, groundY - 160); c.closePath(); c.fill(); c.restore();
    E.fillRound(c, x - 28, groundY - 152, 56, 5, 2, metal(c, 0, groundY - 152, 0, groundY - 147), false);
  }
  function drawMirror(c, x, groundY) {
    E.softShadow(c, x, groundY + 2, 26, 6, 0.18);
    c.save(); c.globalAlpha = 0.12; c.fillStyle = PAL.ink;
    c.beginPath(); c.ellipse(x + 16, groundY - 98, 38, 86, 0, 0, Math.PI * 2); c.fill(); c.restore();
    E.fillEllipse(c, x, groundY - 2, 22, 6, PAL.woodDark);
    E.fillRound(c, x - 3, groundY - 30, 6, 28, 2, metal(c, x - 3, 0, x + 3, 0), false);
    c.fillStyle = PAL.gold; E.roundRect(c, x - 3, groundY - 30, 6, 28, 2); E.ink(c, 2);
    E.fillEllipse(c, x, groundY - 110, 36, 84, metal(c, x - 36, groundY - 194, x + 36, groundY - 26), false);
    c.fillStyle = PAL.gold; c.beginPath(); c.ellipse(x, groundY - 110, 36, 84, 0, 0, Math.PI * 2); E.ink(c, 2);
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
    c.fillStyle = metal(c, x - 56, groundY - 206, x + 56, groundY); c.fill();
    c.fillStyle = PAL.gold; E.ink(c, 2.5);
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
    /* stage light catching the top of the head and shoulders */
    c.save();
    c.globalAlpha = p.row === 0 ? 0.3 : 0.18;
    c.strokeStyle = '#ffd6ee'; c.lineWidth = 2.2; c.lineCap = 'round';
    c.beginPath(); c.arc(px, py - p.r * 0.4, p.r + 0.5, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    c.beginPath(); c.arc(px, py + p.r * 0.5 + p.r, p.r * 1.25, Math.PI * 1.12, Math.PI * 1.3); c.stroke();
    c.restore();
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

  /* Sequins glittering on the wall under the curtain, seeded once. */
  var SEQUINS = (function () {
    var rnd = E.seeded(808), out = [];
    for (var i = 0; i < 90; i++) out.push({ x: rnd(), y: 246 + rnd() * 48, ph: rnd() * 6.28, sp: 0.6 + rnd() * 0.8 });
    return out;
  })();

  /* Two follow-spots from the rig, crossing on whoever is on the
     catwalk, with a hot pool where they land. */
  function drawFollowSpots(c, spotX, t) {
    var V = view();
    var feetY = RUNWAY.feetY;
    c.save();
    c.globalCompositeOperation = 'lighter';
    var rigs = [[W / 2 - 170, '255,236,210', 0.3], [W / 2 + 170, '255,190,230', 0.24]];
    for (var i = 0; i < rigs.length; i++) {
      var rx = rigs[i][0], ry = V.y - 20;
      var dx = spotX - rx, dy = feetY - ry;
      var len = Math.sqrt(dx * dx + dy * dy);
      var ang = Math.atan2(dy, dx) - Math.PI / 2;
      c.save();
      c.translate(rx, ry);
      c.rotate(ang);
      var g = c.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, 'rgba(' + rigs[i][1] + ',' + rigs[i][2] + ')');
      g.addColorStop(0.7, 'rgba(' + rigs[i][1] + ',' + (rigs[i][2] * 0.45) + ')');
      g.addColorStop(1, 'rgba(' + rigs[i][1] + ',0.02)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(-7, 0); c.lineTo(7, 0); c.lineTo(58, len); c.lineTo(-58, len); c.closePath(); c.fill();
      var core = c.createLinearGradient(0, 0, 0, len);
      core.addColorStop(0, 'rgba(255,255,255,0.16)');
      core.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = core;
      c.beginPath(); c.moveTo(-3, 0); c.lineTo(3, 0); c.lineTo(22, len); c.lineTo(-22, len); c.closePath(); c.fill();
      /* the lamp itself, with the streak it throws across the lens */
      c.restore();
      var fl = c.createLinearGradient(rx - 150, 0, rx + 150, 0);
      fl.addColorStop(0, 'rgba(' + rigs[i][1] + ',0)');
      fl.addColorStop(0.5, 'rgba(255,255,255,' + (0.28 + Math.sin(t / 11 + i) * 0.06) + ')');
      fl.addColorStop(1, 'rgba(' + rigs[i][1] + ',0)');
      c.fillStyle = fl;
      c.fillRect(rx - 150, ry + 4, 300, 4);
      var fg = c.createRadialGradient(rx, ry + 6, 1, rx, ry + 6, 34);
      fg.addColorStop(0, 'rgba(255,255,255,0.6)');
      fg.addColorStop(0.3, 'rgba(' + rigs[i][1] + ',0.25)');
      fg.addColorStop(1, 'rgba(' + rigs[i][1] + ',0)');
      c.fillStyle = fg;
      c.fillRect(rx - 34, ry - 28, 68, 68);
      /* a couple of ghost rings down the lens axis */
      for (var gh = 1; gh <= 2; gh++) {
        var gx = rx + (spotX - rx) * gh * 0.3, gy = ry + (feetY - ry) * gh * 0.3;
        var gg = c.createRadialGradient(gx, gy, 0, gx, gy, 8 + gh * 7);
        gg.addColorStop(0, 'rgba(' + rigs[i][1] + ',' + (0.1 / gh) + ')');
        gg.addColorStop(0.7, 'rgba(' + rigs[i][1] + ',' + (0.04 / gh) + ')');
        gg.addColorStop(1, 'rgba(' + rigs[i][1] + ',0)');
        c.fillStyle = gg;
        c.fillRect(gx - 24, gy - 24, 48, 48);
      }
      E.fillEllipse(c, rx, ry + 6, 9, 5, 'rgba(255,250,235,0.95)', false);
    }
    c.restore();
  }
  function drawSpotPool(c, spotX, t) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.translate(spotX, RUNWAY.feetY + 2);
    c.scale(1, 0.26);
    var flick = 0.9 + Math.sin(t / 9) * 0.1;
    var g = c.createRadialGradient(0, 0, 4, 0, 0, 120);
    g.addColorStop(0, 'rgba(255, 250, 230, ' + (0.5 * flick) + ')');
    g.addColorStop(0.5, 'rgba(255, 230, 240, ' + (0.18 * flick) + ')');
    g.addColorStop(1, 'rgba(255, 230, 240, 0)');
    c.fillStyle = g;
    c.fillRect(-120, -120, 240, 240);
    c.restore();
  }

  function drawStage(c, t, excitement, spotX) {
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

    /* back curtain: velvet folds, each a soft column of light and shade */
    var curtainTop = V.y, curtainBot = 240;
    var vel = c.createLinearGradient(0, curtainTop, 0, curtainBot);
    vel.addColorStop(0, '#5e163f');
    vel.addColorStop(0.5, '#8a2468');
    vel.addColorStop(1, '#6e1c52');
    c.fillStyle = vel;
    c.fillRect(V.x, curtainTop, V.w, curtainBot - curtainTop);
    c.save();
    var foldW = 34;
    var fx0 = V.x - ((V.x % foldW) + foldW) % foldW;
    for (var x = fx0; x < V.x + V.w; x += foldW) {
      var cg = c.createLinearGradient(x, 0, x + foldW, 0);
      cg.addColorStop(0, 'rgba(20,0,20,0.36)');
      cg.addColorStop(0.3, 'rgba(255,170,220,0.06)');
      cg.addColorStop(0.5, 'rgba(255,200,235,0.16)');
      cg.addColorStop(0.7, 'rgba(255,170,220,0.06)');
      cg.addColorStop(1, 'rgba(20,0,20,0.36)');
      c.fillStyle = cg;
      c.fillRect(x, curtainTop, foldW, curtainBot - curtainTop);
    }
    c.restore();
    /* sequinned wall strip under the curtain hem */
    for (var sq = 0; sq < SEQUINS.length; sq++) {
      var S = SEQUINS[sq];
      var tw = Math.sin(t / 6 * S.sp + S.ph);
      if (tw <= 0.1) continue;
      c.save();
      c.globalAlpha = tw * 0.9;
      c.fillStyle = sq % 3 === 0 ? '#fff6c8' : sq % 3 === 1 ? '#ffd0ea' : '#d8f0ff';
      E.star(c, V.x + S.x * V.w, S.y, 1.2 + tw * 1.6);
      c.restore();
    }
    /* a soft pool of light where the models pose */
    var pool = c.createRadialGradient(RUNWAY.poseX, 200, 10, RUNWAY.poseX, 200, 170);
    pool.addColorStop(0, 'rgba(255, 230, 250, 0.22)');
    pool.addColorStop(1, 'rgba(255, 230, 250, 0)');
    c.fillStyle = pool;
    c.fillRect(RUNWAY.poseX - 170, 30, 340, 340);
    /* gold hem rail with a bright edge */
    E.fillRound(c, V.x, curtainBot - 8, V.w, 10, 0, PAL.gold, false);
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(V.x, curtainBot - 8, V.w, 2);
    c.fillStyle = 'rgba(74,42,64,0.3)'; c.fillRect(V.x, curtainBot, V.w, 2);
    /* valance: scalloped swags along the top with gold fringe and tassels */
    var swagW = 160;
    var sx0 = V.x - ((V.x % swagW) + swagW) % swagW;
    for (var swx = sx0; swx < V.x + V.w; swx += swagW) {
      var sg = c.createLinearGradient(0, curtainTop, 0, curtainTop + 52);
      sg.addColorStop(0, '#9a2a74');
      sg.addColorStop(1, '#5e163f');
      c.fillStyle = sg;
      c.beginPath();
      c.moveTo(swx, curtainTop);
      c.lineTo(swx + swagW, curtainTop);
      c.quadraticCurveTo(swx + swagW / 2, curtainTop + 96, swx, curtainTop);
      c.closePath();
      c.fill();
      c.strokeStyle = PAL.gold; c.lineWidth = 3;
      c.beginPath();
      c.moveTo(swx, curtainTop);
      c.quadraticCurveTo(swx + swagW / 2, curtainTop + 96, swx + swagW, curtainTop);
      c.stroke();
      /* fringe */
      c.strokeStyle = 'rgba(242,182,50,0.7)'; c.lineWidth = 1.5;
      c.beginPath();
      for (var fr = 8; fr < swagW; fr += 8) {
        var u = fr / swagW;
        var fy = curtainTop + 96 * u * (1 - u) * 2 * 0.5 + 1;
        c.moveTo(swx + fr, fy); c.lineTo(swx + fr, fy + 7);
      }
      c.stroke();
      /* tassel at every seam */
      E.fillRound(c, swx - 3, curtainTop, 6, 26, 3, PAL.gold, false);
      E.fillEllipse(c, swx, curtainTop + 28, 5, 7, '#e0a52a', false);
    }
    if (spotX !== null && spotX !== undefined) drawFollowSpots(c, spotX, t);
    /* the name in neon: a glowing tube over a dark backing plate */
    c.save();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 40px "M PLUS Rounded 1c", sans-serif';
    var title = T('title2');
    fitText(c, title, 520, 40);
    var ttw = c.measureText(title).width;
    c.fillStyle = 'rgba(40, 10, 50, 0.55)';
    E.roundRect(c, W / 2 - ttw / 2 - 30, 92, ttw + 60, 58, 14); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1.5;
    E.roundRect(c, W / 2 - ttw / 2 - 30, 92, ttw + 60, 58, 14); c.stroke();
    var flicker = 0.85 + Math.sin(t / 3) * 0.05 + Math.sin(t / 7.3) * 0.1;
    /* the tube's glow, blurred once into a sprite and re-laid every frame */
    var glowW = Math.ceil(ttw) + 120, glowH = 120;
    var font = c.font;
    var glow = E.getCachedSprite('neon:' + title + ':' + font, glowW, glowH, function (g) {
      g.font = font;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.globalCompositeOperation = 'lighter';
      g.shadowColor = 'rgba(255, 120, 200, 1)';
      g.shadowBlur = 22;
      g.fillStyle = 'rgba(255, 140, 210, 0.55)';
      g.fillText(title, glowW / 2, glowH / 2);
      g.shadowBlur = 8;
      g.shadowColor = 'rgba(255, 230, 120, 1)';
      g.fillStyle = 'rgba(255, 230, 120, 0.45)';
      g.fillText(title, glowW / 2, glowH / 2);
    });
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = flicker;
    E.drawSprite(c, glow, W / 2 - glowW / 2, 120 - glowH / 2);
    c.restore();
    c.lineJoin = 'round';
    c.strokeStyle = PAL.pinkDeep; c.lineWidth = 8;
    c.strokeText(title, W / 2, 120);
    var ng = c.createLinearGradient(0, 100, 0, 140);
    ng.addColorStop(0, '#fff8d0'); ng.addColorStop(0.5, PAL.sun); ng.addColorStop(1, '#f0a830');
    c.fillStyle = ng;
    c.fillText(title, W / 2, 120);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.save(); c.beginPath(); c.rect(0, 96, W, 16); c.clip(); c.fillText(title, W / 2, 120); c.restore();
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

    /* stage haze: slow banks of fog rolling along the curtain foot and
       catching the beams */
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (var hz2 = 0; hz2 < 4; hz2++) {
      var hx = V.x + ((t * (0.25 + hz2 * 0.08) + hz2 * 370) % (V.w + 500)) - 250;
      var hy = 262 + Math.sin(t / 60 + hz2) * 6 + (hz2 % 2) * 14;
      c.save();
      c.translate(hx, hy);
      c.scale(1, 0.22);
      var fg = c.createRadialGradient(0, 0, 10, 0, 0, 220);
      fg.addColorStop(0, 'rgba(255, 210, 240, 0.12)');
      fg.addColorStop(1, 'rgba(255, 210, 240, 0)');
      c.fillStyle = fg;
      c.fillRect(-220, -220, 440, 440);
      c.restore();
    }
    c.restore();

    /* catwalk slab: a polished top and a thick front face */
    var ST = RUNWAY.stageTop, SB = RUNWAY.stageBottom;
    var edge = c.createLinearGradient(0, ST, 0, ST + 8);
    edge.addColorStop(0, '#fff2fa'); edge.addColorStop(1, '#e9cde0');
    c.fillStyle = edge;
    c.fillRect(V.x, ST, V.w, 8);
    var runner = c.createLinearGradient(0, ST + 8, 0, SB - 8);
    runner.addColorStop(0, '#ff7fb8');
    runner.addColorStop(0.25, PAL.pinkDeep);
    runner.addColorStop(1, '#a8336f');
    c.fillStyle = runner;
    c.fillRect(V.x, ST + 8, V.w, SB - ST - 16);
    c.fillStyle = 'rgba(255,255,255,0.4)';
    c.fillRect(V.x, ST + 8, V.w, 3);
    /* the curtain's glow and the beams reflected in the polish */
    var sheen = c.createLinearGradient(0, ST + 8, 0, SB - 8);
    sheen.addColorStop(0, 'rgba(255,255,255,0.26)');
    sheen.addColorStop(0.45, 'rgba(255,255,255,0.03)');
    sheen.addColorStop(1, 'rgba(255,255,255,0.12)');
    c.fillStyle = sheen;
    c.fillRect(V.x, ST + 8, V.w, SB - ST - 16);
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (var rb = 0; rb < beams.length; rb++) {
      var rbx = beams[rb][0] + Math.sin(t / 60 + beams[rb][2]) * 160;
      var rg = c.createLinearGradient(rbx - 90, 0, rbx + 90, 0);
      rg.addColorStop(0, 'rgba(' + beams[rb][1] + ',0)');
      rg.addColorStop(0.5, 'rgba(' + beams[rb][1] + ',0.16)');
      rg.addColorStop(1, 'rgba(' + beams[rb][1] + ',0)');
      c.fillStyle = rg;
      c.fillRect(rbx - 90, ST + 8, 180, SB - ST - 16);
    }
    c.restore();
    /* front face: the slab's thickness, dark under the lip */
    var face = c.createLinearGradient(0, SB - 8, 0, SB + 10);
    face.addColorStop(0, '#f3dcea');
    face.addColorStop(0.3, '#b98bb0');
    face.addColorStop(1, '#5e3560');
    c.fillStyle = face;
    c.fillRect(V.x, SB - 8, V.w, 18);
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillRect(V.x, SB - 8, V.w, 2);
    /* LED strip along the lip, hues chasing down the catwalk */
    for (var led = V.x; led < V.x + V.w; led += 12) {
      var hue = ((led - V.x) * 0.9 + t * 2.4) % 360;
      c.fillStyle = 'hsla(' + hue + ', 90%, 70%, 0.9)';
      c.fillRect(led + 2, SB + 3, 8, 4);
    }
    c.save();
    c.globalCompositeOperation = 'lighter';
    var ledGlow = c.createLinearGradient(0, SB - 4, 0, SB + 14);
    ledGlow.addColorStop(0, 'rgba(255,200,240,0)');
    ledGlow.addColorStop(0.5, 'rgba(255,200,240,0.18)');
    ledGlow.addColorStop(1, 'rgba(255,200,240,0)');
    c.fillStyle = ledGlow;
    c.fillRect(V.x, SB - 4, V.w, 18);
    c.restore();
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(V.x, SB + 10, V.w, 6);
    if (spotX !== null && spotX !== undefined) drawSpotPool(c, spotX, t);
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

    /* audience in the foreground, bouncing with excitement. The back
       rows are lit by the stage; the front row sits in the dark right
       by the camera, out of focus. */
    var ex = excitement || 0;
    /* the crowd repeats every 864px so it fills the tablet bezel too */
    var rep;
    for (rep = Math.floor(V.x / 864) - 1; rep * 864 < V.x + V.w + 60; rep++) {
      if (rep * 864 + 900 < V.x) continue;
      c.save();
      c.translate(rep * 864, 0);
      for (var a = 0; a < AUDIENCE.length; a++) if (AUDIENCE[a].row < 2) drawSpectator(c, AUDIENCE[a], t, ex);
      c.restore();
    }
    var fade = c.createLinearGradient(0, RUNWAY.audienceY + 20, 0, V.y + V.h);
    fade.addColorStop(0, 'rgba(26,12,38,0)');
    fade.addColorStop(1, 'rgba(26,12,38,0.75)');
    c.fillStyle = fade;
    c.fillRect(V.x, RUNWAY.audienceY + 20, V.w, V.y + V.h - RUNWAY.audienceY - 20);
    drawFrontRow(c, t, ex);
  }

  /* The nearest row of heads, painted into a half-resolution band and
     laid down blurred: a foreground the lens can't hold in focus. */
  var crowdCv = null, crowdCtx = null;
  function drawFrontRow(c, t, ex) {
    var V = view();
    var top = RUNWAY.audienceY + 30, h = V.y + V.h - top;
    if (h <= 0) return;
    if (!HAS_FILTER || !Game.FX.dof) {
      for (var rep0 = Math.floor(V.x / 864) - 1; rep0 * 864 < V.x + V.w + 60; rep0++) {
        c.save(); c.translate(rep0 * 864, 0);
        for (var a0 = 0; a0 < AUDIENCE.length; a0++) if (AUDIENCE[a0].row === 2) drawSpectator(c, AUDIENCE[a0], t, ex);
        c.restore();
      }
      return;
    }
    var ds = 2;
    var bw = Math.ceil(V.w / ds), bh = Math.ceil((h + 40) / ds);
    if (!crowdCv) { crowdCv = document.createElement('canvas'); crowdCtx = crowdCv.getContext('2d'); }
    if (crowdCv.width !== bw || crowdCv.height !== bh) { crowdCv.width = bw; crowdCv.height = bh; }
    var g = crowdCtx;
    g.setTransform(1 / ds, 0, 0, 1 / ds, 0, 0);
    g.clearRect(0, 0, V.w, h + 40);
    g.save();
    g.translate(-V.x, -(top - 20));
    for (var rep = Math.floor(V.x / 864) - 1; rep * 864 < V.x + V.w + 60; rep++) {
      g.save(); g.translate(rep * 864, 0);
      for (var a = 0; a < AUDIENCE.length; a++) if (AUDIENCE[a].row === 2) drawSpectator(g, AUDIENCE[a], t, ex);
      g.restore();
    }
    g.restore();
    /* in shadow: only the stage's spill catches the tops of their heads */
    g.globalCompositeOperation = 'source-atop';
    var sh = g.createLinearGradient(0, 0, 0, h + 40);
    sh.addColorStop(0, 'rgba(30, 12, 40, 0.5)');
    sh.addColorStop(1, 'rgba(20, 8, 30, 0.82)');
    g.fillStyle = sh;
    g.fillRect(0, 0, V.w, h + 40);
    g.globalCompositeOperation = 'source-over';
    c.save();
    c.filter = 'blur(3px)';
    c.drawImage(crowdCv, 0, 0, bw, bh, V.x, top - 20, V.w, h + 40);
    c.restore();
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
    drawReflectionBand: drawReflectionBand,
    drawForeground: drawForeground,
    stationSample: stationSample,
    RUNWAY: RUNWAY,
    HAS_FILTER: HAS_FILTER,
  };
})();
