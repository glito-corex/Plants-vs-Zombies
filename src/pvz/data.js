// Game data transcribed from the decompilation source (do not invent values):
//   Lawn/Plant.cpp gPlantDefs — cost / refresh / launchRate per seed
//   Lawn/Zombie.cpp gZombieDefs — value / startingLevel / firstAllowedWave / pickWeight
//   LawnApp.cpp GetAwardSeedForLevel / GetSeedsAvailable — unlock rules
//   Lawn/Board.cpp PickBackground / GridToPixel / GetNumSeedsInBank — stage rules
//   GameConstants.h — board geometry + tuning constants
import { ZOMBIE_WAVES, ZOMBIE_ALLOWED } from "./tables.js";
export { ZOMBIE_WAVES, ZOMBIE_ALLOWED };

// ---- board geometry (GameConstants.h, grid retuned to the unedited art) ----
// Retail logic uses 80px cells from x=40, but the shipped art's checker runs
// ~83px cells from x≈23 (measured art edges 243..991 => board 23..771, rows
// 76..576 — see scratch/CURRENT_TASK.md lawn-fit session). The art stays
// untouched, so the GRID follows the visual lawn: plants center in the
// painted cells. Linear fit residual is ±6px mid-lawn (art cells wobble).
export const BOARD_W = 800, BOARD_H = 600;
// Day/night keep the retuned fit (measured bg1/bg2 grass left image ~248 =>
// board ~28, fit 23 + 83px cells). Pool/fog/roof/boss art matches the retail
// geometry (measured bg3 grass + water left image 260-264 => board 40-44),
// so those stages use the source 40 + 80px cells. Y was already bg-aware.
export const LAWN_XMIN = 23, LAWN_YMIN = 80, LAWN_YMIN_DAY = 76;
export const CELL_W = 83;
export const LAWN_XMIN_DAY = 23, CELL_W_DAY = 83;
export const LAWN_XMIN_SRC = 40, CELL_W_SRC = 80;
export function lawnXMin(bg) { return (bg === BG.POOL || bg === BG.FOG || bg === BG.ROOF || bg === BG.BOSS) ? LAWN_XMIN_SRC : LAWN_XMIN_DAY; }
export function cellW(bg) { return (bg === BG.POOL || bg === BG.FOG || bg === BG.ROOF || bg === BG.BOSS) ? CELL_W_SRC : CELL_W_DAY; }
export const ROW_H_DAY = 100, ROW_H_POOL = 85, ROW_H_ROOF = 85;
export const MAX_COLS = 9, MAX_ROWS = 6;
export const SEED_PACKET_W = 50, SEED_PACKET_H = 70;

// ---- tuning (GameConstants.h) ----
export const SUN_FIRST_DROP = 425, SUN_DROP_RANGE = 275, SUN_DROP_MAX = 950; // ticks (100/sec)
export const WAVE_FIRST = 1800, WAVE_GAP = 2500, WAVE_GAP_RANGE = 600, WAVE_PRE_FLAG = 4500, WAVE_GAP_MIN = 400;

// ---- backgrounds ----
export const BG = { DAY: 1, NIGHT: 2, POOL: 3, FOG: 4, ROOF: 5, BOSS: 6 };
// Vasebreaker adventure level (LawnApp::IsScaryPotterLevel adventure branch:
// mGameMode ADVENTURE && mLevel == 35).
export function isVasebreaker(level) { return level === 35; } // adventure L35 (LawnApp::IsScaryPotterLevel 2167)
export function vaseBank() { return [2]; } // SEED_CHERRYBOMB (Board.cpp:1540-1544)
// Stormy-night adventure level (LawnApp::IsStormyNightLevel 2176-2185:
// GAMEMODE_CHALLENGE_STORMY_NIGHT or adventure mLevel == 40).
export function isStormyNightLevel(level) { return level === 40; } // adventure L40

