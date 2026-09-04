# Draft Board

A local-first draft assistant that replaces the printed Fantasy Footballers cheat sheet.
Upload the day's PDF, configure the league, then mark players off during the live draft.
The board always shows who is still available, organised by position and tier exactly
like the paper sheet, with ADP converted to your league size.

Everything runs in the browser. No backend, no accounts, no network calls — except the
optional AI badge pass, which you turn on yourself.

Live at **https://ryansax.github.io/draft-board/** — though note it is local-first: every
draft lives in the browser it was created in, so sharing the link gives someone their own
independent copy rather than a shared board.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173.

```bash
npm test
```

The parser tests read `fixtures/cheatsheet-sample.pdf`, which is **not committed** — it is the
Fantasy Footballers' copyrighted sheet and this repo is public. Drop your own copy at that
path to run the full suite; everything else passes without it. CI builds and deploys but does
not run tests, for the same reason.

```bash
npm run build
```

`npm run build` emits a static `dist/` you can serve from anywhere, but the intended use is
`npm run dev` on the laptop you draft from.

## Draft-day flow

1. **New draft** → drop in today's cheat sheet PDF.
2. **Review** the parse. One table per position, every field editable, badge toggles on the
   right. Validation errors are highlighted and **Commit is disabled until they are gone**.
   Set league size, your draft slot, the other managers and roster shape here too.
3. **Commit & start draft** → the board.

Sessions are saved separately, so a fresh sheet each draft day is fine. The home screen
lists them with progress; each can be exported to JSON as a backup and restored later.

## On the board

**Tapping a row logs the pick, and the app works out whose it is.** It knows the pick on the
clock and which slot owns it, so on your own turn a plain tap puts the player straight on
your roster — no second control to reach for while the clock runs.

| Action | Desktop | Touch |
| --- | --- | --- |
| Log a pick (yours or theirs) | click the row | tap the row |
| Force the other side | ⌘/Ctrl/Alt/Shift + click, or the `ME` / `THEM` button | the `ME` / `THEM` button |
| Change or undo one player | click a marked row → popover | tap a marked row → popover |
| Undo last action | `⌘Z` / `Ctrl+Z`, or the undo button | undo button |
| Search | `/` to focus | tap the search box |
| Move through the results | `↑` `↓` (wraps), `Home` / `End` | scroll the list |
| Log the highlighted result | `Enter` | tap the result |
| Force the other side from search | `⌘Enter` / `Ctrl+Enter` | — |

**Defenses and kickers are position tabs like any other.** `DST` and `K` sit alongside
QB/RB/WR/TE in the filter bar and open as a full-width list — a plain numbered list with no
tiers, ADP, risk or upside, exactly as the sheet prints them. The `D/K` button in the header
still opens them as a side drawer, for when you want them beside the skill columns rather
than instead of them.

The search results list is wider than the input box it hangs off — the header leaves the
input only ~250px, which is nowhere near enough for a name — so it anchors to whichever side
has room and shows the full name, badges, tier, team and ADP without truncating. It holds 12
results and scrolls, with the key hints pinned to the bottom.

Each result reads **position · ADP · club badge · name · icons** — the club is its logo
(falling back to the code for a free agent, who has none), and the positional rank and tier
are left off as noise once ADP is there.

Arrow keys move the highlight and it wraps at both ends, so the player you want is never
more than a few keys away even when he is not the top hit. The highlighted row scrolls itself
into view, and `Enter` takes whatever is highlighted rather than always the first result. The
mouse can take the highlight too, but only on an actual movement — a cursor that happens to
be resting where the list opens does not steal it from the keyboard.

When it is your turn the header turns green, it says **you're on the clock**, and every row's
secondary button reads `THEM` instead of `ME` — so the flipped meaning of a plain tap is never
a surprise. Off your turn it reads `ME`, as before.

The turn is resolved inside the store against live state rather than from a render-time prop,
so a burst of fast taps can never attribute a pick to the wrong side.

Drafted players stay in place, struck through and dimmed, exactly like crossing a name off
paper. Your own picks get an accent border and a tint so they read differently from
everyone else's. Undo restores both the status and the pick counter.

### Sorting a column

