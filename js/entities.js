/* entities.js – the character painter, look tiles, walkers and particles.
 *
 * House style (shared with the other Momoko games): flat fill or one
 * gradient per shape, then a 2px PAL.ink outline. Curves via
 * quadraticCurveTo / ellipse / rounded rects. That outline is what makes
 * canvas read as a storybook vector drawing rather than pixel art.
 *
 * A "look" is a plain record (see Game.DEFAULT_LOOK) naming a variant and
 * a colour for every station. drawCharacter() paints one, layer by layer,
 * with feet at (0,0) and ~56px tall at scale 1.
 */
(function () {
  'use strict';
  window.Game = window.Game || {};
  var PAL = Game.PAL;

  /* ---- Offscreen sprite memo (static scenery only) ---- */
  var spriteCache = {};
  function getCachedSprite(key, w, h, drawFn) {
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    key += '@' + dpr;
    if (spriteCache[key]) return spriteCache[key];
    var cv = document.createElement('canvas');
    cv.lw = Math.max(1, Math.ceil(w));
    cv.lh = Math.max(1, Math.ceil(h));
    cv.width = Math.ceil(cv.lw * dpr);
    cv.height = Math.ceil(cv.lh * dpr);
    var g = cv.getContext('2d');
    g.scale(dpr, dpr);
    drawFn(g);
    spriteCache[key] = cv;
    return cv;
  }
  function drawSprite(c, spr, x, y) { c.drawImage(spr, x, y, spr.lw, spr.lh); }
  function clearSpriteCache() { spriteCache = {}; }

  /* ---- Shape helpers ---- */
  function seeded(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }

  function softShadow(c, cx, cy, rx, ry, alpha) {
    c.save();
    c.translate(cx, cy);
    c.scale(1, ry / rx);
    var g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, 'rgba(74, 42, 64, ' + (alpha || 0.24) + ')');
    g.addColorStop(0.6, 'rgba(74, 42, 64, ' + (alpha || 0.24) * 0.55 + ')');
    g.addColorStop(1, 'rgba(74, 42, 64, 0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, rx, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  /* Outlines take the hue of the fill they border: wine round pink,
     deep teal round mint, warm brown round skin and gold. Keeping the
     hue is what makes a flat shape read as painted rather than traced.
     Neutral fills (white, grey, gradients, rgba strings) keep PAL.ink so
     the UI chrome stays as it was. */
  var inkCache = {};
  function inkColor(fill) {
    if (typeof fill !== 'string' || fill.charAt(0) !== '#') return PAL.ink;
    var hit = inkCache[fill];
    if (hit) return hit;
    var hex = fill.length === 4
      ? '#' + fill.charAt(1) + fill.charAt(1) + fill.charAt(2) + fill.charAt(2) + fill.charAt(3) + fill.charAt(3)
      : fill;
    var n = parseInt(hex.slice(1, 7), 16);
    var r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2, d = max - min;
    var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    var out;
    if (s < 0.18 || isNaN(s)) {
      out = PAL.ink;
    } else {
      var h;
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
      var l2 = Math.min(0.26, l * 0.5), s2 = Math.min(1, s * 0.85 + 0.15);
      var cc = (1 - Math.abs(2 * l2 - 1)) * s2, x = cc * (1 - Math.abs((h / 60) % 2 - 1)), m = l2 - cc / 2;
      var rr, gg, bb;
      if (h < 60) { rr = cc; gg = x; bb = 0; }
      else if (h < 120) { rr = x; gg = cc; bb = 0; }
      else if (h < 180) { rr = 0; gg = cc; bb = x; }
      else if (h < 240) { rr = 0; gg = x; bb = cc; }
      else if (h < 300) { rr = x; gg = 0; bb = cc; }
      else { rr = cc; gg = 0; bb = x; }
      /* a third of the house ink keeps every line in one family */
      var R = Math.round(((rr + m) * 255) * 0.68 + 74 * 0.32);
      var G = Math.round(((gg + m) * 255) * 0.68 + 42 * 0.32);
      var B = Math.round(((bb + m) * 255) * 0.68 + 64 * 0.32);
      out = '#' + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
    }
    inkCache[fill] = out;
    return out;
  }

  function ink(c, w) {
    c.strokeStyle = inkColor(c.fillStyle);
    c.lineWidth = w || 2;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.stroke();
  }

  function roundRect(c, x, y, w, h, r) {
    var rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y);
    c.quadraticCurveTo(x + w, y, x + w, y + rr);
    c.lineTo(x + w, y + h - rr);
    c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    c.lineTo(x + rr, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - rr);
    c.lineTo(x, y + rr);
    c.quadraticCurveTo(x, y, x + rr, y);
    c.closePath();
  }

  function fillRound(c, x, y, w, h, r, fill, outline) {
    roundRect(c, x, y, w, h, r);
    c.fillStyle = fill;
    c.fill();
    if (outline !== false) ink(c, 2);
  }

  function fillEllipse(c, cx, cy, rx, ry, fill, outline) {
    c.beginPath();
    c.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    if (outline !== false) ink(c, 2);
  }

  function fillPath(c, pts, fill, close, outline) {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    if (close !== false) c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (outline !== false) ink(c, 2);
  }

  function shade(hex, pct) {
    if (!hex || hex.charAt(0) !== '#') return hex;
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    function adj(v) {
      var out = Math.round(v + (pct / 100) * (pct > 0 ? 255 - v : v));
      return Math.max(0, Math.min(255, out));
    }
    return '#' + ((1 << 24) + (adj(r) << 16) + (adj(g) << 8) + adj(b)).toString(16).slice(1);
  }

  function star(c, cx, cy, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var ang = (Math.PI / 5) * i - Math.PI / 2;
      var rad = (i % 2 === 0) ? r : r * 0.45;
      var px = cx + Math.cos(ang) * rad;
      var py = cy + Math.sin(ang) * rad;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
  }

  function heartPath(c, cx, cy, r) {
    c.beginPath();
    c.moveTo(cx, cy + r * 0.9);
    c.bezierCurveTo(cx - r * 1.4, cy - r * 0.1, cx - r * 0.7, cy - r * 1.1, cx, cy - r * 0.35);
    c.bezierCurveTo(cx + r * 0.7, cy - r * 1.1, cx + r * 1.4, cy - r * 0.1, cx, cy + r * 0.9);
    c.closePath();
  }
  function heart(c, cx, cy, r, fill, outline) {
    heartPath(c, cx, cy, r);
    c.fillStyle = fill;
    c.fill();
    if (outline) ink(c, outline === true ? 1.2 : outline);
  }

  /* ==================================================================
     Characters
     Drawn with feet at (0,0) in local space, ~56px tall at scale 1.
     ================================================================== */

  var CH = {
    headR: 13,
    headY: -41,
    torsoTop: -30,
    torsoBot: -12,
    torsoW: 20,
  };
  var MANNEQUIN_SKIN = '#ede3ec';

  /* Mix two hex colours; k = 0 gives a, k = 1 gives b. */
  function mix(a, b, k) {
    if (!a || a.charAt(0) !== '#' || !b || b.charAt(0) !== '#') return a;
    var na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
    var r = Math.round(((na >> 16) & 255) * (1 - k) + ((nb >> 16) & 255) * k);
    var g = Math.round(((na >> 8) & 255) * (1 - k) + ((nb >> 8) & 255) * k);
    var bl = Math.round((na & 255) * (1 - k) + (nb & 255) * k);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  /* The colour a surface turns where it falls out of the key light.
     Cloth shadows cool toward the room's plum; skin shadows warm toward
     blood and sun, the way a painter keeps a face alive in shade. */
  function shadowOf(col, amt, warm) {
    if (!col || col.charAt(0) !== '#') return col;
    return mix(shade(col, -amt), warm ? '#c8503a' : '#4a2470', warm ? amt / 220 : amt / 180);
  }
  var SHADE_CACHE = {};
  function shadowCached(col, amt, warm) {
    var k = col + amt + (warm ? 'w' : 'c');
    return SHADE_CACHE[k] || (SHADE_CACHE[k] = shadowOf(col, amt, warm));
  }

  /* Two hard-edged shadow bands tucked along the shape's dark side: the
     shape is filled in its deep shadow colour, then its own outline,
     nudged toward the light, clips back the mid band, then nudged again,
     clips back the lit body. The result is the stepped terminator of a
     cel-shaded figure, and it is what finally makes a flat fill read as
     a solid thing standing in a lit room. `col` must be a hex colour;
     gradients fall through to the soft shading alone. */
  function celBands(c, pathFn, col, dx, dy, warm, strength) {
    if (typeof col !== 'string' || col.charAt(0) !== '#') return;
    var s = strength || 1;
    c.save();
    pathFn();
    c.clip();
    c.fillStyle = shadowCached(col, Math.round(24 * s), warm);
    c.fillRect(-120, -140, 240, 280);
    c.translate(dx, dy);
    pathFn();
    c.translate(-dx, -dy);
    c.clip();
    c.fillStyle = shadowCached(col, Math.round(11 * s), warm);
    c.fillRect(-120, -140, 240, 280);
    c.translate(dx * 0.45, dy * 0.45);
    pathFn();
    c.translate(-dx * 0.45, -dy * 0.45);
    c.clip();
    c.fillStyle = col;
    c.fillRect(-120, -140, 240, 280);
    c.restore();
  }

  /* Fill a shape, band its shadow side, lay soft studio light over it,
     then ink the outline. pathFn traces the shape. opts.warm picks skin
     shadows; opts.dx/dy set where the light is coming from. */
  function shadedFill(c, pathFn, col, inkW, opts) {
    opts = opts || {};
    pathFn();
    c.fillStyle = col;
    c.fill();
    celBands(c, pathFn, col, opts.dx === undefined ? -2.6 : opts.dx, opts.dy === undefined ? -3.2 : opts.dy, opts.warm, opts.strength);
    c.save();
    pathFn();
    c.clip();
    /* key light from the upper left: a soft sphere of light over the
       chest falling away down the right flank */
    var vg = c.createRadialGradient(-6, -26, 2, -2, -20, 34);
    vg.addColorStop(0, 'rgba(255,255,255,0.3)');
    vg.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    vg.addColorStop(1, 'rgba(42,16,48,0.1)');
    c.fillStyle = vg;
    c.fillRect(-80, -100, 160, 160);
    /* rim light along the lit edge */
    var rg = c.createLinearGradient(-16, 0, -7, 0);
    rg.addColorStop(0, 'rgba(255,255,255,0.3)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = rg;
    c.fillRect(-80, -100, 73, 160);
    /* a sliver of cool rim light down the shadow edge, so the dark side
       still separates from the room */
    var rr = c.createLinearGradient(14, 0, 8, 0);
    rr.addColorStop(0, 'rgba(210,230,255,0.22)');
    rr.addColorStop(1, 'rgba(210,230,255,0)');
    c.fillStyle = rr;
    c.fillRect(8, -100, 80, 160);
    /* bounce light creeping up from the floor */
    var bg = c.createLinearGradient(0, 12, 0, -4);
    bg.addColorStop(0, 'rgba(255,214,236,0.16)');
    bg.addColorStop(1, 'rgba(255,214,236,0)');
    c.fillStyle = bg;
    c.fillRect(-80, -6, 160, 22);
    c.restore();
    pathFn();
    ink(c, inkW || 2);
  }
  /* A limb or sleeve: a rounded bar lit down its left side with a hard
     shadow band down its right. opts.warm for skin; opts.topShade darkens
     the top end where it disappears under a hem or a shoulder. */
  function volumeRound(c, x, y, w, h, r, col, inkW, opts) {
    opts = opts || {};
    var path = function () { roundRect(c, x, y, w, h, r); };
    path();
    c.fillStyle = col;
    c.fill();
    celBands(c, path, col, -w * 0.34, -h * 0.08, opts.warm, 0.9);
    c.save();
    path();
    c.clip();
    var g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.3)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.03)');
    g.addColorStop(1, 'rgba(42,16,48,0.1)');
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
    if (opts.topShade) {
      var tg = c.createLinearGradient(0, y, 0, y + Math.min(h, 7));
      tg.addColorStop(0, 'rgba(42,16,48,' + opts.topShade + ')');
      tg.addColorStop(1, 'rgba(42,16,48,0)');
      c.fillStyle = tg;
      c.fillRect(x, y, w, Math.min(h, 7));
    }
    c.restore();
    path();
    c.fillStyle = col;
    ink(c, inkW || 2);
  }
  /* A lock of hair, a bun, a pompom: an ellipse with its shadow side
     banded and a glint on its lit shoulder. */
  function volEllipse(c, cx, cy, rx, ry, col, inkW) {
    var path = function () { c.beginPath(); c.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2); };
    path();
    c.fillStyle = col;
    c.fill();
    celBands(c, path, col, -Math.abs(rx) * 0.36, -Math.abs(ry) * 0.3, false, 1);
    c.save();
    path();
    c.clip();
    c.globalAlpha = 0.32;
    fillEllipse(c, cx - rx * 0.35, cy - ry * 0.4, Math.abs(rx) * 0.32, Math.abs(ry) * 0.22, '#ffffff', false);
    c.restore();
    path();
    c.fillStyle = col;
    ink(c, inkW || 2);
  }
  function polyPath(c, pts) {
    return function () {
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.closePath();
    };
  }
  function rrPath(c, x, y, w, h, r) {
    return function () { roundRect(c, x, y, w, h, r); };
  }

  /* ---- Hair ---- */
  function drawHair(c, cust, back) {
    if (cust.mannequin && !cust.showHair) return;
    var col = cust.hair;
    var dark = shade(col, -22);
    var hy = CH.headY;
    var r = CH.headR;
    var i;
    if (back) {
      col = shade(col, -9);
      switch (cust.hairStyle) {
        case 'twinTails':
          volEllipse(c, -r - 6, hy + 6, 7, 12, col);
          volEllipse(c, r + 6, hy + 6, 7, 12, col);
          break;
        case 'longBraids':
          volumeRound(c, -r - 6, hy - 2, 8, 26, 4, col);
          volumeRound(c, r - 2, hy - 2, 8, 26, 4, col);
          for (i = 0; i < 3; i++) {
            fillEllipse(c, -r - 2, hy + 4 + i * 7, 3.6, 3, shade(col, 8), false);
            fillEllipse(c, r + 2, hy + 4 + i * 7, 3.6, 3, shade(col, 8), false);
          }
          fillEllipse(c, -r - 2, hy + 25, 4, 4, dark);
          fillEllipse(c, r + 2, hy + 25, 4, 4, dark);
          break;
        case 'buns':
          volEllipse(c, -r - 4, hy - 6, 7, 7, col);
          volEllipse(c, r + 4, hy - 6, 7, 7, col);
          fillEllipse(c, -r - 6, hy - 8, 2.5, 2, shade(col, 35), false);
          fillEllipse(c, r + 2, hy - 8, 2.5, 2, shade(col, 35), false);
          break;
        case 'ponytail':
          shadedFill(c, polyPath(c, [[r - 2, hy - 4], [r + 12, hy + 4], [r + 9, hy + 20], [r + 1, hy + 8]]), col, 2, { dx: -2, dy: -2 });
          break;
        case 'sidePony':
          volEllipse(c, r + 7, hy + 12, 6, 13, col);
          fillEllipse(c, r + 3, hy, 4, 4, PAL.sun, false);
          break;
        case 'bob':
          volEllipse(c, 0, hy + 3, r + 3, r + 2, col);
          break;
        case 'longWavy':
          /* two long locks falling past the shoulders, wavy on the
             outside edge, plus a sheet behind the neck */
          fillRound(c, -r - 1, hy - 4, (r + 1) * 2, 22, 6, col, false);
          for (var sd = -1; sd <= 1; sd += 2) {
            c.beginPath();
            c.moveTo(sd * (r - 4), hy - 8);
            c.quadraticCurveTo(sd * (r + 9), hy + 2, sd * (r + 6), hy + 12);
            c.quadraticCurveTo(sd * (r + 12), hy + 22, sd * (r + 7), hy + 32);
            c.quadraticCurveTo(sd * (r + 10), hy + 40, sd * (r + 4), hy + 44);
            c.lineTo(sd * (r - 5), hy + 44);
            c.quadraticCurveTo(sd * (r - 3), hy + 24, sd * (r - 1), hy + 6);
            c.closePath();
            c.fillStyle = col; c.fill();
            (function (side) {
              var lock = function () {
                c.beginPath();
                c.moveTo(side * (r - 4), hy - 8);
                c.quadraticCurveTo(side * (r + 9), hy + 2, side * (r + 6), hy + 12);
                c.quadraticCurveTo(side * (r + 12), hy + 22, side * (r + 7), hy + 32);
                c.quadraticCurveTo(side * (r + 10), hy + 40, side * (r + 4), hy + 44);
                c.lineTo(side * (r - 5), hy + 44);
                c.quadraticCurveTo(side * (r - 3), hy + 24, side * (r - 1), hy + 6);
                c.closePath();
              };
              celBands(c, lock, col, -2.4, -2.6, false, 1);
              lock();
              c.fillStyle = col; ink(c, 2);
            })(sd);
            /* a lighter strand following the wave */
            c.save(); c.globalAlpha = 0.35;
            c.strokeStyle = shade(col, 40); c.lineWidth = 2;
            c.beginPath();
            c.moveTo(sd * (r + 1), hy + 6);
            c.quadraticCurveTo(sd * (r + 7), hy + 18, sd * (r + 2), hy + 30);
            c.stroke();
            c.restore();
          }
          break;
        case 'curly':
          for (i = 0; i < 9; i++) {
            var a = Math.PI + (i / 8) * Math.PI;
            volEllipse(c, Math.cos(a) * (r + 4), hy + Math.sin(a) * (r + 2) + 2, 6, 6, col);
          }
          volEllipse(c, -r - 6, hy + 10, 6, 6, col);
          volEllipse(c, r + 6, hy + 10, 6, 6, col);
          break;
        case 'pixie':
          volEllipse(c, 0, hy - 1, r + 2.5, r + 1, col);
          break;
        case 'topBun':
          volEllipse(c, 0, hy - r - 5, 7.5, 6.5, col);
          fillEllipse(c, -2, hy - r - 7, 2.5, 2, shade(col, 35), false);
          break;
      }
    } else {
      /* the fringe throws a shadow onto the brow beneath it */
      if (!cust.mannequin) {
        c.save();
        c.beginPath(); c.ellipse(0, hy, r, r + 0.5, 0, 0, Math.PI * 2); c.clip();
        var fs = c.createLinearGradient(0, hy - 0.5, 0, hy + 4);
        fs.addColorStop(0, 'rgba(120,40,50,0.3)');
        fs.addColorStop(1, 'rgba(120,40,50,0)');
        c.fillStyle = fs;
        c.fillRect(-r - 2, hy - 1, r * 2 + 4, 6);
        c.restore();
      }
      var cap = function () {
        c.beginPath();
        c.arc(0, hy, r + 1.5, Math.PI, Math.PI * 2);
        /* the fringe: soft points that hang below the hairline, kept
           clear of the eyes */
        c.lineTo(r + 1.5, hy);
        c.quadraticCurveTo(r - 1, hy + 2.5, r - 3.5, hy + 0.4);
        c.quadraticCurveTo(r - 5.5, hy + 1.2, r - 7, hy + 0.2);
        c.lineTo(1.2, hy + 0.2);
        c.quadraticCurveTo(0, hy + 2.8, -1.2, hy + 0.2);
        c.lineTo(-r + 7, hy + 0.2);
        c.quadraticCurveTo(-r + 5.5, hy + 1.2, -r + 3.5, hy + 0.4);
        c.quadraticCurveTo(-r + 1, hy + 2.5, -r - 1.5, hy);
        c.closePath();
      };
      cap();
      c.fillStyle = col;
      c.fill();
      celBands(c, cap, col, -2.2, -2.8, false, 1);
      c.save();
      cap();
      c.clip();
      /* light pours over the crown and the fringe falls into shade */
      var hg = c.createLinearGradient(0, hy - r - 2, 0, hy + 2);
      hg.addColorStop(0, 'rgba(255,255,255,0.18)');
      hg.addColorStop(0.55, 'rgba(255,255,255,0)');
      hg.addColorStop(1, 'rgba(42,16,48,0.2)');
      c.fillStyle = hg;
      c.fillRect(-r - 4, hy - r - 4, r * 2 + 8, r + 8);
      /* strands: fine darker lines following the curve of the cap */
      c.strokeStyle = shadowCached(col, 16, false);
      c.lineWidth = 0.7;
      c.lineCap = 'round';
      c.globalAlpha = 0.22;
      c.beginPath();
      for (var sd2 = -2; sd2 <= 2; sd2++) {
        var sx = sd2 * 4.4;
        c.moveTo(sx * 0.35, hy - r + 1.5);
        c.quadraticCurveTo(sx * 0.9, hy - r * 0.45, sx * 1.15, hy + 1);
      }
      c.stroke();
      c.restore();
      cap();
      c.fillStyle = col;
      ink(c, 2);
      switch (cust.hairStyle) {
        case 'bob':
        case 'longWavy':
          fillRound(c, -r - 2, hy - 2, 5, 14, 2.5, col);
          fillRound(c, r - 3, hy - 2, 5, 14, 2.5, col);
          break;
        case 'pixie':
          fillPath(c, [[-r, hy - 2], [-r + 6, hy - 6], [-r + 5, hy + 4]], col);
          fillPath(c, [[r, hy - 2], [r - 6, hy - 6], [r - 5, hy + 4]], col);
          fillPath(c, [[2, hy - r], [6, hy - r + 7], [-1, hy - r + 5]], col);
          break;
        case 'curly':
          for (i = -2; i <= 2; i++) fillEllipse(c, i * 5.5, hy - r + 1 + Math.abs(i), 3.6, 3.6, col);
          break;
        case 'sidePony':
          fillPath(c, [[-r, hy - 3], [2, hy - r - 1], [-3, hy + 1]], col);
          break;
      }
      c.save();
      c.globalAlpha = 0.4;
      fillEllipse(c, -5, hy - 8, 5.5, 2.8, shade(col, 45), false);
      c.restore();
    }
  }

  /* ---- Legs, base layer, pants ---- */
  function skinOf(cust) { return cust.mannequin ? MANNEQUIN_SKIN : cust.skin; }

  function drawLegs(c, cust, swing) {
    var skin = skinOf(cust);
    var bot = CH.torsoBot;
    /* the legs vanish into shadow where they meet the hem */
    var legOpts = { warm: true, topShade: 0.3 };
    volumeRound(c, -7 + swing * 0.5, bot, 6, 12, 3, skin, 2, legOpts);
    volumeRound(c, 1 - swing * 0.5, bot, 6, 12, 3, skin, 2, legOpts);
  }

  function drawPantsLegs(c, cust, swing) {
    var col = cust.pantsColor, dark = shade(col, -20), light = shade(col, 25);
    var bot = CH.torsoBot;
    var lx = -7 + swing * 0.5, rx = 1 - swing * 0.5;
    var pOpts = { topShade: 0.22 };
    switch (cust.pants) {
      case 'jeans':
        volumeRound(c, lx - 0.5, bot - 2, 7, 12, 2.5, col, 2, pOpts);
        volumeRound(c, rx - 0.5, bot - 2, 7, 12, 2.5, col, 2, pOpts);
        c.strokeStyle = light; c.lineWidth = 1;
        c.beginPath(); c.moveTo(lx + 1, bot + 7); c.lineTo(lx + 1, bot + 9.5); c.moveTo(rx + 5, bot + 7); c.lineTo(rx + 5, bot + 9.5); c.stroke();
        break;
      case 'leggings':
        volumeRound(c, lx, bot - 2, 6, 12, 3, col, 2, pOpts);
        volumeRound(c, rx, bot - 2, 6, 12, 3, col, 2, pOpts);
        break;
      case 'stripey':
        for (var s = 0; s < 2; s++) {
          var x = s === 0 ? lx : rx;
          c.save();
          roundRect(c, x, bot - 2, 6, 12, 3); c.clip();
          c.fillStyle = col; c.fillRect(x, bot - 2, 6, 12);
          c.fillStyle = PAL.cream;
          for (var y = bot; y < bot + 10; y += 4) c.fillRect(x, y, 6, 2);
          c.restore();
          roundRect(c, x, bot - 2, 6, 12, 3); ink(c, 2);
        }
        break;
      case 'shorts':
        fillRound(c, lx - 1, bot - 3, 8, 8, 2.5, col);
        fillRound(c, rx - 1, bot - 3, 8, 8, 2.5, col);
        fillRound(c, -8, bot - 4, 16, 3, 1.5, dark, false);
        break;
      case 'overalls':
        volumeRound(c, lx - 0.5, bot - 2, 7, 12, 2.5, col, 2, pOpts);
        volumeRound(c, rx - 0.5, bot - 2, 7, 12, 2.5, col, 2, pOpts);
        break;
      /* skirts are drawn by drawSkirt(), over the camisole */
    }
  }

  /* Skirts sit at the waist, over the camisole hem, so the whole skirt
     shows instead of the sliver that peeked out below the top. */
  function drawSkirt(c, cust) {
    if (cust.pants !== 'skirt' && cust.pants !== 'poofySkirt') return;
    var col = cust.pantsColor, dark = shade(col, -20), light = shade(col, 25);
    var bot = CH.torsoBot, waist = bot - 7;
    if (cust.pants === 'skirt') {
      shadedFill(c, polyPath(c, [[-9, waist], [9, waist], [15, bot + 7], [-15, bot + 7]]), col);
      /* pleats */
      c.strokeStyle = 'rgba(74,42,64,0.28)'; c.lineWidth = 1;
      c.beginPath();
      for (var k = -1; k <= 1; k++) { c.moveTo(k * 5, waist + 3); c.lineTo(k * 7.5, bot + 6); }
      c.stroke();
      fillRound(c, -9.5, waist - 0.5, 19, 3.5, 1.5, dark, false);
    } else {
      shadedFill(c, function () {
        c.beginPath();
        c.moveTo(-9, waist);
        c.lineTo(9, waist);
        c.quadraticCurveTo(20, waist + 4, 17, bot + 8);
        c.quadraticCurveTo(0, bot + 12, -17, bot + 8);
        c.quadraticCurveTo(-20, waist + 4, -9, waist);
        c.closePath();
      }, col);
      /* tulle layers */
      c.save(); c.globalAlpha = 0.5; c.strokeStyle = light; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-14, bot + 3); c.quadraticCurveTo(0, bot + 7, 14, bot + 3); c.stroke();
      c.restore();
      for (var d = -12; d <= 12; d += 6) fillEllipse(c, d, bot + 1 + (d % 12 === 0 ? 3 : 0), 1.3, 1.3, light, false);
      fillRound(c, -9.5, waist - 0.5, 19, 3.5, 1.5, dark, false);
      fillEllipse(c, 0, waist + 1, 2, 2, PAL.sun, false);
    }
  }

  /* Overall bib goes over the camisole but under any dress or jacket. */
  function drawPantsTop(c, cust) {
    if (cust.pants !== 'overalls') return;
    var col = cust.pantsColor, top = CH.torsoTop;
    fillRound(c, -8, top + 2, 3.5, 9, 1.5, col);
    fillRound(c, 4.5, top + 2, 3.5, 9, 1.5, col);
    fillRound(c, -9, top + 8, 18, 10, 3, col);
    fillRound(c, -4, top + 11, 8, 5, 2, shade(col, -20));
    fillEllipse(c, -6, top + 9, 1.3, 1.3, PAL.sun, false);
    fillEllipse(c, 6, top + 9, 1.3, 1.3, PAL.sun, false);
  }

  /* The cream camisole and shorts she starts the day in. */
  function drawBaseLayer(c, cust, swing) {
    var top = CH.torsoTop, bot = CH.torsoBot;
    var cream = cust.mannequin ? '#f7f0f6' : PAL.cream;
    if (cust.pants === 'none') {
      fillRound(c, -8 + swing * 0.5, bot - 3, 7, 7, 2.5, cream);
      fillRound(c, 1 - swing * 0.5, bot - 3, 7, 7, 2.5, cream);
    }
    if (cust.dress === 'none') {
      shadedFill(c, rrPath(c, -9, top, 18, (bot + 2) - top, 4), cream, 2, { strength: 0.8 });
      c.strokeStyle = PAL.ink; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-6, top); c.lineTo(-6, top - 3); c.moveTo(6, top); c.lineTo(6, top - 3); c.stroke();
      if (!cust.mannequin) heart(c, 0, top + 8, 2.4, PAL.pink, false);
    }
  }

  /* ---- Dresses ---- */
  function drawDress(c, cust) {
    var col = cust.dressColor;
    if (cust.dress === 'none') return;
    var dark = shade(col, -20);
    var light = shade(col, 22);
    var top = CH.torsoTop, bot = CH.torsoBot;
    var i, s;
    switch (cust.dress) {
      case 'frilly':
        shadedFill(c, polyPath(c, [[-9, top], [9, top], [16, bot + 8], [-16, bot + 8]]), col);
        c.beginPath();
        for (i = -16; i < 16; i += 8) {
          c.moveTo(i, bot + 8);
          c.arc(i + 4, bot + 8, 4, Math.PI, 0, true);
        }
        c.fillStyle = light;
        c.fill();
        ink(c, 1.5);
        break;
      case 'sailor':
        shadedFill(c, polyPath(c, [[-9, top], [9, top], [15, bot + 7], [-15, bot + 7]]), col);
        fillPath(c, [[-9, top], [9, top], [6, top + 8], [-6, top + 8]], PAL.cream);
        fillRound(c, -4, top + 6, 8, 4, 2, PAL.coral);
        c.strokeStyle = light; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-13, bot + 3); c.lineTo(13, bot + 3); c.stroke();
        break;
      case 'star':
        shadedFill(c, polyPath(c, [[-9, top], [9, top], [15, bot + 7], [-15, bot + 7]]), col);
        c.fillStyle = PAL.sun;
        for (s = 0; s < 3; s++) star(c, -7 + s * 7, bot - 1 + (s % 2) * 4, 2.6);
        break;
      case 'ballgown':
        shadedFill(c, function () {
          c.beginPath();
          c.moveTo(-9, top);
          c.lineTo(9, top);
          c.lineTo(10, bot - 6);
          c.quadraticCurveTo(24, bot + 2, 22, bot + 12);
          c.lineTo(-22, bot + 12);
          c.quadraticCurveTo(-24, bot + 2, -10, bot - 6);
          c.closePath();
        }, col);
        /* satin sheen */
        c.save(); c.globalAlpha = 0.35;
        c.beginPath(); c.moveTo(-6, bot - 4); c.quadraticCurveTo(-14, bot + 4, -12, bot + 11); c.lineTo(-4, bot + 11); c.quadraticCurveTo(-2, bot + 2, -2, bot - 4); c.closePath();
        c.fillStyle = '#fff'; c.fill(); c.restore();
        fillRound(c, -10, bot - 7, 20, 3.5, 1.5, light);
        fillEllipse(c, 0, bot - 5.5, 2.4, 2.4, PAL.sun, false);
        for (i = -18; i <= 18; i += 9) fillEllipse(c, i, bot + 12, 4.5, 2, light, false);
        break;
      case 'princess':
        shadedFill(c, polyPath(c, [[-8, top], [8, top], [18, bot + 10], [-18, bot + 10]]), col);
        fillEllipse(c, -10, top + 2, 4, 3.5, light);
        fillEllipse(c, 10, top + 2, 4, 3.5, light);
        c.strokeStyle = PAL.gold; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-17, bot + 7); c.lineTo(17, bot + 7); c.stroke();
        c.beginPath(); c.moveTo(0, top + 3); c.lineTo(0, bot + 9); c.stroke();
        for (i = 0; i < 3; i++) fillEllipse(c, 0, top + 6 + i * 5, 1.3, 1.3, PAL.gold, false);
        break;
      case 'sundress':
        shadedFill(c, polyPath(c, [[-8, top + 2], [8, top + 2], [16, bot + 9], [-16, bot + 9]]), col);
        c.strokeStyle = col; c.lineWidth = 2;
        c.beginPath(); c.moveTo(-6, top + 2); c.lineTo(-5, top - 3); c.moveTo(6, top + 2); c.lineTo(5, top - 3); c.stroke();
        for (i = 0; i < 5; i++) {
          var fx = -10 + i * 5, fy = top + 8 + (i % 2) * 9;
          fillEllipse(c, fx, fy, 1.6, 1.6, PAL.cream, false);
          fillEllipse(c, fx, fy, 0.7, 0.7, PAL.sun, false);
        }
        break;
      case 'tutu':
        shadedFill(c, rrPath(c, -9, top, 18, (bot - 3) - top, 4), col);
        c.save(); c.globalAlpha = 0.85;
        for (var layer = 0; layer < 3; layer++) {
          var ly = bot - 4 + layer * 3, lw = 17 - layer * 2;
          c.beginPath();
          c.moveTo(-lw, ly + 5);
          for (var k = -lw; k < lw; k += 4) {
            c.lineTo(k + 2, ly - 1);
            c.lineTo(k + 4, ly + 5);
          }
          c.closePath();
          c.fillStyle = layer === 1 ? light : col; c.fill();
          ink(c, 1.2);
        }
        c.restore();
        fillRound(c, -9, bot - 5, 18, 3, 1.5, light);
        break;
      case 'kimono':
        shadedFill(c, polyPath(c, [[-9, top], [9, top], [13, bot + 10], [-13, bot + 10]]), col);
        /* wide sleeves */
        fillRound(c, -19, top + 3, 9, 15, 3, col);
        fillRound(c, 10, top + 3, 9, 15, 3, col);
        /* crossed collar */
        fillPath(c, [[-7, top], [0, top + 9], [-2, top + 10], [-9, top + 1]], PAL.cream);
        fillPath(c, [[7, top], [0, top + 9], [2, top + 10], [9, top + 1]], PAL.cream);
        /* obi */
        fillRound(c, -10, top + 11, 20, 6, 1.5, dark);
        fillRound(c, -4, top + 12, 8, 4, 1, PAL.sun, false);
        for (i = 0; i < 4; i++) fillEllipse(c, -8 + i * 5, bot + 5 + (i % 2) * 2, 1.6, 1.6, light, false);
        break;
      case 'polka':
        shadedFill(c, polyPath(c, [[-9, top], [9, top], [16, bot + 8], [-16, bot + 8]]), col);
        c.save();
        polyPath(c, [[-9, top], [9, top], [16, bot + 8], [-16, bot + 8]])();
        c.clip();
        c.fillStyle = PAL.cream;
        for (var row = 0; row < 5; row++) {
          for (var cc = -3; cc <= 3; cc++) {
            c.beginPath();
            c.arc(cc * 6 + (row % 2) * 3, top + 3 + row * 6, 1.4, 0, Math.PI * 2);
            c.fill();
          }
        }
        c.restore();
        fillRound(c, -9, top + 9, 18, 3, 1.5, dark);
        break;
    }
  }

  /* ---- Jackets ---- */
  function jacketHasSleeves(j) { return j !== 'none' && j !== 'cape'; }

  function drawJacketBack(c, cust) {
    var col = cust.jacketColor, top = CH.torsoTop;
    if (cust.jacket === 'cape') {
      shadedFill(c, function () {
        c.beginPath();
        c.moveTo(-9, top + 1);
        c.lineTo(9, top + 1);
        c.quadraticCurveTo(20, top + 14, 17, top + 30);
        c.lineTo(-17, top + 30);
        c.quadraticCurveTo(-20, top + 14, -9, top + 1);
        c.closePath();
      }, col);
    } else if (cust.jacket === 'hoodie' || cust.jacket === 'raincoat') {
      /* hood resting behind the head */
      fillEllipse(c, 0, top - 2, 12, 6, shade(col, -8));
    }
  }

  function drawJacketFront(c, cust) {
    var col = cust.jacketColor;
    if (cust.jacket === 'none') return;
    var dark = shade(col, -22), light = shade(col, 25);
    var top = CH.torsoTop, bot = CH.torsoBot;
    var i;
    switch (cust.jacket) {
      case 'denim':
        fillPath(c, [[-10, top], [-3, top], [-3, bot + 4], [-10, bot + 4]], col);
        fillPath(c, [[10, top], [3, top], [3, bot + 4], [10, bot + 4]], col);
        fillPath(c, [[-10, top], [-3, top], [-7, top + 5]], light);
        fillPath(c, [[10, top], [3, top], [7, top + 5]], light);
        fillRound(c, -9, top + 7, 5, 4, 1, dark, false);
        fillRound(c, 4, top + 7, 5, 4, 1, dark, false);
        break;
      case 'hoodie':
        shadedFill(c, rrPath(c, -11, top - 1, 22, (bot + 6) - (top - 1), 6), col);
        fillRound(c, -6, bot - 2, 12, 6, 2, dark);
        c.strokeStyle = PAL.cream; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(-3, top + 2); c.lineTo(-3, top + 9); c.moveTo(3, top + 2); c.lineTo(3, top + 9); c.stroke();
        break;
      case 'cardigan':
        fillPath(c, [[-11, top], [-2, top], [-2, bot + 5], [-11, bot + 5]], col);
        fillPath(c, [[11, top], [2, top], [2, bot + 5], [11, bot + 5]], col);
        c.strokeStyle = dark; c.lineWidth = 1.2;
        for (i = top + 4; i < bot + 4; i += 4) { c.beginPath(); c.moveTo(-10, i); c.lineTo(-3, i); c.moveTo(3, i); c.lineTo(10, i); c.stroke(); }
        for (i = 0; i < 3; i++) fillEllipse(c, -2.5, top + 5 + i * 5, 1.2, 1.2, PAL.cream, false);
        break;
      case 'raincoat':
        shadedFill(c, polyPath(c, [[-10, top - 1], [10, top - 1], [14, bot + 9], [-14, bot + 9]]), col);
        c.save(); c.globalAlpha = 0.45; fillRound(c, -8, top + 2, 4, 14, 2, '#ffffff', false); c.restore();
        for (i = 0; i < 3; i++) fillRound(c, -2, top + 4 + i * 6, 4, 2.5, 1, dark, false);
        break;
      case 'cape':
        fillEllipse(c, 0, top + 1, 3, 3, PAL.sun);
        break;
      case 'puffer':
        shadedFill(c, rrPath(c, -12, top - 1, 24, (bot + 5) - (top - 1), 7), col);
        c.strokeStyle = dark; c.lineWidth = 1.4;
        for (i = top + 5; i < bot + 3; i += 6) {
          c.beginPath(); c.moveTo(-11, i); c.quadraticCurveTo(0, i + 2, 11, i); c.stroke();
        }
        fillRound(c, -1.5, top, 3, (bot + 4) - top, 1.5, light, false);
        break;
      case 'blazer':
        fillPath(c, [[-11, top], [-2, top], [-2, bot + 4], [-11, bot + 4]], col);
        fillPath(c, [[11, top], [2, top], [2, bot + 4], [11, bot + 4]], col);
        fillPath(c, [[-10, top], [-2, top], [-2, top + 8]], dark);
        fillPath(c, [[10, top], [2, top], [2, top + 8]], dark);
        fillEllipse(c, 3, top + 11, 1.3, 1.3, PAL.gold, false);
        fillRound(c, -9, top + 9, 4, 1.5, 0.7, dark, false);
        break;
    }
  }

  function drawSleeve(c, cust, ax, ay, isFront) {
    if (!jacketHasSleeves(cust.jacket)) return;
    var col = cust.jacketColor;
    var long = cust.jacket === 'hoodie' || cust.jacket === 'raincoat' || cust.jacket === 'puffer' || cust.jacket === 'blazer' || cust.jacket === 'cardigan';
    var h = long ? 12 : 7;
    var w = cust.jacket === 'puffer' ? 7 : 6;
    volumeRound(c, ax - 0.5 - (w - 6) / 2, ay - 1, w, h, 3, isFront ? col : shade(col, -10));
    if (long) fillRound(c, ax - 0.5 - (w - 6) / 2, ay + h - 3, w, 2.5, 1, shade(col, -22), false);
  }

  /* ---- Shoes ---- */
  function drawShoe(c, cust, x, y, back) {
    var col = cust.shoeColor;
    var skin = skinOf(cust);
    switch (cust.shoes) {
      case 'none':
        fillEllipse(c, x, y - 2, 4.2, 2.6, skin);
        fillEllipse(c, x + 1.5, y - 2.5, 0.8, 0.8, shade(skin, -14), false);
        break;
      case 'maryJane':
        fillRound(c, x - 5, y - 5, 10, 6, 3, col);
        c.strokeStyle = shade(col, -30); c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x - 4, y - 4); c.lineTo(x + 4, y - 4); c.stroke();
        break;
      case 'sneaker':
        fillRound(c, x - 6, y - 6, 12, 7, 3, col);
        fillRound(c, x - 6, y - 2, 12, 3, 1.5, PAL.cream);
        c.strokeStyle = PAL.cream; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x - 2, y - 5); c.lineTo(x + 1, y - 3.5); c.moveTo(x - 2, y - 3.5); c.lineTo(x + 1, y - 5); c.stroke();
        break;
      case 'boots':
        fillRound(c, x - 5, y - 11, 10, 12, 3, col);
        fillRound(c, x - 6, y - 3, 12, 4, 2, shade(col, -30));
        break;
      case 'sandals':
        fillRound(c, x - 5, y - 2, 10, 3, 1.5, col);
        c.strokeStyle = col; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(x - 4, y - 2); c.lineTo(x, y - 6); c.lineTo(x + 4, y - 2); c.stroke();
        fillEllipse(c, x, y - 6, 1.3, 1.3, PAL.sun, false);
        break;
      case 'rainBoots':
        fillRound(c, x - 5, y - 13, 10, 14, 3, col);
        fillRound(c, x - 6, y - 3, 12, 4, 2, shade(col, -30));
        c.save(); c.globalAlpha = 0.5; fillRound(c, x - 3, y - 11, 2, 7, 1, '#ffffff', false); c.restore();
        break;
      case 'ballet':
        fillRound(c, x - 5, y - 4, 10, 5, 2.5, col);
        c.strokeStyle = col; c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(x - 3, y - 4); c.lineTo(x + 2, y - 9); c.moveTo(x + 3, y - 4); c.lineTo(x - 2, y - 9); c.stroke();
        fillEllipse(c, x, y - 3.5, 1.2, 1, shade(col, -25), false);
        break;
      case 'rollerSkates':
        fillRound(c, x - 5, y - 9, 10, 9, 3, col);
        fillRound(c, x - 6, y - 3, 12, 3, 1.5, PAL.cream);
        fillEllipse(c, x - 3, y + 1, 2.2, 2.2, PAL.sun);
        fillEllipse(c, x + 3, y + 1, 2.2, 2.2, PAL.sun);
        break;
      case 'slippers':
        fillEllipse(c, x, y - 3, 6, 3.8, col);
        fillEllipse(c, x, y - 3.5, 3.6, 2, shade(col, 30), false);
        fillEllipse(c, x - 2, y - 8, 1.3, 3, col);
        fillEllipse(c, x + 2, y - 8, 1.3, 3, col);
        fillEllipse(c, x + 1.5, y - 4, 0.8, 0.8, PAL.ink, false);
        break;
    }
  }

  /* ---- Hats ---- */
  function drawHat(c, cust) {
    var hy = CH.headY, r = CH.headR;
    var col = cust.hatColor, dark = shade(col, -22), light = shade(col, 25);
    var i;
    switch (cust.hat) {
      case 'strawHat':
        fillEllipse(c, 0, hy - 6, r + 10, 5, '#e8c76a');
        fillEllipse(c, 0, hy - 11, r - 2, 7, '#f0d585');
        fillRound(c, -r + 1, hy - 10, (r - 1) * 2, 4, 2, col);
        break;
      case 'beret':
        fillEllipse(c, -1, hy - 10, r + 2, 7, col);
        fillEllipse(c, 6, hy - 15, 2.5, 2.5, dark);
        break;
      case 'flowerCrown':
        for (i = -2; i <= 2; i++) {
          var fx = i * 6.5;
          var fy = hy - 10 + Math.abs(i) * 1.6;
          fillEllipse(c, fx, fy, 3.6, 3.2, i % 2 === 0 ? col : PAL.cream, false);
          fillEllipse(c, fx, fy, 1.3, 1.3, PAL.sun, false);
        }
        break;
      case 'tiara':
        fillPath(c, [[-9, hy - 8], [-6, hy - 15], [-3, hy - 10], [0, hy - 19], [3, hy - 10], [6, hy - 15], [9, hy - 8]], PAL.gold);
        fillEllipse(c, 0, hy - 15, 1.8, 1.8, col, false);
        fillEllipse(c, -6, hy - 12.5, 1.1, 1.1, PAL.sky, false);
        fillEllipse(c, 6, hy - 12.5, 1.1, 1.1, PAL.sky, false);
        break;
      case 'bigBow':
        fillEllipse(c, -7, hy - 13, 6.5, 4.5, col);
        fillEllipse(c, 7, hy - 13, 6.5, 4.5, col);
        fillEllipse(c, 0, hy - 13, 2.6, 2.6, dark);
        break;
      case 'cap':
        c.beginPath(); c.arc(0, hy - 6, r + 1, Math.PI, Math.PI * 2); c.closePath();
        c.fillStyle = col; c.fill(); ink(c, 2);
        fillRound(c, 2, hy - 8, r + 6, 4, 2, dark);
        fillEllipse(c, 0, hy - r - 7, 1.6, 1.6, dark, false);
        break;
      case 'beanie':
        c.beginPath(); c.arc(0, hy - 5, r + 1.5, Math.PI, Math.PI * 2); c.closePath();
        c.fillStyle = col; c.fill(); ink(c, 2);
        fillRound(c, -r - 1.5, hy - 8, (r + 1.5) * 2, 5, 2, dark);
        fillEllipse(c, 0, hy - r - 7, 4, 4, light);
        break;
      case 'partyHat':
        fillPath(c, [[-7, hy - 9], [7, hy - 9], [0, hy - 30]], col);
        for (i = 0; i < 3; i++) fillEllipse(c, -2 + (i % 2) * 4, hy - 14 - i * 5, 1.3, 1.3, PAL.cream, false);
        fillEllipse(c, 0, hy - 30, 2.5, 2.5, PAL.sun);
        break;
      case 'unicorn':
        fillPath(c, [[-3, hy - 11], [3, hy - 11], [0, hy - 28]], col);
        c.strokeStyle = shade(col, -25); c.lineWidth = 1;
        for (i = 1; i <= 3; i++) { c.beginPath(); c.moveTo(-2.5 + i * 0.5, hy - 11 - i * 4); c.lineTo(2.5 - i * 0.5, hy - 12 - i * 4); c.stroke(); }
        fillEllipse(c, -9, hy - 10, 3, 4.5, PAL.cream);
        fillEllipse(c, 9, hy - 10, 3, 4.5, PAL.cream);
        fillEllipse(c, -9, hy - 10, 1.4, 2.6, PAL.pink, false);
        fillEllipse(c, 9, hy - 10, 1.4, 2.6, PAL.pink, false);
        break;
    }
  }

  /* ---- Bags ---- */
  function drawBagBack(c, cust) {
    if (cust.bag !== 'backpack') return;
    var col = cust.bagColor;
    fillRound(c, -16, CH.torsoTop + 2, 9, 15, 3, col);
    fillRound(c, -15, CH.torsoTop + 7, 7, 5, 2, shade(col, -25));
  }
  function drawBagFront(c, cust, handX, handY) {
    var col = cust.bagColor, dark = shade(col, -25);
    var top = CH.torsoTop, bot = CH.torsoBot;
    switch (cust.bag) {
      case 'backpack':
        c.strokeStyle = dark; c.lineWidth = 2;
        c.beginPath(); c.moveTo(-7, top + 1); c.lineTo(-7, top + 12); c.stroke();
        break;
      case 'purse':
        c.strokeStyle = dark; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-8, top + 1); c.lineTo(12, bot - 2); c.stroke();
        fillRound(c, 9, bot - 4, 9, 7, 3, col);
        fillEllipse(c, 13.5, bot - 4, 1.2, 1.2, PAL.gold, false);
        break;
      case 'messenger':
        c.strokeStyle = dark; c.lineWidth = 2;
        c.beginPath(); c.moveTo(-8, top + 1); c.lineTo(13, bot - 3); c.stroke();
        fillRound(c, 8, bot - 5, 12, 10, 2.5, col);
        fillRound(c, 8, bot - 5, 12, 4, 2, dark);
        break;
      case 'heartBag':
        c.strokeStyle = dark; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-8, top + 1); c.lineTo(12, bot - 3); c.stroke();
        heart(c, 13, bot - 1, 5, col, 1.5);
        break;
      case 'starBag':
        c.strokeStyle = dark; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-8, top + 1); c.lineTo(12, bot - 3); c.stroke();
        c.fillStyle = col; star(c, 13, bot - 1, 6.5); ink(c, 1.5);
        break;
      case 'tote':
        fillRound(c, handX - 1, handY + 1, 11, 11, 2, col);
        c.strokeStyle = dark; c.lineWidth = 1.6;
        c.beginPath(); c.arc(handX + 4.5, handY + 1, 3.5, Math.PI, 0); c.stroke();
        fillEllipse(c, handX + 4.5, handY + 6.5, 2, 2, PAL.cream, false);
        break;
      case 'basket':
        fillPath(c, [[handX - 2, handY + 2], [handX + 11, handY + 2], [handX + 9, handY + 11], [handX, handY + 11]], col);
        c.strokeStyle = dark; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(handX, handY + 5); c.lineTo(handX + 9, handY + 5); c.moveTo(handX + 0.5, handY + 8); c.lineTo(handX + 8.5, handY + 8); c.stroke();
        c.lineWidth = 1.6;
        c.beginPath(); c.arc(handX + 4.5, handY + 2, 4, Math.PI, 0); c.stroke();
        fillEllipse(c, handX + 3, handY, 1.6, 1.6, PAL.pink, false);
        fillEllipse(c, handX + 6.5, handY - 0.5, 1.6, 1.6, PAL.sun, false);
        break;
    }
  }

  /* ---- Accessories ---- */
  function drawAccessoryBack(c, cust) {
    if (cust.accessory !== 'wings') return;
    var col = cust.accColor;
    c.save();
    c.globalAlpha = 0.85;
    for (var sd = -1; sd <= 1; sd += 2) {
      fillEllipse(c, sd * 12, CH.torsoTop + 2, 9, 6, col);
      fillEllipse(c, sd * 10, CH.torsoTop + 11, 6, 4.5, col);
      fillEllipse(c, sd * 12, CH.torsoTop + 2, 4, 2.6, shade(col, 40), false);
    }
    c.restore();
  }
  function drawAccessoryNeck(c, cust) {
    var col = cust.accColor, top = CH.torsoTop;
    switch (cust.accessory) {
      case 'scarf':
        fillRound(c, -10, top - 3, 20, 6, 3, col);
        fillPath(c, [[4, top + 2], [10, top + 3], [8, top + 15], [3, top + 13]], col);
        c.strokeStyle = shade(col, -20); c.lineWidth = 1;
        c.beginPath(); c.moveTo(4.5, top + 12); c.lineTo(8, top + 12.5); c.stroke();
        break;
      case 'necklace':
        c.strokeStyle = PAL.gold; c.lineWidth = 1.2;
        c.beginPath(); c.arc(0, top - 3, 6, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
        for (var i = -2; i <= 2; i++) fillEllipse(c, i * 2.6, top + 1 + Math.abs(i) * -0.6 + 1.2, 1.3, 1.3, col, false);
        heart(c, 0, top + 5, 2.2, col, 1);
        break;
      case 'bowTie':
        fillPath(c, [[-6, top - 4], [-1, top - 1], [-6, top + 2]], col);
        fillPath(c, [[6, top - 4], [1, top - 1], [6, top + 2]], col);
        fillEllipse(c, 0, top - 1, 1.6, 1.6, shade(col, -25), false);
        break;
    }
  }
  function drawAccessoryFace(c, cust) {
    var hy = CH.headY, col = cust.accColor;
    switch (cust.accessory) {
      case 'glasses':
        c.strokeStyle = col; c.lineWidth = 1.6;
        c.beginPath(); c.arc(-4.5, hy + 1, 4.2, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(4.5, hy + 1, 4.2, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(-0.3, hy + 1); c.lineTo(0.3, hy + 1); c.moveTo(-8.7, hy); c.lineTo(-12, hy - 1); c.moveTo(8.7, hy); c.lineTo(12, hy - 1); c.stroke();
        break;
      case 'sunglasses':
        fillRound(c, -9, hy - 2.5, 8, 6.5, 3, PAL.ink, false);
        fillRound(c, 1, hy - 2.5, 8, 6.5, 3, PAL.ink, false);
        c.strokeStyle = col; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-1, hy); c.lineTo(1, hy); c.moveTo(-9, hy - 0.5); c.lineTo(-12, hy - 1.5); c.moveTo(9, hy - 0.5); c.lineTo(12, hy - 1.5); c.stroke();
        c.save(); c.globalAlpha = 0.5; fillRound(c, -7, hy - 1.5, 2.5, 2, 1, '#fff', false); fillRound(c, 3, hy - 1.5, 2.5, 2, 1, '#fff', false); c.restore();
        break;
    }
  }
  function drawWand(c, cust, handX, handY, t) {
    if (cust.accessory !== 'wand') return;
    var col = cust.accColor;
    fillRound(c, handX - 1, handY - 16, 2.4, 17, 1.2, PAL.cream);
    c.fillStyle = col; star(c, handX, handY - 18, 5); ink(c, 1.2);
    var tw = Math.sin((t || 0) / 6);
    if (tw > 0.3) { c.fillStyle = '#fff'; star(c, handX + 6, handY - 23, 2 * tw); }
  }

  /* ---- Ears ---- */
  function drawHumanEars(c, cust) {
    var hy = CH.headY, r = CH.headR;
    var skin = skinOf(cust);
    if (cust.earStyle === 'elf') {
      fillPath(c, [[-r + 2, hy - 1], [-r - 10, hy - 8], [-r + 1, hy + 6]], skin);
      fillPath(c, [[r - 2, hy - 1], [r + 10, hy - 8], [r - 1, hy + 6]], skin);
      fillPath(c, [[-r, hy], [-r - 6, hy - 5], [-r, hy + 4]], shade(skin, -14), true, false);
      fillPath(c, [[r, hy], [r + 6, hy - 5], [r, hy + 4]], shade(skin, -14), true, false);
    } else if (cust.earStyle === 'round') {
      fillEllipse(c, -r, hy + 2, 3, 4, skin);
      fillEllipse(c, r, hy + 2, 3, 4, skin);
      fillEllipse(c, -r, hy + 2, 1.3, 2, shade(skin, -14), false);
      fillEllipse(c, r, hy + 2, 1.3, 2, shade(skin, -14), false);
    }
    if ((cust.earStyle === 'round' || cust.earStyle === 'elf') && !cust.mannequin && cust.earColor !== skin) {
      /* a little jewel stud in the ear colour */
      fillEllipse(c, -r - 0.5, hy + 4.5, 1.1, 1.1, cust.earColor, false);
      fillEllipse(c, r + 0.5, hy + 4.5, 1.1, 1.1, cust.earColor, false);
    }
  }
  function drawAnimalEars(c, cust) {
    var hy = CH.headY, r = CH.headR;
    var col = cust.earColor, inner = PAL.peach;
    switch (cust.earStyle) {
      case 'cat':
        fillPath(c, [[-10, hy - 7], [-9, hy - 19], [-1, hy - 12]], col);
        fillPath(c, [[10, hy - 7], [9, hy - 19], [1, hy - 12]], col);
        fillPath(c, [[-8, hy - 9], [-8, hy - 15], [-4, hy - 11.5]], inner, true, false);
        fillPath(c, [[8, hy - 9], [8, hy - 15], [4, hy - 11.5]], inner, true, false);
        break;
      case 'bunny':
        fillEllipse(c, -6, hy - 22, 3.8, 11, col);
        fillEllipse(c, 6, hy - 22, 3.8, 11, col);
        fillEllipse(c, -6, hy - 22, 1.8, 7.5, inner, false);
        fillEllipse(c, 6, hy - 22, 1.8, 7.5, inner, false);
        break;
      case 'bear':
        fillEllipse(c, -10, hy - 9, 5, 5, col);
        fillEllipse(c, 10, hy - 9, 5, 5, col);
        fillEllipse(c, -10, hy - 9, 2.6, 2.6, inner, false);
        fillEllipse(c, 10, hy - 9, 2.6, 2.6, inner, false);
        break;
      case 'puppy':
        fillEllipse(c, -r - 2, hy + 3, 4, 9, col);
        fillEllipse(c, r + 2, hy + 3, 4, 9, col);
        break;
    }
  }

  /* ---- Face ---- */
  function drawEye(c, cust, x, y, style, blink, side) {
    var ec = cust.eyeColor;
    if (blink || style === 'happy') {
      c.strokeStyle = PAL.ink; c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath();
      if (style === 'happy' && !blink) c.arc(x, y + 1.5, 3, Math.PI * 1.1, Math.PI * 1.9);
      else { c.moveTo(x - 2.6, y + 0.5); c.lineTo(x + 2.6, y + 0.5); }
      c.stroke();
      return;
    }
    var rx = 2.6, ry = 3.2;
    if (style === 'sparkle') { rx = 3.1; ry = 3.9; }
    c.save();
    if (style === 'cat') {
      c.beginPath();
      c.moveTo(x - 3.6, y + 0.5);
      c.quadraticCurveTo(x, y - 4.2, x + 3.6, y - 0.8);
      c.quadraticCurveTo(x, y + 3.6, x - 3.6, y + 0.5);
      c.closePath();
      c.fillStyle = '#fff'; c.fill();
      c.clip();
    } else {
      fillEllipse(c, x, y, rx, ry, '#ffffff', false);
    }
    /* iris: darker rim at the top, lit from below, the anime shorthand
       for a wet, round eye */
    var ig = c.createLinearGradient(0, y - ry, 0, y + ry);
    ig.addColorStop(0, shade(ec, -35));
    ig.addColorStop(0.55, ec);
    ig.addColorStop(1, shade(ec, 45));
    fillEllipse(c, x, y + 0.3, rx * 0.86, ry * 0.86, ig, false);
    /* upper lid shadow across the white */
    c.save(); c.globalAlpha = 0.22;
    c.beginPath(); c.ellipse(x, y - ry * 0.55, rx, ry * 0.5, 0, 0, Math.PI * 2);
    c.fillStyle = PAL.ink; c.fill();
    c.restore();
    if (style === 'star') {
      c.fillStyle = PAL.ink; star(c, x, y + 0.4, 2.3);
    } else {
      fillEllipse(c, x, y + 0.6, rx * 0.5, ry * 0.56, PAL.ink, false);
    }
    fillEllipse(c, x - rx * 0.32, y - ry * 0.38, 1.05, 1.25, '#ffffff', false);
    if (style === 'sparkle') fillEllipse(c, x + rx * 0.4, y + ry * 0.4, 0.75, 0.75, '#ffffff', false);
    else fillEllipse(c, x + rx * 0.3, y + ry * 0.5, 0.55, 0.55, '#ffffff', false);
    c.restore();
    if (style === 'cat') {
      c.beginPath();
      c.moveTo(x - 3.6, y + 0.5);
      c.quadraticCurveTo(x, y - 4.2, x + 3.6, y - 0.8);
      c.quadraticCurveTo(x, y + 3.6, x - 3.6, y + 0.5);
      c.closePath();
      ink(c, 1);
    } else {
      /* the upper lid: a heavy lash line that thins toward the inner
         corner, with a flick at the outer one */
      c.save();
      c.strokeStyle = PAL.ink;
      c.lineCap = 'round';
      c.lineWidth = 1.5;
      c.beginPath();
      c.ellipse(x, y, rx + 0.2, ry + 0.2, 0, Math.PI * 1.08, Math.PI * 1.78);
      c.stroke();
      c.lineWidth = 0.9;
      c.beginPath();
      c.ellipse(x, y, rx + 0.2, ry + 0.2, 0, Math.PI * 1.78, Math.PI * 1.95);
      c.stroke();
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(x + side * (rx - 0.2), y - ry * 0.55);
      c.lineTo(x + side * (rx + 1.4), y - ry * 0.95);
      c.stroke();
      c.restore();
    }
    if (style === 'sparkle' || style === 'cat') {
      c.strokeStyle = PAL.ink; c.lineWidth = 1; c.lineCap = 'round';
      var dir = side;
      c.beginPath();
      c.moveTo(x + dir * rx, y - ry * 0.6); c.lineTo(x + dir * (rx + 1.6), y - ry * 0.9);
      c.moveTo(x + dir * rx * 0.7, y - ry * 0.9); c.lineTo(x + dir * (rx + 0.8), y - ry * 1.4);
      c.stroke();
    }
  }

  function drawFace(c, cust, blink, t) {
    if (cust.mannequin && !cust.showFace) return;
    var hy = CH.headY;
    var skin = skinOf(cust);
    var style = cust.eyeStyle || 'round';
    /* eyes */
    if (style === 'wink') {
      drawEye(c, cust, -4.5, hy + 1, 'round', blink, -1);
      drawEye(c, cust, 4.5, hy + 1, 'happy', false, 1);
    } else {
      drawEye(c, cust, -4.5, hy + 1, style, blink, -1);
      drawEye(c, cust, 4.5, hy + 1, style, blink, 1);
    }
    /* nose */
    switch (cust.noseStyle) {
      case 'button': fillEllipse(c, 0, hy + 4.6, 1.5, 1.1, shade(skin, -18), false); break;
      case 'dot': fillEllipse(c, 0, hy + 4.6, 0.8, 0.8, shade(skin, -40), false); break;
      case 'line':
        c.strokeStyle = shade(skin, -40); c.lineWidth = 1; c.lineCap = 'round';
        c.beginPath(); c.moveTo(0.4, hy + 3); c.quadraticCurveTo(1.6, hy + 5.4, 0, hy + 5.6); c.stroke();
        break;
      case 'freckles':
        fillEllipse(c, 0, hy + 4.6, 1.2, 0.9, shade(skin, -22), false);
        c.fillStyle = shade(skin, -32);
        for (var f = 0; f < 3; f++) {
          c.beginPath(); c.arc(-9 + f * 1.8, hy + 4.2 + (f % 2) * 1.3, 0.55, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.arc(9 - f * 1.8, hy + 4.2 + (f % 2) * 1.3, 0.55, 0, Math.PI * 2); c.fill();
        }
        break;
      case 'heart': heart(c, 0, hy + 4.6, 1.5, PAL.pink, false); break;
    }
    /* blush */
    c.save();
    c.globalAlpha = 0.5;
    fillEllipse(c, -8, hy + 5, 3, 2, PAL.peach, false);
    fillEllipse(c, 8, hy + 5, 3, 2, PAL.peach, false);
    c.restore();
    /* mouth */
    var lip = cust.lipColor || PAL.ink;
    var natural = lip === PAL.ink;
    var my = hy + 6.2;
    c.lineCap = 'round';
    switch (cust.mouthStyle) {
      case 'grin':
        c.beginPath(); c.arc(0, my - 1, 4.4, 0.1 * Math.PI, 0.9 * Math.PI); c.closePath();
        c.fillStyle = natural ? '#b03a4a' : lip; c.fill(); ink(c, 1.4);
        c.save(); c.beginPath(); c.arc(0, my - 1, 4.4, 0.1 * Math.PI, 0.9 * Math.PI); c.closePath(); c.clip();
        c.fillStyle = '#fff'; c.fillRect(-5, my - 2, 10, 2.2); c.restore();
        break;
      case 'open':
        c.beginPath(); c.arc(0, my - 0.5, 3.4, 0, Math.PI); c.closePath();
        c.fillStyle = '#b03a4a'; c.fill(); ink(c, natural ? 1.4 : 1);
        if (!natural) { c.strokeStyle = lip; c.lineWidth = 1.6; c.beginPath(); c.arc(0, my - 0.5, 3.4, 0, Math.PI); c.closePath(); c.stroke(); }
        c.save(); c.beginPath(); c.arc(0, my - 0.5, 3.4, 0, Math.PI); c.closePath(); c.clip();
        fillEllipse(c, 0, my + 3, 2.6, 2, PAL.pink, false); c.restore();
        break;
      case 'cat':
        if (!natural) { c.strokeStyle = lip; c.lineWidth = 3; c.beginPath(); c.arc(-2, my - 1, 2, 0.1 * Math.PI, 0.9 * Math.PI); c.arc(2, my - 1, 2, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke(); }
        c.strokeStyle = PAL.ink; c.lineWidth = 1.5;
        c.beginPath(); c.arc(-2, my - 1, 2, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
        c.beginPath(); c.arc(2, my - 1, 2, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
        break;
      case 'tongue':
        if (!natural) { c.strokeStyle = lip; c.lineWidth = 3.2; c.beginPath(); c.arc(0, my - 1.5, 3.2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
        c.strokeStyle = PAL.ink; c.lineWidth = 1.6;
        c.beginPath(); c.arc(0, my - 1.5, 3.2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
        fillEllipse(c, 1.2, my + 2.4, 1.8, 2.2, PAL.pink);
        break;
      case 'kiss':
        fillEllipse(c, 0, my, 1.7, 1.4, natural ? PAL.coral : lip, true);
        heart(c, 5, my - 2, 1.4, PAL.pink, false);
        break;
      default: /* smile */
        if (!natural) { c.strokeStyle = lip; c.lineWidth = 3.2; c.beginPath(); c.arc(0, my - 1.6, 3.2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
        c.strokeStyle = PAL.ink; c.lineWidth = 1.6;
        c.beginPath(); c.arc(0, my - 1.6, 3.2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
        break;
    }
  }

  function drawHeadBall(c, cust) {
    var skin = skinOf(cust);
    var hy = CH.headY, r = CH.headR;
    var head = function () { c.beginPath(); c.ellipse(0, hy, r, r + 0.5, 0, 0, Math.PI * 2); };
    head();
    c.fillStyle = skin;
    c.fill();
    /* the sphere's terminator: two warm bands round the jaw and the
       shadow cheek */
    celBands(c, head, skin, -2.4, -3, true, 0.85);
    c.save();
    head();
    c.clip();
    /* lit high on the left, falling off toward the jaw */
    var sg = c.createRadialGradient(-4, hy - 5, 1, -1, hy - 1, r + 2);
    sg.addColorStop(0, 'rgba(255,255,255,0.24)');
    sg.addColorStop(0.55, 'rgba(255,255,255,0)');
    sg.addColorStop(1, 'rgba(90,30,40,0.08)');
    c.fillStyle = sg;
    c.fillRect(-20, hy - 20, 40, 40);
    /* the chin catches a little bounce from the chest */
    var bg = c.createLinearGradient(0, hy + r, 0, hy + r - 5);
    bg.addColorStop(0, 'rgba(255,220,230,0.3)');
    bg.addColorStop(1, 'rgba(255,220,230,0)');
    c.fillStyle = bg;
    c.fillRect(-20, hy + r - 6, 40, 8);
    c.restore();
    head();
    c.fillStyle = skin;
    ink(c, 2);
    /* soft highlight on the cheekbone */
    c.save();
    c.globalAlpha = 0.4;
    fillEllipse(c, -6, hy + 1.5, 2.4, 1.5, '#ffffff', false);
    c.restore();
  }

  /* The angel ring: a toothed band of light across the crown, the
     shorthand every animated studio uses for glossy hair. Clipped to the
     cap so every style gets the same studio shine. */
  function drawHairGloss(c, cust) {
    if (cust.mannequin && !cust.showHair) return;
    var hy = CH.headY, r = CH.headR;
    var light = mix(shade(cust.hair, 52), '#ffffff', 0.25);
    c.save();
    c.beginPath();
    c.arc(0, hy, r + 1.2, Math.PI, Math.PI * 2);
    c.closePath();
    c.clip();
    c.fillStyle = light;
    c.globalAlpha = 0.62;
    var rr = r - 1.6;
    c.beginPath();
    /* upper edge: a smooth arc */
    c.arc(0, hy + 1.5, rr, Math.PI * 1.2, Math.PI * 1.8);
    /* lower edge: the arc again, two px down, broken into teeth */
    var n = 7;
    for (var i = n; i >= 0; i--) {
      var a = Math.PI * 1.8 - (Math.PI * 0.6) * (i / n);
      var dip = (i % 2 === 0) ? 3.2 : 1.4;
      c.lineTo(Math.cos(a) * (rr - dip), hy + 1.5 + Math.sin(a) * (rr - dip));
    }
    c.closePath();
    c.fill();
    /* a second, smaller glint higher up */
    c.globalAlpha = 0.45;
    c.beginPath();
    c.arc(0, hy + 1.5, rr - 5.5, Math.PI * 1.32, Math.PI * 1.5);
    c.arc(0, hy + 1.5, rr - 7.2, Math.PI * 1.5, Math.PI * 1.32, true);
    c.closePath();
    c.fill();
    c.restore();
  }

  /* Arm with a hand. pose: 'down' | 'hip' | 'up' */
  function drawArm(c, cust, isFront, swing, pose) {
    var skin = isFront ? skinOf(cust) : shade(skinOf(cust), -10);
    var top = CH.torsoTop;
    var ax = isFront ? 8 + swing * 0.4 : -13 - swing * 0.4;
    var hand;
    var aOpts = { warm: true, topShade: isFront ? 0.18 : 0.3 };
    if (pose === 'up') {
      volumeRound(c, ax, top - 14, 5, 18, 2.5, skin, 2, { warm: true });
      hand = { x: ax + 2.5, y: top - 15 };
      drawHand(c, hand.x, hand.y, skin);
      drawSleeve(c, cust, ax, top - 2, isFront);
    } else if (pose === 'hip') {
      c.save();
      c.translate(ax + 2.5, top + 3);
      c.rotate(isFront ? -0.9 : 0.9);
      volumeRound(c, -2.5, 0, 5, 13, 2.5, skin, 2, aOpts);
      c.restore();
      hand = { x: ax + 2.5 + (isFront ? 9 : -9), y: top + 12 };
      drawHand(c, hand.x, hand.y, skin);
      drawSleeve(c, cust, ax, top + 3, isFront);
    } else {
      /* the hanging arm throws a soft shadow onto the body beside it */
      if (isFront) {
        c.save();
        var as = c.createLinearGradient(ax - 4.5, 0, ax + 0.5, 0);
        as.addColorStop(0, 'rgba(42,16,48,0)');
        as.addColorStop(1, 'rgba(42,16,48,0.2)');
        c.fillStyle = as;
        c.fillRect(ax - 4.5, top + 4, 5, 13);
        c.restore();
      }
      volumeRound(c, ax, top + 3, 5, 14, 2.5, skin, 2, aOpts);
      hand = { x: ax + 2.5, y: top + 17 };
      drawHand(c, hand.x, hand.y, skin);
      drawSleeve(c, cust, ax, top + 3, isFront);
    }
    return hand;
  }
  /* A little mitten of a hand, shaded like the sphere it almost is. */
  function drawHand(c, x, y, skin) {
    fillEllipse(c, x, y, 3.4, 3.2, skin, false);
    c.save();
    c.beginPath(); c.ellipse(x, y, 3.4, 3.2, 0, 0, Math.PI * 2); c.clip();
    fillEllipse(c, x + 1.2, y + 1.3, 3.4, 3.2, shadowCached(skin, 18, true), false);
    fillEllipse(c, x + 0.1, y + 0.2, 3.1, 2.9, skin, false);
    fillEllipse(c, x - 1, y - 1.1, 1.1, 0.8, 'rgba(255,255,255,0.4)', false);
    c.restore();
    c.beginPath(); c.ellipse(x, y, 3.4, 3.2, 0, 0, Math.PI * 2);
    c.fillStyle = skin;
    ink(c, 2);
  }

  /* frame: 0..3 walk cycle (or 0 when standing). facing: 1 right, -1 left.
     lift raises the body for a hop while the shadow stays put.
     opts: { pose: 'walk'|'pose'|'wave'|'sad', t: frame counter, noShadow } */
  function drawCharacter(c, x, y, cust, frame, facing, scale, blink, lift, opts) {
    if (!cust) cust = Game.DEFAULT_LOOK;
    opts = opts || {};
    var sc = scale || 1;
    var f = facing || 1;
    c.save();
    c.translate(x, y);
    c.scale(sc * f, sc);

    var swing = 0, bob = 0;
    if (frame > 0) {
      swing = [0, 4, 0, -4][frame % 4];
      bob = [0, -1, 0, -1][frame % 4];
    }
    var pose = opts.pose || 'walk';
    var frontPose = pose === 'wave' ? 'up' : pose === 'pose' ? 'hip' : 'down';
    var backPose = pose === 'pose' ? 'hip' : 'down';

    if (!opts.noShadow) {
      softShadow(c, 0, 1, 19 - (lift || 0) * 0.4, 4.8, 0.3);
      /* a tight contact core right under the feet */
      softShadow(c, 0, 0.5, 9 - (lift || 0) * 0.3, 2.4, 0.3);
    }
    c.translate(0, bob - (lift || 0));
    /* standing still she breathes: a slow rise of the chest about the feet */
    if (frame === 0 && opts.t !== undefined) {
      var br = Math.sin(opts.t / 26) * 0.012;
      c.scale(1 - br * 0.6, 1 + br);
    }

    drawAccessoryBack(c, cust);
    drawJacketBack(c, cust);
    /* loose hair swings a touch behind the step */
    c.save();
    c.translate(-swing * 0.35, Math.abs(swing) * 0.15);
    drawHair(c, cust, true);
    c.restore();
    drawBagBack(c, cust);

    /* Legs, pants, shoes */
    drawLegs(c, cust, swing);
    drawPantsLegs(c, cust, swing);
    drawShoe(c, cust, -4 + swing * 0.5, 0, true);
    drawShoe(c, cust, 4 - swing * 0.5, 0, false);

    drawArm(c, cust, false, swing, backPose);

    drawBaseLayer(c, cust, swing);
    drawPantsTop(c, cust);
    drawSkirt(c, cust);
    drawDress(c, cust);
    drawJacketFront(c, cust);
    drawAccessoryNeck(c, cust);

    var hand = drawArm(c, cust, true, swing, frontPose);
    drawBagFront(c, cust, hand.x, hand.y);
    drawWand(c, cust, hand.x, hand.y, opts.t);

    /* the head's shadow on the shoulders, whatever she is wearing: a
       hard-edged core where the chin sits and a soft spread round it */
    c.save();
    c.globalAlpha = 0.12;
    fillEllipse(c, 1.5, CH.torsoTop + 2.5, 12, 4.2, '#2a1030', false);
    c.globalAlpha = 0.2;
    fillEllipse(c, 1, CH.torsoTop + 1.5, 9.5, 2.8, '#2a1030', false);
    c.restore();

    /* Head */
    drawHeadBall(c, cust);
    drawHumanEars(c, cust);
    drawHair(c, cust, false);
    drawHairGloss(c, cust);
    drawFace(c, cust, blink, opts.t);
    drawAnimalEars(c, cust);
    drawAccessoryFace(c, cust);
    if (!(cust.mannequin && !cust.showHat)) drawHat(c, cust);

    c.restore();
  }

  /* A faint mirror image under the feet, for polished floors. The
     reflection is clipped to `height` px below y and fades into
     `fadeColor` (the floor colour) so it never ends in a hard line. */
  function drawReflection(c, x, y, cust, frame, facing, scale, alpha, height, fadeColor, opts) {
    var sc = scale || 1, h = height || 28;
    c.save();
    c.beginPath();
    c.rect(x - 70 * sc, y + 1, 140 * sc, h);
    c.clip();
    c.globalAlpha = alpha || 0.2;
    c.translate(0, 2 * y + 2);
    c.scale(1, -1);
    var o = opts ? JSON.parse(JSON.stringify(opts)) : {};
    o.noShadow = true;
    drawCharacter(c, x, y, cust, frame, facing, sc, false, 0, o);
    c.restore();
    if (fadeColor) {
      var f = c.createLinearGradient(0, y + 1, 0, y + h);
      f.addColorStop(0, fadeColor.replace(/[\d.]+\)$/, '0)'));
      f.addColorStop(1, fadeColor);
      c.fillStyle = f;
      c.fillRect(x - 70 * sc, y + 1, 140 * sc, h);
    }
  }

  /* Head-and-shoulders chip for rosters. */
  function drawPortrait(c, cx, cy, size, cust) {
    c.save();
    c.beginPath();
    c.arc(cx, cy, size / 2, 0, Math.PI * 2);
    c.closePath();
    c.clip();
    c.fillStyle = PAL.sky;
    c.fillRect(cx - size, cy - size, size * 2, size * 2);
    var sc = size / 46;
    drawCharacter(c, cx, cy + size * 0.72, cust, 0, 1, sc, false, 0, { noShadow: true });
    c.restore();
    c.beginPath();
    c.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ink(c, 2.5);
  }

  /* A wardrobe tile: the look rendered and cropped to whatever the
     station changes -- the head for hair and faces, the whole body for
     clothes, the feet for shoes. Used by the wardrobe grid, the booth
     displays and the puzzle card alike, so an item always looks the
     same wherever it appears. */
  var HEAD_STATIONS = { skin: 1, hair: 1, eyes: 1, nose: 1, ears: 1, mouth: 1, hat: 1 };
  function drawLookTile(c, cx, cy, size, cust, stationId, opts) {
    opts = opts || {};
    c.save();
    if (opts.round) { c.beginPath(); c.arc(cx, cy, size / 2, 0, Math.PI * 2); c.closePath(); }
    else roundRect(c, cx - size / 2, cy - size / 2, size, size, size * 0.14);
    c.clip();
    if (opts.bg !== false) {
      var g = c.createLinearGradient(0, cy - size / 2, 0, cy + size / 2);
      g.addColorStop(0, opts.bgTop || '#ffffff');
      g.addColorStop(1, opts.bgBot || '#ffe9f3');
      c.fillStyle = g;
      c.fillRect(cx - size, cy - size, size * 2, size * 2);
    }
    var sc, fy;
    var faceAcc = stationId === 'extra' && (cust.accessory === 'glasses' || cust.accessory === 'sunglasses' || cust.accessory === 'necklace' || cust.accessory === 'bowTie' || cust.accessory === 'scarf');
    if (HEAD_STATIONS[stationId] || faceAcc) {
      var faceZoom = stationId === 'eyes' || stationId === 'nose' || stationId === 'mouth';
      sc = size / (stationId === 'hat' || stationId === 'ears' ? 50 : faceZoom ? 30 : 40);
      var headOff = (stationId === 'hat' || stationId === 'ears') ? 0.06 : (faceAcc ? -0.06 : faceZoom ? -0.04 : 0.02);
      fy = cy + size * headOff - CH.headY * sc;
    } else if (stationId === 'shoes') {
      sc = size / 30;
      fy = cy + size * 0.34;
    } else {
      sc = size / 66;
      fy = cy + size * 0.44;
    }
    drawCharacter(c, cx, fy, cust, 0, 1, sc, false, 0, { noShadow: true, t: opts.t });
    c.restore();
  }

  /* Random outfit for a runway model. Always dressed and shod. */
  function randomLook(rnd) {
    rnd = rnd || Math.random;
    function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
    var look = JSON.parse(JSON.stringify(Game.DEFAULT_LOOK));
    for (var i = 0; i < Game.STATIONS.length; i++) {
      var st = Game.STATIONS[i];
      if (st.field && st.variants.length) look[st.field] = pick(st.variants);
      if (st.colorField && st.colors) look[st.colorField] = pick(st.colors);
    }
    if (look.dress === 'none' && look.pants === 'none') {
      if (rnd() < 0.6) look.dress = pick(Game.STATIONS[6].variants.slice(1));
      else look.pants = pick(Game.STATIONS[7].variants.slice(1));
    }
    if (look.shoes === 'none') look.shoes = pick(Game.STATIONS[9].variants.slice(1));
    /* keep the natural lip colour most of the time: it reads younger */
    if (rnd() < 0.5) look.lipColor = Game.LIP_COLORS[0];
    return look;
  }

  /* ==================================================================
     Particles
     ================================================================== */
  function Particle(x, y, vx, vy, life, color, size, kind) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.color = color; this.size = size || 3;
    this.kind = kind || 'dot';
    this.spin = Math.random() * 6.28;
  }
  Particle.prototype.update = function () {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.kind === 'confetti' ? 0.04 : 0.12;
    if (this.kind === 'confetti') this.vx *= 0.98;
    this.life--;
  };
  Particle.prototype.draw = function (c) {
    var a = Math.max(0, this.life / this.maxLife);
    c.save();
    c.globalAlpha = a;
    c.fillStyle = this.color;
    if (this.kind === 'star') {
      star(c, this.x, this.y, this.size * (0.6 + a * 0.6));
    } else if (this.kind === 'heart') {
      heart(c, this.x, this.y, this.size * a, this.color, false);
    } else if (this.kind === 'confetti') {
      c.translate(this.x, this.y);
      c.rotate(this.spin + this.life * 0.1);
      c.fillRect(-this.size, -this.size * 0.5, this.size * 2, this.size);
    } else {
      c.beginPath();
      c.arc(this.x, this.y, this.size * a, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  };

  function spawnBurst(list, x, y, n, colors, spread, kind) {
    var sp = spread || 3;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var v = Math.random() * sp + 0.6;
      list.push(new Particle(
        x, y,
        Math.cos(a) * v,
        Math.sin(a) * v - 1.2,
        30 + Math.random() * 25,
        colors[Math.floor(Math.random() * colors.length)],
        2 + Math.random() * 2.5,
        kind
      ));
    }
  }

  /* ==================================================================
     Walkers
     ================================================================== */
  function Walker(x, y) {
    this.x = x;
    this.y = y;
    this.facing = 1;
    this.frame = 0;
    this.animTimer = 0;
    this.blinkTimer = Math.floor(Math.random() * 200);
    this.blink = false;
  }
  Walker.prototype.animate = function (moving) {
    if (moving) {
      this.animTimer++;
      if (this.animTimer >= 5) {
        this.animTimer = 0;
        this.frame = (this.frame % 4) + 1;
      }
    } else {
      this.frame = 0;
      this.animTimer = 0;
    }
    this.blinkTimer--;
    if (this.blinkTimer <= 0) {
      this.blink = !this.blink;
      this.blinkTimer = this.blink ? 8 : 120 + Math.floor(Math.random() * 180);
    }
  };

  var SPEED = 5.4;

  function Player(x, y) { Walker.call(this, x, y); }
  Player.prototype = Object.create(Walker.prototype);
  Player.prototype.constructor = Player;
  Player.prototype.update = function (keys, minX, maxX) {
    var moving = false;
    if (keys.left && !keys.right) { this.x -= SPEED; this.facing = -1; moving = true; }
    else if (keys.right && !keys.left) { this.x += SPEED; this.facing = 1; moving = true; }
    if (this.x < minX) this.x = minX;
    if (this.x > maxX) this.x = maxX;
    this.animate(moving);
  };
  Player.prototype.draw = function (c, cust, scale, t) {
    drawCharacter(c, this.x, this.y, cust, this.frame, this.facing, scale || 1, this.blink, 0, { t: t });
  };

  /* A runway model: walks toward targetX at a steady pace, then holds. */
  function Model(x, y, look, name) {
    Walker.call(this, x, y);
    this.look = look;
    this.name = name;
    this.targetX = x;
    this.speed = 2.2;
    this.pose = 'walk';
  }
  Model.prototype = Object.create(Walker.prototype);
  Model.prototype.constructor = Model;
  Model.prototype.update = function () {
    var dx = this.targetX - this.x;
    var moving = Math.abs(dx) > this.speed;
    if (moving) {
      this.x += (dx > 0 ? 1 : -1) * this.speed;
      this.facing = dx > 0 ? 1 : -1;
    } else {
      this.x = this.targetX;
    }
    this.animate(moving);
    return !moving;
  };
  Model.prototype.arrived = function () { return Math.abs(this.targetX - this.x) <= this.speed; };

  window.Game.entities = {
    getCachedSprite: getCachedSprite,
    drawSprite: drawSprite,
    clearSpriteCache: clearSpriteCache,
    ink: ink,
    inkColor: inkColor,
    roundRect: roundRect,
    fillRound: fillRound,
    fillEllipse: fillEllipse,
    fillPath: fillPath,
    shade: shade,
    mix: mix,
    shadowOf: shadowOf,
    celBands: celBands,
    star: star,
    heart: heart,
    heartPath: heartPath,
    seeded: seeded,
    softShadow: softShadow,
    CH: CH,
    drawCharacter: drawCharacter,
    drawPortrait: drawPortrait,
    drawReflection: drawReflection,
    drawLookTile: drawLookTile,
    randomLook: randomLook,
    Particle: Particle,
    spawnBurst: spawnBurst,
    Player: Player,
    Model: Model,
  };
})();
