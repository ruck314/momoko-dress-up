/* levels.js – pure data tables. No drawing, no state mutation.
 *
 * Everything the designer might want to retune lives here: the studio
 * layout, every wardrobe station with its variants and colour swatches,
 * the default look, and the pool of runway models.
 */
(function () {
  'use strict';
  window.Game = window.Game || {};

  /* ---- Shared studio palette ----
     Referenced by every painter so a re-tint is a change in one place. */
  Game.PAL = {
    ink: '#4a2a40',        /* the universal outline colour */
    bezel: '#2b1530',
    cream: '#fff6ec',
    creamDark: '#f1d9d0',
    pink: '#ff8fc0',
    pinkDeep: '#e2559a',
    lavender: '#c79bff',
    purple: '#8e5bd1',
    mint: '#8fe3c8',
    teal: '#43b9a4',
    sky: '#9fd9ff',
    sun: '#ffd24a',
    gold: '#f2b632',
    peach: '#ffb3a7',
    coral: '#ff7a6b',
    wall: '#fbe4ef',
    wallB: '#f3cfe3',
    floor: '#e9b8c9',
    floorDark: '#d79ab2',
    wood: '#c98a5e',
    woodDark: '#9a6340',
  };

  /* ---- Studio ----
     One side-view hall. Ground is flat; groundY is where feet land.
     Every x here is in world space. Stations are evenly spaced so the
     walk between them is short but each one gets its own little set. */
  var STATION_X0 = 400, STATION_GAP = 215;
  Game.STUDIO = {
    width: 3420,
    groundY: 400,
    playerStart: { x: 170, y: 400 },
    stationX0: STATION_X0,
    stationGap: STATION_GAP,
    runwayDoor: { x: 3270 },
  };

  /* ---- Colour swatches ---- */
  Game.SKIN_COLORS  = ['#ffe3cc', '#ffddbb', '#f6c9a0', '#e0a878', '#c58a5c', '#9c6b45', '#7a4f31', '#5a3a26'];
  Game.HAIR_COLORS  = ['#e06088', '#4a3728', '#f5d060', '#4488ff', '#222222', '#b8622f', '#c79bff', '#43b9a4'];
  Game.EYE_COLORS   = ['#4a3728', '#3f7fd6', '#3e9b5a', '#8e5bd1', '#e2559a', '#e0922a'];
  Game.LIP_COLORS   = ['#4a2a40', '#ff6fa8', '#d8323c', '#ff8a6b', '#a05ad1', '#ffb3d9'];
  Game.CLOTH_COLORS = ['#ff8fc0', '#e2559a', '#c79bff', '#8fe3c8', '#9fd9ff', '#ffd24a', '#ff7a6b', '#fff6ec', '#5a7fb0', '#4a3728'];
  Game.SHOE_COLORS  = ['#e2559a', '#ff8fc0', '#4a3728', '#fff6ec', '#c79bff', '#43b9a4', '#ffd24a', '#5a7fb0'];
  Game.ACC_COLORS   = ['#ffd24a', '#ff8fc0', '#c79bff', '#8fe3c8', '#9fd9ff', '#ff7a6b', '#fff6ec', '#4a3728'];
  Game.EAR_COLORS   = ['#ff8fc0', '#fff6ec', '#4a3728', '#c98a5e', '#c79bff', '#9fd9ff'];

  /* ---- Wardrobe stations ----
     Walked to in this order, left to right. `field` is the key written
     into the look record; `colorField` optionally enables a swatch row.
     `hue` colours the booth's awning and sign; `labelPrefix` + variant
     is the i18n key for each tile. A station with no variants (skin) is
     colour-only. The 'none' variant always comes first so taking
     something off is as easy as putting it on. */
  Game.STATIONS = [
    { id: 'skin',   labelKey: 'st_skin',   field: null,         colorField: 'skin',       colors: Game.SKIN_COLORS,
      variants: [], labelPrefix: '', hue: '#ffd24a', emblem: 'sun' },
    { id: 'hair',   labelKey: 'st_hair',   field: 'hairStyle',  colorField: 'hair',       colors: Game.HAIR_COLORS,
      variants: ['twinTails', 'longBraids', 'buns', 'bob', 'ponytail', 'longWavy', 'curly', 'pixie', 'sidePony', 'topBun'],
      labelPrefix: 'hair_', hue: '#ff8fc0', emblem: 'hair' },
    { id: 'eyes',   labelKey: 'st_eyes',   field: 'eyeStyle',   colorField: 'eyeColor',   colors: Game.EYE_COLORS,
      variants: ['round', 'sparkle', 'happy', 'wink', 'cat', 'star'],
      labelPrefix: 'eye_', hue: '#9fd9ff', emblem: 'eyes' },
    { id: 'nose',   labelKey: 'st_nose',   field: 'noseStyle',  colorField: null,         colors: null,
      variants: ['button', 'dot', 'line', 'freckles', 'heart'],
      labelPrefix: 'nose_', hue: '#ffb3a7', emblem: 'nose' },
    { id: 'ears',   labelKey: 'st_ears',   field: 'earStyle',   colorField: 'earColor',   colors: Game.EAR_COLORS,
      variants: ['round', 'elf', 'cat', 'bunny', 'bear', 'puppy'],
      labelPrefix: 'ear_', hue: '#8fe3c8', emblem: 'ears' },
    { id: 'mouth',  labelKey: 'st_mouth',  field: 'mouthStyle', colorField: 'lipColor',   colors: Game.LIP_COLORS,
      variants: ['smile', 'grin', 'open', 'cat', 'tongue', 'kiss'],
      labelPrefix: 'mouth_', hue: '#ff7a6b', emblem: 'mouth' },
    { id: 'dress',  labelKey: 'st_dress',  field: 'dress',      colorField: 'dressColor', colors: Game.CLOTH_COLORS,
      variants: ['none', 'frilly', 'sailor', 'star', 'ballgown', 'princess', 'sundress', 'tutu', 'kimono', 'polka'],
      labelPrefix: 'dress_', hue: '#e2559a', emblem: 'dress' },
    { id: 'pants',  labelKey: 'st_pants',  field: 'pants',      colorField: 'pantsColor', colors: Game.CLOTH_COLORS,
      variants: ['none', 'jeans', 'leggings', 'shorts', 'overalls', 'skirt', 'poofySkirt', 'stripey'],
      labelPrefix: 'pants_', hue: '#5a7fb0', emblem: 'pants' },
    { id: 'jacket', labelKey: 'st_jacket', field: 'jacket',     colorField: 'jacketColor', colors: Game.CLOTH_COLORS,
      variants: ['none', 'denim', 'hoodie', 'cardigan', 'raincoat', 'cape', 'puffer', 'blazer'],
      labelPrefix: 'jacket_', hue: '#c79bff', emblem: 'jacket' },
    { id: 'shoes',  labelKey: 'st_shoes',  field: 'shoes',      colorField: 'shoeColor',  colors: Game.SHOE_COLORS,
      variants: ['none', 'maryJane', 'sneaker', 'boots', 'sandals', 'rainBoots', 'ballet', 'rollerSkates', 'slippers'],
      labelPrefix: 'shoes_', hue: '#43b9a4', emblem: 'shoes' },
    { id: 'hat',    labelKey: 'st_hat',    field: 'hat',        colorField: 'hatColor',   colors: Game.ACC_COLORS,
      variants: ['none', 'strawHat', 'beret', 'flowerCrown', 'tiara', 'bigBow', 'cap', 'beanie', 'partyHat', 'unicorn'],
      labelPrefix: 'hat_', hue: '#f2b632', emblem: 'hat' },
    { id: 'bag',    labelKey: 'st_bag',    field: 'bag',        colorField: 'bagColor',   colors: Game.ACC_COLORS,
      variants: ['none', 'backpack', 'purse', 'tote', 'basket', 'heartBag', 'starBag', 'messenger'],
      labelPrefix: 'bag_', hue: '#ff7a6b', emblem: 'bag' },
    { id: 'extra',  labelKey: 'st_extra',  field: 'accessory',  colorField: 'accColor',   colors: Game.ACC_COLORS,
      variants: ['none', 'glasses', 'sunglasses', 'necklace', 'scarf', 'wings', 'wand', 'bowTie'],
      labelPrefix: 'acc_', hue: '#8e5bd1', emblem: 'extra' },
  ];
  for (var i = 0; i < Game.STATIONS.length; i++) {
    Game.STATIONS[i].x = STATION_X0 + i * STATION_GAP;
  }

  /* ---- The starting look ----
     Nothing on but the base layer (a cream camisole and shorts), bare
     feet, and a friendly face. Every station starts from here. */
  Game.DEFAULT_LOOK = {
    skin: '#ffddbb',
    hair: '#e06088', hairStyle: 'twinTails',
    eyeStyle: 'round', eyeColor: '#4a3728',
    noseStyle: 'button',
    earStyle: 'round', earColor: '#ff8fc0',
    mouthStyle: 'smile', lipColor: '#4a2a40',
    dress: 'none', dressColor: '#ff8fc0',
    pants: 'none', pantsColor: '#5a7fb0',
    jacket: 'none', jacketColor: '#c79bff',
    shoes: 'none', shoeColor: '#e2559a',
    hat: 'none', hatColor: '#ffd24a',
    bag: 'none', bagColor: '#ff7a6b',
    accessory: 'none', accColor: '#ffd24a',
  };

  /* ---- Runway models ----
     Four of these walk with Momoko each show, picked at random with a
     random look each time. i18n key is 'model_<id>'. */
  Game.MODEL_NAMES = ['lila', 'kai', 'nori', 'poppy', 'hana', 'yuki', 'mei', 'sora', 'emma', 'luna'];

  /* Scenery between the stations, painted by entities.js drawStudioDecor().
     Positioned relative to the station grid so moving a station moves
     its neighbours' plants and posters with it. */
  Game.STUDIO.decor = (function () {
    var out = [];
    out.push({ type: 'plant', x: 60 });
    out.push({ type: 'mirror', x: 250 });
    for (var s = 0; s < Game.STATIONS.length; s++) {
      var x = Game.STATIONS[s].x;
      var kind = ['plant', 'poster', 'mannequin', 'lamp'][s % 4];
      out.push({ type: kind, x: x + STATION_GAP / 2, n: s });
    }
    out.push({ type: 'plant', x: Game.STUDIO.runwayDoor.x - 120 });
    out.push({ type: 'plant', x: Game.STUDIO.runwayDoor.x + 110 });
    return out;
  })();
})();