The **Sort** control in the filter bar re-orders every position column:

| Mode | Order |
| --- | --- |
| **Sheet order** (default) | the printed ranking, with the green tier bands |
| **ADP** | earliest ADP first; no ADP sinks to the bottom |
| **Upside** | highest upside first; ties fall back to the sheet's ranking |

**Tier bands disappear on the other two**, because a tier break only means something while
the column is in the sheet's own order — leaving them in would imply groupings that no longer
hold. Defenses and kickers carry no ADP or upside, so they sink rather than floating to the
top on a missing value. The choice is remembered between sessions.

### Fixing a wrong roster

A wrong roster is worse than an empty one — it quietly skews the open needs, the tier hints
and the recommendations — so anything landing on your roster is confirmed out loud and is
reversible in one tap:

- **Every addition raises a toast**: *"Added to your roster: Breece Hall at pick 12"* with a
  **Not mine** button. That catches a mis-tap on the `ME` strip, a drifted pick counter, or a
  stray `Enter` in the search box.
- **The roster panel is editable.** Tap any player in it for **Not my pick** (he stays crossed
  off the board, just not yours) or **Back on the board** (undoes the pick entirely).

"Not my pick" leaves the pick counter alone, because someone did take him — only the
attribution was wrong.

### Beyond paper

- **Snake awareness** — your upcoming pick numbers and "you're up in X selections".
- **Live pick counter** — derived from what you have marked, with a `+`/`−` stepper for
  picks you missed.
- **Availability chips** — "Should be there" / "Coin flip" / "Likely gone", based on each
  player's ADP against your next pick. Only shown near your pick so the deep list stays clean.
- **Value falling** — an available player the market expected gone already.
- **Tier scarcity** — every tier band shows `n of m left`, turns amber at 2 or fewer, and
  fires a dismissible toast on a tier run.
- **My roster** — slots fill in as you mark players mine, with open needs, a best-available
  hint per need, and each pick's value against ADP.
- **Best available strip** — top 5 remaining across all positions; tap to jump to a row.

## The draft board tab

The second tab shows the whole draft as a grid: a row per round, a column per manager,
colour-coded by position, snaking the right way round. Your column is highlighted, the
current pick is marked **on the clock**, and the view scrolls to the live round.

Name the managers on the import screen or by clicking any column header — it saves as you
type. Naming them is optional, but it is what powers the insight panel beside the grid:

- **Recommended picks** — the five best players for your next selection, each with its
  reasoning spelled out: ADP value at your pick, holes left on your roster, tier scarcity,
  and whether he survives until your following turn. When you are on the clock each one has
  a *Draft him* button. Defenses and kickers are excluded outright until the last two rounds,
  whatever the value looks like.
- **Before your turn** — because every pick maps to a slot, the app knows each manager's
  roster and therefore what they still need to start. So it can say "4 picks until you're up;
  4 of those managers still need an RB and 6 RBs are due to go" — the run risk you would
  otherwise have to eyeball.

A pick sitting in your column that is not on your roster gets a dashed amber outline, which
catches a mis-logged pick or a drifted counter early.

## The room display (second screen)

`Second screen` on the Draft board tab — or the monitor icon in the header — opens a
read-only board in its own window at `#/present/<sessionId>`. Put it on the TV or projector
and leave the control window on your laptop.

- **Whose pick it is, in huge type.** Manager name and pick number, green when it is yours.
- **Picks numbered `round.pick`** (`1.01`, `2.10`) — the notation a room reads off a board.
  The control window stays on whole overall picks, which is what its counter and ADP compare
  against.
- **The full grid**, colour-coded by position, snaking the right way, the live pick showing
  its number on a colour block, and the view auto-scrolling to the current round.
- A full-screen button, and it is **always light** regardless of your light/dark setting.
  A TV in daylight reflects the room back at you, and a dark screen loses its contrast to
  that glare; a light background pushes out enough luminance to stay readable. It ignores the
  control window's theme entirely, so turning on dark mode there cannot darken the TV.

Each pick is a card laid out like a FantasyPros selection: **given name over surname** at the
top left (one size for both lines, truncated rather than wrapped), **pick number top right**,
**position-team at the bottom left**, and the player's **headshot filling the right of the
card** from just under the pick number down to the bottom edge. Defenses use the team logo.

