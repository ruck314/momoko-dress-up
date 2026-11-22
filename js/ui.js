/* ui.js – title, intro, pause, the wardrobe panel and the HUD.
 *
 * Layout constants for each screen are declared once and used by both the
 * painter and the hit-tester, so the two can never drift apart. That is
 * the single most important convention in this file.
 */
(function () {
  'use strict';
  window.Game = window.Game || {};
  var PAL = Game.PAL;
  var E = Game.entities;

  var W = 800, H = 480;
  var t = 0;

  /* The rectangle the ambient backdrops fill, in game coordinates. It is
     the 800x480 viewport everywhere except on touch devices, where the
     engine widens it to the whole canvas for the menu screens so the
     studio fills the bezel instead of a dark frame. */
  var VIEW = { x: 0, y: 0, w: W, h: H };
  function setView(x, y, w, h) { VIEW.x = x; VIEW.y = y; VIEW.w = w; VIEW.h = h; }
  function clipGame(c) { c.beginPath(); c.rect(0, 0, W, H); c.clip(); }

  /* ================================================================
     Shared helpers
     ================================================================ */
  var FONT = '"M PLUS Rounded 1c", sans-serif';

  var anyHot = false;
  function pointerOver(c, x, y, w, h) {
    var p = Game.input && Game.input.pointer;
    if (!p || p.px < 0 || !c.getTransform) return false;
    var pt = c.getTransform().inverse().transformPoint(new DOMPoint(p.px, p.py));
    var over = pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + h;
    if (over) anyHot = true;
    return over;
  }

  function fitFont(c, text, maxW, size, weight, min) {
    min = min || 8;
    while (true) {
      c.font = (weight ? weight + ' ' : '') + size + 'px ' + FONT;
      if (size <= min || c.measureText(text).width <= maxW) break;
      size--;
    }
  }

  /* Rounded, glossy button with a drop shadow and hover / press feedback. */
  function button(c, b, label, opts) {
    opts = opts || {};
    var fill = opts.active ? (opts.activeFill || PAL.sun) : (opts.fill || PAL.cream);
    if (opts.disabled) fill = '#c9bcc4';
    var r = opts.r === undefined ? 9 : opts.r;
    var hot = !opts.disabled && pointerOver(c, b.x, b.y, b.w, b.h);
    var pressed = hot && Game.input.pointer.down;
    var oy = pressed ? 2 : 0;
    c.save();
    /* soft shadow pool plus the thick base the key stands on */
    if (!pressed) {
      c.fillStyle = 'rgba(43, 21, 48, 0.14)';
      E.roundRect(c, b.x - 2, b.y + 5, b.w + 4, b.h + 2, r + 2);
      c.fill();
      c.fillStyle = typeof fill === 'string' && fill.charAt(0) === '#' ? E.shade(fill, -38) : 'rgba(74, 42, 64, 0.5)';
      E.roundRect(c, b.x, b.y + 3.5, b.w, b.h, r);
      c.fill();
    }
    c.fillStyle = fill;
    E.roundRect(c, b.x, b.y + oy, b.w, b.h, r);
    c.fill();
    /* vertical body gradient: lit top, shaded base */
    c.save();
    E.roundRect(c, b.x, b.y + oy, b.w, b.h, r);
    c.clip();
    var bg = c.createLinearGradient(0, b.y + oy, 0, b.y + oy + b.h);
    bg.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
    bg.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    bg.addColorStop(0.86, 'rgba(74, 42, 64, 0.08)');
    bg.addColorStop(1, 'rgba(74, 42, 64, 0.22)');
    c.fillStyle = bg;
    c.fillRect(b.x, b.y + oy, b.w, b.h);
    if (hot) {
      c.fillStyle = 'rgba(255, 255, 255, 0.28)';
      c.fillRect(b.x, b.y + oy, b.w, b.h);
    }
    /* the glossy cap across the upper half */
    var cap = c.createLinearGradient(0, b.y + oy + 2, 0, b.y + oy + b.h * 0.46);
    cap.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
    cap.addColorStop(1, 'rgba(255, 255, 255, 0.16)');
    c.fillStyle = cap;
    E.roundRect(c, b.x + 3, b.y + oy + 2, b.w - 6, b.h * 0.44, Math.max(2, r - 3));
    c.fill();
    c.restore();
    E.roundRect(c, b.x, b.y + oy, b.w, b.h, r);
    E.ink(c, opts.active || hot ? 3 : 2);
    fitFont(c, label, b.w - 12, opts.font || 15, 'bold');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    /* letterpress: a pale lift under the text, then the text */
    if (!opts.disabled) {
      c.fillStyle = 'rgba(255, 255, 255, 0.55)';
      c.fillText(label, b.x + b.w / 2, b.y + oy + b.h / 2 + 2.2);
    }
    c.fillStyle = opts.disabled ? '#7a6a74' : (opts.textColor || PAL.ink);
    c.fillText(label, b.x + b.w / 2, b.y + oy + b.h / 2 + 1);
    c.restore();
  }

  function layoutLines(c, text, maxWidth) {
    var out = [];
    var paras = String(text).split('\n');
    for (var li = 0; li < paras.length; li++) {
      var words = paras[li].split(' ');
      var line = '';
      for (var i = 0; i < words.length; i++) {
        var word = words[i];
        var test = line ? line + ' ' + word : word;
        if (c.measureText(test).width <= maxWidth) { line = test; continue; }
        if (line) { out.push(line); line = ''; }
        while (c.measureText(word).width > maxWidth && word.length > 1) {
          var n = word.length - 1;
          while (n > 1 && c.measureText(word.slice(0, n)).width > maxWidth) n--;
          while (n > 1 && ('、。！？」）ー'.indexOf(word.charAt(n)) >= 0 ||
                           '「（'.indexOf(word.charAt(n - 1)) >= 0)) n--;
          out.push(word.slice(0, n));
          word = word.slice(n);
        }
        line = word;
      }
      out.push(line);
    }
    return out;
  }

  function hit(b, mx, my) {
    return mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
  }

  function panel(c, x, y, w, h, fill, alpha) {
    c.save();
    /* three-step drop shadow: a wide soft one, a mid one, and a tight
       dark one right under the edge, so the card lifts off the room */
    c.fillStyle = 'rgba(43, 21, 48, 0.08)';
    E.roundRect(c, x - 8, y + 4, w + 16, h + 18, 20); c.fill();
    c.fillStyle = 'rgba(43, 21, 48, 0.12)';
    E.roundRect(c, x - 3, y + 3, w + 6, h + 9, 15); c.fill();
    c.fillStyle = 'rgba(43, 21, 48, 0.26)';
    E.roundRect(c, x, y + 4, w, h, 12); c.fill();
    if (alpha !== undefined) c.globalAlpha = alpha;
    c.fillStyle = fill || 'rgba(255, 246, 236, 0.94)';
    E.roundRect(c, x, y, w, h, 12);
    c.fill();
    /* a cool sheen at the top edge and a warm shade at the bottom */
    E.roundRect(c, x, y, w, h, 12);
    c.clip();
    var g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
    g.addColorStop(0.2, 'rgba(255, 255, 255, 0)');
    g.addColorStop(0.8, 'rgba(226, 85, 154, 0)');
    g.addColorStop(1, 'rgba(226, 85, 154, 0.1)');
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
    /* the card's face darkens a touch toward its edges, like paper
       under a lamp */
    var pv = c.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.2, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
    pv.addColorStop(0, 'rgba(226, 85, 154, 0)');
    pv.addColorStop(1, 'rgba(160, 60, 130, 0.1)');
    c.fillStyle = pv;
    c.fillRect(x, y, w, h);
    /* the hairline inner frame of a printed card */
    c.strokeStyle = 'rgba(242, 182, 50, 0.5)';
    c.lineWidth = 1.2;
    E.roundRect(c, x + 5, y + 5, w - 10, h - 10, 8);
    c.stroke();
    c.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    c.lineWidth = 1;
    E.roundRect(c, x + 6.5, y + 6.5, w - 13, h - 13, 7);
    c.stroke();
    c.restore();
    E.roundRect(c, x, y, w, h, 12);
    E.ink(c, 2);
  }

  /* The coloured header bar of a card: lit along its top, shaded at its
     foot, with the same glossy cap as the buttons so every piece of the
     interface is cut from one material. `col` is a hex colour. */
  function ribbon(c, x, y, w, h, r, col, inkW) {
    c.save();
    c.fillStyle = 'rgba(43, 21, 48, 0.16)';
    E.roundRect(c, x, y + 2.5, w, h, r);
    c.fill();
    var g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, E.shade(col, 26));
    g.addColorStop(0.5, col);
    g.addColorStop(1, E.shade(col, -16));
    c.fillStyle = g;
    E.roundRect(c, x, y, w, h, r);
    c.fill();
    var cap = c.createLinearGradient(0, y + 2, 0, y + h * 0.48);
    cap.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
    cap.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
    c.fillStyle = cap;
    E.roundRect(c, x + 4, y + 3, w - 8, h * 0.42, Math.max(2, r - 4));
    c.fill();
    c.fillStyle = col;
    E.roundRect(c, x, y, w, h, r);
    if (inkW) E.ink(c, inkW);
    else { c.strokeStyle = E.shade(col, -34); c.globalAlpha = 0.6; c.lineWidth = 1.2; c.stroke(); }
    c.restore();
  }

  /* A white field sunk into its card: the top lip throws a soft shadow
     inside it and the lower edge catches a line of light. */
  function well(c, x, y, w, h, r) {
    c.save();
    c.fillStyle = 'rgba(255, 255, 255, 0.85)';
    E.roundRect(c, x, y + 2, w, h, r);
    c.fill();
    E.fillRound(c, x, y, w, h, r, '#ffffff', false);
    E.roundRect(c, x, y, w, h, r);
    c.clip();
    var g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(110, 50, 120, 0.26)');
    g.addColorStop(Math.min(0.45, 10 / h), 'rgba(110, 50, 120, 0)');
    g.addColorStop(0.7, 'rgba(255, 214, 232, 0)');
    g.addColorStop(1, 'rgba(255, 214, 232, 0.4)');
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
    c.restore();
    c.fillStyle = '#ffffff';
    E.roundRect(c, x, y, w, h, r);
    E.ink(c, 2);
  }

  /* A floating cream pill (HUD badge, announcer): drop shadow, a lit
     top and an inked edge. */
  function pill(c, x, y, w, h) {
    c.save();
    c.fillStyle = 'rgba(43, 21, 48, 0.2)';
    E.roundRect(c, x, y + 3, w, h, h / 2);
    c.fill();
    var g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#fff6ec');
    g.addColorStop(1, '#f6dfd8');
    c.fillStyle = g;
    E.roundRect(c, x, y, w, h, h / 2);
    c.fill();
    c.fillStyle = '#fff6ec';
    E.ink(c, 2);
    c.restore();
  }

  /* Frosted glass: whatever is already on the canvas under the rect is
     grabbed, shrunk, blurred and laid back down with a milky tint, so a
     card floats in front of the room instead of being pasted onto it.
     Browsers without canvas filters get a plain translucent fill. */
  var frostCv = null, frostCtx = null;
  function frostPanel(c, x, y, w, h, r, tint, blurPx) {
    var pad = 20;
    c.save();
    E.roundRect(c, x, y, w, h, r);
    c.clip();
    if (Game.studio.HAS_FILTER && Game.FX.frost && c.getTransform) {
      var m = c.getTransform();
      var sx = (x - pad) * m.a + m.e, sy = (y - pad) * m.d + m.f;
      var sw = (w + pad * 2) * m.a, sh = (h + pad * 2) * m.d;
      var ds = 3;
      var bw = Math.max(1, Math.ceil(sw / ds)), bh = Math.max(1, Math.ceil(sh / ds));
      if (!frostCv) { frostCv = document.createElement('canvas'); frostCtx = frostCv.getContext('2d'); }
      if (frostCv.width < bw || frostCv.height < bh) { frostCv.width = Math.max(frostCv.width, bw); frostCv.height = Math.max(frostCv.height, bh); }
      frostCtx.clearRect(0, 0, bw, bh);
      frostCtx.drawImage(c.canvas, sx, sy, sw, sh, 0, 0, bw, bh);
      c.filter = 'blur(' + (blurPx || 7) + 'px)';
      c.drawImage(frostCv, 0, 0, bw, bh, x - pad, y - pad, w + pad * 2, h + pad * 2);
      c.filter = 'none';
      c.fillStyle = tint || 'rgba(255, 248, 252, 0.5)';
      c.fillRect(x, y, w, h);
    } else {
      c.fillStyle = tint ? tint.replace(/[\d.]+\)$/, '0.82)') : 'rgba(255, 248, 252, 0.82)';
      c.fillRect(x, y, w, h);
    }
    /* glass edge: bright along the top, a cool shade at the foot */
    var eg = c.createLinearGradient(0, y, 0, y + h);
    eg.addColorStop(0, 'rgba(255,255,255,0.5)');
    eg.addColorStop(0.12, 'rgba(255,255,255,0)');
    eg.addColorStop(0.9, 'rgba(120,70,160,0)');
    eg.addColorStop(1, 'rgba(120,70,160,0.12)');
    c.fillStyle = eg;
    c.fillRect(x, y, w, h);
    c.restore();
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 2;
    E.roundRect(c, x, y, w, h, r);
    c.stroke();
    c.strokeStyle = 'rgba(74,42,64,0.14)';
    c.lineWidth = 1;
    E.roundRect(c, x - 1, y + 1, w + 2, h + 2, r + 1);
    c.stroke();
    c.restore();
  }

  function multiline(c, text, cx, y, lineH, align) {
    var lines = String(text).split('\n');
    c.textAlign = align || 'center';
    c.textBaseline = 'middle';
    for (var i = 0; i < lines.length; i++) c.fillText(lines[i], cx, y + i * lineH);
    return lines.length * lineH;
  }

  function T(k) { return Game.i18n.t(k); }

  /* ---- Colour and pattern chips ----
     A colour is shown as the thing it colours: a lock of hair, a cheek,
     an iris, a pair of lips, a tuft of fur, a swatch of cloth with a
     pinked edge, a patch of stitched leather, a cut gem. The picture is
     painted once per colour into a sprite; the card, the hover and the
     chosen ring are drawn live. */
  var CHIP_KIND = { skin: 'skin', hair: 'hair', eyes: 'eye', mouth: 'lip', ears: 'fur', shoes: 'leather', extra: 'gem' };
  function paintChip(g, kind, w, h, col, pat) {
    var k = Math.min(w / 42, h / 52), i;
    var warm = kind === 'skin';
    var dark = E.shadowOf(col, 24, warm), trim = E.trimOf(col);
    g.translate(w / 2, h / 2);
    g.scale(k, k);
    g.lineJoin = 'round'; g.lineCap = 'round';
    /* fill, a stepped shadow on the lower right, then the outline */
    var solid = function (path) {
      path(); g.fillStyle = col; g.fill();
      g.save(); path(); g.clip();
      g.fillStyle = dark; g.fillRect(-30, -30, 60, 60);
      g.translate(-2.6, -3); path(); g.fillStyle = col; g.fill();
      g.restore();
    };
    var outline = function (path) { path(); g.strokeStyle = E.inkColor(col); g.lineWidth = 1.8; g.stroke(); };
    var p;
    if (kind === 'hair') {
      /* a tail of hair below its tie */
      p = function () {
        g.beginPath();
        g.moveTo(-9, -17);
        g.bezierCurveTo(6, -21, 17, -6, 12, 7);
        g.bezierCurveTo(9, 15, 2, 21, -9, 23);
        g.bezierCurveTo(-3, 17, -1, 11, -3, 4);
        g.bezierCurveTo(-5, -4, -11, -9, -14, -12);
        g.closePath();
      };
      solid(p);
      g.save(); p(); g.clip();
      g.strokeStyle = E.shadowOf(col, 36, false); g.lineWidth = 0.8; g.globalAlpha = 0.6;
      g.beginPath(); g.moveTo(-7, -14); g.bezierCurveTo(6, -10, 9, 4, -2, 19); g.moveTo(-10, -12); g.bezierCurveTo(1, -6, 4, 4, -5, 20); g.stroke();
      g.strokeStyle = E.mix(E.shade(col, 55), '#fff8ec', 0.3); g.lineWidth = 2.2; g.globalAlpha = 0.8;
      g.beginPath(); g.moveTo(2, -15); g.bezierCurveTo(10, -9, 12, -2, 10, 5); g.stroke();
      g.restore();
      outline(p);
      g.beginPath(); g.ellipse(-11, -16, 5.4, 4.2, -0.6, 0, Math.PI * 2);
      g.fillStyle = col === '#e06088' || col === '#ffb3cf' ? PAL.sun : PAL.pink; g.fill();
      g.strokeStyle = 'rgba(74, 42, 64, 0.8)'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(-12.4, -17.6, 1.7, 1, -0.6, 0, Math.PI * 2); g.fill();
    } else if (kind === 'skin') {
      p = function () { g.beginPath(); g.arc(0, -1, 18, 0, Math.PI * 2); };
      solid(p);
      g.fillStyle = 'rgba(255, 110, 130, 0.3)'; g.beginPath(); g.ellipse(7, 5, 6, 3.6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255, 255, 255, 0.55)'; g.beginPath(); g.ellipse(-7, -9, 4.4, 2.6, -0.5, 0, Math.PI * 2); g.fill();
      outline(p);
    } else if (kind === 'eye') {
      p = function () { g.beginPath(); g.ellipse(0, -1, 15, 18, 0, 0, Math.PI * 2); };
      var ig = g.createLinearGradient(0, -19, 0, 17);
      ig.addColorStop(0, E.shade(col, -50)); ig.addColorStop(0.45, col); ig.addColorStop(1, E.mix(E.shade(col, 42), '#ffe6c8', 0.12));
      p(); g.fillStyle = ig; g.fill();
      g.fillStyle = E.mix(E.shade(col, -70), '#2a1024', 0.5); g.beginPath(); g.ellipse(0, 0, 6.4, 8.4, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.5; g.fillStyle = E.mix(E.shade(col, 58), '#fff0d8', 0.2); g.beginPath(); g.ellipse(0, 9, 9.4, 5.4, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(-5.4, -8, 4.2, 5, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(5.4, 7, 2.1, 2.1, 0, 0, Math.PI * 2); g.fill();
      p(); g.strokeStyle = E.shade(col, -62); g.lineWidth = 1.8; g.stroke();
    } else if (kind === 'lip') {
      if (col === PAL.ink) {
        /* the natural mouth: just her smile */
        g.strokeStyle = '#5a2a3c'; g.lineWidth = 2.6;
        g.beginPath(); g.arc(0, -8, 14, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
      } else {
        p = function () {
          g.beginPath();
          g.moveTo(-17, -1);
          g.bezierCurveTo(-11, -9, -5, -11, 0, -6);
          g.bezierCurveTo(5, -11, 11, -9, 17, -1);
          g.bezierCurveTo(10, 12, -10, 12, -17, -1);
          g.closePath();
        };
        solid(p);
        g.strokeStyle = E.shadowOf(col, 40, false); g.lineWidth = 1.1;
        g.beginPath(); g.moveTo(-15, -1); g.quadraticCurveTo(0, 3, 15, -1); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(-4, 5, 4.6, 1.6, -0.1, 0, Math.PI * 2); g.fill();
        outline(p);
      }
    } else if (kind === 'fur') {
      p = function () { E.fluffPath(g, 0, -1, 18, 18, 11, 0.3); };
      solid(p);
      g.strokeStyle = E.shadowOf(col, 26, false); g.lineWidth = 1; g.globalAlpha = 0.7;
      g.beginPath(); g.arc(5, 4, 6, 0.2, 1.7); g.moveTo(-1, -5); g.arc(-7, -3, 5.4, 0, 1.4); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(-7, -9, 4.6, 2.6, -0.5, 0, Math.PI * 2); g.fill();
      outline(p);
    } else if (kind === 'gem') {
      E.jewel(g, 0, -1, 17, col, 'round');
    } else if (kind === 'leather') {
      p = function () { E.roundRect(g, -18, -22, 36, 42, 9); };
      solid(p);
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.ellipse(-7, -13, 7, 3, -0.4, 0, Math.PI * 2); g.fill();
      E.roundRect(g, -14, -18, 28, 34, 6); g.strokeStyle = trim; g.lineWidth = 1; g.setLineDash([2.4, 2]); g.stroke(); g.setLineDash([]);
      outline(p);
    } else {
      /* cloth: a swatch cut with pinking shears, a fold of light across it */
      p = function () {
        g.beginPath();
        g.moveTo(-18, -19); g.quadraticCurveTo(-18, -23, -14, -23); g.lineTo(14, -23); g.quadraticCurveTo(18, -23, 18, -19); g.lineTo(18, 17);
        for (i = 0; i < 6; i++) { g.lineTo(15 - i * 6, 22); g.lineTo(12 - i * 6, 17); }
        g.closePath();
      };
      solid(p);
      g.save(); p(); g.clip();
      if (pat && pat !== 'plain') { g.save(); g.scale(2.1, 2.1); E.drawPattern(g, pat, col, -10, -11.5, 10, 11.5); g.restore(); }
      g.strokeStyle = E.shadowOf(col, 22, false); g.lineWidth = 0.5; g.globalAlpha = pat && pat !== 'plain' ? 0 : 0.45;
      g.beginPath(); for (i = -20; i < 22; i += 3) { g.moveTo(-19, i); g.lineTo(19, i); } g.stroke(); g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,0.28)';
      g.beginPath(); g.moveTo(-19, 2); g.lineTo(2, -24); g.lineTo(11, -24); g.lineTo(-19, 14); g.closePath(); g.fill();
      g.restore();
      g.beginPath(); g.moveTo(-14, -18.5); g.lineTo(14, -18.5); g.strokeStyle = trim; g.lineWidth = 1; g.setLineDash([2.4, 2]); g.stroke(); g.setLineDash([]);
      outline(p);
    }
  }
  /* r is the chip's whole cell (its touch target); the card sits inside. */
  function drawChip(c, r, kind, col, sel, pat) {
    var hot = !sel && pointerOver(c, r.x, r.y, r.w, r.h);
    var lift = sel ? -2 : hot ? -1 : 0;
    var x = r.x + 3, y = r.y + 3 + lift, w = r.w - 6, h = r.h - 8;
    c.fillStyle = 'rgba(74, 42, 64, ' + (sel ? 0.24 : 0.15) + ')';
    E.roundRect(c, x + 1, y + 3 - lift, w, h, 10); c.fill();
    var cg = c.createLinearGradient(0, y, 0, y + h);
    cg.addColorStop(0, sel ? '#fff7d6' : '#ffffff');
    cg.addColorStop(1, sel ? '#ffe08a' : (hot ? '#fff4f8' : '#fbeef4'));
    c.fillStyle = cg;
    E.roundRect(c, x, y, w, h, 10); c.fill();
    var spr = E.getCachedSprite('chip|' + kind + '|' + col + '|' + (pat || '') + '|' + w + 'x' + h, w, h, function (g) { paintChip(g, kind, w, h, col, pat); });
    E.drawSprite(c, spr, x, y);
    E.roundRect(c, x, y, w, h, 10);
    if (sel) {
      c.strokeStyle = '#b8801a'; c.lineWidth = 4; c.stroke();
      E.roundRect(c, x, y, w, h, 10);
      c.strokeStyle = PAL.sun; c.lineWidth = 2; c.stroke();
      var bx = x + w - 7, by = y + 7;
      E.fillEllipse(c, bx, by + 1, 9, 9, 'rgba(43,21,48,0.25)', false);
      E.fillEllipse(c, bx, by, 9, 9, PAL.teal);
      c.strokeStyle = PAL.cream; c.lineWidth = 2.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(bx - 4, by); c.lineTo(bx - 1, by + 3.5); c.lineTo(bx + 4.5, by - 3.5); c.stroke();
    } else {
      c.strokeStyle = hot ? 'rgba(74, 42, 64, 0.75)' : 'rgba(74, 42, 64, 0.4)';
      c.lineWidth = hot ? 2.2 : 1.4;
      c.stroke();
    }
  }

  /* ---- Toast ---- */
  var toast = { text: '', timer: 0, fresh: false };
  function showToast(text, frames) {
    toast.text = text;
    toast.timer = frames || 120;
    toast.fresh = true;
  }
  function dropStaleToast() { if (!toast.fresh) toast.timer = 0; }
  function endFrame() { toast.fresh = false; }
  function drawToast(c) {
    if (toast.timer <= 0) return;
    toast.timer--;
    var a = Math.min(1, toast.timer / 22);
    var lines = toast.text.split('\n');
    c.save();
    c.globalAlpha = a;
    c.font = 'bold 16px ' + FONT;
    var maxW = 0;
    for (var i = 0; i < lines.length; i++) maxW = Math.max(maxW, c.measureText(lines[i]).width);
    var bw = maxW + 40, bh = lines.length * 22 + 22;
    panel(c, (W - bw) / 2, 96, bw, bh);
    c.fillStyle = PAL.ink;
    multiline(c, toast.text, W / 2, 96 + bh / 2 - ((lines.length - 1) * 11), 22);
    c.restore();
  }

  function drawVersionStamp(c) {
    c.save();
    var rx = VIEW.x + VIEW.w, by = VIEW.y + VIEW.h;
    c.font = '11px ' + FONT;
    var vw = c.measureText(Game.VERSION || '').width + 12;
    c.fillStyle = 'rgba(255, 246, 236, 0.6)';
    E.roundRect(c, rx - 2 - vw, by - 20, vw, 16, 8);
    c.fill();
    c.fillStyle = 'rgba(74, 42, 64, 0.6)';
    c.textAlign = 'right';
    c.textBaseline = 'bottom';
    c.fillText(Game.VERSION || '', rx - 8, by - 6);
    c.restore();
  }

  /* A little star-and-count badge used by the HUD and menus. */
  function drawStarBadge(c, x, y, count, label) {
    c.save();
    c.font = 'bold 15px ' + FONT;
    var text = String(count) + (label ? '  ' + label : '');
    var w = c.measureText(text).width + 44;
    pill(c, x, y, w, 30);
    var sg = c.createLinearGradient(0, y + 5, 0, y + 25);
    sg.addColorStop(0, '#ffe98a');
    sg.addColorStop(1, PAL.gold);
    c.fillStyle = sg;
    E.star(c, x + 17, y + 15, 10);
    c.strokeStyle = '#8a5a14'; c.lineWidth = 1.5; c.lineJoin = 'round'; c.stroke();
    E.fillEllipse(c, x + 15, y + 11.5, 2, 1.3, 'rgba(255, 255, 255, 0.75)', false);
    c.fillStyle = PAL.ink;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(text, x + 32, y + 16);
    c.restore();
    return w;
  }

  /* ================================================================
     Title screen
     ================================================================ */
  var TITLE_CX = 532;
  var TITLE_BTN = {
    play: { x: TITLE_CX - 100, y: 250, w: 200, h: 50 },
    how: { x: TITLE_CX - 100, y: 312, w: 200, h: 40 },
    lang: { x: TITLE_CX - 100, y: 362, w: 95, h: 40 },
    sound: { x: TITLE_CX + 5, y: 362, w: 95, h: 40 },
    reset: { x: 640, y: 418, w: 146, h: 34 },
  };
  var showInstructions = false;
  var confirmReset = false;
  var RESET_YES = { x: 300, y: 300, w: 90, h: 42 };
  var RESET_NO = { x: 410, y: 300, w: 90, h: 42 };
  var TITLE_GROUND = 414;

  /* Two friends who pose beside Momoko on the title, redrawn each boot. */
  var titleFriends = null;
  function titleCast() {
    if (!titleFriends) {
      var rnd = E.seeded(Math.floor(Math.random() * 1e6));
      titleFriends = [E.randomLook(rnd), E.randomLook(rnd)];
    }
    return titleFriends;
  }

  /* Petals drifting down across the title, deterministic in t. */
  var PETALS = (function () {
    var rnd = E.seeded(99), out = [];
    for (var i = 0; i < 34; i++) {
      var depth = rnd();  /* 0 = far and small, 1 = right by the lens */
      out.push({ x: rnd(), sp: 0.2 + depth * 0.55, ph: rnd() * 6.28, r: 2.5 + depth * 9, sw: 14 + rnd() * 16,
                 depth: depth, col: i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#ffb7d9' : '#ff9ccd' });
    }
    out.sort(function (a, b) { return a.depth - b.depth; });
    return out;
  })();
  /* a petal pre-blurred by how close it is, so the near ones fall out of focus */
  function petalSprite(col, blur) {
    return E.getCachedSprite('petal' + col + blur, 40, 40, function (g) {
      if (Game.studio.HAS_FILTER && blur > 0) g.filter = 'blur(' + blur + 'px)';
      E.fillEllipse(g, 20, 20, 12, 7.2, col, false);
      E.fillEllipse(g, 16.4, 18.2, 4.8, 2.6, 'rgba(255,255,255,0.6)', false);
      g.globalAlpha = 0.35;
      E.fillEllipse(g, 24, 22, 3, 1.6, 'rgba(226,85,154,1)', false);
    });
  }
  function drawPetals(c, nearOnly, farOnly) {
    c.save();
    for (var i = 0; i < PETALS.length; i++) {
      var p = PETALS[i];
      if (nearOnly && p.depth < 0.7) continue;
      if (farOnly && p.depth >= 0.7) continue;
      var y = ((t * p.sp + p.ph * 90) % (VIEW.h + 80)) - 40 + VIEW.y;
      var x = VIEW.x + p.x * VIEW.w + Math.sin(t / 40 + p.ph) * p.sw;
      var blur = p.depth > 0.7 ? Math.round((p.depth - 0.7) * 8) : 0;
      var spr = petalSprite(p.col, blur);
      c.save();
      c.translate(x, y);
      c.rotate(Math.sin(t / 30 + p.ph) * 0.8 + p.ph);
      c.globalAlpha = p.depth > 0.7 ? 0.55 : 0.8;
      var sc = p.r / 12;
      c.scale(sc, sc);
      c.drawImage(spr, -20, -20, 40, 40);
      c.restore();
    }
    c.restore();
  }

  /* The house lights come down a notch on every menu, so the cards and
     the lit podium are the bright things in the room. */
  function drawDusk(c, amount) {
    c.save();
    c.globalCompositeOperation = 'multiply';
    var k = amount === undefined ? 1 : amount;
    var dusk = c.createLinearGradient(0, VIEW.y, 0, VIEW.y + VIEW.h);
    dusk.addColorStop(0, 'rgb(' + Math.round(255 - 95 * k) + ',' + Math.round(255 - 145 * k) + ',' + Math.round(255 - 80 * k) + ')');
    dusk.addColorStop(0.5, 'rgb(' + Math.round(255 - 37 * k) + ',' + Math.round(255 - 75 * k) + ',' + Math.round(255 - 41 * k) + ')');
    dusk.addColorStop(1, 'rgb(' + Math.round(255 - 75 * k) + ',' + Math.round(255 - 125 * k) + ',' + Math.round(255 - 73 * k) + ')');
    c.fillStyle = dusk;
    c.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    c.restore();
  }

  function drawTitleScreen(c) {
    t++;
    /* windows at x=310 and 740: behind the podium and past the buttons */
    Game.studio.drawBackdrop(c, 0, t, TITLE_GROUND, 250, true);
    /* the house lights are down: the room falls to dusk and the spots
       take over, so the eye lands on the podium and the title */
    drawDusk(c, 1);
    drawPetals(c, false, true);
    c.save();
    clipGame(c);

    /* a little star podium with Momoko and two friends */
    var px = 190, py = TITLE_GROUND + 30;
    /* two spotlights cross on the podium, with a hot pool where they land */
    c.save();
    c.globalCompositeOperation = 'lighter';
    var rigs = [[px - 150, '255,240,205', 0.34], [px + 170, '255,205,235', 0.26]];
    for (var ri = 0; ri < rigs.length; ri++) {
      var rx = rigs[ri][0], ry = VIEW.y - 10;
      var dx = px - rx, dy = py - 6 - ry, len = Math.sqrt(dx * dx + dy * dy);
      c.save();
      c.translate(rx, ry);
      c.rotate(Math.atan2(dy, dx) - Math.PI / 2);
      var cone = c.createLinearGradient(0, 0, 0, len);
      cone.addColorStop(0, 'rgba(' + rigs[ri][1] + ',' + rigs[ri][2] + ')');
      cone.addColorStop(0.7, 'rgba(' + rigs[ri][1] + ',' + (rigs[ri][2] * 0.4) + ')');
      cone.addColorStop(1, 'rgba(' + rigs[ri][1] + ',0.03)');
      c.fillStyle = cone;
      c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.lineTo(120, len); c.lineTo(-120, len); c.closePath(); c.fill();
      var core = c.createLinearGradient(0, 0, 0, len);
      core.addColorStop(0, 'rgba(255,255,255,0.14)'); core.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = core;
      c.beginPath(); c.moveTo(-3, 0); c.lineTo(3, 0); c.lineTo(44, len); c.lineTo(-44, len); c.closePath(); c.fill();
      c.restore();
      E.fillEllipse(c, rx, ry + 8, 10, 6, 'rgba(255,250,235,0.9)', false);
    }
    c.save();
    c.translate(px, py - 2);
    c.scale(1, 0.22);
    var pool = c.createRadialGradient(0, 0, 10, 0, 0, 230);
    pool.addColorStop(0, 'rgba(255, 246, 225, 0.55)');
    pool.addColorStop(0.5, 'rgba(255, 230, 240, 0.18)');
    pool.addColorStop(1, 'rgba(255, 230, 240, 0)');
    c.fillStyle = pool;
    c.fillRect(-230, -230, 460, 460);
    c.restore();
    c.restore();
    /* the podium: a pink disc with a brass rim and a lit top */
    E.softShadow(c, px, py + 10, 160, 26, 0.3);
    E.fillEllipse(c, px, py + 3, 150, 20, E.shade(PAL.pinkDeep, -14));
    var pdg = c.createLinearGradient(0, py - 24, 0, py + 16);
    pdg.addColorStop(0, '#ffb9d9'); pdg.addColorStop(0.6, PAL.pink); pdg.addColorStop(1, E.shade(PAL.pink, -12));
    E.fillEllipse(c, px, py - 4, 150, 20, pdg, false);
    c.fillStyle = PAL.pink; c.beginPath(); c.ellipse(px, py - 4, 150, 20, 0, 0, Math.PI * 2); E.ink(c, 2);
    c.beginPath(); c.ellipse(px, py - 4, 140, 16, 0, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = PAL.sun;
    E.star(c, px, py - 4, 16);
    var cast = titleCast();
    var hop = E.hop(t, 138, 6);
    /* velvet ropes either side of the podium */
    for (var ps = -1; ps <= 1; ps += 2) {
      var sx2 = px + ps * 174;
      E.fillEllipse(c, sx2, py + 4, 13, 4, PAL.woodDark);
      var postG = c.createLinearGradient(sx2 - 3, 0, sx2 + 3, 0);
      postG.addColorStop(0, '#9a6a14'); postG.addColorStop(0.35, '#fff0b0'); postG.addColorStop(0.6, '#d9a62a'); postG.addColorStop(1, '#8a5a12');
      E.fillRound(c, sx2 - 2.5, py - 54, 5, 58, 2, postG, false);
      c.fillStyle = PAL.gold; E.roundRect(c, sx2 - 2.5, py - 54, 5, 58, 2); E.ink(c, 2);
      E.fillEllipse(c, sx2, py - 56, 5.5, 5.5, postG);
    }
    c.strokeStyle = PAL.pinkDeep; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(px - 174, py - 52); c.quadraticCurveTo(px - 150, py - 26, px - 130, py - 30); c.stroke();
    c.beginPath(); c.moveTo(px + 174, py - 52); c.quadraticCurveTo(px + 150, py - 26, px + 130, py - 30); c.stroke();
    /* reflections live on the podium disc only */
    c.save();
    c.beginPath(); c.ellipse(px, py - 4, 150, 20, 0, 0, Math.PI * 2); c.clip();
    E.drawReflection(c, px - 110, py - 8, cast[0], 0, 1, 1.2, 0.2, 24, null, { pose: 'pose' });
    E.drawReflection(c, px + 110, py - 8, cast[1], 0, -1, 1.2, 0.2, 24, null, { pose: 'wave' });
    E.drawReflection(c, px, py - 10, Game.look, 0, 1, 1.6, 0.2, 26, null);
    c.restore();
    E.drawCharacter(c, px - 110, py - 8, cast[0], 0, 1, 1.2, (t % 260) < 8, 0, { pose: 'pose', t: t });
    E.drawCharacter(c, px + 110, py - 8, cast[1], 0, -1, 1.2, (t % 240) < 8, 0, { pose: 'wave', t: t });
    E.drawCharacter(c, px, py - 10, Game.look, 0, 1, 1.6, (t % 220) < 8, hop.lift, { t: t, squash: hop.squash });
    /* sparkles around her */
    c.save();
    c.fillStyle = '#ffffff';
    for (var s = 0; s < 7; s++) {
      var tw = Math.sin(t / 7 + s * 1.9);
      if (tw <= 0) continue;
      c.globalAlpha = tw;
      E.star(c, px - 90 + s * 30 + Math.sin(t / 50 + s) * 8, py - 150 + ((s * 53) % 70), 2 + tw * 3);
    }
    c.restore();

    /* Title */
    var bob = Math.sin(t / 40) * 3;
    c.save();
    /* a soft pink halo so the lettering floats off the wallpaper */
    var halo = c.createRadialGradient(TITLE_CX, 160 + bob, 20, TITLE_CX, 160 + bob, 260);
    halo.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
    halo.addColorStop(0.5, 'rgba(255, 230, 242, 0.4)');
    halo.addColorStop(1, 'rgba(255, 230, 242, 0)');
    c.fillStyle = halo;
    c.fillRect(TITLE_CX - 270, 0, 540, 300);
    /* the glow the lettering itself gives off */
    c.save();
    c.globalCompositeOperation = 'lighter';
    var lg = c.createRadialGradient(TITLE_CX, 172 + bob, 10, TITLE_CX, 172 + bob, 200);
    lg.addColorStop(0, 'rgba(255, 170, 215, ' + (0.3 + Math.sin(t / 30) * 0.06) + ')');
    lg.addColorStop(0.5, 'rgba(255, 150, 200, 0.1)');
    lg.addColorStop(1, 'rgba(255, 150, 200, 0)');
    c.fillStyle = lg;
    c.fillRect(TITLE_CX - 220, 20, 440, 300);
    c.restore();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.font = 'bold 30px ' + FONT;
    c.strokeStyle = 'rgba(255, 250, 245, 0.92)';
    c.lineWidth = 6;
    c.strokeText(T('title'), TITLE_CX, 118 + bob);
    c.fillStyle = PAL.ink;
    c.fillText(T('title'), TITLE_CX, 118 + bob);
    fitFont(c, T('title2'), 360, 60, 'bold', 28);
    var ty = 172 + bob;
    /* soft contact shadow under the block */
    c.fillStyle = 'rgba(74, 42, 64, 0.22)';
    c.fillText(T('title2'), TITLE_CX + 4, ty + 12);
    /* cream rim around the whole extruded block */
    c.strokeStyle = PAL.cream;
    c.lineWidth = 12;
    var ex;
    for (ex = 7; ex >= 0; ex--) c.strokeText(T('title2'), TITLE_CX, ty + ex);
    /* the extrusion: wine sides stepping down, lit a touch toward the face */
    for (ex = 7; ex >= 1; ex--) {
      c.fillStyle = ex > 4 ? '#7d1f52' : '#9a2a68';
      c.fillText(T('title2'), TITLE_CX, ty + ex);
    }
    c.strokeStyle = PAL.gold;
    c.lineWidth = 4;
    c.strokeText(T('title2'), TITLE_CX, ty);
    var tg = c.createLinearGradient(0, ty - 28, 0, ty + 26);
    tg.addColorStop(0, '#ffb3dc');
    tg.addColorStop(0.45, '#ff6fb0');
    tg.addColorStop(0.5, PAL.pinkDeep);
    tg.addColorStop(1, '#c23a82');
    c.fillStyle = tg;
    c.fillText(T('title2'), TITLE_CX, ty);
    /* a glossy upper half on the face of the letters */
    c.save();
    c.beginPath(); c.rect(TITLE_CX - 260, ty - 40, 520, 36); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.fillText(T('title2'), TITLE_CX, ty);
    c.restore();
    /* a gleam sweeping across the letters every few seconds */
    c.save();
    c.globalCompositeOperation = 'lighter';
    var sweep = ((t % 260) / 260) * 520 - 260;
    var sg = c.createLinearGradient(TITLE_CX + sweep - 40, 0, TITLE_CX + sweep + 40, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sg;
    c.fillText(T('title2'), TITLE_CX, 172 + bob);
    c.restore();
    /* sparkles orbiting the lettering */
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (var sk = 0; sk < 9; sk++) {
      var sa = t / 70 + sk * 0.7, sr = 1 + Math.sin(t / 9 + sk * 1.3);
      if (sr <= 0.4) continue;
      var skx = TITLE_CX + Math.cos(sa) * (190 + Math.sin(sk) * 30), sky = ty + Math.sin(sa * 1.3) * 42;
      c.globalAlpha = (sr - 0.4) * 0.8;
      c.fillStyle = sk % 2 ? '#fff6c8' : '#ffffff';
      E.star(c, skx, sky, 1.5 + sr * 2.6);
    }
    c.restore();
    c.font = 'bold 15px ' + FONT;
    var sw = c.measureText(T('titleSubtitle')).width + 30;
    c.fillStyle = 'rgba(255, 246, 236, 0.9)';
    E.roundRect(c, TITLE_CX - sw / 2, 208 + bob, sw, 26, 13);
    c.fill();
    c.fillStyle = PAL.purple;
    c.fillText(T('titleSubtitle'), TITLE_CX, 222 + bob);
    c.restore();
    c.restore();

    if (confirmReset) { drawResetConfirm(c); return; }
    if (showInstructions) { drawInstructionsOverlay(c); drawVersionStamp(c); return; }

    /* the menu sits on a pane of frosted glass */
    frostPanel(c, TITLE_CX - 118, 236, 236, 180, 18, 'rgba(255, 246, 250, 0.42)');
    button(c, TITLE_BTN.play, T('play'), { font: 22, fill: PAL.sun, r: 12 });
    button(c, TITLE_BTN.how, T('howToPlay'), { font: 15 });
    button(c, TITLE_BTN.lang, T('language') + ': ' + T('langLabel'), { font: 14 });
    button(c, TITLE_BTN.sound, Game.audio.isMuted() ? T('soundOff') : T('soundOn'), { font: 14 });
    if (hasSave()) button(c, TITLE_BTN.reset, T('startOver'), { font: 12, fill: 'rgba(255,246,236,0.7)' });
    if (Game.progress && Game.progress.stars > 0) drawStarBadge(c, 14, 46, Game.progress.stars, T('hudStars'));
    drawPetals(c, true, false);
    drawVersionStamp(c);
  }

  function drawInstructionsOverlay(c) {
    pointerOver(c, 0, 0, W, H);
    c.fillStyle = 'rgba(43, 21, 48, 0.72)';
    c.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    panel(c, 100, 80, 600, 320, PAL.cream);
    c.fillStyle = PAL.ink;
    c.font = 'bold 20px ' + FONT;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(T('howToPlay'), W / 2, 112);
    c.font = '15px ' + FONT;
    multiline(c, T('instructions'), W / 2, 160, 24);
    c.font = '13px ' + FONT;
    c.fillStyle = 'rgba(74,42,64,0.7)';
    c.fillText(T('closeHint'), W / 2, 374);
  }

  function drawResetConfirm(c) {
    c.fillStyle = 'rgba(43, 21, 48, 0.72)';
    c.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    panel(c, 200, 190, 400, 180, PAL.cream);
    c.fillStyle = PAL.ink;
    c.font = 'bold 16px ' + FONT;
    multiline(c, T('startOverConfirm'), W / 2, 236, 24);
    button(c, RESET_YES, T('yes'), { fill: '#e88a7a' });
    button(c, RESET_NO, T('no'));
  }

  function hasSave() {
    if (Game.progress && (Game.progress.solved > 0 || Game.progress.missed > 0)) return true;
    return JSON.stringify(Game.look) !== JSON.stringify(Game.DEFAULT_LOOK);
  }

  function handleTitleClick(mx, my) {
    if (confirmReset) {
      if (hit(RESET_YES, mx, my)) { confirmReset = false; return 'reset'; }
      if (hit(RESET_NO, mx, my)) { confirmReset = false; return null; }
      return null;
    }
    if (showInstructions) { showInstructions = false; return null; }
    if (hit(TITLE_BTN.play, mx, my)) return 'play';
    if (hit(TITLE_BTN.how, mx, my)) { showInstructions = true; return 'select'; }
    if (hit(TITLE_BTN.lang, mx, my)) return 'lang';
    if (hit(TITLE_BTN.sound, mx, my)) return 'sound';
    if (hasSave() && hit(TITLE_BTN.reset, mx, my)) { confirmReset = true; return 'select'; }
    return null;
  }

  /* ================================================================
     Intro
     ================================================================ */
  var INTRO = {
    panel: { x: 24, y: 22, w: 462, h: 380 },
    pic: { x: 504, y: 22, w: 272, h: 436 },
    textW: 418,
  };
  var INTRO_BTN = { x: 164, y: 410, w: 180, h: 46 };

  function drawIntroScreen(c) {
    t++;
    Game.studio.drawBackdrop(c, 0, t, TITLE_GROUND, 0, true);
    drawDusk(c, 0.6);
    /* saved, so the bloom, grade and vignette drawn after this screen
       cover the whole bezel instead of stopping at the game window */
    c.save();
    clipGame(c);

    /* picture: Momoko in the studio doorway, looking at a dress rack */
    var R = INTRO.pic;
    c.fillStyle = 'rgba(74, 42, 64, 0.16)';
    E.roundRect(c, R.x, R.y + 4, R.w, R.h, 12);
    c.fill();
    c.save();
    E.roundRect(c, R.x, R.y, R.w, R.h, 12);
    c.clip();
    var gy = R.y + R.h - 60;
    /* the real studio wall and floor, framed: the picture is a window
       onto the room she is about to walk into */
    c.save();
    c.translate(0, gy - TITLE_GROUND);
    Game.studio.drawWall(c, 1290, TITLE_GROUND);
    Game.studio.drawFloor(c, 1290, TITLE_GROUND);
    c.restore();
    var ao = c.createLinearGradient(0, gy - 2, 0, gy + 30);
    ao.addColorStop(0, 'rgba(50, 20, 60, 0.4)'); ao.addColorStop(1, 'rgba(50, 20, 60, 0)');
    c.fillStyle = ao; c.fillRect(R.x, gy - 2, R.w, 32);
    /* a warm pool of light on her from above */
    c.save();
    c.globalCompositeOperation = 'lighter';
    var lp = c.createRadialGradient(R.x + 70, gy - 90, 10, R.x + 70, gy - 90, 150);
    lp.addColorStop(0, 'rgba(255, 236, 200, 0.32)'); lp.addColorStop(1, 'rgba(255, 236, 200, 0)');
    c.fillStyle = lp; c.fillRect(R.x, R.y, R.w, R.h);
    c.restore();
    /* the dress rack booth, moved from its world position into the frame */
    var rack = Game.STATIONS[6];
    c.save();
    c.translate(R.x + 186 - rack.x, 0);
    Game.studio.drawStation(c, rack, gy + 2, t, true);
    c.restore();
    E.drawReflection(c, R.x + 60, gy + 14, Game.look, 0, 1, 1.5, 0.18, 30, 'rgba(233,184,201,1)');
    E.drawCharacter(c, R.x + 60, gy + 14, Game.look, 0, 1, 1.5, (t % 200) < 8, 0, { t: t });
    /* a thought bubble with a sparkly dress */
    var bob = Math.sin(t / 30) * 2;
    E.fillEllipse(c, R.x + 84, gy - 96 + bob, 4, 4, '#ffffff');
    E.fillEllipse(c, R.x + 92, gy - 118 + bob, 6, 6, '#ffffff');
    E.fillEllipse(c, R.x + 104, gy - 168 + bob, 42, 34, '#ffffff');
    var dream = JSON.parse(JSON.stringify(Game.look));
    dream.dress = 'princess'; dream.dressColor = PAL.pink; dream.hat = 'tiara'; dream.shoes = 'maryJane';
    E.drawLookTile(c, R.x + 104, gy - 168 + bob, 56, dream, 'dress', { round: true, bg: false });
    c.restore();
    E.roundRect(c, R.x, R.y, R.w, R.h, 12);
    E.ink(c, 2);

    var P = INTRO.panel;
    c.fillStyle = 'rgba(74, 42, 64, 0.16)';
    E.roundRect(c, P.x, P.y + 4, P.w, P.h, 12);
    c.fill();
    panel(c, P.x, P.y, P.w, P.h, 'rgba(255, 248, 243, 0.97)');
    c.fillStyle = 'rgba(255, 143, 192, 0.3)';
    E.roundRect(c, P.x + 6, P.y + 6, P.w - 12, 46, 8);
    c.fill();
    var cx = P.x + P.w / 2;
    c.fillStyle = PAL.pinkDeep;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitFont(c, T('introTitle'), P.w - 40, 24, 'bold', 16);
    c.fillText(T('introTitle'), cx, P.y + 30);

    c.fillStyle = PAL.ink;
    c.font = '14px ' + FONT;
    var paras = T('introText').split('\n\n');
    var lines = [];
    for (var i = 0; i < paras.length; i++) {
      var pl = paras[i].split('\n');
      for (var q = 0; q < pl.length; q++) {
        if (c.measureText(pl[q]).width > INTRO.textW) {
          pl = layoutLines(c, paras[i].replace(/([、。])\n/g, '$1').replace(/\n/g, ' '), INTRO.textW);
          break;
        }
      }
      if (i > 0) lines.push(null);
      lines = lines.concat(pl);
    }
    var top = P.y + 66, bottom = P.y + P.h - 16;
    var lh = 21, gap = 10, total = 0, k;
    for (k = 0; k < lines.length; k++) total += lines[k] === null ? gap : lh;
    if (total > bottom - top) { lh = 18; gap = 6; total = 0; for (k = 0; k < lines.length; k++) total += lines[k] === null ? gap : lh; }
    var y = top + Math.max(0, (bottom - top - total) / 2) + lh / 2;
    for (k = 0; k < lines.length; k++) {
      if (lines[k] === null) { y += gap; continue; }
      c.fillText(lines[k], cx, y);
      y += lh;
    }
    button(c, INTRO_BTN, T('continueBtn'), { fill: PAL.sun, font: 16 });
    c.restore();
  }

  function handleIntroClick(mx, my) {
    if (hit(INTRO_BTN, mx, my)) return 'continue';
    return null;
  }

  /* ================================================================
     Wardrobe panel (one station at a time)
     ================================================================ */
  var WARD = {
    previewX: 22, previewY: 58, previewW: 252, previewH: 318,
    gridX: 292, gridY: 58, cellW: 92, cellH: 98, cols: 5, rows: 2, gap: 6,
    pageY: 266, prev: { x: 292, y: 266, w: 100, h: 36 }, next: { x: 676, y: 266, w: 100, h: 36 },
    chipY: 322, chipH: 70, patX: 617, patW: 53,
    done: { x: 48, y: 392, w: 200, h: 50 },
  };
  var PER_PAGE = WARD.cols * WARD.rows;
  var ward = { station: null, particles: [], flash: 0, page: 0, pageAnim: 0 };
  function wardPages(st) { return Math.max(1, Math.ceil(st.variants.length / PER_PAGE)); }

  /* cell i of the current page */
  function wardCell(i) {
    var col = i % WARD.cols, row = Math.floor(i / WARD.cols);
    return {
      x: WARD.gridX + col * (WARD.cellW + WARD.gap),
      y: WARD.gridY + row * (WARD.cellH + WARD.gap),
      w: WARD.cellW, h: WARD.cellH,
    };
  }
  /* Colour chips sit in two rows under the grid, as wide as the row
     allows; a station with prints shares the row with them, and one with
     nothing but colours (skin) spreads big chips over the grid's place. */
  function colourCell(st, i) {
    var n = st.colors.length, cols, pw, ph = WARD.chipH, x0 = WARD.gridX, y0 = WARD.chipY;
    if (!st.variants.length) { cols = 5; pw = 96; ph = 96; x0 = 294; y0 = 112; }
    else if (st.patternField) { cols = 6; pw = 53; }
    else { cols = Math.ceil(n / 2); pw = Math.min(80, Math.floor(484 / cols)); }
    return { x: x0 + (i % cols) * pw, y: y0 + Math.floor(i / cols) * ph, w: pw, h: ph };
  }
  function patternCell(i) {
    return { x: WARD.patX + (i % 3) * WARD.patW, y: WARD.chipY + Math.floor(i / 3) * WARD.chipH, w: WARD.patW, h: WARD.chipH };
  }

  function getStation(id) {
    for (var i = 0; i < Game.STATIONS.length; i++) if (Game.STATIONS[i].id === id) return Game.STATIONS[i];
    return null;
  }

  function openWardrobe(stationId) {
    ward.station = getStation(stationId);
    ward.particles = [];
    ward.flash = 0;
    /* open on the page holding what she has on */
    var st = ward.station, idx = st && st.field ? st.variants.indexOf(Game.look[st.field]) : -1;
    ward.page = idx > 0 ? Math.floor(idx / PER_PAGE) : 0;
    ward.pageAnim = 0;
  }
  function turnPage(d) {
    var n = wardPages(ward.station);
    ward.page = (ward.page + d + n) % n;
    ward.pageAnim = d;
    Game.audio.play('wear');
  }

  function cloneLook(l) { return JSON.parse(JSON.stringify(l)); }

  /* Preview pacing, shared by every Momoko game: a pick sets off a cute
     reaction for PREVIEW_REACT s, then she settles nearly still so the
     outfit is easy to see, with one short moment (PREVIEW_MOMENT s) every
     PREVIEW_GAP_MIN..PREVIEW_GAP_MAX s. `calm` eases toward 1 while
     settled and 0 during a reaction or moment (time constant PREVIEW_EASE)
     and damps her idle head motion by up to PREVIEW_DAMP. */
  var PREVIEW_REACT = 2, PREVIEW_MOMENT = 1.2, PREVIEW_GAP_MIN = 6, PREVIEW_GAP_MAX = 12;
  var PREVIEW_EASE = 0.3, PREVIEW_DAMP = 0.85;
  var pace = { act: '', age: 0, len: 0, gap: 0, calm: 1 };
  function pickOf(list) { return list[Math.floor(Math.random() * list.length)]; }
  function previewAct(kind, len) {
    pace.act = kind; pace.age = 0; pace.len = len;
    var A = preview.anim;
    if (kind === 'bounce' || kind === 'look') { A.fidget = kind; A.fidgetK = 0; A.fidgetDur = len; }
  }
  function previewPick() { if (preview.anim) previewAct(pickOf(['strut', 'wave', 'twirl']), PREVIEW_REACT); }

  /* The preview's animator, stepped once a frame by the real frame time
     (so a 120 Hz screen neither doubles its speed nor repeats frames).
     On the turntable she struts, waves, poses and turns only for the
     reactions and moments above; otherwise she stands and breathes. */
  var preview = { anim: null, last: 0, x: 0 };
  /* stations whose items are small enough to want a close-up */
  var LENS = { eyes: 1, nose: 1, mouth: 1, ears: 1, shoes: 1, hat: 1, bag: 1, extra: 1 };
  function stepPreview() {
    var now = performance.now();
    var fresh = !preview.anim || now - preview.last > 500;
    if (!preview.anim) {
      preview.anim = new E.Animator('run');
      preview.anim.state = function () {
        var S = E.Animator.prototype.state.call(this);
        S.headTilt *= 1 - PREVIEW_DAMP * pace.calm;
        return S;
      };
    }
    var dt = fresh ? 1 / 60 : Math.min(0.05, Math.max(0.001, (now - preview.last) / 1000));
    preview.last = now;
    if (fresh) previewPick();                              /* she says hello */
    var A = preview.anim, a = pace.act, u = pace.age;
    var walking = a === 'strut' && u < 1.1;
    var facing = (a === 'twirl' && u < 0.6) || (a === 'turn' && u < 0.6) ? -1 : 1;
    var pose = a === 'wave' && u < pace.len - 0.3 ? 'wave' :
      (a === 'pose' && u < 1) || (a === 'strut' && u >= 1.25 && u < 1.9) || (a === 'twirl' && u >= 0.9 && u < 1.8) ? 'pose' : 'walk';
    if (walking) preview.x += 270 * dt;
    if (!a) A.fidgetT = 99;                                /* fidgets are ours to start */
    A.step(dt, preview.x, walking, facing, 3.2, pose);
    pace.calm += ((a ? 0 : 1) - pace.calm) * (1 - Math.exp(-dt / PREVIEW_EASE));
    if (a) {
      pace.age += dt;
      if (pace.age >= pace.len) { pace.act = ''; pace.gap = PREVIEW_GAP_MIN + Math.random() * (PREVIEW_GAP_MAX - PREVIEW_GAP_MIN); }
    } else if ((pace.gap -= dt) <= 0) {
      previewAct(pickOf(['wave', 'pose', 'turn', 'bounce', 'look']), PREVIEW_MOMENT);
    }
    return A;
  }

  /* The puzzle was paid at the station door, so a tap simply puts the
     thing on. */
  function applyChange(field, value) {
    var st = ward.station;
    var look = Game.look;
    if (look[field] === value) {
      showToast(T('wardAlready'), 90);
      Game.audio.play('deny');
      return;
    }
    look[field] = value;
    /* A colour or print picked while nothing is worn here also puts on the first
       real item, otherwise the tap would buy an invisible change. */
    if ((field === st.colorField || field === st.patternField) && st.field && look[st.field] === 'none' && st.variants.length > 1) {
      look[st.field] = st.variants[1];
    }
    Game.audio.play('wear');
    previewPick();
    ward.flash = 30;
    var cx = WARD.previewX + WARD.previewW / 2, cy = WARD.previewY + WARD.previewH - 120;
    E.spawnBurst(ward.particles, cx, cy, 26, [PAL.sun, PAL.pink, '#ffffff', PAL.mint, PAL.lavender], 4, 'star');
    E.spawnBurst(ward.particles, cx, cy, 8, [PAL.pink, PAL.coral], 3, 'heart');
    if (Game.engine && Game.engine.save) Game.engine.save();
  }

  /* One wardrobe tile: a card with a station-tinted stage and a
     spotlight, the real renderer's crop of her wearing the item, a
     label strip, and for the chosen one a gold frame, a soft pulse and
     a tick. */
  function drawVariantTile(c, r, st, vid, sel, hot, look) {
    var lift = sel ? -2 : hot ? -1 : 0;
    var x = r.x, y = r.y + lift, w = r.w, h = r.h;
    c.save();
    if (sel) {
      var pulse = 0.45 + Math.sin(t / 14) * 0.15;
      var glow = c.createRadialGradient(x + w / 2, y + h / 2, 10, x + w / 2, y + h / 2, w * 0.85);
      glow.addColorStop(0, 'rgba(255, 210, 74, ' + pulse + ')');
      glow.addColorStop(1, 'rgba(255, 210, 74, 0)');
      c.fillStyle = glow;
      c.fillRect(x - 30, y - 30, w + 60, h + 60);
    }
    /* drop shadow, card, stage */
    c.fillStyle = 'rgba(74, 42, 64, ' + (sel ? 0.24 : 0.16) + ')';
    E.roundRect(c, x + 1, y + 4 - lift, w, h, 12);
    c.fill();
    var cg = c.createLinearGradient(0, y, 0, y + h);
    cg.addColorStop(0, sel ? '#fff7d6' : '#ffffff');
    cg.addColorStop(1, sel ? '#ffe08a' : (hot ? '#fff4f8' : '#fbeef4'));
    c.fillStyle = cg;
    E.roundRect(c, x, y, w, h, 12);
    c.fill();
    var sx = x + 6, sy = y + 6, sw = w - 12, sh = h - 36;
    c.save();
    E.roundRect(c, sx, sy, sw, sh, 9);
    c.clip();
    var sg = c.createLinearGradient(0, sy, 0, sy + sh);
    sg.addColorStop(0, E.mix(st.hue, '#ffffff', 0.82));
    sg.addColorStop(1, E.mix(st.hue, '#ffffff', 0.55));
    c.fillStyle = sg;
    c.fillRect(sx, sy, sw, sh);
    var sp = c.createRadialGradient(x + w / 2, sy + sh * 0.35, 4, x + w / 2, sy + sh * 0.35, sw * 0.62);
    sp.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    sp.addColorStop(1, 'rgba(255, 255, 255, 0)');
    c.fillStyle = sp;
    c.fillRect(sx, sy, sw, sh);
    /* a soft pool of shadow for the item to sit over */
    E.fillEllipse(c, x + w / 2, sy + sh - 4, sw * 0.4, 5, 'rgba(120, 50, 100, 0.1)', false);
    /* taking something off: she is shown without it, faint, under a
       plain "none" sign */
    if (vid === 'none') c.globalAlpha = 0.4;
    E.drawLookTile(c, x + w / 2, sy + sh / 2, Math.min(sw, sh + 8) + 4, tileLookFor(st, vid, look), st.id, { bg: false, zoom: true });
    c.globalAlpha = 1;
    if (vid === 'none') {
      var nx = x + w / 2, ny = sy + sh / 2;
      c.lineCap = 'round';
      c.beginPath(); c.arc(nx, ny, 15, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255, 255, 255, 0.55)'; c.fill();
      c.strokeStyle = '#b8455a'; c.lineWidth = 6.4; c.stroke();
      c.beginPath(); c.moveTo(nx - 10.4, ny + 10.4); c.lineTo(nx + 10.4, ny - 10.4); c.stroke();
      c.beginPath(); c.arc(nx, ny, 15, 0, Math.PI * 2);
      c.strokeStyle = PAL.coral; c.lineWidth = 4; c.stroke();
      c.beginPath(); c.moveTo(nx - 10.4, ny + 10.4); c.lineTo(nx + 10.4, ny - 10.4); c.stroke();
    }
    /* the stage's inner shadow */
    var ig = c.createLinearGradient(0, sy, 0, sy + 10);
    ig.addColorStop(0, 'rgba(74, 42, 64, 0.16)');
    ig.addColorStop(1, 'rgba(74, 42, 64, 0)');
    c.fillStyle = ig;
    c.fillRect(sx, sy, sw, 10);
    c.restore();
    E.roundRect(c, sx, sy, sw, sh, 9);
    c.strokeStyle = 'rgba(74, 42, 64, 0.18)';
    c.lineWidth = 1;
    c.stroke();
    /* gloss over the top of the card */
    c.save();
    E.roundRect(c, x, y, w, h, 12); c.clip();
    var gl = c.createLinearGradient(0, y, 0, y + h * 0.4);
    gl.addColorStop(0, 'rgba(255,255,255,0.45)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gl;
    c.fillRect(x, y, w, h * 0.4);
    c.restore();
    /* frame */
    E.roundRect(c, x, y, w, h, 12);
    if (sel) {
      c.strokeStyle = '#b8801a'; c.lineWidth = 4; c.stroke();
      E.roundRect(c, x, y, w, h, 12);
      c.strokeStyle = PAL.sun; c.lineWidth = 2; c.stroke();
      E.roundRect(c, x + 3, y + 3, w - 6, h - 6, 10);
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1; c.stroke();
    } else {
      c.strokeStyle = hot ? E.shade(st.hue, -30) : 'rgba(74, 42, 64, 0.45)';
      c.lineWidth = hot ? 2.2 : 1.4;
      c.stroke();
    }
    if (sel) {
      var bx = x + w - 12, by = y + 12;
      E.fillEllipse(c, bx, by + 1, 10, 10, 'rgba(43,21,48,0.25)', false);
      E.fillEllipse(c, bx, by, 10, 10, PAL.teal);
      c.strokeStyle = PAL.cream; c.lineWidth = 2.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(bx - 4.5, by); c.lineTo(bx - 1, by + 3.8); c.lineTo(bx + 5, by - 3.8); c.stroke();
      /* a twinkle that drifts round the frame */
      var ta = t / 40, tx = x + w / 2 + Math.cos(ta) * w * 0.48, ty = y + h / 2 + Math.sin(ta) * h * 0.48;
      c.fillStyle = '#ffffff';
      E.star(c, tx, ty, 3.4);
    }
    /* label: one line if it fits, otherwise broken at a space into two */
    c.fillStyle = sel ? '#5a3a10' : PAL.ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    var lines = tileLabel(c, T(st.labelPrefix + vid), w - 8);
    if (lines.length === 1) c.fillText(lines[0], x + w / 2, y + h - 15);
    else { c.fillText(lines[0], x + w / 2, y + h - 21.5); c.fillText(lines[1], x + w / 2, y + h - 9); }
    c.restore();
  }
  /* Sets the font and returns the label as one or two lines: a long
     name wraps at a space instead of shrinking. */
  var labelMemo = {};
  function tileLabel(c, lbl, maxW) {
    c.font = 'bold 12px ' + FONT;
    var lines = labelMemo[lbl];
    if (!lines) {
      if (c.measureText(lbl).width <= maxW || lbl.indexOf(' ') < 0) lines = [lbl];
      else {
        /* break at the space nearest the middle */
        var best = -1, mid = lbl.length / 2, i;
        for (i = 0; i < lbl.length; i++) if (lbl.charAt(i) === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
        lines = [lbl.slice(0, best), lbl.slice(best + 1)];
      }
      labelMemo[lbl] = lines;
    }
    return lines;
  }
  /* The look a tile or the close-up shows: hers, with this one thing
     changed and anything that would hide it taken off. */
  function tileLookFor(st, vid, look) {
    var l = cloneLook(look);
    l[st.field] = vid;
    if (st.id === 'hair' || st.id === 'ears' || st.id === 'extra' || st.id === 'bag') l.hat = 'none';
    if ((st.id === 'eyes' || st.id === 'nose') && /lasses$/.test(look.accessory)) l.accessory = 'none';
    if (st.id === 'hair' || st.id === 'hat' || st.id === 'bag' || st.id === 'ears') l.accessory = 'none';
    if (st.id === 'hat' || st.id === 'extra') l.bag = 'none';
    if (st.id === 'dress' || st.id === 'pants' || st.id === 'jacket' || st.id === 'shoes') { l.bag = 'none'; l.accessory = 'none'; }
    /* a dress would cover the trousers on offer, a coat the dress */
    if (st.id === 'pants') { l.dress = 'none'; l.jacket = 'none'; }
    if (st.id === 'dress') l.jacket = 'none';
    if (st.id === 'extra' && l.jacket === 'poncho' && /^(necklace|pearls|locket|bowTie|flowerLei)$/.test(vid)) l.jacket = 'none';
    return l;
  }

  /* Page arrows and dots under the grid, when a station has more than
     one page of things. */
  function drawPager(c, st, pages) {
    var arrows = [[WARD.prev, -1], [WARD.next, 1]];
    for (var i = 0; i < 2; i++) {
      var b = arrows[i][0], d = arrows[i][1];
      var hot = pointerOver(c, b.x, b.y, b.w, b.h);
      c.fillStyle = 'rgba(74, 42, 64, 0.2)';
      E.roundRect(c, b.x, b.y + 3, b.w, b.h, 18); c.fill();
      var g = c.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, hot ? '#ffffff' : '#fff6fb');
      g.addColorStop(1, E.mix(st.hue, '#ffffff', hot ? 0.35 : 0.55));
      c.fillStyle = g;
      E.roundRect(c, b.x, b.y, b.w, b.h, 18); c.fill();
      c.strokeStyle = E.shade(st.hue, -35); c.lineWidth = 1.6;
      E.roundRect(c, b.x, b.y, b.w, b.h, 18); c.stroke();
      var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      c.fillStyle = E.shade(st.hue, -45);
      c.beginPath();
      c.moveTo(cx + d * 10, cy); c.lineTo(cx - d * 6, cy - 10); c.lineTo(cx - d * 6, cy + 10); c.closePath();
      c.fill();
    }
    var dx0 = 534 - (pages - 1) * 11;
    for (var p = 0; p < pages; p++) {
      var on = p === ward.page;
      E.fillEllipse(c, dx0 + p * 22, WARD.pageY + 27, on ? 6 : 4.5, on ? 6 : 4.5, on ? E.shade(st.hue, -20) : 'rgba(74,42,64,0.25)', false);
    }
    c.fillStyle = 'rgba(74,42,64,0.75)';
    c.font = 'bold 13px ' + FONT;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText((ward.page + 1) + ' / ' + pages, 534, WARD.pageY + 10);
  }

  function drawWardrobe(c) {
    t++;
    var st = ward.station;
    if (!st) return;
    var look = Game.look;
    Game.studio.drawBackdrop(c, st.x - W / 2, t, TITLE_GROUND, 0, true);
    drawDusk(c, 0.55);
    c.save();
    clipGame(c);

    /* the room softens behind a frosted board so the tiles read cleanly */
    frostPanel(c, 284, 50, 500, 420, 14, 'rgba(255, 250, 253, 0.56)', 8);

    /* header: the station's own sign colours */
    ribbon(c, 14, 10, 262, 38, 12, st.hue, 2);
    c.fillStyle = PAL.ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitFont(c, T(st.labelKey), 236, 20, 'bold', 12);
    c.fillText(T(st.labelKey), 145, 30);

    /* Preview: a big Momoko on a stage with a mirror and spotlight. */
    var PX = WARD.previewX, PY = WARD.previewY, PW = WARD.previewW, PH = WARD.previewH;
    c.fillStyle = 'rgba(74, 42, 64, 0.16)';
    E.roundRect(c, PX, PY + 4, PW, PH, 10);
    c.fill();
    panel(c, PX, PY, PW, PH, '#fde8f1');
    c.save();
    E.roundRect(c, PX + 2, PY + 2, PW - 4, PH - 4, 9);
    c.clip();
    var g = c.createLinearGradient(0, PY, 0, PY + PH);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ffd6e8');
    c.fillStyle = g; c.fillRect(PX, PY, PW, PH);
    /* curtain swags */
    E.fillRound(c, PX - 10, PY - 10, 40, PH + 20, 12, PAL.pink);
    E.fillRound(c, PX + PW - 30, PY - 10, 40, PH + 20, 12, PAL.pink);
    /* the drapes hang in folds: a lit ridge and a deep valley, twice */
    for (var cs = 0; cs < 2; cs++) {
      var cx0 = cs ? PX + PW - 28 : PX, cg = c.createLinearGradient(cx0, 0, cx0 + 28, 0);
      cg.addColorStop(0, 'rgba(120, 20, 90, 0.3)');
      cg.addColorStop(0.22, 'rgba(255, 255, 255, 0.34)');
      cg.addColorStop(0.5, 'rgba(120, 20, 90, 0.26)');
      cg.addColorStop(0.76, 'rgba(255, 255, 255, 0.3)');
      cg.addColorStop(1, 'rgba(120, 20, 90, 0.3)');
      c.fillStyle = cg;
      c.fillRect(cx0, PY, 28, PH);
    }
    var pgy = PY + PH - 54;
    var fg2 = c.createLinearGradient(0, pgy, 0, pgy + 54);
    fg2.addColorStop(0, '#d79ab2');
    fg2.addColorStop(0.25, PAL.floor);
    fg2.addColorStop(1, '#f6cfdc');
    c.fillStyle = fg2; c.fillRect(PX, pgy, PW, 60);
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(PX, pgy, PW, 3);
    var pcx = PX + PW / 2;
    var pcy = PY + PH - 36;
    /* a tall gold mirror behind her */
    E.fillEllipse(c, pcx, pgy - 112, 86, 128, PAL.gold);
    c.save();
    c.beginPath(); c.ellipse(pcx, pgy - 112, 78, 120, 0, 0, Math.PI * 2); c.clip();
    var mg = c.createLinearGradient(pcx - 78, pgy - 232, pcx + 78, pgy + 8);
    mg.addColorStop(0, '#f3fbff'); mg.addColorStop(0.5, '#d8edf8'); mg.addColorStop(1, '#f3fbff');
    c.fillStyle = mg; c.fillRect(pcx - 80, pgy - 240, 160, 250);
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 8;
    c.beginPath(); c.moveTo(pcx - 50, pgy - 30); c.lineTo(pcx + 30, pgy - 200); c.stroke();
    c.restore();
    c.beginPath(); c.ellipse(pcx, pgy - 112, 78, 120, 0, 0, Math.PI * 2); E.ink(c, 2);
    /* vanity bulbs round the frame, each with a warm halo, twinkling in turn */
    for (var gi = 0; gi < 14; gi++) {
      var ga = gi * Math.PI / 7;
      var bx = pcx + Math.cos(ga) * 85, by = pgy - 112 + Math.sin(ga) * 127;
      var on = 0.7 + Math.sin(t / 10 + gi * 0.9) * 0.3;
      c.save();
      c.globalCompositeOperation = 'lighter';
      var bg2 = c.createRadialGradient(bx, by, 1, bx, by, 16);
      bg2.addColorStop(0, 'rgba(255, 236, 190, ' + (0.55 * on) + ')');
      bg2.addColorStop(1, 'rgba(255, 236, 190, 0)');
      c.fillStyle = bg2;
      c.fillRect(bx - 16, by - 16, 32, 32);
      c.restore();
      E.fillEllipse(c, bx, by, 4.2, 4.2, PAL.gold, false);
      E.fillEllipse(c, bx, by, 3, 3, on > 0.85 ? '#fffbe6' : '#ffe9a8', false);
      E.fillEllipse(c, bx - 1, by - 1.2, 1, 0.8, '#ffffff', false);
    }
    /* a turntable under her feet, slowly spinning */
    var ty2 = pcy + 2;
    E.softShadow(c, pcx, ty2 + 8, 80, 16, 0.22);
    E.fillEllipse(c, pcx, ty2 + 6, 76, 15, E.shade(PAL.pinkDeep, -18));
    E.fillEllipse(c, pcx, ty2, 76, 15, PAL.pink);
    E.fillEllipse(c, pcx, ty2, 64, 11, '#ffd1e4', false);
    c.save();
    c.beginPath(); c.ellipse(pcx, ty2, 64, 11, 0, 0, Math.PI * 2); c.clip();
    c.globalAlpha = 0.5;
    c.strokeStyle = '#ffffff'; c.lineWidth = 3;
    var spin = t / 80;
    for (var sp2 = 0; sp2 < 3; sp2++) {
      var sa = spin + sp2 * 2.09;
      c.beginPath(); c.moveTo(pcx, ty2); c.lineTo(pcx + Math.cos(sa) * 70, ty2 + Math.sin(sa) * 12); c.stroke();
    }
    c.restore();
    c.beginPath(); c.ellipse(pcx, ty2, 76, 15, 0, 0, Math.PI * 2);
    c.strokeStyle = PAL.gold; c.lineWidth = 2.5; c.stroke();
    /* spotlights from the top corners */
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (var sd = -1; sd <= 1; sd += 2) {
      var bg = c.createLinearGradient(0, PY, 0, pgy);
      bg.addColorStop(0, 'rgba(255,245,210,0.35)');
      bg.addColorStop(1, 'rgba(255,245,210,0)');
      c.fillStyle = bg;
      c.beginPath();
      c.moveTo(pcx + sd * (PW / 2 - 20), PY);
      c.lineTo(pcx + sd * (PW / 2 - 6), PY);
      c.lineTo(pcx + sd * 10, pgy);
      c.lineTo(pcx - sd * 60, pgy);
      c.closePath(); c.fill();
    }
    c.restore();
    var spot = c.createRadialGradient(pcx, pcy - 90, 10, pcx, pcy - 90, 130);
    spot.addColorStop(0, 'rgba(255, 250, 220, 0.5)');
    spot.addColorStop(1, 'rgba(255, 250, 220, 0)');
    c.fillStyle = spot;
    c.fillRect(PX, PY, PW, PH);
    /* the preview booth is darker toward its edges so she is the bright thing in it */
    var pv = c.createRadialGradient(pcx, pcy - 110, 60, pcx, pcy - 110, 230);
    pv.addColorStop(0, 'rgba(120, 50, 110, 0)');
    pv.addColorStop(1, 'rgba(120, 50, 110, 0.28)');
    c.fillStyle = pv;
    c.fillRect(PX, PY, PW, PH);
    /* on the turntable she struts in place, stops, looks about and
       turns: the same animator as in the studio, fed a treadmill */
    var pa = stepPreview();
    /* her reflection lives on the glossy disc of the turntable */
    c.save();
    c.beginPath(); c.ellipse(pcx, pcy + 2, 64, 11, 0, 0, Math.PI * 2); c.clip();
    E.drawReflection(c, pcx, pcy, look, 0, 1, 3.2, 0.26, 16, null, { anim: pa });
    c.restore();
    E.softShadow(c, pcx, pcy + 1, 54, 9, 0.3);
    E.drawCharacter(c, pcx, pcy, look, 0, 1, 3.2, false, 0, { t: t, anim: pa });
    if (ward.flash > 0) {
      ward.flash--;
      c.save(); c.globalAlpha = ward.flash / 30 * 0.6; c.fillStyle = '#ffffff'; c.fillRect(PX, PY, PW, PH); c.restore();
    }
    for (var p = ward.particles.length - 1; p >= 0; p--) {
      ward.particles[p].update();
      ward.particles[p].draw(c);
      if (ward.particles[p].life <= 0) ward.particles.splice(p, 1);
    }
    c.restore();
    /* star badge sits on the preview's top edge */
    drawStarBadge(c, PX + 8, PY - 14, Game.progress.stars, '');
    /* a close-up of the small things, in a hand mirror down in the corner */
    if (LENS[st.id] && look[st.field] !== 'none') {
      var lx = PX + PW - 44, ly = PY + PH - 46, lr = 37;
      E.softShadow(c, lx + 1, ly + 4, lr + 8, lr + 8, 0.3);
      E.fillEllipse(c, lx, ly, lr + 5, lr + 5, PAL.gold);
      E.drawLookTile(c, lx, ly, lr * 2, tileLookFor(st, look[st.field], look), st.id, { round: true, zoom: true, bgTop: '#ffffff', bgBot: E.mix(st.hue, '#ffffff', 0.6) });
      c.beginPath(); c.arc(lx, ly, lr, 0, Math.PI * 2);
      c.strokeStyle = '#b8801a'; c.lineWidth = 1.6; c.stroke();
      c.beginPath(); c.arc(lx, ly, lr + 3, Math.PI * 1.1, Math.PI * 1.5);
      c.strokeStyle = 'rgba(255, 255, 255, 0.8)'; c.lineWidth = 1.6; c.lineCap = 'round'; c.stroke();
    }

    /* variant grid: rendered previews on little lit stages, a page at a time */
    var sel;
    if (st.variants.length) {
      var pages = wardPages(st), first = ward.page * PER_PAGE;
      ward.pageAnim *= 0.8;
      if (Math.abs(ward.pageAnim) < 0.01) ward.pageAnim = 0;
      c.save();
      c.translate(ward.pageAnim * 40, 0);
      c.globalAlpha = 1 - Math.abs(ward.pageAnim) * 0.8;
      for (var v = first; v < Math.min(st.variants.length, first + PER_PAGE); v++) {
        var r = wardCell(v - first);
        var vid = st.variants[v];
        sel = look[st.field] === vid;
        var hot = !sel && pointerOver(c, r.x, r.y, r.w, r.h);
        drawVariantTile(c, r, st, vid, sel, hot, look);
      }
      c.restore();
      if (pages > 1) drawPager(c, st, pages);
    } else {
      c.fillStyle = PAL.ink;
      c.font = 'bold 18px ' + FONT;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(T('wardSkinHint'), 292 + 242, 84);
    }

    /* colour chips, and prints for cloth */
    if (st.colorField && st.colors) {
      var kind = CHIP_KIND[st.id] || 'fabric';
      c.fillStyle = 'rgba(74,42,64,0.75)';
      c.font = 'bold 13px ' + FONT;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      if (st.variants.length) c.fillText(T('wardColour'), 296, WARD.chipY - 9);
      for (var s = 0; s < st.colors.length; s++) {
        drawChip(c, colourCell(st, s), kind, st.colors[s], look[st.colorField] === st.colors[s]);
      }
      if (st.patternField) {
        c.fillStyle = 'rgba(74,42,64,0.75)';
        c.font = 'bold 13px ' + FONT;
        c.textAlign = 'left';
        c.fillText(T('wardPattern'), WARD.patX + 4, WARD.chipY - 9);
        for (s = 0; s < Game.PATTERNS.length; s++) {
          drawChip(c, patternCell(s), 'fabric', look[st.colorField], look[st.patternField] === Game.PATTERNS[s], Game.PATTERNS[s]);
        }
      }
    }

    c.fillStyle = 'rgba(255, 246, 236, 0.9)';
    c.font = 'bold 12px ' + FONT;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(T('wardHint'), WARD.done.x + WARD.done.w / 2, 462);
    button(c, WARD.done, T('wardDone'), { fill: PAL.mint, font: 17 });
    drawToast(c);
    /* pop the viewport clip so the puzzle card can dim the whole screen */
    c.restore();
  }

  function handleWardrobeClick(mx, my) {
    var st = ward.station;
    if (!st) return null;
    var i;
    if (st.variants.length) {
      var first = ward.page * PER_PAGE;
      for (i = first; i < Math.min(st.variants.length, first + PER_PAGE); i++) {
        if (hit(wardCell(i - first), mx, my)) { applyChange(st.field, st.variants[i]); return null; }
      }
      if (wardPages(st) > 1) {
        /* the arrows' touch targets reach a little past what is drawn */
        var pad = function (b) { return { x: b.x - 8, y: b.y - 9, w: b.w + 16, h: b.h + 18 }; };
        if (hit(pad(WARD.prev), mx, my)) { turnPage(-1); return null; }
        if (hit(pad(WARD.next), mx, my)) { turnPage(1); return null; }
      }
    }
    if (st.colorField && st.colors) {
      for (i = 0; i < st.colors.length; i++) {
        if (hit(colourCell(st, i), mx, my)) { applyChange(st.colorField, st.colors[i]); return null; }
      }
    }
    if (st.patternField) {
      for (i = 0; i < Game.PATTERNS.length; i++) {
        if (hit(patternCell(i), mx, my)) { applyChange(st.patternField, Game.PATTERNS[i]); return null; }
      }
    }
    if (hit(WARD.done, mx, my)) return 'done';
    return null;
  }

  /* ================================================================
     HUD and prompts
     ================================================================ */
  function drawHud(c) {
    drawStarBadge(c, 12, 12, Game.progress.stars, T('hudStars'));
  }

  function drawPrompt(c, sx, sy, label) {
    var bob = Math.sin(t / 12) * 3;
    var touch = Game.input.isTouch();
    var key = touch ? T('actionBtn') : 'Space';
    c.font = 'bold 9px ' + FONT;
    var kw = Math.max(touch ? 22 : 34, c.measureText(key).width + 10);
    c.font = 'bold 13px ' + FONT;
    var lw = c.measureText(label).width;
    var w = 8 + kw + 7 + lw + 12;
    var x = sx - w / 2, y = sy + bob;
    c.save();
    c.fillStyle = 'rgba(74, 42, 64, 0.22)';
    E.roundRect(c, x, y + 3, w, 30, 15);
    c.fill();
    var pg = c.createLinearGradient(0, y, 0, y + 30);
    pg.addColorStop(0, '#ffffff');
    pg.addColorStop(0.55, '#fff6ec');
    pg.addColorStop(1, '#f6dfd8');
    c.fillStyle = pg;
    E.roundRect(c, x, y, w, 30, 15);
    c.fill();
    c.fillStyle = '#fff6ec';
    E.ink(c, 2);
    var kx = x + 8, ky = y + 6;
    if (touch) {
      E.fillRound(c, kx, ky, kw, 18, 9, PAL.sun, false);
      E.ink(c, 1.5);
    } else {
      E.fillRound(c, kx, ky + 1, kw, 18, 5, PAL.creamDark, false);
      c.fillStyle = '#fffaf0';
      E.roundRect(c, kx + 2, ky + 1, kw - 4, 13, 4);
      c.fill();
      E.roundRect(c, kx, ky + 1, kw, 18, 5);
      E.ink(c, 1.5);
    }
    c.fillStyle = PAL.ink;
    c.font = 'bold 9px ' + FONT;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(key, kx + kw / 2, ky + (touch ? 9.5 : 8));
    c.font = 'bold 13px ' + FONT;
    c.textAlign = 'left';
    c.fillText(label, kx + kw + 7, y + 16);
    c.restore();
  }

  /* ================================================================
     Pause
     ================================================================ */
  var PAUSE_BTN = {
    resume: { x: 300, y: 200, w: 200, h: 48 },
    lang: { x: 300, y: 258, w: 200, h: 40 },
    sound: { x: 300, y: 306, w: 200, h: 40 },
    quit: { x: 300, y: 354, w: 200, h: 40 },
  };

  function drawPauseMenu(c) {
    c.fillStyle = 'rgba(43, 21, 48, 0.66)';
    c.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    panel(c, 250, 120, 300, 290);
    c.fillStyle = PAL.ink;
    c.font = 'bold 24px ' + FONT;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(T('paused'), W / 2, 160);
    button(c, PAUSE_BTN.resume, T('resume'), { fill: PAL.mint, font: 17 });
    button(c, PAUSE_BTN.lang, T('language') + ': ' + T('langLabel'), { font: 13 });
    button(c, PAUSE_BTN.sound, Game.audio.isMuted() ? T('soundOff') : T('soundOn'), { font: 13 });
    button(c, PAUSE_BTN.quit, T('quit'), { font: 13 });
    drawVersionStamp(c);
  }

  function handlePauseClick(mx, my) {
    if (hit(PAUSE_BTN.resume, mx, my)) return 'resume';
    if (hit(PAUSE_BTN.lang, mx, my)) return 'lang';
    if (hit(PAUSE_BTN.sound, mx, my)) return 'sound';
    if (hit(PAUSE_BTN.quit, mx, my)) return 'quit';
    return null;
  }

  /* ================================================================ */
  if (document.fonts && document.fonts.load) {
    /* every UI string plus every kanji and example word, so the font's
       Japanese subsets are fetched before a puzzle needs them */
    var sample = Game.i18n.allText();
    for (var ki = 0; ki < Game.KANJI.length; ki++) {
      sample += Game.KANJI[ki].k;
      for (var wi = 0; wi < Game.KANJI[ki].words.length; wi++) sample += Game.KANJI[ki].words[wi].w;
    }
    ['400', '700'].forEach(function (wgt) {
      document.fonts.load(wgt + ' 16px "M PLUS Rounded 1c"', sample)
        .then(function () { E.clearSpriteCache(); })
        .catch(function () {});
    });
  }

  window.Game.ui = {
    setView: setView,
    VIEW: VIEW,
    TITLE_GROUND: TITLE_GROUND,
    button: button, hit: hit, panel: panel, ribbon: ribbon, well: well, pill: pill, frostPanel: frostPanel, multiline: multiline,
    FONT: FONT, pointerOver: pointerOver, fitFont: fitFont, layoutLines: layoutLines,
    beginFrame: function () { anyHot = false; },
    isHot: function () { return anyHot; },
    showToast: showToast, drawToast: drawToast,
    dropStaleToast: dropStaleToast, endFrame: endFrame,
    drawVersionStamp: drawVersionStamp, drawStarBadge: drawStarBadge,
    drawTitleScreen: drawTitleScreen, handleTitleClick: handleTitleClick,
    drawIntroScreen: drawIntroScreen, handleIntroClick: handleIntroClick,
    openWardrobe: openWardrobe, drawWardrobe: drawWardrobe, handleWardrobeClick: handleWardrobeClick,
    wardPage: function (d) { if (ward.station && wardPages(ward.station) > 1) turnPage(d); },
    drawHud: drawHud, drawPrompt: drawPrompt,
    drawPauseMenu: drawPauseMenu, handlePauseClick: handlePauseClick,
    hasSave: hasSave,
    resetTitleCast: function () { titleFriends = null; },
  };
})();
