// Screens + rendering + input. Source flow (LawnApp.cpp):
// TitleScreen click -> UserDialog/NewUserDialog (ProfileMgr/PlayerInfo) -> ShowGameSelector
// -> PreNewGame(ADVENTURE) -> MakeNewBoard + Board::InitLevel + ShowSeedChooserScreen +
// CutScene::StartLevelIntro ("Player's House" pan, PlaceStreetZombies, sod, mowers, ReadySetPlant)
// -> StartPlaying -> Board::Update -> AwardScreen (GetAwardSeedForLevel).
import { Board, BG, backgroundForLevel, stageRows, gridToPixelX, gridToPixelY,
  PLANTS, awardSeedForLevel, fixedBankSize, hasShovel, chooseSeedsOnLevel, numSeedsInBank, seedsAvailableFor, concealZombieExtras, Plant, zombieShadowSpec, TUT, ADVICE_TEXT, DAVE_TEXT, hasConveyorBelt, ROSTER, ORDER, canSpawnYetis, evalPowieTrack, armorFlashTracks, ZOMBIE_ARM_DEF, ZOMBIE_CLUMPS_DEF, whackBank, vaseBank, isVasebreaker, packetUpgradeCost } from "./pvz/sim.js";
import { SEED_NAMES, SEED_TOOLTIPS, BG_IMAGE, pixelToGrid, conveyorPacketX } from "./pvz/data.js";
import { ALMANAC_UI, ALMANAC_PLANTS, ALMANAC_ZOMBIES } from "./pvz/almanacData.js";
import { getReanim, loadImage, plantStill } from "./pvz/assets.js";
import * as SAVE from "./pvz/save.js";
import { sfx as playSfx, playSting as playDancerSting, stopSting as stopDancerSting, startLoop as playFoleyLoop, stopLoop as stopFoleyLoop, setMusicVolume, setSfxVolume, getMusicVolume, getSfxVolume, preloadAll as preloadAllSounds, playMusic, stopMusic, fadeMusic, holdMusicFade, currentMusic, unlockMusic, preloadMusic, debugMusic, setMusicPaused, stopAllLoops, setLawnBranch } from "./pvz/audio.js";
import { Reanimation, LOOP, PLAY_ONCE_AND_HOLD } from "./pvz/reanim.js";
import { RENDER_GROUP_HIDDEN, RENDER_GROUP_NORMAL, RENDER_GROUP_ARMS } from "./pvz/enums.js";
import { CutScene, IntroCutScene, INTRO, T as CutT, calcPosition } from "./pvz/cutscene.js";
import { SPOTS, itemCost, isPageShown, isComingSoon, isSoldOut, isUnavailable, spotXY, seedForItem, daysSince2000 } from "./pvz/store.js";
import { loadFonts, drawText, drawWrapped, textWidth, font } from "./pvz/fonts.js";

const canvas = document.getElementById("pvzCanvas");
const ctx = canvas.getContext("2d");
// Keyboard input goes to the game without requiring a click first.
canvas.focus();
const W = 800, H = 600;
window.__pvz = { screen: "boot" };
window.__pvzCursor = () => ({ selSeed: G.selSeed, selConvIdx: G.selConvIdx, selUsableSeed: G.selUsable ? G.selUsable.seed : null, selUsableDead: G.selUsable ? !!G.selUsable.coin.dead : null, shovelMode: G.shovelMode, pressBankKey: G.pressBankKey, mouse: { ...G.mouse } });
window.__pvzTest = {
  // headless mechanics test: fresh board with everything preloaded, no rendering
  async newBoard(level, bankOverride, extraDefs) {    const adv = await import("./pvz/sim.js");
    const cur = SAVE.currentUser();
    const finished = cur?.finished ?? false;
    const picked = adv.pickAdventureWaves(level, Math.random, finished);
    const bank = bankOverride || adv.numSeedsInBank(level, finished, cur?.packetUpgrade | 0);
    const bankArr = Array.isArray(bank) ? bank : Array.from({ length: bank }, (_, i) => i);
    const ztypes = new Set();
    for (const w of picked.waves) for (const t of w) ztypes.add(t);
    if (!ztypes.size) ztypes.add("normal");
    if (ztypes.has("garg")) ztypes.add("imp");
    if (ztypes.has("dancer")) ztypes.add("backup");
    const RMAP = { normal: "Zombie", flag: "Zombie", cone: "Zombie", pole: "Zombie_polevaulter", bucket: "Zombie", news: "Zombie_paper", door: "Zombie", football: "Zombie_football", dancer: "zombie_jackson", backup: "Zombie_dancer", ducky: "Zombie", snorkel: "Zombie_snorkle", zamboni: "Zombie_zamboni", bobsled: "Zombie_bobsled", dolphin: "zombie_dolphinrider", jack: "Zombie_jackbox", balloon: "Zombie_balloon", digger: "Zombie_digger", pogo: "Zombie_pogo", bungee: "Zombie_bungi", ladder: "Zombie_ladder", catapult: "Zombie_catapult", garg: "Zombie_gargantuar", imp: "Zombie_imp", yeti: "Zombie_yeti", boss: "Zombie_boss" };
    const need = new Set(["Sun", "Coin_silver", "Coin_gold", "Diamond", "LawnMower", "PoolCleaner", "RoofCleaner", "LawnMowedZombie", "Zombie_Charred", "StartReadySetPlant", "FinalWave", "ZombiesWon", "splash", "Tanglekelp", "fire", "FirePea", "Seaweed", "Z", "Puff"]);
    for (const s of bankArr) need.add(PLANTS[s].reanim);
    for (const t of ztypes) need.add(RMAP[t]);
    if (adv.isVasebreaker(level)) {
      // Vasebreaker contents (same set as preloadBoardAssets): usable-seed
      // plants + vase zombie types (waves are empty so ztypes misses them).
      for (const s of [0, 5, 12, 17]) need.add(PLANTS[s].reanim);
      need.add("Hammer"); need.add("Zombie"); need.add("Zombie_football");
      need.add("zombie_jackson"); need.add("Zombie_dancer"); need.add("Zombie_jackbox");
    }
    if (adv.isStormyNightLevel(level)) {
      // Stormy-night rain (same set as preloadBoardAssets): UpdateRain spawns
      // splash/circle reanims from the challenge holder.
      need.add("Rain_circle"); need.add("Rain_splash");
    }
    // Roof pre-potted columns (CutScene::AddFlowerPots, in the Board ctor):
    // the pots need their def even if the bank holds no pot packet.
    if (backgroundForLevel(level) === BG.ROOF || backgroundForLevel(level) === BG.BOSS) need.add("Pot");
    if (extraDefs) for (const n of extraDefs) need.add(n); // e.g. off-wave audit targets like Zombie_zamboni
    need.add("Zombie_FlagPole");
    if (ztypes.has("news") || ztypes.has("digger")) need.add("Zombie_surprise"); // ripped-paper "?" (DropShield 7525 / diggerLoseAxe pause)
    if (ztypes.has("digger")) { need.add("Digger_rising_dirt"); need.add("Zombie_Charred_Digger"); } // digger rise-burst reanim + charred digger husk (UpdateZombieDigger / ApplyBurn)
    await needDefs([...need]);
    const bd = new Board(level, libs, { finished, packetUpgrade: cur?.packetUpgrade | 0, poolCleaner: SAVE.getPurchase(22) > 0, roofCleaner: SAVE.getPurchase(23) > 0, firstAid: SAVE.getPurchase(29) > 0, rake: SAVE.getPurchase(24) | 0 });
    // Headless has no cutscene — run its pan-left-start lawn placement here
    // (CutScene::PlaceLawnItems 1258 fires before the handoff below).
    if (bd.stageHasRoof()) bd.addFlowerPots();
    // Headless has no cutscene — the rake rides the same PlaceLawnItems
    // call (CutScene 1258/603), so place it here directly (post-handoff).
    // Save-free like the cutscene path: headless boards must not consume
    // the profile purchase (onRakePlaced stays null — startLevel arms it).
    try { bd.placeRake(); } catch (e) { /* ignore */ }
    bd.waves = picked.waves; bd.numWaves = picked.numWaves;
    if (bd.isVase) { bd.waves = []; bd.numWaves = 0; } // vase: zombies come from vases, never waves
    bd.profileLevel = cur?.level ?? 1; // CanShowAlmanac/Store jitter branch (CutScene.cpp:153)
    bd.state = "play"; bd.sun = 9999; // user-override max (source AddSunMoney clamps at 9990)
    // Headless has no cutscene handoff — run the StartPlaying advice here.
    try { bd.startLevel(); } catch (e) {}
    // No cutscene headless: mowers start rolled-in and ready (else invisible at -160).
    for (const m of bd.mowers) { if (!m) continue; m.x = -35; m.visible = true; bd.syncMowerBody(m); }
    return bd;
  },
  // Full level entry (cutscene included) for live testing via page_eval.
  startLevel(level) { return startLevel(level); },
  // Live board introspection (vase audit debugging).
  vaseState() {
    const b = G.board;
    if (!b) return null;
    return {
      screen: G.screen, state: b.state, vases: b.vases.length,
      leaf: b.vases.filter((v) => v.state === "leaf").length,
      coins: b.coins.filter((c) => !c.dead).map((c) => ({ kind: c.kind, x: Math.round(c.x), y: Math.round(c.y), held: !!c.held, dis: c.disappear, fade: c.fadeCount })),
      advice: b.advice ? b.advice.text : null, helpIndex: b.helpIndex,
      mallet: !!b.mallet, dave: !!G.dave, msgIndex: G.dave ? G.dave.msgIndex : null,
      next: b.nextSurvivalStage, stage: b.survivalStage,
    };
  },
};

const libs = {
  getReanim: (n) => {
    const d = DEFS.get(n);
    if (!d) throw new Error("no def " + n);
    return d;
  },
  sfx: (n, vol, pitch) => playSfx(n, vol, pitch),
  startLoop: (n) => playFoleyLoop(n), stopLoop: (n) => stopFoleyLoop(n),
  sting: () => playDancerSting(), stopSting: () => stopDancerSting(),
  images: {},
};
const DEFS = new Map();
async function needDefs(names) {
  for (const n of names) if (!DEFS.has(n)) DEFS.set(n, await getReanim(n));
}
async function needImages(files) {
  for (const f of files) if (!libs.images[f]) libs.images[f] = await loadImage("src/assets/images/" + f).catch(() => null);
}

// Custom unfinished-content gate (user request): while TRUE, adventure 5-1
// (level 41, roof intro) opens with a Crazy Dave warning that past this
// point things aren't fully implemented yet. Set FALSE to skip it entirely.
const GENERATORNOTFINISHED = true;

// ---------- game state ----------
// GameScenes: title -> menu -> [help|options] -> cutscene(+chooser overlay) -> board -> award.
const G = {
  screen: "title", board: null, cutscene: null, bankSeeds: [], chosen: [],
  selSeed: -1, selConvIdx: -1, selUsable: null, shovelMode: false, hover: null, mouse: { x: 0, y: 0 },
  pressBankKey: null, // mousedown bank widget key (bankPressAt) for click skip
  pressIsBot: false, // mousedown came from src/bot.js synthetic events (bot-only press rules)
  dave: null, // Crazy Dave cutscene entity (LawnApp:: mCrazyDave* port: first-time L5 + first-time 2-1/3-1 + custom 5-1 warning while GENERATORNOTFINISHED)
  daveOffer: null, // pre-shop slot offer modal (CutScene 1647-1688): {msgIndex, cost, slots} or null
  offerPress: null, // press/release match widget for the offer modal ("yes"/"no")
  titleT: 0, titleAge: 0, loadDoneCount: 0, loadTotal: 1, loadDone: false, loadDoneAge: -1, barW: 0, menuEntering: false,
  menuReanim: null, readyReanim: null, finalReanim: null, wonReanim: null,
  sodRolls: null, // CutScene SODROLL reanims rolling with the sod (1210-1238)
  awardSeed: 0, coinsStart: 0, msg: null, nameEdit: "", fast: new URLSearchParams(location.search).has("fast"),
  optMusic: 0.8, optSfx: 1,
  userPopup: null, userRows: [], userCreate: false, userSel: 0, userLast: null, renameIdx: -1, popupErr: null,
  menuClouds: [], menuCloudCtr: [], menuLeaf: null, menuLeafCtr: 50, menuFlowers: [],
  almanac: null, // AlmanacDialog state (null when closed): {page, selSeed, selZombie, plant, zombie, thumbs}
  // Pause menu (Board::KeyDown/MenuButton -> DoNewOptions/DoPauseDialog).
  // pauseDlg: null | "options" (tombstone menu) | "paused" (GAME PAUSED dialog)
  // | "confirmRestart" | "confirmLeave" (stacked LawnDialog confirms) | "continue"
  // (ContinueDialog over a TryLoadGame-resumed board). While
  // set, the board sim is frozen (Board::mPaused) and clicks route to the
  // dialog. pausePress tracks the mousedown widget for press/release match.
  // overPress is the same for the game-over dialog (modal past b.ended).
  // pauseReturn chains one confirm under another (Restart nested in Continue).
  pauseDlg: null, pausePress: null, overPress: null, pauseZombie: null, sliderDrag: null, pauseReturn: null, optPress: null,
  botKey: false, // B held: Adventure click hands the game to src/bot.js instead
};
window.__pvz.G = G;
window.__pvz.libs = libs;
window.__pvz.play = (lv, bank) => { // debug/testing hook: jump to any level
  const cur = SAVE.currentUser();
  const finished = cur?.finished ?? false;
  if (chooseSeedsOnLevel(lv, finished) && !G.chosen.length) G.chosen = bank || [0, 1, 2, 3, 4, 5];
  return startLevel(lv);
};
window.__pvz.need = needDefs; // debug/testing hook: preload reanim defs by name
window.__pvz.setLevel = (lv) => SAVE.setLevel(lv); // debug/testing hook: profile level for award-screen previews
window.__pvz.store = (opts) => openStore(opts || {}); // debug/testing hook: open Crazy Dave's shop
window.__pvz.freeze = (on = true) => { G.frozen = on; }; // debug/testing hook: stop ticking, keep rendering
window.__pvz.music = debugMusic; // debug/testing hook: music engine state
// Lawn/night/fog 3:03 + full-file 1:49 loop branch (user request): when a chained theme
// hits its loop point while the huge-wave or final-wave banner text is on
// screen, or while seven or more zombies are in play, its midwave takes over
// instead of a plain restart; at the midwave cut point (1:14 day, 0:50
// night, 0:53 fog) it hands back. Both handoffs overlap (old tail rings out, never cut).
setLawnBranch(() => {
  const b = G.board;
  if (!b || b.state !== "play") return "lawn";
  if (b.advice && b.advice.style === "HUGE") return "midwave";
  if (b.finalWave > 0) return "midwave";
  // Seven or more zombies in play (alive on the board, not dead/gone).
  let n = 0;
  for (const z of b.zombies) if (!z.dead && !z.gone && ++n >= 7) return "midwave";
  return "lawn";
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- level lifecycle (LawnApp::PreNewGame/NewGame + Board::InitLevel) ----------
// Shared asset preload for fresh + resumed boards (see startLevel/resumeLevel).
// bank = live SeedBank packet list, ztypes = zombie types on the board, dave =
// Crazy-Dave intro reanims (play-intro only — resumes never need them).
async function preloadBoardAssets(level, bank, ztypes, dave) {
  const need = new Set(["Sun", "Coin_silver", "Coin_gold", "Diamond", "LawnMower", "PoolCleaner", "RoofCleaner", "LawnMowedZombie", "Zombie_Charred", "StartReadySetPlant", "FinalWave", "ZombiesWon", "splash", "Tanglekelp", "fire", "FirePea", "Seaweed", "Puff"]);
  const cur = SAVE.currentUser();
  const finished = cur?.finished ?? false;
  // CutScene 396: SODROLL def preloaded for first-time sod levels (rolls at 1215-1228).
  if (!finished && (level === 1 || level === 2 || level === 4)) need.add("SodRoll");
  for (const s of bank) need.add(PLANTS[s].reanim);
  // Conveyor bank is empty (the board owns the packets), but the level still
  // needs every belt seed's plant reanim + the first-time pre-plants (L5).
  if (hasConveyorBelt(level)) {
    const adv = await import("./pvz/sim.js");
    for (const e of adv.conveyorSeedTable(level) || []) need.add(PLANTS[e.seed].reanim);
    if (level === 5) need.add("PeaShooterSingle"); // first-time pre-plants (InitLevel 391-396)
  }
  if (dave) {
    // L5 Crazy Dave (CrazyDaveEnter/TalkMessage + SHOW_WALLNUT) + first-time
    // 2-1 (L11) night Dave intro (dialog 201, no handing) + first-time 3-1
    // (L21) pool Dave intro (dialog 501, no handing) + L15 Whack-a-Zombie
    // (dialog 401 + SHOW_HAMMER handing) + pre-shop slot offers (1401/1501/1551)
    // + custom 5-1 (L41) unfinished warning (dialog 9001, no handing).
    need.add("Crazydave");
    if (level === 5) need.add("Wallnut");
    if (level === 15) need.add("Hammer"); // Dave's handed mallet + the player cursor
  }
  // Whack-a-Zombie player cursor (CursorObject ctor 25-33: REANIM_HAMMER when
  // IsWhackAZombieLevel) — needed even on resumes, which never run the Dave path.
  if (level === 15) need.add("Hammer");
  // Vasebreaker hammer (Challenge::ScaryPotterMalletPot: REANIM_HAMMER
  // anim_pot_open at the vase, RENDER_LAYER_TOP) — sim-owned, needed even on
  // resumes, which never run the Dave path.
  if (level === 35) need.add("Hammer");
  // Vasebreaker contents (Challenge::ScaryPotterPopulate tables): seed pots
  // plant pea/snow/hypno/squash through the usable-seed cursor (ghost +
  // cursor plant + the planted plant all need the def), zombie pots spawn
  // normal/bucket/football/dancer(+backup)/jack. Waves are empty so ztypes
  // covers none of these — preload them here (fresh + resume alike).
  if (level === 35) {
    for (const s of [0, 5, 12, 17]) need.add(PLANTS[s].reanim);
    need.add("Zombie"); need.add("Zombie_football"); need.add("zombie_jackson");
    need.add("Zombie_dancer"); need.add("Zombie_jackbox");
  }
  // Stormy-night rain (CutScene preload 407-411): the splash/circle reanim
  // defs ride the whole level (Challenge::UpdateRain spawns them from the
  // challenge holder; nothing else on the belt needs preloading — the
  // conveyor branch above already adds every belt seed's plant def).
  if (level === 40) {
    need.add("Rain_circle"); need.add("Rain_splash");
  }
  // Roof pre-potted columns (CutScene::AddFlowerPots, in the Board ctor):
  // the pots need their def even if the bank holds no pot packet.
  if (backgroundForLevel(level) === BG.ROOF || backgroundForLevel(level) === BG.BOSS) need.add("Pot");
  // Garden rake (CutScene preload 363-365: ReanimatorEnsureDefinitionLoaded
  // REANIM_RAKE while the purchase lasts).
  try { if (SAVE.getPurchase(24) > 0) need.add("Rake"); } catch (e) { /* headless */ }
  // Sleeping Zzz (Plant::SetSleeping 516-532, REANIM_SLEEPING = Z): any
  // nocturnal bank (puff/sun/fume/hypno/scaredy/ice/doom/sea/magnet) can
  // sleep on a day board — the Z reanim must be loaded to draw it.
  if ([...bank].some((s) => Plant.isNocturnal(s))) need.add("Z");
  const RMAP = { normal: "Zombie", flag: "Zombie", cone: "Zombie", pole: "Zombie_polevaulter", bucket: "Zombie", news: "Zombie_paper", door: "Zombie", football: "Zombie_football", dancer: "zombie_jackson", backup: "Zombie_dancer", ducky: "Zombie", snorkel: "Zombie_snorkle", zamboni: "Zombie_zamboni", bobsled: "Zombie_bobsled", dolphin: "zombie_dolphinrider", jack: "Zombie_jackbox", balloon: "Zombie_balloon", digger: "Zombie_digger", pogo: "Zombie_pogo", bungee: "Zombie_bungi", ladder: "Zombie_ladder", catapult: "Zombie_catapult", garg: "Zombie_gargantuar", imp: "Zombie_imp", yeti: "Zombie_yeti", boss: "Zombie_boss" };
  for (const t of ztypes) need.add(RMAP[t]);
  need.add("Zombie_FlagPole");
  if (ztypes.has("news") || ztypes.has("digger")) need.add("Zombie_surprise"); // ripped-paper "?" (DropShield 7525 / diggerLoseAxe pause)
  if (ztypes.has("digger")) { need.add("Digger_rising_dirt"); need.add("Zombie_Charred_Digger"); } // digger rise-burst reanim + charred digger husk (UpdateZombieDigger / ApplyBurn)
  await needDefs([...need]);
  await needImages([BG_IMAGE[backgroundForLevel(level)], "SunBank.png", "ShovelBank.png", "Shovel.png", "SeedBank.png", "packet_plants.png",
    "SeedChooser_Button.png", "SeedChooser_Background.png", "SeedChooser_Button_Disabled.png", "SeedChooser_Button_Glow.png",
    "SeedChooser_Button2.png", "SeedChooser_Button2_Glow.png",
    "awardscreen_back.png", "trophy.png", "Tombstones.png", "FlagMeter.png", "FlagMeterParts.png",
    "Shovel_hi_res.png", "ZombieNote.png", "ZombieNoteSmall.png", "Taco.png", "Shovel_hi_res_retail.png",
    "Tombstone_mounds.png", "crater.png", "crater_fading.png", "plantshadow.png", "pea_shadows.png", "sod3row.png", "sod1row.png",
    "background1unsodded.png", "seeds.png", "SeedPacketSilhouette.png", "SeedPacketSilhouetteBank.png", "ZombieNote1.png",
    "notescreen-day.png", "notescreen-night.png",
    "ConveyorBelt.png", "ConveyorBelt_backdrop.png", "Wallnut_bowlingstripe.png",
    "particles/DownArrow.png", "particles/SeedPacketFlash.png",
    "particles/SeedPacketGlow.png",
    "particles/Peasplat.png", "particles/cabbagepult.png",
    "particles/Star_splats.png", "particles/Star_particles.png",
    "particles/PuffShroom_puff1.png", "particles/PuffShroom_puff2.png",
    "particles/ExplosionCloud.png", "particles/Pow.png",
    // Doom-shroom blast art (PARTICLE_DOOM, main.zip particles/ — all
    // byte-identical): Stem/Base/Top + the Doom word. Base.png is the
    // 3-frame AnimationRate-5 strip; the Flash is a fullscreen rect (no art).
    "particles/DoomShroom_Explosion_Stem.png", "particles/DoomShroom_Explosion_Base.png",
    "particles/DoomShroom_Explosion_Top.png", "particles/Doom.png",
    "particles/spudow.png",
    "particles/fumeshroom_bubbles.png",
    // Ice-shroom art (all byte-identical from main.zip): the freeze cubes
    // (images/icetrap.png 66x30 FRONT + icetrap2.png 54x30 back, drawn at the
    // zombie's feet per Zombie::DrawIceTrap) + the detonation snowflakes
    // (particles/SnowFlakes.png, 3 cels of 20x20) + the thaw/death shards
    // (particles/IceTrapParticles.png, 4 shard cels — see ICE_SHARDS).
    "icetrap.png", "icetrap2.png",
    // Dancing-zombie spotlight (Zombie::DrawDancerReanim 5518-5562, main.zip
    // images/ byte-identical): the beam (spotlight.png 50x155, 4x over the
    // leader) + the floor glow (spotlight2.png 50x20, 4x under him), both
    // tinted by the age-cycled stop color.
    "spotlight.png", "spotlight2.png",
    "particles/SnowFlakes.png", "particles/IceTrapParticles.png",
    "particles/WallnutParticlesSmall.png", "particles/WallnutParticlesLarge.png",
    "particles/RockSmall.png", "particles/ZombieArm.png",
    "particles/MindControl.png",
    // Squash landing dust (PARTICLE_DUST_SQUASH, UpdateSquash 1603):
    // Dust_puffs.png, 3 cels of 32x27, main.zip particles/ byte-identical.
    "particles/Dust_puffs.png",
    // Zomboni ice sheet + sled + explosion art (all byte-identical main.zip
    // files): the sheet tiles (images/ice.png 150x72 + ice_cap.png 25x72,
    // Board::DrawIce) + the sled vehicle cels (Zombie_bobsled1-4.png +
    // inside, DrawBobsledReanim) + zam particle sheets (ZamboniSmoke 3x26x22,
    // IceTrail 32x32, IceSparkle 3x20x20, Zomboss 5x69x80, ExplosionCloud
    // already above). IceTrail.png ships for completeness (IceTrail.trail
    // decoded for the record) though no trail renderer ships in scope.
    "ice.png", "ice_cap.png",
    "particles/IceSparkle.png", "particles/IceTrail.png",
    "particles/ZamboniSmoke.png", "particles/Zomboss_particles.png",
    // Jack-in-the-box explosion art (PARTICLE_JACKEXPLODE, main.zip particles/
    // byte-identical): the spring (Sproing.png 200x200, single cel) + the arm
    // sprite (ZombieJackboxArm.png 40x41, the SetupReanimForLostArm standalone
    // debris for jack — every other type rides the posed composite).
    // Clouds/zomboss above.
    "particles/Sproing.png", "particles/ZombieJackboxArm.png", "particles/ZombieDiggerArm.png",
    "Zombie_bobsled1.png", "Zombie_bobsled2.png", "Zombie_bobsled3.png",
    "Zombie_bobsled4.png", "Zombie_bobsled_inside.png",
    // Retail per-type head-debris sprites (DropHead 3479-3523, all
    // byte-identical from main.zip particles/): each of these zombies drops
    // its OWN head art instead of the generic head.
    "particles/ZombieDancerHead.png", "particles/ZombieBackupDancerHead.png",
    "particles/ZombieBobsledHead.png", "particles/ZombieLadderHead.png",
    "particles/ZombieImpHead.png", "particles/ZombieFootballHead.png",
    "particles/ZombiePoleVaulterHead.png", "particles/ZombieDiggerHead.png",
    "particles/ZombieDolphinRiderHead.png", "particles/ZombieYetiHead.png",
    "particles/ZPAPERHead.png", "particles/ZombiePogoHead.png",
    "particles/ZombieBalloonHead.png",
    "particles/SnowPea_splats.png", "particles/SnowPea_particles.png",
    "particles/Star_splats.png", "particles/Star_particles.png",
    "particles/AwardRays1.png", "particles/AwardRays2.png", "particles/AwardGlow.png",
    "particles/Star40.png", "particles/AwardRays_star.png", "coinbank.png",
    "ProjectilePea.png", "ProjectileSnowPea.png", "ProjectileCactus.png", "Projectile_star.png", "ProjectileCabbage.png",
    "SeedPacket_Larger.png", "ZombiesWon.png", "options_menuback.png", "dirtbig.png", "dirtsmall.png", "waterparticle.png",
    "background1_gameover_interior_overlay.png", "background1_gameover_mask.png",
    // Game-over door art for every background (Board::DrawHouseDoorBottom/Top
    // 6772-6797): all byte-identical from main.zip images/ (night 2-1 in
    // scope; pool/fog/roof masks + interiors wired for completeness).
    "background2_gameover_interior_overlay.png", "background2_gameover_mask.png",
    "background3_gameover_interior_overlay.png", "background3_gameover_mask.png",
    "background4_gameover_interior_overlay.png", "background4_gameover_mask.png",
    "background5_gameover_mask.png", "background6_gameover_mask.png",
    // Pause + main-menu options art — the SOURCE look (decomp repo images/,
    // grey-stone tombstone + stone dialog/button/slider/checkbox pieces), NOT
    // the brown-wood main.zip restyle of the same asset IDs (user request).
    // Pause keeps its copies under pause/; the main-menu screen uses the root
    // IDs, which are now the same retail bytes (see the NewOptionsDialog port
    // in drawOptions), leaving only the user popup on the brown buttons.
    "pause/options_menuback.png",
    "pause/dialog_topleft.png", "pause/dialog_topmiddle.png", "pause/dialog_topright.png",
    "pause/dialog_centerleft.png", "pause/dialog_centermiddle.png", "pause/dialog_centerright.png",
    "pause/dialog_bottomleft.png", "pause/dialog_bottommiddle.png", "pause/dialog_bottomright.png",
    "pause/dialog_header.png",
    "pause/button_left.png", "pause/button_middle.png", "pause/button_right.png",
    "pause/button_down_left.png", "pause/button_down_middle.png", "pause/button_down_right.png",
    "pause/options_backtogamebutton0.png", "pause/options_backtogamebutton2.png",
    "pause/options_sliderslot.png", "pause/options_sliderknob2.png",
    "pause/options_checkbox0.png", "pause/options_checkbox1.png"]);
  // Bungee art (all byte-identical from main.zip images/): the cord strip
  // (BungeeCord.png 8x64, tiled up from the body track in the bungee pass),
  // the ground target (BungeeTarget.png 71x76), and the umbrella-block burst
  // (the compiled UmbrellaReflect.xml is a single basketball-art emitter, so
  // the port plays it through the shared splat renderer).
  await needImages(["BungeeCord.png", "BungeeTarget.png", "particles/Zombie_catapult_basketball.png"]);
  if (dave) await needImages(["Store_SpeechBubble2.png"]);
  // Pool water fx art (Board::DrawBackdrop 6057-6060 + Board::Update 5922):
  // the animated caustic web (pool_caustic_effect.jpg, PoolEffect.cpp) on
  // pool/fog stages + the sparkle glow (particles/PoolSparkly.png,
  // PoolSparkly.xml) on day-pool stages. Both byte-identical main.zip files.
  try {
    const pbg = backgroundForLevel(level);
    if (pbg === BG.POOL || pbg === BG.FOG) await needImages(["pool_caustic_effect.jpg"]);
    if (pbg === BG.POOL) await needImages(["particles/PoolSparkly.png"]);
    // Fog art (Board::DrawFog software path + plantern glow, byte-identical
    // main.zip images/particles/ files).
    if (pbg === BG.FOG) await needImages(["fog_software.png", "particles/LanternShine.png"]);
    // Vasebreaker art (GridItem::DrawScaryPot + ScaryPotterOpenPot fx, all
    // byte-identical main.zip files): the pot sheet (IMAGE_SCARY_POT,
    // cols=3 rows=2), the brown/green 27-frame break strips and the purple
    // chunk sheet (IMAGE_VASE_CHUNKS, cols=9 rows=3, zombie row 2).
    if (level === 35) await needImages(["Scary_pot.png", "plantshadow2.png", "particles/Vase_brown.png", "particles/Vase_green.png", "particles/vase_chunks.png"]);
    // Stormy-night rainfall tile (Challenge::DrawRain, IMAGE_RAIN 100x100,
    // byte-identical main.zip particles/Rain.png, copied under images/ for
    // the needImages loader).
    if (level === 40) await needImages(["particles/Rain.png"]);
  } catch (e) { /* headless */ }
}
async function startLevel(level) {
  const cur = SAVE.currentUser();
  const finished = cur?.finished ?? false;
  const packetUpgrade = cur?.packetUpgrade | 0 || 0;
  const adv = await import("./pvz/sim.js");
  // Conveyor levels (Board::InitLevel: !HasConveyorBeltSeedBank gates the
  // fixed bank AND the seed chooser): the board owns the sliding packets,
  // so the normal bank stays empty and no chooser is offered, first-time or
  // replay alike.
  const conv = hasConveyorBelt(level);
  const choose = !conv && chooseSeedsOnLevel(level, finished);
  // Whack-a-Zombie fixed bank (Board::InitLevel 1545-1551, adventure branch):
  // POTATOMINE/GRAVEBUSTER/CHERRYBOMB — never the generic SeedType 0..2 run.
  // Vasebreaker fixed bank (Board::InitLevel 1540-1544): 1 CHERRYBOMB packet.
  const bank = conv ? [] : level === 15 ? whackBank() : isVasebreaker(level) ? vaseBank() : choose ? G.chosen.slice() : Array.from({ length: adv.numSeedsInBank(level, finished, packetUpgrade) }, (_, i) => i);
  const waves = adv.pickAdventureWaves(level, Math.random, finished);
  const ztypes = new Set();
  for (const w of waves.waves) for (const t of w) ztypes.add(t);
  if (ztypes.has("garg")) ztypes.add("imp"); // garg throws an imp on death
  if (ztypes.has("dancer")) ztypes.add("backup"); // dancer summons backups
  // L5 Crazy Dave (CrazyDaveEnter/TalkMessage + SHOW_WALLNUT) + first-time
  // 2-1 (L11) night Dave intro (dialog 201, no handing) + first-time 3-1
  // (L21) pool Dave intro (dialog 501, no handing, 775-778) + L15 Whack-a-Zombie
  // (dialog 401 + SHOW_HAMMER handing — NOT first-time gated, 779-782) +
  // L25 Big Trouble Little Zombie (dialog 701, no handing — also NOT
  // first-time gated, 783-786) + pre-shop slot offers (L12 tease +
  // L13-24/L16-24 offers need his reanim,
  // bubble art and voice lines too).
  // Pre-shop seed-slot offers (CutScene 746-761): first-time Dave sells
  // extra slots directly at cash milestones before the shop unlocks —
  // L12 teases (1401), L13-24 offer 7 slots (1501) at 75 coins, L16-24
  // offer 8 slots (1551) at 500. Whack (15), the mini-boss conveyor
  // (20) and the pool intro (21) are excluded, exactly like source.
  // Profile coins/purchases live in SAVE (cutscene.js never touches it),
  // so eligibility is computed here (and gates the Dave preload below),
  // then rides into the cutscene on the ctor opts.
  let offerDave = -1;
  if (!finished) {
    const oCoins = SAVE.getCoins(), oUp = SAVE.getPacketUpgrade(), oDidnt = SAVE.getDidntPacket();
    if (level === 12) offerDave = 1401;
    else if (level >= 13 && level <= 24 && level !== 15 && level !== 20 && level !== 21 &&
      oUp === 0 && oCoins >= packetUpgradeCost(0) && oDidnt < 2) offerDave = 1501;
    else if (level >= 16 && level <= 24 && level !== 20 && level !== 21 &&
      oUp === 1 && oCoins >= packetUpgradeCost(1) && oDidnt < 2) offerDave = 1551;
  }
  // Custom 5-1 (L41) unfinished warning (user request): Dave talks 9001 on
  // EVERY adventure attempt of level 41 while GENERATORNOTFINISHED is true
  // (NOT first-time gated — the warning shows on replays too).
  const unfinishedDave = GENERATORNOTFINISHED && level === 41;
  const daveLvl = level === 5 || (level === 11 && !finished) || (level === 21 && !finished) || level === 15 || level === 25 || level === 35 || level === 40 || unfinishedDave || offerDave !== -1;
  // LawnApp::PreNewGame (402): starting fresh erases any stale save file —
  // a resumed-then-restarted or completed level must never resurrect. The old
  // board's looping storm rain (if any) stops first; the new board's ctor
  // restarts it on stormy levels (Challenge::InitLevel 348-353).
  try { stopFoleyLoop("rain"); } catch (e) { /* headless */ }
  SAVE.clearAdvSave();
  await preloadBoardAssets(level, bank, ztypes, daveLvl);
  const bd = new Board(level, libs, { finished, packetUpgrade, poolCleaner: SAVE.getPurchase(22) > 0, roofCleaner: SAVE.getPurchase(23) > 0, firstAid: SAVE.getPurchase(29) > 0, rake: SAVE.getPurchase(24) | 0 });
  // Garden rake (Board::PlaceRake 1629: the purchase ticks down at
  // placement). The cutscene places it save-free, so arm the hook that
  // persists the decrement (LawnApp::WriteCurrentUserConfig rides along).
  bd.onRakePlaced = (left) => { try { SAVE.setPurchase(24, left); } catch (e) { /* ignore */ } };
  // Vasebreaker has no waves (Challenge::ScaryPotter — zombies come from vases).
  if (bd.isVase) { bd.waves = []; bd.numWaves = 0; }
  else { bd.waves = waves.waves; bd.numWaves = waves.numWaves; }
  bd.playerName = cur?.name || "Player";
  bd.profileLevel = cur?.level ?? 1; // CanShowAlmanac/Store jitter branch (CutScene.cpp:153)
  G.board = bd;
  G.board.state = "cutscene";
  G.chooser = null; // fresh widget per level (LawnApp::ShowSeedChooserScreen) — stale banked picks must never slide in with the next panel
  G.bankSeeds = bank;
  G.selSeed = -1; G.selConvIdx = -1; G.selUsable = null; G.shovelMode = false;
  G.dave = null; // fresh intro: no Dave until the cutscene enter edge
  G.daveOffer = null; G.offerPress = null; // no slot-offer modal until Dave's 1503/1553 turn
  // Whack-a-Zombie hammer cursor (CursorObject ctor 25-33): the Hammer reanim
  // playing anim_whack_zombie held at 1.0; clicks restart it at 0.2 (see
  // whackAttackAt). Drawn at the translated cursor origin (mouse-50, mouse-19).
  G.hammerReanim = null;
  if (bd.isWhack) {
    try {
      const h = new Reanimation(DEFS.get("Hammer"), 0, 0);
      h.playReanim("anim_whack_zombie", PLAY_ONCE_AND_HOLD, 0, 24);
      h.animTime = 1.0;
      G.hammerReanim = h;
    } catch (e) { G.hammerReanim = null; }
  }
  G.readyReanim = null; G.finalReanim = null; G.wonReanim = null;
  G.sodRolls = null;
  G.coinsStart = 0;
  // CutScene::StartLevelIntro (CutScene.cpp:672): sod/mower/ready timings, street zombies, house msg.
  const cs = new CutScene(bd, { chooseSeeds: choose, ...(unfinishedDave && offerDave === -1 ? { daveDialogStart: 9001, crazyDaveTime: 2500 } : {}), ...(offerDave !== -1 ? { daveDialogStart: offerDave, crazyDaveTime: 2500 } : {}) });
  cs.onReadyPlant = (withReady) => {
    if (!withReady) return;
    try {
      // CutScene 1332: AddReanimation(400, 324, READYSETPLANT) with the
      // reanim's default full-timeline play — NOT a single "anim_idle" layer
      // (this def has no anim_* tracks; playing one falls back to track 0,
      // the Plant word, so only "PLANT!" ever showed). Full 22-frame timeline
      // @12fps: READY (f0-5) -> SET (f6-11) -> PLANT! (f12-21, held).
      G.readyReanim = new Reanimation(DEFS.get("StartReadySetPlant"), 400, 324);
      G.readyReanim.loopType = PLAY_ONCE_AND_HOLD;
      G.readyReanim.animRate = 12;
    } catch (e) { G.readyReanim = null; }
    playSfx("readyset");
  };
  cs.onSeedChooser = async () => {
    // CutScene::StartSeedChooser (input/focus only): the chooser STATE is
    // built at level start (like the widget ctor before the slide), so the
    // sliding panel shows the real grid + empty silhouettes — never stale
    // picks from a previous level. Art (re)ensured here; cached, so no-op
    // when startLevel already preloaded it ahead of the slide.
    const avail = G.chooser ? G.chooser.seeds.map((s) => s.seed) : [];
    await needDefs(avail.map((s) => PLANTS[s].reanim));
    for (const s of avail) stillFor(s);
  };
  G.cutscene = cs;
  if (choose) {
    // SeedChooserScreen ctor equivalent (LawnApp::ShowSeedChooserScreen runs
    // before StartLevelIntro): grid seeds IN_CHOOSER, empty bank, Dave
    // pre-picks — all in place BEFORE the slide-up starts, with art
    // preloading here so packets aren't blank plates when the panel lands.
    // Floated (not awaited): 40+ atlas fetches must not stall level entry;
    // plates fill in during the 2.5s slide, and onSeedChooser re-ensures.
    openChooser(level);
    const av = G.chooser ? G.chooser.seeds.map((s) => s.seed) : [];
    needDefs(av.map((s) => PLANTS[s].reanim)).catch(() => {});
    for (const s of av) { try { stillFor(s); } catch (e) { /* plate fallback */ } }
  }
  for (const s of bank) stillFor(s);
  // Vasebreaker usable seeds (pea/snow/hypno/squash) need stills for the
  // ghost/cursor-plant path even though they never sit in the bank.
  if (level === 35) for (const s of [0, 5, 12, 17]) stillFor(s);
  if (level === 5) {
    // Explode-o-nut ghost fallback: a red-tinted Wallnut still for the
    // no-def drawGhost path (packets use the baked PACKET41 icon instead).
    // Same multiply+(alpha-restore) tint as Board.getExplodeDef (255,64,64).
    // Bowling-only: seed 41 never appears on other conveyor belts.
    try {
      const base = await stillFor(3);
      if (base && !STILLS.get(41)) {
        const cv = document.createElement("canvas");
        cv.width = base.width; cv.height = base.height;
        const g2 = cv.getContext("2d");
        g2.drawImage(base, 0, 0);
        g2.globalCompositeOperation = "multiply"; // colorize: tint existing pixels
        g2.fillStyle = "rgb(255,64,64)";
        g2.fillRect(0, 0, cv.width, cv.height);
        g2.globalCompositeOperation = "destination-in"; // multiply fills clear pixels too — restore the alpha mask
        g2.drawImage(base, 0, 0);
        g2.globalCompositeOperation = "source-over";
        STILLS.set(41, cv);
      }
    } catch (e) { /* packet falls back to the blank plate */ }
  }
  // Tutorial states are set by the sim on the first play tick
  // (Board::UpdateGame mMainCounter==1), not here.
  G.handReanim = null; // selector (and its hand) dies with the screen flip
  G.screen = "cutscene";
  window.__pvz.screen = "cutscene";
  window.__pvz.board = G.board;
}

// LawnApp::TryLoadGame (446) + DoContinueDialog (710): Adventure entry with a
// live save for this profile rebuilds the board from the snapshot (LawnLoadGame
// sets SCENE_PLAYING directly — no cutscene, no chooser) and stacks the
// Continue dialog over it. Load failure falls back to a fresh start, like
// TryLoadGame returning false into NewGame.
async function resumeLevel(save) {
  const snap = save && save.snap;
  const adv = await import("./pvz/sim.js");
  const fellBack = async () => {
    SAVE.clearAdvSave();
    await startLevel(save && save.level ? save.level : 1);
  };
  if (!snap || typeof snap.level !== "number") { await fellBack(); return; }
  const bank = (snap.bank || []).slice();
  const ztypes = new Set();
  for (const w of snap.waves || []) for (const t of w) ztypes.add(t);
  if (ztypes.has("garg")) ztypes.add("imp");
  if (ztypes.has("dancer")) ztypes.add("backup");
  await preloadBoardAssets(snap.level, bank, ztypes, false);
  let bd;
  try {
    bd = new adv.Board(snap.level, libs, { finished: !!snap.finished, packetUpgrade: snap.packetUpgrade | 0, poolCleaner: SAVE.getPurchase(22) > 0, roofCleaner: SAVE.getPurchase(23) > 0, firstAid: SAVE.getPurchase(29) > 0, rake: SAVE.getPurchase(24) | 0 });
  } catch (e) { await fellBack(); return; }
  const cur = SAVE.currentUser();
  bd.playerName = cur?.name || "Player";
  bd.profileLevel = cur?.level ?? 1;
  if (!bd.loadSaveData(snap)) { await fellBack(); return; }
  G.board = bd;
  G.chooser = null; // resumed boards skip the chooser (SCENE_PLAYING, not LEVEL_INTRO)
  G.bankSeeds = bank; G.chosen = bank.slice();
  G.selSeed = -1; G.selConvIdx = -1; G.selUsable = null; G.shovelMode = false;
  G.dave = null; // Crazy Dave only ever appears in the intro
  // Whack-a-Zombie hammer cursor on resumed whack boards (same as startLevel).
  G.hammerReanim = null;
  if (bd.isWhack) {
    try {
      const h = new Reanimation(DEFS.get("Hammer"), 0, 0);
      h.playReanim("anim_whack_zombie", PLAY_ONCE_AND_HOLD, 0, 24);
      h.animTime = 1.0;
      G.hammerReanim = h;
    } catch (e) { G.hammerReanim = null; }
  }
  G.readyReanim = null; G.finalReanim = null; G.wonReanim = null;
  G.sodRolls = null;
  G.coinsStart = 0;
  G.handReanim = null; // selector (and its hand) dies with the screen flip
  G.screen = "board";
  window.__pvz.screen = "board";
  window.__pvz.board = bd;
  for (const s of bank) stillFor(s);
  // Vasebreaker usable seeds (see startLevel): stills for ghost/cursor.
  if (bd.isVase) for (const s of [0, 5, 12, 17]) stillFor(s);
  setMusicPaused(true); // TryLoadGame stops the music under the dialog
  G.pauseDlg = "continue";
}

// CutScene::LoadIntroBoard (CutScene.cpp:1843) + GAMEMODE_INTRO routing: the
// first-time adventure opens on a staged pool demo board (plants + zombies,
// pre-simulated 100 ticks, sounds muted) that plays the "PopCap Games
// Presents ... Plants vs Zombies" cinematic before the real L1 intro.
const INTRO_PLANTS = [
  [0,1,18],[0,2,16],[0,2,0],[0,3,16],[0,3,0],[0,4,1],
  [1,0,18],[1,1,1],[1,2,16],[1,2,1],[1,4,18],[1,5,18],
  [2,0,1],[2,1,0],[2,3,16],[2,3,0],[2,4,1],[2,5,1],
  [3,0,22],[3,4,18],[4,2,16],[4,2,22],
  [5,1,22],[5,4,22],[5,5,22],
  [6,0,21],[6,4,21],[7,1,21],
];
const INTRO_ZOMBIES = [
  ["normal",0,460],["football",0,680],["cone",0,730],["normal",0,810],
  ["cone",1,670],["normal",1,740],["normal",1,880],
  ["normal",2,500],["cone",2,680],
  ["bucket",3,604],["snorkel",3,880],
  ["normal",4,600],["bucket",4,690],["normal",4,780],
  ["catapult",5,730],["normal",5,590],
];
async function startIntro() {
  await needDefs(["ThreePeater", "Lilypad", "PeaShooterSingle", "SunFlower", "Torchwood", "Caltrop",
    "Zombie", "Zombie_football", "Zombie_snorkle", "Zombie_catapult", "splash",
    "Sun", "Coin_silver", "Coin_gold", "Diamond", "PoolCleaner", "LawnMower"]);
  await needImages(["background3.png", "ProjectilePea.png", "ProjectileSnowPea.png", "plantshadow.png", "PvZ_Logo.png"]);
  const cur = SAVE.currentUser();
  const finished = cur?.finished ?? false;
  const adv = await import("./pvz/sim.js");
  const bd = new adv.Board(21, libs, { finished, packetUpgrade: cur?.packetUpgrade | 0, poolCleaner: SAVE.getPurchase(22) > 0, roofCleaner: SAVE.getPurchase(23) > 0, firstAid: SAVE.getPurchase(29) > 0 }); // pool demo board
  bd.isIntro = true; // GAMEMODE_INTRO: staged demo, no wave spawns, no win trip
  bd.waves = []; bd.numWaves = 0; bd.currentWave = 0; // spawning disabled (updateSpawning early-returns)
  bd.zombieCd = 1000000000; bd.zombieCdStart = bd.zombieCd; // belt and suspenders
  bd.state = "play"; bd.sun = 9999; bd.muted = true; // user-override max (source clamps at 9990)
  bd.playerName = cur?.name || "Player";
  for (const [c, r, s] of INTRO_PLANTS) { bd.recharge[s] = 0; bd.plantAt(c, r, s); }
  for (const [t, r, x] of INTRO_ZOMBIES) bd.spawnZombie(t, r, 0, x);
  for (let i = 0; i < 100; i++) bd.update(); // mPreUpdatingBoard pre-roll
  G.board = bd;
  G.cutscene = new IntroCutScene(bd);
  G.bankSeeds = [];
  G.selSeed = -1; G.selConvIdx = -1; G.shovelMode = false;
  G.readyReanim = null; G.finalReanim = null; G.wonReanim = null;
  G.handReanim = null; // selector (and its hand) dies with the screen flip
  G.screen = "cutscene";
  window.__pvz.screen = "cutscene";
  window.__pvz.board = G.board;
}

function awardForLevel(level) { return awardSeedForLevel(level); } // SeedType index directly (source: AwardScreen DrawAwardSeed)

function finishLevel() {
  const b = G.board;
  const money = b.money;
  const cur = SAVE.currentUser();
  const nlevel = Math.min(50, b.level + 1);
  if (cur && b.level >= cur.level) { SAVE.completeLevel(b.level, money); }
  // The won level's mid-game save is spent (PreNewGame erases before the next
  // NewGame, LawnApp 414-416) — it must never offer a resume of a beaten level.
  SAVE.clearAdvSave();
  // Board teardown stops the looping storm rain (Board dtor StopFoley(FOLEY_RAIN),
  // Board.cpp 250) — silence under the award screen.
  try { stopFoleyLoop("rain"); } catch (e) { /* headless */ }
  G.awardSeed = b.level >= 50 ? -1 : awardForLevel(b.level);
  G.awardT = 180; // AwardScreen::mFadeInCounter (ctor)
}

// ---------- input ----------
function toGame(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
}
canvas.addEventListener("mousemove", (e) => {
  G.mouse = toGame(e);
  // Slider drag (Slider::MouseDrag 139-161): thumb rides the cursor while held.
  // Shared by the pause options dialog and the main-menu options screen
  // (same widget geometry modulo the from-selector y offsets, armed below).
  if ((G.sliderDrag && G.pauseDlg === "options") || (G.sliderDrag && G.screen === "options")) {
    const d = G.sliderDrag;
    const w = PAUSE_SLIDER_W - PAUSE_KNOB_W; // widget travel (mWidth - thumb)
    const v = Math.max(0, Math.min(1, (G.mouse.x - d.originX - d.relX) / w));
    if (v !== d.value) { d.value = v; applyPauseSlider(d.id, v); }
  }
});
canvas.addEventListener("mousedown", (e) => {
  // Retail bank widgets act on press (SeedPacket::MouseDown), not release:
  // the belt slides ~25px/s, so a press-aimed packet has moved by mouseup
  // and release-tested clicks intermittently miss. Pick up on press; a
  // gesture whose press hit the bank is a bank gesture whose release can
  // never plant (no drag-to-plant: one click picks up, a second plants).
  if (e.button !== 0) return;
  const p = toGame(e);
  // Game-over dialog is modal (WidgetManager): the press arms widget
  // tracking (press/release match) — never board input. Swallowed even on
  // empty space, like the dialog swallowing clicks outside its buttons.
  if (gameoverActive()) {
    G.pressBankKey = null;
    G.overPress = gameoverWidgetAt(p);
    return;
  }
  // Pause dialogs are modal (WidgetManager): the press starts widget
  // tracking (press/release match) or a slider drag — never board input.
  if (G.pauseDlg) {
    G.pressBankKey = null;
    // pauseWidgetAt arms a slider drag when the press lands on a thumb
    // ("d"+id) and returns "s"+id for a bar jump, button/checkbox keys else.
    G.pausePress = pauseWidgetAt(p, true);
    if (G.pausePress && G.pausePress[0] === "s") {
      // Bar click (Slider::MouseDown 91-96): jump to the click, no drag.
      const id = G.pausePress.slice(1);
      const r = pauseSliderRect(id);
      const v = Math.max(0, Math.min(1, (p.x - r.x) / PAUSE_SLIDER_W));
      applyPauseSlider(id, v);
      playSfx("click"); // SliderVal with !mDragging clicks (NewOptionsDialog 203-208)
    }
    return;
  }
  // Main-menu options screen: same modal Slider + press/release-match widget
  // tracking as the pause options dialog (WidgetManager), never menu input.
  if (G.screen === "options") {
    G.pressBankKey = null;
    // optWidgetAt arms a slider drag on a thumb ("d"+id) and returns "s"+id
    // for a bar jump, checkbox/button keys else.
    G.optPress = optWidgetAt(p, true);
    if (G.optPress && G.optPress[0] === "s") {
      // Bar click (Slider::MouseDown 91-96): jump to the click, no drag.
      // SliderVal with !mDragging (NewOptionsDialog 203-208) clicks only on
      // the sfx slider — the music slider jumps silently.
      const id = G.optPress.slice(1);
      const r = optSliderRect(id);
      const v = Math.max(0, Math.min(1, (p.x - r.x) / PAUSE_SLIDER_W));
      applyPauseSlider(id, v);
      if (id === "sfx") playSfx("click");
    }
    return;
  }
  if (G.screen === "cutscene" && G.daveOffer) {
    // Offer modal is press/release-matched (WidgetManager): arm the
    // widget here, activate on the matching release in handleCutsceneClick.
    G.offerPress = daveOfferWidgetAt(p);
    return;
  }
  if (G.screen !== "board") { G.pressBankKey = null; G.pressIsBot = false; return; }  // Bot hands (src/bot.js tags its synthetic events): a bot press landing
  // on a collectible sun/coin claims nothing — the release collects the
  // coin, and a packet underneath takes a second click. Human presses keep
  // the retail order (packet wins the press). Read once per press; the
  // release path is identical for both.
  G.pressIsBot = !!e.botHands;
  G.pressBankKey = bankPressAt(p);
  // Armed tool press off the bank = Board::MouseDown tool dispatch
  // (Board.cpp:4560: the cursor-type branch runs before packets/plants, so
  // a shovel-armed press digs wherever it lands and never picks up). A BOT
  // press on a collectible coin is the one exception (MouseDown 4543 coin
  // branch runs before the tool branch): the release collects it, no dig,
  // no disarm. Human presses keep the old behavior.
  if (!G.pressBankKey && G.shovelMode && !(G.pressIsBot && coinAt(G.board, p))) {
    const b = G.board;
    // Vasebreaker Dave gate (Challenge::MouseDown 1261-1265 + MouseHitTest
    // 4229): no tool dispatch while Dave is up mid-level.
    if (b && b.state === "play" && !b.paused && !G.pauseDlg && b.fadeOut < 0 && !daveUp()) {
      if (!b.digAt(p.x, p.y)) playSfx("drop"); // ToolHitTest miss: FOLEY_DROP (4121)
      clearSeedCursor(); // ClearCursor: disarm either way
    }
  }
});
canvas.addEventListener("mouseup", (e) => {
  if (e.button !== 0) return;
  // Slider release (Slider::MouseUp 163-168): silent after a drag (mDragging
  // stays set, so no click); bar clicks already clicked on press.
  if (G.sliderDrag) G.sliderDrag = null;
});
canvas.addEventListener("mouseleave", () => { if (G.sliderDrag) G.sliderDrag = null; });
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (G.pauseDlg) return;
  // Right-click disarm = the theClickCount<0 paths (MouseDownWithTool
  // 4100-4103 for an armed tool, MouseDownWithPlant 3689-3693 for a held
  // seed): ClearCursor + FOLEY_DROP. Escape is silent in source
  // (Board::KeyDown -> RefreshSeedPacketFromCursor, no sound), so the
  // Escape path in clearSeedCursor stays quiet.
  if (G.selSeed >= 0 || G.selConvIdx >= 0 || G.selUsable || G.shovelMode) playSfx("drop");
  clearSeedCursor();
});
canvas.addEventListener("click", async (e) => {
  const p = toGame(e);
  // Dialog buttons click with the grave foley (LawnDialog::ButtonPress), not
  // the generic UI click — so the global click stays quiet under a dialog.
  // Cutscene clicks carry their own sounds (Dave voices, shovel/dig foley,
  // chooser TAP/GRAVEBUTTON/BUZZER) — retail has no universal click there.
  // Almanac clicks carry their own TAP/GRAVEBUTTON too (AlmanacDialog::
  // MouseDown), so the global click stays quiet there as well. The options
  // screen is a NewOptionsDialog as well (ButtonPress = GRAVEBUTTON).
  if (!G.pauseDlg && !gameoverActive() && G.screen !== "cutscene" && G.screen !== "almanac" && G.screen !== "options" && G.screen !== "store") playSfx("buttonclick");
  // Title is a loading screen (TitleScreen.cpp): clicks do nothing — the bar
  // fills from real loader progress and auto-advances (LoadingCompleted).
  if (G.screen === "title") { return; }
  // Game-over dialog (modal past b.ended): TRY AGAIN retries the level
  // (EndLevel), MAIN MENU leaves; anything else is swallowed by the modal
  // (press/release match like every other dialog).
  if (gameoverActive() && G.screen === "board") {
    const k = gameoverWidgetAt(p);
    if (k && k === G.overPress) activateGameover(k);
    G.overPress = null;
    return;
  }
  if (G.pauseDlg && (G.screen === "board" || G.screen === "cutscene")) {
    // Widget press/release match (WidgetManager): only a release on the same
    // widget that took the press activates it — a drag ending elsewhere is
    // swallowed. Sliders already applied on press/drag; the release is a no-op.
    const k = pauseWidgetAt(p);
    if (k && k === G.pausePress) activatePauseWidget(k, p);
    G.pausePress = null;
    return;
  }
  G.pausePress = null;
  if (G.screen === "menu") { handleMenuClick(p); return; }
  if (G.screen === "help") { handleModalClick(p); return; }
  if (G.screen === "options") {
    // Widget press/release match (WidgetManager): only a release on the same
    // widget that took the press activates it. Sliders already applied on
    // press/drag; the release is a no-op for them.
    const k = optWidgetAt(p);
    if (k && k === G.optPress) activateOptionsWidget(k);
    G.optPress = null;
    return;
  }
  if (G.screen === "almanac") { handleAlmanacClick(p); return; }
  if (G.screen === "store") { handleStoreClick(p); return; }
  if (G.screen === "cutscene") { handleCutsceneClick(p); return; }
  if (G.screen === "board") {
    // Retail press/release match (WidgetManager): a gesture whose press
    // began on a bank widget is a bank gesture — one click picks up, a
    // SECOND click on the lawn plants. It must never fall through to lawn
    // planting (no drag-to-plant). Coins and the menu button still work on
    // release; bank re-pickup and lawn actions are consumed.
    if (G.pressBankKey) {
      const k = G.pressBankKey; G.pressBankKey = null;
      const bb = G.board;
      if (k && bb) {
        const t = bankTargetAt(bb, p);
        if (t === k) return;
        handleBoardClick(p, { bankGesture: true, isBot: !!e.botHands }); return;
      }
    }
    handleBoardClick(p, { isBot: !!e.botHands }); return; }
  if (G.screen === "award") { handleAwardClick(p); return; }
});
window.addEventListener("keydown", (e) => {
  // Bot player (src/bot.js): holding B and clicking the Adventure tombstone
  // starts/stops the hands-free player. Tracked here so the menu click can
  // see it through G (the key itself has no game binding).
  if (e.key === "b" || e.key === "B") G.botKey = true;
  // AwardScreen::KeyChar (350): space/return/escape presses the start button.
  // The help screen is AWARD_HELP_ZOMBIENOTE, so the same keys take its
  // MAIN MENU button back to the selector (StartButtonPressed 368-371).
  if (G.screen === "help" && (e.key === " " || e.key === "Enter" || e.key === "Escape")) {
    e.preventDefault();
    enterMenu();
    return;
  }
  if (G.screen === "award" && (e.key === " " || e.key === "Enter" || e.key === "Escape")) {
    e.preventDefault();
    startLevel(Math.min(50, awardProfile()));
    return;
  }
  // NewOptionsDialog::KeyDown (271-287): space/return confirms (ID_OK),
  // escape cancels (ID_CANCEL) — both just close the dialog to the selector.
  if (G.screen === "options" && (e.key === " " || e.key === "Enter" || e.key === "Escape")) {
    e.preventDefault();
    enterMenu();
    return;
  }
  // AlmanacDialog::KeyDown (LawnDialog cancel): Escape closes the dialog.
  if (G.screen === "almanac" && (e.key === "Escape" || e.key === "n" || e.key === "N")) {
    e.preventDefault();
    closeAlmanac();
    return;
  }
  // Pause keys. Board::KeyDown (7844-7881): Space (with CanPauseNow) opens
  // the GAME PAUSED dialog; Escape with a held cursor reverts it first
  // (RefreshSeedPacketFromCursor), else opens the options menu. Dialog keys
  // follow LawnDialog::KeyDown (207-225) + NewOptionsDialog::KeyDown
  // (272-287): Space/Return/Y confirm, Escape cancels (the single-button
  // PAUSED dialog has no No button, so Escape does nothing there).
  if (G.screen === "board" && G.board) {
    const k = e.key;
    const board = G.board;
    // GameOverDialog keys (LawnDialog::KeyDown 207-225): Space/Return/Y
    // presses the footer button (ID_YES -> EndLevel = retry); there is no
    // No button, so Escape/N is swallowed (single-button dialog, like
    // the PAUSED case below).
    if (gameoverActive()) {
      if (k === " " || k === "Enter" || k === "y" || k === "Y") {
        e.preventDefault();
        doPauseRestart();
      } else if (k === "Escape" || k === "n" || k === "N") {
        e.preventDefault();
      }
      return;
    }
    if (G.pauseDlg) {
      if (k === " " || k === "Enter" || k === "y" || k === "Y") {
        e.preventDefault();
        if (G.pauseDlg === "confirmRestart") doPauseRestart();
        else if (G.pauseDlg === "confirmLeave") doPauseLeave();
        else if (G.pauseDlg === "continue") activatePauseWidget("cont");
        else closePauseTop(); // "options" OK + "paused" resume (ID_YES/FOOTER)
      } else if (k === "Escape" || k === "n" || k === "N") {
        // Esc on the continue dialog (no Cancel button per user request):
        // back to the menu with the save kept — NOT the options menu.
        if (G.pauseDlg === "continue") { e.preventDefault(); doContinueCancel(); }
        else if (G.pauseDlg === "options" || G.pauseDlg === "confirmRestart" || G.pauseDlg === "confirmLeave") {
          e.preventDefault();
          closePauseTop(); // options cancel + confirm No (mLawnNoButton path)
        } else {
          e.preventDefault(); // PAUSED dialog: no No button — swallowed
        }
      }
      return;
    }
    if ((k === " " || k === "Enter") && board.state === "play" && !board.ended && board.fadeOut < 0 && !isDaveTalking()) {
      e.preventDefault();
      openPausedDialog(); // CanPauseNow: no dialogs open on a live board
      return;
    }
    // Vasebreaker Dave gate (Board::KeyDown 7856): space/return advances the
    // dialogue while Dave is up mid-level.
    if ((k === " " || k === "Enter") && isDaveTalking() && board.state === "play" && !board.ended) {
      e.preventDefault();
      advanceDaveDialog();
      return;
    }
    if (k === "Escape" && board.state === "play" && !board.ended && board.fadeOut < 0) {
      e.preventDefault();
      if (G.selSeed >= 0 || G.selConvIdx >= 0 || G.selUsable || G.shovelMode) clearSeedCursor();
      else openPauseOptions();
      return;
    }
  }
  // Store keys (StoreScreen::KeyChar 852-856 + LawnDialog::KeyDown 207-225):
  // space/return advances click-to-continue; open Yes/No modals confirm on
  // Y (space/return) and cancel on N/Escape; OK modals close on anything.
  if (G.screen === "store" && G.store) {
    const s = G.store;
    if (s.modal) {
      const k = s.modal.kind;
      if (e.key === "y" || e.key === "Y" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        storeActivateModal(k === "ok" ? "ok" : "yes");
      } else if (e.key === "n" || e.key === "N" || e.key === "Escape") {
        e.preventDefault();
        storeActivateModal(k === "ok" ? "ok" : "no");
      }
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      storeAdvance();
    }
    return;
  }
  // Slot-offer modal keys (LawnDialog::KeyDown 207-225: the BUTTONS_YES_NO
  // dialog confirms on Y, cancels on N/Escape).
  if (G.screen === "cutscene" && G.daveOffer) {
    if (e.key === "y" || e.key === "Y") { e.preventDefault(); activateDaveOffer("yes"); }
    else if (e.key === "n" || e.key === "N" || e.key === "Escape") { e.preventDefault(); activateDaveOffer("no"); }
    return;
  }
  // NewUserDialog name entry (UserDialog create/rename popups): alnum + space
  // (AllowChar), max 12 chars (mMaxChars), Enter confirms, Esc cancels.
  if (G.screen === "menu" && (G.userPopup === "create" || G.userPopup === "rename")) {
    if (e.key === "Enter") { commitPopupName(); }
    else if (e.key === "Escape") {
      if (G.userPopup === "rename") openListPopup();
      else if (SAVE.listUsers().length) closeUserPopup();
    }
    else if (e.key === "Backspace") { G.nameEdit = G.nameEdit.slice(0, -1); G.popupErr = null; }
    else if (e.key.length === 1 && G.nameEdit.length < 12 && /[a-zA-Z0-9 ]/.test(e.key)) { G.nameEdit += e.key; G.popupErr = null; }
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.key === "b" || e.key === "B") G.botKey = false;
});

function levelLabel(lv) {
  const stage = Math.floor((lv - 1) / 10) + 1, sub = lv - (stage - 1) * 10;
  return `${stage}-${sub}`;
}

// Source: centered LawnDialog over the selector (no separate screen). List =
// current profile selected first, then the other profiles, then a CREATE row
// while <8 users (UserDialog ctor). Click selects, double-click confirms
// (ListClicked: double-click = FinishUserDialog(true)); OK/Cancel footer;
// RENAME + DELETE above the footer; CREATE row opens NewUserDialog (name
// entry, OK/CANCEL, alnum+space, max 12 chars).
function userRows() {
  const users = SAVE.listUsers();
  const cur = SAVE.currentIndex();
  const rows = [];
  if (users[cur]) rows.push({ userIdx: cur, label: users[cur].name });
  users.forEach((u, i) => { if (i !== cur) rows.push({ userIdx: i, label: u.name }); });
  return { rows, canCreate: users.length < 8 };
}
function openListPopup() {
  // LawnApp::DoUserDialog: kill + re-center each time it opens.
  const { rows, canCreate } = userRows();
  G.userPopup = "list";
  G.userRows = rows; G.userCreate = canCreate;
  G.userSel = 0; // current profile preselected (SetSelect on the first line)
  G.nameEdit = ""; G.popupErr = null; G.userLast = null;
}
function openCreatePopup() {
  // LawnApp::DoCreateUserDialog — NewUserDialog(this, false).
  G.userPopup = "create";
  G.nameEdit = ""; G.popupErr = null;
}
function openRenamePopup() {
  // LawnApp::DoRenameUserDialog — NewUserDialog(this, true), prefilled.
  const row = G.userRows[G.userSel];
  if (!row) return;
  G.userPopup = "rename";
  G.renameIdx = row.userIdx;
  G.nameEdit = row.label; G.popupErr = null;
}
function closeUserPopup() {
  G.userPopup = null; G.nameEdit = ""; G.popupErr = null;
}
// NewUserDialog::GetName — collapse runs of spaces, trim one trailing space.
function collapseName(s) {
  let out = "";
  for (const ch of String(s)) {
    if (ch !== " " || out[out.length - 1] !== " ") out += ch;
  }
  return out.endsWith(" ") ? out.slice(0, -1) : out;
}
function commitPopupName() {
  // LawnApp::FinishCreateUserDialog / rename path.
  const name = collapseName(G.nameEdit);
  const users = SAVE.listUsers();
  if (!name) { G.popupErr = "Please enter your name."; playSfx("buzzer"); return; }
  if (G.userPopup === "create") {
    if (users.some((u) => u.name.toLowerCase() === name.toLowerCase())) {
      G.popupErr = "That name is already in use."; playSfx("buzzer"); return; // NAME_CONFLICT
    }
    playSfx("buttonclick");
    SAVE.createUser(name); // mPlayerInfo = new profile, like AddProfile
    syncMenuVariant(); // SyncProfile(true): fresh variant, level numbers, name
    closeUserPopup();
  } else if (G.userPopup === "rename") {
    if (users.some((u, i) => i !== G.renameIdx && u.name.toLowerCase() === name.toLowerCase())) {
      G.popupErr = "That name is already in use."; playSfx("buzzer"); return;
    }
    playSfx("buttonclick");
    SAVE.renameUser(G.renameIdx, name);
    const { rows, canCreate } = userRows();
    G.userRows = rows; G.userCreate = canCreate;
    G.userSel = Math.max(0, rows.findIndex((r) => r.userIdx === G.renameIdx));
    G.userPopup = "list";
    G.popupErr = null;
  }
}
function confirmUserRow() {
  // LawnApp::FinishUserDialog(true) — select profile + SyncProfile(true).
  const total = G.userRows.length + (G.userCreate ? 1 : 0);
  if (G.userSel < 0 || G.userSel >= total) return;
  if (G.userSel === G.userRows.length && G.userCreate) { openCreatePopup(); return; }
  const row = G.userRows[G.userSel];
  if (!row) return;
  playSfx("buttonclick");
  SAVE.selectUser(row.userIdx);
  syncMenuVariant();
  closeUserPopup();
}
function userPopupGeom() {
  const n = G.userRows.length + (G.userCreate ? 1 : 0);
  const w = 340, rowH = 28;
  const h = 118 + n * rowH + 52 + 62;
  const x = (800 - w) / 2, y = Math.max(20, (600 - h) / 2);
  const listY = y + 78;
  const btnY = listY + n * rowH + 12;
  const footY = btnY + 52;
  return {
    x, y, w, h, rowH, listY,
    row: (i) => ({ x: x + 40, y: listY + i * rowH, w: w - 80, h: rowH }),
    rename: { x: x + 40, y: btnY, w: (w - 100) / 2, h: 42 },
    del: { x: x + 60 + (w - 100) / 2, y: btnY, w: (w - 100) / 2, h: 42 },
    ok: { x: x + 40, y: footY, w: (w - 100) / 2, h: 44 },
    cancel: { x: x + 60 + (w - 100) / 2, y: footY, w: (w - 100) / 2, h: 44 },
    // name-entry popup (NewUserDialog): own smaller centered panel. Zero
    // profiles (first run) gets a centered solo OK (see namePopupSoloOk).
    name: { x: 220, y: 175, w: 360, h: 250, box: { x: 250, y: 285, w: 300, h: 34 }, ok: namePopupSoloOk() ? { x: 330, y: 340, w: 140, h: 44 } : { x: 250, y: 340, w: 140, h: 44 }, cancel: { x: 410, y: 340, w: 140, h: 44 } },
  };
}
// USER OVERRIDE (not retail — retail shows OK+CANCEL and error-loops when a
// zero-profile create is cancelled): with no profiles at all, the initial
// name dialog offers OK only; there is nothing to cancel back to.
function namePopupSoloOk() { return G.userPopup === "create" && SAVE.listUsers().length === 0; }
function handleUserPopupClick(p) {
  const g = userPopupGeom();
  const inR = (r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
  if (G.userPopup === "create" || G.userPopup === "rename") {
    if (inR(g.name.ok)) { commitPopupName(); return; }
    if (!namePopupSoloOk() && inR(g.name.cancel)) {
      playSfx("buttonclick");
      if (G.userPopup === "rename") openListPopup();
      // First-run create has no list to go back to (mPlayerInfo==nullptr) —
      // source keeps the dialog up, so Cancel just clears the field.
      else if (SAVE.listUsers().length) closeUserPopup();
      else G.nameEdit = "";
      return;
    }
    return; // modal: clicks outside the panel are swallowed (WidgetManager)
  }
  // list popup rows (UserDialog::ListClicked): click selects, double-click
  // confirms, CREATE row opens the name dialog.
  const n = G.userRows.length + (G.userCreate ? 1 : 0);
  for (let i = 0; i < n; i++) {
    if (inR(g.row(i))) {
      const now = performance.now();
      if (G.userLast && G.userLast.row === i && now - G.userLast.t < 450 && G.userSel === i) {
        G.userSel = i; confirmUserRow(); return;
      }
      G.userSel = i; G.userLast = { row: i, t: now };
      playSfx("buttonclick");
      if (i === G.userRows.length && G.userCreate) { openCreatePopup(); return; }
      return;
    }
  }
  const row = G.userRows[G.userSel];
  if (inR(g.rename) && row) { playSfx("buttonclick"); openRenamePopup(); return; }
  if (inR(g.del) && row) {
    if (SAVE.listUsers().length <= 1) { G.popupErr = "Keep at least one profile."; playSfx("buzzer"); return; }
    playSfx("buttonclick");
    SAVE.deleteUser(row.userIdx);
    syncMenuVariant();
    const r2 = userRows();
    G.userRows = r2.rows; G.userCreate = r2.canCreate;
    G.userSel = Math.min(G.userSel, G.userRows.length - 1);
    return;
  }
  if (inR(g.ok)) { confirmUserRow(); return; }
  if (inR(g.cancel)) { playSfx("buttonclick"); closeUserPopup(); return; }
  // modal: clicks outside the panel are swallowed (WidgetManager)
}

function handleMenuClick(p) {
  // Modal user dialog (WidgetManager modal focus): it eats all menu clicks.
  if (G.userPopup) { handleUserPopupClick(p); return; }
  // GameSelector::MouseDown 1047-1061 — foreground flowers pop when clicked
  // (within 20px of their centers). Not a button: works even while the hand
  // rises (only ButtonDepress paths lock during mStartingGame).
  for (let i = 0; i < G.menuFlowers.length; i++) {
    const fr = G.menuFlowers[i];
    if (fr.animRate <= 0 && Math.hypot(p.x - FLOWER_CENTERS[i][0], p.y - FLOWER_CENTERS[i][1]) < 20) {
      fr.animRate = 24;
      playSfx("limbsPop"); // FOLEY_LIMBS_POP
      return;
    }
  }
  if (G.menuStarting) return; // AdventureButtonClicked: all buttons disabled
  if (G.menuPhase === "open") return; // SELECTOR_OPEN: buttons visible but mouse-invisible (flowers above still pop)
  const R = menuRects();
  const inR = (r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
  const cur = SAVE.currentUser();
  const lv = Math.min(50, cur?.level ?? 1);
  const lockedTip = () => {
    playSfx("buzzer");
    G.msg = "Play more Adventure to unlock this!";
    setTimeout(() => { G.msg = null; }, 1500);
  };
  const soonMsg = (t) => {
    playSfx("buttonclick");
    G.msg = t;
    setTimeout(() => { G.msg = null; }, 1500);
  };
  if (inR(R.adv)) {
    playSfx("buttonclick");
    if (G.botKey) { toggleBotPlay(); return; } // B held: bot takes the game
    startMenuAdventure();
    return;
  }
  for (const s of R.locked) if (inR(s)) { lockedTip(); return; }
  // SyncButtons: Almanac/Store/Zen buttons are mVisible=false until their
  // CanShow* unlock — hidden buttons take no clicks at all.
  if (R.zen && inR(R.zen)) { soonMsg("The Zen Garden is still growing."); return; }
  if (R.almanac && inR(R.almanac)) { enterAlmanac(); return; }
  if (R.store && inR(R.store)) { playSfx("buttonclick"); openStore({}).catch(() => {}); return; }
  if (inR(R.options)) { enterOptions(); return; }
  if (inR(R.help)) {
    // GameSelector_Help (1173-1174): the help paper note (AwardScreen ctor
    // 152-157: paper notes stop the music + play FOLEY_PAPER on show).
    G.screen = "help"; window.__pvz.screen = "help"; G.helpT = 180;
    stopMusic(); playSfx("paper");
    return;
  }
  // USER OVERRIDE (not retail): quit just plays the pole-vaulter boing and
  // stays on the menu (2026-11-04).
  if (inR(R.quit)) { playSfx("polevault"); return; }
  if (inR(R.change)) { openListPopup(); return; } // GameSelector_ChangeUser -> DoUserDialog
}
// GameSelector::AdventureButtonClicked (GameSelector.cpp:1070-1125): stop the
// music, lock all buttons, and raise the zombie hand (REANIM_ZOMBIE_HAND at
// (-70,10), PLAY_ONCE_AND_HOLD @30fps, FOLEY_DIRT_RISE). The hand art comes
// from the repo's reanim parts + Zombie_hand.reanim XML (not retail renders).
// Bot player handoff (src/bot.js): B+Adventure toggles the hands-free player.
// On start the normal Adventure sequence begins too, so the bot has a game
// to take over; on stop the live game is left alone. Dynamic import keeps
// the bot out of the startup path (and bot.js never imports main.js, no cycle).
async function toggleBotPlay() {
  try {
    const m = await import("./bot.js");
    const res = m.toggleBot();
    G.msg = res === "started" ? "Bot playing (B+Adventure to stop)" : "Bot stopped";
    setTimeout(() => { if (G.msg && G.msg.startsWith("Bot ")) G.msg = null; }, 2200);
    if (res === "started" && G.screen === "menu" && !G.menuStarting && !G.userPopup) startMenuAdventure();
  } catch (e) { playSfx("buzzer"); }
}
async function startMenuAdventure() {  if (G.menuStarting) return;
  G.menuStarting = 1;
  stopMusic(); // LawnApp::StopAllMusic (ClickedAdventure 1103)
  playSfx("lose"); // SOUND_LOSEMUSIC stinger (ClickedAdventure 1104)
  try {
    const def = await getReanim("Zombie_hand");
    const h = new Reanimation(def, -70, 10);
    h.loopType = PLAY_ONCE_AND_HOLD;
    // rock tracks ignore the (0,0,800,560) clip (mIgnoreClipRect) — draw them
    // as a separate unclipped group (renderGroup 1).
    h.assignRenderGroupToPrefix("rock", 1);
    G.handReanim = h;
  } catch (e) { G.handReanim = null; }
  playSfx("dirtRise"); // FOLEY_DIRT_RISE
}
function menuStartingDone() {
  // GameSelector::Update mStartingGame (696-734): the button flashes purple for
  // 450 ticks (evillaugh at 125), then the selector dies into the new game.
  const n = G.menuStarting;
  G.menuStarting = 0;
  // The hand stays up until the new screen takes over (source KillGameSelector
  // + PreNewGame are simultaneous): startLevel/startIntro clear it when they
  // flip G.screen, so no handless menu frame ever draws.
  const cur = SAVE.currentUser();
  const lv = Math.min(50, cur?.level ?? 1);
  // GameSelector 708: first-time L1 with no save goes through GAMEMODE_INTRO
  // (the "PopCap Games Presents" demo) instead of straight to the level.
  // GameSelector::Update (713-720): while mNeedsMagicTacoReward is set,
  // entering adventure level 35 plays the store 601 taco intro first, then
  // PreNewGame ADVENTURE (the save resume runs inside that fresh game).
  if (SAVE.getNeedsMagicTaco() && lv === 35) {
    openStore({
      intro: 601, backLabel: "NEXT LEVEL",
      after: async () => {
        const sv2 = SAVE.getAdvSave();
        if (sv2) await resumeLevel(sv2);
        else await startLevel(35);
      },
    }).catch(() => {});
    return n;
  }
  // LawnApp::PreNewGame(ADVENTURE, lookForSavedGame=true) (727) + TryLoadGame
  // (446): a live save for this profile resumes behind the Continue dialog
  // instead of starting fresh.
  const sv = SAVE.getAdvSave();
  if (sv) { resumeLevel(sv); return n; }
  if (lv === 1 && !cur?.finished) { startIntro(); return n; }
  const choose = chooseSeedsOnLevel(lv, cur?.finished ?? false);
  if (!choose) startLevel(lv);
  else enterChooser(lv);
  return n;
}

function handleModalClick(p) {
  if (G.screen === "help") {
    // Help = AWARD_HELP_ZOMBIENOTE (AwardScreen 121-126): the start button
    // reads MAIN MENU at the paper-note (324,520,156,42); the menu button is
    // hidden. Tap sound like the award screen's buttons.
    const sr = { x: 324, y: 520, w: 156, h: 42 };
    if (p.x > sr.x && p.x < sr.x + sr.w && p.y > sr.y && p.y < sr.y + sr.h) {
      playSfx("tap");
      enterMenu();
    }
    return;
  }
  // (options is its own press/release-matched NewOptionsDialog now —
  // see optWidgetAt/activateOptionsWidget — never routed here).
}

async function enterMenu() {
  await needMenuImages();
  await needImages(["background1.png", "SelectorScreen_LevelNumbers.png", "Sunflower_trophy.png"]);
  const o = SAVE.getOptions();
  G.optMusic = o.music; G.optSfx = o.sfx;
  setMusicVolume(o.music); setSfxVolume(o.sfx);
  // GameSelector::GameSelector — the real SelectorScreen reanim is the menu
  // backdrop (BG + shadows + woodsigns). It plays anim_open @30fps, then the
  // sign tracks hand over to the buttons (Update SELECTOR_OPEN).
  try {
    const def = await getReanim("SelectorScreen");
    const r = new Reanimation(def, 0.5, 0.5);
    r.assignRenderGroupToPrefix("flower", RENDER_GROUP_HIDDEN);
    r.assignRenderGroupToPrefix("leaf", RENDER_GROUP_HIDDEN);
    // The bottom woodsign plank paints over the middle one where they overlap;
    // tuck it behind (same positions — render order only).
    r.sendTrackBefore("woodsign3", "woodsign2");
    // GameSelector::Draw 488-493 — the BG composite draws before the clouds.
    r.assignRenderGroupToTrack("SelectorScreen_BG", 1);
    // GameSelector ctor 244-276 — ambient life: 6 cloud sweeps (Update 814-828),
    // 3 click-pop flowers attached to BG_Right, 1 grass-rustle driver.
    G.menuClouds = []; G.menuCloudCtr = [];
    const cloudAnims = ["anim_cloud1", "anim_cloud2", "anim_cloud4", "anim_cloud5", "anim_cloud6", "anim_cloud7"];
    for (let i = 0; i < 6; i++) {
      const cr = new Reanimation(def, 0.5, 0.5);
      cr.playReanim(cloudAnims[i], PLAY_ONCE_AND_HOLD, 0, 0);
      let ctr = Math.floor(Math.random() * 8001) - 6000; // RandRangeInt(-6000,2000)
      if (ctr < 0) { cr.animTime = -ctr / 6000; cr.animRate = 0.5; ctr = 0; }
      else cr.animRate = 0;
      G.menuClouds.push(cr); G.menuCloudCtr.push(ctr);
    }
    const lr = new Reanimation(def, 0.5, 0.5);
    lr.playReanim("anim_grass", LOOP, 0, 6);
    lr.animRate = 0;
    G.menuLeaf = lr; G.menuLeafCtr = 50;
    r.playReanim("anim_open", PLAY_ONCE_AND_HOLD, 0, 30);
    r.frameBasePose = r.frameStart + r.frameCount - 1; // mFrameBasePose (GameSelector 241)
    G.menuFlowers = [];
    for (let i = 0; i < 3; i++) {
      const fr = new Reanimation(def, 0.5, 0.5);
      fr.playReanim("anim_flower" + (i + 1), PLAY_ONCE_AND_HOLD, 0, 0);
      fr.animRate = 0;
      fr.overlayOnly = true; // position follows the attachment; draws in DrawOverlay, never inline
      fr.attachTo(r, "SelectorScreen_BG_Right");
      G.menuFlowers.push(fr);
    }
    G.menuReanim = r; G.menuPhase = "open";
    syncMenuVariant();
  } catch (e) {
    G.menuReanim = null; G.menuPhase = "idle";
    G.menuClouds = []; G.menuCloudCtr = []; G.menuLeaf = null; G.menuFlowers = [];
  }
  G.menuStarting = 0; G.handReanim = null; // AdventureButtonClicked sequence state
  G.userPopup = null; G.nameEdit = ""; G.popupErr = null; // no dialog on entry
  G.screen = "menu"; window.__pvz.screen = "menu";
  // GameSelector ctor 278-279 — SOUND_ROLL_IN under the sign open
  // (ShowGameSelector rebuilds the selector every visit, so this fires on
  // every menu entry, boot included).
  playSfx("rollIn");
}
// GameSelector::SyncButtons — hide the unused adventure-art prefix.
function syncMenuVariant() {
  const r = G.menuReanim;
  if (!r) return;
  const cur = SAVE.currentUser();
  const finished = !!cur?.finished;
  const lv = Math.min(50, cur?.level ?? 1);
  const fresh = !finished && lv === 1;
  r.assignRenderGroupToPrefix(fresh ? "SelectorScreen_Adventure_" : "SelectorScreen_StartAdventure_", RENDER_GROUP_HIDDEN);
  // GameSelector::SyncButtons 383-388 — the lock state is decided HERE, at
  // menu creation, and the sliding sign tracks carry it from the first frame:
  // locked tombstone tracks are hidden up front (the open-phase draw draws
  // the greyed button art riding at their live track positions instead, so
  // they never flash full-color mid-slide), unlocked tracks slide untinted
  // (mTrackColor white). finishMenuOpen hides all five tracks at handover.
  if (!finished) {
    r.assignRenderGroupToTrack("SelectorScreen_Survival_button", RENDER_GROUP_HIDDEN);
    r.assignRenderGroupToTrack("SelectorScreen_Challenges_button", RENDER_GROUP_HIDDEN);
    r.assignRenderGroupToTrack("SelectorScreen_ZenGarden_button", RENDER_GROUP_HIDDEN);
  }
  // GameSelector::SyncButtons 326-341: the almanac/key shadow track shows the
  // baked combined shadow only when BOTH are unlocked; almanac-without-store
  // gets the ALMANAC_SHADOW override (no key shadow while the shop key is
  // still locked), store-without-almanac gets KEY_SHADOW, and both locked
  // hides the track. Swap cels are grafted retail PNGs (see atlas).
  const showAlmanac = finished || lv >= 15;
  const showStore = finished || lv >= 25; // (+ mHasSeenUpsell, untracked)
  if (showAlmanac) {
    r.assignRenderGroupToPrefix("almanac_key_shadow", RENDER_GROUP_NORMAL);
    if (showStore) r.clearImageOverride("almanac_key_shadow");
    else r.setImageOverrideByKey("almanac_key_shadow", "IMAGE_REANIM_SELECTORSCREEN_ALMANAC_SHADOW");
  } else if (showStore) {
    r.assignRenderGroupToPrefix("almanac_key_shadow", RENDER_GROUP_NORMAL);
    r.setImageOverrideByKey("almanac_key_shadow", "IMAGE_REANIM_SELECTORSCREEN_KEY_SHADOW");
  } else {
    r.assignRenderGroupToPrefix("almanac_key_shadow", RENDER_GROUP_HIDDEN);
  }
}
function finishMenuOpen() {
  // GameSelector::Update SELECTOR_OPEN — sign tracks hand over to buttons.
  const r = G.menuReanim;
  if (!r) return;
  for (const t of ["SelectorScreen_Adventure_button", "SelectorScreen_StartAdventure_button",
    "SelectorScreen_Survival_button", "SelectorScreen_Challenges_button", "SelectorScreen_ZenGarden_button"])
    r.assignRenderGroupToPrefix(t, RENDER_GROUP_HIDDEN);
  r.playReanim("anim_sign", PLAY_ONCE_AND_HOLD, 0, 30);
  G.menuPhase = "sign";
}
function enterOptions() {
  const o = SAVE.getOptions();
  G.optMusic = o.music; G.optSfx = o.sfx;
  G.optPress = null; G.sliderDrag = null; // fresh widget state (no stale press/drag)
  G.screen = "options"; window.__pvz.screen = "options";
}

async function enterChooser(level) {
  const cur = SAVE.currentUser();
  const finished = cur?.finished ?? false;
  G.chooserLevel = level;
  G.chosen = [];
  // The level builds async below — clear the old board/cutscene/chooser FIRST
  // so neither the draw nor the music tick can see stale (or null-board)
  // state during the load: updateMusic must stay silent, never fall through
  // to the lawn default, until startLevel flips the screen with the real
  // board + cutscene in place.
  G.board = null; G.cutscene = null; G.chooser = null;
  window.__pvz.board = null;
  await needImages(["SeedChooser_Background.png", "SeedChooser_Button.png"]);
  const avail = Array.from({ length: Math.min(49, seedsAvailableFor(level, finished)) }, (_, i) => i);
  await needDefs(avail.map((s) => PLANTS[s].reanim));
  for (const s of avail) stillFor(s);
  // Standalone chooser (replay path): when the cutscene is skipped, start directly.
  // Normal flow goes through the cutscene overlay instead (see startLevel).
  G.screen = "cutscene-standalone";
  window.__pvz.screen = "chooser";
  // Reuse cutscene path: build board+cutscene then immediately open chooser.
  await startLevel(level);
}

// ---------- Crazy Dave cutscene entity (LawnApp.cpp 2545-3043: L5 + first-time 2-1/3-1) ----------
// States mirror CrazyDaveState (ConstEnums.h 194-203); only the adventure
// bowling path is in scope (no upsell/scary-potter branches).
const DAVE_OFF = 0, DAVE_ENTERING = 1, DAVE_LEAVING = 2, DAVE_IDLING = 3,
  DAVE_TALKING = 4, DAVE_HANDING_TALKING = 5, DAVE_HANDING_IDLING = 6;
function daveStripTags(s) { return String(s).replace(/\{[^}]*\}/g, ""); }
function daveHasTag(s, tag) { return String(s).indexOf(tag) !== -1; }
function daveEnter() {
  // LawnApp::CrazyDaveEnter: reanim at (0,0), base pose from anim_idle_handing
  // (no base-pose API in this port — the enter layer carries the pose),
  // anim_enter once-and-hold @24, blink counter 400-800.
  if (G.dave) return;
  try {
    const r = new Reanimation(DEFS.get("Crazydave"), 0, 0);
    r.playReanim("anim_enter", PLAY_ONCE_AND_HOLD, 0, 24);
    G.dave = {
      reanim: r, state: DAVE_ENTERING, msgIndex: -1, msgText: "",
      blinkCtr: 400 + Math.floor(Math.random() * 400), blinkT: 0, wallnut: null, // CrazyDave blink (Plant 161: 400+Rand(400))
    };
  } catch (e) { G.dave = null; }
}
function daveDoneHanding() {
  // LawnApp::CrazyDaveDoneHanding: drop the handed attachment.
  const d = G.dave;
  if (!d || !d.wallnut) return;
  try {
    const idx = d.reanim.findTrackIndex("Dave_handinghand");
    if (idx >= 0 && d.reanim.tracks[idx]) {
      const slot = d.reanim.tracks[idx];
      slot.attachments = (slot.attachments || []).filter((c) => c !== d.wallnut);
    }
  } catch (e) { /* keep rendering without the handoff */ }
  d.wallnut = null;
}
function daveTalkIndex(i) {
  const d = G.dave;
  if (!d) return;
  d.msgIndex = i;
  // LawnApp::GetCrazyDaveText (2457-2465): {PLAYER_NAME} (+{MONEY}/
  // {UPGRADE_COST} on the pre-shop offer lines) is swapped for live
  // values at talk time. 201's greeting needs the profile name; 1401
  // needs the coin purse; 1502/1510/1552 need the current slot cost
  // (StoreScreen::GetItemCost PACKET_UPGRADE: 75/500/2000/8000).
  const raw = DAVE_TEXT[i] || "";
  const name = (G.board && G.board.playerName) || "Player";
  daveTalkMessage(raw.split("{PLAYER_NAME}").join(name)
    .split("{MONEY}").join(getMoneyString(SAVE.getCoins()))
    .split("{UPGRADE_COST}").join(getMoneyString(packetUpgradeCost(SAVE.getPacketUpgrade()))));
}
function daveTalkMessage(raw) {
  // LawnApp::CrazyDaveTalkMessage (2634-2880). In scope (2400-2415, 201-207,
  // 401-406, 501-505, 701-703, custom 9001-9003) SHOW_WALLNUT, SHOW_HAMMER, SHAKE, SCREAM(2) and the word-count
  // default branch fire — no HANDING / fertilizer / money-bag / NO_SOUND lines.
  const d = G.dave;
  if (!d) return;
  const r = d.reanim, msg = String(raw);
  // A non-handing line while handing drops the attachment first (TalkMessage
  // 2643-2646: HANDING_TALKING/IDLING + !{HANDING} -> CrazyDaveDoneHanding).
  if ((d.state === DAVE_HANDING_TALKING || d.state === DAVE_HANDING_IDLING) && !daveHasTag(msg, "{HANDING}")) {
    daveDoneHanding();
  }
  d.reanim.clearImageOverride("Dave_mouths");
  let words = 0, inCtl = false;
  for (const ch of msg) {
    if (ch === "{") inCtl = true;
    else if (ch === "}") inCtl = false;
    else if (!inCtl) words++;
  }
  // Retail SHORT/LONG/EXTRA_LONG foleys each roll 1 of 3 retail voice
  // files (TodFoley 105-107); the picks below mirror that (groans work
  // the same way). All files are byte-identical from the user's retail
  // sounds/ (main.zip), including the previously-missing short2/3,
  // long2/3 and the whole extralong set.
  // Shop hover lines (2000-2034) carry {NO_SOUND}: Dave mouths the words
  // with no voice (TalkMessage 2648-2656: {NO_SOUND} skips the StopFoley +
  // every PlayFoley). The {SHOW_MONEYBAG}/{SHOW_FERTILIZER}/{SHOW_TREE_FOOD}
  // handing props need the fertilizer/treefood reanim defs, which are not
  // shipped in this port — the talk still takes the HANDING_TALKING branch
  // with the LONG voice (TalkMessage 2779-2840), just with no prop attached.
  const doSound = !daveHasTag(msg, "{NO_SOUND}");
  const davePick = (base) => "dave" + base + (1 + Math.floor(Math.random() * 3));
  if (daveHasTag(msg, "{SHAKE}")) {
    r.playReanim("anim_crazy", PLAY_ONCE_AND_HOLD, 50, 12);
    if (doSound) playSfx("daveCrazy");
    d.state = DAVE_TALKING;
  } else if (daveHasTag(msg, "{SCREAM2}")) {
    r.playReanim("anim_mediumtalk", PLAY_ONCE_AND_HOLD, 50, 12);
    if (doSound) playSfx("daveScream2");
    d.state = DAVE_TALKING;
  } else if (daveHasTag(msg, "{SCREAM}")) {
    r.playReanim("anim_smalltalk", PLAY_ONCE_AND_HOLD, 50, 12);
    if (doSound) playSfx("daveScream");
    d.state = DAVE_TALKING;
  } else if (daveHasTag(msg, "{SHOW_WALLNUT}")) {
    r.playReanim("anim_talk_handing", LOOP, 50, 12);
    try {
      const w = new Reanimation(DEFS.get("Wallnut"), 0, 0);
      w.playReanim("anim_idle", LOOP, 0, 12);
      w.attachTo(r, "Dave_handinghand", 100, 393, 1.2);
      d.wallnut = w;
    } catch (e) { d.wallnut = null; }
    try { r.update(); } catch (e) { /* headless */ }
    if (doSound) playSfx("daveScream2");
    d.state = DAVE_HANDING_TALKING;
  } else if (daveHasTag(msg, "{SHOW_HAMMER}")) {
    // Whack-a-Zombie 405 (TalkMessage 2757-2778): handing pose + the Hammer
    // reanim on Dave_handinghand at (62,445) scale 1.5, LONG voice. The prop
    // rides the shared handed slot (dropped by CrazyDaveDoneHanding like the nut).
    r.playReanim("anim_talk_handing", LOOP, 50, 12);
    try {
      const h = new Reanimation(DEFS.get("Hammer"), 0, 0);
      h.playReanim("anim_whack_zombie", PLAY_ONCE_AND_HOLD, 0, 24);
      h.animTime = 1.0;
      h.attachTo(r, "Dave_handinghand", 62, 445, 1.5);
      d.wallnut = h;
    } catch (e) { d.wallnut = null; }
    try { r.update(); } catch (e) { /* headless */ }
    if (doSound) playSfx(davePick("Long"));
    d.state = DAVE_HANDING_TALKING;
  } else if (daveHasTag(msg, "{SHOW_MONEYBAG}") || daveHasTag(msg, "{SHOW_FERTILIZER}") || daveHasTag(msg, "{SHOW_TREE_FOOD}")) {
    // StoreScreen 602/2601 handling (TalkMessage 2779-2840: handing pose +
    // the moneybag/fertilizer/treefood reanim on Dave_handinghand, LONG
    // voice). The prop defs are not shipped in this port, so the talk takes
    // the handing branch with no attachment (noted above).
    r.playReanim("anim_talk_handing", LOOP, 50, 12);
    try { r.update(); } catch (e) { /* headless */ }
    if (doSound) playSfx(davePick("Long"));
    d.state = DAVE_HANDING_TALKING;
  } else if (words < 23) {
    r.playReanim("anim_smalltalk", PLAY_ONCE_AND_HOLD, 50, 12);
    if (doSound) playSfx(davePick("Short"));
    d.state = DAVE_TALKING;
  } else if (words < 52) {
    r.playReanim("anim_mediumtalk", PLAY_ONCE_AND_HOLD, 50, 12);
    if (doSound) playSfx(davePick("Long"));
    d.state = DAVE_TALKING;
  } else {
    r.playReanim("anim_blahblah", PLAY_ONCE_AND_HOLD, 50, 12);
    if (doSound) playSfx(davePick("ExtraLong"));
    d.state = DAVE_TALKING;
  }
  d.msgText = msg;
}
function daveStopTalking() {
  // LawnApp::CrazyDaveStopTalking (2883-2911), adventure branch only.
  const d = G.dave;
  if (!d) return;
  if (d.state === DAVE_HANDING_TALKING) daveDoneHanding();
  d.reanim.clearImageOverride("Dave_mouths");
  if (d.state === DAVE_HANDING_TALKING) {
    d.reanim.playReanim("anim_idle_handing", LOOP, 20, 12);
    d.state = DAVE_HANDING_IDLING;
  } else if (d.state === DAVE_TALKING || d.state === DAVE_HANDING_TALKING) {
    d.reanim.playReanim("anim_idle", LOOP, 20, 12);
    d.state = DAVE_IDLING;
  }
  d.msgIndex = -1; d.msgText = "";
}
function daveLeave() {
  // LawnApp::CrazyDaveLeave (2585-2604): drop the handed nut, clear the
  // mouth, anim_leave once-and-hold (blend 20, rate 24).
  const d = G.dave;
  if (!d) return;
  if (d.state === DAVE_HANDING_TALKING || d.state === DAVE_HANDING_IDLING) daveDoneHanding();
  d.reanim.playReanim("anim_leave", PLAY_ONCE_AND_HOLD, 20, 24);
  d.reanim.clearImageOverride("Dave_mouths");
  d.state = DAVE_LEAVING;
  d.msgIndex = -1; d.msgText = "";
}
function daveDie() {
  // LawnApp::CrazyDaveDie (2568-2582): remove the reanim, go OFF.
  const d = G.dave;
  if (!d) return;
  try { daveDoneHanding(); } catch (e) { /* ignore */ }
  G.dave = null;
}
function daveAdvanceText() {
  // LawnApp::AdvanceCrazyDaveText (2444-2454): next index exists? talk it.
  const d = G.dave;
  if (!d || d.msgIndex === -1) return false;
  const next = d.msgIndex + 1;
  if (!DAVE_TEXT[next]) return false;
  daveTalkIndex(next);
  return true;
}
function advanceDaveDialog() {
  // CutScene::AdvanceCrazyDaveDialog (1581-1645): the 2406 shovel branch and
  // 2411 line flag are L5-only; 201-207 and 501-505 advance plainly to the chooser-music
  // end path (custom 9001-9003 ride the same path), 701-703 (L25 scrolling conveyor) advance to NO music change
  // (neither the chooser nor the non-scrolling fade branch fires), like retail.
  const d = G.dave, b = G.board;
  if (!d || !b || d.msgIndex === -1) return;
  // "Start shovelin'!" (2406): open the shovel tutorial and leave.
  if (d.msgIndex === 2406) {
    b.setTutorialState(TUT.SHOVEL_PICKUP);
    daveLeave();
    return;
  }
  if (!daveAdvanceText()) {
    daveLeave();
    // End-of-text music (CutScene 1620-1631) runs ONLY during the level
    // intro: with a seed chooser on the level (first-time 2-1) the chooser
    // tune just keeps playing (MakeSureMusicIsPlaying(CHOOSE_YOUR_SEEDS)
    // is a no-op while it's up); without one on a non-scrolling level (L5
    // bowling, L15 whack) the tune fades out (1626-1629) and nothing
    // restarts it: updateMusic keeps requesting "chooser" every tick while
    // time < f.at, and the stale want would reboot the intro ~100ms after
    // the fade, hence chooserDone.
    // Mid-level Dave (vase intermissions 2700s/2800s on the board screen)
    // takes the Challenge path instead (Challenge::AdvanceCrazyDaveDialog
    // 1230-1239: leave only, NO music branch) — fading here kills the
    // board tune and updateMusic restarts it from the top every time Dave
    // finishes talking, so the music branches stay intro-gated.
    // Scrolling conveyor Dave levels (L25 little-trouble: ChooseSeeds false,
    // non-scrolling false) hit NEITHER branch in source — the TITLE theme
    // keeps playing through the pan and only fades at Ready-Set-Plant
    // (CutScene 1330-1345 via the chooserFade tick edge). Board::StartLevel
    // brings the level tune.
    if (G.screen === "cutscene" && G.cutscene) {
      if (G.cutscene.chooseSeeds) {
        try { playMusic("chooser"); } catch (e) { /* headless */ }
      } else if (G.cutscene.isNonScrolling && G.cutscene.isNonScrolling()) {
        G.cutscene.chooserDone = true;
        // CutScene::AdvanceCrazyDaveDialog 1626-1629: non-scrolling Dave-leave
        // (bowling/whack/vase) fades the chooser tune via FadeOut(50 TICKS) =
        // 500ms at 100Hz (same tick counter as the RSP fades above).
        try { fadeMusic(500); } catch (e) { /* headless */ }
      }
    }
    return;
  }
  const i = d.msgIndex;
  if (i === 2407) { /* ShovelAddWallnuts: minigame-only, no-op (comment only) */ }
  // "We're going bowling!" (2411) + whack 405: show the bowling line
  // (CutScene 1642: aMessageIndex == 405 || == 2411).
  if (i === 2411 || i === 405) b.showBowlingLine = true;
  // Vasebreaker intermission (AdvanceCrazyDaveDialog 1230-1248): at 2702 /
  // 2801 the next stage's vases populate + FOLEY_PLANT (random PLANT/PLANT2
  // like every foley roll) + PlaceRake (Challenge 1242-1246: col shifts
  // left of the leftmost vase of the fresh stage).
  if ((i === 2702 || i === 2801) && b.isVase) {
    try { b.vasePopulate(b.survivalStage); b.sfx(Math.random() < 0.5 ? "plant" : "plant2"); } catch (e) { /* headless */ }
    try { b.placeRake(); } catch (e) { /* headless/def missing */ }
  }
  // Pre-shop slot offer (CutScene 1647-1659): advancing onto 1503/1553
  // ("How's that sound?") pops the DIALOG_PURCHASE_PACKET_SLOT Yes/No
  // modal over Dave's bubble — header = the slot cost, body = "Upgrade
  // to {SLOTS} seed slots?" (slots = owned + 7). The dialog offset
  // (+120,+130), the coin-bank flash and the blocking wait are all
  // source; the intro clock stays frozen on Dave's message meanwhile.
  if ((i === 1503 || i === 1553) && !G.daveOffer) {
    const up = SAVE.getPacketUpgrade();
    const cost = packetUpgradeCost(up);
    G.daveOffer = { msgIndex: i, cost, slots: up + 7 };
    try { b.showCoinBank(100); } catch (e) { /* headless */ }
    return;
  }
  // Whack 406: the graves rise (CutScene 1690-1694: enable + particles).
  if (i === 406) {
    b.enableGraveStones = true;
    try {
      for (const c of b.cells) {
        if (!c.grave) continue;
        b.spawnGraveRise(gridToPixelX(c.col, b.bg) + 14 + c.grave.offX, gridToPixelY(c.col, c.row, b.bg) + 78 + c.grave.offY);
        b.sfx("dirtRise");
      }
    } catch (e) { /* headless */ }
  }
}
function updateDaveEntity() {
  // LawnApp::UpdateCrazyDave (2914-2988), L5 subset: loop transitions, mouth
  // overrides while idling, blink, then the reanim tick. No stormy-night
  // tint, no separate blink reanim (our def has no Dave_head/Dave_eye
  // tracks — the eye-ball tracks hide for ~7 ticks instead).
  const d = G.dave;
  if (!d) return;
  const r = d.reanim;
  if (d.state === DAVE_ENTERING || d.state === DAVE_TALKING) {
    if (r.loopCount > 0) {
      r.playReanim("anim_idle", LOOP, 20, 12);
      d.state = DAVE_IDLING;
    }
  } else if (d.state === DAVE_HANDING_TALKING) {
    if (r.loopCount > 0) {
      r.playReanim("anim_idle_handing", LOOP, 20, 12);
      d.state = DAVE_HANDING_IDLING;
    }
  } else if (d.state === DAVE_LEAVING && r.loopCount > 0) {
    daveDie();
    return;
  }
  if (d.state === DAVE_IDLING || d.state === DAVE_HANDING_IDLING) {
    if (daveHasTag(d.msgText, "{MOUTH_BIG_SMILE}")) r.setImageOverrideByKey("Dave_mouths", "IMAGE_REANIM_CRAZYDAVE_MOUTH1");
    else if (daveHasTag(d.msgText, "{MOUTH_SMALL_SMILE}")) r.setImageOverrideByKey("Dave_mouths", "IMAGE_REANIM_CRAZYDAVE_MOUTH5");
    else if (daveHasTag(d.msgText, "{MOUTH_BIG_OH}")) r.setImageOverrideByKey("Dave_mouths", "IMAGE_REANIM_CRAZYDAVE_MOUTH4");
    else if (daveHasTag(d.msgText, "{MOUTH_SMALL_OH}")) r.setImageOverrideByKey("Dave_mouths", "IMAGE_REANIM_CRAZYDAVE_MOUTH6");
  }
  if (d.state === DAVE_IDLING || d.state === DAVE_TALKING || d.state === DAVE_HANDING_TALKING || d.state === DAVE_HANDING_IDLING) {
    if (--d.blinkCtr <= 0) {
      d.blinkCtr = 400 + Math.floor(Math.random() * 400); // re-arm (Plant 161)
      d.blinkT = 7; // ~7 ticks at rate 15, like the blink layer span
    }
  }
  if (d.blinkT > 0) {
    d.blinkT--;
    try { r.assignRenderGroupToPrefix("dave_head_eye", RENDER_GROUP_HIDDEN); } catch (e) { /* ignore */ }
    if (d.blinkT === 0) {
      try { r.assignRenderGroupToPrefix("dave_head_eye", RENDER_GROUP_NORMAL); } catch (e) { /* ignore */ }
    }
  }
  try { r.update(); } catch (e) { /* headless */ }
  if (d.wallnut) { try { d.wallnut.update(); } catch (e) { /* headless */ } }
}
function isDaveTalking() {
  return !!(G.dave && G.dave.msgIndex !== -1);
}
// Board::MouseHitTest (4229) + IsScaryPotterDaveTalking (7577-7580): while
// Dave is up mid-level — including the LEAVING walk-off until Die — the
// board hit-tests nothing. Keyed on Dave existing (CrazyDaveState != OFF),
// not on a message showing.
function daveUp() {
  return !!G.dave;
}

// ---------- Crazy Dave's shop (Lawn/Widget/StoreScreen.cpp) ----------
// StoreScreen state (ctor 49-125): page, 100Hz storeTime, hatchTimer,
// hatchOpen, shake offsets, bubble countdown, ambient countdown, mouse-over
// item, start dialog (SetupForIntro), modal wait, taco diamond coin.
const STORE_MODAL_W = 420, STORE_MODAL_H = 250;
function storeProfiles() {
  const cur = SAVE.currentUser();
  return { level: Math.min(50, cur?.level ?? 1), finished: !!cur?.finished };
}
function storeSignY(t) {
  // TodAnimateCurve(50,110,t,-150,0,EASE_IN_OUT) (StoreScreen::Draw 437).
  if (t <= 50) return -150;
  if (t >= 110) return 0;
  const f = (t - 50) / 60, s = f * f * (3 - 2 * f), e = s * s * (3 - 2 * s);
  return -150 + 150 * e;
}
function storeClickToContinue() {
  // mBubbleClickToContinue rides the current bubble: every intro line shows
  // it, every {NO_CLICK} line (hover/ambient/first-aid/offer-style) hides it
  // (DrawCrazyDave 3024-2033 + SetBubbleText call sites).
  const d = G.dave;
  return !!(d && d.msgIndex !== -1 && d.msgText && !daveHasTag(d.msgText, "{NO_CLICK}"));
}
function storeCanInteract() {
  // StoreScreen::CanInteractWithButtons (616-619) + modal (mWaitForDialog).
  const s = G.store;
  return !!s && s.enabled && s.storeTime >= 120 && !storeClickToContinue() && s.hatchTimer <= 0 && !s.waitForDialog && !s.modal;
}
function storeSetBubble(i, cd) {
  // StoreScreen::SetBubbleText (519-525): talk the line, arm the countdown.
  const s = G.store;
  daveTalkIndex(i);
  if (s) s.bubbleCd = cd;
}
function storeHoverMsg(item) {
  // StoreScreen::UpdateMouse message table (544-580).
  const pu = SAVE.getPurchase(21);
  switch (item) {
    case 0: return 2000; case 1: return 2001; case 2: return 2002; case 3: return 2003;
    case 4: return 2004; case 5: return 2005; case 6: return 2006; case 7: return 2007;
    case 8: return 2008; case 9: return 2009;
    case 10: case 11: case 12: return 2010;
    case 21: return 2011 + Math.min(3, pu);
    case 22: return 2026; case 23: return 2027; case 24: return 2028; case 25: return 2029;
    case 27: return 2030; case 28: return 2031; case 18: return 2032; case 29: return 2033;
    case 13: return 2019; case 14: return 2020; case 16: return 2021; case 15: return 2022;
    case 17: return 2023; case 19: return 2024; case 20: return 2025;
    default: return 2034;
  }
}
async function openStore(opts = {}) {
  // LawnApp::ShowStoreScreen (582-592) + ctor + StorePreload (595-614):
  // DelayLoad_Store art, Crazy Dave reanim + CrazyDaveEnter, plant reanims.
  // opts: {intro (SetupForIntro dialog or -1), backLabel, after (on close)}.
  const files = ["Store_Background.png", "Store_BackgroundNight.png", "Store_Car.png", "Store_CarClosed.png",
    "Store_Car_night.png", "Store_CarClosed_night.png", "Store_HatchbackOpen.png", "Store_Sign.png",
    "Store_PriceTag.png", "Store_PacketUpgrade.png", "Store_MainMenuButton.png", "Store_MainMenuButtonDown.png",
    "Store_MainMenuButtonHighlight.png", "Store_PrevButton.png", "Store_PrevButtonDisabled.png",
    "Store_PrevButtonHighlight.png", "Store_NextButton.png", "Store_NextButtonDisabled.png",
    "Store_NextButtonHighlight.png", "Store_SpeechBubble.png", "Store_SpeechBubble2.png", "coinbank.png",
    "particles/AwardPickupGlow.png",
    "icon_poolcleaner.png", "icon_rake.png", "icon_roofcleaner.png", "ImitaterSeed.png",
    "Store_FirstAidWallnutIcon.png", "Store_MushroomGardenIcon.png", "Store_AquariumGardenIcon.png",
    "Store_TreeOfWisdomIcon.png", "Store_PvZIcon.png", "TreeFood.png", "Stinky_turn3.png",
    "WateringCanGold.png", "Fertilizer.png", "bug_spray.png", "Phonograph.png", "Zen_GardenGlove.png",
    "Zen_WheelBarrow.png", "moneybag.png", "particles/SeedPacketFlash.png",
    "pause/dialog_topleft.png", "pause/dialog_topmiddle.png", "pause/dialog_topright.png",
    "pause/dialog_centerleft.png", "pause/dialog_centermiddle.png", "pause/dialog_centerright.png",
    "pause/dialog_bottomleft.png", "pause/dialog_bottommiddle.png", "pause/dialog_bottomright.png",
    "pause/dialog_header.png", "pause/button_left.png", "pause/button_middle.png", "pause/button_right.png",
    "pause/button_down_left.png", "pause/button_down_middle.png", "pause/button_down_right.png"];
  await needImages(files);
  try { await needDefs(["Crazydave", "Diamond"]); } catch (e) { /* headless */ }
  // Potted-marigold icon needs both stills (no ZenGarden renderer in scope):
  // seed 33 (Flower Pot) for the pot + seed 39 (Marigold) for the bloom.
  // Fire-and-forget like the level preload (startLevel stillFor loop).
  for (const s of [33, 39]) { try { stillFor(s); } catch (e) { /* plate fallback */ } }
  const { level } = storeProfiles();
  const lv = opts.level ?? level;
  G.store = {
    page: 0, storeTime: 0, hatchTimer: 0, hatchOpen: true, shakeX: 0, shakeY: 0,
    bubbleCd: 0, ambientCountdown: 200, prevAmbient: -1, mouseOver: -1,
    startDialog: opts.intro ?? -1, waitForDialog: false, modal: null, coins: [],
    drawOnce: false, enabled: true, night: backgroundForLevel(lv) === BG.NIGHT,
    backLabel: opts.backLabel || "MAIN MENU", after: opts.after || null,
  };
  if (G.store.startDialog !== -1) {
    // StoreScreen::SetupForIntro (1141-1148): closed hatch, NEXT LEVEL back,
    // buttons off until the intro dialog is clicked through.
    G.store.hatchOpen = false;
    G.store.enabled = false;
  }
  // A store over a store never happens in retail (modal dialogs stack on
  // the widget manager instead); a fresh Dave keeps the singleton sane.
  if (G.store) { try { daveDie(); } catch (e) { /* ignore */ } }
  daveEnter();
  G.screen = "store"; window.__pvz.screen = "store";
}
async function closeStore() {
  // RemovedFromManager (786-794): CrazyDaveDie; then the intro's WaitForResult
  // continues into PreNewGame (award `after`) or back to the selector.
  const s = G.store;
  if (!s) return;
  daveDie(); G.store = null;
  if (s.after) { try { await s.after(); } catch (e) { /* ignore */ } }
  else { try { await enterMenu(); } catch (e) { /* ignore */ } }
}
function tickStore() {
  const s = G.store;
  if (!s) return;
  updateDaveEntity();
  // StoreScreen::Update coin DataArray (627-635): the taco diamond's
  // FROM_PRESENT pop (Coin::UpdateFall 469-480: damped drift, auto-Collect
  // at age 80 — no click, no gravity, no floor) then the money flight home
  // to the store coin bank (Coin::UpdateCollected 602-616: (662,546) while
  // the store dialog is up; ScoreCoin +100 at <12 with the dist*0.05 scale
  // and dist*0.035 alpha curves, all board-null-safe).
  for (const c of s.coins) {
    if (c.dead) continue;
    if (!c.collecting) {
      c.age++;
      c.x += c.vx; c.y += c.vy;
      c.vx *= 0.95; c.vy *= 0.95;
      if (c.age >= 80) c.collecting = true; // Coin::Collect (1038-1045)
    } else {
      c.x += (662 - c.x) / 21; c.y += (546 - c.y) / 21;
      const dist = Math.hypot(662 - c.x, 546 - c.y);
      c.scale = Math.min(1, Math.max(0.5, dist * 0.05));
      c.alpha = Math.min(1, Math.max(0.35, dist * 0.035));
      if (dist < 12) { c.dead = true; SAVE.addCoins(100); } // GetCoinValue diamond (1298-1301)
    }
    try {
      c.reanim.update();
      c.reanim.x = c.x; c.reanim.y = c.y;
      c.reanim.setScale(c.scale);
      c.reanim.alpha = c.alpha;
    } catch (e) { /* headless */ }
  }
  s.coins = s.coins.filter((c) => !c.dead);
  if (s.waitForDialog || s.modal) { storeUpdateMouse(); return; }
  if (!G.dave) return;
  s.storeTime++;
  if (s.hatchTimer > 0) {
    // StoreScreen::Update hatch shake (652-703): buttons ride (shakeX,
    // shakeY); shakeY is 1-3 while the timer is over 35, else 0.
    s.hatchTimer--;
    if (s.hatchTimer === 0) {
      s.shakeX = 0; s.shakeY = 0;
      if (s.startDialog === -1) s.enabled = true; // EnableButtons(true)
    } else {
      s.shakeX = 0;
      s.shakeY = s.hatchTimer > 35 ? 1 + Math.floor(Math.random() * 3) : 0;
    }
  } else if (s.startDialog !== -1) {
    storeSetBubble(s.startDialog, 0);
    s.startDialog = -1;
  } else if (!storeClickToContinue()) {
    if (s.bubbleCd > 0) {
      s.bubbleCd--;
      if (s.bubbleCd === 0) daveStopTalking();
    } else {
      // Ambient lines (729-757): 2015-2017 always weight 100, 2018 weight 20
      // only with a finished adventure, previous line weight 0; bubble 800,
      // next pick in 500-1000 ticks.
      s.ambientCountdown--;
      if (s.ambientCountdown <= 0) {
        const { finished } = storeProfiles();
        const msgs = [2015, 2016, 2017, 2018];
        const weights = msgs.map((m, i) => (m === s.prevAmbient ? 0 : (i === 3 ? (finished ? 20 : 0) : 100)));
        let tot = weights.reduce((a, b) => a + b, 0), r = Math.random() * tot, pick = msgs[0];
        for (let i = 0; i < 4; i++) { r -= weights[i]; if (r <= 0) { pick = msgs[i]; break; } }
        s.prevAmbient = pick;
        storeSetBubble(pick, 800);
        s.ambientCountdown = 500 + Math.floor(Math.random() * 501);
      }
    }
  }
  storeUpdateMouse();
}
function storeUpdateMouse() {
  // StoreScreen::UpdateMouse (527-592): hover bubble + message per slot.
  const s = G.store;
  if (!s) return;
  s.mouseOver = -1;
  if (s.storeTime < 120 || storeClickToContinue() || s.hatchTimer > 0 || s.waitForDialog || s.modal) return;
  const { level, finished } = storeProfiles();
  const p = G.mouse, pu = SAVE.getPurchases();
  for (let i = 0; i < 8; i++) {
    const item = SPOTS[s.page][i];
    if (item === -1 || isUnavailable(item, level, finished)) continue;
    const { x, y } = spotXY(i);
    if (p.x > x && p.x < x + 50 && p.y > y && p.y < y + 87) {
      s.mouseOver = item;
      const msg = storeHoverMsg(item);
      if (!G.dave || G.dave.msgIndex !== msg) storeSetBubble(msg, 100);
      else s.bubbleCd = 100;
      break;
    }
  }
}
function storeAdvance() {
  // StoreScreen::AdvanceCrazyDaveDialog (1035-1084).
  const s = G.store, d = G.dave;
  if (!s || !d || !storeClickToContinue()) return;
  if (d.msgIndex === 3100) {
    s.hatchTimer = 150; s.hatchOpen = true;
    playSfx("hatchOpen"); // SOUND_HATCHBACK_OPEN
  }
  if (!daveAdvanceText()) {
    daveStopTalking();
    s.bubbleCd = 500;
    if (s.hatchTimer === 0) s.enabled = true; // EnableButtons(true)
  } else {
    storeSetBubble(d.msgIndex, 0);
  }
  const m = G.dave ? G.dave.msgIndex : -1;
  if (m === 303 || m === 606 || m === 2601) {
    s.hatchTimer = 150; s.hatchOpen = true;
    playSfx("hatchOpen");
  } else if (m === 603) {
    // Taco handoff (StoreScreen::AdvanceCrazyDaveDialog 1070-1079):
    // mNeedsMagicTacoReward clears (+ WriteCurrentUserConfig, which every
    // SAVE mutation already persists), SOUND_DIAMOND plays, and the diamond
    // pops out of the trunk — CoinInitialize(80,520) shifts silver/gold
    // -10/-8 but diamond -15/-15 (Coin.cpp 90-93), then velY=-5. No click:
    // Coin::MouseDown needs a board + SCENE_PLAYING (1384), and there is
    // neither in the store — the coin auto-collects at age 80 (tickStore).
    SAVE.clearNeedsMagicTaco();
    playSfx("diamond"); // SOUND_DIAMOND
    try {
      const r = new Reanimation(DEFS.get("Diamond"), 65, 505);
      r.loopType = LOOP;
      r.animRate = 50 + Math.random() * 30; // CoinInitialize diamond 101
      r.animTime = Math.random(); // random phase (100)
      r.setScale(1);
      r.alpha = 1;
      s.coins.push({ x: 65, y: 505, vx: 0, vy: -5, age: 0, collecting: false, scale: 1, alpha: 1, reanim: r, dead: false });
    } catch (e) { /* headless: no visual, reward skipped like the art */ }
  } else if (m === 902 || m === 1002) {
    SAVE.addCoins(100);
  }
}
function storeBuy(item) {
  // StoreScreen::PurchaseItem (905-1033): confirm modal, deduct, apply.
  const s = G.store;
  if (!s) return;
  daveStopTalking(); // mBubbleCountDown = 0 + CrazyDaveStopTalking
  s.bubbleCd = 0;
  const cost = itemCost(item, SAVE.getPurchases());
  if (SAVE.getCoins() < cost) {
    s.modal = { kind: "ok", title: "Not enough money", body: "You cannot afford this item." };
    s.waitForDialog = true;
    return;
  }
  s.modal = { kind: "confirm", item, cost, title: "Buy this item?", body: "Are you sure you want to buy this item?" };
  s.waitForDialog = true;
}
function storeCloseModal() {
  const s = G.store;
  if (!s) return;
  s.modal = null;
  s.waitForDialog = false;
}
function storeActivateModal(k) {
  // LawnDialog Yes/No/OK press (ButtonPress + ButtonDepress).
  const s = G.store;
  if (!s || !s.modal) return;
  const m = s.modal;
  playSfx("gravebutton");
  if (m.kind === "ok") { storeCloseModal(); return; }
  if (m.kind === "confirm" && k === "no") { storeCloseModal(); return; }
  if (m.kind === "visitTree") {
    if (k === "yes") s.modal = { kind: "ok", title: "Tree of Wisdom", body: "The Tree of Wisdom isn't available yet." };
    else storeCloseModal();
    return;
  }
  if (m.kind === "confirm" && k === "yes") {
    const item = m.item, cost = m.cost;
    if (!SAVE.spendCoins(cost)) { storeCloseModal(); return; }
    const P = SAVE.getPurchases();
    if (item === 21) {
      // Packet upgrade: count up, OK modal with the new slot total.
      SAVE.setPurchase(21, P[21] + 1);
      s.modal = { kind: "ok", title: "More Slots", body: `You can now choose ${6 + P[21] + 1} seeds per level!` };
      s.waitForDialog = true;
      return;
    } else if (item === 9) {
      SAVE.setPurchase(9, P[9] + 1);
    } else if (item === 24) {
      SAVE.setPurchase(24, 3); // rake lasts 3 levels
    } else if (item === 20) {
      SAVE.setPurchase(20, Math.floor(Date.now() / 1000)); // stinky = now
    } else if (item === 14 || item === 15) {
      SAVE.setPurchase(item, (P[item] < 1000 ? 1000 : P[item]) + 5);
    } else if (item === 28) {
      SAVE.setPurchase(28, (P[28] < 1000 ? 1000 : P[28]) + 1);
    } else if (item === 27) {
      // Tree of Wisdom: flag + challenge record, then the visit-tree prompt.
      SAVE.setPurchase(27, 1);
      s.modal = { kind: "visitTree", title: "Visit Tree?", body: "Do you want to visit the Tree of Wisdom now?" };
      s.waitForDialog = true;
      return;
    } else if (item === 10 || item === 11 || item === 12) {
      // Marigold: one a day (GetCurrentDaysSince2000 stamp); the pot goes to
      // the Zen Garden (not in scope — the flag persists for it and the
      // visit is a stub message).
      SAVE.setPurchase(item, daysSince2000());
      s.modal = { kind: "ok", title: "Zen Garden", body: "Your marigold is waiting in the Zen Garden! (coming soon)" };
      s.waitForDialog = true;
      return;
    } else {
      // Plants, cleaners, gardens, glove, phonograph, watercan, wheelbarrow:
      // owned flag (SeedChooser::UpdateAfterPurchase has no chooser here —
      // the chooser rebuilds per level and reads the flag when in scope).
      SAVE.setPurchase(item, 1);
    }
    if (item === 29) storeSetBubble(3400, 800); // first-aid hint
    // LawnApp::WriteCurrentUserConfig rides on every setPurchase/spendCoins.
    storeCloseModal();
    return;
  }
  storeCloseModal();
}
function storeModalRect() {
  return { x: (800 - STORE_MODAL_W) / 2, y: (600 - STORE_MODAL_H) / 2, w: STORE_MODAL_W, h: STORE_MODAL_H };
}
function storeModalWidgetAt(p) {
  const s = G.store;
  if (!s || !s.modal) return null;
  const inR = (r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  const m = s.modal, r = storeModalRect();
  const y = r.y + r.h - 70;
  if (m.kind === "ok") {
    const b = { x: r.x + r.w / 2 - 90, y, w: 180, h: 46 };
    if (inR(b)) return "ok";
  } else {
    const yl = { x: r.x + 40, y, w: 150, h: 46 }, nl = { x: r.x + r.w - 190, y, w: 150, h: 46 };
    if (inR(yl)) return "yes";
    if (inR(nl)) return "no";
  }
  return null;
}
function storeButtons() {
  // Button rects (StoreScreen ctor 73-109): back sized by its image at
  // (366,512), prev (252,402) and next (596,402) sized by theirs, all riding
  // the hatch shake offsets.
  const s = G.store;
  const sx = s ? s.shakeX : 0, sy = s ? s.shakeY : 0;
  const back = libs.images["Store_MainMenuButton.png"];
  const prev = libs.images["Store_PrevButton.png"];
  const next = libs.images["Store_NextButton.png"];
  return {
    back: { x: 366 + sx, y: 512 + sy, w: back ? back.width : 120, h: back ? back.height : 40 },
    prev: { x: 252 + sx, y: 402 + sy, w: prev ? prev.width : 60, h: prev ? prev.height : 60 },
    next: { x: 596 + sx, y: 402 + sy, w: next ? next.width : 60, h: next ? next.height : 60 },
  };
}
function storeNavLive() {
  // StoreScreen::EnableButtons (1128-1139): the back button rides the bare
  // enable flag, but prev/next additionally need IsPageShown(PLANT_UPGRADES)
  // (finished adventure or level >= 42) — at L35/L25 they stay ctor-disabled
  // and the page string (Draw 490: gated on !mPrevButton->mDisabled) hides.
  const s = G.store;
  if (!s || !s.enabled) return false;
  const { level, finished } = storeProfiles();
  return finished || level >= 42;
}
function handleStoreClick(p) {
  const s = G.store;
  if (!s) return;
  if (s.modal) {
    const k = storeModalWidgetAt(p);
    if (k) storeActivateModal(k);
    return;
  }
  // MouseDown (1086-1125): click-to-continue advances first, buttons and
  // slots need CanInteractWithButtons.
  if (storeClickToContinue()) { storeAdvance(); return; }
  if (!storeCanInteract()) return;
  const B = storeButtons();
  const inR = (r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
  if (inR(B.back)) { playSfx("buttonclick"); closeStore(); return; } // ButtonPress: click except prev/next
  // Disabled prev/next (ctor-disabled while the plant-upgrades page is
  // hidden) never depress — EnableButtons leaves them off at L25/L35.
  if ((inR(B.prev) || inR(B.next)) && storeNavLive()) {
    // ButtonDepress prev/next (823-849): 50-tick hatch close, silent, page
    // wraps over shown pages only.
    const { level, finished } = storeProfiles();
    s.hatchTimer = 50;
    playSfx("hatchClose"); // SOUND_HATCHBACK_CLOSE
    s.bubbleCd = 0;
    daveStopTalking();
    s.enabled = false; // EnableButtons(false)
    const dir = inR(B.prev) ? -1 : 1;
    for (let n = 0; n < 4; n++) {
      s.page = (s.page + dir + 4) % 4;
      if (isPageShown(s.page, level, finished)) break;
    }
    return;
  }
  const { level, finished } = storeProfiles();
  const pu = SAVE.getPurchases();
  for (let i = 0; i < 8; i++) {
    const item = SPOTS[s.page][i];
    if (item === -1) continue;
    const { x, y } = spotXY(i);
    if (p.x > x && p.x < x + 50 && p.y > y && p.y < y + 87) {
      if (!isSoldOut(item, pu) && !isUnavailable(item, level, finished) && !isComingSoon(item, pu, finished)) storeBuy(item);
      break;
    }
  }
}
function storeDrawSeed(x, y, seed) {
  // DrawSeedPacket(item + 40): seeds 40+ are the upgrade family (cell 1).
  // Only gatling (40) has a plant def in this port's L1-9 scope — the rest
  // draw the upgrade packet cell with the plant name (no invented icons).
  const names = ["Gatling Pea", "Twin Sunflower", "Gloom-shroom", "Cattail", "Winter Melon", "Gold Magnet", "Spikerock", "Cob Cannon", "Imitater"];
  if (seed === 40) { drawPacket(x, y, 50, 70, 40, { chooser: true }); return; }
  const strip = libs.images["seeds.png"];
  if (strip) ctx.drawImage(strip, 1 * 50, 0, 50, 70, x, y, 50, 70);
  else { ctx.fillStyle = "#8a6b3a"; ctx.fillRect(x, y, 50, 70); }
  drawWrapped(ctx, "BRIANNE12", names[seed - 40] || "", x + 2, y + 8, 46, 54, { color: "#fff", align: "center" });
}
function storeDrawIcon(x, y, item) {
  // StoreScreen::DrawItemIcon (279-386): per-item art + offsets.
  const I = libs.images;
  const img = (n) => I[n];
  switch (item) {
    case 21: {
      const pu = SAVE.getPurchase(21);
      const ic = img("Store_PacketUpgrade.png");
      if (ic) { ctx.save(); ctx.globalAlpha = 32 / 255; ctx.drawImage(ic, x - 7, y + 7); ctx.restore(); }
      drawWrapped(ctx, "HoT16", `${pu + 7}\nslots`, x, y + 6, 55, 70, { color: "#fff", align: "center" });
      return;
    }
    case 22: { const i = img("icon_poolcleaner.png"); if (i) ctx.drawImage(i, x + 1, y + 7); return; }
    case 24: { const i = img("icon_rake.png"); if (i) ctx.drawImage(i, x - 5, y + 10); return; }
    case 23: { const i = img("icon_roofcleaner.png"); if (i) ctx.drawImage(i, x, y + 28); return; }
    case 8: { const i = img("ImitaterSeed.png"); if (i) ctx.drawImage(i, x, y); return; }
    case 18: { const i = img("Store_MushroomGardenIcon.png"); if (i) ctx.drawImage(i, x - 8, y + 2); return; }
    case 25: { const i = img("Store_AquariumGardenIcon.png"); if (i) ctx.drawImage(i, x - 8, y + 2); return; }
    case 27: { const i = img("Store_TreeOfWisdomIcon.png"); if (i) ctx.drawImage(i, x - 8, y + 2); return; }
    case 29: { const i = img("Store_FirstAidWallnutIcon.png"); if (i) ctx.drawImage(i, x - 1, y + 13); return; }
    case 30: { const i = img("Store_PvZIcon.png"); if (i) ctx.drawImage(i, x, y - 9); return; }
    case 28: { const i = img("TreeFood.png"); if (i) ctx.drawImage(i, x - 8, y - 2); return; }
    case 20: { const i = img("Stinky_turn3.png"); if (i) ctx.drawImage(i, x - 24, y + 14); return; }
    case 13: { const i = img("WateringCanGold.png"); if (i) ctx.drawImage(i, x - 14, y - 4); return; }
    case 14: {
      const i = img("Fertilizer.png"); if (i) ctx.drawImage(i, x - 11, y - 2);
      drawText(ctx, "HoT16", "x5", x + 56, y + 62, { align: "right", color: "#fff" });
      return;
    }
    case 16: { const i = img("Phonograph.png"); if (i) ctx.drawImage(i, x - 12, y + 3); return; }
    case 15: {
      const i = img("bug_spray.png"); if (i) ctx.drawImage(i, x - 12, y + 3);
      drawText(ctx, "HoT16", "x5", x + 56, y + 62, { align: "right", color: "#fff" });
      return;
    }
    case 17: { const i = img("Zen_GardenGlove.png"); if (i) ctx.drawImage(i, x - 12, y + 3); return; }
    case 19: { const i = img("Zen_WheelBarrow.png"); if (i) ctx.drawImage(i, x - 12, y + 3); return; }
    case 10: case 11: case 12: {
      // Potted marigold: retail calls ZenGarden::DrawPottedPlantIcon (no
      // ZenGarden in this port's scope) — Flower Pot still (seed 33) + the
      // Marigold bloom still (seed 39, preloaded in openStore) stand in.
      const pot = STILLS.get(33) || img("SeedBank.png");
      if (pot) ctx.drawImage(pot, x + 5, y + 25, 40, 30);
      try {
        const st = STILLS.get(39);
        if (st) ctx.drawImage(st, x + 8, y - 2, 34, 40);
      } catch (e) { /* plate fallback below */ }
      return;
    }
    default: {
      if (item >= 0 && item <= 8) { storeDrawSeed(x, y, seedForItem(item)); return; }
      return;
    }
  }
}
function drawStoreItem(i, item) {
  // StoreScreen::DrawItem (388-429): unavailable draws nothing; price tag +
  // cost under everything else; coming-soon/sold-out cover the price; hover
  // flashes upgrade seeds or re-coats other icons additively.
  const s = G.store;
  const { level, finished } = storeProfiles();
  if (isUnavailable(item, level, finished)) return;
  const { x, y } = spotXY(i);
  storeDrawIcon(x, y, item);
  const pu = SAVE.getPurchases();
  if (item !== 30) {
    const tag = libs.images["Store_PriceTag.png"];
    if (tag) ctx.drawImage(tag, x - 3, y + 70);
    drawText(ctx, "BRIANNE12", getMoneyString(itemCost(item, pu)), x + 23, y + 85, { align: "center", color: "#000" });
  }
  if (isComingSoon(item, pu, finished)) {
    const dx = (item === 1 || item === 21) ? -4 : 0;
    drawWrapped(ctx, "HoT16", "Coming Soon", x + dx, y, 60, 70, { color: "#ff0000", align: "center" });
  } else if (isSoldOut(item, pu)) {
    drawWrapped(ctx, "HoT16", "Sold Out", x, y, 50, 70, { color: "#ff0000", align: "center" });
  } else if (s && s.mouseOver === item) {
    if (item >= 0 && item <= 8) {
      const fl = libs.images["particles/SeedPacketFlash.png"];
      if (fl) ctx.drawImage(fl, x, y);
    } else {
      // Additive re-coat (DRAWMODE_ADDITIVE, white 96/255 + colorize).
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 96 / 255;
      storeDrawIcon(x, y, item);
      ctx.restore();
    }
  }
}
function drawStoreDave() {
  // LawnApp::DrawCrazyDave (2991-3043) in-shop branch: Store_SpeechBubble
  // at (105,-58) with the text in (130,-52,233,144) — the (285,20) intro
  // bubble shifted by (-180,-78) while the store dialog is up — then Dave.
  const d = G.dave;
  if (!d) return;
  if (d.msgIndex !== -1 && d.msgText) {
    const bub = libs.images["Store_SpeechBubble.png"];
    if (bub) ctx.drawImage(bub, 105, -58);
    let rx = 130, ry = -52;
    if (daveHasTag(d.msgText, "{SHAKE}") && !G.pauseDlg) {
      rx += Math.floor(Math.random() * 2);
      ry += Math.floor(Math.random() * 2);
    }
    drawWrapped(ctx, "BRIANNE16", daveStripTags(d.msgText), rx, ry, 233, 144, { color: "#000" });
    if (!daveHasTag(d.msgText, "{NO_CLICK}")) {
      drawText(ctx, "PICO", "click to continue", 244, 82, { align: "center", color: "#000" });
    }
  }
  try { d.reanim.draw(ctx, 0, 0); } catch (e) { /* art not ready */ }
}
function drawStoreModal() {
  const s = G.store;
  if (!s || !s.modal) return;
  const r = storeModalRect();
  drawPauseFrame(r.x, r.y, r.w, r.h);
  drawText(ctx, "DWARF24", s.modal.title || "", r.x + r.w / 2, r.y + 52, { align: "center", color: "#e0bb62" });
  drawWrapped(ctx, "HoT16", s.modal.body || "", r.x + 30, r.y + 80, r.w - 60, 90, { color: "#e0bb62", align: "center" });
  const y = r.y + r.h - 70;
  if (s.modal.kind === "ok") {
    drawStoneButton(r.x + r.w / 2 - 90, y, 180, 46, "OK", false, storeModalWidgetAt(G.mouse) === "ok");
  } else {
    const yes = s.modal.kind === "confirm" ? "YES" : "YES";
    drawStoneButton(r.x + 40, y, 150, 46, yes, false, storeModalWidgetAt(G.mouse) === "yes");
    drawStoneButton(r.x + r.w - 190, y, 150, 46, "NO", false, storeModalWidgetAt(G.mouse) === "no");
  }
}
function drawStore() {
  // StoreScreen::Draw (431-504).
  const s = G.store;
  if (!s) return;
  s.drawOnce = true;
  const I = libs.images;
  const bg = I[s.night ? "Store_BackgroundNight.png" : "Store_Background.png"];
  if (bg) ctx.drawImage(bg, 0, 0);
  else { ctx.fillStyle = "#3a2a1a"; ctx.fillRect(0, 0, 800, 600); }
  const sx = s.shakeX, sy = s.shakeY;
  const cars = s.night ? ["Store_Car_night.png", "Store_CarClosed_night.png"] : [null, null];
  if (!s.hatchTimer && s.hatchOpen) {
    const car = I["Store_Car.png"];
    if (car) ctx.drawImage(car, 196 + sx, 138 + sy);
    const hatch = I["Store_HatchbackOpen.png"];
    if (hatch) ctx.drawImage(hatch, 299 + sx, sy);
    if (s.night) {
      const cn = I["Store_Car_night.png"];
      if (cn) ctx.drawImage(cn, 688 + sx, 193 + sy);
    }
  } else {
    const cc = I["Store_CarClosed.png"];
    if (cc) ctx.drawImage(cc, 196 + sx, 138 + sy);
    if (s.night) {
      const cn = I["Store_Car_night.png"];
      if (cn) ctx.drawImage(cn, 688 + sx, 193 + sy);
      const ccn = I["Store_CarClosed_night.png"];
      if (ccn) ctx.drawImage(ccn, 337 + sx, 187 + sy);
    }
  }
  const sign = I["Store_Sign.png"];
  if (sign) ctx.drawImage(sign, 285, storeSignY(s.storeTime));
  // Dave at (-42,+68) behind the slots (gCrazyDave translated Draw).
  ctx.save();
  ctx.translate(-42, 68);
  drawStoreDave();
  ctx.restore();
  if (!s.hatchTimer && s.hatchOpen) {
    for (let i = 0; i < 8; i++) {
      const item = SPOTS[s.page][i];
      if (item !== -1) drawStoreItem(i, item);
    }
  }
  const bank = I["coinbank.png"];
  if (bank) ctx.drawImage(bank, 650, 559);
  drawText(ctx, "CB14", getMoneyString(SAVE.getCoins()), 761, 583, { align: "right", color: "#b4ff5a" });
  // Page string (shown while the flip buttons are live).
  if (storeNavLive()) {
    const { level, finished } = storeProfiles();
    let n = 0;
    for (let pg = 0; pg < 4; pg++) if (isPageShown(pg, level, finished)) n++;
    drawText(ctx, "BRIANNE12", `Page ${s.page + 1} of ${n}`, 470, 559, { align: "center", color: "#505050" });
  }
  // Back / prev / next (Resize 73-109 + EnableButtons).
  const B = storeButtons();
  const backImg = I[!s.enabled ? "Store_MainMenuButton.png" : (hovered(B.back) ? "Store_MainMenuButtonHighlight.png" : "Store_MainMenuButton.png")];
  if (backImg) ctx.drawImage(backImg, B.back.x, B.back.y, B.back.w, B.back.h);
  const hovBack = s.enabled && hovered(B.back);
  drawText(ctx, "HoT20", s.backLabel, B.back.x + B.back.w / 2 - 7, B.back.y + B.back.h / 2 + 8, { align: "center", color: hovBack ? "#a7c0eb" : "#6299eb" });
  const prevImg = I[!storeNavLive() ? "Store_PrevButtonDisabled.png" : (hovered(B.prev) ? "Store_PrevButtonHighlight.png" : "Store_PrevButton.png")];
  if (prevImg) ctx.drawImage(prevImg, B.prev.x, B.prev.y, B.prev.w, B.prev.h);
  const nextImg = I[!storeNavLive() ? "Store_NextButtonDisabled.png" : (hovered(B.next) ? "Store_NextButtonHighlight.png" : "Store_NextButton.png")];
  if (nextImg) ctx.drawImage(nextImg, B.next.x, B.next.y, B.next.w, B.next.h);
  // Taco diamond + modal on top.
  for (const c of s.coins) {
    if (c.dead) continue;
    // Coin::Draw diamond branch (793-798): the AWARDPICKUPGLOW halo at
    // (mPosX-56, mPosY-66) under the spinning stone, both in GetColor.
    // (main.zip particles/AwardPickupGlow.png, byte-identical in src/.)
    const glow = I["particles/AwardPickupGlow.png"];
    if (glow) {
      ctx.save();
      ctx.globalAlpha = c.alpha;
      ctx.drawImage(glow, c.x - 56, c.y - 66);
      ctx.restore();
    }
    // The reanim carries its own position (synced in tickStore), so it
    // draws at the origin — passing c.x/c.y as cam would double-offset it
    // offscreen (drawTrack adds camX + this.x).
    try { c.reanim.draw(ctx, 0, 0); } catch (e) { /* art not ready */ }
  }
  drawStoreModal();
}

function handleCutsceneClick(p) {
  const cs = G.cutscene;
  if (!cs) return;
  // Slot-offer modal is modal (WidgetManager): press/release match on
  // its buttons, everything else swallowed — Dave never advances under it.
  if (G.daveOffer) {
    const k = daveOfferWidgetAt(p);
    if (k && k === G.offerPress) activateDaveOffer(k);
    G.offerPress = null;
    return;
  }
  G.offerPress = null;
  // Skip with click? Source: no skip (must watch or choose seeds). Allow fast-forward on double area? Keep: no skip.
  if (cs.waitingForSeeds) {
    handleChooserClick(p);
    return;
  }
  // CutScene::MouseDown (1698-1718): while Dave is showing, every click
  // advances the dialogue (consumed — never doubles as a shovel click).
  if (isDaveTalking()) {
    advanceDaveDialog();
    return;
  }
  // Shovel tutorial clicks while the intro clock is frozen (Board::PickUpTool
  // 4378 gate: scene != PLAYING is allowed only in the shovel tutorial).
  const b = G.board;
  if (b && (b.tutorialState === TUT.SHOVEL_PICKUP ||
      b.tutorialState === TUT.SHOVEL_DIG ||
      b.tutorialState === TUT.SHOVEL_KEEP_DIGGING)) {
    handleCutsceneShovelClick(p);
    return;
  }
  // else: clicks do nothing during the pan (source board input disabled in SCENE_LEVEL_INTRO).
}

function cutsceneShovelRect() {
  // Board::GetShovelButtonRect (1307-1315): fixed screen rect, independent of
  // the sliding seed bank (Board::DrawShovel draws it even while the bank is
  // hidden). Width = SHOVELBANK (70x72 art), height = SEEDBANK (87).
  // USER OVERRIDE: pinned left of the Menu button (SHOVEL_X) on all banks.
  const shx = SHOVEL_X;
  return { x: shx, y: 0, w: 70, h: 87 };
}

function handleCutsceneShovelClick(p) {
  const b = G.board;
  if (!b) return;
  const r = cutsceneShovelRect();
  // Shovel slot: pick it up in PICKUP (Board::PickUpTool 4383-4390 -> DIG).
  if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) {
    // Board::PickUpTool (4376-4390): arming the shovel is allowed in any
    // shovel-tutorial state; only PICKUP advances to DIG. An armed press on
    // the slot is the tool dispatch, not a re-arm (see bankPressAt).
    if (!G.shovelMode) {
      if (b.tutorialState === TUT.SHOVEL_PICKUP) b.setTutorialState(TUT.SHOVEL_DIG);
      G.selSeed = -1; G.selConvIdx = -1; G.shovelMode = true;
      playSfx("shovel"); // FOLEY_SHOVEL
    } else {
      if (!b.digAt(p.x, p.y)) playSfx("drop"); // FOLEY_DROP (4121)
      clearSeedCursor(); // ClearCursor: disarm (+ DIG -> PICKUP revert)
    }
    return;
  }
  if (!G.shovelMode) return;
  // Lawn dig (Board::MouseDownWithTool shovel branch 4123-4137): pixel-space
  // ToolHitTest digs the hit plant (the L5 board never pans, so raw pixels
  // map straight to the grid inside digAt); a miss drops the cursor and
  // reverts DIG to PICKUP (ClearCursor path).
  if (!b.digAt(p.x, p.y)) playSfx("drop"); // FOLEY_DROP
  clearSeedCursor();
}

// ---------- Seed chooser (SeedChooserScreen: left panel over the level preview) ----------
// Source-faithful layout in widget space == screen space, all 1:1 retail art
// (DebugVS2005 images — NOT the brown main.zip restyle): the 465x513
// background at (0,87) with the lawn preview visible to its right, an 8-col
// grid (x = col*53+22, y = row*70+123 with 7 rows else row*73+128), the top
// bank (slot x = 10 + GetSeedPacketPositionX), LET'S ROCK 156x42 at
// (154,545), the Menu stone tab (681,-10,117x46), and the Button2 111x26
// almanac (560,572) / store (680,572) pair over the lawn. Packets are 50x70:
// unavailable slots show the silhouette; picked seeds FLY to the bank (25
// ticks ease-in-out, followers compact in 15) and back (25), landing
// instantly on the next press. LET'S ROCK needs a FULL bank; Dave pre-picks 3
// on adventure replays (CrazyDavePickSeeds — his picks buzz, like retail).
// Sounds (SeedChooserScreen::MouseDown 1007-1086): TAP on picks, rock, and
// almanac/store; GRAVEBUTTON on the Menu tab; BUZZER on Dave's picks and the
// not-full rock (retail: disabled, silent release — the buzz is our feedback).
// Out of scope (noted, not invented): ViewLawn (survival-only), imitater,
// hover tooltips, and the OnStartButton LawnMessageBox warnings.
const SEED_IN_CHOOSER = 0, SEED_FLYING_TO_BANK = 1, SEED_IN_BANK = 2, SEED_FLYING_TO_CHOOSER = 3;
const CHOOSER_ROCK = { x: 154, y: 545, w: 156, h: 42 };
const CHOOSER_MENU = { x: 681, y: -10, w: 117, h: 46 };
const CHOOSER_ALMANAC = { x: 560, y: 572, w: 111, h: 26 };
const CHOOSER_STORE = { x: 680, y: 572, w: 111, h: 26 };
function chooserGridPos(i, seven) {
  return { x: (i % 8) * 53 + 22, y: Math.floor(i / 8) * (seven ? 70 : 73) + (seven ? 123 : 128) };
}
// Seed-bank slot in the chooser, REST frame (CutScene::GetSeedPositionInBank
// 289-294: bankX - widgetX + slot — the row is pinned to the LIVE bank, so
// screen pos = this + (seedBankX, seedBankY): sliding DOWN from the top
// (-87->0, same 4000-4250 window) while the panel rises from below. The bank
// rests at x=0 during choosing (the 0->10 right slide runs 4750-6000, with
// the chooser slide-off) — no +10 baked in, unlike the play bank.
function chooserBankPos(i, slots) { return { x: packetX(slots, i), y: 8 }; }
function chooserHas7Rows(avail, finished) {
  // SeedChooserScreen::Has7Rows: finished/gatling/upgrade-range. The upgrades
  // never unlock in the 1-9 scope, so finished (or a 40+ roster) decides.
  return finished || avail > 40;
}
function openChooser(level) {
  const cur = SAVE.currentUser();
  const finished = cur?.finished ?? false;
  const packetUpgrade = cur?.packetUpgrade | 0 || 0;
  // seedsAvailableFor caps at 49 (retail NUM_SEEDS_IN_CHOOSER incl. imitater);
  // this port's roster ends at index 41, so cap there too.
  const avail = Math.min(PLANTS.length, seedsAvailableFor(level, finished));
  const slots = numSeedsInBank(level, finished, packetUpgrade);
  const seven = chooserHas7Rows(avail, finished);
  G.chooserLevel = level;
  G.chosen = [];
  G.bankSeeds = []; // the bank fills at LET'S ROCK (CloseSeedChooser)
  G.chooser = { age: 0, seeds: [], inBank: 0, inFlight: 0, slots, avail, seven, level };
  for (let i = 0; i < avail; i++) {
    const gp = chooserGridPos(i, seven);
    G.chooser.seeds.push({
      seed: i, x: gp.x, y: gp.y, sx: gp.x, sy: gp.y, ex: gp.x, ey: gp.y,
      t0: 0, t1: 0, state: SEED_IN_CHOOSER, idx: -1, dave: false,
    });
  }
  // CrazyDavePickSeeds (SeedChooserScreen.cpp:202): adventure replays start
  // with 3 banked picks (weighted in source; uniform here — the eligible set
  // is tiny and level-RNG plumbing doesn't exist in this port).
  if (finished) {
    const elig = G.chooser.seeds.filter((s) => !UPGRADE_SEEDS.has(s.seed));
    for (let k = 0; k < 3 && elig.length && G.chooser.inBank < slots; k++) {
      const s = elig.splice(Math.floor(Math.random() * elig.length), 1)[0];
      const bp = chooserBankPos(G.chooser.inBank, slots);
      s.x = bp.x; s.y = bp.y; s.sx = bp.x; s.sy = bp.y; s.ex = bp.x; s.ey = bp.y;
      s.state = SEED_IN_BANK; s.idx = G.chooser.inBank; s.dave = true;
      G.chooser.inBank++;
    }
  }
}
function updateChooser() {
  // SeedChooserScreen::Update flight sweep (523-541): ease-in-out toward the
  // end point, landing exactly at mTimeEndMotion.
  const c = G.chooser;
  if (!c) return;
  c.age++;
  for (const s of c.seeds) {
    if (s.state === SEED_FLYING_TO_BANK || s.state === SEED_FLYING_TO_CHOOSER) {
      s.x = calcPosition(s.t0, s.t1, s.sx, s.ex, c.age);
      s.y = calcPosition(s.t0, s.t1, s.sy, s.ey, c.age);
      if (c.age >= s.t1) {
        s.x = s.ex; s.y = s.ey; s.t0 = 0; s.t1 = 0;
        s.state = s.state === SEED_FLYING_TO_BANK ? SEED_IN_BANK : SEED_IN_CHOOSER;
        c.inFlight--;
      }
    }
  }
}
function chooserLandFlyers() {
  // SeedChooserScreen::MouseDown (995-1001): a press while seeds are in
  // flight lands them instantly before anything else happens.
  const c = G.chooser;
  if (!c || !c.inFlight) return;
  for (const s of c.seeds) {
    if (s.state === SEED_FLYING_TO_BANK || s.state === SEED_FLYING_TO_CHOOSER) {
      s.x = s.ex; s.y = s.ey; s.t0 = 0; s.t1 = 0;
      s.state = s.state === SEED_FLYING_TO_BANK ? SEED_IN_BANK : SEED_IN_CHOOSER;
    }
  }
  c.inFlight = 0;
}
function chooserFindInBank(idx) {
  const c = G.chooser;
  for (const s of c.seeds) {
    if ((s.state === SEED_IN_BANK || s.state === SEED_FLYING_TO_BANK) && s.idx === idx) return s;
  }
  return null;
}
function chooserBankOrder() {
  // CloseSeedChooser (1108): bank slots in index order.
  const c = G.chooser;
  const out = new Array(c.inBank);
  for (const s of c.seeds) {
    if (s.state === SEED_IN_BANK || s.state === SEED_FLYING_TO_BANK) out[s.idx] = s.seed;
  }
  return out;
}
function chooserSeedAt(p) {
  // SeedChooserScreen::SeedHitTest (772): live 50x70 rects at current pos.
  const c = G.chooser;
  for (const s of c.seeds) {
    if (p.x > s.x && p.x < s.x + 50 && p.y > s.y && p.y < s.y + 70) return s;
  }
  return null;
}
function handleChooserClick(p) {
  const c = G.chooser, b = G.board;
  if (!c || !b) return;
  const inR = (r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
  // Menu stone tab (SeedChooserScreen::MouseDown 1017-1020 + ButtonDepress
  // 756-762: GRAVEBUTTON on press, then a silent DoNewOptions — so it opens
  // the options via openPauseBase directly, bypassing openPauseOptions'
  // play-screen PAUSE foley).
  if (inR(CHOOSER_MENU)) { playSfx("gravebutton"); clearSeedCursor(); openPauseBase(); G.pauseDlg = "options"; return; }
  // Almanac/Store (MouseDown 1021-1024 + ButtonDepress 739/745: TAP on press,
  // dialog on release; the dialogs are out of scope, so the menu's
  // coming-soon toasts stand in for them).
  const cur = SAVE.currentUser();
  const lv = Math.min(50, cur?.level ?? 1), finished = !!cur?.finished;
  if ((finished || lv >= 15) && inR(CHOOSER_ALMANAC)) {
    playSfx("tap");
    enterAlmanac(); // SeedChooserScreen::ButtonDepress 739: DoAlmanacDialog (modal over the chooser; closes back to it)
    return;
  }
  if ((finished || lv >= 25) && inR(CHOOSER_STORE)) {
    playSfx("tap");
    // SeedChooserScreen::ButtonDepress 745: the store opens over the chooser
    // (dialog); closing returns to the waiting seeds.
    const backTo = G.screen;
    openStore({ after: async () => { G.screen = backTo; window.__pvz.screen = backTo; } }).catch(() => {});
    return;
  }
  // LET'S ROCK (154,545 156x42): full bank only (EnableStartButton).
  // (The OnStartButton LawnMessageBox warnings are not ported — follow-up.)
  if (inR(CHOOSER_ROCK)) {
    playSfx("tap"); // MouseDown TAP (1021), even on the disabled button
    if (c.inBank === c.slots && c.inFlight === 0) {
      G.bankSeeds = chooserBankOrder();
      G.chosen = G.bankSeeds.slice();
      // NOTE: G.chooser is NOT nulled here — the widget persists and slides
      // back down with the panel (CutScene 1160-1164), like retail. Its bank
      // row stays pinned to the sliding-right bank; input is dead
      // (waitingForSeeds false) and the next startLevel rebuilds it.
      if (G.cutscene) G.cutscene.endSeedChooser();
    } else playSfx("buzzer"); // our can't-start feedback (retail: disabled, silent release)
    return;
  }
  chooserLandFlyers(); // MouseDown lands in-flight seeds first
  // Bank slots: unpick back to the chooser (ClickedSeedInBank 809), with the
  // 15-tick follower compact. Dave's picks buzz instead (CrazyDavePicked).
  for (let i = 0; i < c.slots; i++) {
    const bp = chooserBankPos(i, c.slots);
    if (p.x > bp.x && p.x < bp.x + 50 && p.y > bp.y && p.y < bp.y + 70) {
      const s = chooserFindInBank(i);
      if (!s) return;
      if (s.dave) { playSfx("buzzer"); return; } // CRAZY_DAVE wants it
      for (const f of c.seeds) {
        if ((f.state === SEED_IN_BANK || f.state === SEED_FLYING_TO_BANK) && f.idx > i) {
          const fp = chooserBankPos(f.idx - 1, c.slots);
          f.sx = f.x; f.sy = f.y; f.ex = fp.x; f.ey = fp.y;
          if (f.state === SEED_IN_BANK) c.inFlight++;
          f.t0 = c.age; f.t1 = c.age + 15;
          f.state = SEED_FLYING_TO_BANK; f.idx--;
        }
      }
      const gp = chooserGridPos(s.seed, c.seven);
      s.sx = s.x; s.sy = s.y; s.ex = gp.x; s.ey = gp.y;
      if (s.state === SEED_IN_BANK) c.inFlight++;
      s.t0 = c.age; s.t1 = c.age + 25;
      s.state = SEED_FLYING_TO_CHOOSER; s.idx = -1;
      c.inBank--;
      playSfx("tap"); // SOUND_TAP
      return;
    }
  }
  // Chooser grid: pick into the bank (ClickedSeedInChooser 842).
  const s = chooserSeedAt(p);
  if (s && s.state === SEED_IN_CHOOSER) {
    if (c.inBank >= c.slots) { playSfx("buzzer"); return; }
    const bp = chooserBankPos(c.inBank, c.slots);
    s.sx = s.x; s.sy = s.y; s.ex = bp.x; s.ey = bp.y;
    s.t0 = c.age; s.t1 = c.age + 25;
    s.state = SEED_FLYING_TO_BANK; s.idx = c.inBank;
    c.inFlight++; c.inBank++;
    playSfx("tap"); // SOUND_TAP
  }
}

// Collectible coin under a point (Coin::MouseHitTest 0x432E20: box test
// [mPosX, mPosX+mWidth) x [mPosY, mPosY+mHeight); money/sun are 60x60
// (CoinInitialize — the -10,-8 silver/gold and -15,-15 diamond shifts live
// in the Coin ctor), sun gets +15px slack, whack adds +15 size/+30 height.
// Awards use their exact art boxes. Collected/dead skipped. Shared by the
// release path and the press path so they agree.
function coinAt(b, p) {
  if (!b) return null;
  const wx = (b.isWhack || b.isVase) ? 15 : 0;
  for (const c of b.coins) {
    if (c.collected || c.dead) continue;
    if (c.isSun()) {
      // Circle approx of the widened box (source box: x +-15, y -15..h+15+30).
      const rx = 45 + wx, ry = 45 + wx + ((b.isWhack || b.isVase) ? 30 : 0);
      const dx = c.x - p.x, dy = c.y - p.y;
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1) continue;
      return c;
    }
    if (typeof c.isAward === "function" && c.isAward()) {
      const w = c.kind === "award-seed" ? 50 : c.kind === "award-shovel" || c.kind === "award-taco" ? 80 : 109;
      const h = c.kind === "award-seed" ? 70 : c.kind === "award-shovel" || c.kind === "award-taco" ? 80 : 94;
      const eb = (b.isWhack || b.isVase) ? 30 : 0;
      if (p.x < c.x - wx || p.x >= c.x + w + wx || p.y < c.y - wx || p.y >= c.y + h + wx + eb) continue;
      return c;
    }
    // Vasebreaker usable seed packets (Coin::MouseHitTest 1436-1442): a 50x70
    // box like the bank packet, unhittable while held or while any cursor is
    // already held (no stacking pickups).
    if (typeof c.isUsable === "function" && c.isUsable()) {
      if (c.held || c.collected || c.dead) continue;
      if (G.selSeed >= 0 || G.selConvIdx >= 0 || G.selUsable || G.shovelMode) continue;
      if (p.x < c.x || p.x >= c.x + 50 || p.y < c.y || p.y >= c.y + 70) continue;
      return c;
    }
    // Money (silver/gold/diamond): the source 60x60 box from the coin
    // origin — the drawn coin body sits SE of the origin, so the old
    // origin-centered r=30 circle missed clicks on the visible coin face.
    // Whack widens by +15 size / +30 height.
    if (p.x < c.x - wx || p.x >= c.x + 60 + wx || p.y < c.y - wx || p.y >= c.y + 60 + wx + ((b.isWhack || b.isVase) ? 30 : 0)) continue;
    return c;
  }
  return null;
}
// Bank widget geometry (SeedBank::Draw + GetShovelButtonRect 1307-1315):
// conveyor slots mX + mOffsetX at y=8, normal packets at GetSeedPacket-
// PositionX, shovel pinned at SHOVEL_X. Pure hit-test, no side effects — shared
// by the press and release paths so they agree on what was hit.
function bankTargetAt(b, p) {
  if (b.isConveyor) {
    const clipR = 10 + convBeltX(90) + 501; // right edge of the belt clip on screen
    for (let i = 0; i < b.convPackets.length; i++) {
      // Invisible packets (still sliding in past the clip edge) can't be
      // lifted — and clicks on the clipped-away overhang don't count.
      if (typeof b.convPacketVisible === "function" && !b.convPacketVisible(i)) continue;
      const px = 10 + convDrawX(i) + b.convPackets[i].offset;
      if (p.x > px && p.x < Math.min(px + 50, clipR) && p.y > CONV_PACKET_Y && p.y < CONV_PACKET_Y + 70) return "c" + i;
    }
  } else {
    const bank = G.bankSeeds;
    // Whack play slide (Challenge::Update 2172-2182, sim bankY): the packets
    // ride the bank down from -87 once sun exists — hit-test at the drawn pos.
    // The vase bank never slides in (adventure vase has no sun) — same -87 rest.
    const by = ((b.isWhack || b.isVase) && b.state === "play") ? b.bankY : 0;
    for (let i = 0; i < bank.length; i++) {
      const px = 10 + packetX(bank.length, i);
      if (p.x > px && p.x < px + 50 && p.y > PACKET_Y + by && p.y < PACKET_Y + by + 70) return "b" + i;
    }
  }
  if (b.showShovel) {
    // USER OVERRIDE: pinned left of the Menu button on all banks (SHOVEL_X),
    // not retail's extra+456 — except the vase bank, which keeps retail's
    // fixed slot (VASE_SHOVEL_X) since its bank never slides in.
    const shx = b.isVase ? VASE_SHOVEL_X : 10 + SHOVEL_X;
    if (p.x > shx && p.x < shx + 70 && p.y > 0 && p.y < 87) return "sh";
  }
  return null;
}
// Bank pickup on press (SeedPacket::MouseDown). HUD packets. Conveyor bank
// (SeedBank::Draw/SeedPacket::CanPickUp 687): mX + mOffsetX slots at y=8,
// always active and free — no sun/recharge checks, no tutorial transitions,
// no out-of-money buzz. Picking one up remembers its slot (WasPlanted
// removes THAT packet on planting). Normal bank (SeedBank::Draw +
// Board::GetSeedPacketPositionX): bank sits at x=10 during play; packets are
// 50x70 with tops at PACKET_Y (sun-icon top). Returns the widget key, or
// null when nothing was hit (or the press is gated).
function bankPressAt(p) {
  const b = G.board;
  if (!b) return null;
  if ((b.state === "lost" || b.state === "won") && b.ended) return null;
  if (b.state !== "play") return null;
  // Board::MouseHitTest (4229) + SeedPacket gates (663/704): no bank
  // interaction while paused or dialog-blocked.
  if (b.paused || G.pauseDlg) return null;
  // Board::MouseHitTest (4229): no bank interaction once the end-sequence
  // fade starts — coins stay live.
  if (b.fadeOut >= 0) return null;
  // Vasebreaker Dave gate (Board::MouseHitTest 4229 + Challenge::MouseDown
  // 1261-1265): no bank interaction while Dave is up mid-level — every click
  // advances the dialogue instead. A held usable seed also blocks pickup
  // (its release cancels via handleBoardClick, never steals a packet).
  if (daveUp() || G.selUsable) return null;
  // BOT-ONLY OVERRIDE (vs Board::MouseHitTest 4248, which tests the
  // seedbank before coins, so a retail press on a sun-over-packet picks up
  // the PACKET): a BOT press landing on a collectible sun/coin claims
  // nothing here — the release collects the coin, and the packet underneath
  // takes a second click. Without this, one bot click both stole the seed
  // and (same-widget release) never collected the sun at all. Human presses
  // are untouched (G.pressIsBot tags src/bot.js synthetic events).
  if (G.pressIsBot && coinAt(b, p)) return null;
  const key = bankTargetAt(b, p);
  if (!key) return null;
  if (G.shovelMode) {
    // Armed press on the bank = the same tool dispatch (Board::MouseDown
    // cursor branch runs before the shovel-button branch, so there is no
    // re-arm toggle: a plant at the press point digs, usually nothing is
    // under the slot -> FOLEY_DROP + disarm).
    if (!b.digAt(p.x, p.y)) playSfx("drop");
    clearSeedCursor();
    return key;
  }
  if (key[0] === "c") {
    const i = +key.slice(1);
    G.selSeed = b.convPackets[i].seed; G.selConvIdx = i;
    G.shovelMode = false; playSfx("seedlift");
    return key;
  }
  if (key === "sh") {
    // Board::PickUpTool SHOVEL (4376-4390): arms the shovel cursor + FOLEY_SHOVEL.
    G.shovelMode = true; G.selSeed = -1; G.selConvIdx = -1; playSfx("shovel");
    return key;
  }
  const s = G.bankSeeds[+key.slice(1)];
  if ((b.recharge[s] | 0) > 0 || b.sun < PLANTS[s].cost) {    playSfx("buzzer");
    // SeedPacket::MouseDown (738-747): a can't-afford buzz sets
    // mOutOfMoneyCounter = 70 (sun count blinks red); a recharging
    // packet only buzzes (+ first-time L1 guidance advice).
    if ((b.recharge[s] | 0) > 0) {
      if (b.firstTime && b.level === 1 && b.helpShown.CLICK_ON_SUN)
        b.displayAdvice(ADVICE_TEXT.SEED_REFRESH, "L1", "SEED_REFRESH");
    } else {
      b.outOfMoney = 70;
      if (b.firstTime && b.level === 1 && b.helpShown.CLICK_ON_SUN)
        b.displayAdvice(ADVICE_TEXT.CANT_AFFORD_PLANT, "L1", "CANT_AFFORD_PLANT");
    }
    return key;
  }
  G.selSeed = s; G.selConvIdx = -1; G.shovelMode = false; playSfx("seedlift");  // SeedPacket::MouseDown (819-833): picking up advances the tutorial.
  if (b.tutorialState === TUT.L1_PICK_UP_PEASHOOTER) b.setTutorialState(TUT.L1_PLANT_PEASHOOTER);
  else if (b.tutorialState === TUT.L2_PICK_UP_SUNFLOWER) {
    b.setTutorialState(s === 1 ? TUT.L2_PLANT_SUNFLOWER : TUT.L2_REFRESH_SUNFLOWER);
  }
  return key;
}

// Board::UpdateToolTip seed-packet/shovel branch (Board.cpp:3460-3660).
// Hovering a bank packet shows the plant name below the slot
// (GetPlantDefinition mPlantName — our SEED_NAMES match retail) plus a red
// warning when it isn't pickable. Retail chain in adventure scope:
// !mActive -> "recharging..." (WAITING_FOR_SEED); poor ->
// "not enough sun" (NOT_ENOUGH_SUN). The beghouled/slot/zombie-seed label
// branches, the cheat text, and the upgrade REQUIRES_* warnings are out of
// scope (no beghouled/slot/imitater modes, no free-planting cheat, and this
// port doesn't gate planting on repeater/melon/lily requirements, so an
// unenforced warning would lie). Conveyor packets are always active and free
// (CanPickUp 687), so they show the name with no warning.
// Visibility (3285 + CanInteractWithBoardButtons 4677): board screen, play
// state, unpaused, no dialog, no end fade — and nothing held (retail only
// allows NORMAL/HAMMER/COB_TARGET cursors, so a held seed/shovel hides it).
function boardTooltip() {
  const b = G.board;
  if (G.screen !== "board" || !b || b.state !== "play") return null;
  if (b.paused || G.pauseDlg || b.fadeOut >= 0) return null;
  if (G.selSeed >= 0 || G.selConvIdx >= 0 || G.shovelMode) return null;
  const key = bankTargetAt(b, G.mouse);
  if (!key) return null;
  // Shovel (3382-3391): label only, centered under the slot (mY = slot + 72).
  if (key === "sh") return { label: "remove a plant", warning: "", cx: (b.isVase ? VASE_SHOVEL_X : 10 + SHOVEL_X) + 35, y: 72, center: true };
  const i = +key.slice(1);
  const seed = key[0] === "c" ? b.convPackets[i].seed : G.bankSeeds[i];
  if (seed === undefined) return null;
  let warning = "";
  if (key[0] === "b") {
    if ((b.recharge[seed] | 0) > 0) warning = "recharging...";
    else if (b.sun < PLANTS[seed].cost) warning = "not enough sun";
  }
  const slotX = key[0] === "c" ? convDrawX(i) + b.convPackets[i].offset : packetX(G.bankSeeds.length, i);
  const slotY = key[0] === "c" ? CONV_PACKET_Y : PACKET_Y + (((b.isWhack || b.isVase) && b.state === "play") ? b.bankY : 0);
  // Seed packets (3658-3659): mY = slotY + 70 below the packet top.
  return { label: SEED_NAMES[seed], warning, x: 10 + slotX, y: slotY + 70, center: false };
}
// ToolTipWidget::GetLines (51A530): PICO129 word-wrap for the label.
function tipLines(label, wrapW) {
  const lines = [];
  let aLineWidth = 0, aIndexStart = 0, aIndexInLine = 0;
  while (aIndexInLine !== label.length) {
    while (aIndexInLine < label.length && label[aIndexInLine] !== " " && label[aIndexInLine] !== "\n") {
      aLineWidth += textWidth("PICO", label[aIndexInLine]); aIndexInLine++;
    }
    if (aIndexInLine !== label.length && aLineWidth < wrapW && label[aIndexInLine] !== "\n") {
      aLineWidth += textWidth("PICO", label[aIndexInLine]); aIndexInLine++;
    } else {
      lines.push(label.slice(aIndexStart, aIndexInLine));
      aLineWidth = 0;
      if (aIndexInLine < label.length && label[aIndexInLine] === "\n") aIndexInLine++;
      while (aIndexInLine < label.length && label[aIndexInLine] === " ") aIndexInLine++;
      aIndexStart = aIndexInLine;
    }
  }
  return lines;
}
// ToolTipWidget::Draw + CalculateSize (51A710/51AA50): cream box + black
// border, red PICO129 warning, black PICO129 label lines, all centered.
// Title is always empty in this scope. The warning/title height terms use
// TINYBOLD's ascent — no TinyBold art ships in this port, so the PICO ascent
// (10) stands in (1-2px box-height difference at most).
function drawBoardTooltip() {
  const t = boardTooltip();
  if (!t) return;
  const pico = font("PICO");
  if (!pico) return;
  const asc = pico.ascent || 10;
  const warnW = t.warning ? textWidth("PICO", t.warning) : 0;
  let maxW = warnW;
  const lines = tipLines(t.label, Math.max(maxW - 30, 100));
  for (const ln of lines) maxW = Math.max(maxW, textWidth("PICO", ln));
  const w = maxW + 10;
  let h = 6;
  if (t.warning) h += asc + 2;
  h += lines.length * asc + lines.length * 2 - 2;
  // Seed packets (3658-3659): mX = (50-w)/2 + bankX + slotX
  // (mCenter false); shovel (3385-3388): centered, mY = slotY + 72. Clamped
  // into the board (minLeft 0, maxBottom 600, right edge 800).
  let x = t.center ? t.cx - w / 2 : (50 - w) / 2 + t.x;
  let y = t.y;
  if (x < 0) x = 0;
  else if (x + w > 800) x = 800 - w;
  if (y < 0) y = 0;
  else if (y + h > 600) y = 600 - h;
  ctx.fillStyle = "rgb(255,255,200)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  let ty = y + 1;
  if (t.warning) {
    drawText(ctx, "PICO", t.warning, x + w / 2, ty + asc, { align: "center", color: "#f00" });
    ty += asc + 2;
  }
  for (const ln of lines) {
    drawText(ctx, "PICO", ln, x + w / 2, ty + asc, { align: "center", color: "#000" });
    ty += asc + 2;
  }
}

// Whack-a-Zombie hammer swing (Challenge::MouseDownWhackAZombie 1182-1227).
// Every swing restarts the cursor hammer at 0.2 + FOLEY_SWING; the topmost
// zombie under the (x, y-20, r45) circle takes 900 helm damage (pail clangs,
// cone plastics — whack risers are normal/cone/pail only) or, bare-headed,
// eats FOLEY_BONK + a POW burst at (x-3, y+9) and dies with loot. The hammer
// stays up via ClearCursor unless the level award dropped (1364-1367).
function whackAttackAt(p) {
  const b = G.board;
  if (!b || !b.isWhack || b.state !== "play" || b.paused || G.pauseDlg || b.fadeOut >= 0) return;
  try { if (G.hammerReanim) G.hammerReanim.animTime = 0.2; } catch (e) { /* headless */ }
  playSfx("swing");
  // Topmost overlap (GetCircleRectOverlap): draw order is later rows, then
  // smaller x, on top — the max (row, -x) key wins.
  let best = null, bestKey = -Infinity;
  for (const z of b.zombies) {
    if (z.dead || z.gone || z.mowed || z.burnT > 0) continue; // IsDeadOrDying
    if (z.bungeeState) continue; // not on the lawn yet
    const r = z.zombieRect();
    const cx = p.x, cy = p.y - 20, rad = 45;
    let dx = 0, dy = 0, xOut = false, yOut = false;
    if (cx < r.x) { xOut = true; dx = r.x - cx; }
    else if (cx > r.x + r.w) { xOut = true; dx = cx - r.x - r.w; }
    if (cy < r.y) { yOut = true; dy = r.y - cy; }
    else if (cy > r.y + r.h) { yOut = true; dy = cy - r.y - r.h; }
    let hit;
    if (!xOut && !yOut) hit = true;
    else if (xOut && yOut) hit = dx * dx + dy * dy <= rad * rad;
    else if (xOut) hit = dx <= rad;
    else hit = dy <= rad;
    if (!hit) continue;
    const key = z.row * 1000000 - z.x;
    if (key > bestKey) { bestKey = key; best = z; }
  }
  if (!best) return;
  if (best.helm > 0) {
    playSfx(best.type === "bucket" ? "shieldhit" : "plastichit");
    best.takeHelmDamage(900, 0);
  } else {
    playSfx("bonk");
    b.spawnPow(p.x - 3, p.y + 9); // PARTICLE_POW at RENDER_LAYER_ABOVE_UI
    best.dieWithLoot();
    if (b.levelAwardSpawned) G.hammerReanim = null; // ClearCursor: award drops the hammer
  }
}

function handleBoardClick(p, opts = {}) {
  const b = G.board;
  if (!b) return;
  if ((b.state === "lost" || b.state === "won") && b.ended) {
    // The modal GameOverDialog owns all end-of-loss input (TRY AGAIN /
    // MAIN MENU buttons + keys); background clicks are swallowed, so this
    // is a dead-stop guard only (ZombieWonClick is unreachable with the
    // dialog up — Board::MouseUp routes to the modal first).
    return;
  }
  if (b.state !== "play") return;
  // Vasebreaker Dave gate (Challenge::MouseDown 1261-1265): while Dave is
  // talking every board click advances the dialogue — consumed, never doubles
  // as a coin/plant click. (Cutscene clicks take the same path via
  // handleCutsceneClick/isDaveTalking.) Gated on Dave being up (MouseHitTest
  // 4229: hit-tests nothing while IsScaryPotterDaveTalking, including the
  // LEAVING walk-off) — advanceDaveDialog itself still needs msgIndex != -1.
  if (daveUp()) {
    advanceDaveDialog();
    return;
  }
  // Menu stone button (Board::MouseUp 4491-4523): clears the cursor, pauses
  // with SOUND_PAUSE, and opens the options menu. Dead while a cursor is
  // held, faded out, or dialog-blocked (CanInteractWithBoardButtons 4677).
  // BOT clicks never open it (bot.js tags its synthetic input): near-miss
  // sun/coin clicks spill onto the button and would stall the run.
  if (b.fadeOut < 0 && menuButtonEnabled() && !opts.isBot &&
      p.x > PAUSE_MENU_RECT.x && p.x < PAUSE_MENU_RECT.x + PAUSE_MENU_RECT.w &&
      p.y > PAUSE_MENU_RECT.y && p.y < PAUSE_MENU_RECT.y + PAUSE_MENU_RECT.h) {
    clearSeedCursor();
    openPauseOptions();
    return;
  }
  // coins/sun first (Coin::MouseHitTest: box test; sun gets +15px slack).
  // Award coins use their exact art boxes (seeds 50x70, shovel 80x80, note
  // 109x94 main.zip) and collect through the award path (Coin::Collect 1038).
  // Shared with the press path (coinAt): a click landing on a coin collects
  // it first — and for bot presses the packet underneath is never picked up
  // (press claims nothing on coins, bot-only; humans keep retail order).
  const hit = coinAt(b, p);
  if (hit) {
    if (hit.isSun()) { hit.collected = true; playSfx("points"); return; }
    if (typeof hit.isAward === "function" && hit.isAward()) { b.collectAward(hit); return; }
    // Vasebreaker usable seed (Coin::Collect 1240-1251): the packet rides
    // the cursor (PLANT_FROM_USABLE_COIN) — picked up here, planted on the lawn.
    if (typeof hit.isUsable === "function" && hit.isUsable()) {
      if (b.pickUpUsable(hit)) G.selUsable = { seed: hit.seed, coin: hit };
      return;
    }
    // Coin::MouseDown PlayCollectSound (Coin.cpp:1327-1339): silver/gold clink
    // FOLEY_COIN (pitch 10); diamond pings SOUND_DIAMOND (raw sample, flat).
    hit.collected = true; playSfx(hit.kind === "diamond" ? "diamond" : "coin");
    if (hit.isMoney && hit.isMoney()) b.showCoinBank(); // Coin::MouseDown IsMoney
    return;
  }
  // Board::MouseHitTest (4229): no board interaction (packets/shovel/
  // planting/menu) once the end-sequence fade starts — coins stay live.
  if (b.fadeOut >= 0) return;
  // Bank pickup (SeedPacket::MouseDown): press-side path (the belt moves
  // under the cursor between press and release) + release fallback for
  // gestures whose press never hit the canvas. Skipped for bank gestures
  // (the press already picked up; a release on another packet must not
  // steal the held seed — press/release match).
  if (!opts.bankGesture && bankPressAt(p)) return;
  // Whack-a-Zombie hammer swing (Challenge::MouseDown 1312-1317): empty-lawn
  // clicks with the hammer cursor bonk the topmost overlapping riser. Coins,
  // bank, menu and held tools all consumed the click above, so reaching here
  // with nothing held means OBJECT_NONE with the hammer up. Held seeds plant
  // through the lawn path below instead.
  if (!opts.bankGesture && b.isWhack && !b.levelAwardSpawned && G.hammerReanim && G.selSeed < 0 && G.selConvIdx < 0 && !G.shovelMode) { whackAttackAt(p); return; }
  // Vasebreaker vase break (Challenge::MouseDown 1325-1329 → ScaryPotterMalletPot):
  // clicking a vase with the NORMAL cursor (nothing held, no mallet running)
  // swings the hammer. No click-count gate (unlike whack's 3-count).
  if (!opts.bankGesture && b.isVase && !b.mallet && !G.shovelMode && G.selSeed < 0 && G.selConvIdx < 0 && !G.selUsable) {
    const vg = pixelToGrid(p.x, p.y, b.bg);
    if (vg.col >= 0 && vg.row >= 0 && b.vases.some((v) => v.col === vg.col && v.row === vg.row)) {
      b.vaseMalletAt(vg.col, vg.row);
      return;
    }
  }
  // A bank press while holding a usable seed drops it back (Board::MouseDown
  // routes PLANT_FROM_USABLE_COIN to MouseDownWithPlant, whose off-lawn
  // branch Refreshes with FOLEY_DROP) instead of planting or stealing a packet.
  if (!opts.bankGesture && G.selUsable && bankTargetAt(b, p)) { playSfx("drop"); clearSeedCursor(); return; }
  // lawn (account for intro pan: boardX is 0 during play).
  // Board::PlantingPixelToGrid (Board.cpp:8967-8976 + OffsetYForPlanting
  // 8950-8964): the click Y is shifted before the grid mapping — flying
  // seeds (coffee, the only flying bank seed) and gravebuster aim 15px
  // lower, spikeweed 15px higher. (Coffee's y/y+30/y-50 sleeping-host
  // search, 8979-9007, is unmodeled — the clicked cell only.)
  let plantPy = p.y;
  if (G.selSeed === 35 || G.selSeed === 11) plantPy += 15;
  else if (G.selSeed === 21) plantPy -= 15;
  const { col, row } = pixelToGrid(p.x, plantPy, b.bg);
  // A bank gesture never touches the lawn (no drag-to-plant, no
  // click-away cancel): the held seed stays held for the next click.
  if (opts.bankGesture) return;
  // Board::ClearCursor (4644-4673): clicking away reverts PLANT to PICK_UP.
  // Off-lawn with a held cursor Refreshes with FOLEY_DROP (MouseDownWithPlant
  // 3709-3712); empty-handed clicks stay silent.
  if (col < 0 || row < 0) { if (G.selUsable) playSfx("drop"); clearSeedCursor(); return; }
  // dirt rows are not plantable (GRIDSQUARE_DIRT) — buzz like source out-of-money feedback.
  if (b.isDirtRow && b.isDirtRow(row)) { playSfx("buzzer"); return; }
  if (G.shovelMode) {
    // Release-side fallback (the press normally digs + disarms already):
    // same press semantics, so a stale armed release can't linger.
    if (!b.digAt(p.x, p.y)) playSfx("drop");
    clearSeedCursor();
    return;
  }
  if (G.selUsable) {
    // Vasebreaker usable-seed planting (MouseDownWithPlant 3948-3954):
    // plants free (no sun cost, no recharge); the coin dies on success. A
    // failed plant is silent and keeps the seed held — the unmatched-reason
    // branch (vase cells → PLANTING_NOT_HERE match no advice) just returns
    // (3715-3852), unlike the bank path which buzzes.
    if (b.plantHeldUsable(col, row)) {
      G.selUsable = null;
    }
    return;
  }
  if (G.selSeed >= 0) {
    // Board::MouseDownWithPlant: bowling plants roll from the grid corner
    // (3955-3967 + AddPlant); other conveyor levels plant normally through
    // AddPlant + WasPlanted (the held packet is consumed, 859-862). The
    // held packet is consumed in both cases (WasPlanted 859).
    if (b.isBowling) {
      if (b.plantBowler(col, row, G.selSeed, G.selConvIdx)) {
        if (!new URLSearchParams(location.search).has("freeseed")) { G.selSeed = -1; G.selConvIdx = -1; }
      } else playSfx("buzzer");
    } else if (b.plantAt(col, row, G.selSeed, G.selConvIdx)) {
      // Tutorial planting transitions run inside Board.plantAt (source 4002).
      if (!new URLSearchParams(location.search).has("freeseed")) { G.selSeed = -1; G.selConvIdx = -1; }
    } else {
      // Board::MouseDownWithPlant failed-plant reasons (Board.cpp:3715-3809):
      // gravebuster with no grave -> GRAVEBUSTERS_ON_GRAVES, aquatics off
      // water -> LILYPAD/TANGLEKELP/SEASHROOM_ON_WATER (3723-3743, each gated
      // on PLANTING_ONLY_IN_POOL), anything else on a grave ->
      // PLANT_NOT_ON_GRAVE, craters -> CANT_PLANT_THERE/NOT_ON_CRATER, all
      // MESSAGE_STYLE_HINT_FAST (advice is the feedback — retail plays no
      // foley here). Other failures keep the out-of-money-style buzz.
      // Precedence mirrors Board::CanPlantAt: the grave gate (2808) and the
      // crater gate (2826) both run BEFORE the pool gate (2841), so a grave
      // or crater cell never reports ONLY_IN_POOL — those fall through to
      // their own branches below.
      const cell = b.cell(col, row);
      if (G.selSeed === 11) {
        if (cell && !cell.grave) b.displayAdvice(ADVICE_TEXT.GRAVEBUSTERS_ON_GRAVES, "HINT_FAST", "GRAVEBUSTERS_ON_GRAVES");
        else playSfx("buzzer");
      } else if ((G.selSeed === 16 || G.selSeed === 19 || G.selSeed === 24) && !b.isPoolSquare(col, row) && !(cell && (cell.grave || cell.crater))) {
        const key = G.selSeed === 16 ? "LILYPAD_ON_WATER" : G.selSeed === 19 ? "TANGLEKELP_ON_WATER" : "SEASHROOM_ON_WATER";
        b.displayAdvice(ADVICE_TEXT[key], "HINT_FAST", key);
      } else if (G.selSeed === 35 && b.sun >= PLANTS[35].cost && !(b.recharge[35] | 0)) {
        // Coffee's only in-scope cell failure is PLANTING_NEEDS_SLEEPING
        // (no sleeping host / already waking / cell already flown —
        // Board.cpp:3840-3842). Sun/recharge failures keep the old buzz:
        // source TakeSunMoney just returns with no advice.
        b.displayAdvice(ADVICE_TEXT.PLANTING_NEED_SLEEPING, "HINT_FAST", "PLANTING_NEED_SLEEPING");
      } else if ((b.bg === BG.ROOF || b.bg === BG.BOSS) && G.selSeed !== 33 && !(cell && cell.crater) && !(cell && cell.pot && !cell.pot.dead)) {
        // Board::MouseDownWithPlant 3795-3804 (PLANTING_NEEDS_POT): nothing
        // but the pot itself plants on bare roof. First-time 5-1 teaches the
        // rule (POT1); later showings just say to pot first (POT2). The
        // crater guard preserves CanPlantAt precedence (2826 NOT_ON_CRATER
        // fires before the 2877 roof gate).
        if (b.firstTime && b.level === 41) b.displayAdvice(ADVICE_TEXT.PLANT_NEED_POT1, "HINT_FAST", "PLANT_NEED_POT1");
        else b.displayAdvice(ADVICE_TEXT.PLANT_NEED_POT2, "HINT_FAST", "PLANT_NEED_POT2");
      } else if (G.selSeed === 21 && ((b.bg === BG.ROOF || b.bg === BG.BOSS) || (b.isWaterRow && b.isWaterRow(row))) && !(cell && (cell.crater || cell.grave))) {
        // PLANTING_NEEDS_GROUND (Board.cpp:3836-3839): spikeweed on roof
        // cells and pool squares (CanPlantAt 2855-2861), crater/grave cells
        // excluded (2826/2808 fire first and own the advice).
        b.displayAdvice(ADVICE_TEXT.PLANTING_NEEDS_GROUND, "HINT_FAST", "PLANTING_NEEDS_GROUND");
      } else if (G.selSeed === 4 && b.isWaterRow && b.isWaterRow(row) && !(cell && cell.crater)) {
        // Potato in water (Board.cpp:3744-3747 + 3827-3830): on a lily it
        // reports ONLY_ON_GROUND (2905), in bare water NOT_ON_WATER (2864
        // falls through past the pool gate) — both show the same hint.
        b.displayAdvice(ADVICE_TEXT.POTATO_MINE_ON_LILY, "HINT_FAST", "POTATO_MINE_ON_LILY");
      } else if (cell && cell.grave) {
        b.displayAdvice(ADVICE_TEXT.PLANT_NOT_ON_GRAVE, "HINT_FAST", "PLANT_NOT_ON_GRAVE");
      } else if (cell && cell.crater) {
        // Board::MouseDownWithPlant (Board.cpp:3810-3818): pool craters
        // report CANT_PLANT_THERE (IsPoolSquare), lawn craters
        // PLANT_NOT_ON_CRATER — both MESSAGE_STYLE_HINT_FAST, no foley.
        if (b.isWaterRow && b.isWaterRow(row)) b.displayAdvice(ADVICE_TEXT.CANT_PLANT_THERE, "HINT_FAST", "CANT_PLANT_THERE");
        else b.displayAdvice(ADVICE_TEXT.PLANT_NOT_ON_CRATER, "HINT_FAST", "PLANT_NOT_ON_CRATER");
      } else playSfx("buzzer");
    }
  }
}

// Board::ClearCursor tutorial revert (Board.cpp:4644-4673): cancelling a
// held seed returns PLANT to PICK_UP (L1), or PLANT/REFRESH to PICK_UP vs
// REFRESH by sunflower recharge (L2).
function clearSeedCursor() {
  const b = G.board;
  // Vasebreaker usable-seed cancel (RefreshSeedPacketFromCursor →
  // DroppedUsableSeed): the held coin drops back as a fresh resting coin.
  if (b && G.selUsable) { try { b.dropHeldUsable(); } catch (e) { /* headless */ } }
  G.selUsable = null;
  if (b && G.selSeed >= 0) {
    if (b.tutorialState === TUT.L1_PLANT_PEASHOOTER) b.setTutorialState(TUT.L1_PICK_UP_PEASHOOTER);
    else if (b.tutorialState === TUT.L2_PLANT_SUNFLOWER || b.tutorialState === TUT.L2_REFRESH_SUNFLOWER) {
      b.setTutorialState(b.canPickUpSeed(1) ? TUT.L2_PICK_UP_SUNFLOWER : TUT.L2_REFRESH_SUNFLOWER);
    }
  }
  // Board::ClearCursor 4670-4673: cancelling with the shovel armed in DIG
  // reverts to PICKUP (runs even with no seed held, like the source).
  if (b && G.shovelMode && b.tutorialState === TUT.SHOVEL_DIG) b.setTutorialState(TUT.SHOVEL_PICKUP);
  // Board::ClearCursor planting-advice revert (Board.cpp:4612-4632):
  // cancelling the cursor clears a showing planting hint. Scoped to the
  // hint keys this port defines.
  if (b) for (const k of ["LILYPAD_ON_WATER", "TANGLEKELP_ON_WATER", "SEASHROOM_ON_WATER", "GRAVEBUSTERS_ON_GRAVES", "PLANT_NOT_ON_GRAVE", "PLANT_NOT_ON_CRATER", "CANT_PLANT_THERE", "PLANTING_NEED_SLEEPING", "PLANT_NEED_POT1", "PLANT_NEED_POT2", "PLANTING_NEEDS_GROUND", "POTATO_MINE_ON_LILY"]) b.clearAdvice(k);
   G.selSeed = -1; G.selConvIdx = -1; G.selUsable = null; G.shovelMode = false;
}

// ---------- pause menu (Board::KeyDown/MenuButton -> DoNewOptions/DoPauseDialog) ----------
// Source look: decomp repo images/ (grey-stone tombstone + stone pieces), NOT
// the brown-wood main.zip restyle — all loaded from src/assets/images/pause/.
// Two dialogs: the in-game options menu (NewOptionsDialog, tombstone
// IMAGE_OPTIONS_MENUBACK 423x498 + widgets) opened by the Menu stone button /
// Esc, and the GAME PAUSED LawnDialog (stone dialog frame + skull header +
// newspaper-zombie reanim + Resume footer) opened by Space. Both freeze the
// board (Board::Pause) and duck the music; stacked confirms pause on top.
const PAUSE_MENU_RECT = { x: 681, y: -10, w: 117, h: 46 }; // Board 180-181
const PAUSE_OPT = { x: 188, y: 51, w: 423, h: 498 }; // CenterDialog(menuback)
const PAUSE_SLIDER_W = 135, PAUSE_KNOB_W = 22; // Resize 145-146 (widget space)
function pimg(n) { return libs.images["pause/" + n]; }
function menuButtonEnabled() {
  const b = G.board;
  // Board::CanInteractWithBoardButtons (4677): paused, dialoged, fading, or
  // a held cursor all disable the Menu button (drawn the same, just dead).
  return !!(b && !b.paused && !G.pauseDlg && b.fadeOut < 0 &&
    G.selSeed < 0 && G.selConvIdx < 0 && !G.selUsable && !G.shovelMode);
}
// GameButton::DrawStoneButton (GameButton.cpp:14): left/middle-tiled/right
// IMAGE_BUTTON pieces + white DWARF18(GREENINSET) label, everything +1/+1
// when down. Our DWARF strips are white-at-load, so the green comes from the
// draw color (retail bakes it into the font art; same pixels either way).
function drawStoneButton(x, y, w, h, label, down = false, hi = false) {
  const L = pimg(down ? "button_down_left.png" : "button_left.png");
  const M = pimg(down ? "button_down_middle.png" : "button_middle.png");
  const R = pimg(down ? "button_down_right.png" : "button_right.png");
  if (L && M && R) {
    const ox = down ? 1 : 0;
    ctx.drawImage(L, x + ox, y + (down ? 1 : 0));
    let ax = x + 36 + ox;
    const rep = Math.max(0, Math.floor((w - 36 - 35) / 46));
    for (let i = 0; i < rep; i++) { ctx.drawImage(M, ax, y + (down ? 1 : 0)); ax += 46; }
    ctx.drawImage(R, ax, y + (down ? 1 : 0));
  }
  // Source label baseline (DrawStoneButton 44-45, C++ int math):
  // y + (h - asc/6 - 1 + asc)/2 - 4 (asc/6 truncates: 25/6 = 4).
  const asc = (font("DWARF18") || {}).ascent || 25;
  const by = y + Math.floor((h - Math.floor(asc / 6) - 1 + asc) / 2) - 4 + (down ? 1 : 0);
  drawText(ctx, "DWARF18", label, x + w / 2 + 1 + (down ? 1 : 0), by,
    { align: "center", color: hi ? "#7ddc5f" : "#3da33d" });
}
// LawnDialog::Draw (LawnDialog.cpp:294): dialog_* 9-patch starting at
// DIALOG_HEADER_OFFSET (45) + the skull dialog_header plate on top.
function drawPauseFrame(x, y, w, h) {
  const tl = pimg("dialog_topleft.png"), tm = pimg("dialog_topmiddle.png"), tr = pimg("dialog_topright.png");
  const cl = pimg("dialog_centerleft.png"), cm = pimg("dialog_centermiddle.png"), cr = pimg("dialog_centerright.png");
  const bl = pimg("dialog_bottomleft.png"), bm = pimg("dialog_bottommiddle.png"), br = pimg("dialog_bottomright.png");
  if (!tl || !cm) return;
  const repX = Math.max(0, Math.floor((w - 120 - 107) / 93));
  const repY = Math.max(0, Math.floor((h - 97 - 112 - 45) / 54));
  let px = x, py = y + 45;
  ctx.drawImage(tl, px, py); px += 107;
  for (let i = 0; i < repX; i++) { ctx.drawImage(tm, px, py); px += 93; }
  ctx.drawImage(tr, px, py);
  py += 97;
  for (let r = 0; r < repY; r++) {
    px = x;
    ctx.drawImage(cl, px, py); px += 107;
    for (let i = 0; i < repX; i++) { ctx.drawImage(cm, px, py); px += 93; }
    ctx.drawImage(cr, px, py);
    py += 54;
  }
  px = x;
  ctx.drawImage(bl, px, py); px += 107;
  for (let i = 0; i < repX; i++) { ctx.drawImage(bm, px, py); px += 93; }
  ctx.drawImage(br, px, py);
  const hd = pimg("dialog_header.png");
  if (hd) ctx.drawImage(hd, x + (w - 187) / 2 - 5, y);
}
// LawnDialog::CalcSize (LawnDialog.cpp:84) for our fixed dialogs: width from
// the header + content insets (36/46), min 320, rounded up to the 93px
// topmiddle grid (+93 when lines exist); height from insets + header + the
// dialog's extra + lines + 30 + button height (24), min 256 (97+114+45),
// rounded to the 54px center grid. Font metrics come from our strips.
function lawnPauseGeom(kind) {
  const F = font("DWARF24"), f = font("HoT16");
  // Source header block (LawnDialog::Draw 352-360): baseline at fontY -
  // ascentPad + ascent, then lines start at baseline - ascent + height +
  // spaceAfterHeader (height = GetHeight = strip height 39 for DWARF24).
  // User override: the whole header block sits 6px above the source numbers
  // (user-verified against retail; the decomp build appears to differ here).
  const headH = (F && F.lineH) - 6 + (kind === "paused" ? 155 : 10); // height + spaceAfterHeader
  let header, lines, buttons;
  if (kind === "paused") {
    header = "GAME PAUSED"; // DoPauseDialog literals (LawnApp.cpp:726-728)
    lines = ["Click to resume game"];
    buttons = [{ id: "resume", label: "Resume Game" }];
  } else if (kind === "gameover") {
    // GameOverDialog adventure (CutScene 1559 + ctor 441-470): header
    // [GAME_OVER], EMPTY message (survival's flag line is out of scope),
    // single footer button relabeled [TRY_AGAIN]. The MAIN MENU tab is a
    // separate screen-corner button (ctor 465, GAMEOVER_MENU_RECT), not a
    // dialog footer button. Empty message adds 15 to the top inset (458).
    header = "GAME OVER";
    lines = [];
    buttons = [{ id: "tryagain", label: "Try Again" }];
  } else if (kind === "confirmRestart") {
    header = "Restart Level?"; // [RESTART_LEVEL_HEADER]
    lines = ["Do you want to try this level", "again from the beginning?"]; // [RESTART_LEVEL_BODY]
    buttons = [{ id: "yes", label: "RESTART LEVEL" }, { id: "no", label: "CANCEL" }]; // [RESTART_LABEL] missing in repo strings; retail value
  } else if (kind === "confirmLeave") {
    header = "Leave Game?";
    lines = ["Do you want to return", "to the main menu?", "", "Your game will be saved."];
    buttons = [{ id: "yes", label: "LEAVE" }, { id: "no", label: "CANCEL" }]; // [LEAVE_BUTTON] + [DIALOG_BUTTON_CANCEL]
  } else if (kind === "daveOffer") {
    // DIALOG_PURCHASE_PACKET_SLOT (CutScene 1654): header = the slot
    // cost, body = "Upgrade to {SLOTS} seed slots?"
    // ([UPGRADE_DIALOG_BODY], slots = owned + 7), YES/NO buttons.
    const o = G.daveOffer || { cost: 75, slots: 7 };
    header = getMoneyString(o.cost);
    lines = [`Upgrade to ${o.slots} seed slots?`];
    buttons = [{ id: "yes", label: "YES" }, { id: "no", label: "NO" }]; // BUTTONS_YES_NO
  } else {
    // ContinueDialog adventure branch: header [CONTINUE_GAME_HEADER], body
    // [CONTINUE_GAME_OR_RESTART], stacked Continue + Restart buttons (the
    // retail footer Cancel was removed per user request — Esc still backs out
    // to the menu with the save kept). Neither key ships in the available
    // strings data (TodStringTranslate would render "<Missing ...>"), so the
    // header/body below are plain-English stand-ins in the same voice; the
    // button labels ARE the real retail strings ([CONTINUE_BUTTON]/
    // [RESTART_BUTTON]).
    header = "Continue Game?";
    lines = ["Do you want to continue your saved game", "or restart the level from the beginning?"];
    buttons = [{ id: "cont", label: "Continue" }, { id: "restart", label: "Restart" }];
  }
  let w = 36 + 46 + textWidth("DWARF24", header);
  if (w <= 320) w = 320;
  else { const ex = (w - 320) % 93; if (ex) w += 93 - ex; }
  if (lines.length) w += 93; // CalcSize 116: lines widen by one topmiddle
  if (kind === "paused") w += 93; // room for the newspaper reanim: the zombie
  // stands at x+72 (~60px wide) and would otherwise cover the centered lines
  const lh = (f && f.lineH) || 22;
  const h0 = 35 + 36 + headH + (lines.length * lh + 30) + 24;
  let h = Math.max(256, h0);
  const eh = (h - 256) % 54; if (eh) h += 54 - eh;
  // USER OVERRIDE (user request): the restart + leave confirms get one extra
  // 54px frame row so their body lines aren't cramped. Stays on the 54px
  // grid the tiled frame needs; buttons (h-80) + centered lines follow h.
  if (kind === "confirmRestart" || kind === "confirmLeave") h += 54;
  // ContinueDialog keeps one extra 54px row (GetPreferredHeight +40 tall
  // bottom) so the pair + body sit lower in the frame, per user request.
  if (kind === "continue") h += 54;
  const x = Math.round((800 - w) / 2), y = Math.round((600 - h) / 2);
  // LawnDialog::Resize (228): single footer button centers; two buttons split.
  const areaW = w - 46 - 36 + 8, areaX = 31, btnY = h - 80;
  const round46 = (v) => { const r = v % 46; return r <= 0 ? v : v + 46 - r; };
  let btns;
  if (buttons.length === 1) {
    const bw = 71 + round46(areaW - 46 - 71 + 1);
    btns = [{ ...buttons[0], x: x + areaX + (areaW - bw) / 2, y: y + btnY, w: bw, h: 46 }];
  } else {
    const bw = 71 + round46((areaW - 10) / 2 - 46 - 71 + 1);
    btns = [
      { ...buttons[0], x: x + areaX, y: y + btnY, w: bw, h: 46 },
      { ...buttons[1], x: x + areaX + areaW - bw, y: y + btnY, w: bw, h: 46 },
    ];
  }
  // Lines block: vertically centered in the remaining area below the header.
  // The PAUSED dialog anchors at the header top (the zombie fills the left,
  // so the line centers beside it); confirms anchor below the header text.
  // The continue dialog keeps its extra row, so its pair + body center lower
  // in the taller frame (user request).
  const fontY = kind === "gameover" ? 95 : 80; // content.top(35) + headerOffset(45) — Draw 352; gameover empty message adds 15 to the top inset (ctor 457-460)
  const anchor = kind === "paused" ? fontY : fontY + headH;
  const avail = h - 36 - 24 - anchor - 55;
  const linesY = anchor + (avail - lines.length * lh) / 2;
  return { x, y, w, h, header, lines, btns, lh, linesY, fontY,
    zombie: kind === "paused" ? { x: x + 72, y: y + 87 } : null }; // ReanimationWidget at (72,42+45)
}
// Pause widget geometry (dialog-absolute NewOptionsDialog::Resize 142-166).
function pauseSliderRect(id) {
  const o = PAUSE_OPT;
  const r = id === "music" ? { x: 199, y: 116 } : { x: 199, y: 143 };
  return { x: o.x + r.x, y: o.y + r.y, w: PAUSE_SLIDER_W, h: 40 };
}
function pauseSliderVal(id) {
  // NewOptionsDialog ctor 49-55: music 0..1, sfx scaled by /0.65.
  return id === "music" ? getMusicVolume() : Math.max(0, Math.min(1, getSfxVolume() / 0.65));
}
function applyPauseSlider(id, v) {
  // NewOptionsDialog::SliderVal (193-211): music + sfx (x0.65) live.
  if (id === "music") { setMusicVolume(v); SAVE.setOptions({ music: v }); }
  else { setSfxVolume(v * 0.65); SAVE.setOptions({ sfx: v * 0.65 }); }
}
function pauseWidgetAt(p, armDrag = false) {
  // Top dialog wins (WidgetManager modal focus); confirms stack over options.
  // Reachable mid-chooser too (the chooser's Menu tab opens DoNewOptions).
  if (!G.pauseDlg || (G.screen !== "board" && G.screen !== "cutscene")) return null;
  const inR = (r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  if (G.pauseDlg === "options") {
    const o = PAUSE_OPT;
    for (const id of ["music", "sfx"]) {
      const r = pauseSliderRect(id);
      if (inR(r)) {
        // Slider::MouseDown (79-97): thumb grabs into a drag, else a bar jump.
        const tx = r.x + pauseSliderVal(id) * (PAUSE_SLIDER_W - PAUSE_KNOB_W);
        if (p.x >= tx && p.x < tx + PAUSE_KNOB_W) {
          if (armDrag) G.sliderDrag = { id, value: pauseSliderVal(id), relX: p.x - tx, originX: r.x };
          return "d" + id; // drag key: release is a no-op (already applied)
        }
        return "s" + id;
      }
    }
    const W = (rx, ry, w, h, id) => ({ id, r: { x: o.x + rx, y: o.y + ry, w, h } });
    for (const b of [W(284, 206, 46, 45, "fullscreen"), W(283, 175, 46, 45, "accel"),
        W(107, 284, 209, 46, "restart"), W(107, 327, 209, 46, "mainmenu"),
        W(30, 381, 360, 100, "backtogame")])
      if (inR(b.r)) return b.id;
    return null;
  }
  const g = lawnPauseGeom(G.pauseDlg);
  for (const b of g.btns) if (inR(b)) return b.id;
  return null;
}
function openPauseBase() {
  // LawnApp::ModalOpen (1147): any dialog pauses the board; Board::Pause
  // (4768) shows the coin bank when the profile holds coins + pauses music.
  const b = G.board;
  if (b) {
    b.paused = true;
    if (SAVE.getCoins() > 0) b.showCoinBank(); // default 1000 ticks
  }
  setMusicPaused(true);
}
function openPauseOptions() {
  // Board::MouseUp menu button (4491) / KeyDown Escape (7876): clear cursor,
  // SOUND_PAUSE, DoNewOptions(false).
  clearSeedCursor();
  playSfx("pause");
  openPauseBase();
  G.pauseDlg = "options";
}
async function openPausedDialog() {
  // Board::KeyDown Space (7864) + CanPauseNow -> SOUND_PAUSE + DoPauseDialog
  // (GAME PAUSED + newspaper zombie + Resume footer).
  playSfx("pause");
  try { await needDefs(["Zombie_paper"]); } catch (e) { /* headless */ }
  openPauseBase();
  G.pauseDlg = "paused";
  G.pauseZombie = null;
  try {
    const z = new Reanimation(DEFS.get("Zombie_paper"), 0, 0);
    z.playReanim("anim_idle", LOOP, 0, 12);
    const g = lawnPauseGeom("paused");
    z.x = g.zombie.x; z.y = g.zombie.y;
    G.pauseZombie = z;
  } catch (e) { G.pauseZombie = null; }
}
function openPauseConfirm(kind) {
  playSfx("gravebutton"); // LawnDialog::ButtonPress on the options button
  G.pauseDlg = kind; // stacked over options; board stays paused
}
function closePauseTop() {
  playSfx("gravebutton");
  if (G.pauseDlg === "options" || G.pauseDlg === "paused") closeAllPause();
  // A confirm nested under another dialog (Restart under Continue) backs out
  // to its parent; top-level confirms back out to the options menu.
  else if (G.pauseReturn) { G.pauseDlg = G.pauseReturn; G.pauseReturn = null; }
  else G.pauseDlg = "options"; // confirm No/Esc drops back to the menu
}
function closeAllPause() {
  // LawnApp::KillDialog (1163): with no dialogs left, unpause + focus back.
  G.pauseDlg = null; G.pausePress = null; G.pauseZombie = null; G.sliderDrag = null; G.pauseReturn = null;
  if (G.board) G.board.paused = false;
  setMusicPaused(false);
}
async function doPauseRestart() {
  // NewOptionsDialog Restart (333): confirm YES -> StopAllMusic +
  // CancelPausedFoleyLoop + PreNewGame (fresh run of the same level).
  playSfx("gravebutton");
  const lv = G.board ? G.board.level : 1;
  stopMusic(); stopAllLoops();
  closeAllPause();
  await startLevel(lv);
}
// Board::NeedSaveGame (Board.cpp:322): adventure-ish modes + SCENE_PLAYING.
// The port is adventure-only, so the gate is just "live play": a board on the
// board screen in active play (not won/lost/fading, not the cutscene/chooser).
function boardNeedSaveGame() {
  const b = G.board;
  return !!(G.screen === "board" && b && b.state === "play" && b.fadeOut < 0 && !b.ended);
}
async function doPauseLeave() {
  // MainMenu (309): adventure always NeedSaveGame (PLAYING) -> confirm;
  // YES ->TryToSaveGame + DoBackToMain (Dialog 1891: BOARDRESULT_QUIT,
  // TryToSaveGame, DoBackToMain = WriteCurrentUserConfig + KillBoard +
  // ShowGameSelector).
  boardTryToSaveGame();
  playSfx("gravebutton");
  stopMusic(); stopAllLoops();
  closeAllPause();
  G.board = null; G.cutscene = null; G.bankSeeds = [];
  G.selSeed = -1; G.selConvIdx = -1; G.shovelMode = false; G.dave = null;
  G.readyReanim = null; G.finalReanim = null; G.wonReanim = null; G.sodRolls = null;
  G.awardSeed = 0; G.coinsStart = 0;
  await enterMenu();
}
// Board::TryToSaveGame (Board.cpp:301): snapshot the live board into this
// profile's save slot (the userdata/game*.dat file, per mPlayerInfo->mId).
// WriteCurrentUserConfig needs no call here — the profile store persists on
// every mutation, so the save rides along with the profile record.
function boardTryToSaveGame() {
  const b = G.board;
  if (!boardNeedSaveGame()) return; // cutscene/chooser/ended: nothing to save
  try {
    SAVE.setAdvSave({ level: b.level, snap: b.saveGame(G.bankSeeds) });
  } catch (e) { /* a failed snapshot must never block the exit */ }
}
// ContinueDialog Cancel (adventure ButtonDepress else-branch): KillDialog +
// ShowGameSelector with the save file KEPT, so a later Adventure click offers
// Continue again.
async function doContinueCancel() {
  playSfx("gravebutton");
  stopMusic(); stopAllLoops();
  closeAllPause();
  G.board = null; G.cutscene = null; G.bankSeeds = [];
  G.selSeed = -1; G.selConvIdx = -1; G.shovelMode = false; G.dave = null;
  G.readyReanim = null; G.finalReanim = null; G.wonReanim = null; G.sodRolls = null;
  G.awardSeed = 0; G.coinsStart = 0;
  await enterMenu();
}
function activatePauseWidget(k) {
  if (G.pauseDlg === "options") {
    if (k === "backtogame") { closePauseTop(); return; } // ID_OK resume
    if (k === "restart") { openPauseConfirm("confirmRestart"); return; }
    if (k === "mainmenu") { openPauseConfirm("confirmLeave"); return; }
    if (k === "fullscreen") { // MakeNewCheckbox Fullscreen (source toggles windowed)
      playSfx("gravebutton");
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen().catch(() => {});
      return;
    }
    if (k === "accel") { // HardwareAcceleration: no web equivalent — inert (noted)
      playSfx("gravebutton");
      return;
    }
    return; // sliders ("s*"/"d*") already applied on press/drag
  }
  if (G.pauseDlg === "paused" && k === "resume") { closePauseTop(); return; } // ID_FOOTER
  // ContinueDialog buttons: Continue consumes the save and unpauses into the
  // resumed board; Restart nests the RESTARTCONFIRM dialog (adventure:
  // [RESTART_LEVEL_HEADER]/[RESTART_LEVEL], YES=[RESTART_BUTTON]). No Cancel
  // button per user request — Esc still backs out to the menu (save kept).
  if (G.pauseDlg === "continue") {
    if (k === "cont") { playSfx("gravebutton"); SAVE.clearAdvSave(); closeAllPause(); return; } // RestartLoopingSounds: no looping sounds in this port
    if (k === "restart") { G.pauseReturn = "continue"; openPauseConfirm("confirmRestart"); return; }
    return;
  }
  if ((G.pauseDlg === "confirmRestart" || G.pauseDlg === "confirmLeave") && k === "yes") {
    if (G.pauseDlg === "confirmRestart") doPauseRestart();
    else doPauseLeave();
    return;
  }
  if ((G.pauseDlg === "confirmRestart" || G.pauseDlg === "confirmLeave") && k === "no") {
    closePauseTop();
  }
}
// NewOptionsDialog::Draw (169): IMAGE_OPTIONS_MENUBACK + DWARF18 labels +
// sliders, checkboxes, stone buttons, BackToGame image button.
function drawPauseOptionsMenu() {
  const o = PAUSE_OPT;
  const bg = pimg("options_menuback.png");
  if (bg) ctx.drawImage(bg, o.x, o.y);
  const downId = G.pausePress;
  const hov = (id) => pauseWidgetAt(G.mouse) === id; // hover follow (no modal focus tracking in port)
  // Labels (186-189): right-aligned DWARF18 in (107,109,145), no outline.
  drawText(ctx, "DWARF18", "Music", o.x + 186, o.y + 140, { align: "right", color: "#6b6d91", outline: "#6b6d91" });
  drawText(ctx, "DWARF18", "Sound FX", o.x + 186, o.y + 167, { align: "right", color: "#6b6d91", outline: "#6b6d91" });
  drawText(ctx, "DWARF18", "3D Acceleration", o.x + 274, o.y + 197, { align: "right", color: "#6b6d91", outline: "#6b6d91" });
  drawText(ctx, "DWARF18", "Full Screen", o.x + 274, o.y + 229, { align: "right", color: "#6b6d91", outline: "#6b6d91" });
  // Sliders (145-146): 135x40 widgets; 3-slice 45px track + 22x29 knob.
  for (const id of ["music", "sfx"]) {
    const r = pauseSliderRect(id);
    const slot = pimg("options_sliderslot.png"), knob = pimg("options_sliderknob2.png");
    if (slot) {
      const ty = r.y + (40 - 10) / 2;
      ctx.drawImage(slot, 0, 0, 45, 10, r.x, ty, 45, 10);
      ctx.drawImage(slot, 45, 0, 45, 10, r.x + 45, ty, 45, 10);
      ctx.drawImage(slot, 90, 0, 45, 10, r.x + 90, ty, 45, 10);
    }
    if (knob) {
      const v = (G.sliderDrag && G.sliderDrag.id === id) ? G.sliderDrag.value : pauseSliderVal(id);
      ctx.drawImage(knob, r.x + v * (PAUSE_SLIDER_W - PAUSE_KNOB_W), r.y + (40 - 29) / 2);
    }
  }
  // Checkboxes (147-148): 42x39 art in the 46x45 slot; fullscreen is live.
  const fsOn = !!document.fullscreenElement;
  const fsImg = pimg(fsOn ? "options_checkbox1.png" : "options_checkbox0.png");
  if (fsImg) ctx.drawImage(fsImg, o.x + 284 + 2, o.y + 206 + 3);
  const acImg = pimg("options_checkbox1.png"); // 3D accelerated: always on (inert, noted above)
  if (acImg) ctx.drawImage(acImg, o.x + 283 + 2, o.y + 175 + 3);
  // Stone buttons (149-151): almanac HIDDEN in adventure 1-9 scope (the
  // AlmanacDialog itself is out of scope, like the menu's coming-soon toast;
  // source keeps the other buttons at their fixed spots when one hides).
  drawStoneButton(o.x + 107, o.y + 284, 209, 46, "Restart Level", downId === "restart", hov("restart"));
  drawStoneButton(o.x + 107, o.y + 327, 209, 46, "Main Menu", downId === "mainmenu", hov("mainmenu"));
  // BackToGame image button (29-47, 152): 360x100 art + DWARF24 white label
  // (retail 36GREENINSET, baseline 381-5+(100-8+48-1)/2 = 445; no 36px strip
  // in port — the bundle's copy is a blank stub — so DWARF24 stands in with
  // the baseline set to keep the approved pixels after the glyph fix).
  const bb0 = pimg("options_backtogamebutton0.png"), bb2 = pimg("options_backtogamebutton2.png");
  const bbDown = downId === "backtogame", bbHi = hov("backtogame");
  const bb = (bbDown ? bb2 : bb0) || bb0 || bb2;
  if (bb) ctx.drawImage(bb, o.x + 30, o.y + 381);
  drawText(ctx, "DWARF24", "Back To Game", o.x + 30 + 180 - 2, o.y + 381 + 48 + (bbDown ? 1 : 0),
    { align: "center", color: "#fff" });
}
// GAME PAUSED + restart/leave confirms (LawnDialog family).
function drawLawnPauseDialog() {
  const g = lawnPauseGeom(G.pauseDlg);
  drawPauseFrame(g.x, g.y, g.w, g.h);
  // Header (Draw 352-360): DWARF24 gold, centered; lines (362-376): DWARF15
  // gold, vertically centered in the remaining area. Baselines follow the
  // source formulas (header = fontY - pad + ascent; first line = rect top +
  // ascent - pad) minus the 6px user override in lawnPauseGeom.
  drawText(ctx, "DWARF24", g.header, g.x + g.w / 2, g.y + g.fontY + 24, { align: "center", color: "#e0bb62" });
  g.lines.forEach((ln, i) => {
    if (ln) drawText(ctx, "HoT16", ln, g.x + g.w / 2, g.y + g.linesY + 19 + i * g.lh, { align: "center", color: "#e0bb62" });
  });
  // Newspaper zombie reanim (DoPauseDialog 732: AddReanimation(72,42) LOOP).
  if (G.pauseZombie) G.pauseZombie.draw(ctx, 0, 0);
  const downId = G.pausePress;
  for (const b of g.btns) {
    const hov = pauseWidgetAt(G.mouse) === b.id;
    drawStoneButton(b.x, b.y, b.w, b.h, b.label, downId === b.id, hov);
  }
}
// Board::DrawTopRightUI (7317): the Menu stone button at (681,-10,117x46)
// (a tab hanging half offscreen; only ~36px shows).
function drawPauseMenuButton() {
  const r = PAUSE_MENU_RECT;
  const hov = menuButtonEnabled() && G.mouse.x >= r.x && G.mouse.x < r.x + r.w && G.mouse.y >= 0 && G.mouse.y < r.y + r.h;
  drawStoneButton(r.x, r.y, r.w, r.h, "Menu", false, hov);
}

// ---------- render helpers (real game art only) ----------
function Mimg(name) { return (libs.menu && libs.menu[name]) || null; }
function hovered(r) { return G.mouse.x > r.x && G.mouse.x < r.x + r.w && G.mouse.y > r.y && G.mouse.y < r.y + r.h; }
// GameSelector button anchors (GameSelector.cpp TrackButton:850-860 + Resize sizes).
// Button XY = SelectorScreen reanim track transform + offset; the reanim sits at
// rest in IDLE so these are static: adventure (405,80)/(start 405,65),
// survival (406,173), challenges (410,258), vasebreaker (413,328), and the rest
// off BG_Right (71,41): zen +(100,360), options +(494,434), quit +(644,469),
// help +(576,458), almanac +(256,387), store +(334,441), change off woodsign2
// (25,126)+(24,10). Hit sizes are the MakeNewButton Resize() values.
// Foreground flower click spots (GameSelector.cpp gFlowerCenter).
const FLOWER_CENTERS = [[765, 483], [663, 455], [701, 439]];
function trackPos(name, ox = 0, oy = 0) {
  const FALLBACK = {
    "SelectorScreen_StartAdventure_button": [405, 65],
    "SelectorScreen_Adventure_button": [405, 80],
    "SelectorScreen_Survival_button": [406, 173],
    "SelectorScreen_Challenges_button": [410, 258],
    "SelectorScreen_ZenGarden_button": [413, 328],
    "SelectorScreen_BG_Right": [71, 41],
    "SelectorScreen_BG_Left": [0, -80],
    "woodsign2": [25, 126],
    "woodsign1": [22, -8],
  };
  let x, y;
  const r = G.menuReanim;
  if (r) {
    try {
      const t = r.getCurrentTransform(r.findTrackIndex(name));
      x = t.x; y = t.y;
    } catch (e) { x = undefined; }
  }
  if (x === undefined) [x, y] = FALLBACK[name] || [0, 0];
  return { x: Math.round(x + ox), y: Math.round(y + oy) };
}
function menuRects() {
  const cur = SAVE.currentUser();
  const lv = Math.min(50, cur?.level ?? 1);
  const finished = !!cur?.finished;
  const fresh = !finished && lv === 1; // SyncProfile mShowStartButton
  // SyncProfile: minigame/puzzle/survival unlock on finish (+ per-mode flags
  // our profiles don't track yet — finished only).
  const unlocked = finished;
  const ap = trackPos(fresh ? "SelectorScreen_StartAdventure_button" : "SelectorScreen_Adventure_button");
  const adv = {
    id: "adventure", x: ap.x, y: ap.y, w: 330, h: 125,
    img: fresh ? "SelectorScreen_StartAdventure_Button1.png" : "SelectorScreen_Adventure_button.png",
    hi: fresh ? "SelectorScreen_StartAdventure_Highlight.png" : "SelectorScreen_Adventure_highlight.png",
  };
  const sp = trackPos("SelectorScreen_Survival_button");
  const cp = trackPos("SelectorScreen_Challenges_button");
  const zp = trackPos("SelectorScreen_ZenGarden_button");
  // SyncButtons greys locked tombstones (COLOR_BKG 128) but leaves them
  // visible; clicking one pops the MODE_LOCKED dialog (ButtonDepress).
  const locked = [
    { id: "minigame", x: sp.x, y: sp.y, w: 313, h: 130, img: "SelectorScreen_Survival_button.png", hi: "SelectorScreen_Survival_highlight.png", locked: !unlocked },
    { id: "puzzle", x: cp.x, y: cp.y, w: 286, h: 121, img: "SelectorScreen_Challenges_button.png", hi: "SelectorScreen_Challenges_highlight.png", locked: !unlocked },
    { id: "survival", x: zp.x, y: zp.y, w: 266, h: 124, img: "SelectorScreen_Vasebreaker_button.png", hi: "SelectorScreen_vasebreaker_highlight.png", locked: !unlocked },
  ];
  const bg = trackPos("SelectorScreen_BG_Right");
  // LawnApp::CanShowAlmanac/Store/ZenGarden — SyncButtons sets mVisible, so
  // locked ones are hidden entirely (never greyed, never clickable).
  const showAlmanac = finished || lv >= 15;
  const showStore = finished || lv >= 25; // (+ mHasSeenUpsell, untracked)
  const showZen = finished || lv >= 45;
  return {
    adv, locked, fresh, lv,
    zen: showZen ? { id: "zen", x: bg.x + 100, y: bg.y + 360, w: 130, h: 130, img: "SelectorScreen_ZenGarden.png", hi: "SelectorScreen_ZenGardenHighlight.png", ix: 0, iy: 0 } : null,
    almanac: showAlmanac ? { id: "almanac", x: bg.x + 256, y: bg.y + 387, w: 128, h: 128, img: "SelectorScreen_Almanac.png", hi: "SelectorScreen_AlmanacHighlight.png", ix: 0, iy: 0 } : null,
    store: showStore ? { id: "store", x: bg.x + 334, y: bg.y + 441, w: 170, h: 89, img: "SelectorScreen_Store.png", hi: "SelectorScreen_StoreHighlight.png", ix: 0, iy: 0 } : null,
    options: { id: "options", x: bg.x + 494, y: bg.y + 434, w: 81, h: 54, img: "SelectorScreen_Options1.png", hi: "SelectorScreen_Options2.png", ix: 0, iy: 15 },
    help: { id: "help", x: bg.x + 576, y: bg.y + 458, w: 48, h: 55, img: "SelectorScreen_Help1.png", hi: "SelectorScreen_Help2.png", ix: 0, iy: 30 },
    quit: { id: "quit", x: bg.x + 644, y: bg.y + 469, w: 57, h: 37, img: "SelectorScreen_Quit1.png", hi: "SelectorScreen_Quit2.png", ix: 5, iy: 5 },
    change: (() => { const ws = trackPos("woodsign2"); return { id: "change", x: ws.x + 24, y: ws.y + 10, w: 250, h: 30 }; })(),
  };
}
// Generic dialog frame from the real dialog_* 9-patch pieces.
function drawDialog9(x, y, w, h) {
  const I = libs.images;
  const tl = I["dialog_topleft.png"], tm = I["dialog_topmiddle.png"], tr = I["dialog_topright.png"];
  const cl = I["dialog_centerleft.png"], cm = I["dialog_centermiddle.png"], cr = I["dialog_centerright.png"];
  const bl = I["dialog_bottomleft.png"], bm = I["dialog_bottommiddle.png"], br = I["dialog_bottomright.png"];
  const hd = I["dialog_header.png"];
  if (!tl || !cm) { ctx.fillStyle = "rgba(20,12,6,0.92)"; ctx.fillRect(x, y, w, h); return; }
  const tH = 97, bH = 114, lW = 107, rW = 120;
  ctx.drawImage(tl, x, y);
  ctx.drawImage(tm, x + lW, y, w - lW - rW, tH);
  ctx.drawImage(tr, x + w - rW, y);
  const midH = h - tH - bH;
  ctx.drawImage(cl, x, y + tH, lW, midH);
  ctx.drawImage(cm, x + lW, y + tH, w - lW - rW, midH);
  ctx.drawImage(cr, x + w - rW, y + tH, rW, midH);
  ctx.drawImage(bl, x, y + h - bH);
  ctx.drawImage(bm, x + lW, y + h - bH, w - lW - rW, bH);
  ctx.drawImage(br, x + w - rW, y + h - bH);
  if (hd) ctx.drawImage(hd, x + (w - 187) / 2, y - 18);
}
// Dialog button from the real button_left/middle/right (+down) pieces.
// Label is HouseofTerror16 (the DWARVENTODCRAFT15 button font reuses the
// HoT16 strips) in white, centered.
function drawWoodButton(r, label) {
  const dn = hovered(r);
  const L = libs.images[dn ? "button_down_left.png" : "button_left.png"];
  const M = libs.images[dn ? "button_down_middle.png" : "button_middle.png"];
  const Rr = libs.images[dn ? "button_down_right.png" : "button_right.png"];
  if (L && M && Rr) {
    const h = 46, y = r.y + (r.h - h) / 2;
    ctx.drawImage(L, r.x, y, 36, h);
    ctx.drawImage(M, r.x + 36, y, Math.max(1, r.w - 71), h);
    ctx.drawImage(Rr, r.x + r.w - 35, y, 35, h);
  } else {
    const up = libs.images["options_backtogamebutton0.png"];
    if (up) ctx.drawImage(up, r.x, r.y, r.w, r.h);
    else { ctx.fillStyle = "#5a3a18"; ctx.fillRect(r.x, r.y, r.w, r.h); }
  }
  drawText(ctx, "HoT16", label, r.x + r.w / 2, r.y + r.h / 2 + 7, { align: "center", color: "#fff" });
}

function drawCover(img) {
  if (!img) { ctx.fillStyle = "#2a4d1e"; ctx.fillRect(0, 0, W, H); return; }
  const s = Math.max(W / img.width, H / img.height);
  const w = img.width * s, h = img.height * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

// Board::GetSeedBankExtraWidth — retail right-end bar stretch for >6 packets.
// Retained as the source formula for reference; the shovel no longer uses it
// (USER OVERRIDE: pinned at SHOVEL_X on all banks).
function bankExtra(n) { return n <= 6 ? 0 : n === 7 ? 60 : n === 8 ? 76 : n === 9 ? 112 : 153; }
// Conveyor packet geometry (Board::GetSeedPacketPositionX conveyor branch,
// Board.cpp:8935 + SeedPacket mY): x = i*50+91, y = 8.
const CONV_PACKET_Y = 8; // SeedPacket mY on the conveyor bank
// USER OVERRIDE (not retail): the retail conveyor cluster ends 2px from the
// Menu tab (shovel bank 609..679 vs Menu at 681; the 81px shovel art even
// overhangs 2px under it). Shift the whole conveyor cluster left so the belt
// and shovel sit clear of the Menu button. Source positions minus CONV_SHIFT,
// and the shovel bank hugs the belt backdrop (4px gap, same as the Menu gap).
const CONV_SHIFT = 14;
// USER OVERRIDE: the 81px shovel art overhangs 7px left of its bank slot,
// so it visually touches the belt frame. Shift the belt art + packets 4px
// further left (the shovel slot itself does not move — its Menu gap stays).
const CONV_BELT_GAP = 4;
const convDrawX = (i) => conveyorPacketX(i) - CONV_SHIFT - CONV_BELT_GAP;
const convBeltX = (x) => x - CONV_SHIFT - CONV_BELT_GAP;
// Shovel bank x: belt backdrop (83 x 516 wide) right edge + 4px, all shifted.
// USER OVERRIDE: the shovel is pinned slightly left of the Menu button on ALL
// banks (local 593 -> screen 603..673, art 596..677, 4px before Menu at 681),
// instead of retail's extra+456 right-after-the-packets (Board 1309).
const SHOVEL_X = 83 - CONV_SHIFT + 516 + 4;
// Vasebreaker shovel slot (Board::GetShovelButtonRect 1307-1315): retail's
// fixed extra+456 — extra is 0 for the 1-packet vase bank (bankExtra) —
// drawn UNtranslated by Board::DrawShovel even while the bank slides, so it
// stays up top while the vase bank hides. This port's bank art rides +10
// right (drawSeedBank xOff), so the slot lands at screen 10+456.
// (Whack keeps the USER OVERRIDE pin: its bank slides in with the shovel.)
const VASE_SHOVEL_X = 10 + 456;
// Board::GetSeedPacketPositionX (non-conveyor bank).
// Packets sit 9px down so their tops align with the top of the sun icon in
// the minimal dial art (icon rows 9-56 of SeedBank.png) — no brown bar.
const PACKET_Y = 9;
function packetX(n, i) {
  if (n <= 7) return i * 59 + 85;
  if (n === 8) return i * 54 + 81;
  if (n === 9) return i * 52 + 80;
  return i * 51 + 79;
}
// Upgrade-family seeds use the cell-1 packet bg (Plant::IsUpgrade); only
// gatling is reachable in L1-9.
const UPGRADE_SEEDS = new Set([40]);
function drawPacket(x, y, w, h, seed, opts = {}) {
  // SeedPacket::Draw/DrawSeedPacket: 50x70 packet, bg cell from seeds.png
  // (2 = normal, 1 = upgrade) + baked plant art from packet_plants.png —
  // all blitted 1:1, never scaled. Explode-o-nut uses the baked Wallnut
  // cell red-tinted (PACKET41, prebuilt 50x70) so its icon is exactly
  // Wallnut-sized.
  // Cost: PICO129 black, right edge at packet x+30, baseline y+66.
  // Conveyor packets (opts.noCost) show no cost and never grey out
  // (SeedPacket::Draw 613-617 + 651: aDrawCost=false skips both the number
  // and the poor tint; they are always active and free). Award packets
  // (opts.award: the dropped FINAL_SEED_PACKET coin + the 2x award-screen
  // packet) DO show the cost (Coin::Draw 873 + AwardScreen::DrawAwardSeed 200
  // both pass theDrawCost=true) but skip every bank state — poor, recharge,
  // selected, tutorial flash — since DrawSeedPacket is called directly with
  // grayness 255 / percentDark 0. Chooser packets (opts.chooser:
  // SeedChooserScreen::Draw 361-363/388-402) are the same: the chooser passes
  // percentDark=0 and only the grayness varies (55 dim copies, 115
  // not-recommended, 255 normal), so no bank state ever darkens them.
  const b = G.board;
  const def = PLANTS[seed];
  const sx = w / 50, sy = h / 70; // bank calls with 50x70 (1:1); chooser passes bigger boxes
  const strip = libs.images["seeds.png"]; // real packet-bg strip, 9 cells of 50x70
  const plants = libs.images["packet_plants.png"]; // real baked plant icons, 50x70 cells
  const cell = UPGRADE_SEEDS.has(seed) ? 1 : 2;
  const drawArt = () => {
    if (strip) {
      ctx.drawImage(strip, cell * 50, 0, 50, 70, x, y, w, h);
    } else {
      ctx.fillStyle = "#8a6b3a";
      ctx.fillRect(x, y, w, h);
    }
    if (seed === 41) {
      // Red-tinted baked Wallnut icon (PACKET41), blitted 1:1 exactly like
      // every other packet — same size as the Wallnut packet.
      if (!PACKET41) PACKET41 = buildPacket41(plants);
      if (PACKET41) {
        ctx.drawImage(PACKET41, x, y, w, h);
      } else if (plants) {
        ctx.drawImage(plants, 3 * 50, 0, 50, 70, x, y, w, h); // untinted fallback
      }
    } else if (plants && seed < plants.width / 50) {
      ctx.drawImage(plants, seed * 50, 0, 50, 70, x, y, w, h);
    } else {
      const still = STILLS.get(seed);
      if (still) {
        ctx.globalAlpha = opts.ghost ? 0.6 : 1;
        ctx.drawImage(still, x + 3 * sx, y + 3 * sy, w - 6 * sx, h - 26 * sy);
        ctx.globalAlpha = 1;
      }
    }
  };
  ctx.save();
  drawArt();
  // SeedPacket::Draw (631-645) + DrawSeedPacket (274-278): the tutorial
  // packet pulses GREY while its PICK_UP state waits with timer -1 —
  // aGrayness = GetFlashingColor(MainCounter, 75): 55 + 200*|37-age|/37,
  // i.e. 55 (dark) .. 255 (normal). Applied as multiply colorize over the
  // packet ART only (bg + plant; the cost stays black, drawn later).
  // Else-if with the poor/recharge tint below, like the source chain.
  let flashG = -1;
  if (!opts.chooser && !opts.award && b && !opts.bad && !opts.selected && ((b.tutorialState === TUT.L1_PICK_UP_PEASHOOTER && b.tutorialTimer === -1 && seed === 0) ||
      (b.tutorialState === TUT.L2_PICK_UP_SUNFLOWER && seed === 1))) {
    const age = (b.tick | 0) % 75;
    flashG = Math.max(0, Math.min(255, Math.round(55 + 200 * Math.abs(37 - age) / 37)));
  }
  if (flashG >= 0 && flashG < 255) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply"; // SetColor + SetColorizeImages
    ctx.fillStyle = `rgb(${flashG},${flashG},${flashG})`;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  // SeedChooserScreen grey-out (Draw 391-393: not-recommended / not-allowed
  // packets draw with grayness 115). Same multiply colorize over the art;
  // the cost draws after, so it stays black like the source.
  if (opts.grey != null && opts.grey < 255) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = `rgb(${opts.grey},${opts.grey},${opts.grey})`;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  // Two darkness values (SeedPacket::Draw/DrawSeedPacket):
  // - SELECTED (held in cursor): MouseDown Deactivate()s the packet
  //   (mActive=false, refreshTime=0) -> percentDark = 1.0, the WHOLE packet
  //   redrawn very dark (64-grey). This is the very dark one.
  // - RECHARGING (!mActive + refreshing): percentDark = remaining fraction;
  //   whole packet tinted 128-grey, top 68*f+2px zone redrawn 64-grey.
  // - POOR (unaffordable): grayness-128 whole tint, no shade zone.
  // (Canvas approximation: tint = black veil over opaque art; the zone
  // re-blits the art then veils it darker, like the source re-draw.)
  const cd = (b && !opts.chooser) ? (b.recharge[seed] | 0) : 0;
  const poor = (!opts.chooser && ((b && b.sun < def.cost && !opts.noCost && !opts.award)) || opts.bad);
  let percentDark = 0;
  if (!opts.chooser && !opts.award && opts.selected) percentDark = 1;
  else if (!opts.chooser && !opts.award && cd > 0) percentDark = Math.min(1, cd / def.refresh);
  if (flashG < 0 && (poor || percentDark > 0)) {
    ctx.fillStyle = "rgba(0,0,0,0.5)"; // 128-grey tint
    ctx.fillRect(x, y, w, h);
  }
  // SeedPacket::Draw (631-642): the tutorial packet flashes while its
  // PICK_UP state waits with timer -1 (GetFlashingColor bounce on tick%75).
  // Never while selected (can't coincide in source: picked-up != waiting).
  // (Handled above as multiply-grey on the art; the white overlay that was
  // here did not match source — DrawSeedPacket colorizes, never whitens.)
  // SeedPacket::Draw 556-562: PICO129 black, right edge at packet x+30,
  // baseline y+66. Drawn AFTER the dark zone (source order) so the cost is
  // never buried under the shade redraw. Source never reddens the cost — the
  // grey packet overlay signals poor.
  // USER OVERRIDE (font-fix follow-up): the bitmap-font ascent fix moved all
  // text down to source-exact placement (PICO +2px), which left the cost
  // sitting too low in its strip — baseline back up 2px to y+64 to restore
  // the approved pre-fix on-screen position.
  const costStr = String(def.cost);
  const drawCost = () => {
    if (opts.noCost) return; // conveyor/slot packets show no cost (613-617)
    ctx.save();
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    // round:false: the cost rides the packet art (which blits at fractional
    // positions while the award coin falls/flies). Whole-pixel glyph snapping
    // would make the number jitter against the smoothly-moving packet.
    drawText(ctx, "PICO", costStr, x / sx + 32 - textWidth("PICO", costStr) - 2 / sx, y / sy + 63 + 1 / sy, { color: "#000", round: false });
    ctx.restore();
  };
  if (percentDark > 0) {
    // 64-grey zone redraw from the top: 68*percentDark+2 (DrawSeedPacket).
    // Selected = full packet (the very dark one); recharge = partial.
    const zh = Math.round((68 * percentDark + 2) * sy);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, zh); ctx.clip();
    drawArt();
    ctx.fillStyle = "rgba(0,0,0,0.75)"; // 64-grey over the re-blitted art
    ctx.fillRect(x, y, w, zh);
    ctx.restore();
  }
  drawCost();
  ctx.restore();
}

const STILLS = new Map();
window.__pvz.STILLS = STILLS;
// Explode-o-nut packet icon: the baked Wallnut packet cell (packet_plants
// cell 3) red-tinted (255,64,64 multiply, same as the rollers), prebuilt once
// to a 50x70 canvas so the packet blits it 1:1 — pixel-identical size to the
// Wallnut packet. (Cell 49's baked art carries a gold packet bg, so it can't
// be blitted; a rendered Wallnut still is a different size/pose.)
let PACKET41 = null;
function buildPacket41(plants) {
  try {
    const src = plants || libs.images["packet_plants.png"];
    if (!src || !src.width) return null;
    const cv = document.createElement("canvas");
    cv.width = 50; cv.height = 70;
    const g2 = cv.getContext("2d");
    g2.drawImage(src, 3 * 50, 0, 50, 70, 0, 0, 50, 70);
    g2.globalCompositeOperation = "multiply"; // colorize: tint existing pixels
    g2.fillStyle = "rgb(255,64,64)";
    g2.fillRect(0, 0, 50, 70);
    g2.globalCompositeOperation = "destination-in"; // multiply fills clear pixels too — restore the alpha mask
    g2.drawImage(src, 3 * 50, 0, 50, 70, 0, 0, 50, 70);
    g2.globalCompositeOperation = "source-over";
    return cv;
  } catch (e) { return null; }
}
// Chilled-zombie tint (Zombie::Draw 5088): colorize (75,75,255) base + the
// same coat additively — fully OPAQUE, never dimmed. Canvas can't colorize
// in one blit, so the body is drawn to a scratch canvas and pixel-tinted:
// rgb -> (2r*75/255, 2g*75/255, min(255,2b)) (base coat + additive coat),
// alpha untouched. Only runs for chilled zombies.
// Scratch-box geometry: the box MUST contain the whole visual, including the
// polevaulter's flip (its pole swings ~190px left of the sim origin while the
// body rotates — measured live: pole tip at sim-x-188). The old 320x320 box at
// (-90,-190) amputated anything past x-90, and the earlier-drawn plants showed
// through the gap, reading as "the plant clips the zombie in half" (reported
// for a snow pea left of the jumped plant: the chill is what routed the
// vaulter through this scratch path). Retail has no box (software tint), so a
// bigger box is purely an artifact removal, not a behavior change.
const CHILL_BOX_W = 448, CHILL_BOX_H = 384, CHILL_BOX_OX = 256, CHILL_BOX_OY = 192;
const chillCv = document.createElement("canvas");
chillCv.width = CHILL_BOX_W; chillCv.height = CHILL_BOX_H;
const chillCx = chillCv.getContext("2d", { willReadFrequently: true });
// Split-coat zombie damage flash (user override). Source flashes the body
// group (DrawReanim 5630) and the shield group (5668) at the same full
// grayness (counter*10, up to 250) — but a raw additive coat on light armor
// (white pails, gray doors, orange cones, paper, ladders) adds past white
// and clips to a flat featureless sheet that reads as see-through against
// the lawn. So the armor tracks take a BLEND-TOWARD-WHITE coat instead of
// an additive one: each armor pixel moves rgb -> rgb+(255-rgb)*k (alpha
// untouched), which lifts brightness with the hit but never clips detail.
// The main coat still EXCLUDES the armor tracks (sim armorFlashTracks) and
// flashes the body at full source strength.
const armorFilterCache = new Map(); // type -> {isA, notA} (null = no armor)
// Armor-coat scratch canvas (same box as chillCv — must contain the whole
// visual for the same pole-flip reason; armored vaulters route here too).
const flashCv = document.createElement("canvas");
flashCv.width = CHILL_BOX_W; flashCv.height = CHILL_BOX_H;
const flashCx = flashCv.getContext("2d", { willReadFrequently: true });
// Sunshroom dance overlay clip (seed 9 producing frames only): the
// head_producing cel is a soft dome ~10-20px larger than the cap with a
// translucent halo + denser bottom rim. Retail never plays these anims (no
// code references anim_producing/anim_bigproducing), so the spill never
// shows there; the user-requested dance revealed it as a beige fringe on the
// lawn. The overlay is clipped to the head-cap silhouette per frame: base
// pass without the overlay, then the overlay masked by the head track.
const SHROOM_BOX_W = 200, SHROOM_BOX_H = 170, SHROOM_BOX_OX = 80, SHROOM_BOX_OY = 110;
const shroomCv = document.createElement("canvas");
shroomCv.width = SHROOM_BOX_W; shroomCv.height = SHROOM_BOX_H;
const shroomCx = shroomCv.getContext("2d", { willReadFrequently: true });
const shroomMaskCv = document.createElement("canvas");
shroomMaskCv.width = SHROOM_BOX_W; shroomMaskCv.height = SHROOM_BOX_H;
const shroomMaskCx = shroomMaskCv.getContext("2d", { willReadFrequently: true });
function drawDancingSunshroom(p, camX, camY, pf, gf, hl) {
  const body = p.body, tracks = body.tracks, def = body.def;
  const hpIdx = [], headIdx = [];
  for (let i = 0; i < def.tracks.length; i++) {
    const n = def.tracks[i].name.toLowerCase();
    if (n === "head_producing") hpIdx.push(i);
    else if (n === "head") headIdx.push(i);
  }
  if (!hpIdx.length || !headIdx.length) {
    // Single exclusive additive coat (user override): source UpdateReanimColor
    // runs highlight / beghouled / eaten as an if/else chain (Plant.cpp 2707),
    // so only ONE extra additive ever draws — never highlight + glow stacked
    // (that double coat is what bleached flower heads featureless). Damage
    // keeps its blend coat below (pre-existing override).
    if (hl > 0) body.draw(ctx, camX, camY, 0, hl, 0, null, null);
    else body.draw(ctx, camX, camY, 0, 0, gf, headGlowFilter);
    if (pf > 0) drawPlantDamage(p, ctx, camX, camY, pf);
    return;
  }
  const saved = tracks.map((t) => t.renderGroup);
  const restore = () => { for (let i = 0; i < tracks.length; i++) tracks[i].renderGroup = saved[i]; };
  const bx = Math.round(p.x - SHROOM_BOX_OX + camX), by = Math.round(p.y - SHROOM_BOX_OY + camY);
  try {
    // Base pass: everything except the spillover overlay (normal + the single
    // exclusive additive coat above; the damage coat below sees the same
    // track set).
    for (const i of hpIdx) tracks[i].renderGroup = RENDER_GROUP_HIDDEN;
    if (hl > 0) body.draw(ctx, camX, camY, 0, hl, 0, null, null);
    else body.draw(ctx, camX, camY, 0, 0, gf, headGlowFilter);
    if (pf > 0) drawPlantDamage(p, ctx, camX, camY, pf);
    // Mask = head-cap silhouette at its current (possibly blended) pose.
    for (let i = 0; i < tracks.length; i++) tracks[i].renderGroup = headIdx.includes(i) ? saved[i] : RENDER_GROUP_HIDDEN;
    shroomMaskCx.save();
    shroomMaskCx.setTransform(1, 0, 0, 1, 0, 0);
    shroomMaskCx.clearRect(0, 0, SHROOM_BOX_W, SHROOM_BOX_H);
    shroomMaskCx.globalAlpha = 1;
    body.drawTracks(shroomMaskCx, 1, camX - bx, camY - by);
    shroomMaskCx.restore();
    // Layer = overlay tracks only, kept where the cap is.
    for (let i = 0; i < tracks.length; i++) tracks[i].renderGroup = hpIdx.includes(i) ? saved[i] : RENDER_GROUP_HIDDEN;
    shroomCx.save();
    shroomCx.setTransform(1, 0, 0, 1, 0, 0);
    shroomCx.clearRect(0, 0, SHROOM_BOX_W, SHROOM_BOX_H);
    shroomCx.globalAlpha = 1;
    shroomCx.globalCompositeOperation = "source-over";
    body.drawTracks(shroomCx, 1, camX - bx, camY - by);
    shroomCx.globalCompositeOperation = "destination-in";
    shroomCx.drawImage(shroomMaskCv, 0, 0);
    shroomCx.restore();
    restore();
    // Blits mirror body.draw's single exclusive pass for these tracks:
    // normal + ONE additive coat (highlight wins over glow, like the source
    // if/else chain) — never both stacked.
    const ob = hl > 0 ? hl : gf;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(shroomCv, bx, by);
    if (ob > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.min(1, ob);
      ctx.drawImage(shroomCv, bx, by);
    }
    ctx.restore();
    if (pf > 0) {
      // Damage coat on the clipped overlay (blend-toward-white, opaque —
      // mirrors drawPlantDamage).
      const id = shroomCx.getImageData(0, 0, SHROOM_BOX_W, SHROOM_BOX_H), d = id.data;
      const k = Math.min(1, pf);
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        d[i] += (255 - d[i]) * k;
        d[i + 1] += (255 - d[i + 1]) * k;
        d[i + 2] += (255 - d[i + 2]) * k;
      }
      shroomCx.putImageData(id, 0, 0);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(shroomCv, bx, by);
      ctx.restore();
    }
  } finally {
    restore();
  }
}
function drawZombieFlash(z, c2, camX, camY, zf, clipRect = null) {
  let e = armorFilterCache.get(z.type);
  if (e === undefined) {
    const list = armorFlashTracks(z.type);
    e = list.length ? { isA: (n) => list.includes(n), notA: (n) => !list.includes(n) } : null;
    armorFilterCache.set(z.type, e);
  }
  // draw(ctx, camX, camY, group, flash, flash2, flash2Filter, flashFilter, clipRect):
  // main coat (half zf — user override, see below) skips armor; the armor
  // coat below replaces it.
  // Main-coat strength (user override): source flashes the body additively at
  // the full counter*10/255 (up to 0.98, brightness ~doubles), which clips
  // pupils, mouth/teeth detail, tie stripes and pale gear to a flat white
  // sheet that reads as see-through. The coat stays additive (lighter, alpha
  // untouched) but runs at half strength to match the armor coat's lift, so
  // the hit still pops while wrinkles, stripes and pupils stay readable.
  const mf = zf * 0.5;
  if (zf > 0 && e) {
    z.body.draw(c2, camX, camY, 0, mf, 0, null, e.notA, clipRect);
    // Armor coat: armor tracks to scratch (mul 1 = normal alpha; the filter
    // only applies on a flash pass), lerp toward white, blit back opaque.
    // Blitted under an identity transform: tracks bake camX/camY into
    // absolute canvas coords (setTransform), so the box offset must too.
    const bx = Math.round(z.x - CHILL_BOX_OX + camX), by = Math.round(z.y - CHILL_BOX_OY + camY);
    const scratchClip = clipRect ? [clipRect[0] - bx, clipRect[1] - by, clipRect[2], clipRect[3]] : null;
    flashCx.save();
    flashCx.setTransform(1, 0, 0, 1, 0, 0);
    flashCx.clearRect(0, 0, CHILL_BOX_W, CHILL_BOX_H);
    flashCx.globalAlpha = 1;
    z.body.drawTracks(flashCx, 1, camX - bx, camY - by, 0, e.isA, scratchClip);
    flashCx.restore();
    const k = Math.min(1, zf) * 0.5;
    const id = flashCx.getImageData(0, 0, CHILL_BOX_W, CHILL_BOX_H), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      d[i] += (255 - d[i]) * k;
      d[i + 1] += (255 - d[i + 1]) * k;
      d[i + 2] += (255 - d[i + 2]) * k;
    }
    flashCx.putImageData(id, 0, 0);
    c2.save();
    c2.setTransform(1, 0, 0, 1, 0, 0);
    c2.drawImage(flashCv, bx, by);
    c2.restore();
  }
  else z.body.draw(c2, camX, camY, 0, mf, 0, null, null, clipRect);
}
function drawPlantDamage(p, c2, camX, camY, pf, group = 0) {
  // Plant damage coat (user override). Same problem the zombie armor had: a
  // raw additive coat on pale art (snow/garlic/potato whites) adds past white
  // and clips to a flat featureless sheet that reads as see-through against
  // the lawn. So the damage flash takes a BLEND-TOWARD-WHITE coat instead of
  // an additive one: the whole plant to scratch, each pixel moved
  // rgb -> rgb+(255-rgb)*k (alpha untouched), blitted back opaque. Brightness
  // lifts with the hit but nothing clips, so detail never washes out.
  // group selects the reanim render group (pumpkin-back layer passes 1).
  const bx = Math.round(p.x - CHILL_BOX_OX + camX), by = Math.round(p.y - CHILL_BOX_OY + camY);
  flashCx.save();
  flashCx.setTransform(1, 0, 0, 1, 0, 0);
  flashCx.clearRect(0, 0, CHILL_BOX_W, CHILL_BOX_H);
  flashCx.globalAlpha = 1;
  p.body.drawTracks(flashCx, 1, camX - bx, camY - by, group);
  flashCx.restore();
  const k = Math.min(1, pf);
  const id = flashCx.getImageData(0, 0, CHILL_BOX_W, CHILL_BOX_H), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    d[i] += (255 - d[i]) * k;
    d[i + 1] += (255 - d[i + 1]) * k;
    d[i + 2] += (255 - d[i + 2]) * k;
  }
  flashCx.putImageData(id, 0, 0);
  c2.save();
  c2.setTransform(1, 0, 0, 1, 0, 0);
  c2.drawImage(flashCv, bx, by);
  c2.restore();
}
function drawChilledZombie(z, camX, camY, flash, clipRect = null) {
  // Water-track color exemption (Zombie::SetupWaterTrack + DrawTrack): foam
  // tracks carry mIgnoreColorOverride / mIgnoreExtraAdditiveColor, so the
  // whole-body software tints (chill blue 5088, mind purple 5611, burn black
  // 5589) skip them — the wake stays white on a chilled swimmer. The flagged
  // instances hide during the tinted scratch render, then paint straight
  // through afterwards, untinted (mul=1 honors the name filter at identical
  // alpha; the clip rides along but these tracks ignore it anyway). No
  // attachments hang off foam tracks (pole = Zombie_flaghand, armor = its
  // own tracks), so hiding them hides nothing else.
  const wt = hideWaterTracks(z);
  const swHidden = hideSeaweeds(z);
  try {
    const bx = Math.round(z.x - CHILL_BOX_OX + camX), by = Math.round(z.y - CHILL_BOX_OY + camY);
    chillCx.save();
    chillCx.setTransform(1, 0, 0, 1, 0, 0);
    chillCx.clearRect(0, 0, CHILL_BOX_W, CHILL_BOX_H);
    drawZombieFlash(z, chillCx, camX - bx, camY - by, flash, clipRect ? [clipRect[0] - bx, clipRect[1] - by, clipRect[2], clipRect[3]] : null);
    chillCx.restore();
    const id = chillCx.getImageData(0, 0, CHILL_BOX_W, CHILL_BOX_H), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, (d[i] * 150 / 255) | 0);
      d[i + 1] = Math.min(255, (d[i + 1] * 150 / 255) | 0);
      d[i + 2] = Math.min(255, d[i + 2] * 2);
    }
    chillCx.putImageData(id, 0, 0);
    ctx.drawImage(chillCv, bx, by);
  } finally {
    restoreSeaweeds(swHidden);
    restoreWaterTracks(z, wt.saved);
  }
  drawSeaweed(z, camX, camY, clipRect);
  drawWaterTracks(z, camX, camY, clipRect, wt.names);
}
// Mind-controlled zombies (Zombie::DrawReanim 5611): the whole body — normal +
// shield groups — renders under a purple color override
// ZOMBIE_MINDCONTROLLED_COLOR (128,0,192, Zombie.h:36) with a matching
// additive coat (aExtraAdditiveColor, same color), exactly parallel to the
// chilled-blue path above. Same scratch-box technique (retail software-tints,
// no box): draw the normal + flash passes to scratch, then per-pixel
// rgb -> (2r*128/255, 0, min(255,2b*192/255)) with alpha untouched.
// The hit flash (5630/5668) rides along via drawZombieFlash like the chill
// path. Allies can never be chilled (CanBeChilled 8002), so the mind branch
// sits before the chill branch — order is cosmetic, noted.
function drawMindControlledZombie(z, camX, camY, flash, clipRect = null) {
  const wt = hideWaterTracks(z); // foam skips the purple tint, like the chill blue
  const swHidden = hideSeaweeds(z); // attached seaweed skips the purple tint too
  try {
    const bx = Math.round(z.x - CHILL_BOX_OX + camX), by = Math.round(z.y - CHILL_BOX_OY + camY);
    chillCx.save();
    chillCx.setTransform(1, 0, 0, 1, 0, 0);
    chillCx.clearRect(0, 0, CHILL_BOX_W, CHILL_BOX_H);
    drawZombieFlash(z, chillCx, camX - bx, camY - by, flash, clipRect ? [clipRect[0] - bx, clipRect[1] - by, clipRect[2], clipRect[3]] : null);
    chillCx.restore();
    const id = chillCx.getImageData(0, 0, CHILL_BOX_W, CHILL_BOX_H), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, (d[i] * 256 / 255) | 0);
      d[i + 1] = 0;
      d[i + 2] = Math.min(255, (d[i + 2] * 384 / 255) | 0);
    }
    chillCx.putImageData(id, 0, 0);
    ctx.drawImage(chillCv, bx, by);
  } finally {
    restoreSeaweeds(swHidden);
    restoreWaterTracks(z, wt.saved);
  }
  drawSeaweed(z, camX, camY, clipRect);
  drawWaterTracks(z, camX, camY, clipRect, wt.names);
}
// Burned zombies (Zombie::DrawReanim 5589-5594): the whole body — normal +
// shield groups — renders under a pure-black color override (0,0,0,alpha)
// with NO additive coat. Canvas can't colorize in one blit, so like the
// chill tint the body is drawn to the scratch canvas and every pixel's rgb
// is zeroed (alpha untouched). Only runs while burnT > 0.
function drawBurnedZombie(z, camX, camY, clipRect = null) {
  const wt = hideWaterTracks(z); // foam skips the black tint, like the chill blue
  const swHidden = hideSeaweeds(z); // attached seaweed skips the black tint too
  try {
    const bx = Math.round(z.x - CHILL_BOX_OX + camX), by = Math.round(z.y - CHILL_BOX_OY + camY);
    chillCx.save();
    chillCx.setTransform(1, 0, 0, 1, 0, 0);
    chillCx.clearRect(0, 0, CHILL_BOX_W, CHILL_BOX_H);
    z.body.draw(chillCx, camX - bx, camY - by, 0, 0, 0, null, null,
      clipRect ? [clipRect[0] - bx, clipRect[1] - by, clipRect[2], clipRect[3]] : null);
    chillCx.restore();
    const id = chillCx.getImageData(0, 0, CHILL_BOX_W, CHILL_BOX_H), d = id.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; }
    chillCx.putImageData(id, 0, 0);
    ctx.drawImage(chillCv, bx, by);
  } finally {
    restoreSeaweeds(swHidden);
    restoreWaterTracks(z, wt.saved);
  }
  drawSeaweed(z, camX, camY, clipRect);
  drawWaterTracks(z, camX, camY, clipRect, wt.names);
}
// Freeze cubes (Zombie::DrawIceTrap 6112-6150): IMAGE_ICETRAP2 behind the body,
// IMAGE_ICETRAP in front (theFront ? ICETRAP : ICETRAP2), both top-left
// anchored at (46 + typeDX, bodyY + 92 + typeDY) in zombie space (bodyY =
// -altitude; scale on garg/bungee only), skipped in pool and on the boss
// (6114). Same origin the thaw burst uses (+75/+106 vs the cube's +75/+128 —
// the burst sits inside the cube). FRONT = icetrap.png 66x30, BACK =
// icetrap2.png 54x30, main.zip bytes.
function drawIceTrap(z, camX, camY, front) {
  const img = libs.images[front ? "icetrap.png" : "icetrap2.png"];
  if (!img || !img.width) return;
  let dx = 0, dy = 0, s = 1;
  switch (z.type) {
    case "pogo": dx = -10; dy = 20; break;
    case "garg": dx = -20; dy = -7; s = 1.6; break;
    case "bungee": dx = -45; dy = -23; s = 1.2; break;
    case "digger": dx = -27; break;
    case "catapult": dx = 32; break;
    case "balloon": dx = -9; dy = 27; break;
  }
  const bodyY = -(z.altitude | 0);
  ctx.drawImage(img, z.x + 46 + dx + camX, z.y + bodyY + 92 + dy + camY,
    img.width * s, img.height * s);
}
// Dancing-zombie spotlight (Zombie::DrawDancerReanim 5518-5562): only the
// troupe leader (ZOMBIE_DANCER — backups never draw it) gets the light, and
// only outside the intro/snap/normal beats — SNAPPING_WITH_LIGHT, HOLD and
// every dance/raise beat DO light up (5522). Color is the age-cycled 5-stop
// table (mZombieAge/100*7%5 once age>=700, else the yellow stop): yellow,
// green, purple, slate-blue, pink. The floor glow (IMAGE_SPOTLIGHT2 50x20 @4x
// = 200x80, top-left (-30,+60) in the zombie's (mX,mY) frame) draws BEFORE
// the body; the beam (IMAGE_SPOTLIGHT 50x155 @4x = 200x620 at (-30,-480))
// draws right AFTER it — both SetColorizeImages-multiplied by the stop
// color, ignoring the body's chill/flash/fade overrides. The won screen
// (port "lost") kills it like SCENE_ZOMBIES_WON.
const DANCER_LIGHTS = [[250, 250, 160], [114, 234, 170], [216, 126, 202], [90, 110, 140], [240, 90, 130]];
function dancerSpotColor(z) {
  if (z.type !== "dancer" || z.dead || z.gone) return null; // PHASE_ZOMBIE_DYING
  if (z.phase === "dancein" || z.phase === "snap" || z.phase === "normal") return null; // 5522
  if (G.board && G.board.state === "lost") return null; // SCENE_ZOMBIES_WON
  return DANCER_LIGHTS[z.age >= 700 ? (Math.floor(z.age / 100) * 7) % 5 : 0];
}
function drawDancerSpotlight(z, camX, camY, before) {
  const col = dancerSpotColor(z);
  if (!col) return;
  const img = libs.images[before ? "spotlight2.png" : "spotlight.png"];
  if (!img || !img.width) return;
  // TodDrawImageScaledF top-left-anchored 4x blit; the tint rides the shared
  // multiply cache (SetColor + SetColorizeImages).
  const t = tintedParticle(img, col[0] / 255, col[1] / 255, col[2] / 255);
  ctx.drawImage(t || img, Math.round(z.x - 30 + camX), Math.round(z.y + (before ? 60 : -480) + camY), img.width * 4, img.height * 4);
}
// Zombie::DrawBobsledReanim (Zombie.cpp:DrawBobsledReanim): the sled vehicle
// under the team (RENDER_LAYER_ZOMBIE, drawn around the zombie body).
// offsetX = leader.x + imgOffX - self.x - 76 (imgOffX unmodeled, 0 here),
// offsetY = 15. Status = crashing ? 3 : leader helm thirds (0-2). Cutscene
// variant (mFromWave CUTSCENE) unmodeled — always the on-board branch.
// Sliding: only pos-2 draws (inside back + front) before the zombie.
// Boarding: animTime<0.5 pos-2 before (back+front), else pos-0 front after +
// pos-3 back before. Crashing: only the leader draws (front+back with crash
// offsets + fade). Burned: black. Flash: additive redraw on leader justShot.
// INSIDE skipped when status 3 (crash).
function drawBobsled(z, before, fade, zf, camX, camY) {
  const b = G.board;
  if (!b || z.bungeeState) return;
  const pos = (typeof z.bobsledPosition === "function") ? z.bobsledPosition() : -1;
  if (pos < 0) return;
  // Leader resolve: on-board teams link followers via parent.
  let leader = z.parent || z;
  if (pos > 0) {
    // Follower with a dead/missing link: no sled.
    if (!z.parent || z.parent.dead || z.parent.gone) return;
  }
  const crashing = z.phase === "crashing";
  let drawFront = false, drawBack = false;
  if (crashing) {
    if (pos === 0 && !before) { drawFront = true; drawBack = true; }
  } else if (z.phase === "sliding" || z.burnT > 0) {
    if (pos === 2 && before) { drawFront = true; drawBack = true; }
  } else if (z.phase === "boarding") {
    const at = (z.body && typeof z.body.animTime === "number") ? z.body.animTime : 0;
    if (at < 0.5) { if (pos === 2 && before) { drawFront = true; drawBack = true; } }
    else if (pos === 0 && !before) drawFront = true;
    else if (pos === 3 && before) drawBack = true;
  }
  // Normal post-crash walkers (position -1) and plain phases draw nothing.
  if (!drawFront && !drawBack) return;
  let ox = leader.x - z.x - 76, oy = 15, alpha = 1;
  let status;
  if (crashing) {
    status = 3;
    const PT = (typeof z.phaseT === "number") ? z.phaseT : 0;
    const k = Math.max(0, Math.min(1, PT / 150));
    // TodAnimateCurve(30,0,PT,255,0,LINEAR): full until 30, then linear out.
    alpha = PT >= 30 ? 1 : Math.max(0, PT / 30);
    ox += (150 - PT) * (z.velX || 0) / 2; // limp slide-back
    const ek = 1 - Math.pow(1 - (1 - k), 3); // EASE_OUT over the crash
    ox -= 50 * ek;
    oy += 5 + 5 * Math.max(0, Math.min(1, (150 - PT) / 75)); // 5->10 linear
  } else {
    // GetHelmDamageIndex thirds on the leader's 300-hp sled pool.
    const max = leader.helmMax > 0 ? leader.helmMax : 300;
    const cur = leader.helm;
    status = cur <= 0 ? 3 : cur < Math.floor(max / 3) ? 2 : cur < Math.floor((max * 2) / 3) ? 1 : 0;
    if (status === 3) return; // sled gone once the pool breaks (crash covers it)
  }
  const frontImg = libs.images[`Zombie_bobsled${Math.min(3, status) + 1}.png`];
  const inImg = libs.images["Zombie_bobsled_inside.png"];
  // Retail draws the sled at (mX + offsetX, mY + offsetY) — the offsets above
  // are relative to the drawing zombie (anchoring every member's draw to the
  // leader: z.x + ox = leader.x - 76), plus the board pan.
  const dx = z.x + ox + (camX || 0), dy = z.y + oy + (camY || 0);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha * fade));
  const blacken = (img) => {
    // Burned: black silhouette (DrawBobsledReanim SetColor black).
    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const cx2 = cv.getContext("2d");
    cx2.drawImage(img, 0, 0);
    cx2.globalCompositeOperation = "source-in";
    cx2.fillStyle = "#000"; cx2.fillRect(0, 0, cv.width, cv.height);
    return cv;
  };
  if (z.burnT > 0) {
    if (drawBack && status !== 3 && inImg && inImg.width) ctx.drawImage(blacken(inImg), dx, dy);
    if (drawFront && frontImg && frontImg.width) ctx.drawImage(blacken(frontImg), dx, dy);
  } else {
    if (drawBack && status !== 3 && inImg && inImg.width) ctx.drawImage(inImg, dx, dy);
    if (drawFront && frontImg && frontImg.width) ctx.drawImage(frontImg, dx, dy);
  }
  // Hit flash: DrawBobsledReanim keys off the leader's mJustGotShotCounter
  // alone — no shield fold (the sled holds no shield pool) and no burned
  // gate (source draws the additive coat unconditionally). Strength is halved
  // (user override, same as the zombie body main coat): the full counter
  // rate clips the sled art to a flat sheet that reads as see-through.
  const lz = leader.justShot || 0;
  if (lz > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, (lz * 10) / 255 * 0.5 * alpha * fade);
    if (drawBack && status !== 3 && inImg && inImg.width) ctx.drawImage(inImg, dx, dy);
    if (drawFront && frontImg && frontImg.width) ctx.drawImage(frontImg, dx, dy);
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.restore();
}
async function stillFor(seed) {
  if (!STILLS.has(seed)) {
    try { STILLS.set(seed, await plantStill(seed, { ...PLANTS[seed], idle: "anim_idle" })); }
    catch (e) { STILLS.set(seed, null); }
  }
  return STILLS.get(seed);
}

// Production-glow track filter (user override: only the flower head glows,
// stem/leaves stay matte). Matches the flower assembly by IMAGE_* key —
// HEAD/FACE/EYE/MOUTH/PETAL cels glow; STEM/LEAF cels are skipped. Drivers
// with no image (anim_producing etc.) never draw, so they need no entry.
function headGlowFilter(name, key) {
  return !!key && /HEAD|FACE|EYE|MOUTH|PETAL/i.test(key);
}

// CutScene::DrawIntro (CutScene.cpp:2325-2370): the black covers, the
// "PopCap Games Presents" card, the slamming PvZ logo + the closing fade.
// All screen-space (source draws them at board-space minus the board offset,
// which lands them centered on screen regardless of the pan).
function drawIntroOverlay(cs) {
  const t = cs.time;
  if (t <= INTRO.PanRightStart || t > INTRO.FadeOutEnd) {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 800, 600);
  }
  const pa = cs.presentsAlpha();
  if (pa > 0) {
    // CutScene::DrawIntro 2341-2349: [INTRO_PRESENTS] in BRIANNETOD16 white,
    // centered at (400, 310).
    drawText(ctx, "BRIANNE16", "PopCap Games Presents", 400, 310, { align: "center", color: "#fff", alpha: pa / 255 });
  }
  const s = cs.logoScale();
  if (s > 0) {
    // Dark backdrop box (800s x 150s, 50% black) + the logo scaled s.
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(400 - 400 * s, 300 - 75 * s, 800 * s, 150 * s);
    const logo = libs.images["PvZ_Logo.png"];
    if (logo) ctx.drawImage(logo, 400 - logo.width * s / 2, 300 - logo.height * s / 2, logo.width * s, logo.height * s);
  }
  const fa = cs.fadeAlpha();
  if (fa > 0) {
    ctx.fillStyle = `rgba(0,0,0,${(fa / 255).toFixed(3)})`;
    ctx.fillRect(0, 0, 800, 600);
  }
}
// LawnApp::GetMoneyString: coins are shown x10 ($5 coin reads "$50").
function getMoneyString(n) {
  const v = Math.max(0, n | 0) * 10;
  if (v > 999999) {
    const m = (v / 1000000) | 0, rest = v - m * 1000000, k = (rest / 1000) | 0;
    return `$${m},${String(k).padStart(3, "0")},${String(rest - k * 1000).padStart(3, "0")}`;
  }
  if (v > 9999) { const k = (v / 1000) | 0; return `$${k},${String(v - k * 1000).padStart(3, "0")}`; }
  return `$${v}`;
}
// Board::DrawUICoinBank (RENDER_ITEM_COIN_BANK, gated on SCENE_PLAYING +
// fade count): the bank art at (57, 599-h) with 255*fade/15 alpha and the
// money total in (180,255,90) right-aligned at +116/+24. Shows profile
// coins + this level's take (source updates the profile live on arrival;
// ours merges at level end, so the in-level take is added for display).
// Zen-garden/dave branches N/A in adventure 1-9.
function drawCoinBank(b) {
  if (!b || (b.coinBankT | 0) <= 0) return;
  const img = libs.images["coinbank.png"];
  if (!img || !img.width) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, (b.coinBankT | 0) / 15);
  ctx.drawImage(img, 57, 599 - img.height);
  // Board::DrawUICoinBank (7409-7425): aPosY = 599-h, text right edge at
  // aPosX+116, baseline aPosY+24 (DrawString y = the font baseline, same
  // convention our drawText replicates).
  drawText(ctx, "CB14", getMoneyString(SAVE.getCoins() + (b.money | 0)), 57 + 116, 599 - img.height + 24, { align: "right", color: "#b4ff5a" });
  ctx.restore();
}
function drawCoin(c, camX, camY) {
  if (typeof c.isAward === "function" && c.isAward()) { drawAwardCoin(c); return; }
  // Vasebreaker usable seed (Coin::Draw 965-986 DrawSeedPacket path): the
  // packet keeps drawing at its lawn spot while held (Collect never hides
  // it — mIsBeingCollected only greys it to 128) via the bank packet
  // renderer (no cost display — the seed is free). Near disappearance (last
  // 300 of 1500) it blinks grey (Coin.cpp:981-986: disappear > limit-300 &&
  // %60 < 30 → grey 192).
  if (typeof c.isUsable === "function" && c.isUsable()) {
    const blink = c.disappear > 1200 && (c.disappear % 60) < 30;
    ctx.save();
    ctx.globalAlpha = c.alpha;
    drawPacket(c.x, c.y, 50, 70, c.seed, { grey: c.held ? 128 : blink ? 192 : 255, noCost: true });
    ctx.restore();
    return;
  }
  if (c.held) return; // cursor-held: drawn at the cursor, not on the lawn
  if (!c.reanim) {
    const name = c.kind === "sun" || c.kind === "smallsun" || c.kind === "bigsun" ? "Sun" : c.kind === "silver" ? "Coin_silver" : c.kind === "gold" ? "Coin_gold" : "Diamond";
    try {
      c.reanim = new Reanimation(DEFS.get(name), c.x, c.y);
      // Play the full timeline (CoinInitialize: sun rate 6 loop from 0;
      // silver/gold random phase at 0.6-1.0x, diamond fast 50-80). Layer
      // names are per-reanim (Sun2/glow/...) so span the longest track —
      // the old "anim_idle" only matched track 0 (Sun3 is fully blank),
      // freezing the sun on frame 0.
      const def = c.reanim.def;
      let full = 1;
      for (const tr of def.tracks) full = Math.max(full, tr.frames.length);
      let rate = 6, t0 = 0;
      if (c.kind === "diamond") { rate = 50 + Math.random() * 30; t0 = Math.random(); }
      else if (!c.isSun()) { rate = def.fps * (0.6 + Math.random() * 0.4); t0 = Math.random(); }
      c.reanim.playReanim(def.tracks[0].name, LOOP, 0, rate);
      c.reanim.frameStart = 0; c.reanim.frameCount = full;
      c.reanim.animTime = t0;
      c.reanim.setScale(c.scale);
    } catch (e) { c.reanim = null; }
  }
  if (c.reanim) {
    c.reanim.x = c.x; c.reanim.y = c.y; c.reanim.setScale(c.scale);
    c.reanim.alpha = c.alpha; // Coin::GetColor (Coin.cpp:761): fade + collect alpha
    c.reanim.draw(ctx, camX, camY);
  }
  else {
    ctx.fillStyle = c.isSun() ? "#ff0" : "#ccc";
    ctx.beginPath(); ctx.arc(c.x, c.y, 12, 0, 7); ctx.fill();
  }
}
// Coin::Draw award types (869-964): the seed packet via DrawSeedPacket (our
// drawPacket), the shovel via SHOVEL_HI_RES at half scale, the note via
// ZOMBIE_NOTE_SMALL. The seed packet is SOLID with its cost shown and a
// white glow halo under it: Coin::Draw calls DrawSeedPacket with grayness
// 255 / percentDark 0 and theDrawCost=true (Coin.cpp:873), and since that
// path never enables colorize, the IsLevelAward flashing SetColor (835-839)
// is ignored by every Tod blit (TodCommon.cpp:777: white unless
// mColorizeImages) — no flashing on the packet. The halo is the attached
// PARTICLE_SEED_PACKET's SeedPacketGlow emitter (SeedPacket.xml):
// IMAGE_SEEDPACKETGLOW (120x145) at emitter offset +62y from the system
// origin (mPosX+w/2, mPosY+h/2-60), i.e. packet center +(0,2), drawn UNDER
// the packet (the attachment draws before the coin, 818-823) and detached
// on collect (1219), so the center flight shows the bare packet growing
// 1.01->2x. The arrow is the same particle's DownArrow emitter — it stays.
// (The shovel/note branches below keep the old alpha-pulse stand-in for
// their colorize grey flash; out of scope for this fix.)
function drawAwardCoin(c) {
  const s = c.scale;
  if (c.kind === "award-seed") {
    // SeedPacketGlow halo under the resting packet (gone once collected).
    if (!c.collected) {
      const glow = libs.images["particles/SeedPacketGlow.png"];
      if (glow) {
        const gw = 120 * s, gh = 145 * s;
        ctx.save();
        ctx.globalAlpha = c.alpha;
        ctx.drawImage(glow, c.x + 25 - gw / 2, c.y + 37 - gh / 2, gw, gh);
        ctx.restore();
      }
    }
    ctx.save();
    ctx.globalAlpha = c.alpha;
    // DrawSeedPacket (872-875): scale about the packet center, cost on.
    drawPacket(c.x + 25 - 25 * s, c.y + 35 - 35 * s, 50 * s, 70 * s, c.seed, { award: true });
    ctx.restore();
  } else {
    ctx.save();
    if (!c.collected) ctx.globalAlpha = Math.max(0, c.alpha * (0.7 + 0.3 * Math.sin((c.coinAge / 75) * Math.PI * 2)));
    else ctx.globalAlpha = c.alpha;
    if (c.kind === "award-shovel") {
      const img = libs.images["Shovel_hi_res.png"];
      if (img) { const w = 116 * 0.5 * s, h = 125 * 0.5 * s; ctx.drawImage(img, c.x + 40 - w / 2, c.y + 40 - h / 2, w, h); }
    } else if (c.kind === "award-taco") {
      // Coin::Draw COIN_TACO (949-952): IMAGE_TACO at natural size, no
      // offset/scale — main.zip images/Taco.png (80x80), ABOVE_UI.
      const img = libs.images["Taco.png"];
      if (img) ctx.drawImage(img, c.x, c.y, 80 * s, 80 * s);
    } else {
      const img = libs.images["ZombieNoteSmall.png"];
      if (img) ctx.drawImage(img, c.x, c.y, 109 * s, 94 * s); // main.zip 109x94 pickup
    }
    ctx.restore();
  }
  if (!c.collected && !c.dead) {
    const ar = tintedDownArrow();
    if (ar) {
      const cx = c.kind === "award-seed" ? c.x + 25 : c.kind === "award-shovel" || c.kind === "award-taco" ? c.x + 40 : c.x + 54;
      const bob = 5 + 5 * Math.sin(((G.board ? G.board.tick : 0) / 40) * Math.PI * 2);
      ctx.drawImage(ar, cx - 16, c.y - 26 - bob, 32, 26);
    }
  }
}
// Vasebreaker vase (GridItem::DrawScaryPot, GridItem.cpp:298-384): the pot
// art at (gridX-5, gridY-15) from IMAGE_SCARY_POT (cols=3: question/leaf/
// zombie × rows=2: row 0 = plain underlay for the reveal pass, row 1 = the
// marked pot). Adventure pots are QUESTION or LEAF only — the zombie column
// is puzzle-garg-only (ChangePotType never marks it in adventure), so col is
// leaf?1:0. PLANTSHADOW2 rides at (x-5, y+72) scale 1.3 (drawn by the caller
// in the row pass). The hovered vase redraws additive at alpha 196
// (UpdateMousePosition highlight). The plantern/shift transparent-reveal pass
// is skipped: no plantern is reachable on adventure L35 (fixed cherry bank,
// no chooser), and this port has no shift-peek cheat — like retail without a
// plantern, vases stay opaque.
function drawScaryPot(v, x, y, camX, camY) {
  const img = libs.images["Scary_pot.png"];
  const X = x + camX, Y = y + camY;
  if (!img || !img.width) { ctx.fillStyle = "#8a5a2b"; ctx.fillRect(X, Y, 60, 80); return; }
  const cw = img.width / 3, ch = img.height / 2;
  const col = v.state === "leaf" ? 1 : 0;
  ctx.drawImage(img, col * cw, ch, cw, ch, X, Y, cw, ch);
  if (G.hoverVase === v) {
    ctx.save();
    ctx.globalAlpha = 196 / 255;
    ctx.globalCompositeOperation = "lighter"; // additive re-draw (Plant::UpdateReanimColor highlight)
    ctx.drawImage(img, col * cw, ch, cw, ch, X, Y, cw, ch);
    ctx.restore();
  }
}
function plantOrderOf(seed) {
  if (seed === 16 || seed === 33) return 0; // PLANT_ORDER_LILYPAD: lily / flowerpot
  if (seed === 30) return 2; // PLANT_ORDER_PUMPKIN
  if (seed === 35) return 3; // PLANT_ORDER_FLYER: coffee only
  return 1; // PLANT_ORDER_NORMAL
}
// Gravebuster grounded-dirt geometry (USER OVERRIDE — the buster no longer
// floats with its ring riding mid-stone). The DIRT track is hidden in the
// body (sim ctor, all bodies incl. previews), so the EATING sink only moves
// the buster proper; the ring draws separately, pinned at the plant base,
// which the +6 height offset parks exactly on the grave floor. Geometry is in
// plant world coords (no cam): callers add camX/camY for absolute space.
function busterDirtGeom(p) {
  const i = p.dirtTrack;
  if (i === undefined || i < 0 || !p.body || !p.body.def) return null;
  const r = p.body.def.images.get("IMAGE_REANIM_GRAVEBUSTER_DIRT");
  if (!r) return null;
  let t;
  try { t = p.body.getCurrentTransform(i); } catch (e) { return null; }
  if (!t) return null;
  const bx = p.body.x, by = p.body.y - (p.sinkY || 0);
  return { atlas: p.body.def.atlas, r, dx: bx + t.x, dy: by + t.y, dw: r.w * t.scx, dh: r.h * t.scy };
}
// Draws a gravebuster clipped above its dirt floor, then the dirt ring fixed
// at the base: the buster visibly sinks INTO the dirt as sinkY grows, and
// nothing of it can ever show below the dirt floor. drawBody() runs under an
// identity-transform clip in absolute (world+cam) space — reanim tracks and
// the damage-blot blit both land there, so one clip covers them together.
function drawBusterGrounded(p, c2, camX, camY, drawBody) {
  const g = busterDirtGeom(p);
  if (!g) { drawBody(); return; }
  // Clip at the mound's widest row, not the cel bottom: the DIRT cel is a
  // narrow column (opaque x-extents peak at cel row 18/29: 1..112 of 113,
  // only 32..70 on the bottom row) while the sinking body stays ~55-75px
  // wide, so a floor at the cel bottom leaves the body's flat-clipped bottom
  // edge sticking out on both sides of the pile's narrow foot — reading as
  // buster below the dirt. Row 18 is ~90px wide on screen, fully covering
  // the body there, so the buster visibly dives INTO the pile instead.
  const floor = g.dy + g.dh * (18 / 29) + camY;
  c2.save();
  c2.setTransform(1, 0, 0, 1, 0, 0);
  c2.beginPath();
  c2.rect(-2000, -2000, 4000, floor + 2000);
  c2.clip();
  drawBody();
  c2.restore();
  c2.save();
  c2.setTransform(1, 0, 0, 1, 0, 0);
  c2.globalAlpha = p.body.alpha;
  c2.drawImage(g.atlas, g.r.x, g.r.y, g.r.w, g.r.h, g.dx + camX, g.dy + camY, g.dw, g.dh);
  c2.restore();
}
function drawBoard() {
  const b = G.board;
  const cs = G.cutscene;
  const inCut = G.screen === "cutscene" && cs && !cs.done;
  // ZombiesWon pan (CutScene::UpdateZombiesWon 1505-1508: the board slides
  // 0 -> +220 over LostTimePanRightStart->End 1500-3500cs with
  // CURVE_EASE_IN_OUT; our boardX is the camera, i.e. the negative of the
  // board offset, so it runs 0 -> -220): the lawn slides right and the
  // house door comes into view behind the winner. Double-smoothstep
  // (TodCurveS applied twice, TodCommon.cpp) + int rounding like
  // TodAnimateCurve.
  let lossX = 0;
  if (b.state === "lost" && b.winner && b.lossT > 0) {
    const t = Math.min(350, Math.max(150, b.lossT));
    let k = (t - 150) / 200;
    k = k * k * (3 - 2 * k); k = k * k * (3 - 2 * k);
    lossX = -Math.round(220 * k);
  }
  const boardX = inCut ? cs.boardX : lossX;
  const isIntro = !!(cs && cs.intro); // GAMEMODE_INTRO demo: no HUD, overlays below
  // Board::DrawShakeBoard is Update-driven in retail (Board.cpp 5890-5907):
  // mX/mY recompute only on Update ticks, so while paused the board sits
  // still on its last offset. Our offsets roll fresh randoms every draw, so
  // gate them on !paused or the screen keeps shaking under the pause menu.
  const shx = b.shake > 0 && !b.paused ? (Math.random() - 0.5) * 6 : 0;
  const shy = b.shake > 0 && !b.paused ? (Math.random() - 0.5) * 6 : 0;
  // Board-space pan: drawImages use the canvas translate; reanims compute
  // absolute transforms (setTransform), so they take the same offset as cam.
  const camX = -boardX + shx, camY = shy;
  ctx.save();
  ctx.translate(-boardX + shx, shy);
  drawLawnBase(b);
  // GridItem::DrawGraveStone (GridItem.cpp:140): per-stone cel from
  // mGridCelLook (col look%5; row 1 on row 0, 0 when special, else
  // 2+look%2) on the 5x4 Tombstones.png/Tombstone_mounds.png sheets (86x91
  // cels), stone + mound paired on the SAME cel; rise-in eases the stone up
  // (counter 0->100 through mEnableGraveStones: heightPos 1000->0, visible
  // height + bottom clip, dirt mound on its own slower curve) with a floor
  // of counter<=0 hidden; a chewing gravebuster top-clips the stone
  // (linear 400->0 stateCd to 10->40px).
  // USER OVERRIDE (centering): retail draws at x=+offX-4 / y=+celH+offY-9
  // with per-grave +-5 jitter, which leaves stones visibly off-center in
  // their squares — and the five look columns don't even share a visual
  // center inside the 86px cel (opaque-pixel bbox centers, measured live:
  // col0 38.5, col1/2 43, col3 42, col4 46 vs cel center 43). Per request
  // every stone is centered on its true pixels instead: the jitter fields
  // are zeroed at placement (sim.js) and ignored here, and each look
  // column carries its own dx so its opaque bbox centers in the 83px cell
  // (dx = (83-w)/2-x0: col0 +2.5, col1/2 -2, col3 -1, col4 -5). The mound
  // rides the same gx — its bbox center matches its stone's within 0.5px
  // on every column, so one dx centers both. Vertical stays source
  // (cel bottom at y+celH-9): the buster dirt ring, rise piles and burst
  // anchors are all tuned to that floor.
  const GRAVE_DX = [2.5, -2, -2, -1, -5];
  const stones = libs.images["Tombstones.png"], mounds = libs.images["Tombstone_mounds.png"];
  for (const c of b.cells) {
    const x = gridToPixelX(c.col, b.bg), y = gridToPixelY(c.col, c.row, b.bg);
    // mEnableGraveStones (CutScene 1248/1011): night graves stay hidden
    // until the intro roll edge, then pop with dirt bursts.
    // USER OVERRIDE: while a live gravebuster is in EATING (actively sunk
    // into its sinkY slide) the stone + mound draw nothing — the buster
    // envelops the grave. Landing still shows the stone; if the buster is
    // eaten or shovelled (dead/nulled) the grave draws again since it was
    // never cleared (GridItemDie only fires on eat completion).
    const _eater = c.base;
    const _eaten = _eater && !_eater.dead && _eater.seed === 11 && _eater.state === "eating";
    if (c.grave && !_eaten && b.enableGraveStones !== false && c.grave.counter > 0) {
      const look = c.grave.look | 0, special = !!c.grave.special;
      const gcol = ((look % 5) + 5) % 5;
      const grow = c.row === 0 ? 1 : special ? 0 : 2 + (((look % 2) + 2) % 2);
      if (stones && stones.width) {
        const celW = stones.width / 5, celH = stones.height / 4;
        // TodAnimateCurve EASE_IN_OUT (GridItem.cpp:145-168), via the same
        // calcPosition helper the cutscene pan uses. Signature mapping:
        // TodAnimateCurve(t0, t1, time, v0, v1) = calcPosition(t0, t1, v0, v1, time).
        const heightPos = calcPosition(0, 100, 1000, 0, c.grave.counter);
        const visibleH = calcPosition(0, 1000, celH, 0, heightPos);
        const extraBottom = calcPosition(0, 50, 0, 14, heightPos);
        const visibleDirt = calcPosition(500, 1000, celH, 0, heightPos);
        // (Retail GridItem.cpp:169-174 top-clips the stone 10->40px while
        // eaten; this port hides the stone entirely while EATING instead —
        // see the _eaten gate above.)
        const extraTop = 0;
        const gx = x + GRAVE_DX[gcol];
        const gy = y + celH - 9;
        const stoneH = visibleH - extraBottom - extraTop;
        if (stoneH > 0) {
          ctx.drawImage(stones, gcol * celW, grow * celH + extraTop, celW, stoneH,
            gx, gy - visibleH + extraTop, celW, stoneH);
        }
        if (mounds && mounds.width && visibleDirt > 0) {
          ctx.drawImage(mounds, gcol * celW, grow * celH, celW, visibleDirt,
            gx, gy - visibleDirt, celW, visibleDirt);
        }
      }
    }
    // GridItem::DrawCrater (GridItem.cpp:8639): natural 90x61 cel at
    // (gridX-8, gridY+40); day cel 0 / night cel 1 on the CRATER sheet,
    // the CRATER_FADING sheet below 9000 ticks, linear alpha-out over the
    // last 25 ticks. (Pool bob + roof offsets unmodeled — day lawn only.)
    // USER OVERRIDE: drawn 4px higher (y+36) per user request.
    if (c.crater) {
      const fading = c.crater < 9000;
      const cimg = libs.images[fading ? "crater_fading.png" : "crater.png"];
      if (cimg && cimg.width) {
        const cw = cimg.width / 2, ch = cimg.height, cel = b.stageIsNight() ? 1 : 0;
        if (c.crater < 25) {
          ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, c.crater / 25));
          ctx.drawImage(cimg, cel * cw, 0, cw, ch, x - 8, y + 36, cw, ch);
          ctx.restore();
        } else ctx.drawImage(cimg, cel * cw, 0, cw, ch, x - 8, y + 36, cw, ch);
      }
    }
  }
  ctx.restore(); // unpan — the seed bank is screen-space, and in retail it
  // renders BELOW the entities (Board render list: BOTTOM_UI 100000 <
  // PLANT 302000 / ZOMBIE 303000 / PROJECTILE 305000 / PARTICLE 307000;
  // coins ride COIN_BANK 600000, awards ABOVE_UI 800000). So the bank
  // draws here, between the backdrop and the entity passes.
  if (inCut && !isIntro && !b.isStormy) drawSeedBank(cs.seedBankY, cs.seedBankX, cs.seedBankDarken);
  else if (!isIntro && !b.isStormy) drawSeedBank(((b.isWhack || b.isVase) && b.state === "play") ? b.bankY : 0, 10); // bank rests at x=10 after the intro slide (seedBankX); the whack bank rides bankY up from -87 once sun exists (Challenge::Update 2172-2182, sim bankY); the vase bank stays hidden (no sun in adventure vase). Stormy redraws in drawMeter over the overlay (DrawUIBottom-after-storm), so skipped here.
  if (!isIntro) drawVaseShovel(); // retail fixed slot, untranslated (bank stays hidden)
  ctx.save();
  ctx.translate(-boardX + shx, shy);
  const shadow = libs.images["plantshadow.png"];
  // Shadow anchor rule (TodCommon.cpp:750/842): both blit helpers render the
  // blob's natural CENTER at (formula + W/2, formulaY + H/2) at any scale —
  // the scale-1 fast path draws top-left exactly at the formula point. So
  // every caller passes the RAW formula anchor; the (W/2,H/2) centering and
  // the scale-sized box happen here, once. Retail applies no extra alpha.
  const drawShadow = (fx, fy, s, sy = s, img = shadow) => {
    const w = img.width * s, h = img.height * sy;
    ctx.drawImage(img, fx + img.width / 2 - w / 2, fy + img.height / 2 - h / 2, w, h);
  };
  // Grave systems (GridItem::AddGraveStoneParticles + Zombie::RiseFromGrave
  // land branch + Plant::UpdateGraveBuster + Zombie::SummonBackupDancer):
  // dirt/rock motes centered + rotated + scaled like RenderParticle (normal
  // blend; dirt = IMAGE_DIRTSMALL row 1, rock = IMAGE_ROCKSMALL row 0, 8
  // static-random 40x40 cels each); the ZombieArm mote (IMAGE_ZOMBIEARM
  // 30x57, resting at ParticleSpinAngle 200 = hand up — see the arm
  // branch) with its ClipTop crop; the DirtClumps motes
  // (IMAGE_DIRTBIG row 1, 4 static-random 80x80 grass-topped cels). Alpha =
  // particle x system, per GetRenderParams.
  // Row banding (Board::MakeRenderOrder(PARTICLE, row, 0) = row*10000 +
  // 307000: above the row's own zombies/mowers, below the next row's): the
  // row loop below calls this per row; the TOP pass only keeps rowless
  // legacy emitters. ZombieRise emitter order = draw order (ZombieRise.xml:
  // arm, splash, clumps): the arm renders first, behind the dirt. All rise
  // fx sit at PARTICLE layer, in front of the rising body like retail.
  const drawGraveFxOne = (em) => {
    const dirtImg = libs.images["dirtsmall.png"];
    const rockImg = libs.images["particles/RockSmall.png"];
    const armImg = libs.images["particles/ZombieArm.png"];
    const bigImg = libs.images["dirtbig.png"];
    if (em.kind === "arm") {
      if (!armImg || !armImg.width || !em.mote) return;
      const d = ZOMBIE_ARM_DEF;
      const m = em.mote;
      const st = em.sysDur <= 1 ? 1 : Math.min(1, em.sysAge / (em.sysDur - 1));
      const t = m.dur <= 1 ? 1 : Math.min(1, m.age / (m.dur - 1));
      const al = evalPowieTrack(d.pAlphaN, t, m.ai) * 1; // no system alpha track
      if (al <= 0.004) return;
      const clip = Math.max(0, Math.min(1, evalPowieTrack(d.clipN, t, 0.5)));
      if (clip >= 1) return;
      const w = 30, h = 57 * (1 - clip);
      ctx.save();
      ctx.globalAlpha = Math.min(1, al);
      // ZombieRise.xml ParticleSpinAngle 200: TodParticle seeds
      // FromLastTime(-1) = 0, so the first update adds the full +200°
      // and later deltas are 0 — the arm never spins, it just rests
      // upside-down. The in-file art points down (sleeve top, hand
      // bottom); rotated 200° the hand reaches UP out of the grave.
      // Pivot is the CENTER of the clipped quad (EffectSystem.cpp
      // TodTriangleGroup::AddTriangle centers the srcRect on the render
      // pos: x = -w/2, y = -h/2). So the sleeve-cut corner lands ~32px
      // BELOW the render pos at full open — buried in the dirt pile —
      // while the hand extends ~32px above it. The old corner-pivot draw
      // pinned the sleeve AT the render pos, leaving the cut end 32px
      // too high (floating over the dirt). mPosY += clipTop*celH keeps
      // the cut tracking the pile as the arm emerges/sinks.
      ctx.translate(em.cx + m.jx, em.cy + m.yOff + m.jy + 57 * clip);
      ctx.rotate(200 * Math.PI / 180);
      ctx.drawImage(armImg, 0, 57 * clip, 30, 57 * (1 - clip), -w / 2, -h / 2, w, h);
      ctx.restore();
      return;
    }
    if (em.kind === "dirt") {
      const d = em.def;
      const img = d.img === "rock" ? rockImg : dirtImg;
      if (!img || !img.width) return;
      const cw = img.width / 8, chh = img.height / 2;
      const st = em.sysDur <= 1 ? 1 : Math.min(1, em.sysAge / (em.sysDur - 1));
      const sysA = d.sysAlphaN ? evalPowieTrack(d.sysAlphaN, st, 0.5) : 1;
      if (sysA <= 0.004) return;
      for (const m of em.motes) {
        const t = m.dur <= 1 ? 1 : m.age / (m.dur - 1);
        const al = (d.pAlphaN ? evalPowieTrack(d.pAlphaN, t, m.ai) : 1) * sysA;
        if (al <= 0.004) continue;
        ctx.save();
        ctx.globalAlpha = Math.min(1, al);
        ctx.translate(m.x, m.y);
        ctx.rotate(m.spin);
        const w = cw * m.sc, h = chh * m.sc;
        ctx.drawImage(img, m.frame * cw, d.row * chh, cw, chh, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    } else if (em.kind === "clumps") {
      if (!bigImg || !bigImg.width) return;
      const d = ZOMBIE_CLUMPS_DEF;
      const st = em.sysDur <= 1 ? 1 : Math.min(1, em.sysAge / (em.sysDur - 1));
      const sysA = d.sysAlphaN ? evalPowieTrack(d.sysAlphaN, st, 0.5) : 1;
      if (sysA <= 0.004) return;
      const cw = bigImg.width / 4, chh = bigImg.height / 2;
      for (const m of em.motes) {
        const t = m.dur <= 1 ? 1 : Math.min(1, m.age / (m.dur - 1));
        const sc = Math.max(0, evalPowieTrack(d.scaleN, t, m.sci));
        if (sc <= 0.004) continue;
        ctx.save();
        ctx.globalAlpha = Math.min(1, sysA);
        const w = cw * sc, h = chh * sc;
        ctx.drawImage(bigImg, m.frame * cw, chh, cw, chh, m.x + m.jx - w / 2, m.y + m.jy - h / 2, w, h);
        ctx.restore();
      }
    }
  };
  // Digger tunnel/rise fx (Zombie::UpdateZombieDigger, RENDER_LAYER_PARTICLE
  // row band — above the row's zombies/mowers, below the next row; the row
  // loop below calls this per row, the TOP pass keeps rowless legacy ones).
  // Tunnel systems follow their zombie (motes shifted by zombie delta in
  // tickDiggerFx); rise bursts are 20 upfront motes (sysDur 500). Draw is
  // centered + rotated + scaled RenderParticle-style, normal blend, alpha =
  // system x particle (rise: sysAlpha 1,92 0, pAlpha 1,70 0; tunnel motes
  // fade over their last 30%). Tossed motes ride dirtsmall.png row 0
  // (8 cels); ground motes ride dirtbig.png row 0 (DiggerTunnel.xml, 4 cels). Board-space
  // coords, so the board shake rides along with everything else.
  const drawDiggerFxOne = (em) => {
    const dirtImg = libs.images["dirtsmall.png"];
    const bigImg = libs.images["dirtbig.png"];
    if (em.kind === "rise") {
      if (!dirtImg || !dirtImg.width) return;
      const st = em.sysDur <= 1 ? 1 : Math.min(1, em.sysAge / (em.sysDur - 1));
      const sysA = st <= 0.92 ? 1 : Math.max(0, 1 - (st - 0.92) / 0.08);
      if (sysA <= 0.004) return;
      const cw = dirtImg.width / 8, chh = dirtImg.height / 2;
      for (const m of em.motes) {
        const t = m.dur <= 1 ? 1 : Math.min(1, m.age / (m.dur - 1));
        const al = (t <= 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3)) * sysA;
        if (al <= 0.004) continue;
        ctx.save();
        ctx.globalAlpha = Math.min(1, al);
        ctx.translate(m.x, m.y);
        ctx.rotate(m.spin);
        const w = cw * m.sc, h = chh * m.sc;
        ctx.drawImage(dirtImg, (m.frame % 8) * cw, 0, cw, chh, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
      return;
    }
    if (em.kind === "tunnel") {
      for (const m of em.motes) {
        const t = m.dur <= 1 ? 1 : Math.min(1, m.age / (m.dur - 1));
        const al = t <= 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
        if (al <= 0.004) continue;
        ctx.save();
        ctx.globalAlpha = Math.min(1, al);
        ctx.translate(m.x + (m.jx || 0), m.y + (m.jy || 0));
        ctx.rotate(m.spin);
        if (m.big) {
          if (!bigImg || !bigImg.width) { ctx.restore(); continue; }
          // Ground Rocks: IMAGE_DIRTBIG row 0 (DiggerTunnel.xml, 4 cels).
          const cw = bigImg.width / 4, chh = bigImg.height / 2;
          const w = cw * m.sc, h = chh * m.sc;
          ctx.drawImage(bigImg, (m.frame % 4) * cw, 0, cw, chh, -w / 2, -h / 2, w, h);
        } else {
          if (!dirtImg || !dirtImg.width) { ctx.restore(); continue; }
          const cw = dirtImg.width / 8, chh = dirtImg.height / 2;
          const w = cw * m.sc, h = chh * m.sc;
          ctx.drawImage(dirtImg, (m.frame % 8) * cw, 0, cw, chh, -w / 2, -h / 2, w, h);
        }
        ctx.restore();
      }
    }
  };
  // entities per row
  for (let r = 0; r < b.rows; r++) {
    // Board::DrawIce (Board.cpp:DrawIce): the zamboni's sheet, GROUND row+2
    // (under the plants/zombies). y = GridToPixelY(8,row)+20, tiles IMAGE_ICE
    // (150x72) from minX+13 to 800 with the first tile right-aligned partial,
    // ICE_CAP (25x72) at minX; alpha = min(255, 255*timer/10) fading over the
    // last 10 ticks. Board-space, inside the translated pass.
    try {
      const iceT = b.iceTimer && b.iceTimer[r], iceX = b.iceMinX && b.iceMinX[r];
      if (iceT > 0 && iceX < 800) {
        const iceImg = libs.images["ice.png"], capImg = libs.images["ice_cap.png"];
        if (iceImg && iceImg.width && capImg && capImg.width) {
          const iy = gridToPixelY(8, r, b.bg) + 20;
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, iceT / 10));
          // Right-aligned tiling to 800: full 150px tiles from the right,
          // the leftmost tile cropped on its left to start at tx.
          const tx = iceX + 13;
          for (let x = 800 - 150; x + 150 > tx; x -= 150) {
            const sx = Math.max(0, tx - x);
            ctx.drawImage(iceImg, sx, 0, 150 - sx, 72, x + sx, iy, 150 - sx, 72);
          }
          ctx.drawImage(capImg, 0, 0, 25, 72, iceX, iy, 25, 72);
          ctx.restore();
        }
      }
    } catch (e) { /* headless/def missing */ }
    const plants = [];
    for (let c = 0; c < 9; c++) {
      const cell = b.cell(c, r);
      // Dead plants never render (shovelled/eaten ones are nulled from
      // their cell by the next board update, but the cutscene shovel
      // tutorial digs while the board clock is frozen — without this
      // filter the dug pre-plants would stand visible forever).
      // Bungee-lifted (rising) plants ride the carrier — drawn in the bungee
      // pass below, skipped here (and their shadow with them). Grabbed
      // plants stay rooted until the lift.
      for (const k of ["lily", "pot", "base", "shell", "flying"]) if (cell[k] && !cell[k].dead && cell[k].onBungee !== "rising") plants.push(cell[k]);
    }
    // Garden rake (GridItem GRIDITEM_RAKE: DrawGridItem case RAKE draws
    // nothing itself, then the item reanim draws — MakeRenderOrder
    // GRAVE_STONE row+9 (301009), i.e. below the row's plants (PLANT
    // 302000), above the row's graves (+3) and the ground pass, and below
    // its zombies. No shadow in source. The reanim base sits at (x+20, y).
    if (b.rake && b.rake.row === r && b.rake.body && !b.rake.body.dead) {
      try { b.rake.body.draw(ctx, camX, camY); } catch (e) { /* def missing */ }
    }
    // Plant::CalcRenderOrder (Plant.cpp:480): offset = order*5 - mX + 800
    // (LILYPAD 0: lily/pot, NORMAL 1, PUMPKIN 2, FLYER 3: coffee) — the render
    // list sorts ascending, so within a row the RIGHTMOST plant draws first
    // and the leftmost draws last (on top). That is what lets a chomper's
    // head overlap the plant in the cell to its right instead of sliding
    // behind it. Squashed plants (Plant::Squish 2361: render order reset to
    // GRAVE_STONE layer) draw before everything else in the row — under the
    // machine that flattened them.
    plants.sort((a, q) => ((a.squished ? -100000 : 0) + plantOrderOf(a.seed) * 5 - a.x) - ((q.squished ? -100000 : 0) + plantOrderOf(q.seed) * 5 - q.x));
    for (const p of plants) {
      // Squash mid-leap/done (UpdateSquash 1552: RENDER_LAYER_PARTICLE from
      // RISING until death) draws after this row's zombies — skipped here,
      // drawn below after the debris.
      if (p.seed === 17 && p.flightBand) continue;
      // Plant::DrawShadow anchor: (mX+dx, mY+off+dy). Seeds with no blob
      // (lily/spike/etc.) return null. The sun-shroom's blob scales with its
      // growth state (Plant.cpp:3883), so the plant rides along.
      // Squished plants cast NO shadow (Plant::Draw squished branch
      // 3991-4004 never calls DrawShadow — only the normal branch 4046
      // does; the full-size blob under a 30px pancake would float wrong).
      const sp = Plant.shadowSpec(p.seed, p);
      if (shadow && sp && !p.squished) drawShadow(p.x + sp.dx, p.y + p.drawOff + sp.dy, sp.s);
      // Plant::Draw pumpkin-back layer (Plant.cpp:4008-4072): the cell shell's
      // group-1 track (Pumpkin_back) draws BEFORE the sheltered plant, offset
      // by (shell.x - p.x, shell.y - p.y) — zero for same-cell plants (the
      // jittered puff/sea inner keeps its own offset via the delta). Only the
      // inner plant's pass draws it (aPlantInPumpkin == this); a lone shell
      // draws its own back in its pass (null inner). Coats ride the SHELL's
      // flash/highlight so a chewed shell flashes behind its plant.
      const cellP = b.cell(p.col, p.row);
      const shellP = cellP && cellP.shell && !cellP.shell.dead && !cellP.shell.squished ? cellP.shell : null;
      let drawBack = false;
      if (shellP && !p.squished) {
        const innerP = cellP.base && !cellP.base.dead ? cellP.base : null;
        if (innerP) { if (innerP === p) drawBack = true; }
        else if (p === shellP) drawBack = true;
      }
      if (drawBack) {
        const sdx = shellP.x - p.x, sdy = shellP.y - p.y;
        const shl = shellP.highlighted ? 196 / 255 : 0;
        const sgf = shellP.glow > 0 ? Math.min(shellP.glow * 0.6, 60) / 255 : 0;
        const spf = shellP.flash > 0 ? Math.min(shellP.flash * 3, 90) / 255 : 0;
        if (shl > 0) shellP.body.draw(ctx, camX + sdx, camY + sdy, 1, shl, 0, null, null);
        else shellP.body.draw(ctx, camX + sdx, camY + sdy, 1, 0, sgf, headGlowFilter);
        if (spf > 0) drawPlantDamage(shellP, ctx, camX + sdx, camY + sdy, spf, 1);
      }
      // NOTE: attached heads render inline during body.draw (source:
      // DrawRenderGroup draws attachment right after its track) — never
      // draw them a second time here. Eaten flash (Plant::Draw 4131): bite
      // flashes peak at 25*3=75. The production glow is capped at 60 (~0.24)
      // and covers the flower head only (user override — full-white full-body
      // bleach dissolved petal edges and read as transparency). The DAMAGE
      // flash takes the same blend-toward-white coat the zombie armor got
      // (drawPlantDamage: opaque, never clips) instead of an additive pass —
      // additive on pale art (snow/garlic/potato whites) blew out to a flat
      // sheet that read as see-through. Shovel-hover highlight (Plant::
      // UpdateReanimColor 2707: extra additive white 196/255 over the body,
      // propagated to attachments) still rides the additive pass via max().
      // Squished plants show NO coats (Plant::Draw squished branch draws the
      // static cached frame directly — no flash/glow/highlight passes).
      const pf = (!p.squished && p.flash > 0) ? Math.min(p.flash * 3, 90) / 255 : 0;
      const gf = (!p.squished && p.glow > 0) ? Math.min(p.glow * 0.6, 60) / 255 : 0;
      const hl = (!p.squished && p.highlighted) ? 196 / 255 : 0;
      // Gravebuster grounded-dirt (USER OVERRIDE): buster clipped at its dirt
      // floor, dirt ring fixed at the grave floor (see busterDirtGeom).
      // Single exclusive additive coat (source if/else chain, Plant.cpp 2707):
      // highlight wins, else glow — never stacked.
      if (p.seed === 11 && p.dirtTrack !== undefined && p.dirtTrack >= 0) {
        drawBusterGrounded(p, ctx, camX, camY, () => {
          if (hl > 0) p.body.draw(ctx, camX, camY, 0, hl, 0, null, null);
          else p.body.draw(ctx, camX, camY, 0, 0, gf, headGlowFilter);
          if (pf > 0) drawPlantDamage(p, ctx, camX, camY, pf);
        });
      } else if (p.seed === 9 && (p.body.frameStart === 25 || p.body.frameStart === 154)) {
        // Produce-dance spans (anim_producing 25..41 / anim_bigproducing
        // 154..176 per getFramesForLayer): clip the halo overlay to the cap.
        drawDancingSunshroom(p, camX, camY, pf, gf, hl);
      } else {
        if (hl > 0) p.body.draw(ctx, camX, camY, 0, hl, 0, null, null);
        else p.body.draw(ctx, camX, camY, 0, 0, gf, headGlowFilter);
        if (pf > 0) drawPlantDamage(p, ctx, camX, camY, pf);
      }
      // Sleeping Zzz (Plant::SetSleeping 516-532, REANIM_SLEEPING at
      // renderOrder+2): drawn right after its plant, like every nocturnal
      // asleep on a day board (scaredy included — anim_sleep pose alone
      // isn't the whole presentation).
      if (p.sleepReanim) p.sleepReanim.draw(ctx, camX, camY);
    }
    // Vasebreaker vases (GridItem::DrawScaryPot, RENDER_LAYER_PLANT): one per
    // row loop, after the row's plants (same layer, no cross-draw with zombies).
    if (b.isVase) {
      for (const v of b.vases) {
        if (v.row !== r) continue;
        const vp = b.vasePos(v.col, v.row);
        // GridItem::DrawScaryPot (GridItem.cpp:305): IMAGE_PLANTSHADOW2 at
        // (x-5, y+72) scale 1.3 (TodDrawImageCelCenterScaledF — the blob's
        // center lands at the formula point, same as drawShadow).
        const shadow2 = libs.images["plantshadow2.png"];
        if (shadow2 || shadow) drawShadow(vp.x - 5, vp.y + 72, 1.3, 1.3, shadow2 || shadow);
        drawScaryPot(v, vp.x, vp.y, camX, camY);
      }
    }
    const zs = b.zombies.filter((z) => z.row === r && !z.gone).sort((a, z2) => z2.x - a.x);
    for (const z of zs) {
      if (z.bungeeState || z.carrier) continue; // bungees + dangling cargo drawn in the bungee pass
      // Zombie::Draw during SCENE_ZOMBIES_WON (SetupDrawZombieWon 9318-9342):
      // the winner stays INVISIBLE until the pan starts (ShowZombieWalking:
      // cutsceneTime > LostTimePanRightStart = tick 150), then draws clipped
      // to the doorway region — day/night x >= -123, pool/fog x >= -172,
      // roof x >= -220 h 187 — so it slides behind the door frame as it
      // walks in (the mask paints the frame over it; DrawShadow is gated by
      // the same function).
      const isWinner = b.state === "lost" && z === b.winner;
      if (isWinner && b.lossT <= 150) continue;
      let winnerClipped = false;
      if (isWinner) {
        const cx = (b.bg === BG.POOL || b.bg === BG.FOG) ? -172 : -123;
        const ch = (b.bg === BG.ROOF || b.bg === BG.BOSS) ? 187 : 600;
        const rx = (b.bg === BG.ROOF || b.bg === BG.BOSS) ? -220 : cx;
        ctx.save(); ctx.beginPath(); ctx.rect(rx, 0, 800, ch); ctx.clip();
        winnerClipped = true;
      }
      // Zombie::HasShadow (9278): no static ground blob while
      // PHASE_ZOMBIE_DYING — it vanishes the instant the death animation
      // begins (no fade curve) — nor while a pole-vaulter is mid-vault
      // (PHASE_POLEVAULTER_IN_VAULT), nor while rising from a grave
      // (PHASE_RISING_FROM_GRAVE — the zombie is still underground).
      // (The blob visible under a falling corpse is the reanim's own
      // authored "shadow" track — visible over exactly the anim_death
      // frames in the retail data, stretching as the body tips — rendered
      // by retail too; it dissolves with the fade below. Our DrawShadow
      // equivalent is this blob only.)
      // Zombie::HasShadow (9278-9291) exclusions: no static blob while dying,
      // mid-vault, rising from a grave, DANCER_RISING, etc. — plus no blob
      // for the zamboni/catapult machines or the boss (source returns false
      // for all three outright), nor for a bobsled team still BOARDING
      // (the authored reanim shadow track covers it; the blob appears once
      // the team walks normally) — and nothing at all while in the pool
      // (mInPool returns false outright: swimming/diving/dolphin bodies
      // float, they cast no ground blob). Two more source-exact gates
      // (9278-9290): the into-pool dives (PHASE_SNORKEL_INTO_POOL /
      // PHASE_DOLPHIN_INTO_POOL — the jump arcs in from the pool edge with
      // altitude 0->10 before inPool flips, so without this the blob rides
      // the arc and, for dolphin, teleports 70px at the x-=70 pool entry)
      // and digging diggers (PHASE_DIGGER_TUNNELING family — the blob would
      // otherwise glide across the lawn with no visible zombie above it).
      // (The rise/pause phases digrise/digpause/digrisenoaxe are gated
      // separately below: same underground family, digging flag already
      // false once the emerge starts.)
      if (shadow && !z.inPool && !z.digging && z.phase !== "digrise" && z.phase !== "digpause" && z.phase !== "digrisenoaxe" && z.type !== "boss" && z.type !== "zamboni" && z.type !== "catapult" && z.phase !== "boarding" && !z.dead && z.phase !== "rising" && z.phase !== "dancerise" && z.phase !== "snorkel-into-pool" && z.phase !== "dolphin-into-pool" && !(z.type === "pole" && z.vaultT > 0)) {
        // Zombie::DrawShadow anchor: (mPosX+img+dx, mPosY+img+bodyY+type+92).
        const zs = zombieShadowSpec(z.type, {
          scale: z.scaleZombie, backwards: z.ally || (typeof z.isDiggerBackwards === "function" && z.isDiggerBackwards()), altitude: z.altitude,
          airborne: z.vaultT > 0 || (z.type === "bungee" && (z.bungeeState === "diving" || z.bungeeState === "screaming" || z.bungeeState === "rising")) || z.type === "balloon",
        });
        drawShadow(z.x + zs.dx, z.y + zs.dy + 92, zs.s);
      }
      // Hit flash (Zombie::DrawReanim 5630 body + 5668 shield): additive at half
      // the source counter*10/255 rate (user override — the full rate clips
      // pupils, mouth detail and pale gear to a flat sheet that reads as
      // see-through), fading over 25 ticks. Armor keeps its blend-toward-
      // white coat (drawZombieFlash — never an additive one, so light armor
      // can't clip); the shield counter still folds in via max() since our
      // shields live in the normal group.
      // Chilled zombies (Zombie::Draw 5088) render the same passes fully
      // opaque with a blue tint — never dimmed, never boxed.
      // Death fade (Zombie::Draw 5581-5584 + UpdateDeath 9259/Update 4274):
      // once the death fall completes (loopCount>0, boss never), mZombieFade
      // runs 100->0 (10 in pool); alpha = 255*fade/10, i.e. full opacity
      // until the last 10 ticks, then a quick dissolve; removal at 0. The
      // whole body — including the authored fall shadow — fades together
      // (the color override covers every DrawRenderGroup pass), so the
      // reanim alpha rides along, plus the attached flag pole which keeps
      // its own alpha field. Mowed zombies never fade (UpdateMowered
      // removes them the tick the flip loops — instant, like source).
      const fade = z.fadeT >= 0 ? Math.max(0, Math.min(1, z.fadeT / 10)) : 1;
      z.body.alpha = fade;
      if (z.flagPole) z.flagPole.alpha = fade;
      if (z.propeller) z.propeller.alpha = fade; // balloon propeller attachment rides the fade like the flag pole
      // Zombie::DrawReanim (Zombie.cpp:5630): sled-team members never flash —
      // the vehicle flashes instead (DrawBobsledReanim keys off the leader's
      // counter); the bodies render plain. Crash-unlinked members flash again.
      const sledTeam = z.type === "bobsled" && z.bobsledPosition() !== -1;
      const zf = !sledTeam && Math.max(z.justShot, z.shieldShot) > 0 ? (Math.max(z.justShot, z.shieldShot) * 10) / 255 : 0;
      // Zombie::DrawReanim clip branch + GetDrawPos pool/rise branches: the body
      // rides shifted down by bodyY — that shift lives in syncBody
      // (UpdateReanim 5184 bakes -(altitude) into body.y every tick), so draw
      // only applies the clip: a grave-anchored window while rising (zombie
      // emerges head-first), a waterline window while wading/diving/jumping
      // or dragged (DrawReanim 5630 clip branch + GetDrawPos 5909-6027).
      // Retail rect: (mX+imgOffX-200, mY+imgOffY+bodyY-78, 520,
      // 120-clipHeight+71) with bodyY = -mAltitude, rising clipHeight =
      // bodyY + min(mPhaseCounter, 40), pool clipHeight from GetDrawPos,
      // gated on clipHeight > CLIP_HEIGHT_LIMIT (-100, Zombie.h). Tracks
      // bake game+cam into absolute coords, so the rect rides cam too.
      // The window is enforced PER-TRACK inside body.draw so mIgnoreClipRect
      // tracks (tube/foam/hands — Zombie::DrawTrack) draw straight through
      // it, exactly like retail (canvas clips only intersect, so an outer
      // save/clip around the whole body would wrongly clip them too).
      // Accessories and the flag pole render inline in body.draw, so one
      // clip covers everything (retail clips AttachmentDraw the same way);
      // the armor-coat scratch blit inside the flash pass respects it.
      let riseClip = null, attachClip = null;
      if (z.phase === "rising") {
        const rBodyY = -(z.altitude | 0);
        // Zombie::GetDrawPos rising branch (Zombie.cpp:5909-5928): pool
        // risers clip at bodyY (no phaseCounter easing), land risers at
        // bodyY + min(mPhaseCounter, 40).
        const rClipH = z.inPool ? rBodyY : rBodyY + Math.min(z.riseT, 40);
        if (rClipH > -100) {
          riseClip = [z.x - 200 + camX, z.y + rBodyY - 78 + camY, 520, 120 - rClipH + 71];
          // Zombie::Draw attachment window (6243-6246): wider/shorter than
          // the body window — (mX+imgOffX-400, mY+imgOffY-28, 920,
          // 120-clip+21). Tangle vines + "?" ride this, not the body rect.
          attachClip = [z.x - 400 + camX, z.y + rBodyY - 28 + camY, 920, 120 - rClipH + 21];
        }
      } else {
        // Pool GetDrawPos (Zombie.cpp:5909): dolphin/snorkel/wader branches.
        // The dolphin image offsets ride the clip rect too (retail
        // mX+imgOffX / mY+imgOffY in the DrawReanim rect).
        try {
          const dp = z.getDrawPos();
          if (dp && dp.clipHeight > -100) {
            riseClip = [z.x + (dp.rideDX || 0) - 200 + camX, z.y + (dp.rideDY || 0) + dp.bodyY - 78 + camY, 520, 120 - dp.clipHeight + 71];
            attachClip = [z.x + (dp.rideDX || 0) - 400 + camX, z.y + (dp.rideDY || 0) + dp.bodyY - 28 + camY, 920, 120 - dp.clipHeight + 21];
          }
        } catch (e) { /* headless/def missing */ }
      }
      // Zombie::Draw (6213): the back freeze cube draws behind the body
      // (skipped in pool and on the boss, DrawIceTrap 6114).
      if (z.iceTrap > 0 && !z.inPool && z.type !== "boss") drawIceTrap(z, camX, camY, false);
      // Zombie::DrawBobsledReanim BEFORE part (Zombie.cpp:DrawBobsledReanim):
      // sliding pos-2 and crashing draw the inside + back first; boarding
      // draws back/inside before the body on its early/late halves.
      if (z.type === "bobsled") drawBobsled(z, true, fade, zf, camX, camY);
      drawDancerSpotlight(z, camX, camY, true); // floor glow under the leader
      if (z.burnT > 0) drawBurnedZombie(z, camX, camY, riseClip);
      else if (z.ally) drawMindControlledZombie(z, camX, camY, zf, riseClip);
      else if (z.chill > 0 || z.iceTrap > 0) drawChilledZombie(z, camX, camY, zf, riseClip); // Draw 5088: chilled OR ice share the blue tint
      else drawZombieFlash(z, ctx, camX, camY, zf, riseClip);
      // DrawBobsledReanim AFTER part: sliding pos-2 back again? No — the
      // AFTER call draws the front sled (and crash offsets); see drawBobsled.
      if (z.type === "bobsled") drawBobsled(z, false, fade, zf, camX, camY);
      drawDancerSpotlight(z, camX, camY, false); // beam over the leader
      // Zombie::Draw (6228): the front freeze cube draws over the body.
      if (z.iceTrap > 0 && !z.inPool && z.type !== "boss") drawIceTrap(z, camX, camY, true);
      // Tangle-kelp grab vines (Plant::UpdateTanglekelp attached reanim):
      // rides the victim at the per-type offsets (sim ticks it), drawn here
      // right after the body so the vines wrap the zombie. Zombie::Draw
      // (6243-6246) clips attachments with the WIDER window
      // (mX+imgOffX-400, mY+imgOffY-28, 920, 120-clip+21), not the body
      // rect — so the vines take attachClip.
      if (z.tangleFx && !z.tangleFx.dead) {
        try { z.tangleFx.alpha = fade; z.tangleFx.draw(ctx, camX, camY, 0, 0, 0, null, null, attachClip); } catch (e) { /* def missing */ }
      }
      // NOTE: the flag pole is attached to the body (track Zombie_flaghand)
      // and renders inline during body.draw — never draw it separately.
      // Ripped-paper "?" (AddAttachedReanim 8321, render order +1): drawn
      // with the row's zombies, riding the zombie at (-11, 0); PLAY_ONCE
      // retires it on its own, death kills it early (die()).
      if (z.surprise && !z.surprise.dead && !z.gone) {
        z.surprise.alpha = fade;
        z.surprise.draw(ctx, camX, camY);
      }
      if (winnerClipped) ctx.restore();
    }
    // Bowling rollers (Plant::UpdateBowling, RENDER_LAYER_PROJECTILE): banded by
    // renderRow, not the lane — the source recomputes mRenderOrder AFTER row--
    // going up but BEFORE row++ going down, so a down-weaving nut keeps the
    // band of the row it just left and slides behind both lanes' zombies,
    // while straight and up-weaving nuts ride their own lane's PROJECTILE
    // band in front of its zombies. Shadow rides the same band (Plant::Draw
    // draws it inline with the body).
    for (const bw of b.bowlers) {
      const br = (bw.renderRow !== undefined) ? bw.renderRow : bw.row;
      if (br !== r || bw.dead || !bw.body) continue;
      const bsp = Plant.shadowSpec(bw.seed);
      if (shadow && bsp) drawShadow(bw.x + bsp.dx, bw.y + bsp.dy, bsp.s);
      bw.body.draw(ctx, camX, camY);
    }
    // Bungee descenders/risers (Zombie::DrawBungeeReanim 5447-5491): the cord
    // tiles up from the body track, then the body, the dangling rider at
    // x-15 (riding -altitude via the carrier body), the lifted plant at
    // +0/+30 (roof cols<=4 +10, spiky -34 while rising), and the ARMS group
    // over all. The ground target (DrawBungeeTarget 5493-5515) draws under
    // divers only.
    const cordImg = libs.images["BungeeCord.png"];
    const tgtImg = libs.images["BungeeTarget.png"];
    for (const z of b.zombies) {
      if (z.row !== r || z.gone || !z.bungeeState || z.bungeeState === "cutscene") continue;
      // DrawBungeeTarget: skipped off-board/boss/ouchy/rising/has-cargo.
      if (tgtImg && tgtImg.width && !z.cargo && (z.bungeeState === "diving" || z.bungeeState === "screaming")) {
        // The ground marker sits static on the target cell while the diver
        // descends (it reads as the landing preview, exactly like retail).
        ctx.drawImage(tgtImg, z.x + 10 + camX, z.y + 60 + camY);
      }
      if (shadow && !z.hitUmbrella && !z.dead) { // HasShadow (9298): no blob once bounced
        const bwd = z.ally || (typeof z.isDiggerBackwards === "function" && z.isDiggerBackwards());
        const bspec = zombieShadowSpec(z.type, { scale: z.scaleZombie, backwards: bwd, altitude: z.altitude, airborne: (z.altitude | 0) > 0 });
        drawShadow(z.x + bspec.dx, z.y + bspec.dy + 92, bspec.s);
      }
      // IMAGE_BUNGEECORD loop: cels tile up from the body track.
      if (cordImg && cordImg.width && !z.dead) {
        try {
          if (z.body.trackExists("Zombie_bungi_body")) {
            const t = z.body.getCurrentTransform(z.body.findTrackIndex("Zombie_bungi_body"));
            const s = z.body.scaleX || 1;
            const ax = z.body.x + t.x * s + camX, ay = z.body.y + t.y * s + camY;
            const w = 8 * s, h = 64 * s;
            if (w > 0 && h > 0) for (let yy = ay; yy > camY - h; yy -= h) ctx.drawImage(cordImg, ax - w / 2, yy - h, w, h);
          }
        } catch (e) { /* def missing */ }
      }
      const fade = z.fadeT >= 0 ? Math.max(0, Math.min(1, z.fadeT / 10)) : 1;
      z.body.alpha = fade;
      const zf = Math.max(z.justShot, z.shieldShot) > 0 ? (Math.max(z.justShot, z.shieldShot) * 10) / 255 : 0;
      if (z.burnT > 0) drawBurnedZombie(z, camX, camY, null);
      else if (z.ally) drawMindControlledZombie(z, camX, camY, zf, null);
      else if (z.chill > 0 || z.iceTrap > 0) drawChilledZombie(z, camX, camY, zf, null);
      else drawZombieFlash(z, ctx, camX, camY, zf, null);
      // Carried rider: dangles at x-15, pinned to the carrier body.
      const cg = z.cargo;
      if (cg && !cg.gone && !cg.dead && cg.body && !cg.body.dead) {
        cg.body.x = z.body.x - 15; cg.body.y = z.body.y;
        cg.body.draw(ctx, camX, camY);
      }
      // Carried plant: +0/+30, +10 roof cols<=4, -34 spiky while rising.
      const p = z.targetPlant;
      if (p && !p.dead && p.onBungee === "rising" && p.body && !p.body.dead) {
        p.body.x = z.x;
        p.body.y = z.body.y + 30 + ((b.bg === BG.ROOF && p.col <= 4) ? 10 : 0) + (p.seed === 21 && z.bungeeState === "rising" ? -34 : 0);
        p.body.draw(ctx, camX, camY);
      }
      z.body.draw(ctx, camX, camY, RENDER_GROUP_ARMS); // arms over everything (5445)
    }
    // Flying heads/arms (PARTICLE_ZOMBIE_HEAD/ARM debris): render order is the
    // zombie's order + 1, i.e. right after the row's zombies.
    for (const d of b.debris) if (d.row === r && !d.dead) d.draw(ctx, camX, camY);
    // Mower-kill puffs (MowDown 8563-8564: REANIM_PUFF at -73/-56,
    // renderOrder+2 — above the +1 debris): row-pass, right after the debris.
    if (b.puffs) for (const p of b.puffs) if (p.row === r && !p.body.dead) p.body.draw(ctx, camX, camY);
    // Charred husks (ApplyBurn 8740: AddReanimation at the zombie's render
    // order): drawn with the row's zombies, same as the debris above.
    if (b.husks) for (const h of b.husks) if (h.row === r && !h.body.dead) h.body.draw(ctx, camX, camY);
    // Flying squash (UpdateSquash 1552: RENDER_LAYER_PARTICLE from RISING
    // until death — above the row's zombies/debris, below the mower):
    // same shadow + body + eaten-flash passes as the rooted draw above.
    for (const p of plants) {
      if (p.seed !== 17 || !p.flightBand || p.dead) continue;
      const sp = Plant.shadowSpec(p.seed, p);
      if (shadow && sp) drawShadow(p.x + sp.dx, p.y + p.drawOff + sp.dy, sp.s);
      const pf = p.flash > 0 ? Math.min(p.flash * 3, 90) / 255 : 0;
      const gf = p.glow > 0 ? Math.min(p.glow * 0.6, 60) / 255 : 0;
      const hl = p.highlighted ? 196 / 255 : 0;
      if (hl > 0) p.body.draw(ctx, camX, camY, 0, hl, 0, null, null);
      else p.body.draw(ctx, camX, camY, 0, 0, gf, headGlowFilter);
      if (pf > 0) drawPlantDamage(p, ctx, camX, camY, pf);
      if (p.sleepReanim) p.sleepReanim.draw(ctx, camX, camY);
    }
    // Mowers sit in their own row pass AFTER that row's zombies (Board
    // render list: MakeRenderOrder = row*10000 + layer + offset, so within a
    // row LAWN_MOWER 306000 beats ZOMBIE 303000/PLANT 302000 — the mower
    // drives OVER the flattened zombie). CutScene slides them in from
    // -160/-80; visible throughout.
    for (const m of b.mowers) {
      if (!m || m.row !== r || m.state === "used" || m.visible === false) continue;
      // LawnMower::Draw shadow anchors per type (LawnMower.cpp:304-335):
      // lawn (mPosX-7, mPosY-alt+47, 1); pool (mPosX-24, mPosY-alt+39, 1);
      // roof (mPosX-16, mPosY-alt+11 ready / +47 triggered, sy 1.2).
      // The pool cleaner dips (alt 0 -> -28); the blob dips with it.
      if (shadow) {
        if (m.pool) drawShadow(m.x - 24, m.y - (m.alt || 0) + 39, 1);
        else if (m.roof) drawShadow(m.x - 16, m.y - (m.alt || 0) + (m.state !== "ready" ? 47 : 11), 1, 1.2);
        else drawShadow(m.x - 7, m.y - (m.alt || 0) + 47, 1);
      }
      if (m.body) m.body.draw(ctx, camX, camY);
      else if (libs.images["LawnMower.png"]) ctx.drawImage(libs.images["LawnMower.png"], m.x + 6 - 30, m.y - (m.alt || 0) + 18 - 25, 60, 50);
    }
    // Grave dirt for THIS row (PARTICLE layer, row-banded — above this
    // row's zombies/mowers, below the next row's — so a rising backup
    // dancer's burst never covers other lanes).
    if (b.graveFx) for (const em of b.graveFx) if ((em.row ?? -1) === r) drawGraveFxOne(em);
    // Jalapeno fire trail (Board::DoFwoosh, RENDER_LAYER_PARTICLE row+1):
    // 12 REANIM_JALAPENO_FIRE flames across the burning row, above the
    // row's zombies/husks/mowers, below the next row — same band as the
    // grave dirt above. Finished done-anims sweep in updateFx.
    if (b.fwoosh) for (const f of b.fwoosh) if (f.row === r && !f.body.dead) f.body.draw(ctx, camX, camY);
    // Fire-pea impact flames (Projectile::DoImpact 861-870, mRenderOrder+1 =
    // the same PARTICLE row band as the fwoosh above). One-shot bursts sweep
    // in updateFx.
    if (b.fireFx) for (const f of b.fireFx) if (f.row === r && !f.body.dead) f.body.draw(ctx, camX, camY);
    // Digger tunnel/rise fx + rise-dirt reanims (PARTICLE row band, same as
    // the fwoosh/fire above: above this row's zombies/husks/mowers, below
    // the next row).
    if (b.diggerFx) for (const em of b.diggerFx) if ((em.row ?? -1) === r) drawDiggerFxOne(em);
    if (b.diggerDirt) for (const d of b.diggerDirt) if ((d.row ?? -1) === r && d.body && !d.body.dead) d.body.draw(ctx, camX, camY);
    // Board render list (6406-6418): once the zombies have won, the door
    // mask draws at GRAVE_STONE (3,2) = row*10000+301000+3000+2 = 331002 —
    // above the row-2 winner (ZOMBIE+4 = 323004) but below row-3 entities —
    // so the winner passes BEHIND the door frame as it walks in
    // (DrawHouseDoorTop, RENDER_ITEM_DOOR_MASK). Positions per background
    // (DrawHouseDoorTop 6785-6797); on roof/boss the mask is the chimney
    // surround at (-220, 81) and the winner sinks behind it instead.
    if (r === 2 && b.state === "lost") {
      const maskPos = { 1: [-130, 202], 2: [-128, 207], 3: [-172, 234], 4: [-173, 133], 5: [-220, 81], 6: [-220, 81] }[b.bg];
      if (maskPos) {
        const mask = libs.images[`background${b.bg}_gameover_mask.png`];
        if (mask) ctx.drawImage(mask, maskPos[0], maskPos[1]);
      }
    }
  }
  // Cutscene street zombies: real display reanims standing idle on the
  // street (PlaceStreetZombies display-only, FromWave CUTSCENE, added via
  // AddZombieInRow with the type's own reanim). Zombie::LoadReanim's
  // off-board branch (Zombie.cpp:969-983) plays anim_idle2 @ 12-24fps on a
  // 75% roll when the track exists, else anim_idle @ 12-18fps, each zombie
  // phased randomly — never the walk cycle. Per-type specials come from
  // ZombieInitialize (zamboni drive, bungee drop, pogo bounce, catapult
  // shamble, balloon drift, dancer moonwalk). Drawn in LAWN render order
  // ((gx%2)*2 + gy*4). If the art failed to load, draw nothing rather than
  // a fabricated stand-in.
  if (cs && !cs.zreans) {
    cs.zreans = [];
    try {
      const defFor = (t) => DEFS.get(((ROSTER[t] || {}).reanim) || "Zombie") || DEFS.get("Zombie");
      for (const cz of (b.cutsceneZombies || [])) {
        const r = new Reanimation(defFor(cz.type), cz.x, cz.y);
        // LoadPlainZombieReanim (950): retail spawns REAL zombies via
        // AddZombieInRow on pool rows, so plain walkers wear the ducky tube.
        const poolRow = (b.bg === BG.POOL || b.bg === BG.FOG) && (cz.gy === 2 || cz.gy === 3);
        concealZombieExtras(r, cz.type, cz.type === "ducky" || poolRow);
        const t = cz.type;
        // Little Trouble previews are half-size (ZombieInitialize 792-799
        // covers on-board AND ZOMBIE_WAVE_CUTSCENE zombies — retail previews
        // are real Zombie objects; the port builds bare reanims, so apply
        // the OverrideScale anchor shift here exactly like syncBody does,
        // incl. the football +10 (UpdateReanim 5229-5232)).
        if (b.level === 25) {
          r.setScale(0.5, 0.5);
          r.x += 30 - 0.5 * 30; r.y += 120 - 0.5 * 120;
          if (t === "football") r.y += 20 - 0.5 * 20;
        }
        // Idle layer + rate pick (LoadReanim 971-980, ZombieInitialize specials).
        let layer = null, rate = 0, hold = false, phase = Math.random() * 0.99;
        if (t === "zamboni" && r.trackExists("anim_drive")) { layer = "anim_drive"; rate = 12; }
        else if (t === "bungee" && r.trackExists("anim_drop")) { layer = "anim_drop"; rate = 24; }
        else if (t === "pogo" && r.trackExists("anim_pogo")) { layer = "anim_pogo"; rate = 40; hold = true; phase = 1; }
        else if (t === "catapult" && r.trackExists("anim_idle")) { layer = "anim_idle"; rate = 8; }
        else if (t === "dancer" && r.trackExists("anim_moonwalk")) { layer = "anim_moonwalk"; rate = 12; }
        else if (t === "backup" && r.trackExists("anim_armraise")) { layer = "anim_armraise"; rate = 12; } // off-board backup (Zombie.cpp:595)
        else if (r.trackExists("anim_idle2") && Math.random() < 0.75) { layer = "anim_idle2"; rate = 12 + Math.random() * 12; }
        else if (r.trackExists("anim_idle")) { layer = "anim_idle"; rate = 12 + Math.random() * 6; }
        if (t === "balloon" && layer) rate = 8 + Math.random() * 2; // off-board drift (Zombie.cpp:560)
        if (layer) r.playReanim(layer, hold ? PLAY_ONCE_AND_HOLD : LOOP, 0, rate);
        r.animTime = phase;
        r.czOrder = cz.order | 0;
        cs.zreans.push(r);
      }
      cs.zreans.sort((a, z) => a.czOrder - z.czOrder);
    } catch (e) { cs.zreans = []; }
  }
  if (cs && !b.cutsceneZombies.length) cs.zreans = null;
  else if (cs && cs.zreans) for (const r of cs.zreans) { r.update(); r.draw(ctx, camX, camY); }
  // projectiles (Projectile::Draw 966 + GameObject::BeginDraw: the graphics
  // frame is translated to (mX,mY) = top-left, then the image cel blits at
  // (0,0) at NATURAL size, scale 1, rotation 0 — never stretched to a square.
  for (const p of b.projs) {
    if (p.delay > 0) continue;
    // PROJECTILE_FIREBALL draws no pea image (Projectile::Draw 985-988:
    // aImage = nullptr) — only the REANIM_FIRE_PEA attachment rides along.
    // Headless/loaded-before-def: fall back to the pea + glow stand-in.
    if (p.type === "fire" && p.fx && !p.fx.dead) { p.fx.draw(ctx, camX, camY); continue; }
    if (p.img) {
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.type === "puff") {
        // Projectile::Draw 997-1001: IMAGE_PUFFSHROOM_PUFF1 scaling 0.3->1.0
        // over age 0-30 (LINEAR); at full scale the cel blits at top-left like
        // every other shot, while ramped it scales about the cel center.
        const t = Math.max(0, Math.min(1, p.age / 30));
        if (t < 1) {
          const s = 0.3 + 0.7 * t, w = p.img.width, h = p.img.height;
          ctx.translate(w / 2, h / 2);
          ctx.scale(s, s);
          ctx.drawImage(p.img, -w / 2, -h / 2);
        } else ctx.drawImage(p.img, 0, 0);
      } else {
        if (p.fire) { ctx.fillStyle = "rgba(255,120,0,0.5)"; ctx.beginPath(); ctx.arc(p.img.width / 2, p.img.height / 2, 14, 0, 7); ctx.fill(); }
        if (p.type === "star") {
          // Projectile::Draw (1038-1057): the star spins about its cel
          // center (TodScaleRotateTransformMatrix at mPos + cel/2).
          const w = p.img.width, h = p.img.height;
          ctx.translate(w / 2, h / 2);
          ctx.rotate(p.rot || 0);
          ctx.drawImage(p.img, -w / 2, -h / 2);
        } else ctx.drawImage(p.img, 0, 0);
      }
      ctx.restore();
    } else { ctx.fillStyle = "#7f0"; ctx.fillRect(p.x, p.y, 8, 8); }
  }
  // Lobbed shots (Projectile::Draw 1007-1031 + 1051-1063 + DrawShadow
  // 1119-1150): each cabbage spins about its cel center
  // (TodScaleRotateTransformMatrix at mPos + cel/2, scale 1.0 — kernel 0.95,
  // butter 0.8, melon 1.0) while its blob rides (mPosX+3, shadowY+10),
  // shrinking 200/(height+200) as it climbs (IMAGE_PEA_SHADOWS, night cel 1).
  // Shadows draw first so every arc sits under its ball.
  {
    const lobShadow = libs.images["pea_shadows.png"];
    const night = b.stageIsNight && b.stageIsNight();
    if (lobShadow && lobShadow.width) {
      const cw = lobShadow.width / 2; // day/night cels side by side
      for (const l of b.lobs) {
        const h = Math.max(0, Math.min(200, -(l.z || 0)));
        const sc = 1.6 * 200 / (h + 200);
        ctx.drawImage(lobShadow, night ? cw : 0, 0, cw, lobShadow.height,
          l.x + 3, l.shadowY + 10, cw * sc, lobShadow.height * sc);
      }
    }
  }
  for (const l of b.lobs) {
    if (!l.img || !l.img.width) continue;
    const sc = l.type === "kernel" ? 0.95 : l.type === "butter" ? 0.8 : 1.0;
    const w = l.img.width, h = l.img.height;
    ctx.save();
    ctx.translate(l.x + w / 2, l.y + h / 2);
    ctx.rotate(l.rot || 0);
    ctx.scale(sc, sc);
    ctx.drawImage(l.img, -w / 2, -h / 2);
    ctx.restore();
  }
  // coins / sun (Coin::Draw: the sun IS its reanim; coins add a glow + dollar cel).
  // Uncollected coins draw in the world pass — retail rides COIN_BANK
  // 600000, ABOVE the seed bank (UI_BOTTOM 100000), so falling suns pass
  // OVER the bank; collected ones draw after the HUD so the flight into the
  // counter renders over everything.
  for (const c of b.coins) if (!c.collected) drawCoin(c, camX, camY);
  // flashes
  for (const f of b.flashes) {
    ctx.save(); ctx.globalAlpha = Math.min(1, f.t / 15);
    ctx.fillStyle = f.fire ? "#f80" : "#fff";
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - f.t / 40), 0, 7); ctx.fill();
    ctx.restore();
  }
  // dirt bursts (Board::DoPlantingEffects -> PARTICLE_PLANTING, RENDER_LAYER_TOP:
  // IMAGE_DIRTSMALL = 16 cels of 40x40 (8x2); pool variant is
  // PARTICLE_PLANTING_POOL with IMAGE_WATERPARTICLE = waterparticle.png,
  // 6 cels of 40x40, byte-identical from main.zip images/.
  const dirtImg = libs.images["dirtsmall.png"];
  const waterImg = libs.images["waterparticle.png"];
  if (dirtImg && b.dirt) {
    const cw = dirtImg.width / 8, ch = dirtImg.height / 2;
    const ww = waterImg && waterImg.width ? waterImg.width / 6 : 0, wh = waterImg && waterImg.width ? waterImg.height : 0;
    for (const d of b.dirt) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, d.life / 15);
      if (d.water && waterImg && waterImg.width) {
        const w = ww * d.s, h = wh * d.s;
        ctx.drawImage(waterImg, (d.cel % 6) * ww, 0, ww, wh, d.x - w / 2, d.y - h / 2, w, h);
      } else {
        const w = cw * d.s, h = ch * d.s;
        ctx.drawImage(dirtImg, (d.cel % 8) * cw, Math.floor(d.cel / 8) * ch, cw, ch, d.x - w / 2, d.y - h / 2, w, h);
      }
      ctx.restore();
    }
  }
  // Squash landing dust (PARTICLE_DUST_SQUASH, UpdateSquash 1603,
  // AddTodParticle at renderOrder+4 = RENDER_LAYER_TOP): Dust_puffs.png,
  // 3 cels of 32x27; alpha fades over the last 15 ticks like the dirt.
  const sqDustImg = libs.images["particles/Dust_puffs.png"];
  if (sqDustImg && sqDustImg.width && b.squashDust) {
    const cw = sqDustImg.width / 3, ch = sqDustImg.height;
    for (const d of b.squashDust) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, d.life / 15);
      const w = cw * d.s, h = ch * d.s;
      ctx.drawImage(sqDustImg, d.cel * cw, 0, cw, ch, d.x - w / 2, d.y - h / 2, w, h);
      ctx.restore();
    }
  }
  // Magnet-shroom steals (Plant::DrawMagnetItems at RENDER_LAYER_TOP via
  // RENDER_ITEM_PLANT_MAGNET_ITEMS, gated by DrawMagnetItemsOnTop: the
  // flying item draws while its flight vector is still >20px out). The
  // armor sprite rides at scale 0.8 about the top-left, offset by the
  // plant's draw height like the body (BeginDraw frame translate).
  for (const p of b.allPlants()) {
    if (p.seed !== 31 || !p.drawMagnetItemsOnTop || !p.drawMagnetItemsOnTop()) continue;
    const it = p.magnetItem;
    if (!it || !it.img || !it.img.width) continue;
    ctx.drawImage(it.img, it.x, it.y + (p.drawOff || 0), it.w * 0.8, it.h * 0.8);
  }
  // Pool fx (Zombie::PoolSplash 6823 + UpdateZombieDolphinRider tall-nut bonk,
  // both RENDER_LAYER_TOP): REANIM_SPLASH entry/exit bursts (reanim ticked
  // in updateFx) and PARTICLE_TALL_NUT_BLOCK (TallNutBlock.xml, main.zip
  // STAR40 art, normal blend, yellow 1/0.9/0 tint, TOP pass).
  // (The POOL_SPARKLY glows draw in the backdrop with the water — see
  // drawPoolWater, RENDER_LAYER_GROUND order 2 — not in this TOP pass.)
  if (b.splashes) for (const sp of b.splashes) {
    if (sp.reanim && !sp.reanim.dead) { try { sp.reanim.draw(ctx, camX, camY); } catch (e) { /* def missing */ } }
  }
  // Storm splash reanims (Challenge::UpdateRain, RENDER_LAYER_GROUND): same
  // holder shape as the pool splashes above, drawn in the same TOP pass.
  if (b.rainFx) for (const rf of b.rainFx) {
    if (rf.reanim && !rf.reanim.dead) { try { rf.reanim.draw(ctx, camX, camY); } catch (e) { /* def missing */ } }
  }
  {
    const star = libs.images["particles/Star40.png"];
    if (star && star.width) for (const tb of (b.tallnutBlocks || [])) {
      if (tb.age >= tb.dur) continue;
      const sysT = tb.dur <= 1 ? 1 : tb.age / (tb.dur - 1);
      const sysA = sysT <= 0.8 ? 1 : Math.max(0, 1 - (sysT - 0.8) / 0.2);
      if (sysA <= 0.004) continue;
      const tint = tintedParticle(star, 1, 0.9, 0);
      if (!tint) continue;
      for (const m of (tb.motes || [])) {
        const t = m.dur <= 1 ? 1 : m.age / (m.dur - 1);
        const al = (t <= 0.4 ? 1 : Math.max(0, 1 - (t - 0.4) / 0.6)) * sysA;
        if (al <= 0.004) continue;
        ctx.save();
        ctx.globalAlpha = Math.min(1, al);
        ctx.translate(m.x, m.y);
        ctx.rotate(m.rot);
        const w = tint.width * m.sc, h = tint.height * m.sc;
        ctx.drawImage(tint, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
  }
  // Zamboni systems (PARTICLE_ZAMBONI_SMOKE/TIRE/EXPLOSION(2)/ICE_SPARKLE,
  // RENDER_LAYER_PARTICLE/TOP): centered + rotated + scaled + tinted
  // RenderParticle draws, normal blend. Image map: smoke = ZamboniSmoke.png
  // (3 cels of 26x22), dirt = dirtsmall.png top row (8x40x40), cloud =
  // ExplosionCloud.png (80x80), damage1/wheel/brush = grafted atlas cels via
  // the Zamboni def's frameMap, sparkle = IceSparkle.png (3x20x20), zomboss
  // = Zomboss_particles.png (5 cels of 69x80), sproing = Sproing.png (200x200
  // single cel, the JackExplode spring — no tint tracks on that emitter).
  // Alpha = particle x system;
  // the ice-sparkle systems carry alphaMul (timer/10, UpdateIce 5550).
  if (b.zamFx) {
    const zamSmoke = libs.images["particles/ZamboniSmoke.png"];
    const zamDirt = libs.images["dirtsmall.png"];
    const zamCloud = libs.images["particles/ExplosionCloud.png"];
    const zamSparkle = libs.images["particles/IceSparkle.png"];
    const zamBoss = libs.images["particles/Zomboss_particles.png"];
    const zamSproing = libs.images["particles/Sproing.png"];
    let zamDef = null;
    try { zamDef = DEFS.get("Zombie_zamboni"); } catch (e) { zamDef = null; }
    const zamCel = (key) => {
      try {
        if (!zamDef || !zamDef.images) return null;
        const rc = zamDef.images.get(key);
        if (!rc || !(rc.w > 0) || !(rc.h > 0)) return null;
        return { img: zamDef.atlas, x: rc.x, y: rc.y, w: rc.w, h: rc.h };
      } catch (err) { return null; }
    };
    const ZAM_CEL_KEY = { damage1: "IMAGE_REANIM_ZOMBIE_ZAMBONI_1_DAMAGE1", wheel: "IMAGE_REANIM_ZOMBIE_ZAMBONI_WHEEL", brush: "IMAGE_REANIM_ZOMBIE_ZAMBONI_BRUSH" };
    for (const em of b.zamFx) {
      const d = em.def;
      if (!d || !d.img) continue;
      const st = em.sysDur <= 1 ? 1 : Math.min(1, em.sysAge / (em.sysDur - 1));
      const sysA = (d.sysAlphaN ? evalPowieTrack(d.sysAlphaN, st, 0.5) : 1) * (em.alphaMul !== undefined ? em.alphaMul : 1);
      if (sysA <= 0.004) continue;
      for (const m of em.motes) {
        const t = m.dur <= 1 ? 1 : Math.min(1, m.age / (m.dur - 1));
        const al = (d.pAlphaN ? evalPowieTrack(d.pAlphaN, t, m.ai) : 1) * sysA;
        if (al <= 0.004) continue;
        const sc = d.pScaleN ? Math.max(0, evalPowieTrack(d.pScaleN, t, m.sci)) : 1;
        if (sc <= 0.004) continue;
        const tintR = d.pRedN ? evalPowieTrack(d.pRedN, t, 0.5) : 1;
        const tintG = d.pGreenN ? evalPowieTrack(d.pGreenN, t, 0.5) : 1;
        const tintB = d.pBlueN ? evalPowieTrack(d.pBlueN, t, 0.5) : 1;
        ctx.save();
        ctx.globalAlpha = Math.min(1, al);
        ctx.translate(m.x, m.y);
        ctx.rotate(m.spin || 0);
        if (d.img === "smoke" && zamSmoke && zamSmoke.width) {
          const fw = zamSmoke.width / 3;
          const w = fw * sc, h = zamSmoke.height * sc;
          const fr = Math.max(0, Math.min(2, m.frame | 0));
          const t2 = (tintR !== 1 || tintG !== 1 || tintB !== 1) ? tintedParticle(zamSmoke, tintR, tintG, tintB) : zamSmoke;
          if (t2 === zamSmoke) ctx.drawImage(zamSmoke, fr * fw, 0, fw, zamSmoke.height, -w / 2, -h / 2, w, h);
          else { const sw = t2.width / 3; ctx.drawImage(t2, fr * sw, 0, sw, t2.height, -w / 2, -h / 2, w, h); }
        } else if (d.img === "dirt" && zamDirt && zamDirt.width) {
          const cw = zamDirt.width / 8, chh = zamDirt.height / 2;
          const w = cw * sc, h = chh * sc;
          ctx.drawImage(zamDirt, (m.frame % 8) * cw, 0, cw, chh, -w / 2, -h / 2, w, h);
        } else if (d.img === "cloud" && zamCloud && zamCloud.width) {
          const t2 = (tintR !== 1 || tintG !== 1 || tintB !== 1) ? tintedParticle(zamCloud, tintR, tintG, tintB) : zamCloud;
          const w = t2.width * sc, h = t2.height * sc;
          ctx.drawImage(t2, -w / 2, -h / 2, w, h);
        } else if (d.img === "sparkle" && zamSparkle && zamSparkle.width) {
          const fw = zamSparkle.width / 3;
          const w = fw * sc, h = zamSparkle.height * sc;
          const fr = Math.max(0, Math.min(2, m.frame | 0));
          ctx.drawImage(zamSparkle, fr * fw, 0, fw, zamSparkle.height, -w / 2, -h / 2, w, h);
        } else if (d.img === "zomboss" && zamBoss && zamBoss.width) {
          const fw = zamBoss.width / 5;
          const w = fw * sc, h = zamBoss.height * sc;
          const fr = Math.max(0, Math.min(4, m.frame | 0));
          ctx.drawImage(zamBoss, fr * fw, 0, fw, zamBoss.height, -w / 2, -h / 2, w, h);
        } else if (d.img === "sproing" && zamSproing && zamSproing.width) {
          const w = zamSproing.width * sc, h = zamSproing.height * sc;
          ctx.drawImage(zamSproing, -w / 2, -h / 2, w, h);
        } else if (ZAM_CEL_KEY[d.img]) {
          // Grafted atlas cels (no tint tracks on these emitters — draw raw).
          const cel = zamCel(ZAM_CEL_KEY[d.img]);
          if (!cel) { ctx.restore(); continue; }
          const w = cel.w * sc, h = cel.h * sc;
          ctx.drawImage(cel.img, cel.x, cel.y, cel.w, cel.h, -w / 2, -h / 2, w, h);
        }
        ctx.restore();
      }
    }
  }
  // pea/snow splats (Projectile::DoImpact PARTICLE_PEA/SNOWPEA_SPLAT,
  // RENDER_LAYER_PROJECTILE + 1, drawn here with the other TOP-layer fx;
  // attached ones ride their zombie via the stored anchor, like SystemMove
  // follow — a row-late zombie in front won't cover them, a 20-30t nit).
  // Pea uses the user's own particles/Peasplat.png strip (15 cels of 91x81);
  // the mote carries animT/animRate (AnimationRate 2.5) so the frame plays
  // floor(animT*15) exactly like RenderParticle (see peaSplat() in sim.js).
  const splatImgs = {
    peaSplat: libs.images["particles/Peasplat.png"],
    cabbageSplat: libs.images["particles/cabbagepult.png"],
    umbrellaReflect: libs.images["particles/Zombie_catapult_basketball.png"],
    mindcontrol: libs.images["particles/MindControl.png"],
    puffBits: libs.images["particles/PuffShroom_puff2.png"],
    snowSplat: libs.images["particles/SnowPea_splats.png"], snowBits: libs.images["particles/SnowPea_particles.png"],
    starSplat: libs.images["particles/Star_splats.png"], starBits: libs.images["particles/Star_particles.png"],
  };
  const trackEval = (stops, t) => {
    if (t <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, v0] = stops[i - 1], [t1, v1] = stops[i];
        return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
      }
    }
    return stops[stops.length - 1][1];
  };
  if (b.splats) for (const s of b.splats) {
    const img = splatImgs[s.img];
    if (!img) continue;
    let x, y;
    if (s.z) { if (s.z.gone) continue; x = s.z.x + s.ox + s.dx; y = s.z.y + s.oy + s.dy; }
    else { x = s.ox + s.dx; y = s.oy + s.dy; }
    const t = s.age / (s.dur - 1);
    const al = trackEval(s.al, t);
    if (al <= 0) continue;
    const sc = trackEval(s.sc, t);
    // RenderParticle frame select: floor(animT*ImageFrames), clamped to the
    // ART's cel count (aFrame >= mNumCols -> NumCols-1) — usually identical,
    // but the cabbage strip plays 10 anim frames over 8 cels (s.cels), so the
    // last two frames hold the final cel.
    const cels = s.cels || s.frames;
    const fr = s.animRate ? Math.min(cels - 1, Math.floor(s.animT * s.frames)) : s.frame;
    const fw = img.width / cels;
    ctx.save();
    ctx.globalAlpha = Math.min(1, al);
    ctx.translate(x, y);
    ctx.rotate(s.rot + s.spin * s.age);
    const w = fw * sc, h = img.height * sc;
    ctx.drawImage(img, fr * fw, 0, fw, img.height, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  // Potato-mine blast (Plant::DoSpecial 4421: PARTICLE_POTATO_MINE,
  // RENDER_LAYER_PARTICLE): the user's compiled spudow strip
  // (particles/spudow.png, 14 uniform cels of 205x222), played
  // floor(animT*14) like RenderParticle over its 85-tick life at the
  // EmitterOffsetY -50 anchor. Same centered normal-blend draw as the
  // splats above; shares their trackEval helper.
  const spudowImg = libs.images["particles/spudow.png"];
  if (spudowImg && spudowImg.width && b.potatoBlasts) for (const s of b.potatoBlasts) {
    const t = s.dur <= 1 ? 1 : s.age / (s.dur - 1);
    const al = trackEval(s.al, t);
    if (al <= 0) continue;
    const sc = trackEval(s.sc, t);
    const fr = Math.min(s.frames - 1, Math.floor(s.animT * s.frames));
    const fw = spudowImg.width / s.frames;
    ctx.save();
    ctx.globalAlpha = Math.min(1, al);
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot + s.spin * s.age);
    const w = fw * sc, h = spudowImg.height * sc;
    ctx.drawImage(spudowImg, fr * fw, 0, fw, spudowImg.height, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  // Fume-shroom spray (Plant::UpdateShooting 3245: PARTICLE_FUMECLOUD,
  // RENDER_LAYER_PARTICLE): the user's compiled strip
  // (particles/fumeshroom_bubbles.png, 27 uniform cels of 365x116), played
  // floor(animT*27) like RenderParticle over its 50-tick life at the
  // EmitterOffset (190,-5) anchor (baked into the mote pos by
  // spawnFumeCloud). Same centered normal-blend draw as the splats above;
  // shares their trackEval helper. The strip covers the whole 340px cone
  // in each cel (mouth at left, drift baked into the art).
  const fumeImg = libs.images["particles/fumeshroom_bubbles.png"];
  if (fumeImg && fumeImg.width && b.fumeClouds) for (const s of b.fumeClouds) {
    const t = s.dur <= 1 ? 1 : s.age / (s.dur - 1);
    const al = trackEval(s.al, t);
    if (al <= 0) continue;
    const sc = trackEval(s.sc, t);
    const fr = Math.min(s.frames - 1, Math.floor(s.animT * s.frames));
    const fw = fumeImg.width / s.frames;
    ctx.save();
    ctx.globalAlpha = Math.min(1, al);
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot + s.spin * s.age);
    const w = fw * sc, h = fumeImg.height * sc;
    ctx.drawImage(fumeImg, fr * fw, 0, fw, fumeImg.height, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  // Wallnut-eat particles (Zombie::AnimateChewEffect PARTICLE_WALLNUT_EAT_SMALL
  // at the chewing mouth + Plant::AnimateNuts PARTICLE_WALLNUT_EAT_LARGE on
  // crack-stage transitions, RENDER_LAYER_PROJECTILE(_row)/TOP — user's
  // main.zip art: Small 5 cels of 8x8, Large 5 cels of 18x18, static random
  // frame per mote, normal blend, like RenderParticle.
  const wallnutImgs = {
    small: libs.images["particles/WallnutParticlesSmall.png"],
    large: libs.images["particles/WallnutParticlesLarge.png"],
  };
  if (b.wallnutEats) for (const em of b.wallnutEats) {
    const img = em.big ? wallnutImgs.large : wallnutImgs.small;
    if (!img || !img.width) continue;
    const st = em.sysDur <= 1 ? 1 : Math.min(1, em.sysAge / (em.sysDur - 1));
    const sysA = st <= 0.8 ? 1 : Math.max(0, 1 - (st - 0.8) / 0.2); // SystemAlpha "1,80 0"
    if (sysA <= 0) continue;
    const frames = 5, fw = img.width / frames;
    for (const m of em.motes) {
      const t = m.dur <= 1 ? 1 : m.age / (m.dur - 1);
      const al = (t <= 0.8 ? 1 : Math.max(0, 1 - (t - 0.8) / 0.2)) * sysA; // ParticleAlpha "1,80 0"
      if (al <= 0.004) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, al);
      ctx.translate(m.x, m.y);
      ctx.rotate(m.spin);
      const w = fw * m.sc, h = img.height * m.sc;
      ctx.drawImage(img, m.frame * fw, 0, fw, img.height, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  };
  // Cherry/explode-o-nut blast (Plant::DoSpecial 4361 / bowling 2431:
  // PARTICLE_POWIE, RENDER_LAYER_TOP — 14 small + 14 big orange puffs plus
  // the static POW word, main.zip art, motion/color/alpha per Powie.xml via
  // GetRenderParams: color = particle x system, alpha likewise, normal
  // (non-additive) draw, centered + rotated + scaled like RenderParticle.
  const powieImgs = {
    cloud: libs.images["particles/ExplosionCloud.png"],
    word: libs.images["particles/Pow.png"],
  };
  if (b.powies) for (const em of b.powies) {
    const img = powieImgs[em.def.img];
    if (!img || !img.width) continue;
    const d = em.def;
    const st = em.sysDur <= 1 ? 1 : Math.min(1, em.sysAge / (em.sysDur - 1));
    const sysA = d.sysAlphaN ? evalPowieTrack(d.sysAlphaN, st, 0.5) : 1;
    for (const m of em.motes) {
      const t = m.dur <= 1 ? 1 : m.age / (m.dur - 1);
      const al = (d.pAlphaN ? evalPowieTrack(d.pAlphaN, t, m.ai) : 1) * sysA;
      if (al <= 0.004) continue;
     const sc = d.pScaleN ? Math.max(0, evalPowieTrack(d.pScaleN, t, m.sci)) : 1;
     const tint = tintedParticle(img,
       d.pRedN ? evalPowieTrack(d.pRedN, t, 0.5) : 1,
       d.pGreenN ? evalPowieTrack(d.pGreenN, t, 0.5) : 1,
       d.pBlueN ? evalPowieTrack(d.pBlueN, t, 0.5) : 1);
     if (!tint) continue;
     ctx.save();
     ctx.globalAlpha = Math.min(1, al);
     ctx.translate(m.x, m.y);
     ctx.rotate(m.spin);
     const w = tint.width * sc, h = tint.height * sc;
     ctx.drawImage(tint, -w / 2, -h / 2, w, h);
     ctx.restore();
   }
 };
  // Doom-shroom blast (PARTICLE_DOOM, Plant::DoSpecial 4367-4375,
  // RENDER_LAYER_TOP): the 11-emitter system from main.zip's
  // compiled/particles/Doom.xml.compiled (see DOOM_DEFS in sim.js) —
  // mushroom-cloud TOP
  // motes (tinted, like RenderParticle's particle x system x brightness
  // color), the Base strip (AnimationRate 5 over 3 frames), the static Word,
  // and the fullscreen Flash rect. Main.zip art only (no retail bytes).
  const doomImgs = {
    stem: libs.images["particles/DoomShroom_Explosion_Stem.png"],
    base: libs.images["particles/DoomShroom_Explosion_Base.png"],
    top: libs.images["particles/DoomShroom_Explosion_Top.png"],
    word: libs.images["particles/Doom.png"],
  };
  if (b.doomFx) for (const em of b.doomFx) {
    const d = em.def;
    if (d.img === "flash") {
      // DoomFlash: TodParticleEmitter::RenderParticle FULLSCREEN branch —
      // fills the whole window with the (red, green, blue, alpha) color,
      // no image, no additive. Screen-space (retail FillRect(-trans)).
      const m = em.motes[0];
      if (!m) continue;
      const t = m.dur <= 1 ? 1 : m.age / (m.dur - 1);
      const al = evalPowieTrack(d.pAlphaN, t, m.ai);
      if (al <= 0.004) continue;
      const rr = Math.max(0, Math.min(255, Math.round(evalPowieTrack(d.pRedN, t, 0.5) * 255)));
      const gg = Math.max(0, Math.min(255, Math.round(evalPowieTrack(d.pGreenN, t, 0.5) * 255)));
      const bb = Math.max(0, Math.min(255, Math.round(evalPowieTrack(d.pBlueN, t, 0.5) * 255)));
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = Math.min(1, al);
      ctx.fillStyle = "rgb(" + rr + "," + gg + "," + bb + ")";
      ctx.fillRect(0, 0, 800, 600);
      ctx.restore();
      continue;
    }
    const img = doomImgs[d.img];
    if (!img || !img.width) continue;
    for (const m of em.motes) {
      const t = m.dur <= 1 ? 1 : m.age / (m.dur - 1);
      const al = d.pAlphaN ? evalPowieTrack(d.pAlphaN, t, m.ai) : 1;
      if (al <= 0.004) continue;
      const sc = d.pScaleN ? Math.max(0, evalPowieTrack(d.pScaleN, t, m.sci)) : 1;
      const stretch = d.pStretchN ? evalPowieTrack(d.pStretchN, t, 0.5) : 1;
      const bright = d.brightN ? evalPowieTrack(d.brightN, t, m.bi) : 1;
      const tint = tintedParticle(img, bright, bright, bright);
      if (!tint) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, al);
      ctx.translate(m.x + m.jx, m.y + m.jy);
      ctx.rotate(m.spin);
      if (d.img === "base") {
        // AnimationRate strip (RenderParticle: frame = animT x ImageFrames).
        const frames = d.frames || 1, fw = tint.width / frames;
        const fr = Math.min(frames - 1, Math.floor(m.animT * frames));
        const w = fw * sc, h = tint.height * sc;
        ctx.drawImage(tint, fr * fw, 0, fw, tint.height, -w / 2, -h / 2, w, h);
      } else {
        // TodScaleRotateTransformMatrix(m, pos, spin, scale, stretch*scale):
        // X rides the scale, Y rides stretch x scale.
        const w = tint.width * sc, h = tint.height * sc * stretch;
        ctx.drawImage(tint, -w / 2, -h / 2, w, h);
      }
      ctx.restore();
    }
  }
  // Ice-shroom fx (Plant::DoSpecial 4411 + Zombie thaw/death 4514/8897, both
  // RENDER_LAYER_TOP, main.zip art only): the FullScreen IceFlash
  // (20x20 WHITEPIXEL drawn as a fullscreen rect, dur 30, alpha .5->0,
  // cold .5/1/1 tint — TodParticleEmitter::RenderParticle FULLSCREEN
  // branch, screen-space like the doom flash) + the snowflake burst
  // (SNOWFLAKES sheet, 3 static 20x20 cels, ImageFrames 3) + the thaw/death
  // shard pops (IceTrapParticles sheet, per-mote random shard crop from
  // ICE_SHARDS, ImageFrames 4). Same centered/rotated/scaled/alpha
  // RenderParticle draw as the systems above. Exact opaque [x, w] bounds
  // of the 4 shard cels in the 67x17 IceTrapParticles sheet (h = 17;
  // mirrors ICE_SHARDS in sim.js).
  const ICE_SHARD_BOUNDS = [[2, 12], [18, 15], [36, 13], [51, 14]];
  if (b.iceFx) for (const em of b.iceFx) {
    const d = em.def;
    const st = em.sysDur <= 1 ? 1 : Math.min(1, em.sysAge / (em.sysDur - 1));
    const sysA = 1; // no system-alpha track on either ice emitter
    if (d.img === "flash") {
      // IceFlash: TodParticleEmitter::RenderParticle FULLSCREEN branch —
      // fills the whole window with the (red, green, blue, alpha) color,
      // no image, no additive. Screen-space (retail FillRect(-trans)).
      const m = em.motes[0];
      if (!m) continue;
      const t = m.dur <= 1 ? 1 : m.age / (m.dur - 1);
      const al = (d.pAlphaN ? evalPowieTrack(d.pAlphaN, t, m.ai) : 1) * sysA;
      if (al <= 0.004) continue;
      const rr = Math.max(0, Math.min(255, Math.round((d.pRedN ? evalPowieTrack(d.pRedN, t, 0.5) : 1) * 255)));
      const gg = Math.max(0, Math.min(255, Math.round((d.pGreenN ? evalPowieTrack(d.pGreenN, t, 0.5) : 1) * 255)));
      const bb = Math.max(0, Math.min(255, Math.round((d.pBlueN ? evalPowieTrack(d.pBlueN, t, 0.5) : 1) * 255)));
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = Math.min(1, al);
      ctx.fillStyle = "rgb(" + rr + "," + gg + "," + bb + ")";
      ctx.fillRect(0, 0, 800, 600);
      ctx.restore();
      continue;
    }
    const img = d.img === "flakes" ? libs.images["particles/SnowFlakes.png"]
      : libs.images["particles/IceTrapParticles.png"];
    if (!img || !img.width) continue;
    for (const m of em.motes) {
      const t = m.dur <= 1 ? 1 : m.age / (m.dur - 1);
      const al = (d.pAlphaN ? evalPowieTrack(d.pAlphaN, t, m.ai) : 1) * sysA;
      if (al <= 0.004) continue;
      const sc = Math.max(0, d.pScaleN ? evalPowieTrack(d.pScaleN, t, m.sci) : 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, al);
      ctx.translate(m.x, m.y);
      ctx.rotate(m.spin);
      if (d.img === "flakes") {
        const fw = img.width / 3;
        const w = fw * sc, h = img.height * sc;
        ctx.drawImage(img, (m.frame || 0) * fw, 0, fw, img.height, -w / 2, -h / 2, w, h);
      } else {
        const sh = ICE_SHARD_BOUNDS[m.shard || 0];
        const w = sh[1] * sc, h = 17 * sc;
        ctx.drawImage(img, sh[0], 0, sh[1], 17, -w / 2, -h / 2, w, h);
      }
      ctx.restore();
    }
  };
  // Whack hammer POW (PARTICLE_POW at RENDER_LAYER_ABOVE_UI,
  // Challenge::MouseDownWhackAZombie 1222: Pow.xml = one 50-tick mote of
  // IMAGE_POW (particles/Pow.png), ParticleScale .2 then .5 at 7%,
  // SystemAlpha 1,90 0,100, Shake-field ±1px jitter, normal blend).
  const powImg = libs.images["particles/Pow.png"];
  if (powImg && powImg.width && b.pows) for (const p of b.pows) {
    const t = p.dur <= 1 ? 1 : Math.min(1, p.age / (p.dur - 1));
    const pa = t <= 0.9 ? 1 : Math.max(0, 1 - (t - 0.9) / 0.1);
    if (pa <= 0.004) continue;
    const psc = t <= 0.07 ? 0.2 + 0.3 * (t / 0.07) : 0.5;
    ctx.save();
    ctx.globalAlpha = Math.min(1, pa);
    const pw = powImg.width * psc, ph = powImg.height * psc;
    // Pow.xml FIELD_SHAKE ±1px ticks in the particle update (frozen while
    // paused), so the offset derives from p.age — identical pixels every
    // frame at a frozen age instead of a render-time random that jitters
    // through the pause dialog.
    const shx = Math.sin(p.age * 127.1) * 43758.5453, shy = Math.sin(p.age * 311.7 + 1.7) * 12543.123;
    const jx = (shx - Math.floor(shx)) * 2 - 1, jy = (shy - Math.floor(shy)) * 2 - 1;
    ctx.drawImage(powImg, p.x + jx - pw / 2, p.y + jy - ph / 2, pw, ph);
    ctx.restore();
  }
  // Vasebreaker hammer (Challenge::MalletPot reanim, RENDER_LAYER_TOP): the
  // sim-owned Hammer reanim playing anim_pot_open rides the breaking vase.
  if (b.mallet && b.mallet.body) {
    try { b.mallet.body.draw(ctx, camX, camY); } catch (e) { /* def missing */ }
  }
  // Vasebreaker break fx (ScaryPotterOpenPot 4273-4276, RENDER_LAYER_TOP): the
  // brown/green 27-frame strips play through once (~30 ticks) with an alpha
  // fade at the tail. The fx keys on the pot STATE: LEAF → green, everything
  // else (adventure pots are QUESTION or LEAF) → brown. The purple chunk
  // system below is puzzle-mode-only (ZOMBIE state never occurs in
  // adventure) and stays parked unless a future mode marks a pot.
  const vaseStripImgs = { brown: "particles/Vase_brown.png", green: "particles/Vase_green.png" };
  if (b.vaseStrips) for (const s of b.vaseStrips) {
    const img = libs.images[vaseStripImgs[s.img] || "particles/Vase_brown.png"];
    if (!img || !img.width) continue;
    const frames = 27, cw = img.width / frames;
    const f = Math.max(0, Math.min(frames - 1, Math.floor(s.age)));
    const t = s.dur <= 1 ? 1 : s.age / (s.dur - 1);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3));
    ctx.drawImage(img, f * cw, 0, cw, img.height, s.x + camX, s.y + camY, cw, img.height);
    ctx.restore();
  }
  const vaseChunkImg = libs.images["particles/vase_chunks.png"];
  if (vaseChunkImg && vaseChunkImg.width && b.vaseChunks) for (const em of b.vaseChunks) {
    const cw = vaseChunkImg.width / 9, ch = vaseChunkImg.height / 3;
    const t = em.dur <= 1 ? 1 : Math.min(1, em.age / (em.dur - 1));
    const sysA = t <= 0.9 ? 1 : Math.max(0, 1 - (t - 0.9) / 0.1);
    if (sysA <= 0.004) continue;
    for (const m of em.motes) {
      const cx = Math.floor(m.cel % 9), cy = Math.floor(m.cel / 9);
      ctx.save();
      ctx.globalAlpha = Math.min(1, sysA);
      ctx.translate(m.x + camX, m.y + camY);
      ctx.rotate(m.spin * em.age);
      const w = cw * m.sc, h = ch * m.sc;
      ctx.drawImage(vaseChunkImg, cx * cw, cy * ch, cw, ch, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }
  // Rowless grave systems only (legacy/headless spawns with no row — every
  // real spawn carries its row and already drew in the row pass above).
  if (b.graveFx) for (const em of b.graveFx) {
    if ((em.row ?? -1) >= 0 && (em.row | 0) < b.rows) continue;
    drawGraveFxOne(em);
  }
  // Rowless digger systems only (legacy/headless spawns with no row — every
  // real spawn carries its row and already drew in the row pass above).
  if (b.diggerFx) for (const em of b.diggerFx) {
    if ((em.row ?? -1) >= 0 && (em.row | 0) < b.rows) continue;
    drawDiggerFxOne(em);
  }
  if (b.diggerDirt) for (const d of b.diggerDirt) {
    if (!d.body || d.body.dead) continue;
    if ((d.row ?? -1) >= 0 && (d.row | 0) < b.rows) continue;
    d.body.draw(ctx, camX, camY);
  }

  // sod rolls (CutScene 1215-1228, RENDER_LAYER_TOP): the roll rides the
  // wipe's tail end while the sod is placed, in board space like the strips.
  if (G.sodRolls) for (const r of G.sodRolls) r.draw(ctx, camX, camY);
  ctx.restore(); // unpan — HUD + overlays are screen-space (source SeedBank/MenuButton don't pan).
  if (inCut && !isIntro) drawCutsceneTop(camX, camY); // Dave/shovel-fixed/advice/ready/chooser stay above the entities (DrawUITop)
  else if (!isIntro) drawMeter(camX, camY); // progress meter + Level text + fog stay on top
  // collected coins fly into the counter OVER the bank (painted here, above
  // the HUD) — but positioned in WORLD space like retail (coins live in the
  // board render list, COIN_BANK 600000, so the loss pan carries them with
  // the lawn). Screen-space (0,0) left a sun collected just before game over
  // frozen mid-flight while the camera slid underneath it.
  if (!inCut && !isIntro && b) {
    // Award pickup beams ride the award coin center BEHIND it (Award.xml at
    // mRenderOrder-1, Coin.cpp:1232); STARBURST plays ABOVE (mRenderOrder+1).
    // The money bank paints UNDER the in-flight coins (user-verified: a coin
    // landing on the bank's gold coin must stay visible over the bank art,
    // not slide behind it).
    drawCoinBank(b); // RENDER_ITEM_COIN_BANK: bottom-left money total
    drawAwardBeams(b, beamImgs());
    for (const c of b.coins) if (c.collected) drawCoin(c, camX, camY);
    drawAwardBursts(b, beamImgs());
  }
  if (isIntro) drawIntroOverlay(cs);

  // ghost preview (bank seeds and vase usable seeds share the cursor/plant path)
  if (!inCut && (G.selSeed >= 0 || G.selUsable) && b.state === "play") {
    const gs = G.selSeed >= 0 ? G.selSeed : G.selUsable.seed;
    const { col, row } = pixelToGrid(G.mouse.x, G.mouse.y, b.bg);
    if (col >= 0 && row >= 0) {
      // Usable seeds plant free (MouseDownWithPlant 3948-3954) — preview
      // against the same free gate or every cell reads red at 0 sun.
      const ok = b.canPlant(col, row, gs, !!G.selUsable);
      const x = gridToPixelX(col, b.bg), y = gridToPixelY(col, row, b.bg);
      drawGhost(gs, col, row, x, y, ok, camX, camY);
    }
  }
  // held plant at the cursor (CursorObject::Draw CURSOR_TYPE_PLANT_FROM_BANK,
  // CursorObject.cpp:177): the same static plant at FULL alpha, drawn at the
  // cursor (mX = mouse-25, mY = mouse-35) + (-10, height-25), +30 higher when
  // flying (coffee) or gravebuster. After the HUD so it floats over the bank.
  // Vase usable seeds (CURSOR_TYPE_PLANT_FROM_USABLE_COIN) ride the same path.
  if (!inCut && (G.selSeed >= 0 || G.selUsable) && b.state === "play") {
    const cs2 = G.selSeed >= 0 ? G.selSeed : G.selUsable.seed;
    if (!cursorPlant || cursorPlant.board !== b || cursorPlant.seed !== cs2) {
      try { cursorPlant = new Plant(b, cs2, 0, 0, true); tintExplodePlant(cursorPlant, b); } catch (e) { cursorPlant = null; }
    }
    const cp = cursorPlant;
    if (cp && cp.body) {
      const off = Plant.drawHeightOffset(b, cs2, -1, -1) + ((cs2 === 35 || cs2 === 11) ? 30 : 0);
      const bx = cp.body.x, by = cp.body.y, ba = cp.body.alpha;
      const ha = cp.heads.map((h) => h.reanim.alpha);
      cp.body.x = G.mouse.x - 35 + cp.compX; cp.body.y = G.mouse.y - 60 + off + cp.compY;
      cp.body.alpha = 1;
      for (const h of cp.heads) h.reanim.alpha = 1;
      // Pumpkin shell back half first (same lone-shell layering as the
      // ghost above and drawBoard).
      if (cs2 === 30 && cp.body.trackExists("Pumpkin_back")) cp.body.draw(ctx, camX, camY, 1);
      // Gravebuster grounded-dirt (USER OVERRIDE): same clip + fixed ring.
      if (cs2 === 11 && cp.dirtTrack !== undefined && cp.dirtTrack >= 0) {
        drawBusterGrounded(cp, ctx, camX, camY, () => { cp.body.draw(ctx, camX, camY); });
      } else cp.body.draw(ctx, camX, camY);
      cp.body.x = bx; cp.body.y = by; cp.body.alpha = ba;
      cp.heads.forEach((h, i) => { h.reanim.alpha = ha[i]; });
    }
  }
  // Held shovel at the cursor (CursorObject::Draw CURSOR_TYPE_SHOVEL,
  // CursorObject.cpp:80: DrawImage(IMAGE_SHOVEL, 10, -30) at (mX, mY) with
  // mX = mouse-25, mY = mouse-35 (Update, line 75) — art top-left lands at
  // (mouse-15, mouse-65)). Same reanim-bank art (Shovel.png), new position.
 if (!inCut && G.shovelMode && b.state === "play") {
   const shc = libs.images["Shovel.png"];
   if (shc) ctx.drawImage(shc, G.mouse.x - 15, G.mouse.y - 65);
 }
  // Whack-a-Zombie hammer cursor (CursorObject::Draw CURSOR_TYPE_HAMMER,
  // CursorObject.cpp:198-199: the cursor reanim draws at the translated
  // cursor origin (mX = mouse-25, mY = mouse-35) plus its own ctor offset
  // (-25,+16) — art origin lands at (mouse-50, mouse-19)). Up only while
  // nothing is held (ClearCursor leaves it HAMMER until the award drops,
  // 1364-1366 — then G.hammerReanim is nulled and the cursor stays down).
  if (!inCut && b.isWhack && G.hammerReanim && b.state === "play" && b.fadeOut < 0 &&
      G.selSeed < 0 && G.selConvIdx < 0 && !G.shovelMode) {
    const h = G.hammerReanim, hx = h.x, hy = h.y;
    h.x = G.mouse.x - 50; h.y = G.mouse.y - 19;
    h.draw(ctx);
    h.x = hx; h.y = hy;
  }
 // overlays
  if (b.state === "intro" && G.readyReanim) {
    G.readyReanim.draw(ctx);
  }
  if (b.finalWave > 0) {
    if (!G.finalReanim) {
      try {
        // FinalWave art sweeps in from the left (source: Board::NextWaveComing
        // AddReanimation(0, 30)), so it must sit at the origin, not centered
        G.finalReanim = new Reanimation(DEFS.get("FinalWave"), 0, 30);
        G.finalReanim.playReanim("anim_idle", PLAY_ONCE_AND_HOLD, 0, 12);
      } catch (e) { G.finalReanim = null; }
    }
    if (G.finalReanim) G.finalReanim.draw(ctx);
    else { ctx.fillStyle = "#f00"; ctx.font = "bold 52px Trebuchet MS"; ctx.textAlign = "center"; ctx.fillText("FINAL WAVE!", 400, 250); }
    b.finalWave--;
  }
  if (b.state === "won" || b.state === "lost") drawEndOverlay();
  // Intermission Dave (DrawUITop 7621-7635 order: Dave, then advice): the
  // returning Dave talks on the board screen itself — drawn here in world
  // space like the cutscene top, or he talks invisibly.
  if (!inCut) drawDave();
  // Advice + tutorial arrow (MessageWidget::Draw + TutorialArrowShow).
  if (b.advice && !inCut) drawAdvice(b);
  if (!inCut && b.state === "play" && b.tutorialArrow >= 0) drawTutorialArrow(b);
  // Board::DrawFadeOut (7299): the veil ramps in over the fade's last 200
  // ticks (identity transform — fullscreen, above everything). White, except
  // the x9 note levels (7305-7308), which fade to BLACK — handing off to the
  // note screen's black veil (seamless black-to-black, like white-to-white).
  if (!inCut && b.fadeOut >= 0 && b.fadeOut <= 200) {
    const f = ((200 - b.fadeOut) / 200).toFixed(3);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = b.level % 10 === 9 ? `rgba(0,0,0,${f})` : `rgba(255,255,255,${f})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  // Seed-bank hover label (Board::UpdateToolTip + ToolTipWidget::Draw): the
  // cream box under the hovered packet, above the fade veil, below the modal
  // dialogs (which hide it via the visibility gate anyway).
  drawBoardTooltip();
  // Pause menu (modal WidgetManager focus: above everything on the board).
  // The Menu stone button hangs top-right during play (DrawTopRightUI 7317,
  // which draws it even through the end fade — retail only disables it via
  // CanInteractWithBoardButtons). User override: hide it entirely once the
  // end-of-level award is picked up (fadeOut >= 0); it is already disabled
  // there via menuButtonEnabled/handleBoardClick.
  // the chooser's own Menu tab can also open it mid-pick (DoNewOptions) — the
  // cutscene clock is already frozen on waitingForSeeds, so the modal is safe.
  if (!isIntro && b && (!inCut || G.pauseDlg)) {
    if (G.pauseDlg) {
      if (G.pauseDlg === "options") drawPauseOptionsMenu();
      else drawLawnPauseDialog();
    } else if (b.state === "play" && b.fadeOut < 0) {
      drawPauseMenuButton();
    }
  }
}

// Lawn base + sod roll (Board::DrawBackdrop 6000-6051). The 1400x600 art is drawn
// 1:1 at x=-BOARD_OFFSET (-220); the cutscene pan (boardX -220..380..0) moves it.
// Screen shows image[220+p .. 1020+p]. Sod strips wipe left-to-right.
function drawLawnBase(b) {
  const un = libs.images["background1unsodded.png"];
  const rolledIntro = b.firstTime && (b.level === 1 || b.level === 2 || b.level === 4);
  if (un && (b.dirtRows.size || (rolledIntro && b.level === 4))) {
    ctx.drawImage(un, -220, 0);
    drawSodStrips(b);
  } else {
    const bg = libs.images[BG_IMAGE[b.bg]];
    if (bg) ctx.drawImage(bg, -220, 0);
    else { ctx.fillStyle = "#2a4d1e"; ctx.fillRect(-800, -100, 2400, 800); }
  }
  // Board::DrawBackdrop (6053-6056): once the zombies have won, the open
  // doorway shows the house interior behind everything (DrawHouseDoorBottom).
  // Positions per background (6772-6781); roof/boss have no interior overlay
  // (default: break). All byte-identical from main.zip images/.
  if (b.state === "lost") {
    const ovPos = { 1: [-126, 225], 2: [-125, 196], 3: [-171, 241], 4: [-172, 246] }[b.bg];
    if (ovPos) {
      const ov = libs.images[`background${b.bg}_gameover_interior_overlay.png`];
      if (ov) ctx.drawImage(ov, ovPos[0], ovPos[1]);
    }
  }
  // Challenge::Draw (2405-2408): the bowling stripe at (268,77) while the
  // line shows (board space — drawn in the backdrop, behind everything).
  if (b.showBowlingLine) {
    const stripe = libs.images["Wallnut_bowlingstripe.png"];
    if (stripe) ctx.drawImage(stripe, 268, 77);
  }
  // Pool water (Board::DrawBackdrop 6057-6060, PoolEffect.cpp): the animated
  // caustic web + sparkles ride the backdrop, behind everything lawn-side.
  if (b.bg === BG.POOL || b.bg === BG.FOG) drawPoolWater(b);
  // User override (2026): the source Board::DrawBackdrop (6070-6073) draws
  // IMAGE_NIGHT_GRAVE_GRAPHIC at (1092,40) during SCENE_LEVEL_INTRO on
  // grave stages, but the user wants the night-intro street end clear, so
  // the graphic is no longer drawn anywhere. Lawn gravestones (GridItems)
  // are untouched.
}
// SodRoll track-0 (tube) center-x/scale-x at the reanim's current time.
// Mirrors Reanimation.getFrameTime's index math exactly (frameStart 0,
// count = track length) so the edge pin matches the drawn frame.
function sodTubeFrame(r) {
  const fr = r.def.tracks[0].frames;
  const n = fr.length - 1;
  const pos = Math.min(1, Math.max(0, r.animTime)) * n;
  const bfl = Math.floor(pos);
  let bi = bfl, ai;
  if (bi >= n) { bi = n; ai = n; } else ai = bi + 1;
  const f = pos - bfl;
  return {
    x: fr[bi].x + (fr[ai].x - fr[bi].x) * f,
    sx: fr[bi].scx + (fr[ai].scx - fr[bi].scx) * f,
  };
}
function drawSodStrips(b) {
  const k = Math.max(0, Math.min(1000, b.sodPosition)) / 1000;
  const s1 = libs.images["sod1row.png"], s3 = libs.images["sod3row.png"];
  // Source draws the pre-existing strips UNCONDITIONALLY and animates only
  // the wiped width (TodAnimateCurve(0,1000,mSodPosition,...) -> 0 width at
  // roll start, while the full strips still blit). So only the wipe is gated
  // on k>0 — the full strips below must draw even at k==0, or the lawn opens
  // all-dirt and the old grass pops in mid-roll.
  const wipe = (img, dx, dy, fullW, sx = 0) => {
    if (!img || k <= 0) return;
    const w = Math.max(1, Math.floor(fullW * k));
    ctx.drawImage(img, sx, 0, w, img.height, dx, dy, w, img.height);
  };
  // Board::DrawBackdrop (6025-6040): L1 wipes SOD1ROW; L2/L3 keep the L1
  // SOD1ROW full and wipe SOD3ROW over it; L4 keeps SOD3ROW full and wipes
  // the full-lawn BACKGROUND1 patch over it. The three arts share one
  // checker phase at their source spots (pixel-measured NCC peaks exactly
  // at 239/235/232-BOARD_OFFSET for s1/s3/bg vs each other), so every
  // strip stays at its source coords — shifting any one opens a visible
  // seam against the others (the 1-2 report: sod1 sat +10y, misaligning
  // both the incoming sod3 wipe and the grid, which is fit to bg1 art).
  if (b.level === 1 && b.firstTime && s1) {
    wipe(s1, 19, 265, 771); // 239-BOARD_OFFSET
    // Board::Draw (6061-6068): while PLANT_PEASHOOTER waits, SOD1ROW is
    // redrawn COLORIZED grey (GetFlashingColor, MainCounter, 75) at
    // 239-BOARD_OFFSET, 265 — i.e. the strip image itself pulses, alpha
    // intact. (A multiply fillRect is wrong here: the strip PNG is ~36%
    // transparent at its ragged edges, so a rect darkens the dirt beneath
    // into a hard black square instead of flashing the grass.)
    if (b.tutorialState === TUT.L1_PLANT_PEASHOOTER) {
      const age = (b.tick | 0) % 75;
      const g = Math.max(0, Math.min(255, Math.round(55 + 200 * Math.abs(37 - age) / 37)));
      if (g < 255) {
        ctx.save();
        ctx.filter = `brightness(${g / 255})`; // SetColor + SetColorizeImages
        wipe(s1, 19, 265, 771);
        ctx.restore();
      }
    }
  }
  else if ((b.level === 2 || b.level === 3) && b.firstTime) {
    if (s1) ctx.drawImage(s1, 19, 265);
    if (s3) wipe(s3, 15, 149, 771); // 235-BOARD_OFFSET
  } else if (b.level === 4 && b.firstTime) {
    if (s3) ctx.drawImage(s3, 15, 149);
    const bg1 = libs.images[BG_IMAGE[1]];
    if (bg1) wipe(bg1, 12, 0, 773, 232); // Rect(232,0,w,H) at 232-BOARD_OFFSET
  }
}

// ---------- pool water (PoolEffect.cpp + Board::Update/DrawBackdrop) ----------
// Animated water on pool/fog stages, all from main.zip art: the caustic web
// (pool_caustic_effect.jpg, 256x256 grayscale) computed per PoolEffect::
// UpdateWaterEffect into a 128x64 white-alpha overlay — two bilinear-tapped
// lookups of the grayscale tile scrolled by mPoolCounter (u - pool/6 and
// u + pool/10, v + pool/8), averaged, then alpha-mapped (a>=160:
// 255-2(a-160); a>=128: 5(a-128); else 0) and quartered (/3) — with the
// layer-2 wave UV offsets baked in per-texel (the mesh verts never move;
// the texture swims inside the fixed 45..749 x 288..438 caustic rect, so
// nothing spills onto the coping) and the source vertex-alpha bake (day:
// 0xC0 left half / 0x80 right half, 0x20 borders + top row; night: 0x30
// everywhere, 0x20 borders). The static
// background3/4 art keeps its painted water + grid underneath (the retail
// 3D layers are ~50-75% opaque, so the grid faintly shows through there
// too); the caustic + wobble + sparkles below are the visible animation.
// Sparkles (PARTICLE_POOL_SPARKLY, RENDER_LAYER_GROUND order 2) draw here in
// the backdrop — above the water, below every lawn entity.
const POOL_RECT = { x: 35, y: 279, w: 726, h: 162 }; // base-mesh rect (3D verts: 35..761 x 279..441)
const POOL_CAUSTIC = { x: 45, y: 288, w: 704, h: 150 }; // caustic-mesh rect (verts: 45..749 x 288..438)
let poolGray = null; // 256x256 red channel of pool_caustic_effect.jpg
let poolCausticCv = null, poolCausticKey = "";
function poolCausticGray() {
  if (poolGray) return poolGray;
  const img = libs.images["pool_caustic_effect.jpg"];
  if (!img || !img.width) return null;
  try {
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 256;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, 256, 256);
    const d = g.getImageData(0, 0, 256, 256).data;
    const out = new Uint8Array(256 * 256);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4];
    poolGray = out;
  } catch (e) { return null; }
  return poolGray;
}
function poolBilinear(gray, u, v) {
  // PoolEffect::BilinearLookupFixedPoint, in uint32 arithmetic (C++ unsigned
  // wrap on the scrolled coordinates matches the >>>0 wraps here).
  u >>>= 0; v >>>= 0;
  const timeU = u & 0xFFFF0000, timeV = v & 0xFFFF0000;
  const fU1 = ((u - timeU) & 0xFFFE) + 1, fV1 = ((v - timeV) & 0xFFFE) + 1;
  const fU0 = 65536 - fU1, fV0 = 65536 - fV1;
  const iU0 = (timeU >>> 16) % 256, iU1 = ((timeU >>> 16) + 1) % 256;
  const iV0 = (timeV >>> 16) % 256, iV1 = ((timeV >>> 16) + 1) % 256;
  const q = (a, b) => Math.trunc(a / b); // C++ int division (all operands >= 0)
  return q(q(fU0 * fV1, 65536) * gray[iV1 * 256 + iU0], 65536)
       + q(q(fU1 * fV1, 65536) * gray[iV1 * 256 + iU1], 65536)
       + q(q(fU0 * fV0, 65536) * gray[iV0 * 256 + iU0], 65536)
       + q(q(fU1 * fV0, 65536) * gray[iV0 * 256 + iU1], 65536);
}
function updatePoolCaustic(b) {
  // Rebuilds the 128x64 overlay when the water counter (or day/night) moves.
  // Lazy per rendered frame: sim ticks up to 100Hz but frames render ~60Hz.
  // Source-faithful bake (PoolEffect.cpp): the two scrolled gray taps per
  // texel (UpdateWaterEffect) PLUS the layer-2 wave UV offsets from the mesh
  // verts (PoolEffectDraw 149-150), bilinearly interpolated across each quad
  // exactly like the GPU interpolates vertex UVs — the mesh itself never
  // moves (pVert->x/y are the fixed 45..749 x 288..438 grid), only the
  // texture swims inside it (WRAP). Vertex colors likewise interpolate:
  // day 0xC0 left of the middle seam / 0x80 right of it (one-quad blend),
  // night 0x30 everywhere, outer/top border verts 0x20 blending inward.
  const night = b.stageIsNight();
  const key = (b.poolCounter | 0) + (night ? "n" : "d");
  if (poolCausticCv && poolCausticKey === key) return poolCausticCv;
  const gray = poolCausticGray();
  if (!gray) return null;
  if (!poolCausticCv) {
    poolCausticCv = document.createElement("canvas");
    poolCausticCv.width = 128; poolCausticCv.height = 64;
  }
  const g = poolCausticCv.getContext("2d");
  let id;
  try { id = g.createImageData(128, 64); } catch (e) { return null; }
  const dd = id.data;
  const c = b.poolCounter | 0;
  const t0 = (c << 16) >>> 0, t1 = (((c & 65535) + 1) << 16) >>> 0;
  const s10 = Math.trunc(t1 / 6), s08 = Math.trunc(t0 / 8), s010 = Math.trunc(t0 / 10);
  // Layer-2 wave vertex tables (PoolEffectDraw 136-151): ou varies by row
  // (yPhase), ov by column (xPhase); border verts carry 0 (the else branch —
  // the mesh pins the caustic inside the pool, nothing spills onto coping).
  const ph = c * 2 * Math.PI;
  const wt1 = ph / 800, wt2 = ph / 150, wt3 = ph / 900, wt4 = ph / 800, wt5 = ph / 110;
  const vou = [], vov = [], vcol = [];
  for (let ix = 0; ix <= 15; ix++) {
    const xu = [], xv = [], xc = [];
    const xPh = ix * 3 * 2 * Math.PI / 15;
    for (let iy = 0; iy <= 5; iy++) {
      if (ix === 0 || ix === 15 || iy === 0 || iy === 5) { xu.push(0); xv.push(0); }
      else {
        const yPh = iy * 3 * 2 * Math.PI / 5;
        xu.push(Math.sin(yPh + wt1 * 1.5) * 0.004 + Math.sin(yPh + wt2 * 1.5) * 0.005);
        xv.push(Math.sin(xPh * 4 + wt5 * 2.5) * 0.005 + Math.sin(xPh * 2 + wt3 * 2.5) * 0.04 + Math.sin(xPh * 3 + wt4 * 2.5) * 0.02);
      }
      let col;
      if (ix === 0 || ix === 15 || iy === 0) col = 0x20;
      else if (night) col = 0x30;
      else col = ix <= 7 ? 0xC0 : 0x80;
      xc.push(col / 255);
    }
    vou.push(xu); vov.push(xv); vcol.push(xc);
  }
  let p = 0;
  for (let y = 0; y < 64; y++) {
    const timeV1 = (256 - y) << 17, timeV0 = y << 17;
    const my = (y / 64) * 5;
    const iy = my >= 4 ? 4 : Math.floor(my), fy = my - iy;
    const baseU = x => x << 17;
    for (let x = 0; x < 128; x++) {
      const mx = (x / 128) * 15;
      const ix = mx >= 14 ? 14 : Math.floor(mx), fx = mx - ix;
      // Bilinear interp of the quad's vertex offsets/colors (= GPU lerp).
      const ix1 = ix + 1, iy1 = iy + 1;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const ouI = vou[ix][iy] * w00 + vou[ix1][iy] * w10 + vou[ix][iy1] * w01 + vou[ix1][iy1] * w11;
      const ovI = vov[ix][iy] * w00 + vov[ix1][iy] * w10 + vov[ix][iy1] * w01 + vov[ix1][iy1] * w11;
      // Wave in fixed-point texel units: u spans 256 gray texels, v spans
      // 128 (the 128x64 tile samples the 256x256 gray at 2x). >>>0 wraps
      // like the C++ unsigned arithmetic.
      const wu = Math.round(ouI * 16777216), wv = Math.round(ovI * 8388608);
      const tU = baseU(x);
      const a1 = poolBilinear(gray, (tU - s10 + wu) >>> 0, (timeV1 + s08 + wv) >>> 0);
      const a0 = poolBilinear(gray, (tU + s010 + wu) >>> 0, (timeV0 + wv) >>> 0);
      const a = (a0 + a1) / 2;
      let al;
      if (a >= 160) al = 255 - 2 * (a - 160);
      else if (a >= 128) al = 5 * (a - 128);
      else al = 0;
      al = Math.trunc(al / 3);
      const f = vcol[ix][iy] * w00 + vcol[ix1][iy] * w10 + vcol[ix][iy1] * w01 + vcol[ix1][iy1] * w11;
      const o = Math.round(al * f);
      dd[p++] = 255; dd[p++] = 255; dd[p++] = 255; dd[p++] = o;
    }
  }
  try { g.putImageData(id, 0, 0); } catch (e) { return null; }
  poolCausticKey = key;
  return poolCausticCv;
}
function drawPoolWater(b) {
  const cv = updatePoolCaustic(b);
  // Fixed-mesh blit (PoolEffectDraw 177-182): verts never move, the baked
  // wave already swims inside the tile — one draw, always registered to the
  // painted basin (45..749 x 288..438), nothing spills onto the coping.
  if (cv) ctx.drawImage(cv, POOL_CAUSTIC.x, POOL_CAUSTIC.y, POOL_CAUSTIC.w, POOL_CAUSTIC.h);
  // POOL_SPARKLY glows (normal blend, constant alpha .8, per-mote scale
  // pulse from the sim): additive-light glows read better on water, but
  // retail blends normal — keep normal like the caustic above.
  const sp = libs.images["particles/PoolSparkly.png"];
  if (sp && sp.width && b.sparkles && b.sparkles.length) {
    ctx.save();
    for (const m of b.sparkles) {
      if (m.age >= m.dur) continue;
      const w = 38 * m.sc, h = 29 * m.sc;
      if (w <= 0 || h <= 0) continue;
      ctx.globalAlpha = Math.min(1, 0.8);
      ctx.drawImage(sp, m.x - w / 2, m.y - h / 2, w, h);
    }
    ctx.restore();
  }
}
function drawCutsceneTop(camX, camY) {  const cs = G.cutscene, b = G.board;
  // Fog (RENDER_ITEM_FOG, LAYER 500000): above the entities, below the coin
  // bank and the advice/menu layers — so first here. Board-space, rides cam.
  if (b.stageHasFog()) drawFog(b, camX, camY);
  // Stormy-night weather (Challenge::DrawWeather in the RENDER_ITEM_STORM
  // slot, order FOG,0,3 — above the fog): rain tiles + lightning overlay.
  // The drift clock is the free-running fx clock (mEffectCounter keeps
  // ticking while the cutscene clock freezes on Dave).
  if (b.isStormy) drawStorm(b, b.fxClock | 0, cs.boardX, camX, camY);
  // DrawStormNight (3132) calls DrawUIBottom AFTER the fill, so the bank
  // redraws over the storm during the intro too (it slides in at 8500-8750,
  // right through the pan-left flash).
  if (b.isStormy) drawSeedBank(cs.seedBankY, cs.seedBankX, cs.seedBankDarken);
  // (The sliding bank drew below the entities in drawBoard — except on
  // stormy, where it draws here over the storm instead. Seed bank slides
  // down during intro, CutScene::AnimateBoard 1186-1190.)

  // Board::DrawShovel (7025-7051): fixed screen rect, independent of the
  // sliding bank — during the intro it fires only when mShowShovel is
  // already set, i.e. Wall-nut Bowling (StartLevelIntro 773; mini-boss
  // shovels come via ShowShovel at the intro end, never during it). The conveyor
  // branch of drawSeedBank draws it bank-translated, so it hides with the
  // bank; this re-draws it fixed like retail. Skipped once the bank has
  // slid on (drawSeedBank's copy takes over at y 0).
  if (b.isBowling && b.showShovel && cs.seedBankY < 0) {
    const r = cutsceneShovelRect();
    const sb = libs.images["ShovelBank.png"];
    if (sb) ctx.drawImage(sb, r.x, r.y);
    else { ctx.fillStyle = "#666"; ctx.fillRect(r.x, r.y, 70, 72); }
    // The shovel image hides while held (DrawShovel 7034: only drawn when
    // the cursor is not the shovel); the held shovel draws at the cursor.
    if (!G.shovelMode) {
      const sh = libs.images["Shovel.png"];
      if (sh) ctx.drawImage(sh, r.x - 7, r.y - 3);
    }
  }
  // Board::DrawUITop order (7621-7635): Dave (screen space), then advice.
  drawDave();
  // Pre-shop slot offer (CutScene 1654-1659: modal over Dave's bubble) +
  // the coin bank it flashes (ShowCoinBank 1657). The bank rides the
  // cutscene top only while its fade count runs (set by the offer or by
  // money pickups); play draws it in the board pass instead.
  drawDaveOffer();
  if (b.coinBankT > 0) drawCoinBank(b);
  // House name via the real MessageWidget path (CutScene::StartLevelIntro
  // 880-916 + MessageWidget::Draw 362-366, 407-411): white HOUSEOFTERROR28
  // text, no bar, screen-centered regardless of pan, fading out at the end.
  if (b.advice) drawAdvice(b);
  // Shovel-tutorial arrow (TutorialArrowShow at the shovel, render layer
  // TOP). Packet arrows only occur during play (drawn in drawBoard); the
  // shovel arrow lives in the cutscene while the clock is frozen.
  if (b.tutorialArrow === "shovel") drawTutorialArrow(b);
  // Held shovel cursor during the cutscene dig (CursorObject::Draw runs in
  // DrawUITop even in SCENE_LEVEL_INTRO; same (mouse-15, mouse-65) anchor as
  // the play-screen cursor above).
  if (G.shovelMode && b.tutorialState !== TUT.OFF) {
    const sh = libs.images["Shovel.png"];
    if (sh) ctx.drawImage(sh, G.mouse.x - 15, G.mouse.y - 65);
  }
  // Ready Set Plant reanim driven by cutscene onReadyPlant.
  if (G.readyReanim) G.readyReanim.draw(ctx);
  // Seed chooser overlay: slides UP from the bottom (SEED_CHOOSER_OFFSET_Y
  // 516 -> 0 at 4000-4250, CutScene 1149-1154 — NOT from the left), lingers
  // through choosing, then slides back down (4500-4750, 1160-1164) after
  // LET'S ROCK. Drawn whenever the panel is on screen (SeedChooserScreen::
  // Draw 331-339 has no mSeedChoosing gate); input stays on waitingForSeeds.
  if (cs.seedChooserShown) drawChooserPanel(cs.seedChooserY);
  // NOTE (removed 2026-10: the pre-L9 ZombieNote1 letter overlay lived here).
  // It was premised on 1-9 being the finale; 1-10 is the last day level, so
  // retail 1-9 plays with no letter. ZombieNote1's only retail home is the
  // AwardScreen note branch after beating level 9 (TrySpawnLevelAward 7121:
  // mLevel == 9/19/29/39/49 -> COIN_NOTE), which this port implements.
}

function drawDave() {
  // LawnApp::DrawCrazyDave (2991-3043), adventure branch only: the bubble
  // (STORE_SPEECHBUBBLE2) at (285,20), text in (310,26,233,144) in
  // BRIANNETOD16 centered, PICO129 "click to continue" centered at
  // (424,160), then the Dave reanim at (0,0). {SHAKE} jitters the text
  // rect 0-1px; every other {TAG} is a control word TodDrawStringWrapped
  // skips — stripped here before drawing. No bubble while Dave has no
  // message (entering/leaving); the reanim always draws while present.
  const d = G.dave;
  if (!d) return;
  if (d.msgIndex !== -1 && d.msgText) {
    const bub = libs.images["Store_SpeechBubble2.png"];
    if (bub) ctx.drawImage(bub, 285, 20);
    let rx = 310, ry = 26;
    if (daveHasTag(d.msgText, "{SHAKE}") && !G.pauseDlg) {
      rx += Math.floor(Math.random() * 2);
      ry += Math.floor(Math.random() * 2);
    }
    drawWrapped(ctx, "BRIANNE16", daveStripTags(d.msgText), rx, ry, 233, 144, { color: "#000" });
    // LawnApp::DrawCrazyDave (3024-3039): {NO_CLICK} lines skip the
    // "click to continue" label (the Yes/No dialog continues instead —
    // the offer modal covers this bubble's corner anyway).
    if (!daveHasTag(d.msgText, "{NO_CLICK}")) {
      drawText(ctx, "PICO", "click to continue", 424, 160, { align: "center", color: "#000" });
    }
  }
  try { d.reanim.draw(ctx, 0, 0); } catch (e) { /* art not ready */ }
}

// Particle colorize (TodParticleEmitter::GetRenderParams: rgb = art x
// particle x system x brightness): cached multiply-tinted copies per
// image + color, like the explode-o-nut tint. Keys at 1 decimal (bursts
// randomize blue continuously; rays use exact .1 steps).
const tintCache = new Map();
function tintedParticle(img, r, g, b) {
  if (!img || !img.width) return null;
  const key = img.src + "|" + r.toFixed(1) + "," + g.toFixed(1) + "," + b.toFixed(1);
  let cv = tintCache.get(key);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const c = cv.getContext("2d");
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = "multiply"; // colorize: tint existing pixels
    c.fillStyle = `rgb(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0})`;
    c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = "destination-in"; // multiply fills clear
    c.drawImage(img, 0, 0); // pixels too — restore the original alpha mask
    if (tintCache.size > 120) tintCache.clear();
    tintCache.set(key, cv);
  }
  return cv;
}
function beamImgs() {
  return {
    rays1: libs.images["particles/AwardRays1.png"], rays2: libs.images["particles/AwardRays2.png"],
    glow: libs.images["particles/AwardGlow.png"],
    star: libs.images["particles/Star40.png"], raystar: libs.images["particles/AwardRays_star.png"],
  };
}
const easeInQuad = (t) => t * t;
// Award pickup beams (Coin::Collect 1214/1232, Award.xml attached behind the
// coin, riding its center through the center flight). Scale/alpha tracks are
// per-particle age fractions (GetRenderParams); additive emitters draw under
// 'lighter'; brightness multiplies rgb AND alpha. Screen-space: the fade runs
// at play framing so board coords == screen coords.
function drawAwardBeams(b, imgs) {
  for (const em of b.beams) {
    const c = em.coin;
    if (!c || c.dead) continue;
    const [w, h] = b.awardSize(c.kind);
    const cx = c.x + w / 2, cy = c.y + h / 2;
    if (em.kind === "ray") {
      const t = tintedParticle(imgs[em.img], em.bright, em.bright, em.bright);
      if (!t) continue;
      for (const p of em.parts) {
        const pf = Math.min(1, p.age / 1499);
        const sc = 0.4 + 9.6 * easeInQuad(Math.min(1, pf / 0.1)); // .4 EaseIn 10,10
        const al = (pf <= 0.5 ? 0.7 + 0.4 * pf : 0.9) * em.bright; // .7 .9,50
        if (al <= 0.004) continue;
        ctx.save();
        ctx.globalCompositeOperation = "lighter"; // Additive 1
        ctx.globalAlpha = Math.min(1, al);
        ctx.translate(cx, cy);
        ctx.rotate(p.rot);
        ctx.drawImage(t, -t.width * sc / 2, -t.height * sc / 2, t.width * sc, t.height * sc);
        ctx.restore();
      }
    } else if (em.kind === "glow") {
      if (!em.part) continue;
      const t = tintedParticle(imgs.glow, 1, 1, 1);
      if (!t) continue;
      const pf = Math.min(1, em.part.age / 1499);
      const sc = 0.1 + 24.9 * easeInQuad(Math.min(1, pf / 1.5)); // .1 EaseIn 150,25
      ctx.save();
      ctx.globalCompositeOperation = "lighter"; // Additive 1
      ctx.globalAlpha = 1;
      ctx.translate(cx, cy);
      ctx.drawImage(t, -t.width * sc / 2, -t.height * sc / 2, t.width * sc, t.height * sc);
      ctx.restore();
    } else if (em.kind === "flash" && em.part) {
      const t = tintedParticle(imgs.glow, em.bright, em.bright, em.blue * em.bright);
      if (!t) continue;
      const pf = Math.min(1, em.part.age / (em.dur - 1));
      const sc = 1 + 24 * pf; // 1 -> 25 linear
      const al = (pf <= 0.5 ? em.alpha0 : em.alpha0 * (1 - pf) * 2) * em.bright; // a0,50 0
      if (al <= 0.004) continue;
      ctx.save();
      if (em.additive) ctx.globalCompositeOperation = "lighter"; // flash1 only
      ctx.globalAlpha = Math.min(1, al);
      ctx.translate(cx, cy);
      ctx.drawImage(t, -t.width * sc / 2, -t.height * sc / 2, t.width * sc, t.height * sc);
      ctx.restore();
    }
  }
}
// STARBURST one-shot above the award coin (Coin.cpp:1214, mRenderOrder+1):
// system alpha holds 1 to 80% of the 50-tick life then fades, additive.
function drawAwardBursts(b, imgs) {
  for (const p of b.bursts) {
    const img = imgs[p.img === "star" ? "star" : "raystar"];
    if (!img) continue;
    const t = p.age / (p.dur - 1);
    const sysA = t <= 0.8 ? 1 : 1 - (t - 0.8) / 0.2; // SystemAlpha 1,80 0
    if (sysA <= 0) continue;
    const tint = tintedParticle(img, p.r, p.g, p.b);
    if (!tint) continue;
    ctx.save();
    ctx.globalCompositeOperation = "lighter"; // Additive 1
    ctx.globalAlpha = Math.min(1, sysA);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    const w = tint.width * p.scale, hh = tint.height * p.scale;
    ctx.drawImage(tint, -w / 2, -hh / 2, w, hh);
    ctx.restore();
  }
}
// Tutorial arrow art: retail particles/DownArrow.png (32x26, user files,
// byte-identical), tinted (255,230,102) once — ParticleRed/Green/Blue
// 1.0/0.9/0.4 from SeedPacketPick.xml. Retail draws it flipped (the
// particle's scaleY = ParticleStretch -1), so the down-arrow points UP.
const arrowTintCv = document.createElement("canvas");
arrowTintCv.width = 32; arrowTintCv.height = 26;
let arrowTinted = false;
function tintedDownArrow() {
  const img = libs.images["particles/DownArrow.png"];
  if (!img || !img.width) return null;
  if (!arrowTinted) {
    const c = arrowTintCv.getContext("2d");
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, 32, 26);
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = "multiply"; // colorize: tint existing pixels
    c.fillStyle = "rgb(255,230,102)";
    c.fillRect(0, 0, 32, 26);
    c.globalCompositeOperation = "destination-in"; // multiply fills clear
    c.drawImage(img, 0, 0); // pixels too — restore the original alpha mask
    c.restore();
    arrowTinted = true;
  }
  return arrowTintCv;
}
function drawTutorialArrow(b) {
  // TutorialArrowShow (4082): PARTICLE_SEED_PACKET_PICK at the packet.
  // SeedPacketPick.xml: emitter offset (25,80) from the packet top-left,
  // ParticleDuration 40, one looping POSITION-field particle bobbing
  // y 0->10->0 (EASE_IN_OUT_WEAK between nodes at t=0/0.5/1). The old
  // cream chevron below the packet pointing DOWN was exactly backwards.
  // Shovel tutorial (SetTutorialState 5747-5754): the arrow carries an
  // already-offset position (shovel center - 25, shovel bottom - 65), and
  // the same (25,80) emitter offset lands it centered under the shovel.
  const fracS = ((b.tick | 0) % 40) / 40;
  const segS = fracS < 0.5 ? fracS * 2 : (1 - fracS) * 2;
  const bobS = 10 * (segS * segS * (3 - 2 * segS));
  const drawFlipped = (cx, cy) => {
    const t = tintedDownArrow();
    ctx.save();
    if (t) {
      ctx.translate(cx, cy);
      ctx.scale(1, -1); // ParticleStretch -1: flip vertical -> points UP
      ctx.drawImage(t, -16, -13);
    } else {
      ctx.fillStyle = "#ffe666";
      ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 11, cy + 6); ctx.lineTo(cx + 11, cy + 6); ctx.lineTo(cx, cy - 6); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  };
  if (b.tutorialArrow === "shovel") {
    const r = cutsceneShovelRect();
    const ax = r.x + r.w / 2 - 25, ay = r.y + r.h - 65;
    drawFlipped(ax + 25, ay + 80 + bobS);
    return;
  }
  const bank = G.bankSeeds;
  const i = Math.max(0, Math.min(b.tutorialArrow, bank.length - 1));
  if (!bank.length) return;
  const px = 10 + packetX(bank.length, i), py = PACKET_Y;
  const frac = ((b.tick | 0) % 40) / 40;
  const seg = frac < 0.5 ? frac * 2 : (1 - frac) * 2;
  const bob = 10 * (seg * seg * (3 - 2 * seg));
  const cx = px + 25, cy = py + 80 + bob;
  const t = tintedDownArrow();
  ctx.save();
  if (t) {
    ctx.translate(cx, cy);
    ctx.scale(1, -1); // ParticleStretch -1: flip vertical -> points UP at the packet
    ctx.drawImage(t, -16, -13);
  } else {
    // Art not loaded yet: plain up-chevron stand-in, same spot/motion.
    ctx.fillStyle = "#ffe666";
    ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 11, cy + 6); ctx.lineTo(cx + 11, cy + 6); ctx.lineTo(cx, cy - 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// TextFadeOn.reanim locator_text keys (SexyAppFramework/reanim/TextFadeOn.reanim):
// 20 slam keys (scale 2.003->1.001, alpha 0->1), hold, then alpha fade at
// frames 36-39. Sampled with lerp like GetTransformAtTime (Reanimator 549).
const HUGE_LOC_S = [2.003, 1.967, 1.933, 1.899, 1.866, 1.834, 1.802, 1.769, 1.735, 1.700,
  1.663, 1.622, 1.576, 1.524, 1.464, 1.395, 1.316, 1.224, 1.119, 1.001];
const HUGE_LOC_A = [0, 0.05, 0.11, 0.16, 0.21, 0.26, 0.32, 0.37, 0.42, 0.47,
  0.53, 0.58, 0.63, 0.68, 0.74, 0.79, 0.84, 0.89, 0.95, 1];
function hugeLocatorAt(pos) {
  const p = Math.max(0, Math.min(39, pos));
  const i = Math.min(38, Math.floor(p)), f = p - i;
  const S = (k) => (k <= 19 ? HUGE_LOC_S[k] : 1.001);
  const A = (k) => (k <= 19 ? HUGE_LOC_A[k] : k <= 35 ? 1 : [1, 0.75, 0.5, 0.25, 0][k - 35]);
  return { s: S(i) + (S(i + 1) - S(i)) * f, a: A(i) + (A(i + 1) - A(i)) * f };
}
// MessageWidget::Draw (300) for the tutorial styles: cream HOUSEOFTERROR28
// text, centered both ways in a translucent black bar, alpha pulsing
// 192<->255 on the 75-tick bounce (aMinAlpha 192, CURVE_BOUNCE_SLOW_MIDDLE).
// TUTORIAL_LEVEL1(_STAY) sits at y 400 h 110; TUTORIAL_LEVEL2 at y 476 h 100.
function drawAdvice(b) {
  // MESSAGE_STYLE_HOUSE_NAME (MessageWidget::Draw 362-366, 407-411): plain
  // white HOUSEOFTERROR28 text at y=550, no bar, screen-centered whatever the
  // pan (source compensates -mBoard->mX so it lands at screen center), with
  // a fade-out over the last ticks (alpha = min(duration*15, 255)). The only
  // sub-line is the survival FLAGS_COMPLETED caption (433-454) — adventure
  // levels 1-9 never show it, so it is omitted.
  if (b.advice.style === "HOUSE") {
    ctx.save();
    const alpha = Math.min(255, b.adviceT * 15) / 255;
    drawText(ctx, "HoT28", b.advice.text, 400, 550, { align: "center", color: "#fff", alpha });
    ctx.restore();
    return;
  }
  // MESSAGE_STYLE_HUGE_WAVE (MessageWidget::Draw 368-371 + DrawReanimatedText
  // 231-267): red HOUSEOFTERROR28 at y=330, one reanimated letter per char.
  // Layout centers the line (LayoutReanimText 124-171: cursor starts at
  // -lineWidth/2, advances by CharWidth); the locator (400,300) recenters to
  // screen (400, 330). Scale/alpha come from the TextFadeOn locator curve at
  // each letter's driver position; while elapsed < slideOffTime the letter
  // also stretches outward by (1-animTime)*layoutX (DrawReanimatedText 255).
  // Letters are drawn left-edge-anchored (TodDrawStringMatrix transforms each
  // glyph's laid-out offset), and the first fully-transparent letter stops
  // the row (the `break` at DrawReanimatedText 248).
  if (b.advice.style === "HUGE") {
    const adv = b.advice;
    ctx.save();
    if (!adv.lx) {
      const widths = adv.letters.map((L) => textWidth("HoT28", L.ch));
      const total = widths.reduce((a, w) => a + w, 0);
      let cursor = 400 - total / 2;
      adv.lx = widths.map((w) => { const x = cursor; cursor += w; return x; });
      // Condensing guard kept from the stand-in era: the real HouseofTerror
      // line fits the 800px board, so kfit stays 1.
      adv.kfit = Math.min(1, 780 / total);
    }
    const elapsed = adv.displayTime - b.adviceT;
    for (let i = 0; i < adv.letters.length; i++) {
      const L = adv.letters[i];
      const { s, a } = hugeLocatorAt(L.start + L.t * (L.count - 1));
      if (Math.round(255 * a) <= 0) break;
      const layoutX = adv.lx[i] - 400;
      const x = 400 + layoutX * (elapsed < adv.slideOff ? 2 - L.t : 1) * adv.kfit;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x, 330);
      ctx.scale(s * adv.kfit, s);
      drawText(ctx, "HoT28", L.ch, 0, 0, { color: "#f00" });
      ctx.restore();
    }
    ctx.restore();
    return;
  }
  const style = b.advice.style;
  // MessageWidget::Draw rects (344-352): HINT_* sits at y 527 h 55 (the
  // shovel tutorial bar); TUTORIAL_LEVEL2 at 476/100; LEVEL1 at 400/110.
  const y = (style === "HINT" || style === "HINT_FAST") ? 527 : style === "L2" ? 476 : 400;
  const h = (style === "HINT" || style === "HINT_FAST") ? 55 : style === "L2" ? 100 : 110;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.5)"; // alpha 128 like Color(0,0,0,128)
  ctx.fillRect(0, y, W, h);
  // MessageWidget bounce (aMinAlpha 192, CURVE_BOUNCE_SLOW_MIDDLE): sine stand-in.
  const pulse = Math.abs(Math.sin(((b.tick | 0) % 75) / 75 * Math.PI * 2));
  const alpha = Math.round(192 + 63 * pulse);
  // TodDrawStringWrapped in Rect(0, y-7, 800, h), HoT28 cream, centered both
  // ways (source DS_ALIGN_CENTER_VERTICAL_MIDDLE). User tweak preserved: the
  // block sits 8px lower than source (source adds aTextOffsetY = -4); the
  // rect moved up 11 to offset the source-exact glyph placement.
  drawWrapped(ctx, "HoT28", b.advice.text, 0, y - 7, W, h, { color: "#fdf5ad", alpha: alpha / 255 });
  ctx.restore();
}

// Stormy-night weather (Challenge::DrawWeather 426B20 in the RENDER_ITEM_STORM
// slot, order FOG,0,3 — above the fog, below the coins/meter): tiled IMAGE_RAIN
// + the lightning darkness/flash overlay. Screen-space like drawFog (cam
// added to every stamp); boardX drives the tile offset compensation exactly
// like mBoard->mX in source.
function drawStormFlash(t, max, clock) {
  // Challenge::DrawStormFlash (426A20): darkness = AnimateCurve(150,0,t,
  // 255-max,255) + Rand(64)-32 clamped + white flash AnimateCurve(150,75,t,
  // max,0); both full-board rects (FillRect(-1000,-1000,2800,2600)). The
  // noise is MTRand(mMainCounter/6) — one draw per frame, stable across each
  // 6-tick block — not fresh randomness every frame.
  const seed = Math.floor((clock | 0) / 6) >>> 0;
  let h = (seed * 2654435761) >>> 0; h ^= h >>> 15; h = (h * 2246822519) >>> 0; h ^= h >>> 13;
  const dark = Math.max(0, Math.min(255, Math.round(calcPosition(150, 0, t, 255 - max, 255) + (h % 64) - 32)));
  ctx.fillStyle = `rgba(0,0,0,${(dark / 255).toFixed(3)})`;
  ctx.fillRect(-1000, -1000, 2800, 2600);
  const fl = Math.max(0, Math.min(1, calcPosition(150, 75, t, max, 0) / 255));
  if (fl > 0.004) {
    ctx.fillStyle = `rgba(255,255,255,${fl.toFixed(3)})`;
    ctx.fillRect(-1000, -1000, 2800, 2600);
  }
}
function drawRainTiles(t, boardX, camX, camY) {
  // Challenge::DrawRain (426B90): IMAGE_RAIN (100x100) tiled 9x7 twice —
  // far at 1x drifting on the effect clock, near at 1.5x on its own clocks.
  // NOTE source 3083 reuses the X offset for the far Y too (retained).
  const img = libs.images["particles/Rain.png"];
  if (!img || !img.width) return;
  // aBoardOffsetX (3065-3072, else-branch — the if-branch reads an
  // uninitialized local, so only the else is well-defined): mBoard->mX is
  // -boardX here (retail draws at mX; this port translates by -boardX).
  const mx = -boardX;
  const off = Math.trunc(mx / 100) * -100;
  const aT = ((t % 100) + 100) % 100;
  const tOX = calcPosition(0, 100, aT, 0, -100);
  for (let hor = 9; hor > 0; hor--) {
    for (let ver = 7; ver > 0; ver--) {
      ctx.drawImage(img, tOX + 100 * hor + off + camX, tOX + 100 * ver + camY);
    }
  }
  const tOX2 = calcPosition(0, 161, ((t % 161) + 161) % 161, 0, -100);
  const tOY2 = calcPosition(0, 33, ((t % 33) + 33) % 33, -100, 0);
  for (let hor = 0; hor < 9; hor++) {
    for (let ver = 0; ver < 7; ver++) {
      ctx.drawImage(img, (hor * 100 + tOX2) * 1.5 + off + camX, (ver * 100 + tOY2) * 1.5 + camY, 150, 150);
    }
  }
}
function drawStorm(b, t, boardX, camX, camY) {
  // Challenge::DrawStormNight (426E90): flash state machine, else full black.
  // (Retail then draws UI bottom/top-right — this port draws those separately
  // on every frame already, so only the weather + overlay land here.)
  drawRainTiles(t, boardX, camX, camY);
  ctx.save();
  ctx.translate(camX, camY);
  const st = b.stormState, c = b.stormCounter;
  if (st === "flash1" && c < 300) {
    if (c > 150) drawStormFlash(c - 150, 255, t);
    else drawStormFlash(c, 92, t);
  } else if (st === "flash2" && c < 300) {
    drawStormFlash(c / 2, 255, t);
  } else if (st === "flash3" && c < 150) {
    drawStormFlash(c, 255, t);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(-1000, -1000, 2800, 2600);
  }
  ctx.restore();
}

// Fog overlay for BG.FOG: source-cel fog with plantern glow holes.
function drawFog(b, camX, camY) {
  // Board::DrawFog SOFTWARE path (Board.cpp:7526-7574 — this port never takes
  // the 3D branch): fog_software.png (byte-identical main.zip images/,
  // 567x144 = 3 cels of 189x144 per resources.xml cols="3"; cel = look %
  // numCols) at x*80+fogOffset-5,
  // y*85+23, white colorize (identity), alpha = cell density; an extra cel
  // past the right edge (x == 8). Densities live in board.gridCelFog
  // [9][rows+1]; the 200 cap at the left fog column is enforced sim-side.
  // Look index is y % MAX_GRID_SIZE_Y (DrawFog reads mGridCelLook[x][y % 6];
  // the look table is [9][6]) — so row 6 reuses row 0's variant.
  const img = libs.images["fog_software.png"];
  if (img && img.width) {
    const celW = img.width / 3, celH = img.height;
    for (let x = 0; x < 9; x++) {
      const col = b.gridCelFog[x] || [];
      for (let y = 0; y <= b.rows; y++) {
        const a = col[y] | 0;
        if (a <= 0) continue;
        const look = ((b.gridCelLook[x] || [])[y % 6] || 0);
        const cel = ((look % 3) + 3) % 3;
        const dx = x * 80 + b.fogOffset - 5 + camX, dy = y * 85 + 23 + camY;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, a / 255));
        ctx.drawImage(img, cel * celW, 0, celW, celH, dx, dy, celW, celH);
        if (x === 8) ctx.drawImage(img, cel * celW, 0, celW, celH, dx + 80, dy, celW, celH);
        ctx.restore();
      }
    }
  }
  // Plantern glow (PlantInitialize SEED_PLANTERN: PARTICLE_LANTERN_SHINE
  // attached at (mX+40, mY+40), RENDER_LAYER_FOG+1 — i.e. above the fog;
  // LanternShine.png byte-identical main.zip particles/). The retail mote
  // system (2x10 motes, dur 60-120, scale ~1 bounce .7-1, alpha .5 bounce
  // .3-.5) is modeled as a tick-pulsed glow stamp at the plant center.
  // Plant::Squish (Plant.cpp:2338-2365) runs RemoveEffects, which kills the
  // lantern particle — so a squished plantern goes dark (the fog CLEARING
  // also stops via the NotOnGround gate). Gate on squished, not just dead.
  const glow = libs.images["particles/LanternShine.png"];
  if (glow && glow.width) {
    const pu = 0.5 + 0.5 * Math.sin(b.tick * 0.13);
    ctx.save();
    for (const p of b.allPlants()) {
      if (p.dead || p.squished || p.seed !== 25) continue;
      const s = 0.85 + 0.15 * Math.sin(b.tick * 0.1 + p.col);
      ctx.globalAlpha = 0.35 + 0.15 * pu;
      const w = glow.width * s, h = glow.height * s;
      ctx.drawImage(glow, p.x + 40 - w / 2 + camX, p.y + 40 - h / 2 + camY, w, h);
    }
    ctx.restore();
  }
}

// Placement preview (CursorPreview::Draw, CursorObject.cpp:270): the held
// plant drawn as a full reanim at the cell origin +
// PlantDrawHeightOffset, colorized translucent white (SetColorizeImages(true)
// + Color(255,255,255,100): the white tint is the identity, alpha 100/255).
// Shown ONLY when plantable (CursorPreview::Update gates on CanPlantAt ==
// PLANTING_OK) — retail draws no red box, so neither do we. Per user request
// the ghost holds the static idle frame-0 pose (never animated).
// Explode-o-nut red tint for non-roller visuals (PlantInitialize 270-273 /
// UpdateReanimColor 2696-2699: Color(255,64,64) multiply). Rollers bake this
// in the Bowler constructor; the ghost/cursor Plants share one helper.
function tintExplodePlant(p, b) {
  if (!p || !p.body || p.seed !== 41) return;
  try {
    const red = b.getExplodeDef();
    if (red) p.body.def = red;
  } catch (e) { /* canvas tint unavailable headless */ }
}
let ghostPlant = null, cursorPlant = null;
function drawGhost(seed, col, row, x, y, ok, camX = 0, camY = 0) {
  if (!ok) { ghostPlant = null; return; }
  const b = G.board;
  if (!b) return;
  if (!ghostPlant || ghostPlant.board !== b || ghostPlant.seed !== seed ||
      ghostPlant.col !== col || ghostPlant.row !== row) {
    // A real (never-simmed, never-planted) Plant: body + attached heads
    // exactly like a planted one (Plant constructor only builds visuals).
    try { ghostPlant = new Plant(b, seed, col, row, true); tintExplodePlant(ghostPlant, b); }
    catch (e) { ghostPlant = null; }
  }
  const p = ghostPlant;
  if (!p || !p.body) {
    // def missing (shouldn't happen: bank defs preload): still fallback.
    const still = STILLS.get(seed);
    if (still) { ctx.save(); ctx.globalAlpha = 100 / 255; ctx.drawImage(still, x - 10, y - 4, 60, 60); ctx.restore(); }
    return;
  }
  // Ride the cell: origin + live height offset (pot/water bob via tick).
  // Translucency lives on the reanims (drawTrack overwrites ctx.globalAlpha,
  // so an outer alpha would be clobbered): body + every attached head.
  p.drawOff = Plant.drawHeightOffset(b, seed, col, row);
  p.body.x = x + p.compX; p.body.y = y + p.drawOff + p.compY;
  p.body.alpha = 100 / 255;
  for (const h of p.heads) h.reanim.alpha = 100 / 255;
  // Pumpkin shell (Plant::Draw 4065-4072): the group-1 back half draws first
  // (previews have no cell layering — one plant, back then front, like the
  // lone-shell pass in drawBoard). trackExists-gated: defs without the track
  // draw group 0 only.
  if (seed === 30 && p.body.trackExists("Pumpkin_back")) p.body.draw(ctx, camX, camY, 1);
  // Gravebuster grounded-dirt (USER OVERRIDE): same clip + fixed ring as the
  // planted draw, at ghost translucency.
  if (seed === 11 && p.dirtTrack !== undefined && p.dirtTrack >= 0) {
    drawBusterGrounded(p, ctx, camX, camY, () => { p.body.draw(ctx, camX, camY); });
  } else p.body.draw(ctx, camX, camY);
}

function drawSeedBank(yOff = 0, xOff = 0, darken = 128) {
  // SeedBank::Draw, RENDER_ITEM_BOTTOM_UI (UI_BOTTOM 100000 — BELOW the
  // entities: PLANT/ZOMBIE/PROJECTILE/PARTICLE 302-307000, coins at
  // COIN_BANK 600000): the dial art is the user-supplied minimal version
  // icon with the white count plate below it, no brown bar (main.zip
  // images/SeedBank.png, byte-identical). Packets are unchanged art at
  // GetSeedPacketPositionX; shovel pinned at SHOVEL_X; sun
  // count CONTINUUMBOLD14 black centered x=34, baseline y=85 (CB14 digits
  // sit high in their line box — this puts the glyph box 66..79, centered
  // on the plate rows 62..84).
  const b = G.board;
  if (!b) return;
  // Board::DrawUIBottom (7379): the seed bank is NOT drawn once the zombies
  // have won (SCENE_ZOMBIES_WON). The meter + level text below stay, like
  // DrawProgressMeter/DrawLevel which have no scene gate.
  if (b.state !== "lost") {
  ctx.save();
  ctx.translate(xOff, yOff);
  if (b.isConveyor) {
    // SeedBank::Draw conveyor branch (915-937): backdrop at (83,0), the
    // animated belt at (90,63), then the packets under clip (90,0,501,600).
    // No sun dial/count (the money label is skipped for conveyor banks).
    // USER OVERRIDE: whole cluster shifted left by CONV_SHIFT to clear the
    // Menu button (see note at CONV_SHIFT).
    const bd = libs.images["ConveyorBelt_backdrop.png"];
    if (bd) ctx.drawImage(bd, convBeltX(83), 0);
    const belt = libs.images["ConveyorBelt.png"];
    if (belt && belt.width) {
      // DrawImageCel(IMAGE_CONVEYORBELT, 90, 63, mConveyorBeltCounter/4 % 6):
      // the 502x96 texture is 6 cels of 502x16 stacked vertically, each a
      // 1px-shifted phase of the 6px-period stripe scroll — draw the single
      // 16px band at (90,63), NOT the whole texture (which hangs 80px too
      // far down over the lawn).
      const cel = (Math.floor(b.convBelt / 4) % 6 + 6) % 6;
      ctx.save();
      ctx.beginPath(); ctx.rect(convBeltX(90), 0, 501, 600); ctx.clip();
      ctx.drawImage(belt, 0, cel * 16, belt.width, 16, convBeltX(90), 63, belt.width, 16);
      for (let i = 0; i < b.convPackets.length; i++) {
        const p = b.convPackets[i];
        drawPacket(convDrawX(i) + p.offset, CONV_PACKET_Y, 50, 70, p.seed,
          { selected: G.selConvIdx === i, noCost: true });
      }
      ctx.restore();
    } else {
      for (let i = 0; i < b.convPackets.length; i++) {
        const p = b.convPackets[i];
        drawPacket(convDrawX(i) + p.offset, CONV_PACKET_Y, 50, 70, p.seed,
          { selected: G.selConvIdx === i, noCost: true });
      }
    }
    if (b.showShovel && !b.isVase) {
      // USER OVERRIDE: pinned left of the Menu button (SHOVEL_X), not
      // retail's extra+456. (Vase draws its shovel separately, untranslated,
      // at VASE_SHOVEL_X — its bank never slides in.)
      const shx = SHOVEL_X;
      const sb = libs.images["ShovelBank.png"];
      if (sb) ctx.drawImage(sb, shx, 0);
      else { ctx.fillStyle = "#666"; ctx.fillRect(shx, 0, 70, 72); }
      // Board::DrawShovel (7034): the slot shovel hides while the cursor is
      // the shovel (the held one draws at the cursor instead).
      const sh = libs.images["Shovel.png"];
      if (sh && !G.shovelMode) ctx.drawImage(sh, shx - 7, -3); // 1:1, Board::DrawShovel offset
    }
    ctx.restore();
  } else {
  const n = G.bankSeeds.length;
  const dial = libs.images["SeedBank.png"]; // 446x87 canvas, art is dial+plate only
  if (dial) ctx.drawImage(dial, 0, 0);
  for (let i = 0; i < n; i++) {
    drawPacket(packetX(n, i), PACKET_Y, 50, 70, G.bankSeeds[i], { selected: G.selSeed === G.bankSeeds[i] });
    // SeedPacket::FlashIfReady (86-109): PARTICLE_SEED_PACKET_FLASH at the
    // packet center when a recharge completes — the 50x70 sparkle sheet over
    // the packet, alpha 0->1->0 across its 25-tick life.
    const ft = b.packetFlash ? (b.packetFlash[G.bankSeeds[i]] | 0) : 0;
    const fimg = ft > 0 ? libs.images["particles/SeedPacketFlash.png"] : null;
    if (fimg && fimg.width) {
      const age = 1 - ft / 25;
      const fa = age < 0.4 ? age / 0.4 : 1 - (age - 0.4) / 0.6;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, fa));
      ctx.drawImage(fimg, packetX(n, i), PACKET_Y, 50, 70);
      ctx.restore();
    }
  }
  if (b.showShovel && !b.isVase) {
    // USER OVERRIDE: pinned left of the Menu button (SHOVEL_X), not
    // retail's extra+456. (Vase draws its shovel separately, untranslated,
    // at VASE_SHOVEL_X — its bank never slides in.)
    const shx = SHOVEL_X;
    const sb = libs.images["ShovelBank.png"];
    if (sb) ctx.drawImage(sb, shx, 0);
    else { ctx.fillStyle = "#666"; ctx.fillRect(shx, 0, 70, 72); }
    const sh = libs.images["Shovel.png"];
    if (sh && !G.shovelMode) ctx.drawImage(sh, shx - 7, -3); // 1:1, Board::DrawShovel offset
  }
  // SeedBank::Draw 962-972: CONTINUUMBOLD14 sun count, black, centered x=34,
  // baseline y=78 (source) — red while mOutOfMoneyCounter blinks (%20<10).
  const oom = (b.outOfMoney | 0) > 0 && (b.outOfMoney | 0) % 20 < 10;
  drawText(ctx, "CB14", String(Math.max(0, b.sun)), 34, 78, { align: "center", color: oom ? "#f00" : "#000" });
  ctx.restore();
  } // end normal-bank else
  } // end SCENE_ZOMBIES_WON seedbank gate
} // end drawSeedBank
// Vasebreaker shovel (Board::DrawShovel 7025-7051 at GetShovelButtonRect):
// the slot rides retail's fixed VASE_SHOVEL_X untranslated while the bank
// hides above the screen — the only shovel this level ever shows.
function drawVaseShovel() {
  const b = G.board;
  if (!b || !b.isVase || !b.showShovel || b.state === "lost") return;
  const sb = libs.images["ShovelBank.png"];
  if (sb) ctx.drawImage(sb, VASE_SHOVEL_X, 0);
  else { ctx.fillStyle = "#666"; ctx.fillRect(VASE_SHOVEL_X, 0, 70, 72); }
  // Board::DrawShovel (7034): the slot shovel hides while the cursor is
  // the shovel (the held one draws at the cursor instead).
  const sh = libs.images["Shovel.png"];
  if (sh && !G.shovelMode) ctx.drawImage(sh, VASE_SHOVEL_X - 7, -3); // 1:1, Board::DrawShovel offset
}

function drawMeter(camX, camY) {
  // Board::DrawProgressMeter + DrawLevel (both inside DrawUITop, UI_TOP
  // 700000) sit ABOVE DrawFog (FOG 500000) — the meter/Level text are never
  // fogged. So fog draws first here, then the meter + text over it.
  const b = G.board;
  if (!b) return;
  if (b.stageHasFog()) drawFog(b, camX, camY);
  // Stormy-night weather in the play pass (same RENDER_ITEM_STORM slot as
  // the cutscene top above). Effect clock is the board tick; the boardX is
  // recovered from the camera (play framing 0, loss pan otherwise).
  if (b.isStormy) drawStorm(b, b.tick, -camX, camX, camY);
  // DrawStormNight (3132) calls DrawUIBottom AFTER the black/flash fill, so
  // the bank + shovel redraw OVER the storm (RENDER_ITEM_STORM is FOG,0,3,
  // above the 100000 bank). The pre-entity bank draw below is skipped on
  // stormy for the same reason — else the belt hides through every black
  // stretch. (Deviation: the bank lands above row-0 zombie heads, which
  // retail keeps under it — negligible against an unplayable hidden belt.)
  if (b.isStormy) drawSeedBank(0, 10);
  // level progress meter, bottom-right (Board::DrawProgressMeter + DrawLevel,
  // Board.cpp). User-supplied FlagMeter art — no invented bars/text: empty bar
  // at the source (600,575), green fill growing right-to-left with the width,
  // one flag per flag wave with its bottom sitting on the bar's bottom
  // edge (same x slots and raise as source), zombie-head marker, and the gold
  // "Level X" string right-aligned at x=593 (user override: 4px below source).
  // (The LevelProgress caption image is skipped: this decomp's copy is
  // Chinese-localized art. FlagMeterParts cel 1 is empty in the user art, so
  // no pole is drawn — flag top (cel 2) only.)
  if (b.progressW > 0) {
    const meter = libs.images["FlagMeter.png"]; // 158x54: row 0 empty, row 1 fill
    const parts = libs.images["FlagMeterParts.png"]; // user art: cel 0 head, cel 2 flag top (no pole cel)
    if (meter && parts) {
      const celW = meter.width, celH = meter.height / 2;
      ctx.drawImage(meter, 0, 0, celW, celH, 600, 575, celW, celH);
      const clip = Math.round(143 * Math.min(150, b.progressW) / 150);
      if (clip > 0) ctx.drawImage(meter, celW - clip - 7, celH, clip, celH, celW - clip + 593, 575, clip, celH);
      // flags (ProgressMeterHasFlags 6659-6672: everything except first-time L1
      // — plus whack-a-mole, whose meter shows no flag poles at all):
      // flag art bottoms sit on the bar tube's bottom edge (source pole y 571;
      // the tube art ends at 575+20=595 and the flag art fills its 25px cel
      // to local y 24, so 595-24-h = 571-h), rising with h when passed.
      if (!(b.level === 1 && !b.finished) && !b.isWhack) {
        const flagsEnd = 590 + celW;
        for (let w = 0; w < b.numWaves; w++) {
          if (!b.isFlagWave(w)) continue;
          const atFlag = w + 1;
          const h = atFlag < b.currentWave ? 14
            : atFlag === b.currentWave ? Math.round(14 * (100 - b.flagRaise) / 100) : 0;
          const fx = Math.round(flagsEnd + (606 - flagsEnd) * (atFlag / b.numWaves));
          ctx.drawImage(parts, 50, 0, 25, 25, fx, 571 - h, 25, 25);
        }
      }
      const hp = Math.round(135 * Math.min(150, b.progressW) / 150);
      ctx.drawImage(parts, 0, 0, 25, 25, celW - hp + 580, 572, 25, 25); // zombie head
    }
  }
  // Board::DrawLevel 6841-6851: HOUSEOFTERROR16 gold, right-aligned.
  // (user override preserved: 6px below the source y, rect moved up 7 to
  // offset the source-exact glyph placement).
  drawText(ctx, "HoT16", `Level ${levelLabel(b.level)}`, b.progressW > 0 ? 593 : 780, 594, { align: "right", color: "#e0bb62" });
}

function drawEndOverlay() {
  const b = G.board;
  if (b.state !== "lost" || !b.winner) return;
  // Brains splash (CutScene::UpdateZombiesWon 1517-1527): built at
  // LostTimeBrainGraphicStart = 6000cs = tick 600 at (-BOARD_OFFSET, 0)
  // @12fps PLAY_ONCE_AND_HOLD with the fullscreen track black (our main.zip
  // art is pre-blackened, so no tint pass is needed) + FOLEY_SCREAM (the sim
  // plays it at brainsUp; scream.ogg is byte-identical from main.zip).
  // Screen space (0,0) == board (-220,0) once the pan completes at tick 350,
  // long before the splash builds. The splash is a one-shot beat: it plays
  // for 600->1100, HOLDS its final frame to 1400 (user-directed hold past
  // the source LostTimeEnd 11000cs), and is REMOVED the moment the
  // GameOverDialog comes up — the dialog stands alone over the board.
  // (Built in tick at lossT 600, NOT here — see the UpdateZombiesWon note
  // there. Building it here drew frame 0 for one tick: a full-opacity
  // brains flash before the entrance.)
  if (b.lossT >= 600 && !b.ended && G.wonReanim) {
    try {
      // SetShakeOverride("ZombiesWon", 1.0/0.0) at 7000/8000cs (1531-1539):
      // the title track shakes ±1px random per frame. Reanim-level shake is
      // unimplemented, so the whole splash jitters ±1px — same pixels on the
      // static brains/black, ±1px on the title, instead of title-only.
      if (b.brainShake) {
        ctx.save();
        ctx.translate((Math.random() * 2 - 1), (Math.random() * 2 - 1));
        G.wonReanim.draw(ctx);
        ctx.restore();
      } else G.wonReanim.draw(ctx);
      // End pose (source BrainGraphicEnd 11000cs, folded to the 1400 dialog
      // tick — see sim): identical pixels to the hold frame (both ranges
      // share frame 52), posed here so a live reanim keeps state, though
      // the splash is removed the same tick the dialog comes up.
      if (b.brainsEnd && !G.wonReanim.posedEnd) {
        try { G.wonReanim.setFramesForLayer("anim_screen"); } catch (e) { /* keep holding */ }
        G.wonReanim.posedEnd = true;
      }
    } catch (e) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, W, H);
    }
  }
  if (b.ended) {
    // GameOverDialog at LostTimeEnd 11000cs: adventure gets ("", false) —
    // a small MODAL LawnDialog standing alone over the board (the splash
    // beat is over and removed — user-directed sequencing): "GAME OVER"
    // header, empty message, one centered TRY AGAIN footer (ID_FOOTER ->
    // EndLevel = retry the level). The old veil + "click to continue"
    // full-screen prompt was invented — removed. MAIN MENU hangs off the
    // top-right like the Menu tab (ctor 465: Resize(635-mX, -10-mY, 163,
    // 46)). Board clicks elsewhere are swallowed by the modal dialog
    // (ZombieWonClick only fires with no dialog up).
    const g = lawnPauseGeom("gameover");
    drawPauseFrame(g.x, g.y, g.w, g.h);
    drawText(ctx, "DWARF24", g.header, g.x + g.w / 2, g.y + g.fontY + 24, { align: "center", color: "#e0bb62" });
    const goDown = G.overPress;
    for (const bb of g.btns) {
      const hov = gameoverWidgetAt(G.mouse) === bb.id;
      drawStoneButton(bb.x, bb.y, bb.w, bb.h, bb.label, goDown === bb.id, hov);
    }
    const mm = GAMEOVER_MENU_RECT;
    const mmHov = gameoverWidgetAt(G.mouse) === "mainmenu";
    drawStoneButton(mm.x, mm.y, mm.w, mm.h, "Main Menu", goDown === "mainmenu", mmHov);
  }
}
// GameOverDialog MAIN MENU tab (LawnDialog.cpp ctor 465): screen-corner tab,
// same stone-button look as the in-game Menu tab, half offscreen.
const GAMEOVER_MENU_RECT = { x: 635, y: -10, w: 163, h: 46 };
function gameoverActive() {
  const b = G.board;
  return G.screen === "board" && !!b && b.state === "lost" && b.ended;
}
function gameoverWidgetAt(p) {
  if (!gameoverActive()) return null;
  const inR = (r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  for (const bb of lawnPauseGeom("gameover").btns) if (inR(bb)) return bb.id;
  if (inR(GAMEOVER_MENU_RECT)) return "mainmenu";
  return null;
}
function activateGameover(k) {
  // GameOverDialog::ButtonDepress: ID_FOOTER -> KillDialog + EndLevel
  // (adventure EndLevel = NewGame + replay the level); menu button (id 1) ->
  // KillBoard + ShowGameSelector. Both reuse the pause-menu equivalents.
  if (k === "tryagain") doPauseRestart();
  else if (k === "mainmenu") doPauseLeave();
}

// ---------- pre-shop slot-offer modal (CutScene 1647-1688) ----------
// DIALOG_PURCHASE_PACKET_SLOT with BUTTONS_YES_NO, opened when Dave's
// advance lands on 1503/1553 ("How's that sound?"). The dialog rides
// +120/+130 off center (CutScene 1655-1656) so Dave stays visible; the
// coin bank flashes behind it (ShowCoinBank). YES (1660-1674): deduct,
// +1 upgrade, persist, SeedBank::UpdateWidth — the chooser (built
// pre-purchase at startLevel) gains the new slot — then Dave talks
// 1510/1560. NO (1676-1687): mDidntPurchasePacketUpgrade++, Dave talks
// 1520/1570. Input is press/release-matched like every other modal;
// the intro clock stays frozen on Dave's message throughout.
function daveOfferGeom() {
  const g = lawnPauseGeom("daveOffer");
  const dx = 120, dy = 130; // CutScene 1655-1656
  return { ...g, x: g.x + dx, y: g.y + dy, btns: g.btns.map((bb) => ({ ...bb, x: bb.x + dx, y: bb.y + dy })) };
}
function daveOfferWidgetAt(p) {
  if (!G.daveOffer) return null;
  const inR = (r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  for (const bb of daveOfferGeom().btns) if (inR(bb)) return bb.id;
  return null;
}
function activateDaveOffer(k) {
  const o = G.daveOffer, b = G.board;
  if (!o) return;
  if (k === "yes") {
    // CutScene 1660-1674. The coins check re-runs (gated at offer time,
    // and nothing can spend mid-cutscene — a failed buy just closes).
    if (!SAVE.buyPacketUpgrade(o.cost)) { G.daveOffer = null; return; }
    if (b) {
      b.packetUpgrade = SAVE.getPacketUpgrade();
      if (G.chooser) G.chooser.slots = Math.min(G.chooser.avail, numSeedsInBank(b.level, b.finished, b.packetUpgrade));
    }
    G.daveOffer = null;
    daveTalkIndex(o.msgIndex === 1503 ? 1510 : 1560);
  } else if (k === "no") {
    // CutScene 1676-1687: two declines end the offers for the profile.
    SAVE.incDidntPacket();
    G.daveOffer = null;
    daveTalkIndex(o.msgIndex === 1503 ? 1520 : 1570);
  }
}
function drawDaveOffer() {
  // Drawn over Dave's bubble in the cutscene top (Dave stays visible
  // behind the shifted dialog, like the source modal stacking).
  if (!G.daveOffer || !G.board || G.board.state !== "cutscene") return;
  const g = daveOfferGeom();
  drawPauseFrame(g.x, g.y, g.w, g.h);
  drawText(ctx, "DWARF24", g.header, g.x + g.w / 2, g.y + g.fontY + 24, { align: "center", color: "#e0bb62" });
  g.lines.forEach((ln, i) => {
    if (ln) drawText(ctx, "HoT16", ln, g.x + g.w / 2, g.y + g.linesY + 19 + i * g.lh, { align: "center", color: "#e0bb62" });
  });
  for (const bb of g.btns) {
    const hov = daveOfferWidgetAt(G.mouse) === bb.id;
    drawStoneButton(bb.x, bb.y, bb.w, bb.h, bb.label, G.offerPress === bb.id, hov);
  }
}

// ---------- award screen (Lawn/Widget/AwardScreen.cpp) ----------// NOTE on English strings: the repo's LawnStrings/Plant literals are
// Chinese-localized, so the display strings below are transcribed from
// retail US (layout, positions, fonts, and branch conditions are
// source-exact). The seed description is the retail Plant::GetToolTip table
// (SEED_TOOLTIPS in data.js, indexed by SeedType like the source).
const AWARD_TEXT = {
  newPlant: "New Plant!",
  next: "Next Level!",
  cont: "Continue!",
  menu: "Main Menu",
  shovelTitle: "Got the Shovel!",
  shovel: "Shovel",
  shovelDesc: "Use the shovel to dig up a plant and clear the space.",
  note: "You found a note!",
  // AwardScreen taco branch (Draw 295-299): LawnStrings [TACO] family.
  tacoTitle: "You found a taco!",
  taco: "Taco",
  tacoDesc: "What are you going to do with a taco?",
};
// Profile level == beaten level + 1 (UpdatePlayerProfileForFinishingLevel runs
// before the screen shows). Branches mirror AwardScreen::Draw on that number:
// 5 -> shovel (beaten 1-4), 10 -> zombie note (beaten 1-9), else the beaten
// level's seed (DrawAwardSeed: GetAwardSeedForLevel(GetLevel()-1)).
function awardProfile() { return (SAVE.currentUser() || {}).level || 1; }
// Paper-note levels (IsPaperNote 169-176 + Draw 264-318): adventure profiles
// 10/20/30/40/50 show the zombie note instead of a seed. Day lawn behind
// 10/30/50 (BACKGROUND1), night lawn behind 20/40 (BACKGROUND2); each level
// has its own note art + position. (Only 10 is reachable in the L1-9 scope;
// the rest ride along source-exact for the debug setLevel hook.)
function awardNoteInfo(profile) {
  if (profile === 10) return { art: "ZombieNote1.png", x: 131, y: 132, night: false };
  if (profile === 20) return { art: "ZombieNote2.png", x: 133, y: 127, night: true };
  if (profile === 30) return { art: "ZombieNote3.png", x: 120, y: 117, night: false };
  if (profile === 40) return { art: "ZombieNote4.png", x: 102, y: 117, night: true };
  if (profile === 50) return { art: "ZombieFinalNote.png", x: 114, y: 138, night: false }; // asset not shipped: sheet + title only
  return null;
}
function awardStartRect() { return { x: 324, y: awardNoteInfo(awardProfile()) ? 520 : 500, w: 156, h: 42 }; }
function awardMenuRect() { return { x: 677, y: 16, w: 111, h: 26 }; }
async function handleAwardClick(p) {
  // AwardScreen::MouseUp (467): start -> next level (StartButtonPressed
  // 453: PreNewGame on the profile level, which IS the next level), menu ->
  // game selector. Non-adventure screens out of scope.
  // Buttons use SOUND_TAP like the chooser's GameButtons (the old
  // "buttonclick" key doesn't exist, so these clicks were silent).
  const sr = awardStartRect();
  if (p.x > sr.x && p.x < sr.x + sr.w && p.y > sr.y && p.y < sr.y + sr.h) {
    playSfx("tap");
    // AwardScreen::StartButtonPressed (L25/L35/L42): Crazy Dave's shop opens
    // over the award with the intro dialog (SetupForIntro 301/601/3100);
    // its back button reads NEXT LEVEL and continues into the next level.
    // (Trial/upsell branches skipped — no trial mode in this port.)
    const prof = awardProfile();
    if (prof === 25 || prof === 35 || prof === 42) {
      const intro = prof === 25 ? 301 : prof === 35 ? 601 : 3100;
      openStore({
        intro, backLabel: "NEXT LEVEL",
        after: async () => { await startLevel(Math.min(50, prof)); },
      }).catch(() => {});
      return;
    }
    await startLevel(Math.min(50, awardProfile()));
    return;
  }
  if (awardProfile() > 3) { // AwardScreen.cpp 97-101: the Main Menu
    // button is hidden + disabled while the profile is <= 3 with an
    // unfinished adventure, so early award screens have none.
    const mr = awardMenuRect();
    if (p.x > mr.x && p.x < mr.x + mr.w && p.y > mr.y && p.y < mr.y + mr.h) {
      playSfx("tap");
      await enterMenu();
    }
  }
}
// ZombieNote.png / ZombieNote1-4.png ship with opaque black backgrounds
// (retail art is transparent). Baked once per art into transparent canvases at
// draw time — the shipped files stay byte-identical. Paper: key out
// near-black. Text: white-on-black is inverted, then drawn with 'multiply' so
// the page shows through and the handwriting lands dark (the retail look).
const noteBakeCache = new Map();
function bakedNoteImages(art = "ZombieNote1.png") {
  const hit = noteBakeCache.get(art);
  if (hit) return hit;
  const key = (img, invert) => {
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const r = d.data[i], gg = d.data[i + 1], b = d.data[i + 2];
      if (Math.max(r, gg, b) <= 12) d.data[i + 3] = 0; // black surround -> transparent
      else if (invert) { d.data[i] = 255 - r; d.data[i + 1] = 255 - gg; d.data[i + 2] = 255 - b; }
    }
    g.putImageData(d, 0, 0);
    return c;
  };
  const paper = libs.images["ZombieNote.png"], ink = libs.images[art];
  let paperCv = null, inkCv = null;
  if (paper && paper.width) paperCv = key(paper, false);
  if (ink && ink.width) inkCv = key(ink, true);
  const out = [paperCv, inkCv];
  noteBakeCache.set(art, out);
  return out;
}
function drawAward() {
  const profile = awardProfile();
  const note = awardNoteInfo(profile);
  const GOLD = "#d59f2b", NAVY = "#28325a";
  if (note) {
    // Paper note (Draw 264-318 + ctor 152-157): lawn behind (user-supplied
    // fullscreen day/night art standing in for the retail 3.5x BACKGROUND
    // zoom), the ZombieNote sheet + the level's note art, gold FOUND_NOTE
    // title. Note graphics unchanged (baked ZombieNote.png + level art).
    const bg = libs.images[note.night ? "notescreen-night.png" : "notescreen-day.png"];
    if (bg && bg.width) ctx.drawImage(bg, 0, 0);
    else { ctx.fillStyle = note.night ? "#16233d" : "#2a4d1e"; ctx.fillRect(0, 0, 800, 600); }
    const [pcv, icv] = bakedNoteImages(note.art);
    if (pcv) ctx.drawImage(pcv, 80, 80);
    else { const zn = libs.images["ZombieNote.png"]; if (zn) ctx.drawImage(zn, 80, 80); }
    const inkImg = libs.images[note.art];
    if (icv) { ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.drawImage(icv, note.x, note.y); ctx.restore(); }
    else if (inkImg && inkImg.width) ctx.drawImage(inkImg, note.x, note.y);
    drawText(ctx, "DWARF24", AWARD_TEXT.note, 400, 70, { align: "center", color: "#ffc800" });
  } else {
    const bg = libs.images["awardscreen_back.png"];
    if (bg) ctx.drawImage(bg, 0, 0);
    if (profile === 5) {
      // Shovel award (259-263): beaten 1-4. Retail art on the screen itself;
      // the lawn pickup keeps the main.zip Shovel_hi_res.png (user request).
      drawText(ctx, "DWARF24", AWARD_TEXT.shovelTitle, 400, 58, { align: "center", color: GOLD });
      const sh = libs.images["Shovel_hi_res_retail.png"] || libs.images["Shovel_hi_res.png"];
      if (sh) ctx.drawImage(sh, 400 - sh.width / 2, 137);
      drawText(ctx, "DWARF18", AWARD_TEXT.shovel, 400, 326, { align: "center", color: "#fff" });
      drawWrapped(ctx, "BRIANNE16", AWARD_TEXT.shovelDesc, 285, 360, 230, 90, { color: NAVY });
    } else if (profile === 35) {
      // Taco award (Draw 295-299): beaten 4-4. DrawBottom FOUND_TACO / TACO /
      // TACO_DESCRIPTION + IMAGE_TACO centered at y 160 (main.zip art).
      drawText(ctx, "DWARF24", AWARD_TEXT.tacoTitle, 400, 58, { align: "center", color: GOLD });
      const taco = libs.images["Taco.png"];
      if (taco && taco.width) ctx.drawImage(taco, 400 - taco.width / 2, 160);
      drawText(ctx, "DWARF18", AWARD_TEXT.taco, 400, 326, { align: "center", color: "#fff" });
      drawWrapped(ctx, "BRIANNE16", AWARD_TEXT.tacoDesc, 285, 360, 230, 90, { color: NAVY });
    } else {
      // Seed award (DrawAwardSeed 188-202): 2x DrawSeedPacket at (350,129)
      // (scale about that origin, like SetScale), title/name/message per
      // DrawBottom (179-185).
      const seed = awardSeedForLevel(profile - 1);
      drawText(ctx, "DWARF24", AWARD_TEXT.newPlant, 400, 58, { align: "center", color: GOLD });
      ctx.save(); ctx.translate(350, 129); ctx.scale(2, 2);
      drawPacket(0, 0, 50, 70, seed, { award: true });
      ctx.restore();
      drawText(ctx, "DWARF18", SEED_NAMES[seed] || "", 400, 326, { align: "center", color: "#fff" });
      drawWrapped(ctx, "BRIANNE16", SEED_TOOLTIPS[seed] || "", 285, 360, 230, 90, { color: NAVY });
    }
  }
  // Buttons (74-101, 133-144): profile 2 (beaten 1-1) and 25/35/45 (key/taco/
  // watering-can intros) get CONTINUE instead of NEXT LEVEL; the menu button
  // is hidden while profile <= 3 (97-101).
  // Hover = retail GameButton over art (glow overlay on the start button,
  // glow swap on the menu button).
  const sr = awardStartRect();
  const sb = libs.images["SeedChooser_Button.png"];
  if (sb && sb.width) ctx.drawImage(sb, sr.x, sr.y);
  const sg = libs.images["SeedChooser_Button_Glow.png"];
  if (hovered(sr) && sg && sg.width) ctx.drawImage(sg, sr.x, sr.y);
  drawText(ctx, "DWARF15", (profile === 2 || profile === 25 || profile === 35 || profile === 45) ? AWARD_TEXT.cont : AWARD_TEXT.next, sr.x + sr.w / 2, sr.y + 27, { align: "center", color: GOLD });
  if (profile > 3) {
    const mr = awardMenuRect();
    const mb = libs.images["SeedChooser_Button2.png"];
    const mg = libs.images["SeedChooser_Button2_Glow.png"];
    const mi = (hovered(mr) && mg && mg.width ? mg : mb);
    if (mi && mi.width) ctx.drawImage(mi, mr.x, mr.y);
    drawText(ctx, "BRIANNE12", AWARD_TEXT.menu, mr.x + mr.w / 2, mr.y + 20, { align: "center", color: "#2a2a5a" });
  }
  // Fade-in veil (333-335): white, black for paper notes.
  // Source TodAnimateCurve(180, 0, counter, 255, 0): full white/black at
  // show, fading to 0 — so the 1s board-white hold hands off seamlessly.
  const a = Math.max(0, Math.min(180, G.awardT | 0));
  if (a > 0) {
    ctx.fillStyle = note ? `rgba(0,0,0,${(a / 180).toFixed(3)})` : `rgba(255,255,255,${(a / 180).toFixed(3)})`;
    ctx.fillRect(0, 0, 800, 600);
  }
}

// ---------- screens ----------
async function boot() {
  const o = SAVE.getOptions();
  G.optMusic = o.music; G.optSfx = o.sfx;
  setMusicVolume(o.music); setSfxVolume(o.sfx);
  // TitleScreen: the first draw is a black frame that boots the loading
  // thread (WAITING_FOR_FIRST_DRAW) — assets stream in behind the bar.
  G.screen = "title"; window.__pvz.screen = "title";
  // Browsers block audio before the first gesture — retry the wanted track.
  const unlock = () => unlockMusic();
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  requestAnimationFrame(frame);
  startTitleLoad();
}
// TitleScreen loading bar (TitleScreen.cpp:18-20): dirt base + grass fill,
// 314px wide. The bar fills from REAL loader progress and auto-advances.
const TITLE_BAR_W = 314;
const TITLE_IMAGES = "CherryBomb_Explosion_Top.png,CobCannon_popcorn.png,FlagMeter.png,FlagMeterLevelProgress.png,FlagMeterParts.png,LoadBar_dirt.png,LoadBar_grass.png,Night_grave_graphic.png,PopCap_Logo.png,ProjectileCactus.png,ProjectilePea.png,ProjectileSnowPea.png,Projectile_star.png,PvZ_Logo.png,SeedBank.png,SeedChooser_Background.png,SeedChooser_Button.png,SeedChooser_Button2.png,SeedChooser_Button2_Glow.png,SeedChooser_Button_Disabled.png,SeedChooser_Button_Glow.png,pause/button_left.png,pause/button_middle.png,pause/button_right.png,pause/button_down_left.png,pause/button_down_middle.png,pause/button_down_right.png,SeedPacketSilhouette.png,SeedPacketSilhouetteBank.png,SeedPacket_Larger.png,Almanac_PlantBack.jpg,Almanac_ZombieBack.jpg,Almanac_IndexBack.jpg,Almanac_GroundDay.png,Almanac_GroundNight.png,Almanac_GroundRoof.png,Almanac_GroundPool.png,Almanac_GroundNightPool.png,Almanac_GroundIce.png,Almanac_PlantCard.png,Almanac_ZombieCard.png,Almanac_ZombieWindow.png,Almanac_ZombieWindow2.png,Almanac_ZombieBlank.png,Almanac_Imitater.png,Almanac_CloseButton.png,Almanac_CloseButtonHighlight.png,Almanac_IndexButton.png,Almanac_IndexButtonHighlight.png,SelectorScreen_Almanac.png,SelectorScreen_AlmanacHighlight.png,SelectorScreen_Help1.png,SelectorScreen_Help2.png,SelectorScreen_LevelNumbers.png,SelectorScreen_Options1.png,SelectorScreen_Options2.png,SelectorScreen_Quit1.png,SelectorScreen_Quit2.png,SelectorScreen_Store.png,SelectorScreen_StoreHighlight.png,SelectorScreen_ZenGarden.png,SelectorScreen_ZenGardenHighlight.png,Shovel.png,ShovelBank.png,Shovel_hi_res.png,Shovel_hi_res_retail.png,SunBank.png,Sunflower_trophy.png,Tombstone_mounds.png,Tombstones.png,ZombieNote1.png,ZombieNote2.png,ZombieNote3.png,ZombieNote4.png,ZombieNoteHelp.png,ZombieNoteSmall.png,Taco.png,awardscreen_back.png,background1.png,background1unsodded.png,background2.png,background3.png,background4.png,background5.png,background6boss.png,background7.png,background8.png,button_down_left.png,button_down_middle.png,button_down_right.png,button_left.png,button_middle.png,button_right.png,crater.png,dialog_bigbottomleft.png,dialog_bigbottommiddle.png,dialog_bigbottomright.png,dialog_bottomleft.png,dialog_bottommiddle.png,dialog_bottomright.png,dialog_header.png,dialog_topleft.png,dialog_topmiddle.png,dialog_topright.png,dirtbig.png,dirtsmall.png,ice.png,lock.png,lock_open.png,notescreen-day.png,notescreen-night.png,options_backtogamebutton0.png,options_backtogamebutton2.png,options_checkbox0.png,options_checkbox1.png,options_menuback.png,options_sliderknob2.png,options_sliderslot.png,packet_plants.png,pea_shadows.png,plantshadow.png,plantspeechbubble.png,pool.png,pool_night.png,seeds.png,sod1row.png,sod3row.png,titlescreen.png,trophy.png,ZombieNote.png".split(",");
const TITLE_MENU = "SelectorScreen_Adventure_button.png,SelectorScreen_Adventure_highlight.png,SelectorScreen_BG.png,SelectorScreen_BG_Center.png,SelectorScreen_BG_Left.png,SelectorScreen_BG_Right.png,SelectorScreen_Challenges_button.png,SelectorScreen_Challenges_highlight.png,SelectorScreen_Shadow_Adventure.png,SelectorScreen_Shadow_Challenge.png,SelectorScreen_Shadow_StartAdventure.png,SelectorScreen_Shadow_Survival.png,SelectorScreen_StartAdventure_Button1.png,SelectorScreen_StartAdventure_Highlight.png,SelectorScreen_Survival_button.png,SelectorScreen_Survival_highlight.png,SelectorScreen_Vasebreaker_button.png,SelectorScreen_WoodSign1.png,SelectorScreen_WoodSign2.png,SelectorScreen_WoodSign2_press.png,SelectorScreen_WoodSign3.png,SelectorScreen_vasebreaker_highlight.png".split(",");
const TITLE_REANIMS = "Blover,Cabbagepult,Cactus,Caltrop,CherryBomb,Chomper,Coffeebean,Coin_gold,Coin_silver,Cornpult,Crazydave,Diamond,Digger_rising_dirt,DoomShroom,FinalWave,Fumeshroom,Garlic,GatlingPea,Gravebuster,Hammer,Hypnoshroom,Iceshroom,Jalapeno,LawnMowedZombie,LawnMower,Lilypad,Magnetshroom,Marigold,Melonpult,PeaShooter,PeaShooterSingle,Plantern,PoolCleaner,Pot,PotatoMine,Puff,Puffshroom,Pumpkin,Rake,RoofCleaner,ScaredyShroom,Seashroom,SelectorScreen,SnowPea,SplitPea,Squash,Starfruit,StartReadySetPlant,Sun,SunFlower,Sunshroom,Tallnut,Tanglekelp,ThreePeater,Torchwood,Umbrellaleaf,Wallnut,WinterMelon,Z,Zombie,Zombie_Charred,Zombie_Charred_Digger,Zombie_FlagPole,Zombie_balloon,Zombie_bobsled,Zombie_boss,Zombie_bungi,Zombie_catapult,Zombie_dancer,Zombie_digger,Zombie_football,Zombie_gargantuar,Zombie_hand,Zombie_imp,Zombie_jackbox,Zombie_ladder,Zombie_paper,Zombie_pogo,Zombie_polevaulter,Zombie_snorkle,Zombie_surprise,Zombie_yeti,Zombie_zamboni,ZombiesWon,fire,splash,zombie_dolphinrider,zombie_jackson".split(",");
let titleLoadStarted = false;
async function startTitleLoad() {
  // LawnApp::LoadingThreadProc — every image, menu sprite, reanim def
  // (atlas+map come along), font strip and sound streams in here; the title
  // bar tracks it and the screen auto-advances when the bar fills.
  if (titleLoadStarted) return;
  titleLoadStarted = true;
  const ordered = ["titlescreen.png", "PvZ_Logo.png", "LoadBar_dirt.png", "LoadBar_grass.png",
    ...TITLE_IMAGES.filter((f) => f !== "titlescreen.png" && f !== "PvZ_Logo.png" && f !== "LoadBar_dirt.png" && f !== "LoadBar_grass.png")];
  G.loadTotal = ordered.length + TITLE_MENU.length + TITLE_REANIMS.length + 3;
  G.loadDoneCount = 0;
  const bump = () => { G.loadDoneCount++; };
  const batch = async (items, fn) => {
    for (let i = 0; i < items.length; i += 6) {
      await Promise.all(items.slice(i, i + 6).map(async (it) => { try { await fn(it); } catch (e) { /* missing art: skip */ } bump(); }));
    }
  };
  await batch(ordered, (f) => needImages([f]));
  if (!libs.menu) libs.menu = {};
  await batch(TITLE_MENU, async (f) => { if (!libs.menu[f]) libs.menu[f] = await loadImage("src/assets/menu/" + f); });
  await batch(TITLE_REANIMS, (n) => getReanim(n));
  try { await loadFonts(); } catch (e) { console.error("fonts failed to load", e); }
  bump();
  try { preloadAllSounds(); } catch (e) { /* no audio device */ }
  bump();
  try { preloadMusic(); } catch (e) { /* no audio device */ }
  bump();
  G.loadDone = true;
  G.loadDoneAge = G.titleAge;
}
function bounceOut(t) {
  t = Math.max(0, Math.min(1, t));
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
  return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
}
// Title logo drop: -150 -> 10 ease-in (counter 100->60), bounce 10 -> 15
// (counter 60->50), resting at 15 (TitleScreen::Draw 142-151).
function titleLogoY() {
  const age = G.titleAge;
  if (age < 40) { const t = age / 40; return -150 + 160 * t * t; }
  if (age < 50) return 10 + 5 * bounceOut((age - 40) / 10);
  return 15;
}
// Title bar resting spot (source buttonY settles at 529, bar 17px above,
// nudged +4px below that — the fill sat slightly high over the paint).
const TITLE_BAR_Y = 517;
async function needMenuImages() {
  // Tombstone button art (user-supplied main.zip extractions, drawn by
  // drawSignBtn + the woodsign change-user press variant).
  if (!libs.menu) libs.menu = {};
  const M = libs.menu;
  const load = async (f) => { if (!M[f]) { try { M[f] = await loadImage("src/assets/menu/" + f); } catch (e) { M[f] = null; } } return M[f]; };
  await Promise.all([
    "SelectorScreen_Adventure_button.png", "SelectorScreen_Adventure_highlight.png",
    "SelectorScreen_StartAdventure_Button1.png", "SelectorScreen_StartAdventure_Highlight.png",
    "SelectorScreen_Survival_button.png", "SelectorScreen_Survival_highlight.png",
    "SelectorScreen_Challenges_button.png", "SelectorScreen_Challenges_highlight.png",
    "SelectorScreen_Vasebreaker_button.png", "SelectorScreen_vasebreaker_highlight.png",
    "SelectorScreen_WoodSign1.png", "SelectorScreen_WoodSign2_press.png",
  ].map(load));
  return M;
}

// TitleScreen::Draw (TitleScreen.cpp:136-179) — the loading screen: 1:1
// titlescreen, the PvZ logo dropping in at its natural 700x113 size, and the
// LoadBar_grass fill clipped to the loading width. No dirt back, no
// click-to-start, no slide-in: the screen auto-advances (LoadingCompleted)
// once the bar fills. Deviations: the dirt back art is blank, and the
// sod-rolling tip cap + sprout/zombie-head pop reanims have no art in the
// repo, so the bar is a static clipped grass fill with no pops.
function drawTitle() {
  const ts = libs.images["titlescreen.png"];
  if (ts) ctx.drawImage(ts, 0, 0);
  else { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 800, 600); return; }
  const logo = libs.images["PvZ_Logo.png"];
  if (logo) ctx.drawImage(logo, Math.round(400 - logo.width / 2), Math.round(titleLogoY()));
  const grass = libs.images["LoadBar_grass.png"];
  if (!grass) return;
  // Resting spot, no slide-in: source buttonY settles at 529, bar 17px above.
  const barX = Math.round(399 - grass.width / 2);
  const gy = TITLE_BAR_Y;
  const w = Math.max(0, Math.min(TITLE_BAR_W, G.barW));
  if (w >= TITLE_BAR_W) ctx.drawImage(grass, barX, gy);
  else if (w > 0) {
    ctx.save();
    ctx.beginPath(); ctx.rect(barX, gy, w, grass.height); ctx.clip();
    ctx.drawImage(grass, barX, gy);
    ctx.restore();
  }
}

// UserDialog / NewUserDialog popups (LawnDialog over the menu — the dialog is
// the top layer, above the woodsign, welcome name and buttons).
function drawUserPopup() {
  const g = userPopupGeom();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, W, H);
  if (G.userPopup === "create" || G.userPopup === "rename") {
    // NewUserDialog: LawnDialog(OK_CANCEL) + edit box (max 12, width-checked
    // against BRIANNETOD16 220px) + CalcSize(110, 40) + 40px preferred bump.
    const n = g.name;
    drawDialog9(n.x, n.y, n.w, n.h);
    drawText(ctx, "DWARF24", G.userPopup === "create" ? "NEW USER" : "RENAME USER", n.x + n.w / 2, n.y + 43, { align: "center", color: "#fff" });
    drawText(ctx, "BRIANNE16", "Please enter your name:", n.x + n.w / 2, n.y + 84, { align: "center", color: "#fff" });
    ctx.fillStyle = "#000";
    ctx.fillRect(n.box.x, n.box.y, n.box.w, n.box.h);
    ctx.strokeStyle = "#c99a5b"; ctx.lineWidth = 2;
    ctx.strokeRect(n.box.x, n.box.y, n.box.w, n.box.h);
    drawText(ctx, "BRIANNE16", (G.nameEdit || "") + "_", n.box.x + 10, n.box.y + 20, { color: "#ff0" });
    if (G.popupErr) drawText(ctx, "BRIANNE16", G.popupErr, n.x + n.w / 2, n.y + n.h - 22, { align: "center", color: "#f66" });
    drawWoodButton(n.ok, "OK");
    if (!namePopupSoloOk()) drawWoodButton(n.cancel, "CANCEL");
    return;
  }
  // UserDialog: "[WHO_ARE_YOU]" + ListWidget (BRIANNETOD16, 24px rows,
  // centered) + RENAME/DELETE above the OK/CANCEL footer (mTallBottom).
  drawDialog9(g.x, g.y, g.w, g.h);
  drawText(ctx, "DWARF24", "Who are you?", g.x + g.w / 2, g.y + 37, { align: "center", color: "#fff" });
  const n = G.userRows.length + (G.userCreate ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const r = g.row(i);
    const isCreate = i === G.userRows.length && G.userCreate;
    const label = isCreate ? "+ Create new user" : G.userRows[i].label;
    if (i === G.userSel) {
      ctx.fillStyle = "rgb(20,180,15)"; // gUserListWidgetColors select
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    drawText(ctx, "BRIANNE16", label, r.x + r.w / 2, r.y + r.h - 11, {
      align: "center", color: i === G.userSel ? "#fff" : "rgb(235,225,180)",
    });
  }
  if (G.popupErr) drawText(ctx, "BRIANNE16", G.popupErr, g.x + g.w / 2, g.y + g.h - 20, { align: "center", color: "#f66" });
  drawWoodButton(g.rename, "RENAME");
  drawWoodButton(g.del, "DELETE");
  drawWoodButton(g.ok, "OK");
  drawWoodButton(g.cancel, "CANCEL");
}

function drawMenu() {
  const R = menuRects();
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  // GameSelector::Draw 488-493 — BG composite (group 1), then the cloud
  // sweeps, then everything else (group 0). DrawOverlay order after that:
  // zombie hand, grass tufts, flowers.
  if (G.menuReanim) {
    G.menuReanim.draw(ctx, 0, 0, 1);
    for (const cr of G.menuClouds) cr.draw(ctx, 0, 0);
    G.menuReanim.draw(ctx, 0, 0, 0);
  }
  else drawCover(libs.images["background1.png"]);
  if (G.menuPhase === "open") {
    // SELECTOR_OPEN (GameSelector::Draw 495-517 + button visibility): the
    // small buttons ride in with BG_Right — options/help/quit as plain
    // sliding images, zen/store/almanac as live (but not yet clickable)
    // buttons. Tombstone art slides via the reanim's own sign tracks until
    // finishMenuOpen swaps in the buttons — but the tracks carry no lock
    // tint, so locked tombstones would flash full-color (unlocked-looking)
    // mid-slide. Source tints the tracks grey up front (SyncButtons
    // 383-388: mTrackColor = the button's COLOR_BKG); the port has no
    // per-track tint, so syncMenuVariant hides the locked tracks at creation
    // and the greyed button art rides at their live track positions instead
    // (same art, same grey, scale 1 — seamless at handover).
    if (R.zen) drawSmallBtn(R.zen);
    if (R.almanac) drawSmallBtn(R.almanac);
    if (R.store) drawSmallBtn(R.store);
    drawSmallBtn(R.options);
    drawSmallBtn(R.help);
    drawSmallBtn(R.quit);
    for (const s of R.locked) if (s.locked) drawSignBtn(s, true, false);
  }
  if (G.menuPhase !== "open") {
    // Tombstone signs (buttons take over from the reanim after anim_open):
    // your main.zip button art, hover highlight on hover. Locked modes draw
    // the same art greyed (source COLOR_BKG) — no veil rect, no lock icon.
    // Adventure flashes purple while the hand rises (GameSelector::Update 731).
    const flash = !!(G.menuStarting && G.menuStarting % 20 < 10);
    drawSignBtn(R.adv, false, flash);
    for (const s of R.locked) drawSignBtn(s, s.locked, false);
    // Small DialogButtons at their tracked positions. Almanac/Store/Zen are
    // mVisible=false until unlocked — hidden entirely, never greyed.
    if (R.zen) drawSmallBtn(R.zen);
    if (R.almanac) drawSmallBtn(R.almanac);
    if (R.store) drawSmallBtn(R.store);
    drawSmallBtn(R.options);
    drawSmallBtn(R.help);
    drawSmallBtn(R.quit);
    // Change-user: woodsign2 press variant on hover (SetImageOverride WOODSIGN2_PRESS).
    // Disabled (like every button) once the adventure starts — no hover response.
    // Also no hover while the options dialog (or anything else) covers the menu.
    // And none while the modal user dialog is up (it eats all menu clicks).
    const chHov = !G.menuStarting && G.screen === "menu" && !G.userPopup && hovered(R.change);
    if (chHov) {
      const p = Mimg("SelectorScreen_WoodSign2_press.png");
      const ws = trackPos("woodsign2");
      if (p) ctx.drawImage(p, ws.x, ws.y);
    }
    drawWelcomeName(chHov);
    drawLevelNumbers(R);
    drawMenuTrophy();
  }
  if (G.handReanim) {
    // GameSelector::Draw 624-630: the hand draws clipped to (0,0,800,560);
    // rock tracks ignore the clip, so they draw unclipped first (group 1).
    G.handReanim.draw(ctx, 0, 0, 1);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, 800, 560); ctx.clip();
    G.handReanim.draw(ctx, 0, 0, 0);
    ctx.restore();
  }
  // GameSelector::DrawOverlay 631-633 — grass tufts, then the flowers.
  if (G.menuLeaf) G.menuLeaf.draw(ctx, 0, 0);
  for (const fr of G.menuFlowers) fr.draw(ctx, 0, 0);
  if (G.msg) {
    drawText(ctx, "BRIANNE16", G.msg, 400, 581, { align: "center", color: "#ff0" });
  }
  // Modal user dialog is the very top layer: dim + panel above everything,
  // including the DrawOverlay grass tufts and flowers (Sexy WidgetManager
  // modal focus draws over DrawOverlay — before this, the dim sat underneath
  // the animated grass/flowers so they played over the darkened dialog).
  if (G.userPopup) drawUserPopup();
}
// Tombstone sign button: your main.zip button art, highlight art on hover.
// Locked modes draw the same art greyed (source COLOR_BKG 128) — no veil
// rect, no lock icon. While the hand rises, the adventure sign flashes the
// purple highlight art (GameSelector::Update 731: COLOR_BKG alternates
// 80,80,80 / white on the %20<10 cadence; the disabled button paints its
// over-image) instead of dimming.
function drawSignBtn(s, locked, flash) {
  const b = Mimg(s.img) || libs.images[s.img];
  if (!b) return;
  const h = Mimg(s.hi) || libs.images[s.hi];
  // No hover while the selector is still opening either (source keeps the
  // buttons mouse-invisible until SELECTOR_OPEN completes — same gate as
  // the small buttons below). No hover while a modal user dialog is up
  // (the dialog eats all menu clicks, so buttons behind it must stay unlit).
  const hov = !locked && !flash && !G.menuStarting && G.menuPhase !== "open" && G.screen === "menu" && !G.userPopup && hovered(s);
  ctx.save();
  if (locked) { ctx.filter = "grayscale(0.9) brightness(0.7)"; ctx.drawImage(b, s.x, s.y); }
  else if (flash) ctx.drawImage(h || b, s.x, s.y);
  else ctx.drawImage((hov && h) || b, s.x, s.y);
  ctx.restore();
}
// Small DialogButton: your main.zip art at mX+mButtonOffsetX, highlight art
// on hover.
function drawSmallBtn(s) {
  const b = libs.images[s.img];
  if (!b) return;
  const ix = s.x + (s.ix || 0), iy = s.y + (s.iy || 0);
  const h = libs.images[s.hi];
  // No hover while the selector is still opening (source keeps the buttons
  // mouse-invisible until SELECTOR_OPEN completes). No hover while another
  // screen sits on top (options dialog draws the menu behind it — buttons
  // back there stay unlit, and anything lit goes dark the moment it opens).
  // Same for the modal user dialog (it eats all menu clicks).
  const hov = !G.menuStarting && G.menuPhase !== "open" && G.screen === "menu" && !G.userPopup && hovered(s) && h;
  ctx.drawImage(hov || b, ix, iy);
}
// GameSelector::Draw 519-532 — "<name>!" in BRIANNETOD16 (255,245,200) on the
// woodsign1 plank. Source draws the string through the woodsign1 attachment
// matrix with offset (170.5 - w/2, 102.5), so the name rides the board's
// animation — anchored to the live track (rest pose 22,-8) here. (An earlier
// +4px nudge below the source 102.5 was compensating the old glyph placement;
// reverted now that placement is source-exact.)
function drawWelcomeName(hi) {
  const cur = SAVE.currentUser();
  if (!cur?.name) return;
  const label = cur.name + "!";
  const w = textWidth("BRIANNE16", label);
  const ws = trackPos("woodsign1");
  drawText(ctx, "BRIANNE16", label, ws.x + 148.5 - w / 2, ws.y + 110.5, { color: hi ? "#fff8dc" : "#fff5c8" });
}
// GameSelector::DrawOverlay 580-615 — stage/sub level-number cels on the
// adventure sign (SelectorScreen_LevelNumbers strip, 10 cels).
function drawLevelNumbers(R) {
  if (R.fresh) return;
  const ln = libs.images["SelectorScreen_LevelNumbers.png"];
  if (!ln) return;
  const celW = ln.width / 10, celH = ln.height;
  const cel = (d, x, y) => ctx.drawImage(ln, d * celW, 0, celW, celH, x, y, celW, celH);
  const bg = trackPos("SelectorScreen_BG_Right");
  const stage = Math.floor((R.lv - 1) / 10) + 1, sub = R.lv - (stage - 1) * 10;
  // Nudged +2px below the source offsets — the numbers sat slightly high on
  // the tombstone art.
  cel(stage, bg.x + 486, bg.y + 127);
  if (sub < 10) cel(sub, bg.x + 504, bg.y + 130);
  else { cel(1, bg.x + 504, bg.y + 130); cel(0, bg.x + 513, bg.y + 131); }
}
// GameSelector::Draw 534-547 — sunflower trophy on BG_Left for finished players.
function drawMenuTrophy() {
  if (!SAVE.hasFinishedAdventure()) return;
  const tr = libs.images["Sunflower_trophy.png"];
  if (!tr) return;
  const bg = trackPos("SelectorScreen_BG_Left");
  ctx.drawImage(tr, bg.x + 10, bg.y + 390);
}

function drawHelp() {
  // GameSelector_Help -> KillGameSelector + ShowAwardScreen(AWARD_HELP_ZOMBIENOTE)
  // (GameSelector.cpp:1173-1174): the help screen IS that paper note
  // (AwardScreen 221-226) — the day-lawn fullscreen art behind (the port's
  // notescreen-day stand-in for the retail 3.5x BACKGROUND1 zoom), the
  // ZombieNote sheet at (80,80), the retail help ink at (131,132), no gold
  // title. The start button reads MAIN MENU (121-126: menu button hidden)
  // at the paper-note (324,520,156,42) with the chooser-button art + tap.
  const bg = libs.images["notescreen-day.png"];
  if (bg && bg.width) ctx.drawImage(bg, 0, 0);
  else { ctx.fillStyle = "#2a4d1e"; ctx.fillRect(0, 0, 800, 600); }
  const [pcv, icv] = bakedNoteImages("ZombieNoteHelp.png");
  if (pcv) ctx.drawImage(pcv, 80, 80);
  else { const zn = libs.images["ZombieNote.png"]; if (zn) ctx.drawImage(zn, 80, 80); }
  const inkImg = libs.images["ZombieNoteHelp.png"];
  if (icv) { ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.drawImage(icv, 131, 132); ctx.restore(); }
  else if (inkImg && inkImg.width) ctx.drawImage(inkImg, 131, 132);
  const sr = { x: 324, y: 520, w: 156, h: 42 };
  const sb = libs.images["SeedChooser_Button.png"];
  if (sb && sb.width) ctx.drawImage(sb, sr.x, sr.y);
  const sg = libs.images["SeedChooser_Button_Glow.png"];
  if (hovered(sr) && sg && sg.width) ctx.drawImage(sg, sr.x, sr.y);
  drawText(ctx, "DWARF15", "Main Menu", sr.x + sr.w / 2, sr.y + 27, { align: "center", color: "#d59f2b" });
  // Fade-in veil (333-335): black for paper notes (180 -> 0).
  const a = Math.max(0, Math.min(180, G.helpT | 0));
  if (a > 0) {
    ctx.fillStyle = `rgba(0,0,0,${(a / 180).toFixed(3)})`;
    ctx.fillRect(0, 0, 800, 600);
  }
}

// Main-menu options widget geometry (NewOptionsDialog::Resize 142-166,
// mFromGameSelector branch 154-160: dialog origin == PAUSE_OPT (CenterDialog
// over the 423x498 menuback), sliders +5/+10, checkboxes +15/+20).
function optSliderRect(id) {
  const o = PAUSE_OPT;
  const r = id === "music" ? { x: 199, y: 121 } : { x: 199, y: 153 };
  return { x: o.x + r.x, y: o.y + r.y, w: PAUSE_SLIDER_W, h: 40 };
}
function optWidgetAt(p, armDrag = false) {
  const o = PAUSE_OPT;
  const inR = (r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  for (const id of ["music", "sfx"]) {
    const r = optSliderRect(id);
    if (inR(r)) {
      // Slider::MouseDown (79-97): thumb grabs into a drag, else a bar jump.
      const tx = r.x + pauseSliderVal(id) * (PAUSE_SLIDER_W - PAUSE_KNOB_W);
      if (p.x >= tx && p.x < tx + PAUSE_KNOB_W) {
        if (armDrag) G.sliderDrag = { id, value: pauseSliderVal(id), relX: p.x - tx, originX: r.x };
        return "d" + id; // drag key: release is a no-op (already applied)
      }
      return "s" + id;
    }
  }
  const W = (rx, ry, w, h, id) => ({ id, r: { x: o.x + rx, y: o.y + ry, w, h } });
  for (const b of [W(284, 226, 46, 45, "fullscreen"), W(283, 190, 46, 45, "accel"),
      W(30, 381, 360, 100, "ok")])
    if (inR(b.r)) return b.id;
  return null;
}
function activateOptionsWidget(k) {
  // NewOptionsDialog::ButtonPress (290-293): dialog buttons use GRAVEBUTTON.
  if (k === "ok") { playSfx("gravebutton"); enterMenu(); return; } // ID_OK: KillDialog + ShowGameSelector
  if (k === "fullscreen") { // MakeNewCheckbox Fullscreen (source toggles windowed)
    playSfx("gravebutton");
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
    return;
  }
  if (k === "accel") { // HardwareAcceleration: no web equivalent — inert (noted)
    playSfx("gravebutton");
    return;
  }
  return; // sliders ("s*"/"d*") already applied on press/drag
}
function drawOptions() {
  // NewOptionsDialog::Draw (169-190) from the game selector (DoNewOptions
  // with mFromGameSelector): the retail IMAGE_OPTIONS_MENUBACK tombstone at
  // the CenterDialog origin (188,51) over the live selector behind it, no
  // title (the menuback skull/menu header is the header), DWARF18 labels in
  // (107,109,145) right-aligned with the from-selector y offsets, the two
  // 135x40 sliders (3-slice 45px slot track + 22x29 knob, Slider::Draw),
  // both 42x39 checkboxes at their widget origins, and only the OK
  // back-to-game image button (29-47, 152: almanac/restart/main hidden from
  // the selector, 60-91). Hardware accel renders checked but stays inert —
  // no web equivalent (same convention as the pause dialog).
  drawMenu();
  const o = PAUSE_OPT;
  const bg = libs.images["options_menuback.png"];
  if (bg && bg.width) ctx.drawImage(bg, o.x, o.y);
  drawText(ctx, "DWARF18", "Music", o.x + 186, o.y + 145, { align: "right", color: "#6b6d91", outline: "#6b6d91" });
  drawText(ctx, "DWARF18", "Sound FX", o.x + 186, o.y + 177, { align: "right", color: "#6b6d91", outline: "#6b6d91" });
  drawText(ctx, "DWARF18", "3D Acceleration", o.x + 274, o.y + 212, { align: "right", color: "#6b6d91", outline: "#6b6d91" });
  drawText(ctx, "DWARF18", "Full Screen", o.x + 274, o.y + 249, { align: "right", color: "#6b6d91", outline: "#6b6d91" });
  // Sliders (145-146): 135x40 widgets; 3-slice 45px track + 22x29 knob.
  for (const id of ["music", "sfx"]) {
    const r = optSliderRect(id);
    const slot = libs.images["options_sliderslot.png"], knob = libs.images["options_sliderknob2.png"];
    if (slot && slot.width) {
      const ty = r.y + (40 - 10) / 2;
      ctx.drawImage(slot, 0, 0, 45, 10, r.x, ty, 45, 10);
      ctx.drawImage(slot, 45, 0, 45, 10, r.x + 45, ty, 45, 10);
      ctx.drawImage(slot, 90, 0, 45, 10, r.x + 90, ty, 45, 10);
    }
    if (knob && knob.width) {
      const v = (G.sliderDrag && G.screen === "options" && G.sliderDrag.id === id) ? G.sliderDrag.value : pauseSliderVal(id);
      ctx.drawImage(knob, r.x + v * (PAUSE_SLIDER_W - PAUSE_KNOB_W), r.y + (40 - knob.height) / 2);
    }
  }
  // Checkboxes (147-148): 42x39 art at the widget origin; fullscreen is live.
  const fsOn = !!document.fullscreenElement;
  const fsImg = libs.images[fsOn ? "options_checkbox1.png" : "options_checkbox0.png"];
  if (fsImg && fsImg.width) ctx.drawImage(fsImg, o.x + 284, o.y + 226);
  const acImg = libs.images["options_checkbox1.png"]; // 3D accelerated: always on (inert, noted above)
  if (acImg && acImg.width) ctx.drawImage(acImg, o.x + 283, o.y + 190);
  // OK back-to-game image button (29-47, 152): 360x100 art + DWARF24 white
  // label (retail 36GREENINSET, baseline 381-5+(100-8+48-1)/2 = 445; no 36px
  // strip in port — same DWARF24 stand-in + baseline as the pause dialog).
  const bb0 = libs.images["options_backtogamebutton0.png"], bb2 = libs.images["options_backtogamebutton2.png"];
  const bbDown = G.optPress === "ok";
  const bb = (bbDown ? bb2 : bb0) || bb0 || bb2;
  if (bb && bb.width) ctx.drawImage(bb, o.x + 30, o.y + 381);
  drawText(ctx, "DWARF24", "OK", o.x + 30 + 180 - 2, o.y + 381 + 48 + (bbDown ? 1 : 0),
    { align: "center", color: "#fff" });
}

// ---------- Almanac (Lawn/Widget/AlmanacDialog.cpp, full port) ----------
// Suburban Almanac: index / plants / zombies pages with live reanim previews,
// retail art, positions, sounds and gating. The ctor's choose-your-seeds tune
// is replaced by the user-attached SeedShopZen track (see updateMusic).
// NUM_ALMANAC_SEEDS 49 (seeds 0..48), NUM_ALMANAC_ZOMBIES 26 (idx 0..25).
const ALM_CLOSE = { x: 676, y: 567, w: 89, h: 26 };
const ALM_INDEX = { x: 32, y: 567, w: 164, h: 26 };
const ALM_PLANTBTN = { x: 130, y: 345, w: 156, h: 42 };
const ALM_ZOMBIEBTN = { x: 487, y: 345, w: 210, h: 48 };
const ALM_PAGE = { INDEX: 0, PLANTS: 1, ZOMBIES: 2 };
// Almanac screen positions (AlmanacDialog.h 11-16).
const ALM_PLANT_X = 578, ALM_PLANT_Y = 140;
const ALM_ZOMBIE_X = 559, ALM_ZOMBIE_Y = 175;
const ALM_IDX_PLANT_X = 167, ALM_IDX_PLANT_Y = 255;
const ALM_IDX_ZOMBIE_X = 535, ALM_IDX_ZOMBIE_Y = 215;
// Board::IsZombieTypeSpawnedOnly: types that never spawn naturally (backup
// dancers are summoned, bobsleds ride in on ice, imps are thrown) — on the
// level they unlock they only show once defeated (AlmanacDialog 579).
const ALM_SPAWNED_ONLY = new Set(["backup", "bobsled", "imp"]);
// ZombieType order == ORDER (ConstEnums.h ZombieType: INVALID -1, NORMAL 0 ..
// BOSS 25), so almanac idx maps straight onto the roster key.
const almZombieKey = (idx) => ORDER[idx];
// LawnApp::HasSeedType (LawnApp.cpp:2329): trial-locked jalapeno+ never
// applies (no trial in this port); store upgrades/imitater (40..48) need
// purchases (no store in scope) so they never show; the rest unlock with the
// adventure level (GetSeedsAvailable == seedsAvailableFor here).
function almHasSeedType(seed) {
  if (seed < 0 || seed > 48) return false;
  if (seed >= 40) return false; // gatling/upgrades/imitater purchases (untracked, never owned)
  const cur = SAVE.currentUser();
  const lv = Math.min(50, cur?.level ?? 1);
  return seed < seedsAvailableFor(lv, !!cur?.finished);
}
// LawnApp::SeedTypeAvailable (2375): gatling additionally needs its purchase.
function almSeedAvailable(seed) {
  if (seed === 40) return false; // STORE_ITEM_PLANT_GATLINGPEA (untracked)
  return almHasSeedType(seed);
}
// AlmanacDialog::ZombieIsShown (403A10).
function almZombieShown(idx) {
  const cur = SAVE.currentUser();
  const lv = Math.min(50, cur?.level ?? 1), fin = !!cur?.finished;
  const type = almZombieKey(idx);
  if (type === "yeti") return canSpawnYetis(fin, lv) || almZombieSilhouette(idx);
  if (fin) return true; // finished adventure shows every zombie
  const start = ALMANAC_ZOMBIES[idx].start;
  if (start > lv) return false;
  if (start !== lv) return true;
  return !ALM_SPAWNED_ONLY.has(type) || SAVE.hasDefeatedZombie(idx);
}
// AlmanacDialog::ZombieHasSilhouette (402C-ish): only the yeti ever hides
// behind a silhouette — while it can't spawn yet but is known (finished or
// past its 4-10 start). Silhouettes draw solid black with "???" for a name.
function almZombieSilhouette(idx) {
  if (almZombieKey(idx) !== "yeti") return false;
  const cur = SAVE.currentUser();
  const lv = Math.min(50, cur?.level ?? 1), fin = !!cur?.finished;
  if (canSpawnYetis(fin, lv)) return false;
  return fin || lv > ROSTER.yeti.start;
}
// AlmanacDialog::ZombieHasDescription (403B30). The yeti's >=2-completions
// branch is unmappable (profiles track a boolean finished), so a second-week
// yeti falls through to the start/defeated rule like any other zombie.
function almZombieDescribed(idx) {
  const cur = SAVE.currentUser();
  const lv = Math.min(50, cur?.level ?? 1), fin = !!cur?.finished;
  if (almZombieKey(idx) === "yeti") {
    if (!canSpawnYetis(fin, lv)) return false;
  } else if (fin) return true;
  const start = ALMANAC_ZOMBIES[idx].start;
  return start <= lv && (start !== lv || SAVE.hasDefeatedZombie(idx));
}
// Seed grid position (AlmanacDialog::GetSeedPosition 516): imitater lives at
// the top-left drawing (20,23); everything else tiles 8 per row.
function almSeedPos(seed) {
  if (seed === 48) return { x: 20, y: 23 };
  return { x: (seed % 8) * 52 + 26, y: Math.floor(seed / 8) * 78 + 92 };
}
// Zombie grid position (GetZombiePosition 610): 5 per row, boss apart.
function almZombiePos(idx) {
  if (idx === 25) return { x: 192, y: 486 };
  return { x: (idx % 5) * 85 + 22, y: Math.floor(idx / 5) * 80 + 86 };
}
// SeedHitTest (403940) / ZombieHitTest (403BB0), gated to their pages.
function almSeedHit(p) {
  const A = G.almanac;
  if (!A || A.page !== ALM_PAGE.PLANTS) return -1;
  for (let s = 0; s < 49; s++) {
    if (!almSeedAvailable(s)) continue;
    const q = almSeedPos(s);
    const w = s === 48 ? 34 : 50, h = s === 48 ? 46 : 70;
    if (p.x >= q.x && p.x < q.x + w && p.y >= q.y && p.y < q.y + h) return s;
  }
  return -1;
}
function almZombieHit(p) {
  const A = G.almanac;
  if (!A || A.page !== ALM_PAGE.ZOMBIES) return -1;
  for (let i = 0; i < 26; i++) {
    const q = almZombiePos(i);
    if (p.x >= q.x && p.x < q.x + 76 && p.y >= q.y && p.y < q.y + 76) return i;
  }
  return -1;
}
// Idle-layer pick shared by the index/zombie previews: the street-preview
// rule (Zombie.cpp:969-983 + zombieInitialize specials) — idle2 @12-24 on a
// 75% roll when the track exists, else idle @12-18, random phase.
function almIdlePick(r, type) {
  let layer = null, rate = 0, hold = false;
  const phase = Math.random() * 0.99;
  if (type === "zamboni" && r.trackExists("anim_drive")) { layer = "anim_drive"; rate = 12; }
  else if (type === "bungee" && r.trackExists("anim_drop")) { layer = "anim_drop"; rate = 24; }
  else if (type === "pogo" && r.trackExists("anim_pogo")) { layer = "anim_pogo"; rate = 40; hold = true; }
  else if (type === "catapult" && r.trackExists("anim_idle")) { layer = "anim_idle"; rate = 8; }
  else if (type === "dancer" && r.trackExists("anim_moonwalk")) { layer = "anim_moonwalk"; rate = 12; }
  else if (type === "backup" && r.trackExists("anim_armraise")) { layer = "anim_armraise"; rate = 12; } // off-board backup (Zombie.cpp:595)
  else if (r.trackExists("anim_idle2") && Math.random() < 0.75) { layer = "anim_idle2"; rate = 12 + Math.random() * 12; }
  else if (r.trackExists("anim_idle")) { layer = "anim_idle"; rate = 12 + Math.random() * 6; }
  if (type === "balloon" && layer) rate = 8 + Math.random() * 2;
  if (layer) r.playReanim(layer, hold ? PLAY_ONCE_AND_HOLD : LOOP, 0, rate);
  r.animTime = hold ? 1 : phase;
}
// SetupPlant (401A30): fresh preview reanim at the almanac anchor with the
// per-seed nudge (tallnut/cobcannon/flowerpot/coffee/gravebuster).
function almSetupPlant(seed) {
  const A = G.almanac;
  if (!A) return;
  A.plant = null;
  if (seed === 48 || !PLANTS[seed]) return; // imitater/store seeds: no live plant
  try {
    const d = DEFS.get(PLANTS[seed].reanim);
    if (!d) return;
    let x = ALM_PLANT_X, y = ALM_PLANT_Y;
    if (seed === 23) y += 18; // TALLNUT
    else if (seed === 47) x -= 40; // COBCANNON
    else if (seed === 33) y -= 20; // FLOWERPOT
    else if (seed === 35) y += 20; // INSTANT_COFFEE
    else if (seed === 11) y += 55; // GRAVEBUSTER
    const r = new Reanimation(d, x, y + Plant.drawHeightOffset(null, seed, 0, 0));
    if (seed === 4 && r.trackExists("anim_armed")) r.playReanim("anim_armed", LOOP, 0, 12); // potato shows armed, like the cursor ghost
    else if (r.trackExists("anim_idle")) r.playReanim("anim_idle", LOOP, 0, 10 + Math.random() * 5); // PlantInitialize 10-15fps
    if (seed === 4 || seed === 35) r.setScale(0.8, 0.8); // potato / coffee (sim Plant 813)
    if (seed === 34) r.assignRenderGroupToPrefix("Cornpult_butter", RENDER_GROUP_HIDDEN); // butter hidden until fired (sim Plant 830)
    A.plant = r;
    // Attached heads (sim Plant 814-829): shooter bodies are bare stems — the
    // visible head is a same-def reanim riding the stem/head track.
    A.plantHeads = [];
    const pdef = PLANTS[seed];
    const mkHead = (play, on) => {
      if (!r.trackExists(on)) return;
      try {
        const hr = new Reanimation(d, r.x, r.y);
        if (!hr.trackExists(play)) return;
        hr.playReanim(play, LOOP, 0, hr.def.fps);
        hr.attachTo(r, on);
        A.plantHeads.push(hr);
      } catch (e) { /* missing art */ }
    };
    if (pdef.head) mkHead(pdef.head, pdef.stem || "anim_stem");
    for (const sp of (pdef.heads || [])) mkHead(sp.play, sp.on);
  } catch (e) { A.plant = null; }
}
// SetupZombie (401B70): fresh preview reanim at the almanac anchor.
function almSetupZombie(idx) {
  const A = G.almanac;
  if (!A) return;
  A.zombie = null; A.zombieType = idx;
  const type = almZombieKey(idx), rd = ROSTER[type];
  if (!rd) return;
  try {
    const d = DEFS.get(rd.reanim);
    if (!d) return;
    const r = new Reanimation(d, ALM_ZOMBIE_X, ALM_ZOMBIE_Y);
    concealZombieExtras(r, type, false); // ZombieInitialize armor layers (else cone+bucket+door+... all show at once)
    if (type === "flag") {
      // ZombieInitialize 512-524: the REANIM_FLAG cloth rides the flaghand track.
      try {
        const fd = DEFS.get("Zombie_FlagPole");
        const f = new Reanimation(fd, ALM_ZOMBIE_X, ALM_ZOMBIE_Y);
        if (f.trackExists("Zombie_flag")) f.playReanim("Zombie_flag", LOOP, 0, 15);
        f.attachTo(r, "Zombie_flaghand");
      } catch (e) { /* pole hand still shows */ }
    }
    almIdlePick(r, type);
    A.zombie = r;
  } catch (e) { A.zombie = null; }
}
// Cached grid thumbnails (ReanimatorCache::MakeCachedZombieFrame): STATIC
// 200x210 portraits, reanim posed at (40,40) — garg at (40,60) — on the
// frame-0 pose of the cache layer (idle; pogo on anim_pogo), with the
// SetupReanimLayers armor states (via concealZombieExtras + per-type show)
// and the flag's own REANIM_FLAG cloth ridden at the flaghand track.
function almRenderThumb(idx) {
  const type = almZombieKey(idx);
  const cv = document.createElement("canvas");
  cv.width = 200; cv.height = 210;
  const g = cv.getContext("2d");
  try {
    const rd = ROSTER[type];
    const d = DEFS.get(rd.reanim);
    const r = new Reanimation(d, 40, type === "garg" ? 60 : 40);
    const layer = type === "pogo" ? "anim_pogo" : "anim_idle";
    if (r.trackExists(layer)) r.playReanim(layer, PLAY_ONCE_AND_HOLD, 0, 12);
    r.animTime = 0;
    concealZombieExtras(r, type, false);
    if (type === "flag") {
      try {
        const fd = DEFS.get("Zombie_FlagPole");
        const f = new Reanimation(fd, 40, type === "garg" ? 60 : 40);
        if (f.trackExists("Zombie_flag")) f.playReanim("Zombie_flag", PLAY_ONCE_AND_HOLD, 0, 15);
        f.animTime = 0;
        f.attachTo(r, "Zombie_flaghand");
      } catch (e) { /* cloth missing: pole hand still shows */ }
    }
    if (type === "boss") {
      // MakeCachedZombieFrame boss branch: body at (-524,-88) on
      // anim_head_idle + the driver at (46,22), head/neck/body plates hidden.
      // Our boss def has no such tracks, so fall back to the plain pose.
      try {
        if (r.trackExists("boss_body1")) {
          r.x = -524; r.y = -88;
          if (r.trackExists("anim_head_idle")) r.playReanim("anim_head_idle", PLAY_ONCE_AND_HOLD, 0, 12);
          for (const t of ["boss_body1", "boss_neck", "boss_head2"]) r.assignRenderGroupToPrefix(t, RENDER_GROUP_HIDDEN);
        }
      } catch (e) { /* keep the plain pose */ }
    }
    r.draw(g, 0, 0);
    if (almZombieSilhouette(idx)) {
      g.globalCompositeOperation = "source-in";
      g.fillStyle = "#000";
      g.fillRect(0, 0, 200, 210);
      g.globalCompositeOperation = "source-over";
    }
  } catch (e) { /* missing art: blank window, like a hidden zombie */ }
  return cv;
}
function almBuildThumbs() {
  const A = G.almanac;
  if (!A) return;
  A.thumbs = [];
  for (let i = 0; i < 26; i++) {
    if (!almZombieShown(i)) continue;
    A.thumbs.push({ idx: i, cv: almRenderThumb(i) });
  }
}
// SetPage (401BE0): swap page, rebuild previews, flip button visibility.
function almSetPage(p) {
  const A = G.almanac;
  if (!A) return;
  A.page = p; A.plant = null; A.plantHeads = []; A.zombie = null; A.thumbs = [];
  if (p === ALM_PAGE.INDEX) {
    try {
      const d = DEFS.get(PLANTS[1].reanim);
      const r = new Reanimation(d, ALM_IDX_PLANT_X, ALM_IDX_PLANT_Y + Plant.drawHeightOffset(null, 1, 0, 0));
      if (r.trackExists("anim_idle")) r.playReanim("anim_idle", LOOP, 0, 10 + Math.random() * 5);
      A.plant = r;
    } catch (e) { A.plant = null; }
    try {
      const d = DEFS.get(ROSTER.normal.reanim);
      const r = new Reanimation(d, ALM_IDX_ZOMBIE_X, ALM_IDX_ZOMBIE_Y);
      concealZombieExtras(r, "normal", false);
      almIdlePick(r, "normal");
      A.zombie = r; A.zombieType = 0;
    } catch (e) { A.zombie = null; }
  } else if (p === ALM_PAGE.PLANTS) almSetupPlant(A.selSeed);
  else if (p === ALM_PAGE.ZOMBIES) { almSetupZombie(A.selZombie); almBuildThumbs(); }
}
// AlmanacDialog ctor (401010): music handled by updateMusic; the dialog opens
// on the index page with peashooter/normal selected.
async function enterAlmanac() {
  G.almanacReturn = (G.screen === "cutscene" || G.screen === "cutscene-standalone") ? G.screen : "menu";
  try {
    const need = new Set(["Zombie_FlagPole"]);
    for (let s = 0; s <= 40; s++) if (PLANTS[s]) need.add(PLANTS[s].reanim);
    for (const t of ORDER) if (ROSTER[t]) need.add(ROSTER[t].reanim);
    await needDefs([...need]);
  } catch (e) { /* missing reanims draw nothing */ }
  try {
    await needImages(["Almanac_PlantBack.jpg", "Almanac_ZombieBack.jpg", "Almanac_IndexBack.jpg",
      "Almanac_GroundDay.png", "Almanac_GroundNight.png", "Almanac_GroundRoof.png",
      "Almanac_GroundPool.png", "Almanac_GroundNightPool.png", "Almanac_GroundIce.png",
      "Almanac_PlantCard.png", "Almanac_ZombieCard.png", "Almanac_ZombieWindow.png",
      "Almanac_ZombieWindow2.png", "Almanac_ZombieBlank.png", "Almanac_Imitater.png",
      "Almanac_CloseButton.png", "Almanac_CloseButtonHighlight.png",
      "Almanac_IndexButton.png", "Almanac_IndexButtonHighlight.png",
      "SeedChooser_Button.png", "SeedChooser_Button_Glow.png", "particles/SeedPacketFlash.png"]);
  } catch (e) { /* missing art draws nothing */ }
  G.almanac = { page: 0, selSeed: 0, selZombie: 0, plant: null, plantHeads: [], zombie: null, zombieType: 0, thumbs: [] };
  almSetPage(ALM_PAGE.INDEX);
  G.screen = "almanac"; window.__pvz.screen = "almanac";
}
// KillAlmanacDialog: back to the opener (cutscene chooser or full menu).
async function closeAlmanac() {
  G.almanac = null;
  if (G.almanacReturn === "cutscene" || G.almanacReturn === "cutscene-standalone") {
    G.screen = G.almanacReturn; window.__pvz.screen = G.almanacReturn;
  } else {
    await enterMenu();
  }
}
// Update (401D30): tick the preview reanims + hand cursor over widgets.
function tickAlmanac() {
  const A = G.almanac;
  if (!A) return;
  if (A.plant) try { A.plant.update(); } catch (e) { /* missing art */ }
  if (A.plantHeads) for (const hr of A.plantHeads) try { hr.update(); } catch (e) { /* missing art */ }
  if (A.zombie) try { A.zombie.update(); } catch (e) { /* missing art */ }
  const p = G.mouse;
  const inR = (r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  const hot = almSeedHit(p) >= 0 || almZombieHit(p) >= 0 || inR(ALM_CLOSE) ||
    (A.page !== ALM_PAGE.INDEX && inR(ALM_INDEX)) ||
    (A.page === ALM_PAGE.INDEX && (inR(ALM_PLANTBTN) || inR(ALM_ZOMBIEBTN)));
  canvas.style.cursor = hot ? "pointer" : "default";
}
// MouseDown (403D00) + MouseUp (403C60) folded into one click: TAP on the
// plant/close/index buttons, GRAVEBUTTON on the zombie button, TAP on a new
// seed/zombie pick; then page navigation.
function handleAlmanacClick(p) {
  const A = G.almanac;
  if (!A) return;
  const inR = (r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  if (A.page === ALM_PAGE.PLANTS) {
    const s = almSeedHit(p);
    if (s >= 0 && s !== A.selSeed) { A.selSeed = s; almSetupPlant(s); playSfx("tap"); return; }
  }
  if (A.page === ALM_PAGE.ZOMBIES) {
    const z = almZombieHit(p);
    if (z >= 0 && z !== A.selZombie) { A.selZombie = z; almSetupZombie(z); playSfx("tap"); return; }
  }
  if (A.page === ALM_PAGE.INDEX) {
    if (inR(ALM_PLANTBTN)) { playSfx("tap"); almSetPage(ALM_PAGE.PLANTS); return; }
    if (inR(ALM_ZOMBIEBTN)) { playSfx("gravebutton"); almSetPage(ALM_PAGE.ZOMBIES); return; }
  } else if (inR(ALM_INDEX)) { playSfx("tap"); almSetPage(ALM_PAGE.INDEX); return; }
  if (inR(ALM_CLOSE)) { playSfx("tap"); closeAlmanac(); return; }
}
// Almanac plant/zombie shadow blob (Tod anchor rule shared with the board:
// the 86x36 blob's center sits at formula + (43,18) at any scale).
function almShadow(fx, fy, s) {
  const shadow = libs.images["plantshadow.png"];
  if (!shadow || !shadow.width) return;
  const w = shadow.width * s, h = shadow.height * s;
  ctx.drawImage(shadow, fx + shadow.width / 2 - w / 2, fy + shadow.height / 2 - h / 2, w, h);
}
// Tod inline formats (decomp-TodStringFile.cpp 11-26): every description is
// one string with {TAG} runs — brown keywords/flavor, purple nocturnal, blue
// aquatic, red stats; {SHORTLINE}/{EXTRASHORTLINE} tighten spacing; {METAL}/
// {KEYMETAL} spans hide (alpha 0, collapsing) until a magnet-shroom is owned.
const ALM_FMT_COLORS = {
  normal: "#28325a", flavor: "#8f431b", keyword: "#8f431b",
  nocturnal: "#8832aa", aquatic: "#0ba1db",
  stat: "#cc241d", metal: "#cc241d", keymetal: "#8f431b",
};
function almRichLines(text, maxW, hasMagnet) {
  const F = font("BRIANNE12");
  const lines = [];
  let runs = [], curColor = ALM_FMT_COLORS.normal, hadHidden = false, pendingGap = 0;
  const pushLine = () => {
    lines.push({ runs, gap: pendingGap, collapsed: !runs.length && hadHidden });
    runs = []; hadHidden = false; pendingGap = 0;
  };
  // Split into segments: {TAG} markers, newlines, and literal text.
  const re = /\{([A-Z_]+)\}|(\n)/g;
  let last = 0, m, hidden = false, buf = "";
  const flushBuf = () => {
    if (buf) {
      if (hidden) hadHidden = true;
      else runs.push({ text: buf, color: curColor });
      buf = "";
    }
  };
  const tag = (name) => {
    flushBuf();
    if (name === "SHORTLINE" || name === "EXTRASHORTLINE") {
      // Retail (TodDrawStringWrappedHelper): a {TAG} changes only the line-
      // spacing that the NEXT wrap advance uses — it emits no line of its own.
      // The "\n{SHORTLINE}\n" sequences in the card strings therefore produce a
      // single reduced-height gap line, not a full line plus a gap line.
      if (runs.length) pushLine(); // defensive: tags never sit mid-line in data
      pendingGap = name === "SHORTLINE" ? -9 : -14;
    } else {
      const k = name.toLowerCase();
      if (k === "metal" || k === "keymetal") hidden = !hasMagnet;
      else hidden = false;
      if (ALM_FMT_COLORS[k]) curColor = ALM_FMT_COLORS[k];
    }
  };
  while ((m = re.exec(text))) {
    if (m.index > last) buf += text.slice(last, m.index);
    if (m[2]) { flushBuf(); pushLine(); }
    else tag(m[1]);
    last = m.index + m[0].length;
  }
  buf += text.slice(last);
  flushBuf(); pushLine();
  // Word-wrap each line at maxW, keeping color runs.
  const out = [];
  for (const ln of lines) {
    if (!ln.runs.length) {
      out.push({ runs: [], h: (F ? F.lineH : 14) + (ln.collapsed ? -17 : ln.gap || 0) });
      continue;
    }
    const words = [];
    for (const r of ln.runs) for (const w of r.text.split(/\s+/).filter((w) => w.length)) words.push({ w, color: r.color });
    let cur2 = [], cw = 0, first = true;
    const flush2 = () => { if (cur2.length) { out.push({ runs: cur2, h: (F ? F.lineH : 14) + (first ? ln.gap || 0 : 0) }); first = false; } cur2 = []; cw = 0; };
    for (const { w, color } of words) {
      const ww = textWidth("BRIANNE12", (cur2.length ? " " : "") + w);
      if (cur2.length && cw + ww > maxW) flush2();
      if (cur2.length) cw += textWidth("BRIANNE12", " ");
      cur2.push({ text: (cur2.length > 1 || (cur2.length === 1 && cw > textWidth("BRIANNE12", cur2[0].text)) ? "" : "") + w, color, sp: cur2.length > 0 });
      cw += textWidth("BRIANNE12", w);
    }
    flush2();
  }
  return out;
}
// USER OVERRIDE (flavor prose flows; retail keeps every manual \n as a hard
// break, leaving stub lines like "high-fiber" / "than a" / "zombie." that
// stretch the card): newlines inside the {FLAVOR} prose section are treated
// as spaces so flavor wraps naturally at the rect width. Stat lines above
// {FLAVOR} (Damage/Range/Usage/Special) keep their retail hard breaks, as do
// the \n{SHORTLINE}\n paragraph gaps.
function almFlowFlavor(text) {
  const i = text.indexOf("{FLAVOR}");
  if (i < 0) return text;
  return text.slice(0, i) + text.slice(i).replace(/\n/g, " ");
}
// TodDrawStringWrapped subset for the almanac cards: top- or middle-anchored
// block, left/center/right aligned runs. Returns the drawn block height.
function almDrawRich(text, rx, ry, rw, rh, { color, align = "left", valign = "top", hasMagnet = false } = {}) {
  const F = font("BRIANNE12");
  if (!F) return 0;
  const lines = almRichLines(text, rw, hasMagnet);
  const totalH = lines.reduce((a, l) => a + l.h, 0);
  let y = valign === "middle" ? ry + (rh - totalH) / 2 : ry;
  for (const ln of lines) {
    if (!ln.runs.length) { y += ln.h; continue; }
    let total = 0;
    for (const r of ln.runs) total += textWidth("BRIANNE12", r.text) + (r.sp ? textWidth("BRIANNE12", " ") : 0);
    let x = align === "center" ? rx + (rw - total) / 2 : align === "right" ? rx + rw - total : rx;
    for (const r of ln.runs) {
      if (r.sp) x += textWidth("BRIANNE12", " ");
      drawText(ctx, "BRIANNE12", r.text, x, y + F.ascent, { align: "left", color: r.color });
      x += textWidth("BRIANNE12", r.text);
    }
    y += ln.h;
  }
  return totalH;
}
function almDrawImageBtn(r, label) {
  const hov = G.mouse.x >= r.x && G.mouse.x < r.x + r.w && G.mouse.y >= r.y && G.mouse.y < r.y + r.h;
  const img = libs.images[hov ? (r === ALM_CLOSE ? "Almanac_CloseButtonHighlight.png" : "Almanac_IndexButtonHighlight.png")
    : (r === ALM_CLOSE ? "Almanac_CloseButton.png" : "Almanac_IndexButton.png")];
  if (img && img.width) ctx.drawImage(img, r.x, r.y);
  drawText(ctx, "BRIANNE12", label, r.x + r.w / 2 + (r === ALM_CLOSE ? -8 : 8), r.y + r.h / 2 + 5,
    { align: "center", color: "#2a2a5a" }); // mTextOffsetX -8/+8, +1 (401010: color 42,42,90)
}
function almDrawPlantBtn() {
  const r = ALM_PLANTBTN;
  const hov = G.mouse.x >= r.x && G.mouse.x < r.x + r.w && G.mouse.y >= r.y && G.mouse.y < r.y + r.h;
  const btn = libs.images["SeedChooser_Button.png"];
  if (btn && btn.width) ctx.drawImage(btn, r.x, r.y);
  if (hov) {
    const glow = libs.images["SeedChooser_Button_Glow.png"];
    if (glow && glow.width) ctx.drawImage(glow, r.x, r.y);
  }
  drawText(ctx, "DWARF18YELLOW", ALMANAC_UI.VIEW_PLANTS, r.x + r.w / 2, r.y + r.h / 2 + 6, { align: "center", color: "#ffff00" }); // mTextOffsetY -1, user override +2
}
function drawAlmanac() {
  const A = G.almanac;
  if (!A) return;
  if (A.page === ALM_PAGE.INDEX) almDrawIndex();
  else if (A.page === ALM_PAGE.PLANTS) almDrawPlants();
  else almDrawZombies();
  // Buttons (Draw 510-513): close always; index on the sub-pages; plant +
  // zombie only on the index page (mBtnNoDraw flipping in SetPage).
  almDrawImageBtn(ALM_CLOSE, ALMANAC_UI.CLOSE_BUTTON);
  if (A.page === ALM_PAGE.INDEX) { almDrawPlantBtn(); drawStoneButton(ALM_ZOMBIEBTN.x, ALM_ZOMBIEBTN.y, ALM_ZOMBIEBTN.w, ALM_ZOMBIEBTN.h, ALMANAC_UI.VIEW_ZOMBIES, false, G.mouse.x >= ALM_ZOMBIEBTN.x && G.mouse.x < ALM_ZOMBIEBTN.x + ALM_ZOMBIEBTN.w && G.mouse.y >= ALM_ZOMBIEBTN.y && G.mouse.y < ALM_ZOMBIEBTN.y + ALM_ZOMBIEBTN.h); }
  else almDrawImageBtn(ALM_INDEX, ALMANAC_UI.ALMANAC_INDEX);
}
// DrawIndex (401E70): index back, centered title, live sunflower + zombie.
function almDrawIndex() {
  const A = G.almanac;
  const back = libs.images["Almanac_IndexBack.jpg"];
  if (back && back.width) ctx.drawImage(back, 0, 0);
  else { ctx.fillStyle = "#3a2c18"; ctx.fillRect(0, 0, 800, 600); }
  drawText(ctx, "HoT28", ALMANAC_UI.SUBURBAN_ALMANAC_INDEX, 400, 60, { align: "center", color: "#dcdcdc" });
  if (A.plant) {
    const sp = Plant.shadowSpec(1, null);
    if (sp) almShadow(A.plant.x + sp.dx, A.plant.y + sp.dy, sp.s);
    try { A.plant.draw(ctx, 0, 0); } catch (e) { /* missing art */ }
  }
  if (A.zombie) {
    const zs = zombieShadowSpec("normal", {});
    almShadow(A.zombie.x + zs.dx, A.zombie.y + zs.dy + 92, zs.s);
    try { A.zombie.draw(ctx, 0, 0); } catch (e) { /* missing art */ }
  }
}
// DrawPlants (402060).
function almDrawPlants() {
  const A = G.almanac;
  const back = libs.images["Almanac_PlantBack.jpg"];
  if (back && back.width) ctx.drawImage(back, 0, 0);
  else { ctx.fillStyle = "#3a2c18"; ctx.fillRect(0, 0, 800, 600); }
  drawText(ctx, "HoT20", ALMANAC_UI.SUBURBAN_ALMANAC_PLANTS, 400, 48, { align: "center", color: "#d59f2b" });
  const hov = almSeedHit(G.mouse);
  for (let s = 0; s < 49; s++) {
    if (!almSeedAvailable(s)) continue;
    const q = almSeedPos(s);
    if (s === 48) {
      const im = libs.images["Almanac_Imitater.png"]; // DrawImage twice in source (288-289)
      if (im && im.width) { ctx.drawImage(im, q.x, q.y); }
    } else {
      if (!PLANTS[s]) continue;
      drawPacket(q.x, q.y, 50, 70, s, { chooser: true });
      if (s === hov) {
        const fl = libs.images["particles/SeedPacketFlash.png"];
        if (fl && fl.width) ctx.drawImage(fl, q.x, q.y);
      }
    }
  }
  // Ground under the preview (40299): pool for aquatics (night pool for
  // seashroom), night for nocturnals/gravebuster/plantern, roof for pots.
  const sel = A.selSeed;
  const isNoct = [8, 9, 10, 12, 14, 15, 31, 13].includes(sel);
  let ground = "Almanac_GroundDay.png";
  if (sel === 16 || sel === 19 || sel === 43 || sel === 24) ground = sel === 24 ? "Almanac_GroundNightPool.png" : "Almanac_GroundPool.png";
  else if (isNoct || sel === 11 || sel === 25) ground = "Almanac_GroundNight.png";
  else if (sel === 33) ground = "Almanac_GroundRoof.png";
  const gr = libs.images[ground];
  if (gr && gr.width) ctx.drawImage(gr, 521, 107);
  if (A.plant) {
    const sp = Plant.shadowSpec(sel, null);
    if (sp) almShadow(A.plant.x + sp.dx, A.plant.y + sp.dy, sp.s);
    try { A.plant.draw(ctx, 0, 0); } catch (e) { /* missing art */ }
  }
  const card = libs.images["Almanac_PlantCard.png"];
  if (card && card.width) ctx.drawImage(card, 459, 86);
  const def = ALMANAC_PLANTS[sel] || ALMANAC_PLANTS[0];
  const nameKey = def.nameKey;
  drawText(ctx, "DWARF18YELLOW", ALMANAC_UI[nameKey] || nameKey, 617, 288, { align: "center", color: "#ffff00" });
  // USER OVERRIDE (retail draws the whole description at (485,309,258,230)
  // and pins Cost/Recharge at fixed y=520 below the flavor prose; the card
  // then strands short entries under a void. Here Cost/Recharge ride with the
  // stat block instead: intro + Damage/Range/Usage/Special/Toughness lines,
  // then Cost/Recharge, then the {FLAVOR} prose).
  // Retail layout (AlmanacDialog::DrawPlants): the whole description (intro +
  // stats + flavor) draws at (485,309,258,230); Cost/Recharge sit below the
  // flavor at fixed bottom rects. USER OVERRIDE is only that {FLAVOR} prose
  // newlines are flowed to spaces (retail keeps every manual \n as a hard
  // break, leaving stub lines); stat lines keep their hard breaks.
  almDrawRich(almFlowFlavor(ALMANAC_UI[nameKey + "_DESCRIPTION"] || ""), 485, 309, 258, 230, { align: "left", hasMagnet: almHasSeedType(31) });
  if (sel !== 48) {
    almDrawRich(("{KEYWORD}{COST}:{STAT} " + def.cost).split("{COST}").join(ALMANAC_UI.COST), 485, 520, 134, 50, { align: "left", hasMagnet: almHasSeedType(31) });
    const len = def.refresh === 750 ? ALMANAC_UI.WAIT_TIME_SHORT : def.refresh === 3000 ? ALMANAC_UI.WAIT_TIME_LONG : ALMANAC_UI.WAIT_TIME_VERY_LONG;
    almDrawRich(("{KEYWORD}{WAIT_TIME}:{STAT}" + len).split("{WAIT_TIME}").join(ALMANAC_UI.WAIT_TIME), 600, 520, 139, 50, { align: "right", hasMagnet: almHasSeedType(31) });
  }
}
// DrawZombies (402C00).
function almDrawZombies() {
  const A = G.almanac;
  const back = libs.images["Almanac_ZombieBack.jpg"];
  if (back && back.width) ctx.drawImage(back, 0, 0);
  else { ctx.fillStyle = "#3a2c18"; ctx.fillRect(0, 0, 800, 600); }
  drawText(ctx, "DWARF24", ALMANAC_UI.SUBURBAN_ALMANAC_ZOMBIES, 400, 54, { align: "center", color: "#00c400" });
  const hov = almZombieHit(G.mouse);
  for (const t of A.thumbs) {
    const q = almZombiePos(t.idx);
    if (!almZombieShown(t.idx)) {
      const bl = libs.images["Almanac_ZombieBlank.png"];
      if (bl && bl.width) ctx.drawImage(bl, q.x, q.y);
      continue;
    }
    const win = libs.images["Almanac_ZombieWindow.png"];
    if (win && win.width) ctx.drawImage(win, q.x, q.y);
    ctx.save();
    ctx.beginPath(); ctx.rect(q.x + 2, q.y + 2, 72, 72); ctx.clip();
    ctx.drawImage(t.cv, 0, 0, 200, 210, q.x + 1, q.y - 6, 100, 105); // DrawCachedZombie at 0.5
    ctx.restore();
    if (t.idx === hov) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter"; // DRAWMODE_ADDITIVE white 48
      ctx.globalAlpha = 48 / 255;
      if (win && win.width) ctx.drawImage(win, q.x, q.y);
      ctx.restore();
    }
    const win2 = libs.images["Almanac_ZombieWindow2.png"];
    if (win2 && win2.width) ctx.drawImage(win2, q.x, q.y);
    if (t.idx === hov) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 48 / 255;
      if (win2 && win2.width) ctx.drawImage(win2, q.x, q.y);
      ctx.restore();
    }
  }
  // Hidden (not-yet-shown) slots draw the blank in the same pass order.
  for (let i = 0; i < 26; i++) {
    if (almZombieShown(i)) continue;
    const q = almZombiePos(i);
    const bl = libs.images["Almanac_ZombieBlank.png"];
    if (bl && bl.width) ctx.drawImage(bl, q.x, q.y);
  }
  // Preview ground: ice for the machines, day otherwise (431).
  const zt = almZombieKey(A.selZombie);
  const gr = libs.images[(zt === "zamboni" || zt === "bobsled") ? "Almanac_GroundIce.png" : "Almanac_GroundDay.png"];
  if (gr && gr.width) ctx.drawImage(gr, 518, 110);
  if (A.zombie && !almZombieSilhouette(A.selZombie)) {
    // Main preview clip + per-type nudge (434-451); shadow skipped for the
    // flying/massive types like the board port's DrawShadow gate.
    const off = { zamboni: [-30, 5], garg: [0, 40], football: [-10, 0], balloon: [0, -20], bungee: [15, 0], catapult: [-10, 0], boss: [-540, -175] }[zt] || [0, 0];
    const zx = ALM_ZOMBIE_X + off[0], zy = ALM_ZOMBIE_Y + off[1];
    A.zombie.x = zx; A.zombie.y = zy;
    ctx.save();
    ctx.beginPath(); ctx.rect(zx - 42, zy - 51, 197, 187); ctx.clip();
    if (zt !== "bungee" && zt !== "boss" && zt !== "zamboni" && zt !== "catapult") {
      const zs = zombieShadowSpec(zt, {});
      almShadow(zx + zs.dx, zy + zs.dy + 92, zs.s);
    }
    try { A.zombie.draw(ctx, 0, 0); } catch (e) { /* missing art */ }
    ctx.restore();
  }
  const card = libs.images["Almanac_ZombieCard.png"];
  if (card && card.width) ctx.drawImage(card, 455, 78);
  const def = ALMANAC_ZOMBIES[A.selZombie];
  const sil = almZombieSilhouette(A.selZombie);
  drawText(ctx, "DWARF18", sil ? "???" : (ALMANAC_UI[def.nameKey] || def.nameKey), 613, 362, { align: "center", color: "#beffeb" }); // GREENINSET 190,255,235
  if (almZombieDescribed(A.selZombie)) {
    almDrawRich(almFlowFlavor(ALMANAC_UI[def.nameKey + "_DESCRIPTION"] || ""), 484, 377, 258, 170, { align: "left", hasMagnet: almHasSeedType(31) });
  } else {
    almDrawRich(ALMANAC_UI.NOT_ENCOUNTERED_YET, 484, 377, 258, 170, { align: "center", valign: "middle", hasMagnet: false });
  }
}

function drawChooserPanel(yOff = 0) {
  // SeedChooserScreen::Draw (331): the Board behind keeps drawing (the level
  // preview on the right) — this widget is only the left panel, sliding UP
  // from the bottom into place. No imitater (out of scope) and no tooltips.
  // TWO MOTIONS (CutScene 1149-1164, 1186-1198): the panel (bg, title, grid,
  // buttons) rises 516->0 while the TOP BANK ROW rides the real seed bank
  // DOWN from the top (-87->0, same window) and the Menu tab drops -50->-10
  // on its own — neither ever rises with the panel. Bank-row screen pos =
  // live bank (bankX, bankY) + slot; menu at menuY; everything else translated.
  const c = G.chooser, b = G.board;
  if (!c || !b) return;
  const cs = G.cutscene;
  const bankX = cs ? cs.seedBankX : 10, bankY = cs ? cs.seedBankY : 0;
  const menuY = cs && cs.menuY !== undefined ? cs.menuY : -10;
  ctx.save();
  ctx.translate(0, yOff);
  // Retail background, 1:1 (465x513 at 0,87 — the lawn shows to its right).
  const p = libs.images["SeedChooser_Background.png"];
  if (p && p.width) ctx.drawImage(p, 0, 87);
  else { ctx.fillStyle = "#2a1f10"; ctx.fillRect(0, 87, 465, 513); }
  // Retail title (TodDrawString DWARVENTODCRAFT18YELLOW, centered x=229).
  // Our strips are white-at-load, so the yellow comes from the draw color.
  drawText(ctx, "DWARF18YELLOW", "Choose your seeds!", 229, 110, { align: "center", color: "#ffff00" });
  // Grid shadows (349-370): unavailable slots show the silhouette; picked
  // seeds leave a dimmed copy (DrawSeedPacket grayness 55 multiply over the
  // art, cost still drawn like the live packets) at their grid spot.
  // The repo's SeedPacketSilhouette.png is a faint tan tile (alpha ~10%:
  // nearly invisible over the panel) — kept byte-identical per the repo-art
  // rule for the GRID slots. The top bank slots instead use
  // SeedPacketSilhouetteBank.png (user-directed; main.zip bytes).
  const sil = libs.images["SeedPacketSilhouette.png"];
  const N = c.seven ? 48 : 40;
  const bySeed = new Map(c.seeds.map((s) => [s.seed, s]));
  for (let i = 0; i < N; i++) {
    const gp = chooserGridPos(i, c.seven);
    const s = i < c.avail ? bySeed.get(i) : null;
    if (!s) { if (sil && sil.width) ctx.drawImage(sil, gp.x, gp.y); }
    else if (s.state !== SEED_IN_CHOOSER) {
      drawPacket(gp.x, gp.y, 50, 70, s.seed, { grey: 55, chooser: true });
    }
  }
  // Live grid seeds (383-414): IN_CHOOSER at grid pos, drawn solid or greyed
  // (391-393: not-recommended / not-allowed while in the chooser;
  // SeedNotRecommendedToPick 310-316 clears NOCTURNAL once coffee is banked).
  // IN_BANK + flyers ride the bank row below (bank pass, screen-pinned).
  // DrawSeedPacket grayness is 255 for banked seeds and flyers, and the
  // chooser's percentDark is always 0.
  const coffeeBanked = c.seeds.some((s) => s.seed === 35 && s.state === SEED_IN_BANK);
  for (const s of c.seeds) {
    if (s.state !== SEED_IN_CHOOSER) continue;
    let nr = b.seedNotRecommended(s.seed) || 0;
    if ((nr & 1) && coffeeBanked) nr &= ~1;
    drawPacket(s.x, s.y, 50, 70, s.seed, { grey: nr ? 115 : 255, chooser: true });
  }
  // LET'S ROCK (154,545 156x42): retail art, disabled until the bank is full
  // (EnableStartButton), glow art on hover, grey label while disabled.
  const full = c.inBank === c.slots;
  const rockImg = !full ? libs.images["SeedChooser_Button_Disabled.png"]
    : (hovered(CHOOSER_ROCK) && libs.images["SeedChooser_Button_Glow.png"]) || libs.images["SeedChooser_Button.png"];
  if (rockImg && rockImg.width) ctx.drawImage(rockImg, CHOOSER_ROCK.x, CHOOSER_ROCK.y);
  drawText(ctx, "HoT16", "LET'S ROCK!", CHOOSER_ROCK.x + 78, CHOOSER_ROCK.y + 28,
    { align: "center", color: full ? "#fff" : "#404040" });
  // (Menu tab now rides its own top slide in the bank pass below — NOT here.)
  // Almanac/Store Button2 pair (560,572 / 680,572, 111x26): hidden until
  // unlocked (SyncButtons CanShow*), glow on hover like the source buttons.
  const cur = SAVE.currentUser();
  const lv = Math.min(50, cur?.level ?? 1), finished = !!cur?.finished;
  const btn2 = libs.images["SeedChooser_Button2.png"];
  const btn2g = libs.images["SeedChooser_Button2_Glow.png"];
  const imgBtn = (r, label) => {
    const img = (hovered(r) && btn2g && btn2g.width ? btn2g : btn2) || btn2 || btn2g;
    if (img && img.width) ctx.drawImage(img, r.x, r.y);
    drawText(ctx, "BRIANNE12", label, r.x + r.w / 2, r.y + r.h / 2 + 5,
      { align: "center", color: "#2a2a5a" });
  };
  if (finished || lv >= 15) imgBtn(CHOOSER_ALMANAC, "[ALMANAC]");
  if (finished || lv >= 25) imgBtn(CHOOSER_STORE, "[STORE]");
  ctx.restore();
  // ---- bank-row pass (SCREEN coords — not panel-translated) ----
  // Silhouettes (372-381) + IN_BANK seeds (395-401) + flyers (407-415), all
  // pinned to the live bank (GetSeedPositionInBank 289-294): they slide DOWN
  // from the top with the real bank dial while the panel rises from below.
  // User-directed art split kept: TOP slots use SeedPacketSilhouetteBank.png
  // (main.zip bytes — the repo's tile for this asset ID is a faint ghost),
  // while the main grid above keeps the repo's SeedPacketSilhouette.png.
  const bankSil = libs.images["SeedPacketSilhouetteBank.png"] || sil;
  for (let i = 0; i < c.slots; i++) {
    const sx = bankX + packetX(c.slots, i), sy = bankY + 8;
    let filled = false;
    for (const s of c.seeds) {
      if (s.state === SEED_IN_BANK && s.idx === i) { filled = true; break; }
    }
    if (!filled && bankSil && bankSil.width) ctx.drawImage(bankSil, sx, sy);
  }
  for (const s of c.seeds) {
    if (s.state === SEED_IN_BANK) {
      drawPacket(bankX + packetX(c.slots, s.idx), bankY + 8, 50, 70, s.seed, { grey: 255, chooser: true });
    } else if (s.state === SEED_FLYING_TO_BANK || s.state === SEED_FLYING_TO_CHOOSER) {
      // No flights exist while the panel/bank move (input opens at slide
      // end; ROCK needs inFlight==0), so stored rest-frame coords are exact.
      drawPacket(s.x, s.y, 50, 70, s.seed, { grey: 255, chooser: true });
    }
  }
  // Menu stone tab: own -50->-10 slide from the top (CutScene 1151-1153),
  // drawn in the board frame that ignores widget Y (Draw 422-425) — it never
  // rises with the panel. Hit rect stays at rest (input opens at slide end).
  drawStoneButton(CHOOSER_MENU.x, menuY, CHOOSER_MENU.w, CHOOSER_MENU.h,
    "Menu", false, hovered(CHOOSER_MENU));
  // Coming-soon toasts ride over the lawn like the menu's (G.msg).
  if (G.msg) drawText(ctx, "BRIANNE16", G.msg, 400, 581, { align: "center", color: "#ff0" });
}

// ---------- main loop ----------
let last = performance.now(), acc = 0;
const TICK = 10; // 100 ticks/sec (SECONDS_PER_UPDATE)
function frame(now) {
  requestAnimationFrame(frame);
  if (G.frozen) { render(); last = now; acc = 0; return; }
  let dt = now - last; last = now;
  if (dt > 250) dt = 250;
  acc += dt * (G.fast ? 4 : 1);
  let n = 0;
  while (acc >= TICK && n++ < 40) { tick(); acc -= TICK; }
  render();
}
function tick() {
  if (G.screen === "cutscene" && G.board && G.cutscene) {
    // INTRO demo: the cutscene advances its own clock and simulates the demo
    // board; at the end the real adventure (PreNewGame ADVENTURE) begins.
    if (G.cutscene.intro) {
      G.cutscene.update();
      // Demo-board plants sway like everything else live on screen.
      try { for (const p of G.board.allPlants()) p.updateVisual(); } catch (e) { /* headless */ }
      if (G.cutscene.done && !G.introAdvancing) {
        G.introAdvancing = true; // startLevel is async: single flight only
        startLevel(1).finally(() => { G.introAdvancing = false; });
      }
    } else {
    // CutScene::Update 1408-1411: the Dave entity ticks before the clock
    // gate (enter/talk/leave/blink animate while the intro clock is frozen
    // on a message or the shovel tutorial).
    updateDaveEntity();
    G.cutscene.daveMessageActive = isDaveTalking();
    const prevT = G.cutscene.time;
    G.cutscene.update();
    // Challenge::Update via Board::Update (5933) runs in every scene, so
    // the stormy-night machine ticks through the intro even while the
    // cutscene clock is frozen on Dave/chooser/shovel (the time-stop gate
    // lives inside CutScene::Update, not Board::Update).
    if (G.board && G.board.isStormy) { try { G.board.tickIntroStorm(); } catch (e) { /* headless */ } }
    // Board::Update 5908: the coin-bank fade counts down through the
    // intro as well — frozen while the slot-offer dialog holds it up
    // (GetDialog(DIALOG_PURCHASE_PACKET_SLOT) gate).
    if (G.board && !G.daveOffer && (G.board.coinBankT | 0) > 0) G.board.coinBankT--;
    // Pool water animates through the intro too (retail's Board::Update —
    // which owns mPoolCounter + the sparkle system — runs in every scene;
    // only the cutscene *clock* freezes). Frozen under a pause dialog.
    if (G.board && !G.pauseDlg) { try { G.board.tickPoolFx(); } catch (e) { /* headless */ } }
    // Board plants sway through the intro on the engine's reanim tick —
    // visual only, so the L5 pre-plants animate during the frozen shovel
    // tutorial without shooting or producing sun (clock stays frozen).
    try { for (const p of G.board.allPlants()) p.updateVisual(); } catch (e) { /* headless */ }
    // Early-Dave edges (CutScene 1101-1116): enter at 2000, first talk at
    // 2750 once. crazyDaveTime > 0 gates to the Dave intros (L5, first-time
  // 2-1, L12 tease + pre-shop slot offers, L15, custom 3-1 warning) — silent otherwise.
    if (G.cutscene.crazyDaveTime > 0) {
      if (prevT < CutT.EarlyDaveEnterStart && G.cutscene.time >= CutT.EarlyDaveEnterStart) daveEnter();
      if (G.cutscene.daveDialogStart !== -1 && prevT < CutT.EarlyDaveEnterEnd && G.cutscene.time >= CutT.EarlyDaveEnterEnd) {
        if (!G.dave) daveEnter();
        daveTalkIndex(G.cutscene.daveDialogStart);
        G.cutscene.daveDialogStart = -1;
      }
    }
    // Sod roll start (CutScene::AnimateBoard 1210-1231): FOLEY_DIGGER + one
    // SODROLL reanim per rolling strip — L1 (0,0), L2 (0,-102)/(0,111),
    // L4 (-3,-198)/(-3,203), all at source spots — plus
    // SOD_ROLL particles (N/A: no particle system). The reanim plays its own
    // 48-frame @24fps timeline (2.0s, HOLD); the per-tick pin below keeps the
    // tube centered on the wipe edge (user fix for the baked-motion desync).
    if (G.cutscene.sodTime > 0) {
      if (prevT < CutT.RollSodStart && G.cutscene.time >= CutT.RollSodStart) {
        try {
          const lv = G.board.level;
          const spots = lv === 1 ? [[0, 0]] : lv === 2 ? [[0, -102], [0, 111]] : [[-3, -198], [-3, 203]];
          // Wipe edge each roll rides (Board::DrawBackdrop wipe rects): L1
          // sod1 (239-BOARD_OFFSET, SOD1ROW width 771); L2 BOTH rolls ride
          // the sod3 wipe (235-BOARD_OFFSET, SOD3ROW width 771) — sod1 is
          // pre-existing on L2, nothing wipes there; L4 both ride
          // the full-height bg patch (232-BOARD_OFFSET, width 773). The
          // per-tick pin below centers the tube on the edge (user fix).
          const edges = lv === 1 ? [[19, 771]] : lv === 2 ? [[15, 771], [15, 771]] : [[12, 773], [12, 773]];
          const def = DEFS.get("SodRoll");
          // Stray-frame fix (user bug report): the 48-frame @24fps timeline
          // completes in exactly the 200-tick roll window (0.005/tick), so
          // float accumulation can trip the default LOOP wrap a tick before
          // the RollSodEnd removal — flashing the roll back at the left edge
          // for a frame. HOLD parks it at the right edge until it is dropped.
          G.sodRolls = def ? spots.map(([x, y], i) => { const r = new Reanimation(def, x, y); r.loopType = PLAY_ONCE_AND_HOLD; r.edge = edges[i]; return r; }) : null;
        } catch (e) { G.sodRolls = null; }
        try { playFoleyLoop("digger"); } catch (e) { /* headless */ }
      }
      // Roll end (CutScene 1234-1237): StopFoley + the roll is dropped as the
      // sod completes (nothing parked on the finished lawn).
      if (prevT < CutT.RollSodEnd && G.cutscene.time >= CutT.RollSodEnd) {
        try { stopFoleyLoop("digger"); } catch (e) { /* headless */ }
        G.sodRolls = null;
      }
    }
    // Grave roll edge (CutScene 1243-1251) spawns GraveStoneRise systems
    // that must tick every frame like retail (Board::Update runs under the
    // intro; GridItem::Update ripens counter 0->100 the same way). The board
    // clock is frozen during the cutscene so update() never runs — tick just
    // the grave ripening + grave fx here, next to the sod-roll tick below.
    try {
      if (G.board) {
        G.board.updateGridItems();
        for (const em of G.board.graveFx) em.ok = G.board.tickGraveFx(em);
        G.board.graveFx = G.board.graveFx.filter((em) => em.ok);
      }
    } catch (e) { /* headless */ }
    if (G.sodRolls) for (const r of G.sodRolls) {
      r.update();
      // User fix (edge-centering): pin the tube's RENDERED center to the
      // wipe edge it is revealing. Two stacked offsets put the baked motion
      // off the edge: the def path itself lags the wipe increasingly
      // (~9px early, ~20px late, plus the cap's authored ±7px wobble), AND
      // drawTrack renders the cel centered at track + scale*halfCel - 0.5
      // (tube half-cel 34px, scale 0.8->0.21), so the visual center never
      // sits on the track point. r.x = edge - tubeX - tubeSX*34 + 0.5,
      // evaluated post-update so the drawn frame is exact.
      if (r.edge) {
        const tf = sodTubeFrame(r);
        r.x = r.edge[0] + r.edge[1] * (G.board.sodPosition / 1000) - tf.x - tf.sx * 34 + 0.5;
      }
    }
    if (G.readyReanim) G.readyReanim.update();
    // Board::UpdateMousePosition shovel branch (3232): hover highlight while
    // the shovel is armed (the cutscene board clock is frozen, but the
    // cursor + highlight are live UI).
    if (G.board && G.shovelMode && !G.pauseDlg) G.board.updateHighlight(G.mouse.x, G.mouse.y, true);
    // CutScene 1330-1345: the chooser tune fades just before Ready-Set-Plant
    // (all cutscene tunes, including the Ultimate Battle intros — whose
    // chooserFade spans the pan back to the house, so it lands at RSP).
    try {
      const f = G.cutscene.chooserFade ? G.cutscene.chooserFade() : null;
      if (f && prevT < f.at && G.cutscene.time >= f.at) fadeMusic(f.dur);
      // Ultimate Battle two-stage intro fades (L10 + L30 pool, user
      // request): the pan-back fade HOLDS when the camera reaches the house
      // half-faded volume through the mower slides), then resumes halfway
      // through Ready-Set-Plant and runs out before the board starts.
      // Track-gated: this staging applies ONLY while the Ultimate Battle
      // intro is the current track — any other tune keeps the single fade.
      const bf = G.cutscene.battleIntroHold ? G.cutscene.battleIntroHold() : null;
      if (bf && (currentMusic() === "ultimateIntro" || currentMusic() === "poolUltimateIntro")) {
        if (prevT < bf.holdAt && G.cutscene.time >= bf.holdAt) holdMusicFade(bf.holdVol);
        if (prevT < bf.refadeAt && G.cutscene.time >= bf.refadeAt) fadeMusic(bf.refadeDur);
      }
    } catch (e) { /* headless */ }
    if (G.cutscene.waitingForSeeds) updateChooser(); // SeedChooserScreen::Update flights
    if (G.cutscene.done) {
      try { stopFoleyLoop("digger"); } catch (e) { /* headless */ }
      G.sodRolls = null;
      // LawnApp::StartPlaying (434): Board::StartLevel (1688) → Challenge::
      // StartLevel — vase USE_SHOVEL advice lands here, never during the intro.
      try { G.board.startLevel(); } catch (e) { /* headless */ }
      G.board.state = "play";
      G.screen = "board"; window.__pvz.screen = "board";
    }
    } // else: normal level intro
  } else if (G.screen === "cutscene-standalone") {
    updateChooser(); // standalone chooser (same widget, no cutscene clock)
  } else if (G.screen === "board" && G.board) {
    // Board::Update (5858): a paused board updates nothing — not the sim,
    // not the effect reanims. The pause dialog's own zombie keeps animating
    // (ReanimationWidget::Update runs through the WidgetManager regardless).
    if (G.board.paused) {
      if (G.pauseZombie) { try { G.pauseZombie.update(); } catch (e) { /* headless */ } }
      // Challenge::Update stormy head (2139-2140): the lightning machine runs
      // before the pause gate in source, so the paused board still ticks it
      // (the splash spawner below stays frozen — UpdateRain is post-gate).
      try { G.board.updateStorm(); } catch (e) { /* headless */ }
    } else {
    const prev = G.board.state;
    // Vasebreaker Dave gate (Board::IsScaryPotterDaveTalking 7577-7580): the
    // sim reads whether Dave is up before ticking (pauses the 500-counter).
    // Source keys on CrazyDaveState != OFF (Dave counts as talking through
    // the LEAVING anim until Die) — so G.dave existing, not the message index.
    G.board.daveActive = !!G.dave;
    // LawnApp::UpdateCrazyDave runs every frame in retail, including mid-level
    // (the intermission Dave enters/talks/leaves on the board screen) — tick
    // the entity here too, or the returning Dave never animates.
    updateDaveEntity();
    G.board.update();
    // Vasebreaker intermission cue (sim updateVaseIntermission at counter
    // 300): Dave enters + talks 2700/2800. Consumed once here (main owns Dave).
    if (G.board.vaseDaveCue != null && G.board.vaseDaveCue >= 0) {
      const stage = G.board.vaseDaveCue;
      G.board.vaseDaveCue = -1;
      clearSeedCursor();
      daveEnter();
      daveTalkIndex(stage === 0 ? 2700 : 2800);
    }
    // Almanac defeated flush: sim deaths accumulate Board.zombieDefeated by
    // almanac index (DropLoot 7211); persist them to the profile here so the
    // sim itself never touches save storage.
    if (G.board.zombieDefeated && G.board.zombieDefeated.size) {
      for (const idx of G.board.zombieDefeated) SAVE.markZombieDefeated(idx);
      G.board.zombieDefeated.clear();
    }
    // CutScene::UpdateZombiesWon 1517-1527 (update phase, NOT draw phase):
    // the brains splash is BUILT here at LostTimeBrainGraphicStart (lossT
    // 600) @12fps PLAY_ONCE_AND_HOLD + SetFramesForLayer("ZombiesWon").
    // It used to be built lazily inside drawEndOverlay, which drew it once
    // at exactly animTime=0 — where frame 0 of the brains/fullscreen/title
    // tracks is still populated (they blank at frame 1 and re-enter at
    // 2/10/24), flashing the plate full-opaque for a single frame before
    // the staged entrance. Built here, the per-tick wonReanim.update()
    // below advances it past 0 before its first draw, so it starts hidden.
    if (G.board.state === "lost" && G.board.lossT >= 600 && !G.board.ended && !G.wonReanim) {
      try {
        G.wonReanim = new Reanimation(DEFS.get("ZombiesWon"), 0, 0);
        G.wonReanim.loopType = PLAY_ONCE_AND_HOLD;
        G.wonReanim.animRate = 12;
        G.wonReanim.setFramesForLayer("ZombiesWon");
      } catch (e) { G.wonReanim = null; }
    }
    // Board::UpdateMousePosition shovel branch (3232): hover highlight while
    // a tool cursor is armed (paused/dialog-covered boards skip it).
    if (!G.pauseDlg) G.board.updateHighlight(G.mouse.x, G.mouse.y, G.shovelMode && G.board.state === "play");
    // Vasebreaker hover (Board::UpdateMousePosition 3198-3217 + cursor
    // 3031-3040): the hovered vase highlights and the cursor turns into a
    // finger (SCARY_POT + NORMAL cursor) — only with empty hands, no mallet
    // running, and Dave off the board.
    if (!G.pauseDlg && G.board.isVase && G.board.state === "play" && G.board.fadeOut < 0 &&
        !daveUp() && !G.board.mallet && G.selSeed < 0 && G.selConvIdx < 0 && !G.selUsable && !G.shovelMode) {
      const hg = pixelToGrid(G.mouse.x, G.mouse.y, G.board.bg);
      G.hoverVase = (hg.col >= 0 && hg.row >= 0)
        ? (G.board.vases.find((v) => v.col === hg.col && v.row === hg.row) || null) : null;
    } else G.hoverVase = null;
    // Vasebreaker cursor safety: a held usable coin that died (stale link)
    // must not jam the cursor forever — drop it like an Escape cancel.
    if (G.selUsable && G.selUsable.coin.dead) clearSeedCursor();
    canvas.style.cursor = G.hoverVase ? "pointer" : "default";
   if (G.readyReanim && G.board.state === "intro") G.readyReanim.update();
   if (G.finalReanim) G.finalReanim.update();
    // Whack-a-Zombie cursor hammer (CursorObject::Update 54-58): the reanim
    // ticks every board tick so the swing plays through after a click.
    if (G.hammerReanim) G.hammerReanim.update();
    if (G.wonReanim) G.wonReanim.update();
    if (ghostPlant && G.selSeed < 0 && !G.selUsable) ghostPlant = null;
    if (cursorPlant && G.selSeed < 0 && !G.selUsable) cursorPlant = null;
    // NOTE: the ghost never animates (user request): it holds the idle
    // frame-0 pose, so body/heads are deliberately never update()d here.
    if (G.board.state === "won" && prev !== "won") { finishLevel(); }
    if ((G.board.state === "won" || G.board.state === "lost") && G.board.ended) {
      // Game-over dialog up (stormy 4-10): the rain loop stops with the board
      // freeze above (sim update() returns once ended) — tiles, splash
      // reanims, lightning and thunder all hold. The retry path restarts the
      // loop via the new board ctor; Main Menu never restarts it.
      try { stopFoleyLoop("rain"); } catch (e) { /* headless */ }
      if (G.board.state === "won") {
        // AwardScreen ctor (152-157): paper notes play FOLEY_PAPER on show.
        // (Other awards start the zen-garden tune — no asset, stays quiet.)
        if (awardNoteInfo(awardProfile())) playSfx("paper");
        G.screen = "award"; window.__pvz.screen = "award";
      }
    }
    } // end paused gate
  } else if (G.screen === "award") {
    // AwardScreen::Update (339-347): the fade-in veil ticks down.
    if (G.awardT > 0) G.awardT--;
  } else if (G.screen === "help") {
    // Help paper-note veil ticks down like the award's (Update 339-347).
    if (G.helpT > 0) G.helpT--;
  } else if (G.screen === "almanac") {
    tickAlmanac();
  } else if (G.screen === "store") {
    tickStore();
  } else if (G.screen === "title") {
    // TitleScreen::Update — the loading bar eases toward real loader progress
    // (capped at 99% until the thread finishes, like the source velocity cap)
    // and fires LoadingCompleted automatically when full. No click gate.
    G.titleAge++;
    const target = G.loadDone ? TITLE_BAR_W : TITLE_BAR_W * G.loadDoneCount / Math.max(1, G.loadTotal);
    const d = target - G.barW;
    G.barW += d * 0.15;
    if (Math.abs(d) < 0.25) G.barW = target;
    if (!G.loadDone && G.barW > TITLE_BAR_W * 0.99) G.barW = TITLE_BAR_W * 0.99;
    const readyAge = Math.max(110, (G.loadDoneAge | 0) + 25);
    if (G.loadDone && G.barW >= TITLE_BAR_W - 0.5 && G.titleAge > readyAge && !G.menuEntering) {
      G.menuEntering = true;
      enterMenu().then(() => { if (!SAVE.listUsers().length) openCreatePopup(); })
        .catch(() => { G.menuEntering = false; });
    }
  } else if (G.screen === "menu") {
    if (G.menuReanim) {
      G.menuReanim.update();
      if (G.menuPhase === "open" && G.menuReanim.animTime >= 1) finishMenuOpen();
      else if (G.menuPhase === "sign" && G.menuReanim.animTime >= 1) G.menuPhase = "idle";
      // GameSelector::Update 814-845 — ambient life: cloud sweeps, grass
      // rustle, flower follow. Leaf/flowers track BG_Right (leaf by explicit
      // SetPosition, flowers by attachment — both evaluated every update).
      const bgTi = G.menuReanim.findTrackIndex("SelectorScreen_BG_Right");
      const bgT = G.menuReanim.getCurrentTransform(bgTi);
      for (let i = 0; i < G.menuClouds.length; i++) {
        const cr = G.menuClouds[i];
        if (G.menuCloudCtr[i] > 0) {
          if (--G.menuCloudCtr[i] === 0) { cr.loopCount = 0; cr.animTime = 0; cr.animRate = 0.5; }
        } else if (cr.loopCount > 0) {
          G.menuCloudCtr[i] = 2000 + Math.floor(Math.random() * 2001); // RandRangeInt(2000,4000)
        }
        cr.update();
      }
      if (G.menuLeaf) {
        G.menuLeaf.x = bgT.x - 71; G.menuLeaf.y = bgT.y - 41; // SetPosition(bg - (71,41))
        G.menuLeaf.update();
        if (--G.menuLeafCtr === 0) {
          G.menuLeaf.playReanim("anim_grass", LOOP, 20, 3 + Math.random() * 9); // RandRangeFloat(3,12)
          G.menuLeafCtr = 200 + Math.floor(Math.random() * 201); // RandRangeInt(200,400)
        }
      }
      for (const fr of G.menuFlowers) fr.update(); // attached: update() refreshes each flower's overlay from BG_Right, so all three ride the pan
    }
    if (G.handReanim) G.handReanim.update(); // PLAY_ONCE_AND_HOLD: harmless once held; keeps the hand posed through the async handoff
    if (G.menuStarting) {
      G.menuStarting++;
      if (G.menuStarting === 125) playSfx("evillaugh"); // SOUND_EVILLAUGH
      if (G.menuStarting > 450) menuStartingDone();
    }
  }
  updateMusic();
}
// The loop only follows the cutscene intro when the player actually gets
// to choose seeds (user request): conveyor banks offer no choice (fixed
// belt), fixed banks offer none either, and ChooseSeedsOnCurrentLevel
// (Board.cpp:1680) gates the chooser itself. Choice is real only when the
// unlocked roster overflows the bank's slots.
function chooserLoopWarranted(b) {
  if (!b || b.isConveyor) return false;
  if (!chooseSeedsOnLevel(b.level, b.finished)) return false;
  return seedsAvailableFor(b.level, b.finished) > numSeedsInBank(b.level, b.finished, b.packetUpgrade | 0);
}
// Background music by screen: title/menu/options share the Dave track (the
// help paper note stays silent like the award paper notes);
// the cutscene ("Player's House" -> Ready Set Plant) plays an intro tune
// (CutScene 940, loop at 0:06 only when choosing is warranted, fading just
// before Ready-Set-Plant per 1330-1345); level tunes: lawn theme everywhere except Wall-nut Bowling (L5 conveyor minigame track)
// and Level 9 (battle track); won/lost ends stop for the stingers.
function updateMusic() {
  if (G.screen === "title" || G.screen === "menu" || G.screen === "options") {
    // ClickedAdventure stops the music under the LOSEMUSIC stinger; the
    // title tune must not restart while the hand rises (or during the async
    // handoff before the next screen takes over).
    if (G.screen === "menu" && (G.menuStarting || G.handReanim)) stopMusic();
    else playMusic("title");
  }
  else if (G.screen === "cutscene" || G.screen === "cutscene-standalone" || G.screen === "board") {
    const b = G.board;
    // Async load in flight (enterChooser flips the screen before startLevel
    // builds the board): stay silent. levelTune with no board resolves to
    // "lawn", which used to start the front-lawn track for a moment before
    // the real cutscene tune took over.
    if (!b) { stopMusic(); return; }
    // Level tunes: the conveyor levels keep their minigame tune (L5 bowling,
    // L10 + L20 the battle track and L30 the pool battle track per the user's music mapping) as does the whack-a-mole board (Demonstration track); Vasebreaker
    // (4-5) gets the user-attached Cerebrawl track; pool/backyard
    // boards get the pool theme; fog boards the user-attached fog theme;
    // roof boards (5-1 onwards) the user-attached Graze The Roof track;
    // night-lawn boards the night theme; everything else gets the front-lawn theme.
    // Tunes never change mid-level from updateMusic's side — retail fires only
    // drum bursts on huge/final waves, which this port skips — but the lawn,
    // night, and fog chains detour to their midwave at the loop point while a
    // huge/final banner is up (see setLawnBranch above), handing back at the cut point.
    // Vasebreaker (4-5, L35) gets the user-attached Cerebrawl track (plain
    // overlap loop at 1:38.50) instead of the night theme. (The Dave intro
    // cutscene still plays the title tune, per the pick below.)
    // Stormy night (4-10, L40): the board plays NO tune at all — retail
    // StartGameMusic (Music.cpp 699-700) runs StopAllMusic on stormy levels,
    // so the rain loop + thunder stand alone. levelTune null stops the music
    // instead of starting anything.
    const levelTune = (b && b.isVase) ? "cerebrawl" : (b && b.isStormy) ? null : (b && (b.level === 10 || b.level === 20)) ? "battle" : (b && b.level === 30) ? "poolBattle" : (b && (b.isConveyor || b.isWhack)) ? "bowling" : (b && b.bg === BG.POOL) ? "pool" : (b && b.bg === BG.FOG) ? "fog" : (b && (b.bg === BG.ROOF || b.bg === BG.BOSS)) ? "roof" : (b && b.stageIsNight && b.stageIsNight()) ? "night" : "lawn";
    if (b && (b.state === "won" || b.state === "lost")) stopMusic();
    else if (G.screen === "board") {
      // Board::FadeOutLevel (1864-1878): StopAllMusic the moment the award
      // is collected; the WINMUSIC foley (sim-side) plays over the silence.
      if (b.fadeOut >= 0) stopMusic();
      else if (!levelTune) stopMusic(); // stormy-night silence (Music 699-700)
      else playMusic(levelTune);
    }
    else if (G.cutscene && G.cutscene.intro) {
      // GAMEMODE_INTRO demo is a pool board: pool theme, until the FadeOut
      // edge (10890) starts its fade (user override: 1000ms across the
      // black fade, not the source 250ms) — then hold silence so the
      // fade isn't resurrected (same stale-want guard as
      // the chooser end fade).
      if (!G.cutscene.firedFade) playMusic("pool");
    }
    else if (G.cutscene && G.cutscene.chooserFade) {
      const f = G.cutscene.chooserFade();
      // CutScene 940: a cutscene tune starts with the cutscene; the tick edge
      // above fades it at f.at, then Board::StartLevel brings the level tune.
      // After the Dave-dialog end fade (chooserDone) it stays silent —
      // re-requesting would restart the intro from the top.
      // Track pick (user request): the Ultimate Battle conveyors (L10, L20
      // night, L30 pool) get their own intros; Wall-nut Bowling (L5 Dave) keeps
      // intro -> loop; else the loop only follows when seed choice is real
      // (chooserLoopWarranted) — fixed banks with nothing to spare and
      // conveyor banks offer no choice, so those cutscenes ride the intro
      // only, no loop at 0:06.
      if (!G.cutscene.chooserDone && G.cutscene.time < f.at) {
        let pick = "chooserOnce";
        // User mapping: the Whack-a-Zombie and Big Trouble Little Zombie
        // Dave cutscenes play the TITLE theme (StartLevelIntro 930-933:
        // mCrazyDaveTime > 0 -> MUSIC_TUNE_TITLE_CRAZY_DAVE_MAIN_THEME).
        // Vasebreaker (L35 Dave intro) takes the same branch, as does the
        // stormy-night intro (L40 Dave 1101). First-time 3-1 pool (L21,
        // dialog 501) joins them while Dave is up: retail runs TITLE from
        // the intro start and switches to the chooser tune when he leaves
        // (1622-1624), so the pick rides Dave state — title until his
        // message runs out (or before he enters), chooser after (the leave
        // edge above + the per-tick fallthrough both land there).
        if (b && (b.isWhack || b.level === 25 || b.isVase || b.isStormy ||
          (b.level === 21 && b.firstTime && G.cutscene.crazyDaveTime > 0 &&
            (G.cutscene.time < CutT.EarlyDaveEnterEnd || (G.dave && G.dave.msgIndex !== -1))))) pick = "title";
        else if (b && (b.level === 10 || b.level === 20)) pick = "ultimateIntro";
        else if (b && b.level === 30) pick = "poolUltimateIntro";
        else if ((b && b.isBowling) || chooserLoopWarranted(b)) pick = "chooser";
        playMusic(pick);
      }
    }
    else playMusic(levelTune);
  }
  else if (G.screen === "award") stopMusic(); // quiet award screen
  else if (G.screen === "help") stopMusic(); // help paper note: StopAllMusic (AwardScreen ctor 152-157)
  else if (G.screen === "store") playMusic("shop"); // StoreScreen::Update: MUSIC_TUNE_TITLE_CRAZY_DAVE_MAIN_THEME family (shop Zen track in this port)
  else if (G.screen === "almanac") playMusic("almanac"); // AlmanacDialog ctor plays the choose-your-seeds tune; ours plays the user-attached SeedShopZen track instead (USER REQUEST, normalized like the other tunes)
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  if (G.screen === "title") drawTitle();
  else if (G.screen === "menu") drawMenu();
  else if (G.screen === "help") drawHelp();
  else if (G.screen === "options") drawOptions();
  else if (G.screen === "cutscene-standalone") drawChooserPanel(0);
  else if (G.screen === "cutscene" && G.board) drawBoard();
  else if (G.screen === "board" && G.board) drawBoard();
  else if (G.screen === "award" && G.board) drawAward();
  else if (G.screen === "almanac") drawAlmanac();
  else if (G.screen === "store") drawStore();
  else drawTitle();
}

boot();
function hideWaterTracks(z) {
  // Foam-art tracks (USER OVERRIDE — retail tints these: SetupWaterTrack
  // matches by track NAME, and the five foam tracks in this def are named
  // "Zombie_duckytube" while carrying only WHITEWATER cels, so retail's
  // first-match flagging never exempts them and the aqua wash tints bluer
  // under chill. They always show foam (verified: no other image keys in
  // any frame), so exempting by current cel key is exact and keeps the
  // yellow tube itself tinted like retail.
  const tracks = z.body.tracks, def = z.body.def.tracks, saved = [], names = new Set();
  for (let i = 0; i < tracks.length; i++) {
    let foam = !!tracks[i].ignoreColorOverride;
    if (!foam) {
      const k = z.body.getCurrentTransform(i).key;
      foam = typeof k === "string" && k.toLowerCase().includes("whitewater");
    }
    if (foam) {
      saved.push([i, tracks[i].renderGroup]);
      tracks[i].renderGroup = RENDER_GROUP_HIDDEN;
      names.add(def[i].name.toLowerCase());
    }
  }
  return { saved, names };
}
function restoreWaterTracks(z, saved) {
  for (const [i, g] of saved) z.body.tracks[i].renderGroup = g;
}
// Attached seaweed (RiseFromGrave pool, Zombie.cpp:8167-8196): retail
// attached particle systems render outside DrawReanim's color/flash
// overrides, so the chill/mind/burn whole-canvas tints must skip them. They
// draw inline in the normal pass (clip-correct, noCoat skips the mul>0
// coats), but the tint scratch would dye them — hidden here via _tintHidden
// (reanim.js drawTracks gate) and repainted straight afterwards.
function hideSeaweeds(z) {
  if (!z.seaweeds) return [];
  const saved = [];
  for (const sw of z.seaweeds) {
    if (!sw.reanim.dead) { saved.push(sw); sw.reanim._tintHidden = true; }
  }
  return saved;
}
function restoreSeaweeds(saved) {
  for (const sw of saved) sw.reanim._tintHidden = false;
}
function drawSeaweed(z, camX, camY, clipRect) {
  if (!z.seaweeds) return;
  // Contain the per-track setTransform/globalAlpha writes below: drawTracks
  // never restores the canvas state (only the public draw() does), so without
  // this every raw drawImage after a pool zombie in the frame (later-row
  // shadows, projectiles, motes, suns) inherited the last seaweed track's
  // matrix — position AND scale hijacked on pool lanes only.
  ctx.save();
  try {
    for (const sw of z.seaweeds) {
      if (sw.reanim.dead) continue;
      try {
        sw.reanim.alpha = z.body.alpha;
        sw.reanim.drawTracks(ctx, 0, camX, camY, 0, null, clipRect);
      } catch (e) { /* def missing */ }
    }
  } finally {
    ctx.restore();
  }
}
function drawWaterTracks(z, camX, camY, clipRect, names) {
  if (!names.size || z.body.dead) return;
  // Key test first: foam-art tracks are named "Zombie_duckytube", so a
  // pure name match would also catch the yellow tube tracks (double-draw:
  // tinted in the scratch pass, then untinted on top). Foam cels always
  // carry WHITEWATER keys, the tube cels never do — test the key, and only
  // use the name set for the true water-track names.
  // Save/restore for the same reason as drawSeaweed above: the foam/aqua
  // water-track matrix must not leak into later draws.
  ctx.save();
  try {
    z.body.drawTracks(ctx, 1, camX, camY, 0, (n, k) => {
      if (typeof k === "string" && k.toLowerCase().includes("whitewater")) return true;
      const ln = String(n).toLowerCase();
      return ln !== "zombie_duckytube" && names.has(ln);
    }, clipRect);
  } finally {
    ctx.restore();
  }
}
