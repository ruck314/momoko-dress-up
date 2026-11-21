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
  function clearSpriteCache() { spriteCache = {}; stillCache = {}; stillCount = 0; }

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

  /* drawCharacter thins every line it draws a little, so the figure's
     interior detail reads as drawing rather than as a sticker's die-cut */
  var inkMul = 1;
  function ink(c, w) {
    c.strokeStyle = inkColor(c.fillStyle);
    c.lineWidth = (w || 2) * inkMul;
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

  /* Feet at 0; the legs run from torsoBot up to the feet (18 units,
     lengthened from 12 in v1.6.2 after the feet read as too short). */
  var CH = {
    headR: 13,
    headY: -47,
    torsoTop: -36,
    torsoBot: -18,
    torsoW: 20,
    legLen: 18,
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
    /* one clip to the shape itself; the two lighter bands are then just
       the same outline filled a step and a half toward the light */
    c.save();
    pathFn();
    c.clip();
    c.fillStyle = shadowCached(col, Math.round(24 * s), warm);
    c.fillRect(-120, -140, 240, 280);
    c.translate(dx, dy);
    pathFn();
    c.fillStyle = shadowCached(col, Math.round(11 * s), warm);
    c.fill();
    c.translate(dx * 0.45, dy * 0.45);
    pathFn();
    c.fillStyle = col;
    c.fill();
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
    var vg = c.createRadialGradient(-6, -32, 2, -2, -26, 36);
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
    /* folds: soft valleys fanning from the waist to the hem, each with
       a lit ridge beside it, that drift with the step */
    if (opts.drape && !LOW) {
      var y0 = opts.drape[0], y1 = opts.drape[1], hw = opts.drape[2] || 16;
      var sw = MOTION.swing * 0.35;
      for (var fi = -2; fi <= 2; fi++) {
        var bx = fi * hw * 0.42 + sw, tx = fi * hw * 0.16;
        c.fillStyle = 'rgba(60,20,80,0.16)';
        c.beginPath(); c.moveTo(tx, y0); c.lineTo(bx + 1.6, y1 + 2); c.lineTo(bx - 0.6, y1 + 2); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.16)';
        c.beginPath(); c.moveTo(tx - 0.4, y0); c.lineTo(bx - 0.8, y1 + 2); c.lineTo(bx - 2.6, y1 + 2); c.closePath(); c.fill();
      }
    }
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
  /* A limb that narrows from its root to its end, with a little swell
     a third of the way down: thigh to ankle, shoulder to wrist. */
  function taperPath(c, cx, y, wT, wB, h) {
    var rt = wT / 2, rb = wB / 2;
    c.beginPath();
    c.moveTo(cx - rt, y + rt);
    c.quadraticCurveTo(cx - rt - 0.35, y + h * 0.4, cx - rb, y + h - rb);
    c.arc(cx, y + h - rb, rb, Math.PI, 0, true);
    c.quadraticCurveTo(cx + rt + 0.2, y + h * 0.4, cx + rt, y + rt);
    c.arc(cx, y + rt, rt, 0, Math.PI, true);
    c.closePath();
  }
  function volumeTaper(c, x, y, w, wB, h, col, inkW, opts) {
    opts = opts || {};
    var cx = x + w / 2;
    var path = function () { taperPath(c, cx, y, w, wB, h); };
    path();
    c.fillStyle = col;
    c.fill();
    celBands(c, path, col, -w * 0.34, -h * 0.06, opts.warm, 0.9);
    c.save();
    path();
    c.clip();
    var g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.3)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.03)');
    g.addColorStop(1, 'rgba(42,16,48,0.1)');
    c.fillStyle = g;
    c.fillRect(x - 1, y, w + 2, h);
    if (opts.topShade) {
      var tg = c.createLinearGradient(0, y, 0, y + Math.min(h, 7));
      tg.addColorStop(0, 'rgba(42,16,48,' + opts.topShade + ')');
      tg.addColorStop(1, 'rgba(42,16,48,0)');
      c.fillStyle = tg;
      c.fillRect(x - 1, y, w + 2, Math.min(h, 7));
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
  /* A small prop -- a shoe, a hat, a bag: the same stepped shadow as the
     figure wearing it, without the torso's studio lighting. dx/dy point
     toward the light. */
  function celShape(c, pathFn, col, inkW, dx, dy) {
    pathFn();
    c.fillStyle = col;
    c.fill();
    celBands(c, pathFn, col, dx === undefined ? -1.3 : dx, dy === undefined ? -1.5 : dy, false, 1);
    pathFn();
    c.fillStyle = col;
    ink(c, inkW || 2);
  }
  function ellPath(c, cx, cy, rx, ry) {
    return function () { c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); };
  }
  /* the small hard highlight of a polished surface */
  function glint(c, x, y, rx, ry, a) {
    c.save();
    c.globalAlpha = a || 0.5;
    fillEllipse(c, x, y, rx, ry, '#ffffff', false);
    c.restore();
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
  /* Fringe locks, right to left, relative to headY:
     [valley x, valley y, tip x, tip y]. */
  var FRINGE = [
    [9.6, -3.4, 6.6, -1.0],
    [4.2, -4.4, 1.0, 2.6],
    [-1.6, -3.8, -4.6, -0.8],
    [-7.4, -3.4, -10.6, 2.6],
  ];
  /* Low detail: the engine sets this while it paints the floor
     reflection, where faces and fine strands sit above the band's top
     edge or under its fade, so they are skipped rather than painted
     into nothing. */
  var LOW = false;
  function setLowDetail(on) { LOW = !!on; }
  function isLowDetail() { return LOW; }
  /* What the figure is doing this frame, for hair that swings */
  var MOTION = { t: 0, moving: false, swing: 0 };
  function hairSway(sd) {
    var a = Math.sin(MOTION.t / 38 + sd) * 0.035;
    if (MOTION.moving) a += 0.07 + Math.sin(MOTION.t / 4) * 0.03;
    return a;
  }
  /* A lock of hair traced from segments on the right of the face
     (sd = 1) or mirrored to the left (sd = -1), swung about a root.
     Segments: ['M', x, y] | ['Q', cx, cy, x, y] | ['B', x1, y1, x2, y2, x, y]. */
  function lockTrace(c, segs, sd) {
    c.beginPath();
    for (var i = 0; i < segs.length; i++) {
      var g = segs[i];
      if (g[0] === 'M') c.moveTo(sd * g[1], g[2]);
      else if (g[0] === 'Q') c.quadraticCurveTo(sd * g[1], g[2], sd * g[3], g[4]);
      else c.bezierCurveTo(sd * g[1], g[2], sd * g[3], g[4], sd * g[5], g[6]);
    }
    c.closePath();
  }
  function hairLock(c, segs, sd, col, rootX, rootY, rot, strands) {
    c.save();
    c.translate(sd * rootX, rootY);
    c.rotate(rot || 0);
    c.translate(-sd * rootX, -rootY);
    var path = function () { lockTrace(c, segs, sd); };
    if (!strands || LOW) {
      /* an under-lock or a reflection: flat colour and its line */
      path();
      c.fillStyle = col;
      c.fill();
      ink(c, 2);
      c.restore();
      return;
    }
    /* one clip carries both the stepped shadow bands and the strands */
    c.save();
    path();
    c.clip();
    c.fillStyle = shadowCached(col, 24, false);
    c.fill();
    c.translate(-2.4, -2.4);
    path();
    c.fillStyle = shadowCached(col, 11, false);
    c.fill();
    c.translate(-1.1, -1.1);
    path();
    c.fillStyle = col;
    c.fill();
    c.translate(3.5, 3.5);
    /* strands following the lock, then a long glossy streak */
    c.lineCap = 'round';
    c.strokeStyle = shadowCached(col, 30, false);
    c.globalAlpha = 0.45;
    c.lineWidth = 0.8;
    c.beginPath();
    for (var s = 0; s < strands.length; s++) {
      var st = strands[s];
      c.moveTo(sd * st[0], st[1]);
      c.quadraticCurveTo(sd * st[2], st[3], sd * st[4], st[5]);
    }
    c.stroke();
    c.strokeStyle = mix(shade(col, 50), '#ffffff', 0.25);
    c.globalAlpha = 0.5;
    c.lineWidth = 1.3;
    c.beginPath();
    var g0 = strands[0];
    c.moveTo(sd * (g0[0] - 1.6), g0[1] + 1);
    c.quadraticCurveTo(sd * (g0[2] - 1.8), g0[3], sd * (g0[2] - 1.2), g0[3] + (g0[5] - g0[3]) * 0.4);
    c.stroke();
    c.restore();
    path();
    c.fillStyle = col;
    ink(c, 2);
    c.restore();
  }
  function hairTie(c, x, y, col) {
    fillEllipse(c, x, y, 2.6, 2.6, col);
    glint(c, x - 0.8, y - 0.9, 0.9, 0.7, 0.7);
  }
  /* Locks framing the face in front of the ears, for every style that
     has hair at the temples; the long styles let them fall further. */
  function drawSideLocks(c, cust) {
    if (cust.mannequin && !cust.showHair) return;
    var hs = cust.hairStyle;
    if (hs === 'pixie' || hs === 'curly') return;
    var hy = CH.headY, r = CH.headR;
    var len = (hs === 'bob' || hs === 'longWavy' || hs === 'longBraids') ? 13 : 8.5;
    for (var sd = -1; sd <= 1; sd += 2) {
      hairLock(c, [
        ['M', r - 4.8, hy - 4],
        ['Q', r + 0.4, hy - 2.5, r - 0.6, hy + 4],
        ['Q', r - 0.8, hy + len * 0.8, r - 2.2, hy + len],
        ['Q', r - 2.6, hy + len * 0.55, r - 4.2, hy + 2],
      ], sd, cust.hair, r - 2.5, hy - 3, hairSway(sd) * 0.4,
      [[r - 2.8, hy - 2, r - 1.8, hy + 3, r - 2.3, hy + len - 1.5]]);
    }
  }

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
          for (i = -1; i <= 1; i += 2) {
            /* an under-lock peeking out behind the main tail */
            hairLock(c, [
              ['M', r - 1, hy - 4],
              ['B', r + 11, hy - 5, r + 17, hy + 9, r + 15, hy + 18],
              ['Q', r + 14, hy + 23, r + 11, hy + 24],
              ['Q', r + 10, hy + 12, r + 1, hy + 2],
            ], i, shade(col, -8), r, hy - 4, hairSway(i) * 1.15);
            hairLock(c, [
              ['M', r - 3, hy - 7],
              ['B', r + 11, hy - 12, r + 18, hy + 2, r + 15, hy + 13],
              ['Q', r + 13, hy + 21, r + 6, hy + 26],
              ['Q', r + 9, hy + 15, r + 4, hy + 6],
              ['Q', r + 1, hy + 0.5, r - 3, hy - 1],
            ], i, col, r, hy - 4, hairSway(i),
            [[r + 3, hy - 6, r + 13, hy + 2, r + 9, hy + 20], [r + 1, hy - 2, r + 9, hy + 5, r + 7, hy + 18]]);
            hairTie(c, i * (r + 0.5), hy - 4, PAL.sun);
          }
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
          hairLock(c, [
            ['M', r - 3, hy - 8],
            ['B', r + 9, hy - 11, r + 15, hy + 3, r + 12, hy + 13],
            ['Q', r + 10.5, hy + 20, r + 5.5, hy + 24],
            ['Q', r + 8, hy + 14, r + 3, hy + 6],
            ['Q', r, hy, r - 3, hy - 3],
          ], 1, col, r, hy - 5, hairSway(1),
          [[r + 1, hy - 7, r + 11, hy + 1, r + 8, hy + 18], [r, hy - 4, r + 8, hy + 5, r + 6.5, hy + 16]]);
          hairTie(c, r, hy - 5, PAL.pink);
          break;
        case 'sidePony':
          hairLock(c, [
            ['M', r - 1.5, hy - 3],
            ['B', r + 8, hy - 3, r + 13, hy + 9, r + 10.5, hy + 19],
            ['Q', r + 8.5, hy + 26, r + 4, hy + 28],
            ['Q', r + 6.5, hy + 18, r + 3, hy + 10],
            ['Q', r + 1, hy + 4, r - 1.5, hy + 3],
          ], 1, col, r + 3, hy, hairSway(1),
          [[r + 3, hy - 1, r + 10, hy + 8, r + 7.5, hy + 22], [r + 2, hy + 3, r + 7, hy + 12, r + 5.5, hy + 22]]);
          fillEllipse(c, r + 3, hy, 4, 4, PAL.sun, false);
          glint(c, r + 1.8, hy - 1.2, 1.3, 1, 0.6);
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
      /* the fringe: five locks swept toward the part, the ones over the
         eyes kept short, the middle and outer ones hanging lower */
      var cap = function () {
        c.beginPath();
        c.arc(0, hy, r + 1.5, Math.PI, Math.PI * 2);
        c.lineTo(r + 1.5, hy + 1);
        var prev = [r + 1.5, hy + 1];
        for (var k = 0; k < FRINGE.length; k++) {
          var L = FRINGE[k];
          /* up the lock's right edge into the valley, then down its
             bulging left edge to the next tip */
          c.quadraticCurveTo(L[0] + 0.5, prev[1] - 1.4, L[0], hy + L[1]);
          c.quadraticCurveTo(L[0] - 0.8, hy + L[3] - 2.2, L[2], hy + L[3]);
          prev = [L[2], hy + L[3]];
        }
        c.quadraticCurveTo(-r - 0.5, hy + 1.6, -r - 1.5, hy + 1);
        c.closePath();
      };
      /* the fringe throws its own shape onto the brow beneath it */
      if (!cust.mannequin) {
        c.save();
        headPath(c); c.clip();
        c.translate(0.9, 2.1);
        cap();
        c.fillStyle = 'rgba(140,50,60,0.26)';
        c.fill();
        c.restore();
      }
      cap();
      c.fillStyle = col;
      c.fill();
      celBands(c, cap, col, -2.2, -2.8, false, 1);
      c.save();
      cap();
      c.clip();
      /* light pours over the crown and the fringe falls into shade */
      var hg = c.createLinearGradient(0, hy - r - 2, 0, hy + 3);
      hg.addColorStop(0, 'rgba(255,255,255,0.18)');
      hg.addColorStop(0.55, 'rgba(255,255,255,0)');
      hg.addColorStop(1, 'rgba(42,16,48,0.22)');
      c.fillStyle = hg;
      c.fillRect(-r - 4, hy - r - 4, r * 2 + 8, r + 10);
      /* the parting between locks: a dark groove from each valley up
         toward the crown, and a light edge on each lock's lit side */
      if (!LOW) {
      c.lineCap = 'round';
      c.strokeStyle = shadowCached(col, 30, false);
      c.lineWidth = 0.9;
      c.globalAlpha = 0.55;
      c.beginPath();
      var k2, F;
      for (k2 = 0; k2 < FRINGE.length; k2++) {
        F = FRINGE[k2];
        c.moveTo(F[0], hy + F[1]);
        c.quadraticCurveTo(F[0] * 1.08 + 0.6, hy - r * 0.45, F[0] * 0.35 + 1, hy - r + 1.5);
      }
      c.stroke();
      c.strokeStyle = mix(shade(col, 45), '#ffffff', 0.2);
      c.lineWidth = 0.8;
      c.globalAlpha = 0.5;
      c.beginPath();
      for (k2 = 0; k2 < FRINGE.length; k2++) {
        F = FRINGE[k2];
        c.moveTo(F[0] - 1.1, hy + F[1] - 1.5);
        c.quadraticCurveTo(F[0] - 1.6, hy + F[3] - 3, F[2] + 0.7, hy + F[3] - 1.4);
      }
      c.stroke();
      /* rim light: the room's key light catching the crown's lit edge */
      c.globalAlpha = 0.75;
      c.strokeStyle = '#fff3e6';
      c.lineWidth = 1.1;
      c.beginPath();
      c.arc(0, hy, r + 0.7, Math.PI * 1.06, Math.PI * 1.42);
      c.stroke();
      c.globalAlpha = 0.4;
      c.strokeStyle = '#cfe0ff';
      c.beginPath();
      c.arc(0, hy, r + 0.8, Math.PI * 1.7, Math.PI * 1.92);
      c.stroke();
      }
      c.restore();
      cap();
      c.fillStyle = col;
      ink(c, 2);
      switch (cust.hairStyle) {
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
    }
  }

  /* ---- Legs, base layer, pants ---- */
  function skinOf(cust) { return cust.mannequin ? MANNEQUIN_SKIN : cust.skin; }

  function drawLegs(c, cust, swing) {
    var skin = skinOf(cust);
    var bot = CH.torsoBot;
    /* the legs vanish into shadow where they meet the hem */
    var legOpts = { warm: true, topShade: 0.3 };
    volumeTaper(c, -7.2 + swing * 0.5, bot, 6.4, 4.4, CH.legLen, skin, 2, legOpts);
    volumeTaper(c, 0.8 - swing * 0.5, bot, 6.4, 4.4, CH.legLen, skin, 2, legOpts);
  }

  function drawPantsLegs(c, cust, swing) {
    var col = cust.pantsColor, dark = shade(col, -20), light = shade(col, 25);
    var bot = CH.torsoBot;
    var lx = -7 + swing * 0.5, rx = 1 - swing * 0.5;
    var pOpts = { topShade: 0.22 };
    var L = CH.legLen + 2;      /* trouser legs start 2 above the hip */
    switch (cust.pants) {
      case 'jeans':
        volumeRound(c, lx - 0.5, bot - 2, 7, L, 2.5, col, 2, pOpts);
        volumeRound(c, rx - 0.5, bot - 2, 7, L, 2.5, col, 2, pOpts);
        c.strokeStyle = light; c.lineWidth = 1;
        /* a pale seam down the outside of each leg to the turn-up */
        c.beginPath(); c.moveTo(lx + 1, bot + 3); c.lineTo(lx + 1, -2.5); c.moveTo(rx + 5, bot + 3); c.lineTo(rx + 5, -2.5); c.stroke();
        break;
      case 'leggings':
        volumeRound(c, lx, bot - 2, 6, L, 3, col, 2, pOpts);
        volumeRound(c, rx, bot - 2, 6, L, 3, col, 2, pOpts);
        break;
      case 'stripey':
        for (var s = 0; s < 2; s++) {
          var x = s === 0 ? lx : rx;
          c.save();
          roundRect(c, x, bot - 2, 6, L, 3); c.clip();
          c.fillStyle = col; c.fillRect(x, bot - 2, 6, L);
          c.fillStyle = PAL.cream;
          for (var y = bot; y < -2; y += 4) c.fillRect(x, y, 6, 2);
          c.restore();
          roundRect(c, x, bot - 2, 6, L, 3); ink(c, 2);
        }
        break;
      case 'shorts':
        volumeRound(c, lx - 1, bot - 3, 8, 8, 2.5, col);
        volumeRound(c, rx - 1, bot - 3, 8, 8, 2.5, col);
        fillRound(c, -8, bot - 4, 16, 3, 1.5, dark, false);
        break;
      case 'overalls':
        volumeRound(c, lx - 0.5, bot - 2, 7, L, 2.5, col, 2, pOpts);
        volumeRound(c, rx - 0.5, bot - 2, 7, L, 2.5, col, 2, pOpts);
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
      shadedFill(c, polyPath(c, [[-9, waist], [9, waist], [15, bot + 7], [-15, bot + 7]]), col, 2, { drape: [waist, bot + 7, 15] });
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
      }, col, 2, { drape: [waist, bot + 10, 17] });
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
    celShape(c, rrPath(c, -9, top + 8, 18, 10, 3), col, 2, -2, -1.6);
    fillRound(c, -4, top + 11, 8, 5, 2, shade(col, -20));
    fillEllipse(c, -6, top + 9, 1.3, 1.3, PAL.sun, false);
    fillEllipse(c, 6, top + 9, 1.3, 1.3, PAL.sun, false);
  }

  /* The cream camisole and shorts she starts the day in. */
  function drawBaseLayer(c, cust, swing) {
    var top = CH.torsoTop, bot = CH.torsoBot;
    var cream = cust.mannequin ? '#f7f0f6' : PAL.cream;
    if (cust.pants === 'none') {
      volumeRound(c, -8 + swing * 0.5, bot - 3, 7, 7, 2.5, cream);
      volumeRound(c, 1 - swing * 0.5, bot - 3, 7, 7, 2.5, cream);
    }
    if (cust.dress === 'none') {
      shadedFill(c, function () {
        /* a little A-line: snug at the shoulders, easing out to the hem */
        c.beginPath();
        c.moveTo(-5, top);
        c.lineTo(5, top);
        c.quadraticCurveTo(9, top, 9, top + 4);
        c.lineTo(10, bot);
        c.quadraticCurveTo(10, bot + 2, 8, bot + 2);
        c.lineTo(-8, bot + 2);
        c.quadraticCurveTo(-10, bot + 2, -10, bot);
        c.lineTo(-9, top + 4);
        c.quadraticCurveTo(-9, top, -5, top);
        c.closePath();
      }, cream, 2, { strength: 0.8 });
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
        shadedFill(c, polyPath(c, [[-9, top], [9, top], [16, bot + 8], [-16, bot + 8]]), col, 2, { drape: [bot - 8, bot + 8, 16] });
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
        shadedFill(c, polyPath(c, [[-9, top], [9, top], [15, bot + 7], [-15, bot + 7]]), col, 2, { drape: [bot - 7, bot + 7, 15] });
        fillPath(c, [[-9, top], [9, top], [6, top + 8], [-6, top + 8]], PAL.cream);
        fillRound(c, -4, top + 6, 8, 4, 2, PAL.coral);
        c.strokeStyle = light; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-13, bot + 3); c.lineTo(13, bot + 3); c.stroke();
        break;
      case 'star':
        shadedFill(c, polyPath(c, [[-9, top], [9, top], [15, bot + 7], [-15, bot + 7]]), col, 2, { drape: [bot - 7, bot + 7, 15] });
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
        }, col, 2, { drape: [bot - 6, bot + 12, 22] });
        /* satin sheen */
        c.save(); c.globalAlpha = 0.35;
        c.beginPath(); c.moveTo(-6, bot - 4); c.quadraticCurveTo(-14, bot + 4, -12, bot + 11); c.lineTo(-4, bot + 11); c.quadraticCurveTo(-2, bot + 2, -2, bot - 4); c.closePath();
        c.fillStyle = '#fff'; c.fill(); c.restore();
        fillRound(c, -10, bot - 7, 20, 3.5, 1.5, light);
        fillEllipse(c, 0, bot - 5.5, 2.4, 2.4, PAL.sun, false);
        for (i = -18; i <= 18; i += 9) fillEllipse(c, i, bot + 12, 4.5, 2, light, false);
        break;
      case 'princess':
        shadedFill(c, polyPath(c, [[-8, top], [8, top], [18, bot + 10], [-18, bot + 10]]), col, 2, { drape: [bot - 8, bot + 10, 18] });
        fillEllipse(c, -10, top + 2, 4, 3.5, light);
        fillEllipse(c, 10, top + 2, 4, 3.5, light);
        c.strokeStyle = PAL.gold; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-17, bot + 7); c.lineTo(17, bot + 7); c.stroke();
        c.beginPath(); c.moveTo(0, top + 3); c.lineTo(0, bot + 9); c.stroke();
        for (i = 0; i < 3; i++) fillEllipse(c, 0, top + 6 + i * 5, 1.3, 1.3, PAL.gold, false);
        break;
      case 'sundress':
        shadedFill(c, polyPath(c, [[-8, top + 2], [8, top + 2], [16, bot + 9], [-16, bot + 9]]), col, 2, { drape: [bot - 8, bot + 9, 16] });
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
        shadedFill(c, polyPath(c, [[-9, top], [9, top], [13, bot + 10], [-13, bot + 10]]), col, 2, { drape: [bot - 4, bot + 10, 13] });
        /* wide sleeves */
        volumeRound(c, -19, top + 3, 9, 15, 3, col);
        volumeRound(c, 10, top + 3, 9, 15, 3, col);
        /* crossed collar */
        fillPath(c, [[-7, top], [0, top + 9], [-2, top + 10], [-9, top + 1]], PAL.cream);
        fillPath(c, [[7, top], [0, top + 9], [2, top + 10], [9, top + 1]], PAL.cream);
        /* obi */
        fillRound(c, -10, top + 11, 20, 6, 1.5, dark);
        fillRound(c, -4, top + 12, 8, 4, 1, PAL.sun, false);
        for (i = 0; i < 4; i++) fillEllipse(c, -8 + i * 5, bot + 5 + (i % 2) * 2, 1.6, 1.6, light, false);
        break;
      case 'polka':
        shadedFill(c, polyPath(c, [[-9, top], [9, top], [16, bot + 8], [-16, bot + 8]]), col, 2, { drape: [bot - 8, bot + 8, 16] });
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
      }, col, 2, { drape: [top + 4, top + 30, 17] });
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
        shadedFill(c, polyPath(c, [[-10, top], [-3, top], [-3, bot + 4], [-10, bot + 4]]), col, 2, { dx: -1.6, dy: -2 });
        shadedFill(c, polyPath(c, [[10, top], [3, top], [3, bot + 4], [10, bot + 4]]), col, 2, { dx: -1.6, dy: -2 });
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
        shadedFill(c, polyPath(c, [[-11, top], [-2, top], [-2, bot + 5], [-11, bot + 5]]), col, 2, { dx: -1.8, dy: -2 });
        shadedFill(c, polyPath(c, [[11, top], [2, top], [2, bot + 5], [11, bot + 5]]), col, 2, { dx: -1.8, dy: -2 });
        c.strokeStyle = dark; c.lineWidth = 1.2;
        for (i = top + 4; i < bot + 4; i += 4) { c.beginPath(); c.moveTo(-10, i); c.lineTo(-3, i); c.moveTo(3, i); c.lineTo(10, i); c.stroke(); }
        for (i = 0; i < 3; i++) fillEllipse(c, -2.5, top + 5 + i * 5, 1.2, 1.2, PAL.cream, false);
        break;
      case 'raincoat':
        shadedFill(c, polyPath(c, [[-10, top - 1], [10, top - 1], [14, bot + 9], [-14, bot + 9]]), col, 2, { drape: [bot - 6, bot + 9, 14] });
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
        shadedFill(c, polyPath(c, [[-11, top], [-2, top], [-2, bot + 4], [-11, bot + 4]]), col, 2, { dx: -1.8, dy: -2 });
        shadedFill(c, polyPath(c, [[11, top], [2, top], [2, bot + 4], [11, bot + 4]]), col, 2, { dx: -1.8, dy: -2 });
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
        var foot = function () {
          c.beginPath();
          c.moveTo(x - 3.6, y - 3.4);
          c.quadraticCurveTo(x + 0.5, y - 4.6, x + 3.6, y - 3);
          c.quadraticCurveTo(x + 5.2, y - 1.4, x + 3.6, y + 0.2);
          c.lineTo(x - 3, y + 0.2);
          c.quadraticCurveTo(x - 4.8, y - 1.4, x - 3.6, y - 3.4);
          c.closePath();
        };
        foot();
        c.fillStyle = skin;
        c.fill();
        fillEllipse(c, x + 1.2, y - 0.8, 3.2, 1, shadowCached(skin, 20, true), false);
        c.strokeStyle = shadowCached(skin, 30, true); c.lineWidth = 0.6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x + 2.2, y - 0.4); c.lineTo(x + 2.4, y - 1.6); c.moveTo(x + 3.6, y - 0.6); c.lineTo(x + 3.9, y - 1.6); c.stroke();
        foot();
        c.fillStyle = skin;
        ink(c, 2);
        break;
      case 'maryJane':
        celShape(c, rrPath(c, x - 5, y - 5, 10, 6, 3), col, 2, -1.2, -1.3);
        c.strokeStyle = shade(col, -30); c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x - 4, y - 4); c.lineTo(x + 4, y - 4); c.stroke();
        glint(c, x - 2, y - 2.2, 1.7, 0.8, 0.55);
        break;
      case 'sneaker':
        celShape(c, rrPath(c, x - 6, y - 6, 12, 7, 3), col, 2, -1.3, -1.4);
        fillRound(c, x - 6, y - 2, 12, 3, 1.5, PAL.cream);
        c.strokeStyle = PAL.cream; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x - 2, y - 5); c.lineTo(x + 1, y - 3.5); c.moveTo(x - 2, y - 3.5); c.lineTo(x + 1, y - 5); c.stroke();
        break;
      case 'boots':
        celShape(c, rrPath(c, x - 5, y - 11, 10, 12, 3), col, 2, -1.6, -1);
        fillRound(c, x - 6, y - 3, 12, 4, 2, shade(col, -30));
        glint(c, x - 2.6, y - 7.5, 0.8, 2, 0.35);
        break;
      case 'sandals':
        fillRound(c, x - 5, y - 2, 10, 3, 1.5, col);
        c.strokeStyle = col; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(x - 4, y - 2); c.lineTo(x, y - 6); c.lineTo(x + 4, y - 2); c.stroke();
        fillEllipse(c, x, y - 6, 1.3, 1.3, PAL.sun, false);
        break;
      case 'rainBoots':
        celShape(c, rrPath(c, x - 5, y - 13, 10, 14, 3), col, 2, -1.6, -1);
        fillRound(c, x - 6, y - 3, 12, 4, 2, shade(col, -30));
        c.save(); c.globalAlpha = 0.5; fillRound(c, x - 3, y - 11, 2, 7, 1, '#ffffff', false); c.restore();
        break;
      case 'ballet':
        celShape(c, rrPath(c, x - 5, y - 4, 10, 5, 2.5), col, 2, -1.1, -1.1);
        glint(c, x - 2.4, y - 2.6, 1.4, 0.6, 0.5);
        c.strokeStyle = col; c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(x - 3, y - 4); c.lineTo(x + 2, y - 9); c.moveTo(x + 3, y - 4); c.lineTo(x - 2, y - 9); c.stroke();
        fillEllipse(c, x, y - 3.5, 1.2, 1, shade(col, -25), false);
        break;
      case 'rollerSkates':
        celShape(c, rrPath(c, x - 5, y - 9, 10, 9, 3), col, 2, -1.5, -1.1);
        fillRound(c, x - 6, y - 3, 12, 3, 1.5, PAL.cream);
        fillEllipse(c, x - 3, y + 1, 2.2, 2.2, PAL.sun);
        fillEllipse(c, x + 3, y + 1, 2.2, 2.2, PAL.sun);
        glint(c, x - 3.6, y + 0.4, 0.7, 0.6, 0.7);
        glint(c, x + 2.4, y + 0.4, 0.7, 0.6, 0.7);
        break;
      case 'slippers':
        celShape(c, ellPath(c, x, y - 3, 6, 3.8), col, 2, -1.3, -1.2);
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
        celShape(c, ellPath(c, 0, hy - 6, r + 10, 5), '#e8c76a', 2, -1.5, -1.6);
        celShape(c, ellPath(c, 0, hy - 11, r - 2, 7), '#f0d585', 2, -2, -2);
        fillRound(c, -r + 1, hy - 10, (r - 1) * 2, 4, 2, col);
        break;
      case 'beret':
        volEllipse(c, -1, hy - 10, r + 2, 7, col);
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
        celShape(c, polyPath(c, [[-9, hy - 8], [-6, hy - 15], [-3, hy - 10], [0, hy - 19], [3, hy - 10], [6, hy - 15], [9, hy - 8]]), PAL.gold, 2, -1.1, -0.9);
        fillEllipse(c, 0, hy - 15, 1.8, 1.8, col, false);
        glint(c, -0.6, hy - 15.6, 0.6, 0.5, 0.8);
        fillEllipse(c, -6, hy - 12.5, 1.1, 1.1, PAL.sky, false);
        fillEllipse(c, 6, hy - 12.5, 1.1, 1.1, PAL.sky, false);
        break;
      case 'bigBow':
        volEllipse(c, -7, hy - 13, 6.5, 4.5, col);
        volEllipse(c, 7, hy - 13, 6.5, 4.5, col);
        fillEllipse(c, 0, hy - 13, 2.6, 2.6, dark);
        break;
      case 'cap':
        celShape(c, function () { c.beginPath(); c.arc(0, hy - 6, r + 1, Math.PI, Math.PI * 2); c.closePath(); }, col, 2, -2.4, -1.2);
        glint(c, -5, hy - 13, 2.6, 1.3, 0.3);
        fillRound(c, 2, hy - 8, r + 6, 4, 2, dark);
        fillEllipse(c, 0, hy - r - 7, 1.6, 1.6, dark, false);
        break;
      case 'beanie':
        celShape(c, function () { c.beginPath(); c.arc(0, hy - 5, r + 1.5, Math.PI, Math.PI * 2); c.closePath(); }, col, 2, -2.4, -1.2);
        fillRound(c, -r - 1.5, hy - 8, (r + 1.5) * 2, 5, 2, dark);
        volEllipse(c, 0, hy - r - 7, 4, 4, light);
        break;
      case 'partyHat':
        celShape(c, polyPath(c, [[-7, hy - 9], [7, hy - 9], [0, hy - 30]]), col, 2, -2.2, 0);
        for (i = 0; i < 3; i++) fillEllipse(c, -2 + (i % 2) * 4, hy - 14 - i * 5, 1.3, 1.3, PAL.cream, false);
        fillEllipse(c, 0, hy - 30, 2.5, 2.5, PAL.sun);
        break;
      case 'unicorn':
        celShape(c, polyPath(c, [[-3, hy - 11], [3, hy - 11], [0, hy - 28]]), col, 2, -1.2, 0);
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
    celShape(c, rrPath(c, -16, CH.torsoTop + 2, 9, 15, 3), col, 2, -1.6, -1.4);
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
        celShape(c, rrPath(c, 9, bot - 4, 9, 7, 3), col, 2, -1.3, -1.4);
        glint(c, 11.4, bot - 1.6, 1.4, 0.7, 0.5);
        fillEllipse(c, 13.5, bot - 4, 1.2, 1.2, PAL.gold, false);
        break;
      case 'messenger':
        c.strokeStyle = dark; c.lineWidth = 2;
        c.beginPath(); c.moveTo(-8, top + 1); c.lineTo(13, bot - 3); c.stroke();
        celShape(c, rrPath(c, 8, bot - 5, 12, 10, 2.5), col, 2, -1.5, -1.5);
        fillRound(c, 8, bot - 5, 12, 4, 2, dark);
        break;
      case 'heartBag':
        c.strokeStyle = dark; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-8, top + 1); c.lineTo(12, bot - 3); c.stroke();
        celShape(c, function () { heartPath(c, 13, bot - 1, 5); }, col, 1.5, -1, -1.1);
        glint(c, 11, bot - 3, 1, 0.7, 0.55);
        break;
      case 'starBag':
        c.strokeStyle = dark; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-8, top + 1); c.lineTo(12, bot - 3); c.stroke();
        c.fillStyle = col; star(c, 13, bot - 1, 6.5); ink(c, 1.5);
        glint(c, 12, bot - 2.4, 1.1, 0.8, 0.5);
        break;
      case 'tote':
        celShape(c, rrPath(c, handX - 1, handY + 1, 11, 11, 2), col, 2, -1.5, -1.5);
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
        celShape(c, polyPath(c, [[4, top + 2], [10, top + 3], [8, top + 15], [3, top + 13]]), col, 2, -1.4, -1);
        celShape(c, rrPath(c, -10, top - 3, 20, 6, 3), col, 2, -1.2, -1.5);
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
        c.beginPath(); c.arc(-5, hy + 2, 4.9, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(5, hy + 2, 4.9, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(-0.3, hy + 2); c.lineTo(0.3, hy + 2); c.moveTo(-9.9, hy + 1); c.lineTo(-12.5, hy); c.moveTo(9.9, hy + 1); c.lineTo(12.5, hy); c.stroke();
        break;
      case 'sunglasses':
        fillRound(c, -9.8, hy - 2.6, 9, 8.6, 3.4, PAL.ink, false);
        fillRound(c, 0.8, hy - 2.6, 9, 8.6, 3.4, PAL.ink, false);
        c.strokeStyle = col; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-1, hy); c.lineTo(1, hy); c.moveTo(-9.8, hy - 0.5); c.lineTo(-12.5, hy - 1.5); c.moveTo(9.8, hy - 0.5); c.lineTo(12.5, hy - 1.5); c.stroke();
        c.save(); c.globalAlpha = 0.5; fillRound(c, -7.8, hy - 1.4, 2.8, 2.4, 1, '#fff', false); fillRound(c, 2.8, hy - 1.4, 2.8, 2.4, 1, '#fff', false); c.restore();
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
  /* The eyes carry the character, so they get the most care: a white
     shadowed under the lid, an iris that is dark at the top and glows
     at the bottom with a limbal ring, a pupil tinted from the iris, two
     catchlights, and a tapered upper lid that thickens to a flick at the
     outer corner (side = -1 left eye, +1 right eye). */
  var EYE_RX = 3.3, EYE_RY = 4.1;
  function eyeOutline(c, x, y, rx, ry, style) {
    c.beginPath();
    if (style === 'cat') {
      c.moveTo(x - rx * 1.12, y + 0.8);
      c.quadraticCurveTo(x, y - ry * 1.25, x + rx * 1.12, y - 1);
      c.quadraticCurveTo(x, y + ry * 1.05, x - rx * 1.12, y + 0.8);
      c.closePath();
    } else {
      c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    }
  }
  function drawEye(c, cust, x, y, style, blink, side) {
    var ec = cust.eyeColor;
    var lash = '#3a1c32';
    if (blink || style === 'happy') {
      c.strokeStyle = lash; c.lineWidth = 1.9; c.lineCap = 'round';
      c.beginPath();
      if (style === 'happy' && !blink) c.arc(x, y + 2, 3.4, Math.PI * 1.12, Math.PI * 1.88);
      else { c.moveTo(x - 3.1, y + 0.8); c.quadraticCurveTo(x, y + 2.4, x + 3.1, y + 0.8); }
      c.stroke();
      /* the lash flick survives the blink */
      c.lineWidth = 1.1;
      c.beginPath();
      c.moveTo(x + side * 2.9, y + (style === 'happy' && !blink ? 0.2 : 0.9));
      c.lineTo(x + side * 4.3, y - 0.4);
      c.stroke();
      return;
    }
    var rx = EYE_RX, ry = EYE_RY;
    if (style === 'sparkle') { rx = 3.6; ry = 4.6; }
    c.save();
    eyeOutline(c, x, y, rx, ry, style);
    c.fillStyle = '#fffaf8';
    c.fill();
    c.clip();
    /* the lid's shadow across the top of the white */
    var wg = c.createLinearGradient(0, y - ry, 0, y - ry * 0.1);
    wg.addColorStop(0, 'rgba(120,60,110,0.45)');
    wg.addColorStop(1, 'rgba(120,60,110,0)');
    c.fillStyle = wg;
    c.fillRect(x - rx - 1, y - ry - 1, rx * 2 + 2, ry * 1.2);
    /* iris */
    var irx = rx * 0.86, iry = ry * 0.9, iy = y + ry * 0.08;
    var ig = c.createLinearGradient(0, iy - iry, 0, iy + iry);
    ig.addColorStop(0, shade(ec, -48));
    ig.addColorStop(0.45, ec);
    ig.addColorStop(1, mix(shade(ec, 30), '#ffffff', 0.3));
    fillEllipse(c, x, iy, irx, iry, ig, false);
    /* light pooling in the bottom of the iris */
    c.save();
    c.globalAlpha = 0.55;
    fillEllipse(c, x, iy + iry * 0.5, irx * 0.7, iry * 0.38, mix(shade(ec, 50), '#ffffff', 0.35), false);
    c.restore();
    /* limbal ring */
    c.beginPath(); c.ellipse(x, iy, irx, iry, 0, 0, Math.PI * 2);
    c.strokeStyle = shade(ec, -55); c.lineWidth = 0.6; c.stroke();
    /* pupil */
    var pupil = mix(shade(ec, -70), '#2a1024', 0.5);
    if (style === 'star') {
      c.fillStyle = pupil; star(c, x, iy, 2.5);
      c.fillStyle = mix(shade(ec, 60), '#ffffff', 0.5); star(c, x, iy, 1);
    } else {
      fillEllipse(c, x, iy + 0.2, irx * 0.46, iry * 0.52, pupil, false);
    }
    /* catchlights: the key light high on the lit side, a bounce low */
    fillEllipse(c, x - rx * 0.34, y - ry * 0.34, 1.25, 1.55, '#ffffff', false);
    fillEllipse(c, x + rx * 0.36, y + ry * 0.42, style === 'sparkle' ? 0.85 : 0.6, style === 'sparkle' ? 0.85 : 0.6, '#ffffff', false);
    if (style === 'sparkle') fillEllipse(c, x + rx * 0.3, y - ry * 0.5, 0.5, 0.5, '#ffffff', false);
    c.restore();
    /* lower lid: a whisper of line at the outer half */
    c.save();
    c.strokeStyle = lash; c.lineCap = 'round';
    c.globalAlpha = 0.55; c.lineWidth = 0.7;
    c.beginPath();
    if (side > 0) c.ellipse(x, y, rx, ry, 0, Math.PI * 0.12, Math.PI * 0.42);
    else c.ellipse(x, y, rx, ry, 0, Math.PI * 0.58, Math.PI * 0.88);
    c.stroke();
    c.restore();
    /* upper lid: one filled shape, hair-thin at the inner corner and
       heavy at the outer, ending in a flick */
    c.fillStyle = lash;
    c.beginPath();
    var N = 10, i, u, a, th;
    var top = style === 'cat' ? 1.25 : 1;
    for (i = 0; i <= N; i++) {
      u = i / N;
      a = side > 0 ? Math.PI * (1.08 + 0.86 * u) : Math.PI * (1.92 - 0.86 * u);
      th = 0.25 + 1.45 * u * u;
      var px = x + Math.cos(a) * (rx + 0.2 + th * 0.4), py = y + Math.sin(a) * (ry * top + 0.2 + th);
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.lineTo(x + side * (rx + 2), y - ry * 0.62);
    c.lineTo(x + side * (rx + 0.1), y - ry * 0.18);
    for (i = N; i >= 0; i--) {
      u = i / N;
      a = side > 0 ? Math.PI * (1.08 + 0.86 * u) : Math.PI * (1.92 - 0.86 * u);
      c.lineTo(x + Math.cos(a) * (rx - 0.15), y + Math.sin(a) * (ry * top - 0.15));
    }
    c.closePath();
    c.fill();
    if (style === 'sparkle' || style === 'cat') {
      c.strokeStyle = lash; c.lineWidth = 0.9; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x + side * rx * 0.75, y - ry * 0.85); c.lineTo(x + side * (rx + 1), y - ry * 1.35);
      c.moveTo(x + side * rx * 0.3, y - ry * 1.02); c.lineTo(x + side * (rx * 0.4 + 0.4), y - ry * 1.5);
      c.stroke();
    }
  }

  function drawFace(c, cust, blink, t) {
    if (cust.mannequin && !cust.showFace) return;
    var hy = CH.headY;
    var skin = skinOf(cust);
    var style = cust.eyeStyle || 'round';
    /* eyes */
    var ey = hy + 2;
    if (style === 'wink') {
      drawEye(c, cust, -5, ey, 'round', blink, -1);
      drawEye(c, cust, 5, ey, 'happy', false, 1);
    } else {
      drawEye(c, cust, -5, ey, style, blink, -1);
      drawEye(c, cust, 5, ey, style, blink, 1);
    }
    /* nose: lit on the bridge, a warm shadow tucked under its right */
    var ny = hy + 6.4;
    switch (cust.noseStyle) {
      case 'button':
        fillEllipse(c, 0.5, ny + 0.4, 1.5, 1, shadowCached(skin, 26, true), false);
        fillEllipse(c, 0, ny, 1.4, 1, shade(skin, -10), false);
        fillEllipse(c, -0.5, ny - 0.4, 0.55, 0.4, 'rgba(255,255,255,0.7)', false);
        break;
      case 'dot': fillEllipse(c, 0, ny, 0.8, 0.8, shade(skin, -40), false); break;
      case 'line':
        c.strokeStyle = shade(skin, -40); c.lineWidth = 1; c.lineCap = 'round';
        c.beginPath(); c.moveTo(0.4, ny - 1.6); c.quadraticCurveTo(1.6, ny + 0.8, 0, ny + 1); c.stroke();
        break;
      case 'freckles':
        fillEllipse(c, 0, ny, 1.2, 0.9, shade(skin, -22), false);
        c.fillStyle = shade(skin, -32);
        for (var f = 0; f < 3; f++) {
          c.beginPath(); c.arc(-9.5 + f * 1.8, ny - 0.6 + (f % 2) * 1.3, 0.55, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.arc(9.5 - f * 1.8, ny - 0.6 + (f % 2) * 1.3, 0.55, 0, Math.PI * 2); c.fill();
        }
        break;
      case 'heart': heart(c, 0, ny, 1.5, PAL.pink, false); break;
    }
    /* blush: a soft glow with three little hatch marks */
    if (!cust.mannequin) {
      for (var bs = -1; bs <= 1; bs += 2) {
        var bx = bs * 8.2, by = hy + 7.2;
        fillEllipse(c, bx, by, 3.4, 2.3, 'rgba(255,120,130,0.16)', false);
        fillEllipse(c, bx, by, 2.2, 1.4, 'rgba(255,120,130,0.2)', false);
        c.strokeStyle = 'rgba(230,80,100,0.38)'; c.lineWidth = 0.55; c.lineCap = 'round';
        c.beginPath();
        for (var hk = -1; hk <= 1; hk++) { c.moveTo(bx + hk * 1.3 + 0.5, by - 0.9); c.lineTo(bx + hk * 1.3 - 0.4, by + 0.8); }
        c.stroke();
      }
    }
    /* mouth */
    var lip = cust.lipColor || PAL.ink;
    var natural = lip === PAL.ink;
    var my = hy + 8.6;
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

  /* A round crown over full cheeks that ease into a soft chin, rather
     than a plain ball: the jaw is what turns a sticker into a face. */
  function headPath(c) {
    var hy = CH.headY, r = CH.headR;
    c.beginPath();
    c.arc(0, hy, r, Math.PI, Math.PI * 2);
    c.bezierCurveTo(r + 0.2, hy + 7.5, r * 0.62, hy + 13.2, 0, hy + 13.4);
    c.bezierCurveTo(-r * 0.62, hy + 13.2, -r - 0.2, hy + 7.5, -r, hy);
    c.closePath();
  }
  function drawHeadBall(c, cust) {
    var skin = skinOf(cust);
    var hy = CH.headY, r = CH.headR;
    var head = function () { headPath(c); };
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
      volumeTaper(c, ax, top - 14, 5, 4, 18, skin, 2, { warm: true });
      hand = { x: ax + 2.5, y: top - 15 };
      drawHand(c, hand.x, hand.y, skin);
      drawSleeve(c, cust, ax, top - 2, isFront);
    } else if (pose === 'hip') {
      c.save();
      c.translate(ax + 2.5, top + 3);
      c.rotate(isFront ? -0.9 : 0.9);
      volumeTaper(c, -2.6, 0, 5.2, 4, 13, skin, 2, aOpts);
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
      /* held a touch away from the body so the silhouette has air in
         it, and swung from the shoulder against the step */
      var th = (isFront ? -0.11 : 0.11) + (isFront ? -1 : 1) * swing * 0.03;
      c.save();
      c.translate(ax + 2.5, top + 3);
      c.rotate(th);
      volumeTaper(c, -2.6, 0, 5.2, 4, 14, skin, 2, aOpts);
      drawHand(c, 0, 14, skin);
      drawSleeve(c, cust, -2.5, 0, isFront);
      c.restore();
      hand = { x: ax + 2.5 - 14 * Math.sin(th), y: top + 3 + 14 * Math.cos(th) };
    }
    return hand;
  }
  /* A little mitten of a hand, shaded like the sphere it almost is. */
  function drawHand(c, x, y, skin) {
    /* the thumb, tucked forward of the mitten */
    fillEllipse(c, x - 2.4, y - 1.2, 1.5, 1.7, skin);
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

    var swing = 0, bob = 0, squash = 0;
    if (frame > 0) {
      swing = [0, 4, 0, -4][frame % 4];
      /* down on the stride, up on the passing step, with a matching
         squash and stretch about the feet */
      bob = [-1, 0.5, -1, 0.5][frame % 4];
      squash = [-0.018, 0.022, -0.018, 0.022][frame % 4];
    }
    MOTION.t = opts.t || 0;
    MOTION.moving = frame > 0;
    MOTION.swing = swing;
    var inkWas = inkMul;
    inkMul = 0.82;
    var pose = opts.pose || 'walk';
    var frontPose = pose === 'wave' ? 'up' : pose === 'pose' ? 'hip' : 'down';
    var backPose = pose === 'pose' ? 'hip' : 'down';

    if (!opts.noShadow) {
      softShadow(c, 0, 1, 19 - (lift || 0) * 0.4, 4.8, 0.3);
      /* a tight contact core right under the feet */
      softShadow(c, 0, 0.5, 9 - (lift || 0) * 0.3, 2.4, 0.3);
    }
    c.translate(0, bob - (lift || 0));
    if (squash) c.scale(1 + squash * 0.8, 1 - squash);
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
    drawSideLocks(c, cust);
    drawHair(c, cust, false);
    if (!LOW) {
      drawHairGloss(c, cust);
      drawFace(c, cust, blink, opts.t);
    }
    drawAnimalEars(c, cust);
    drawAccessoryFace(c, cust);
    if (!(cust.mannequin && !cust.showHat)) drawHat(c, cust);

    inkMul = inkWas;
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

  /* Still tiles and portraits are whole characters that never move, so
     each is painted once into a sprite and blitted after that. The memo
     is keyed by the look itself and simply starts over when it fills. */
  var stillCache = {}, stillCount = 0;
  function stillSprite(key, size, drawFn) {
    key += '@' + Math.min(3, window.devicePixelRatio || 1);
    var spr = stillCache[key];
    if (spr) return spr;
    if (stillCount >= 160) { stillCache = {}; stillCount = 0; }
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    spr = document.createElement('canvas');
    spr.lw = spr.lh = 2 * Math.ceil(size / 2) + 6;   /* even, with a margin for the outline */
    spr.width = spr.height = Math.ceil(spr.lw * dpr);
    var g = spr.getContext('2d');
    g.scale(dpr, dpr);
    drawFn(g, spr.lw / 2, spr.lh / 2);
    stillCache[key] = spr;
    stillCount++;
    return spr;
  }

  /* Head-and-shoulders chip for rosters. */
  function drawPortrait(c, cx, cy, size, cust) {
    var spr = stillSprite('p|' + size + '|' + JSON.stringify(cust), size, function (g, x, y) { paintPortrait(g, x, y, size, cust); });
    c.drawImage(spr, cx - spr.lw / 2, cy - spr.lh / 2, spr.lw, spr.lh);
  }
  function paintPortrait(c, cx, cy, size, cust) {
    c.save();
    c.beginPath();
    c.arc(cx, cy, size / 2, 0, Math.PI * 2);
    c.closePath();
    c.clip();
    var pg = c.createLinearGradient(0, cy - size / 2, 0, cy + size / 2);
    pg.addColorStop(0, '#c4e8ff');
    pg.addColorStop(1, '#8cc4f2');
    c.fillStyle = pg;
    c.fillRect(cx - size, cy - size, size * 2, size * 2);
    var sc = size / 46;
    drawCharacter(c, cx, cy - size * 0.17 - CH.headY * sc, cust, 0, 1, sc, false, 0, { noShadow: true });
    c.restore();
    c.beginPath();
    c.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ink(c, 2.5);
  }

  /* A wardrobe tile: the look rendered and cropped to whatever the
     station changes -- the head for hair and faces, the whole body for
     clothes, the feet for shoes. Used by the wardrobe grid, the booth
     displays and the puzzle card alike, so an item always looks the
     same wherever it appears. A tile with no `opts.t` stands still and
     comes from the sprite memo. */
  var HEAD_STATIONS = { skin: 1, hair: 1, eyes: 1, nose: 1, ears: 1, mouth: 1, hat: 1 };
  function drawLookTile(c, cx, cy, size, cust, stationId, opts) {
    opts = opts || {};
    if (opts.t !== undefined) { paintLookTile(c, cx, cy, size, cust, stationId, opts); return; }
    var key = 't|' + stationId + '|' + size + '|' + (opts.round ? 1 : 0) + '|' + (opts.bg === false ? 0 : 1) + '|' +
      (opts.bgTop || '') + '|' + (opts.bgBot || '') + '|' + JSON.stringify(cust);
    var spr = stillSprite(key, size, function (g, x, y) { paintLookTile(g, x, y, size, cust, stationId, opts); });
    c.drawImage(spr, cx - spr.lw / 2, cy - spr.lh / 2, spr.lw, spr.lh);
  }
  function paintLookTile(c, cx, cy, size, cust, stationId, opts) {
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
      sc = size / 74;
      fy = cy + size * 0.46;
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
    setLowDetail: setLowDetail,
    isLowDetail: isLowDetail,
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