export function backgroundForLevel(level) {
  if (isVasebreaker(level)) return BG.NIGHT; // PickBackground checks scary BEFORE the fog branch (Board.cpp:887-890)
  if (level <= 10) return BG.DAY;
  if (level <= 20) return BG.NIGHT;
  if (level <= 30) return BG.POOL;
  if (level <= 40) return BG.FOG;
  if (level < 50) return BG.ROOF;
  return BG.BOSS;
}
export const BG_IMAGE = { 1: "background1.png", 2: "background2.png", 3: "background3.png", 4: "background4.png", 5: "background5.png", 6: "background6boss.png" };
export function stageRows(bg) { return (bg === BG.POOL || bg === BG.FOG) ? 6 : 5; }
export function rowH(bg) { return bg === BG.DAY || bg === BG.NIGHT ? ROW_H_DAY : ROW_H_POOL; }
export function gridToPixelX(col, bg) { return col * cellW(bg) + lawnXMin(bg); }
export function gridToPixelY(col, row, bg) {
  let y;
  if (bg === BG.ROOF || bg === BG.BOSS) {
    const slope = col < 5 ? (5 - col) * 20 : 0;
    y = row * 85 + slope + LAWN_YMIN - 10;
  } else if (bg === BG.POOL || bg === BG.FOG) y = row * 85 + LAWN_YMIN;
  else y = row * 100 + LAWN_YMIN_DAY;
  return y;
}
export function pixelToGrid(x, y, bg) {
  const xmin = lawnXMin(bg), cw = cellW(bg);
  if (x < xmin) return { col: -1, row: -1 };
  const col = Math.min(8, Math.floor((x - xmin) / cw));
  if (y < LAWN_YMIN) return { col, row: -1 };
  let row;
  // Roof (Board.cpp:9055-9062): subtract (4-col)*20 on cols 0-4, then clamp
  // to [0,4] (ClampInt) — the y<LAWN_YMIN guard above already returned -1.
  if (bg === BG.ROOF || bg === BG.BOSS) row = Math.max(0, Math.min(4, Math.floor((y - LAWN_YMIN - (col >= 0 && col < 5 ? (4 - col) * 20 : 0)) / 85)));
  else if (bg === BG.POOL || bg === BG.FOG) row = Math.min(5, Math.floor((y - LAWN_YMIN) / 85));
  else if (y < LAWN_YMIN_DAY) return { col, row: -1 };
  else row = Math.min(4, Math.floor((y - LAWN_YMIN_DAY) / 100));
  return { col, row };
}

// ---- seed unlock: GetAwardSeedForLevel / GetSeedsAvailable (LawnApp.cpp) ----
export function awardSeedForLevel(level) {
  const area = Math.floor((level - 1) / 10) + 1;
  const sub = ((level - 1) % 10) + 1;
  let got = (area - 1) * 8 + sub;
  if (sub >= 10) got -= 2;
  else if (sub >= 5) got -= 1;
  return Math.min(got, 40);
}
export function seedsAvailable(playerLevel) {
  if (playerLevel > 50) return 49;
  return Math.min(49, awardSeedForLevel(playerLevel));
}

