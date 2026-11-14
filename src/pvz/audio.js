// Sound effects from verbatim game files (src/assets/sounds/*.ogg).
// Foley map condensed from Sexy.TodLib/TodFoley.cpp gLawnFoleyParamArray.
//
// Random pitch (TodFoley.cpp PlayFoley 287-293 + DSoundInstance::AdjustPitch):
// every PlayFoley call rolls Sexy::Rand(mPitchRange) semitones and shifts the
// sample by 2^(steps/12) (AdjustPitch multiplies the DirectSound frequency by
// pow(2^(1/12), steps)). Positive ranges play base-pitch-or-higher, negative
// ranges (bowling -3, plantgrow -2, newspaper -2, melon -5, bigchomp -2,
// shoop -5, vase -5) play base-pitch-or-LOWER. Raw PlaySample calls
// (SEEDLIFT, GULP, POTATO_MINE, AWOOGA, SIREN, BUZZER, BUTTONCLICK,
// READYSETPLANT, EVILLAUGH, THROW2-as-sample, BOWLING, BOWLINGIMPACT2, ...) get
// no pitch. Zombie groans roll PlayFoleyPitch with 0 normally, or a 40-50
// semitone shift on Little Trouble levels (Zombie.cpp:4483-4486).
// PITCH below carries the nonzero mPitchRange per OUR sfx key; sfx() rolls it
// automatically, and call sites pass an explicit pitch only when retail does
// (spike throw is a raw sample: pitch 0; mower-gold points climbs 0..6 with
// the untriggered-mower count, Board.cpp 1812-1818).
const PITCH = {
  shovel: 5, coin: 10, splat: 10, splat2: 10, splat3: 10, chomp_soft: 4,
  mower: 10, lowgroan: 2, throw: 10, points: 10, grow: -2, hmm: 2, hmm2: 2, thump: 2,
  firepea: 10, polevault: 5, newspaper: -2, newspaper2: -2, newspaperRip: -2, grassstep: 2, dirtRise: 5,
  shieldhit: 10, shieldhit2: 10, plastichit: 5, plastichit2: 5,
  limbsPop: 10, zombieFalling: 10, zombieFalling2: 10, bowlingimpact: -3, juicy: 2,
  // Pool foley pitches (TodFoley.cpp gLawnFoleyParamArray): ZOMBIESPLASH 10,
  // POOL_CLEANER 2, SLURP 2; ENTERING_WATER / DOLPHIN_* / PLANT_WATER flat.
  zombiesplash: 10, poolCleaner: 2, slurp: 2,
  // Whack-a-Zombie hammer (TodFoley.cpp:57-58: SWING/BONK both pitch range 2).
  swing: 2, bonk: 2,
  // FOLEY_VASE_BREAKING (TodFoley.cpp: vase -5): base pitch or lower.
  vaseBreaking: -5,
  // FOLEY_IGNITE (TodFoley.cpp:48, fireball impact, pitch range 5).
  ignite: 5, ignite2: 5,
  // FOLEY_SNOW_PEA_SPARKLES (TodFoley.cpp:37, pitch range 10) plays at Fire
  // time for snow/wintermelon (Plant.cpp:4589-4592).
  snowPeaSparkles: 10,
  bigchomp: -2, rumble: 10, puff: 10, fume: 10,
  // FOLEY_BUNGEE_SCREAM (TodFoley.cpp:54, pitch range 2.0).
  bungeeScream: 2, bungeeScream2: 2, bungeeScream3: 2,
  // FOLEY_MAGNETSHROOM (TodFoley.cpp, pitch range 2).
  magnetshroom: 2,
  // FOLEY_ZAMBONI (TodFoley.cpp, pitch range 5 — PlayZombieAppearSound 235960).
  // FOLEY_TIRE_POP (= SOUND_BALLOON_POP, ZamboniDeath 6413) is flat.
  // FOLEY_BALLOONINFLATE (pitch range 10).
  ballooninflate: 10,
  zamboni: 5,
  // FOLEY_JACK_SURPRISE (TodFoley.cpp:44, pitch range 1.0).
  jackSurprise: 1, jackSurprise2: 1,
  // FOLEY_THUNDER (TodFoley.cpp:27, pitch range 10.0): the stormy-night
  // lightning cracks (UpdateStormyNight 1973, flat PlayFoley pick).
  thunder: 10,
};
//
// Playback goes through WebAudio (fetch + decodeAudioData), NOT <audio>
// elements: in the preview iframe an <audio> tag resolves relative src/
// URLs to the wrong host (https://perchance.org/src/... -> MEDIA_ERR
// SRC_NOT_SUPPORTED), while fetch() resolves them correctly and both the
// mp3 + ogg tracks decode fine in-page. So everything plays from buffers.
const FILES = {
  plant: "plant.ogg", plant2: "plant2.ogg", seedlift: "seedlift.ogg", shovel: "shovel.ogg",
  // FOLEY_PLANT_WATER (TodFoley.cpp:62, pitch 0.0f flat): pool planting splash.
  // Byte-identical plant_water.ogg from main.zip sounds/.
  plantWater: "plant_water.ogg",
  coin: "coin.ogg", splat: "splat.ogg", splat2: "splat2.ogg", splat3: "splat3.ogg",
  // SOUND_DIAMOND (Coin::PlayCollectSound 1341-1345, raw PlaySample — flat, no
  // pitch range). Byte-identical diamond.ogg from main.zip sounds/.
  diamond: "diamond.ogg",
  // FOLEY_MONEYFALLS (Coin::PlayGroundSound 1317-1325: gold landing only;
  // TodFoley.cpp pitch 0.0f flat). Byte-identical moneyfalls.ogg from
  // main.zip sounds/.
  moneyfalls: "moneyfalls.ogg",
  chomp: "chomp.ogg", chomp2: "chomp2.ogg", chomp_soft: "chompsoft.ogg", cherry: "cherrybomb.ogg", boom: "explosion.ogg",
  // Chomper resolve sting (UpdateChomper 1779, FOLEY_BIGCHOMP) — byte-identical
  // from main.zip sounds/ (the repo has no bigchomp asset).
  bigchomp: "bigchomp.ogg",
  potato: "potato_mine.ogg", mower: "lawnmower.ogg",
  groan: "groan.ogg", groan2: "groan2.ogg", groan3: "groan3.ogg", groan4: "groan4.ogg", groan5: "groan5.ogg", groan6: "groan6.ogg", lowgroan: "lowgroan.ogg", lowgroan2: "lowgroan2.ogg",
  finalwave: "finalwave.ogg", hugewave: "hugewave.ogg", siren: "siren.ogg",
  readyset: "readysetplant.ogg", win: "winmusic.ogg", lose: "losemusic.ogg",
  // Game-over brains splash (CutScene::UpdateZombiesWon 1517-1527):
  // FOLEY_SCREAM at LostTimeBrainGraphicStart, byte-identical from main.zip
  // sounds/ (flat PlayFoley pick, no pitch range in the TodFoley table).
  scream: "scream.ogg",
  // FOLEY_BUNGEE_SCREAM set-pick (TodFoley.cpp:54): [SCREAM x3] —
  // the descend-scream at BungeeLanding (Zombie.cpp:1226), pitch 2.0 (PITCH
  // below). Byte-identical bungee_scream[23].ogg from main.zip sounds/.
  bungeeScream: "bungee_scream.ogg", bungeeScream2: "bungee_scream2.ogg", bungeeScream3: "bungee_scream3.ogg",
  throw: "throw.ogg", throw2: "throw2.ogg", points: "points.ogg", gulp: "gulp.ogg",
  // FOLEY_PUFF (TodFoley pitch 10, PITCH above) layers over the throw on
  // every puff-family shot (Plant::Fire 4593-4596) — byte-identical puff.ogg
  // from main.zip sounds/.
  puff: "puff.ogg",
  // FOLEY_FUME (TodFoley.cpp:40, pitch 10, PITCH above) plays at Fire time
  // (Plant::Fire 4524-4528) — byte-identical fume.ogg from main.zip sounds/.
  fume: "fume.ogg",
  click: "buttonclick.ogg", buzzer: "buzzer.ogg", chime: "chime.ogg", tap: "tap.ogg",
  // SOUND_TAP (raw PlaySample, e.g. SeedChooserScreen pick/unpick/buttons —
  // flat, no pitch range) lives in tap.ogg. SOUND_TAP2 (FOLEY_DROP's sample,
  // TodFoley.cpp:19, also flat) lives in tap2.ogg (enums.js DROP -> tap2).
 crazydave: "ZombiesOnYourLawn.ogg", awooga: "awooga.ogg", grow: "plantgrow.ogg",
  daveShort1: "crazydaveshort1.ogg", daveShort2: "crazydaveshort2.ogg", daveShort3: "crazydaveshort3.ogg",
  daveLong1: "crazydavelong1.ogg", daveLong2: "crazydavelong2.ogg", daveLong3: "crazydavelong3.ogg",
  daveExtraLong1: "crazydaveextralong1.ogg", daveExtraLong2: "crazydaveextralong2.ogg", daveExtraLong3: "crazydaveextralong3.ogg",
  daveScream: "crazydavescream.ogg", daveScream2: "crazydavescream2.ogg",
  daveCrazy: "crazydavecrazy.ogg", drop: "tap2.ogg",
  // Coffee + wakeup (DoSpecial coffee 4441 + Update wake tick 2552): both
  // PlayFoley with pitch 0.0f (TodFoley.cpp:79/93), so no PITCH entries —
  // both byte-identical from main.zip sounds/.
  coffee: "coffee.ogg", wakeup: "wakeup.ogg",
  hmm: "squash_hmm.ogg", firepea: "firepea.ogg", floop: "floop.ogg",
  // FOLEY_MAGNETSHROOM (TodFoley.cpp: pitch range 2): the steal zap —
  // byte-identical magnetshroom.ogg from main.zip sounds/.
  magnetshroom: "magnetshroom.ogg",
  // FOLEY_IGNITE set-pick (TodFoley.cpp:48): [IGNITE x3, IGNITE2] — fireball
  // impact only (DoImpact 779-784); the jalapeno detonation uses the flat
  // SOUND_JALAPENO instead. Both byte-identical from the decomp repo sounds/.
  ignite: "ignite.ogg", ignite2: "ignite2.ogg",
  // FOLEY_SNOW_PEA_SPARKLES (TodFoley.cpp:37) — snow/wintermelon Fire layer
  // over the throw; byte-identical from the decomp repo sounds/.
  snowPeaSparkles: "snow_pea_sparkles.ogg",
  // FOLEY_SQUASH_HMM set-pick (TodFoley.cpp: {HMM, HMM, HMM2} — the first
  // variant twice as likely) + FOLEY_THUMP = SOUND_GARGANTUAR_THUMP
  // (TodFoley.cpp, pitch 2, PITCH above). Both byte-identical main.zip.
  hmm2: "squash_hmm2.ogg", thump: "gargantuar_thump.ogg",
  polevault: "polevault.ogg", frozen: "frozen.ogg", newspaper: "newspaper_rarrgh.ogg",
  // FOLEY_NEWSPAPER_RARRGH set-pick (TodFoley.cpp:76): [RARRGH, RARRGH2,
  // RARRGH2] — the second variant twice as likely (Board.rarrghPick in sim).
  // FOLEY_NEWSPAPER_RIP at paper-rip time (DropShield 7522). Both pitch -2.
  newspaper2: "newspaper_rarrgh2.ogg", newspaperRip: "newspaper_rip.ogg",
  grassstep: "grassstep.ogg", evillaugh: "evillaugh.ogg", dirtRise: "dirt_rise.ogg",
  // Grave audio (GridItem::AddGraveStoneParticles 429 + Zombie::RiseFromGrave
  // 8217 + PlantInitialize gravebuster 344, all byte-identical from main.zip
  // sounds/): GRAVEBUSTERCHOMP is flat (TodFoley pitch 0.0f, no PITCH entry),
  // GRAVESTONE_RUMBLE rolls pitch 10 (PITCH below).
  gravebusterchomp: "gravebusterchomp.ogg", rumble: "gravestone_rumble.ogg",
  // Award-screen paper note (AwardScreen ctor 152-157: FOLEY_PAPER, flat
  // pitch 0.0f per TodFoley.cpp:96) — byte-identical paper.ogg already in
  // src/assets/sounds/, it just had no key.
  // GameSelector ctor 278-279 — SOUND_ROLL_IN rolls under the menu sign
  // open (flat PlaySample). Byte-identical in main.zip sounds/ and the
  // decomp repo's SexyAppFramework/sounds/ (26825 bytes both), so no A/B.
  rollIn: "roll_in.ogg",
  paper: "paper.ogg",
  // StoreScreen hatch (ButtonDepress 50-tick close, AdvanceCrazyDaveDialog
  // 150-tick open — SOUND_HATCHBACK_CLOSE / SOUND_HATCHBACK_OPEN, flat
  // PlaySample). Byte-identical from main.zip sounds/.
  hatchOpen: "hatchback_open.ogg", hatchClose: "hatchback_close.ogg",
  // End-of-level white-fade whoosh (Board::UpdateLevelEndSequence 1788-1794:
  // SOUND_LIGHTFILL at counter 300, flat PlaySample). Byte-identical from the
  // decomp repo's SexyAppFramework/sounds/ — the main.zip copy is the same
  // swell ~0.9s longer but ~11dB quieter (peak 0.099 vs 0.172, RMS 0.0068 vs
  // 0.0246), so the repo mastering is the one that reads as a whoosh (same
  // call as the earlier Dave-voice A/B, where the repo recording won).
  lightfill: "lightfill.ogg",
  // SOUND_MINDCONTROLLED (Zombie::StartMindControlled 6916, raw PlaySample —
  // flat, no PITCH entry; Plays at the hypno convert alongside FOLEY_FLOOP).
  mindcontrolled: "mindcontrolled.ogg",
  // FOLEY_DANCER sting (Zombie::UpdateZombieDancer 2961-2963: fired when the
  // plain snap completes with <= 15 zombies on screen; pitch 0.0f, flat).
  // Stoppable (StopZombieSound 7439-7442 kills the channel once no headed
  // living on-board dancer/backup remains), so it rides its own tracked
  // source below instead of the fire-and-forget sfx() path.
  dancer: "dancer.ogg",
  shieldhit: "shieldhit.ogg", shieldhit2: "shieldhit2.ogg",
  plastichit: "plastichit.ogg", plastichit2: "plastichit2.ogg",
  limbsPop: "limbs_pop.ogg", digger: "digger_zombie.ogg",
  // FOLEY_BALLOONINFLATE (TodFoley table, pitch range 10 — PlayZombieAppearSound
  // on balloon spawn) — byte-identical ballooninflate.ogg from main.zip sounds/.
  ballooninflate: "ballooninflate.ogg",
  // FOLEY_ZAMBONI (PlayZombieAppearSound 235960, pitch 5) + FOLEY_TIRE_POP
  // (= SOUND_BALLOON_POP, ZamboniDeath 6413, flat) — both byte-identical
  // from main.zip sounds/.
  zamboni: "zamboni.ogg", balloonpop: "balloon_pop.ogg",
  // Pool water-lane foley (all byte-identical from main.zip sounds/):
  // FOLEY_ZOMBIESPLASH (TodFoley.cpp:29, pitch 10.0f): {PLANT_WATER,
  // ENTERING_WATER} pick — PoolSplash(true) + mower pool transitions.
  // FOLEY_ZOMBIE_ENTERING_WATER (TodFoley.cpp:63, pitch 0.0f flat):
  // snorkel/dolphin pool entries, dolphin jump re-entry, tangle drag splash.
  // FOLEY_DOLPHIN_APPEARS (61, flat) / FOLEY_DOLPHIN_BEFORE_JUMPING (60,
  // flat): dolphin ride/jump stingers. FOLEY_POOL_CLEANER (46, pitch 2.0f):
  // pool-cleaner trigger. FOLEY_SLURP (34, pitch 2.0f): zombiquarium-only,
  // included for completeness (no caller in this port).
  zombiesplash: "zombiesplash.ogg", enteringWater: "zombie_entering_water.ogg",
  dolphinAppears: "dolphin_appears.ogg", dolphinBeforeJumping: "dolphin_before_jumping.ogg",
  poolCleaner: "pool_cleaner.ogg", slurp: "slurp.ogg",
  // FOLEY_SHOOP (TodFoley.cpp:49, pitch -5, PITCH above): pool-cleaner suck.
  // Byte-identical from main.zip sounds/.
  shoop: "shoop.ogg",
  // Cherry (DoSpecial 4356-4357): FOLEY_CHERRYBOMB (flat) + FOLEY_JUICY
  // (pitch range 2, TodFoley table). Doom plays the raw SOUND_DOOMSHROOM
  // sample (4369, flat). Cherry/jalapeno/doom fuses play FOLEY_REVERSE_
  // EXPLOSION at arm time (PlantInitialize 298-313 / UpdateDoomShroom 1601).
  juicy: "juicy.ogg", reverseExplosion: "reverse_explosion.ogg", doom: "doomshroom.ogg", jalapeno: "jalapeno.ogg",
  zombieFalling: "zombie_falling_1.ogg", zombieFalling2: "zombie_falling_2.ogg",
  bowling: "bowling.ogg", bowlingimpact: "bowlingimpact.ogg", bowlingimpact2: "bowlingimpact2.ogg",
  // Whack-a-Zombie hammer foley (Challenge::MouseDownWhackAZombie 1185/1221):
  // FOLEY_SWING on every swing, FOLEY_BONK on a bare-head kill. Byte-identical
  // from main.zip sounds/.
  swing: "swing.ogg", bonk: "bonk.ogg",
  // FOLEY_VASE_BREAKING (TodFoley.cpp, pitch range -5, PITCH above — base
  // pitch or lower): the vase shatter on every opened pot. Byte-identical
  // from main.zip sounds/.
  vaseBreaking: "vase_breaking.ogg",
  // Pause-menu foley (Board::KeyDown/LawnDialog::ButtonPress): the repo's own
  // pause.ogg is byte-identical to main.zip's; gravebutton.ogg differs, and
  // the pause menu + button use repo assets only (user request), so both
  // come from the decomp repo's sounds/ (src/assets/sounds/).
  pause: "pause.ogg", gravebutton: "gravebutton.ogg",
  // Pool-night foley (all byte-identical from main.zip sounds/, flat raw
  // PlaySample calls — no PITCH entries): SOUND_BLOVER (Plant::BlowAwayFliers)
  // + SOUND_PLANTERN (PlantInitialize in-play).
  blover: "blover.ogg", plantern: "plantern.ogg",
  // Jack-in-the-box foley (all byte-identical from main.zip sounds/):
  // SOUND_BOING (UpdateZombieJackInTheBox 1990, raw PlaySample — flat, no
  // PITCH entry), FOLEY_JACK_SURPRISE (TodFoley.cpp:44, pitch range 1.0, the
  // {SOUND_JACK_SURPRISE x2, SOUND_JACK_SURPRISE2} set-pick) and
  // FOLEY_JACKINTHEBOX (TodFoley.cpp:24, pitch 0.0, flags 7U loop — the
  // "Pop Goes the Weasel" crank that loops while a headed jack walks, run
  // through the startLoop/stopLoop pair like the digger song).
  boing: "boing.ogg", jackSurprise: "jack_surprise.ogg", jackSurprise2: "jack_surprise2.ogg",
  jackinthebox: "jackinthebox.ogg",
  // Stormy-night weather (Challenge::InitLevel 348-353 + UpdateStormyNight
  // 1973): FOLEY_RAIN loops for the whole level (TodFoley.cpp:59, pitch 0.0
  // flat, flags 5U loop) while FOLEY_THUNDER fires one-shot at the flash
  // gates (TodFoley.cpp:27, pitch range 10.0, PITCH below). Both byte-identical
  // from main.zip sounds/.
  rain: "rain.ogg", thunder: "thunder.ogg",
};
let enabled = true;
let sfxVol = 1, musicVol = 0.8;
export function setSoundEnabled(v) { enabled = v; }
// NewOptionsDialog sliders (NewOptionsDialog.cpp:49-55): music 0..1, sfx scaled by /0.65.
export function setSfxVolume(v) {
  sfxVol = Math.max(0, Math.min(1, v));
  if (sfxBus) sfxBus.gain.value = 0.5 * sfxVol;
}
export function setMusicVolume(v) {
  musicVol = Math.max(0, Math.min(1, v));
  if (musicBus) musicBus.gain.value = musicVol;
}
export function getSfxVolume() { return sfxVol; }
export function getMusicVolume() { return musicVol; }

