/* entities.js – the character painter, look tiles, walkers and particles.
 *
 * House style (shared with the other Momoko games): flat fill or one
 * gradient per shape, then a 2px PAL.ink outline. Curves via
 * quadraticCurveTo / ellipse / rounded rects. That outline is what makes
 * canvas read as a storybook vector drawing rather than pixel art.
 *
 * A "look" is a plain record (see Game.DEFAULT_LOOK) naming a variant and
 * a colour for every station. drawCharacter() paints one, layer by layer,
 * with feet at (0,0) and ~62px tall at scale 1, on a small rig: legs and
 * arms are solved two-bone limbs (buildRig), the torso and head ride
 * their own frames, and an Animator per walker drives the walk cycle,
 * springs, turns, poses, blinks and idle fidgets in seconds. Inside the
 * figure the outlines run thin (inkMul) and every part gets cel bands
 * plus a warm key rim and a cool bounce rim (celPart).
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
    /* near-black fills (black hair) get a line darker than themselves */
    if (l < 0.2) out = shade(fill, -55);
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
    if (PAT && col === PATCOL && !LOW) drawPattern(c, PAT, col, -40, -64, 40, 16);
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
    rims(c, path, 0.7);
    path();
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

  /* ---- Rig helpers ---- */
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function smooth(k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }

  /* A damped spring, stepped in seconds. Underdamped ones (z < 1)
     overshoot and settle, which is all secondary motion is. */
  function Spring(w, z, x) { this.x = x || 0; this.v = 0; this.w = w; this.z = z; }
  Spring.prototype.step = function (target, dt) {
    var n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (var i = 0; i < n; i++) {
      this.v += (this.w * this.w * (target - this.x) - 2 * this.z * this.w * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  };

  /* Two-bone IK: the joint between a root (ax, ay) and an end (bx, by),
     on whichever side lies nearer the hint. Unreachable ends are pulled
     in along the line. */
  function ik2(ax, ay, bx, by, L1, L2, hx, hy) {
    var dx = bx - ax, dy = by - ay, d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    var dd = clamp(d, Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.002);
    var a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    var ux = dx / d, uy = dy / d, mx = ax + ux * a, my = ay + uy * a;
    var e1x = mx - uy * h, e1y = my + ux * h, e2x = mx + uy * h, e2y = my - ux * h;
    var d1 = (e1x - hx) * (e1x - hx) + (e1y - hy) * (e1y - hy);
    var d2 = (e2x - hx) * (e2x - hx) + (e2y - hy) * (e2y - hy);
    return d1 < d2 ? [e1x, e1y, ax + ux * dd, ay + uy * dd] : [e2x, e2y, ax + ux * dd, ay + uy * dd];
  }

  /* A jointed, tapered limb as one outline: root (r0), joint (r1), end
     (r2), with a swell midway along each bone, round caps and a soft
     bend at the joint. One path means one clean silhouette instead of
     two capsules stacked at the elbow or knee. */
  function limbPath(c, x0, y0, r0, x1, y1, r1, x2, y2, r2, s1, s2) {
    var a1 = Math.atan2(y1 - y0, x1 - x0), a2 = Math.atan2(y2 - y1, x2 - x1);
    var n1x = -Math.sin(a1), n1y = Math.cos(a1), n2x = -Math.sin(a2), n2y = Math.cos(a2);
    var jx = n1x + n2x, jy = n1y + n2y, jl = Math.sqrt(jx * jx + jy * jy) || 1;
    jx /= jl; jy /= jl;
    var mj = r1 / Math.max(0.6, n1x * jx + n1y * jy);
    var m1x = (x0 + x1) / 2, m1y = (y0 + y1) / 2, m2x = (x1 + x2) / 2, m2y = (y1 + y2) / 2;
    var q1 = (r0 + r1) / 2 + (s1 || 0), q2 = (r1 + r2) / 2 + (s2 || 0);
    c.beginPath();
    c.moveTo(x0 + n1x * r0, y0 + n1y * r0);
    c.quadraticCurveTo(lerp(x0, m1x, 0.5) + n1x * (r0 + q1) / 2 * 1.04, lerp(y0, m1y, 0.5) + n1y * (r0 + q1) / 2 * 1.04, m1x + n1x * q1, m1y + n1y * q1);
    c.quadraticCurveTo(x1 + jx * mj, y1 + jy * mj, m2x + n2x * q2, m2y + n2y * q2);
    c.quadraticCurveTo(lerp(m2x, x2, 0.5) + n2x * (q2 + r2) / 2 * 1.02, lerp(m2y, y2, 0.5) + n2y * (q2 + r2) / 2 * 1.02, x2 + n2x * r2, y2 + n2y * r2);
    c.arc(x2, y2, r2, a2 + Math.PI / 2, a2 - Math.PI / 2, true);
    c.quadraticCurveTo(lerp(m2x, x2, 0.5) - n2x * (q2 + r2) / 2 * 1.02, lerp(m2y, y2, 0.5) - n2y * (q2 + r2) / 2 * 1.02, m2x - n2x * q2, m2y - n2y * q2);
    c.quadraticCurveTo(x1 - jx * mj, y1 - jy * mj, m1x - n1x * q1, m1y - n1y * q1);
    c.quadraticCurveTo(lerp(x0, m1x, 0.5) - n1x * (r0 + q1) / 2 * 1.04, lerp(y0, m1y, 0.5) - n1y * (r0 + q1) / 2 * 1.04, x0 - n1x * r0, y0 - n1y * r0);
    c.arc(x0, y0, r0, a1 - Math.PI / 2, a1 + Math.PI / 2, true);
    c.closePath();
  }
  /* A point part-way down a jointed limb: k in 0..1 over both bones. */
  function alongLimb(x0, y0, x1, y1, x2, y2, k) {
    if (k <= 0.5) return [lerp(x0, x1, k * 2), lerp(y0, y1, k * 2)];
    return [lerp(x1, x2, k * 2 - 1), lerp(y1, y2, k * 2 - 1)];
  }

  /* Rim light: the shape's own outline, stroked with an offset and
     clipped to the shape, so only a sliver along one edge shows. The
     warm key catches the upper-left edge; a cool bounce the lower right. */
  function rimLight(c, pathFn, dx, dy, col, w) {
    /* the rims are the first character detail the adaptive fallback drops */
    if (LOW || (Game.FX && Game.FX.rim === false)) return;
    c.save();
    pathFn();
    c.clip();
    c.translate(dx, dy);
    pathFn();
    c.strokeStyle = col;
    c.lineWidth = w || 1;
    c.lineJoin = 'round';
    c.stroke();
    c.restore();
  }
  function rims(c, pathFn, s) {
    s = s || 1;
    rimLight(c, pathFn, 0.6 * s, 0.7 * s, 'rgba(255,246,228,0.42)', 0.9 * s);
    rimLight(c, pathFn, -0.6 * s, -0.45 * s, 'rgba(196,220,255,0.32)', 0.8 * s);
  }
  /* Fill, cel band, rim light and ink: the full treatment for a part. */
  function celPart(c, pathFn, col, o) {
    o = o || {};
    pathFn();
    c.fillStyle = col;
    c.fill();
    celBands(c, pathFn, col, o.dx === undefined ? -1.1 : o.dx, o.dy === undefined ? -1.2 : o.dy, o.warm, o.s || 1);
    if (o.rim !== false) rims(c, pathFn, o.rimS || 0.8);
    if (o.ink !== 0) {
      pathFn();
      c.fillStyle = col;
      ink(c, o.ink || 2);
    }
  }

  /* ---- Hair ---- */
  /* Fringe locks, right to left, relative to headY:
     [valley x, valley y, tip x, tip y]. */
  var FRINGE = [
    [10.4, -3.2, 8.6, 2.4],
    [6.6, -4.8, 4.2, 4.4],
    [2.4, -5.4, 0, 2.6],
    [-2.4, -5.0, -4.6, 4.6],
    [-6.6, -4.4, -8.8, 2.8],
  ];
  /* Low detail: the engine sets this while it paints the floor
     reflection, where faces and fine strands sit above the band's top
     edge or under its fade, so they are skipped rather than painted
     into nothing. */
  var LOW = false;
  function setLowDetail(on) { LOW = !!on; }
  function isLowDetail() { return LOW; }
  /* What the figure is doing this frame, for hair that swings */
  /* What the figure is doing this frame (the rig, see buildRig): hair,
     skirts and charms read their spring state from here. */
  var MOTION = { t: 0, moving: false, swing: 0, hairA: 0, hairB: 0, flare: 0, skirt: 0, lag: 0, yaw: 0 };
  /* Root and tip swing of a lock (positive = tip trails toward -x). */
  function hairSway(sd) {
    return MOTION.hairA + Math.sin(MOTION.t * 1.6 + sd) * 0.03;
  }
  /* A lock of hair traced from segments on the right of the face
     (sd = 1) or mirrored to the left (sd = -1). It bends rather than
     swings: each point turns about the root by the root angle plus the
     tip angle times its distance down the lock squared, so a tail
     curves and lags like hair instead of pivoting like a plank.
     Segments: ['M', x, y] | ['Q', cx, cy, x, y] | ['B', x1, y1, x2, y2, x, y]. */
  var BEND = { rx: 0, ry: 0, a: 0, b: 0, len: 20 };
  function bendX(x, y) {
    var d = clamp((y - BEND.ry) / BEND.len, 0, 1.3);
    var th = BEND.a + BEND.b * d * d, cs = Math.cos(th), sn = Math.sin(th);
    var dx = x - BEND.rx, dy = y - BEND.ry;
    return BEND.rx + dx * cs - dy * sn;
  }
  function bendY(x, y) {
    var d = clamp((y - BEND.ry) / BEND.len, 0, 1.3);
    var th = BEND.a + BEND.b * d * d, cs = Math.cos(th), sn = Math.sin(th);
    var dx = x - BEND.rx, dy = y - BEND.ry;
    return BEND.ry + dx * sn + dy * cs;
  }
  function lockTrace(c, segs, sd) {
    c.beginPath();
    for (var i = 0; i < segs.length; i++) {
      var g = segs[i];
      if (g[0] === 'M') c.moveTo(bendX(sd * g[1], g[2]), bendY(sd * g[1], g[2]));
      else if (g[0] === 'Q') c.quadraticCurveTo(bendX(sd * g[1], g[2]), bendY(sd * g[1], g[2]), bendX(sd * g[3], g[4]), bendY(sd * g[3], g[4]));
      else c.bezierCurveTo(bendX(sd * g[1], g[2]), bendY(sd * g[1], g[2]), bendX(sd * g[3], g[4]), bendY(sd * g[3], g[4]), bendX(sd * g[5], g[6]), bendY(sd * g[5], g[6]));
    }
    c.closePath();
  }
  /* rot: a number (root angle; the tip follows with the hair spring's
     lag) or [root, tip]. */
  function hairLock(c, segs, sd, col, rootX, rootY, rot, strands, len) {
    var ra = typeof rot === 'number' ? rot : (rot ? rot[0] : 0);
    var rb = typeof rot === 'number' ? MOTION.hairB * (rot === 0 ? 0 : 1) : (rot ? rot[1] : 0);
    var was = [BEND.rx, BEND.ry, BEND.a, BEND.b, BEND.len];
    BEND.rx = sd * rootX; BEND.ry = rootY; BEND.a = ra; BEND.b = rb; BEND.len = len || 22;
    var path = function () { lockTrace(c, segs, sd); };
    if (!strands || LOW) {
      /* an under-lock or a reflection: banded colour and its line */
      path();
      c.fillStyle = col;
      c.fill();
      if (!LOW) celBands(c, path, col, -1.4, -1.6, false, 1);
      path();
      c.fillStyle = col;
      ink(c, 2);
      BEND.rx = was[0]; BEND.ry = was[1]; BEND.a = was[2]; BEND.b = was[3]; BEND.len = was[4];
      return;
    }
    /* one clip carries the stepped shadow bands, strands and gloss */
    c.save();
    path();
    c.clip();
    c.fillStyle = shadowCached(col, 26, false);
    c.fill();
    c.translate(-1.5, -1.7);
    path();
    c.fillStyle = shadowCached(col, 11, false);
    c.fill();
    c.translate(-0.8, -0.9);
    path();
    c.fillStyle = col;
    c.fill();
    c.translate(2.3, 2.6);
    /* strands following the lock, then a long glossy streak */
    c.lineCap = 'round';
    c.strokeStyle = shadowCached(col, 34, false);
    c.globalAlpha = 0.5;
    c.lineWidth = 0.45;
    c.beginPath();
    var s, st;
    for (s = 0; s < strands.length; s++) {
      st = strands[s];
      c.moveTo(bendX(sd * st[0], st[1]), bendY(sd * st[0], st[1]));
      c.quadraticCurveTo(bendX(sd * st[2], st[3]), bendY(sd * st[2], st[3]), bendX(sd * st[4], st[5]), bendY(sd * st[4], st[5]));
    }
    c.stroke();
    c.strokeStyle = mix(shade(col, 55), '#fff8ec', 0.3);
    c.globalAlpha = 0.7;
    c.lineWidth = 0.9;
    c.beginPath();
    var g0 = strands[0];
    var gx0 = sd * (g0[0] - 1.4), gx1 = sd * (g0[2] - 1.6), gy1 = g0[3], gx2 = sd * (g0[2] - 1.1), gy2 = g0[3] + (g0[5] - g0[3]) * 0.38;
    c.moveTo(bendX(gx0, g0[1] + 1), bendY(gx0, g0[1] + 1));
    c.quadraticCurveTo(bendX(gx1, gy1), bendY(gx1, gy1), bendX(gx2, gy2), bendY(gx2, gy2));
    c.stroke();
    c.restore();
    rims(c, path, 0.8);
    path();
    c.fillStyle = col;
    ink(c, 2);
    BEND.rx = was[0]; BEND.ry = was[1]; BEND.a = was[2]; BEND.b = was[3]; BEND.len = was[4];
  }
  /* A glossy bobble where a tail is tied */
  function hairTie(c, x, y, col) {
    celPart(c, ellPath(c, x, y, 2.5, 2.5), col, { dx: -0.6, dy: -0.7, rim: false, ink: 1.6 });
    glint(c, x - 0.8, y - 0.9, 0.9, 0.7, 0.85);
  }
  /* A small satin bow: two loops, a knot and two tails that flutter */
  function ribbonBow(c, x, y, s, col, tails) {
    var loop = function (d) {
      return function () {
        c.beginPath();
        c.moveTo(x, y);
        c.bezierCurveTo(x + d * s * 0.5, y - s * 1.1, x + d * s * 1.6, y - s * 0.9, x + d * s * 1.45, y);
        c.bezierCurveTo(x + d * s * 1.6, y + s * 0.85, x + d * s * 0.5, y + s * 0.95, x, y);
        c.closePath();
      };
    };
    if (tails) {
      var sw = MOTION.hairA * 6 + Math.sin(MOTION.t * 3 + x) * 0.4;
      for (var d = -1; d <= 1; d += 2) {
        (function (d) {
          celPart(c, function () {
            c.beginPath();
            c.moveTo(x + d * s * 0.2, y + s * 0.2);
            c.quadraticCurveTo(x + d * s * 0.9 + sw * 0.4, y + s * 1.6, x + d * s * 0.7 + sw, y + s * 2.6);
            c.lineTo(x + d * s * 0.25 + sw, y + s * 2.2);
            c.lineTo(x + d * s * 0.05 + sw * 0.9, y + s * 2.7);
            c.quadraticCurveTo(x + d * s * 0.2 + sw * 0.3, y + s * 1.4, x - d * s * 0.15, y + s * 0.3);
            c.closePath();
          }, shade(col, -6), { dx: -0.5, dy: -0.5, rim: false, ink: 1.4 });
        })(d);
      }
    }
    celPart(c, loop(-1), col, { dx: -0.5, dy: -0.6, rimS: 0.5, ink: 1.5 });
    celPart(c, loop(1), col, { dx: -0.5, dy: -0.6, rimS: 0.5, ink: 1.5 });
    celPart(c, ellPath(c, x, y, s * 0.42, s * 0.5), shade(col, -10), { dx: -0.3, dy: -0.3, rim: false, ink: 1.3 });
    glint(c, x - s * 0.9, y - s * 0.35, s * 0.3, s * 0.16, 0.7);
  }

  /* Locks framing the face in front of the ears, for every style that
     has hair at the temples; the long styles let them fall further.
     In a three-quarter turn the near lock (-x) comes round the cheek
     and the far one slips behind it. */
  function drawSideLocks(c, cust) {
    if (cust.mannequin && !cust.showHair) return;
    var hs = cust.hairStyle;
    if (hs === 'pixie' || hs === 'curly') return;
    var hy = CH.headY, r = CH.headR, yaw = MOTION.yaw;
    var len = (hs === 'bob' || hs === 'longWavy' || hs === 'longBraids' || hs === 'longStraight' || hs === 'halfUp' || hs === 'drills' || hs === 'flip' || hs === 'braidCrown') ? 13.5 : 9;
    var hime = hs === 'longStraight';
    for (var sd = -1; sd <= 1; sd += 2) {
      var ox = sd < 0 ? yaw * 1.6 : -yaw * 2.4;
      if (sd > 0 && yaw > 0.55) continue;
      c.save();
      c.translate(ox, 0);
      if (hime) {
        /* the hime cut: a straight sheet cut level with the chin */
        hairLock(c, [
          ['M', r - 5.4, hy - 5],
          ['Q', r + 0.8, hy - 3, r + 0.2, hy + 4],
          ['Q', r + 0.4, hy + 9, r - 0.2, hy + 12.4],
          ['Q', r - 2.2, hy + 12.9, r - 4.4, hy + 12.4],
          ['Q', r - 4.6, hy + 4, r - 5.4, hy - 1],
        ], sd, cust.hair, r - 2.5, hy - 3, [MOTION.hairA * 0.25, MOTION.hairB * 0.2],
        [[r - 3.4, hy - 2, r - 2.2, hy + 4, r - 2.6, hy + 11.5], [r - 1.4, hy - 1, r - 0.8, hy + 5, r - 1, hy + 11.5]], 14);
      } else {
        hairLock(c, [
          ['M', r - 4.8, hy - 4],
          ['Q', r + 0.6, hy - 2.5, r - 0.4, hy + 4],
          ['Q', r - 0.4, hy + len * 0.8, r - 2.0 + 0.6, hy + len],
          ['Q', r - 2.4, hy + len * 0.6, r - 3.4, hy + len * 0.5],
          ['Q', r - 3.4, hy + len * 0.35, r - 4.2, hy + 2],
        ], sd, cust.hair, r - 2.5, hy - 3, [MOTION.hairA * 0.35, MOTION.hairB * 0.3],
        [[r - 2.8, hy - 2, r - 1.8, hy + 3, r - 1.9, hy + len - 1.5], [r - 3.6, hy, r - 3, hy + 4, r - 3.2, hy + len * 0.5]], len + 4);
      }
      c.restore();
    }
  }

  /* The back of the skull: a cap of hair behind the head that shows
     round the crown and, as she turns, behind the far cheek. */
  function drawHairBackCap(c, cust, col) {
    var hy = CH.headY, r = CH.headR, yaw = MOTION.yaw;
    var bx = -yaw * 2.6;
    var path = function () {
      c.beginPath();
      c.ellipse(bx, hy - 0.4, r + 1.9, r + 2.6, 0, Math.PI * 0.97, Math.PI * 2.03);
      c.quadraticCurveTo(bx + r + 1.2, hy + 6, bx + r - 1.5, hy + 7.5);
      c.lineTo(bx - r + 1.5, hy + 7.5);
      c.quadraticCurveTo(bx - r - 1.2, hy + 6, bx - (r + 1.9) * Math.cos(Math.PI * 0.03), hy - 0.4 + (r + 2.6) * Math.sin(Math.PI * 0.03));
      c.closePath();
    };
    celPart(c, path, col, { dx: -1.6, dy: -1.8, rimS: 1 });
  }

  /* A braid: alternating plaits down a bending line, a tie and a tuft. */
  function braidChain(c, col, x0, y0, n, step, sd, tieCol) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var y = y0 + i * step, x = x0 + (i % 2 ? 0.7 : -0.7) * sd;
      pts.push([bendX(x, y), bendY(x, y)]);
    }
    for (var k = 0; k < pts.length; k++) {
      (function (p, k) {
        var w = 2.9 - k * 0.12;
        celPart(c, function () { c.beginPath(); c.ellipse(p[0], p[1], w, step * 0.68, (k % 2 ? 0.45 : -0.45) * sd, 0, TAU); }, col,
          { dx: -0.7, dy: -0.8, rimS: 0.55, ink: 1.6 });
        if (!LOW) {
          c.beginPath();
          c.moveTo(p[0] - w * 0.5, p[1] - step * 0.25);
          c.quadraticCurveTo(p[0], p[1] - step * 0.6, p[0] + w * 0.5, p[1] - step * 0.25);
          c.strokeStyle = mix(shade(col, 55), '#fff8ec', 0.3);
          c.globalAlpha = 0.6; c.lineWidth = 0.6; c.stroke(); c.globalAlpha = 1;
        }
      })(pts[k], k);
    }
    var e = pts[pts.length - 1], ty = y0 + n * step - step * 0.3, tx = x0;
    var ex = bendX(tx, ty), ey = bendY(tx, ty);
    celPart(c, function () {
      c.beginPath();
      c.moveTo(ex - 1.8, ey);
      c.quadraticCurveTo(ex - 2.6, ey + 3.4, ex - 0.6, ey + 4.8);
      c.quadraticCurveTo(ex + 0.2, ey + 3, ex + 1.8, ey + 4.2);
      c.quadraticCurveTo(ex + 2.4, ey + 1.8, ex + 1.8, ey);
      c.closePath();
    }, col, { dx: -0.6, dy: -0.6, rim: false, ink: 1.5 });
    celPart(c, ellPath(c, ex, ey - 0.4, 2.4, 1.3), tieCol, { dx: -0.4, dy: -0.4, rim: false, ink: 1.4 });
    return e;
  }

  /* An ojou-sama ringlet: a spiral cone of hair that stretches and
     springs back as she lands. */
  function drill(c, col, x, y, sd, len) {
    var st = 1 + MOTION.lag * 0.06;
    var n = 4, segH = len / n * st;
    for (var i = n - 1; i >= 0; i--) {
      (function (i) {
        var w = 4.6 - i * 0.75, cy = y + i * segH;
        var bx0 = bendX(x, cy), by0 = bendY(x, cy), bx1 = bendX(x, cy + segH), by1 = bendY(x, cy + segH);
        celPart(c, function () {
          c.beginPath();
          c.moveTo(bx0 - w, by0);
          c.quadraticCurveTo(bx0 - w * 1.1, by0 + segH * 0.7, bx1 - w * 0.55 * sd, by1 + 0.6);
          c.quadraticCurveTo(bx1 + w * 0.8, by1 - 0.2, bx0 + w, by0 + 0.4);
          c.quadraticCurveTo(bx0, by0 - 1.4, bx0 - w, by0);
          c.closePath();
        }, col, { dx: -1, dy: -0.9, rimS: 0.6, ink: 1.6 });
        if (!LOW) {
          c.beginPath();
          c.moveTo(bx0 - w * 0.6, by0 + 0.6);
          c.quadraticCurveTo(bx0, by0 + segH * 0.5, bx0 + w * 0.7, by0 + segH * 0.2);
          c.strokeStyle = mix(shade(col, 55), '#fff8ec', 0.3);
          c.globalAlpha = 0.65; c.lineWidth = 0.7; c.stroke(); c.globalAlpha = 1;
        }
      })(i);
    }
  }

  /* How far a long style may hang. Where a gown's hem would leave just
     a sliver of hair showing below it, the tips stop short of the hem
     and tuck in behind the skirt. Returns a scale for the length. */
  var LONG_HEMS = { ballgown: 12, princess: 10, kimono: 10, starlight: 11, magical: 9.6 };
  function longHairK(cust) {
    var h = LONG_HEMS[cust.dress] || 0;
    if (cust.jacket === 'cape') h = Math.max(h, 12);
    if (cust.jacket === 'trench') h = Math.max(h, 9.6);
    if (cust.pants === 'maxiSkirt') h = Math.max(h, 13);
    if (h < 9.5 || h > 15) return 1;
    return (CH.torsoBot + h - 2.5 - CH.headY - 6) / 38;
  }
  function drawHair(c, cust, back) {
    if (cust.mannequin && !cust.showHair) return;
    var col = cust.hair;
    var hy = CH.headY;
    var r = CH.headR;
    var yaw = MOTION.yaw;
    var i, sd;
    /* flare is in body units for hems; locks take a small angle of it */
    var A = MOTION.hairA, B = MOTION.hairB, fl = MOTION.flare * 0.07;
    if (back) {
      col = shade(col, -8);
      c.save();
      c.translate(-yaw * 1.8, 0);
      switch (cust.hairStyle) {
        case 'twinTails':
          for (i = -1; i <= 1; i += 2) {
            var tr = [A - i * fl * 0.6, B];
            /* an under-lock peeking out behind the main tail */
            hairLock(c, [
              ['M', r - 1, hy - 4],
              ['B', r + 10, hy - 4, r + 15, hy + 10, r + 13.5, hy + 22],
              ['Q', r + 12.5, hy + 27, r + 9.5, hy + 29],
              ['Q', r + 9.5, hy + 15, r + 1, hy + 2],
            ], i, shade(col, -9), r, hy - 4, [tr[0] * 1.1, tr[1] * 1.25], null, 30);
            hairLock(c, [
              ['M', r - 3, hy - 7.5],
              ['B', r + 11, hy - 13, r + 19.5, hy + 2, r + 16.5, hy + 15],
              ['Q', r + 14.5, hy + 25, r + 7.5, hy + 31],
              ['Q', r + 10.5, hy + 24, r + 9.6, hy + 17],
              ['Q', r + 9, hy + 9, r + 3.5, hy + 4],
              ['Q', r + 1, hy + 0.5, r - 3, hy - 1],
            ], i, col, r, hy - 4, tr,
            [[r + 3, hy - 6, r + 14, hy + 2, r + 10, hy + 24], [r + 1, hy - 2, r + 10, hy + 6, r + 8.5, hy + 22], [r + 6, hy - 4, r + 16, hy + 8, r + 12, hy + 20]], 30);
          }
          break;
        case 'longBraids':
          for (sd = -1; sd <= 1; sd += 2) {
            BEND.rx = sd * (r + 0.5); BEND.ry = hy - 1; BEND.a = A - sd * fl * 0.5; BEND.b = B * 0.8; BEND.len = 28;
            braidChain(c, col, sd * (r + 0.8), hy + 1, 6, 4.4, sd, PAL.pink);
            BEND.a = 0; BEND.b = 0;
          }
          break;
        case 'buns':
          for (sd = -1; sd <= 1; sd += 2) {
            volEllipse(c, sd * (r + 3.5), hy - 7, 7, 7, col, 2);
            if (!LOW) {
              c.strokeStyle = shadowCached(col, 32, false); c.lineWidth = 0.6; c.globalAlpha = 0.6;
              c.beginPath(); c.arc(sd * (r + 3.8), hy - 6.6, 4, Math.PI * 0.8, Math.PI * 2.1); c.stroke();
              c.beginPath(); c.arc(sd * (r + 3.4), hy - 6.2, 1.8, Math.PI * 1.1, Math.PI * 2.3); c.stroke();
              c.globalAlpha = 1;
              c.strokeStyle = mix(shade(col, 55), '#fff8ec', 0.3); c.lineWidth = 1.1; c.globalAlpha = 0.75;
              c.beginPath(); c.arc(sd * (r + 3.5), hy - 7, 5.2, Math.PI * 1.15, Math.PI * 1.6); c.stroke();
              c.globalAlpha = 1;
            }
          }
          break;
        case 'ponytail':
          hairLock(c, [
            ['M', r - 4, hy - 9],
            ['B', r + 9, hy - 13, r + 17, hy + 2, r + 13.5, hy + 15],
            ['Q', r + 11, hy + 24, r + 4.5, hy + 29],
            ['Q', r + 8.5, hy + 20, r + 7.5, hy + 13],
            ['Q', r + 6, hy + 4, r + 1, hy - 1],
            ['Q', r - 1, hy - 3, r - 4, hy - 4],
          ], 1, col, r - 1, hy - 6, [A, B],
          [[r + 1, hy - 8, r + 12, hy + 1, r + 9, hy + 22], [r, hy - 4, r + 9, hy + 6, r + 7, hy + 19], [r + 4, hy - 7, r + 14, hy + 4, r + 11, hy + 18]], 30);
          hairTie(c, r - 1, hy - 6, PAL.pink);
          break;
        case 'sidePony':
          hairLock(c, [
            ['M', r - 2, hy - 4],
            ['B', r + 8, hy - 4, r + 14, hy + 9, r + 11.5, hy + 21],
            ['Q', r + 9.5, hy + 28, r + 4, hy + 31],
            ['Q', r + 7, hy + 22, r + 6, hy + 13],
            ['Q', r + 3.5, hy + 5, r - 1.5, hy + 3],
          ], 1, col, r + 3, hy, [A, B],
          [[r + 3, hy - 1, r + 11, hy + 8, r + 8, hy + 25], [r + 2, hy + 3, r + 8, hy + 12, r + 6, hy + 24]], 30);
          hairTie(c, r + 3, hy, PAL.sun);
          break;
        case 'bob':
          celPart(c, function () {
            c.beginPath();
            c.moveTo(-r - 3, hy - 2);
            c.quadraticCurveTo(-r - 4, hy + 8, -r - 1, hy + 12.5);
            c.quadraticCurveTo(-r + 3, hy + 14, 0, hy + 13.5);
            c.quadraticCurveTo(r - 3, hy + 14, r + 1, hy + 12.5);
            c.quadraticCurveTo(r + 4, hy + 8, r + 3, hy - 2);
            c.closePath();
          }, col, { dx: -1.4, dy: -1.6 });
          break;
        case 'longWavy':
        case 'longStraight':
        case 'halfUp':
          var wavy = cust.hairStyle === 'longWavy';
          var hk = longHairK(cust), Y = function (d) { return hy + (d <= 6 ? d : 6 + (d - 6) * hk); };
          /* a sheet behind the shoulders, then a long lock either side */
          celPart(c, function () {
            c.beginPath();
            c.moveTo(-r - 1, hy - 2);
            c.lineTo(r + 1, hy - 2);
            c.lineTo(r + 2, hy + 34);
            c.lineTo(-r - 2, hy + 34);
            c.closePath();
          }, shade(col, -6), { dx: -1.4, dy: -1.6, rim: false });
          for (sd = -1; sd <= 1; sd += 2) {
            var segs = wavy ? [
              ['M', r - 4, hy - 8],
              ['Q', r + 9, hy + 2, r + 6, Y(12)],
              ['Q', r + 12, Y(22), r + 7, Y(32)],
              ['Q', r + 10, Y(40), r + 4, Y(44)],
              ['Q', r - 0.5, Y(42), r - 5, Y(44)],
              ['Q', r - 3, Y(24), r - 1, hy + 6],
            ] : [
              ['M', r - 4, hy - 8],
              ['Q', r + 6, hy - 2, r + 5.5, Y(12)],
              ['Q', r + 6, Y(30), r + 5.5, Y(42)],
              ['Q', r + 1, Y(42.8), r - 4.5, Y(42)],
              ['Q', r - 2.6, Y(24), r - 1, hy + 6],
            ];
            hairLock(c, segs, sd, col, r - 2, hy - 4, [A * 0.6 - sd * fl * 0.3, B * 0.7],
              [[r + 1, hy + 6, r + 7, Y(18), r + 2, Y(30)], [r - 1, hy + 4, r + 3, Y(22), r, Y(38)], [r + 3, hy, r + 5, Y(20), r + 3, Y(40)]], 46);
          }
          if (cust.hairStyle === 'halfUp' && !CROWN_HATS[cust.hat]) {
            /* the half-up knot at the back of the crown, tied in a bow */
            volEllipse(c, -1, hy - r - 0.5, 5, 4, col, 2);
          }
          break;
        case 'curly':
          for (i = 0; i < 9; i++) {
            var a = Math.PI + (i / 8) * Math.PI;
            volEllipse(c, Math.cos(a) * (r + 4), hy + Math.sin(a) * (r + 2) + 2 + Math.sin(MOTION.t * 2 + i) * 0.2, 6, 6, col, 2);
          }
          volEllipse(c, -r - 6 + A * 4, hy + 10 + fl, 6, 6, col, 2);
          volEllipse(c, r + 6 + A * 4, hy + 10 + fl, 6, 6, col, 2);
          break;
        case 'pixie':
          break;
        case 'topBun':
          /* tucked away under a hat that covers the crown */
          if (CROWN_HATS[cust.hat]) break;
          volEllipse(c, A * 2, hy - r - 5 - MOTION.lag * 0.4, 7.5, 6.5, col, 2);
          if (!LOW) {
            c.strokeStyle = shadowCached(col, 32, false); c.lineWidth = 0.6; c.globalAlpha = 0.6;
            c.beginPath(); c.arc(A * 2, hy - r - 4.6, 4, Math.PI * 0.85, Math.PI * 2.05); c.stroke();
            c.globalAlpha = 1;
          }
          break;
        case 'sideBraid':
          /* a short nape behind; the braid itself hangs in front */
          break;
        case 'puffs':
          /* two round clouds of curls, high on the head */
          for (sd = -1; sd <= 1; sd += 2) {
            (function (sd) {
              var px = sd * (r + 4.6) + A * 3, py = hy - 9.6 - MOTION.lag * 0.2;
              var pp = function () { fluffPath(c, px, py, 9, 8.6, 11, 0.2 + sd); };
              celPart(c, pp, col, { dx: -1.6, dy: -1.6 });
              if (!LOW) {
                c.save(); pp(); c.clip();
                c.strokeStyle = shadowCached(col, 30, false); c.lineWidth = 0.5; c.lineCap = 'round'; c.globalAlpha = 0.7;
                c.beginPath();
                for (var q = 0; q < 9; q++) { var ca = q * 2.4, cr = 2 + (q % 3) * 2.2; c.moveTo(px + Math.cos(ca) * cr + 1.5, py + Math.sin(ca) * cr); c.arc(px + Math.cos(ca) * cr, py + Math.sin(ca) * cr, 1.5, 0, Math.PI * 1.3); }
                c.stroke();
                c.globalAlpha = 0.3; fillEllipse(c, px - 3, py - 3.6, 3.4, 2, '#ffffff', false);
                c.restore();
              }
              hairTie(c, sd * (r - 0.4), hy - 6.4, PAL.sun);
            })(sd);
          }
          break;
        case 'lowTwins':
          /* two low tails tied behind the ears, resting on the shoulders */
          for (sd = -1; sd <= 1; sd += 2) {
            hairLock(c, [
              ['M', r - 3, hy + 3],
              ['B', r + 6.4, hy + 3, r + 9.6, hy + 15, r + 7.4, hy + 25],
              ['Q', r + 6, hy + 31, r + 1.6, hy + 33.4],
              ['Q', r + 3.6, hy + 25, r + 2.6, hy + 17],
              ['Q', r + 1.6, hy + 10, r - 2.4, hy + 8.6],
            ], sd, col, r + 0.6, hy + 6, [A * 0.9 - sd * fl * 0.4, B * 0.9],
            [[r + 2, hy + 7, r + 7, hy + 14, r + 5, hy + 28], [r + 0.6, hy + 9, r + 4.4, hy + 16, r + 3.4, hy + 28]], 28);
            ribbonBow(c, sd * (r + 0.6), hy + 6.6, 2, PAL.pinkDeep, false);
          }
          break;
        case 'flip':
          /* shoulder length, the ends flicked out and up */
          celPart(c, function () {
            c.beginPath();
            c.moveTo(-r - 3, hy - 2);
            c.quadraticCurveTo(-r - 4.4, hy + 7, -r - 3.4, hy + 11);
            c.quadraticCurveTo(-r - 4.6, hy + 15.4, -r - 9.4 + A * 4, hy + 14.4);
            c.quadraticCurveTo(-r - 6, hy + 19.6, -r + 0.6, hy + 18.4);
            c.quadraticCurveTo(0, hy + 16.4, r - 0.6, hy + 18.4);
            c.quadraticCurveTo(r + 6, hy + 19.6, r + 9.4 + A * 4, hy + 14.4);
            c.quadraticCurveTo(r + 4.6, hy + 15.4, r + 3.4, hy + 11);
            c.quadraticCurveTo(r + 4.4, hy + 7, r + 3, hy - 2);
            c.closePath();
          }, col, { dx: -1.4, dy: -1.6 });
          if (!LOW) {
            c.strokeStyle = shadowCached(col, 32, false); c.lineWidth = 0.45; c.lineCap = 'round'; c.globalAlpha = 0.6;
            c.beginPath();
            for (sd = -1; sd <= 1; sd += 2) { c.moveTo(sd * (r + 1.6), hy + 6); c.quadraticCurveTo(sd * (r + 2.2), hy + 14, sd * (r + 7) + A * 3, hy + 15.6); c.moveTo(sd * (r - 1), hy + 9); c.quadraticCurveTo(sd * (r - 0.4), hy + 15, sd * (r + 3.4), hy + 17.4); }
            c.stroke(); c.globalAlpha = 1;
          }
          break;
        case 'braidCrown':
          celPart(c, function () {
            c.beginPath();
            c.moveTo(-r - 3, hy - 2);
            c.quadraticCurveTo(-r - 4, hy + 8, -r - 1, hy + 12.5);
            c.quadraticCurveTo(-r + 3, hy + 14, 0, hy + 13.5);
            c.quadraticCurveTo(r - 3, hy + 14, r + 1, hy + 12.5);
            c.quadraticCurveTo(r + 4, hy + 8, r + 3, hy - 2);
            c.closePath();
          }, col, { dx: -1.4, dy: -1.6 });
          break;
        case 'drills':
          for (sd = -1; sd <= 1; sd += 2) {
            BEND.rx = sd * (r + 2); BEND.ry = hy - 2; BEND.a = A * 0.6 - sd * fl * 0.4; BEND.b = B * 0.6; BEND.len = 26;
            drill(c, col, sd * (r + 3.2), hy - 1, sd, 26);
            BEND.a = 0; BEND.b = 0;
          }
          break;
      }
      c.restore();
      drawHairBackCap(c, cust, col);
    } else {
      /* the fringe: four locks swept toward the part, shifted toward the
         way she is facing as she turns */
      var fx = yaw * 1.8;
      var cap = function () {
        c.beginPath();
        c.ellipse(0, hy - 0.4, r + 1.9, r + 2.6, 0, Math.PI, Math.PI * 2);
        c.quadraticCurveTo(r + 2.1, hy + 2.5, r + 1.2, hy + 4);
        var prev = [r + 1.2, hy + 4];
        for (var k = 0; k < FRINGE.length; k++) {
          var L = FRINGE[k];
          c.quadraticCurveTo(L[0] + fx + 0.3, prev[1] - 2.2, L[0] + fx, hy + L[1]);
          c.quadraticCurveTo(L[0] + fx - 0.6, hy + L[3] - 2.8, L[2] + fx, hy + L[3]);
          prev = [L[2] + fx, hy + L[3]];
        }
        c.quadraticCurveTo(-r + 0.2, hy - 0.4, -r - 0.6, hy + 4.4);
        c.quadraticCurveTo(-r - 2, hy + 2.5, -r - 1.9, hy - 0.4);
        c.closePath();
      };
      /* the fringe throws its own shape onto the brow beneath it */
      if (!cust.mannequin) {
        c.save();
        headPath(c); c.clip();
        c.translate(0.6, 1.6);
        cap();
        c.fillStyle = shadowCached(skinOf(cust), 26, true);
        c.globalAlpha = 0.7;
        c.fill();
        c.restore();
      }
      cap();
      c.fillStyle = col;
      c.fill();
      celBands(c, cap, col, -1.6, -2.2, false, 1);
      c.save();
      cap();
      c.clip();
      /* light pours over the crown and the fringe falls into shade */
      var hg = c.createLinearGradient(0, hy - r - 2, 0, hy + 3);
      hg.addColorStop(0, 'rgba(255,255,255,0.16)');
      hg.addColorStop(0.55, 'rgba(255,255,255,0)');
      hg.addColorStop(1, 'rgba(42,16,48,0.2)');
      c.fillStyle = hg;
      c.fillRect(-r - 4, hy - r - 4, r * 2 + 8, r + 10);
      if (!LOW) {
        /* the parting between locks: a dark groove from each valley up
           toward the crown, and a light edge on each lock's lit side */
        c.lineCap = 'round';
        c.strokeStyle = shadowCached(col, 34, false);
        c.lineWidth = 0.5;
        c.globalAlpha = 0.65;
        c.beginPath();
        var k2, F;
        for (k2 = 0; k2 < FRINGE.length; k2++) {
          F = FRINGE[k2];
          c.moveTo(F[0] + fx, hy + F[1]);
          c.quadraticCurveTo(F[0] * 1.08 + 0.6 + fx * 0.6, hy - r * 0.45, F[0] * 0.35 + 1 + fx * 0.3, hy - r + 1.5);
          c.moveTo(F[2] + fx + 1.2, hy + F[3] - 1.2);
          c.quadraticCurveTo(F[2] * 0.9 + fx, hy - 2, F[2] * 0.5 + fx * 0.4, hy - r * 0.6);
        }
        c.stroke();
        c.strokeStyle = mix(shade(col, 50), '#fff8ec', 0.25);
        c.lineWidth = 0.6;
        c.globalAlpha = 0.6;
        c.beginPath();
        for (k2 = 0; k2 < FRINGE.length; k2++) {
          F = FRINGE[k2];
          c.moveTo(F[0] + fx - 1.1, hy + F[1] - 1.5);
          c.quadraticCurveTo(F[0] + fx - 1.6, hy + F[3] - 3, F[2] + fx + 0.7, hy + F[3] - 1.4);
        }
        c.stroke();
        c.globalAlpha = 1;
      }
      c.restore();
      rims(c, cap, 1);
      cap();
      c.fillStyle = col;
      ink(c, 2);
      /* the ahoge: one springy strand standing up off the crown */
      if (cust.hairStyle !== 'curly' && cust.hairStyle !== 'braidCrown' && !cust.mannequin && !CROWN_HATS[cust.hat]) {
        var ax0 = 1.5 + fx * 0.5, ay0 = hy - r - 1.8, sw = MOTION.hairA * 9 + MOTION.hairB * 5 - MOTION.lag * 0.4;
        celPart(c, function () {
          c.beginPath();
          c.moveTo(ax0 - 1.4, ay0 + 1.2);
          c.quadraticCurveTo(ax0 - 1.6 + sw * 0.4, ay0 - 4, ax0 + 2.4 + sw, ay0 - 5.6);
          c.quadraticCurveTo(ax0 + 4.4 + sw, ay0 - 5.8, ax0 + 4 + sw * 1.1, ay0 - 3.6);
          c.quadraticCurveTo(ax0 + 2.6 + sw * 0.8, ay0 - 4.4, ax0 + 0.8 + sw * 0.4, ay0 - 2.2);
          c.quadraticCurveTo(ax0 + 0.2, ay0 - 0.6, ax0 + 1.2, ay0 + 1.2);
          c.closePath();
        }, col, { dx: -0.5, dy: -0.6, rimS: 0.5, ink: 1.6 });
      }
      switch (cust.hairStyle) {
        case 'pixie':
          celPart(c, polyPath(c, [[-r, hy - 2], [-r + 6, hy - 6], [-r + 5, hy + 4]]), col, { rim: false });
          celPart(c, polyPath(c, [[r, hy - 2], [r - 6, hy - 6], [r - 5, hy + 4]]), col, { rim: false });
          celPart(c, polyPath(c, [[2, hy - r], [6, hy - r + 7], [-1, hy - r + 5]]), col, { rim: false });
          break;
        case 'curly':
          for (i = -2; i <= 2; i++) volEllipse(c, i * 5.5 + fx, hy - r + 1 + Math.abs(i), 3.6, 3.6, col, 1.6);
          break;
        case 'sidePony':
          celPart(c, polyPath(c, [[-r, hy - 3], [2, hy - r - 1], [-3, hy + 1]]), col, { rim: false });
          break;
        case 'halfUp':
          if (!CROWN_HATS[cust.hat]) ribbonBow(c, -1 - yaw * 1.5, hy - r - 2.5, 3.2, PAL.pinkDeep, true);
          break;
        case 'braidCrown':
          /* a plait laid over the crown from ear to ear, a daisy tucked in */
          for (i = -5; i <= 5; i++) {
            var ba = Math.PI * 1.5 + i * 0.235, bxx = Math.cos(ba) * (r + 1.4) + fx * 0.5, byy = hy + 2 + Math.sin(ba) * (r + 2.2);
            c.save();
            c.translate(bxx, byy); c.rotate(ba + Math.PI / 2 + (i % 2 ? 0.5 : -0.5));
            celPart(c, ellPath(c, 0, 0, 2.3, 1.6), i % 2 ? col : shade(col, -6), { dx: -0.5, dy: -0.5, rim: false, ink: 1.4 });
            c.restore();
          }
          flower(c, -8.6 + fx * 0.5, hy - 10.6, 2, PAL.cream, PAL.sun);
          break;
        case 'sideBraid':
          /* the braid falls forward over the near shoulder */
          BEND.rx = -r; BEND.ry = hy + 2; BEND.a = A * 0.5; BEND.b = B * 0.5; BEND.len = 26;
          braidChain(c, col, -r + 1.2 + yaw * 1.2, hy + 4, 6, 4.2, -1, PAL.sun);
          BEND.a = 0; BEND.b = 0;
          break;
      }
    }
  }

  /* ---- Legs, base layer, pants ---- */
  function skinOf(cust) { return cust.mannequin ? MANNEQUIN_SKIN : cust.skin; }

  /* The rig for the figure being drawn (see buildRig). Legs and arms
     are solved points in ground space (feet at 0); the torso and head
     are drawn in their own transformed frames. */
  var RG = null;
  var LEG = { thigh: 8.3, shin: 8.05, ankle: 1.9, hipX: 3.4, rHip: 3.1, rKnee: 2.2, rAnkle: 1.45 };
  var ARM = { up: 6.4, fore: 5.9, shX: 7.4, shY: -34.2, rSh: 2.35, rEl: 1.7, rWr: 1.32 };

  function legPath(c, L, g) {
    g = g || 0;
    limbPath(c, L.hx, L.hy, LEG.rHip + g, L.kx, L.ky, LEG.rKnee + g, L.ax, L.ay, LEG.rAnkle + g, 0.05 + g * 0.15, 0.38);
  }
  /* the top k of a leg (shorts, socks start) */
  function legTopPath(c, L, k, g) {
    var e = alongLimb(L.hx, L.hy, L.kx, L.ky, L.ax, L.ay, k);
    var m = alongLimb(L.hx, L.hy, L.kx, L.ky, L.ax, L.ay, k / 2);
    var re = lerp(LEG.rHip, LEG.rKnee, Math.min(1, k * 2)) + g;
    limbPath(c, L.hx, L.hy, LEG.rHip + g, m[0], m[1], (LEG.rHip + re) / 2 + g * 0.2, e[0], e[1], re, 0.1, 0.1);
  }
  /* the bottom of a leg from k down (socks, boot shafts) */
  function legLowPath(c, L, k, g) {
    var s = alongLimb(L.hx, L.hy, L.kx, L.ky, L.ax, L.ay, k);
    var rs = k < 0.5 ? lerp(LEG.rHip, LEG.rKnee, k * 2) : lerp(LEG.rKnee, LEG.rAnkle, k * 2 - 1);
    if (k < 0.5) limbPath(c, s[0], s[1], rs + g, L.kx, L.ky, LEG.rKnee + g, L.ax, L.ay, LEG.rAnkle + g, 0.1, 0.32);
    else {
      var m = [(s[0] + L.ax) / 2, (s[1] + L.ay) / 2];
      limbPath(c, s[0], s[1], rs + g, m[0], m[1], (rs + LEG.rAnkle) / 2 + g + 0.15, L.ax, L.ay, LEG.rAnkle + g, 0.1, 0.1);
    }
  }
  /* A band round the limb at fraction k: a cuff, a sock top. */
  function legBand(c, L, k, h, g, col) {
    var s = alongLimb(L.hx, L.hy, L.kx, L.ky, L.ax, L.ay, k);
    var a = k < 0.5 ? Math.atan2(L.ky - L.hy, L.kx - L.hx) : Math.atan2(L.ay - L.ky, L.ax - L.kx);
    var rs = (k < 0.5 ? lerp(LEG.rHip, LEG.rKnee, k * 2) : lerp(LEG.rKnee, LEG.rAnkle, k * 2 - 1)) + g;
    c.save();
    c.translate(s[0], s[1]);
    c.rotate(a - Math.PI / 2);
    celPart(c, rrPath(c, -rs - 0.3, -h / 2, rs * 2 + 0.6, h, h / 2), col, { dx: -0.6, dy: -0.3, rim: false, ink: 1.4 });
    c.restore();
  }

  function drawLeg(c, cust, L) {
    var skin = skinOf(cust);
    if (!L.near) skin = shadowCached(skin, 7, true);
    var path = function () { legPath(c, L); };
    celPart(c, path, skin, { warm: true, dx: -1.0, dy: -0.5, s: 0.9 });
    if (!LOW) {
      /* the knee catches a little light */
      glint(c, L.kx - 0.6, L.ky - 0.3, 0.8, 0.5, 0.25);
    }
  }

  function drawPantsLeg(c, cust, L) {
    var col = cust.pantsColor;
    if (!L.near) col = shadowCached(col, 8, false);
    var light = shade(cust.pantsColor, 30), tc = trimOf(cust.pantsColor);
    var pat = cust.pantsPattern, la = limbAng(L.hx, L.hy, L.ax, L.ay);
    var path, q;
    switch (cust.pants) {
      case 'jeans':
      case 'overalls':
        path = function () { legPath(c, L, 0.75); };
        celPart(c, path, col, { dx: -1, dy: -0.5 });
        printOn(c, path, pat, cust.pantsColor, L.hx, L.hy, la);
        if (!LOW) {
          /* a pale outside seam and a fold behind the knee */
          c.strokeStyle = light; c.lineWidth = 0.55; c.globalAlpha = 0.8;
          c.beginPath();
          c.moveTo(L.hx - 1.8, L.hy + 2);
          c.quadraticCurveTo(L.kx - 2.2, L.ky, L.ax - 1.5, L.ay - 2);
          c.stroke();
          c.strokeStyle = shadowCached(col, 30, false); c.globalAlpha = 0.6;
          c.beginPath();
          c.moveTo(L.kx + 0.5, L.ky - 1.2); c.lineTo(L.kx + 1.8, L.ky + 0.4);
          c.moveTo(L.kx + 0.2, L.ky + 0.6); c.lineTo(L.kx + 1.4, L.ky + 1.6);
          c.stroke();
          c.globalAlpha = 1;
        }
        legBand(c, L, 0.93, 1.6, 1.0, light);
        break;
      case 'leggings':
        path = function () { legPath(c, L, 0.3); };
        celPart(c, path, col, { dx: -1, dy: -0.5 });
        printOn(c, path, pat, cust.pantsColor, L.hx, L.hy, la);
        if (!LOW) {
          c.strokeStyle = tc; c.lineWidth = 0.6; c.globalAlpha = 0.9;
          c.beginPath(); c.moveTo(L.hx - 2.2, L.hy + 2); c.quadraticCurveTo(L.kx - 1.7, L.ky, L.ax - 1.1, L.ay - 1); c.stroke();
          c.globalAlpha = 1;
        }
        break;
      case 'stripey':
        path = function () { legPath(c, L, 0.3); };
        celPart(c, path, col, { dx: -1, dy: -0.5, ink: 0 });
        /* hoops that turn with the leg */
        c.save();
        path(); c.clip();
        c.translate(L.hx, L.hy); c.rotate(la);
        c.fillStyle = L.near ? tc : shadowCached(tc, 8, false);
        for (q = 1.4; q < 22; q += 3.6) c.fillRect(-8, q, 16, 1.8);
        c.restore();
        path(); c.fillStyle = col; ink(c, 2);
        break;
      case 'joggers':
        path = function () { legPath(c, L, 1.0); };
        celPart(c, path, col, { dx: -1, dy: -0.5 });
        printOn(c, path, pat, cust.pantsColor, L.hx, L.hy, la);
        if (!LOW) {
          c.strokeStyle = tc; c.lineWidth = 0.9;
          c.beginPath();
          c.moveTo(L.hx - 2.6, L.hy + 1.5);
          c.quadraticCurveTo(L.kx - 2.8, L.ky, L.ax - 2, L.ay - 2.4);
          c.stroke();
        }
        legBand(c, L, 0.9, 2.2, 0.55, shade(cust.pantsColor, -14));
        break;
      case 'flares':
        /* snug to the knee, then a wide bell with a flower patch */
        path = function () { limbPath(c, L.hx, L.hy, LEG.rHip + 0.7, L.kx, L.ky, LEG.rKnee + 0.55, L.ax, L.ay + 0.2, LEG.rAnkle + 2.3, 0.05, 0.25); };
        celPart(c, path, col, { dx: -1, dy: -0.5 });
        printOn(c, path, pat, cust.pantsColor, L.hx, L.hy, la);
        if (!LOW) {
          c.save(); path(); c.clip();
          c.strokeStyle = shadowCached(col, 28, false); c.lineWidth = 0.45; c.globalAlpha = 0.7;
          c.beginPath();
          c.moveTo(L.kx + 0.4, L.ky + 1.6); c.lineTo(L.ax + 2.2, L.ay + 2);
          c.moveTo(L.kx - 0.8, L.ky + 2); c.lineTo(L.ax - 1.6, L.ay + 2);
          c.stroke();
          c.restore();
          c.beginPath(); c.moveTo(L.ax - 3.4, L.ay + 0.6); c.lineTo(L.ax + 3.4, L.ay + 0.6);
          stitch(c, tc, 0.35);
          if (L.near) flower(c, L.ax - 0.6, L.ay - 2.6, 1.5, tc, PAL.sun);
        }
        break;
      case 'cargo':
        path = function () { legPath(c, L, 1.3); };
        celPart(c, path, col, { dx: -1, dy: -0.5 });
        printOn(c, path, pat, cust.pantsColor, L.hx, L.hy, la);
        /* a bellows pocket on the thigh, a seam across the knee */
        q = alongLimb(L.hx, L.hy, L.kx, L.ky, L.ax, L.ay, 0.3);
        c.save();
        c.translate(q[0], q[1]); c.rotate(Math.atan2(L.ky - L.hy, L.kx - L.hx) - Math.PI / 2);
        celPart(c, rrPath(c, -3.6, -1.4, 4.2, 4.6, 0.8), shade(col, -8), { rim: false, ink: 1.2, dx: -0.4, dy: -0.4 });
        celPart(c, rrPath(c, -3.9, -1.8, 4.8, 1.7, 0.6), shade(col, 8), { rim: false, ink: 1.1, dx: -0.3, dy: -0.2 });
        if (!LOW) fillEllipse(c, -1.5, -0.9, 0.45, 0.45, PAL.sun, false);
        c.restore();
        if (!LOW) {
          c.beginPath(); c.moveTo(L.kx - 3, L.ky + 0.6); c.lineTo(L.kx + 3, L.ky + 0.2);
          stitch(c, light, 0.35);
        }
        legBand(c, L, 0.94, 1.8, 1.5, shade(cust.pantsColor, -16));
        break;
      case 'bloomers':
        /* puffed short legs gathered into a lace-edged band */
        path = function () { legTopPath(c, L, 0.4, 2.5); };
        celPart(c, path, col, { dx: -0.9, dy: -0.4 });
        printOn(c, path, pat, cust.pantsColor, L.hx, L.hy, la);
        legBand(c, L, 0.4, 1.7, 1.7, tc);
        if (!LOW && L.near) { q = alongLimb(L.hx, L.hy, L.kx, L.ky, L.ax, L.ay, 0.36); ribbonBow(c, q[0] - 2.6, q[1] + 0.4, 1.2, PAL.pink, false); }
        break;
      case 'shorts':
        path = function () { legTopPath(c, L, 0.42, 1.25); };
        celPart(c, path, col, { dx: -0.9, dy: -0.4 });
        printOn(c, path, pat, cust.pantsColor, L.hx, L.hy, la);
        legBand(c, L, 0.42, 1.3, 1.45, light);
        break;
      case 'none':
        break;
    }
  }

  var SKIRTS = { skirt: 1, poofySkirt: 1, denimSkirt: 1, ruffleSkirt: 1, maxiSkirt: 1 };
  /* The seat of whatever she wears on her legs, over the tops of both
     thighs so trouser legs join at the hip. Drawn in the torso frame. */
  function drawPantsTop2(c, cust) {
    var p = cust.pants;
    if (SKIRTS[p]) return;
    var col = p === 'none' ? (cust.mannequin ? '#f7f0f6' : PAL.cream) : cust.pantsColor;
    var bot = CH.torsoBot;
    var short = p === 'shorts' || p === 'none' || p === 'bloomers';
    var top = short ? bot - 4 : bot - 6;
    var hw = p === 'none' ? 7.2 : p === 'bloomers' ? 9.4 : 8.2;
    var seat = function () {
      c.beginPath();
      c.moveTo(-hw, top);
      c.lineTo(hw, top);
      c.quadraticCurveTo(hw + 1, bot - 1, hw - 0.6, bot + 3);
      c.quadraticCurveTo(3.5, bot + 4, 0.6, bot + 2);
      c.lineTo(-0.6, bot + 2);
      c.quadraticCurveTo(-3.5, bot + 4, -hw + 0.6, bot + 3);
      c.quadraticCurveTo(-hw - 1, bot - 1, -hw, top);
      c.closePath();
    };
    celPart(c, seat, col, { dx: -1.4, dy: -1, s: 0.8 });
    if (p !== 'none') printOn(c, seat, cust.pantsPattern, cust.pantsColor);
    if (p === 'jeans' || p === 'joggers' || p === 'shorts' || p === 'flares' || p === 'cargo') {
      fillRound(c, -8.4, top - 0.4, 16.8, 2.2, 1, shade(col, -18), false);
    }
    if (p === 'bloomers') celPart(c, rrPath(c, -8.6, top - 0.6, 17.2, 2.2, 1), trimOf(col), { rim: false, ink: 1.2, dx: -0.6, dy: -0.3 });
    if (p === 'jeans' || p === 'flares') {
      c.strokeStyle = shade(col, 30); c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(-6, top + 2.2); c.quadraticCurveTo(-4.5, top + 4.5, -2.2, top + 4.5); c.stroke();
      fillEllipse(c, 0, top + 0.7, 0.8, 0.8, PAL.gold, false);
    }
    if (p === 'cargo') {
      /* a webbing belt with a clip */
      celPart(c, rrPath(c, -8.8, top - 0.6, 17.6, 2.4, 1), trimOf(col), { rim: false, ink: 1.2, dx: -0.6, dy: -0.3 });
      clasp(c, 0, top + 0.6, 2.6, 2);
    }
    if (p === 'joggers') {
      c.strokeStyle = trimOf(col); c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(-1, top + 1.6); c.lineTo(-1.6, top + 4); c.moveTo(1, top + 1.6); c.lineTo(1.6, top + 4); c.stroke();
    }
  }

  /* Skirts sit at the waist, over the camisole hem, so the whole skirt
     shows instead of the sliver that peeked out below the top. */
  function drawSkirt(c, cust) {
    var p = cust.pants;
    if (!SKIRTS[p]) return;
    var col = cust.pantsColor, dark = shade(col, -20), light = shade(col, 25), tc = trimOf(col);
    var bot = CH.torsoBot, waist = bot - 7;
    var fl = MOTION.flare;
    PAT = cust.pantsPattern && cust.pantsPattern !== 'plain' ? cust.pantsPattern : null;
    PATCOL = col;
    if (p === 'maxiSkirt') {
      /* a long skirt to the ankle with a band of trim and a frill */
      shadedFill(c, polyPath(c, [[-9, waist], [9, waist], [13.6 + fl * 0.7, bot + 13], [-13.6 - fl * 0.7, bot + 13]]), col, 2, { drape: [waist, bot + 13, 13] });
      c.save();
      polyPath(c, [[-9, waist], [9, waist], [13.6 + fl * 0.7, bot + 13], [-13.6 - fl * 0.7, bot + 13]])(); c.clip();
      c.fillStyle = tc; c.fillRect(-16, bot + 8.4, 32, 1.6);
      c.fillStyle = dark; c.fillRect(-16, bot + 10.6, 32, 0.7);
      c.restore();
      frill(c, 14.2 + fl * 0.7, bot + 12.2, 8, 2, light, 1.4);
      fillRound(c, -9.5, waist - 0.5, 19, 3.2, 1.5, dark, false);
      ribbonBow(c, -5.5, waist + 1, 1.9, tc, true);
    } else if (p === 'skirt') {
      shadedFill(c, polyPath(c, [[-9, waist], [9, waist], [15 + fl, bot + 7], [-15 - fl, bot + 7]]), col, 2, { drape: [waist, bot + 7, 15] });
      /* pleats, and a line of trim near the hem */
      c.strokeStyle = shadowCached(col, 30, false); c.lineWidth = 0.6;
      c.beginPath();
      for (var k = -2; k <= 2; k++) { c.moveTo(k * 3.4, waist + 3); c.lineTo(k * 5.6, bot + 6.5); }
      c.stroke();
      c.strokeStyle = tc; c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(-14 - fl, bot + 4.8); c.lineTo(14 + fl, bot + 4.8); c.stroke();
      fillRound(c, -9.5, waist - 0.5, 19, 3.2, 1.5, dark, false);
    } else if (p === 'denimSkirt') {
      shadedFill(c, polyPath(c, [[-9, waist], [9, waist], [12.5 + fl * 0.5, bot + 6], [-12.5 - fl * 0.5, bot + 6]]), col, 2, {});
      c.strokeStyle = shade(col, 35); c.lineWidth = 0.5; c.setLineDash([0.9, 0.7]);
      c.beginPath();
      c.moveTo(0.8, waist + 3); c.lineTo(1.2, bot + 5.5);
      c.moveTo(-12, bot + 4.6); c.lineTo(12, bot + 4.6);
      c.moveTo(-7, waist + 4); c.quadraticCurveTo(-5, waist + 6.4, -2.4, waist + 6);
      c.stroke();
      c.setLineDash([]);
      fillRound(c, -9.5, waist - 0.5, 19, 3.2, 1.5, dark, false);
      fillEllipse(c, 0.8, waist + 1.1, 0.9, 0.9, PAL.gold, false);
    } else if (p === 'ruffleSkirt') {
      for (var tier = 1; tier >= 0; tier--) {
        (function (tier) {
          var y0 = waist + tier * 5.5, y1 = bot + 2 + tier * 6, hw = 11 + tier * 3.5 + fl * (tier + 1) * 0.5;
          shadedFill(c, function () {
            c.beginPath();
            c.moveTo(-8.5 - tier * 2, y0);
            c.lineTo(8.5 + tier * 2, y0);
            c.lineTo(hw, y1 - 1);
            for (var s = 0; s <= 6; s++) {
              var xx = hw - (s + 0.5) * (2 * hw / 7);
              c.quadraticCurveTo(xx, y1 + 2.2, xx - hw / 7, y1 - 0.6);
            }
            c.closePath();
          }, tier ? col : light, 2, { drape: [y0, y1, hw] });
        })(tier);
      }
      fillRound(c, -9.5, waist - 0.5, 19, 3.2, 1.5, dark, false);
      ribbonBow(c, 5.5, waist + 1, 1.8, PAL.pink, false);
    } else {
      shadedFill(c, function () {
        c.beginPath();
        c.moveTo(-9, waist);
        c.lineTo(9, waist);
        c.quadraticCurveTo(20 + fl, waist + 4, 17 + fl, bot + 8);
        c.quadraticCurveTo(0, bot + 12, -17 - fl, bot + 8);
        c.quadraticCurveTo(-20 - fl, waist + 4, -9, waist);
        c.closePath();
      }, col, 2, { drape: [waist, bot + 10, 17] });
      /* tulle layers */
      c.save(); c.globalAlpha = 0.55; c.strokeStyle = light; c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(-14, bot + 3); c.quadraticCurveTo(0, bot + 7, 14, bot + 3); c.stroke();
      c.beginPath(); c.moveTo(-15.5, bot + 6.5); c.quadraticCurveTo(0, bot + 10.5, 15.5, bot + 6.5); c.stroke();
      c.restore();
      for (var d = -12; d <= 12; d += 6) fillEllipse(c, d, bot + 1 + (d % 12 === 0 ? 3 : 0), 0.9, 0.9, light, false);
      fillRound(c, -9.5, waist - 0.5, 19, 3.2, 1.5, dark, false);
      fillEllipse(c, 0, waist + 1, 1.6, 1.6, PAL.sun, false);
    }
    PAT = null;
  }

  /* Overall bib goes over the camisole but under any dress or jacket. */
  function drawPantsTop(c, cust) {
    if (cust.pants !== 'overalls') return;
    var col = cust.pantsColor, top = CH.torsoTop;
    celPart(c, rrPath(c, -7.6, top + 1, 3.2, 10, 1.4), col, { rim: false, ink: 1.6 });
    celPart(c, rrPath(c, 4.4, top + 1, 3.2, 10, 1.4), col, { rim: false, ink: 1.6 });
    celPart(c, rrPath(c, -8.6, top + 8, 17.2, 11, 3), col, { dx: -1.4, dy: -1.2 });
    printOn(c, rrPath(c, -8.6, top + 8, 17.2, 11, 3), cust.pantsPattern, col);
    celPart(c, rrPath(c, -3.6, top + 11, 7.2, 4.6, 1.6), shade(col, -16), { rim: false, ink: 1.3 });
    fillEllipse(c, -6, top + 9.2, 1.1, 1.1, PAL.sun, false);
    fillEllipse(c, 6, top + 9.2, 1.1, 1.1, PAL.sun, false);
    glint(c, -6.3, top + 8.8, 0.4, 0.3, 0.8);
    glint(c, 5.7, top + 8.8, 0.4, 0.3, 0.8);
  }

  /* The cream camisole she starts the day in. */
  function drawBaseLayer(c, cust) {
    var top = CH.torsoTop, bot = CH.torsoBot;
    var cream = cust.mannequin ? '#f7f0f6' : PAL.cream;
    if (cust.dress === 'none') {
      shadedFill(c, function () {
        /* snug under the arms, a soft waist, easing out to the hem */
        c.beginPath();
        c.moveTo(-5, top);
        c.lineTo(5, top);
        c.quadraticCurveTo(8.6, top, 8.8, top + 4);
        c.quadraticCurveTo(8.2, top + 10, 9.6, bot);
        c.quadraticCurveTo(9.8, bot + 2, 7.8, bot + 2);
        c.quadraticCurveTo(0, bot + 2.8, -7.8, bot + 2);
        c.quadraticCurveTo(-9.8, bot + 2, -9.6, bot);
        c.quadraticCurveTo(-8.2, top + 10, -8.8, top + 4);
        c.quadraticCurveTo(-8.6, top, -5, top);
        c.closePath();
      }, cream, 2, { strength: 0.8 });
      /* straps, a lace edge and a little heart */
      c.strokeStyle = shade(cream, -22); c.lineWidth = 1.0; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-5.6, top + 0.5); c.lineTo(-5.4, top - 2.6); c.moveTo(5.6, top + 0.5); c.lineTo(5.4, top - 2.6); c.stroke();
      if (!LOW) {
        c.strokeStyle = 'rgba(226,85,154,0.35)'; c.lineWidth = 0.5;
        c.beginPath(); c.moveTo(-5, top + 0.9); c.quadraticCurveTo(0, top + 2.6, 5, top + 0.9); c.stroke();
      }
      if (!cust.mannequin) heart(c, 0, top + 6.5, 1.9, PAL.pink, 0.7);
    }
  }

  /* ---- Dresses ---- */
  /* a gathered frill hanging from y: a straight top and a scalloped edge */
  function frill(c, hw, y, n, h, col, inkW) {
    celPart(c, function () {
      c.beginPath();
      c.moveTo(-hw, y); c.lineTo(hw, y); c.lineTo(hw + 0.5, y + h * 0.45);
      for (var q = 0; q < n; q++) c.quadraticCurveTo(hw + 0.5 - (q + 0.5) * ((2 * hw + 1) / n), y + h * 1.5, hw + 0.5 - (q + 1) * ((2 * hw + 1) / n), y + h * 0.45);
      c.closePath();
    }, col, { dx: -0.8, dy: -0.6, rim: false, ink: inkW || 1.4 });
  }
  /* a rounded collar: two lobes meeting under the chin */
  function roundCollar(c, col) {
    var top = CH.torsoTop;
    for (var sd = -1; sd <= 1; sd += 2) {
      (function (sd) {
        celPart(c, function () {
          c.beginPath();
          c.moveTo(sd * 0.3, top + 1.4);
          c.lineTo(sd * 7.6, top - 0.2);
          c.quadraticCurveTo(sd * 9.4, top + 3.6, sd * 5.6, top + 5.4);
          c.quadraticCurveTo(sd * 2, top + 5.6, sd * 0.3, top + 1.4);
          c.closePath();
        }, col, { dx: -0.5, dy: -0.5, rim: false, ink: 1.3 });
      })(sd);
    }
  }
  function drawDress(c, cust) {
    if (cust.dress === 'none') return;
    PAT = cust.dressPattern && cust.dressPattern !== 'plain' ? cust.dressPattern : null;
    PATCOL = cust.dressColor;
    drawDressBody(c, cust);
    PAT = null;
  }
  function drawDressBody(c, cust) {
    var col = cust.dressColor;
    var dark = shade(col, -20);
    var light = shade(col, 22);
    var tc = trimOf(col);
    var top = CH.torsoTop, bot = CH.torsoBot;
    var fl = MOTION.flare;
    var i, s, p;
    switch (cust.dress) {
      case 'frilly':
        shadedFill(c, polyPath(c, [[-9, top], [9, top], [15.6 + fl * 0.4, bot + 6.4], [-15.6 - fl * 0.4, bot + 6.4]]), col, 2, { drape: [bot - 8, bot + 7, 16] });
        /* two rows of frill at the hem, a lace collar, a sash and its bow */
        frill(c, 16.4 + fl * 0.4, bot + 5.6, 7, 2.4, tc, 1.4);
        frill(c, 15.4 + fl * 0.4, bot + 3, 7, 2.2, light, 1.4);
        roundCollar(c, tc);
        celPart(c, bandPath(c, 10.6, bot - 7.4, bot - 4.6, 1), dark, { rim: false, ink: 1.3, dx: -1, dy: -0.4 });
        ribbonBow(c, 0, bot - 6, 2.3, tc, true);
        break;
      case 'sailor':
        shadedFill(c, polyPath(c, [[-9, top], [9, top], [15, bot + 7], [-15, bot + 7]]), col, 2, { drape: [bot - 7, bot + 7, 15] });
        /* the square collar with its stripe, and a knotted neckerchief */
        p = polyPath(c, [[-9.4, top - 0.4], [9.4, top - 0.4], [7, top + 5.6], [0, top + 9.6], [-7, top + 5.6]]);
        celPart(c, p, tc, { dx: -0.8, dy: -0.7, rim: false, ink: 1.5 });
        c.strokeStyle = col; c.lineWidth = 0.7; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(-8, top + 1.2); c.lineTo(-6, top + 5); c.lineTo(0, top + 8.2); c.lineTo(6, top + 5); c.lineTo(8, top + 1.2); c.stroke();
        celPart(c, polyPath(c, [[-1.6, top + 8.6], [1.6, top + 8.6], [3, top + 14.6], [0, top + 13.2], [-3, top + 14.6]]), PAL.coral, { rim: false, ink: 1.3, dx: -0.5, dy: -0.4 });
        celPart(c, rrPath(c, -2.2, top + 7.2, 4.4, 2.8, 1.2), shade(PAL.coral, -14), { rim: false, ink: 1.3, dx: -0.4, dy: -0.3 });
        c.strokeStyle = tc; c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(-13.6, bot + 3.2); c.lineTo(13.6, bot + 3.2); c.moveTo(-14.4, bot + 5.2); c.lineTo(14.4, bot + 5.2); c.stroke();
        break;
      case 'star':
        shadedFill(c, polyPath(c, [[-9, top], [9, top], [15.4 + fl * 0.4, bot + 7], [-15.4 - fl * 0.4, bot + 7]]), col, 2, { drape: [bot - 7, bot + 7, 15] });
        /* big gold stars scattered down the skirt, a star at the collar */
        c.save();
        polyPath(c, [[-9, top], [9, top], [15.4, bot + 7], [-15.4, bot + 7]])(); c.clip();
        var stars = [[-8, bot + 2.6, 2.9], [0.6, bot - 0.6, 3.4], [8.6, bot + 3.4, 2.6], [-3.4, bot - 7.4, 2.2], [5, bot - 9.6, 1.8], [-10.6, bot - 3, 1.6], [3.6, bot + 5.6, 1.5]];
        for (s = 0; s < stars.length; s++) {
          c.fillStyle = '#ffd24a'; star(c, stars[s][0], stars[s][1], stars[s][2]);
          c.strokeStyle = '#b8801a'; c.lineWidth = 0.3; c.stroke();
        }
        c.restore();
        frill(c, 15.8 + fl * 0.4, bot + 6.2, 8, 1.8, tc, 1.3);
        roundCollar(c, tc);
        jewel(c, 0, top + 2.6, 1.7, '#ffd24a', 'star');
        break;
      case 'ballgown':
        shadedFill(c, function () {
          c.beginPath();
          c.moveTo(-9, top);
          c.lineTo(9, top);
          c.lineTo(10, bot - 6);
          c.quadraticCurveTo(24 + fl, bot + 2, 22 + fl, bot + 11);
          c.quadraticCurveTo(0, bot + 14, -22 - fl, bot + 11);
          c.quadraticCurveTo(-24 - fl, bot + 2, -10, bot - 6);
          c.closePath();
        }, col, 2, { drape: [bot - 6, bot + 12, 22] });
        if (!LOW) {
          /* satin sheen down the lit flank */
          c.save(); c.globalAlpha = 0.32;
          c.beginPath(); c.moveTo(-6, bot - 4); c.quadraticCurveTo(-15, bot + 4, -13, bot + 11); c.lineTo(-5, bot + 11.6); c.quadraticCurveTo(-2.4, bot + 2, -2, bot - 4); c.closePath();
          c.fillStyle = '#fff'; c.fill(); c.restore();
        }
        /* an overskirt swagged up at each side over a frilled underskirt */
        frill(c, 22.4 + fl, bot + 10.4, 9, 2.6, tc, 1.5);
        for (s = -1; s <= 1; s += 2) {
          (function (s) {
            celPart(c, function () {
              c.beginPath();
              c.moveTo(s * 1, bot - 5.6);
              c.lineTo(s * 10, bot - 5.6);
              c.quadraticCurveTo(s * (23 + fl), bot + 1, s * (21.4 + fl), bot + 8);
              c.quadraticCurveTo(s * 11, bot + 8.6, s * 1, bot - 5.6);
              c.closePath();
            }, light, { dx: -1.2, dy: -1, rim: false, ink: 1.5 });
            ribbonBow(c, s * (19.6 + fl), bot + 7.2, 1.9, tc, false);
          })(s);
        }
        /* a pointed bodice edged in trim, a jewel at its heart */
        celPart(c, polyPath(c, [[-10, bot - 7.6], [10, bot - 7.6], [10, bot - 5.2], [0, bot - 1.6], [-10, bot - 5.2]]), dark, { rim: false, ink: 1.4, dx: -1, dy: -0.4 });
        c.strokeStyle = tc; c.lineWidth = 0.6;
        c.beginPath(); c.moveTo(-7.4, top + 0.8); c.quadraticCurveTo(-3.6, top + 5.4, 0, top + 2.6); c.quadraticCurveTo(3.6, top + 5.4, 7.4, top + 0.8); c.stroke();
        jewel(c, 0, bot - 5.4, 2, PAL.sun, 'round');
        sparkle(c, -12, bot + 3, 2, 1); sparkle(c, 14.6, bot - 0.4, 1.6, 4);
        break;
      case 'princess':
        shadedFill(c, polyPath(c, [[-8, top], [8, top], [18 + fl * 0.5, bot + 10], [-18 - fl * 0.5, bot + 10]]), col, 2, { drape: [bot - 8, bot + 10, 18] });
        /* a front panel in trim between two gold braids, a jewelled sash */
        celPart(c, polyPath(c, [[-2.2, top + 3], [2.2, top + 3], [6.4, bot + 9.8], [-6.4, bot + 9.8]]), tc, { rim: false, ink: 1.3, dx: -0.8, dy: -0.6 });
        c.strokeStyle = '#b8801a'; c.lineWidth = 1.3; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-2.2, top + 3); c.lineTo(-6.4, bot + 9.6); c.moveTo(2.2, top + 3); c.lineTo(6.4, bot + 9.6); c.moveTo(-17.4, bot + 7); c.lineTo(17.4, bot + 7); c.stroke();
        c.strokeStyle = '#ffd96a'; c.lineWidth = 0.7;
        c.beginPath(); c.moveTo(-2.2, top + 3); c.lineTo(-6.4, bot + 9.6); c.moveTo(2.2, top + 3); c.lineTo(6.4, bot + 9.6); c.moveTo(-17.4, bot + 7); c.lineTo(17.4, bot + 7); c.stroke();
        for (i = 0; i < 3; i++) pearl(c, 0, top + 7 + i * 5.4, 1, '#fff3ee');
        celPart(c, bandPath(c, 8.8, top + 1, top + 3.2, 1.6), '#f6c343', { rim: false, ink: 1.2, dx: -0.6, dy: -0.3, s: 1.3 });
        jewel(c, 0, top + 3.4, 1.7, PAL.sky, 'diamond');
        break;
      case 'sundress':
        shadedFill(c, polyPath(c, [[-8, top + 2], [8, top + 2], [16 + fl * 0.4, bot + 8], [-16 - fl * 0.4, bot + 8]]), col, 2, { drape: [bot - 8, bot + 8, 16] });
        /* tie straps, a smocked band, daisies and a frill */
        c.strokeStyle = inkColor(col); c.lineWidth = 2.1; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-6, top + 2); c.lineTo(-5.4, top - 2.6); c.moveTo(6, top + 2); c.lineTo(5.4, top - 2.6); c.stroke();
        c.strokeStyle = col; c.lineWidth = 1.3; c.stroke();
        if (!LOW) {
          c.strokeStyle = shadowCached(col, 26, false); c.lineWidth = 0.4; c.globalAlpha = 0.8;
          c.beginPath();
          for (i = 0; i < 3; i++) { c.moveTo(-8.2, top + 3.6 + i * 1.5); c.lineTo(8.2, top + 3.6 + i * 1.5); }
          c.stroke(); c.globalAlpha = 1;
        }
        for (i = 0; i < 5; i++) flower(c, -10 + i * 5, top + 11 + (i % 2) * 7.4, 1.9, PAL.cream, PAL.sun);
        frill(c, 16.6 + fl * 0.4, bot + 7.2, 8, 2, tc, 1.3);
        break;
      case 'tutu':
        shadedFill(c, rrPath(c, -9, top, 18, (bot - 3) - top, 4), col);
        /* three stiff layers of net, each a little shorter and lighter */
        for (i = 0; i < 3; i++) {
          (function (i) {
            var hw = 19.5 - i * 2.2 + fl * 0.7, y0 = bot - 5.4, y1 = bot + 5.4 - i * 2.6;
            c.save();
            c.globalAlpha = 0.82;
            celPart(c, function () {
              c.beginPath();
              c.moveTo(-8.6, y0); c.lineTo(8.6, y0);
              c.quadraticCurveTo(hw * 0.8, y0 + 1, hw, y1 - 1.6);
              for (var q = 0; q < 9; q++) c.quadraticCurveTo(hw - (q + 0.5) * (2 * hw / 9), y1 + 2.2, hw - (q + 1) * (2 * hw / 9), y1 - 1.6);
              c.quadraticCurveTo(-hw * 0.8, y0 + 1, -8.6, y0);
              c.closePath();
            }, i === 1 ? light : i ? mix(col, '#ffffff', 0.5) : col, { dx: -1, dy: -0.8, rim: false, ink: 1.3 });
            c.restore();
          })(i);
        }
        celPart(c, bandPath(c, 9.4, bot - 6.6, bot - 4, 0.8), dark, { rim: false, ink: 1.3, dx: -0.8, dy: -0.4 });
        ribbonBow(c, 0, bot - 5.2, 2, tc, false);
        c.strokeStyle = tc; c.lineWidth = 0.6;
        c.beginPath(); c.moveTo(-7, top + 0.8); c.quadraticCurveTo(0, top + 5, 7, top + 0.8); c.stroke();
        sparkle(c, -11, bot + 1, 1.8, 2); sparkle(c, 9.4, bot - 1.6, 1.5, 5);
        break;
      case 'kimono':
        shadedFill(c, polyPath(c, [[-9, top], [9, top], [13, bot + 10], [-13, bot + 10]]), col, 2, { drape: [bot - 4, bot + 10, 13] });
        /* blossoms drifting up from the hem */
        c.save();
        polyPath(c, [[-9, top], [9, top], [13, bot + 10], [-13, bot + 10]])(); c.clip();
        var bl = [[-8.4, bot + 6.4, 2.3], [-2.6, bot + 7.6, 1.8], [4.4, bot + 5.4, 2.5], [9.4, bot + 8, 1.7], [-6, bot + 1.4, 1.5], [7.4, bot + 0.4, 1.4]];
        for (i = 0; i < bl.length; i++) flower(c, bl[i][0], bl[i][1], bl[i][2], i % 2 ? PAL.cream : tc, PAL.sun);
        c.restore();
        /* crossed collar with an inner collar showing (the wide sleeves hang from the arms) */
        celPart(c, polyPath(c, [[7, top - 0.2], [-1, top + 10], [1.6, top + 10.6], [9.4, top + 1]]), tc, { rim: false, ink: 1.3, dx: -0.4, dy: -0.4 });
        celPart(c, polyPath(c, [[-7, top - 0.2], [1, top + 10], [-1.6, top + 10.6], [-9.4, top + 1]]), tc, { rim: false, ink: 1.3, dx: -0.4, dy: -0.4 });
        /* obi, its cord and knot */
        celPart(c, rrPath(c, -10.2, top + 10.4, 20.4, 6.6, 1.5), dark, { rim: false, ink: 1.5, dx: -1, dy: -0.6 });
        c.strokeStyle = PAL.sun; c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(-10, top + 13.7); c.lineTo(10, top + 13.7); c.stroke();
        jewel(c, 0, top + 13.7, 1.5, PAL.sun, 'round');
        break;
      case 'polka':
        shadedFill(c, polyPath(c, [[-9, top], [9, top], [16 + fl * 0.4, bot + 8], [-16 - fl * 0.4, bot + 8]]), col, 2, { drape: [bot - 8, bot + 8, 16] });
        c.save();
        polyPath(c, [[-9, top], [9, top], [16, bot + 8], [-16, bot + 8]])();
        c.clip();
        c.fillStyle = tc;
        c.beginPath();
        for (var row = 0; row < 5; row++) {
          for (var cc = -3; cc <= 3; cc++) { c.moveTo(cc * 6 + (row % 2) * 3 + 1.5, top + 3 + row * 6); c.arc(cc * 6 + (row % 2) * 3, top + 3 + row * 6, 1.5, 0, TAU); }
        }
        c.fill();
        c.restore();
        roundCollar(c, tc);
        celPart(c, bandPath(c, 10.8, top + 9, top + 12, 1), dark, { rim: false, ink: 1.3, dx: -1, dy: -0.4 });
        ribbonBow(c, -6, top + 10.6, 2, dark, true);
        break;
      case 'pinafore':
        shadedFill(c, polyPath(c, [[-9, top], [9, top], [15.5, bot + 8], [-15.5, bot + 8]]), col, 2, { drape: [bot - 6, bot + 8, 15] });
        /* the white apron: bib, waistband and a frilled skirt panel */
        celPart(c, rrPath(c, -5, top + 1.5, 10, 9, 1.6), PAL.cream, { dx: -0.8, dy: -0.8, rim: false, ink: 1.4 });
        celPart(c, function () {
          c.beginPath();
          c.moveTo(-7.5, bot - 6); c.lineTo(7.5, bot - 6); c.lineTo(10.5, bot + 5.5);
          for (i = 0; i < 6; i++) c.quadraticCurveTo(10.5 - (i + 0.5) * 3.5, bot + 8, 10.5 - (i + 1) * 3.5, bot + 5.5);
          c.closePath();
        }, PAL.cream, { dx: -1, dy: -0.8, ink: 1.4 });
        fillRound(c, -9.5, bot - 7.5, 19, 2.6, 1.2, PAL.cream);
        for (s = -1; s <= 1; s += 2) celPart(c, ellPath(c, s * 9.2, top + 1.2, 3.6, 2.4), PAL.cream, { dx: -0.5, dy: -0.5, rim: false, ink: 1.3 });
        heart(c, 0, top + 5.6, 1.6, PAL.pink, 0.6);
        break;
      case 'bubble':
        shadedFill(c, polyPath(c, [[-8.6, top], [8.6, top], [9.6, bot - 5], [-9.6, bot - 5]]), col, 2, {});
        shadedFill(c, function () {
          c.beginPath();
          c.moveTo(-9.4, bot - 6);
          c.lineTo(9.4, bot - 6);
          c.bezierCurveTo(17 + MOTION.flare, bot - 4, 18 + MOTION.flare, bot + 6, 12, bot + 8.5);
          c.quadraticCurveTo(0, bot + 10.5, -12, bot + 8.5);
          c.bezierCurveTo(-18 - MOTION.flare, bot + 6, -17 - MOTION.flare, bot - 4, -9.4, bot - 6);
          c.closePath();
        }, col, 2, { drape: [bot - 6, bot + 9, 14] });
        c.save(); c.globalAlpha = 0.4; c.strokeStyle = '#ffffff'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(-12, bot - 2); c.quadraticCurveTo(-14.5, bot + 3, -11, bot + 6.5); c.stroke();
        c.restore();
        fillRound(c, -9.8, bot - 7.2, 19.6, 2.8, 1.3, dark, false);
        ribbonBow(c, 0, bot - 5.8, 1.9, light, false);
        break;
      case 'tiered':
        for (var tr = 2; tr >= 0; tr--) {
          (function (tr) {
            var y0 = bot - 7 + tr * 7, y1 = y0 + 8.5, hw = 10.5 + tr * 2.6 + MOTION.flare * tr * 0.4;
            shadedFill(c, function () {
              c.beginPath();
              c.moveTo(-8.5 - tr * 1.8, y0);
              c.lineTo(8.5 + tr * 1.8, y0);
              c.lineTo(hw, y1);
              c.quadraticCurveTo(0, y1 + 1.6, -hw, y1);
              c.closePath();
            }, tr % 2 ? light : col, 2, { drape: [y0, y1, hw] });
          })(tr);
        }
        shadedFill(c, polyPath(c, [[-8.6, top], [8.6, top], [9.4, bot - 6], [-9.4, bot - 6]]), col, 2, {});
        c.strokeStyle = PAL.cream; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(-7.5, top + 2.5); c.quadraticCurveTo(0, top + 6.5, 7.5, top + 2.5); c.stroke();
        break;
      case 'magical':
        /* petticoat peeking under a puffed hem */
        shadedFill(c, function () {
          c.beginPath();
          c.moveTo(-10, bot - 2); c.lineTo(10, bot - 2); c.lineTo(17 + MOTION.flare, bot + 9.5);
          for (i = 0; i < 8; i++) c.quadraticCurveTo(17 - (i + 0.5) * 4.25, bot + 12, 17 - (i + 1) * 4.25, bot + 9.5);
          c.closePath();
        }, '#ffffff', 2, {});
        shadedFill(c, function () {
          c.beginPath();
          c.moveTo(-8.8, top); c.lineTo(8.8, top); c.lineTo(9.6, bot - 6);
          c.quadraticCurveTo(17 + MOTION.flare, bot, 15.5 + MOTION.flare, bot + 7);
          c.quadraticCurveTo(0, bot + 9.5, -15.5 - MOTION.flare, bot + 7);
          c.quadraticCurveTo(-17 - MOTION.flare, bot, -9.6, bot - 6);
          c.closePath();
        }, col, 2, { drape: [bot - 6, bot + 8, 15] });
        /* sailor-ish collar, a gem and the big chest bow */
        celPart(c, polyPath(c, [[-8.8, top], [8.8, top], [5, top + 6], [0, top + 3.6], [-5, top + 6]]), '#ffffff', { dx: -0.6, dy: -0.6, rim: false, ink: 1.4 });
        c.strokeStyle = light; c.lineWidth = 0.7;
        c.beginPath(); c.moveTo(-14, bot + 4.5); c.quadraticCurveTo(0, bot + 7.5, 14, bot + 4.5); c.stroke();
        ribbonBow(c, 0, top + 5.5, 3.2, PAL.pinkDeep, true);
        c.fillStyle = PAL.sun; star(c, 0, bot - 5.5, 1.8);
        break;
      case 'petal':
        /* a flower fairy's dress: a leaf collar and a skirt of petals */
        for (i = 2; i >= 0; i--) {
          for (s = -1; s <= 1; s += 2) {
            if (!i && s > 0) continue;
            (function (i, s) {
              var a = s * i * 0.46 + fl * 0.04 * s * i;
              c.save();
              c.translate(s * i * 3.2, bot - 6); c.rotate(-a);
              celPart(c, function () { c.beginPath(); c.moveTo(0, -1); c.bezierCurveTo(7.4, 3, 6.4, 11, 0, 15.4); c.bezierCurveTo(-6.4, 11, -7.4, 3, 0, -1); c.closePath(); }, i % 2 ? light : col, { dx: -0.9, dy: -0.8, ink: 1.6 });
              if (!LOW) {
                c.strokeStyle = shadowCached(col, 26, false); c.lineWidth = 0.4; c.lineCap = 'round'; c.globalAlpha = 0.7;
                c.beginPath(); c.moveTo(0, 2); c.lineTo(0, 13); c.stroke(); c.globalAlpha = 1;
              }
              c.restore();
            })(i, s);
          }
        }
        shadedFill(c, polyPath(c, [[-8.6, top], [8.6, top], [9.6, bot - 5], [-9.6, bot - 5]]), col, 2, {});
        for (s = -1; s <= 1; s += 2) { leaf(c, s * 0.6, top + 1.6, 8.4, s > 0 ? 0.42 : Math.PI - 0.42, '#6cc07a'); leaf(c, s * 1.4, top + 2.6, 6, s > 0 ? 0.95 : Math.PI - 0.95, '#58ad6c'); }
        celPart(c, bandPath(c, 9.8, bot - 7.2, bot - 4.6, 0.8), '#58ad6c', { rim: false, ink: 1.3, dx: -0.8, dy: -0.4 });
        flower(c, 0, bot - 5.6, 2.9, tc, PAL.sun);
        break;
      case 'sweater':
        /* a cosy knit dress: roll neck, cables down the front, ribbed hem */
        p = function () {
          c.beginPath();
          c.moveTo(-8.8, top); c.lineTo(8.8, top);
          c.quadraticCurveTo(10.6, top + 9, 12 + fl * 0.3, bot + 4.6);
          c.lineTo(-12 - fl * 0.3, bot + 4.6);
          c.quadraticCurveTo(-10.6, top + 9, -8.8, top);
          c.closePath();
        };
        shadedFill(c, p, col, 2, {});
        if (!LOW) {
          c.save(); p(); c.clip();
          c.strokeStyle = shadowCached(col, 26, false); c.lineWidth = 0.45; c.lineCap = 'round'; c.globalAlpha = 0.75;
          c.beginPath();
          for (s = -1; s <= 1; s++) {
            for (i = top + 4; i < bot + 2; i += 2.6) { c.moveTo(s * 5 - 1.1, i); c.quadraticCurveTo(s * 5 + 1.1, i + 0.9, s * 5 - 1.1, i + 2.6); c.moveTo(s * 5 + 1.1, i); c.quadraticCurveTo(s * 5 - 1.1, i + 0.9, s * 5 + 1.1, i + 2.6); }
          }
          for (s = -1; s <= 1; s += 2) { c.moveTo(s * 2.5, top + 3); c.lineTo(s * 2.5, bot + 2.4); c.moveTo(s * 7.6, top + 3); c.lineTo(s * 8.4, bot + 2.4); }
          c.stroke();
          c.restore();
        }
        celPart(c, rrPath(c, -12.6 - fl * 0.3, bot + 2.6, 25.2 + fl * 0.6, 3.8, 1.6), dark, { rim: false, ink: 1.5, dx: -1, dy: -0.5 });
        celPart(c, rrPath(c, -6.6, top - 1.6, 13.2, 4.6, 2.2), light, { rim: false, ink: 1.5, dx: -0.8, dy: -0.6 });
        if (!LOW) {
          c.strokeStyle = shadowCached(col, 30, false); c.lineWidth = 0.4; c.globalAlpha = 0.7;
          c.beginPath();
          for (i = -11; i <= 11; i += 1.7) { c.moveTo(i, bot + 3); c.lineTo(i, bot + 6); }
          for (i = -5; i <= 5; i += 1.7) { c.moveTo(i, top - 1); c.lineTo(i, top + 2.6); }
          c.stroke(); c.globalAlpha = 1;
        }
        heart(c, 5.6, top + 7.4, 1.7, tc, 0.7);
        break;
      case 'rainbow':
        /* a plain bodice over a skirt banded like a rainbow, a cloud at the waist */
        p = function () {
          c.beginPath();
          c.moveTo(-9.6, bot - 6); c.lineTo(9.6, bot - 6);
          c.quadraticCurveTo(18 + fl, bot - 1, 17.4 + fl, bot + 8.4);
          c.quadraticCurveTo(0, bot + 11.4, -17.4 - fl, bot + 8.4);
          c.quadraticCurveTo(-18 - fl, bot - 1, -9.6, bot - 6);
          c.closePath();
        };
        shadedFill(c, p, col, 2, {});
        c.save(); p(); c.clip();
        var rb = ['#ff8f9c', '#ffbf7a', '#ffe680', '#a4e6a0', '#9fd4ff', '#c9a8ff'];
        for (i = 0; i < 6; i++) {
          c.fillStyle = rb[i];
          c.beginPath();
          c.moveTo(-22, bot - 6.4 + i * 2.6); c.quadraticCurveTo(0, bot - 3.4 + i * 2.9, 22, bot - 6.4 + i * 2.6);
          c.lineTo(22, bot - 3.6 + i * 2.6 + 3); c.quadraticCurveTo(0, bot - 0.2 + i * 2.9 + 3, -22, bot - 3.6 + i * 2.6 + 3);
          c.closePath(); c.fill();
        }
        if (!LOW) {
          /* the folds and the light, back over the bands */
          for (i = -2; i <= 2; i++) {
            c.fillStyle = 'rgba(60,20,80,0.13)';
            c.beginPath(); c.moveTo(i * 2.6, bot - 6); c.lineTo(i * 7.2 + 1.6, bot + 12); c.lineTo(i * 7.2 - 0.6, bot + 12); c.closePath(); c.fill();
          }
          var rg = c.createLinearGradient(-18, 0, 18, 0);
          rg.addColorStop(0, 'rgba(255,255,255,0.28)'); rg.addColorStop(0.3, 'rgba(255,255,255,0)'); rg.addColorStop(0.75, 'rgba(42,16,48,0)'); rg.addColorStop(1, 'rgba(42,16,48,0.2)');
          c.fillStyle = rg; c.fillRect(-22, bot - 8, 44, 22);
        }
        c.restore();
        p(); c.fillStyle = '#c9a8ff'; ink(c, 2);
        shadedFill(c, polyPath(c, [[-8.6, top], [8.6, top], [9.8, bot - 5], [-9.8, bot - 5]]), col, 2, {});
        roundCollar(c, tc);
        /* cloud buckle */
        p = function () { c.beginPath(); c.arc(-2.4, bot - 5.2, 1.9, Math.PI * 0.5, Math.PI * 1.5); c.arc(-0.4, bot - 6.6, 2.1, Math.PI, Math.PI * 1.9); c.arc(2.2, bot - 5.6, 2, Math.PI * 1.4, Math.PI * 0.5); c.closePath(); };
        celPart(c, p, '#ffffff', { rim: false, ink: 1.3, dx: -0.4, dy: -0.4 });
        break;
      case 'starlight':
        /* the evening sky: deepening to night at the hem, a moon and stars */
        p = function () {
          c.beginPath();
          c.moveTo(-8.6, top + 1); c.lineTo(8.6, top + 1); c.lineTo(9.6, bot - 6);
          c.quadraticCurveTo(19 + fl, bot + 1, 18 + fl, bot + 10);
          c.quadraticCurveTo(0, bot + 13, -18 - fl, bot + 10);
          c.quadraticCurveTo(-19 - fl, bot + 1, -9.6, bot - 6);
          c.closePath();
        };
        shadedFill(c, p, col, 2, { drape: [bot - 6, bot + 11, 18] });
        c.save(); p(); c.clip();
        var ng = c.createLinearGradient(0, bot - 8, 0, bot + 12);
        ng.addColorStop(0, 'rgba(40,24,90,0)'); ng.addColorStop(1, 'rgba(40,24,90,0.72)');
        c.fillStyle = ng; c.fillRect(-24, bot - 8, 48, 22);
        c.fillStyle = '#fff3b8';
        var ss = [[-12, bot + 6, 1.4], [-6.4, bot + 2, 1], [-1, bot + 7.6, 1.6], [5.4, bot + 3.4, 1.1], [11.6, bot + 7, 1.4], [8.4, bot - 1.4, 0.8], [-9.4, bot - 2, 0.8], [1.6, bot - 0.6, 0.7]];
        for (i = 0; i < ss.length; i++) star(c, ss[i][0], ss[i][1], ss[i][2]);
        c.restore();
        p(); c.fillStyle = mix(col, '#28185a', 0.4); ink(c, 2);
        /* a crescent moon on the bodice, straps, a sash of trim */
        c.fillStyle = '#fff3b8';
        c.beginPath(); c.arc(0, top + 7, 2.9, Math.PI * 0.35, Math.PI * 1.65); c.arc(1.4, top + 7, 2.3, Math.PI * 1.55, Math.PI * 0.45, true); c.closePath(); c.fill();
        c.strokeStyle = '#b8801a'; c.lineWidth = 0.3; c.stroke();
        c.strokeStyle = inkColor(col); c.lineWidth = 1.9; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-6, top + 1.4); c.lineTo(-5.4, top - 2.6); c.moveTo(6, top + 1.4); c.lineTo(5.4, top - 2.6); c.stroke();
        c.strokeStyle = col; c.lineWidth = 1.1; c.stroke();
        celPart(c, bandPath(c, 9.8, bot - 7.4, bot - 5, 0.8), tc, { rim: false, ink: 1.3, dx: -0.8, dy: -0.4 });
        sparkle(c, -13, bot + 1.4, 2.2, 1); sparkle(c, 12, bot + 2.4, 1.8, 3); sparkle(c, 3, bot + 5, 1.5, 6);
        break;
      case 'cheer':
        /* a cheer uniform: a pleated skirt with trim in the pleats, a V of
           stripes on the shell top and a star */
        p = function () {
          c.beginPath();
          c.moveTo(-9.4, bot - 6); c.lineTo(9.4, bot - 6); c.lineTo(15.6 + fl, bot + 5.6);
          for (var q = 0; q < 8; q++) c.lineTo(15.6 + fl - (q + 1) * ((31.2 + 2 * fl) / 8), bot + 5.6 + (q % 2 ? 0 : 1.2));
          c.closePath();
        };
        shadedFill(c, p, col, 2, {});
        c.save(); p(); c.clip();
        c.fillStyle = tc;
        for (i = -3; i <= 3; i += 2) { c.beginPath(); c.moveTo(i * 2.5 - 0.5, bot - 6); c.lineTo(i * 4.4 + 2.4 + fl * i * 0.14, bot + 8); c.lineTo(i * 4.4 - 1.6 + fl * i * 0.14, bot + 8); c.closePath(); c.fill(); }
        if (!LOW) {
          c.strokeStyle = shadowCached(col, 30, false); c.lineWidth = 0.4; c.globalAlpha = 0.8;
          c.beginPath();
          for (i = -3; i <= 4; i++) { c.moveTo(i * 2.5 - 1.6, bot - 6); c.lineTo(i * 4.4 - 2.2, bot + 8); }
          c.stroke();
        }
        c.restore();
        p(); c.fillStyle = col; ink(c, 2);
        p = polyPath(c, [[-8.6, top], [8.6, top], [9.8, bot - 4.6], [-9.8, bot - 4.6]]);
        shadedFill(c, p, col, 2, {});
        c.save(); p(); c.clip();
        c.strokeStyle = tc; c.lineWidth = 1.5; c.lineJoin = 'miter';
        c.beginPath(); c.moveTo(-10, top + 0.6); c.lineTo(0, top + 9.6); c.lineTo(10, top + 0.6); c.stroke();
        c.lineWidth = 0.7;
        c.beginPath(); c.moveTo(-10, top + 3.6); c.lineTo(0, top + 12.4); c.lineTo(10, top + 3.6); c.stroke();
        c.fillStyle = tc; c.fillRect(-11, bot - 6.6, 22, 1.6);
        c.restore();
        p(); c.fillStyle = col; ink(c, 2);
        jewel(c, 0, top + 4.2, 2.2, '#ffd24a', 'star');
        break;
    }
  }
  /* What a dress trails behind her: the magical dress's waist bow tails. */
  function drawDressBack(c, cust) {
    if (cust.dress !== 'magical') return;
    var col = PAL.pinkDeep, bot = CH.torsoBot, sw = -MOTION.skirt * 1.4 + MOTION.hairA * 10;
    for (var sd = -1; sd <= 1; sd += 2) {
      (function (sd) {
        celPart(c, function () {
          c.beginPath();
          c.moveTo(sd * 3, bot - 6);
          c.quadraticCurveTo(sd * 9 + sw * 0.5, bot + 3, sd * 8 + sw, bot + 13);
          c.lineTo(sd * 5.5 + sw, bot + 11.5);
          c.lineTo(sd * 4 + sw * 0.9, bot + 13.5);
          c.quadraticCurveTo(sd * 5 + sw * 0.4, bot + 3, sd * 0.5, bot - 5);
          c.closePath();
        }, col, { dx: -0.8, dy: -0.8, rim: false, ink: 1.5 });
      })(sd);
    }
  }

  /* ---- Jackets ---- */
  function jacketHasSleeves(j) { return j !== 'none' && j !== 'cape' && j !== 'vest' && j !== 'poncho'; }

  function drawJacketBack(c, cust) {
    var col = cust.jacketColor, top = CH.torsoTop;
    if (cust.jacket === 'cape') {
      var fl = MOTION.flare * 1.5;
      PAT = cust.jacketPattern && cust.jacketPattern !== 'plain' ? cust.jacketPattern : null;
      PATCOL = shade(col, -6);
      shadedFill(c, function () {
        c.beginPath();
        c.moveTo(-9, top + 1);
        c.lineTo(9, top + 1);
        c.quadraticCurveTo(20 + fl, top + 14, 17 + fl, top + 30);
        c.quadraticCurveTo(0, top + 32, -17 - fl, top + 30);
        c.quadraticCurveTo(-20 - fl, top + 14, -9, top + 1);
        c.closePath();
      }, shade(col, -6), 2, { drape: [top + 4, top + 31, 17] });
      PAT = null;
    } else if (cust.jacket === 'hoodie' || cust.jacket === 'raincoat') {
      /* hood resting behind the head */
      celPart(c, ellPath(c, 0, top - 2, 12, 6), shade(col, -8), { dx: -1, dy: -1, rim: false });
    }
  }

  function drawJacketFront(c, cust) {
    if (cust.jacket === 'none') return;
    PAT = cust.jacketPattern && cust.jacketPattern !== 'plain' ? cust.jacketPattern : null;
    PATCOL = cust.jacketColor;
    drawJacketBody(c, cust);
    PAT = null;
  }
  function drawJacketBody(c, cust) {
    var col = cust.jacketColor;
    var dark = shade(col, -22), light = shade(col, 25), tc = trimOf(col);
    var top = CH.torsoTop, bot = CH.torsoBot;
    var fl = MOTION.flare;
    var i, s, p;
    switch (cust.jacket) {
      case 'poncho':
        /* a woven square worn point-down, banded in trim, fringed */
        p = function () {
          c.beginPath();
          c.moveTo(-6, top - 1); c.lineTo(6, top - 1);
          c.quadraticCurveTo(13, top + 3, 16.4 + fl * 0.5, top + 11.6);
          c.lineTo(0, bot + 5.6);
          c.lineTo(-16.4 - fl * 0.5, top + 11.6);
          c.quadraticCurveTo(-13, top + 3, -6, top - 1);
          c.closePath();
        };
        shadedFill(c, p, col, 2, {});
        c.save(); p(); c.clip();
        c.strokeStyle = tc; c.lineWidth = 1.5; c.lineJoin = 'miter';
        c.beginPath(); c.moveTo(-19, top + 7.6); c.lineTo(0, bot + 0.6); c.lineTo(19, top + 7.6); c.stroke();
        c.strokeStyle = dark; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(-19, top + 4.6); c.lineTo(0, bot - 2.6); c.lineTo(19, top + 4.6); c.stroke();
        if (!LOW) {
          c.fillStyle = tc;
          for (i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 3.4, top + 3.4 + Math.abs(i) * 0.5); c.lineTo(i * 3.4 + 1.1, top + 4.9 + Math.abs(i) * 0.5); c.lineTo(i * 3.4, top + 6.4 + Math.abs(i) * 0.5); c.lineTo(i * 3.4 - 1.1, top + 4.9 + Math.abs(i) * 0.5); c.closePath(); c.fill(); }
        }
        c.restore();
        if (!LOW) {
          c.strokeStyle = inkColor(col); c.lineWidth = 0.55; c.lineCap = 'round';
          c.beginPath();
          for (i = 1; i < 9; i++) {
            var fu = i / 9;
            c.moveTo(-16.4 * (1 - fu), top + 11.6 + (bot + 5.6 - top - 11.6) * fu); c.lineTo(-16.4 * (1 - fu) - 0.6, top + 13.8 + (bot + 5.6 - top - 11.6) * fu);
            c.moveTo(16.4 * (1 - fu), top + 11.6 + (bot + 5.6 - top - 11.6) * fu); c.lineTo(16.4 * (1 - fu) + 0.6, top + 13.8 + (bot + 5.6 - top - 11.6) * fu);
          }
          c.stroke();
        }
        celPart(c, polyPath(c, [[-3.4, top - 1], [3.4, top - 1], [0, top + 4.4]]), dark, { rim: false, ink: 1.3, dx: -0.4, dy: -0.4 });
        break;
      case 'trench':
        /* a belted coat to the knee: storm lapels, two rows of buttons */
        p = polyPath(c, [[-10.4, top - 0.6], [10.4, top - 0.6], [13 + fl * 0.4, bot + 9.6], [-13 - fl * 0.4, bot + 9.6]]);
        shadedFill(c, p, col, 2, { drape: [bot - 2, bot + 9.6, 13] });
        if (!LOW) {
          c.strokeStyle = shadowCached(col, 30, false); c.lineWidth = 0.5; c.globalAlpha = 0.8;
          c.beginPath(); c.moveTo(2.4, top + 6); c.lineTo(3.2, bot + 9.4); c.stroke();
          c.globalAlpha = 1;
        }
        celPart(c, polyPath(c, [[-9.6, top - 0.6], [-1.6, top - 0.6], [2.6, top + 7.6], [-4.6, top + 4.4]]), light, { rim: false, ink: 1.4, dx: -0.6, dy: -0.5 });
        celPart(c, polyPath(c, [[9.6, top - 0.6], [1.6, top - 0.6], [2.6, top + 7.6], [6.4, top + 4.4]]), light, { rim: false, ink: 1.4, dx: -0.6, dy: -0.5 });
        celPart(c, bandPath(c, 11, bot - 7, bot - 4.2, 0.9), dark, { rim: false, ink: 1.3, dx: -1, dy: -0.4 });
        clasp(c, -1, bot - 5.2, 3.2, 3.6);
        celPart(c, polyPath(c, [[1.4, bot - 5.6], [6.4, bot - 3.6], [5.6, bot + 0.8], [1.4, bot - 3.4]]), dark, { rim: false, ink: 1.2, dx: -0.3, dy: -0.3 });
        for (i = 0; i < 2; i++) for (s = -1; s <= 1; s += 2) { fillEllipse(c, 2.8 + s * 3.2, top + 9.6 + i * 9.6 + (i ? 2 : 0), 0.95, 0.95, tc, false); c.strokeStyle = inkColor(col); c.lineWidth = 0.3; c.stroke(); }
        break;
      case 'fuzzy':
        /* a teddy coat: a soft broken edge all round, a big fluffy collar */
        p = function () { fluffPath(c, 0, (top + bot) / 2 + 2.4, 12.6, 12.4, 18, 0.2); };
        shadedFill(c, p, col, 2, {});
        if (!LOW) {
          c.save(); p(); c.clip();
          c.strokeStyle = shadowCached(col, 20, false); c.lineWidth = 0.45; c.lineCap = 'round'; c.globalAlpha = 0.75;
          c.beginPath();
          for (i = 0; i < 14; i++) { var tx = -9 + (i * 7 % 19), ty = top + 4 + (i * 5 % 17); c.moveTo(tx + 1.3, ty); c.arc(tx, ty, 1.3, 0, 1.5); }
          c.stroke();
          c.restore();
        }
        c.strokeStyle = shadowCached(col, 30, false); c.lineWidth = 0.5;
        c.beginPath(); c.moveTo(0, top + 4); c.lineTo(0, bot + 6); c.stroke();
        for (i = 0; i < 2; i++) { celPart(c, rrPath(c, -1.6, top + 8 + i * 6, 3.2, 1.7, 0.85), '#c98a5e', { rim: false, ink: 1.1, dx: -0.3, dy: -0.3 }); }
        fluff(c, 0, top + 1.6, 10.4, 3.6, tc, 12, 1.5);
        break;
      case 'windbreaker':
        /* colour-blocked: a trim yoke over the body, a zip, an elastic hem */
        p = rrPath(c, -11.4, top - 1, 22.8, (bot + 5.4) - (top - 1), 5);
        shadedFill(c, p, col, 2, {});
        c.save(); p(); c.clip();
        c.fillStyle = tc;
        c.beginPath(); c.moveTo(-13, top - 2); c.lineTo(13, top - 2); c.lineTo(13, top + 5.4); c.lineTo(0, top + 10.4); c.lineTo(-13, top + 5.4); c.closePath(); c.fill();
        c.fillStyle = dark;
        c.beginPath(); c.moveTo(-13, top + 5.4); c.lineTo(0, top + 10.4); c.lineTo(13, top + 5.4); c.lineTo(13, top + 7.4); c.lineTo(0, top + 12.4); c.lineTo(-13, top + 7.4); c.closePath(); c.fill();
        c.fillStyle = 'rgba(42,16,48,0.12)'; c.fillRect(5.6, top - 2, 8, 30);
        c.fillStyle = dark; c.fillRect(-12, bot + 2.6, 24, 3.4);
        c.restore();
        p(); c.fillStyle = col; ink(c, 2);
        c.strokeStyle = inkColor(col); c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(0, top + 0.6); c.lineTo(0, bot + 5); c.stroke();
        c.strokeStyle = '#e8e2ee'; c.lineWidth = 0.45; c.setLineDash([0.6, 0.5]);
        c.beginPath(); c.moveTo(0, top + 0.6); c.lineTo(0, bot + 5); c.stroke(); c.setLineDash([]);
        clasp(c, 0.2, top + 4.6 + Math.abs(MOTION.skirt) * 0.3, 1.5, 2.6);
        celPart(c, rrPath(c, -6, top - 2.4, 12, 3.4, 1.6), col, { rim: false, ink: 1.4, dx: -0.6, dy: -0.4 });
        if (!LOW) {
          c.strokeStyle = shadowCached(col, 30, false); c.lineWidth = 0.5; c.lineCap = 'round';
          c.beginPath(); c.moveTo(-8.6, bot - 3); c.lineTo(-5.6, bot); c.moveTo(8.6, bot - 3); c.lineTo(5.6, bot); c.stroke();
        }
        break;
      case 'denim':
        shadedFill(c, polyPath(c, [[-10, top], [-3, top], [-3.4, bot + 4], [-10.6, bot + 4]]), col, 2, { dx: -1.6, dy: -2 });
        shadedFill(c, polyPath(c, [[10, top], [3, top], [3.4, bot + 4], [10.6, bot + 4]]), col, 2, { dx: -1.6, dy: -2 });
        fillPath(c, [[-10, top], [-3, top], [-7, top + 5]], light);
        fillPath(c, [[10, top], [3, top], [7, top + 5]], light);
        fillRound(c, -9, top + 7, 5, 4, 1, dark, false);
        fillRound(c, 4, top + 7, 5, 4, 1, dark, false);
        c.strokeStyle = shade(col, 40); c.lineWidth = 0.45; c.setLineDash([0.8, 0.6]);
        c.beginPath(); c.moveTo(-9.6, bot + 2.6); c.lineTo(-3.6, bot + 2.6); c.moveTo(3.6, bot + 2.6); c.lineTo(9.6, bot + 2.6); c.stroke();
        c.setLineDash([]);
        fillEllipse(c, -3.8, top + 9, 0.7, 0.7, PAL.gold, false);
        break;
      case 'hoodie':
        shadedFill(c, rrPath(c, -11, top - 1, 22, (bot + 6) - (top - 1), 6), col);
        celPart(c, rrPath(c, -6, bot - 2, 12, 6, 2), dark, { rim: false, ink: 1.5 });
        c.strokeStyle = PAL.cream; c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(-3, top + 2); c.lineTo(-3.3, top + 9); c.moveTo(3, top + 2); c.lineTo(3.3, top + 9); c.stroke();
        fillEllipse(c, -3.3, top + 9.4, 0.8, 0.8, PAL.cream, false);
        fillEllipse(c, 3.3, top + 9.4, 0.8, 0.8, PAL.cream, false);
        break;
      case 'cardigan':
        shadedFill(c, polyPath(c, [[-11, top], [-2, top], [-2, bot + 5], [-11, bot + 5]]), col, 2, { dx: -1.8, dy: -2 });
        shadedFill(c, polyPath(c, [[11, top], [2, top], [2, bot + 5], [11, bot + 5]]), col, 2, { dx: -1.8, dy: -2 });
        c.strokeStyle = dark; c.lineWidth = 0.6; c.globalAlpha = 0.7;
        for (i = top + 4; i < bot + 4; i += 3) { c.beginPath(); c.moveTo(-10, i); c.lineTo(-3, i); c.moveTo(3, i); c.lineTo(10, i); c.stroke(); }
        c.globalAlpha = 1;
        for (i = 0; i < 3; i++) { fillEllipse(c, -2.5, top + 5 + i * 5, 1.1, 1.1, PAL.cream, false); glint(c, -2.8, top + 4.7 + i * 5, 0.4, 0.3, 0.8); }
        break;
      case 'raincoat':
        shadedFill(c, polyPath(c, [[-10, top - 1], [10, top - 1], [14, bot + 9], [-14, bot + 9]]), col, 2, { drape: [bot - 6, bot + 9, 14] });
        c.save(); c.globalAlpha = 0.45; fillRound(c, -8, top + 2, 3, 14, 1.5, '#ffffff', false); c.restore();
        /* toggles on cord loops, patch pockets, a band of trim at the hem */
        for (i = 0; i < 3; i++) {
          c.strokeStyle = dark; c.lineWidth = 0.5;
          c.beginPath(); c.moveTo(-3.4, top + 5 + i * 6); c.lineTo(3.4, top + 5 + i * 6); c.stroke();
          celPart(c, rrPath(c, -1.9, top + 4 + i * 6, 3.8, 2, 1), tc, { rim: false, ink: 1.1, dx: -0.3, dy: -0.3 });
        }
        for (s = -1; s <= 1; s += 2) celPart(c, rrPath(c, s * 8 - 2.6, bot - 0.4, 5.2, 4.6, 1.2), shade(col, -8), { rim: false, ink: 1.2, dx: -0.4, dy: -0.4 });
        c.strokeStyle = tc; c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(-13.4, bot + 7); c.lineTo(13.4, bot + 7); c.stroke();
        break;
      case 'cape':
        celPart(c, ellPath(c, 0, top + 1, 2.6, 2.6), PAL.sun, { dx: -0.5, dy: -0.5, rim: false, ink: 1.4 });
        glint(c, -0.8, top + 0.2, 0.8, 0.6, 0.8);
        break;
      case 'puffer':
        shadedFill(c, rrPath(c, -12, top - 1, 24, (bot + 5) - (top - 1), 7), col);
        c.strokeStyle = dark; c.lineWidth = 0.8;
        for (i = top + 5; i < bot + 3; i += 6) {
          c.beginPath(); c.moveTo(-11, i); c.quadraticCurveTo(0, i + 2, 11, i); c.stroke();
        }
        c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 1.2;
        for (i = top + 2; i < bot + 1; i += 6) {
          c.beginPath(); c.moveTo(-9, i); c.quadraticCurveTo(-4, i + 1, -1, i + 1); c.stroke();
        }
        fillRound(c, -1.2, top, 2.4, (bot + 4) - top, 1.2, light, false);
        break;
      case 'blazer':
        shadedFill(c, polyPath(c, [[-11, top], [-2, top], [-2, bot + 4], [-11, bot + 4]]), col, 2, { dx: -1.8, dy: -2 });
        shadedFill(c, polyPath(c, [[11, top], [2, top], [2, bot + 4], [11, bot + 4]]), col, 2, { dx: -1.8, dy: -2 });
        fillPath(c, [[-10, top], [-2, top], [-2, top + 8]], dark);
        fillPath(c, [[10, top], [2, top], [2, top + 8]], dark);
        clasp(c, 3, top + 11, 2, 2);
        clasp(c, 3, top + 15, 2, 2);
        /* a pocket square and a crest */
        fillRound(c, -9, top + 9, 4, 1.3, 0.6, dark, false);
        celPart(c, polyPath(c, [[-8.6, top + 9.2], [-7.4, top + 7.2], [-6.6, top + 8.6], [-5.6, top + 7.4], [-5.4, top + 9.2]]), tc, { rim: false, ink: 1, dx: -0.2, dy: -0.2 });
        jewel(c, 6.6, top + 7, 1.5, tc, 'star');
        break;
      case 'bolero':
        /* a short shrug that stops above the waist, with scalloped edges */
        for (s = -1; s <= 1; s += 2) {
          shadedFill(c, polyPath(c, [[s * 4, top - 0.5], [s * 10.6, top - 0.5], [s * 10.4, top + 8], [s * 6, top + 9.5], [s * 4.5, top + 4]]), col, 2, { dx: -1.2, dy: -1.4 });
        }
        c.strokeStyle = light; c.lineWidth = 0.7;
        c.beginPath(); c.moveTo(-10.2, top + 8.2); c.lineTo(-6, top + 9.6); c.moveTo(10.2, top + 8.2); c.lineTo(6, top + 9.6); c.stroke();
        ribbonBow(c, 0, top + 1.5, 1.7, light, false);
        break;
      case 'vest':
        /* a knit vest: a V neck, a ribbed hem and a cable down each side */
        shadedFill(c, function () {
          c.beginPath();
          c.moveTo(-8.4, top); c.lineTo(-3.4, top); c.lineTo(0, top + 7); c.lineTo(3.4, top); c.lineTo(8.4, top);
          c.quadraticCurveTo(10, top + 6, 9.8, bot + 3); c.lineTo(-9.8, bot + 3);
          c.quadraticCurveTo(-10, top + 6, -8.4, top);
          c.closePath();
        }, col, 2, {});
        celPart(c, rrPath(c, -10, bot + 0.8, 20, 3, 1.2), dark, { rim: false, ink: 1.3 });
        c.strokeStyle = dark; c.lineWidth = 0.5; c.globalAlpha = 0.7;
        c.beginPath();
        for (i = -9; i <= 9; i += 1.6) { c.moveTo(i, bot + 1.2); c.lineTo(i, bot + 3.4); }
        for (s = -1; s <= 1; s += 2) {
          for (i = top + 7; i < bot; i += 2.4) { c.moveTo(s * 5.2, i); c.lineTo(s * 6.4, i + 1.2); c.lineTo(s * 5.2, i + 2.4); }
        }
        c.stroke();
        c.globalAlpha = 1;
        c.strokeStyle = PAL.cream; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(-3.4, top); c.lineTo(0, top + 7); c.lineTo(3.4, top); c.stroke();
        break;
      case 'varsity':
        shadedFill(c, polyPath(c, [[-10.6, top], [-2, top], [-2, bot + 4], [-10.6, bot + 4]]), col, 2, { dx: -1.8, dy: -2 });
        shadedFill(c, polyPath(c, [[10.6, top], [2, top], [2, bot + 4], [10.6, bot + 4]]), col, 2, { dx: -1.8, dy: -2 });
        celPart(c, rrPath(c, -10.8, bot + 1.6, 21.6, 2.8, 1.2), PAL.cream, { rim: false, ink: 1.3 });
        c.strokeStyle = col; c.lineWidth = 0.6;
        c.beginPath(); c.moveTo(-10.6, bot + 3); c.lineTo(10.6, bot + 3); c.stroke();
        c.strokeStyle = PAL.cream; c.lineWidth = 1.1;
        c.beginPath(); c.moveTo(-6, top - 0.3); c.quadraticCurveTo(-2.6, top + 1.2, -2, top + 6); c.moveTo(6, top - 0.3); c.quadraticCurveTo(2.6, top + 1.2, 2, top + 6); c.stroke();
        for (i = 0; i < 3; i++) fillEllipse(c, -2.6, top + 7 + i * 4, 0.8, 0.8, PAL.cream, false);
        c.fillStyle = PAL.sun; star(c, -6.6, top + 8.5, 2.3);
        c.strokeStyle = shade(PAL.sun, -35); c.lineWidth = 0.4; c.stroke();
        break;
    }
  }

  /* Sleeves follow the arm: a jointed tube round upper arm and forearm,
     a cuff at the wrist; a short or puffed one stops at the bicep. */
  function sleeveSpec(cust) {
    var j = cust.jacket, jc = cust.jacketColor;
    if (jacketHasSleeves(j)) {
      if (j === 'bolero') return { kind: 'puff', col: jc, pat: cust.jacketPattern };
      if (j === 'varsity') return { kind: 'long', col: PAL.cream, cuff: jc, g: 0.75 };
      if (j === 'windbreaker') return { kind: 'long', col: jc, cuff: trimOf(jc), g: 0.9, pat: cust.jacketPattern };
      if (j === 'fuzzy') return { kind: 'long', col: jc, cuff: trimOf(jc), g: 1.5, fuzz: true, pat: cust.jacketPattern };
      return { kind: 'long', col: jc, cuff: shade(jc, -22), g: j === 'puffer' ? 1.45 : j === 'denim' ? 0.6 : 0.75, pat: cust.jacketPattern };
    }
    if (cust.dress === 'kimono') return { kind: 'kimono', col: cust.dressColor, pat: cust.dressPattern };
    if (cust.dress === 'sweater') return { kind: 'long', col: cust.dressColor, cuff: shade(cust.dressColor, -20), g: 0.95, pat: cust.dressPattern };
    if (cust.dress === 'princess' || cust.dress === 'pinafore') return { kind: 'puff', col: cust.dress === 'princess' ? shade(cust.dressColor, 22) : PAL.cream };
    if (cust.dress === 'rainbow') return { kind: 'puff', col: cust.dressColor, pat: cust.dressPattern };
    return null;
  }
  function drawSleeveOnArm(c, cust, A) {
    var sp = sleeveSpec(cust);
    if (!sp) return;
    var col = A.near ? sp.col : shadowCached(sp.col, 8, false);
    var aa = limbAng(A.sx, A.sy, A.wx, A.wy), sp2;
    if (sp.kind === 'long') {
      var g = sp.g;
      sp2 = function () {
        limbPath(c, A.sx, A.sy, ARM.rSh + g + 0.2, A.ex, A.ey, ARM.rEl + g, A.wx, A.wy, ARM.rWr + g * 0.8, 0.25, 0.2);
      };
      celPart(c, sp2, col, { dx: -0.8, dy: -0.6 });
      printOn(c, sp2, sp.pat, sp.col, A.sx, A.sy, aa);
      if (!LOW) {
        /* a crease at the inside of the elbow */
        c.strokeStyle = shadowCached(sp.col, 30, false); c.lineWidth = 0.5; c.globalAlpha = 0.7;
        c.beginPath(); c.moveTo(A.ex + 0.4, A.ey - 1); c.quadraticCurveTo(A.ex + 1.4, A.ey, A.ex + 0.6, A.ey + 1.2); c.stroke();
        c.globalAlpha = 1;
      }
      /* cuff */
      var fa = Math.atan2(A.wy - A.ey, A.wx - A.ex);
      c.save();
      c.translate(lerp(A.ex, A.wx, 0.86), lerp(A.ey, A.wy, 0.86));
      c.rotate(fa - Math.PI / 2);
      var cw = ARM.rWr + g * 0.8 + 0.35;
      if (sp.fuzz) fluff(c, 0, 0, cw + 0.5, 1.7, A.near ? sp.cuff : shadowCached(sp.cuff, 8, false), 7, 1.2);
      else celPart(c, rrPath(c, -cw, -1, cw * 2, 2, 1), A.near ? sp.cuff : shadowCached(sp.cuff, 8, false), { rim: false, ink: 1.3, dx: -0.4, dy: -0.2 });
      c.restore();
    } else if (sp.kind === 'puff') {
      var m = [lerp(A.sx, A.ex, 0.35), lerp(A.sy, A.ey, 0.35)];
      var ua = Math.atan2(A.ey - A.sy, A.ex - A.sx);
      sp2 = function () { c.beginPath(); c.ellipse(m[0], m[1], 3.7, 3.1, ua, 0, TAU); };
      celPart(c, sp2, col, { dx: -0.8, dy: -0.9, rimS: 0.6 });
      printOn(c, sp2, sp.pat, sp.col, A.sx, A.sy, aa);
      if (!LOW) {
        c.strokeStyle = shadowCached(sp.col, 26, false); c.lineWidth = 0.45; c.globalAlpha = 0.7;
        c.beginPath();
        c.moveTo(m[0] - 1.6, m[1] - 2.2); c.quadraticCurveTo(m[0] - 0.6, m[1], m[0] - 1.4, m[1] + 2.2);
        c.moveTo(m[0] + 1, m[1] - 2.4); c.quadraticCurveTo(m[0] + 1.6, m[1], m[0] + 0.9, m[1] + 2.4);
        c.stroke();
        c.globalAlpha = 1;
      }
    } else if (sp.kind === 'kimono') {
      /* a wide furisode sleeve hanging from the upper arm */
      var ex = A.ex, ey = A.ey;
      sp2 = function () {
        c.beginPath();
        c.moveTo(A.sx - 2.2, A.sy - 0.6);
        c.lineTo(A.sx + 2.4, A.sy - 0.4);
        c.lineTo(ex + 2.8, ey + 0.4);
        c.quadraticCurveTo(ex + 3.2 - MOTION.skirt * 0.4, ey + 7.5, ex - 0.4 - MOTION.skirt, ey + 8.4);
        c.quadraticCurveTo(ex - 3.4, ey + 8, ex - 3, ey + 3);
        c.closePath();
      };
      celPart(c, sp2, col, { dx: -1, dy: -1 });
      printOn(c, sp2, sp.pat, sp.col, A.sx, A.sy, aa);
      c.strokeStyle = trimOf(sp.col); c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(ex - 2.8, ey + 6.6); c.quadraticCurveTo(ex - 0.6, ey + 7.6, ex + 2.8, ey + 6); c.stroke();
    }
  }

  /* a bow too small for ribbonBow's outlines: two wedges and a knot */
  function tinyBow(c, x, y, s, col) {
    c.beginPath();
    c.moveTo(x, y); c.lineTo(x - s * 1.5, y - s); c.lineTo(x - s * 1.5, y + s); c.closePath();
    c.moveTo(x, y); c.lineTo(x + s * 1.5, y - s); c.lineTo(x + s * 1.5, y + s); c.closePath();
    c.fillStyle = col; c.fill();
    c.strokeStyle = shadowCached(col, 40, false); c.lineWidth = 0.25; c.lineJoin = 'round'; c.stroke();
    fillEllipse(c, x, y, s * 0.45, s * 0.55, shadowCached(col, 18, false), false);
  }

  /* ---- Shoes ----
     Drawn in the foot's own frame: origin at the ankle, toe toward +x,
     the sole on y = LEG.ankle when the foot is flat. Boot shafts and
     socks run up the shin in ground space first. */
  function barefootPath(c) {
    c.beginPath();
    c.moveTo(-1.4, -0.9);
    c.quadraticCurveTo(-2.7, 0.1, -2.3, 1.3);
    c.quadraticCurveTo(-2.1, 2.0, -1, 2.0);
    c.lineTo(3.5, 2.0);
    c.quadraticCurveTo(5.1, 2.0, 4.9, 0.9);
    c.quadraticCurveTo(4.5, -0.2, 2.4, -0.4);
    c.quadraticCurveTo(1.6, -0.6, 1.3, -1.3);
    c.closePath();
  }
  function shoePath(c, heel, toe, topY, sole) {
    c.beginPath();
    c.moveTo(-1.6, topY);
    c.quadraticCurveTo(heel - 0.4, topY + 0.6, heel, 1.0);
    c.quadraticCurveTo(heel, sole, heel + 1.2, sole);
    c.lineTo(toe - 1.4, sole);
    c.quadraticCurveTo(toe + 0.4, sole, toe, 0.7);
    c.quadraticCurveTo(toe - 0.6, -0.5, 2.6, -0.7);
    c.quadraticCurveTo(1.7, -0.9, 1.5, topY);
    c.closePath();
  }
  function soleBand(c, pathFn, y0, col) {
    c.save();
    pathFn(); c.clip();
    c.fillStyle = col;
    c.fillRect(-6, y0, 14, 4);
    c.restore();
  }
  function drawShoe(c, cust, L) {
    var col = L.near ? cust.shoeColor : shadowCached(cust.shoeColor, 8, false);
    var skin = skinOf(cust);
    if (!L.near) skin = shadowCached(skin, 7, true);
    var s = cust.shoes, p;
    /* things that climb the shin, in ground space */
    if (s === 'boots') celPart(c, function () { legLowPath(c, L, 0.6, 0.55); }, col, { dx: -0.9, dy: -0.4 });
    else if (s === 'rainBoots') celPart(c, function () { legLowPath(c, L, 0.56, 0.95); }, col, { dx: -0.9, dy: -0.4 });
    else if (s === 'rollerSkates') celPart(c, function () { legLowPath(c, L, 0.78, 0.7); }, col, { dx: -0.8, dy: -0.4 });
    else if (s === 'highTops') celPart(c, function () { legLowPath(c, L, 0.82, 0.55); }, col, { dx: -0.8, dy: -0.4 });
    else if (s === 'starBoots') celPart(c, function () { legLowPath(c, L, 0.7, 0.6); }, col, { dx: -0.8, dy: -0.4 });
    else if (s === 'fluffyBoots') celPart(c, function () { legLowPath(c, L, 0.68, 1.1); }, col, { dx: -0.8, dy: -0.4 });
    else if (s === 'wingShoes') celPart(c, function () { legLowPath(c, L, 0.84, 0.6); }, col, { dx: -0.8, dy: -0.4 });
    else if (s === 'geta') {
      /* white split-toe socks */
      celPart(c, function () { legLowPath(c, L, 0.74, 0.25); }, L.near ? '#ffffff' : '#ece4ee', { dx: -0.8, dy: -0.4, s: 0.6 });
    } else if (s === 'loafers') {
      /* knee socks with a ribbed top */
      celPart(c, function () { legLowPath(c, L, 0.56, 0.22); }, L.near ? '#ffffff' : '#ece4ee', { dx: -0.8, dy: -0.4, s: 0.6 });
      legBand(c, L, 0.57, 1.5, 0.45, L.near ? trimOf(cust.shoeColor) : shadowCached(trimOf(cust.shoeColor), 8, false));
    } else if (s === 'ballet' && !LOW) {
      /* ribbons wound up the ankle */
      var r1 = alongLimb(L.hx, L.hy, L.kx, L.ky, L.ax, L.ay, 0.8);
      c.strokeStyle = col; c.lineWidth = 0.7; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(L.ax - 1.4, L.ay + 0.4); c.lineTo(r1[0] + 1.6, r1[1]);
      c.moveTo(L.ax + 1.4, L.ay + 0.2); c.lineTo(r1[0] - 1.6, r1[1] + 0.6);
      c.stroke();
    }
    c.save();
    c.translate(L.ax, L.ay);
    c.rotate(-L.ang);
    switch (s) {
      case 'none':
        p = function () { barefootPath(c); };
        celPart(c, p, skin, { warm: true, dx: -0.5, dy: -0.5, rimS: 0.5 });
        if (!LOW) {
          c.strokeStyle = shadowCached(skin, 30, true); c.lineWidth = 0.4; c.lineCap = 'round';
          c.beginPath(); c.moveTo(3.4, 1.9); c.lineTo(3.6, 0.9); c.moveTo(4.4, 1.8); c.lineTo(4.6, 1.0); c.stroke();
        }
        break;
      case 'maryJane':
        p = function () { shoePath(c, -2.6, 5.4, -0.6, 2.1); };
        celPart(c, p, col, { dx: -0.6, dy: -0.6, rimS: 0.5 });
        soleBand(c, p, 1.5, shade(cust.shoeColor, -35));
        c.strokeStyle = shade(cust.shoeColor, -35); c.lineWidth = 0.9; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-0.8, -0.6); c.quadraticCurveTo(0.8, -1.2, 2.6, -0.4); c.stroke();
        fillEllipse(c, 2.3, -0.5, 0.55, 0.55, PAL.gold, false);
        glint(c, 3.6, 0.1, 0.9, 0.35, 0.65);
        if (!LOW) {
          /* a stitched edge and a little bow on the toe */
          c.beginPath(); c.moveTo(-2, 0.9); c.quadraticCurveTo(1, 1.3, 4.8, 1.1);
          stitch(c, trimOf(cust.shoeColor), 0.3);
          tinyBow(c, 4, 0.3, 0.85, trimOf(cust.shoeColor));
        }
        break;
      case 'sneaker':
        p = function () { shoePath(c, -2.7, 5.6, -1.0, 2.2); };
        celPart(c, p, col, { dx: -0.6, dy: -0.6, rimS: 0.5 });
        soleBand(c, p, 1.0, PAL.cream);
        c.save(); p(); c.clip();
        c.fillStyle = PAL.cream; c.beginPath(); c.ellipse(5, 0.6, 1.6, 1.4, 0, 0, TAU); c.fill();
        c.fillStyle = 'rgba(160,140,170,0.5)'; c.fillRect(-6, 1.85, 14, 0.5);
        c.restore();
        p(); c.fillStyle = col; ink(c, 1.6);
        c.strokeStyle = PAL.cream; c.lineWidth = 0.55;
        c.beginPath(); c.moveTo(0.4, -0.9); c.lineTo(1.6, -0.2); c.moveTo(1.4, -1.0); c.lineTo(0.6, -0.1); c.moveTo(2.0, -0.6); c.lineTo(3.0, 0); c.stroke();
        if (!LOW) {
          /* a swoosh of trim down the side and a heel tab */
          c.strokeStyle = trimOf(cust.shoeColor); c.lineWidth = 0.7; c.lineCap = 'round';
          c.beginPath(); c.moveTo(-1.8, 0.7); c.quadraticCurveTo(0.2, 1.1, 1.6, 0.1); c.stroke();
          celPart(c, rrPath(c, -3, -1.5, 1.1, 1.5, 0.4), trimOf(cust.shoeColor), { rim: false, ink: 1, dx: -0.2, dy: -0.2 });
        }
        break;
      case 'highTops':
        p = function () { shoePath(c, -2.7, 5.6, -1.6, 2.2); };
        celPart(c, p, col, { dx: -0.6, dy: -0.6, rimS: 0.5 });
        soleBand(c, p, 1.0, PAL.cream);
        p(); c.fillStyle = col; ink(c, 1.6);
        c.fillStyle = PAL.sun; star(c, -0.4, 0.1, 1.1);
        c.strokeStyle = PAL.cream; c.lineWidth = 0.5;
        c.beginPath(); c.moveTo(1, -1.4); c.lineTo(2.2, -0.6); c.moveTo(2.0, -1.4); c.lineTo(1.2, -0.5); c.stroke();
        break;
      case 'boots':
      case 'starBoots':
        p = function () { shoePath(c, -2.7, 5.3, -1.6, 2.2); };
        celPart(c, p, col, { dx: -0.6, dy: -0.6, rimS: 0.5 });
        soleBand(c, p, 1.4, shade(cust.shoeColor, -38));
        p(); c.fillStyle = col; ink(c, 1.6);
        glint(c, 3.4, 0, 1, 0.35, 0.55);
        if (s === 'starBoots') jewel(c, 0.6, 0.2, 1.3, PAL.sun, 'star');
        else if (!LOW) {
          /* laces up the front */
          c.strokeStyle = trimOf(cust.shoeColor); c.lineWidth = 0.45; c.lineCap = 'round';
          c.beginPath(); c.moveTo(1.3, -1.5); c.lineTo(2.5, -0.7); c.moveTo(2.3, -1.5); c.lineTo(1.5, -0.6); c.moveTo(2.2, -0.5); c.lineTo(3.3, 0); c.stroke();
        }
        break;
      case 'rainBoots':
        p = function () { shoePath(c, -3, 5.6, -1.6, 2.2); };
        celPart(c, p, col, { dx: -0.6, dy: -0.6, rimS: 0.5 });
        soleBand(c, p, 1.3, shade(cust.shoeColor, -38));
        p(); c.fillStyle = col; ink(c, 1.6);
        glint(c, 3.6, -0.1, 1.2, 0.45, 0.7);
        /* a heart on the ankle */
        if (!LOW) heart(c, 0.1, 0, 1.15, trimOf(cust.shoeColor), false);
        break;
      case 'sandals':
        p = function () { barefootPath(c); };
        celPart(c, p, skin, { warm: true, dx: -0.5, dy: -0.5, rim: false });
        celPart(c, rrPath(c, -2.6, 1.7, 8, 1.1, 0.5), col, { rim: false, ink: 1.2 });
        c.strokeStyle = col; c.lineWidth = 0.8; c.lineCap = 'round';
        c.beginPath(); c.moveTo(1.5, 1.8); c.lineTo(3.6, -0.3); c.moveTo(-1.6, 1.6); c.lineTo(1.1, -1.0); c.stroke();
        flower(c, 1.2, -0.9, 1.25, trimOf(cust.shoeColor), PAL.sun);
        break;
      case 'ballet':
        p = function () { shoePath(c, -2.5, 5.2, -0.3, 2.0); };
        celPart(c, p, col, { dx: -0.5, dy: -0.5, rimS: 0.5 });
        c.save(); p(); c.clip();
        c.fillStyle = skin; c.beginPath(); c.ellipse(0.6, -1.2, 2.3, 1.2, 0, 0, TAU); c.fill();
        c.restore();
        if (LOW) fillEllipse(c, 2.6, -0.2, 0.7, 0.5, shade(cust.shoeColor, -25), false);
        else tinyBow(c, 2.9, -0.1, 0.9, trimOf(cust.shoeColor));
        glint(c, 4.2, 0.6, 0.7, 0.3, 0.6);
        break;
      case 'rollerSkates':
        p = function () { shoePath(c, -2.6, 5.3, -1.6, 2.0); };
        celPart(c, p, col, { dx: -0.6, dy: -0.6, rimS: 0.5 });
        celPart(c, rrPath(c, -3.2, 1.8, 9, 1.4, 0.6), PAL.cream, { rim: false, ink: 1.2 });
        for (var wh = 0; wh < 2; wh++) {
          var wx = wh ? 3.8 : -1.6;
          celPart(c, ellPath(c, wx, 4.1, 1.35, 1.35), PAL.sun, { rim: false, ink: 1.2, dx: -0.3, dy: -0.3 });
          glint(c, wx - 0.4, 3.7, 0.4, 0.35, 0.8);
        }
        if (!LOW) {
          /* laces and a rubber toe stop */
          c.strokeStyle = trimOf(cust.shoeColor); c.lineWidth = 0.45; c.lineCap = 'round';
          c.beginPath(); c.moveTo(1.2, -1.4); c.lineTo(2.4, -0.6); c.moveTo(2.2, -1.4); c.lineTo(1.4, -0.5); c.moveTo(2.2, -0.4); c.lineTo(3.3, 0.1); c.stroke();
          celPart(c, ellPath(c, 5.9, 2.5, 0.85, 0.85), PAL.pink, { rim: false, ink: 1, dx: -0.2, dy: -0.2 });
        }
        break;
      case 'slippers':
        p = function () { c.beginPath(); c.ellipse(1.5, 0.8, 4.2, 2.0, 0, 0, TAU); };
        celPart(c, p, col, { dx: -0.6, dy: -0.6, rimS: 0.5 });
        fillEllipse(c, 2.2, 0.2, 2.4, 1.1, shade(cust.shoeColor, 32), false);
        celPart(c, ellPath(c, 3.2, -1.8, 0.8, 1.9), col, { rim: false, ink: 1.1 });
        celPart(c, ellPath(c, 4.6, -1.5, 0.8, 1.9), col, { rim: false, ink: 1.1 });
        fillEllipse(c, 4.6, 0.3, 0.45, 0.45, PAL.ink, false);
        fillEllipse(c, 5.4, 0.9, 0.4, 0.3, PAL.pink, false);
        break;
      case 'fluffyBoots':
        p = function () { shoePath(c, -3.1, 5.8, -1.6, 2.2); };
        celPart(c, p, col, { dx: -0.6, dy: -0.6, rimS: 0.5 });
        soleBand(c, p, 1.5, shade(cust.shoeColor, -34));
        p(); c.fillStyle = col; ink(c, 1.6);
        if (!LOW) { c.beginPath(); c.moveTo(1.8, -0.4); c.quadraticCurveTo(4.4, -0.2, 5.4, 1); stitch(c, trimOf(cust.shoeColor), 0.3); }
        break;
      case 'geta':
        /* the sock foot, then a wooden sole on two teeth and a thong */
        p = function () { barefootPath(c); };
        celPart(c, p, L.near ? '#ffffff' : '#ece4ee', { dx: -0.5, dy: -0.5, rim: false, s: 0.6 });
        celPart(c, rrPath(c, -3, 1.8, 8.6, 1.3, 0.5), L.near ? '#d9a274' : '#c08a5e', { rim: false, ink: 1.2, dx: -0.4, dy: -0.2 });
        celPart(c, rrPath(c, -1.9, 3, 1.7, 1.5, 0.3), L.near ? '#c98a5e' : '#b07a50', { rim: false, ink: 1.1, dx: -0.3, dy: 0 });
        celPart(c, rrPath(c, 2.4, 3, 1.7, 1.5, 0.3), L.near ? '#c98a5e' : '#b07a50', { rim: false, ink: 1.1, dx: -0.3, dy: 0 });
        c.lineCap = 'round';
        c.beginPath(); c.moveTo(3.5, 1.7); c.quadraticCurveTo(2.4, -0.4, 0.2, -0.6); c.moveTo(3.5, 1.7); c.quadraticCurveTo(3, 0.2, 1.6, 1.5);
        c.strokeStyle = inkColor(cust.shoeColor); c.lineWidth = 1.3; c.stroke();
        c.strokeStyle = col; c.lineWidth = 0.75; c.stroke();
        break;
      case 'sparkleHeels':
        /* glassy court shoes on a little heel, a jewel on the toe */
        celPart(c, polyPath(c, [[-2.5, 1], [-1, 1], [-1.4, 3.6], [-2.5, 3.6]]), shade(cust.shoeColor, -14), { rim: false, ink: 1.1, dx: -0.2, dy: 0 });
        p = function () { c.beginPath(); c.moveTo(-1.6, -0.4); c.quadraticCurveTo(-3, 0.2, -2.6, 1.6); c.quadraticCurveTo(-1, 2.4, 1.4, 3.4); c.lineTo(4.6, 3.6); c.quadraticCurveTo(6.4, 3.4, 5.6, 1.9); c.quadraticCurveTo(4.6, 0.6, 2.6, 0.9); c.quadraticCurveTo(1, 1, 0.9, -0.3); c.closePath(); };
        c.save(); c.globalAlpha = 0.92;
        celPart(c, p, mix(col, '#ffffff', 0.25), { dx: -0.6, dy: -0.6, rimS: 0.5, ink: 1.5 });
        c.restore();
        sheen(c, 2.4, 1.6, 4.6, 2, 0.5, 0.85);
        jewel(c, 3.6, 1.5, 0.9, PAL.sun, 'round');
        if (L.near) { sparkle(c, 5.6, -0.4, 1.6, 1); sparkle(c, -2.6, 0.4, 1.1, 4); }
        break;
      case 'wingShoes':
        p = function () { shoePath(c, -2.7, 5.6, -1.6, 2.2); };
        celPart(c, p, col, { dx: -0.6, dy: -0.6, rimS: 0.5 });
        soleBand(c, p, 1.1, PAL.cream);
        p(); c.fillStyle = col; ink(c, 1.6);
        c.strokeStyle = PAL.cream; c.lineWidth = 0.5;
        c.beginPath(); c.moveTo(1, -1.4); c.lineTo(2.2, -0.6); c.moveTo(2.0, -1.4); c.lineTo(1.2, -0.5); c.stroke();
        /* a little wing at the heel, fluttering */
        c.save();
        c.translate(-1.6, -1.2); c.rotate(-0.25 + Math.sin(MOTION.t * 9 + (L.near ? 0 : 1.4)) * 0.22); c.scale(0.62, 0.62);
        celPart(c, function () {
          c.beginPath();
          c.moveTo(0, 0.6);
          c.bezierCurveTo(-1.6, -3.6, -5.4, -4.6, -7, -3.4);
          c.quadraticCurveTo(-5.6, -2.6, -5.8, -1.6);
          c.quadraticCurveTo(-4.4, -1.4, -4.4, -0.4);
          c.quadraticCurveTo(-3, -0.2, -2.6, 0.8);
          c.quadraticCurveTo(-1.2, 1.2, 0, 0.6);
          c.closePath();
        }, L.near ? '#ffffff' : '#ece4ee', { rim: false, ink: 1.2, dx: -0.4, dy: -0.5, s: 0.7 });
        c.restore();
        break;
      case 'loafers':
        p = function () { shoePath(c, -2.6, 5.3, -0.4, 2.1); };
        celPart(c, p, col, { dx: -0.6, dy: -0.6, rimS: 0.5 });
        soleBand(c, p, 1.5, shade(cust.shoeColor, -38));
        p(); c.fillStyle = col; ink(c, 1.6);
        c.strokeStyle = shade(cust.shoeColor, -30); c.lineWidth = 0.6;
        c.beginPath(); c.moveTo(1.4, -0.5); c.quadraticCurveTo(2.6, 0.2, 3.8, -0.1); c.stroke();
        glint(c, 4, 0.2, 0.9, 0.35, 0.6);
        if (!LOW) clasp(c, 2.6, -0.1, 1.3, 0.8);
        break;
    }
    c.restore();
    /* boot tops */
    if (s === 'boots') legBand(c, L, 0.6, 1.6, 0.85, shade(cust.shoeColor, -28));
    if (s === 'starBoots') legBand(c, L, 0.7, 2.0, 1.1, PAL.cream);
    if (s === 'rainBoots') legBand(c, L, 0.56, 1.4, 1.15, shade(cust.shoeColor, 18));
    if (s === 'wingShoes') legBand(c, L, 0.84, 1.4, 0.9, PAL.cream);
    if (s === 'fluffyBoots') {
      /* a fleece cuff and a pompom on a cord */
      var fb = alongLimb(L.hx, L.hy, L.kx, L.ky, L.ax, L.ay, 0.68);
      var fc = L.near ? trimOf(cust.shoeColor) : shadowCached(trimOf(cust.shoeColor), 8, false);
      fluff(c, fb[0], fb[1], 4.3, 1.9, fc, 9, 1.3);
      if (L.near) fluff(c, fb[0] - 3.4 - MOTION.skirt * 0.3, fb[1] + 3.2, 1.3, 1.3, fc, 6, 1);
    }
  }

  /* ---- Materials ----
     What turns a filled shape into a thing made of something: metal
     takes a hard streak of light, a gem is cut into facets, fluff has a
     broken edge, and cloth carries a trim colour and a row of stitches. */
  function lum(hex) {
    var n = parseInt(hex.slice(1), 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }
  /* The colour that reads as trim against col: cream on anything with
     body to it, a dusky tone of itself on the palest cloth. */
  var TRIM_CACHE = {};
  function trimOf(col) {
    if (typeof col !== 'string' || col.charAt(0) !== '#') return PAL.cream;
    return TRIM_CACHE[col] || (TRIM_CACHE[col] = lum(col) > 0.86 ? mix(shade(col, -40), '#b8508a', 0.38) : mix(col, '#fff8ee', 0.88));
  }
  /* a hard streak of light along a polished surface */
  function sheen(c, x0, y0, x1, y1, w, a) {
    if (LOW) return;
    c.save();
    c.globalAlpha = a === undefined ? 0.7 : a;
    c.strokeStyle = '#ffffff'; c.lineWidth = w || 0.6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    c.restore();
  }
  /* a four-point glitter that breathes with time */
  function sparkle(c, x, y, r, seed) {
    if (LOW) return;
    var k = 0.55 + 0.45 * Math.sin(MOTION.t * 3.1 + (seed || 0) * 1.7);
    r *= 0.6 + 0.4 * k;
    c.save();
    c.globalAlpha = 0.5 + 0.5 * k;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(x, y - r); c.quadraticCurveTo(x + r * 0.16, y - r * 0.16, x + r, y);
    c.quadraticCurveTo(x + r * 0.16, y + r * 0.16, x, y + r);
    c.quadraticCurveTo(x - r * 0.16, y + r * 0.16, x - r, y);
    c.quadraticCurveTo(x - r * 0.16, y - r * 0.16, x, y - r);
    c.fill();
    c.restore();
  }
  /* a row of running stitches along the current path */
  function stitch(c, col, w) {
    c.strokeStyle = col; c.lineWidth = w || 0.4; c.lineCap = 'butt';
    c.setLineDash([0.9, 0.7]);
    c.stroke();
    c.setLineDash([]);
    c.lineCap = 'round';
  }
  /* A cut stone: kind 'round' | 'drop' | 'diamond' | 'heart' | 'star'.
     The light facet sits upper left, the dark one lower right, with a
     pale table between them and a hot spot. */
  function jewelPath(c, x, y, r, kind) {
    var k, a;
    if (kind === 'heart') { heartPath(c, x, y, r * 1.1); return; }
    c.beginPath();
    if (kind === 'drop') {
      c.moveTo(x, y - r * 1.55);
      c.quadraticCurveTo(x + r * 1.2, y - r * 0.05, x + r * 0.82, y + r * 0.6);
      c.quadraticCurveTo(x, y + r * 1.4, x - r * 0.82, y + r * 0.6);
      c.quadraticCurveTo(x - r * 1.2, y - r * 0.05, x, y - r * 1.55);
    } else if (kind === 'diamond') {
      c.moveTo(x, y - r * 1.25); c.lineTo(x + r, y); c.lineTo(x, y + r * 1.25); c.lineTo(x - r, y);
    } else if (kind === 'star') {
      for (k = 0; k < 10; k++) { a = (Math.PI / 5) * k - Math.PI / 2; c.lineTo(x + Math.cos(a) * r * (k % 2 ? 0.5 : 1.15), y + Math.sin(a) * r * (k % 2 ? 0.5 : 1.15)); }
    } else {
      for (k = 0; k < 8; k++) { a = k * TAU / 8 + Math.PI / 8; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    }
    c.closePath();
  }
  function jewel(c, x, y, r, col, kind) {
    jewelPath(c, x, y, r, kind);
    c.fillStyle = col;
    c.fill();
    if (!LOW) {
      c.save();
      jewelPath(c, x, y, r, kind);
      c.clip();
      c.fillStyle = shade(col, -30);
      c.beginPath(); c.moveTo(x + r * 0.1, y + r * 0.1); c.lineTo(x + r * 2, y - r * 0.9); c.lineTo(x + r * 2, y + r * 2); c.lineTo(x - r * 0.7, y + r * 2); c.closePath(); c.fill();
      c.fillStyle = mix(col, '#ffffff', 0.5);
      c.beginPath(); c.moveTo(x - r * 0.1, y - r * 0.1); c.lineTo(x - r * 2, y + r * 0.7); c.lineTo(x - r * 2, y - r * 2); c.lineTo(x + r * 0.9, y - r * 2); c.closePath(); c.fill();
      c.fillStyle = mix(col, '#ffffff', 0.22);
      c.beginPath(); c.ellipse(x, y, r * 0.5, r * 0.5, 0, 0, TAU); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.36, r * 0.24, r * 0.17, -0.6, 0, TAU); c.fill();
      c.restore();
    }
    jewelPath(c, x, y, r, kind);
    c.strokeStyle = shade(col, -55); c.lineWidth = 0.4 * inkMul / 0.36; c.lineJoin = 'round'; c.stroke();
  }
  /* a pearl: a pale bead, a pink shadow under it and a point of light */
  function pearl(c, x, y, r, col) {
    c.beginPath(); c.arc(x, y, r, 0, TAU);
    c.fillStyle = col || '#fff3ee';
    c.fill();
    c.strokeStyle = 'rgba(120,70,100,0.6)'; c.lineWidth = 0.3; c.stroke();
    if (LOW) return;
    c.beginPath(); c.arc(x, y, r, 0.1, Math.PI * 0.75);
    c.strokeStyle = 'rgba(201,138,176,0.7)'; c.lineWidth = r * 0.34; c.stroke();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(x - r * 0.3, y - r * 0.34, r * 0.3, 0, TAU); c.fill();
  }
  /* a fluffy edge: a ring of soft bumps round an ellipse */
  function fluffPath(c, cx, cy, rx, ry, n, ph) {
    c.beginPath();
    for (var k = 0; k <= n; k++) {
      var a0 = (k - 0.5) / n * TAU + (ph || 0), a1 = k / n * TAU + (ph || 0);
      var ex = cx + Math.cos(a1) * rx * 0.93, ey = cy + Math.sin(a1) * ry * 0.93;
      if (k === 0) c.moveTo(ex, ey);
      else c.quadraticCurveTo(cx + Math.cos(a0) * rx * 1.2, cy + Math.sin(a0) * ry * 1.2, ex, ey);
    }
    c.closePath();
  }
  function fluff(c, cx, cy, rx, ry, col, n, inkW) {
    var p = function () { fluffPath(c, cx, cy, rx, ry, n || 9, 0.3); };
    celPart(c, p, col, { dx: -rx * 0.22, dy: -ry * 0.24, ink: inkW || 1.5, rimS: 0.6 });
    if (LOW) return;
    c.strokeStyle = shadowCached(col, 22, false); c.lineWidth = 0.4; c.lineCap = 'round'; c.globalAlpha = 0.7;
    c.beginPath();
    c.arc(cx + rx * 0.25, cy + ry * 0.2, rx * 0.36, 0.2, 1.7);
    c.moveTo(cx - rx * 0.1, cy - ry * 0.2); c.arc(cx - rx * 0.4, cy - ry * 0.1, rx * 0.3, 0, 1.4);
    c.stroke();
    c.globalAlpha = 1;
    glint(c, cx - rx * 0.36, cy - ry * 0.42, rx * 0.26, ry * 0.16, 0.6);
  }
  /* A small layered blossom: five petals with a lighter heart to each,
     a domed centre and its glint. */
  function flower(c, x, y, r, col, centre) {
    var p, a;
    c.beginPath();
    for (p = 0; p < 5; p++) {
      a = p * TAU / 5 - Math.PI / 2;
      c.moveTo(x + Math.cos(a) * r * 0.62 + r * 0.52, y + Math.sin(a) * r * 0.62);
      c.arc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.52, 0, TAU);
    }
    c.fillStyle = col;
    c.fill();
    ink(c, 1.1);
    c.fill();
    if (!LOW) {
      c.fillStyle = mix(col, '#ffffff', 0.45);
      c.beginPath();
      for (p = 0; p < 5; p++) {
        a = p * TAU / 5 - Math.PI / 2;
        c.moveTo(x + Math.cos(a) * r * 0.7 + r * 0.24, y + Math.sin(a) * r * 0.7);
        c.arc(x + Math.cos(a) * r * 0.7 - r * 0.08, y + Math.sin(a) * r * 0.7 - r * 0.1, r * 0.24, 0, TAU);
      }
      c.fill();
    }
    fillEllipse(c, x, y, r * 0.38, r * 0.38, centre || PAL.sun, false);
    c.strokeStyle = shade(centre || PAL.sun, -38); c.lineWidth = 0.3; c.beginPath(); c.arc(x, y, r * 0.38, 0, TAU); c.stroke();
    glint(c, x - r * 0.12, y - r * 0.14, r * 0.14, r * 0.1, 0.85);
  }
  function leaf(c, x, y, len, ang, col) {
    c.save();
    c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0); c.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0); c.closePath();
    c.fillStyle = col || '#6cc07a'; c.fill(); ink(c, 1);
    if (!LOW) { c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 0.3; c.beginPath(); c.moveTo(len * 0.12, 0); c.lineTo(len * 0.86, 0); c.stroke(); }
    c.restore();
  }

  /* ---- Fabric patterns ----
     A print laid over a garment's body, inside its outline and under its
     light. The motif takes the garment's trim colour. Callers clip
     first; the print tiles the figure's own space so it holds still on
     the cloth while she moves. */
  var PAT = null, PATCOL = null;
  function drawPattern(c, kind, col, x0, y0, x1, y1) {
    var x, y, n = 0;
    var tc = trimOf(col);
    c.save();
    if (kind === 'dots') {
      c.fillStyle = tc; c.globalAlpha = 0.92;
      c.beginPath();
      for (y = y0; y < y1; y += 4.2, n++) for (x = x0 + (n % 2) * 2.4; x < x1; x += 4.8) { c.moveTo(x + 1.05, y); c.arc(x, y, 1.05, 0, TAU); }
      c.fill();
    } else if (kind === 'stripes') {
      c.fillStyle = tc; c.globalAlpha = 0.85;
      for (y = Math.floor(y0 / 4.6) * 4.6; y < y1; y += 4.6) c.fillRect(x0, y, x1 - x0, 1.9);
    } else if (kind === 'check') {
      c.fillStyle = tc; c.globalAlpha = 0.42;
      for (y = Math.floor(y0 / 5.2) * 5.2; y < y1; y += 5.2) c.fillRect(x0, y, x1 - x0, 2.4);
      for (x = Math.floor(x0 / 5.2) * 5.2; x < x1; x += 5.2) c.fillRect(x, y0, 2.4, y1 - y0);
      c.globalAlpha = 0.5; c.fillStyle = shadowCached(col, 26, false);
      for (y = Math.floor(y0 / 5.2) * 5.2 + 2.4; y < y1; y += 5.2) c.fillRect(x0, y - 0.2, x1 - x0, 0.4);
    } else if (kind === 'hearts') {
      /* every motif goes into one path, filled once */
      c.fillStyle = tc; c.globalAlpha = 0.95;
      c.beginPath();
      for (y = y0; y < y1; y += 5.4, n++) {
        for (x = x0 + (n % 2) * 3.1; x < x1; x += 6.2) {
          c.moveTo(x, y + 1.3);
          c.bezierCurveTo(x - 2.03, y - 0.15, x - 1.02, y - 1.6, x, y - 0.5);
          c.bezierCurveTo(x + 1.02, y - 1.6, x + 2.03, y - 0.15, x, y + 1.3);
        }
      }
      c.fill();
    } else if (kind === 'stars') {
      c.fillStyle = lum(col) > 0.6 ? tc : '#ffe27a'; c.globalAlpha = 0.95;
      c.beginPath();
      for (y = y0; y < y1; y += 5.8, n++) {
        for (x = x0 + (n % 2) * 3.3; x < x1; x += 6.6) {
          var sr = n % 2 ? 1.35 : 1.75;
          for (var k = 0; k < 10; k++) {
            var sa = (Math.PI / 5) * k - Math.PI / 2, sq = k % 2 ? sr * 0.45 : sr;
            if (k) c.lineTo(x + Math.cos(sa) * sq, y + Math.sin(sa) * sq); else c.moveTo(x + Math.cos(sa) * sq, y + Math.sin(sa) * sq);
          }
          c.closePath();
        }
      }
      c.fill();
    }
    c.restore();
  }
  /* Print a pattern inside a shape that is not a shadedFill body:
     sleeves and trouser legs. (ox, oy, ang) pins the print to the limb's
     root so it turns with the limb instead of sliding through it. */
  function printOn(c, pathFn, pat, col, ox, oy, ang) {
    if (!pat || pat === 'plain' || LOW) return;
    c.save();
    pathFn();
    c.clip();
    if (ox !== undefined) { c.translate(ox, oy); c.rotate(ang); drawPattern(c, pat, col, -14, -6, 14, 26); }
    else drawPattern(c, pat, col, -40, -64, 40, 16);
    c.restore();
  }
  function limbAng(x0, y0, x1, y1) { return Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2; }

  /* ---- Hats ---- */
  /* the shade a brim throws on the fringe under it */
  function brimShade(c, y, rx) {
    if (LOW) return;
    c.save();
    c.globalAlpha = 0.22;
    fillEllipse(c, 0.8, y, rx, 3, '#3c1446', false);
    c.restore();
  }
  /* a band round a crown: straight sides, sagging with the head's curve */
  function bandPath(c, hw, y0, y1, sag) {
    return function () {
      c.beginPath();
      c.moveTo(-hw, y0); c.quadraticCurveTo(0, y0 + sag, hw, y0);
      c.lineTo(hw + 0.15, y1); c.quadraticCurveTo(0, y1 + sag, -hw - 0.15, y1);
      c.closePath();
    };
  }
  /* A satin bow with fold shadows and a trim line: bigger and fuller
     than ribbonBow, for bows that are the whole accessory. */
  function bigBowAt(c, x, y, s, col, tails) {
    var tc = trimOf(col), d;
    var sw = MOTION.hairA * 7 + Math.sin(MOTION.t * 2.6 + x) * 0.3;
    if (tails) {
      for (d = -1; d <= 1; d += 2) {
        (function (d) {
          var tp = function () {
            c.beginPath();
            c.moveTo(x + d * s * 0.15, y + s * 0.2);
            c.quadraticCurveTo(x + d * s * 0.95 + sw * 0.4, y + s * 1.5, x + d * s * 0.9 + sw, y + s * 2.5);
            c.lineTo(x + d * s * 0.5 + sw, y + s * 2.15);
            c.lineTo(x + d * s * 0.2 + sw * 0.9, y + s * 2.65);
            c.quadraticCurveTo(x + d * s * 0.2 + sw * 0.3, y + s * 1.3, x - d * s * 0.15, y + s * 0.3);
            c.closePath();
          };
          celPart(c, tp, shade(col, -8), { dx: -0.5, dy: -0.5, rim: false, ink: 1.4 });
        })(d);
      }
    }
    for (d = -1; d <= 1; d += 2) {
      (function (d) {
        var lp = function () {
          c.beginPath();
          c.moveTo(x, y - s * 0.12);
          c.bezierCurveTo(x + d * s * 0.5, y - s * 1.15, x + d * s * 1.75, y - s * 1.05, x + d * s * 1.6, y);
          c.bezierCurveTo(x + d * s * 1.75, y + s * 0.95, x + d * s * 0.5, y + s * 1.0, x, y + s * 0.12);
          c.closePath();
        };
        celPart(c, lp, col, { dx: -0.7, dy: -0.8, rimS: 0.6, ink: 1.6 });
        if (LOW) return;
        c.save(); lp(); c.clip();
        /* the pinch folds fanning out of the knot, and a trim line */
        c.strokeStyle = shadowCached(col, 30, false); c.lineWidth = 0.45; c.lineCap = 'round'; c.globalAlpha = 0.8;
        c.beginPath();
        c.moveTo(x + d * s * 0.3, y - s * 0.12); c.quadraticCurveTo(x + d * s * 0.8, y - s * 0.35, x + d * s * 1.15, y - s * 0.6);
        c.moveTo(x + d * s * 0.3, y + s * 0.1); c.quadraticCurveTo(x + d * s * 0.8, y + s * 0.3, x + d * s * 1.1, y + s * 0.55);
        c.stroke();
        c.globalAlpha = 0.9; c.strokeStyle = tc; c.lineWidth = 0.4;
        c.beginPath();
        c.moveTo(x + d * s * 0.25, y - s * 0.62);
        c.bezierCurveTo(x + d * s * 0.7, y - s * 0.95, x + d * s * 1.5, y - s * 0.85, x + d * s * 1.42, y);
        c.bezierCurveTo(x + d * s * 1.5, y + s * 0.78, x + d * s * 0.7, y + s * 0.82, x + d * s * 0.25, y + s * 0.55);
        c.stroke();
        c.restore();
      })(d);
    }
    celPart(c, rrPath(c, x - s * 0.36, y - s * 0.46, s * 0.72, s * 0.92, s * 0.3), shade(col, -8), { dx: -0.3, dy: -0.3, rim: false, ink: 1.4 });
    glint(c, x - s * 1.0, y - s * 0.42, s * 0.34, s * 0.16, 0.7);
    glint(c, x + s * 0.72, y - s * 0.5, s * 0.26, s * 0.13, 0.5);
  }

  var HATS = {
    strawHat: function (c, k) {
      var hy = k.hy, r = k.r, i;
      var straw = '#ecc96e', strawD = '#b98a30';
      brimShade(c, hy - 3.4, 12.5);
      var brim = ellPath(c, 0, hy - 6.4, r + 11.5, 5.1);
      celPart(c, brim, straw, { dx: -1.6, dy: -1.3 });
      if (!LOW) {
        c.save(); brim(); c.clip();
        c.strokeStyle = strawD; c.lineWidth = 0.35; c.globalAlpha = 0.5;
        for (i = 0; i < 4; i++) { c.beginPath(); c.ellipse(0, hy - 6.4, (r + 11.5) * (0.6 + i * 0.11), 5.1 * (0.6 + i * 0.11), 0, 0, TAU); c.stroke(); }
        c.beginPath();
        for (i = 0; i < 26; i++) { var a = i * TAU / 26; c.moveTo(Math.cos(a) * (r + 2), hy - 6.4 + Math.sin(a) * 2.6); c.lineTo(Math.cos(a) * (r + 12), hy - 6.4 + Math.sin(a) * 5.2); }
        c.globalAlpha = 0.22; c.stroke();
        /* the crown's shadow lying across the brim */
        c.globalAlpha = 0.3; fillEllipse(c, 3, hy - 5.6, r + 1.5, 3.6, '#6a3c10', false);
        c.restore();
        c.save(); c.globalAlpha = 0.65; c.strokeStyle = '#fff6cf'; c.lineWidth = 0.7; c.lineCap = 'round';
        c.beginPath(); c.ellipse(0, hy - 6.4, r + 10.4, 4.2, 0, Math.PI * 1.04, Math.PI * 1.46); c.stroke();
        c.restore();
      }
      var crown = function () {
        c.beginPath();
        c.moveTo(-r + 2.2, hy - 7.2);
        c.bezierCurveTo(-r + 1.6, hy - 15, -r + 4.5, hy - 19.8, 0, hy - 19.8);
        c.bezierCurveTo(r - 4.5, hy - 19.8, r - 1.6, hy - 15, r - 2.2, hy - 7.2);
        c.quadraticCurveTo(0, hy - 4.6, -r + 2.2, hy - 7.2);
        c.closePath();
      };
      celPart(c, crown, '#f4da8c', { dx: -1.8, dy: -1.6 });
      if (!LOW) {
        c.save(); crown(); c.clip();
        c.strokeStyle = strawD; c.lineWidth = 0.32; c.globalAlpha = 0.55;
        c.beginPath();
        for (i = 0; i < 5; i++) { c.moveTo(-r, hy - 18.4 + i * 2.2); c.quadraticCurveTo(0, hy - 16.8 + i * 2.2, r, hy - 18.4 + i * 2.2); }
        for (i = -5; i <= 5; i++) { c.moveTo(i * 2.0, hy - 19.8); c.quadraticCurveTo(i * 2.5, hy - 14, i * 2.5, hy - 6); }
        c.stroke();
        c.restore();
      }
      celPart(c, bandPath(c, r - 2.2, hy - 10.8, hy - 7.3, 2.3), k.col, { rim: false, ink: 1.3, dx: -1.2, dy: -0.7 });
      if (!LOW) { c.strokeStyle = k.trim; c.lineWidth = 0.4; c.globalAlpha = 0.9; c.beginPath(); c.moveTo(-r + 2.4, hy - 9.9); c.quadraticCurveTo(0, hy - 7.7, r - 2.4, hy - 9.9); c.stroke(); c.globalAlpha = 1; }
      bigBowAt(c, r - 4.8, hy - 8.4, 2.3, k.col, true);
      flower(c, -r + 5.6, hy - 8.3, 1.9, PAL.cream, PAL.pink);
    },
    beret: function (c, k) {
      var hy = k.hy, r = k.r, col = k.col;
      var body = function () {
        c.beginPath();
        c.moveTo(-r + 0.4, hy - 7.6);
        c.bezierCurveTo(-r - 7, hy - 9, -r - 5.5, hy - 19, -3, hy - 19.6);
        c.bezierCurveTo(7, hy - 20.4, r + 5.5, hy - 16.4, r + 2.8, hy - 9.8);
        c.quadraticCurveTo(r + 1.2, hy - 7.2, r - 1.4, hy - 7.8);
        c.quadraticCurveTo(0, hy - 5.4, -r + 0.4, hy - 7.6);
        c.closePath();
      };
      celPart(c, body, col, { dx: -2, dy: -1.8 });
      if (!LOW) {
        c.save(); body(); c.clip();
        /* the felt slumps in soft folds from the stalk */
        c.strokeStyle = shadowCached(col, 26, false); c.lineWidth = 0.5; c.lineCap = 'round'; c.globalAlpha = 0.7;
        c.beginPath();
        c.moveTo(3, hy - 19); c.quadraticCurveTo(8, hy - 15, r + 1, hy - 11);
        c.moveTo(1.5, hy - 19); c.quadraticCurveTo(2, hy - 14, 5, hy - 9);
        c.moveTo(0, hy - 19.2); c.quadraticCurveTo(-6, hy - 16, -r - 1, hy - 12);
        c.stroke();
        c.globalAlpha = 0.34; fillEllipse(c, -6.5, hy - 15.4, 5.4, 2.3, '#ffffff', false);
        c.restore();
      }
      celPart(c, bandPath(c, r - 0.6, hy - 9.2, hy - 7.2, 2.3), k.dark, { rim: false, ink: 1.3, dx: -1, dy: -0.4 });
      celPart(c, function () { c.beginPath(); c.moveTo(1.2, hy - 19.4); c.quadraticCurveTo(1.6 + k.A * 5, hy - 22.6, 3.4 + k.A * 6, hy - 22.4); c.quadraticCurveTo(3.4 + k.A * 4, hy - 20.4, 3, hy - 19.4); c.closePath(); }, k.dark, { rim: false, ink: 1.2 });
      /* an enamel pin */
      jewel(c, -8.2, hy - 11.2, 1.5, k.trim, 'star');
    },
    flowerCrown: function (c, k) {
      var hy = k.hy, r = k.r, i;
      c.lineCap = 'round';
      c.strokeStyle = '#3f8a52'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(0, hy + 2.2, r + 0.9, Math.PI * 1.06, Math.PI * 1.94); c.stroke();
      c.strokeStyle = '#7ad08a'; c.lineWidth = 0.6;
      c.beginPath(); c.arc(0, hy + 2, r + 1, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
      for (i = -4; i <= 4; i++) {
        var a = Math.PI * 1.5 + i * 0.2;
        leaf(c, Math.cos(a) * (r + 0.9), hy + 2.2 + Math.sin(a) * (r + 0.9), 3.2, a + (i % 2 ? 0.9 : -0.9) - Math.PI / 2, i % 2 ? '#6cc07a' : '#58ad6c');
      }
      var cols = [PAL.cream, k.col, PAL.pink, k.col, PAL.cream];
      for (i = -2; i <= 2; i++) {
        var b = Math.PI * 1.5 + i * 0.4;
        var fx = Math.cos(b) * (r + 1.4), fy = hy + 2 + Math.sin(b) * (r + 1.4);
        flower(c, fx, fy, i === 0 ? 3.5 : 2.9, cols[i + 2], i % 2 ? PAL.cream : PAL.sun);
      }
      /* buds tucked between the blooms */
      for (i = -2; i < 2; i++) {
        var d = Math.PI * 1.5 + (i + 0.5) * 0.4;
        pearl(c, Math.cos(d) * (r + 3), hy + 2 + Math.sin(d) * (r + 3), 0.9, i % 2 ? '#ffd0e2' : '#fff2b0');
      }
    },
    tiara: function (c, k) {
      var hy = k.hy, i, sd;
      var gold = '#f6c343';
      /* scrolls rising to a centre peak, on a slim base band */
      var body = function () {
        c.beginPath();
        c.moveTo(-10.4, hy - 8.2);
        c.quadraticCurveTo(-10.6, hy - 12, -8.6, hy - 13.6);
        c.quadraticCurveTo(-7.4, hy - 11, -6.2, hy - 12.4);
        c.quadraticCurveTo(-5.8, hy - 16, -4, hy - 17.4);
        c.quadraticCurveTo(-3.2, hy - 13.4, -2.2, hy - 14.6);
        c.quadraticCurveTo(-1.6, hy - 19.6, 0, hy - 22);
        c.quadraticCurveTo(1.6, hy - 19.6, 2.2, hy - 14.6);
        c.quadraticCurveTo(3.2, hy - 13.4, 4, hy - 17.4);
        c.quadraticCurveTo(5.8, hy - 16, 6.2, hy - 12.4);
        c.quadraticCurveTo(7.4, hy - 11, 8.6, hy - 13.6);
        c.quadraticCurveTo(10.6, hy - 12, 10.4, hy - 8.2);
        c.quadraticCurveTo(0, hy - 10.4, -10.4, hy - 8.2);
        c.closePath();
      };
      celPart(c, body, gold, { dx: -1, dy: -0.9, ink: 1.4, s: 1.3 });
      if (!LOW) {
        /* pierced work: the hair shows through little windows */
        c.fillStyle = shadowCached(gold, 44, true);
        for (sd = -1; sd <= 1; sd += 2) {
          c.beginPath(); c.ellipse(sd * 4.1, hy - 13.2, 0.75, 1.3, sd * 0.2, 0, TAU); c.fill();
          c.beginPath(); c.ellipse(sd * 8, hy - 10.9, 0.6, 0.9, sd * 0.3, 0, TAU); c.fill();
        }
        sheen(c, -9.6, hy - 9.4, -3.6, hy - 10.5, 0.5, 0.85);
        sheen(c, -1.3, hy - 17.4, -0.5, hy - 20.3, 0.45, 0.8);
      }
      celPart(c, bandPath(c, 10.6, hy - 9.6, hy - 8.0, -2.2), shade(gold, -10), { rim: false, ink: 1.2, dx: -0.8, dy: -0.4 });
      jewel(c, 0, hy - 15.4, 2.1, k.col, 'drop');
      jewel(c, -6.3, hy - 10.6, 1.05, PAL.sky, 'round');
      jewel(c, 6.3, hy - 10.6, 1.05, PAL.sky, 'round');
      for (i = -1; i <= 1; i += 2) { pearl(c, i * 4, hy - 17.8, 0.85); pearl(c, i * 8.6, hy - 14, 0.75); }
      pearl(c, 0, hy - 22.3, 1);
      sparkle(c, 3.4, hy - 20.4, 2.2, 1);
      sparkle(c, -8.4, hy - 16.2, 1.5, 3);
    },
    bigBow: function (c, k) {
      bigBowAt(c, 0, k.hy - 14.2, 5.6, k.col, false);
    },
    cap: function (c, k) {
      var hy = k.hy, r = k.r, col = k.col;
      var dome = function () {
        c.beginPath();
        c.moveTo(-r - 1.4, hy - 6);
        c.bezierCurveTo(-r - 1.6, hy - 15, -r + 4, hy - 20.6, 0, hy - 20.6);
        c.bezierCurveTo(r - 4, hy - 20.6, r + 1.6, hy - 15, r + 1.4, hy - 6);
        c.quadraticCurveTo(0, hy - 3.6, -r - 1.4, hy - 6);
        c.closePath();
      };
      brimShade(c, hy - 2.6, 11);
      celPart(c, dome, col, { dx: -1.9, dy: -1.5 });
      c.save(); dome(); c.clip();
      /* the front panel in the trim colour, between two seams */
      c.fillStyle = k.trim;
      c.beginPath(); c.moveTo(-0.4, hy - 21); c.quadraticCurveTo(-7.6, hy - 15, -8.4, hy - 3); c.lineTo(10.4, hy - 3); c.quadraticCurveTo(9.6, hy - 15, 0.4, hy - 21); c.closePath(); c.fill();
      c.fillStyle = 'rgba(60,20,80,0.14)';
      c.beginPath(); c.moveTo(4, hy - 21); c.quadraticCurveTo(10, hy - 15, 10.4, hy - 3); c.lineTo(5, hy - 3); c.closePath(); c.fill();
      if (!LOW) {
        c.strokeStyle = shadowCached(col, 30, false); c.lineWidth = 0.4; c.globalAlpha = 0.8;
        c.beginPath();
        c.moveTo(-0.4, hy - 21); c.quadraticCurveTo(-7.6, hy - 15, -8.4, hy - 3);
        c.moveTo(0.4, hy - 21); c.quadraticCurveTo(9.6, hy - 15, 10.4, hy - 3);
        c.moveTo(-6, hy - 19); c.quadraticCurveTo(-12.6, hy - 14, -13, hy - 5);
        c.stroke();
        c.globalAlpha = 1;
        /* stitched eyelets */
        fillEllipse(c, -10.6, hy - 12.4, 0.55, 0.55, shadowCached(col, 36, false), false);
        c.globalAlpha = 0.3; fillEllipse(c, -6.4, hy - 16.2, 3.6, 1.7, '#ffffff', false);
      }
      c.restore();
      dome(); c.fillStyle = col; ink(c, 2);
      /* an embroidered heart patch on the front */
      heart(c, 1, hy - 11.6, 2.5, col, 1.1);
      if (!LOW) { c.strokeStyle = k.trim; c.lineWidth = 0.3; heartPath(c, 1, hy - 11.6, 1.8); stitch(c, shade(col, 40), 0.3); }
      /* the bill, curved, with its shaded underside and rows of stitching */
      var bill = function () {
        c.beginPath();
        c.moveTo(-r + 3, hy - 6.6);
        c.quadraticCurveTo(2, hy - 3.6, r + 1, hy - 6.4);
        c.bezierCurveTo(r + 6, hy - 6.6, r + 10.4, hy - 4.6, r + 10, hy - 2.8);
        c.bezierCurveTo(r + 5, hy - 0.6, 0, hy - 0.4, -r + 3, hy - 6.6);
        c.closePath();
      };
      celPart(c, bill, k.dark, { dx: -1, dy: -0.9, ink: 1.6 });
      if (!LOW) {
        c.save(); bill(); c.clip();
        c.beginPath(); c.moveTo(-r + 6, hy - 4.4); c.bezierCurveTo(0, hy - 1.4, r + 5, hy - 2.2, r + 9, hy - 3.6);
        stitch(c, shade(col, 30), 0.35);
        c.beginPath(); c.moveTo(-r + 9, hy - 3); c.bezierCurveTo(2, hy - 0.8, r + 4, hy - 1.4, r + 8, hy - 2.6);
        stitch(c, shade(col, 30), 0.35);
        c.restore();
      }
      celPart(c, ellPath(c, 0, hy - 20.8, 1.7, 1.2), k.dark, { rim: false, ink: 1.2, dx: -0.4, dy: -0.3 });
    },
    beanie: function (c, k) {
      var hy = k.hy, r = k.r, col = k.col, i;
      var dome = function () {
        c.beginPath();
        c.moveTo(-r - 1.8, hy - 7.4);
        c.bezierCurveTo(-r - 2, hy - 16, -r + 3.5, hy - 21.4, 0, hy - 21.4);
        c.bezierCurveTo(r - 3.5, hy - 21.4, r + 2, hy - 16, r + 1.8, hy - 7.4);
        c.closePath();
      };
      celPart(c, dome, col, { dx: -1.9, dy: -1.4 });
      if (!LOW) {
        c.save(); dome(); c.clip();
        /* knit ribs: a dark valley and a lit ridge, bending over the crown */
        for (i = -5; i <= 5; i++) {
          c.strokeStyle = shadowCached(col, 26, false); c.lineWidth = 0.55; c.globalAlpha = 0.75;
          c.beginPath(); c.moveTo(i * 3, hy - 7); c.quadraticCurveTo(i * 3.2, hy - 15, i * 1.5, hy - 21.6); c.stroke();
          c.strokeStyle = '#ffffff'; c.lineWidth = 0.4; c.globalAlpha = 0.28;
          c.beginPath(); c.moveTo(i * 3 - 1, hy - 7); c.quadraticCurveTo(i * 3.2 - 1, hy - 15, i * 1.5 - 0.6, hy - 21.6); c.stroke();
        }
        c.restore();
      }
      /* the turned-up cuff, ribbed, with a stripe of trim */
      var cuff = function () { roundRect(c, -r - 2.4, hy - 9.6, (r + 2.4) * 2, 5.6, 2.2); };
      celPart(c, cuff, k.dark, { rim: false, ink: 1.6, dx: -1.4, dy: -0.8 });
      c.save(); cuff(); c.clip();
      c.fillStyle = k.trim; c.fillRect(-r - 3, hy - 7.5, (r + 3) * 2, 1.4);
      if (!LOW) {
        c.strokeStyle = shadowCached(k.dark, 26, false); c.lineWidth = 0.4; c.globalAlpha = 0.7;
        c.beginPath();
        for (i = -7; i <= 7; i++) { c.moveTo(i * 2.1, hy - 9.6); c.lineTo(i * 2.1, hy - 4); }
        c.stroke();
      }
      c.restore();
      fluff(c, k.A * 4, hy - 23.4 - MOTION.lag * 0.3, 4.3, 4.1, k.trim, 9, 1.5);
    },
    partyHat: function (c, k) {
      var hy = k.hy, col = k.col, A = k.A, i;
      var tx = A * 5, ty = hy - 31;
      var cone = function () { c.beginPath(); c.moveTo(-7.6, hy - 9.2); c.quadraticCurveTo(0, hy - 7, 7.6, hy - 9.2); c.lineTo(tx + 0.7, ty); c.lineTo(tx - 0.7, ty); c.closePath(); };
      celPart(c, cone, col, { dx: -1.7, dy: 0 });
      c.save(); cone(); c.clip();
      /* candy stripes wound round the cone, and foil spots between */
      c.fillStyle = k.trim;
      for (i = 0; i < 4; i++) {
        var y0 = hy - 12 - i * 5.6;
        c.beginPath(); c.moveTo(-9, y0); c.quadraticCurveTo(0, y0 + 3.2, 9, y0 - 2.4); c.lineTo(9, y0 - 4.6); c.quadraticCurveTo(0, y0 + 1, -9, y0 - 2.2); c.closePath(); c.fill();
      }
      if (!LOW) {
        c.fillStyle = PAL.sun;
        for (i = 0; i < 3; i++) star(c, -1.6 + (i % 2) * 3.4 + A * (i + 1), hy - 13.4 - i * 5.6, 1.15);
        c.globalAlpha = 0.3; c.fillStyle = '#ffffff';
        c.beginPath(); c.moveTo(-5.4, hy - 9); c.lineTo(tx - 0.4, ty); c.lineTo(-2.6, hy - 8.6); c.closePath(); c.fill();
      }
      c.restore();
      cone(); c.fillStyle = col; ink(c, 2);
      /* a ruffle of tinsel round the base, a pompom on the tip */
      for (i = -3; i <= 3; i++) fluff(c, i * 2.5, hy - 8.6 + Math.abs(i) * 0.24, 1.7, 1.5, i % 2 ? k.trim : PAL.sun, 6, 1.1);
      fluff(c, tx, ty - 1.4, 3, 2.9, PAL.sun, 8, 1.4);
    },
    unicorn: function (c, k) {
      var hy = k.hy, col = k.col, i, sd;
      for (sd = -1; sd <= 1; sd += 2) {
        (function (sd) {
          var ear = function () { c.beginPath(); c.moveTo(sd * 6.2, hy - 10.6); c.quadraticCurveTo(sd * 8 - k.A * 2, hy - 19, sd * 11.6 - k.A * 3, hy - 19.4); c.quadraticCurveTo(sd * 13.4, hy - 13, sd * 11.6, hy - 8.4); c.closePath(); };
          celPart(c, ear, '#fff6ec', { rim: false, ink: 1.4, dx: -0.6, dy: -0.6 });
          c.beginPath(); c.moveTo(sd * 8.2, hy - 11); c.quadraticCurveTo(sd * 9.2 - k.A * 2, hy - 16.6, sd * 11 - k.A * 2.6, hy - 17.2); c.quadraticCurveTo(sd * 11.8, hy - 13, sd * 10.8, hy - 10); c.closePath();
          c.fillStyle = PAL.pink; c.fill();
        })(sd);
      }
      var horn = function () { c.beginPath(); c.moveTo(-3.4, hy - 11.2); c.quadraticCurveTo(0, hy - 9.8, 3.4, hy - 11.2); c.lineTo(0.5, hy - 30.5); c.lineTo(-0.5, hy - 30.5); c.closePath(); };
      celPart(c, horn, col, { dx: -1.1, dy: 0, ink: 1.5 });
      c.save(); horn(); c.clip();
      /* the twist: pearly bands spiralling up, a lit flank */
      c.strokeStyle = k.trim; c.lineWidth = 1.5; c.globalAlpha = 0.9;
      for (i = 0; i < 6; i++) { c.beginPath(); c.moveTo(-4, hy - 11.4 - i * 3.3); c.quadraticCurveTo(0, hy - 11.6 - i * 3.3, 4, hy - 14.2 - i * 3.3); c.stroke(); }
      if (!LOW) {
        c.strokeStyle = shadowCached(col, 30, false); c.lineWidth = 0.35; c.globalAlpha = 0.7;
        for (i = 0; i < 6; i++) { c.beginPath(); c.moveTo(-4, hy - 10.5 - i * 3.3); c.quadraticCurveTo(0, hy - 10.7 - i * 3.3, 4, hy - 13.3 - i * 3.3); c.stroke(); }
        c.globalAlpha = 0.45; c.fillStyle = '#ffffff';
        c.beginPath(); c.moveTo(-2.4, hy - 11); c.lineTo(-0.3, hy - 30); c.lineTo(-0.9, hy - 11); c.closePath(); c.fill();
      }
      c.restore();
      horn(); c.fillStyle = col; ink(c, 1.5);
      /* a garland at the horn's foot */
      leaf(c, -3.6, hy - 10.4, 3, Math.PI * 1.05, '#6cc07a');
      leaf(c, 3.6, hy - 10.4, 3, -0.15, '#6cc07a');
      flower(c, -4.4, hy - 10.6, 2, PAL.pink);
      flower(c, 4.2, hy - 10.6, 1.8, PAL.lavender, PAL.cream);
      flower(c, 0, hy - 9.6, 2.3, PAL.cream, PAL.pink);
      sparkle(c, 4.4, hy - 26, 2.4, 2);
      sparkle(c, -4, hy - 20, 1.5, 5);
    },
    hairClips: function (c, k) {
      var hy = k.hy, col = k.col, yaw = k.yaw, i;
      /* two snap clips on the fringe's near side, a bow clip on the far */
      for (i = 0; i < 2; i++) {
        c.save();
        c.translate(-7.4 + i * 1.6 + yaw * 1.2, hy - 3.6 - i * 3.4); c.rotate(-0.42);
        celPart(c, function () { c.beginPath(); c.moveTo(-3.4, 0); c.quadraticCurveTo(-2.2, -1.5, 3.2, -0.9); c.quadraticCurveTo(3.9, 0, 3.2, 0.9); c.quadraticCurveTo(-2.2, 1.5, -3.4, 0); c.closePath(); }, i ? PAL.cream : col, { rim: false, ink: 1.2, dx: -0.4, dy: -0.4, s: 1.3 });
        sheen(c, -2, -0.5, 1.8, -0.35, 0.4, 0.8);
        c.restore();
      }
      jewel(c, -10.2 + yaw * 1.2, hy - 2.4, 2, PAL.sun, 'star');
      jewel(c, -8.4 + yaw * 1.2, hy - 6.2, 1.9, col, 'heart');
      bigBowAt(c, 8.6 + yaw, hy - 6.4, 2.1, col, false);
      sparkle(c, -11.6 + yaw, hy - 7.4, 1.6, 4);
    },
    sideRibbon: function (c, k) {
      bigBowAt(c, -k.r + 1 + k.yaw * 1.5, k.hy - 9, 4.3, k.col, true);
    },
    headband: function (c, k) {
      var hy = k.hy, r = k.r, col = k.col, i;
      /* a padded band: dark edge, body, a soft roll of light */
      c.lineCap = 'round';
      c.beginPath(); c.arc(0, hy + 1.6, r + 1.2, Math.PI * 1.07, Math.PI * 1.93);
      c.strokeStyle = inkColor(col); c.lineWidth = 3.9; c.stroke();
      c.beginPath(); c.arc(0, hy + 1.6, r + 1.2, Math.PI * 1.07, Math.PI * 1.93);
      c.strokeStyle = shadowCached(col, 16, false); c.lineWidth = 3.1; c.stroke();
      c.beginPath(); c.arc(0, hy + 1.3, r + 1.5, Math.PI * 1.07, Math.PI * 1.93);
      c.strokeStyle = col; c.lineWidth = 2.1; c.stroke();
      if (!LOW) {
        c.beginPath(); c.arc(0, hy + 1.2, r + 2, Math.PI * 1.16, Math.PI * 1.5);
        c.strokeStyle = 'rgba(255,255,255,0.65)'; c.lineWidth = 0.6; c.stroke();
        /* a row of seed pearls along the far side */
        for (i = 0; i < 4; i++) { var a = Math.PI * (1.56 + i * 0.075); pearl(c, Math.cos(a) * (r + 1.3), hy + 1.5 + Math.sin(a) * (r + 1.3), 0.7); }
      }
      bigBowAt(c, -7.6, hy - 10.6, 3.2, col, false);
    },
    witchHat: function (c, k) {
      var hy = k.hy, r = k.r, col = k.col, A = k.A;
      var tipX = 8 + A * 18, tipY = hy - 31 + Math.abs(A) * 6 + MOTION.lag * 0.6;
      brimShade(c, hy - 4, 12.5);
      /* the far side of the brim, then the cone, then the near side */
      var brim = ellPath(c, 0, hy - 7.6, r + 10, 4.4);
      celPart(c, brim, col, { dx: -1.4, dy: -1.1 });
      if (!LOW) {
        c.save(); brim(); c.clip();
        c.globalAlpha = 0.3; fillEllipse(c, 2.6, hy - 7, r, 3.2, '#2a1030', false);
        c.restore();
        c.save(); c.globalAlpha = 0.5; c.strokeStyle = '#ffffff'; c.lineWidth = 0.6;
        c.beginPath(); c.ellipse(0, hy - 7.6, r + 9, 3.6, 0, Math.PI * 1.05, Math.PI * 1.42); c.stroke();
        c.restore();
      }
      var cone = function () {
        c.beginPath();
        c.moveTo(-9.6, hy - 9);
        c.bezierCurveTo(-7.6, hy - 17, -3, hy - 24, tipX - 3, tipY + 0.6);
        c.quadraticCurveTo(tipX + 0.6, tipY - 0.8, tipX + 2.2, tipY + 2.4);
        c.quadraticCurveTo(tipX - 0.2, tipY + 2.2, tipX - 1.6, tipY + 4.4);
        c.bezierCurveTo(4.6, hy - 21, 8.4, hy - 16, 9.6, hy - 9);
        c.quadraticCurveTo(0, hy - 6, -9.6, hy - 9);
        c.closePath();
      };
      celPart(c, cone, col, { dx: -1.6, dy: -0.5 });
      if (!LOW) {
        c.save(); cone(); c.clip();
        /* the felt crumples where the tip flops over */
        c.strokeStyle = shadowCached(col, 30, false); c.lineWidth = 0.5; c.lineCap = 'round'; c.globalAlpha = 0.75;
        c.beginPath();
        c.moveTo(-2.4, hy - 21.6); c.quadraticCurveTo(1, hy - 20.4, 3.6, hy - 21.6);
        c.moveTo(-4.4, hy - 17.4); c.quadraticCurveTo(0, hy - 15.6, 5.4, hy - 17.8);
        c.stroke();
        c.globalAlpha = 0.95; c.fillStyle = lum(col) > 0.6 ? k.trim : '#ffe27a';
        star(c, -3.4, hy - 15.4, 1.5); star(c, 2.2, hy - 19.2, 1.1); star(c, 4.4, hy - 13.6, 1);
        c.restore();
      }
      /* band and a gold buckle */
      celPart(c, bandPath(c, 9.4, hy - 12.6, hy - 8.8, 2.8), k.dark, { rim: false, ink: 1.3, dx: -1, dy: -0.5 });
      celPart(c, rrPath(c, -2.6, hy - 11.9, 5.2, 4.6, 0.9), '#f6c343', { rim: false, ink: 1.2, dx: -0.5, dy: -0.5, s: 1.3 });
      fillRound(c, -1.3, hy - 10.7, 2.6, 2.2, 0.4, k.dark, false);
      sheen(c, -2, hy - 11.3, -0.2, hy - 11.5, 0.4, 0.9);
      /* a charm swinging from the tip */
      var cx = tipX + 1.4 + A * 6, cy = tipY + 7 - Math.abs(A) * 2;
      c.strokeStyle = 'rgba(90,60,40,0.8)'; c.lineWidth = 0.35;
      c.beginPath(); c.moveTo(tipX + 1.4, tipY + 2.2); c.lineTo(cx, cy - 1.6); c.stroke();
      jewel(c, cx, cy, 1.7, PAL.sun, 'star');
    },
    crown: function (c, k) {
      var hy = k.hy, col = k.col, i;
      var gold = '#f6c343';
      /* the velvet cap swelling inside the ring */
      celPart(c, function () { c.beginPath(); c.moveTo(-7.4, hy - 11); c.bezierCurveTo(-7.6, hy - 19.4, 7.6, hy - 19.4, 7.4, hy - 11); c.closePath(); }, col, { dx: -1.2, dy: -1.2, ink: 1.3 });
      /* the far points, darker, seen between the near ones */
      celPart(c, polyPath(c, [[-6.4, hy - 11], [-4.6, hy - 17], [-2.4, hy - 13], [2.4, hy - 13], [4.6, hy - 17], [6.4, hy - 11]]), shadowCached(gold, 30, true), { rim: false, ink: 1.1, dx: -0.4, dy: -0.4 });
      var ring = function () {
        c.beginPath();
        c.moveTo(-8.4, hy - 8.2);
        c.lineTo(-9.6, hy - 17.6); c.lineTo(-5, hy - 13.4);
        c.lineTo(0, hy - 20.4);
        c.lineTo(5, hy - 13.4); c.lineTo(9.6, hy - 17.6);
        c.lineTo(8.4, hy - 8.2);
        c.quadraticCurveTo(0, hy - 6, -8.4, hy - 8.2);
        c.closePath();
      };
      celPart(c, ring, gold, { dx: -1, dy: -0.9, ink: 1.5, s: 1.3 });
      celPart(c, bandPath(c, 8.5, hy - 11.4, hy - 8.3, 2.2), shade(gold, -12), { rim: false, ink: 1.2, dx: -0.7, dy: -0.4 });
      sheen(c, -7.6, hy - 12.6, -6.2, hy - 15.2, 0.5, 0.85);
      sheen(c, -1.6, hy - 14.6, -0.4, hy - 17.4, 0.5, 0.85);
      jewel(c, 0, hy - 8.4, 1.6, col, 'diamond');
      jewel(c, -5, hy - 9.2, 1, PAL.sky, 'round');
      jewel(c, 5, hy - 9.2, 1, PAL.pink, 'round');
      pearl(c, 0, hy - 20.8, 1.15);
      pearl(c, -9.6, hy - 18, 1);
      pearl(c, 9.6, hy - 18, 1);
      if (!LOW) for (i = -1; i <= 1; i += 2) pearl(c, i * 5, hy - 13.8, 0.7);
      sparkle(c, -6.6, hy - 20.6, 2, 2);
    },
    sunHat: function (c, k) {
      var hy = k.hy, r = k.r, col = k.col, A = k.A, i;
      var cream = '#fff4e2';
      var rip = Math.sin(MOTION.t * 2.4) * 0.5 + MOTION.lag * 0.3;
      brimShade(c, hy - 3.2, 12.5);
      /* a floppy brim with a wavy edge that ripples as she moves */
      var brim = function () {
        c.beginPath();
        var n = 40, rx = r + 13, ry = 6;
        for (i = 0; i <= n; i++) {
          var a = i / n * TAU, w = 1 + 0.06 * Math.sin(a * 5 + MOTION.t * 1.2);
          var x = Math.cos(a) * rx * w, y = hy - 6 + Math.sin(a) * ry * w + Math.cos(a) * rip;
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.closePath();
      };
      celPart(c, brim, cream, { dx: -1.8, dy: -1.4, ink: 1.8 });
      if (!LOW) {
        c.save(); brim(); c.clip();
        c.globalAlpha = 0.26; fillEllipse(c, 3, hy - 5.4, r + 1, 3.8, '#7a4a30', false);
        c.globalAlpha = 0.5; c.strokeStyle = shadowCached(cream, 20, true); c.lineWidth = 0.4;
        c.beginPath(); c.ellipse(0, hy - 6, r + 9, 4.2, 0, 0, TAU); c.stroke();
        c.restore();
      }
      var crown = function () {
        c.beginPath();
        c.moveTo(-r + 2.6, hy - 7);
        c.bezierCurveTo(-r + 2.2, hy - 14, -r + 4.5, hy - 18.4, 0, hy - 18.4);
        c.bezierCurveTo(r - 4.5, hy - 18.4, r - 2.2, hy - 14, r - 2.6, hy - 7);
        c.quadraticCurveTo(0, hy - 4.8, -r + 2.6, hy - 7);
        c.closePath();
      };
      celPart(c, crown, cream, { dx: -1.6, dy: -1.5 });
      celPart(c, bandPath(c, r - 2.6, hy - 10.6, hy - 7.2, 2.2), col, { rim: false, ink: 1.3, dx: -1.2, dy: -0.6 });
      /* the ribbon's tails trail behind */
      var tw = -MOTION.skirt * 1.2 + A * 10;
      celPart(c, function () {
        c.beginPath();
        c.moveTo(-r + 3, hy - 9);
        c.quadraticCurveTo(-r - 3.6 + tw * 0.4, hy - 4, -r - 2.4 + tw, hy + 4.4);
        c.lineTo(-r - 3.4 + tw, hy + 2.6);
        c.lineTo(-r - 4.6 + tw, hy + 4);
        c.quadraticCurveTo(-r - 5.4 + tw * 0.4, hy - 4, -r + 2, hy - 8);
        c.closePath();
      }, col, { rim: false, ink: 1.3, dx: -0.5, dy: -0.5 });
      flower(c, -r + 4.6, hy - 8.6, 2.5, k.trim, col);
      leaf(c, -r + 6.6, hy - 7.6, 2.6, 0.5, '#6cc07a');
    },
    topHat: function (c, k) {
      var hy = k.hy, r = k.r, col = k.col;
      brimShade(c, hy - 4.2, 11.5);
      var brim = function () {
        c.beginPath();
        c.moveTo(-r - 5.4, hy - 9.2);
        c.quadraticCurveTo(-r - 6.4, hy - 6.4, -r - 2, hy - 5.8);
        c.quadraticCurveTo(0, hy - 3.4, r + 2, hy - 5.8);
        c.quadraticCurveTo(r + 6.4, hy - 6.4, r + 5.4, hy - 9.2);
        c.quadraticCurveTo(0, hy - 6.4, -r - 5.4, hy - 9.2);
        c.closePath();
      };
      var tube = function () {
        c.beginPath();
        c.moveTo(-r + 3, hy - 8.4);
        c.quadraticCurveTo(-r + 3.4, hy - 18, -r + 1.6, hy - 25.2);
        c.quadraticCurveTo(0, hy - 28, r - 1.6, hy - 25.2);
        c.quadraticCurveTo(r - 3.4, hy - 18, r - 3, hy - 8.4);
        c.quadraticCurveTo(0, hy - 6, -r + 3, hy - 8.4);
        c.closePath();
      };
      celPart(c, tube, col, { dx: -1.9, dy: -0.8 });
      if (!LOW) {
        c.save(); tube(); c.clip();
        /* silk: a long soft highlight down the lit side */
        var g = c.createLinearGradient(-r, 0, r, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.24, 'rgba(255,255,255,0.4)'); g.addColorStop(0.42, 'rgba(255,255,255,0)');
        g.addColorStop(0.8, 'rgba(30,10,50,0)'); g.addColorStop(1, 'rgba(30,10,50,0.25)');
        c.fillStyle = g; c.fillRect(-r, hy - 30, r * 2, 24);
        c.restore();
      }
      /* the flat top, seen a little from above */
      celPart(c, ellPath(c, 0, hy - 25.6, r - 1.6, 2.5), shade(col, 14), { rim: false, ink: 1.4, dx: -1, dy: -0.5 });
      celPart(c, bandPath(c, r - 3, hy - 13.2, hy - 8.6, 2.4), k.trim, { rim: false, ink: 1.3, dx: -1.2, dy: -0.6 });
      celPart(c, brim, col, { dx: -1.2, dy: -0.8, ink: 1.6 });
      sheen(c, -r - 3.6, hy - 7.4, -r + 2, hy - 6.2, 0.5, 0.6);
      /* a playing card heart tucked in the band */
      c.save(); c.translate(6, hy - 13.4); c.rotate(0.3);
      celPart(c, rrPath(c, -2, -3.6, 4, 5.6, 0.7), '#fffaf4', { rim: false, ink: 1.1, dx: -0.4, dy: -0.4 });
      heart(c, 0, -1, 1.2, '#e2559a', false);
      c.restore();
    },
    sailorCap: function (c, k) {
      var hy = k.hy, r = k.r, col = k.col, A = k.A;
      var white = '#fffaf4';
      /* ribbon tails fluttering off the back */
      var tw = -MOTION.skirt * 1.1 + A * 10, sd;
      for (sd = 0; sd < 2; sd++) {
        (function (sd) {
          celPart(c, function () {
            c.beginPath();
            c.moveTo(r - 2, hy - 10);
            c.quadraticCurveTo(r + 4 + tw * 0.4, hy - 7 + sd * 2, r + 5.4 + tw + sd * 1.6, hy + 1 + sd * 3);
            c.lineTo(r + 4 + tw + sd * 1.6, hy + 0.2 + sd * 3);
            c.lineTo(r + 3.4 + tw + sd * 1.6, hy + 2 + sd * 3);
            c.quadraticCurveTo(r + 1.6 + tw * 0.4, hy - 6 + sd * 2, r - 3, hy - 8.6);
            c.closePath();
          }, sd ? shade(col, -10) : col, { rim: false, ink: 1.3, dx: -0.5, dy: -0.5 });
        })(sd);
      }
      /* a soft round top, wider than its band */
      var top = function () {
        c.beginPath();
        c.moveTo(-r + 1.4, hy - 11);
        c.bezierCurveTo(-r - 6, hy - 12, -r - 4, hy - 20.6, 0, hy - 20.8);
        c.bezierCurveTo(r + 4, hy - 20.6, r + 6, hy - 12, r - 1.4, hy - 11);
        c.quadraticCurveTo(0, hy - 8.6, -r + 1.4, hy - 11);
        c.closePath();
      };
      celPart(c, top, white, { dx: -1.8, dy: -1.6, s: 0.8 });
      if (!LOW) {
        c.strokeStyle = 'rgba(120,90,130,0.35)'; c.lineWidth = 0.4; c.lineCap = 'round';
        c.beginPath();
        c.moveTo(-6, hy - 20); c.quadraticCurveTo(-9.6, hy - 15.6, -9, hy - 11.6);
        c.moveTo(6, hy - 20); c.quadraticCurveTo(9.6, hy - 15.6, 9, hy - 11.6);
        c.stroke();
      }
      celPart(c, bandPath(c, r - 1.2, hy - 11.6, hy - 7, 2.4), col, { rim: false, ink: 1.4, dx: -1.3, dy: -0.6 });
      if (!LOW) {
        c.strokeStyle = k.trim; c.lineWidth = 0.45;
        c.beginPath(); c.moveTo(-r + 1.4, hy - 10.6); c.quadraticCurveTo(0, hy - 8.2, r - 1.4, hy - 10.6); c.stroke();
        c.beginPath(); c.moveTo(-r + 1.3, hy - 8); c.quadraticCurveTo(0, hy - 5.6, r - 1.3, hy - 8); c.stroke();
      }
      /* a little gold anchor on the front */
      c.strokeStyle = '#f6c343'; c.lineWidth = 0.7; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(0, hy - 16.4); c.lineTo(0, hy - 12);
      c.moveTo(-1.5, hy - 15); c.lineTo(1.5, hy - 15);
      c.moveTo(-2.4, hy - 13.6); c.quadraticCurveTo(-2, hy - 11.6, 0, hy - 12); c.quadraticCurveTo(2, hy - 11.6, 2.4, hy - 13.6);
      c.stroke();
      c.beginPath(); c.arc(0, hy - 17.1, 0.7, 0, TAU); c.stroke();
    },
    bucketHat: function (c, k) {
      var hy = k.hy, r = k.r, col = k.col;
      brimShade(c, hy - 2.6, 12.5);
      /* the brim slopes down all round, over the fringe */
      var brim = function () {
        c.beginPath();
        c.moveTo(-r + 0.6, hy - 9.6);
        c.quadraticCurveTo(0, hy - 7.2, r - 0.6, hy - 9.6);
        c.bezierCurveTo(r + 3.4, hy - 9, r + 6.6, hy - 6.6, r + 6.4, hy - 4.6);
        c.quadraticCurveTo(0, hy - 0.4, -r - 6.4, hy - 4.6);
        c.bezierCurveTo(-r - 6.6, hy - 6.6, -r - 3.4, hy - 9, -r + 0.6, hy - 9.6);
        c.closePath();
      };
      celPart(c, brim, shade(col, -6), { dx: -1.6, dy: -1.2 });
      if (!LOW) {
        c.save(); brim(); c.clip();
        c.beginPath(); c.moveTo(-r - 5, hy - 5.2); c.quadraticCurveTo(0, hy - 1.6, r + 5, hy - 5.2);
        stitch(c, shade(col, 34), 0.4);
        c.beginPath(); c.moveTo(-r - 3, hy - 6.8); c.quadraticCurveTo(0, hy - 3.4, r + 3, hy - 6.8);
        stitch(c, shade(col, 34), 0.4);
        c.restore();
      }
      var crown = function () {
        c.beginPath();
        c.moveTo(-r + 0.4, hy - 9.4);
        c.quadraticCurveTo(-r + 1.4, hy - 17, -r + 3.4, hy - 19.6);
        c.quadraticCurveTo(0, hy - 21.8, r - 3.4, hy - 19.6);
        c.quadraticCurveTo(r - 1.4, hy - 17, r - 0.4, hy - 9.4);
        c.quadraticCurveTo(0, hy - 6.8, -r + 0.4, hy - 9.4);
        c.closePath();
      };
      celPart(c, crown, col, { dx: -1.8, dy: -1.4 });
      if (!LOW) {
        c.save(); crown(); c.clip();
        c.beginPath(); c.moveTo(-r, hy - 18.4); c.quadraticCurveTo(0, hy - 20.4, r, hy - 18.4);
        stitch(c, shade(col, 34), 0.35);
        c.restore();
      }
      /* an embroidered daisy and a woven label */
      flower(c, 4.6, hy - 13.6, 2.6, k.trim, PAL.sun);
      celPart(c, rrPath(c, -9.4, hy - 12.4, 4, 2.4, 0.5), k.trim, { rim: false, ink: 1, dx: -0.3, dy: -0.3 });
    },
    cowboyHat: function (c, k) {
      var hy = k.hy, r = k.r, col = k.col;
      brimShade(c, hy - 3.6, 12.5);
      /* a wide brim rolled up at both sides */
      var brim = function () {
        c.beginPath();
        c.moveTo(-r - 11, hy - 12.6);
        c.bezierCurveTo(-r - 8, hy - 7.4, -8, hy - 4.2, 0, hy - 4);
        c.bezierCurveTo(8, hy - 4.2, r + 8, hy - 7.4, r + 11, hy - 12.6);
        c.bezierCurveTo(r + 6, hy - 9.8, 8, hy - 8.6, 0, hy - 8.6);
        c.bezierCurveTo(-8, hy - 8.6, -r - 6, hy - 9.8, -r - 11, hy - 12.6);
        c.closePath();
      };
      celPart(c, brim, col, { dx: -1.4, dy: -1.2, ink: 1.8 });
      if (!LOW) {
        c.save(); brim(); c.clip();
        c.beginPath(); c.moveTo(-r - 9.4, hy - 11); c.bezierCurveTo(-r - 6, hy - 6.6, -8, hy - 5.2, 0, hy - 5); c.bezierCurveTo(8, hy - 5.2, r + 6, hy - 6.6, r + 9.4, hy - 11);
        stitch(c, shade(col, 36), 0.4);
        c.restore();
      }
      /* a tall crown with a crease pinched down the middle */
      var crown = function () {
        c.beginPath();
        c.moveTo(-r + 3, hy - 8.2);
        c.bezierCurveTo(-r + 2, hy - 15, -r + 3.6, hy - 21.6, -4.4, hy - 22);
        c.quadraticCurveTo(-1.6, hy - 21.9, 0, hy - 20.6);
        c.quadraticCurveTo(1.6, hy - 21.9, 4.4, hy - 22);
        c.bezierCurveTo(r - 3.6, hy - 21.6, r - 2, hy - 15, r - 3, hy - 8.2);
        c.quadraticCurveTo(0, hy - 5.8, -r + 3, hy - 8.2);
        c.closePath();
      };
      celPart(c, crown, col, { dx: -1.8, dy: -1.4 });
      if (!LOW) {
        c.strokeStyle = shadowCached(col, 32, false); c.lineWidth = 0.6; c.lineCap = 'round'; c.globalAlpha = 0.8;
        c.beginPath(); c.moveTo(0, hy - 20.6); c.quadraticCurveTo(0.6, hy - 17, 0.2, hy - 13); c.stroke();
        c.globalAlpha = 1;
      }
      celPart(c, bandPath(c, r - 3.1, hy - 11.6, hy - 8.4, 2.4), k.trim, { rim: false, ink: 1.3, dx: -1.2, dy: -0.6 });
      jewel(c, 0, hy - 8.4, 2.3, '#f6c343', 'star');
    },
    earmuffs: function (c, k) {
      var hy = k.hy, r = k.r, col = k.col, sd;
      c.lineCap = 'round';
      c.beginPath(); c.arc(0, hy + 1, r + 2.6, Math.PI * 1.02, Math.PI * 1.98);
      c.strokeStyle = inkColor(k.dark); c.lineWidth = 2.6; c.stroke();
      c.beginPath(); c.arc(0, hy + 1, r + 2.6, Math.PI * 1.02, Math.PI * 1.98);
      c.strokeStyle = k.dark; c.lineWidth = 1.8; c.stroke();
      if (!LOW) {
        c.beginPath(); c.arc(0, hy + 0.8, r + 3, Math.PI * 1.15, Math.PI * 1.5);
        c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 0.5; c.stroke();
      }
      for (sd = -1; sd <= 1; sd += 2) {
        var ex = sd * (r + 1.4) + (sd < 0 ? k.yaw * 2.4 : -k.yaw * 3.4);
        fluff(c, ex, hy + 1.8, 5.6, 6.4, col, 11, 1.6);
        heart(c, ex, hy + 2, 1.9, k.trim, false);
      }
    },
    kerchief: function (c, k) {
      var hy = k.hy, r = k.r, col = k.col, A = k.A, sd;
      /* knot ends poking out at the nape */
      for (sd = -1; sd <= 1; sd += 2) {
        (function (sd) {
          celPart(c, function () {
            c.beginPath();
            c.moveTo(r - 1, hy + 3.6);
            c.quadraticCurveTo(r + 5 + A * 6, hy + 2 + sd * 2.6, r + 8 + A * 9, hy + 3.4 + sd * 4.4);
            c.quadraticCurveTo(r + 5 + A * 6, hy + 5.4 + sd * 2, r - 1, hy + 5.6);
            c.closePath();
          }, shade(col, -8), { rim: false, ink: 1.3, dx: -0.5, dy: -0.5 });
        })(sd);
      }
      /* the scarf over the crown, tied back behind the ears */
      var body = function () {
        c.beginPath();
        c.moveTo(-r - 1.4, hy + 3.4);
        c.bezierCurveTo(-r - 3, hy - 9, -r + 2, hy - 18.6, 0, hy - 18.6);
        c.bezierCurveTo(r - 2, hy - 18.6, r + 3, hy - 9, r + 1.4, hy + 3.4);
        c.quadraticCurveTo(r - 0.4, hy - 2, r - 2.4, hy - 5.6);
        c.quadraticCurveTo(0, hy - 10.6, -r + 2.4, hy - 5.6);
        c.quadraticCurveTo(-r + 0.4, hy - 2, -r - 1.4, hy + 3.4);
        c.closePath();
      };
      celPart(c, body, col, { dx: -1.9, dy: -1.6 });
      c.save(); body(); c.clip();
      if (!LOW) drawPattern(c, 'dots', col, -r - 4, hy - 18, r + 4, hy + 4);
      /* a folded band along the front edge */
      c.strokeStyle = k.trim; c.lineWidth = 1.6; c.globalAlpha = 0.95;
      c.beginPath(); c.moveTo(-r - 0.6, hy + 1); c.quadraticCurveTo(-r + 0.8, hy - 3, -r + 2.6, hy - 6.4); c.quadraticCurveTo(0, hy - 11.4, r - 2.6, hy - 6.4); c.quadraticCurveTo(r - 0.8, hy - 3, r + 0.6, hy + 1); c.stroke();
      c.globalAlpha = 1;
      c.restore();
      body(); c.fillStyle = col; ink(c, 2);
      celPart(c, ellPath(c, r + 0.2, hy + 4.4, 1.7, 1.9), k.dark, { rim: false, ink: 1.2, dx: -0.4, dy: -0.4 });
    },
    halo: function (c, k) {
      var hy = k.hy, r = k.r;
      var y = hy - 22.6 + Math.sin(MOTION.t * 1.7) * 0.7 - MOTION.lag * 0.35, x = k.A * 6;
      if (!LOW) {
        var g = c.createRadialGradient(x, y, 2, x, y, 15);
        g.addColorStop(0, 'rgba(255,240,170,0.5)'); g.addColorStop(1, 'rgba(255,240,170,0)');
        c.fillStyle = g; c.fillRect(x - 16, y - 12, 32, 24);
      }
      /* a gold ring seen from a little above: far side, then near side */
      c.lineCap = 'round';
      c.beginPath(); c.ellipse(x, y, r - 2.4, 3.2, 0, 0, TAU);
      c.strokeStyle = inkColor('#f6c343'); c.lineWidth = 2.5; c.stroke();
      c.beginPath(); c.ellipse(x, y, r - 2.4, 3.2, 0, 0, TAU);
      c.strokeStyle = '#f0b62e'; c.lineWidth = 1.7; c.stroke();
      c.beginPath(); c.ellipse(x, y, r - 2.4, 3.2, 0, 0.1, Math.PI - 0.1);
      c.strokeStyle = '#ffe27a'; c.lineWidth = 1.7; c.stroke();
      c.beginPath(); c.ellipse(x, y - 0.3, r - 2.4, 3.2, 0, Math.PI * 0.55, Math.PI * 0.9);
      c.strokeStyle = '#fffbe0'; c.lineWidth = 0.7; c.stroke();
      sparkle(c, x - r + 1, y - 2.6, 2.4, 1);
      sparkle(c, x + r - 2.6, y + 2.4, 1.7, 4);
    },
  };
  var CROWN_HATS = { strawHat: 1, beret: 1, cap: 1, beanie: 1, witchHat: 1, sunHat: 1, topHat: 1, sailorCap: 1, bucketHat: 1, cowboyHat: 1, kerchief: 1 };
  function drawHat(c, cust) {
    var fn = HATS[cust.hat];
    if (!fn) return;
    var col = cust.hatColor;
    fn(c, { hy: CH.headY, r: CH.headR, col: col, dark: shade(col, -22), trim: trimOf(col), A: MOTION.hairA, yaw: MOTION.yaw });
  }

  /* ---- Bags ---- */
  /* a strap from the far shoulder across the chest to (x, y) */
  function bagStrap(c, x, y, col, w, chain) {
    var top = CH.torsoTop;
    var path = function () { c.beginPath(); c.moveTo(-7, top + 0.8); c.quadraticCurveTo(3, top + 9, x, y); };
    c.lineCap = 'round';
    if (chain) {
      path(); c.strokeStyle = '#b8801a'; c.lineWidth = 1.1; c.stroke();
      path(); c.strokeStyle = '#ffe27a'; c.lineWidth = 0.6; c.setLineDash([0.8, 0.8]); c.stroke(); c.setLineDash([]);
      return;
    }
    path(); c.strokeStyle = inkColor(col); c.lineWidth = w + 0.7; c.stroke();
    path(); c.strokeStyle = shade(col, -22); c.lineWidth = w; c.stroke();
    if (!LOW) { path(); stitch(c, shade(col, 30), 0.3); }
  }
  /* a little gold clasp or buckle */
  function clasp(c, x, y, w, h) {
    celPart(c, rrPath(c, x - w / 2, y - h / 2, w, h, Math.min(w, h) * 0.3), '#f6c343', { rim: false, ink: 1.1, dx: -0.3, dy: -0.3, s: 1.3 });
    sheen(c, x - w * 0.3, y - h * 0.2, x + w * 0.1, y - h * 0.3, 0.35, 0.9);
  }

  var BACK_BAGS = { backpack: 1, randoseru: 1 };
  function drawBagBack(c, cust) {
    var bag = cust.bag;
    if (!BACK_BAGS[bag]) return;
    var col = cust.bagColor, dark = shade(col, -24), tc = trimOf(col);
    var top = CH.torsoTop, bot = CH.torsoBot;
    /* square to the camera the pack shows either side of her; as she
       turns to walk it swings round behind */
    var ox = -MOTION.yaw * 9 - 0.5, sd;
    c.save();
    c.translate(ox, MOTION.lag * 0.25);
    if (bag === 'backpack') {
      /* side pockets, then the body with its front pocket peeking below */
      for (sd = -1; sd <= 1; sd += 2) celPart(c, rrPath(c, sd * 13.4 - 2.6, top + 9, 5.2, 9, 2.4), dark, { rim: false, ink: 1.5, dx: -0.7, dy: -0.7 });
      celPart(c, rrPath(c, -14, top + 0.6, 28, 21.4, 6.5), col, { dx: -1.6, dy: -1.4 });
      if (!LOW) {
        c.strokeStyle = tc; c.lineWidth = 0.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-13, top + 7); c.quadraticCurveTo(-13.6, top + 1.6, -8, top + 1.4); c.moveTo(13, top + 7); c.quadraticCurveTo(13.6, top + 1.6, 8, top + 1.4);
        stitch(c, tc, 0.4);
        /* a zip pull swinging at the side */
        fillEllipse(c, -13.4 - MOTION.skirt * 0.3, top + 13.4, 0.9, 1.2, PAL.sun, false);
      }
      celPart(c, rrPath(c, -5, top - 1.4, 10, 3.4, 1.7), dark, { rim: false, ink: 1.3 });
    } else {
      /* a boxy school bag: a stiff shell, a long flap, a charm on its side */
      celPart(c, rrPath(c, -14.4, top - 0.4, 28.8, 22.8, 3), col, { dx: -1.6, dy: -1.4 });
      celPart(c, rrPath(c, -15, top - 1.4, 30, 5.4, 2.4), shade(col, 12), { rim: false, ink: 1.5, dx: -1.2, dy: -0.8 });
      if (!LOW) {
        c.beginPath(); c.moveTo(-13.2, top + 5.4); c.lineTo(-13.2, top + 21); c.moveTo(13.2, top + 5.4); c.lineTo(13.2, top + 21);
        stitch(c, tc, 0.4);
        sheen(c, -13.6, top - 0.4, -9, top - 0.6, 0.5, 0.7);
      }
      var sw = -MOTION.skirt * 0.5;
      c.strokeStyle = 'rgba(90,60,40,0.85)'; c.lineWidth = 0.4;
      c.beginPath(); c.moveTo(14.2, top + 10); c.lineTo(15.4 + sw, top + 14); c.stroke();
      jewel(c, 15.6 + sw, top + 15.6, 1.9, PAL.sun, 'star');
    }
    c.restore();
  }
  /* shoulder straps of a pack, over whatever she wears */
  function packStraps(c, col, rivets) {
    var top = CH.torsoTop, sd;
    for (sd = -1; sd <= 1; sd += 2) {
      (function (sd) {
        celPart(c, function () {
          c.beginPath();
          c.moveTo(sd * 4.8, top - 0.4); c.lineTo(sd * 7.6, top - 0.2);
          c.quadraticCurveTo(sd * 9.6, top + 7, sd * 9, top + 13.4);
          c.lineTo(sd * 6.8, top + 13.4);
          c.quadraticCurveTo(sd * 7.2, top + 7, sd * 4.8, top - 0.4);
          c.closePath();
        }, shade(col, -14), { rim: false, ink: 1.4, dx: -0.5, dy: -0.4 });
        if (rivets) clasp(c, sd * 7.6, top + 4.4, 1.5, 1.5);
        else celPart(c, rrPath(c, sd * 8 - 1.5, top + 8.6, 3, 2, 0.6), trimOf(col), { rim: false, ink: 1, dx: -0.3, dy: -0.3 });
      })(sd);
    }
  }
  /* bags on a strap or a belt, in the torso frame; they swing a little behind */
  function drawBagFront(c, cust) {
    var bag = cust.bag;
    if (bag === 'none') return;
    var col = cust.bagColor, dark = shade(col, -24), tc = trimOf(col);
    var top = CH.torsoTop, bot = CH.torsoBot;
    var sw = -MOTION.skirt * 0.7, sy = MOTION.lag * 0.3;
    var bx = 13.4 + sw, by = bot + sy, i, sd, p;
    switch (bag) {
      case 'backpack': packStraps(c, col, false); break;
      case 'randoseru': packStraps(c, col, true); break;
      case 'purse':
        bagStrap(c, bx - 2, by - 4.5, col, 0.9, true);
        p = function () { c.beginPath(); c.moveTo(bx - 5.6, by - 4.4); c.lineTo(bx + 5.6, by - 4.4); c.quadraticCurveTo(bx + 7, by + 1, bx + 5.4, by + 4.6); c.quadraticCurveTo(bx, by + 6, bx - 5.4, by + 4.6); c.quadraticCurveTo(bx - 7, by + 1, bx - 5.6, by - 4.4); c.closePath(); };
        celPart(c, p, col, { dx: -1.1, dy: -1.1 });
        /* a scalloped flap, quilted, with a jewelled clasp */
        p = function () { c.beginPath(); c.moveTo(bx - 5.9, by - 4.6); c.lineTo(bx + 5.9, by - 4.6); c.quadraticCurveTo(bx + 6.4, by - 1, bx + 4, by + 0.4); c.quadraticCurveTo(bx + 2, by + 1.6, bx, by + 0.2); c.quadraticCurveTo(bx - 2, by + 1.6, bx - 4, by + 0.4); c.quadraticCurveTo(bx - 6.4, by - 1, bx - 5.9, by - 4.6); c.closePath(); };
        celPart(c, p, shade(col, 10), { rim: false, ink: 1.4, dx: -0.8, dy: -0.6 });
        if (!LOW) {
          c.save(); p(); c.clip();
          c.strokeStyle = shadowCached(col, 24, false); c.lineWidth = 0.35; c.globalAlpha = 0.7;
          c.beginPath();
          for (i = -4; i <= 4; i++) { c.moveTo(bx + i * 2.4 - 3, by - 5); c.lineTo(bx + i * 2.4 + 3, by + 2); c.moveTo(bx + i * 2.4 + 3, by - 5); c.lineTo(bx + i * 2.4 - 3, by + 2); }
          c.stroke();
          c.restore();
        }
        jewel(c, bx, by + 0.4, 1.4, tc, 'round');
        glint(c, bx - 3.4, by - 3.2, 1.3, 0.6, 0.6);
        break;
      case 'messenger':
        bagStrap(c, bx - 3, by - 5, col, 1.5);
        celPart(c, rrPath(c, bx - 7, by - 5, 14, 11.6, 2.4), col, { dx: -1.1, dy: -1.1 });
        p = function () { c.beginPath(); c.moveTo(bx - 7.3, by - 5.3); c.lineTo(bx + 7.3, by - 5.3); c.lineTo(bx + 7.3, by + 0.6); c.quadraticCurveTo(bx, by + 3.6, bx - 7.3, by + 0.6); c.closePath(); };
        celPart(c, p, dark, { rim: false, ink: 1.4, dx: -0.9, dy: -0.7 });
        if (!LOW) {
          c.beginPath(); c.moveTo(bx - 6.4, by - 0.2); c.quadraticCurveTo(bx, by + 2.6, bx + 6.4, by - 0.2);
          stitch(c, shade(col, 34), 0.35);
        }
        /* two buckled straps */
        for (sd = -1; sd <= 1; sd += 2) {
          celPart(c, rrPath(c, bx + sd * 3.6 - 0.9, by - 3, 1.8, 7.4, 0.7), shade(col, 12), { rim: false, ink: 1, dx: -0.2, dy: -0.2 });
          clasp(c, bx + sd * 3.6, by + 2.6, 2.4, 1.9);
        }
        break;
      case 'heartBag':
        bagStrap(c, bx - 2.6, by - 3.6, col, 0.9, true);
        p = function () { heartPath(c, bx, by + 0.6, 6.2); };
        celPart(c, p, col, { dx: -1, dy: -1.1, ink: 1.6 });
        if (!LOW) {
          c.save(); p(); c.clip();
          /* quilting */
          c.strokeStyle = shadowCached(col, 22, false); c.lineWidth = 0.35; c.globalAlpha = 0.7;
          c.beginPath();
          for (i = -4; i <= 4; i++) { c.moveTo(bx + i * 2.6 - 6, by - 6); c.lineTo(bx + i * 2.6 + 6, by + 8); c.moveTo(bx + i * 2.6 + 6, by - 6); c.lineTo(bx + i * 2.6 - 6, by + 8); }
          c.stroke();
          c.restore();
          heartPath(c, bx, by + 0.6, 5.1); stitch(c, tc, 0.35);
        }
        glint(c, bx - 3.2, by - 2.2, 1.5, 0.9, 0.7);
        clasp(c, bx, by - 2.6, 2.2, 1.4);
        break;
      case 'starBag':
        bagStrap(c, bx - 2.6, by - 4, col, 0.9, true);
        p = function () {
          c.beginPath();
          for (var q = 0; q < 10; q++) { var ang = (Math.PI / 5) * q - Math.PI / 2, rad = q % 2 === 0 ? 7.4 : 3.9; c.lineTo(bx + Math.cos(ang) * rad, by + 1 + Math.sin(ang) * rad); }
          c.closePath();
        };
        c.lineJoin = 'round';
        celPart(c, p, col, { dx: -0.9, dy: -1, ink: 1.8 });
        if (!LOW) {
          c.beginPath();
          for (i = 0; i < 10; i++) { var a2 = (Math.PI / 5) * i - Math.PI / 2, r2 = i % 2 === 0 ? 5.8 : 3; c.lineTo(bx + Math.cos(a2) * r2, by + 1 + Math.sin(a2) * r2); }
          c.closePath(); stitch(c, tc, 0.35);
          /* a sleepy little face */
          c.strokeStyle = inkColor(col); c.lineWidth = 0.5; c.lineCap = 'round';
          c.beginPath(); c.arc(bx - 1.7, by + 0.6, 0.8, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
          c.beginPath(); c.arc(bx + 1.7, by + 0.6, 0.8, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
          c.beginPath(); c.arc(bx, by + 1.8, 0.7, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
          fillEllipse(c, bx - 3, by + 2, 0.9, 0.5, 'rgba(255,110,140,0.5)', false);
          fillEllipse(c, bx + 3, by + 2, 0.9, 0.5, 'rgba(255,110,140,0.5)', false);
        }
        glint(c, bx - 1.6, by - 3.2, 1, 0.7, 0.7);
        break;
      case 'bunnyBag':
        bagStrap(c, bx - 2.4, by - 3.6, col, 0.9);
        for (sd = -1; sd <= 1; sd += 2) {
          c.save();
          c.translate(bx + sd * 2.6, by - 4); c.rotate(sd * 0.16 + sw * 0.06);
          celPart(c, ellPath(c, 0, -4.4, 1.8, 4.8), col, { rim: false, ink: 1.4, dx: -0.5, dy: -0.6 });
          fillEllipse(c, 0, -4.2, 0.8, 3.3, PAL.pink, false);
          c.restore();
        }
        celPart(c, ellPath(c, bx, by + 0.6, 6, 5.2), col, { dx: -1.1, dy: -1.1 });
        fillEllipse(c, bx, by + 2.3, 2.5, 1.9, mix(col, '#ffffff', 0.6), false);
        fillEllipse(c, bx - 2.2, by - 0.2, 0.75, 0.95, PAL.ink, false);
        fillEllipse(c, bx + 2.2, by - 0.2, 0.75, 0.95, PAL.ink, false);
        glint(c, bx - 2.4, by - 0.5, 0.3, 0.3, 0.9); glint(c, bx + 2, by - 0.5, 0.3, 0.3, 0.9);
        fillEllipse(c, bx, by + 1.5, 0.7, 0.5, PAL.pinkDeep, false);
        c.strokeStyle = PAL.ink; c.lineWidth = 0.35;
        c.beginPath(); c.moveTo(bx, by + 2); c.lineTo(bx, by + 2.7); c.moveTo(bx - 1, by + 3.1); c.quadraticCurveTo(bx - 0.4, by + 3.5, bx, by + 2.7); c.quadraticCurveTo(bx + 0.4, by + 3.5, bx + 1, by + 3.1); c.stroke();
        fillEllipse(c, bx - 3.8, by + 1.6, 1.2, 0.7, 'rgba(255,110,140,0.45)', false);
        fillEllipse(c, bx + 3.8, by + 1.6, 1.2, 0.7, 'rgba(255,110,140,0.45)', false);
        ribbonBow(c, bx + 2.6, by - 4, 1.5, PAL.pinkDeep, false);
        break;
      case 'strawberryBag':
        bagStrap(c, bx - 2, by - 4.4, '#5aa86a', 0.9);
        p = function () { c.beginPath(); c.moveTo(bx, by - 4.6); c.bezierCurveTo(bx + 7, by - 6.4, bx + 8.4, by + 0.6, bx + 3.4, by + 5.4); c.quadraticCurveTo(bx, by + 8.2, bx - 3.4, by + 5.4); c.bezierCurveTo(bx - 8.4, by + 0.6, bx - 7, by - 6.4, bx, by - 4.6); c.closePath(); };
        celPart(c, p, col, { dx: -1.1, dy: -1.1, ink: 1.6 });
        c.save(); p(); c.clip();
        c.fillStyle = tc;
        for (i = 0; i < 9; i++) { c.beginPath(); c.ellipse(bx - 4 + (i % 3) * 4 + (Math.floor(i / 3) % 2) * 1.6 - 0.8, by - 1.6 + Math.floor(i / 3) * 2.9, 0.45, 0.75, 0.2, 0, TAU); c.fill(); }
        c.restore();
        glint(c, bx - 3.4, by - 2.4, 1.4, 0.8, 0.6);
        for (i = -2; i <= 2; i++) leaf(c, bx, by - 4.6, 4.4, i === 0 ? -Math.PI / 2 : i * 0.62 + (i < 0 ? Math.PI : 0), i % 2 ? '#58ad6c' : '#6cc07a');
        fillEllipse(c, bx, by - 4.8, 1, 0.8, '#3f8a52', false);
        break;
      case 'waistBag':
        /* a belt round the waist and a pouch on the near hip */
        celPart(c, bandPath(c, 9.9, bot - 7.2, bot - 4.8, 1.2), dark, { rim: false, ink: 1.2, dx: -0.8, dy: -0.4 });
        p = function () { c.beginPath(); c.moveTo(10.6, bot - 7.6); c.lineTo(-0.6, bot - 7.2); c.quadraticCurveTo(-1.6, bot - 2, 0.4, bot - 0.6); c.quadraticCurveTo(5, bot + 0.6, 9.6, bot - 0.6); c.quadraticCurveTo(11.6, bot - 2.4, 10.6, bot - 7.6); c.closePath(); };
        celPart(c, p, col, { dx: -1, dy: -1, ink: 1.6 });
        if (!LOW) {
          c.beginPath(); c.moveTo(9.6, bot - 5); c.quadraticCurveTo(5, bot - 3.4, 0, bot - 4.8);
          c.strokeStyle = shadowCached(col, 34, false); c.lineWidth = 0.6; c.stroke();
          c.beginPath(); c.moveTo(9.6, bot - 5); c.quadraticCurveTo(5, bot - 3.4, 0, bot - 4.8);
          stitch(c, tc, 0.3);
        }
        jewel(c, 5 - MOTION.skirt * 0.2, bot - 3, 1.3, PAL.sun, 'heart');
        glint(c, 2.2, bot - 6.4, 1.2, 0.5, 0.6);
        clasp(c, -6.4, bot - 6, 2.2, 2.4);
        break;
    }
  }
  /* Things held in the near hand (ground space, hand = {x, y, a}). */
  var HELD_BAGS = { tote: 1, basket: 1, balloon: 1, bouquet: 1, handbag: 1, shoppingBags: 1 };
  function drawHeldBag(c, cust, hand) {
    var bag = cust.bag;
    if (!HELD_BAGS[bag]) return;
    var col = cust.bagColor, dark = shade(col, -24), tc = trimOf(col);
    var hx = hand.x, hy = hand.y + 1.6, sw = -MOTION.skirt * 0.5;
    var i, p, x = hx + sw;
    c.lineCap = 'round';
    switch (bag) {
      case 'tote':
        for (i = 0; i < 2; i++) {
          c.beginPath(); c.moveTo(hx - 1.2, hy); c.quadraticCurveTo(x - 3.6, hy + 2.6, x - 3.6, hy + 6); c.moveTo(hx + 1.2, hy); c.quadraticCurveTo(x + 3.6, hy + 2.6, x + 3.6, hy + 6);
          c.strokeStyle = i ? dark : inkColor(col); c.lineWidth = i ? 0.9 : 1.6; c.stroke();
        }
        p = polyPath(c, [[x - 6.4, hy + 5], [x + 6.4, hy + 5], [x + 5.6, hy + 16.4], [x - 5.6, hy + 16.4]]);
        celPart(c, p, col, { dx: -1.1, dy: -1.1 });
        c.save(); p(); c.clip();
        c.fillStyle = tc; c.fillRect(x - 7, hy + 12.4, 14, 5);
        c.fillStyle = 'rgba(60,20,80,0.12)'; c.fillRect(x + 2.4, hy + 5, 5, 12);
        c.restore();
        p(); c.fillStyle = col; ink(c, 2);
        if (!LOW) { c.beginPath(); c.moveTo(x - 5.8, hy + 6.4); c.lineTo(x + 5.8, hy + 6.4); stitch(c, tc, 0.35); }
        flower(c, x - 0.4, hy + 9.4, 2.4, tc, col);
        break;
      case 'basket':
        /* handle, the goodies, then the woven body */
        for (i = 0; i < 2; i++) {
          c.beginPath(); c.arc(x, hy + 7, 5.6, Math.PI * 1.03, Math.PI * 1.97);
          c.strokeStyle = i ? col : inkColor(col); c.lineWidth = i ? 1.3 : 2.1; c.stroke();
        }
        flower(c, x - 2.6, hy + 4.4, 2, PAL.pink);
        flower(c, x + 2.4, hy + 4, 2, PAL.cream, PAL.pink);
        celPart(c, ellPath(c, x + 0.2, hy + 5.2, 1.9, 1.9), '#ff6a6a', { rim: false, ink: 1.1, dx: -0.4, dy: -0.4 });
        leaf(c, x + 0.2, hy + 3.6, 1.8, -1.2, '#6cc07a');
        p = function () { c.beginPath(); c.moveTo(x - 6.6, hy + 6.4); c.lineTo(x + 6.6, hy + 6.4); c.quadraticCurveTo(x + 6.6, hy + 13.4, x + 4.4, hy + 14.4); c.lineTo(x - 4.4, hy + 14.4); c.quadraticCurveTo(x - 6.6, hy + 13.4, x - 6.6, hy + 6.4); c.closePath(); };
        celPart(c, p, col, { dx: -1, dy: -1 });
        if (!LOW) {
          c.save(); p(); c.clip();
          /* wicker: rows of short staggered weaves */
          c.strokeStyle = shadowCached(col, 30, false); c.lineWidth = 0.45; c.globalAlpha = 0.8;
          c.beginPath();
          for (var row = 0; row < 4; row++) for (i = -4; i <= 4; i++) { var wx = x + i * 1.9 + (row % 2) * 0.95, wy = hy + 8.4 + row * 1.9; c.moveTo(wx - 0.7, wy); c.quadraticCurveTo(wx, wy - 0.9, wx + 0.7, wy); }
          c.stroke();
          c.restore();
        }
        celPart(c, rrPath(c, x - 7.2, hy + 5.6, 14.4, 2.2, 1.1), shade(col, 14), { rim: false, ink: 1.3, dx: -0.6, dy: -0.3 });
        break;
      case 'balloon':
        /* a heart balloon riding high beside her, lagging as she moves */
        var bxx = hx - 12 + MOTION.hairA * 44 + Math.sin(MOTION.t * 1.3) * 1.2, byy = hand.y - 46 + Math.sin(MOTION.t * 1.9) * 0.8 + MOTION.lag * 0.8;
        c.strokeStyle = 'rgba(90,60,90,0.85)'; c.lineWidth = 0.4;
        c.beginPath(); c.moveTo(hx, hand.y); c.bezierCurveTo(hx - 3, hand.y - 12, bxx + 4, byy + 22, bxx, byy + 9.4); c.stroke();
        p = function () { heartPath(c, bxx, byy, 8.4); };
        celPart(c, p, col, { dx: -1.6, dy: -1.6, ink: 1.5 });
        if (!LOW) {
          c.save(); p(); c.clip();
          var g = c.createRadialGradient(bxx - 3, byy - 3.4, 0.5, bxx, byy, 10);
          g.addColorStop(0, 'rgba(255,255,255,0.6)'); g.addColorStop(0.4, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(60,10,60,0.16)');
          c.fillStyle = g; c.fillRect(bxx - 12, byy - 12, 24, 24);
          c.restore();
          c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 0.9;
          c.beginPath(); c.arc(bxx - 3.4, byy - 2.4, 2.6, Math.PI * 1.05, Math.PI * 1.55); c.stroke();
        }
        celPart(c, polyPath(c, [[bxx - 1.1, byy + 9.6], [bxx + 1.1, byy + 9.6], [bxx, byy + 7.4]]), dark, { rim: false, ink: 1 });
        sparkle(c, bxx + 6.6, byy - 6.4, 2.2, 3);
        break;
      case 'bouquet':
        leaf(c, hx - 2.4, hy - 3, 5.4, -2.1, '#58ad6c');
        leaf(c, hx + 2.4, hy - 3, 5.4, -1.0, '#58ad6c');
        flower(c, hx - 3.6, hy - 6, 2.6, PAL.pink);
        flower(c, hx + 3.4, hy - 6.6, 2.6, PAL.cream, PAL.pink);
        flower(c, hx, hy - 9.4, 2.9, col);
        flower(c, hx - 0.2, hy - 5, 2.2, tc, PAL.sun);
        /* a paper cone, its lace edge folded back, tied with a bow */
        p = polyPath(c, [[hx - 5.6, hy - 4.4], [hx + 5.6, hy - 4.4], [hx + 1, hy + 6.4], [hx - 1, hy + 6.4]]);
        celPart(c, p, '#fff4f8', { dx: -0.9, dy: -0.8, ink: 1.5 });
        celPart(c, polyPath(c, [[hx - 5.6, hy - 4.4], [hx - 0.4, hy - 4.4], [hx - 3.4, hy - 0.4]]), mix(col, '#ffffff', 0.55), { rim: false, ink: 1.1, dx: -0.3, dy: -0.3 });
        ribbonBow(c, hx, hy + 1.6, 1.9, col, true);
        break;
      case 'handbag':
        /* a top handle, a scarf knotted to it, a structured body */
        for (i = 0; i < 2; i++) {
          c.beginPath(); c.moveTo(x - 3.6, hy + 7); c.bezierCurveTo(x - 4, hy + 0.4, x + 4, hy + 0.4, x + 3.6, hy + 7);
          c.strokeStyle = i ? dark : inkColor(col); c.lineWidth = i ? 1.2 : 2; c.stroke();
        }
        p = function () { c.beginPath(); c.moveTo(x - 5.6, hy + 6.4); c.lineTo(x + 5.6, hy + 6.4); c.quadraticCurveTo(x + 8.2, hy + 11, x + 7, hy + 15.6); c.lineTo(x - 7, hy + 15.6); c.quadraticCurveTo(x - 8.2, hy + 11, x - 5.6, hy + 6.4); c.closePath(); };
        celPart(c, p, col, { dx: -1.1, dy: -1.1 });
        p = function () { c.beginPath(); c.moveTo(x - 5.8, hy + 6.2); c.lineTo(x + 5.8, hy + 6.2); c.quadraticCurveTo(x + 7, hy + 8.4, x + 6.6, hy + 9.6); c.quadraticCurveTo(x, hy + 12.6, x - 6.6, hy + 9.6); c.quadraticCurveTo(x - 7, hy + 8.4, x - 5.8, hy + 6.2); c.closePath(); };
        celPart(c, p, shade(col, 12), { rim: false, ink: 1.4, dx: -0.8, dy: -0.5 });
        if (!LOW) { c.beginPath(); c.moveTo(x - 6.2, hy + 14.4); c.lineTo(x + 6.2, hy + 14.4); stitch(c, tc, 0.35); }
        clasp(c, x, hy + 10.6, 2.6, 2);
        sheen(c, x - 4.6, hy + 7.6, x - 1.6, hy + 7.4, 0.5, 0.6);
        ribbonBow(c, x - 3.6, hy + 6.2, 1.7, tc, true);
        break;
      case 'shoppingBags':
        /* two boutique bags, tissue paper peeking out of the front one */
        for (i = 0; i < 2; i++) {
          var sx = x + (i ? -3.4 : 3.6), sy2 = hy + (i ? 6.4 : 5), sc = i ? col : tc, sw2 = i ? 5.4 : 4.6, sh = i ? 10.4 : 10;
          c.strokeStyle = inkColor(sc); c.lineWidth = 0.6;
          c.beginPath(); c.moveTo(hx - 0.6, hy + 0.4); c.quadraticCurveTo(sx - 2.6, hy + 2, sx - 2.2, sy2 + 0.4); c.moveTo(hx + 0.6, hy + 0.4); c.quadraticCurveTo(sx + 2.6, hy + 2, sx + 2.2, sy2 + 0.4); c.stroke();
          if (i) {
            celPart(c, polyPath(c, [[sx - 3.4, sy2 + 0.6], [sx - 1.4, sy2 - 2.6], [sx, sy2 - 0.4], [sx + 1.8, sy2 - 2.8], [sx + 3.4, sy2 + 0.6]]), '#fff4f8', { rim: false, ink: 1, dx: -0.3, dy: -0.3 });
          }
          p = polyPath(c, [[sx - sw2, sy2], [sx + sw2, sy2], [sx + sw2 - 0.5, sy2 + sh], [sx - sw2 + 0.5, sy2 + sh]]);
          celPart(c, p, sc, { dx: -1, dy: -0.9, ink: 1.5 });
          c.save(); p(); c.clip();
          c.fillStyle = 'rgba(60,20,80,0.14)'; c.fillRect(sx + sw2 - 2.2, sy2, 3, sh);
          c.fillStyle = i ? tc : col; c.fillRect(sx - sw2, sy2 + sh - 2.6, sw2 * 2, 1.1);
          c.restore();
          if (i) heart(c, sx - 0.4, sy2 + 4.6, 2, tc, false);
          else { c.fillStyle = col; star(c, sx - 0.2, sy2 + 4.4, 1.9); }
        }
        break;
    }
  }

  /* ---- Accessories ---- */
  var HELD_ACCS = { wand: 1, parasol: 1, teddy: 1, lollipop: 1 };
  function drawHeldAcc(c, cust, hand) {
    var acc = cust.accessory;
    if (!HELD_ACCS[acc]) return;
    var col = cust.accColor, tc = trimOf(col);
    var hx = hand.x, hy = hand.y, i, p;
    c.lineCap = 'round';
    if (acc === 'wand') {
      c.save();
      c.translate(hx, hy); c.rotate(-0.52 + MOTION.hairA * 0.8);
      /* ribbons streaming from under the star */
      var rs = -MOTION.skirt * 0.8 + MOTION.hairA * 8;
      for (i = 0; i < 2; i++) {
        c.beginPath(); c.moveTo(0, -15.4); c.bezierCurveTo(3 + i * 2 + rs * 0.3, -12, 1.6 + i * 3 + rs * 0.7, -8, 4.4 + i * 2.6 + rs, -4.4 + i);
        c.strokeStyle = i ? tc : PAL.pink; c.lineWidth = 0.9; c.stroke();
      }
      /* a candy-striped handle with gold caps */
      p = rrPath(c, -0.95, -16, 1.9, 19, 0.95);
      celPart(c, p, '#fffaf4', { rim: false, ink: 1.2, dx: -0.4, dy: 0 });
      c.save(); p(); c.clip();
      c.strokeStyle = col; c.lineWidth = 0.9;
      c.beginPath(); for (i = 0; i < 8; i++) { c.moveTo(-1.6, -14 + i * 2.4); c.lineTo(1.6, -15.4 + i * 2.4); } c.stroke();
      c.restore();
      clasp(c, 0, 2.4, 2.6, 1.5);
      clasp(c, 0, -15.6, 2.6, 1.5);
      /* the star: a puffed gold-edged star with a jewel heart */
      c.lineJoin = 'round';
      p = function () { c.beginPath(); for (var q = 0; q < 10; q++) { var a = (Math.PI / 5) * q - Math.PI / 2, rad = q % 2 === 0 ? 6.2 : 3.1; c.lineTo(Math.cos(a) * rad, -20.4 + Math.sin(a) * rad); } c.closePath(); };
      celPart(c, p, col, { dx: -0.9, dy: -0.9, ink: 1.7 });
      if (!LOW) {
        c.save(); p(); c.clip();
        c.globalAlpha = 0.5; c.fillStyle = '#ffffff';
        c.beginPath(); c.moveTo(0, -27); c.lineTo(-6.4, -22.4); c.lineTo(-1.4, -20.6); c.closePath(); c.fill();
        c.restore();
      }
      jewel(c, 0, -20.2, 1.9, tc, 'heart');
      c.restore();
      var a0 = -0.52 + MOTION.hairA * 0.8, sxx = hx + Math.sin(a0) * 20.4, syy = hy - Math.cos(a0) * 20.4;
      sparkle(c, sxx + 7, syy - 5, 2.6, 1);
      sparkle(c, sxx - 6.4, syy - 2, 1.8, 3);
      sparkle(c, sxx + 3.4, syy + 6, 1.5, 5);
    } else if (acc === 'parasol') {
      c.save();
      c.translate(hx, hy); c.rotate(-0.72 + MOTION.hairA * 0.8);
      c.strokeStyle = inkColor('#c98a5e'); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(0, 2.4); c.lineTo(0, -26); c.stroke();
      c.strokeStyle = '#d9a274'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(0, 2.4); c.lineTo(0, -26); c.stroke();
      for (i = 0; i < 2; i++) { c.beginPath(); c.arc(1.5, 2.6, 1.5, Math.PI, 0.15, true); c.strokeStyle = i ? '#d9a274' : inkColor('#c98a5e'); c.lineWidth = i ? 0.8 : 1.5; c.stroke(); }
      /* the canopy: six gores, alternating colour and trim, a lace edge */
      var cy = -21, R = 14.5, top = -34.5;
      var canopy = function () {
        c.beginPath();
        c.moveTo(-R, cy);
        c.bezierCurveTo(-R + 0.6, top + 4, -5, top, 0, top);
        c.bezierCurveTo(5, top, R - 0.6, top + 4, R, cy);
        for (var q = 0; q < 6; q++) c.quadraticCurveTo(R - (q + 0.5) * (R / 3), cy - 2.6, R - (q + 1) * (R / 3), cy);
        c.closePath();
      };
      celPart(c, canopy, col, { dx: -1.6, dy: -1.2 });
      c.save(); canopy(); c.clip();
      c.fillStyle = tc;
      for (i = -1; i <= 1; i++) {
        c.beginPath(); c.moveTo(0, top);
        c.quadraticCurveTo((i * 2 - 0.5) * (R / 3) * 0.86, top + 6, (i * 2 - 0.5) * (R / 3) - R / 6, cy + 1);
        c.lineTo((i * 2 + 0.5) * (R / 3) - R / 6, cy + 1);
        c.quadraticCurveTo((i * 2 + 0.5) * (R / 3) * 0.86, top + 6, 0, top);
        c.closePath(); c.fill();
      }
      if (!LOW) {
        c.strokeStyle = shadowCached(col, 30, false); c.lineWidth = 0.35; c.globalAlpha = 0.8;
        c.beginPath();
        for (i = -2; i <= 2; i++) { c.moveTo(0, top); c.quadraticCurveTo(i * (R / 3) * 0.9, top + 6, i * (R / 3), cy - 0.4); }
        c.stroke();
        c.globalAlpha = 0.35; c.fillStyle = '#ffffff';
        c.beginPath(); c.ellipse(-6, top + 5.4, 4.4, 1.9, -0.5, 0, TAU); c.fill();
        c.globalAlpha = 0.16; c.fillStyle = '#2a1030'; c.fillRect(R * 0.4, top, R, 16);
      }
      c.restore();
      canopy(); c.fillStyle = col; ink(c, 2);
      if (!LOW) {
        c.fillStyle = '#ffffff';
        for (i = 0; i < 6; i++) { c.beginPath(); c.arc(R - (i + 0.5) * (R / 3), cy - 0.6, 0.55, 0, TAU); c.fill(); }
      }
      jewel(c, 0, top - 1, 1.3, '#f6c343', 'round');
      c.restore();
    } else if (acc === 'teddy') {
      /* a plush bear dangling from her hand by one paw */
      var sw = -MOTION.skirt * 0.6, bx = hx - 0.6 + sw, by = hy + 8.4;
      var fur = col, muzzle = mix(col, '#fff8ee', 0.72);
      c.save();
      c.translate(hx, hy); c.rotate(sw * 0.05); c.scale(1.25, 1.25); c.translate(-hx, -hy);
      celPart(c, function () { limbPath(c, hx, hy + 0.6, 1.2, hx + 0.6, hy + 3, 1.4, bx + 2.4, by - 2.6, 1.6, 0, 0); }, fur, { rim: false, ink: 1.3, dx: -0.4, dy: -0.3 });
      celPart(c, ellPath(c, bx - 2.2, by + 6.6, 1.8, 1.6), fur, { rim: false, ink: 1.3, dx: -0.4, dy: -0.4 });
      celPart(c, ellPath(c, bx + 2.2, by + 6.6, 1.8, 1.6), fur, { rim: false, ink: 1.3, dx: -0.4, dy: -0.4 });
      celPart(c, ellPath(c, bx, by + 3.4, 3.4, 3.8), fur, { dx: -0.8, dy: -0.8, ink: 1.5 });
      fillEllipse(c, bx, by + 4, 2, 2.3, muzzle, false);
      celPart(c, ellPath(c, bx - 3.4, by + 2, 1.3, 1.9), fur, { rim: false, ink: 1.3, dx: -0.4, dy: -0.4 });
      for (i = -1; i <= 1; i += 2) {
        celPart(c, ellPath(c, bx + i * 3, by - 5.4, 1.7, 1.7), fur, { rim: false, ink: 1.3, dx: -0.4, dy: -0.4 });
        fillEllipse(c, bx + i * 3, by - 5.2, 0.85, 0.85, muzzle, false);
      }
      celPart(c, ellPath(c, bx, by - 2.4, 4.1, 3.7), fur, { dx: -0.9, dy: -0.9, ink: 1.5 });
      fillEllipse(c, bx, by - 1.2, 1.9, 1.4, muzzle, false);
      fillEllipse(c, bx - 1.7, by - 2.9, 0.5, 0.6, PAL.ink, false);
      fillEllipse(c, bx + 1.7, by - 2.9, 0.5, 0.6, PAL.ink, false);
      fillEllipse(c, bx, by - 1.7, 0.65, 0.45, PAL.ink, false);
      c.strokeStyle = PAL.ink; c.lineWidth = 0.3;
      c.beginPath(); c.moveTo(bx, by - 1.3); c.lineTo(bx, by - 0.8); c.moveTo(bx - 0.8, by - 0.5); c.quadraticCurveTo(bx, by - 0.1, bx + 0.8, by - 0.5); c.stroke();
      fillEllipse(c, bx - 2.6, by - 1.3, 0.8, 0.5, 'rgba(255,110,140,0.45)', false);
      fillEllipse(c, bx + 2.6, by - 1.3, 0.8, 0.5, 'rgba(255,110,140,0.45)', false);
      ribbonBow(c, bx, by + 0.8, 1.5, PAL.pinkDeep, false);
      c.restore();
    } else if (acc === 'lollipop') {
      c.save();
      c.translate(hx, hy); c.rotate(-0.3 + MOTION.hairA * 0.6);
      celPart(c, rrPath(c, -0.6, -11, 1.2, 14, 0.6), '#fffaf4', { rim: false, ink: 1.1, dx: -0.3, dy: 0 });
      var disc = ellPath(c, 0, -15.4, 6, 6);
      celPart(c, disc, col, { dx: -1.1, dy: -1.1, ink: 1.6 });
      c.save(); disc(); c.clip();
      /* a spiral of trim wound to the centre */
      c.strokeStyle = tc; c.lineWidth = 1.5;
      c.beginPath();
      for (i = 0; i <= 44; i++) { var a = i * 0.36, rr = 6.4 - i * 0.14; var px = Math.cos(a) * rr, py = -15.4 + Math.sin(a) * rr; if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); }
      c.stroke();
      if (!LOW) {
        var g = c.createRadialGradient(-2.2, -17.8, 0.4, 0, -15.4, 6.4);
        g.addColorStop(0, 'rgba(255,255,255,0.65)'); g.addColorStop(0.35, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(60,10,60,0.18)');
        c.fillStyle = g; c.fillRect(-7, -22, 14, 14);
      }
      c.restore();
      disc(); c.fillStyle = col; ink(c, 1.6);
      ribbonBow(c, 0, -8.6, 1.5, PAL.pinkDeep, false);
      c.restore();
    }
  }
  function drawHeld(c, cust, hand) {
    drawHeldBag(c, cust, hand);
    drawHeldAcc(c, cust, hand);
  }

  /* Things on her back: wings and a tail. Drawn over the back hair so
     long styles cannot hide them, and under her body. */
  function wingVeins(c, pts, col) {
    if (LOW) return;
    c.strokeStyle = col; c.lineWidth = 0.35; c.lineCap = 'round';
    c.beginPath();
    for (var i = 0; i < pts.length; i++) { c.moveTo(pts[i][0], pts[i][1]); c.quadraticCurveTo(pts[i][2], pts[i][3], pts[i][4], pts[i][5]); }
    c.stroke();
  }
  function drawAccessoryBack(c, cust) {
    var acc = cust.accessory;
    var col = cust.accColor, tc = trimOf(col), top = CH.torsoTop, bot = CH.torsoBot;
    var sd, i;
    if (acc === 'kittyTail') {
      /* a tail that sways from the base of her back, a bow near its tip */
      var sw = Math.sin(MOTION.t * 2.2) * 1.6 + MOTION.hairA * 14 - MOTION.skirt * 0.8;
      var tail = function () {
        c.beginPath();
        c.moveTo(-3, bot - 0.6);
        c.bezierCurveTo(-15, bot + 8, -26 + sw * 0.4, bot + 1, -23.6 + sw, bot - 13);
        c.bezierCurveTo(-23 + sw, bot - 19, -17.6 + sw, bot - 19.4, -18.4 + sw, bot - 13.6);
        c.bezierCurveTo(-20 + sw * 0.4, bot - 3, -14, bot + 2, -3, bot - 5);
        c.closePath();
      };
      celPart(c, tail, col, { dx: -0.9, dy: -1, ink: 1.8 });
      c.save(); tail(); c.clip();
      c.fillStyle = tc; c.beginPath(); c.ellipse(-20.6 + sw, bot - 17, 4.4, 3.6, 0, 0, TAU); c.fill();
      if (!LOW) {
        c.strokeStyle = shadowCached(col, 28, false); c.lineWidth = 0.5; c.lineCap = 'round'; c.globalAlpha = 0.7;
        c.beginPath();
        for (i = 0; i < 3; i++) { c.moveTo(-22.6 + sw * 0.7, bot - 4 - i * 3); c.lineTo(-20.6 + sw * 0.7, bot - 4.6 - i * 3); }
        c.stroke();
      }
      c.restore();
      tail(); c.fillStyle = col; ink(c, 1.8);
      ribbonBow(c, -21 + sw * 0.85, bot - 8.4, 2.1, PAL.pinkDeep, true);
      return;
    }
    if (acc !== 'wings' && acc !== 'butterfly' && acc !== 'angelWings') return;
    var flap = 1 - 0.16 * (0.5 + 0.5 * Math.sin(MOTION.t * (acc === 'butterfly' ? 7 : acc === 'angelWings' ? 3 : 4.6)));
    var ox = -MOTION.yaw * 3;
    for (sd = -1; sd <= 1; sd += 2) {
      (function (sd) {
        var up, low;
        c.save();
        c.translate(sd * 2.4 + ox, top + 5);
        c.scale(flap * (sd < 0 ? 1 + MOTION.yaw * 0.12 : 1 - MOTION.yaw * 0.3), 1);
        if (acc === 'wings') {
          /* dragonfly-fine fairy wings: clear at the root, tinted at the tip */
          up = function () { c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(sd * 6, -17, sd * 23, -27, sd * 28, -16); c.bezierCurveTo(sd * 30, -8, sd * 16, 0, 0, 2); c.closePath(); };
          low = function () { c.beginPath(); c.moveTo(0, 1.6); c.bezierCurveTo(sd * 14, 2, sd * 24, 9, sd * 20, 17); c.bezierCurveTo(sd * 14, 23, sd * 4, 12, 0, 4); c.closePath(); };
          c.globalAlpha = 0.9;
          celPart(c, low, mix(col, '#ffffff', 0.35), { dx: -1, dy: -1, ink: 1.5 });
          celPart(c, up, mix(col, '#ffffff', 0.2), { dx: -1.2, dy: -1.2, ink: 1.6 });
          c.globalAlpha = 1;
          if (!LOW) {
            c.save(); up(); c.clip();
            var g = c.createLinearGradient(0, 0, sd * 26, -18);
            g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(0.55, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0)');
            c.fillStyle = g; c.fillRect(-32, -30, 64, 34);
            c.restore();
          }
          wingVeins(c, [[0, 0, sd * 10, -12, sd * 25, -17], [0, 0.6, sd * 12, -6, sd * 25, -10], [sd * 9, -7.6, sd * 14, -14, sd * 19, -22], [0, 2.4, sd * 10, 6, sd * 18, 15], [sd * 7, 5, sd * 12, 6, sd * 20, 10]], shadowCached(col, 34, false));
          if (sd < 0) { sparkle(c, sd * 21, -19, 2.4, 1); sparkle(c, sd * 15, 12, 1.7, 4); } else sparkle(c, sd * 24, -8, 2, 2);
        } else if (acc === 'butterfly') {
          up = function () { c.beginPath(); c.moveTo(0, -0.6); c.bezierCurveTo(sd * 4, -20, sd * 26, -26, sd * 27, -11); c.bezierCurveTo(sd * 27, -3, sd * 14, 2, 0, 1.6); c.closePath(); };
          low = function () { c.beginPath(); c.moveTo(0, 1); c.bezierCurveTo(sd * 14, 1, sd * 22, 8, sd * 17, 15); c.quadraticCurveTo(sd * 15, 21, sd * 11, 16.4); c.bezierCurveTo(sd * 6, 15, sd * 2, 9, 0, 3); c.closePath(); };
          celPart(c, low, shade(col, -14), { dx: -1, dy: -1, ink: 1.6 });
          celPart(c, up, shade(col, -14), { dx: -1.2, dy: -1.2, ink: 1.7 });
          /* bright panels inside a dark border, like stained glass */
          c.save(); up(); c.clip();
          c.fillStyle = col;
          c.beginPath(); c.moveTo(sd * 1.6, -1); c.bezierCurveTo(sd * 5, -15, sd * 21, -21, sd * 23.4, -11.6); c.bezierCurveTo(sd * 23, -5, sd * 12, 0, sd * 1.6, 0.4); c.closePath(); c.fill();
          c.fillStyle = mix(col, '#ffffff', 0.45);
          c.beginPath(); c.ellipse(sd * 11, -8, 6.4, 3.6, -sd * 0.5, 0, TAU); c.fill();
          c.fillStyle = tc;
          for (i = 0; i < 4; i++) { c.beginPath(); c.arc(sd * (23.4 - i * 1.2), -17 + i * 4.2, 1.05, 0, TAU); c.fill(); }
          c.restore();
          c.save(); low(); c.clip();
          c.fillStyle = col;
          c.beginPath(); c.ellipse(sd * 10.6, 8.4, 6.6, 4.4, sd * 0.6, 0, TAU); c.fill();
          c.fillStyle = tc; c.beginPath(); c.arc(sd * 13.6, 14.6, 1.1, 0, TAU); c.fill();
          c.restore();
          wingVeins(c, [[sd * 1, -1, sd * 8, -10, sd * 19, -16], [sd * 1, 0, sd * 10, -3, sd * 21, -7], [sd * 1, 2, sd * 8, 6, sd * 14, 12]], shadowCached(col, 44, false));
        } else {
          /* feathered: three tiers of soft white feathers, tinted in shade */
          var white = mix('#ffffff', col, 0.14);
          var tier = function (n, wx, wy, tx, ty) {
            return function () {
              c.beginPath();
              c.moveTo(0, -2);
              /* over the top to the wrist, down the long outer feathers to
                 the tip, then back along the feather ends to the root */
              c.bezierCurveTo(sd * wx * 0.2, wy - 6, sd * wx * 0.8, wy - 5, sd * wx, wy);
              c.quadraticCurveTo(sd * (wx + 3.4), (wy + ty) / 2, sd * tx, ty);
              var px = sd * tx, py = ty;
              for (var q = 1; q <= n; q++) {
                var u = q / n;
                var nx = sd * tx * (1 - u), ny = ty + (4.5 - ty) * u * u;
                c.quadraticCurveTo((px + nx) / 2 + sd * 1.6, (py + ny) / 2 + 4.2, nx, ny);
                px = nx; py = ny;
              }
              c.closePath();
            };
          };
          celPart(c, tier(5, 23, -15, 26, 12), mix('#ffffff', col, 0.3), { dx: -1.2, dy: -1.4, ink: 1.7 });
          celPart(c, tier(4, 17, -12, 19, 5), mix('#ffffff', col, 0.12), { dx: -1.1, dy: -1.3, ink: 1.4 });
          celPart(c, tier(3, 10.5, -9, 12, 0.5), '#ffffff', { dx: -0.9, dy: -1, ink: 1.3 });
          if (sd < 0) sparkle(c, sd * 22, -22, 2.2, 2);
        }
        c.restore();
      })(sd);
    }
  }
  /* round the neck, on the chest below the chin */
  function drawAccessoryNeck(c, cust) {
    var col = cust.accColor, tc = trimOf(col), top = CH.torsoTop, i, sd;
    var sw = -MOTION.skirt * 0.25;
    var gold = '#f6c343';
    var chain = function (dip) {
      c.beginPath(); c.moveTo(-6, top + 1.4); c.quadraticCurveTo(-3, top + dip, sw, top + dip + 0.6); c.quadraticCurveTo(3, top + dip, 6, top + 1.4);
      c.strokeStyle = '#b8801a'; c.lineWidth = 0.75; c.lineCap = 'round'; c.stroke();
      c.beginPath(); c.moveTo(-6, top + 1.4); c.quadraticCurveTo(-3, top + dip, sw, top + dip + 0.6); c.quadraticCurveTo(3, top + dip, 6, top + 1.4);
      c.strokeStyle = '#ffe27a'; c.lineWidth = 0.4; c.setLineDash([0.6, 0.6]); c.stroke(); c.setLineDash([]);
    };
    switch (cust.accessory) {
      case 'necklace':
        chain(6.4);
        for (i = -2; i <= 2; i++) if (i) jewel(c, i * 2.3 + sw * (1 - Math.abs(i) / 3), top + 5.6 - Math.abs(i) * 1.1, 1.05, i % 2 ? tc : col, 'round');
        jewel(c, sw, top + 8.2, 2.1, col, 'drop');
        sparkle(c, 2.8 + sw, top + 6.4, 1.6, 2);
        break;
      case 'pearls':
        for (i = -5; i <= 5; i++) pearl(c, i * 1.25, top + 6 - i * i * 0.17, 0.95);
        for (i = -4; i <= 4; i++) if (i) pearl(c, i * 1.5 + sw * 0.6, top + 9.8 - i * i * 0.36, 0.85);
        jewel(c, sw, top + 10.2, 1.7, col, 'round');
        break;
      case 'locket':
        chain(7.4);
        var lx = sw * 2.5, ly = top + 10;
        celPart(c, function () { heartPath(c, lx, ly, 3.2); }, gold, { dx: -0.6, dy: -0.6, ink: 1.3, rim: false, s: 1.3 });
        if (!LOW) { c.strokeStyle = '#b8801a'; c.lineWidth = 0.3; heartPath(c, lx, ly, 2.3); c.stroke(); }
        jewel(c, lx, ly - 0.2, 1.15, col, 'heart');
        sheen(c, lx - 2.2, ly - 1.4, lx - 1, ly - 2.3, 0.45, 0.9);
        break;
      case 'bowTie':
        /* little collar points to sit on, then the bow */
        for (sd = -1; sd <= 1; sd += 2) celPart(c, polyPath(c, [[sd * 0.4, top + 2.2], [sd * 7, top + 2.4], [sd * 4.4, top + 6.6]]), '#fffaf4', { rim: false, ink: 1.2, dx: -0.4, dy: -0.4 });
        bigBowAt(c, 0, top + 5.2, 2.9, col, false);
        break;
      case 'flowerLei':
        var cols = [col, PAL.cream, PAL.pink, tc];
        var lp = function (j) { var a = j * 0.42; return [Math.sin(a) * 6.6 + sw * Math.cos(a), top + 1.6 + Math.cos(a) * 10.4]; };
        for (i = -7; i <= 7; i++) { var lq = lp(i * 0.5); leaf(c, lq[0], lq[1], 2.8, i % 2 ? 0.7 : 2.4, '#6cc07a'); }
        for (i = 3; i >= 0; i--) {
          for (sd = -1; sd <= 1; sd += 2) {
            if (!i && sd > 0) continue;
            var fq = lp(i * sd);
            flower(c, fq[0], fq[1], i ? 2.5 : 2.9, cols[(i * 2 + (sd > 0 ? 1 : 0)) % 4], i % 2 ? PAL.pinkDeep : PAL.sun);
          }
        }
        break;
    }
  }
  /* A scarf goes on last of all, over her chin. */
  function drawAccessoryOver(c, cust) {
    if (cust.accessory !== 'scarf') return;
    var col = cust.accColor, tc = trimOf(col), top = CH.torsoTop, i;
    var sw = -MOTION.skirt * 0.5 + MOTION.hairA * 6;
    /* the tails hang from a knot on the near side */
    for (i = 1; i >= 0; i--) {
      (function (i) {
        var x0 = -7.4 + i * 2.6, len = i ? 12.4 : 15, tail = function () {
          c.beginPath();
          c.moveTo(x0 - 1.4, top + 2.6);
          c.lineTo(x0 + 2.6, top + 2.6);
          c.quadraticCurveTo(x0 + 3.2 + sw * 0.4, top + len * 0.6, x0 + 2.8 + sw, top + len);
          c.lineTo(x0 - 2 + sw, top + len);
          c.quadraticCurveTo(x0 - 2 + sw * 0.4, top + len * 0.6, x0 - 1.4, top + 2.6);
          c.closePath();
        };
        celPart(c, tail, i ? shade(col, -8) : col, { dx: -0.8, dy: -0.6, ink: 1.6 });
        c.save(); tail(); c.clip();
        c.fillStyle = tc; c.fillRect(x0 - 4 + sw, top + len - 4.4, 9, 1.5);
        c.restore();
        if (!LOW) {
          c.strokeStyle = inkColor(col); c.lineWidth = 0.5; c.lineCap = 'round';
          c.beginPath();
          for (var f = 0; f < 5; f++) { c.moveTo(x0 - 1.6 + f * 1.05 + sw, top + len); c.lineTo(x0 - 1.8 + f * 1.05 + sw * 1.1, top + len + 1.7); }
          c.stroke();
        }
      })(i);
    }
    var wrap = function () {
      c.beginPath();
      c.moveTo(-10.8, top - 0.6);
      c.quadraticCurveTo(-11.6, top + 2.4, -9.4, top + 4.6);
      c.quadraticCurveTo(0, top + 7.4, 9.4, top + 4.6);
      c.quadraticCurveTo(11.6, top + 2.4, 10.8, top - 0.6);
      c.quadraticCurveTo(0, top + 2.2, -10.8, top - 0.6);
      c.closePath();
    };
    celPart(c, wrap, col, { dx: -1.2, dy: -1 });
    c.save(); wrap(); c.clip();
    c.fillStyle = tc; c.globalAlpha = 0.95;
    for (i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 3.6 - 0.9, top - 2); c.lineTo(i * 3.6 + 0.9, top - 2); c.lineTo(i * 3.9 + 0.9, top + 8); c.lineTo(i * 3.9 - 0.9, top + 8); c.closePath(); c.fill(); }
    if (!LOW) {
      c.globalAlpha = 0.5; c.strokeStyle = shadowCached(col, 30, false); c.lineWidth = 0.4;
      c.beginPath(); c.moveTo(-10, top + 2.4); c.quadraticCurveTo(0, top + 5.2, 10, top + 2.4); c.stroke();
    }
    c.restore();
    wrap(); c.fillStyle = col; ink(c, 2);
    celPart(c, rrPath(c, -8.6, top + 0.6, 4.6, 4.4, 1.6), shade(col, -6), { rim: false, ink: 1.5, dx: -0.5, dy: -0.5 });
  }
  /* bangles ride each wrist */
  function drawBangles(c, cust, A) {
    var col = A.near ? cust.accColor : shadowCached(cust.accColor, 8, false);
    var fa = Math.atan2(A.wy - A.ey, A.wx - A.ex), i;
    for (i = 0; i < 2; i++) {
      c.save();
      c.translate(lerp(A.ex, A.wx, 0.74 + i * 0.2), lerp(A.ey, A.wy, 0.74 + i * 0.2));
      c.rotate(fa - Math.PI / 2);
      celPart(c, rrPath(c, -ARM.rWr - 0.75, -0.75, (ARM.rWr + 0.75) * 2, 1.5, 0.75), i ? '#f6c343' : col, { rim: false, ink: 1.2, dx: -0.4, dy: -0.2, s: 1.3 });
      if (!LOW) glint(c, -0.8, -0.2, 0.5, 0.25, 0.9);
      c.restore();
    }
    if (A.near && !LOW) {
      var b = [lerp(A.ex, A.wx, 0.9), lerp(A.ey, A.wy, 0.9)];
      jewel(c, b[0] - 1.8, b[1] + 1.5 + MOTION.lag * 0.1, 0.95, PAL.pink, 'heart');
    }
  }
  /* glasses sit on the eyes, which move with the head's turn */
  function drawAccessoryFace(c, cust) {
    var hy = CH.headY, col = cust.accColor, acc = cust.accessory;
    if (acc !== 'glasses' && acc !== 'sunglasses' && acc !== 'heartGlasses' && acc !== 'starGlasses') return;
    var yaw = MOTION.yaw, ey = hy + 2;
    var lx = -5 + yaw * 2.6, rx = 5 + yaw * 1.6, rs = 1 - yaw * 0.22;
    var i, k, ang, rad;
    var frame = inkColor(col);
    var shape = function (x, sx) {
      return function () {
        if (acc === 'heartGlasses') heartPath(c, x, ey - 0.2, 4.6 * sx);
        else if (acc === 'starGlasses') {
          c.beginPath();
          for (k = 0; k < 10; k++) { ang = (Math.PI / 5) * k - Math.PI / 2; rad = k % 2 === 0 ? 6 : 3.3; c.lineTo(x + Math.cos(ang) * rad * sx, ey + 0.4 + Math.sin(ang) * rad); }
          c.closePath();
        } else if (acc === 'sunglasses') roundRect(c, x - 4.8 * sx, ey - 4, 9.6 * sx, 8, 3.4);
        else { c.beginPath(); c.ellipse(x, ey, 4.6 * sx, 4.4, 0, 0, TAU); }
      };
    };
    c.lineCap = 'round'; c.lineJoin = 'round';
    /* bridge and the near temple */
    c.beginPath(); c.moveTo(lx + 3.8, ey - 1); c.quadraticCurveTo((lx + rx) / 2, ey - 2.4, rx - 3.8 * rs, ey - 1);
    c.moveTo(lx - 4.4, ey - 1); c.lineTo(-12.6 + yaw * 2, ey - 1.9);
    c.strokeStyle = frame; c.lineWidth = 1.5; c.stroke();
    c.strokeStyle = col; c.lineWidth = 0.8; c.stroke();
    var lenses = [[lx, 1], [rx, rs]];
    for (i = 0; i < 2; i++) {
      var x2 = lenses[i][0], sx2 = lenses[i][1];
      var lens = shape(x2, sx2, 0);
      c.save();
      lens(); c.clip();
      if (acc !== 'glasses') {
        var lg = c.createLinearGradient(0, ey - 5, 0, ey + 5);
        if (acc === 'sunglasses') { lg.addColorStop(0, '#2c1830'); lg.addColorStop(1, mix('#6a3a70', col, 0.35)); }
        else { lg.addColorStop(0, shade(col, -46)); lg.addColorStop(1, shade(col, -14)); }
        c.fillStyle = lg; c.globalAlpha = acc === 'sunglasses' ? 0.96 : 0.9;
        c.fillRect(x2 - 8, ey - 8, 16, 16);
        c.globalAlpha = 1;
      } else {
        /* clear glass: her eye shows through a cool film */
        c.fillStyle = 'rgba(190,225,255,0.2)'; c.fillRect(x2 - 8, ey - 8, 16, 16);
      }
      /* two streaks of glare across the glass */
      c.fillStyle = acc === 'glasses' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.42)';
      c.beginPath(); c.moveTo(x2 - 4.4, ey + 1.6); c.lineTo(x2 - 0.4, ey - 5); c.lineTo(x2 + 1.2, ey - 5); c.lineTo(x2 - 2.8, ey + 1.6); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x2 - 1.6, ey + 2.4); c.lineTo(x2 + 2.4, ey - 5); c.lineTo(x2 + 3, ey - 5); c.lineTo(x2 - 1, ey + 2.4); c.closePath(); c.fill();
      c.restore();
      /* the rim: a line of ink, the frame colour inside it */
      lens(); c.strokeStyle = frame; c.lineWidth = 1.7; c.stroke();
      lens(); c.strokeStyle = col; c.lineWidth = 0.95; c.stroke();
    }
    if (acc === 'heartGlasses' || acc === 'starGlasses') { sparkle(c, lx - 4.6, ey - 4.6, 1.9, 1); sparkle(c, rx + 4.4 * rs, ey - 3.6, 1.4, 3); }
  }

  /* ---- Ears ----
     Human ears sit on the sides of the head. In a three-quarter turn
     the far ear (+x) slides in behind the cheek and is drawn under the
     head; the near one comes round onto the side of the face. */
  function humanEar(c, cust, x, sd) {
    var hy = CH.headY, r = CH.headR;
    var skin = skinOf(cust);
    if (cust.earStyle === 'elf') {
      celPart(c, function () {
        c.beginPath();
        c.moveTo(x - sd * 1.5, hy - 1.5);
        c.quadraticCurveTo(x + sd * 6, hy - 6, x + sd * 10, hy - 8.5);
        c.quadraticCurveTo(x + sd * 6, hy - 1, x + sd * 1.2, hy + 5.5);
        c.quadraticCurveTo(x - sd * 1.4, hy + 3, x - sd * 1.5, hy - 1.5);
        c.closePath();
      }, skin, { warm: true, dx: -0.6, dy: -0.6, rimS: 0.5 });
      fillPath(c, [[x, hy], [x + sd * 6, hy - 5], [x + sd * 0.6, hy + 3.6]], shadowCached(skin, 18, true), true, false);
    } else if (cust.earStyle === 'round') {
      celPart(c, ellPath(c, x, hy + 2, 2.7, 3.7), skin, { warm: true, dx: -0.5, dy: -0.5, rim: false });
      c.strokeStyle = shadowCached(skin, 28, true); c.lineWidth = 0.5; c.lineCap = 'round';
      c.beginPath(); c.arc(x + sd * 0.3, hy + 2, 1.5, -Math.PI * 0.6, Math.PI * 0.6, sd < 0); c.stroke();
    } else return;
    if (!cust.mannequin && cust.earColor !== skin) jewel(c, x + sd * 0.2, hy + 5, 1.05, cust.earColor, 'round');
  }
  function drawEarFar(c, cust) {
    var r = CH.headR, yaw = MOTION.yaw;
    humanEar(c, cust, r - 0.3 - yaw * 3.6, 1);
  }
  function drawEarNear(c, cust) {
    var r = CH.headR, yaw = MOTION.yaw;
    humanEar(c, cust, -r + 0.3 + yaw * 3.4, -1);
  }
  function drawAnimalEars(c, cust) {
    var hy = CH.headY, r = CH.headR;
    var col = cust.earColor, inner = PAL.peach, sd;
    var ox = MOTION.yaw * 1.2, A = MOTION.hairA;
    c.save();
    c.translate(ox, 0);
    switch (cust.earStyle) {
      case 'cat':
        for (sd = -1; sd <= 1; sd += 2) {
          celPart(c, polyPath(c, [[sd * 10.5, hy - 6.5], [sd * 9.4 - A * 2, hy - 19.5], [sd * 1.4, hy - 12]]), col, { dx: -0.8, dy: -0.6 });
          fillPath(c, [[sd * 8.4, hy - 9], [sd * 8.2 - A * 1.6, hy - 15.6], [sd * 4, hy - 11.5]], inner, true, false);
        }
        break;
      case 'fox':
        for (sd = -1; sd <= 1; sd += 2) {
          celPart(c, function () {
            c.beginPath();
            c.moveTo(sd * 11.5, hy - 5.5);
            c.quadraticCurveTo(sd * 13.5, hy - 15, sd * 11 - A * 2.5, hy - 22);
            c.quadraticCurveTo(sd * 5, hy - 16, sd * 1.5, hy - 11.5);
            c.closePath();
          }, col, { dx: -0.8, dy: -0.6 });
          fillPath(c, [[sd * 9.6, hy - 8], [sd * 10.6 - A * 2, hy - 17.5], [sd * 4.5, hy - 12]], '#fff6ec', true, false);
          fillPath(c, [[sd * 10.6 - A * 2.5, hy - 21], [sd * 11.8 - A * 2.4, hy - 18], [sd * 9.2 - A * 2.2, hy - 18.6]], shade(col, -35), true, false);
        }
        break;
      case 'bunny':
        for (sd = -1; sd <= 1; sd += 2) {
          c.save();
          c.translate(sd * 5.5, hy - 12);
          c.rotate(sd * 0.12 - A * 1.1 + MOTION.lag * 0.02 * sd);
          celPart(c, ellPath(c, 0, -9, 3.6, 10.5), col, { dx: -0.8, dy: -0.8 });
          fillEllipse(c, 0, -9, 1.7, 7.4, inner, false);
          c.restore();
        }
        break;
      case 'bear':
        for (sd = -1; sd <= 1; sd += 2) {
          celPart(c, ellPath(c, sd * 10, hy - 9, 4.8, 4.8), col, { dx: -0.8, dy: -0.8 });
          fillEllipse(c, sd * 10, hy - 8.6, 2.5, 2.5, inner, false);
        }
        break;
      case 'mouse':
        for (sd = -1; sd <= 1; sd += 2) {
          celPart(c, ellPath(c, sd * 11, hy - 10, 6.2, 6), col, { dx: -0.8, dy: -0.8 });
          fillEllipse(c, sd * 11, hy - 9.6, 3.8, 3.7, PAL.pink, false);
        }
        break;
      case 'lamb':
        /* soft ears held out sideways, and a curl of wool on the crown */
        for (sd = -1; sd <= 1; sd += 2) {
          c.save();
          c.translate(sd * (r - 0.6), hy - 7.6);
          c.rotate(sd * (0.2 + A * 0.6) + MOTION.lag * 0.02 * sd);
          celPart(c, ellPath(c, sd * 5.4, 0, 5.8, 2.9), col, { dx: -0.8, dy: -0.8 });
          fillEllipse(c, sd * 5.8, 0.3, 3.6, 1.5, inner, false);
          c.restore();
        }
        fluff(c, 0, hy - r - 1, 6.4, 3.4, '#fff8ee', 10, 1.6);
        break;
      case 'deer':
        /* little antlers and leaf-shaped ears */
        for (sd = -1; sd <= 1; sd += 2) {
          c.lineCap = 'round'; c.lineJoin = 'round';
          for (var dk = 0; dk < 2; dk++) {
            c.beginPath();
            c.moveTo(sd * 4.6, hy - 12.6); c.quadraticCurveTo(sd * 5.4, hy - 18, sd * 8.4 - A * 2, hy - 23);
            c.moveTo(sd * 5.6, hy - 17.4); c.lineTo(sd * 2.6 - A, hy - 20.6);
            c.moveTo(sd * 6.9 - A, hy - 20.4); c.lineTo(sd * 10.4 - A * 2, hy - 20);
            c.strokeStyle = dk ? '#c9995e' : '#5e3a1e'; c.lineWidth = dk ? 1.5 : 2.4; c.stroke();
          }
          c.save();
          c.translate(sd * (r - 2.4), hy - 9.6); c.rotate(sd * (0.5 + A * 0.8));
          celPart(c, function () { c.beginPath(); c.moveTo(0, 0.8); c.quadraticCurveTo(sd * 4, -3.6, sd * 9, -1.4); c.quadraticCurveTo(sd * 5, 2.6, 0, 0.8); c.closePath(); }, col, { dx: -0.6, dy: -0.6 });
          c.beginPath(); c.moveTo(sd * 1.6, 0.4); c.quadraticCurveTo(sd * 4.4, -1.8, sd * 7.4, -1); c.quadraticCurveTo(sd * 4.6, 1.2, sd * 1.6, 0.4); c.closePath();
          c.fillStyle = inner; c.fill();
          c.restore();
        }
        break;
      case 'koala':
        for (sd = -1; sd <= 1; sd += 2) {
          fluff(c, sd * (r + 2.4) - A * 2, hy - 8.6, 6.8, 6.8, col, 11, 1.8);
          fluff(c, sd * (r + 2.6) - A * 2, hy - 8, 3.8, 4, '#fff8ee', 8, 0.9);
        }
        break;
      case 'tiger':
        for (sd = -1; sd <= 1; sd += 2) {
          (function (sd) {
            var te = ellPath(c, sd * 9.6, hy - 10.4, 5, 5);
            celPart(c, te, col, { dx: -0.8, dy: -0.8 });
            c.save(); te(); c.clip();
            c.strokeStyle = '#3a2a2a'; c.lineWidth = 1.1; c.lineCap = 'round';
            c.beginPath();
            c.moveTo(sd * 9.6 - 3.4, hy - 14.4); c.lineTo(sd * 9.6 - 1.4, hy - 12.2);
            c.moveTo(sd * 9.6, hy - 15.6); c.lineTo(sd * 9.6, hy - 13);
            c.moveTo(sd * 9.6 + 3.4, hy - 14.4); c.lineTo(sd * 9.6 + 1.4, hy - 12.2);
            c.stroke();
            c.restore();
            fillEllipse(c, sd * 9.6, hy - 9.2, 2.4, 2.2, '#fff8ee', false);
          })(sd);
        }
        break;
      case 'puppy':
        for (sd = -1; sd <= 1; sd += 2) {
          c.save();
          c.translate(sd * (r - 1), hy - 6);
          c.rotate(A * 1.4 - sd * 0.1 - sd * MOTION.flare * 0.05);
          celPart(c, function () {
            c.beginPath();
            c.moveTo(-2.4, 0);
            c.quadraticCurveTo(sd * 5.5, -1, sd * 4.6, 9);
            c.quadraticCurveTo(sd * 2, 13, -sd * 0.4, 10);
            c.quadraticCurveTo(-sd * 1.6, 5, -2.4 * sd, 0);
            c.closePath();
          }, col, { dx: -0.8, dy: -0.8 });
          c.restore();
        }
        break;
    }
    c.restore();
  }

  /* ---- Face ---- */
  /* The eyes carry the character, so they get the most care: a white
     shadowed under the lid, an iris that is dark at the top and glows
     at the bottom with a limbal ring, a pupil tinted from the iris, two
     catchlights, and a tapered upper lid that thickens to a flick at the
     outer corner (side = -1 near eye, +1 far eye). ws narrows the far
     eye in a turn, look shifts the iris, lid (0..1) closes the eye from
     the top for blinks and the sleepy style. */
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
  function closedEye(c, x, y, side, happy, ws) {
    var lash = '#3a1c32';
    c.strokeStyle = lash; c.lineWidth = 1.15; c.lineCap = 'round';
    c.beginPath();
    if (happy) c.arc(x, y + 2, 3.4 * ws, Math.PI * 1.12, Math.PI * 1.88);
    else { c.moveTo(x - 3.1 * ws, y + 0.9); c.quadraticCurveTo(x, y + 2.5, x + 3.1 * ws, y + 0.9); }
    c.stroke();
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(x + side * 2.9 * ws, y + (happy ? 0.2 : 0.9));
    c.lineTo(x + side * 4.2 * ws, y - 0.3);
    c.stroke();
  }
  function drawEye(c, cust, x, y, style, lid, side, ws, look) {
    var ec = cust.eyeColor;
    var lash = '#3a1c32';
    ws = ws || 1;
    if (style === 'sleepy') lid = Math.max(lid || 0, 0.42);
    if (lid > 0.72 || style === 'happy') { closedEye(c, x, y, side, style === 'happy' && lid <= 0.72, ws); return; }
    if (style === 'dot') {
      /* a bright bead of an eye: the simplest face, and a sweet one */
      fillEllipse(c, x + (look ? look[0] : 0) * 0.5 * ws, y + 0.4 + (look ? look[1] : 0) * 0.4, 1.9 * ws, 2.5 * (1 - (lid || 0) * 0.6), mix(shade(ec, -62), '#2a1024', 0.5), false);
      fillEllipse(c, x - 0.6 * ws + (look ? look[0] : 0) * 0.5 * ws, y - 0.6, 0.65, 0.8, '#ffffff', false);
      return;
    }
    var rx = EYE_RX * ws, ry = EYE_RY;
    if (style === 'sparkle') { rx = 3.6 * ws; ry = 4.6; }
    if (style === 'shine' || style === 'teary') { rx = 3.7 * ws; ry = 4.8; }
    if (style === 'lashes') { rx = 3.5 * ws; ry = 4.5; }
    var lx = (look ? look[0] : 0) * 0.8 * ws, ly = (look ? look[1] : 0) * 0.7;
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
    var irx = rx * 0.86, iry = ry * 0.9, ix = x + lx, iy = y + ry * 0.08 + ly;
    var ig = c.createLinearGradient(0, iy - iry, 0, iy + iry);
    ig.addColorStop(0, shade(ec, -50));
    ig.addColorStop(0.45, ec);
    ig.addColorStop(1, mix(shade(ec, 42), '#ffe6c8', 0.12));
    fillEllipse(c, ix, iy, irx, iry, ig, false);
    /* light pooling in the bottom of the iris, and fine radial fibres */
    c.save();
    c.globalAlpha = 0.55;
    fillEllipse(c, ix, iy + iry * 0.5, irx * 0.7, iry * 0.38, mix(shade(ec, 58), '#fff0d8', 0.2), false);
    c.restore();
    if (!LOW && ry > 3.5) {
      c.strokeStyle = shade(ec, -35); c.globalAlpha = 0.14; c.lineWidth = 0.22;
      c.beginPath();
      for (var fi = 0; fi < 8; fi++) {
        var fa = Math.PI * (0.15 + fi * 0.1);
        c.moveTo(ix + Math.cos(fa) * irx * 0.5, iy + Math.sin(fa) * iry * 0.5);
        c.lineTo(ix + Math.cos(fa) * irx * 0.92, iy + Math.sin(fa) * iry * 0.92);
      }
      c.stroke(); c.globalAlpha = 1;
    }
    /* limbal ring */
    c.beginPath(); c.ellipse(ix, iy, irx, iry, 0, 0, Math.PI * 2);
    c.strokeStyle = shade(ec, -55); c.lineWidth = 0.45; c.stroke();
    /* pupil */
    var pupil = mix(shade(ec, -70), '#2a1024', 0.5);
    if (style === 'star') {
      c.fillStyle = pupil; star(c, ix, iy, 2.5);
      c.fillStyle = mix(shade(ec, 60), '#ffffff', 0.5); star(c, ix, iy, 1);
    } else if (style === 'heart') {
      heart(c, ix, iy + 0.2, 1.9 * ws, pupil, false);
      heart(c, ix - 0.3, iy - 0.1, 0.7 * ws, mix(shade(ec, 60), '#ffffff', 0.4), false);
    } else if (style === 'flower') {
      /* a blossom for a pupil */
      fillEllipse(c, ix, iy + 0.2, irx * 0.62, iry * 0.66, pupil, false);
      c.fillStyle = mix(shade(ec, 60), '#ffffff', 0.72);
      c.beginPath();
      for (var fp = 0; fp < 5; fp++) { var fa2 = fp * TAU / 5 - Math.PI / 2; c.moveTo(ix + Math.cos(fa2) * 1.05 * ws + 0.8, iy + 0.5 + Math.sin(fa2) * 1.05); c.arc(ix + Math.cos(fa2) * 1.05 * ws, iy + 0.5 + Math.sin(fa2) * 1.05, 0.8, 0, TAU); }
      c.fill();
      fillEllipse(c, ix, iy + 0.5, 0.55, 0.55, '#ffc94a', false);
    } else {
      fillEllipse(c, ix, iy + 0.2, irx * 0.46, iry * 0.52, pupil, false);
    }
    /* catchlights: the key light high on the lit side, a bounce low */
    var big = style === 'sparkle' || style === 'shine' || style === 'teary' || style === 'lashes';
    fillEllipse(c, ix - rx * 0.34, y - ry * 0.34 + ly * 0.5, big ? 1.5 : 1.25, big ? 1.8 : 1.55, '#ffffff', false);
    fillEllipse(c, ix + rx * 0.36, y + ry * 0.42 + ly * 0.5, big ? 0.85 : 0.6, big ? 0.85 : 0.6, '#ffffff', false);
    if (big) fillEllipse(c, ix + rx * 0.3, y - ry * 0.5, 0.5, 0.5, '#ffffff', false);
    if (style === 'teary') {
      /* welling up: a wide wet shimmer along the bottom of the eye */
      c.globalAlpha = 0.75; fillEllipse(c, ix, y + ry * 0.66, rx * 0.8, ry * 0.2, '#ffffff', false);
      c.globalAlpha = 0.5; fillEllipse(c, ix - rx * 0.1, y + ry * 0.2, rx * 0.34, ry * 0.2, '#ffffff', false); c.globalAlpha = 1;
    }
    if (style === 'shine') {
      c.fillStyle = '#ffffff'; star(c, ix + rx * 0.1, iy + iry * 0.15, 0.9);
      c.globalAlpha = 0.35; fillEllipse(c, ix, iy + iry * 0.62, irx * 0.75, iry * 0.25, '#ffffff', false); c.globalAlpha = 1;
    }
    /* a partly lowered lid: skin over the top of the eye */
    var lidY = y - ry + ry * 2 * (lid || 0);
    if (lid > 0.04) {
      c.fillStyle = skinOf(cust);
      c.fillRect(x - rx - 2, y - ry - 2, rx * 2 + 4, lidY - (y - ry) + 2);
      c.fillStyle = 'rgba(160,80,90,0.25)';
      c.fillRect(x - rx - 2, lidY - 0.1, rx * 2 + 4, 0.9);
    }
    c.restore();
    /* lower lid: a whisper of line at the outer half */
    c.save();
    c.strokeStyle = lash; c.lineCap = 'round';
    c.globalAlpha = 0.55; c.lineWidth = 0.5;
    c.beginPath();
    if (side > 0) c.ellipse(x, y, rx, ry, 0, Math.PI * 0.12, Math.PI * 0.42);
    else c.ellipse(x, y, rx, ry, 0, Math.PI * 0.58, Math.PI * 0.88);
    c.stroke();
    c.restore();
    if (lid > 0.04) {
      /* the lash line rides the lowered lid */
      var hw = rx * Math.sqrt(Math.max(0, 1 - Math.pow((lidY - y) / ry, 2)));
      c.strokeStyle = lash; c.lineCap = 'round'; c.lineWidth = 1.1;
      c.beginPath();
      c.moveTo(x - hw - 0.2, lidY + 0.2);
      c.quadraticCurveTo(x, lidY - 0.6, x + hw + 0.2, lidY + 0.2);
      c.stroke();
      c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(x + side * (hw + 0.1), lidY + 0.1); c.lineTo(x + side * (hw + 1.6), lidY - 0.9); c.stroke();
      return;
    }
    /* upper lid: one filled shape, hair-thin at the inner corner and
       heavy at the outer, ending in a flick */
    c.fillStyle = lash;
    c.beginPath();
    var N = 10, i, u, a, th;
    var top = style === 'cat' ? 1.25 : 1;
    for (i = 0; i <= N; i++) {
      u = i / N;
      a = side > 0 ? Math.PI * (1.08 + 0.86 * u) : Math.PI * (1.92 - 0.86 * u);
      th = 0.2 + 1.2 * u * u;
      var px = x + Math.cos(a) * (rx + 0.2 + th * 0.4), py = y + Math.sin(a) * (ry * top + 0.2 + th);
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.lineTo(x + side * (rx + 1.9), y - ry * 0.64);
    c.lineTo(x + side * (rx + 0.1), y - ry * 0.18);
    for (i = N; i >= 0; i--) {
      u = i / N;
      a = side > 0 ? Math.PI * (1.08 + 0.86 * u) : Math.PI * (1.92 - 0.86 * u);
      c.lineTo(x + Math.cos(a) * (rx - 0.15), y + Math.sin(a) * (ry * top - 0.15));
    }
    c.closePath();
    c.fill();
    if (style === 'sparkle' || style === 'cat' || style === 'shine') {
      c.strokeStyle = lash; c.lineWidth = 0.6; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x + side * rx * 0.75, y - ry * 0.85); c.lineTo(x + side * (rx + 1), y - ry * 1.35);
      c.moveTo(x + side * rx * 0.3, y - ry * 1.02); c.lineTo(x + side * (rx * 0.4 + 0.4), y - ry * 1.5);
      c.stroke();
    }
    if (style === 'lashes') {
      /* three curled lashes fanning from the outer corner */
      c.fillStyle = lash;
      for (i = 0; i < 3; i++) {
        a = side > 0 ? Math.PI * (1.6 + i * 0.12) : Math.PI * (1.4 - i * 0.12);
        var l0x = x + Math.cos(a) * (rx + 0.3), l0y = y + Math.sin(a) * (ry + 0.5);
        c.beginPath();
        c.moveTo(l0x - Math.sin(a) * 0.5, l0y + Math.cos(a) * 0.5);
        c.quadraticCurveTo(l0x + Math.cos(a) * 1.1 + side * 0.3, l0y + Math.sin(a) * 1.1, l0x + Math.cos(a) * 1.5 + side * 1.1, l0y + Math.sin(a) * 1.9 - 0.2);
        c.quadraticCurveTo(l0x + Math.cos(a) * 0.7 + side * 0.5, l0y + Math.sin(a) * 0.7, l0x + Math.sin(a) * 0.5, l0y - Math.cos(a) * 0.5);
        c.closePath(); c.fill();
      }
    }
    if (style === 'teary') jewel(c, x + side * rx * 0.72, y + ry * 0.98, 0.95, '#9fd9ff', 'drop');
  }

  function drawFace(c, cust) {
    if (cust.mannequin && !cust.showFace) return;
    var hy = CH.headY;
    var skin = skinOf(cust);
    var style = cust.eyeStyle || 'round';
    var yaw = MOTION.yaw, lid = MOTION.blink, look = MOTION.look;
    /* the features ride round toward the way she faces; the far eye
       narrows with the turn */
    var ey = hy + 2, lx = -5 + yaw * 2.6, rx = 5 + yaw * 1.6, ws = 1 - yaw * 0.24;
    if (style === 'wink') {
      drawEye(c, cust, lx, ey, 'round', lid, -1, 1, look);
      drawEye(c, cust, rx, ey, 'happy', 0, 1, ws, look);
    } else {
      drawEye(c, cust, lx, ey, style, lid, -1, 1, look);
      drawEye(c, cust, rx, ey, style, lid, 1, ws, look);
    }
    /* nose: lit on the bridge, a warm shadow tucked under it, and in a
       turn the tip's edge against the far cheek */
    var nx = yaw * 3.6, ny = hy + 6.4;
    switch (cust.noseStyle) {
      case 'button':
        fillEllipse(c, nx + 0.5, ny + 0.4, 1.4, 0.9, shadowCached(skin, 26, true), false);
        fillEllipse(c, nx, ny, 1.2, 0.85, shade(skin, -8), false);
        fillEllipse(c, nx - 0.5, ny - 0.4, 0.5, 0.35, 'rgba(255,255,255,0.75)', false);
        break;
      case 'dot': fillEllipse(c, nx, ny, 0.7, 0.7, shade(skin, -40), false); break;
      case 'line':
        c.strokeStyle = shade(skin, -40); c.lineWidth = 0.6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(nx + 0.4, ny - 1.6); c.quadraticCurveTo(nx + 1.6, ny + 0.8, nx, ny + 1); c.stroke();
        break;
      case 'freckles':
        fillEllipse(c, nx, ny, 1.1, 0.8, shade(skin, -22), false);
        c.fillStyle = shade(skin, -32);
        for (var f = 0; f < 3; f++) {
          c.beginPath(); c.arc(lx - 4.5 + f * 1.8, ny - 0.6 + (f % 2) * 1.3, 0.45, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.arc(rx + 4.5 * ws - f * 1.8 * ws, ny - 0.6 + (f % 2) * 1.3, 0.45, 0, Math.PI * 2); c.fill();
        }
        break;
      case 'heart': heart(c, nx, ny, 1.4, PAL.pink, false); break;
      case 'kitty':
        /* a pink kitten nose and three whiskers a side */
        celPart(c, function () { c.beginPath(); c.moveTo(nx - 1.5, ny - 0.7); c.quadraticCurveTo(nx, ny - 1.2, nx + 1.5, ny - 0.7); c.quadraticCurveTo(nx + 0.6, ny + 0.5, nx, ny + 1.1); c.quadraticCurveTo(nx - 0.6, ny + 0.5, nx - 1.5, ny - 0.7); c.closePath(); }, PAL.pink, { rim: false, ink: 1, dx: -0.3, dy: -0.3 });
        c.strokeStyle = '#5a2a3c'; c.lineWidth = 0.4; c.lineCap = 'round';
        c.beginPath();
        for (var wk = -1; wk <= 1; wk++) {
          c.moveTo(lx - 2.6, ny + 0.8 + wk * 1.1); c.lineTo(lx - 6.4, ny + 0.4 + wk * 1.9);
          c.moveTo(rx + 2.6 * ws, ny + 0.8 + wk * 1.1); c.lineTo(rx + 6.4 * ws, ny + 0.4 + wk * 1.9);
        }
        c.stroke();
        break;
      case 'bandaid':
        fillEllipse(c, nx, ny + 0.6, 1, 0.7, shade(skin, -14), false);
        c.save();
        c.translate(nx, ny - 1.5); c.rotate(-0.18);
        celPart(c, rrPath(c, -4.2, -1.2, 8.4, 2.4, 1.2), '#ffd9c0', { rim: false, ink: 1, dx: -0.4, dy: -0.3 });
        fillRound(c, -1.5, -1.2, 3, 2.4, 0.3, '#fff3e8', false);
        c.fillStyle = '#e8a888';
        for (var bd = -1; bd <= 1; bd += 2) { c.beginPath(); c.arc(bd * 2.9, -0.4, 0.25, 0, TAU); c.arc(bd * 2.9, 0.5, 0.25, 0, TAU); c.fill(); }
        c.restore();
        break;
      case 'rosy':
        fillEllipse(c, nx, ny, 2.3, 1.7, 'rgba(255,110,130,0.28)', false);
        fillEllipse(c, nx, ny, 1.4, 1, 'rgba(255,90,120,0.55)', false);
        fillEllipse(c, nx - 0.5, ny - 0.4, 0.5, 0.35, 'rgba(255,255,255,0.85)', false);
        break;
      case 'starry':
        fillEllipse(c, nx, ny, 1.1, 0.8, shade(skin, -18), false);
        c.fillStyle = '#ffc94a';
        star(c, lx - 3.4, ny - 0.2, 1.25); star(c, lx - 1, ny + 1.2, 0.8);
        star(c, rx + 3.4 * ws, ny - 0.2, 1.25); star(c, rx + 1 * ws, ny + 1.2, 0.8);
        break;
    }
    if (yaw > 0.3 && cust.noseStyle !== 'heart') {
      c.strokeStyle = shadowCached(skin, 34, true); c.lineWidth = 0.45; c.globalAlpha = (yaw - 0.3) * 1.6;
      c.beginPath(); c.moveTo(nx + 1.1, ny - 2.2); c.quadraticCurveTo(nx + 1.9, ny - 0.2, nx + 0.8, ny + 0.6); c.stroke();
      c.globalAlpha = 1;
    }
    /* blush: a soft glow with three little hatch marks */
    if (!cust.mannequin) {
      for (var bs = -1; bs <= 1; bs += 2) {
        var bx = bs < 0 ? lx - 3.1 : rx + 3.1 * ws, by = hy + 7.2, bw = bs < 0 ? 1 : ws;
        fillEllipse(c, bx, by, 3.4 * bw, 2.2, 'rgba(255,120,130,0.16)', false);
        fillEllipse(c, bx, by, 2.2 * bw, 1.35, 'rgba(255,120,130,0.2)', false);
        c.strokeStyle = 'rgba(230,80,100,0.4)'; c.lineWidth = 0.4; c.lineCap = 'round';
        c.beginPath();
        for (var hk = -1; hk <= 1; hk++) { c.moveTo(bx + hk * 1.2 * bw + 0.5, by - 0.8); c.lineTo(bx + hk * 1.2 * bw - 0.4, by + 0.7); }
        c.stroke();
      }
    }
    /* mouth */
    var lip = cust.lipColor || PAL.ink;
    var natural = lip === PAL.ink;
    var mx = yaw * 2.8, my = hy + 8.6;
    var line = '#5a2a3c';
    c.save();
    c.translate(mx, 0);
    c.lineCap = 'round';
    switch (cust.mouthStyle) {
      case 'grin':
        c.beginPath(); c.arc(0, my - 1, 3.8, 0.1 * Math.PI, 0.9 * Math.PI); c.closePath();
        c.fillStyle = natural ? '#a8344a' : lip; c.fill();
        c.save(); c.clip();
        c.fillStyle = '#fff'; c.fillRect(-5, my - 2, 10, 1.9);
        fillEllipse(c, 0, my + 2.8, 2.2, 1.4, '#ff8aa0', false);
        c.restore();
        c.beginPath(); c.arc(0, my - 1, 3.8, 0.1 * Math.PI, 0.9 * Math.PI); c.closePath();
        c.strokeStyle = line; c.lineWidth = 0.7; c.stroke();
        break;
      case 'open':
        c.beginPath(); c.arc(0, my - 0.5, 2.9, 0, Math.PI); c.closePath();
        c.fillStyle = '#a8344a'; c.fill();
        c.save(); c.clip(); fillEllipse(c, 0, my + 2.6, 2.2, 1.6, '#ff8aa0', false); c.restore();
        c.beginPath(); c.arc(0, my - 0.5, 2.9, 0, Math.PI); c.closePath();
        c.strokeStyle = natural ? line : lip; c.lineWidth = natural ? 0.7 : 1.1; c.stroke();
        break;
      case 'cat':
        if (!natural) { c.strokeStyle = lip; c.lineWidth = 2; c.beginPath(); c.arc(-1.8, my - 1, 1.8, 0.1 * Math.PI, 0.9 * Math.PI); c.arc(1.8, my - 1, 1.8, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke(); }
        c.strokeStyle = line; c.lineWidth = 0.85;
        c.beginPath(); c.arc(-1.8, my - 1, 1.8, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
        c.beginPath(); c.arc(1.8, my - 1, 1.8, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
        break;
      case 'tongue':
        if (!natural) { c.strokeStyle = lip; c.lineWidth = 2.2; c.beginPath(); c.arc(0, my - 1.5, 2.9, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
        celPart(c, ellPath(c, 1, my + 2.1, 1.5, 1.9), PAL.pink, { rim: false, ink: 1.1, dx: -0.3, dy: -0.3 });
        c.strokeStyle = line; c.lineWidth = 0.9;
        c.beginPath(); c.arc(0, my - 1.5, 2.9, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
        break;
      case 'kiss':
        celPart(c, ellPath(c, 0, my, 1.4, 1.2), natural ? PAL.coral : lip, { rim: false, ink: 1.1, dx: -0.3, dy: -0.3 });
        heart(c, 4.6, my - 2, 1.2, PAL.pink, false);
        break;
      case 'fang':
        c.beginPath(); c.moveTo(-2.8, my - 1); c.quadraticCurveTo(0, my + 2.2, 2.8, my - 1); c.quadraticCurveTo(0, my - 0.2, -2.8, my - 1); c.closePath();
        c.fillStyle = natural ? '#a8344a' : lip; c.fill();
        c.fillStyle = '#ffffff';
        c.beginPath(); c.moveTo(0.9, my - 0.55); c.lineTo(2.1, my - 0.85); c.lineTo(1.6, my + 0.7); c.closePath(); c.fill();
        c.strokeStyle = line; c.lineWidth = 0.7;
        c.beginPath(); c.moveTo(-2.8, my - 1); c.quadraticCurveTo(0, my + 2.2, 2.8, my - 1); c.stroke();
        break;
      case 'pout':
        if (!natural) { celPart(c, ellPath(c, 0, my - 0.2, 1.7, 1.1), lip, { rim: false, ink: 0, dx: -0.2, dy: -0.2 }); }
        c.strokeStyle = line; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(-1.6, my - 0.6); c.quadraticCurveTo(-0.8, my - 1.6, 0, my - 0.7); c.quadraticCurveTo(0.8, my - 1.6, 1.6, my - 0.6); c.stroke();
        c.lineWidth = 0.5; c.globalAlpha = 0.6;
        c.beginPath(); c.moveTo(-0.9, my + 0.6); c.quadraticCurveTo(0, my + 1.2, 0.9, my + 0.6); c.stroke();
        c.globalAlpha = 1;
        break;
      case 'laugh':
        /* thrown wide open: top teeth, a tongue, a happy shout */
        c.beginPath(); c.moveTo(-3.6, my - 1.6); c.quadraticCurveTo(0, my - 0.6, 3.6, my - 1.6); c.quadraticCurveTo(3.2, my + 3.6, 0, my + 3.7); c.quadraticCurveTo(-3.2, my + 3.6, -3.6, my - 1.6); c.closePath();
        c.fillStyle = '#a8344a'; c.fill();
        c.save(); c.clip();
        c.fillStyle = '#fff'; c.fillRect(-4, my - 2, 8, 1.9);
        fillEllipse(c, 0, my + 3.4, 2.3, 1.5, '#ff8aa0', false);
        c.restore();
        c.beginPath(); c.moveTo(-3.6, my - 1.6); c.quadraticCurveTo(0, my - 0.6, 3.6, my - 1.6); c.quadraticCurveTo(3.2, my + 3.6, 0, my + 3.7); c.quadraticCurveTo(-3.2, my + 3.6, -3.6, my - 1.6); c.closePath();
        c.strokeStyle = natural ? line : lip; c.lineWidth = natural ? 0.7 : 1.1; c.lineJoin = 'round'; c.stroke();
        break;
      case 'smirk':
        if (!natural) { c.strokeStyle = lip; c.lineWidth = 2.1; c.beginPath(); c.moveTo(-2.4, my + 0.5); c.quadraticCurveTo(0.4, my + 1.6, 3, my - 0.9); c.stroke(); }
        c.strokeStyle = line; c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(-2.4, my + 0.5); c.quadraticCurveTo(0.4, my + 1.6, 3, my - 0.9); c.stroke();
        c.lineWidth = 0.6;
        c.beginPath(); c.moveTo(3, my - 0.9); c.lineTo(3.6, my - 1.7); c.stroke();
        break;
      case 'ooh':
        celPart(c, ellPath(c, 0, my + 0.4, 1.5, 1.9), '#a8344a', { rim: false, ink: 0, dx: -0.2, dy: -0.2 });
        c.beginPath(); c.ellipse(0, my + 0.4, 1.5, 1.9, 0, 0, TAU);
        c.strokeStyle = natural ? line : lip; c.lineWidth = natural ? 0.7 : 1.2; c.stroke();
        break;
      case 'bunny':
        if (!natural) { c.strokeStyle = lip; c.lineWidth = 2.2; c.beginPath(); c.arc(0, my - 1.6, 2.9, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
        c.beginPath(); c.arc(0, my - 1.6, 2.9, 0.2 * Math.PI, 0.8 * Math.PI);
        c.strokeStyle = line; c.lineWidth = 0.9; c.stroke();
        /* two front teeth */
        fillRound(c, -1.25, my + 0.9, 2.5, 2, 0.6, '#ffffff', false);
        c.strokeStyle = line; c.lineWidth = 0.45;
        roundRect(c, -1.25, my + 0.9, 2.5, 2, 0.6); c.stroke();
        c.beginPath(); c.moveTo(0, my + 1.1); c.lineTo(0, my + 2.8); c.stroke();
        break;
      default: /* smile */
        if (!natural) { c.strokeStyle = lip; c.lineWidth = 2.2; c.beginPath(); c.arc(0, my - 1.6, 2.9, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
        c.beginPath(); c.arc(0, my - 1.6, 2.9, 0.2 * Math.PI, 0.8 * Math.PI);
        c.strokeStyle = line; c.lineWidth = 0.9; c.stroke();
        /* a hint of a lower lip */
        c.globalAlpha = 0.35; c.lineWidth = 0.5;
        c.beginPath(); c.moveTo(-0.8, my + 1.9); c.quadraticCurveTo(0, my + 2.3, 0.8, my + 1.9); c.stroke();
        c.globalAlpha = 1;
        break;
    }
    c.restore();
  }

  /* A round crown over full cheeks that ease into a soft chin. In a
     turn the chin and the far cheek slide toward +x and flatten. */
  function headPath(c) {
    var hy = CH.headY, r = CH.headR, yaw = MOTION.yaw;
    var cx = yaw * 1.5;
    c.beginPath();
    c.arc(0, hy, r, Math.PI, Math.PI * 2);
    c.bezierCurveTo(r + 0.2 - yaw * 0.6, hy + 7.2, r * 0.6 + cx, hy + 12.9, cx, hy + 13.3);
    c.bezierCurveTo(-r * 0.66 + cx, hy + 13.1, -r - 0.3, hy + 7.8, -r, hy);
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
    celBands(c, head, skin, -1.8, -2.4, true, 0.8);
    c.save();
    head();
    c.clip();
    /* lit high on the left, falling off toward the jaw */
    var sg = c.createRadialGradient(-4, hy - 5, 1, -1, hy - 1, r + 2);
    sg.addColorStop(0, 'rgba(255,255,255,0.22)');
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
    rims(c, head, 1);
    head();
    c.fillStyle = skin;
    ink(c, 2);
    /* soft highlight on the cheekbone */
    c.save();
    c.globalAlpha = 0.38;
    fillEllipse(c, -6 + MOTION.yaw * 2, hy + 1.8, 2.2, 1.3, '#ffffff', false);
    c.restore();
  }

  /* The angel ring: a toothed band of light across the crown, the
     shorthand every animated studio uses for glossy hair. Clipped to the
     cap so every style gets the same studio shine. */
  function drawHairGloss(c, cust) {
    if (cust.mannequin && !cust.showHair) return;
    var hy = CH.headY, r = CH.headR, ox = MOTION.yaw * 1.4;
    var light = mix(shade(cust.hair, 52), '#fff8ec', 0.28);
    c.save();
    c.beginPath();
    c.ellipse(0, hy - 0.4, r + 1.6, r + 2.3, 0, Math.PI, Math.PI * 2);
    c.closePath();
    c.clip();
    /* broken strokes of light round the crown, the brightest over the
       lit side, and a white fleck */
    c.strokeStyle = light;
    c.lineCap = 'round';
    var segs = [[1.13, 1.22, 0.9], [1.25, 1.36, 1.25], [1.39, 1.52, 1.35], [1.55, 1.66, 1.05], [1.69, 1.78, 0.8]];
    for (var i = 0; i < segs.length; i++) {
      c.globalAlpha = 0.5 + segs[i][2] * 0.3;
      c.lineWidth = segs[i][2];
      c.beginPath();
      c.ellipse(ox, hy - 2.6, r - 1.2, r * 0.62, 0, Math.PI * segs[i][0], Math.PI * segs[i][1]);
      c.stroke();
    }
    c.globalAlpha = 0.35;
    c.lineWidth = 0.6;
    c.beginPath();
    c.ellipse(ox, hy - 2.6, r - 3.4, r * 0.45, 0, Math.PI * 1.3, Math.PI * 1.55);
    c.stroke();
    c.globalAlpha = 0.95;
    fillEllipse(c, ox - 6.2, hy - 9.6, 0.75, 0.45, '#ffffff', false);
    c.restore();
  }

  /* ---- Arms and hands ---- */
  function drawArmRig(c, cust, A) {
    var skin = skinOf(cust);
    if (!A.near) skin = shadowCached(skin, 9, true);
    celPart(c, function () {
      limbPath(c, A.sx, A.sy, ARM.rSh, A.ex, A.ey, ARM.rEl, A.wx, A.wy, ARM.rWr, 0.2, 0.12);
    }, skin, { warm: true, dx: -0.8, dy: -0.5, s: 0.9 });
    drawHandRig(c, skin, A);
    drawSleeveOnArm(c, cust, A);
    if (cust.accessory === 'bangles') drawBangles(c, cust, A);
  }
  /* A small hand: palm and fingers as one shape with a tucked thumb,
     two finger creases and a lit knuckle, turned along the forearm. */
  function drawHandRig(c, skin, A) {
    c.save();
    c.translate(A.wx, A.wy);
    c.rotate(A.ha - Math.PI / 2);
    c.scale(1.22, 1.22);
    var open = A.open || 0;
    var hand = function () {
      c.beginPath();
      c.moveTo(-1.35, 0.1);
      c.quadraticCurveTo(-1.9 - open * 0.4, 1.8, -1.45 - open * 0.5, 3.4);
      c.quadraticCurveTo(-0.6, 4.7 + open * 0.4, 0.55, 4.4 + open * 0.3);
      c.quadraticCurveTo(1.7, 3.8, 1.6, 2.3);
      c.lineTo(1.4, 0.2);
      c.quadraticCurveTo(0, -0.5, -1.35, 0.1);
      c.closePath();
    };
    celPart(c, hand, skin, { warm: true, dx: -0.5, dy: -0.4, rim: false, s: 0.8, ink: 1.5 });
    celPart(c, function () {
      c.beginPath();
      c.moveTo(1.1, 0.8);
      c.quadraticCurveTo(2.5 + open * 0.6, 1.4, 2.3 + open * 0.9, 2.9 - open * 0.3);
      c.quadraticCurveTo(1.9, 3.3, 1.2, 2.5);
      c.closePath();
    }, skin, { warm: true, dx: -0.3, dy: -0.3, rim: false, s: 0.7, ink: 1.3 });
    if (!LOW) {
      c.strokeStyle = shadowCached(skin, 30, true); c.lineWidth = 0.32; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-0.45, 2.9); c.lineTo(-0.55, 4.2);
      c.moveTo(0.45, 2.9); c.lineTo(0.5, 4.1);
      c.stroke();
      glint(c, -0.5, 1.2, 0.6, 0.45, 0.35);
    }
    c.restore();
  }

  /* ==================================================================
     Rig: walk cycle, poses and the animator that drives them.
     Units are character units (feet at 0, ~62 tall); time in seconds.
     ================================================================== */
  /* run: Momoko's studio trot (feet planted for under a third of the
     cycle, a flight phase between steps). cat: the runway strut, longer
     stance, feet crossing onto the centre line, hips swinging. rate caps
     the cadence (cycles a second): at full speed the stride lengthens
     rather than the legs blurring, and the planted foot gives up a
     little ground. step is how long a foot takes to step home when she
     stops or turns on the spot. */
  var GAITS = {
    run: { A: 6.8, sigma: 0.28, lift: 4.2, bob: 0.5, arm: 0.6, elbow: 0.55, lean: 0.1, cross: 0.3, sway: 0.03, yaw: 0.72, rate: 3.25, step: 0.15 },
    cat: { A: 8.0, sigma: 0.56, lift: 2.4, bob: 0.4, arm: 0.5, elbow: 0.35, lean: -0.015, cross: 1.2, sway: 0.15, yaw: 0.62, rate: 2.4, step: 0.22 },
  };
  (function () { for (var k in GAITS) GAITS[k].cycle = 2 * GAITS[k].A / GAITS[k].sigma; })();

  /* The gait under turbo (holding a direction), b 0..1 of the boost: a
     longer stride and a shorter stance, a touch more cadence, lift, arm
     swing and lean, so double speed reads as a sprint rather than the
     legs blurring. Fills one scratch object; b = 0 is the gait itself. */
  var TURBO_G = {};
  function gaitAt(name, b) {
    var G = GAITS[name] || GAITS.run;
    if (!(b > 0.001)) return G;
    for (var k in G) TURBO_G[k] = G[k];
    TURBO_G.A = G.A * (1 + 0.35 * b);
    TURBO_G.sigma = G.sigma - 0.06 * b;
    TURBO_G.lift = G.lift * (1 + 0.5 * b);
    TURBO_G.arm = G.arm * (1 + 0.3 * b);
    TURBO_G.elbow = G.elbow + 0.2 * b;
    TURBO_G.lean = G.lean + 0.05 * b;
    TURBO_G.rate = G.rate + 0.1 * b;
    TURBO_G.cycle = 2 * TURBO_G.A / TURBO_G.sigma;
    return TURBO_G;
  }

  /* One foot through the cycle: [forward x, lift, angle (toe up +)]. */
  function footCycle(u, G) {
    var s = G.sigma, k;
    if (u < s) {
      k = u / s;
      var ang = k < 0.15 ? lerp(0.22, 0, k / 0.15) : k > 0.72 ? lerp(0, -0.42, (k - 0.72) / 0.28) : 0;
      return [G.A * (1 - 2 * k), 0, ang];
    }
    k = (u - s) / (1 - s);
    return [-G.A + 2 * G.A * smooth(k), G.lift * Math.sin(Math.PI * k) * (0.6 + 0.4 * (1 - k)), lerp(-0.6, 0.22, smooth(k))];
  }
  function gaitBob(gait, ph, w) {
    var G = GAITS[gait] || GAITS.run;
    if (gait === 'cat') return -w * G.bob * Math.cos(4 * Math.PI * (ph + 0.15));
    return w * G.bob * Math.cos(4 * Math.PI * (ph - G.sigma / 2));
  }

  var RIG = { legs: [{}, {}], arms: [{}, {}] };
  function buildRig(S, cust) {
    var G = gaitAt(S.gait, S.boost);
    var R = RIG;
    var w = S.walkW, ph = S.phase, t = S.t, yaw = S.yaw;
    var br = Math.sin(t * TAU / 3.6);
    var hw = S.hipW || 0, ww = S.waveW || 0;
    R.f = S.f; R.yaw = yaw; R.t = t;
    var bob = gaitBob(S.gait, ph, w);
    var hipRot = w * G.sway * Math.cos(TAU * (ph - G.sigma / 2));
    var px = 0, heel = 0;
    var fk = S.fidget ? Math.sin(Math.PI * S.fidgetK) : 0;
    if (S.fidget === 'sway') { var sh = Math.sin(S.fidgetK * TAU) * fk; hipRot += sh * 0.07; px += sh * 0.9; }
    if (S.fidget === 'bounce') { heel = Math.max(0, Math.sin(S.fidgetK * TAU * 2)) * fk * 1.5; }
    /* the runway pose: weight on the back leg, the hip popped out; held,
       the weight drifts a little from hip to hip */
    hipRot += hw * (0.14 + 0.025 * Math.sin(t * 1.6)); px += hw * 1.2;
    var lean = (S.lean || 0) + w * G.lean - hw * 0.05;
    R.squash = S.dip ? Math.sin(Math.PI * S.dip) * 0.04 : 0;
    var hx = LEG.hipX * (1 - 0.22 * yaw);
    var cross = lerp(0.12, G.cross, w);
    var lift = S.shoeLift || 0;
    /* foot targets first, so the pelvis can drop to reach them. A foot
       that has to travel to its spot (stopping, stepping into the pose)
       is lifted over the floor rather than slid along it. */
    var tg = [], i, sd, far = 0, farD = -1, hk = clamp(hw, 0, 1);
    /* the stride runs at full length from the first step (the planted
       foot keeps pace with the floor); in a turn it foreshortens through
       the front view, where forward points at the camera */
    var ta = S.ta === undefined ? 1 : S.ta;
    var stride = (S.stride === undefined ? w : S.stride) * ta, sw = Math.max(w, stride);
    for (i = 0; i < 2; i++) {
      sd = i === 0 ? -1 : 1;
      var u = (ph + (i ? 0.5 : 0)) % 1;
      var fc = footCycle(u, G);
      /* square to the camera the feet stand either side of the centre,
         so the mirror flip mid-turn lands them where they were */
      var base = sd * hx * (1 - cross * ta) + (px * 0.4 + 0.3) * ta;
      var ax = base + fc[0] * stride, ay = -LEG.ankle - lift - fc[1] * sw, ang = fc[2] * sw;
      /* stopping or turning on the spot: the foot holds where it landed,
         then steps home, lifted over the floor */
      var st = S.steps && S.steps[i];
      if (st && st.k < 1) { ax = base + lerp(st.x0, fc[0] * stride, smooth(st.k)); ay -= Math.sin(Math.PI * st.k) * st.h; }
      ay -= Math.max(0, -ang) * 2.0;
      var travel = 0;
      if (hw > 0) {
        var pax = i === 0 ? px + 2.6 : px + 0.6 + hx * 0.4;
        var pay = -LEG.ankle - lift - (i === 0 ? 1.1 : 0);
        travel += Math.abs(pax - ax) * Math.sin(Math.PI * hk);
        ax = lerp(ax, pax, hw); ay = lerp(ay, pay, hw); ang = lerp(ang, i === 0 ? -0.4 : 0.04, hw);
      }
      if (heel) { ay -= heel; ang -= heel * 0.3; }
      if (S.tuck) ay -= S.tuck * (i ? 0.8 : 1);
      if (travel > farD) { farD = travel; far = i; }
      tg.push([ax, ay, ang, sd]);
    }
    tg[far][1] -= Math.min(2.2, farD * 0.32);
    var cy = CH.torsoBot + bob;
    var Lmax = LEG.thigh + LEG.shin - 0.15;
    for (i = 0; i < 2; i++) {
      var hpx0 = px + tg[i][3] * hx, dxl = tg[i][0] - hpx0;
      var need = tg[i][1] - Math.sqrt(Math.max(0, Lmax * Lmax - dxl * dxl));
      if (cy < need) cy = need;
    }
    R.bob = cy - CH.torsoBot;
    R.px = px; R.cy = cy;
    var cr0 = Math.cos(hipRot), sr0 = Math.sin(hipRot);
    for (i = 0; i < 2; i++) {
      sd = tg[i][3];
      var hpx = px + sd * hx * cr0, hpy = cy + sd * hx * sr0;
      var k = ik2(hpx, hpy, tg[i][0], tg[i][1], LEG.thigh, LEG.shin, hpx + 7, hpy + 7);
      var L = R.legs[i];
      L.hx = hpx; L.hy = hpy; L.kx = k[0]; L.ky = k[1]; L.ax = k[2]; L.ay = k[3]; L.ang = tg[i][2]; L.near = i === 0;
    }
    /* torso and shoulders */
    var tr = lean + hipRot * 0.4;
    R.torsoRot = tr;
    var cr = Math.cos(tr), sr = Math.sin(tr);
    var T = function (x, y) { var dy = y - CH.torsoBot; return [px + x * cr - dy * sr, cy + x * sr + dy * cr]; };
    R.breath = br;
    for (i = 0; i < 2; i++) {
      sd = i === 0 ? -1 : 1;
      var A = R.arms[i];
      var shp = T(sd * ARM.shX * (1 - (sd > 0 ? 0.3 : 0.12) * yaw), ARM.shY - br * 0.25);
      /* the arm swings with the opposite leg */
      var other = footCycle((ph + (i ? 0 : 0.5)) % 1, G)[0] / G.A;
      /* the swing grows with the pace and, like the stride, points at
         the camera through a turn */
      var pace = (S.pace === undefined ? 1 : 0.6 + 0.4 * S.pace) * ta;
      var a = (sd < 0 ? -0.09 - 0.06 * (1 - yaw) : 0.13 + 0.07 * (1 - yaw)) + w * G.arm * pace * other + br * 0.015 * sd;
      var e = 0.22 + w * G.elbow * pace * (0.65 + 0.35 * Math.max(0, other));
      if (S.fidget === 'sway') a += sd * fk * 0.05;
      var pw = 0, ptx = 0, pty = 0, phx = 0, phy = 0, open = 0;
      if (i === 0 && ww > 0.001) {
        /* the near hand waves beside her face */
        var wv = Math.sin(t * 9) * 1.4;
        var pt = T(-12.5 + wv * 0.4, -46 + Math.abs(wv) * 0.3), ph2 = T(-15.5, -35);
        pw = ww; ptx = pt[0]; pty = pt[1]; phx = ph2[0]; phy = ph2[1]; open = ww;
      } else if (i === 0 && hw > 0.001) {
        /* hand on the hip: in reach, so the elbow bends out wide */
        var pt2 = T(-7.8, -26.4), ph3 = T(-17, -31);
        pw = hw; ptx = pt2[0]; pty = pt2[1]; phx = ph3[0]; phy = ph3[1];
      } else if (i === 1 && hw > 0.001) {
        var pa = 0.32, pe = 0.28;
        var pex = shp[0] + Math.sin(pa) * ARM.up, pey = shp[1] + Math.cos(pa) * ARM.up;
        pw = hw; ptx = pex + Math.sin(pa + pe) * ARM.fore; pty = pey + Math.cos(pa + pe) * ARM.fore; phx = pex; phy = pey;
      }
      /* into and out of a gesture the arm turns at the shoulder and
         elbow, so the hand sweeps round instead of sliding across her */
      if (pw > 0) {
        var kt = ik2(shp[0], shp[1], ptx, pty, ARM.up, ARM.fore, phx, phy);
        var at = Math.atan2(kt[0] - shp[0], kt[1] - shp[1]);
        var et = Math.atan2(kt[2] - kt[0], kt[3] - kt[1]) - at;
        while (at - a > Math.PI) at -= TAU;
        while (at - a < -Math.PI) at += TAU;
        while (et - e > Math.PI) et -= TAU;
        while (et - e < -Math.PI) et += TAU;
        var pk = smooth(Math.min(1, pw));
        a = lerp(a, at, pk); e = lerp(e, et, pk);
      }
      var ex = shp[0] + Math.sin(a) * ARM.up, ey = shp[1] + Math.cos(a) * ARM.up;
      A.sx = shp[0]; A.sy = shp[1]; A.ex = ex; A.ey = ey;
      A.wx = ex + Math.sin(a + e) * ARM.fore; A.wy = ey + Math.cos(a + e) * ARM.fore;
      A.near = i === 0; A.open = open;
      var fdir = Math.atan2(A.wy - A.ey, A.wx - A.ex);
      var handA = fdir + 0.14;
      if (i === 0 && hw > 0.001 && ww <= 0.001) handA = lerp(handA, fdir + 0.9, Math.min(1, hw));
      if (i === 0 && ww > 0.001) handA = lerp(handA, -Math.PI / 2 + Math.sin(t * 9) * 0.45, Math.min(1, ww));
      A.ha = handA;
      A.hx = A.wx + Math.cos(handA) * 2.6; A.hy = A.wy + Math.sin(handA) * 2.6;
    }
    /* head: steadier than the body, tipping with the pose and glances */
    R.headTilt = -lean * 0.5 - hipRot * 0.3 - hw * 0.09 + ww * 0.05 + Math.sin(t * 0.7) * 0.015 * (1 - w) + (S.headTilt || 0);
    R.headDy = br * 0.18 + (S.lag || 0) * 0.12;
    return R;
  }

  /* Drives the rig over time for a walker: the walk phase from distance
     travelled (so planted feet stay planted), springs for lean, hair,
     hem and bounce, a turn that eases through the front view, pose
     blends, blinks, glances and idle fidgets. */
  function Animator(gait) {
    this.gait = gait || 'run';
    this.t = Math.random() * 20;
    this.phase = 0; this.walkW = 0; this.moving = false;
    this.px = null; this.vel = 0; this.facing = 1; this.turn = 1;
    this.lean = new Spring(11, 0.38);
    this.hairA = new Spring(8, 0.3);
    this.hairB = new Spring(5.5, 0.32);
    this.skirt = new Spring(10, 0.26);
    this.lag = new Spring(14, 0.28);
    this.hipW = new Spring(8.5, 0.42);
    this.waveW = new Spring(10, 0.55);
    this.yaw = new Spring(12, 0.9, 0.4);
    this.tilt = new Spring(8, 0.6);
    this.lookX = new Spring(22, 0.85); this.lookY = new Spring(22, 0.85);
    this.blinkT = 1 + Math.random() * 3; this.blinkK = -1;
    this.lookT = 1.5 + Math.random() * 2; this.lookTX = 0; this.lookTY = 0;
    this.idle = 0; this.fidget = null; this.fidgetK = 0; this.fidgetDur = 1; this.fidgetT = 4 + Math.random() * 3;
    this.dip = 0; this.pose = 'walk';
    /* turbo: boostT is set by the player each tick, boost eases after it */
    this.boost = 0; this.boostT = 0;
    /* stride: 1 while the gait drives the feet. steps: each foot's hold
       and step home (k 0..1, from x0, after wait, lifted by h). pace:
       cadence as a share of the gait's cap, for the arm swing. */
    this.stride = 0; this.pace = 0;
    this.steps = [{ k: 1, x0: 0, wait: 0, h: 0, d: 0.15 }, { k: 1, x0: 0, wait: 0, h: 0, d: 0.15 }];
    /* half a turn's length in seconds; the runway's pivot is slower */
    this.turnTime = 0.1;
    /* render interpolation: the engine draws between the last two
       fixed ticks, so the phase and clock blend by alpha */
    this.alpha = 1; this.p0 = 0; this.t0 = this.t;
    this.S = { look: [0, 0] };
  }
  Animator.prototype.footX = function (i, G) {
    var st = this.steps[i];
    var gx = footCycle((this.phase + (i ? 0.5 : 0)) % 1, G)[0] * this.stride * smooth(Math.abs(this.turn));
    return st.k < 1 ? lerp(st.x0, gx, smooth(st.k)) : gx;
  };
  Animator.prototype.step = function (dt, x, moving, facing, scale, pose) {
    this.boost += (this.boostT - this.boost) * Math.min(1, dt * 10);
    var G = gaitAt(this.gait, this.boost);
    var i, st;
    this.p0 = this.phase; this.t0 = this.t;
    this.t += dt;
    if (this.px === null) this.px = x;
    var dx = x - this.px;
    this.px = x;
    var v = dx / dt;
    this.vel = v;
    var su = Math.abs(dx) / (scale || 1);
    if (moving && su > 0) {
      if (!this.stride) {
        /* from a stand: the near foot is planted under her and the far
           one passing it, which is the standing pose, so the first step
           starts without a slide. A foot still stepping home finishes
           into the stride. */
        for (i = 0; i < 2; i++) {
          st = this.steps[i];
          if (st.k < 1) { st.x0 = this.footX(i, G); st.k = 0; st.wait = 0; st.d = 0.12; }
        }
        this.phase = this.p0 = G.sigma / 2;
        this.stride = 1;
      }
      var adv = Math.min(su / G.cycle, G.rate * dt);
      this.pace += (adv / (G.rate * dt) - this.pace) * Math.min(1, dt * 8);
      /* reversing at speed: until the turn swings her round she steps
         backwards, so the planted foot still keeps to the floor */
      var back = dx * (this.turn >= 0 ? 1 : -1) < 0;
      this.phase = (this.phase + (back ? 1 - adv : adv)) % 1;
    } else if (!moving && this.stride) {
      /* stopping: both feet hold where they are; the one in the air (or
         the trailing one) steps home first, the other follows */
      var xs = [this.footX(0, G), this.footX(1, G)];
      var air0 = this.phase >= G.sigma, air1 = (this.phase + 0.5) % 1 >= G.sigma;
      var first = air0 && !air1 ? 0 : air1 && !air0 ? 1 : xs[0] < xs[1] ? 0 : 1;
      this.stride = 0;
      for (i = 0; i < 2; i++) {
        st = this.steps[i];
        st.x0 = xs[i]; st.k = Math.abs(xs[i]) < 0.4 ? 1 : 0;
        st.wait = i === first ? 0 : G.step * 0.7; st.d = G.step;
        st.h = clamp(Math.abs(xs[i]) * 0.3, 0.6, 2.2);
      }
    }
    if (!moving) this.pace = Math.max(0, this.pace - dt * 4);
    /* turning on the spot: two small steps round */
    if (!moving && facing !== this.facing) {
      for (i = 0; i < 2; i++) {
        st = this.steps[i];
        if (st.k < 1) continue;
        st.x0 = 0; st.k = 0; st.wait = i * G.step * 0.6; st.d = G.step; st.h = 1.4;
      }
    }
    for (i = 0; i < 2; i++) {
      st = this.steps[i];
      if (st.k >= 1) continue;
      if (st.wait > 0) st.wait -= dt;
      else st.k = Math.min(1, st.k + dt / st.d);
    }
    this.moving = moving;
    this.walkW = clamp(this.walkW + (moving ? dt / 0.1 : -dt / 0.15), 0, 1);
    /* the turn eases through the front view, where the mirror flips */
    this.facing = facing;
    if (this.turn !== facing) {
      var before = this.turn;
      this.turn += (facing > this.turn ? 1 : -1) * dt / this.turnTime;
      if ((facing - this.turn) * (facing - before) <= 0) this.turn = facing;
      if (before * this.turn <= 0 && before !== 0) this.dip = 1;
    }
    this.dip = Math.max(0, this.dip - dt / 0.24);
    this.lean.step(clamp(v / 320, -1.2, 1.2) * G.lean * 0.9, dt);
    /* at a turbo sprint the hair and the hem stream further back */
    var hm = 0.16 + 0.08 * this.boost, sm = 2.8 + 1.2 * this.boost;
    this.hairA.step(clamp(v * 0.00026 * (1 + 0.4 * this.boost), -hm, hm), dt);
    this.hairB.step(this.hairA.x * 1.1, dt);
    this.skirt.step(clamp(-v * 0.0068, -sm, sm), dt);
    this.lag.step(gaitBob(this.gait, this.phase, this.walkW), dt);
    this.pose = pose || 'walk';
    this.hipW.step(this.pose === 'pose' ? 1 : 0, dt);
    this.waveW.step(this.pose === 'wave' ? 1 : 0, dt);
    /* idle life: glances, blinks and the odd fidget */
    if (moving || this.pose !== 'walk') { this.idle = 0; if (this.fidget) this.fidget = null; }
    else this.idle += dt;
    this.lookT -= dt;
    if (this.lookT <= 0) {
      var picks = moving ? [[0.6, 0]] : [[0, 0], [0.9, 0.1], [-0.8, 0], [0.5, -0.7], [0, 0.4], [0, 0]];
      var pk = picks[Math.floor(Math.random() * picks.length)];
      this.lookTX = pk[0]; this.lookTY = pk[1];
      this.lookT = moving ? 0.6 : 0.8 + Math.random() * 1.8;
      if (!moving && Math.random() < 0.35 && this.blinkK < 0) this.blinkT = 0.04;
    }
    var fidLook = this.fidget === 'look' ? Math.sin(Math.PI * this.fidgetK) : 0;
    this.lookX.step(this.lookTX * (1 - fidLook), dt);
    this.lookY.step(this.lookTY * (1 - fidLook), dt);
    var yt = this.pose === 'pose' ? 0.06 : this.pose === 'wave' ? 0.18 : moving ? G.yaw : 0.4;
    yt = lerp(yt, 0, fidLook) + (moving ? 0 : this.lookTX * 0.08);
    this.yaw.step(yt, dt);
    this.tilt.step(this.pose === 'walk' && !moving ? this.lookTY * -0.05 + fidLook * 0.08 : 0, dt);
    this.blinkT -= dt;
    if (this.blinkK >= 0) {
      this.blinkK += dt;
      if (this.blinkK > 0.17) { this.blinkK = -1; this.blinkT = Math.random() < 0.2 ? 0.12 : 2 + Math.random() * 3.2; }
    } else if (this.blinkT <= 0) this.blinkK = 0;
    if (this.fidget) {
      this.fidgetK += dt / this.fidgetDur;
      if (this.fidgetK >= 1) { this.fidget = null; this.fidgetT = 4 + Math.random() * 4; }
    } else if (this.idle > 2.5) {
      this.fidgetT -= dt;
      if (this.fidgetT <= 0) {
        var kinds = ['sway', 'bounce', 'look'];
        this.fidget = kinds[Math.floor(Math.random() * kinds.length)];
        this.fidgetK = 0;
        this.fidgetDur = this.fidget === 'sway' ? 2.6 : this.fidget === 'bounce' ? 1.3 : 1.8;
      }
    }
  };
  Animator.prototype.state = function () {
    var S = this.S;
    var f = this.turn > 0 ? 1 : this.turn < 0 ? -1 : this.facing;
    var ta = smooth(Math.abs(this.turn));
    var al = this.alpha, dp = this.phase - this.p0;
    if (dp < -0.5) dp += 1;
    S.t = this.t0 + (this.t - this.t0) * al; S.f = f; S.gait = this.gait;
    S.yaw = clamp(this.yaw.x, 0, 1) * ta;
    S.ta = ta; S.stride = this.stride; S.steps = this.steps; S.pace = this.pace; S.boost = this.boost;
    S.phase = Math.abs(dp) > 0.3 ? this.phase : (this.p0 + dp * al) % 1; S.walkW = this.walkW;
    S.lean = this.lean.x * f;
    S.hairA = this.hairA.x * f; S.hairB = this.hairB.x * f; S.skirt = this.skirt.x * f;
    S.lag = this.lag.x - gaitBob(this.gait, S.phase, this.walkW);
    S.hipW = this.hipW.x; S.waveW = this.waveW.x;
    var bk = this.blinkK;
    S.blink = bk < 0 ? 0 : bk < 0.06 ? bk / 0.06 : bk < 0.09 ? 1 : 1 - (bk - 0.09) / 0.08;
    S.look[0] = this.lookX.x; S.look[1] = this.lookY.x;
    S.fidget = this.fidget; S.fidgetK = this.fidgetK;
    S.dip = this.dip;
    S.headTilt = this.tilt.x;
    return S;
  };

  /* A pose for callers without an animator (tiles, portraits, menus):
     frame 1..4 is a stride, 0 stands; opts.t (60 Hz frames) breathes. */
  var STATIC = { look: [0, 0] };
  function staticState(frame, facing, blink, opts) {
    var S = STATIC;
    var walking = frame > 0;
    S.t = (opts.t || 0) / 60;
    S.f = facing || 1;
    S.gait = opts.gait || 'run';
    S.yaw = opts.yaw !== undefined ? opts.yaw : walking ? 0.7 : 0;
    S.phase = walking ? ((frame - 1) % 4) / 4 + 0.05 : 0;
    S.walkW = walking ? 1 : 0;
    S.lean = 0;
    S.hairA = walking ? 0.1 : Math.sin(S.t * 1.3) * 0.02;
    S.hairB = walking ? 0.12 : 0;
    S.skirt = walking ? -1.4 : 0;
    S.lag = 0;
    S.hipW = opts.pose === 'pose' ? 1 : 0;
    S.waveW = opts.pose === 'wave' ? 1 : 0;
    S.blink = blink ? 1 : 0;
    S.look[0] = 0; S.look[1] = 0;
    S.fidget = null; S.fidgetK = 0; S.dip = 0; S.headTilt = 0;
    S.ta = 1; S.stride = S.walkW; S.steps = null; S.pace = 1; S.boost = 0;
    return S;
  }

  function shoeLiftOf(cust) { return cust.shoes === 'rollerSkates' ? 2.6 : cust.shoes === 'geta' ? 2.5 : cust.shoes === 'sparkleHeels' ? 1.6 : 0; }

  /* A happy hop on a loop of `period` frames: a crouch, a stretched
     take-off, a round apex and a squashed landing. Returns the shared
     { lift (px), squash } for drawCharacter's lift and opts.squash. */
  var HOP = { lift: 0, squash: 0 };
  function hop(f, period, height) {
    var u = ((f % period) + period) % period / period, k;
    HOP.lift = 0;
    if (u < 0.16) { k = u / 0.16; HOP.squash = 0.07 * Math.sin(Math.PI * k); }
    else if (u < 0.76) {
      k = (u - 0.16) / 0.6;
      HOP.lift = height * 4 * k * (1 - k);
      HOP.squash = -0.045 * Math.abs(1 - 2 * k);
    } else { k = (u - 0.76) / 0.24; HOP.squash = 0.08 * Math.sin(Math.PI * k) * (1 - 0.4 * k); }
    return HOP;
  }

  /* frame: 0..4 walk frame for callers without an animator (0 stands).
     facing: 1 right, -1 left. lift raises the body for a hop while the
     shadow stays put. opts: { pose: 'walk'|'pose'|'wave', t: 60 Hz frame
     counter, anim: Animator (overrides frame/facing/blink), noShadow,
     yaw: head turn for static callers, squash: + squash / - stretch
     about the feet (see hop) } */
  function drawCharacter(c, x, y, cust, frame, facing, scale, blink, lift, opts) {
    if (!cust) cust = Game.DEFAULT_LOOK;
    opts = opts || {};
    var S = opts.anim ? opts.anim.state() : staticState(frame, facing, blink, opts);
    S.shoeLift = shoeLiftOf(cust);
    var sc = scale || 1;
    /* off the floor the knees tuck up a little */
    S.tuck = lift > 0 ? lift / sc * 0.22 : 0;
    var R = buildRig(S, cust);
    if (opts.squash) R.squash += opts.squash;
    MOTION.t = S.t;
    MOTION.moving = S.walkW > 0.5;
    MOTION.yaw = S.yaw;
    MOTION.hairA = S.hairA + S.walkW * 0.025 * Math.sin(S.phase * TAU * 2) + (1 - S.walkW) * Math.sin(S.t * 1.4) * 0.018 + S.boost * 0.02 * Math.sin(S.t * 17);
    MOTION.hairB = S.hairB;
    MOTION.skirt = S.skirt;
    MOTION.swing = -S.skirt * 1.4;
    MOTION.lag = S.lag;
    MOTION.flare = clamp(-S.lag * 0.9, -0.6, 1.6) + S.walkW * 0.5 * Math.abs(Math.sin(S.phase * TAU));
    MOTION.blink = S.blink;
    MOTION.look = S.look;
    var inkWas = inkMul;
    inkMul = 0.36;
    c.save();
    c.translate(x, y);
    c.scale(sc * R.f, sc);
    if (!opts.noShadow) {
      var lf = (lift || 0) - R.bob * 0.5;
      softShadow(c, R.px * 0.5, 1, 18 - lf * 0.4, 4.6, 0.3);
      for (var si = 0; si < 2; si++) {
        var Lg = R.legs[si], gy = -Lg.ay - LEG.ankle - S.shoeLift;
        if (gy < 6) softShadow(c, Lg.ax + 1.2, 0.5, 5.5 - gy * 0.4, 1.8, 0.32 * (1 - gy / 6));
      }
    }
    if (lift) c.translate(0, -lift);
    if (R.squash) c.scale(1 + R.squash * 0.6, 1 - R.squash);

    var tf = function () {
      c.translate(R.px, R.cy);
      c.rotate(R.torsoRot);
      c.translate(0, -CH.torsoBot);
      var b = R.breath * 0.008;
      if (b) { c.translate(0, CH.torsoBot); c.scale(1 - b * 0.4, 1 + b); c.translate(0, -CH.torsoBot); }
    };
    var hf = function () {
      tf();
      c.translate(0, R.headDy + CH.torsoTop);
      c.rotate(R.headTilt);
      c.translate(0, -CH.torsoTop);
    };
    var lag = function (anchor, depth, k, fn) {
      var kx = MOTION.skirt * k / depth;
      if (kx) { c.save(); c.translate(0, anchor); c.transform(1, 0, kx, 1, 0, 0); c.translate(0, -anchor); fn(); c.restore(); }
      else fn();
    };

    /* behind the body: cape, trailing bows, a pack, the back hair, then
       wings and tails over the hair */
    c.save();
    tf();
    lag(CH.torsoTop, 30, 1.5, function () { drawJacketBack(c, cust); });
    lag(CH.torsoBot - 6, 18, 1, function () { drawDressBack(c, cust); });
    drawBagBack(c, cust);
    c.restore();
    c.save();
    hf();
    drawHair(c, cust, true);
    c.restore();
    c.save();
    tf();
    drawAccessoryBack(c, cust);
    c.restore();

    /* far arm and both legs; a poncho hangs over the near arm too */
    var NA = R.arms[0], armUnder = cust.jacket === 'poncho';
    drawArmRig(c, cust, R.arms[1]);
    for (var li = 1; li >= 0; li--) {
      drawLeg(c, cust, R.legs[li]);
      drawPantsLeg(c, cust, R.legs[li]);
      drawShoe(c, cust, R.legs[li]);
    }
    if (armUnder) drawArmRig(c, cust, NA);

    /* torso and clothes */
    c.save();
    tf();
    drawPantsTop2(c, cust);
    drawBaseLayer(c, cust);
    drawPantsTop(c, cust);
    lag(CH.torsoBot - 7, 15, 1, function () { drawSkirt(c, cust); });
    lag(CH.torsoTop, 26, 1, function () { drawDress(c, cust); });
    lag(CH.torsoTop, 30, 0.6, function () { drawJacketFront(c, cust); });
    drawAccessoryNeck(c, cust);
    drawBagFront(c, cust);
    /* the head's shadow on the shoulders, whatever she is wearing */
    c.save();
    c.beginPath(); c.rect(-9, CH.torsoTop - 3, 18, 9); c.clip();
    c.globalAlpha = 0.1;
    fillEllipse(c, 1 + MOTION.yaw, CH.torsoTop + 2.2, 8, 3.4, '#2a1030', false);
    c.globalAlpha = 0.18;
    fillEllipse(c, 0.8 + MOTION.yaw, CH.torsoTop + 1.2, 6.5, 2.2, '#2a1030', false);
    c.restore();
    c.restore();

    /* head */
    c.save();
    hf();
    drawEarFar(c, cust);
    drawHeadBall(c, cust);
    drawEarNear(c, cust);
    drawSideLocks(c, cust);
    drawHair(c, cust, false);
    if (!LOW) {
      drawHairGloss(c, cust);
      drawFace(c, cust);
    }
    drawAnimalEars(c, cust);
    if (!LOW) drawAccessoryFace(c, cust);
    if (!(cust.mannequin && !cust.showHat)) {
      c.save();
      c.translate(MOTION.yaw * 0.8, -MOTION.lag * 0.25);
      drawHat(c, cust);
      c.restore();
    }
    c.restore();

    c.save();
    tf();
    drawAccessoryOver(c, cust);
    c.restore();

    /* near arm, and whatever it holds */
    if (!armUnder) drawArmRig(c, cust, NA);
    drawHeld(c, cust, { x: NA.hx, y: NA.hy, a: NA.ha });

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
    var o = {};
    if (opts) for (var k in opts) o[k] = opts[k];
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
  /* What a wardrobe tile frames, per station and per item: [x, y, span]
     in the figure's own units (feet at 0, the head near -47), so a pair
     of earrings fills its tile as well as a ball gown fills its own. */
  var FOCUS = {
    hair: [0, -45, 58], eyes: [0, -45, 20], nose: [0, -40.5, 18], mouth: [0, -39.5, 18], ears: [0, -57, 42],
    dress: [0, -20.5, 42], pants: [0, -12.5, 38], jacket: [0, -24, 38], shoes: [1.5, -4.5, 20],
    hat: [0, -57, 44], bag: [9.5, -21, 34], extra: [0, -40, 56],
  };
  var FOCUS_ITEM = {
    ears: { round: [0, -47, 36], elf: [0, -48, 40], bunny: [0, -62, 50], deer: [0, -60, 46] },
    dress: { none: [0, -24, 46], ballgown: [0, -20, 48] },
    pants: { none: [0, -14, 40] },
    jacket: { none: [0, -25, 40], cape: [0, -22, 46], trench: [0, -22, 40] },
    shoes: { boots: [1.5, -7, 24], rainBoots: [1.5, -7, 24], fluffyBoots: [1.5, -7, 24], loafers: [1.5, -7.5, 25], geta: [1.5, -6.5, 24], starBoots: [1.5, -6, 22], wingShoes: [0.5, -5.5, 22], rollerSkates: [1.5, -6.5, 24] },
    hat: { partyHat: [0, -62, 52], unicorn: [0, -62, 52], witchHat: [2, -61, 56], topHat: [0, -60, 50], halo: [0, -59, 46],
      strawHat: [0, -57, 54], sunHat: [0, -56, 58], cowboyHat: [0, -57, 56], hairClips: [0, -51, 36], sideRibbon: [-5, -52, 36],
      headband: [0, -54, 38], earmuffs: [0, -49, 40], kerchief: [2, -52, 42] },
    bag: { none: [0, -24, 46], backpack: [0, -27, 40], randoseru: [0, -27, 40], tote: [-9, -10.5, 28], basket: [-9, -11.5, 27], handbag: [-9, -10.5, 28],
      shoppingBags: [-9, -11, 28], bouquet: [-8, -23, 28], balloon: [-13, -50, 60], waistBag: [3, -22, 30] },
    extra: { glasses: [0, -45, 30], sunglasses: [0, -45, 30], heartGlasses: [0, -45, 30], starGlasses: [0, -45, 30],
      necklace: [0, -30, 24], pearls: [0, -29.5, 24], locket: [0, -29.5, 24], bowTie: [0, -31, 24], flowerLei: [0, -29, 26], scarf: [-1, -30, 28],
      wings: [0, -38, 64], butterfly: [0, -38, 62], angelWings: [0, -34, 62], kittyTail: [-11, -22, 40], wand: [-15, -36, 40],
      parasol: [-19, -42, 56], teddy: [-9, -6.5, 30], lollipop: [-12, -32, 34], bangles: [-9, -22, 20] },
  };
  function tileFocus(stationId, cust) {
    var st = null, i;
    for (i = 0; i < Game.STATIONS.length; i++) if (Game.STATIONS[i].id === stationId) st = Game.STATIONS[i];
    var item = st && st.field ? cust[st.field] : null;
    return (FOCUS_ITEM[stationId] && FOCUS_ITEM[stationId][item]) || FOCUS[stationId] || [0, -30, 70];
  }
  function drawLookTile(c, cx, cy, size, cust, stationId, opts) {
    opts = opts || {};
    if (opts.t !== undefined) { paintLookTile(c, cx, cy, size, cust, stationId, opts); return; }
    var key = 't|' + stationId + '|' + size + '|' + (opts.round ? 1 : 0) + '|' + (opts.bg === false ? 0 : 1) + '|' + (opts.zoom ? 1 : 0) + '|' +
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
    if (opts.zoom) {
      /* wardrobe tiles frame the item itself */
      var F = tileFocus(stationId, cust);
      sc = size / F[2];
      drawCharacter(c, cx - F[0] * sc, cy - F[1] * sc, cust, 0, 1, sc, false, 0, { noShadow: true });
      c.restore();
      return;
    }
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
    var look = JSON.parse(JSON.stringify(Game.DEFAULT_LOOK)), by = {};
    for (var i = 0; i < Game.STATIONS.length; i++) {
      var st = Game.STATIONS[i];
      if (st.field && st.variants.length) look[st.field] = pick(st.variants);
      if (st.colorField && st.colors) look[st.colorField] = pick(st.colors);
      /* most cloth stays plain, so a print is a treat */
      if (st.patternField) look[st.patternField] = rnd() < 0.55 ? 'plain' : pick(Game.PATTERNS.slice(1));
      by[st.field] = st;
    }
    if (look.dress === 'none' && look.pants === 'none') {
      if (rnd() < 0.6) look.dress = pick(by.dress.variants.slice(1));
      else look.pants = pick(by.pants.variants.slice(1));
    }
    if (look.shoes === 'none') look.shoes = pick(by.shoes.variants.slice(1));
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
    /* dust puffs drift and slow instead of falling */
    if (this.kind === 'puff') { this.vx *= 0.92; this.vy *= 0.92; this.life--; return; }
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
    } else if (this.kind === 'puff') {
      c.globalAlpha = a * 0.7;
      c.beginPath();
      c.arc(this.x, this.y, this.size * (1.6 - a * 0.8), 0, Math.PI * 2);
      c.fill();
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
  function Walker(x, y, gait) {
    this.x = x;
    this.y = y;
    this.facing = 1;
    this.frame = 0;
    this.animTimer = 0;
    this.blink = false;
    this.scale = 1;
    this.anim = new Animator(gait);
  }
  /* Called once per fixed 60 Hz update: the animator works in seconds
     and reads the distance actually travelled. `frame` is kept for any
     caller that still wants a coarse walk frame. */
  Walker.prototype.animate = function (moving, pose) {
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
    this.anim.step(1 / 60, this.x, moving, this.facing, this.scale, pose);
    this.blink = this.anim.blinkK >= 0;
  };

  var SPEED = 5.4;
  /* Turbo: holding one direction for 5 s starts her top speed ramping,
     smoothly, up to double at 10 s (60 Hz ticks). Letting go, or turning
     round, puts her back to walking pace with the timer at zero. */
  var TURBO_AT = 300, TURBO_FULL = 600, COAST = 15;

  function Player(x, y) {
    Walker.call(this, x, y, 'run');
    this.scale = 1.85;
    this.v = 0; this.holdDir = 0; this.holdT = 0; this.turbo = 1;
    this.coastV = 0; this.coastK = 0; this.coastN = 0;
  }
  Player.prototype = Object.create(Walker.prototype);
  Player.prototype.constructor = Player;
  Player.prototype.update = function (keys, minX, maxX) {
    var x0 = this.x;
    var dir = keys.left && !keys.right ? -1 : keys.right && !keys.left ? 1 : 0;
    if (dir !== this.holdDir) {
      /* out of a boost she coasts down over up to a quarter second
         instead of stopping dead; from walking pace nothing coasts */
      var over = Math.abs(this.v) / SPEED - 1;
      this.coastV = this.v; this.coastK = 0;
      this.coastN = over > 0 ? Math.ceil(COAST * Math.min(1, over)) : 0;
      this.holdDir = dir; this.holdT = 0;
    }
    var coast = 0;
    if (this.coastK < this.coastN) {
      this.coastK++;
      var u = 1 - this.coastK / this.coastN;
      coast = this.coastV * u * u;
    }
    if (dir) {
      this.holdT++;
      this.turbo = 1 + smooth((this.holdT - TURBO_AT) / (TURBO_FULL - TURBO_AT));
      var want = dir * SPEED * this.turbo;
      this.v = coast * dir > want * dir ? coast : want;
      this.facing = dir;
    } else {
      this.turbo = 1;
      this.v = coast;
    }
    this.x += this.v;
    if (this.x < minX || this.x > maxX) {
      this.x = clamp(this.x, minX, maxX);
      this.v = 0; this.coastN = 0;
    }
    this.anim.boostT = clamp(Math.abs(this.v) / SPEED - 1, 0, 1);
    this.animate(this.x !== x0);
  };
  /* Outside her own walk (puzzle, wardrobe, show, pause) the hold
     timer can't run on, so coming back always starts at walking pace. */
  Player.prototype.stopTurbo = function () {
    this.v = 0; this.holdDir = 0; this.holdT = 0; this.turbo = 1;
    this.coastN = 0; this.anim.boostT = 0;
  };
  Player.prototype.draw = function (c, cust, scale, t) {
    this.scale = scale || 1;
    if (this.anim.boost > 0.02) drawSpeedLines(c, this);
    drawCharacter(c, this.x, this.y, cust, this.frame, this.facing, this.scale, this.blink, 0, { t: t, anim: this.anim });
  };
  /* Turbo cue behind her: a few soft speed lines drifting off her back,
     longer and brighter as the boost builds. */
  function drawSpeedLines(c, p) {
    var A = p.anim, b = A.boost, f = p.facing, sc = p.scale;
    var at = A.t0 + (A.t - A.t0) * A.alpha;
    c.save();
    c.lineCap = 'round';
    for (var i = 0; i < 4; i++) {
      var k = (at * 2.6 + i * 0.37) % 1;
      var y = p.y - sc * (16 + i * 10);
      var x0 = p.x - f * sc * (10 + k * 22);
      var len = sc * (10 + 16 * b) * (0.7 + 0.3 * Math.sin(i * 2.1 + 1));
      var al = b * Math.sin(Math.PI * k);
      /* a white glow with a pink core, so they read on the pale walls
         and on the booths alike */
      c.beginPath();
      c.moveTo(x0, y);
      c.lineTo(x0 - f * len, y);
      c.globalAlpha = al * 0.55;
      c.strokeStyle = '#ffffff';
      c.lineWidth = sc * (2.2 - i * 0.2);
      c.stroke();
      c.globalAlpha = al * 0.6;
      c.strokeStyle = '#f08cc8';
      c.lineWidth = sc * (0.9 - i * 0.08);
      c.stroke();
    }
    c.restore();
  }

  /* A runway model: struts toward targetX, easing into the stop so the
     springs settle her, then holds. */
  function Model(x, y, look, name) {
    Walker.call(this, x, y, 'cat');
    this.look = look;
    this.name = name;
    this.targetX = x;
    this.speed = 2.2;
    this.v = 0;
    this.pose = 'walk';
    this.scale = 1.75;
    /* the pivot at the end of the catwalk is unhurried */
    this.anim.turnTime = 0.24;
  }
  Model.prototype = Object.create(Walker.prototype);
  Model.prototype.constructor = Model;
  Model.prototype.update = function () {
    var dx = this.targetX - this.x, dist = Math.abs(dx);
    var want = dist > 0.4 ? Math.min(this.speed, Math.max(0.55, dist * 0.085)) : 0;
    this.v += (want - this.v) * 0.18;
    var moving = false;
    if (dist <= Math.max(0.4, this.v * 0.5)) {
      this.x = this.targetX;
      this.v = 0;
    } else {
      this.x += (dx > 0 ? 1 : -1) * Math.min(this.v, dist);
      this.facing = dx > 0 ? 1 : -1;
      moving = true;
    }
    this.animate(moving, this.pose);
    return !moving;
  };
  /* Between phases the runway still ticks a standing model so her
     springs, blinks and pose blends keep living. */
  Model.prototype.idle = function () { this.animate(false, this.pose); };
  Model.prototype.arrived = function () { return Math.abs(this.targetX - this.x) <= 0.4; };
  Model.prototype.draw = function (c, scale, lift, t, squash) {
    this.scale = scale;
    drawCharacter(c, this.x, this.y, this.look, this.frame, this.facing, scale, this.blink, lift, { pose: this.pose, t: t, anim: this.anim, squash: squash });
  };

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
    hop: hop,
    setLowDetail: setLowDetail,
    isLowDetail: isLowDetail,
    drawPortrait: drawPortrait,
    drawReflection: drawReflection,
    drawLookTile: drawLookTile,
    trimOf: trimOf,
    drawPattern: drawPattern,
    jewel: jewel,
    fluffPath: fluffPath,
    randomLook: randomLook,
    Particle: Particle,
    spawnBurst: spawnBurst,
    Player: Player,
    TURBO_AT: TURBO_AT,
    Model: Model,
    Animator: Animator,
    _rig: RIG,   /* debug: the last rig drawn, for the motion probes */
  };
})();