// ---- SeedType (ConstEnums.h order = unlock order) ----
export const SEED_NAMES = ["Peashooter","Sunflower","Cherry Bomb","Wall-nut","Potato Mine","Snow Pea","Chomper","Repeater","Puff-shroom","Sun-shroom","Fume-shroom","Grave Buster","Hypno-shroom","Scaredy-shroom","Ice-shroom","Doom-shroom","Lily Pad","Squash","Threepeater","Tangle Kelp","Jalapeno","Spikeweed","Torchwood","Tall-nut","Sea-shroom","Plantern","Cactus","Blover","Split Pea","Starfruit","Pumpkin","Magnet-shroom","Cabbage-pult","Flower Pot","Kernel-pult","Coffee Bean","Garlic","Umbrella Leaf","Marigold","Melon-pult","Gatling Pea","Explode-o-nut"];
// Plant::GetToolTip (Plant.cpp:5106-5111) = the [PLANTNAME_TOOLTIP] LawnString,
// indexed by SeedType. Same order as SEED_NAMES above (retail US strings from
// LawnStrings-en; Gatling keeps its retail embedded newline).
export const SEED_TOOLTIPS = ["Shoots peas at the enemy","Gives you additional sun","Blows up all zombies in an area","Blocks off zombies and protects your other plants","Explodes on contact, but takes time to arm itself","Shoots frozen peas that damage and slow the enemy","Devours a zombie whole, but is vulnerable while chewing","Fires two peas at a time","Shoots short-ranged spores at the enemy","Gives small sun at first and normal sun later","Shoots fumes that can pass through screen doors","Plant it on a grave to remove the grave","Makes a zombie fight for you","Long-ranged shooter that hides when enemies get near it","Temporarily immobilizes all zombies on the screen","Destroys a large area, leaving a crater in its wake","Lets you plant non-aquatic plants on top of it","Squashes zombies","Shoots peas in three lanes","Aquatic plant that pulls a zombie underwater","Destroys an entire lane of zombies","Pops tires and hurts zombies that step on it","Peas that pass through it turn into fireballs","Heavy-duty wall that can't be vaulted over","Aquatic plant that shoots short-ranged spores","Lights up an area, letting you see through fog","Shoots spikes that can pop balloons","Blows away all balloon zombies and fog","Shoots peas forward and backwards","Shoots stars in 5 directions","Protects plants that are within its shell","Removes helmets and other metal objects from zombies","Hurls cabbages at the enemy","Lets you plant on the roof","Flings corn kernels and butter at zombies","Plant it on a mushroom to wake it up","Diverts zombies into other lanes","Protects nearby plants from bungees and catapults","Gives you silver and gold coins","Does heavy damage to groups of zombies","Shoots four peas at a time\n(requires repeater)","Explodes on contact"];
// plant defs: {cost, refreshTicks(1/100s), launchRate, reanimFile, packet:[scale,offX,offY] via SeedPacket.cpp}
export const PLANTS = [
  { cost: 100, refresh: 750,  launch: 150,  reanim: "PeaShooterSingle", head: "anim_head_idle", stem: "anim_stem" },
  { cost: 50,  refresh: 750,  launch: 2500, reanim: "SunFlower" },
  { cost: 150, refresh: 5000, launch: 0,    reanim: "CherryBomb" },
  { cost: 50,  refresh: 3000, launch: 0,    reanim: "Wallnut" },
  { cost: 25,  refresh: 3000, launch: 0,    reanim: "PotatoMine" },
  { cost: 175, refresh: 750,  launch: 150,  reanim: "SnowPea", head: "anim_head_idle", stem: "anim_stem" },
  { cost: 150, refresh: 750,  launch: 0,    reanim: "Chomper" },
  { cost: 200, refresh: 750,  launch: 150,  reanim: "PeaShooter", head: "anim_head_idle", stem: "anim_stem" },
  { cost: 0,   refresh: 750,  launch: 150,  reanim: "Puffshroom" },
  { cost: 25,  refresh: 750,  launch: 2500, reanim: "Sunshroom" },
  { cost: 75,  refresh: 750,  launch: 150,  reanim: "Fumeshroom" },
  { cost: 75,  refresh: 750,  launch: 0,    reanim: "Gravebuster" },
  { cost: 75,  refresh: 3000, launch: 0,    reanim: "Hypnoshroom" },
  { cost: 25,  refresh: 750,  launch: 150,  reanim: "ScaredyShroom" },
  { cost: 75,  refresh: 5000, launch: 0,    reanim: "Iceshroom" },
  { cost: 125, refresh: 5000, launch: 0,    reanim: "DoomShroom" },
  { cost: 25,  refresh: 750,  launch: 0,    reanim: "Lilypad" },
  { cost: 50,  refresh: 3000, launch: 0,    reanim: "Squash" },
  { cost: 325, refresh: 750,  launch: 150,  reanim: "ThreePeater", heads: [{ play: "anim_head_idle1", on: "anim_head1", shoot: "anim_shooting1" }, { play: "anim_head_idle2", on: "anim_head2", shoot: "anim_shooting2" }, { play: "anim_head_idle3", on: "anim_head3", shoot: "anim_shooting3" }] },
  { cost: 25,  refresh: 3000, launch: 0,    reanim: "Tanglekelp" },
  { cost: 125, refresh: 5000, launch: 0,    reanim: "Jalapeno" },
  { cost: 100, refresh: 750,  launch: 0,    reanim: "Caltrop" },
  { cost: 175, refresh: 750,  launch: 0,    reanim: "Torchwood" },
  { cost: 125, refresh: 3000, launch: 0,    reanim: "Tallnut" },
  { cost: 0,   refresh: 3000, launch: 150,  reanim: "Seashroom" },
  { cost: 25,  refresh: 3000, launch: 2500, reanim: "Plantern" },
  { cost: 125, refresh: 750,  launch: 150,  reanim: "Cactus" },
  { cost: 100, refresh: 750,  launch: 0,    reanim: "Blover" },
  { cost: 125, refresh: 750,  launch: 150,  reanim: "SplitPea", heads: [{ play: "anim_head_idle", on: "anim_idle", shoot: "anim_shooting" }, { play: "anim_splitpea_idle", on: "anim_idle", shoot: "anim_splitpea_shooting" }] },
  { cost: 125, refresh: 750,  launch: 150,  reanim: "Starfruit" },
  { cost: 125, refresh: 3000, launch: 0,    reanim: "Pumpkin" },
  { cost: 100, refresh: 750,  launch: 0,    reanim: "Magnetshroom" },
  { cost: 100, refresh: 750,  launch: 300,  reanim: "Cabbagepult" },
  { cost: 25,  refresh: 750,  launch: 0,    reanim: "Pot" },
  { cost: 100, refresh: 750,  launch: 300,  reanim: "Cornpult" },
  { cost: 75,  refresh: 750,  launch: 0,    reanim: "Coffeebean" },
  { cost: 50,  refresh: 750,  launch: 0,    reanim: "Garlic" },
  { cost: 100, refresh: 750,  launch: 0,    reanim: "Umbrellaleaf" },
  { cost: 50,  refresh: 3000, launch: 2500, reanim: "Marigold" },
  { cost: 300, refresh: 750,  launch: 300,  reanim: "Melonpult" },
  { cost: 250, refresh: 5000, launch: 150,  reanim: "GatlingPea", head: "anim_head_idle", stem: "anim_stem" },
  // SEED_EXPLODE_O_NUT (ConstEnums.h 1061, Plant.cpp:74): cost 0, refresh
  // 3000, same Wallnut reanim, red-tinted (PlantInitialize 270-273,
  // UpdateReanimColor 2696-2699). Our index 41 maps retail 49.
  { cost: 0,   refresh: 3000, launch: 0,    reanim: "Wallnut" },
];
// shooters among upgrade-excluded etc. — subclass: 1 = shooter (uses head attach)
const SHOOTERS = new Set([0, 5, 7, 8, 10, 13, 18, 24, 26, 28, 29, 32, 34, 39, 40]);
export function isShooter(seed) { return SHOOTERS.has(seed); }

