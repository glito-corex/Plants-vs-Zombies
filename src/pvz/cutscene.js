// CutScene::StartLevelIntro + AnimateBoard port (Lawn/CutScene.cpp).
// Times are MILLISECONDS; CutScene::Update adds +10 per 100Hz tick (CutScene.cpp:1465).
// Adventure scope: day levels 1-10 plus the Dave intros in range —
// Wall-nut Bowling (L5), the first-time 2-1 night intro (L11), the first-time
// 3-1 pool intro (L21, dialog 501), Whack-a-Zombie
// (L15) and Big Trouble Little Zombie (L25), the Vasebreaker intro (L35) and
// the stormy-night intro (L40, dialog 1101), plus the custom 5-1 unfinished
// warning (L41, dialog 9001, gated on GENERATORNOTFINISHED in main).
// Mower/Fog/Boss branches are kept as no-ops with source values so later
// levels slot in.
import { ZOMBIE_DRAW_OFFSETS, canSpawnYetis, ORDER } from "./sim.js";
import { BG, gridToPixelX, gridToPixelY } from "./data.js";
import { fadeMusic } from "./audio.js";
export const T = {
  PanRightStart: 1500, PanRightEnd: 3500,
  // Early-Dave beats (CutScene.cpp:31-34): enter at 2000, talk at 2750,
  // non-scrolling jump at 4000. CrazyDaveTime is LeaveEnd - PanRightStart
  // (4000 - 1500 = 2500; StartLevelIntro 837-844, +4000 on final boss only).
  EarlyDaveEnterStart: 2000, EarlyDaveEnterEnd: 2750, EarlyDaveLeaveEnd: 4000,
  SeedChooserSlideOnStart: 4000, SeedChooserSlideOnEnd: 4250,
  SeedChooserSlideOffStart: 4500, SeedChooserSlideOffEnd: 4750,
  SeedBankOnStart: 4000, SeedBankOnEnd: 4250,
  PanLeftStart: 4500, PanLeftEnd: 6000,
  SeedBankRightStart: 4750, SeedBankRightEnd: 6000,
  RollSodStart: 6000, RollSodEnd: 8000,
  GraveStoneStart: 6000, GraveStoneEnd: 7000,
  // CutScene::TimeFogRollIn (CutScene.cpp:51): the fog starts rolling in
  // 5950ms into the intro (plus sod/grave/dave shifts).
  FogRollIn: 5950,
  ReadySetPlantStart: 6000, ReadySetPlantEnd: 7830,
  IntroEnd: 6000,
  MowerDuration: 250,
  MowerStart: [6300, 6250, 6200, 6150, 6100, 6050],
  BoardOffset: 220, BoardImageWidthOffset: 1180, ScreenW: 800,
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// TodAnimateCurve LINEAR / EASE_IN_OUT / EASE_OUT approximations.
export function animateCurve(t0, t1, t, v0, v1, curve = "linear") {
  if (t <= t0) return v0;
  if (t >= t1) return v1;
  let k = (t - t0) / (t1 - t0);
  if (curve === "easeInOut") k = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  else if (curve === "easeOut") k = 1 - Math.pow(1 - k, 3);
  return v0 + (v1 - v0) * k;
}
export function calcPosition(t0, t1, p0, p1, time) {
  return animateCurve(t0, t1, time, p0, p1, "easeInOut");
}

export class CutScene {
  constructor(board, { chooseSeeds, daveDialogStart = null, crazyDaveTime = null }) {
    this.board = board;
    this.chooseSeeds = chooseSeeds;
    this.time = 0;
    // Crazy Dave (StartLevelIntro 746-786 + 837-844): first-time L5 talks
    // 2400, replay L5 talks 2411 with the line already shown, first-time
    // 2-1 (L11) talks 201, first-time 3-1 pool (L21) talks 501,
    // whack-a-zombie L15 talks 401 (NOT first-time
    // gated — 779-782 has no IsFirstTimeAdventureMode check), Big Trouble
    // Little Zombie L25 talks 701 on EVERY adventure attempt (also not
    // first-time gated — 783-786 has no check either). Vasebreaker L35
    // talks 2500 on every attempt (791-794); stormy night L40 talks 1101 on
    // EVERY adventure attempt (795-798, also not first-time gated).
    // Custom 5-1 (L41) talks 9001 on EVERY attempt while GENERATORNOTFINISHED
    // (user request, not retail — passed in as a daveDialogStart override).
    // CrazyDaveTime
    // = TimeEarlyDaveLeaveEnd - TimePanRightStart = 2500 on all seven
    // (final-boss +4000 N/A in scope). 2-1 and 3-1 scroll normally; L5 + L15 take
    // the non-scrolling jump at 4000 (IsNonScrollingCutscene 614-628);
    // L25/L35/L40 scroll like a normal level (little-trouble/scary/stormy
    // are absent from 614-628).
    const dave5 = board.level === 5, dave11 = board.firstTime && board.level === 11;
    const dave21 = board.firstTime && board.level === 21;
    const dave15 = board.level === 15 && board.isWhack;
    const dave25 = board.level === 25;
    const dave35 = board.level === 35 && board.isVase;
    const dave40 = board.level === 40 && board.isStormy;
    this.crazyDaveTime = (dave5 || dave11 || dave21 || dave15 || dave25 || dave35 || dave40) ? 2500 : 0;
    this.daveDialogStart = dave5 ? (board.firstTime ? 2400 : 2411) : (dave11 ? 201 : (dave21 ? 501 : (dave15 ? 401 : (dave25 ? 701 : (dave35 ? 2500 : (dave40 ? 1101 : -1))))));
    // Pre-shop seed-slot offers (CutScene::StartLevelIntro 746-761):
    // startLevel computes eligibility (profile coins/purchases live in
    // SAVE, which this module never touches) and passes the talk start
    // here. Like every other Dave intro this adds the 2500 Dave window.
    if (daveDialogStart !== null && daveDialogStart !== -1) {
      this.daveDialogStart = daveDialogStart;
      this.crazyDaveTime = crazyDaveTime !== null ? crazyDaveTime : 2500;
    }
    this.daveMessageActive = false; // set per-tick by main from G.dave
    // StartLevelIntro 680 clears the shovel for EVERY level at intro
    // start; only the Wall-nut Bowling branch (762-773) re-enables it.
    // In this scope that is level 5 (isBowling). Everywhere else the
    // shovel stays hidden through the pan AND the seed chooser — it
    // comes back via ShowShovel (CutScene 1366: !firstTime || level > 4)
    // at the intro end (Update 1482), applied in update() below.
    // USER OVERRIDE (retail shows the shovel on bowling: 762-773 sets it
    // for adventure L5 incl. replays, and ShowShovel's bowling
    // early-return preserves it through play): per user, walnut bowling
    // has no shovel. First-time L5 keeps it only while the SHOVEL
    // tutorial needs it (hidden at SHOVEL_COMPLETED in sim); replay L5
    // never shows it (ShowShovel's early-return keeps it false).
    // Vasebreaker (L35) is NOT in ShowShovel's early-return list
    // (1356-1364: whack/bowling/beghouled/zen/zombiquarium/tree/IZ),
    // so it gets the shovel at the intro end like any level > 4 —
    // hidden until then, even though its bank never slides in.
    board.showShovel = (board.isBowling && board.firstTime); // StartLevelIntro 680: cleared for all; vase returns via ShowShovel at the intro end
    board.cutscene = this; // SHOVEL_COMPLETED rewinds the intro clock
    // StartLevelIntro 688-697: sod rolls on 1,2,4 first-time.
    const lv = board.level, first = board.firstTime;
    if (first && (lv === 1 || lv === 2 || lv === 4)) {
      this.sodTime = T.RollSodEnd - T.RollSodStart; // 2000
      board.sodPosition = 0;
    } else {
      this.sodTime = 0;
      board.sodPosition = 1000;
    }
    this.mowerTime = 550; // StartLevelIntro 734-738 (!IsSurvivalRepick)
    this.graveTime = 0; // day: no graves
    // StartLevelIntro 699-711: night stages roll the gravestones in during
    // the intro (mGraveStoneTime = TimeGraveStoneEnd - TimeGraveStoneStart =
    // 1000; adventure whack-a-mole gets 0 via the 703-706 branch).
    // StageHasGraveStones (Board.cpp:8865) is bg-NIGHT-only in scope
    // (bowling/pogo/beghouled/portal/last-stand/IZ/scary-potter exclusions
    // never fire here). Night graves stay hidden until the roll edge in
    // animateBoard (CutScene 1243-1251: mEnableGraveStones + particles).
    // Whack graves are placed by Challenge (9 at Board init) but stay
    // buried until the 406 advance (CutScene 1690-1694) — so the intro
    // starts with enableGraveStones false and graveTime 0.
    // Whack-a-mole gets 0 via the 703-706 branch; vasebreaker is night but
    // excluded like the other special modes (StageHasGraveStones is false).
    if (board.bg === BG.NIGHT && !board.isVase) {
      this.graveTime = T.GraveStoneEnd - T.GraveStoneStart; // 1000
      board.enableGraveStones = false;
    } else if (board.isWhack) {
      board.enableGraveStones = false;
    } else {
      board.enableGraveStones = true;
    }
    this.fogTime = 0;
    // StartLevelIntro 846-852: fog stages roll the fog in during the intro
    // (mFogTime = TimeFogRollIn - mSodTime - mLawnMowerTime -
    // TimeReadySetPlantStart + 2000); day/night/pool/roof get 0. Feeds
    // totalTime + the readyAt/prepare formulas below like source.
    if (board.stageHasFog())
      this.fogTime = T.FogRollIn - this.sodTime - this.mowerTime - T.ReadySetPlantStart + 2000;
    this.bossTime = 0;
    // StartLevelIntro 713-732: no ReadySetPlant on first-time L1/L2, nor on
    // bowling levels (Wall-nut Bowling's Dave end replaces it) and the other
    // listed modes (shovel/squirrel/zen/last-stand/tree/IZ/whack-a-mole/
    // scary-potter). Bowling = L5 in scope; L10 keeps ReadySetPlant.
    // Whack-a-Zombie (724) and vasebreaker get readyTime 0 like the other listed modes.
    if (board.isBowling || board.isWhack || board.isVase || (first && lv <= 2)) this.readyTime = 0;
    else this.readyTime = T.ReadySetPlantEnd - T.ReadySetPlantStart; // 1830
    // mBoard->Move(BOARD_OFFSET, 0) at intro start (CutScene 1130): the 1400px
    // art drawn at board-local -220 lands at screen 0. boardX is the source
    // pan offset: -220 (house) -> 380 (street) -> 0 (play).
    // Non-scrolling cutscenes (L5 + L15, IsNonScrollingCutscene 614-628)
    // never pan:
    // the board stays at the play framing the whole intro.
    this.boardX = this.isNonScrolling() ? 0 : -T.BoardOffset;
    this.seedBankY = -87; // hidden above (IMAGE_SEEDBANK height 87)
    this.seedBankX = 0;
    this.seedBankDarken = 255;
    this.seedChooserY = 516; // SEED_CHOOSER_OFFSET_Y (GameConstants.h)
    this.menuY = -50; // stone tab parks above the screen, drops -50->-10 with the slide (CutScene 1151-1153)
    this.readyFired = false;
    this.fadeDone = false;
    this.waitingForSeeds = false;
    this.seedChooserShown = false;
    this.chooserOpened = false; // slide-end input gate (fired once; EndSeedChooser's time jump must not refire it)
    this.onReadyPlant = null; // main hooks reanim+sfx
    this.onSeedChooser = null; // main shows chooser UI, pauses time
    this.placedZombies = false;
    this.done = false;
    this.graveFired = false; // grave-roll edge below fires once
    this.potsPlaced = false; // roof pots (AddFlowerPots) fire once at the pan-left start
    this.rakePlaced = false; // garden rake (PlaceRake) rides the same PlaceLawnItems call
    // StartLevelIntro 880-916: DisplayAdvice(house message, HOUSE_NAME,
    // ADVICE_NONE) at intro start — duration 250, no once-per-level guard.
    // No house message while Dave runs (StartLevelIntro 881 gates on
    // mCrazyDaveTime <= 0). Street zombies are placed on the first update.
    if (this.crazyDaveTime === 0) {
      this.board.displayAdvice(this.houseMessage(), "HOUSE");
      this.placeStreetZombies();
    }
  }
  houseMessage() {
    // StartLevelIntro 887-909: "[PLAYERS_HOUSE]" + {PLAYER} for day/night,
    // "[PLAYERS_BACKYARD]" for pool/fog, "[PLAYERS_ROOF]" for roof/boss
    // (LawnStrings: "{PLAYER}'s House" / "{PLAYER}'s Backyard" /
    // "{PLAYER}'s Roof!"). TodReplaceString swaps {PLAYER} for the name.
    const name = (this.board.playerName || "Player");
    const bg = this.board.bg;
    if (bg === BG.POOL || bg === BG.FOG) return `${name}'s Backyard`;
    if (bg === BG.ROOF || bg === BG.BOSS) return `${name}'s Roof!`;
    return `${name}'s House`;
  }
  // CutScene::IsNonScrollingCutscene (CutScene.cpp:614-628): in scope only
  // Wall-nut Bowling (level 5) and Whack-a-Zombie (level 15) qualify —
  // little-trouble (L25) is absent from 614-628, so its Dave intro scrolls
  // like the L11 one. The L10/L20/L30 mini-bosses scroll too.
  isNonScrolling() {
    return !!(this.board.isBowling || this.board.isWhack || this.board.isVase);
  }
  // CutScene::IsInShovelTutorial (CutScene.cpp:1373-1379).
  isInShovelTutorial() {
    const s = this.board.tutorialState;
    return s === 15 || s === 16 || s === 17;
  }
  // CutScene::IsShowingCrazyDave (CutScene.cpp:1396-1399).
  isShowingDave() {
    return this.crazyDaveTime > 0 && this.time < T.PanRightEnd + this.crazyDaveTime;
  }
  get totalTime() {
    return T.IntroEnd + this.mowerTime + this.sodTime + this.graveTime + this.crazyDaveTime + this.fogTime + this.bossTime + this.readyTime;
  }
  placeStreetZombies() {
    // CutScene::PlaceStreetZombies (CutScene.cpp:485-584): the preview
    // zombies are SAMPLED from the level's own waves — per-type counts over
    // every wave (flag skipped, yeti skipped off stormy-night, bobsled
    // skipped outside bonanza, pool forces one ducky), garg/zamboni placed
    // first, then proportional preview numbers (count*cap/total clamped to
    // [1,count]; cap 10, 15 on Little Trouble, 18 on stormy/miniboss), each
    // on a uniform-random valid grid cell (FindPlaceForStreetZombies +
    // CanZombieGoInGridSpot).
    if (this.placedZombies) return;
    this.placedZombies = true;
    const b = this.board;
    if (b.level === 50) return; // final boss: no preview (CutScene.cpp:491)
    const counts = new Map(); let total = 0;
    for (const wave of (b.waves || [])) for (const t of wave) {
      if (t === "flag") continue;
      if (t === "yeti" && !canSpawnYetis(b.finished, b.level)) continue;
      if (t === "bobsled") continue;
      counts.set(t, (counts.get(t) || 0) + 1); total++;
    }
    if (b.bg === BG.POOL || b.bg === BG.FOG) counts.set("ducky", 1); // StageHasPool (source 547): pool + fog force a ducky preview
    if (!total) return;
    let cap = 10;
    if (b.level === 25) cap = 15; // IsLittleTroubleLevel
    else if (b.level === 40 || b.level === 10 || b.level === 20 || b.level === 30) cap = 18; // stormy-night / miniboss adventure
    const grid = Array.from({ length: 5 }, () => Array(5).fill(false));
    const spots = [];
    const is2x2 = (t) => t === "garg"; // Is2x2Zombie: garg + redeye (boss levels N/A here)
    // CanZombieGoInGridSpot (CutScene.cpp:4393): (4,0) never, zamboni only
    // in column 4, pool blocks column 0, roof blocks (0,0), fog blocks
    // balloon in column 4, 2x2 needs a free 2x2 block off the top/left edges.
    const canGo = (t, gx, gy) => {
      if (grid[gx][gy]) return false;
      if (is2x2(t)) {
        if (gx === 0 || gy === 0) return false;
        if (grid[gx - 1][gy] || grid[gx][gy - 1] || grid[gx - 1][gy - 1]) return false;
      }
      if (gx === 4) { if (gy === 0) return false; }
      else {
        if (t === "zamboni") return false;
        if (gx === 0 && b.bg === BG.POOL) return false;
      }
      // Polevaulter/garg column gates (CutScene.cpp:230-243): no col 0, no
      // col 1 on pool rows or row 0 (garg 2x2 already gates gx/gy 0 above).
      if (t === "pole" || t === "garg") {
        if (gx === 0) return false;
        if (gx === 1 && (b.bg === BG.POOL || b.bg === BG.FOG || gy === 0)) return false;
      }
      if ((b.bg === BG.ROOF || b.bg === BG.BOSS) && gx === 0 && gy === 0) return false;
      if (gx === 4 && b.bg === BG.FOG && t === "balloon") return false;
      return true;
    };
    const randCell = (t) => {
      // TodPickFromWeightedGridArray over weight-1 cells = uniform pick.
      const picks = [];
      for (let gx = 0; gx < 5; gx++) for (let gy = 0; gy < 5; gy++)
        if (canGo(t, gx, gy)) picks.push([gx, gy]);
      if (!picks.length) return [2, 2]; // TodTrace + fallback (CutScene.cpp:276)
      return picks[(Math.random() * picks.length) | 0];
    };
    // LawnApp::CanShowAlmanac/Store (LawnApp.cpp:2468-2488): finished ||
    // level>=15 for the book, finished || seen-upsell || level>=25 for the
    // shop. mHasSeenUpsell isn't tracked in this port, so the store half is
    // finished || level>=25 — merged, since the jitter branch ORs them.
    const storefront = b.finished || (b.profileLevel | 0) >= 15;
    const place = (t) => {
      let gx, gy;
      if (t === "bungee") { gx = 0; gy = 0; } // FindPlace always (0,0), grid unmarked; blitz extras are L45-only (out of scope)
      else {
        [gx, gy] = randCell(t);
        grid[gx][gy] = true;
        if (is2x2(t)) { grid[gx - 1][gy] = true; grid[gx][gy - 1] = true; grid[gx - 1][gy - 1] = true; }
      }
      let mx, my, order;
      if (t === "bungee") { mx = gx * 50 + 950; my = 50; order = -1; } // GROUND layer, below the lawn block
      else {
        // PlaceAZombie (CutScene.cpp:4391): base grid point + odd-column
        // drop, then the per-branch jitter (Rand(n) = 0..n-1, like Tod).
        mx = gx * 56 + 830; my = gy * 90 + 70;
        if (gx % 2 === 1) my += 30;
        if (t === "zamboni") { my -= 10; mx -= 30; }
        else if (b.level === 25) { my += Math.random() * 50 - 25; mx += Math.random() * 50 - 25; }
        else if (is2x2(t)) mx += Math.random() * 15 - 20;
        else if (gy === 4 && storefront) mx += Math.random() * 15;
        else { my += Math.random() * 15; mx += Math.random() * 15; }
        // MakeRenderOrder(RENDER_LAYER_LAWN, 0, (gx%2)*2 + gy*4).
        order = (gx % 2) * 2 + gy * 4;
      }
      // Display anchor: UpdateReanim rides the body at (mPos + 15 + type,
      // mPos - 8 + type) at scale 1 (syncBody) — baked here so the preview
      // matches live zombies exactly.
      const o = ZOMBIE_DRAW_OFFSETS[t] || ZOMBIE_DRAW_OFFSETS.normal;
      spots.push({ type: t, x: mx + 15 + o[0], y: my - 8 + o[1], order, gx, gy });
    };
    for (const t of ORDER) if ((counts.get(t) || 0) > 0 && (is2x2(t) || t === "zamboni")) place(t);
    for (const t of ORDER) {
      const n = counts.get(t) || 0;
      if (!n || is2x2(t) || t === "zamboni") continue;
      // previewNum = count*cap/total clamped to [1,count] (ClampInt).
      const prev = Math.max(1, Math.min(n, Math.floor((n * cap) / total)));
      for (let i = 0; i < prev; i++) place(t);
    }
    this.board.cutsceneZombies = spots;
  }
  removeCutsceneZombies() {
    this.board.cutsceneZombies = [];
  }

  // Called by main when the player presses LET'S ROCK on the chooser.
  endSeedChooser() {
    this.waitingForSeeds = false;
    this.time = this.crazyDaveTime + T.SeedChooserSlideOnEnd + 10;
  }
  update() {
    if (this.done) return;
    // CutScene::Update 1432-1436: street zombies are (re)placed on the
    // first update tick — StartLevelIntro never places them directly (only
    // PreloadResources does, for boss/bowling). This is what puts the
    // preview zombies on Dave levels (L5/L11), whose ctor path skips them.
    // Runs before the time-stop gate, so placement lands even while Dave
    // holds the clock frozen.
    if (!this.placedZombies) this.placeStreetZombies();
    // CutScene::Update 1444-1470: time stops while choosing, while Dave has
    // a message up, or while the shovel tutorial runs. UpdateCrazyDave runs
    // before this gate (main ticks the Dave entity first).
    if (this.waitingForSeeds || this.daveMessageActive || this.isInShovelTutorial()) return;
    this.time += 10;
    // MessageWidget::Update runs inside Board::Update while the board is
    // unpaused — including the intro — so the HOUSE_NAME duration (250)
    // counts down alongside the cutscene clock.
    this.board.updateAdvice();
    if (this.chooseSeeds && !this.seedChooserShown && this.time > T.SeedChooserSlideOnStart + this.crazyDaveTime) {
      // Panel becomes VISIBLE at slide start (SeedChooserScreen::Draw 331-339
      // has no mSeedChoosing gate — it draws every frame at the cutscene's
      // Move() position, so the slide-up plays visibly, not as a pop-in).
      this.seedChooserShown = true;
    }
    if (this.chooseSeeds && !this.chooserOpened && this.time >= T.SeedChooserSlideOnEnd + this.crazyDaveTime) {
      // StartSeedChooser (1381): mouse + focus only once the slide lands.
      // Source tests == at 1466 (the EndSeedChooser jump to onEnd+10 skips
      // it forever); this port keeps >= (Dave times aren't tick-aligned) with
      // an explicit once-flag for the same no-refire guarantee.
      this.chooserOpened = true;
      this.waitingForSeeds = true;
      if (this.onSeedChooser) this.onSeedChooser();
    }
    if (this.time >= this.totalTime) {
      this.removeCutsceneZombies();
      this.board.sodPosition = 1000;
      this.boardX = 0;
      // CutScene::ShowShovel (1354-1370) at the intro end (Update 1482):
      // (!IsFirstTimeAdventureMode() || mLevel > 4). The early-return
      // modes (whack-a-mole/bowling/beghouled/zen/zombiquarium/tree/
      // I-zombie) never reach this line in scope — bowling (L5) and whack
      // (L15) keep the shovel hidden (ShowShovel 1356-1364 early-return).
      // Bowling already has its intro-start value; whack never shows it.
      // (Bowling's early-return also covers replay L5 — no shovel there
      // per user request; first-time L5 keeps its intro-start tutorial
      // value since this only ever sets, never clears.)
      // Vasebreaker (L35) is not early-returned, so it gains the shovel
      // here like any level > 4 (its bank stays hidden; the slot draws
      // fixed via drawVaseShovel).
      if (!this.board.isWhack && !this.board.isBowling && (!this.board.firstTime || this.board.level > 4)) this.board.showShovel = true;
      // Mower slides end exactly at totalTime on sod levels; snap shut so no
      // row rests 1-3px short (animateBoard no longer runs once done).
      for (const m of this.board.mowers) { if (m && m.state === "ready") { m.x = -35; m.visible = true; this.board.syncMowerBody(m); } }
      this.done = true;
      return;
    }
    this.animateBoard();
  }
  animateBoard() {
    const t = this.time, cd = this.crazyDaveTime;
    // Early-Dave non-scrolling jump (CutScene 1118-1121): at 4000 the intro
    // jumps to the pan-left end (8500 on L5) — the street pan never plays.
    // The Dave enter/talk edges live in the main tick next to the sod edges.
    if (cd > 0 && this.isNonScrolling() && t === T.EarlyDaveLeaveEnd) {
      this.time = T.PanLeftEnd + cd;
      return this.animateBoard();
    }
    const aPanR0 = T.PanRightStart + cd, aPanR1 = T.PanRightEnd + cd;
    const aPanL0 = T.PanLeftStart + cd, aPanL1 = T.PanLeftEnd + cd;
    // Non-scrolling Dave levels hold the play framing (no street pan).
    if (cd > 0 && this.isNonScrolling()) this.boardX = 0;
    else {
    // Board pan (CutScene 1127-1174): -BOARD_OFFSET (house) -> 380 (street) -> 0 (play).
    const panMax = T.BoardImageWidthOffset - T.ScreenW; // 380
    const base = -T.BoardOffset; // IsScrolledLeftAtStart (day levels)
    if (t <= aPanR0) this.boardX = base;
    else if (t <= aPanR1) this.boardX = calcPosition(aPanR0, aPanR1, base, panMax, t);
    else if (t <= aPanL0) this.boardX = panMax;
    else if (t <= aPanL1) this.boardX = calcPosition(aPanL0, aPanL1, panMax, 0, t);
    else this.boardX = 0;
    }
    // Seed chooser slide (chooser path only).
    if (this.chooseSeeds) {
      const on0 = T.SeedChooserSlideOnStart + cd, on1 = T.SeedChooserSlideOnEnd + cd;
      const off0 = T.SeedChooserSlideOffStart + cd, off1 = T.SeedChooserSlideOffEnd + cd;
      if (t > on0 && t <= on1) this.seedChooserY = calcPosition(on0, on1, 516, 0, t);
      else if (t > off0 && t <= off1) this.seedChooserY = calcPosition(off0, off1, 0, 516, t);
      else if (t > on1 && t <= off0) this.seedChooserY = 0;
      // Menu stone tab rides in from the TOP on its own (-50->-10,
      // CutScene 1151-1153), drawn in the board frame that ignores the
      // widget Y (SeedChooserScreen::Draw 422-425) — never with the panel.
      if (t > on0 && t <= on1) this.menuY = calcPosition(on0, on1, -50, -10, t);
      else if (t > on1) this.menuY = -10;
    }
    // Seed bank slide. Non-chooser path shifts by prepareEnd (CutScene 1180-1190).
    let prepare = 0;
    if (!this.chooseSeeds) prepare = this.bossTime + this.fogTime + this.graveTime + this.sodTime - T.SeedChooserSlideOnStart + T.PanLeftEnd;
    const bank0 = T.SeedBankOnStart + prepare + cd, bank1 = T.SeedBankOnEnd + prepare + cd;
    // CutScene 1186: the slide-in skips IsChallengeWithoutSeedBank levels
    // (whack-a-mole and vasebreaker) — the play slide (Challenge::Update 2172, our bankY)
    // brings it in once sun exists instead. The X slide/darken below still
    // runs (source has no gate there; harmless while hidden at -87).
    if (!this.board.isWhack && !this.board.isVase) {
      if (t > bank0 && t <= bank1) this.seedBankY = calcPosition(bank0, bank1, -87, 0, t);
      else if (t > bank1) this.seedBankY = 0;
    }
    const br0 = T.SeedBankRightStart + cd, br1 = T.SeedBankRightEnd + cd;
    if (t > br0) {
      this.seedBankX = calcPosition(br0, br1, 0, 10, t);
      this.seedBankDarken = animateCurve(br0, br1, t, 255, 128, "easeOut");
    }
    // Sod roll (CutScene 1204-1238).
    if (this.sodTime > 0) {
      const s0 = T.RollSodStart + cd, s1 = T.RollSodEnd + cd;
      this.board.sodPosition = animateCurve(s0, s1, t, 0, 1000, "linear");
    }
    // Lawn mowers slide in per-row (CutScene 1264-1279: CalcPosition =
    // TodAnimateCurve EASE_IN_OUT, like the pans — NOT linear). Before its
    // start time the source touches nothing; past it, visible + ease
    // -80 -> rest (-35, nudged from source -21 per user). User override:
    // ours init hidden (source init leaves them visible at -160, which the
    // house pan drags onto the porch), so each row flips visible here at its
    // start — the slide itself is source-exact.
      // Board.update (which syncs mower art positions) doesn't run during the
      // intro, so the art rides along here.
    for (let r = 0; r < this.board.mowers.length; r++) {
      const mStart = T.MowerStart[r] + this.sodTime + this.graveTime + cd;
      const m = this.board.mowers[r];
      if (!m) continue;
      if (t > mStart) {
        m.visible = true;
        m.x = calcPosition(mStart, mStart + T.MowerDuration, -80, -35, t);
        this.board.syncMowerBody(m);
      }
    }
    // Night grave roll (CutScene 1243-1251: mEnableGraveStones + one
    // PARTICLE_GRAVE_STONE_RISE per stone at GridToPixel+14/offX,+78/offY
    // (GridItem::AddGraveStoneParticles, GridItem.cpp:423) + FOLEY_DIRT_RISE
    // each). On 2-1 this lands at 8500, right as the pan returns to the house.
    if (this.graveTime > 0 && !this.graveFired && t >= this.sodTime + T.GraveStoneStart + cd) {
      this.graveFired = true;
      this.board.enableGraveStones = true;
      try {
        for (const c of this.board.cells) {
          if (!c.grave) continue;
          this.board.spawnGraveRise(gridToPixelX(c.col, this.board.bg) + 14 + c.grave.offX, gridToPixelY(c.col, c.row, this.board.bg) + 78 + c.grave.offY, c.row);
          this.board.sfx("dirtRise");
        }
      } catch (e) { /* headless */ }
    }
    // CutScene::AddFlowerPots via PlaceLawnItems (CutScene 1256-1259): at the
    // pan-left start the back columns are potted (InitLawnMowers + rake ride
    // the same call; the mowers are already placed in this port). Scrolling chooser levels only — the Update
    // gate (1438-1441) covers non-scrolling/chooseless levels, and CancelIntro
    // (997) has no trigger here (no skip UI). >= with a once-flag like the
    // grave edge above (source == is not tick-aligned under Dave).
    if (!this.potsPlaced && t >= aPanL0 && (this.board.bg === BG.ROOF || this.board.bg === BG.BOSS)) {
      this.potsPlaced = true;
      try { this.board.addFlowerPots(); } catch (e) { /* headless/def missing */ }
    }
    // Board::PlaceRake via PlaceLawnItems (CutScene 1256-1259, 601-604): at
    // the same pan-left start the shop rake drops (InitLawnMowers rides the
    // same call but is already placed in this port). One-shot like the pots
    // above; the board persists the purchase through onRakePlaced (main.js).
    // (No chooser gate: PlaceLawnItems fires for chooseless levels too —
    // bowling replays can carry a rake; whack/vase/boss no-op inside
    // placeRake via StageHasZombieWalkInFromRight.)
    if (!this.rakePlaced && t >= aPanL0) {
      this.rakePlaced = true;
      try { this.board.placeRake(); } catch (e) { /* headless/def missing */ }
    }
    // Ready Set Plant (CutScene 1326-1345).
    const readyAt = T.ReadySetPlantStart + this.mowerTime + this.sodTime + this.graveTime + cd + this.fogTime + this.bossTime;    if (!this.readyFired && ((this.readyTime > 0 && t >= readyAt) || (this.readyTime === 0 && t >= readyAt - 2000))) {
      this.readyFired = true;
      if (this.onReadyPlant) this.onReadyPlant(this.readyTime > 0);
    }
    // Fog roll (CutScene 1281-1295): the board's own update is frozen during
    // the intro (only pool visuals tick), so the cutscene drives the intro
    // fog path directly — roll countdown + offset easing + density update.
    // (No skip UI exists in this port, so CancelIntro's fog clear (951,
    // 1019-1022) has no trigger — documented only.)
    if (this.board.stageHasFog()) this.board.updateFogIntro(t, this.sodTime, this.graveTime, cd);
    // Stormy-night lightning (CutScene 1297-1304): at the pan-right end
    // minus 1000 and at the pan-left end, the storm restarts at FLASH_2/310.
    // (CancelIntro's counter=0 clear at 998-1001 has no trigger in this port
    // — no skip UI — documented only.)
    if (this.board.isStormy && (t === aPanR1 - 1000 || t === aPanL1)) {
      this.board.stormState = "flash2";
      this.board.stormCounter = 310;
    }
  }
  // CutScene 1330-1345 (non-boss adventure): the chooser tune fades just
  // before Ready-Set-Plant — at readyAt with FadeOut(150 TICKS) when the reanim
  // plays, or 2000 ticks earlier with FadeOut(200 TICKS) when readyTime is 0
  // (first-time L1/L2, no reanim). Music::MusicUpdate decrements the fade
  // counter once per 100Hz logic tick, so 150 ticks = 1500ms and 200 ticks =
  // 2000ms — the port's fadeMusic takes milliseconds, hence 1500/2000 here
  // (the old 150/200 values ran the ramp 10x too fast and sounded abrupt).
  // Same readyAt formula as animateBoard.
  // User request: the Ultimate Battle intros (L10 + L20 night + L30 pool conveyor)
  // fade out SLOWLY across the camera pan back to the house — starting with
  // and continuing ~1s past Ready-Set-Plant begin (the tail is not cut at
  // RSP, it keeps fading out underneath it).
  chooserFade() {
    const cd = this.crazyDaveTime;
    const readyAt = T.ReadySetPlantStart + this.mowerTime + this.sodTime + this.graveTime + cd + this.fogTime + this.bossTime;
    if (this.board.level === 10 || this.board.level === 20 || this.board.level === 30) {
      const at = T.PanLeftStart + cd;
      return { at, dur: Math.max(1, readyAt - at + 1000) };
    }
    if (this.readyTime > 0) return { at: readyAt, dur: 1500 };
    return { at: readyAt - 2000, dur: 2000 };
  }
  // L10 / L20 night / L30 pool Ultimate Battle intro two-stage fade (user request):
  // the slow fade from chooserFade above (pan-back start -> ~1s past RSP) HOLDS when the
  // camera reaches the house — the intro keeps playing at its half-faded
  // volume — then resumes halfway through Ready-Set-Plant and runs out
  // just before the board starts (so the battle track takes over cleanly).
  // Returns null on every other level (single quick RSP fade, no staging).
  battleIntroHold() {
    if (this.board.level !== 10 && this.board.level !== 20 && this.board.level !== 30) return null;
    const cd = this.crazyDaveTime;
    const f = this.chooserFade();
    const holdAt = T.PanLeftEnd + cd;
    const readyAt = T.ReadySetPlantStart + this.mowerTime + this.sodTime + this.graveTime + cd + this.fogTime + this.bossTime;
    const refadeAt = readyAt + (this.readyTime > 0 ? this.readyTime / 2 : 0);
    // Analytic level of fade#1's 1 -> 0.0001 linear ramp at the hold tick
    // (AudioParam.value doesn't reliably report the interpolated ramp
    // position, so pin the exact value instead of reading it back).
    const p = Math.max(0, Math.min(1, (holdAt - f.at) / f.dur));
    const holdVol = 1 + (0.0001 - 1) * p;
    const refadeDur = Math.max(1, this.totalTime - refadeAt - 100);
    return { holdAt, refadeAt, refadeDur, holdVol };
  }
}

// CutScene GAMEMODE_INTRO cinematic (CutScene::UpdateIntro/DrawIntro 2291-2370):
// first-time adventure opens on a live pool demo board that pans -100 -> 100
// while "PopCap Games Presents" shows, then the PvZ logo slams in with a
// screen flash + boom at 5900, a siren at 10690, a black fade 10890-11890,
// and the real adventure (PreNewGame ADVENTURE) starts at 13890.
// Times are ms (+10 per 100Hz tick, like the normal cutscene).
export const INTRO = {
  PresentsFadeIn: 1000, PresentsEnd: 4890, PresentsFadeStart: 4290, PresentsFadeEnd: 4590,
  LogoStart: 5500, LogoEnd: 5900, LogoHoldEnd: 11890,
  PanRightStart: 5890, PanRightEnd: 11890,
  FadeOut: 10890, FadeOutEnd: 11890, Siren: 10690, End: 13890,
};
export class IntroCutScene {
  constructor(board) {
    this.board = board;
    this.time = 0; this.boardX = 0; this.done = false;
    this.intro = true; // marker for main tick/draw
    this.firedBoom = false; this.firedSiren = false; this.firedFade = false;
    // Surface shared with CutScene so drawBoard's cutscene reads stay safe.
    this.waitingForSeeds = false; this.seedChooserY = 516;
    this.seedBankY = 0; this.seedBankX = 10; this.seedBankDarken = 255;
    this.sodTime = 0; this.readyTime = 0; this.mowerTime = 0;
    this.crazyDaveTime = 0; this.graveTime = 0; this.fogTime = 0; this.bossTime = 0;
  }
  update() {
    if (this.done) return;
    this.time += 10;
    const t = this.time;
    // UpdateIntro 2293: board pans -100 -> +100 linear across 5890-11890.
    if (t >= INTRO.PanRightStart && t <= INTRO.PanRightEnd)
      this.boardX = animateCurve(INTRO.PanRightStart, INTRO.PanRightEnd, t, -100, 100, "linear");
    else if (t > INTRO.PanRightEnd) this.boardX = 100;
    // Logo slam (UpdateIntro 2303-2310): screen flash + SOUND_HUGE_WAVE.
    // Siren 200 ticks before the fade (2312-2317). Cutscene sounds are muted
    // except for these two stingers (mMuteSoundsForCutscene).
    if (t === INTRO.LogoEnd && !this.firedBoom) {
      this.firedBoom = true;
      this.board.muted = false;
      this.board.sfx("hugewave");
      this.board.flashAt(400, 300, 600); // PARTICLE_SCREEN_FLASH stand-in
      this.board.muted = true;
    }
    if (t === INTRO.Siren && !this.firedSiren) {
      this.firedSiren = true;
      this.board.muted = false;
      this.board.sfx("siren");
      this.board.muted = true;
    }
    // Source UpdateIntro 2299-2302: the tune fades at FadeOut via
    // mMusic->FadeOut(250 TICKS) (= 2500ms at 100Hz), 200 ticks after the siren. USER
    // OVERRIDE: the fade runs 1000ms instead, riding the black fade
    // (FadeOut 10890 -> FadeOutEnd 11890) so the pool tune dissolves
    // with the picture instead of cutting out early.
    if (t === INTRO.FadeOut && !this.firedFade) {
      this.firedFade = true;
      fadeMusic(1000);
    }
    // The demo board stays live behind the titles (plants shoot, zombies walk).
    this.board.update();
    if (t >= INTRO.End) this.done = true;
  }
  // DrawIntro alpha/scale (2325-2370). Logo scale uses the source ease-out.
  presentsAlpha() {
    const t = this.time;
    if (t <= INTRO.PresentsFadeIn || t > INTRO.PresentsEnd) return 0;
    if (t < INTRO.PresentsFadeStart)
      return animateCurve(INTRO.PresentsFadeIn, INTRO.PresentsFadeIn + 300, t, 0, 255, "linear");
    return animateCurve(INTRO.PresentsFadeStart, INTRO.PresentsFadeEnd, t, 255, 0, "linear");
  }
  logoScale() {
    const t = this.time;
    if (t <= INTRO.LogoStart || t > INTRO.LogoHoldEnd) return 0;
    if (t >= INTRO.LogoEnd) return 1;
    return animateCurve(INTRO.LogoStart, INTRO.LogoEnd, t, 5, 1, "easeOut");
  }
  fadeAlpha() {
    const t = this.time;
    if (t <= INTRO.FadeOut || t > INTRO.FadeOutEnd) return 0;
    return animateCurve(INTRO.FadeOut, INTRO.FadeOutEnd, t, 0, 255, "linear");
  }
}