// ---------- WebAudio core ----------
let actx = null, musicBus = null, sfxBus = null;
function ensureCtx() {
  if (!actx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    actx = new Ctx();
    musicBus = actx.createGain(); musicBus.gain.value = musicVol; musicBus.connect(actx.destination);
    sfxBus = actx.createGain(); sfxBus.gain.value = 0.5 * sfxVol; sfxBus.connect(actx.destination);
  }
  // Browsers start the context suspended before the first gesture; resume
  // attempts pre-gesture just reject, and unlockMusic() retries on input.
  if (actx.state === "suspended") actx.resume().catch(() => {});
  return actx;
}
async function fetchBuf(kind, file) {
  const r = await fetch("src/assets/" + kind + "/" + file);
  if (!r.ok) throw new Error("audio fetch " + r.status + " " + file);
  const raw = await r.arrayBuffer();
  const ctx = ensureCtx();
  if (!ctx) throw new Error("no AudioContext");
  return await ctx.decodeAudioData(raw);
}

// ---------- background music (user-supplied loops) ----------
// title/menu share the Dave track, day-lawn levels get the front-lawn theme,
// night-lawn boards the night theme, pool/backyard boards the pool theme
// (incl. the GAMEMODE_INTRO pool demo), the final wave gets the battle track; won/lost/award stop for stingers.
// The cutscene ("Player's House" -> Ready Set Plant) gets the retail
// MUSIC_TUNE_CHOOSE_YOUR_SEEDS two-part tune: Choose_Seeds_Intro plays
// from the cutscene start, then at 0:06 the Choose_Seeds_Loop takes over
// (looped) until the Ready-Set-Plant fade (CutScene 1330-1345) — but only
// when seed choice is real (see chooserLoopWarranted in main.js); cutscenes
// with nothing to choose ride the intro only, and the Ultimate Battle
// conveyor cutscene plays its own intro instead. L5's Dave cutscene keeps
// the full intro -> loop.
// One looped source per tune, swapped by screen state (see updateMusic in main.js) —
// except the chain tunes (day lawn, night, fog, pool, battle, pool-battle), which
// play as one-shot chains with overlap restarts (old tail rings out under
// the fresh instance) instead of seamless buffer loops.
// Browsers block audio before the first gesture, so the wanted track parks
// until unlockMusic() runs on pointerdown/keydown.
const MUSIC = {
  title: "TitleAndDave.ogg",
  lawn: "FrontLawnThemeTutorial.ogg",
  battle: "Ultimate-Battle.ogg",
  bowling: "DemonstrationMinigame.ogg", // Wall-nut Bowling levels (L5 conveyor)
  chooserIntro: "Choose_Seeds_Intro.ogg",
  chooserLoop: "Choose_Seeds_Loop.ogg",
  ultimateBattleIntro: "Ultimate-Battle-Intro.ogg", // L10 Ultimate Battle conveyor cutscene
  poolBattle: "Ultimate-Battle-Pool.ogg", // L30 (3-10) pool mini-boss board tune
  poolBattleIntro: "Ultimate-Battle-Pool-Intro.ogg", // L30 (3-10) pool conveyor cutscene
  pool: "PoolTheme.ogg", // backyard/pool boards + the GAMEMODE_INTRO pool demo
  night: "FrontLawnNight.ogg", // night lawn boards (2-1 onwards; USER REPLACEMENT track)
  almanac: "SeedShopZen.ogg", // USER REQUEST: the attached SeedShopZen track plays on the Almanac menu
  shop: "SeedShopZen.ogg", // Crazy Dave's shop: same Zen track (user-attached) under the shop screen
  // Huge/final-wave detour (user request): when the lawn theme hits its 3:03
  // loop point while the huge-wave or final-wave banner is on screen,
  // MidWaveA takes over instead of a plain restart; at 1:13 it hands back
  // to the lawn. Both handoffs overlap (old tail rings out, never cut off).
  midwave: "FrontLawnMidwaveA.ogg",
  // Night huge/final-wave detour (user request): the replacement night theme
  // gets the same treatment as the day lawn — the night midwave takes over
  // at the night loop point under the same banner/crowd conditions and hands
  // back to the night theme at its own cut point. Both handoffs overlap.
  // Fog huge/final-wave detour (user request): the fog theme gets the same
  // treatment as the day lawn and night themes — FogThemeMidwaveA takes over
  // at the fog loop point under the same banner/crowd conditions and hands
  // back to the fog theme at its own cut point (0:53). Both handoffs overlap.
  fogMidwave: "FogThemeMidwaveA.ogg",
  fog: "FogTheme.ogg", // fog boards (4-1 onwards; user-attached tracks)
  // Vasebreaker board tune (user request): the attached Cerebrawl track
  // plays on 4-5 (L35) instead of the night theme.
  cerebrawl: "Cerebrawl2.ogg",
  // Roof board tune (user request): the attached Graze The Roof track plays
  // on roof levels (5-1 onwards, L41+) instead of the lawn theme.
  roof: "Graze_The_Roof.ogg",
};
// Cutscene intro tunes (user request): the intro plays from the cutscene
// start; when a loop key is present it takes over at 0:06
// (CHOOSER_SWITCH_MS), otherwise the intro plays once and the cutscene
// rides it out to the Ready-Set-Plant fade. "chooser" keeps the original
// intro -> loop; "chooserOnce" is the intro with no loop (levels where no
// seed choice is offered); "ultimateIntro" / "poolUltimateIntro" are the
// Ultimate Battle conveyor intros (L10, L20 night, L30 pool — no loop, conveyor banks
// offer no choice).
// Per-track trim gains: the shipped tracks differ by ~10 dB RMS (mono-mix
// RMS after a 120 Hz highpass: night -14.2 dB, pool-battle-intro -14.0,
// pool-battle -16.9, pool -18.1, bowling -18.4, battle-intro -20.0,
// midwave -20.5, title -21.6, lawn -22.3, chooser-intro -22.4, battle -23.5,
// chooser-loop -23.9; SeedShopZen -29.6 on the same scale). All trims bring their track to the median RMS
// (TitleAndDave) with peak <= 1.0, so every
// tune — including the 0:06 chooser intro->loop handoff — plays at one
// consistent level. Applied on a dedicated trim node ahead of the per-
// source fade node, so fadeMusic/holdMusicFade ramps (which assume a 1.0
// base) are untouched.
const MUSIC_TRIM = {
  title: 1.0, lawn: 1.08, midwave: 0.88, pool: 0.67, battle: 1.23, bowling: 0.69,
  chooserIntro: 1.09, chooserLoop: 1.29, ultimateBattleIntro: 0.83,
  poolBattle: 0.58, poolBattleIntro: 0.42,
  night: 0.42, // USER REPLACEMENT ogg, highpassed-mono-mix normalized to the established median (title -23.875 dB HP / night -16.164 dB HP; peak-cap 1/1.0821 = 0.92)
  // USER REPLACEMENT night midwave, normalized the same way (title -23.875 dB
  // HP / night-midwave -15.831 dB HP; peak-cap 1/1.1642 = 0.86).
  nightMidwave: 0.40,
  // USER REQUEST track: 7.97 dB below the TitleAndDave median (mono-mix RMS
  // after a 120 Hz highpass: title -20.34 dB / seedshop -28.31 dB), so the
  // raw ratio 2.50 is peak-capped to 1/0.4336 = 2.31 (measured peak 0.4336).
  almanac: 2.31,
  shop: 2.31, // same attached track as the almanac
  // USER-ATTACHED fog tracks, normalized to the TitleAndDave median the same
  // way (mono-mix RMS after a 120 Hz highpass, measured in-page: title
  // -21.63 dB / fog -17.09 dB / fog-midwave -15.93 dB; raw ratios fog 0.593,
  // midwave 0.519; peaks fog 1.0052, midwave 1.0222 so no peak cap binds).
  fog: 0.59,
  fogMidwave: 0.52,
  // USER-ATTACHED Vasebreaker track (replacement Cerebrawl2.ogg),
  // normalized to the TitleAndDave median the same way (mono-mix RMS after
  // a 120 Hz highpass, measured in-page: title -21.63 dB / cerebrawl2
  // -20.14 dB; raw ratio 0.84; peak 0.9432 so no peak cap binds).
  cerebrawl: 0.84,
  // USER-ATTACHED roof track (Graze_The_Roof.mp3), normalized to the
  // TitleAndDave median the same way (mono-mix RMS after a 120 Hz highpass,
  // measured in-page: title -21.63 dB / roof -15.62 dB; raw ratio 0.50;
  // peak 1.0414, peak-cap 1/1.0414 = 0.96, so no cap binds).
  roof: 0.50,
};
const INTRO_TUNES = {
  chooser: { intro: "chooserIntro", loop: "chooserLoop" },
  chooserOnce: { intro: "chooserIntro", loop: null },
  ultimateIntro: { intro: "ultimateBattleIntro", loop: null },
  poolUltimateIntro: { intro: "poolBattleIntro", loop: null },
};
// Cut point inside the intro where the loop takes over (user request).
const CHOOSER_SWITCH_MS = 6000;
// Cut point where the front-lawn theme restarts (user request): 3:03
// (183000 ms). The shipped FrontLawnThemeTutorial.ogg runs 186.0s, so each
// restart overlaps the previous instance's ~3s tail: the old source keeps
// playing to its natural end under the fresh instance instead of cut off.
const LAWN_LOOP_MS = 183000;
// Cut point where the replacement night theme restarts (user request): the
// end of the file (108651 ms = 1:49). The attached FrontLawnNight.ogg runs
// 108.651s, so the chain loops back-to-back at full length instead of
// cutting early.
const NIGHT_LOOP_MS = 108651;
let lawnTimer = null; // pending restart for the lawn overlap chain
const lawnTails = new Set(); // previous lawn instances still playing out ({s,g})
let fadeTails = []; // lawn tails caught by an in-progress fadeMusic ramp
function clearLawnTimer() {
  if (lawnTimer) { try { clearTimeout(lawnTimer); } catch (e) { /* ignore */ } lawnTimer = null; }
}
function stopLawnTail(t) {
  lawnTails.delete(t);
  try { t.s.onended = null; } catch (e) { /* ignore */ }
  try { t.s.stop(); } catch (e) { /* ignore */ }
  try { t.s.disconnect(); } catch (e) { /* ignore */ }
  try { t.g.disconnect(); } catch (e) { /* ignore */ }
}
// Cut point where MidWaveA hands back to the lawn (user request): 1:13
// (73000 ms). MidWaveA runs 76.07s, so the handoff overlaps the same way —
// the midwave tail rings out under the fresh lawn instance, never cut off.
const MIDWAVE_MS = 73000;
// Cut point where the night midwave hands back to the night theme (user
// request): 0:45 (45000 ms). FrontLawnNightMidwaveA.ogg runs 52.94s, so the
// handoff overlaps the same way — the midwave tail rings out under the fresh
// night instance, never cut off.
const NIGHT_MIDWAVE_MS = 45000;
// Cut point where the pool theme restarts (user request): 2:13 (133000 ms).
// PoolTheme.mp3 runs 141.71s, so each restart overlaps the previous
// instance's ~8.7s tail the same way — old source rings out underneath,
// never cut off.
const POOL_LOOP_MS = 133000;
// Cut point where the Ultimate-Battle theme restarts (user request): 3:01.60
// (181600 ms). Ultimate-Battle.mp3 runs 185.43s, so the restart overlaps the
// ~3.8s tail — old source rings out underneath, never cut off.
const BATTLE_LOOP_MS = 181600;
// Cut point where the fog theme restarts (user request): the end of the file
// (110751 ms = 1:51). FogTheme.ogg runs 110.75s, so the chain loops at full
// length — the fresh instance starts as the old one ends.
const FOG_LOOP_MS = 110751;
// Cut point where FogThemeMidwaveA hands back to the fog theme (user
// request): 0:53 (53000 ms). FogThemeMidwaveA.ogg runs 59.67s, so the handoff
// overlaps the same way — the midwave tail rings out under the fresh fog
// instance, never cut off.
const FOG_MIDWAVE_MS = 53000;
// Cut point where the Ultimate-Battle-Pool theme restarts (user request):
// 3:01.50 (181500 ms). Ultimate-Battle-Pool.ogg runs 183.94s, so the restart
// overlaps the ~2.4s tail — old source rings out underneath, never cut off.
const POOL_BATTLE_LOOP_MS = 181500;
// Overlap-chain tunes: the day lawn, the night theme, and the fog theme all
// play as one-shot chains with overlap restarts (instead of seamless buffer
// loops) so the huge/final-wave midwave detour can cut in at the loop point.
// Cut point where the Cerebrawl (Vasebreaker 4-5) theme restarts (user
// request): 1:38.50 (98500 ms). Cerebrawl2.ogg runs 99.40s, so the restart
// overlaps the ~0.9s tail — old source rings out underneath, never cut off.
// Cut point where the Graze The Roof theme restarts (user request): 1:51.380
// (111380 ms). Graze_The_Roof.mp3 runs 117.28s, so the restart overlaps the
// ~5.9s tail — old source rings out underneath, never cut off. The fresh
// instance starts at 3.870s into the file (ROOF_RESTART_OFFSET_SEC), not
// from the beginning.
const CEREBRAWL_LOOP_MS = 98500;
const ROOF_LOOP_MS = 111380;
const ROOF_RESTART_OFFSET_SEC = 3.87;
// The pool, battle, pool-battle, cerebrawl, and roof tunes chain the same way
// (plain overlap restart, no midwave detour). Each entry carries its own loop point; the
// lawn/night/fog entries additionally carry their detour track and cut point.
// A restartOffset entry (seconds) starts the fresh instance into the file
// instead of from the beginning (roof skips its intro on every restart).
const TUNE_CHAIN = {
  lawn: { loopMs: LAWN_LOOP_MS, midwave: "midwave", midwaveMs: MIDWAVE_MS },
  night: { loopMs: NIGHT_LOOP_MS, midwave: "nightMidwave", midwaveMs: NIGHT_MIDWAVE_MS },
  fog: { loopMs: FOG_LOOP_MS, midwave: "fogMidwave", midwaveMs: FOG_MIDWAVE_MS },
  pool: { loopMs: POOL_LOOP_MS },
  battle: { loopMs: BATTLE_LOOP_MS },
  poolBattle: { loopMs: POOL_BATTLE_LOOP_MS },
  cerebrawl: { loopMs: CEREBRAWL_LOOP_MS },
  roof: { loopMs: ROOF_LOOP_MS, restartOffset: ROOF_RESTART_OFFSET_SEC },
};
// Branch decider for the chain loop points (registered by main.js, which
// owns the board state): return "midwave" when the huge-wave or final-wave
// banner is on screen, or when seven or more zombies are in play — anything
// else for a plain restart. Same conditions for the day, night, and fog chains.
let lawnBranch = null;
export function setLawnBranch(fn) { lawnBranch = fn; }
// Demote the current source to a tail (rings out to its natural end) and
// start `buf` as the new current source. offsetSec starts the fresh instance
// into the file (roof restarts); 0 plays from the beginning. Returns false
// when a superseding stop/switch landed first (the newcomer is dropped, old
// source untouched).
function chainOverlap(ctx, buf, key, phase, tok, offsetSec = 0) {
  const oldS = musicSrc, oldG = musicGain;
  const { s, g } = startMusicSource(ctx, buf, false, key, offsetSec);
  if (tok !== musicToken || !TUNE_CHAIN[musicWant]) {
    try { s.stop(); } catch (e) { /* ignore */ }
    try { s.disconnect(); } catch (e) { /* ignore */ }
    try { g.disconnect(); } catch (e) { /* ignore */ }
    return false;
  }
  if (oldS && oldG) {
    const tail = { s: oldS, g: oldG };
    lawnTails.add(tail);
    try {
      oldS.onended = () => {
        lawnTails.delete(tail);
        try { oldS.disconnect(); } catch (e) { /* ignore */ }
        try { oldG.disconnect(); } catch (e) { /* ignore */ }
      };
    } catch (e) { /* no audio device */ }
  }
  musicSrc = s; musicGain = g; musicPhase = phase;
  // Natural end (only reachable once the chain is cancelled — the timer is
  // gone but the play-out keeps going) drops the handle so a dead source
  // never reads as current. The next per-tick playMusic("lawn") then starts
  // a fresh chain, so a cancelled chain self-heals instead of going silent.
  try {
    s.onended = () => {
      if (tok === musicToken && musicSrc === s) { musicSrc = null; musicGain = null; }
      try { s.disconnect(); } catch (e) { /* ignore */ }
      try { g.disconnect(); } catch (e) { /* ignore */ }
    };
  } catch (e) { /* ignore */ }
  return true;
}
function armLawnTimer(ctx, buf, tok, ms, fn) {
  clearLawnTimer();
  lawnTimer = setTimeout(() => fn(ctx, buf, tok), ms);
}
// A chain loop point (3:03 day, full-file 1:49 night, end-of-file 1:51 fog,
// 2:13 pool, 3:01.60 battle, 3:01.50 pool-battle, 1:51.380 roof): plain overlap restart,
// unless the branch decider sees the huge-wave or final-wave banner — then
// the tune's midwave takes over (overlapped the same way) and hands back at
// the tune's cut point (1:13 day, 0:45 night, 0:53 fog). Tunes without a
// midwave entry always take the plain restart.
function chainLoopRestart(ctx, buf, tok) {
  lawnTimer = null;
  if (tok !== musicToken || !TUNE_CHAIN[musicWant]) return;
  const cfg = TUNE_CHAIN[musicWant];
  const tune = musicWant;
  let detour = false;
  try { detour = !!cfg.midwave && lawnBranch && lawnBranch() === "midwave"; } catch (e) { detour = false; }
  if (!detour) {
    try {
      if (chainOverlap(ctx, buf, tune, "loop", tok, cfg.restartOffset || 0)) armLawnTimer(ctx, buf, tok, cfg.loopMs, chainLoopRestart);
    } catch (e) { /* no audio device */ }
    return;
  }
  musicBuf(cfg.midwave).then((mbuf) => {
    if (tok !== musicToken || musicWant !== tune) return;
    try {
      if (chainOverlap(ctx, mbuf, cfg.midwave, "midwave", tok)) armLawnTimer(ctx, buf, tok, cfg.midwaveMs, midwaveEndRestart);
    } catch (e) { /* no audio device */ }
  }).catch(() => {
    // Midwave failed to load: fall back to a plain lawn restart so the
    // chain never stalls silent.
    if (tok !== musicToken || musicWant !== tune) return;
    try {
      if (chainOverlap(ctx, buf, tune, "loop", tok, cfg.restartOffset || 0)) armLawnTimer(ctx, buf, tok, cfg.loopMs, chainLoopRestart);
    } catch (e) { /* no audio device */ }
  });
}
// Midwave reached its cut point (1:13 day, 0:45 night, 0:53 fog): fresh chain-tune
// instance on top, midwave tail rings out underneath, next loop check armed.
// Unconditional — the detour always lasts exactly one midwave play.
function midwaveEndRestart(ctx, buf, tok) {
  lawnTimer = null;
  if (tok !== musicToken || !TUNE_CHAIN[musicWant]) return;
  const cfg = TUNE_CHAIN[musicWant];
  const tune = musicWant;
  try {
    if (chainOverlap(ctx, buf, tune, "loop", tok, cfg.restartOffset || 0)) armLawnTimer(ctx, buf, tok, cfg.loopMs, chainLoopRestart);
  } catch (e) { /* no audio device */ }
}
const musicBufs = new Map(); // name -> Promise<AudioBuffer>
let musicSrc = null, musicGain = null, musicName = null, musicWant = null;
let musicLoading = false, musicToken = 0, musicPhase = null; // phase: "intro"|"loop"|null
let chooserTimer = null, fading = false;
let fadeTimer = null, fadeSrc = null, fadeGain = null; // in-progress fadeMusic ramp (for holdMusicFade)
let musicTrimValue = 1; // trim of the current source (MUSIC_TRIM), for debugMusic
export function currentMusic() { return musicName; }
export function debugMusic() {
  return {
    want: musicWant, name: musicName, phase: musicPhase,
    ctx: actx ? actx.state : "none",
    playing: !!(musicSrc || fading) || !!musicSrc,
    loading: musicLoading, fading, trim: musicTrimValue,
    lawnTails: lawnTails.size, lawnTimer: !!lawnTimer,
  };
}
function musicBuf(name) {
  let p = musicBufs.get(name);
  if (!p) {
    p = fetchBuf("music", MUSIC[name]);
    p.catch(() => musicBufs.delete(name)); // let a later tick retry
    musicBufs.set(name, p);
  }
  return p;
}
function killMusicSrc() {
  if (chooserTimer) { try { clearTimeout(chooserTimer); } catch (e) { /* ignore */ } chooserTimer = null; }
  clearLawnTimer();
  for (const t of [...lawnTails]) { try { stopLawnTail(t); } catch (e) { /* ignore */ } }
  if (fadeTimer) { try { clearTimeout(fadeTimer); } catch (e) { /* ignore */ } fadeTimer = null; }
  fadeSrc = null; fadeGain = null; fadeTails = [];
  fading = false;
  if (musicSrc) {
    try { musicSrc.onended = null; } catch (e) { /* ignore */ }
    try { musicSrc.stop(); } catch (e) { /* ignore */ }
    try { musicSrc.disconnect(); } catch (e) { /* ignore */ }
    musicSrc = null;
  }
  if (musicGain) { try { musicGain.disconnect(); } catch (e) { /* ignore */ } musicGain = null; }
  musicPhase = null;
}
function startMusicSource(ctx, buf, loop, key, offsetSec = 0) {
  const g = ctx.createGain();
  g.gain.value = 1;
  g.connect(musicBus);
  const trim = ctx.createGain();
  trim.gain.value = MUSIC_TRIM[key] || 1;
  musicTrimValue = trim.gain.value;
  trim.connect(g);
  const s = ctx.createBufferSource();
  s.buffer = buf; s.loop = loop;
  s.connect(trim);
  // Chain-restart offset (roof): the fresh instance skips the file's intro.
  // Clamped inside the buffer so a short/misdecoded file still plays.
  const off = Math.max(0, offsetSec || 0);
  if (!loop && off > 0 && off < buf.duration - 0.05) s.start(0, off);
  else s.start();
  return { s, g };
}
function beginChooserLoop(ctx, tok) {
  if (tok !== musicToken || musicWant !== "chooser") return;
  musicLoading = true;
  musicBuf("chooserLoop").then((buf) => {
    if (tok !== musicToken || musicWant !== "chooser") { if (tok === musicToken) musicLoading = false; return; }
    musicLoading = false;
    try {
      killMusicSrc();
      const { s, g } = startMusicSource(ctx, buf, true, "chooserLoop");
      if (tok !== musicToken || musicWant !== "chooser") { try { s.stop(); } catch (e) {} try { s.disconnect(); } catch (e) {} try { g.disconnect(); } catch (e) {} return; }
      musicSrc = s; musicGain = g; musicPhase = "loop";
    } catch (e) { /* no audio device */ }
  }).catch(() => { if (tok === musicToken) musicLoading = false; });
}
export function playMusic(name) {
  musicWant = name;
  if (!MUSIC[name] && !INTRO_TUNES[name]) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  // Already current (playing, decoding-and-starting, scheduled chooser
  // switch, scheduled lawn restart, or fading): nothing to do. The loading flag keeps per-tick
  // calls from piling up duplicate starts while the buffer decodes; a
  // failed load clears it so the next tick retries.
  if (musicName === name && (musicSrc || musicLoading || chooserTimer || lawnTimer || fading)) return;
  const tune = INTRO_TUNES[name];
  if (tune) {
    const tok = ++musicToken;
    killMusicSrc();
    musicName = name;
    musicLoading = true;
    musicBuf(tune.intro).then((buf) => {
      if (tok !== musicToken || musicWant !== name) { if (tok === musicToken) musicLoading = false; return; }
      musicLoading = false;
      try {
        const { s, g } = startMusicSource(ctx, buf, false, tune.intro);
        // A superseding stop/switch landed while starting: drop this one.
        if (tok !== musicToken || musicWant !== name) { try { s.stop(); } catch (e) {} try { s.disconnect(); } catch (e) {} try { g.disconnect(); } catch (e) {} return; }
        // The intro is a one-shot: drop the handle when it ends so a dead
        // source never reads as current. The musicSrc === s guard keeps a
        // stale end-event from clearing the loop source after a 0:06 switch.
        try { s.onended = () => { if (tok === musicToken && musicSrc === s) { musicSrc = null; musicGain = null; } }; } catch (e) {}
        musicSrc = s; musicGain = g; musicPhase = "intro";
        // At 0:06 into the intro the loop takes over (chooser only — the
        // other intro tunes have no loop key).
        if (tune.loop) chooserTimer = setTimeout(() => { chooserTimer = null; beginChooserLoop(ctx, tok); }, CHOOSER_SWITCH_MS);
      } catch (e) { /* no audio device */ }
    }).catch(() => { if (tok === musicToken) musicLoading = false; });
    return;
  }
  const tok = ++musicToken;
  killMusicSrc();
  musicName = name;
  musicLoading = true;
  musicBuf(name).then((buf) => {
    if (tok !== musicToken || musicWant !== name) { if (tok === musicToken) musicLoading = false; return; }
    musicLoading = false;
    try {
      // Chain tunes (day lawn, night, fog, pool, battle, pool-battle): one-shot
      // play with an overlap restart at the tune's loop point (the tail
      // rings out under the fresh instance) instead of a seamless buffer
      // loop, so the huge/final-wave midwave detour can cut in on the
      // lawn/night/fog chains. Every other level tune uses a plain loop.
      const cfg = TUNE_CHAIN[name];
      const loop = !cfg;
      const { s, g } = startMusicSource(ctx, buf, loop, name);
      // A superseding stop/switch landed while starting: drop this one.
      if (tok !== musicToken || musicWant !== name) { try { s.stop(); } catch (e) {} try { s.disconnect(); } catch (e) {} try { g.disconnect(); } catch (e) {} return; }
      musicSrc = s; musicGain = g; musicPhase = "loop";
      if (cfg) {
        // Natural end (only reachable once the chain is cancelled — the
        // timer is gone but the play-out keeps going) drops the handle.
        try {
          s.onended = () => {
            if (tok === musicToken && musicSrc === s) { musicSrc = null; musicGain = null; }
            try { s.disconnect(); } catch (e) { /* ignore */ }
            try { g.disconnect(); } catch (e) { /* ignore */ }
          };
        } catch (e) { /* ignore */ }
        clearLawnTimer();
        lawnTimer = setTimeout(() => chainLoopRestart(ctx, buf, tok), cfg.loopMs);
      }
    } catch (e) { /* no audio device */ }
  }).catch(() => { if (tok === musicToken) musicLoading = false; });
}
// Sexy MusicInterface::FadeOut (CutScene 1336/1343, Board 1956): ramp the
// current tune out over ms, then stop. Idempotent across per-tick calls.
// NOTE: source FadeOut takes 100Hz logic TICKS (Music::MusicUpdate decrements
// the counter once per tick), so FadeOut(150/200/50) = 1500/2000/500ms —
// callers must pass milliseconds here, not raw tick counts.
export function fadeMusic(ms = 1500) {
  if (!musicSrc && !musicLoading && !chooserTimer && !lawnTimer && lawnTails.size === 0) {
    if (!fading) { musicWant = null; musicToken++; musicName = null; }
    return;
  }
  if (fading) return;
  musicWant = null; musicToken++;
  const tok = musicToken;
  musicLoading = false;
  if (chooserTimer) { try { clearTimeout(chooserTimer); } catch (e) { /* ignore */ } chooserTimer = null; }
  clearLawnTimer();
  const tails = [...lawnTails]; lawnTails.clear();
  const s = musicSrc, g = musicGain;
  musicSrc = null; musicGain = null; musicPhase = null;
  const all = [];
  if (s && g) all.push({ s, g });
  for (const t of tails) all.push(t);
  if (!all.length) { musicName = null; return; }
  fading = true;
  fadeSrc = s; fadeGain = g; fadeTails = tails;
  const ctx = actx, dur = Math.max(1, ms) / 1000;
  try {
    const t = ctx ? ctx.currentTime : 0;
    for (const a of all) {
      a.g.gain.cancelScheduledValues(t);
      a.g.gain.setValueAtTime(Math.max(0.0001, a.g.gain.value), t);
      a.g.gain.linearRampToValueAtTime(0.0001, t + dur);
    }
  } catch (e) { /* fall through to immediate stop */ }
  fadeTimer = setTimeout(() => {
    fadeTimer = null;
    for (const a of all) {
      try { a.s.onended = null; } catch (e) { /* ignore */ }
      try { a.s.stop(); } catch (e) { /* ignore */ }
      try { a.s.disconnect(); } catch (e) { /* ignore */ }
      try { a.g.disconnect(); } catch (e) { /* ignore */ }
    }
    if (tok === musicToken) { fading = false; musicName = null; fadeSrc = null; fadeGain = null; fadeTails = []; }
  }, Math.max(1, ms) + 50);
}
// Pause an in-progress fadeMusic ramp and hold the tune at a steady volume
// (L10 Ultimate Battle intro: the pan-back fade holds when the camera
// reaches the house, then resumes halfway through Ready-Set-Plant). Clears
// the fade's stop timer, pins the gain (explicit vol when given, else the
// current ramped value), and re-attaches the source so it reads as current
// and a later fadeMusic resumes from the held level. Returns false when no
// fade was in progress (nothing held).
export function holdMusicFade(vol = null) {
  if (!fading || (!fadeSrc && !fadeTails.length)) return false;
  if (fadeTimer) { try { clearTimeout(fadeTimer); } catch (e) { /* ignore */ } fadeTimer = null; }
  const s = fadeSrc, g = fadeGain, tails = fadeTails;
  fadeSrc = null; fadeGain = null; fadeTails = [];
  fading = false;
  let v = vol;
  const holdOne = (gg) => {
    let vv = v;
    if (!(vv > 0)) { try { vv = gg.gain.value; } catch (e) { vv = 1; } }
    try {
      const ctx = actx, t = ctx ? ctx.currentTime : 0;
      gg.gain.cancelScheduledValues(t);
      gg.gain.setValueAtTime(Math.max(0.0001, vv), t);
    } catch (e) { /* keep playing at whatever level */ }
  };
  if (g) holdOne(g);
  for (const t of tails) holdOne(t.g);
  // Lawn tails held alongside the fade go back to ringing out underneath.
  for (const t of tails) lawnTails.add(t);
  if (s && g) { musicSrc = s; musicGain = g; }
  musicPhase = (musicName === "lawn") ? "loop" : "intro";
  return true;
}
export function stopMusic() {
  musicWant = null; musicToken++;
  musicLoading = false;
  killMusicSrc();
  musicName = null; musicPhase = null;
}
export function unlockMusic() {
  const ctx = ensureCtx();
  if (!ctx) return;
  if (musicWant && !musicSrc && !musicLoading && !lawnTimer && !fading) {
    const w = musicWant;
    musicName = null; // force the restart path in playMusic
    playMusic(w);
  }
}
export function preloadMusic() {
  for (const n of Object.keys(MUSIC)) { try { musicBuf(n).catch(() => {}); } catch (e) { /* ignore */ } }
}

