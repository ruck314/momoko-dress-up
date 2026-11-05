# Momoko and Friends Dress Up

A sparkly dress-up game with a secret: every outfit change is a little
puzzle. **Momoko** starts show day in nothing but a cream camisole and
shorts, walks the length of a fashion studio full of stations (a hair
salon, an eye studio, racks of dresses, jackets, shoes, hats, bags and
more), and dresses up for the runway. Each thing she tries on costs one
quick puzzle at the counter. When her look is ready she walks through the
sparkly door at the end of the studio and struts the catwalk against four
randomly dressed friends.

## Play

Open `index.html` in any modern browser. Works offline after the first
visit (PWA). Live at <https://ruck314.github.io/momoko-dress-up/>.

## Controls

| Action                   | Keyboard          | Touch          |
|--------------------------|-------------------|----------------|
| Walk                     | Arrow Keys / WASD | D-Pad (left)   |
| Open a station / runway  | Space / Z         | DO Button      |
| Pause / close            | Escape / P        | Pause Button   |
| Answer a puzzle          | Digits, Enter, Backspace (romaji typing in Japanese) | On-screen keypad |

## The puzzles

The language picker chooses the puzzle, so the same game teaches two
things:

- **English: arithmetic.** Times tables from 1 to 9, and three-digit
  addition and subtraction whose answers stay between 0 and 999.
- **Japanese: kanji.** Readings of the 240 kyōiku kanji a child knows by
  the end of second grade (the 80 first-grade and 160 second-grade
  characters), typed in hiragana on a 50-sound keypad with ゛ ゜ 小 and ー
  keys. A bare kanji accepts every on-yomi and kun-yomi (新 → しん, あたら,
  あたらしい, あらた, にい...); a word with okurigana or a compound wants
  the word's reading (新しい → あたらしい, 新聞 → しんぶん).

**In the studio** every change (a new hairstyle, a colour swatch, taking
something off) opens the puzzle with three tries. Three misses abort the
change and show the answer; coming back asks a fresh question.

**On the runway** the five models walk one at a time. The friends think
their puzzle over in a bubble and pass or miss with a happy or sad sting.
Momoko's puzzle is live, with four tries: solve it first try for 1st
place, second try for 2nd, and so on; miss all four and she places 5th.
The order of the models, the friends' names and outfits, and the catwalk
soundtrack (one of five tunes) are shuffled every show.

**Difficulty adapts.** Arithmetic and kanji each keep a skill level from
0 to 4 in the save. A first-try answer nudges it up, a miss pulls it
down, and each new question is pitched at the current level with a small
wobble so it never feels like a wall:

| Level | Arithmetic                                     | Kanji                                   |
|-------|------------------------------------------------|-----------------------------------------|
| 0     | ×1–3, no carrying / borrowing, 2-digit second term | grade-1 kanji, any reading           |
| 1     | ×2–5, 3-digit terms, still no carry / borrow     | grade-1 kanji or grade-1 word         |
| 2     | ×2–7, one carry / borrow                         | grade-2 kanji, grade-1 words          |
| 3     | ×3–9, two carries / borrows                      | grade-2 words with okurigana          |
| 4     | ×6–9, borrowing across a zero                    | grade-2 compounds (on-yomi)           |

Stars are awarded for every solve (two for a first try) and shown on the
HUD and the title screen.

## Features

- **Pure HTML5 Canvas + JavaScript**: no frameworks, no build tools, no assets
- **PWA**: install to home screen, works offline
- **Touch and desktop equally**: the canvas widens on touch devices so the
  D-pad sits in a side bezel instead of on top of the game; the shared
  control geometry matches the other Momoko games
- **Dual language**: English and Japanese, with a different puzzle in each
- **All art generated in code**: no image files anywhere
- **13 stations, ~100 wardrobe variants, 8 colour palettes**: skin, hair,
  eyes, nose, ears, mouth, dress, pants & skirts, jacket, shoes, hat, bag
  and accessories, every one drawn on the character in real time
- **Five procedural catwalk soundtracks**, chosen at random each show

## Project Structure

```
index.html          — entry point (meta tags, Back-to-Game-Center link)
css/style.css       — layout, rotate-hint, overlay styles
js/i18n.js          — English & Japanese translations
js/audio.js         — Web Audio engine, SFX, studio / title music, five runway tracks
js/input.js         — keyboard & touch; key-capture hook for the keypads
js/levels.js        — ALL data: palette, studio layout, stations, colours, default look
js/kanji.js         — the 240 grade 1-2 kanji with readings and example words
js/entities.js      — the character painter (every variant), look tiles, walkers, particles
js/studio.js        — studio scenery, booths, the runway door, the runway hall
js/mathgate.js      — puzzle generators, adaptive difficulty, number pad and kana keypad
js/ui.js            — title, intro, wardrobe panel, HUD, pause
js/runway.js        — the fashion show state machine and results
js/engine.js        — game loop, state machine, camera, persistence
js/pwa.js           — service worker registration
sw.js               — service worker
manifest.json       — PWA manifest
```

## Save data

All state lives in `localStorage` under the `momoko-dressup-` prefix:
`look`, `progress` (skills, stars, solved / missed counts), `flags`,
`settings`. Every game on `ruck314.github.io` shares one localStorage
origin, so keys must stay namespaced per game; `js/engine.js` routes every
read and write through a single `KEY()` helper.

## Adding content

- **A wardrobe variant**: add its id to the station's `variants` in
  `js/levels.js`, paint it in the matching `draw*` function in
  `js/entities.js`, and add a `<prefix><id>` string to `js/i18n.js`
  (EN + JA). Tiles, booth displays and the puzzle card all render through
  `drawLookTile()`, so nothing else needs an icon.
- **A station**: push an entry onto `Game.STATIONS` (the x positions are
  derived from the order), add `st_<id>` strings, and a `sampleLook()` case
  in `js/studio.js` for its booth display.
- **A runway tune**: push `{ name, tempo, lead, type, kick, pattern, bass }`
  onto `RUNWAY_TRACKS` in `js/audio.js`. A 0 in `pattern` is a rest.
- **A kanji word**: add `word:reading` to the row in `js/kanji.js`; use
  only grade 1-2 kanji in words.

## Releasing

Bump all three together, then tag:

1. `Game.VERSION` in `js/engine.js`
2. `CACHE_NAME` in `sw.js`
3. `git tag vX.Y.Z`

If you add a JS file, also add it to `ASSETS[]` in `sw.js` or it won't be
cached for offline play.

## License

MIT License — Copyright (c) 2026 ruck314

Made with love for Momoko.