Sleeper's headshots are 350x254 with the head centred and dead space either side, so the
image is sized by height and shifted right under `overflow: hidden` — that crops the dead
space away and leaves the head almost against the card edge, instead of a small photo
floating in a box.

**Both boards use the same card.** `DraftCard` sizes everything in `em`, so each board just
sets a font-size and the whole card scales: the room display drives it from `vw` so it grows
with the TV, the control window pins it at 11px. The only difference is the pick label —
`round.pick` on the TV, whole numbers in the control window.

Fantasy team names run long, so the column headers are deliberately small: at ten teams the
whole of "Ron Jeremy (Retired)" and "James (they/them)" fits without truncating.

The live pick is a plain colour block showing just its number — no wording — and empty cells
show the pick they are waiting on.

It is **read-only by design**: nothing on it can change the draft, so nobody leaning on the
laptop can knock a pick out.

It is also **impersonal by design**. This screen belongs to the room, so your team gets no
highlighted column, no ring around your picks and no coloured banner on your turn — it reads
exactly like everyone else's. Those cues live in the control window, where they are the whole
point.

### Staying in sync

Every autosave publishes the session on a `BroadcastChannel`, so the display updates the
instant you log a pick. It also re-reads from IndexedDB every few seconds, so a dropped
message cannot strand the room on a stale board. It loads its own session rather than going
through the store — a separate window that keeps working whatever the control window does.

Type sizes scale with the viewport (`clamp` + `vw`), so the same page suits a laptop and a
4K TV. Player names wrap to two lines rather than truncating: the font grows with the column,
so a bigger screen never buys a longer single line, and wrapping is what actually makes
"Christian McCaffrey" legible from across the room.

## Off-the-board selections

Occasionally someone drafts a player the cheat sheet never listed. The **person-plus button**
in the board header opens a short form — first name, last name, position and team, the last
two as dropdowns — and logs the pick.

The new player is appended after the printed players at his position, so the sheet's own
ranks are left untouched, and he gets an id that cannot collide with a parsed one. The pick
itself goes through the same path as a tap, so whose pick it is still follows the turn.

## Fun mode (spoken picks)

For the room. Toggle it from the speaker button on the display itself, or in Settings.