// ---- conveyor belt (Board::HasConveyorBeltSeedBank 8775, SeedBank 1007-1156,
// Challenge::UpdateConveyorBelt 1621-1922) ----
// Retail adventure conveyor levels are 5 (bowling), 10/20/30 (mini-boss) and
// 25 (Big Trouble Little Zombie) — in scope: L5 bowling + L10/L20/L30
// mini-boss + L25 little-trouble (IsLittleTroubleLevel 2161-2164: adventure
// mLevel == 25). L10 belt table = the retail mLevel == 10 table (Challenge
// 1653-1670); start values mirror the retail mini-boss branch
// (Challenge::StartLevel 501-506): zombieCd 100, convCd 200, empty belt, no
// pre-plants — NOT the L5 bowling values. L25 (Challenge::StartLevel 450-455)
// instead rides the stormy/bungee branch: zombieCd 200, convCd 200, empty
// belt.
export function isBowlingLevel(level) { return level === 5; } // LawnApp::IsWallnutBowlingLevel adventure branch (2131-2140)
export function hasConveyorBelt(level) { return level === 5 || level === 10 || level === 20 || level === 30 || level === 25 || level === 40; } // adventure conveyors in scope: L5 bowling + L10/L20/L30 mini-boss (IsMiniBossLevel 2200-2209) + L25 little-trouble (IsLittleTroubleLevel 2161-2164) + L40 stormy-night (IsStormyNightLevel 2176-2185)
export const CONVEYOR_SPEED = 4; // SeedPacket.h:8, SeedBank::UpdateConveyorBelt
export const CONVEYOR_SLOTS = 10; // Board::GetNumSeedsInBank conveyor branch
// Challenge::UpdateConveyorBelt adventure-5 table (1761-1768): WALLNUT 85,
// EXPLODE_O_NUT 15. Our explode index 41 maps retail SEED_EXPLODE_O_NUT.
export const CONVEYOR_SEEDS_5 = [{ seed: 3, w: 85 }, { seed: 41, w: 15 }];
// L10 mini-boss belt (Challenge::UpdateConveyorBelt 1653-1670: PEASHOOTER 20,
// CHERRYBOMB 20, WALLNUT 15, REPEATER 20, SNOWPEA 10, CHOMPER 5, POTATOMINE
// 10), indices in our SEED_NAMES order (pea 0, cherry 2, wallnut 3, potato
// 4, snow 5, chomper 6, repeater 7). All 7 unlock by L9 (repeater is the L8
// award), so every packet is plantable.
export const CONVEYOR_SEEDS_10 = [
  { seed: 0, w: 20 }, { seed: 2, w: 20 }, { seed: 3, w: 15 }, { seed: 7, w: 20 },
  { seed: 5, w: 10 }, { seed: 6, w: 5 }, { seed: 4, w: 10 },
];
// L20 night mini-boss belt (Challenge::UpdateConveyorBelt mLevel == 20 branch,
// Challenge.cpp 1671-1688: GRAVEBUSTER 20, ICESHROOM 15, DOOMSHROOM 15,
// HYPNOSHROOM 10, SCAREDYSHROOM 15, FUMESHROOM 15, PUFFSHROOM 10), indices in
// our SEED_NAMES order (puff 8, fume 10, gravebuster 11, hypno 12, scaredy 13,
// ice 14, doom 15). All 7 unlock by L20 (doom is the L15 award).
export const CONVEYOR_SEEDS_20 = [
  { seed: 11, w: 20 }, { seed: 14, w: 15 }, { seed: 15, w: 15 }, { seed: 12, w: 10 },
  { seed: 13, w: 15 }, { seed: 10, w: 15 }, { seed: 8, w: 10 },
];
// L30 pool mini-boss belt (Challenge::UpdateConveyorBelt mLevel == 30 branch:
// LILYPAD 25, SQUASH 5, THREEPEATER 25, TANGLEKELP 5, JALAPENO 10, SPIKEWEED
// 10, TORCHWOOD 10, TALLNUT 10), indices in our SEED_NAMES order (lily 16,
// squash 17, threepeater 18, tanglekelp 19, jalapeno 20, spikeweed 21,
// torchwood 22, tallnut 23).
export const CONVEYOR_SEEDS_30 = [
  { seed: 16, w: 25 }, { seed: 17, w: 5 }, { seed: 18, w: 25 }, { seed: 19, w: 5 },
  { seed: 20, w: 10 }, { seed: 21, w: 10 }, { seed: 22, w: 10 }, { seed: 23, w: 10 },
];
// L40 stormy-night belt (Challenge::UpdateConveyorBelt mLevel == 40 branch,
// Challenge.cpp 1709-1728 — checked BEFORE the generic IsStormyNightLevel
// branch, so adventure 40 takes this table, not the challenge-mode one:
// LILYPAD 25, SEASHROOM 10, MAGNETSHROOM 5, BLOVER 5, CACTUS 15, STARFRUIT 25,
// SPLITPEA 5, PUMPKINSHELL 10), indices in our SEED_NAMES order (lily 16,
// seashroom 24, cactus 26, blover 27, splitpea 28, starfruit 29, pumpkin 30,
// magnetshroom 31). All 8 unlock by L40 (magnet is the L32 award).
export const CONVEYOR_SEEDS_40 = [
  { seed: 16, w: 25 }, { seed: 24, w: 10 }, { seed: 31, w: 5 }, { seed: 27, w: 5 },
  { seed: 26, w: 15 }, { seed: 29, w: 25 }, { seed: 28, w: 5 }, { seed: 30, w: 10 },
];
// L25 Big Trouble Little Zombie belt (Challenge::UpdateConveyorBelt
// IsLittleTroubleLevel branch, Challenge.cpp 1769-1780: LILYPAD 25,
// WALLNUT 15, PEASHOOTER 25, CHERRYBOMB 35), indices in our SEED_NAMES
// order (pea 0, cherry 2, wallnut 3, lily 16). The generic pick rules in
// convUpdatePick (Challenge 1864-1916: gravebuster cap, lilypad ramp,
// count>=4 -> 1, count>=3 -> 5, last-type halving) apply unchanged — lily
// counts lawn + belt lilies toward its 0-18 ramp.
export const CONVEYOR_SEEDS_25 = [
  { seed: 16, w: 25 }, { seed: 3, w: 15 }, { seed: 0, w: 25 }, { seed: 2, w: 35 },
];
export function conveyorSeedTable(level) {
  if (level === 5) return CONVEYOR_SEEDS_5;
  if (level === 10) return CONVEYOR_SEEDS_10;
  if (level === 20) return CONVEYOR_SEEDS_20;
  if (level === 30) return CONVEYOR_SEEDS_30;
  if (level === 25) return CONVEYOR_SEEDS_25;
  if (level === 40) return CONVEYOR_SEEDS_40;
  return null;
}
// Board::GetSeedPacketPositionX conveyor branch (8935): i*50+91.
export function conveyorPacketX(i) { return i * 50 + 91; }