// ---------- sound effects ----------
const sfxBufs = new Map(); // name -> Promise<AudioBuffer>
function sfxBuf(name) {
  let p = sfxBufs.get(name);
  if (!p) {
    p = fetchBuf("sounds", FILES[name]);
    p.catch(() => sfxBufs.delete(name)); // retry on next sfx() call
    sfxBufs.set(name, p);
  }
  return p;
}
// ---------- looped foleys (PlayFoley/StopFoley pairs, e.g. FOLEY_DIGGER for
// the sod roll + digger-zombie digging) ----------
const loopSrcs = new Map(); // name -> BufferSource
export function startLoop(name) {
  if (!enabled || !FILES[name] || loopSrcs.has(name)) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  sfxBuf(name).then((buf) => {
    if (!enabled || loopSrcs.has(name)) return;
    try {
      const s = ctx.createBufferSource();
      s.buffer = buf; s.loop = true;
      s.connect(sfxBus);
      s.start();
      loopSrcs.set(name, s);
    } catch (e) { /* no audio device */ }
  }).catch(() => { /* fetch/decode failed */ });
}
export function stopLoop(name) {
  const s = loopSrcs.get(name);
  loopSrcs.delete(name);
  if (!s) return;
  try { s.onended = null; } catch (e) { /* ignore */ }
  try { s.stop(); } catch (e) { /* ignore */ }
  try { s.disconnect(); } catch (e) { /* ignore */ }
}
// Board::Pause (Board.cpp:4768) also pauses music + foley (GamePause /
// GameMusicPause). Our one-shots keep playing for UI feedback (retail only
// mutes MUTE_ON_PAUSE foley); the music bus ducks to 0 while paused and
// restores after. The tune keeps playing silently underneath (retail pauses
// the stream; position drift during the pause is the accepted deviation).
export function setMusicPaused(p) {
  if (musicBus) musicBus.gain.value = p ? 0 : musicVol;
}
export function stopAllLoops() {
  // LawnApp::CancelPausedFoleyLoop equivalent for our named loop map.
  for (const n of [...loopSrcs.keys()]) stopLoop(n);
}
export function sfx(name, vol = 1, pitch) {
  if (!enabled || !FILES[name]) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  // Retail pitch (TodFoley PlayFoley 290-292): uniform Sexy::Rand(range)
  // semitones — [0, range) for positive ranges, (range, 0] for negative.
  // An explicit pitch (spike's raw-sample 0, mower-gold climb) wins; only
  // nonzero resolves to a playbackRate (2^(steps/12), DSoundInstance).
  if (pitch === undefined) {
    const r = PITCH[name];
    pitch = r ? Math.random() * r : 0;
  }
  const rate = pitch ? Math.pow(2, pitch / 12) : 1;
  sfxBuf(name).then((buf) => {
    if (!enabled) return;
    try {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      if (rate !== 1) s.playbackRate.value = rate;
      // Per-call output level (user mix overrides; retail PlayFoley has no
      // per-call volume — everything plays full). vol=1 connects straight
      // to the bus; lower values go through a one-shot gain stage.
      if (vol >= 0.999) s.connect(sfxBus);
      else { const g = ctx.createGain(); g.gain.value = Math.max(0, vol); s.connect(g); g.connect(sfxBus); }
      s.start();
    } catch (e) { /* no audio device */ }
  }).catch(() => { /* fetch/decode failed */ });
}
export function preloadAll() {
  for (const n of Object.keys(FILES)) { try { sfxBuf(n).catch(() => {}); } catch (e) { /* ignore */ } }
}
// ---------- stoppable dancer sting (FOLEY_DANCER) ----------
// sfx() one-shots can't be stopped, but retail kills the DANCER channel early
// via StopFoley once the last headed on-board dancer/backup dies
// (StopZombieSound 7439-7442), so the sting rides its own tracked source.
// ONE_AT_A_TIME (TodFoley flags 6U): a new sting restarts the channel.
// SYNC RACE (the "music plays on after death" bug): sfxBuf resolves
// asynchronously (fetch + decode, many ticks on first play), but the sim
// calls stop in the SAME tick as the snap when the troupe dies instantly
// (e.g. cherry on the snap tick). The stop then lands on dancerSrc === null
// — a no-op — and the pending start sounds anyway, playing the full 17s
// file with no dancers alive. Retail's PlayFoley/StopFoley are synchronous
// channel ops, so generation-guard the async start: a stop (or a newer
// sting) invalidates any start still in flight.
let dancerSrc = null;
let stingGen = 0;
export function playSting() {
  if (!enabled || !FILES.dancer) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  stopSting();
  const gen = ++stingGen;
  sfxBuf("dancer").then((buf) => {
    if (!enabled || gen !== stingGen) return; // stopped/restarted while decoding — never start
    try {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.connect(sfxBus);
      s.onended = () => { if (dancerSrc === s) dancerSrc = null; };
      dancerSrc = s;
      s.start();
    } catch (e) { /* no audio device */ }
  }).catch(() => { /* fetch/decode failed */ });
}
export function stopSting() {
  stingGen++; // a start still decoding must never sound
  const s = dancerSrc; dancerSrc = null;
  if (!s) return;
  try { s.onended = null; } catch (e) { /* ignore */ }
  try { s.stop(); } catch (e) { /* ignore */ }
  try { s.disconnect(); } catch (e) { /* ignore */ }
}
