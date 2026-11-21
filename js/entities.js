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
    var len = (hs === 'bob' || hs === 'longWavy' || hs === 'longBraids' || hs === 'longStraight' || hs === 'halfUp' || hs === 'drills') ? 13.5 : 9;
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

  var CROWN_HATS = { strawHat: 1, beret: 1, cap: 1, beanie: 1, witchHat: 1, sunHat: 1 };
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
              ['Q', r + 9, hy + 2, r + 6, hy + 12],
              ['Q', r + 12, hy + 22, r + 7, hy + 32],
              ['Q', r + 10, hy + 40, r + 4, hy + 44],
              ['Q', r - 0.5, hy + 42, r - 5, hy + 44],
              ['Q', r - 3, hy + 24, r - 1, hy + 6],
            ] : [
              ['M', r - 4, hy - 8],
              ['Q', r + 6, hy - 2, r + 5.5, hy + 12],
              ['Q', r + 6, hy + 30, r + 5.5, hy + 42],
              ['Q', r + 1, hy + 42.8, r - 4.5, hy + 42],
              ['Q', r - 2.6, hy + 24, r - 1, hy + 6],
            ];
            hairLock(c, segs, sd, col, r - 2, hy - 4, [A * 0.6 - sd * fl * 0.3, B * 0.7],
              [[r + 1, hy + 6, r + 7, hy + 18, r + 2, hy + 30], [r - 1, hy + 4, r + 3, hy + 22, r, hy + 38], [r + 3, hy, r + 5, hy + 20, r + 3, hy + 40]], 46);
          }
          if (cust.hairStyle === 'halfUp') {
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
      if (cust.hairStyle !== 'curly' && !cust.mannequin && !CROWN_HATS[cust.hat]) {
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
          ribbonBow(c, -1 - yaw * 1.5, hy - r - 2.5, 3.2, PAL.pinkDeep, true);
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
    var light = shade(cust.pantsColor, 30);
    var path;
    switch (cust.pants) {
      case 'jeans':
      case 'overalls':
        path = function () { legPath(c, L, 0.75); };
        celPart(c, path, col, { dx: -1, dy: -0.5 });
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
        celPart(c, function () { legPath(c, L, 0.3); }, col, { dx: -1, dy: -0.5 });
        break;
      case 'stripey':
        path = function () { legPath(c, L, 0.3); };
        path();
        c.fillStyle = col; c.fill();
        c.save();
        path(); c.clip();
        c.fillStyle = PAL.cream;
        for (var y = -20; y < 0; y += 3) c.fillRect(-12, y + 0.4, 24, 1.5);
        c.restore();
        celBands(c, path, col, -1, -0.5, false, 0.7);
        path(); c.fillStyle = col; ink(c, 2);
        break;
      case 'joggers':
        celPart(c, function () { legPath(c, L, 1.0); }, col, { dx: -1, dy: -0.5 });
        if (!LOW) {
          c.strokeStyle = PAL.cream; c.lineWidth = 0.9;
          c.beginPath();
          c.moveTo(L.hx - 2.6, L.hy + 1.5);
          c.quadraticCurveTo(L.kx - 2.8, L.ky, L.ax - 2, L.ay - 2.4);
          c.stroke();
        }
        legBand(c, L, 0.9, 2.2, 0.55, shade(cust.pantsColor, -14));
        break;
      case 'shorts':
        celPart(c, function () { legTopPath(c, L, 0.42, 1.25); }, col, { dx: -0.9, dy: -0.4 });
        break;
      case 'none':
        break;
    }
  }

  /* The seat of whatever she wears on her legs, over the tops of both
     thighs so trouser legs join at the hip. Drawn in the torso frame. */
  function drawPantsTop2(c, cust) {
    var p = cust.pants;
    if (p === 'skirt' || p === 'poofySkirt' || p === 'denimSkirt' || p === 'ruffleSkirt') return;
    var col = p === 'none' ? (cust.mannequin ? '#f7f0f6' : PAL.cream) : cust.pantsColor;
    var bot = CH.torsoBot;
    var top = p === 'shorts' || p === 'none' ? bot - 4 : bot - 6;
    var hw = p === 'none' ? 7.2 : 8.2;
    celPart(c, function () {
      c.beginPath();
      c.moveTo(-hw, top);
      c.lineTo(hw, top);
      c.quadraticCurveTo(hw + 1, bot - 1, hw - 0.6, bot + 3);
      c.quadraticCurveTo(3.5, bot + 4, 0.6, bot + 2);
      c.lineTo(-0.6, bot + 2);
      c.quadraticCurveTo(-3.5, bot + 4, -hw + 0.6, bot + 3);
      c.quadraticCurveTo(-hw - 1, bot - 1, -hw, top);
      c.closePath();
    }, col, { dx: -1.4, dy: -1, s: 0.8 });
    if (p === 'jeans' || p === 'joggers' || p === 'shorts') {
      fillRound(c, -8.4, top - 0.4, 16.8, 2.2, 1, shade(col, -18), false);
    }
    if (p === 'jeans') {
      c.strokeStyle = shade(col, 30); c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(-6, top + 2.2); c.quadraticCurveTo(-4.5, top + 4.5, -2.2, top + 4.5); c.stroke();
      fillEllipse(c, 0, top + 0.7, 0.8, 0.8, PAL.gold, false);
    }
    if (p === 'joggers') {
      c.strokeStyle = PAL.cream; c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(-1, top + 1.6); c.lineTo(-1.6, top + 4); c.moveTo(1, top + 1.6); c.lineTo(1.6, top + 4); c.stroke();
    }
  }

  /* Skirts sit at the waist, over the camisole hem, so the whole skirt
     shows instead of the sliver that peeked out below the top. */
  function drawSkirt(c, cust) {
    var p = cust.pants;
    if (p !== 'skirt' && p !== 'poofySkirt' && p !== 'denimSkirt' && p !== 'ruffleSkirt') return;
    var col = cust.pantsColor, dark = shade(col, -20), light = shade(col, 25);
    var bot = CH.torsoBot, waist = bot - 7;
    var fl = MOTION.flare;
    if (p === 'skirt') {
      shadedFill(c, polyPath(c, [[-9, waist], [9, waist], [15 + fl, bot + 7], [-15 - fl, bot + 7]]), col, 2, { drape: [waist, bot + 7, 15] });
      /* pleats */
      c.strokeStyle = shadowCached(col, 30, false); c.lineWidth = 0.6;
      c.beginPath();
      for (var k = -2; k <= 2; k++) { c.moveTo(k * 3.4, waist + 3); c.lineTo(k * 5.6, bot + 6.5); }
      c.stroke();
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
  }

  /* Overall bib goes over the camisole but under any dress or jacket. */
  function drawPantsTop(c, cust) {
    if (cust.pants !== 'overalls') return;
    var col = cust.pantsColor, top = CH.torsoTop;
    celPart(c, rrPath(c, -7.6, top + 1, 3.2, 10, 1.4), col, { rim: false, ink: 1.6 });
    celPart(c, rrPath(c, 4.4, top + 1, 3.2, 10, 1.4), col, { rim: false, ink: 1.6 });
    celPart(c, rrPath(c, -8.6, top + 8, 17.2, 11, 3), col, { dx: -1.4, dy: -1.2 });
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
        /* crossed collar (the wide sleeves hang from the arms) */
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
  function jacketHasSleeves(j) { return j !== 'none' && j !== 'cape' && j !== 'vest'; }

  function drawJacketBack(c, cust) {
    var col = cust.jacketColor, top = CH.torsoTop;
    if (cust.jacket === 'cape') {
      var fl = MOTION.flare * 1.5;
      shadedFill(c, function () {
        c.beginPath();
        c.moveTo(-9, top + 1);
        c.lineTo(9, top + 1);
        c.quadraticCurveTo(20 + fl, top + 14, 17 + fl, top + 30);
        c.quadraticCurveTo(0, top + 32, -17 - fl, top + 30);
        c.quadraticCurveTo(-20 - fl, top + 14, -9, top + 1);
        c.closePath();
      }, shade(col, -6), 2, { drape: [top + 4, top + 31, 17] });
    } else if (cust.jacket === 'hoodie' || cust.jacket === 'raincoat') {
      /* hood resting behind the head */
      celPart(c, ellPath(c, 0, top - 2, 12, 6), shade(col, -8), { dx: -1, dy: -1, rim: false });
    }
  }

  function drawJacketFront(c, cust) {
    var col = cust.jacketColor;
    if (cust.jacket === 'none') return;
    var dark = shade(col, -22), light = shade(col, 25);
    var top = CH.torsoTop, bot = CH.torsoBot;
    var i, s;
    switch (cust.jacket) {
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
        c.save(); c.globalAlpha = 0.5; fillRound(c, -8, top + 2, 3, 14, 1.5, '#ffffff', false); c.restore();
        for (i = 0; i < 3; i++) fillRound(c, -2, top + 4 + i * 6, 4, 2.2, 1, dark, false);
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
        fillEllipse(c, 3, top + 11, 1.1, 1.1, PAL.gold, false);
        fillRound(c, -9, top + 9, 4, 1.3, 0.6, dark, false);
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
    var j = cust.jacket;
    if (jacketHasSleeves(j)) {
      if (j === 'bolero') return { kind: 'puff', col: cust.jacketColor };
      if (j === 'varsity') return { kind: 'long', col: PAL.cream, cuff: cust.jacketColor, g: 0.75 };
      return { kind: 'long', col: cust.jacketColor, cuff: shade(cust.jacketColor, -22), g: j === 'puffer' ? 1.45 : j === 'denim' ? 0.6 : 0.75 };
    }
    if (cust.dress === 'kimono') return { kind: 'kimono', col: cust.dressColor };
    if (cust.dress === 'princess' || cust.dress === 'pinafore') return { kind: 'puff', col: cust.dress === 'princess' ? shade(cust.dressColor, 22) : PAL.cream };
    return null;
  }
  function drawSleeveOnArm(c, cust, A) {
    var sp = sleeveSpec(cust);
    if (!sp) return;
    var col = A.near ? sp.col : shadowCached(sp.col, 8, false);
    if (sp.kind === 'long') {
      var g = sp.g;
      celPart(c, function () {
        limbPath(c, A.sx, A.sy, ARM.rSh + g + 0.2, A.ex, A.ey, ARM.rEl + g, A.wx, A.wy, ARM.rWr + g * 0.8, 0.25, 0.2);
      }, col, { dx: -0.8, dy: -0.6 });
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
      celPart(c, rrPath(c, -cw, -1, cw * 2, 2, 1), A.near ? sp.cuff : shadowCached(sp.cuff, 8, false), { rim: false, ink: 1.3, dx: -0.4, dy: -0.2 });
      c.restore();
    } else if (sp.kind === 'puff') {
      var m = [lerp(A.sx, A.ex, 0.35), lerp(A.sy, A.ey, 0.35)];
      var ua = Math.atan2(A.ey - A.sy, A.ex - A.sx);
      celPart(c, function () { c.beginPath(); c.ellipse(m[0], m[1], 3.7, 3.1, ua, 0, TAU); }, col, { dx: -0.8, dy: -0.9, rimS: 0.6 });
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
      celPart(c, function () {
        c.beginPath();
        c.moveTo(A.sx - 2.2, A.sy - 0.6);
        c.lineTo(A.sx + 2.4, A.sy - 0.4);
        c.lineTo(ex + 2.8, ey + 0.4);
        c.quadraticCurveTo(ex + 3.2 - MOTION.skirt * 0.4, ey + 7.5, ex - 0.4 - MOTION.skirt, ey + 8.4);
        c.quadraticCurveTo(ex - 3.4, ey + 8, ex - 3, ey + 3);
        c.closePath();
      }, col, { dx: -1, dy: -1 });
      c.strokeStyle = PAL.cream; c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(ex - 2.8, ey + 6.6); c.quadraticCurveTo(ex - 0.6, ey + 7.6, ex + 2.8, ey + 6); c.stroke();
    }
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
    else if (s === 'loafers') {
      celPart(c, function () { legLowPath(c, L, 0.4, 0.22); }, L.near ? '#ffffff' : '#ece4ee', { dx: -0.8, dy: -0.4, s: 0.6 });
      legBand(c, L, 0.42, 1.5, 0.45, L.near ? '#fff4fa' : '#ece4ee');
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
        if (s === 'starBoots') { c.fillStyle = PAL.sun; star(c, 0.6, 0.2, 1.3); }
        break;
      case 'rainBoots':
        p = function () { shoePath(c, -3, 5.6, -1.6, 2.2); };
        celPart(c, p, col, { dx: -0.6, dy: -0.6, rimS: 0.5 });
        soleBand(c, p, 1.3, shade(cust.shoeColor, -38));
        p(); c.fillStyle = col; ink(c, 1.6);
        glint(c, 3.6, -0.1, 1.2, 0.45, 0.7);
        break;
      case 'sandals':
        p = function () { barefootPath(c); };
        celPart(c, p, skin, { warm: true, dx: -0.5, dy: -0.5, rim: false });
        celPart(c, rrPath(c, -2.6, 1.7, 8, 1.1, 0.5), col, { rim: false, ink: 1.2 });
        c.strokeStyle = col; c.lineWidth = 0.8; c.lineCap = 'round';
        c.beginPath(); c.moveTo(1.5, 1.8); c.lineTo(3.6, -0.3); c.moveTo(-1.6, 1.6); c.lineTo(1.1, -1.0); c.stroke();
        fillEllipse(c, 1.2, -0.9, 0.8, 0.8, PAL.sun, false);
        break;
      case 'ballet':
        p = function () { shoePath(c, -2.5, 5.2, -0.3, 2.0); };
        celPart(c, p, col, { dx: -0.5, dy: -0.5, rimS: 0.5 });
        c.save(); p(); c.clip();
        c.fillStyle = skin; c.beginPath(); c.ellipse(0.6, -1.2, 2.3, 1.2, 0, 0, TAU); c.fill();
        c.restore();
        fillEllipse(c, 2.6, -0.2, 0.7, 0.5, shade(cust.shoeColor, -25), false);
        glint(c, 3.8, 0.4, 0.8, 0.3, 0.6);
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
      case 'loafers':
        p = function () { shoePath(c, -2.6, 5.3, -0.4, 2.1); };
        celPart(c, p, col, { dx: -0.6, dy: -0.6, rimS: 0.5 });
        soleBand(c, p, 1.5, shade(cust.shoeColor, -38));
        p(); c.fillStyle = col; ink(c, 1.6);
        c.strokeStyle = shade(cust.shoeColor, -30); c.lineWidth = 0.6;
        c.beginPath(); c.moveTo(1.4, -0.5); c.quadraticCurveTo(2.6, 0.2, 3.8, -0.1); c.stroke();
        glint(c, 4, 0.2, 0.9, 0.35, 0.6);
        break;
    }
    c.restore();
    /* boot tops */
    if (s === 'boots') legBand(c, L, 0.6, 1.6, 0.85, shade(cust.shoeColor, -28));
    if (s === 'starBoots') legBand(c, L, 0.7, 2.0, 1.1, PAL.cream);
    if (s === 'rainBoots') legBand(c, L, 0.56, 1.4, 1.15, shade(cust.shoeColor, 18));
  }

  /* ---- Hats ---- */
  function gem(c, x, y, r, col) {
    c.beginPath(); c.arc(x, y, r, 0, TAU);
    var g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, mix(col, '#ffffff', 0.35));
    g.addColorStop(1, shade(col, -30));
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = shade(col, -50); c.lineWidth = 0.35; c.stroke();
  }
  function flower(c, x, y, r, col, centre) {
    for (var p = 0; p < 5; p++) {
      var a = p * TAU / 5 - Math.PI / 2;
      fillEllipse(c, x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.5, r * 0.5, col, false);
    }
    c.beginPath();
    for (p = 0; p < 5; p++) { var a2 = p * TAU / 5 - Math.PI / 2; c.moveTo(x + Math.cos(a2) * r * 0.62 + r * 0.5, y + Math.sin(a2) * r * 0.62); c.arc(x + Math.cos(a2) * r * 0.62, y + Math.sin(a2) * r * 0.62, r * 0.5, 0, TAU); }
    c.fillStyle = col; ink(c, 1.1);
    fillEllipse(c, x, y, r * 0.38, r * 0.38, centre || PAL.sun, false);
    glint(c, x - r * 0.45, y - r * 0.55, r * 0.22, r * 0.15, 0.8);
  }
  function drawHat(c, cust) {
    var hy = CH.headY, r = CH.headR;
    var col = cust.hatColor, dark = shade(col, -22), light = shade(col, 25);
    var i, sd;
    var A = MOTION.hairA, yaw = MOTION.yaw;
    switch (cust.hat) {
      case 'strawHat':
        celPart(c, ellPath(c, 0, hy - 6, r + 10, 4.6), '#e8c76a', { dx: -1.4, dy: -1.4 });
        celPart(c, function () { c.beginPath(); c.ellipse(0, hy - 10.5, r - 2, 7, 0, Math.PI, TAU); c.lineTo(r - 2, hy - 7); c.quadraticCurveTo(0, hy - 5, -r + 2, hy - 7); c.closePath(); }, '#f0d585', { dx: -1.6, dy: -1.6 });
        celPart(c, rrPath(c, -r + 1.6, hy - 10, (r - 1.6) * 2, 3.6, 1.6), col, { rim: false, ink: 1.4 });
        if (!LOW) {
          c.strokeStyle = 'rgba(150,100,30,0.45)'; c.lineWidth = 0.4;
          c.beginPath();
          for (i = -3; i <= 3; i++) { c.moveTo(i * 3.2, hy - 16.5 + Math.abs(i) * 0.6); c.lineTo(i * 3.6, hy - 10.5); }
          c.stroke();
        }
        flower(c, r - 4, hy - 9, 2, PAL.pink);
        break;
      case 'beret':
        volEllipse(c, -1, hy - 10, r + 2, 6.5, col, 2);
        celPart(c, ellPath(c, 6 + A * 4, hy - 15.6, 1.2, 2.1), dark, { rim: false, ink: 1.2 });
        c.strokeStyle = dark; c.lineWidth = 0.7;
        c.beginPath(); c.moveTo(-r - 0.5, hy - 7.5); c.quadraticCurveTo(0, hy - 5.4, r - 1, hy - 7.6); c.stroke();
        break;
      case 'flowerCrown':
        c.strokeStyle = '#5aa86a'; c.lineWidth = 1;
        c.beginPath(); c.arc(0, hy + 2, r + 0.5, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
        for (i = -3; i <= 3; i++) {
          var a = Math.PI * 1.5 + i * 0.27;
          var fx = Math.cos(a) * (r + 0.5), fy = hy + 2 + Math.sin(a) * (r + 0.5);
          if (i % 2) { c.fillStyle = '#6cc07a'; c.beginPath(); c.ellipse(fx, fy - 0.4, 2, 0.9, a + 1.2, 0, TAU); c.fill(); }
          else flower(c, fx, fy, 2.6, i % 4 === 0 ? col : PAL.cream);
        }
        break;
      case 'tiara':
        celPart(c, polyPath(c, [[-9, hy - 8], [-6, hy - 15], [-3, hy - 10], [0, hy - 19], [3, hy - 10], [6, hy - 15], [9, hy - 8]]), PAL.gold, { dx: -0.9, dy: -0.8, ink: 1.4 });
        gem(c, 0, hy - 14.6, 1.8, col);
        gem(c, -6, hy - 12, 1.1, PAL.sky);
        gem(c, 6, hy - 12, 1.1, PAL.sky);
        break;
      case 'bigBow':
        ribbonBow(c, 0, hy - 13, 5.2, col, false);
        break;
      case 'cap':
        celPart(c, function () { c.beginPath(); c.arc(0, hy - 6, r + 1, Math.PI, Math.PI * 2); c.closePath(); }, col, { dx: -1.8, dy: -1.2 });
        c.strokeStyle = dark; c.lineWidth = 0.5;
        c.beginPath(); c.moveTo(0, hy - r - 7); c.lineTo(0, hy - 6); c.moveTo(-7, hy - r - 2); c.quadraticCurveTo(-4, hy - 10, -5, hy - 6); c.stroke();
        celPart(c, function () { c.beginPath(); c.moveTo(1, hy - 7.6); c.quadraticCurveTo(r + 3, hy - 9.6, r + 8, hy - 6.6); c.quadraticCurveTo(r + 3, hy - 4.4, 1, hy - 5.2); c.closePath(); }, dark, { dx: -0.8, dy: -0.6, rim: false, ink: 1.5 });
        celPart(c, ellPath(c, 0, hy - r - 7, 1.5, 1.2), dark, { rim: false, ink: 1.2 });
        break;
      case 'beanie':
        celPart(c, function () { c.beginPath(); c.arc(0, hy - 5, r + 1.5, Math.PI, Math.PI * 2); c.closePath(); }, col, { dx: -1.8, dy: -1.2 });
        if (!LOW) {
          c.strokeStyle = dark; c.lineWidth = 0.5; c.globalAlpha = 0.7;
          c.beginPath();
          for (i = -4; i <= 4; i++) { c.moveTo(i * 3, hy - 8); c.quadraticCurveTo(i * 3.1, hy - 13, i * 1.6, hy - r - 5); }
          c.stroke(); c.globalAlpha = 1;
        }
        celPart(c, rrPath(c, -r - 1.5, hy - 8.4, (r + 1.5) * 2, 4.8, 2), dark, { rim: false, ink: 1.5 });
        volEllipse(c, A * 3, hy - r - 7 - MOTION.lag * 0.3, 3.8, 3.8, light, 1.6);
        break;
      case 'partyHat':
        celPart(c, polyPath(c, [[-7, hy - 9], [7, hy - 9], [A * 4, hy - 30]]), col, { dx: -1.6, dy: 0 });
        for (i = 0; i < 3; i++) fillEllipse(c, -2 + (i % 2) * 4 + A * (i + 1), hy - 13.5 - i * 5, 1.1, 1.1, PAL.cream, false);
        volEllipse(c, A * 4, hy - 30.5, 2.4, 2.4, PAL.sun, 1.4);
        break;
      case 'unicorn':
        celPart(c, polyPath(c, [[-3, hy - 11], [3, hy - 11], [0, hy - 28]]), col, { dx: -1, dy: 0, ink: 1.5 });
        c.strokeStyle = shade(col, -25); c.lineWidth = 0.6;
        for (i = 1; i <= 3; i++) { c.beginPath(); c.moveTo(-2.5 + i * 0.5, hy - 11 - i * 4); c.lineTo(2.5 - i * 0.5, hy - 12 - i * 4); c.stroke(); }
        for (sd = -1; sd <= 1; sd += 2) {
          celPart(c, ellPath(c, sd * 9, hy - 10, 3, 4.5), PAL.cream, { rim: false, ink: 1.4 });
          fillEllipse(c, sd * 9, hy - 10, 1.4, 2.6, PAL.pink, false);
        }
        flower(c, -5, hy - 11, 1.6, PAL.pink);
        break;
      case 'hairClips':
        /* two star clips and a heart on the fringe's near side */
        for (i = 0; i < 2; i++) {
          c.save(); c.translate(-6.6 + i * 2.6 + yaw * 1.2, hy - 4.6 - i * 2.4); c.rotate(-0.5);
          celPart(c, rrPath(c, -2.6, -0.6, 5.2, 1.2, 0.6), PAL.gold, { rim: false, ink: 1 });
          c.restore();
          c.fillStyle = i ? col : PAL.sun; star(c, -8.4 + i * 2.8 + yaw * 1.2, hy - 3.6 - i * 2.6, 1.8);
          c.strokeStyle = shade(i ? col : PAL.sun, -40); c.lineWidth = 0.35; c.stroke();
        }
        heart(c, 7.5 + yaw, hy - 6, 1.6, col, 0.6);
        break;
      case 'sideRibbon':
        ribbonBow(c, -r + 1.5 + yaw * 1.5, hy - 8.5, 3.8, col, true);
        break;
      case 'headband':
        c.lineCap = 'round';
        c.beginPath(); c.arc(0, hy + 1.5, r + 0.8, Math.PI * 1.08, Math.PI * 1.92);
        c.strokeStyle = shade(col, -45); c.lineWidth = 2.6; c.stroke();
        c.beginPath(); c.arc(0, hy + 1.5, r + 0.8, Math.PI * 1.08, Math.PI * 1.92);
        c.strokeStyle = col; c.lineWidth = 1.7; c.stroke();
        c.beginPath(); c.arc(0, hy + 1.2, r + 1, Math.PI * 1.2, Math.PI * 1.45);
        c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.5; c.stroke();
        ribbonBow(c, 6.4, hy - 11.2, 2.6, col, false);
        break;
      case 'witchHat':
        /* a soft cone whose tip lags and flops with the step */
        var tipX = 6 + A * 18, tipY = hy - 31 + Math.abs(A) * 6 + MOTION.lag * 0.6;
        celPart(c, function () {
          c.beginPath();
          c.moveTo(-9, hy - 9);
          c.quadraticCurveTo(-5, hy - 20, tipX - 2, tipY + 1);
          c.quadraticCurveTo(tipX + 1, tipY, tipX + 1.8, tipY + 2.6);
          c.quadraticCurveTo(tipX - 0.4, tipY + 3, 1.5, hy - 20);
          c.quadraticCurveTo(7, hy - 14, 9, hy - 9);
          c.closePath();
        }, col, { dx: -1.4, dy: -0.4 });
        celPart(c, ellPath(c, 0, hy - 8, r + 8, 3.6), col, { dx: -1, dy: -1 });
        celPart(c, rrPath(c, -8.4, hy - 12.4, 16.8, 3.4, 1), dark, { rim: false, ink: 1.3 });
        c.fillStyle = PAL.sun; star(c, 2.2, hy - 10.7, 2);
        c.strokeStyle = shade(PAL.sun, -40); c.lineWidth = 0.35; c.stroke();
        break;
      case 'crown':
        celPart(c, polyPath(c, [[-7.5, hy - 9], [-8.6, hy - 17], [-4.4, hy - 13], [0, hy - 19.5], [4.4, hy - 13], [8.6, hy - 17], [7.5, hy - 9]]), PAL.gold, { dx: -0.9, dy: -0.8, ink: 1.4 });
        celPart(c, rrPath(c, -7.8, hy - 11.4, 15.6, 2.6, 1), shade(PAL.gold, -12), { rim: false, ink: 1.2 });
        gem(c, 0, hy - 10.1, 1.2, col);
        gem(c, -4.6, hy - 10.1, 0.8, PAL.sky);
        gem(c, 4.6, hy - 10.1, 0.8, PAL.pink);
        fillEllipse(c, 0, hy - 19.5, 1, 1, '#ffffff', false);
        fillEllipse(c, -8.6, hy - 17, 0.9, 0.9, '#ffffff', false);
        fillEllipse(c, 8.6, hy - 17, 0.9, 0.9, '#ffffff', false);
        break;
      case 'sunHat':
        /* a floppy wide brim that ripples, and a ribbon trailing behind */
        var rip = Math.sin(MOTION.t * 2.4) * 0.5 + MOTION.lag * 0.3;
        for (sd = -1; sd <= 1; sd += 2) {
          (function (sd) {
            celPart(c, function () {
              c.beginPath();
              c.moveTo(sd * 3, hy - 8.5);
              c.quadraticCurveTo(sd * (r + 7), hy - 10.5 - rip * sd, sd * (r + 11), hy - 5.5 + rip * sd);
              c.quadraticCurveTo(sd * (r + 6), hy - 2.4 + rip * sd, sd * 3, hy - 5);
              c.closePath();
            }, '#fff2e0', { dx: -1, dy: -1, ink: 1.6 });
          })(sd);
        }
        celPart(c, function () { c.beginPath(); c.ellipse(0, hy - 10, r - 2.5, 6.8, 0, Math.PI, TAU); c.lineTo(r - 2.5, hy - 7); c.quadraticCurveTo(0, hy - 5.5, -r + 2.5, hy - 7); c.closePath(); }, '#fff2e0', { dx: -1.4, dy: -1.4 });
        celPart(c, rrPath(c, -r + 2.4, hy - 10, (r - 2.4) * 2, 3, 1.4), col, { rim: false, ink: 1.3 });
        var tw = -MOTION.skirt * 1.2 + A * 10;
        celPart(c, function () {
          c.beginPath();
          c.moveTo(-r + 3, hy - 9);
          c.quadraticCurveTo(-r - 3 + tw * 0.4, hy - 4, -r - 2 + tw, hy + 3);
          c.lineTo(-r - 3.6 + tw, hy + 2);
          c.quadraticCurveTo(-r - 4.5 + tw * 0.4, hy - 4, -r + 2, hy - 8);
          c.closePath();
        }, col, { rim: false, ink: 1.3 });
        flower(c, -r + 4.5, hy - 8.6, 1.9, PAL.cream, col);
        break;
    }
  }

  /* ---- Bags ---- */
  function drawBagBack(c, cust) {
    if (cust.bag !== 'backpack') return;
    var col = cust.bagColor;
    celPart(c, rrPath(c, -16, CH.torsoTop + 2, 9, 15, 3), col, { dx: -1.4, dy: -1.2 });
    celPart(c, rrPath(c, -15, CH.torsoTop + 8, 7, 5, 2), shade(col, -22), { rim: false, ink: 1.3 });
  }
  /* bags on a strap, in the torso frame; they swing a little behind */
  function drawBagFront(c, cust) {
    var col = cust.bagColor, dark = shade(col, -25);
    var top = CH.torsoTop, bot = CH.torsoBot;
    var sw = -MOTION.skirt * 0.7, sy = MOTION.lag * 0.3;
    var bx = 13 + sw, by = bot - 1 + sy;
    var strap = function (w) {
      c.strokeStyle = dark; c.lineWidth = w; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-7.5, top + 0.5); c.quadraticCurveTo(4, top + 10, bx - 1, by - 4); c.stroke();
    };
    switch (cust.bag) {
      case 'backpack':
        c.strokeStyle = dark; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(-7, top + 0.5); c.quadraticCurveTo(-8, top + 6, -7.2, top + 12); c.stroke();
        break;
      case 'purse':
        strap(1);
        celPart(c, rrPath(c, bx - 4.5, by - 3.5, 9, 7, 3), col, { dx: -1, dy: -1 });
        celPart(c, function () { c.beginPath(); c.moveTo(bx - 4.5, by - 1.2); c.quadraticCurveTo(bx, by + 1.6, bx + 4.5, by - 1.2); c.lineTo(bx + 4.5, by - 2); c.quadraticCurveTo(bx + 4.5, by - 3.5, bx + 3, by - 3.5); c.lineTo(bx - 3, by - 3.5); c.quadraticCurveTo(bx - 4.5, by - 3.5, bx - 4.5, by - 2); c.closePath(); }, shade(col, -10), { rim: false, ink: 1.2 });
        fillEllipse(c, bx, by + 0.2, 0.9, 0.9, PAL.gold, false);
        break;
      case 'messenger':
        strap(1.5);
        celPart(c, rrPath(c, bx - 5.5, by - 4, 12, 10, 2.5), col, { dx: -1, dy: -1 });
        celPart(c, rrPath(c, bx - 5.5, by - 4, 12, 5, 2), dark, { rim: false, ink: 1.3 });
        fillRound(c, bx - 0.5, by, 2, 2, 0.6, PAL.gold, false);
        break;
      case 'heartBag':
        strap(1);
        celPart(c, function () { heartPath(c, bx, by + 1, 5); }, col, { dx: -0.8, dy: -0.9, ink: 1.5 });
        glint(c, bx - 2, by - 1, 1, 0.7, 0.7);
        break;
      case 'starBag':
        strap(1);
        celPart(c, function () {
          c.beginPath();
          for (var k = 0; k < 10; k++) { var ang = (Math.PI / 5) * k - Math.PI / 2, rad = k % 2 === 0 ? 6.5 : 6.5 * 0.48; c.lineTo(bx + Math.cos(ang) * rad, by + 1 + Math.sin(ang) * rad); }
          c.closePath();
        }, col, { dx: -0.8, dy: -0.9, ink: 1.5 });
        glint(c, bx - 1.2, by - 0.6, 1.1, 0.8, 0.6);
        break;
      case 'bunnyBag':
        strap(1);
        for (var sd2 = -1; sd2 <= 1; sd2 += 2) {
          celPart(c, ellPath(c, bx + sd2 * 2.2 + sw * 0.4, by - 7.5, 1.4, 3.6), col, { rim: false, ink: 1.2 });
          fillEllipse(c, bx + sd2 * 2.2 + sw * 0.4, by - 7.3, 0.6, 2.4, PAL.pink, false);
        }
        celPart(c, ellPath(c, bx, by, 5.2, 4.6), col, { dx: -1, dy: -1 });
        fillEllipse(c, bx - 1.8, by - 0.6, 0.6, 0.7, PAL.ink, false);
        fillEllipse(c, bx + 1.8, by - 0.6, 0.6, 0.7, PAL.ink, false);
        fillEllipse(c, bx, by + 0.7, 0.6, 0.45, PAL.pinkDeep, false);
        fillEllipse(c, bx - 3, by + 1, 1, 0.6, 'rgba(255,120,150,0.5)', false);
        fillEllipse(c, bx + 3, by + 1, 1, 0.6, 'rgba(255,120,150,0.5)', false);
        break;
    }
  }
  /* Things held in the near hand (ground space, hand = {x, y, a}). */
  function drawHeld(c, cust, hand, t) {
    var bag = cust.bag, acc = cust.accessory, col, dark;
    var hx = hand.x, hy = hand.y + 1.6;
    if (bag === 'tote') {
      col = cust.bagColor; dark = shade(col, -25);
      var tx = hx - MOTION.skirt * 0.5;
      c.strokeStyle = dark; c.lineWidth = 1;
      c.beginPath(); c.moveTo(hx - 1.5, hy); c.quadraticCurveTo(tx - 3, hy + 3, tx - 4, hy + 5); c.moveTo(hx + 1.5, hy); c.quadraticCurveTo(tx + 3, hy + 3, tx + 4, hy + 5); c.stroke();
      celPart(c, polyPath(c, [[tx - 5.5, hy + 5], [tx + 5.5, hy + 5], [tx + 5, hy + 15], [tx - 5, hy + 15]]), col, { dx: -1, dy: -1 });
      flower(c, tx, hy + 10, 2, PAL.cream, col);
    } else if (bag === 'basket') {
      col = cust.bagColor; dark = shade(col, -25);
      var kx = hx - MOTION.skirt * 0.4;
      c.strokeStyle = dark; c.lineWidth = 1.2;
      c.beginPath(); c.arc(kx, hy + 6, 5, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
      fillEllipse(c, kx - 2, hy + 4.2, 1.6, 1.6, PAL.pink, false);
      fillEllipse(c, kx + 1.6, hy + 3.8, 1.6, 1.6, PAL.sun, false);
      fillEllipse(c, kx + 0.2, hy + 5, 1.5, 1.5, '#ff6a6a', false);
      celPart(c, polyPath(c, [[kx - 6, hy + 5.5], [kx + 6, hy + 5.5], [kx + 4.6, hy + 13], [kx - 4.6, hy + 13]]), col, { dx: -1, dy: -1 });
      c.strokeStyle = dark; c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(kx - 5.4, hy + 8); c.lineTo(kx + 5.4, hy + 8); c.moveTo(kx - 5, hy + 10.5); c.lineTo(kx + 5, hy + 10.5);
      for (var b = -4; b <= 4; b += 2) { c.moveTo(kx + b, hy + 5.6); c.lineTo(kx + b * 0.8, hy + 12.8); }
      c.stroke();
    } else if (bag === 'balloon') {
      /* a heart balloon on a string, floating up and lagging behind */
      col = cust.bagColor;
      var bxx = hx - 4 + MOTION.hairA * 40 + Math.sin(MOTION.t * 1.3) * 1.2, byy = hand.y - 27 + Math.sin(MOTION.t * 1.9) * 0.8 + MOTION.lag * 0.8;
      c.strokeStyle = 'rgba(90,60,90,0.8)'; c.lineWidth = 0.4;
      c.beginPath(); c.moveTo(hx, hand.y); c.quadraticCurveTo(hx - 1 + (bxx - hx) * 0.2, (hand.y + byy) / 2, bxx, byy + 6); c.stroke();
      celPart(c, function () { heartPath(c, bxx, byy, 6); }, col, { dx: -1.4, dy: -1.4, ink: 1.4 });
      glint(c, bxx - 2.4, byy - 2.2, 1.4, 0.9, 0.85);
      c.fillStyle = shade(col, -20); c.beginPath(); c.moveTo(bxx - 0.8, byy + 6.6); c.lineTo(bxx + 0.8, byy + 6.6); c.lineTo(bxx, byy + 5.2); c.closePath(); c.fill();
    } else if (bag === 'bouquet') {
      col = cust.bagColor;
      flower(c, hx - 2.2, hy - 5, 2.2, PAL.pink);
      flower(c, hx + 2.2, hy - 5.6, 2.2, PAL.cream, col);
      flower(c, hx, hy - 8, 2.2, col);
      celPart(c, polyPath(c, [[hx - 4.5, hy - 4], [hx + 4.5, hy - 4], [hx + 0.8, hy + 5], [hx - 0.8, hy + 5]]), '#fff0f6', { dx: -0.8, dy: -0.8, rim: false, ink: 1.3 });
      ribbonBow(c, hx, hy - 0.4, 1.6, col, false);
    }
    if (acc === 'wand') {
      col = cust.accColor;
      celPart(c, rrPath(c, hx - 0.9, hand.y - 15, 1.8, 16, 0.9), PAL.cream, { rim: false, ink: 1.2 });
      c.fillStyle = col; star(c, hx, hand.y - 17, 4.6); c.fillStyle = col; ink(c, 1.2);
      c.fillStyle = 'rgba(255,255,255,0.5)'; star(c, hx - 0.6, hand.y - 17.6, 1.8);
      var tw = Math.sin((t || 0) * 6);
      if (tw > 0.3) { c.fillStyle = '#fff'; star(c, hx + 5.5, hand.y - 22, 2 * tw); }
    } else if (acc === 'parasol') {
      col = cust.accColor;
      var pa = -0.5 + MOTION.hairA * 0.8, px = hx, py = hand.y;
      c.save();
      c.translate(px, py); c.rotate(pa);
      c.strokeStyle = '#8a5a3a'; c.lineWidth = 0.8; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, 3); c.lineTo(0, -21); c.stroke();
      c.beginPath(); c.arc(1.2, 3, 1.2, Math.PI, 0, true); c.stroke();
      celPart(c, function () {
        c.beginPath();
        c.moveTo(-12, -16);
        c.quadraticCurveTo(-11, -27, 0, -28);
        c.quadraticCurveTo(11, -27, 12, -16);
        for (var k = 0; k < 4; k++) c.quadraticCurveTo(12 - (k + 0.5) * 6, -18.5, 12 - (k + 1) * 6, -16);
        c.closePath();
      }, col, { dx: -1.4, dy: -1 });
      c.strokeStyle = shade(col, -25); c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(0, -28); c.lineTo(-6, -17); c.moveTo(0, -28); c.lineTo(6, -17); c.stroke();
      c.strokeStyle = '#ffffff'; c.lineWidth = 0.8; c.globalAlpha = 0.8;
      c.beginPath(); for (var f = -12; f < 12; f += 3) { c.moveTo(f, -16.2); c.arc(f + 1.5, -16.2, 1.5, Math.PI, 0, true); } c.stroke();
      c.globalAlpha = 1;
      fillEllipse(c, 0, -28.6, 1, 1, PAL.gold, false);
      c.restore();
    }
  }

  /* ---- Accessories ---- */
  function drawAccessoryBack(c, cust) {
    var acc = cust.accessory;
    if (acc !== 'wings' && acc !== 'butterfly') return;
    var col = cust.accColor, top = CH.torsoTop;
    var flap = 1 - 0.18 * (0.5 + 0.5 * Math.sin(MOTION.t * (acc === 'butterfly' ? 7 : 4)));
    c.save();
    c.globalAlpha = 0.9;
    for (var sd = -1; sd <= 1; sd += 2) {
      c.save();
      c.translate(sd * 2, top + 4);
      c.scale(flap, 1);
      if (acc === 'wings') {
        celPart(c, ellPath(c, sd * 10, -2, 9, 6), col, { dx: -1, dy: -1, ink: 1.4 });
        celPart(c, ellPath(c, sd * 8, 7, 6, 4.5), col, { dx: -1, dy: -1, ink: 1.4 });
        fillEllipse(c, sd * 10, -2.5, 4, 2.4, shade(col, 45), false);
        c.strokeStyle = shade(col, -25); c.lineWidth = 0.4;
        c.beginPath(); c.moveTo(0, 0); c.lineTo(sd * 16, -4); c.moveTo(0, 2); c.lineTo(sd * 12, 8); c.stroke();
      } else {
        celPart(c, function () { c.beginPath(); c.moveTo(0, -1); c.bezierCurveTo(sd * 8, -14, sd * 19, -10, sd * 16, 1); c.quadraticCurveTo(sd * 10, 3, 0, 1); c.closePath(); }, col, { dx: -1, dy: -1, ink: 1.4 });
        celPart(c, function () { c.beginPath(); c.moveTo(0, 1); c.bezierCurveTo(sd * 12, 3, sd * 13, 13, sd * 6, 12); c.quadraticCurveTo(sd * 2, 9, 0, 2); c.closePath(); }, shade(col, -10), { dx: -1, dy: -1, ink: 1.4 });
        fillEllipse(c, sd * 11, -5, 2.4, 2, '#ffffff', false);
        fillEllipse(c, sd * 11, -5, 1.2, 1, PAL.sun, false);
        fillEllipse(c, sd * 6.5, 7, 1.4, 1.4, '#ffffff', false);
      }
      c.restore();
    }
    c.restore();
  }
  function drawAccessoryNeck(c, cust) {
    var col = cust.accColor, top = CH.torsoTop, i;
    var sw = -MOTION.skirt * 0.25;
    switch (cust.accessory) {
      case 'scarf':
        celPart(c, polyPath(c, [[4, top + 2], [10, top + 3], [8 + sw * 2, top + 15], [3 + sw * 2, top + 13]]), col, { dx: -1, dy: -0.8 });
        celPart(c, rrPath(c, -10, top - 3, 20, 6, 3), col, { dx: -1, dy: -1.2 });
        c.strokeStyle = shade(col, -20); c.lineWidth = 0.6;
        c.beginPath(); c.moveTo(4.5 + sw * 2, top + 12); c.lineTo(8 + sw * 2, top + 12.5); c.moveTo(-8, top - 1); c.lineTo(-6, top + 2); c.moveTo(-4, top - 1.5); c.lineTo(-2, top + 2.2); c.stroke();
        break;
      case 'necklace':
        c.strokeStyle = PAL.gold; c.lineWidth = 0.7;
        c.beginPath(); c.arc(0, top - 3, 6, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
        for (i = -2; i <= 2; i++) gem(c, i * 2.6, top + 1.6 - Math.abs(i) * 0.6, 0.9, col);
        heart(c, sw, top + 5, 1.9, col, 0.8);
        break;
      case 'pearls':
        for (i = -5; i <= 5; i++) {
          var a = Math.PI * 0.5 + i * 0.16;
          gem(c, Math.cos(a) * 6.4, top - 3.6 + Math.sin(a) * 6.4, 0.85, '#fff6f0');
        }
        gem(c, 0, top + 3.8, 1.3, col);
        break;
      case 'locket':
        c.strokeStyle = PAL.gold; c.lineWidth = 0.5;
        var lx = sw * 2.5, ly = top + 6.5;
        c.beginPath(); c.moveTo(-5.5, top - 1); c.quadraticCurveTo(-2, top + 4, lx, ly - 2.4); c.quadraticCurveTo(2, top + 4, 5.5, top - 1); c.stroke();
        celPart(c, function () { heartPath(c, lx, ly, 2.4); }, PAL.gold, { dx: -0.5, dy: -0.5, ink: 1.1, rim: false });
        gem(c, lx, ly - 0.2, 0.8, col);
        break;
      case 'bowTie':
        celPart(c, polyPath(c, [[-6, top - 4], [-1, top - 1], [-6, top + 2]]), col, { rim: false, ink: 1.4 });
        celPart(c, polyPath(c, [[6, top - 4], [1, top - 1], [6, top + 2]]), col, { rim: false, ink: 1.4 });
        celPart(c, ellPath(c, 0, top - 1, 1.5, 1.5), shade(col, -25), { rim: false, ink: 1.2 });
        break;
    }
  }
  /* glasses sit on the eyes, which move with the head's turn */
  function drawAccessoryFace(c, cust) {
    var hy = CH.headY, col = cust.accColor, acc = cust.accessory;
    var yaw = MOTION.yaw, ey = hy + 2;
    var lx = -5 + yaw * 2.6, rx = 5 + yaw * 1.6, rs = 1 - yaw * 0.22;
    var i;
    switch (acc) {
      case 'glasses':
        c.strokeStyle = col; c.lineWidth = 1.0;
        c.beginPath(); c.ellipse(lx, ey, 4.6, 4.4, 0, 0, TAU); c.stroke();
        c.beginPath(); c.ellipse(rx, ey, 4.6 * rs, 4.4, 0, 0, TAU); c.stroke();
        c.beginPath(); c.moveTo(lx + 4.6, ey - 0.5); c.quadraticCurveTo((lx + rx) / 2, ey - 1.8, rx - 4.6 * rs, ey - 0.5);
        c.moveTo(lx - 4.6, ey - 0.5); c.lineTo(-12.5 + yaw * 2, ey - 1.5); c.stroke();
        c.save(); c.globalAlpha = 0.5; c.strokeStyle = '#ffffff'; c.lineWidth = 0.6;
        c.beginPath(); c.arc(lx, ey, 3.4, Math.PI * 1.1, Math.PI * 1.4); c.stroke();
        c.beginPath(); c.arc(rx, ey, 3.4 * rs, Math.PI * 1.1, Math.PI * 1.4); c.stroke();
        c.restore();
        break;
      case 'sunglasses':
      case 'heartGlasses':
      case 'starGlasses':
        var lens = acc === 'sunglasses' ? '#3a2234' : shade(col, -30);
        var shape = function (x, sx) {
          return function () {
            if (acc === 'heartGlasses') heartPath(c, x, ey - 0.4, 4.3 * sx);
            else if (acc === 'starGlasses') {
              c.beginPath();
              for (var k = 0; k < 10; k++) { var ang = (Math.PI / 5) * k - Math.PI / 2, rad = k % 2 === 0 ? 5.6 : 2.9; c.lineTo(x + Math.cos(ang) * rad * sx, ey + 0.4 + Math.sin(ang) * rad); }
              c.closePath();
            } else roundRect(c, x - 4.5 * sx, ey - 4, 9 * sx, 8, 3.4);
          };
        };
        c.strokeStyle = acc === 'sunglasses' ? col : shade(col, -10); c.lineWidth = 1.0;
        c.beginPath(); c.moveTo(lx + 3.6, ey - 1); c.quadraticCurveTo((lx + rx) / 2, ey - 2.2, rx - 3.6 * rs, ey - 1);
        c.moveTo(lx - 4.4, ey - 1); c.lineTo(-12.5 + yaw * 2, ey - 2); c.stroke();
        var lenses = [[lx, 1], [rx, rs]];
        for (i = 0; i < 2; i++) {
          var sp = shape(lenses[i][0], lenses[i][1]);
          sp(); c.fillStyle = lens; c.globalAlpha = 0.92; c.fill(); c.globalAlpha = 1;
          if (acc !== 'sunglasses') { sp(); c.strokeStyle = col; c.lineWidth = 1.1; c.stroke(); }
          c.save(); sp(); c.clip();
          var lg = c.createLinearGradient(lenses[i][0] - 4, ey - 4, lenses[i][0] + 4, ey + 4);
          lg.addColorStop(0, 'rgba(255,255,255,0.55)'); lg.addColorStop(0.4, 'rgba(255,255,255,0.08)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = lg; c.fillRect(lenses[i][0] - 6, ey - 6, 12, 12);
          c.restore();
        }
        break;
    }
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
    if (!cust.mannequin && cust.earColor !== skin) gem(c, x + sd * 0.2, hy + 4.8, 0.9, cust.earColor);
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
    var rx = EYE_RX * ws, ry = EYE_RY;
    if (style === 'sparkle') { rx = 3.6 * ws; ry = 4.6; }
    if (style === 'shine') { rx = 3.7 * ws; ry = 4.8; }
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
    } else {
      fillEllipse(c, ix, iy + 0.2, irx * 0.46, iry * 0.52, pupil, false);
    }
    /* catchlights: the key light high on the lit side, a bounce low */
    var big = style === 'sparkle' || style === 'shine';
    fillEllipse(c, ix - rx * 0.34, y - ry * 0.34 + ly * 0.5, big ? 1.5 : 1.25, big ? 1.8 : 1.55, '#ffffff', false);
    fillEllipse(c, ix + rx * 0.36, y + ry * 0.42 + ly * 0.5, big ? 0.85 : 0.6, big ? 0.85 : 0.6, '#ffffff', false);
    if (big) fillEllipse(c, ix + rx * 0.3, y - ry * 0.5, 0.5, 0.5, '#ffffff', false);
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

  function shoeLiftOf(cust) { return cust.shoes === 'rollerSkates' ? 2.6 : 0; }

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

    /* behind the body: wings, cape, trailing bows, then back hair */
    c.save();
    tf();
    drawAccessoryBack(c, cust);
    lag(CH.torsoTop, 30, 1.5, function () { drawJacketBack(c, cust); });
    lag(CH.torsoBot - 6, 18, 1, function () { drawDressBack(c, cust); });
    drawBagBack(c, cust);
    c.restore();
    c.save();
    hf();
    drawHair(c, cust, true);
    c.restore();

    /* far arm and both legs */
    drawArmRig(c, cust, R.arms[1]);
    for (var li = 1; li >= 0; li--) {
      drawLeg(c, cust, R.legs[li]);
      drawPantsLeg(c, cust, R.legs[li]);
      drawShoe(c, cust, R.legs[li]);
    }

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

    /* near arm, and whatever it holds */
    var NA = R.arms[0];
    drawArmRig(c, cust, NA);
    drawHeld(c, cust, { x: NA.hx, y: NA.hy, a: NA.ha }, S.t);

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
    var faceAcc = stationId === 'extra' && (cust.accessory === 'glasses' || cust.accessory === 'sunglasses' || cust.accessory === 'necklace' || cust.accessory === 'bowTie' || cust.accessory === 'scarf');
    if (HEAD_STATIONS[stationId] || faceAcc) {
      var faceZoom = stationId === 'eyes' || stationId === 'nose' || stationId === 'mouth';
      sc = size / (stationId === 'hat' || stationId === 'ears' ? 50 : faceZoom ? 30 : 40);
      var headOff = (stationId === 'hat' || stationId === 'ears') ? 0.06 : (faceAcc ? -0.06 : faceZoom ? -0.04 : 0.02);
      fy = cy + size * headOff - CH.headY * sc;
    } else if (stationId === 'shoes') {
      sc = size / 30;
      fy = cy + size * 0.34;
    } else if (opts.zoom) {
      /* wardrobe tiles: closer in, cropping at the shins */
      sc = size / (stationId === 'pants' ? 64 : 56);
      fy = cy + size * (stationId === 'pants' ? 0.5 : 0.62);
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