// ---- ZombieType (ConstEnums.h) + gZombieDefs (Zombie.cpp) ----
// {value, start, firstWave, pick, hp(armor), reanimFile}
export const ZOMBIES = {
  normal:   { value: 1, start: 1,  wave: 1,  pick: 4000, hp: 270,  reanim: "Zombie" },
  flag:     { value: 1, start: 1,  wave: 1,  pick: 0,    hp: 270,  reanim: "Zombie" },
  cone:     { value: 2, start: 3,  wave: 1,  pick: 4000, hp: 270, helm: 370, reanim: "Zombie" },
  pole:     { value: 2, start: 6,  wave: 5,  pick: 2000, hp: 500,  reanim: "Zombie_polevaulter" },
  bucket:   { value: 4, start: 8,  wave: 1,  pick: 3000, hp: 270, helm: 1100, reanim: "Zombie" },
  news:     { value: 2, start: 11, wave: 1,  pick: 1000, hp: 270, paper: 150, reanim: "Zombie_paper" },
  door:     { value: 4, start: 13, wave: 5,  pick: 3500, hp: 270, door: 1100, reanim: "Zombie" },
  football: { value: 7, start: 16, wave: 5,  pick: 2000, hp: 270, helm: 1400, reanim: "Zombie_football" },
  dancer:   { value: 5, start: 18, wave: 5,  pick: 1000, hp: 500,  reanim: "zombie_jackson" },
  backup:   { value: 1, start: 18, wave: 1,  pick: 0,    hp: 270,  reanim: "Zombie_dancer" },
  ducky:    { value: 1, start: 21, wave: 5,  pick: 0,    hp: 270,  reanim: "Zombie" },
  snorkel:  { value: 3, start: 23, wave: 10, pick: 2000, hp: 270,  reanim: "Zombie_snorkle" },
  zamboni:  { value: 7, start: 26, wave: 10, pick: 2000, hp: 1350, reanim: "Zombie_zamboni" },
  bobsled:  { value: 3, start: 26, wave: 10, pick: 2000, hp: 270, helm: 300, reanim: "Zombie_bobsled" },
  dolphin:  { value: 3, start: 28, wave: 10, pick: 1500, hp: 500,  reanim: "zombie_dolphinrider" },
  jack:     { value: 3, start: 31, wave: 10, pick: 1000, hp: 500,  reanim: "Zombie_jackbox" },
  balloon:  { value: 2, start: 33, wave: 10, pick: 2000, hp: 300,  reanim: "Zombie_balloon" },
  digger:   { value: 4, start: 36, wave: 10, pick: 1000, hp: 270, helm: 100, reanim: "Zombie_digger" },
  pogo:     { value: 4, start: 38, wave: 10, pick: 1000, hp: 500,  reanim: "Zombie_pogo" },
  yeti:     { value: 4, start: 40, wave: 1,  pick: 1,    hp: 1350, reanim: "Zombie_yeti" },
  bungee:   { value: 3, start: 41, wave: 10, pick: 1000, hp: 450,  reanim: "Zombie_bungi" },
  ladder:   { value: 4, start: 43, wave: 10, pick: 1000, hp: 500,  reanim: "Zombie_ladder" },
  catapult: { value: 5, start: 46, wave: 10, pick: 1500, hp: 800,  reanim: "Zombie_catapult" },
  garg:     { value: 10, start: 48, wave: 15, pick: 1500, hp: 3000, reanim: "Zombie_gargantuar" },
  imp:      { value: 10, start: 48, wave: 1,  pick: 0,    hp: 200,  reanim: "Zombie_imp" },
  boss:     { value: 10, start: 50, wave: 1,  pick: 0,    hp: 30000, reanim: "Zombie_boss" },
};
// allowed-level table keys in file order (ZOMBIE_ALLOWED), aligned to ZOMBIES roster per level:
const ORDER = ["normal","flag","cone","pole","bucket","news","door","football","dancer","backup","ducky","snorkel","zamboni","bobsled","dolphin","jack","balloon","digger","pogo","yeti","bungee","ladder","catapult","garg","imp","boss"];
export function zombieAllowedOnLevel(typeKey, level) {
  const entry = ZOMBIE_ALLOWED[{normal:"ZOMBIE_NORMAL",flag:"ZOMBIE_FLAG",cone:"ZOMBIE_TRAFFIC_CONE",pole:"ZOMBIE_POLEVAULTER",bucket:"ZOMBIE_PAIL",news:"ZOMBIE_NEWSPAPER",door:"ZOMBIE_DOOR",football:"ZOMBIE_FOOTBALL",dancer:"ZOMBIE_DANCER",backup:"ZOMBIE_BACKUP_DANCER",ducky:"ZOMBIE_DUCKY_TUBE",snorkel:"ZOMBIE_SNORKEL",zamboni:"ZOMBIE_ZAMBONI",bobsled:"ZOMBIE_BOBSLED",dolphin:"ZOMBIE_DOLPHIN_RIDER",jack:"ZOMBIE_JACK_IN_THE_BOX",balloon:"ZOMBIE_BALLOON",digger:"ZOMBIE_DIGGER",pogo:"ZOMBIE_POGO",yeti:"ZOMBIE_YETI",bungee:"ZOMBIE_BUNGEE",ladder:"ZOMBIE_LADDER",catapult:"ZOMBIE_CATAPULT",garg:"ZOMBIE_GARGANTUAR",imp:"ZOMBIE_IMP",boss:"ZOMBIE_BOSS"}[typeKey]];
  if (!entry) return false;
  return entry[level - 1] === 1;
}
export function numWaves(level, firstTime = true) {
  // Board::PickZombieWaves: whack-a-zombie (adv 15) always runs 8 waves;
  // replay growth (+10, or 20 for short levels) skips miniboss levels
  // (10/20/30 — IsMiniBossLevel).
  if (level === 15) return 8; // IsWhackAZombieLevel
  if (!firstTime && level !== 10 && level !== 20 && level !== 30) {
    const n = ZOMBIE_WAVES[level - 1];
    return n < 10 ? 20 : n + 10;
  }
  return ZOMBIE_WAVES[level - 1];
}

