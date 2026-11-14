// Translated from the decompilation source:
//   ConstEnums.h  (SeedType, ZombieType, ReanimationType, ReanimLoopType, ...)
//   Plant.cpp     (gPlantDefs: cost / recharge / subclass / launch rate)
//   Sexy.TodLib/Reanimator.cpp (gLawnReanimationArray: .reanim file per type)
//   Lawn/Zombie.cpp (ZombieInitialize: HP / helm values / speeds)
// This file mirrors the original numeric values exactly.

// ---- ReanimLoopType (ConstEnums.h) ----
export const LOOP = 0;
export const LOOP_FULL_LAST_FRAME = 1;
export const PLAY_ONCE = 2;
export const PLAY_ONCE_AND_HOLD = 3;
export const PLAY_ONCE_FULL_LAST_FRAME = 4;
export const PLAY_ONCE_FULL_LAST_FRAME_AND_HOLD = 5;

// ---- SeedType (ConstEnums.h) ----
export const SEED_PEASHOOTER = 0;
export const SEED_SUNFLOWER = 1;
export const SEED_CHERRYBOMB = 2;
export const SEED_WALLNUT = 3;
export const SEED_POTATOMINE = 4;
export const SEED_SNOWPEA = 5;
export const SEED_CHOMPER = 6;
export const SEED_REPEATER = 7;
export const SEED_PUFFSHROOM = 8;
export const SEED_SUNSHROOM = 9;
export const SEED_SQUASH = 17;
export const SEED_JALAPENO = 20;

// ---- ZombieType (ConstEnums.h) ----
export const RENDER_GROUP_HIDDEN = -1;
export const RENDER_GROUP_NORMAL = 0;
export const RENDER_GROUP_ARMS = 2;
export const ZOMBIE_NORMAL = 1;
export const ZOMBIE_FLAG = 2;
export const ZOMBIE_TRAFFIC_CONE = 3;
export const ZOMBIE_POLEVAULTER = 4;
export const ZOMBIE_PAIL = 5;
export const ZOMBIE_NEWSPAPER = 6;

// ---- ReanimationType (ConstEnums.h) + source file (Reanimator.cpp) ----
export const REANIM_PEASHOOTER = 5;
export const REANIM_WALLNUT = 6;
export const REANIM_SUNFLOWER = 8;
export const REANIM_LAWNMOWER = 9;
export const REANIM_CHERRYBOMB = 11;
export const REANIM_SNOWPEA = 14;
export const REANIM_REPEATER = 15;
export const REANIM_CHOMPER = 21;
export const REANIM_ZOMBIE = 22;
export const REANIM_SUN = 23;
export const REANIM_POTATOMINE = 24;
export const REANIM_ZOMBIE_NEWSPAPER = 27;
export const REANIM_COIN_SILVER = 32;
export const REANIM_FLAG = 139;
export const REANIM_COIN_GOLD = 115;

export const REANIM_FILE = {
  [REANIM_PEASHOOTER]: "PeaShooterSingle",
  [REANIM_WALLNUT]: "Wallnut",
  [REANIM_SUNFLOWER]: "SunFlower",
  [REANIM_LAWNMOWER]: "LawnMower",
  [REANIM_CHERRYBOMB]: "CherryBomb",
  [REANIM_SNOWPEA]: "SnowPea",
  [REANIM_REPEATER]: "PeaShooter",
  [REANIM_CHOMPER]: "Chomper",
  [REANIM_ZOMBIE]: "Zombie",
  [REANIM_SUN]: "Sun",
  [REANIM_POTATOMINE]: "PotatoMine",
  [REANIM_ZOMBIE_NEWSPAPER]: "Zombie_paper",
  [REANIM_COIN_SILVER]: "Coin_silver",
  [REANIM_FLAG]: "Zombie_FlagPole",
  [REANIM_COIN_GOLD]: "Coin_gold",
};

// ---- PlantDefinition (Plant.cpp gPlantDefs) ----
// { cost, refreshTicks, subclass(0 normal, 1 shooter), launchRate }
export const PLANT_DEFS = {
  [SEED_PEASHOOTER]: { cost: 100, refresh: 750, sub: 1, launch: 150, reanim: REANIM_PEASHOOTER },
  [SEED_SUNFLOWER]: { cost: 50, refresh: 750, sub: 0, launch: 2500, reanim: REANIM_SUNFLOWER },
  [SEED_CHERRYBOMB]: { cost: 150, refresh: 5000, sub: 0, launch: 0, reanim: REANIM_CHERRYBOMB },
  [SEED_WALLNUT]: { cost: 50, refresh: 3000, sub: 0, launch: 0, reanim: REANIM_WALLNUT },
  [SEED_POTATOMINE]: { cost: 25, refresh: 3000, sub: 0, launch: 0, reanim: REANIM_POTATOMINE },
  [SEED_SNOWPEA]: { cost: 175, refresh: 750, sub: 1, launch: 150, reanim: REANIM_SNOWPEA },
  [SEED_CHOMPER]: { cost: 150, refresh: 750, sub: 0, launch: 0, reanim: REANIM_CHOMPER },
  [SEED_REPEATER]: { cost: 200, refresh: 750, sub: 1, launch: 150, reanim: REANIM_REPEATER },
};
export const PLANT_ORDER_DAY = [SEED_SUNFLOWER, SEED_PEASHOOTER, SEED_SNOWPEA, SEED_REPEATER, SEED_WALLNUT, SEED_POTATOMINE, SEED_CHERRYBOMB, SEED_CHOMPER];

