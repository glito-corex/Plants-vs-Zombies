# PvZ 1:1 source port (JavaScript)

Goal: match the decomp source (https://github.com/ruslan831/PlantsVsWow-decompilation —
actually `PlantsVsZombies-decompilation`) in function AND presentation, in JS.
Source behavior is authoritative; numbers cite `scratch/pvz-src-*.txt` extracts.

## Layout

- `main.pjs` — plugin imports + high-level config (keep lists here).
- `index.html` — body markup only (canvas + HUD).
- `src/main.js` — screens, rendering, input, debug hooks (`window.__pvz`: `G`,
  `play(level)`, `need([...])`, `freeze(bool)`, `libs`, `__pvzTest.newBoard(level)`).
- `src/pvz/` — the ported game code:  - `data.js` — GameConstants geometry (`gridToPixelX/Y`, `pixelToGrid`),
    seed unlocks, plant/zombie def tables.
  - `sim.js` — Board/Plant/Zombie/Coin/Proj mechanics (retail formulas cited
    inline with file:line refs).
  - `reanim.js` — reanimation player (render + `_ground` track velocity).
  - `cutscene.js` — Player's-House intro pan/timings/street zombies. Street
    preview samples the level's waves per PlaceStreetZombies (counts minus
    flag/yeti/bobsled, garg/zamboni first, count*cap/total clamped,
    uniform-random valid cells): each zombie's own reanim idling (idle2
    @12-24 / idle @12-18, random phase) in LAWN render order. The house
    name goes through the real MessageWidget path: CutScene sets
    board advice "HOUSE" (duration 250, ADVICE_NONE) at intro start
    (CutScene 880-916), ticks it down in update() like Board::Update does,
    and main draws it as white HOUSEOFTERROR28 at y=550, screen-centered,
    fading out (MessageWidget::Draw 362-411) — no banner, no level line.
    Sod placement replays the retail SODROLL reanims (CutScene 1210-1238):
    FOLEY_DIGGER loop (digger_zombie.ogg) + one reanim per rolling strip at
    the source origins (L1/L2/L4), dropped at roll end; cap cel is main.zip
    soder1.png downscaled to the authored 73x71 (SodRollCap.png is blank).
  - `assets.js` — asset loading + cached plant stills.
  - `save.js`, `audio.js`, `enums.js`, `tables.js`. `audio.js` plays all sound
    through WebAudio (fetch + decodeAudioData into looped/one-shot buffer
    sources): `<audio>` elements misresolve relative src/ URLs in the preview
    iframe (wrong host -> MEDIA_ERR SRC_NOT_SUPPORTED) while fetch() resolves
    correctly, so elements are never used. Music = user-supplied
    `src/assets/music/` tracks (title/menu Dave track, front-lawn theme,
    night-lawn theme (FrontLawnNight.ogg on night boards: 108.651s full-file
    chain loop at 1:49 + FrontLawnNightMidwaveA.ogg, 52.94s,
    detour under the same banner/crowd conditions, handing back at 0:45), fog theme (user-attached FogTheme.ogg on fog boards: 110.75s
    full-file chain loop at 1:51 + FogThemeMidwaveA.ogg, 59.67s, detour under
    the same banner/crowd conditions, handing back at 0:53), pool/backyard theme (PoolTheme.mp3: pool boards + the GAMEMODE_INTRO
    pool demo, overlap-restart chain at 2:13 over its ~8.7s tail), Wall-nut Bowling minigame track (DemonstrationMinigame.mp3 on L5),
    battle track (Level 10's main tune, overlap-restart chain at 3:01.60 over
    its ~3.8s tail), L30 pool-battle track (Ultimate-Battle-Pool.ogg on
    3-10, overlap-restart chain at 3:01.50 over its ~2.4s tail) + pool-battle intro (Ultimate-Battle-Pool-Intro.mp3, same two-stage cutscene fade as the
    L10 intro), Vasebreaker track (user-attached Cerebrawl2.ogg on 4-5,
    overlap-restart chain at 1:38.50 over its ~0.9s tail, trim 0.84), roof track (user-attached Graze_The_Roof.mp3 on
    roof boards 5-1 onwards: overlap-restart chain at 1:51.380 over its ~5.9s tail, fresh instance starting at 3.870s into the file, trim 0.50),
    plus the two-part CHOOSE_YOUR_SEEDS tune), swapped by
    screen state in main `updateMusic()`; the front-lawn theme restarts at
    3:03 over its own ~3s tail (the 186.0s file plays as a one-shot chain:
    each restart demotes the old source to a tail that rings out under the
    fresh instance, never cut off) — except at a 3:03 point while the
    huge-wave or final-wave banner text is on screen, when MidWaveA
    (FrontLawnMidwaveA.ogg, 76.07s) takes over instead and hands back to the
    lawn at 1:13, overlapped the same way (branch decider in main.js:
    HUGE-style advice, finalWave countdown, or 7+ live zombies); per-track MUSIC_TRIM gains normalize all tunes to one
    level (measured RMS spread was ~10 dB: night hottest, seed-loop quietest; trims bring each
    to the TitleAndDave median with peak <= 1.0, on a trim node ahead of the fade node so
    fade/hold ramps (which assume a 1.0 base) are untouched; the cutscene plays the chooser
    intro then its loop from 0:06, fading just before Ready-Set-Plant
    (CutScene 940/1330-1345); won/lost/award ends stop for the stingers. Browsers block audio
    pre-gesture, so the wanted track parks until the first pointer/key event
    (`unlockMusic` resumes the context + restarts the parked track).
- `src/assets/images/` — lawn/UI art. NEVER edit/warp art to fit logic (per user:
  keep shipped art pixel-identical). Instead fit the GRID to the visual lawn:
  logic grid is `x = 23 + 83c`, day rows `y = 76 + 100r` (measured from the
  unedited background1.png checker: art x 243..991, y 76..576; linear-fit
  residual ±6px mid-lawn). NOTE (reverted per user): two earlier clone-stamp
  patches to background1.png (pale tufts at art x[574-614] y[350-394], plus
  three dance-flicker tips at art x[650-660] y[286-323], x[700-713] y[191-203],
  x[698-704] y[244-250]) were fully reverted — the file is byte-identical to
  the pre-patch original in scratch/art-backup/ again, since the lawn art was
  ruled out as the cause. Pool/roof/night art unmeasured — pool/roof rows keep
  `y = 80 + ...`; night shares day geometry. Zombie-atlas swim cels
  (DUCKYTUBE/DUCKYTUBE2/WHITEWATER/WHITEWATER1/WHITEWATER3) are byte-identical
  to main.zip reanim/ PNGs (re-grafted after forensics showed RGB drift from a
  non-main.zip source; INWATER/WHITEWATER2 images are not gameplay swim art
  and were deliberately not added). Game-over door art
  (interior overlays + masks for day/night/pool/fog + roof/boss masks, all
  byte-identical from main.zip images/) draws at the source DrawHouseDoor
  positions once the zombies win; the brains splash (ZombiesWon reanim +
  atlas, also main.zip) plays the retail choreography (board freezes at the
  sequence start — plants/shots/coins/mowers/packets all gate on SCENE_PLAYING
  and stop, the WINNER alone walks after lossT>150 with no eating — pan
  150-350cs ease-in-out, chomps 5100/5600cs, splash + FOLEY_SCREAM 6000cs,
  shake 7000-8000cs, then drops out for the standalone GameOverDialog at
  11000cs (held to lossT 1400 per user request before the dialog cuts in):
  GAME OVER + TRY AGAIN + MAIN MENU tab). Backyard walk-in drops the winner
  to mPosY 290 flat per WalkIntoHouse (a screen-space doorway constant —
  pool lanes sit at 250 but the door doesn't move) and shifts it left at the
  door (football -10, everything else -80); a pre-vault polevaulter flips to
  POST first with a blend-0 walk restart on every background, and the
  winner's zamboni smoke detaches (crossfade: airborne puffs finish, no new
  spawns). StartZombiesWon also stops the jack crank + digger song loops;
  roof winners instead teleport into the chimney mouth (-180, 250,
  HEIGHT_IN_TO_CHIMNEY) and sink 200->0 over lossT 400-500 (EASE_IN) behind
  the chimney mask — no walking, anim_idle @15 (polevaulters keep walking).
- `scratch/` — private work area: decomp extracts (`pvz-src-*.txt`), alignment
  measurements, screenshots (`shots/`), original art backups (`art-backup/`).
  Never ship from here; never reference in code comments.
- Pause menu (Board::KeyDown/MenuButton -> DoNewOptions/DoPauseDialog): the
  in-game Menu stone button (681,-10,117x46) + Esc opens the NewOptionsDialog
  tombstone (original grey-stone look from the decomp repo's images/, kept
  under `src/assets/images/pause/` — main.zip's brown-wood restyle of the
  same asset IDs is NOT used for the pause menu/button per user request);
  Space opens the GAME PAUSED LawnDialog (skull header + newspaper-zombie
  reanim + Resume footer); Restart/MainMenu open stacked YES/NO confirms.
  Any dialog freezes the sim (Board::Pause) and ducks the music bus.
  Fullscreen checkbox is live; hardware-accel is inert (no web equivalent).
- Main-menu Options is the same retail NewOptionsDialog (mFromGameSelector
  branch: CenterDialog origin, +5/+10 slider and +15/+20 checkbox y offsets,
  DWARF18 right-aligned labels, 3-slice slot + 22x29 knob sliders with
  thumb-drag/bar-jump, both checkboxes, OK image button only) over the live
  selector; space/return/escape closes it. Root `options_*` art files are the
  retail bytes (the brown main.zip restyles were replaced).

## Grid/lane contract (verified vs source)

- Plants: `(mX, mY) = (GridToPixelX, GridToPixelY)`; reanim rides at
  `+ PlantDrawHeightOffset`. Ghost preview draws at the same origin.
- Zombies: `mPosY = GetPosYBasedOnRow(mPosX + 40, row) - 30` (balloon −30,
  pogo −16); body reanim at `(+15/+30−30s, −8/+120−120s)` + per-type offsets.
- Mowers: ready at `x=-35` (source `-21`, nudged left/up per user request;
  row y `+15` instead of source `+23`; hidden at `-160`, cutscene slides
  `-80 -> -35` linear, staggered per row); art rides at `(+6, +18)`, idle frozen (rate 0),
  triggered at rate 70 (35 pool); shadow ANCHOR `(mPosX-7, mPosY+47)` — the
  Tod blit helpers draw the 86x36 blob top-left exactly at the anchor (scale 1),
  i.e. blob center at anchor+(43,18) (TodCommon.cpp:750/842), never blob-center
  at the formula point; only on non-dirt rows. Pea/zombie combat is lane-based (`z.row`), never pixel-Y based.
- Grid follows the unedited art (user directive — never warp shipped art):
  `x = 23 + 83c`, day `y = 76 + 100r` (linear fit of original checker;
  ±6px mid-lawn wobble lives in the art). Click mapping (`pixelToGrid`) uses
  the same constants; pool/roof rows stay 80-based (unmeasured).
- Roof (5-1 onwards, L41+): sloped grid (`gridToPixelY` row*85+(5-col)*20-10,
  `pixelToGridY` subtracting (4-col)*20); planting runs the source roof
  branch (pot 33 first, spikeweed 21 refused, NEEDS_POT gate, pumpkin shell
  rule on pots; failed-plant advice POT1/POT2/NEEDS_GROUND). Back columns
  come pre-potted (CutScene::AddFlowerPots 1047-1081 via PlaceLawnItems
  587-605: L41 5 cols, L42 4, L43-50 3, COLUMN N/A, other roof 3) — placed by
  the cutscene at the pan-left start for scrolling chooser levels (CutScene
  1256-1259), so the lawn is bare through the house shot, street pan and seed
choosing; the Update gate (1438-1441) covers non-scrolling/chooseless
levels. The headless newBoard harness plants them directly (post-handoff).
 Full roof audit vs source: geometry (GridToPixel 80px@40, GridToPixelY
 row*85+slope-10, GetPosYBasedOnRow 440-break, PixelToGridY (4-col)*20 with
 [0,4] clamp), planting gates (pot-first, spikeweed NEEDS_GROUND, pumpkin
 shell rule incl. roof, First-Aid wall/tall repair incl. potted roof cells,
 pot refusing shelled cells everywhere), not-rec bits (pot NEEDS_ROOF,
 spikeweed ON_ROOF), no-mower rows without the roof-cleaner purchase,
 street-preview (0,0) block, sky-drop grave-rises (2 on 41/42 else 3, cols
 4-8 no-replacement, ice-trap gate).
- Seed packets enforce retail recharge — tests must reset `b.recharge[s] = 0`
  before plantAt, or plant one seed per cooldown.
- Tutorial (L1/L2, source Board.cpp/SeedPacket.cpp/MessageWidget.cpp/TodParticle
  + SeedPacketPick.xml + GetFlashingColor): states 1-8 in `b.tutorialState`
  (ConstEnums.h order), set on first play tick, *not* at level load; advice
  bar L1 y400h110 / L2 y476h100 with 192-255 pulse; the target packet is
  marked by (a) the real DownArrow.png flipped UP (ParticleStretch -1),
  gold-tinted, centered packet+(25,80) bobbing 0-10px over a 40-tick loop,
  (b) a multiply-grey pulse 55-255 on the art over 75 ticks (cost stays
  black), (c) the real SeedPacketFlash.png sparkle at the packet center for
  25 ticks whenever a recharge completes (FlashIfReady), (d) the SOD1ROW
  strip flashing grey while PLANT_PEASHOOTER waits, (e) the sun count
  blinking red while mOutOfMoneyCounter blinks (poor click sets 70).
  L1 gates: no sky sun with an empty lawn (states 1-2), no waves (states 1-3).
  No plants = no zombies ever (source) — headless L1/L2 tests must walk the
  pickup→plant UI flow (or call setTutorialState like the packet clicks do).
  pickRow never returns dirt (RowCanHaveZombies); fallback is sodded-only.
- Board tick order is source order (Board::UpdateGame then mAdvice->Update,
  5802-5879): sky sun → spawning → first-tick tutorial init → progress meter
  → advice widget (incl. HUGE letter drivers) → tutorial. Fresh advices tick
  down starting the tick AFTER they are set.
- Flag waves announce "A HUGE WAVE OF ZOMBIES IS APPROACHING!" through the
  real MessageWidget path: DisplayAdviceAgain (HUGE_WAVE key, duration 750),
  per-letter TEXT_FADE_ON drivers (TextFadeOn.reanim: slam 0-19, hold,
  fade 36-39; enter rate 60, leave sweep from duration==slideOff with the
  per-letter 0-40 rate ramp), red HOUSEOFTERROR28 at y=330 centered; cleared
  by key at hugeCd==0 with NextWaveComing (final banner + siren/awooga;
  regular waves play nothing) and zombieCd=1.
- Level progress meter (Board::DrawProgressMeter): bar, fill formula, flag
  slots/raise, head marker and level text follow source; art is the
  user-supplied FlagMeter.png (hollow empty bar + green fill) and
  FlagMeterParts.png (cel 0 head, cel 2 flag top — cel 1 is empty, so no pole
  is drawn). Per user layout the static flags hang UNDERNEATH the bar (tops
  at the bar top, bodies below — not above); bar/head/text stay at the source
  y (575/572/595). No meter reanim exists in the decomp (only the carried
  REANIM_FLAG), and per request the markers are plain static cels, not the
  earlier live-reanim experiment.
- Plants (Plant.cpp): bodies idle at per-plant RandRangeFloat(10,15)fps
  (PlantInitialize:145 — sunflowers sway out of sync); blink via
  UpdateBlink/DoBlink/EndBlink/AttachBlinkAnim (overlay = same-def reanim on
  the blink frames @15fps, attached at the face/head track, anim_eye* hidden
  while live, ends on fire/sleep/loop-done; defs without blink tracks skip —
  retail sunflower's blink is a silent no-op since its def has no anim_eye or
  anim_face tracks); sun producers (sunflower/sunshroom/marigold) glow via
  UpdateProductionPlant (mEatenFlashCountdown ramps 0->100 over the last 100
  ticks before each drop, drawn through the standard additive flash pass) with
  RandRangeInt(rate-150,rate) cadence and init RandRangeInt(300,rate/2).
- Zombie eating (Zombie.cpp EatPlant 6957 / AnimateChewSound 4725 / EatZombie
  7059, handoff-verified in scratch/eat-audit1.js A-I): bites land every 4t
  (8t chilled) for 4 dmg (TICKS_BETWEEN_EATS=DAMAGE_PER_EAT=4); chew sfx are
  anim hand-crossing events, not damage ticks (default 0.14/0.68, per-type
  times); hypno converts in the chew-sound (floop, gulp-free); awake cherry /
  jalapeno / doom / ice / hypno, armed-or-rising potato and squash
  look/pre-launch are chewed impotently; blover blows with no damage ever;
  garlic runs the mYuckyFace machine (grimace at 1, ~5 bites land, anim rate 0
  so the walker stands drooling, divert at 170, clear at 270); the 7007 ice
  chew-trigger is unreachable in retail too (awake ice returns at the 6992
  fuse gate — mirrored; the real freeze is the plant's own proximity
  trigger); mind-controlled allies (full port + audit, scratch/hypno-test.js
  1-9, scratch/hypno-audit-test.js 1-13): conversion runs the complete
  AnimateChewSound path (SOUND_MINDCONTROLLED sample, StartMindControlled
  dancer/backup/related unlink, PARTICLE_MIND_CONTROL 20-mote ring at +60/
  +40, award try, velX = 0.17 set directly at convert with NO re-pick there
  — later StartWalkAnim re-picks per phase table: mad allies 0.89-0.91,
  post-vault poles the default range; the old pickRandomSpeed ally branch
  that pinned every ally at 0.17 is gone); combat runs BOTH ways —
  CheckIfPreyCaught scans FindZombieTarget FIRST for everyone, so enemies
  eat allies through the mirrored EatZombie block (4 dmg/flags-9U on the
  age%4 cadence, startEating/pool/dance/vaultT guards, gulp on kill), and
  allies bite back via findZombieTarget + EatZombie on the same cadence;
  ally chews play the hand-event sounds soft with NO particles (Animate
  4909 gate); gasping news-allies complete the gasp into NEWSPAPER_MAD but
  stand with no prey while maddening; prevault poles never start eating
  (lunge only). The decomp's #ifdef DO_FIX_BUGS ally-enhancement blocks
  (ally garg smashes, ally shooters/catapults firing, ally jack/jalapeno,
  ally imp summons, ally squash homing) are INACTIVE — DO_FIX_BUGS is never
  defined anywhere — so the #else retail branches rule and were NOT ported;
  render with the ZOMBIE_MINDCONTROLLED_COLOR (128,0,192) purple base +
  additive coat (allies never chill/butter — CanBeChilled/CanBeFrozen false —
  so the mind branch sits before chill); headless allies bleed out under flags
  9U and die lootless past x=850; peas/chompers/squash/potato/spike/doom/
  magnets/mowers all ignore allies via EffectedByDamage (DR_MIND only); plant
  death plays
  gulp + the peashooter-died advice (L2-4 first-time, col>4, <15 plants).
- Main menu (GameSelector.cpp): the SelectorScreen reanim is the backdrop;
  tombstone buttons use the user-supplied main.zip button/highlight art at the
  source TrackButton anchors/sizes (adventure 330x125, minigame 313x130,
  puzzle 286x121, survival 266x124). Locked tombstones draw the same art
  greyed via canvas filter (source COLOR_BKG grey) — no veil rects, no lock
  icons; clicking one shows the MODE_LOCKED "play more Adventure" tip.
  Almanac/Store/ZenGarden follow SyncButtons mVisible (LawnApp::CanShow*:
  almanac = finish or lv>=15, store = finish or lv>=25, zen = finish or
  lv>=45) — hidden entirely until unlocked, never greyed. During anim_open
  the small buttons ride in with BG_Right (Draw 495-517 images for
  options/help/quit; zen/store/almanac as visible-but-unclickable buttons —
  clicks gated until open completes, flowers still pop); tombstone art
  slides via the reanim's own sign tracks until finishMenuOpen swaps in the
  buttons. Adventure flashes the
  purple highlight art while the zombie hand rises (Update 731). Level-number
  cels sit 4px below the source offsets and the welcome name 4px below its
  source baseline (visual fit to the art). The almanac_key_shadow track follows
  SyncButtons visibility (hidden while almanac+store are both locked); the
  separate ALMANAC_SHADOW/KEY_SHADOW swap cels aren't in our atlas, so the
  track keeps its baked key-shadow frame whenever visible. Change-user is the invisible
  woodsign2 button with the press-art hover swap; welcome name +
  level-number cels + trophy per source Draw/DrawOverlay.
- Change-user (GameSelector_ChangeUser -> LawnApp::DoUserDialog) is a centered
  LawnDialog popup over the menu (UserDialog.cpp) — no separate screen. List =
  current profile preselected first, other profiles, "+ Create new user" row
  while <8; click selects, double-click confirms (FinishUserDialog +
  SyncProfile), OK/CANCEL footer, RENAME + DELETE above it (mTallBottom),
  CREATE row opens the NewUserDialog name popup (alnum+space, 12 max,
  space-collapsed, conflict/empty errors, Esc cancels). Title is the source
  loading screen (TitleScreen.cpp): 1:1 titlescreen, PvZ logo dropping in at
  its natural size, static clipped LoadBar_grass fill (no dirt back, no
  slide-in, no label) driven by real
  loader progress (all images/menu art/reanim defs/fonts/sounds); it
  auto-advances (LoadingCompleted) when the bar fills — clicks do nothing
  until then; the create popup auto-opens only when no profile exists.
- Reanim sweep order (reanim.js): sendTrackBefore() re-sequences paint order
  without moving anything — the menu tucks the bottom woodsign plank behind
  the middle one where their art overlaps. assignRenderGroupToTrack() assigns
  an exact track (BG composite draws before the clouds, per Draw 488-493).
- Menu ambient life (GameSelector ctor + Update 814-845): 6 cloud sweeps with
  source init (RandRangeInt(-6000,2000) pre-roll, rate 0.5, 2000-4000 re-fire),
  3 click-pop flowers attached to BG_Right (overlayOnly: position follows the
  attachment, drawn in DrawOverlay order; click within 20px of gFlowerCenter
  pops at rate 24 + limbs_pop), 1 grass driver at BG_Right-(71,41) that loops
  anim_grass forever once its 50-tick fuse burns (sway + skew rustle).
- Conveyor levels (L5 Wall-nut Bowling + L10/L20/L30 mini-boss + L25 Big
  Trouble Little Zombie + L40 stormy-night ultimate battle,
  Challenge::InitLevel/StartLevel/UpdateConveyorBelt/CanPlantAt): conveyor
  bank replaces the seed bank (board owns up to 10 sliding packets at
  x=i*50+91, y=8, speed 4; L5 table wall-nut 85 / explode-o-nut 15; L10 table
  pea 20 / cherry 20 / wallnut 15 / repeater 20 / snow 10 / chomper 5 / potato
  10; L20 night table gravebuster 20 / ice 15 / doom 15 / hypno 10 / scaredy
  15 / fume 15 / puff 10; L25 pool table lily 25 / wallnut 15 / peashooter
  25 / cherry 35; L30 pool table lily 25 / squash 5 / threepeater 25 /
  tanglekelp 5 / jalapeno 10 / spikeweed 10 / torchwood 10 / tallnut 10 with
  the live count>2 weight rules + the lilypad ramp (w -> 1 as lawn+bank
  lilies approach 18); L40 stormy-night belt (mLevel==40 branch, checked
  before the generic stormy branch: lily 25 / seashroom 10 / magnet 5 /
  blover 5 / cactus 15 / starfruit 25 / splitpea 5 / pumpkin 10);
  no sun cost, no recharge, no chooser; backdrop at (83,0), belt = one 502x16 cel band at (90,63),
  cel (convBelt/4)%6, under clip (90,0,501,600)). L5 starts zombieCd 200 /
  convCd 400 + 1 wall-nut + (first-time) 3 pre-plant peashooters and shows
  the bowling stripe at (268,77); L10/L20/L30 start zombieCd 100 / convCd 200
  and L25 starts zombieCd 200 / convCd 200, all with an empty belt (retail
  values — no pre-plants, no stripe, ReadySetPlant kept) and plants normally
  (WasPlanted removes the packet).
  L5 planting rolls a Bowler from the grid corner
  (WasPlanted removes that slot's packet, bowling sfx + dirt); explode-o-nut
  deals cherry-like AOE (90px, 1 row) with shake. Rollers bounce row-to-row
  with per-row tracking, edge-clamp, red tint baked, and the source's
  asymmetric order recompute (AFTER row-- up, BEFORE row++ down — a
  down-weaving nut keeps the band of the row it just left and tucks behind
  both lanes' zombies; straight/up nuts ride PROJECTILE in front); shovel takes the
  nearest roller; zombies walk past pre-plants/bowlers (GetPlantsOnLawn is
  empty, no biting). Ghost + cursor previews use the same path as normal
  levels; the ghost shows only on plantable cells (cols 0-2, no red box —
  CursorPreview gates on CanPlantAt == PLANTING_OK). Bank pickup runs on
  press (SeedPacket::MouseDown), not release: the belt slides 25px/s, so a
  press-aimed packet has moved by mouseup and release-tested clicks
  intermittently missed. bankPressAt (shared by the mousedown listener and
  handleBoardClick) picks up / buzzes / toggles shovel on press and returns
  the widget key; a gesture whose press hit the bank is a bank gesture whose
  release can never plant (retail WidgetManager press/release match — one
  click picks up, a second click plants, no drag-to-plant). The click handler
  routes bank gestures through handleBoardClick({bankGesture:true}) so coins
  and the menu button still work on release, while bank re-pickup, lawn
  actions, and click-away cancel are consumed and the press-picked seed
  stays held (belt slide between press and release can't steal the slot).
  Bot-tagged clicks (bot.js synthetic input, ev.botHands) never open the Menu
  stone button — near-miss sun/coin clicks spill onto it and would pause the
  run; they fall through to the coin/lawn handling instead. Human clicks are
  unaffected.
- Stormy night (L40 ultimate battle, Challenge::UpdateStormyNight/
  UpdateRain/DrawWeather/DrawStormNight/DrawRain/DrawStormFlash 1955-2005,
  5193-5221, 3049-3134 + Board::StageHasFog 8915-8918 + LawnApp::StartGameMusic
  699-700): adventure 40 only. InitLevel sets FLASH_2/100 + the looping rain
  sfx; StartLevel (intro->play handoff) restarts FLASH_1/400; the conveyor
  rides the shared little-trouble/stormy branch (zombieCd 200 / convCd 200,
  empty belt). The lightning machine ticks before everything each frame
  (Challenge::Update 2139-2140, never paused-frozen except the counter==1 /
  150+FLASH_1 gates); thunder at counter 300 (FLASH_1/2) and 150 (FLASH_1/3);
  at 0: zombies-won -> 150+Rand(-50,50)/FLASH_3, non-play -> normal/0, else
  yeti? 150+Rand(200,300) : 150+Rand(300,400-or-750) with a random FLASH_1-3
  (STORM_FLASH_TIME 150). Rain spawns every 10-20 ticks (3 GROUND reanims:
  splash top/bottom + circle middle, one-shot PLAY_ONCE so the sweep frees
  them) with the retail splash-bug replicated (the circle's alpha/scale rolls
  land on the first splash reanim); rain tiles (IMAGE_RAIN 100x100, far 1x +
  near 1.5x, X-offset reused for far Y per source 3083) draw under the flash/
  black overlay (RENDER_ITEM_STORM FOG,0,3, above the 100000 bank — so
  DrawUIBottom redraws the bank + shovel OVER the storm, which this port does
  by re-issuing drawSeedBank in the meter pass and skipping the pre-entity
  one on stormy; same over the intro storm). The storm machine also ticks through LEVEL_INTRO (Board::Update runs every scene): 100->0 darkness for Dave 1101-1103, pan edges FLASH_2/310 + thunder light the zombie lineup and pan home; fx clock drives rain drift, flash noise stable per 6-tick block. StageHasFog excludes stormy: no fog, no fog roll, plantern plantable
  but flagged not-recommended, board music silenced (rain loop + thunder
  only). Dave talks 1101-1103 on every attempt (scrolling intro, 2500ms).
  Bot: night gun order extended with starfruit/splitpea/cactus (29/28/26).
  Roof bot (bot.js): straight shots die on the slope, so only lobbed
  catapults (cabbage 32 / kernel 34 / melon 39) are gun picks (chooser book
  leads pot 33, then the catapult ladder, sun, wall, cherry, potato, squash,
  chomper, jalapeno, tall-nut for vaulters, blover for balloons, garlic;
  pickGun/bestShooter take the same ladder with no chill utility;
  idle upgrades climb cabbage->kernel->melon, straight barrels upgrade out
  to cabbage). Pot-first placement rides the lily system (roofPotCell probes
  the wanted cells). Full L41 clear verified live (bank
  32/1/3/2/4/17/6, 4 cabbages + support, no straight guns, 10/10, no mowers
  — roof has none until the cleaner purchase).
- End-of-level award seed packet (Coin.cpp Draw/UpdateFall/Collect + AwardScreen
  DrawAwardSeed + particles/SeedPacket.xml): the dropped FINAL_SEED_PACKET is
  SOLID with its sun cost shown (both Coin and AwardScreen call DrawSeedPacket
  with grayness 255 / percentDark 0 / theDrawCost=true, which never enables
  colorize — so the IsLevelAward flashing SetColor is ignored by every Tod
  blit; no flashing, unlike the shovel/note awards which colorize-flash).
  It carries the attached PARTICLE_SEED_PACKET halo: IMAGE_SEEDPACKETGLOW
  (particles/SeedPacketGlow.png, 120x145) at packet center +(0,2), drawn under
  the packet while resting and detached on collect (bare packet flight
  1.01->2x to screen center); the DownArrow bouncy arrow above it stays.
  `drawPacket(..., {award:true})` = cost on, bank states (poor/recharge/
  selected/tutorial flash) off. Collecting it (Coin::Collect 1152-1237) fires
  STARBURST above the coin (Starburst.xml, 50-tick life: 25 + 20 STAR40 + 5
  AWARDRAYS_STAR motes, ring 1-75, speed 5-18, friction .05, +0.005/tick
  gravity, additive, alpha holds to 80% then fades) plus the attached Award.xml
  system behind the coin (PARTICLE_SEED_PACKET_PICKUP at award center, 1500-tick
  life): 8 ray emitters (AwardRays1/2.png, brightness .4/.3/.2/.1, spin
  -41..-70 / -30..-60 x0.01 deg/tick from 270/90/180/0, scale .4 EaseIn to 10,
  alpha .7->.9, additive), AwardGlow.png joining at 18% life, and 4 single-shot
  expanding white flashes at system ages 0/80/120/160 (flash1 additive at half
  brightness). No particle engine: sim.js integrates emitters/motes directly
  (beams/bursts arrays, ticked in updateFx, cleared at completeWin); main.js
  draws beams behind collected coins and bursts above (tintedParticle multiply
  cache, 'lighter' for additive). Shots: scratch/shots/award-{burst,beams,
  glow}.png.
- Coin bank UI (Coin::MouseDown IsMoney + Board::DrawUICoinBank RENDER_-
  ITEM_COIN_BANK): clicking silver/gold/diamond calls ShowCoinBank (1000
  ticks, ticked down in updateFx) which draws images/coinbank.png (144x32,
  from main.zip, byte-identical) at (57, 599-32) with 255*fade/15 alpha plus
  the money total in (180,255,90) CB14 right-aligned at (173, 591).
  LawnApp::GetMoneyString format (coins shown x10: $50 / $1,500 /
  $1,234,560). Displayed total = profile coins + this level's take (source
  merges into the profile live on arrival; ours merges at level end via
  completeLevel). Collected money flies to (39, 558) (was an invented
  (700,55) with no readout); silver/gold spawn shifted -10,-8 and diamond
  -15,-15 per CoinInitialize; arrival threshold 12 and scale curve unchanged
  (already exact). Money motes are full-timeline reanims (Coin_silver/
  Coin_gold/Diamond.json, random phase @0.6-1.0x, diamond fast 50-80) like
  the sun. Shot: scratch/shots/coinbank.png.
- Loot gating + DropLootPiece (Zombie::DropLoot 7211-7226 + Board::
  DropLootPiece 9452-9568 + CanDropLoot 9571): TrySpawnLevelAward runs
  first and ungated (awards drop on early levels — the 1-9 seed/shovel/
  note progression), then regular loot is skipped unless CanDropLoot
  (!first-time adventure, or level >= 11). So first-time 1-9 drops zero
  regular coins; finished-adventure replays use the source table
  (Rand(30000) x zombie value: diamond 14 / gold 250 / silver 2500, the
  diamond slot paying gold until the packet upgrade is bought; no
  potted/chocolate without the zen garden; bowling levels drop no money).
  Removed two inventions: the garg 2-golds (garg uses the table like
  every non-yeti) and the 5% chomp silver (silent deaths are DieNoLoot =
  award-try only).
- Coin sounds (Coin.cpp PlayLaunchSound 1304 / PlayGroundSound 1317 /
  PlayCollectSound 1327 + Board::DropLootPiece 9486/9565, TodFoley table
  pitches: SUN 10, COIN 10, MONEYFALLS/CHIME/PRIZE flat, SOUND_DIAMOND raw
  sample): diamond spawns with FOLEY_CHIME (ctor, motion != FROM_PRESENT)
  and pings SOUND_DIAMOND on click (diamond.ogg, main.zip); gold lands
  with FOLEY_MONEYFALLS (moneyfalls.ogg, main.zip) and clinks FOLEY_COIN
  on click; silver is silent until its FOLEY_COIN click; sun is silent
  until its FOLEY_SUN click (points.ogg). Every DropLootPiece money/sun
  drop (zombie loot, gravebuster clear, whack sun window) pops
  FOLEY_SPAWN_SUN (throw.ogg) before AddCoin — so diamond loot layers
  throw + chime; marigold/sunflower/sky drops stay silent. Awards keep
  their click sounds (seed/note SEEDLIFT+TAP2, shovel SHOVEL).
- UI layering (Board render list: BOTTOM_UI 100000 below PLANT/ZOMBIE/
  PROJECTILE/PARTICLE 302-307000, coins at COIN_BANK 600000): the seed
  bank draws screen-space between the lawn backdrop and the entity
  passes, so sun/plants/zombies/coins paint OVER it; meter/Level/fog
  and the cutscene top (Dave, advice, chooser) stay above the entities.
- Gravestones, night only (Board 1096-1161/479/419/9675, GridItem 140-182/
  423, Plant 334-344/1095-1120, Zombie 8200-8219, CutScene 699-711/1243-
  1251, TodFoley pitches, LawnStrings HINT_FAST): per-level place tables
  (L11-13 cols 6-8 -> 1,1,2; L14/16 5-8 -> 1,1,2,3; L17-19 4-8 ->
  1,2,2,3,3; L20+ 3-8 -> 1,2,2,2,3,3; L15 none), counter -Rand(50) /
  look Rand(20) / one uniform special (offsets zeroed — USER OVERRIDE:
  retail jitters +-5, here every stone centers on its true pixels, see
  below); ripening counter
  0->100 under enableGraveStones (also ticked through the intro so the
  roll-edge stones rise before play); GridItem::DrawGraveStone exact
  (86x91 cels, look%5 col, row0->1/special->0/else 2+look%2, ease rise
  + bottom clip, mound paired on the same cel, x = cell-left + per-look
  dx / y = cell-top + celH - 9 (USER OVERRIDE: retail x+offX-4 /
  y+celH+offY-9; the five look columns have different bbox centers in the
  86px cel, so each carries its own dx centering its opaque pixels in the
  83px cell),
  gravebuster-eating hides the stone+mound entirely while EATING (USER
  OVERRIDE of the retail 10->40px top clip — the buster envelops the
  grave; landing still shows it, and an eaten/shovelled buster lets it
  reappear since GridItemDie only fires on completion) — USER
  OVERRIDE on the buster ride: source slides the whole reanim 0->30px
  (UpdateReanim 2795), which floats the dirt ring mid-stone; here
  drawHeightOffset -40 -> +6 parks the ring on the grave floor, the ring
  track is hidden in the body, and the buster sinks 0->85px into it
  (clipped at the ring floor in main.js drawBusterGrounded: board, ghost
  and cursor draws) until just buried as the stone dies);
  gravebuster LANDING (anim_land HOLD + GRAVEBUSTERCHOMP) -> EATING
  (GRAVE_BUSTER dirt burst while chewing) -> grave die + DIE burst +
  dropLootRoll(12); spawnFromGraves ripeness-gated with points budget,
  RiseFromGrave firing the ZombieRise fx + the rising zombie on the SAME
  tick exactly like the source (Zombie.cpp:8200): dirt burst + hand at t0
  with the body arriving buried underneath (altitude -200, emerging
  head-first through the rise clip over the last 50 of its 150 ticks,
  no shadow, untargetable/unhittable while rising); the arm renders first,
  behind the dirt (ZombieRise.xml emitter order), at PARTICLE layer in
  front of the body;
  graveRisingType keeps normal outside the allowed table; failed plants
  show GRAVEBUSTERS_ON_GRAVES / PLANT_NOT_ON_GRAVE (HINT_FAST 10000t).
  Particles (decoded from the raw decomp XMLs): GraveStoneRise roll
  bursts per grave + DIRT_RISE each, GRAVE_BUSTER chew burst, DIE clear
  burst, ZombieRise splash + arm (30x57 ZombieArm, ClipTop crop) +
  clumps (DIRTBIG row 1) at the zombie center. Art: RockSmall rebuilt
  from main.zip PotatoMine rock cels (repo RockSmall is off-limits);
  retail RockSmall.png in main.zip decodes blank. TodAnimateCurve arg
  order is (t0,t1,time,v0,v1) = calcPosition(t0,t1,v0,v1,time) — an
  earlier port passed (t0,t1,v,time,v) and drew nothing at counter 100.
  Caltrop: the def is decoded from main.zip's COMPILED Caltrop.reanim
  (cookie+zlib+DefMap, schema b393b4c0, 30 tracks x 118f @12fps — NOT the
  decomp XML's 8-track version; that build owns the reanim per mandate).
  Idle (0-108) = body + 13 ci spikes + 2 persistent eyes + blank
  ornament_1 with an inline blink (closed-eye BLINK2 on eyebrow1/2 at
  80-89); attack (109-117) adds 9 cii HORN2 spikes. Art is main.zip
  PNGs only (HORN4/ornament_1 blank cels included for map completeness;
  repo bytes never ship). The sim needs no blink overlay for seed 21
  (no anim_blink track — doBlink exits; eyes ride the body def).
  Shots: scratch/shots/grave-{roll-burst,risen,risen2,eating,rise-burst}.png.
- Pool-night fog (adventure fog stages, BG.FOG): Board fog fields (gridCelLook
  [9][6] Rand(20), gridCelOffset Rand(10)-5, gridCelFog [9][7] zeros,
  fog boards start blown 200 + offset 1065-LeftFogColumn*80 (InitLevel;
  verified against Board.cpp InitLevel branch — the 2000 value lives only
  in InitSurvivalStage). Look index is y%6 (DrawFog reads
  mGridCelLook[x][y % MAX_GRID_SIZE_Y]). LeftFogColumn adventure L31 6 /
  L32-36 5 / L37-40 4, 5 fallback). UpdateGame offset easing (intro
  EaseOut 200->0, play EaseOut 2000->0, post-blover recovery Linear
  -5->max by offset*1.1) runs pre-gate every scene — the cutscene drives
  it via updateFogIntro since board.update is frozen during the intro;
  fogBlown-- runs post-gate (play only). UpdateFog every scene (incl.
  intro): fade-in 3 (1 rolling, 20 blown), cap 200 at the left fog column
  / 255 elsewhere; awake planterns clear size 4 with the corner notch
  (dx>3||dy>2, dx+dy==5 skip), torchwoods size 1; fade-out 6 (2 rolling,
  40 blown); squished/dead/mid-leap squash skipped (NotOnGround). DrawFog
  software path (always taken): fog_software.png (main.zip, 567x144 = 3
  cels of 189x144 per resources.xml cols="3", cel = look%3) at x*80+offset-5, y*85+23, white, alpha =
  density, extra cel past col 8; plantern glow = LanternShine.png (main.zip
  particles/) pulsed at (mX+40,mY+40), FOG+1 above the fog. CutScene:
  fogTime = 5950-sod-mower-6000+2000 (1400 typical); roll clamps blown
  200->200 then ticks down past FogRollIn+sod+grave+dave (nothing resets
  blown at play start — Board::StartLevel has no fog code; the zeroing is
  CancelIntro-only and this port has no skip path). Plantern init:
  stateCd 50 + SOUND_PLANTERN in play, no update branch. Blover init:
  stateCd 50, anim_blow HOLD@20 in play (anim_idle@10 previews —
  matches the source pose; UpdateBlover's swap branch is live code);
  UpdateBlover swaps to anim_loop on loop-through, DoSpecial at 0
  (DOINGSPECIAL + BlowAwayFliers: every PHASE_BALLOON_FLYING zombie flags
  blowingAway — any row — + SOUND_BLOVER + fogBlown 4000; appear foley is
  FOLEY_BALLOONINFLATE, ballooninflate.ogg from main.zip sounds/), dies on
  the 200-tick disappear fuse; chew triggers DoSpecial with no damage.
  Balloon: on-board phase flying, altitude 25, anim_idle LOOP, flyingHp 20,
  variant false, propeller reanim on "hat" (Propeller
  LOOP_FULL_LAST_FRAME at the def rate), (36,30,42,115) + (20,30,50,115)
  rects; takeFlyingDamage routes flying hits; LandFlyer pops
  (SOUND_BALLOON_POP, popping + anim_pop HOLD@24) with flying held through
  POPPING (IsFlying = FLYING || POPPING: peas/cactus stop tracking, only
  OFF_GROUND connects, no freeze, no part loss — EffectedByDamage lists
  POPPING explicitly) clearing only on the UpdateFlyer walk transition;
  then pool rows drown with loot, else HEIGHT_FALLING; popping walks the
  ground-locked branch (UpdateZombieWalking Group A is FLYING-only);
  UpdateFlyer (UpdateActions slot) walks on loop-through; blowing-away
  drift +10/tick in UpdateZombiePosition, DieWithLoot past x 850.
  Save/load persists blowingAway + fogBlown/fogOffset/gridCelFog
  (look/offset re-roll). Headless: scratch/fog-test.js (60 assertions).
  Shots: scratch/shots/fog-{play,intro}.png + fog-audit2.png.
- Pre-shop seed-slot offers (CutScene 640-669/746-761/1647-1688, StoreScreen GetItemCost, PlayerInfo mPurchases/mDidntPurchasePacketUpgrade): first-time adventure only — L12 teases 1401 (no coins check), L13-24 (not 15/20/21) offer 7 slots at 75 coins, L16-24 (not 20/21) offer 8 slots at 500. 1503/1553 pop the DIALOG_PURCHASE_PACKET_SLOT Yes/No modal (+120/+130, coin-bank flash); YES deducts/persists/widens bank+chooser and Dave talks 1510/1560; NO increments declines (2+ ends offers) with 1520/1570. Costs 75/500/2000/8000 via packetUpgradeCost (data.js/sim.js re-export). Y/N/Escape keys per LawnDialog::KeyDown. Verified live: L13 $750/7-slot modal, YES (1000->925, up 0->1, 7-slot chooser+bank), NO (coins kept, didnt 1->2, 6-slot chooser), gating (didnt>=2 / poor block), L12 tease, L16 500/8-slot YES (up 1->2, 8 slots); L13-with-upgrade and L21 excluded per source. Shots: scratch/shots/dave-offer.png, dave-offer-bank7.png, dave-decline-chooser6.png.
- Garden rake (Board::PlaceRake 1590-1639/CreateRakeReanim 1580-1587, GridItem::UpdateRake/RakeFindZombie 610-662, DrawGridItem 77-99, CutScene::PlaceLawnItems 601-604 + preload 363-365, Challenge vase intermission 1242-1246, StoreScreen spots/cost/icon/hover/purchase 26/891/309-311/572/957-959): shop item RAKE 24 ($200 = cost 20 x10 display, page-0 slot 2, hover bubble 2028, purchase sets 3, sold-out while held) on its pre-existing entry — bought rakes drop at col 7 on a uniform PLANTROW_NORMAL row (row 5/dirt/pool never; vase levels shift left of the leftmost vase; whack/vase/boss place nothing via StageHasZombieWalkInFromRight 8898) at the cutscene pan-left start (same PlaceLawnItems call as the pots/mowers; vase intermissions re-place per fresh stage), decrementing the purchase (3 levels per buy, persisted through onRakePlaced). The attracting rake claims the next eligible zombie's row (state WAITING + TodUpdateSmoothArrayPick 231); first touch swings the main.zip Rake reanim (rate 0 frozen idle -> 20, PLAY_ONCE_AND_HOLD, no shadow) with FOLEY_SWING, at reanim time 0.8 the trapped zombie takes TakeDamage(1800, 0U) with FOLEY_BONK (normal death fx — source has no rake particles), and the item dies at counter 0. Save/load persists rake + rakeLeft (reanim re-derived). Verified headless (idle pose, bias, 270->0 kill, 200-tick expiry, pool exclusion, whack/vase-shift/boss gates, save roundtrip) and live (L7: placed col 7 at pan-left with 3->2 persist, swing pose shot, kill + expiry, shop sold-out + 2028 bubble shot). Shots: scratch/shots/rake-{idle,swing,trigger,shop}.png.
