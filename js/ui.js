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
    if (!pressed) {
      c.fillStyle = 'rgba(74, 42, 64, 0.28)';
      E.roundRect(c, b.x, b.y + 3, b.w, b.h, r);
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
    bg.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
    bg.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    bg.addColorStop(1, 'rgba(74, 42, 64, 0.14)');
    c.fillStyle = bg;
    c.fillRect(b.x, b.y + oy, b.w, b.h);
    c.restore();
    if (hot) {
      E.roundRect(c, b.x, b.y + oy, b.w, b.h, r);
      c.fillStyle = 'rgba(255, 255, 255, 0.28)';
      c.fill();
    }
    c.fillStyle = 'rgba(255, 255, 255, 0.38)';
    E.roundRect(c, b.x + 3, b.y + oy + 2, b.w - 6, b.h * 0.42, Math.max(2, r - 3));
    c.fill();
    E.roundRect(c, b.x, b.y + oy, b.w, b.h, r);
    E.ink(c, opts.active || hot ? 3 : 2);
    c.fillStyle = opts.disabled ? '#7a6a74' : (opts.textColor || PAL.ink);
    fitFont(c, label, b.w - 12, opts.font || 15, 'bold');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
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
    /* two-step drop shadow: a tight dark one and a wide soft one */
    c.fillStyle = 'rgba(43, 21, 48, 0.1)';
    E.roundRect(c, x - 4, y + 2, w + 8, h + 10, 16); c.fill();
    c.fillStyle = 'rgba(43, 21, 48, 0.22)';
    E.roundRect(c, x, y + 4, w, h, 12); c.fill();
    if (alpha !== undefined) c.globalAlpha = alpha;
    c.fillStyle = fill || 'rgba(255, 246, 236, 0.94)';
    E.roundRect(c, x, y, w, h, 12);
    c.fill();
    /* a cool sheen at the top edge and a warm shade at the bottom */
    E.roundRect(c, x, y, w, h, 12);
    c.clip();
    var g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    g.addColorStop(0.18, 'rgba(255, 255, 255, 0)');
    g.addColorStop(0.85, 'rgba(226, 85, 154, 0)');
    g.addColorStop(1, 'rgba(226, 85, 154, 0.08)');
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
    c.restore();
    E.roundRect(c, x, y, w, h, 12);
    E.ink(c, 2);
  }

  function multiline(c, text, cx, y, lineH, align) {
    var lines = String(text).split('\n');
    c.textAlign = align || 'center';
    c.textBaseline = 'middle';
    for (var i = 0; i < lines.length; i++) c.fillText(lines[i], cx, y + i * lineH);
    return lines.length * lineH;
  }

  function T(k) { return Game.i18n.t(k); }

  /* Colour chip; the chosen one gets a thick ring and a tick. */
  function swatch(c, r, col, sel) {
    var hot = !sel && pointerOver(c, r.x, r.y, r.w, r.h);
    c.fillStyle = col;
    E.roundRect(c, r.x, r.y, r.w, r.h, 9);
    c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.3)';
    E.roundRect(c, r.x + 3, r.y + 3, r.w - 6, r.h * 0.36, 5);
    c.fill();
    E.roundRect(c, r.x, r.y, r.w, r.h, 9);
    E.ink(c, sel ? 4 : (hot ? 3 : 1.8));
    if (sel) {
      var cx = r.x + r.w - 6, cy = r.y + 6;
      E.fillEllipse(c, cx, cy, 9, 9, PAL.teal);
      c.strokeStyle = PAL.cream;
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(cx - 4, cy); c.lineTo(cx - 1, cy + 3.5); c.lineTo(cx + 4.5, cy - 3.5);
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
    E.fillRound(c, x, y, w, 30, 15, 'rgba(255, 246, 236, 0.95)');
    c.fillStyle = PAL.sun;
    E.star(c, x + 17, y + 15, 10);
    c.strokeStyle = PAL.ink; c.lineWidth = 1.5; c.stroke();
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

  function drawTitleScreen(c) {
    t++;
    /* windows at x=310 and 740: behind the podium and past the buttons */
    Game.studio.drawBackdrop(c, 0, t, TITLE_GROUND, 250, true);
    c.save();
    clipGame(c);

    /* a little star podium with Momoko and two friends */
    var px = 190, py = TITLE_GROUND + 30;
    /* a spotlight cone from the ceiling down onto the podium */
    c.save();
    c.globalCompositeOperation = 'lighter';
    var cone = c.createLinearGradient(0, 0, 0, py);
    cone.addColorStop(0, 'rgba(255, 244, 214, 0.16)');
    cone.addColorStop(1, 'rgba(255, 244, 214, 0.03)');
    c.fillStyle = cone;
    c.beginPath(); c.moveTo(px - 26, -10); c.lineTo(px + 26, -10); c.lineTo(px + 150, py); c.lineTo(px - 150, py); c.closePath(); c.fill();
    c.restore();
    E.fillEllipse(c, px, py + 2, 150, 20, PAL.pinkDeep);
    E.fillEllipse(c, px, py - 4, 150, 20, PAL.pink);
    c.fillStyle = PAL.sun;
    E.star(c, px, py - 4, 16);
    var cast = titleCast();
    var hop = Math.max(0, Math.sin(t / 22)) * 6;
    /* velvet ropes either side of the podium */
    for (var ps = -1; ps <= 1; ps += 2) {
      var sx2 = px + ps * 196;
      E.fillEllipse(c, sx2, py + 4, 13, 4, PAL.woodDark);
      E.fillRound(c, sx2 - 2.5, py - 54, 5, 58, 2, PAL.gold);
      E.fillEllipse(c, sx2, py - 56, 5.5, 5.5, PAL.gold);
    }
    c.strokeStyle = PAL.pinkDeep; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(px - 196, py - 52); c.quadraticCurveTo(px - 160, py - 26, px - 130, py - 30); c.stroke();
    c.beginPath(); c.moveTo(px + 196, py - 52); c.quadraticCurveTo(px + 160, py - 26, px + 130, py - 30); c.stroke();
    E.drawReflection(c, px - 110, py - 8, cast[0], 0, 1, 1.2, 0.18, 24, 'rgba(255,143,192,1)', { pose: 'pose' });
    E.drawReflection(c, px + 110, py - 8, cast[1], 0, -1, 1.2, 0.18, 24, 'rgba(255,143,192,1)', { pose: 'wave' });
    E.drawReflection(c, px, py - 10, Game.look, 0, 1, 1.6, 0.18, 26, 'rgba(255,143,192,1)');
    E.drawCharacter(c, px - 110, py - 8, cast[0], 0, 1, 1.2, (t % 260) < 8, 0, { pose: 'pose', t: t });
    E.drawCharacter(c, px + 110, py - 8, cast[1], 0, -1, 1.2, (t % 240) < 8, 0, { pose: 'wave', t: t });
    E.drawCharacter(c, px, py - 10, Game.look, 0, 1, 1.6, (t % 220) < 8, hop, { t: t });
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
    halo.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
    halo.addColorStop(0.5, 'rgba(255, 230, 242, 0.45)');
    halo.addColorStop(1, 'rgba(255, 230, 242, 0)');
    c.fillStyle = halo;
    c.fillRect(TITLE_CX - 270, 0, 540, 300);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.font = 'bold 30px ' + FONT;
    c.strokeStyle = 'rgba(255, 250, 245, 0.92)';
    c.lineWidth = 6;
    c.strokeText(T('title'), TITLE_CX, 118 + bob);
    c.fillStyle = PAL.ink;
    c.fillText(T('title'), TITLE_CX, 118 + bob);
    fitFont(c, T('title2'), 360, 56, 'bold', 28);
    c.fillStyle = 'rgba(74, 42, 64, 0.25)';
    c.fillText(T('title2'), TITLE_CX + 3, 172 + bob + 6);
    c.strokeStyle = PAL.cream;
    c.lineWidth = 11;
    c.strokeText(T('title2'), TITLE_CX, 172 + bob);
    c.strokeStyle = PAL.gold;
    c.lineWidth = 4;
    c.strokeText(T('title2'), TITLE_CX, 172 + bob);
    var tg = c.createLinearGradient(0, 146 + bob, 0, 198 + bob);
    tg.addColorStop(0, '#ff9ccd');
    tg.addColorStop(0.5, PAL.pinkDeep);
    tg.addColorStop(1, '#b8347a');
    c.fillStyle = tg;
    c.fillText(T('title2'), TITLE_CX, 172 + bob);
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

    button(c, TITLE_BTN.play, T('play'), { font: 22, fill: PAL.sun, r: 12 });
    button(c, TITLE_BTN.how, T('howToPlay'), { font: 15 });
    button(c, TITLE_BTN.lang, T('language') + ': ' + T('langLabel'), { font: 14 });
    button(c, TITLE_BTN.sound, Game.audio.isMuted() ? T('soundOff') : T('soundOn'), { font: 14 });
    if (hasSave()) button(c, TITLE_BTN.reset, T('startOver'), { font: 12, fill: 'rgba(255,246,236,0.7)' });
    if (Game.progress && Game.progress.stars > 0) drawStarBadge(c, 14, 46, Game.progress.stars, T('hudStars'));
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
    clipGame(c);

    /* picture: Momoko in the studio doorway, looking at a dress rack */
    var R = INTRO.pic;
    c.fillStyle = 'rgba(74, 42, 64, 0.16)';
    E.roundRect(c, R.x, R.y + 4, R.w, R.h, 12);
    c.fill();
    c.save();
    E.roundRect(c, R.x, R.y, R.w, R.h, 12);
    c.clip();
    var g = c.createLinearGradient(0, R.y, 0, R.y + R.h);
    g.addColorStop(0, '#fff0f6'); g.addColorStop(1, PAL.wallB);
    c.fillStyle = g; c.fillRect(R.x, R.y, R.w, R.h);
    var gy = R.y + R.h - 60;
    c.fillStyle = PAL.floor; c.fillRect(R.x, gy, R.w, 60);
    c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(R.x, gy, R.w, 3);
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
    gridX: 292, gridY: 62, cellW: 92, cellH: 96, cols: 5, gap: 6,
    swatchY: 300, swatchSize: 46, swatchGap: 8,
    done: { x: 632, y: 412, w: 152, h: 46 },
  };
  var ward = { station: null, pending: null, particles: [], flash: 0 };

  function wardCell(i) {
    var col = i % WARD.cols, row = Math.floor(i / WARD.cols);
    return {
      x: WARD.gridX + col * (WARD.cellW + WARD.gap),
      y: WARD.gridY + row * (WARD.cellH + WARD.gap),
      w: WARD.cellW, h: WARD.cellH,
    };
  }
  function wardSwatch(i, n, big) {
    var size = big ? 52 : WARD.swatchSize, gap = big ? 14 : WARD.swatchGap;
    var total = n * size + (n - 1) * gap;
    var x0 = big ? 292 + (486 - total) / 2 : 292;
    var y = big ? 180 : WARD.swatchY;
    if (!big && n > 8) { /* two rows of up to 5 */
      var r = Math.floor(i / 5), cc = i % 5;
      return { x: 292 + cc * (size + gap) + 60, y: y - 14 + r * (size + 6), w: size, h: size };
    }
    return { x: x0 + i * (size + gap), y: y, w: size, h: size };
  }

  function getStation(id) {
    for (var i = 0; i < Game.STATIONS.length; i++) if (Game.STATIONS[i].id === id) return Game.STATIONS[i];
    return null;
  }

  function openWardrobe(stationId) {
    ward.station = getStation(stationId);
    ward.pending = null;
    ward.particles = [];
    ward.flash = 0;
  }

  function cloneLook(l) { return JSON.parse(JSON.stringify(l)); }

  function attemptChange(field, value) {
    var st = ward.station;
    var look = Game.look;
    if (look[field] === value) {
      showToast(T('wardAlready'), 90);
      Game.audio.play('deny');
      return;
    }
    var pendingLook = cloneLook(look);
    pendingLook[field] = value;
    /* A colour picked while nothing is worn here also puts on the first
       real item, otherwise the puzzle would buy an invisible change. */
    var also = null;
    if (field === st.colorField && st.field && look[st.field] === 'none' && st.variants.length > 1) {
      also = { field: st.field, value: st.variants[1] };
      pendingLook[also.field] = also.value;
    }
    ward.pending = { field: field, value: value, also: also, look: pendingLook };
    Game.audio.play('select');
    Game.gate.open({
      mode: 'studio',
      icon: function (c, cx, cy, s) {
        E.drawLookTile(c, cx, cy, 72 * (s || 1), pendingLook, st.id, { round: true });
      },
      onResolve: function (res) {
        var p = ward.pending;
        ward.pending = null;
        if (!p) return;
        if (res.ok) {
          Game.look[p.field] = p.value;
          if (p.also) Game.look[p.also.field] = p.also.value;
          Game.audio.play('wear');
          ward.flash = 30;
          var cx = WARD.previewX + WARD.previewW / 2, cy = WARD.previewY + WARD.previewH - 120;
          E.spawnBurst(ward.particles, cx, cy, 26, [PAL.sun, PAL.pink, '#ffffff', PAL.mint, PAL.lavender], 4, 'star');
          E.spawnBurst(ward.particles, cx, cy, 8, [PAL.pink, PAL.coral], 3, 'heart');
        }
        if (Game.engine && Game.engine.save) Game.engine.save();
      },
    });
  }

  function drawWardrobe(c) {
    t++;
    var st = ward.station;
    if (!st) return;
    var look = Game.look;
    Game.studio.drawBackdrop(c, st.x - W / 2, t, TITLE_GROUND, 0, true);
    c.save();
    clipGame(c);

    /* a soft board behind the tiles so the wall decor stays out of the grid */
    c.fillStyle = 'rgba(255, 255, 255, 0.55)';
    E.roundRect(c, 284, 52, 500, 352, 14);
    c.fill();
    E.roundRect(c, 284, 52, 500, 352, 14);
    c.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    c.lineWidth = 2;
    c.stroke();

    /* header: the station's own sign colours */
    E.fillRound(c, 14, 10, 262, 38, 12, st.hue);
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
    var pgy = PY + PH - 54;
    c.fillStyle = PAL.floor; c.fillRect(PX, pgy, PW, 60);
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
    for (var gi = 0; gi < 10; gi++) {
      var ga = gi * Math.PI / 5;
      E.fillEllipse(c, pcx + Math.cos(ga) * 83, pgy - 112 + Math.sin(ga) * 125, 3, 3, gi % 2 ? PAL.pink : '#ffffff', false);
    }
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
    var cycle = Math.floor(t / 150) % 2;
    var walkFrame = Math.floor(t / 9) % 4 + 1;
    var shown = ward.pending ? ward.pending.look : look;
    E.drawReflection(c, pcx, pcy, shown, walkFrame, cycle ? -1 : 1, 3.2, 0.18, PY + PH - pcy - 4, 'rgba(233,184,201,1)');
    E.softShadow(c, pcx, pcy, 62, 11, 0.26);
    E.drawCharacter(c, pcx, pcy, shown, walkFrame, cycle ? -1 : 1, 3.2, (t % 190) < 8, 0, { t: t });
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

    /* variant grid */
    var sel;
    if (st.variants.length) {
      for (var v = 0; v < st.variants.length; v++) {
        var r = wardCell(v);
        var vid = st.variants[v];
        sel = look[st.field] === vid;
        var hot = !sel && pointerOver(c, r.x, r.y, r.w, r.h);
        c.fillStyle = sel ? PAL.sun : (hot ? '#ffffff' : 'rgba(255,246,236,0.92)');
        E.roundRect(c, r.x, r.y, r.w, r.h, 10);
        c.fill();
        E.ink(c, sel ? 3 : 1.8);
        var tileLook = cloneLook(look);
        tileLook[st.field] = vid;
        if (st.id === 'hair' || st.id === 'ears') tileLook.hat = 'none';
        if (st.id === 'eyes' && (look.accessory === 'glasses' || look.accessory === 'sunglasses')) tileLook.accessory = 'none';
        E.drawLookTile(c, r.x + r.w / 2, r.y + 36, 60, tileLook, st.id, { bgTop: '#ffffff', bgBot: sel ? '#fff3c0' : '#ffeaf3' });
        if (vid === 'none') {
          c.save(); c.globalAlpha = 0.9;
          E.fillEllipse(c, r.x + r.w - 14, r.y + 14, 9, 9, PAL.coral);
          c.strokeStyle = '#fff'; c.lineWidth = 2.2;
          c.beginPath(); c.moveTo(r.x + r.w - 18, r.y + 14); c.lineTo(r.x + r.w - 10, r.y + 14); c.stroke();
          c.restore();
        }
        c.fillStyle = PAL.ink;
        var lbl = T(st.labelPrefix + vid);
        fitFont(c, lbl, r.w - 8, 11, 'bold', 7);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(lbl, r.x + r.w / 2, r.y + r.h - 14);
      }
    } else {
      c.fillStyle = PAL.ink;
      c.font = 'bold 16px ' + FONT;
      c.textAlign = 'center';
      c.fillText(T('wardSkinHint'), 292 + 243, 120);
    }

    /* colour swatches */
    if (st.colorField && st.colors) {
      var big = !st.variants.length;
      if (!big) {
        c.fillStyle = 'rgba(74,42,64,0.7)';
        c.font = 'bold 12px ' + FONT;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(T('wardColour'), 294, WARD.swatchY - 14 + (st.colors.length > 8 ? -10 : 0));
      }
      for (var s = 0; s < st.colors.length; s++) {
        swatch(c, wardSwatch(s, st.colors.length, big), st.colors[s], look[st.colorField] === st.colors[s]);
      }
    }

    c.fillStyle = 'rgba(74,42,64,0.6)';
    c.font = '12px ' + FONT;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(T('wardHint'), 294, 428);
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
      for (i = 0; i < st.variants.length; i++) {
        if (hit(wardCell(i), mx, my)) { attemptChange(st.field, st.variants[i]); return null; }
      }
    }
    if (st.colorField && st.colors) {
      var big = !st.variants.length;
      for (i = 0; i < st.colors.length; i++) {
        if (hit(wardSwatch(i, st.colors.length, big), mx, my)) { attemptChange(st.colorField, st.colors[i]); return null; }
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
    c.fillStyle = 'rgba(255, 246, 236, 0.97)';
    E.roundRect(c, x, y, w, 30, 15);
    c.fill();
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
    button: button, hit: hit, panel: panel, multiline: multiline, swatch: swatch,
    FONT: FONT, pointerOver: pointerOver, fitFont: fitFont, layoutLines: layoutLines,
    beginFrame: function () { anyHot = false; },
    isHot: function () { return anyHot; },
    showToast: showToast, drawToast: drawToast,
    dropStaleToast: dropStaleToast, endFrame: endFrame,
    drawVersionStamp: drawVersionStamp, drawStarBadge: drawStarBadge,
    drawTitleScreen: drawTitleScreen, handleTitleClick: handleTitleClick,
    drawIntroScreen: drawIntroScreen, handleIntroClick: handleIntroClick,
    openWardrobe: openWardrobe, drawWardrobe: drawWardrobe, handleWardrobeClick: handleWardrobeClick,
    drawHud: drawHud, drawPrompt: drawPrompt,
    drawPauseMenu: drawPauseMenu, handlePauseClick: handlePauseClick,
    hasSave: hasSave,
    resetTitleCast: function () { titleFriends = null; },
  };
})();
