/* i18n – English / Japanese translations.
   The language also picks the puzzle: English asks arithmetic, Japanese
   asks kanji readings (see mathgate.js). */
(function () {
  'use strict';
  window.Game = window.Game || {};

  var strings = {
    en: {
      /* ---- Title screen ---- */
      title: 'Momoko and Friends',
      title2: 'Dress Up',
      titleSubtitle: '~ A Sparkly Fashion Show ~',
      play: 'Play',
      howToPlay: 'How to Play',
      instructions: 'Walk: Arrow Keys / D-Pad\nTry things on: Space / DO Button\n\nVisit every station in the studio to pick\nhair, eyes, dresses, hats, bags and more.\nSolve a quick puzzle to put each one on,\nthen strut down the runway!',
      language: 'Language',
      langLabel: 'EN',
      rotateHint: 'Please rotate your device to landscape mode!',
      actionBtn: 'DO',
      closeHint: '(tap anywhere to close)',
      soundOn: 'Sound: ON',
      soundOff: 'Sound: OFF',
      startOver: 'Start Over',
      startOverConfirm: 'Take everything off\nand start again?',
      yes: 'Yes',
      no: 'No',

      /* ---- Intro ---- */
      introTitle: 'Show Day!',
      introText: "Today is the big fashion show, and Momoko has nothing to wear!\n\nLuckily the studio is full of stations: a hair salon, an eye studio,\nracks of dresses and jackets, shelves of shoes, hats and bags.\n\nEvery station has a little puzzle at the counter.\nSolve it, and the stylist hands you what you picked.\n\nWhen your look is ready, walk through the sparkly door\nat the end of the studio and strut down the runway!",
      continueBtn: 'Continue',

      /* ---- Pause ---- */
      paused: 'Paused',
      resume: 'Resume',
      quit: 'Back to Title',

      /* ---- HUD / prompts ---- */
      promptRunway: 'Fashion Show!',
      hudStars: 'Stars',
      hudLook: 'Your Look',
      runwayDoorSign: 'RUNWAY',
      studioSign: 'MOMOKO STUDIO',

      /* ---- Stations ---- */
      st_skin: 'Sunshine Mirror',
      st_hair: 'Hair Salon',
      st_eyes: 'Eye Studio',
      st_nose: 'Nose Nook',
      st_ears: 'Ear Corner',
      st_mouth: 'Smile Mirror',
      st_dress: 'Dress Rack',
      st_pants: 'Pants & Skirts',
      st_jacket: 'Jacket Closet',
      st_shoes: 'Shoe Shelf',
      st_hat: 'Hat Stand',
      st_bag: 'Bag Counter',
      st_extra: 'Jewels & More',

      /* ---- Wardrobe panel ---- */
      wardDone: 'All Done',
      wardColour: 'Colour',
      wardAlready: 'You already have that on!',
      wardHint: 'Tap anything to put it on!',
      wardSkinHint: 'Pick a skin tone.',

      /* ---- Variants ---- */
      hair_twinTails: 'Twin Tails', hair_longBraids: 'Long Braids', hair_buns: 'Space Buns',
      hair_bob: 'Bob', hair_ponytail: 'Ponytail', hair_longWavy: 'Long Waves', hair_curly: 'Curly',
      hair_pixie: 'Pixie Cut', hair_sidePony: 'Side Pony', hair_topBun: 'Top Bun',
      eye_round: 'Round', eye_sparkle: 'Sparkle', eye_happy: 'Happy', eye_wink: 'Wink',
      eye_cat: 'Cat Eyes', eye_star: 'Starry',
      nose_button: 'Button', nose_dot: 'Dot', nose_line: 'Tiny', nose_freckles: 'Freckles', nose_heart: 'Heart',
      ear_round: 'Round', ear_elf: 'Elf', ear_cat: 'Cat', ear_bunny: 'Bunny', ear_bear: 'Bear', ear_puppy: 'Puppy',
      mouth_smile: 'Smile', mouth_grin: 'Big Grin', mouth_open: 'Open Smile', mouth_cat: 'Cat Mouth',
      mouth_tongue: 'Tongue Out', mouth_kiss: 'Kissy',
      dress_none: 'Nothing', dress_frilly: 'Frilly Dress', dress_sailor: 'Sailor Dress', dress_star: 'Star Dress',
      dress_ballgown: 'Ball Gown', dress_princess: 'Princess', dress_sundress: 'Sundress', dress_tutu: 'Tutu',
      dress_kimono: 'Kimono', dress_polka: 'Polka Dots',
      pants_none: 'Nothing', pants_jeans: 'Jeans', pants_leggings: 'Leggings', pants_shorts: 'Shorts',
      pants_overalls: 'Overalls', pants_skirt: 'Skirt', pants_poofySkirt: 'Poofy Skirt', pants_stripey: 'Stripey Tights',
      jacket_none: 'Nothing', jacket_denim: 'Denim Jacket', jacket_hoodie: 'Hoodie', jacket_cardigan: 'Cardigan',
      jacket_raincoat: 'Raincoat', jacket_cape: 'Cape', jacket_puffer: 'Puffer', jacket_blazer: 'Blazer',
      shoes_none: 'Barefoot', shoes_maryJane: 'Mary Janes', shoes_sneaker: 'Sneakers', shoes_boots: 'Boots',
      shoes_sandals: 'Sandals', shoes_rainBoots: 'Rain Boots', shoes_ballet: 'Ballet Flats',
      shoes_rollerSkates: 'Roller Skates', shoes_slippers: 'Bunny Slippers',
      hat_none: 'Nothing', hat_strawHat: 'Straw Hat', hat_beret: 'Beret', hat_flowerCrown: 'Flower Crown',
      hat_tiara: 'Tiara', hat_bigBow: 'Big Bow', hat_cap: 'Cap', hat_beanie: 'Beanie', hat_partyHat: 'Party Hat',
      hat_unicorn: 'Unicorn Horn',
      bag_none: 'Nothing', bag_backpack: 'Backpack', bag_purse: 'Purse', bag_tote: 'Tote Bag', bag_basket: 'Basket',
      bag_heartBag: 'Heart Bag', bag_starBag: 'Star Bag', bag_messenger: 'Messenger Bag',
      acc_none: 'Nothing', acc_glasses: 'Glasses', acc_sunglasses: 'Sunglasses', acc_necklace: 'Necklace',
      acc_scarf: 'Scarf', acc_wings: 'Fairy Wings', acc_wand: 'Magic Wand', acc_bowTie: 'Bow Tie',

      /* ---- Puzzle gate ---- */
      gateTitle: 'Solve it to come in!',
      gateRunwayTitle: 'Strike a pose... and solve!',
      gateTries: 'Tries left',
      gateMathPrompt: 'What is the answer?',
      gateKanjiPrompt: 'How do you read it? (hiragana)',
      gateCorrect: 'Correct!',
      gateWrong: 'Not quite, try again!',
      gateFail: 'The answer was',
      gateAbort: 'Maybe next time!',
      gateCancel: 'Cancel',
      gateOk: 'OK',
      inputKeyboard: 'Keyboard',
      inputKeypad: 'Kana Pad',
      inputKeyboardHint: 'Type the reading in hiragana, then press OK.',
      inputTapHere: 'Tap here to type',

      /* ---- Runway ---- */
      runwayTitle: 'Fashion Show!',
      runwayReady: 'Five models are backstage, and you are one of them.\nWhen it is your turn, walk to the end of the runway,\nstrike a pose and solve the puzzle. The fewer tries,\nthe higher you place!',
      runwayStart: 'Start the Show',
      runwayNow: 'Now walking:',
      runwayYou: 'You',
      runwayPass: 'Perfect!',
      runwayFail: 'Oops!',
      runwayResults: 'Results',
      runwayYourPlace: 'You placed',
      runwayWinner: 'You won the fashion show!',
      runwayGreat: 'What a show! Try again for first place!',
      runwayAgain: 'Show Again',
      runwayBack: 'Back to Studio',
      place_1: '1st Place', place_2: '2nd Place', place_3: '3rd Place', place_4: '4th Place', place_5: '5th Place',
      ordinal_1: '1st', ordinal_2: '2nd', ordinal_3: '3rd', ordinal_4: '4th', ordinal_5: '5th',
      passed: 'solved', failed: 'missed',

      /* ---- Models ---- */
      model_momoko: 'Momoko', model_lila: 'Lila', model_kai: 'Kai', model_nori: 'Nori', model_poppy: 'Poppy',
      model_hana: 'Hana', model_yuki: 'Yuki', model_mei: 'Mei', model_sora: 'Sora', model_emma: 'Emma', model_luna: 'Luna',
    },

    ja: {
      /* ---- Title screen ---- */
      title: 'ももこと なかまたち',
      title2: 'おしゃれ ドレスアップ',
      titleSubtitle: '～ きらきら ファッションショー ～',
      play: 'あそぶ',
      howToPlay: 'あそびかた',
      instructions: 'あるく: やじるしキー / じゅうじキー\nためす: スペース / DOボタン\n\nスタジオの おみせを まわって\nかみがた・め・ドレス・ぼうし・バッグを えらぼう。\nクイズに こたえると みにつけられるよ。\nさいごは ランウェイを あるこう！',
      language: 'ことば',
      langLabel: 'JA',
      rotateHint: 'デバイスを よこむきにしてください！',
      actionBtn: 'DO',
      closeHint: '（どこかを タップで とじる）',
      soundOn: 'おと: ON',
      soundOff: 'おと: OFF',
      startOver: 'さいしょから',
      startOverConfirm: 'ぜんぶ ぬいで\nさいしょから はじめる？',
      yes: 'はい',
      no: 'いいえ',

      /* ---- Intro ---- */
      introTitle: 'ショーの ひ！',
      introText: 'きょうは おおきな ファッションショー。\nでも ももこは きる ものが ありません！\n\nだいじょうぶ。スタジオには おみせが いっぱい。\nヘアサロン、めの スタジオ、ドレスや ジャケットの ラック、\nくつ・ぼうし・バッグの たなも あります。\n\nどの おみせにも ちいさな クイズが あって、\nこたえられたら えらんだ ものを もらえます。\n\nじゅんびが できたら スタジオの おくの きらきらドアから\nランウェイへ！',
      continueBtn: 'つづける',

      /* ---- Pause ---- */
      paused: 'ポーズ',
      resume: 'つづける',
      quit: 'タイトルへ',

      /* ---- HUD / prompts ---- */
      promptRunway: 'ファッションショー！',
      hudStars: 'スター',
      hudLook: 'いまの コーデ',
      runwayDoorSign: 'ランウェイ',
      studioSign: 'ももこ スタジオ',

      /* ---- Stations ---- */
      st_skin: 'おひさま ミラー',
      st_hair: 'ヘアサロン',
      st_eyes: 'めの スタジオ',
      st_nose: 'はなの コーナー',
      st_ears: 'みみの コーナー',
      st_mouth: 'にっこり ミラー',
      st_dress: 'ドレス ラック',
      st_pants: 'ズボンと スカート',
      st_jacket: 'ジャケット クローゼット',
      st_shoes: 'くつの たな',
      st_hat: 'ぼうし スタンド',
      st_bag: 'バッグ カウンター',
      st_extra: 'アクセサリー',

      /* ---- Wardrobe panel ---- */
      wardDone: 'できた',
      wardColour: 'いろ',
      wardAlready: 'もう それを つけているよ！',
      wardHint: 'タップして ためしてみよう！',
      wardSkinHint: 'はだの いろを えらぼう。',

      /* ---- Variants ---- */
      hair_twinTails: 'ツインテール', hair_longBraids: 'みつあみ', hair_buns: 'おだんご',
      hair_bob: 'ボブ', hair_ponytail: 'ポニーテール', hair_longWavy: 'ロングウェーブ', hair_curly: 'カール',
      hair_pixie: 'ショート', hair_sidePony: 'サイドポニー', hair_topBun: 'トップおだんご',
      eye_round: 'まるい め', eye_sparkle: 'きらきら', eye_happy: 'にこにこ', eye_wink: 'ウインク',
      eye_cat: 'ねこの め', eye_star: 'ほしの め',
      nose_button: 'まるい はな', nose_dot: 'てん', nose_line: 'ちいさい', nose_freckles: 'そばかす', nose_heart: 'ハート',
      ear_round: 'まるい みみ', ear_elf: 'エルフ', ear_cat: 'ねこみみ', ear_bunny: 'うさみみ', ear_bear: 'くまみみ', ear_puppy: 'いぬみみ',
      mouth_smile: 'にっこり', mouth_grin: 'にかっ', mouth_open: 'あーん', mouth_cat: 'ねこぐち',
      mouth_tongue: 'べー', mouth_kiss: 'ちゅっ',
      dress_none: 'なし', dress_frilly: 'フリルドレス', dress_sailor: 'セーラードレス', dress_star: 'ほしの ドレス',
      dress_ballgown: 'ボールガウン', dress_princess: 'プリンセス', dress_sundress: 'サンドレス', dress_tutu: 'チュチュ',
      dress_kimono: 'きもの', dress_polka: 'みずたま',
      pants_none: 'なし', pants_jeans: 'ジーンズ', pants_leggings: 'レギンス', pants_shorts: 'ショートパンツ',
      pants_overalls: 'オーバーオール', pants_skirt: 'スカート', pants_poofySkirt: 'ふわふわスカート', pants_stripey: 'しましまタイツ',
      jacket_none: 'なし', jacket_denim: 'デニムジャケット', jacket_hoodie: 'パーカー', jacket_cardigan: 'カーディガン',
      jacket_raincoat: 'レインコート', jacket_cape: 'マント', jacket_puffer: 'ダウン', jacket_blazer: 'ブレザー',
      shoes_none: 'はだし', shoes_maryJane: 'ストラップシューズ', shoes_sneaker: 'スニーカー', shoes_boots: 'ブーツ',
      shoes_sandals: 'サンダル', shoes_rainBoots: 'ながぐつ', shoes_ballet: 'バレエシューズ',
      shoes_rollerSkates: 'ローラースケート', shoes_slippers: 'うさぎスリッパ',
      hat_none: 'なし', hat_strawHat: 'むぎわらぼうし', hat_beret: 'ベレーぼう', hat_flowerCrown: 'はなかんむり',
      hat_tiara: 'ティアラ', hat_bigBow: 'おおきな リボン', hat_cap: 'キャップ', hat_beanie: 'ニットぼう', hat_partyHat: 'パーティーぼう',
      hat_unicorn: 'ユニコーンの つの',
      bag_none: 'なし', bag_backpack: 'リュック', bag_purse: 'ポシェット', bag_tote: 'トートバッグ', bag_basket: 'かご',
      bag_heartBag: 'ハートバッグ', bag_starBag: 'ほしバッグ', bag_messenger: 'ショルダーバッグ',
      acc_none: 'なし', acc_glasses: 'めがね', acc_sunglasses: 'サングラス', acc_necklace: 'ネックレス',
      acc_scarf: 'マフラー', acc_wings: 'ようせいの はね', acc_wand: 'まほうの つえ', acc_bowTie: 'ちょうネクタイ',

      /* ---- Puzzle gate ---- */
      gateTitle: 'クイズに こたえて はいろう！',
      gateRunwayTitle: 'ポーズを きめて… クイズ！',
      gateTries: 'のこり',
      gateMathPrompt: 'こたえは？',
      gateKanjiPrompt: 'よみかたを ひらがなで かいてね',
      gateCorrect: 'せいかい！',
      gateWrong: 'おしい！ もういちど！',
      gateFail: 'こたえは',
      gateAbort: 'また こんどね！',
      gateCancel: 'やめる',
      gateOk: 'OK',
      inputKeyboard: 'キーボード',
      inputKeypad: '50おんひょう',
      inputKeyboardHint: 'ひらがなで うって OK をおしてね（かんじに しなくていいよ）',
      inputTapHere: 'ここを タップして かいてね',

      /* ---- Runway ---- */
      runwayTitle: 'ファッションショー！',
      runwayReady: 'モデルは 5にん。あなたも その ひとり！\nじぶんの ばんが きたら ランウェイの さきまで あるいて\nポーズを きめて クイズに こたえよう。\nすくない かいすうで こたえるほど じゅんいが あがるよ！',
      runwayStart: 'ショーを はじめる',
      runwayNow: 'つぎの モデル:',
      runwayYou: 'あなた',
      runwayPass: 'かんぺき！',
      runwayFail: 'あちゃー！',
      runwayResults: 'けっか はっぴょう',
      runwayYourPlace: 'あなたの じゅんい',
      runwayWinner: 'ファッションショーで ゆうしょう！',
      runwayGreat: 'すてきな ショーだったね！ 1いを めざして もういちど！',
      runwayAgain: 'もういちど',
      runwayBack: 'スタジオへ もどる',
      place_1: '1い', place_2: '2い', place_3: '3い', place_4: '4い', place_5: '5い',
      ordinal_1: '1い', ordinal_2: '2い', ordinal_3: '3い', ordinal_4: '4い', ordinal_5: '5い',
      passed: 'せいかい', failed: 'ざんねん',

      /* ---- Models ---- */
      model_momoko: 'ももこ', model_lila: 'リラ', model_kai: 'カイ', model_nori: 'ノリ', model_poppy: 'ポピー',
      model_hana: 'はな', model_yuki: 'ゆき', model_mei: 'めい', model_sora: 'そら', model_emma: 'エマ', model_luna: 'ルナ',
    },
  };

  var lang = 'en';

  function t(key) {
    var table = strings[lang] || strings.en;
    if (table[key] !== undefined) return table[key];
    if (strings.en[key] !== undefined) return strings.en[key];
    return key;
  }

  window.Game.i18n = {
    t: t,
    getLang: function () { return lang; },
    setLang: function (l) { if (strings[l]) lang = l; },
    toggle: function () { lang = (lang === 'en') ? 'ja' : 'en'; return lang; },
    /* Every string in every language, so the UI font's Japanese subsets
       can be fetched up front instead of popping in mid-game. */
    allText: function () {
      var out = '';
      for (var l in strings) {
        for (var k in strings[l]) out += strings[l][k];
      }
      return out;
    },
  };
})();