When a pick is logged the board gives way to a news-alert banner: a black bar sweeps in with a
pulsing red dot, a light sweeps across it, and **"THE PICK IS IN"** sets in
[Anton](https://fonts.google.com/specimen/Anton) — a heavy condensed face that reads like a
broadcast lower-third. The font is self-hosted (`public/fonts/`, SIL OFL 1.1), so the display
keeps its look with no internet.

The **sting** in `public/sounds/pick-is-in.mp3` plays as the banner lands, and the banner holds
for exactly as long as the sting runs so the voice never talks over it. To swap it, drop a new
file at that path — anything the browser can decode. The source was converted from AIFF-C
(which Chrome cannot play) and peak-normalised from -23 dBFS to -0.6 dBFS, without which it
was far too quiet to carry across a room. A synthesised alert stands in if the file is ever
missing or undecodable.

Browsers refuse to play audio before a user gesture, so any click on the display unlocks it; if
it is still blocked, the display says so rather than failing quietly.

Two things the sequence guards against, both found by testing rather than reasoning:

- **The announcement must not run twice.** The effect's cancellation flag is local to each
  invocation, not a ref. A ref is shared, so React StrictMode's mount/unmount/mount had a
  later run reset it to `false` and resurrect the run its cleanup had just cancelled — which
  played the whole announcement twice, about half a second apart.
- **The board must come back whatever the audio does.** Chrome will accept an utterance and
  never fire `onend`, particularly in a background tab, which the room display usually is.
  Every spoken line runs against a deadline scaled to its length, the overlay stops swallowing
  clicks as soon as it starts fading, and the board is restored in a `finally` — so a wedged
  speech engine can never leave the display stuck on a pick.

Then the voice reads the pick:

> With the fifth pick of the second round, Leo's Bus Drivers selects Bijan Robinson. Running
> back from the Atlanta Falcons.

**The card lands on the beat the voice finishes the surname.** That timing comes from
ElevenLabs' `/with-timestamps` endpoint, which returns character-level timings alongside the
audio; the reveal watches playback position against the end time of the last occurrence of the
surname. The card holds, fades out, and the voice adds "{next manager} is on the clock."

A defense is announced as "the Houston Texans defense" rather than saying defense twice, and
ordinals are spoken as words ("fifth", "twenty-first") because digits read badly aloud.

### Analyst take on each pick

With **Analyst take** on (Settings, under fun mode), Claude adds a one-line reaction after the
announcement: a verdict chip — Steal, Value, Solid, Fair or Reach — and a sentence, read out
and shown under the card.

**Your own draft prep never leaves the browser.** The take is displayed on a screen your whole
league is watching, so the cheat sheet's ranks and tiers, its risk and upside scores, and the
badges marking your guys are all kept out of the request. What is sent is either public — the
player, his club, and ADP as market consensus — or already visible on the board to everyone:
who picked, when, and what they have taken so far. A test asserts the payload contains none of
the private fields, so this cannot quietly regress.

The take covers the value (did he fall, or did someone reach), how he fits what that manager
has built, and context on the player and his club. That last part draws on the model's own
football knowledge, which is **bounded by its training data** — so the prompt forbids quoting
statistics, asserting recent developments as current fact, or inventing an injury or a trade,
and tells it to speak in general terms where its knowledge might be stale.

Uses `claude-opus-5` at low effort with a structured output, requested the moment the sting
starts so it is normally ready before the card lands. Practical guarantees:

- **It never delays the board.** The take is raced against a short deadline; if it is not back
  in time the sequence carries on without it.
- **One request per pick.** The request is aborted on cleanup, so a re-render cannot leave an
  orphan running up cost.
- **Fails silently.** No key, a bad key, offline, a refusal or a malformed reply all resolve to
  "no take" rather than an error on screen.

It costs an Opus call per pick, so it is off by default and needs the same Anthropic key as the
badge pass.

### Voices, and what happens without a key

An ElevenLabs key goes in Settings (kept in this browser, sent straight to
`api.elevenlabs.io` — fine on your own machine).

Two voice ids, so the booth has two people in it: an **announcer** reading the pick and who is
on the clock, and an **analyst** reading the take. Both are optional — the announcer defaults
to a stock voice, and a blank analyst voice falls back to the announcer, which is the original
single-voice behaviour. On the browser's built-in voice there is only one voice to work with,
so the analyst is shaded slightly quicker and lower instead.

Every option in Settings stays visible whether or not its parent is switched on — dependent
controls dim and disable rather than vanishing. Hiding them meant you could open the dialog
hunting for a key field and find no evidence it existed.

Without a key it falls back to the **browser's built-in speech**, whose `boundary` events give
word-level timing — less precise than character timings, but fun mode still works out of the
box. If even that is unavailable, the visuals run on a timer. The sequence cannot wedge the
board: every audio path is wrapped so a network hiccup mid-draft still ends with the board
back on screen.

## Player headshots

Faces on the draft board come from **Sleeper's free public player list**
(`api.sleeper.app/v1/players/nfl`) — no key, no account, and it serves
`access-control-allow-origin: *`. Images are served from `sleepercdn.com`; defenses use the
team logo.

The list is ~2.5MB gzipped, so it is fetched **at most once a day** (Sleeper asks that it not
be polled more often), reduced to a compact index of the ~4,300 fantasy-relevant players
(~0.3MB) and cached in IndexedDB. After the first load it costs nothing.

This is the only network request the app makes on its own. **Settings → Player headshots**
turns it off to stay fully offline; everything else keeps working, cells just show no face.

### Matching names to players

The sheet gives a name, team and position — no player id — so names are matched in tiers,
strictest first:

1. normalised name + position + team
2. normalised name + position
3. name with printed suffixes stripped (`Ted Hurst III` → Sleeper's `Ted Hurst`)
4. normalised name alone (catches a player who has since changed team)
5. **last resort:** surname + position + team, and only when exactly one active player fits

Normalisation matches Sleeper's own `search_full_name`: lowercase, accents folded,
punctuation dropped — so `Audric Estimé`, `Eddy Piñeiro`, `Ja'Marr Chase` and
`Amon-Ra St. Brown` all resolve. Where a name repeats, the active player wins.

Measured against the whole sample sheet: **377 of 377 matched.** Tier 5 fired for exactly one
player — the sheet prints `Hollywood Brown` where Sleeper has `Marquise Brown` — and its
uniqueness guard is what stops it guessing when two players share a surname. A player who
matches nothing simply renders without a face; nothing breaks.

## ADP

The sheet quotes ADP as a 12-team `round.pick`. That is turned into a plain **overall pick
number**, which is what every row shows:

```
adpOverall = (round - 1) * 12 + pick
```

`3.06` becomes **30**, `12.01` becomes **133**, `1.12` becomes **12**.

The overall pick number is the same whatever your league size — the Nth player off the board
is the Nth player off the board — so no league-size conversion is needed to read it. It is
also the same unit as the live pick counter, so "ADP 30, we're at pick 34" is a direct
comparison rather than mental arithmetic on `3.10` versus `4.02`. Everything else in the app
already worked in whole picks: the counter, your upcoming picks, the availability deltas and
the draft grid.

The round.pick forms are still available on hover, where the round is occasionally the
useful framing:

> ADP: pick 30 overall · 3.06 on the 12-team sheet · round 3.10 in your 10-team

A `-` ADP renders as `-`, sorts last in any ADP-ordered view, and gets no availability chip.

The review screen shows both an **ADP (12tm)** column with the raw value as printed on the
sheet (editable, so you can check the parse against the paper) and a read-only **Overall**
column with the number the board uses.

## How the parser works

`src/lib/parser/parse.ts` is the source of truth and is deliberately free of any pdf.js
import, so it is a pure function over positioned text runs and is tested directly.

1. `pdfjs.getTextContent()` yields text runs with x/y coordinates. Reading order is ignored.
2. The **modal text height** separates table rows from page chrome — the legend, the
   `ADP RISK UP` header and the title all sit at other sizes.
3. Section headings ("Quarterbacks", "Running Backs", …) define the **column x-anchors**.
   Each row item is assigned to the nearest anchor to its left.
4. Rows are rebuilt by clustering items on a shared baseline, then matched against a row
   grammar: `{rank} {Name} ({TEAM}) {ADP} {RISK} {UP}`.
5. `TIER n` bands set the current tier, which carries forward per position.

Details of this sheet that the parser handles explicitly:

- **Page 2 has no headings.** Continuation columns resume from whichever section was still
  open at the bottom of the previous page, and the tier carries across the page break
  (RB 66–72 stay in tier 10; WR 68–105 stay in tier 9).
- **At rank ≥ 100 the rank merges into the name run** — `"100 Elic Ayomanor (TEN)"` arrives
  as a single item rather than two.
- **Wrapped rows.** Jacory Croskey-Merritt's `(WAS)` lands on the following line; a lone
  team code is folded back into the player above it.
- **Defenses and kickers share one right-rail column**, split by the `Kickers` heading, and
  carry no ADP, risk, upside or tier. Defense names are mapped to team codes.
- Names with apostrophes, hyphens, initials, suffixes and accents (`Ja'Kobi Lane`,
  `Smith-Njigba`, `T.J. Hockenson`, `Ollie Gordon II`, `Audric Estimé`).
- ADP rounds past 20 (`34.04`) and `-` for no ADP.

Validation runs on import and again on every edit in the review screen: contiguous ranks per
position, ADP matching `^\d{1,2}\.\d{2}$` or `-`, risk/upside within 1.0–10.0, every player
with a name and team. No player counts are hardcoded — the sheet changes daily.

### If the layout ever changes

Two fallbacks:

- **Paste CSV/TSV** from the upload screen: `position, rank, tier, name, team, adp12, risk,
  upside, badges`. A header row is optional.
- Fix anything by hand in the review screen before committing.

### Badges

The badge glyphs are not text, so they are read from the PDF's painted images instead.

Every glyph is an image XObject. Walking the operator list while tracking the transform
matrix gives each painted glyph its position on the page, and hashing the decoded pixels
gives it an identity — pdf.js assigns a fresh object id to every paint, so the bitmap itself
is what ties copies together. The sample sheet resolves to exactly **8 distinct bitmaps: the
7 badges and the logo**.

The mapping is then read off the sheet's own legend: each legend glyph is paired with the
label printed beside it, so every other copy of that bitmap is that badge. Nothing about the
badge artwork is hardcoded — a redesigned glyph still works as long as the legend is intact.
On the sample this places **135 glyphs across 112 players, with none left over**.

Worth knowing: the glyphs are not the shapes the legend names suggest. **Sleeper is a bed,
Breakout a rocket, Rookie a graduation cap, Bust a bomb, and Injury Concerns a medical
shield** — blue for the positive badges, red for the cautionary ones. The icons in the app
match the sheet rather than the wording.

### Optional AI badge pass

Not needed for this sheet — badges come out of the PDF directly. It remains as a fallback if
a future layout embeds the glyphs some way the deterministic pass cannot read.

Enable **AI badge extraction** in Settings and paste an Anthropic API key to have each page
rendered to PNG and read by Claude for glyphs only. The deterministic parse always wins on
numeric fields; a name disagreement is surfaced as a warning rather than applied. Badges can
also always be toggled by hand in the review screen.

The key is kept in this browser's `localStorage` and the request goes straight from the page
to `api.anthropic.com` with `anthropic-dangerous-direct-browser-access`. That is fine for
personal local use — do not do it on a shared or deployed machine.

## Persistence

Every action writes the session to IndexedDB immediately (writes coalesce onto the latest
state, so fast tapping never queues up or drops the final write). The id of the open draft is
remembered, so a refresh or crash mid-draft lands you back on the board exactly where you
were, not on the home screen. Settings live in `localStorage`.

## Tests

110 tests, all against the real `fixtures/cheatsheet-sample.pdf` where relevant.

| File | Covers |
| --- | --- |
| `src/lib/parser/parse.test.ts` | The sample PDF end to end: known rows, wrapped row, three-digit ranks, page-2 continuation, tier breaks, 32 defenses, accents and suffixes, zero unparsed rows, and badge extraction (7 legend glyphs, every glyph placed, known badge rows) |
| `src/lib/insights.test.ts` | Snake pick↔slot mapping, whose turn it is and what a plain tap means, draft grid layout, per-manager rosters, unmet starting needs, position pressure before my turn, and recommendation ordering |
| `src/lib/adp.test.ts` | ADP parsing to an overall pick number, the whole-number display and its tooltip, `-` handling, snake math (10-team slot 3 → 3, 18, 23, 38, 43), availability thresholds, falling value |
| `src/lib/draft.test.ts` | Pick counter and offset, roster fill and flex eligibility, tier scarcity, best available, search ranking |
| `src/lib/parser/csv.test.ts` | CSV/TSV fallback, quoting, DST/K field stripping |
| `src/lib/parser/ai.test.ts` | Badge JSON coercion and merge rules |

## Layout notes

- Four columns need roughly an iPad in landscape (≥ 1024px). Below that the board switches
  to position tabs. `DST` and `K` are always single-column tabs, never part of the four.
  The roster panel pins beside the board at ≥ 1280px and is an overlay drawer below that.
- All tap targets are at least 44px and nothing depends on hover.
- All ~380 players render at once — no virtualisation needed; a mark-to-render cycle
  measures under 2ms with the full board mounted.

## Deliberately skipped

Per-player notes. Dark mode and post-draft pick value (shown in the roster panel as `+n`
against ADP) are in.

## Stack

Asset URLs are relative (`base: './'`) and the font and sting are imported through the
bundler rather than served from `/public`, so the same build runs from a domain root or a
sub-path — which is what GitHub Pages serves projects from.

Vite · React · TypeScript · Tailwind v4 · Zustand · Dexie (IndexedDB) · pdf.js · lucide-react ·
Vitest · `@anthropic-ai/sdk` (lazy-loaded — the badge pass and the analyst take each sit in
their own chunk so the SDK never lands on the board's critical path). pdf.js is dynamically imported so it stays off the board's critical path.