// ---- fixed seed banks + chooser gating (Board.cpp:1557-1565,1680, CutScene.cpp:1366) ----
// Board::InitLevel (!ChooseSeeds && !conveyor): mNumPackets = GetNumSeedsInBank(); packets = SeedType i.
// GetNumSeedsInBank = min(packetUpgrade+6, GetSeedsAvailable()) (Board.cpp:8848-8850).
// ChooseSeedsOnCurrentLevel = (!IsFirstTimeAdventureMode() || mLevel > 7) (Board.cpp:1680).
// CutScene::ShowShovel: mShowShovel = (!firstTime || level > 4) (CutScene.cpp:1366).
// Whack-a-Zombie (LawnApp::IsWhackAZombieLevel 2149-2158: adventure L15):
// IsChallengeWithoutSeedBank (LawnApp 2224-2235) gates ChooseSeeds (Board
// 1668) to false, GetNumSeedsInBank (Board 8797-8800) to 3, and ShowShovel
// (CutScene 1356-1364) to never. Fixed bank POTATOMINE/GRAVEBUSTER/
// CHERRYBOMB (Board 1545-1551, adventure branch).
export function isWhackLevel(level) { return level === 15; } // LawnApp::IsWhackAZombieLevel adventure branch
export function whackBank() { return [4, 11, 2]; } // SEED_POTATOMINE/GRAVEBUSTER/CHERRYBOMB (Board.cpp:1548-1550)
export function chooseSeedsOnLevel(level, finished) {
  if (isWhackLevel(level)) return false; // IsChallengeWithoutSeedBank (Board.cpp:1668)
  if (isVasebreaker(level)) return false; // IsChallengeWithoutSeedBank scary branch (LawnApp 2224-2235)
  const firstTime = !finished;
  return (!firstTime || level > 7);
}
export function numSeedsInBank(level, finished, packetUpgrade = 0) {
  if (isWhackLevel(level)) return 3; // Board::GetNumSeedsInBank whack branch (8797-8800)
  if (isVasebreaker(level)) return 1; // Board::GetNumSeedsInBank scary branch (8793-8800)
  if (hasConveyorBelt(level)) return CONVEYOR_SLOTS;
  return Math.min(packetUpgrade + 6, seedsAvailableFor(level, finished));
}
// StoreScreen::GetItemCost PACKET_UPGRADE branch (StoreScreen.cpp:884-887):
// 75 / 500 / 2000 / 8000 for the 7/8/9/10-slot upgrades. Dave's pre-shop
// offers (CutScene 640-669) read the same table.
export function packetUpgradeCost(purchases = 0) {
  return purchases === 0 ? 75 : purchases === 1 ? 500 : purchases === 2 ? 2000 : 8000;
}
export function seedsAvailableFor(level, finished) {
  if (finished || level > 50) return 49;
  return Math.min(49, awardSeedForLevel(level));
}
// legacy names used by main.js/sim.js
export function fixedBankSize(level) {
  return Math.min(6, awardSeedForLevel(level));
}
export function hasShovel(level, finished = false) {
  if (isWhackLevel(level)) return false; // CutScene::ShowShovel early-return (1356-1364)
  const firstTime = !finished;
  return (!firstTime || level > 4);
}
// PlantRow dirt for the unsodded tutorial (Board::PickBackground 1023-1037):
// L1 first-time: rows 0,1,3,4 dirt (only row 2 sodded). L2/L3: rows 0,4 dirt.
export function dirtRowsForLevel(level, finished) {
  if (finished) return [];
  if (level === 1) return [0, 1, 3, 4];
  if (level === 2 || level === 3) return [0, 4];
  return [];
}
// pool rows need lilypad for ground plants; roof needs flower pot — handled in planting rules.
export function needsLilypad(bg, row) {
  return (bg === BG.POOL || bg === BG.FOG) && (row === 2 || row === 3);
}