// ---- ProjectileType (ConstEnums.h) + damage (Projectile.cpp gProjectileDefinition) ----
export const PROJECTILE_PEA = 0;
export const PROJECTILE_SNOWPEA = 1;
export const PROJECTILE_DAMAGE = { [PROJECTILE_PEA]: 20, [PROJECTILE_SNOWPEA]: 20 };

// ---- DamageFlags (ConstEnums.h) ----
export const DAMAGE_BYPASSES_SHIELD = 0;
export const DAMAGE_HITS_SHIELD_AND_BODY = 1;
export const DAMAGE_FREEZE = 2;
export const DAMAGE_DOESNT_CAUSE_FLASH = 3;
export const DAMAGE_DOESNT_LEAVE_BODY = 4;
export const DAMAGE_SPIKE = 5;

// ---- Zombie stats (Zombie.cpp ZombieInitialize / PickRandomSpeed) ----
export const ZOMBIE_BODY_HP = 270;
export const ZOMBIE_HELM_HP = { [ZOMBIE_TRAFFIC_CONE]: 370, [ZOMBIE_PAIL]: 1100 };
export const ZOMBIE_SPEED = { min: 0.23, max: 0.37, flag: 0.45 };
export const CHILLED_SPEED_FACTOR = 0.5;
export const TICKS_BETWEEN_EATS = 100;

// ---- Board geometry (GameConstants.h) ----
export const BOARD_W = 800;
export const BOARD_H = 600;
export const BG_OFFSET_X = -220; // background1.png (1400px) drawn at this x
export const LAWN_XMIN = 23;
export const LAWN_YMIN = 80;
export const LAWN_YMIN_DAY = 76;
export const COL_W = 83;
export const ROW_H = 100;
export const COLS = 9;
export const ROWS = 5;
export function cellX(col) { return LAWN_XMIN + col * COL_W; }
export function cellY(row) { return LAWN_YMIN + row * ROW_H; }
export function cellCX(col) { return LAWN_XMIN + col * COL_W + COL_W / 2; }
export function cellBottom(row) { return LAWN_YMIN + row * ROW_H + ROW_H; }

// ---- Foley -> sound file (TodFoley.cpp gLawnFoleyParamArray; SOUND_X -> x.ogg) ----
const S = (...names) => names;
export const FOLEY = {
  SUN: S("points"), SPLAT: S("splat", "splat2", "splat3"), LAWNMOWER: S("lawnmower"),
  THROW: S("throw", "throw", "throw", "throw2"), SPAWN_SUN: S("throw"),
  CHOMP: S("chomp", "chomp2"), CHOMP_SOFT: S("chompsoft"), PLANT: S("plant", "plant2"),
  USE_SHOVEL: S("plant2"), DROP: S("tap2"), BLEEP: S("bleep"), GROAN: S("groan", "groan2", "groan3", "groan4", "groan5", "groan6"),
  CHERRY: S("cherrybomb"), EXPLOSION: S("explosion"), FROZEN: S("frozen"),
  SNOW_PEA_SPARKLES: S("snow_pea_sparkles"), COIN: S("coin"), SHIELD_HIT: S("shieldhit", "shieldhit2"),
  NEWSPAPER_RARRGH: S("newspaper_rarrgh", "newspaper_rarrgh2"), NEWSPAPER_RIP: S("newspaper_rip"),
  POTATO_MINE: S("potato_mine", "potato_mine"), SHOVEL: S("shovel"), WINMUSIC: S("winmusic"), MONEYFALLS: S("moneyfalls"),
  LOSEMUSIC: S("losemusic"), READYSETPLANT: S("readysetplant"), FINALWAVE: S("finalwave"), HUGWAVE: S("hugewave"),
  SIREN: S("siren"), AWOOGA: S("awooga"), ZOMBIES_ON_YOUR_LAWN: S("ZombiesOnYourLawn"),
  PLANTGROW: S("plantgrow"), SQUASH_HMM: S("squash_hmm", "squash_hmm2"), FLOOP: S("floop"),
  FIREPEA: S("firepea"), DIRT_RISE: S("dirt_rise"), GULP: S("gulp"), BUTTON: S("buttonclick"), BUZZER: S("buzzer"),
  CHIME: S("chime"), POINTS: S("points"),
  COFFEE: S("coffee"), WAKEUP: S("wakeup"),
  PLANT_WATER: S("plantWater"),
  ZOMBIESPLASH: S("zombiesplash"), ZOMBIE_ENTERING_WATER: S("enteringWater"),
  DOLPHIN_APPEARS: S("dolphinAppears"), DOLPHIN_BEFORE_JUMPING: S("dolphinBeforeJumping"),
  POOL_CLEANER: S("poolCleaner"), SLURP: S("slurp"), SHOOP: S("shoop"),
};
